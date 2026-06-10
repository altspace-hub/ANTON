/**
 * portal-search-engine.ts — `anton-portal` Pathfinder search.
 *
 * Per Spec v0.2 §G.2: the registry-discovery engine. Backs Pathfinder's
 * 'anton-portal' SearchMode AND GET /api/portals/search. Merges three
 * origins into one ranked result set (each hit carries `origin`):
 *   1. 'local' — the `portals` table (the user's own portals + portals
 *      previously registered locally)
 *   2. 'lan'   — `portal_descriptor_cache` rows ingested by the mDNS LAN
 *      scan (origin_endpoint set; see portal-lan-discovery.ts)
 *   3. 'relay' — the relay HTTP registry's live GET /portals/search
 *      (RELAY_PORTAL_SUBMIT_URL, e.g. https://relay.futurechain.eu/v1).
 *      Queried with a ~3s timeout; any failure degrades silently to
 *      local + LAN results so search never breaks on a WAN outage.
 *
 * Hits are deduped by portal address with priority local > lan > relay.
 *
 * Only returns portals where `public_index = TRUE`. Portals marked
 * private are NEVER surfaced through search — they're only resolvable
 * by direct name.
 *
 * Ranking (relevance mode): TF-IDF-ish over name/displayTitle/description
 * /tags. Filters constrain the candidate set; ranking orders within it.
 */

import type { DatabaseAdapter } from '../../db/database.js';
import type { CapabilityVerb } from '../capability-descriptor/schema.js';

// ── Public types ────────────────────────────────────────────────────────────

export type PortalCategory =
  | 'personal' | 'business' | 'community' | 'commerce' | 'team'
  | 'creator' | 'bulletin' | 'classroom' | 'teacher' | 'organisation' | 'other';

export type PortalSortMode = 'relevance' | 'recently_active' | 'recently_registered';

export interface PortalSearchQuery {
  /** Free-text search against name, displayTitle, description, tags. */
  text?: string;
  /** Must include AT LEAST one of these verbs. */
  verbs?: CapabilityVerb[];
  /** Must be in any of these categories. */
  categories?: PortalCategory[];
  /** Must have any of these tags. */
  tags?: string[];
  /** ISO 3166-1 / 3166-2 country / subdivision codes. */
  serviceAreas?: string[];
  /** BCP 47 language codes. */
  languages?: string[];
  /** Restrict to a specific namespace. */
  namespace?: string;
  /** Default 'relevance' (when text is set) else 'recently_active'. */
  sortBy?: PortalSortMode;
  /** Default 20, max 100. */
  limit?: number;
  /** Default 0. */
  offset?: number;
}

/** Where a hit came from. 'local' = this instance's portals table;
 *  'lan' = mDNS-scanned peer (descriptor cache); 'relay' = the live
 *  relay registry. The UI badges results by origin. */
export type PortalSearchOrigin = 'local' | 'lan' | 'relay';

export interface PortalSearchHit {
  portalAddress: string;
  name: string;
  namespace: string;
  displayTitle: string | null;
  category: string;
  description: string | null;
  capabilityVerbs: string[];
  tags: string[];
  serviceAreas: string[];
  languages: string[];
  registeredAt: string | null;
  lastSeenAt: string | null;
  relevanceScore: number;
  origin: PortalSearchOrigin;
}

export interface PortalSearchResponse {
  results: PortalSearchHit[];
  total: number;
  query: PortalSearchQuery;
}

// ── Engine ──────────────────────────────────────────────────────────────────

export interface PortalSearchEngine {
  search(query: PortalSearchQuery): Promise<PortalSearchResponse>;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export function createPortalSearchEngine(db: DatabaseAdapter): PortalSearchEngine {
  return {
    async search(query) {
      const limit = clamp(query.limit ?? DEFAULT_LIMIT, 1, MAX_LIMIT);
      const offset = Math.max(query.offset ?? 0, 0);
      const sortBy = query.sortBy ?? (query.text ? 'relevance' : 'recently_active');

      // Pull every public-indexed portal once; rank in JS for v0.7.x scale
      // (a single user typically has < 50 portals locally; registry-side
      // ranking is the registry server's job).
      // Push filters into SQL so the JSONB GIN index (migration 149) can
      // do the work. Verbs / tags / serviceAreas / languages use the `?|`
      // (any-of) operator against the capability_summary JSONB column.
      // Text scoring + final ordering still happen in JS because relevance
      // weighting is small enough to be acceptable post-filter.
      const where: string[] = ['public_index = TRUE', `status = 'active'`];
      const params: unknown[] = [];
      if (query.namespace) {
        where.push(`namespace = ?`);
        params.push(query.namespace);
      }
      if (query.categories && query.categories.length > 0) {
        where.push(`category = ANY(?::text[])`);
        params.push(query.categories);
      }
      // Use the function form (jsonb_exists_any) instead of the `?|` operator
      // because the postgres adapter translates literal `?` to `$N` placeholders
      // — the operator's `?` would get clobbered.
      if (query.verbs && query.verbs.length > 0) {
        where.push(`jsonb_exists_any(capability_summary->'capabilityVerbs', ?::text[])`);
        params.push(query.verbs as unknown as string[]);
      }
      if (query.tags && query.tags.length > 0) {
        where.push(`jsonb_exists_any(capability_summary->'tags', ?::text[])`);
        params.push(query.tags);
      }
      if (query.serviceAreas && query.serviceAreas.length > 0) {
        where.push(`jsonb_exists_any(capability_summary->'serviceAreas', ?::text[])`);
        params.push(query.serviceAreas);
      }
      if (query.languages && query.languages.length > 0) {
        where.push(`jsonb_exists_any(capability_summary->'languages', ?::text[])`);
        params.push(query.languages);
      }

      // Local schema uses last_synced_at as the freshness signal (the
      // registry's last_seen_at is mirrored into this column on sync).
      const rows = await db.all<PortalRow>(
        `SELECT id, name, namespace, category, display_title, description,
                capability_summary, registered_at, last_synced_at AS last_seen_at,
                created_at
         FROM portals
         WHERE ${where.join(' AND ')}`,
        ...params,
      );

      // No JS-side filtering needed for local rows; SQL already filtered
      // everything except text relevance (handled below).
      const localCandidates: PortalSearchHit[] = rows.map((row) => {
        const summary = (row.capability_summary ?? {}) as {
          capabilityVerbs?: string[];
          tags?: string[];
          serviceAreas?: string[];
          languages?: string[];
        };
        return {
          portalAddress: `${row.name}.${row.namespace}.portal`,
          name: row.name,
          namespace: row.namespace,
          displayTitle: row.display_title,
          category: row.category,
          description: row.description,
          capabilityVerbs: summary.capabilityVerbs ?? [],
          tags: summary.tags ?? [],
          serviceAreas: summary.serviceAreas ?? [],
          languages: summary.languages ?? [],
          registeredAt: row.registered_at ? new Date(row.registered_at).toISOString() : null,
          lastSeenAt: row.last_seen_at ? new Date(row.last_seen_at).toISOString() : null,
          relevanceScore: 0, // filled below
          origin: 'local' as const,
        };
      });

      // LAN + relay candidates run their structured filters in JS — both
      // sets are small (≤ a few hundred) and neither lives in the local
      // portals table. Failures degrade silently to local results.
      const [lanCandidates, relayCandidates] = await Promise.all([
        fetchLanHits(db).catch(() => [] as PortalSearchHit[]),
        fetchRelayHits(query).catch(() => [] as PortalSearchHit[]),
      ]);

      // Merge with dedup by portal address. Priority: local > lan > relay —
      // a portal we host (or already proxy via the LAN) wins over the
      // registry's copy of the same address.
      const byAddress = new Map<string, PortalSearchHit>();
      for (const c of localCandidates) byAddress.set(c.portalAddress, c);
      for (const c of [...lanCandidates, ...relayCandidates]) {
        if (byAddress.has(c.portalAddress)) continue;
        if (!matchesStructuredFilters(c, query)) continue;
        byAddress.set(c.portalAddress, c);
      }
      const candidates = [...byAddress.values()];

      // Score relevance.
      const text = query.text?.trim().toLowerCase() ?? '';
      let filteredCandidates = candidates;
      if (text.length > 0) {
        const tokens = text.split(/\s+/).filter((t) => t.length > 0);
        // Drop candidates with no token match before adding recency boost,
        // so text search returns only matching hits (recency tiebreaker only).
        filteredCandidates = [];
        for (const c of candidates) {
          const tokenScore = scoreTokens(c, tokens);
          if (tokenScore > 0) {
            c.relevanceScore = tokenScore + recencyBoost(c);
            filteredCandidates.push(c);
          }
        }
      } else {
        // Without text, base score = 1; sort modes order from there.
        for (const c of candidates) c.relevanceScore = 1;
      }

      // Sort.
      filteredCandidates.sort((a, b) => {
        switch (sortBy) {
          case 'relevance':
            // Higher score first; ties broken by lastSeenAt desc.
            if (b.relevanceScore !== a.relevanceScore) return b.relevanceScore - a.relevanceScore;
            return tsValue(b.lastSeenAt) - tsValue(a.lastSeenAt);
          case 'recently_active':
            return tsValue(b.lastSeenAt) - tsValue(a.lastSeenAt);
          case 'recently_registered':
            return tsValue(b.registeredAt) - tsValue(a.registeredAt);
        }
      });

      const total = filteredCandidates.length;
      const page = filteredCandidates.slice(offset, offset + limit);

      return { results: page, total, query };
    },
  };
}

// ── Internals ──────────────────────────────────────────────────────────────

const RELAY_SEARCH_TIMEOUT_MS = 3000;
const RELAY_SEARCH_LIMIT = 50;
const LAN_CACHE_LIMIT = 500;

/** Re-apply the structured filters (verbs / categories / tags / service
 *  areas / languages / namespace) to a LAN or relay hit. Local hits are
 *  filtered in SQL; these two sources are filtered here because their
 *  data doesn't live in the portals table. Text relevance is handled by
 *  the shared scoring pass in search(). */
function matchesStructuredFilters(hit: PortalSearchHit, query: PortalSearchQuery): boolean {
  const anyOf = (have: string[], want?: string[]) =>
    !want || want.length === 0 || want.some((w) => have.includes(w));
  if (query.namespace && hit.namespace !== query.namespace) return false;
  if (query.categories && query.categories.length > 0 && !query.categories.includes(hit.category as PortalCategory)) return false;
  if (!anyOf(hit.capabilityVerbs, query.verbs)) return false;
  if (!anyOf(hit.tags, query.tags)) return false;
  if (!anyOf(hit.serviceAreas, query.serviceAreas)) return false;
  if (!anyOf(hit.languages, query.languages)) return false;
  return true;
}

/** Minimal shape of the cached signed descriptor we extract search fields
 *  from. Matches capability-descriptor/builder.ts output. */
interface CachedDescriptorShape {
  portal?: { displayTitle?: string; category?: string };
  identity?: { description?: string };
  capabilities?: Array<{ verb?: string; tags?: string[] }>;
  discoveryMetadata?: { tags?: string[]; serviceAreas?: string[]; languages?: string[] };
}

/** LAN-discovered portals: descriptor-cache rows the mDNS scan ingested
 *  (origin_endpoint set — see portal-lan-discovery.ts). These never live
 *  in the local portals table, so without this source LAN portals would
 *  silently vanish from search. */
async function fetchLanHits(db: DatabaseAdapter): Promise<PortalSearchHit[]> {
  const rows = await db.all<{
    portal_address: string;
    descriptor: Record<string, unknown> | string;
    fetched_at: string | null;
  }>(
    `SELECT portal_address, descriptor, fetched_at
     FROM portal_descriptor_cache
     WHERE origin_endpoint IS NOT NULL AND valid_until > NOW()
     LIMIT ${LAN_CACHE_LIMIT}`,
  );
  const hits: PortalSearchHit[] = [];
  for (const row of rows) {
    const m = row.portal_address.match(/^([^.]+(?:\.[^.]+)*)\.([^.]+)\.portal$/);
    if (!m) continue;
    const descriptor = (typeof row.descriptor === 'string'
      ? safeJsonParse(row.descriptor)
      : row.descriptor) as CachedDescriptorShape | null;
    if (!descriptor) continue;
    const caps = descriptor.capabilities ?? [];
    const dm = descriptor.discoveryMetadata ?? {};
    const verbs = [...new Set(caps.map((c) => c.verb).filter((v): v is string => typeof v === 'string'))];
    const tags = [...new Set([...(dm.tags ?? []), ...caps.flatMap((c) => c.tags ?? [])])];
    hits.push({
      portalAddress: row.portal_address,
      name: m[1],
      namespace: m[2],
      displayTitle: descriptor.portal?.displayTitle ?? null,
      category: descriptor.portal?.category ?? 'other',
      description: typeof descriptor.identity?.description === 'string' ? descriptor.identity.description : null,
      capabilityVerbs: verbs,
      tags,
      serviceAreas: dm.serviceAreas ?? [],
      languages: dm.languages ?? [],
      registeredAt: null,
      lastSeenAt: row.fetched_at ? new Date(row.fetched_at).toISOString() : null,
      relevanceScore: 0,
      origin: 'lan',
    });
  }
  return hits;
}

/** Wire shape of the relay's GET /v1/portals/search results (matches the
 *  Comm App client in src/comm/services/portals.ts — do not drift). */
interface RelaySearchResult {
  portalAddress: string;
  displayTitle?: string;
  description?: string;
  category?: string;
  capabilityVerbs?: string[];
  tags?: string[];
  serviceAreas?: string[];
  languages?: string[];
  approvedAt?: string;
}

/** Live relay registry search. RELAY_PORTAL_SUBMIT_URL conventionally ends
 *  in /v1 (e.g. https://relay.futurechain.eu/v1); the relay supports the
 *  text / verbs / categories params — the remaining structured filters are
 *  re-applied by matchesStructuredFilters(). Hard ~3s timeout; the caller
 *  swallows any failure so a relay outage degrades to local + LAN. */
async function fetchRelayHits(query: PortalSearchQuery): Promise<PortalSearchHit[]> {
  const base = process.env.RELAY_PORTAL_SUBMIT_URL;
  if (!base) return [];
  const params = new URLSearchParams();
  if (query.text?.trim()) params.set('text', query.text.trim());
  if (query.verbs && query.verbs.length > 0) params.set('verbs', query.verbs.join(','));
  if (query.categories && query.categories.length > 0) params.set('categories', query.categories.join(','));
  params.set('limit', String(RELAY_SEARCH_LIMIT));
  const url = `${base.replace(/\/+$/, '')}/portals/search?${params}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(RELAY_SEARCH_TIMEOUT_MS) });
  if (!res.ok) return [];
  const body = (await res.json()) as { results?: RelaySearchResult[] };
  const results = Array.isArray(body.results) ? body.results : [];
  const hits: PortalSearchHit[] = [];
  for (const r of results) {
    if (typeof r.portalAddress !== 'string') continue;
    // The relay's wire form omits the .portal suffix ("name.namespace");
    // local + LAN addresses carry it. Normalise so dedup by address works
    // and the UI shows one consistent address format.
    const base = r.portalAddress.replace(/\.portal$/, '');
    const m = base.match(/^([^.]+(?:\.[^.]+)*)\.([^.]+)$/);
    if (!m) continue;
    hits.push({
      portalAddress: `${base}.portal`,
      name: m[1],
      namespace: m[2],
      displayTitle: r.displayTitle ?? null,
      category: r.category ?? 'other',
      description: r.description ?? null,
      capabilityVerbs: r.capabilityVerbs ?? [],
      tags: r.tags ?? [],
      serviceAreas: r.serviceAreas ?? [],
      languages: r.languages ?? [],
      registeredAt: r.approvedAt ?? null,
      lastSeenAt: null,
      relevanceScore: 0,
      origin: 'relay',
    });
  }
  return hits;
}

function safeJsonParse(s: string): unknown {
  try { return JSON.parse(s); } catch { return null; }
}

interface PortalRow {
  id: string;
  name: string;
  namespace: string;
  category: string;
  display_title: string | null;
  description: string | null;
  capability_summary: Record<string, unknown> | null;
  registered_at: string | null;
  last_seen_at: string | null;
  created_at: string | null;
}

/**
 * Token-only score: count hits across name (×10), displayTitle (×6),
 * description (×3), and tags (×4). Returns 0 if no token matches anywhere
 * — the caller filters those out so text search is hit-only.
 */
function scoreTokens(hit: PortalSearchHit, tokens: string[]): number {
  let score = 0;
  const name = hit.name.toLowerCase();
  const title = (hit.displayTitle ?? '').toLowerCase();
  const desc = (hit.description ?? '').toLowerCase();
  const tagText = hit.tags.map((t) => t.toLowerCase()).join(' ');

  for (const tok of tokens) {
    if (name.includes(tok)) score += 10;
    if (title.includes(tok)) score += 6;
    if (desc.includes(tok)) score += 3;
    if (tagText.includes(tok)) score += 4;
  }
  return score;
}

/** Recency boost: applied AFTER the token-match filter as a tiebreaker. */
function recencyBoost(hit: PortalSearchHit): number {
  if (!hit.lastSeenAt) return 0;
  const age = Date.now() - Date.parse(hit.lastSeenAt);
  if (age < 7 * 24 * 60 * 60 * 1000) return 2;
  if (age < 30 * 24 * 60 * 60 * 1000) return 1;
  return 0;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function tsValue(iso: string | null): number {
  return iso ? Date.parse(iso) : 0;
}
