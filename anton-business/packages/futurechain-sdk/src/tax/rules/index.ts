/**
 * rules/index.ts — registry of jurisdiction rules.
 *
 * Phase 6: §8.2 Phase-2 list added (CY, MT, BE, IE, PL, CA, KR, IL,
 * BR active + KE unsupported). Total bundled: 26 jurisdictions, 24
 * active + NL & KE unsupported.
 *
 * The orchestrator (engine.ts) does not import rules directly —
 * callers pass a resolved `JurisdictionRule` in. That keeps the
 * dependency tree clean for hot-loading later.
 */
import type { JurisdictionCode, JurisdictionRule } from '../schema.js';
// Phase 1
import { SE } from './se.js';
// Phase 4
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
// Phase 6
import { CY } from './cy.js';
import { MT } from './mt.js';
import { BE } from './be.js';
import { IE } from './ie.js';
import { PL } from './pl.js';
import { CA } from './ca.js';
import { KR } from './kr.js';
import { IL } from './il.js';
import { BR } from './br.js';
import { KE } from './ke.js';

const BUILT_IN: Record<string, JurisdictionRule> = {
  SE,
  DE, FR, IT, GB, US, ES, PT, NL, ZA, NG, JP, SG, AE, AU, CH,
  CY, MT, BE, IE, PL, CA, KR, IL, BR, KE,
};

export function getBundledRule(code: JurisdictionCode): JurisdictionRule | null {
  return BUILT_IN[code.toUpperCase()] ?? null;
}

export function bundledJurisdictionCodes(): JurisdictionCode[] {
  return Object.keys(BUILT_IN);
}

export function activeJurisdictionCodes(): JurisdictionCode[] {
  return Object.entries(BUILT_IN)
    .filter(([, r]) => r.status === 'active')
    .map(([code]) => code);
}

export {
  SE,
  DE, FR, IT, GB, US, ES, PT, NL, ZA, NG, JP, SG, AE, AU, CH,
  CY, MT, BE, IE, PL, CA, KR, IL, BR, KE,
};
