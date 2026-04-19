/**
 * portal-search-engine.ts — `anton-portal` Pathfinder search.
 *
 * Per Spec v0.2 §G.2: the registry-discovery engine. Backs Pathfinder's
 * 'anton-portal' SearchMode. Queries:
 *   1. Local `portals` table (the user's own portals + portals previously
 *      registered locally)
 *   2. `portal_resolution_cache` (portals the user has resolved before)
 *   3. (Future) registry-client.search() against the registry server's
 *      /v1/search endpoint, when that endpoint exists
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

      // Apply remaining filters in JS (verbs/tags/serviceAreas/languages
      // require JSONB introspection which is more readable here).
      const candidates: PortalSearchHit[] = [];
      for (const row of rows) {
        const summary = (row.capability_summary ?? {}) as {
          capabilityVerbs?: string[];
          tags?: string[];
          serviceAreas?: string[];
          languages?: string[];
        };
        const verbs = summary.capabilityVerbs ?? [];
        const tags = summary.tags ?? [];
        const serviceAreas = summary.serviceAreas ?? [];
        const languages = summary.languages ?? [];

        if (query.verbs && query.verbs.length > 0) {
          if (!query.verbs.some((v) => verbs.includes(v))) continue;
        }
        if (query.tags && query.tags.length > 0) {
          if (!query.tags.some((t) => tags.includes(t))) continue;
        }
        if (query.serviceAreas && query.serviceAreas.length > 0) {
          if (!query.serviceAreas.some((sa) => serviceAreas.includes(sa))) continue;
        }
        if (query.languages && query.languages.length > 0) {
          if (!query.languages.some((l) => languages.includes(l))) continue;
        }

        candidates.push({
          portalAddress: `${row.name}.${row.namespace}.portal`,
          name: row.name,
          namespace: row.namespace,
          displayTitle: row.display_title,
          category: row.category,
          description: row.description,
          capabilityVerbs: verbs,
          tags,
          serviceAreas,
          languages,
          registeredAt: row.registered_at ? new Date(row.registered_at).toISOString() : null,
          lastSeenAt: row.last_seen_at ? new Date(row.last_seen_at).toISOString() : null,
          relevanceScore: 0, // filled below
        });
      }

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
