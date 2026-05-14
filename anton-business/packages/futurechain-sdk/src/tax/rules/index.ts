/**
 * rules/index.ts — registry of jurisdiction rules.
 *
 * Phase 1: SE only — the Swedish-resident user is the canonical
 * first audience. Phase 4 unrolls the rest of the high-confidence
 * list from FUTURECHAIN_TAX_RULES.md §8.2: DE, FR, IT, GB, US, ES,
 * PT, NL, ZA, NG, JP, SG, AE, AU, CH.
 *
 * Each new rule lands as a `.ts` (or later `.yaml`) under this dir
 * and registers here. The orchestrator (engine.ts) does not import
 * rules directly — callers pass a resolved `JurisdictionRule` in.
 * That keeps the dependency tree clean for the eventual hot-loading
 * phase (Phase 5+) where rules are fetched from a signed endpoint.
 */
import type { JurisdictionCode, JurisdictionRule } from '../schema.js';
import { SE } from './se.js';

const BUILT_IN: Record<string, JurisdictionRule> = {
  SE,
};

/** Look up a built-in rule by ISO 3166-1 alpha-2 code. Returns null
 *  if the jurisdiction isn't bundled. The orchestrator treats null
 *  as `unsupported` and emits the §8.3 refusal pattern. */
export function getBundledRule(code: JurisdictionCode): JurisdictionRule | null {
  return BUILT_IN[code.toUpperCase()] ?? null;
}

/** All bundled jurisdiction codes (used by the host's residency picker
 *  to surface "supported" vs "refer to adviser"). */
export function bundledJurisdictionCodes(): JurisdictionCode[] {
  return Object.keys(BUILT_IN);
}

export { SE };
