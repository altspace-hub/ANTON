/**
 * diagnose-service.ts — symptom matching, outcome logging, case contribution.
 *
 * Backs the Phase 5 Diagnose path. Three responsibilities:
 *
 *   1. matchSymptoms() — given a free-text symptom description + family/HKP,
 *      return the top-N candidate diagnostic cases ranked by token overlap
 *      against case symptoms + title. Pure heuristic; LLM ranking can stack
 *      on top via a future re-rank pass.
 *
 *   2. logOutcome() — record a user's attempt at a resolution. Updates the
 *      diagnostic_case_outcomes table; downstream UI rolls these up into
 *      "what worked for others" stats per case.
 *
 *   3. contributeCase() — accept a user-curated case and write it to
 *      diagnostic_cases. Tier 1 (personal) gets self-signed authoritative=false;
 *      Tier 2/3 contributions are flagged for community review (also
 *      authoritative=false until reviewed).
 */

import type { DatabaseAdapter } from '../db/database.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CandidateCase {
  case_id: string;
  title: string;
  severity: string | null;
  authoritative: boolean;
  match_score: number;        // 0-100 heuristic overlap score
  matched_symptoms: string[]; // symptom strings that contributed to the score
  matched_keywords: string[]; // tokens that hit
  case_data: {
    symptoms?: Array<{ symptom?: string; description?: string; pattern?: string }>;
    probable_causes?: Array<{ cause?: string; description?: string; confidence?: number }>;
    resolutions?: Array<{ resolution_id?: string; description?: string; preferred?: boolean; outcome_tracking?: { worked?: number; tried?: number } }>;
    diagnostic_questions?: string[];
    related_cases?: string[];
  };
}

export interface DiagnosticCaseOutcomeInput {
  case_id: string;
  resolution_id: string;
  outcome: 'worked' | 'made_worse' | 'no_effect' | 'partial';
  context_notes?: string | null;
  contributor_id?: string | null;
  consent_for_sharing?: boolean;
}

export interface ContributeCaseInput {
  case_id: string;                     // human-readable id, must be unique
  family_id: string;
  hkp_id?: string | null;
  title: string;
  severity?: 'low' | 'moderate' | 'high' | 'critical';
  symptoms: Array<{ symptom: string; observable_via?: string[]; confidence_when_present?: number }>;
  probable_causes: Array<{ cause: string; confidence?: number; evidence?: string[] }>;
  resolutions: Array<{ description: string; preferred?: boolean; verified_by?: string[] }>;
  diagnostic_questions?: string[];
  related_cases?: string[];
  contributor_id: string;
  /** When true, contributor warrants the case for community sharing */
  consent_for_sharing: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STOPWORDS = new Set([
  'the','and','or','of','to','in','on','at','a','an','is','are','was','were',
  'be','been','it','i','my','this','that','with','from','for','as','by','if',
  'when','then','than','so','do','does','did','can','cant','cannot','will',
  'has','have','had','not','no','yes','its','their','they','we','us','about',
  'what','which','where','why','how','any','some','all','one','two','more',
  'most','some','only','also','still','very','just','too',
]);

function tokenize(text: string): string[] {
  return text.toLowerCase()
    .replace(/[`~!@#$%^&*()\-_=+[\]{}\\|;:'",.<>/?]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2 && !STOPWORDS.has(t));
}

function uniq<T>(arr: T[]): T[] { return Array.from(new Set(arr)); }

function safeParse<T>(v: unknown, fallback: T): T {
  if (v === null || v === undefined) return fallback;
  if (typeof v !== 'string') return v as T;
  try { return JSON.parse(v) as T; } catch { return fallback; }
}

// ── Service ───────────────────────────────────────────────────────────────────

export function createDiagnoseService(db: DatabaseAdapter) {

  /**
   * Find candidate diagnostic cases for a given symptom description. Ranks by
   * keyword overlap against title + symptom strings. Boosts authoritative
   * cases and matches inside the same HKP.
   */
  async function matchSymptoms(input: {
    family_id: string;
    hkp_id?: string | null;
    description: string;
    limit?: number;
  }): Promise<CandidateCase[]> {
    const tokens = uniq(tokenize(input.description));
    if (tokens.length === 0) return [];

    const rows = await db.all(
      `SELECT case_id, hkp_id, title, severity, case_data, authoritative
       FROM diagnostic_cases
       WHERE family_id = ?
       ORDER BY (severity = 'critical') DESC, (severity = 'high') DESC, last_updated DESC`,
      input.family_id,
    ) as Array<{
      case_id: string; hkp_id: string | null; title: string;
      severity: string | null; case_data: string | object; authoritative: boolean;
    }>;

    const candidates: CandidateCase[] = [];

    for (const row of rows) {
      const data = safeParse(row.case_data, {} as CandidateCase['case_data']);
      const symptoms = data.symptoms ?? [];

      // Build searchable text per case
      const titleTokens = tokenize(row.title);
      const symptomStrings = symptoms.map(s => s.symptom ?? s.description ?? s.pattern ?? '').filter(Boolean) as string[];
      const symptomTokens = symptomStrings.flatMap(s => tokenize(s));
      const allTokens = new Set([...titleTokens, ...symptomTokens]);

      // Token overlap
      const matchedKeywords = tokens.filter(t => allTokens.has(t));
      if (matchedKeywords.length === 0) continue;

      // Symptom-level matches: which symptom strings contained at least 2 of the user's tokens
      const matchedSymptoms = symptomStrings.filter(s => {
        const sTokens = new Set(tokenize(s));
        return tokens.filter(t => sTokens.has(t)).length >= 2;
      });

      // Score: base overlap ratio, boost for symptom-level matches, boost for authoritative + same-HKP
      let score = (matchedKeywords.length / Math.max(tokens.length, 5)) * 60;
      score += matchedSymptoms.length * 10;
      if (row.authoritative) score += 8;
      if (input.hkp_id && row.hkp_id === input.hkp_id) score += 5;
      score = Math.min(100, Math.round(score));

      candidates.push({
        case_id: row.case_id,
        title: row.title,
        severity: row.severity,
        authoritative: row.authoritative,
        match_score: score,
        matched_symptoms: matchedSymptoms,
        matched_keywords: matchedKeywords,
        case_data: data,
      });
    }

    candidates.sort((a, b) => b.match_score - a.match_score);
    return candidates.slice(0, input.limit ?? 5);
  }

  async function logOutcome(input: DiagnosticCaseOutcomeInput): Promise<{ id: string }> {
    const r = await db.get(
      `INSERT INTO diagnostic_case_outcomes
        (case_id, resolution_id, outcome, contributor_id, context_notes, consent_for_sharing)
       VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
      input.case_id, input.resolution_id, input.outcome,
      input.contributor_id ?? null, input.context_notes ?? null,
      input.consent_for_sharing ?? false,
    ) as { id: string } | undefined;
    if (!r) throw new Error('Failed to log outcome');
    // Bump contributor count on the case (simple aggregate)
    await db.run(
      `UPDATE diagnostic_cases
       SET contributor_count = contributor_count + 1, last_updated = NOW()
       WHERE case_id = ?`,
      input.case_id,
    );
    return r;
  }

  async function listOutcomesForCase(caseId: string): Promise<Array<{
    id: string; resolution_id: string; outcome: string;
    attempted_at: string; consent_for_sharing: boolean;
  }>> {
    const rows = await db.all(
      `SELECT id, resolution_id, outcome, attempted_at, consent_for_sharing
       FROM diagnostic_case_outcomes WHERE case_id = ?
       ORDER BY attempted_at DESC LIMIT 100`,
      caseId,
    );
    return rows as Array<{ id: string; resolution_id: string; outcome: string; attempted_at: string; consent_for_sharing: boolean }>;
  }

  /**
   * Aggregate "what worked for others" — counts per outcome class per resolution.
   * Powers the diagnostic case detail UI.
   */
  async function summariseOutcomes(caseId: string): Promise<Record<string, { worked: number; made_worse: number; no_effect: number; partial: number; total: number }>> {
    const rows = await db.all(
      `SELECT resolution_id, outcome, COUNT(*) AS n
       FROM diagnostic_case_outcomes WHERE case_id = ?
       GROUP BY resolution_id, outcome`,
      caseId,
    ) as Array<{ resolution_id: string; outcome: string; n: string | number }>;

    const out: Record<string, { worked: number; made_worse: number; no_effect: number; partial: number; total: number }> = {};
    for (const r of rows) {
      const slot = out[r.resolution_id] ?? { worked: 0, made_worse: 0, no_effect: 0, partial: 0, total: 0 };
      const n = Number(r.n);
      if (r.outcome === 'worked') slot.worked = n;
      else if (r.outcome === 'made_worse') slot.made_worse = n;
      else if (r.outcome === 'no_effect') slot.no_effect = n;
      else if (r.outcome === 'partial') slot.partial = n;
      slot.total += n;
      out[r.resolution_id] = slot;
    }
    return out;
  }

  async function contributeCase(input: ContributeCaseInput): Promise<{ case_id: string }> {
    if (!input.case_id || !/^[a-z0-9-]{4,80}$/.test(input.case_id)) {
      throw new Error('case_id must be 4-80 chars, lowercase letters / digits / hyphens only');
    }

    const caseData = {
      symptoms: input.symptoms,
      probable_causes: input.probable_causes,
      resolutions: input.resolutions.map((r, i) => ({
        resolution_id: `r${i + 1}`,
        description: r.description,
        preferred: r.preferred ?? false,
        verified_by: r.verified_by ?? ['contributor'],
        outcome_tracking: { tried: 0, worked: 0, made_worse: 0, no_effect: 0 },
      })),
      diagnostic_questions: input.diagnostic_questions ?? [],
      related_cases: input.related_cases ?? [],
    };

    const r = await db.get(
      `INSERT INTO diagnostic_cases
        (case_id, hkp_id, family_id, title, severity, case_data, case_schema_version,
         signed_by, signing_verified, authoritative, contributor_count)
       VALUES (?, ?, ?, ?, ?, ?, '1.0', ?, FALSE, FALSE, 1) RETURNING case_id`,
      input.case_id,
      input.hkp_id ?? null,
      input.family_id,
      input.title,
      input.severity ?? 'moderate',
      JSON.stringify(caseData),
      input.contributor_id,
    ) as { case_id: string } | undefined;
    if (!r) throw new Error('Failed to contribute case');
    return r;
  }

  return {
    matchSymptoms,
    logOutcome,
    listOutcomesForCase,
    summariseOutcomes,
    contributeCase,
  };
}

export type DiagnoseService = ReturnType<typeof createDiagnoseService>;
