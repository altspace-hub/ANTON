/**
 * module-recommendation.ts — ground and validate LLM-suggested module ids.
 *
 * ── The problem ────────────────────────────────────────────────────────────
 *
 * Discovery's prompt asks the model to emit `moduleId` values and contains NO module
 * list at all. The model is being asked to name things it has never been shown, so every
 * id it returns is reconstructed from training-data memory of what an id like this
 * probably looks like. `matchedModules` — the output whose entire purpose is to turn a
 * conversation into things the user can actually try — points at ids that mostly do not
 * exist, and the user finds out by clicking one.
 *
 * The module recommender in routes/claude.ts has the other half of the bug: it DOES
 * supply candidates, then returns the model's answer with no check that what came back
 * is in the catalogue.
 *
 * Both need the same two things, which is why they live here rather than being written
 * twice and drifting:
 *
 *   1. GROUND — put real candidates in the prompt.
 *   2. VALIDATE — drop anything that is not a real id on the way out.
 *
 * Grounding without validation is not enough. A model given 40 candidates still
 * occasionally returns a plausible-looking id that was not among them, and a
 * recommendation that 404s is worse than one that is missing: it teaches the user the
 * feature is broken.
 */

import { getAllModules } from './module-loader.js';

export interface CandidateModule {
  id: string;
  label: string;
  areaId: string;
  description: string;
}

/** Max candidates put in a prompt. Enough to choose from, small enough to stay cheap. */
const MAX_CANDIDATES = 40;

/**
 * Score the catalogue against free text and return the best candidates.
 *
 * Deliberately a keyword pre-filter, not an embedding search: it is free, instant, has
 * no failure mode, and its only job is to get plausible options in front of the model.
 * The model does the judging.
 *
 * Always returns up to MAX_CANDIDATES even when nothing scores, so a vague description
 * still gets a grounded list rather than an empty one — an empty candidate list puts the
 * model straight back to inventing ids.
 */
export async function findCandidateModules(text: string, limit = MAX_CANDIDATES): Promise<CandidateModule[]> {
  const all = await getAllModules();
  // Three characters, not four.
  //
  // My first version dropped anything of length 3 or less, which in a compliance product
  // throws away the most discriminating terms it will ever see: aml, kyc, vat, tax, esg,
  // gap, dpa. "gap assessment" then scored only on "assessment" and returned six
  // unrelated *-assessment modules, with gap-analysis nowhere in the list. Caught by a
  // test, then confirmed by printing the actual candidates.
  //
  // (routes/claude.ts had this right already — the mistake was mine, not inherited.)
  //
  // It stops at 3 rather than 2 because matching is substring, not word — a 2-char token
  // like "ai" would hit "chain", "email" and "detail" and swamp the ranking.
  const tokens = (text ?? '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3);

  const scored = all.map((m, idx) => {
    const id = (m.id ?? '').toLowerCase();
    const label = (m.label ?? '').toLowerCase();
    const description = (m.description ?? '').toLowerCase();
    let score = 0;
    for (const t of tokens) {
      if (id.includes(t)) score += 3;
      if (label.includes(t)) score += 3;
      if (description.includes(t)) score += 1;
    }
    return { m, idx, score };
  });

  scored.sort((a, b) => b.score - a.score || a.idx - b.idx);
  return scored.slice(0, limit).map(({ m }) => ({
    id: m.id,
    label: m.label ?? m.id,
    areaId: (m as { areaId?: string }).areaId ?? '',
    description: (m.description ?? '').slice(0, 160),
  }));
}

/** Candidate list formatted for a prompt. */
export function formatCandidatesForPrompt(candidates: CandidateModule[]): string {
  return candidates.map((c) => `- ${c.id}: ${c.label} — ${c.description}`).join('\n');
}

export interface ValidationResult<T> {
  /** Entries whose moduleId exists in the catalogue, with label/areaId corrected. */
  valid: T[];
  /** Ids the model returned that do not exist. Logged, never shown to the user. */
  rejected: string[];
}

/**
 * Keep only entries naming a real module, and repair their metadata.
 *
 * The model's `moduleName` and `areaId` are overwritten from the catalogue rather than
 * trusted. A right id with a wrong label is its own bug: the user clicks something
 * described as one thing and lands on another, which reads as a broken product rather
 * than a mislabelled suggestion.
 *
 * Case and surrounding whitespace are normalised before lookup — a model returning
 * "Gap-Assessment" for `gap-assessment` has identified the right module and should not be
 * discarded on presentation.
 */
export async function validateModuleMatches<T extends { moduleId: string }>(
  matches: T[],
): Promise<ValidationResult<T & { moduleName?: string; areaId?: string }>> {
  const all = await getAllModules();
  const byId = new Map(all.map((m) => [m.id.toLowerCase(), m]));

  const valid: Array<T & { moduleName?: string; areaId?: string }> = [];
  const rejected: string[] = [];

  for (const match of matches ?? []) {
    const raw = String(match?.moduleId ?? '').trim();
    const found = byId.get(raw.toLowerCase());
    if (!found) {
      if (raw) rejected.push(raw);
      continue;
    }
    valid.push({
      ...match,
      moduleId: found.id,
      moduleName: found.label ?? found.id,
      areaId: (found as { areaId?: string }).areaId ?? '',
    });
  }

  return { valid, rejected };
}
