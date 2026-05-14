/**
 * rules/index.ts — registry of jurisdiction rules.
 *
 * Phase 4: §8.2 high-confidence list landed. SE + 14 more =
 * 15 bundled jurisdictions, 14 'active' + NL 'unsupported' for v1.
 *
 * Each rule lives in a `.ts` (will move to `.yaml` in Phase 5 once
 * the signed-rules loader ships). The orchestrator (engine.ts) does
 * not import rules directly — callers pass a resolved
 * `JurisdictionRule` in. That keeps the dependency tree clean for
 * hot-loading later.
 */
import type { JurisdictionCode, JurisdictionRule } from '../schema.js';
import { SE } from './se.js';
import { DE } from './de.js';
import { FR } from './fr.js';
import { IT } from './it.js';
import { GB } from './gb.js';
import { US } from './us.js';
import { ES } from './es.js';
import { PT } from './pt.js';
import { NL } from './nl.js';
import { ZA } from './za.js';
import { NG } from './ng.js';
import { JP } from './jp.js';
import { SG } from './sg.js';
import { AE } from './ae.js';
import { AU } from './au.js';
import { CH } from './ch.js';

const BUILT_IN: Record<string, JurisdictionRule> = {
  SE, DE, FR, IT, GB, US, ES, PT, NL, ZA, NG, JP, SG, AE, AU, CH,
};

/** Look up a built-in rule by ISO 3166-1 alpha-2 code. Returns null
 *  if the jurisdiction isn't bundled. */
export function getBundledRule(code: JurisdictionCode): JurisdictionRule | null {
  return BUILT_IN[code.toUpperCase()] ?? null;
}

/** All bundled jurisdiction codes — used by the host's residency
 *  picker. Per §8.3 a code listed here that has status='unsupported'
 *  still triggers the refer-out pattern in the engine. */
export function bundledJurisdictionCodes(): JurisdictionCode[] {
  return Object.keys(BUILT_IN);
}

/** Subset of `bundledJurisdictionCodes` that the engine will actually
 *  compute against (status='active'). The Comm App's residency picker
 *  uses this to differentiate "Supported" from "Refer to adviser". */
export function activeJurisdictionCodes(): JurisdictionCode[] {
  return Object.entries(BUILT_IN)
    .filter(([, r]) => r.status === 'active')
    .map(([code]) => code);
}

export { SE, DE, FR, IT, GB, US, ES, PT, NL, ZA, NG, JP, SG, AE, AU, CH };
