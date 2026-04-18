/**
 * lifecycle-feed-ingestor.ts — pulls security advisories + recalls + EOL
 * notices into the `lifecycle_events` table created by migration 133.
 *
 * Three sources for ESP32 launch:
 *   - NVD (NIST National Vulnerability Database) — CVE feed, JSON API
 *   - GHSA (GitHub Security Advisories) — global advisory DB, REST API
 *   - Espressif security advisories — vendor RSS
 *
 * Each ingest is idempotent (ON CONFLICT DO NOTHING on event_id PK) and
 * isolated from the others — a single source failure does not abort the run.
 *
 * Filtering: only keep events that mention ESP32 / esp-idf / espressif in
 * title or description (case-insensitive). When more hardware families come
 * online, add their keyword set per family.
 */

import type { DatabaseAdapter } from '../db/database.js';

// ── Event-type vocabulary (matches CHECK constraint on lifecycle_events) ─────
type EventType =
  | 'security-advisory'
  | 'end-of-life'
  | 'revision-change'
  | 'regulatory-update'
  | 'recall'
  | 'field-modification-pattern'
  | 'known-good-patch';

interface IngestedEvent {
  event_id: string;
  family_id: string;
  hkp_id_pattern: string | null;
  event_type: EventType;
  title: string;
  severity: string | null;
  cvss_score: number | null;
  published_at: string;
  source: string;
  source_url: string | null;
  event_data: Record<string, unknown>;
}

interface IngestResult {
  source: string;
  fetched: number;
  matched: number;
  inserted: number;
  skipped: number;
  errors: string[];
}

// ── Family keyword filters ────────────────────────────────────────────────────

const FAMILY_KEYWORDS: Record<string, RegExp> = {
  esp32: /\b(esp32(?:-?[a-z0-9]+)?|esp-?idf|espressif)\b/i,
};

function matchesFamily(text: string | null | undefined, familyId: string): boolean {
  if (!text) return false;
  const re = FAMILY_KEYWORDS[familyId];
  return re ? re.test(text) : false;
}

function severityFromCvss(score: number | null): string | null {
  if (score === null) return null;
  if (score >= 9.0) return 'critical';
  if (score >= 7.0) return 'high';
  if (score >= 4.0) return 'moderate';
  return 'low';
}

// ── NVD (CVE feed) ───────────────────────────────────────────────────────────

interface NvdResponse {
  totalResults?: number;
  vulnerabilities?: Array<{
    cve?: {
      id?: string;
      published?: string;
      lastModified?: string;
      descriptions?: Array<{ lang?: string; value?: string }>;
      metrics?: {
        cvssMetricV31?: Array<{ cvssData?: { baseScore?: number; baseSeverity?: string } }>;
        cvssMetricV30?: Array<{ cvssData?: { baseScore?: number; baseSeverity?: string } }>;
        cvssMetricV2?: Array<{ cvssData?: { baseScore?: number } }>;
      };
      references?: Array<{ url?: string; tags?: string[] }>;
      configurations?: unknown;
    };
  }>;
}

// NVD enforces a maximum 120-day window per query. Anything larger has to be
// chunked into successive ≤120-day requests.
const NVD_MAX_WINDOW_DAYS = 120;

async function fetchNvdWindow(
  familyId: string,
  start: Date,
  end: Date,
  signal?: AbortSignal,
): Promise<NvdResponse> {
  // NVD wants ISO-8601 with milliseconds and **no timezone suffix**.
  const fmt = (d: Date) => d.toISOString().replace('Z', '');
  const url = new URL('https://services.nvd.nist.gov/rest/json/cves/2.0');
  url.searchParams.set('keywordSearch', familyId);
  url.searchParams.set('pubStartDate', fmt(start));
  url.searchParams.set('pubEndDate', fmt(end));
  url.searchParams.set('resultsPerPage', '200');

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'ANTON-Hardware-Lifecycle-Ingestor/0.1',
      'Accept': 'application/json',
    },
    signal,
  });
  if (!res.ok) throw new Error(`NVD HTTP ${res.status}`);
  return (await res.json()) as NvdResponse;
}

async function fetchNvd(familyId: string, lookbackDays: number, signal?: AbortSignal): Promise<IngestedEvent[]> {
  const events: IngestedEvent[] = [];
  const now = Date.now();
  const overall = lookbackDays * 86400_000;
  const window = NVD_MAX_WINDOW_DAYS * 86400_000;
  // Walk backwards in 120-day windows.
  for (let offset = 0; offset < overall; offset += window) {
    const end = new Date(now - offset);
    const start = new Date(Math.max(now - overall, now - offset - window));
    const json = await fetchNvdWindow(familyId, start, end, signal);

    for (const v of json.vulnerabilities ?? []) {
      const cve = v.cve;
      if (!cve?.id || !cve.published) continue;
      const description = (cve.descriptions ?? []).find(d => d.lang === 'en')?.value ?? '';
      if (!matchesFamily(`${cve.id} ${description}`, familyId)) continue;

      const metric =
        cve.metrics?.cvssMetricV31?.[0]?.cvssData ??
        cve.metrics?.cvssMetricV30?.[0]?.cvssData ??
        cve.metrics?.cvssMetricV2?.[0]?.cvssData;
      const score = metric && typeof metric.baseScore === 'number' ? metric.baseScore : null;
      const referenceUrl = cve.references?.[0]?.url ?? `https://nvd.nist.gov/vuln/detail/${cve.id}`;

      events.push({
        event_id: `nvd-${cve.id}`,
        family_id: familyId,
        hkp_id_pattern: `${familyId}-*`,
        event_type: 'security-advisory',
        title: description.slice(0, 220).trim() || cve.id,
        severity: severityFromCvss(score),
        cvss_score: score,
        published_at: cve.published,
        source: 'nvd',
        source_url: referenceUrl,
        event_data: {
          cve_id: cve.id,
          description,
          last_modified: cve.lastModified,
          cvss_severity: ('baseSeverity' in (metric ?? {})) ? (metric as { baseSeverity?: string }).baseSeverity ?? null : null,
          references: (cve.references ?? []).slice(0, 10),
        },
      });
    }
  }
  return events;
}

// ── GHSA (GitHub Security Advisories) ────────────────────────────────────────

interface GhsaItem {
  ghsa_id?: string;
  cve_id?: string | null;
  summary?: string;
  description?: string;
  severity?: string;
  cvss?: { score?: number | null; vector_string?: string | null };
  published_at?: string;
  updated_at?: string;
  html_url?: string;
  references?: Array<{ url?: string }>;
  vulnerabilities?: Array<{ package?: { ecosystem?: string; name?: string } }>;
}

async function fetchGhsa(familyId: string, lookbackDays: number, signal?: AbortSignal): Promise<IngestedEvent[]> {
  const since = new Date(Date.now() - lookbackDays * 86400_000).toISOString();
  // GitHub global advisory DB. No auth required for public reads but rate-
  // limited; pass GITHUB_TOKEN in env when available.
  const url = new URL('https://api.github.com/advisories');
  url.searchParams.set('per_page', '100');
  url.searchParams.set('sort', 'published');
  url.searchParams.set('direction', 'desc');
  url.searchParams.set('published', `>=${since.slice(0, 10)}`);

  const headers: Record<string, string> = {
    'User-Agent': 'ANTON-Hardware-Lifecycle-Ingestor/0.1',
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

  const res = await fetch(url, { headers, signal });
  if (!res.ok) throw new Error(`GHSA HTTP ${res.status}`);
  const items = (await res.json()) as GhsaItem[];

  const events: IngestedEvent[] = [];
  for (const it of items) {
    if (!it.ghsa_id || !it.published_at) continue;
    const blob = `${it.summary ?? ''} ${it.description ?? ''}`;
    if (!matchesFamily(blob, familyId)) continue;

    const score = typeof it.cvss?.score === 'number' ? it.cvss.score : null;
    events.push({
      event_id: `ghsa-${it.ghsa_id}`,
      family_id: familyId,
      hkp_id_pattern: `${familyId}-*`,
      event_type: 'security-advisory',
      title: (it.summary ?? it.ghsa_id).slice(0, 220),
      severity: severityFromCvss(score) ?? (it.severity ?? null),
      cvss_score: score,
      published_at: it.published_at,
      source: 'ghsa',
      source_url: it.html_url ?? `https://github.com/advisories/${it.ghsa_id}`,
      event_data: {
        ghsa_id: it.ghsa_id,
        cve_id: it.cve_id ?? null,
        description: it.description ?? '',
        cvss_vector: it.cvss?.vector_string ?? null,
        github_severity: it.severity ?? null,
        affected_packages: (it.vulnerabilities ?? []).slice(0, 10).map(v => v.package),
        references: (it.references ?? []).slice(0, 10),
      },
    });
  }
  return events;
}

// ── Espressif security advisories ────────────────────────────────────────────
// Espressif retired their RSS feed; advisories are now published as GitHub
// repository security advisories under espressif/esp-idf (and a few sibling
// repos). We pull from the repo-scoped advisory endpoint, which is the
// vendor's authoritative channel and is open without auth. GHSA above already
// covers cross-ecosystem advisories, but the repo-scoped feed catches
// vendor-published items earlier and includes Espressif's own remediation
// notes inline.

const ESPRESSIF_REPOS = [
  'espressif/esp-idf',
  'espressif/arduino-esp32',
];

interface RepoAdvisoryItem {
  ghsa_id?: string;
  cve_id?: string | null;
  summary?: string;
  description?: string;
  severity?: string | null;
  cvss?: { score?: number | null; vector_string?: string | null };
  published_at?: string;
  updated_at?: string;
  html_url?: string;
}

async function fetchOneEspressifRepo(repo: string, signal?: AbortSignal): Promise<RepoAdvisoryItem[]> {
  const url = `https://api.github.com/repos/${repo}/security-advisories?state=published&per_page=100`;
  const headers: Record<string, string> = {
    'User-Agent': 'ANTON-Hardware-Lifecycle-Ingestor/0.1',
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetch(url, { headers, signal });
  if (!res.ok) throw new Error(`Espressif (${repo}) HTTP ${res.status}`);
  return (await res.json()) as RepoAdvisoryItem[];
}

async function fetchEspressif(familyId: string, lookbackDays: number, signal?: AbortSignal): Promise<IngestedEvent[]> {
  const since = Date.now() - lookbackDays * 86400_000;
  const events: IngestedEvent[] = [];
  for (const repo of ESPRESSIF_REPOS) {
    const items = await fetchOneEspressifRepo(repo, signal);
    for (const it of items) {
      if (!it.ghsa_id || !it.published_at) continue;
      const published = new Date(it.published_at);
      if (isNaN(published.getTime()) || published.getTime() < since) continue;
      // Vendor-published, so almost certainly relevant; still gate on keyword
      // to avoid false matches if the repo list ever broadens beyond ESP.
      const blob = `${repo} ${it.summary ?? ''} ${it.description ?? ''}`;
      if (!matchesFamily(blob, familyId) && !/esp/i.test(repo)) continue;

      const score = typeof it.cvss?.score === 'number' ? it.cvss.score : null;
      events.push({
        event_id: `espressif-${it.ghsa_id}`,
        family_id: familyId,
        hkp_id_pattern: `${familyId}-*`,
        event_type: 'security-advisory',
        title: (it.summary ?? it.ghsa_id).slice(0, 220),
        severity: severityFromCvss(score) ?? (it.severity ?? null),
        cvss_score: score,
        published_at: it.published_at,
        source: 'espressif',
        source_url: it.html_url ?? null,
        event_data: {
          repo,
          ghsa_id: it.ghsa_id,
          cve_id: it.cve_id ?? null,
          description: (it.description ?? '').slice(0, 6000),
          cvss_vector: it.cvss?.vector_string ?? null,
          github_severity: it.severity ?? null,
        },
      });
    }
  }
  return events;
}

// ── DB writer ────────────────────────────────────────────────────────────────

async function persistEvents(db: DatabaseAdapter, events: IngestedEvent[]): Promise<{ inserted: number; skipped: number }> {
  let inserted = 0;
  let skipped = 0;
  for (const e of events) {
    const r = await db.run(
      `INSERT INTO lifecycle_events
        (event_id, hkp_id_pattern, family_id, event_type, title,
         severity, cvss_score, published_at, source, source_url, event_data)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (event_id) DO NOTHING`,
      e.event_id, e.hkp_id_pattern, e.family_id, e.event_type, e.title,
      e.severity, e.cvss_score, e.published_at, e.source, e.source_url,
      JSON.stringify(e.event_data),
    );
    if (r.changes > 0) inserted++; else skipped++;
  }
  return { inserted, skipped };
}

// ── Public orchestrator ──────────────────────────────────────────────────────

export interface IngestOptions {
  family_id?: string;
  lookback_days?: number;
  sources?: Array<'nvd' | 'ghsa' | 'espressif'>;
  timeout_ms?: number;
}

export async function runLifecycleIngest(
  db: DatabaseAdapter,
  opts: IngestOptions = {},
): Promise<{ results: IngestResult[]; total: { fetched: number; matched: number; inserted: number; skipped: number } }> {
  const familyId = opts.family_id ?? 'esp32';
  const lookbackDays = opts.lookback_days ?? 30;
  const sources = opts.sources ?? ['nvd', 'ghsa', 'espressif'];
  const timeoutMs = opts.timeout_ms ?? 30_000;

  const tasks: Array<Promise<IngestResult>> = [];

  if (sources.includes('nvd')) tasks.push(runOne('nvd', () => fetchNvd(familyId, lookbackDays, AbortSignal.timeout(timeoutMs))));
  if (sources.includes('ghsa')) tasks.push(runOne('ghsa', () => fetchGhsa(familyId, lookbackDays, AbortSignal.timeout(timeoutMs))));
  if (sources.includes('espressif')) tasks.push(runOne('espressif', () => fetchEspressif(familyId, lookbackDays, AbortSignal.timeout(timeoutMs))));

  async function runOne(name: string, fetcher: () => Promise<IngestedEvent[]>): Promise<IngestResult> {
    const result: IngestResult = { source: name, fetched: 0, matched: 0, inserted: 0, skipped: 0, errors: [] };
    try {
      const events = await fetcher();
      result.fetched = events.length;
      result.matched = events.length; // we filter inside the fetcher
      const persisted = await persistEvents(db, events);
      result.inserted = persisted.inserted;
      result.skipped = persisted.skipped;
    } catch (err) {
      result.errors.push(err instanceof Error ? err.message : String(err));
    }
    return result;
  }

  const results = await Promise.all(tasks);
  const total = results.reduce(
    (acc, r) => ({
      fetched: acc.fetched + r.fetched,
      matched: acc.matched + r.matched,
      inserted: acc.inserted + r.inserted,
      skipped: acc.skipped + r.skipped,
    }),
    { fetched: 0, matched: 0, inserted: 0, skipped: 0 },
  );
  return { results, total };
}

// ── Exports for unit tests / manual triggers ─────────────────────────────────

export const __testables = {
  matchesFamily,
  severityFromCvss,
};
