/**
 * citation-ledger.ts
 * Counsel's Desk verified-citation ledger (Core Experience Review 2026-06, item 1.4).
 *
 * NOTE ON NAMING: server/services/citation-verifier.ts already exists — it is the
 * LLM-judge verifier used by routes/claude.ts (it asks Claude whether a citation
 * "seems real"). THIS service is different by construction: it verifies citations
 * against GROUND TRUTH — local framework JSON first, then an EUR-Lex CELEX
 * existence check — and never asks an LLM anything.
 *
 * Verification levels:
 *   verified_local  — regulation + article exists in data/frameworks/*.json
 *                     (article title + source attached)
 *   verified_remote — EU instrument/case: EUR-Lex CELEX existence check (GET,
 *                     5s timeout, results LRU-cached; failures degrade to
 *                     'unresolved', never block)
 *   unresolved      — could not be checked (national law without local data,
 *                     network failure, unrecognised citation form, partial
 *                     local coverage)
 *   not_found       — checked, and the instrument/article does NOT exist
 *                     (the dangerous one)
 *
 * Honesty contract: verification checks EXISTENCE of the cited instrument /
 * article — never that it supports the proposition it was cited for.
 */

import { loadFrameworkIndex, type FrameworkDoc } from './framework-text-retrieval.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export type CitationStatus = 'verified_local' | 'verified_remote' | 'unresolved' | 'not_found';

export interface CitationInput {
  ref: string;
  type?: string;
}

export interface CitationVerification {
  citation: string;
  status: CitationStatus;
  /** Human-readable source the citation resolved to (framework name / EUR-Lex). */
  source?: string;
  /** Title of the resolved article or instrument. */
  title?: string;
  /** Link to the resolved instrument (EUR-Lex) when available. */
  url?: string;
  /** Short machine-honest explanation of how/why this status was reached. */
  detail?: string;
}

export interface VerifierOptions {
  frameworksDir?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  cacheSize?: number;
}

export const VERIFICATION_DISCLAIMER =
  'Verification checks existence of the cited instrument/article, not that it supports the stated proposition.';

// ── CELEX helpers ─────────────────────────────────────────────────────────────

function eurLexUrl(celex: string): string {
  return `https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:${encodeURIComponent(celex)}`;
}

function isPlausibleYear(n: number): boolean {
  return n >= 1950 && n <= 2099;
}

/** Build a legislation CELEX (sector 3) from two numbers where one is the year. */
export function legislationCelex(a: number, b: number, kind: 'R' | 'L'): string | null {
  let year: number; let num: number;
  if (isPlausibleYear(a) && !isPlausibleYear(b)) { year = a; num = b; }
  else if (isPlausibleYear(b) && !isPlausibleYear(a)) { year = b; num = a; }
  else if (isPlausibleYear(a)) { year = a; num = b; } // both plausible — assume year-first (post-2015 style)
  else return null;
  return `3${year}${kind}${String(num).padStart(4, '0')}`;
}

/** Build a case-law CELEX (sector 6) from "Case C-617/10" → 62010CJ0617. */
export function caseLawCelex(num: number, yearRaw: string): string | null {
  let year: number;
  if (yearRaw.length === 4) {
    year = parseInt(yearRaw, 10);
  } else {
    const two = parseInt(yearRaw, 10);
    if (isNaN(two)) return null;
    // Two-digit years: up to (current year % 100)+1 → 20xx, otherwise 19xx
    const pivot = (new Date().getFullYear() % 100) + 1;
    year = two <= pivot ? 2000 + two : 1900 + two;
  }
  if (!isPlausibleYear(year)) return null;
  return `6${year}CJ${String(num).padStart(4, '0')}`;
}

// ── Local framework lookup helpers ───────────────────────────────────────────

/** Find a framework whose reference field contains the given year/number pair. */
function findFrameworkByRefNumbers(docs: FrameworkDoc[], a: number, b: number): FrameworkDoc | undefined {
  const forms = [`${a}/${b}`, `${b}/${a}`];
  return docs.find((d) => d.reference !== undefined && forms.some((f) => d.reference!.includes(f)));
}

/** Resolve an acronym like "AMLR" / "AMLD" / "GDPR" to a local framework. */
function findFrameworkByAcronym(docs: FrameworkDoc[], acro: string): FrameworkDoc | undefined {
  const a = acro.toLowerCase();
  // Exact shortName token match first
  let hit = docs.find((d) => d.shortName.toLowerCase().split(/[^a-z0-9]+/).includes(a));
  if (hit) return hit;
  // Prefix match (AMLD → AMLD6)
  hit = docs.find((d) => d.shortName.toLowerCase().split(/[^a-z0-9]+/).some((t) => t.startsWith(a)));
  if (hit) return hit;
  // Framework id prefix (mifid → mifid2-2014)
  return docs.find((d) => d.id.toLowerCase().startsWith(a));
}

function frameworkUrl(doc: FrameworkDoc): string | undefined {
  if (!doc.eurLex) return undefined;
  return eurLexUrl(doc.eurLex.replace(/^CELEX:/i, ''));
}

// ── Verifier factory ──────────────────────────────────────────────────────────

export function createCitationLedger(opts: VerifierOptions = {}) {
  const timeoutMs = opts.timeoutMs ?? 5000;
  const cacheMax = opts.cacheSize ?? 500;
  const fetchImpl = opts.fetchImpl ?? fetch;
  // Small in-memory LRU for remote existence checks (CELEX → status)
  const remoteCache = new Map<string, CitationStatus>();

  function cacheSet(key: string, value: CitationStatus): void {
    if (remoteCache.has(key)) remoteCache.delete(key);
    remoteCache.set(key, value);
    if (remoteCache.size > cacheMax) {
      const oldest = remoteCache.keys().next().value;
      if (oldest !== undefined) remoteCache.delete(oldest);
    }
  }

  /** EUR-Lex existence check. Failures → 'unresolved', never throws, never blocks past timeout. */
  async function checkEurLex(celex: string): Promise<CitationStatus> {
    const cached = remoteCache.get(celex);
    if (cached) {
      cacheSet(celex, cached); // refresh LRU position
      return cached;
    }
    let status: CitationStatus = 'unresolved';
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetchImpl(eurLexUrl(celex), {
          method: 'GET',
          signal: controller.signal,
          headers: { 'User-Agent': 'ANTON-citation-ledger/1.0' },
        });
        if (res.status === 404) {
          status = 'not_found';
        } else if (res.ok) {
          const body = (await res.text()).slice(0, 20000);
          status = /the requested document does not exist|no documents matching|document not found/i.test(body)
            ? 'not_found'
            : 'verified_remote';
        } // other statuses (403/5xx) → unresolved
      } finally {
        clearTimeout(timer);
      }
    } catch { /* network error / timeout → unresolved */ }
    // Don't cache unresolved — transient failures should be retryable
    if (status !== 'unresolved') cacheSet(celex, status);
    return status;
  }

  async function verifyOne(input: CitationInput, docs: FrameworkDoc[]): Promise<CitationVerification> {
    const ref = (input.ref ?? '').trim();
    if (!ref) return { citation: ref, status: 'unresolved', detail: 'Empty citation' };

    // ── 1. Framework-qualified article: "AMLR Art.12(3)(b)" ──────────────────
    const artMatch = ref.match(/^([A-Za-z][A-Za-z0-9]{2,12})\s+Art\.?\s*(\d+)/);
    if (artMatch) {
      const doc = findFrameworkByAcronym(docs, artMatch[1]);
      const artNum = parseInt(artMatch[2], 10);
      if (doc) {
        const article = doc.articles.find(
          (a) => a.id.replace(/^[^0-9]*/, '').replace(/[^0-9].*$/, '') === String(artNum)
        );
        if (article) {
          return {
            citation: ref,
            status: 'verified_local',
            source: `${doc.name}${doc.reference ? ` (${doc.reference})` : ''}`,
            title: article.title,
            url: frameworkUrl(doc),
            detail: 'Article found in local framework data',
          };
        }
        // Full local coverage and article number out of range → it does not exist
        const fullCoverage = doc.articleCount !== undefined && doc.articleCount === doc.articles.length;
        if (fullCoverage && artNum > (doc.articleCount ?? 0)) {
          return {
            citation: ref,
            status: 'not_found',
            source: `${doc.name}${doc.reference ? ` (${doc.reference})` : ''}`,
            detail: `${doc.shortName} has ${doc.articleCount} articles — Art.${artNum} does not exist`,
          };
        }
        // Partial local coverage — cannot disprove existence
        return {
          citation: ref,
          status: 'unresolved',
          source: doc.name,
          detail: 'Local framework data covers this instrument only partially; article not in local extract',
        };
      }
      return { citation: ref, status: 'unresolved', detail: `No local data for '${artMatch[1]}'` };
    }

    // ── 2. EU Regulation / Directive by number ────────────────────────────────
    const regMatch = ref.match(/^Regulation\s+\(E[UC]\)\s+(?:No\s+)?(\d{1,4})\/(\d{1,4})/i);
    const dirMatchNew = ref.match(/^Directive\s+\(EU\)\s+(\d{4})\/(\d{1,4})/i);
    const dirMatchOld = ref.match(/^Directive\s+(\d{4})\/(\d{1,4})\/(?:EU|EC|EEC)/i);
    const instr = regMatch
      ? { a: parseInt(regMatch[1], 10), b: parseInt(regMatch[2], 10), kind: 'R' as const }
      : dirMatchNew
        ? { a: parseInt(dirMatchNew[1], 10), b: parseInt(dirMatchNew[2], 10), kind: 'L' as const }
        : dirMatchOld
          ? { a: parseInt(dirMatchOld[1], 10), b: parseInt(dirMatchOld[2], 10), kind: 'L' as const }
          : null;
    if (instr) {
      const local = findFrameworkByRefNumbers(docs, instr.a, instr.b);
      if (local) {
        return {
          citation: ref,
          status: 'verified_local',
          source: local.name,
          title: local.name,
          url: frameworkUrl(local),
          detail: 'Instrument matches local framework data',
        };
      }
      const celex = legislationCelex(instr.a, instr.b, instr.kind);
      if (celex) {
        const status = await checkEurLex(celex);
        return {
          citation: ref,
          status,
          source: status === 'verified_remote' ? 'EUR-Lex' : undefined,
          url: status === 'verified_remote' ? eurLexUrl(celex) : undefined,
          detail: status === 'verified_remote'
            ? `CELEX:${celex} exists on EUR-Lex`
            : status === 'not_found'
              ? `CELEX:${celex} not found on EUR-Lex`
              : 'EUR-Lex check failed or timed out',
        };
      }
      return { citation: ref, status: 'unresolved', detail: 'Could not derive a CELEX number' };
    }

    // ── 3. CJEU case law: "Case C-617/10 Åkerberg Fransson" ─────────────────
    const caseMatch = ref.match(/^Case\s+C-(\d{1,4})\/(\d{2,4})/i);
    if (caseMatch) {
      const celex = caseLawCelex(parseInt(caseMatch[1], 10), caseMatch[2]);
      if (celex) {
        const status = await checkEurLex(celex);
        return {
          citation: ref,
          status,
          source: status === 'verified_remote' ? 'EUR-Lex (CJEU)' : undefined,
          url: status === 'verified_remote' ? eurLexUrl(celex) : undefined,
          detail: status === 'verified_remote'
            ? `CELEX:${celex} exists on EUR-Lex`
            : status === 'not_found'
              ? `CELEX:${celex} not found on EUR-Lex`
              : 'EUR-Lex check failed or timed out',
        };
      }
      return { citation: ref, status: 'unresolved', detail: 'Could not derive a case-law CELEX number' };
    }

    // ── 4. EBA references — match local framework reference fields only ──────
    const ebaMatch = ref.match(/^(EBA\/[A-Z]+\/\d{4}\/\d{1,3})/);
    if (ebaMatch) {
      const local = docs.find((d) => d.reference !== undefined && d.reference.includes(ebaMatch[1]));
      if (local) {
        return {
          citation: ref,
          status: 'verified_local',
          source: local.name,
          title: local.name,
          detail: 'Reference matches local framework data',
        };
      }
      return { citation: ref, status: 'unresolved', detail: 'EBA references cannot be existence-checked automatically' };
    }

    // ── 5. Everything else (national law, guidance, OFAC, …) ────────────────
    return {
      citation: ref,
      status: 'unresolved',
      detail: 'No local ground truth and no automated existence check for this citation form',
    };
  }

  return {
    /** Verify a batch of citations. Order preserved; never throws per-item. */
    async verifyCitations(citations: CitationInput[]): Promise<CitationVerification[]> {
      const docs = loadFrameworkIndex(opts.frameworksDir);
      const results: CitationVerification[] = [];
      for (const c of citations) {
        try {
          results.push(await verifyOne(c, docs));
        } catch {
          results.push({ citation: c.ref ?? '', status: 'unresolved', detail: 'Verification error' });
        }
      }
      return results;
    },
  };
}

export type CitationLedger = ReturnType<typeof createCitationLedger>;
