// ── Risk Atlas → Stage 7b company-wide Risk Appetite Statement ──────────────
//
// The atlas-company-appetite-consolidator prompt describes "the executor
// calls computeCompanyAppetite(atlas_id) and injects the result" — and until
// 2026-09-23 nothing did. This is that executor, built the way Generate BWRA
// is (atlas-bwra.ts), because the rule is the same: the calculator owns the
// numbers.
//
//   1. the overall position, the counts, the per-domain positions, the
//      remediation programme (every outside/unacceptable path, by name) and the
//      escalation triggers are rendered HERE from the Atlas and the
//      deterministic worst-of rollup;
//   2. the model writes only the narrative under fixed headings;
//   3. a consistency check records any narrative that states a different
//      overall position, a different score or a different count.
//
// The document is a draft for approval: it carries a sign-off block and is
// never marked approved by the system.
import crypto from 'node:crypto';
import type { DatabaseAdapter } from '../../db/database.js';
import { createAtlasExport, type AtlasExportSnapshot } from './atlas-export.js';
import { createAtlasService } from './atlas-service.js';
import { createAtlasEventLogger } from './atlas-event-logger.js';
import { createAtlasFcpScopeService, type AtlasFcpScopeRow, type CompanyAppetiteRollup } from './atlas-fcp-scope-service.js';
import { appetitePositionFor } from './atlas-residual-calculator.js';
import { countedPosition, isMoreLenient } from './atlas-appetite-position.js';
import { checkConsistency, isoDay, snapshotSha256 } from './atlas-bwra.js';
import type { AppetitePosition, AtlasEscalationTriggerRow, FcpDomain, Score1to5, ThreatPathFull } from './types.js';
import { getModuleSystemPrompt } from '../module-loader.js';
import { callChat, type ChatResult, type StreamChatConfig } from '../provider-router.js';

export const COMPANY_APPETITE_MODULE_ID = 'atlas-company-appetite-consolidator';

export const REVIEW_CADENCES = ['annual', 'semi-annual', 'quarterly'] as const;
export type ReviewCadence = (typeof REVIEW_CADENCES)[number];

export interface CompanyAppetiteOptions {
  approverName?: string;
  approverRole?: string;
  reviewCadence?: ReviewCadence;
}

/** The narrative sections, in document order; `match` recognises the model's heading for each. */
export const APPETITE_SECTIONS = [
  { key: 'overall', heading: 'Overall position', match: /^overall\b/ },
  { key: 'operational', heading: 'By non-FCP dimension', match: /non-fcp|operational/ },
  { key: 'domains', heading: 'By FCP domain', match: /fcp domain|by domain/ },
  { key: 'remediation', heading: 'Remediation programme', match: /remediation/ },
  { key: 'triggers', heading: 'Escalation triggers', match: /escalation|trigger/ },
] as const;
/** Document order (the list above is in matching order: "non-FCP" before "FCP domain"). */
const SECTION_ORDER: AppetiteSectionKey[] = ['overall', 'domains', 'operational', 'remediation', 'triggers'];
const sectionOf = (key: AppetiteSectionKey) => APPETITE_SECTIONS.find((s) => s.key === key)!;
export type AppetiteSectionKey = (typeof APPETITE_SECTIONS)[number]['key'];

export interface AppetiteConsistencyIssue {
  kind: 'overall_position' | 'residual' | 'inherent' | 'outside_count' | 'residual_count';
  path?: string;
  /** For residual_count: the residual the paths were counted at. */
  score?: number;
  stated: string | number;
  atlas: string | number;
  excerpt: string;
}

export interface CompanyAppetiteDocument {
  id: string;
  atlas_id: string;
  markdown: string;
  snapshot_sha256: string;
  overall_position: AppetitePosition | null;
  rollup: CompanyAppetiteRollup;
  approver_name: string | null;
  approver_role: string | null;
  review_cadence: ReviewCadence | null;
  model_requested: string | null;
  model_served: string | null;
  consistency_issues: AppetiteConsistencyIssue[];
  created_by: string | null;
  created_at: string;
}

const POSITION_LABEL: Record<AppetitePosition, string> = {
  within: 'Within appetite', boundary: 'At boundary', outside: 'Outside appetite', unacceptable: 'Unacceptable',
};
const DOMAIN_LABEL: Record<FcpDomain, string> = {
  amlcft: 'AML/CFT', sanctions: 'Sanctions', fraud: 'Fraud', abc: 'Anti-bribery and corruption',
  market_abuse: 'Market abuse', tax_evasion_facilitation: 'Tax-evasion facilitation',
  export_controls: 'Export controls', modern_slavery: 'Modern slavery',
};
const DOMAINS = Object.keys(DOMAIN_LABEL) as FcpDomain[];

// Backslashes first, then pipes (see atlas-bwra.ts).
const cell = (s: unknown): string => String(s ?? '').replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim() || '—';
const table = (head: string[], rows: string[][], empty: string): string =>
  rows.length === 0
    ? `_${empty}_`
    : [`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...rows.map((r) => `| ${r.map(cell).join(' | ')} |`)].join('\n');

/**
 * A path's position as the rollup counts it — the one rule in
 * atlas-appetite-position.ts, which computeCompanyAppetite uses too.
 */
export function positionOf(p: ThreatPathFull): AppetitePosition | null {
  return countedPosition(p.appetite?.appetite_position, !!p.appetite?.approved_at, p.residual?.residual_score);
}

const byCode = (a: ThreatPathFull, b: ThreatPathFull) => a.path.path_code.localeCompare(b.path.path_code, undefined, { numeric: true });

/** The outside/unacceptable paths — each must appear by name in the remediation programme. */
export function outsidePaths(snap: AtlasExportSnapshot): ThreatPathFull[] {
  return snap.paths.filter((p) => { const ap = positionOf(p); return ap === 'outside' || ap === 'unacceptable'; }).sort(byCode);
}

function inScope(scope: AtlasFcpScopeRow | null, d: FcpDomain): boolean | null {
  if (!scope) return null;
  return !!scope[`${d}_active` as keyof AtlasFcpScopeRow];
}

// ── 1. Tables — rendered from the Atlas, never by the model ────────────────

export interface AppetiteTables {
  overall: string;
  domains: string;
  operational: string;
  remediation: string;
  /** Paths declared more leniently than their residual — shown with the remediation programme, never hidden. */
  exceptions: string;
  exceptionCount: number;
  triggers: string;
}

/**
 * Paths whose declared appetite is more lenient than the band of their residual.
 *
 * Such a declaration counts only once a person has approved it — the board
 * accepting a risk above appetite (owner decision 2026-09-23); until then the
 * path counts at its band. Approved or not, it is listed: the consolidator's
 * rule is that a tolerated path is an explicit exception, never hidden, and a
 * declaration made when the residual was lower looks exactly the same.
 */
export function leniencyExceptions(snap: AtlasExportSnapshot): ThreatPathFull[] {
  return snap.paths.filter((p) => isMoreLenient(p.appetite?.appetite_position, p.residual?.residual_score)).sort(byCode);
}

export function renderAppetiteTables(
  snap: AtlasExportSnapshot, rollup: CompanyAppetiteRollup, scope: AtlasFcpScopeRow | null, triggers: AtlasEscalationTriggerRow[],
): AppetiteTables {
  const overall = rollup.overall_position
    ? `**Overall position: ${POSITION_LABEL[rollup.overall_position]}** — the worst position of any threat path in the Atlas.`
    : '**Overall position: not yet determined** — no threat path in the Atlas has a residual score or an appetite statement.';
  const counts = table(['', 'Outside / unacceptable', 'At boundary', 'Within', 'Not scored'],
    [['Threat paths', String(rollup.paths_outside_or_unacceptable), String(rollup.paths_at_boundary), String(rollup.paths_within), String(rollup.paths_unscored)]], '');

  const pathsIn = (d: FcpDomain | null) => snap.paths.filter((p) => (p.path.fcp_domain ?? null) === d).length;
  const domainRows = DOMAINS.map((d) => {
    const s = inScope(scope, d);
    const n = pathsIn(d);
    const pos = rollup.by_domain[d];
    return [DOMAIN_LABEL[d], s === null ? 'not assessed' : s ? 'yes' : 'no', String(n), pos ? POSITION_LABEL[pos] : n > 0 ? 'not scored yet' : '—'];
  }).filter((r, i) => r[2] !== '0' || inScope(scope, DOMAINS[i]) === true);

  const opN = pathsIn(null);
  const opPos = rollup.by_dimension.operational;

  const remediation = outsidePaths(snap).map((p) => [
    p.path.path_code, p.path.name, p.residual?.residual_score ? String(p.residual.residual_score) : '—',
    POSITION_LABEL[positionOf(p) as AppetitePosition],
    p.appetite?.required_action?.trim() || 'not recorded',
    isoDay(p.appetite?.target_date) ?? 'not recorded',
    p.appetite?.budget_eur !== null && p.appetite?.budget_eur !== undefined ? String(Number(p.appetite.budget_eur)) : 'not recorded',
    p.appetite?.approved_at ? 'yes' : 'no',
  ]);

  const lenient = leniencyExceptions(snap);
  const exceptions = table(['Path', 'Threat path', 'Residual', 'Band of the residual', 'Declared position', 'Declaration approved', 'Counted as'],
    lenient.map((p) => [
      p.path.path_code, p.path.name, String(p.residual?.residual_score),
      POSITION_LABEL[appetitePositionFor(p.residual!.residual_score as Score1to5)],
      POSITION_LABEL[p.appetite!.appetite_position], p.appetite?.approved_at ? 'yes' : 'no',
      p.appetite?.approved_at ? 'declared (approved)' : 'band — awaiting approval',
    ]), 'No path is declared more leniently than its residual.');
  const approvedCount = lenient.filter((p) => p.appetite?.approved_at).length;
  const flag = lenient.length
    ? `\n\n**${lenient.length} threat path(s) are declared more leniently than their residual** (${lenient.map((p) => p.path.path_code).join(', ')}) — ${approvedCount} approved and counted at the declared position, ${lenient.length - approvedCount} awaiting approval and counted at the band of their residual; listed under "Accepted exceptions" in the remediation programme.`
    : '';

  return {
    overall: [overall + flag, '', counts].join('\n'),
    exceptions,
    exceptionCount: lenient.length,
    domains: table(['Domain', 'In FCP scope', 'Threat paths', 'Position (worst-of)'], domainRows, 'No threat path carries an FCP domain, and no domain is recorded as in scope.'),
    operational: table(['Dimension', 'Threat paths', 'Position (worst-of)'],
      opN > 0 ? [['Operational (paths with no FCP domain)', String(opN), opPos ? POSITION_LABEL[opPos] : 'not scored yet']] : [], 'Every threat path carries an FCP domain.'),
    remediation: table(['Path', 'Threat path', 'Residual', 'Position', 'Required action', 'Target date', 'Budget (EUR)', 'Action approved'],
      remediation, 'No threat path is outside appetite.'),
    triggers: table(['When', 'Then', 'Timeline', 'Source'],
      triggers.map((t) => [t.trigger_event, t.required_action, t.timeline ?? '—', t.source ?? '—']), 'No escalation trigger is recorded in the Atlas.'),
  };
}

// ── 2. The model's brief ────────────────────────────────────────────────────

export const COMPANY_MODE_INSTRUCTION = `

## Atlas mode — this run

The facts below come from the institution's Risk Atlas and from the engine's deterministic worst-of rollup. They are computed, not proposed — use them as given and never re-score.

The system inserts every table into the document verbatim from the Atlas: the overall position and path counts, the per-domain table, the non-FCP table, the remediation programme, the escalation triggers, the approval block and the methodology note. Do not reproduce them, and do not write placeholders such as "(table above)".

Write the narrative only, under exactly these level-2 headings, in this order and with no others:
${SECTION_ORDER.map((k) => `## ${sectionOf(k).heading}`).join('\n')}

- Overall position: one or two sentences on why the position is what it is. If it is unacceptable, the first sentence says so.
- Remediation programme: name every outside or unacceptable path by its code. Where the Atlas records no action, target date or budget for one, say so plainly — never invent them. A path under "Accepted exceptions" is declared more leniently than its residual: name it as an exception, give its residual band, and never call it within appetite without saying so.
- Escalation triggers: the table lists what the Atlas records. Any trigger you recommend adding is a recommendation to record in the Atlas, phrased "if X then Y within Z".
- Never state a position, score or count different from the facts. Prefer pointing to the table.
- State no date the facts do not give — not a next-review date, not a deadline. Where one is missing, say it is missing.`;

export function buildAppetiteFacts(
  snap: AtlasExportSnapshot, rollup: CompanyAppetiteRollup, tables: AppetiteTables, opts: CompanyAppetiteOptions,
): string {
  const paths = [...snap.paths].sort(byCode);
  return [
    `# Risk Atlas facts — ${snap.atlas.name}`,
    `Snapshot: ${isoDay(snap.exported_at) ?? ''}. Industry pack: ${snap.atlas.industry_pack_id ?? '—'}.`,
    '',
    '## The business',
    snap.atlas.business_description?.trim() || snap.atlas.description?.trim() || '(no business description recorded in the Atlas)',
    '',
    '## Who approves',
    `Approver: ${opts.approverName?.trim() || 'not named'}${opts.approverRole?.trim() ? ` (${opts.approverRole.trim()})` : ''}. Review cadence: ${opts.reviewCadence ?? 'not set'}.`,
    'For a small business with a single owner-director, write for the owner (annual self-attestation), not for a board committee.',
    '',
    '## Rollup (deterministic)',
    tables.overall,
    '',
    '## By FCP domain', tables.domains, '',
    '## By non-FCP dimension', tables.operational, '',
    '## Threat paths',
    ...paths.map((p) => {
      const ap = positionOf(p);
      return `- ${p.path.path_code} ${p.path.name} · ${p.path.fcp_domain ?? 'no FCP domain'} · residual ${p.residual?.residual_score ?? 'not scored'} · ${ap ? POSITION_LABEL[ap] : 'not scored'}`;
    }),
    '',
    '## Remediation programme', tables.remediation, '',
    '## Accepted exceptions — declared more leniently than the residual', tables.exceptions, '',
    '## Escalation triggers', tables.triggers,
  ].join('\n');
}

// ── 3. Parse and assemble ──────────────────────────────────────────────────

export function parseAppetiteNarrative(text: string): Partial<Record<AppetiteSectionKey, string>> {
  const out: Partial<Record<AppetiteSectionKey, string>> = {};
  let current: AppetiteSectionKey | null = null;
  const buf: string[] = [];
  const flush = () => { if (current) out[current] = (out[current] ? `${out[current]}\n\n` : '') + buf.join('\n').trim(); buf.length = 0; };
  for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
    const h = /^##\s+(?:\d+\.\s*)?(.+?)\s*$/.exec(line);
    // The heading as asked for wins; the looser patterns catch a model's variant
    // ("Approved remediation programme") — so "Remediation programme by domain"
    // is the remediation section, not the domain one.
    const heading = h?.[1].toLowerCase().replace(/[*_`]/g, '').trim();
    const match = heading === undefined ? undefined
      : APPETITE_SECTIONS.find((s) => heading.startsWith(s.heading.toLowerCase())) ?? APPETITE_SECTIONS.find((s) => s.match.test(heading));
    if (match) { flush(); current = match.key; continue; }
    if (current) buf.push(line);
  }
  flush();
  return out;
}

const METHODOLOGY = 'Each threat path\'s position is its declared appetite statement or, where none is declared, the band its residual falls in (residual 1-2 within, 3 boundary, 4 outside, 5 unacceptable). A declaration more lenient than that band counts only once a person has approved it; until then the path counts at its band. A domain\'s position is the worst position of any path tagged with that domain; the overall position is the worst across all paths. This is more conservative than averaging, and it is the defensible position for a board or a regulator: one material risk out of control is enough to put the company outside its appetite.';

export function assembleAppetiteDocument(
  snap: AtlasExportSnapshot, rollup: CompanyAppetiteRollup, narrative: Partial<Record<AppetiteSectionKey, string>>,
  tables: AppetiteTables, issues: AppetiteConsistencyIssue[], sha: string, opts: CompanyAppetiteOptions,
): string {
  const review = [opts.reviewCadence ? `review ${opts.reviewCadence}` : null, isoDay(snap.atlas.next_review_due_at) ? `next review ${isoDay(snap.atlas.next_review_due_at)}` : null]
    .filter(Boolean).join(' · ');
  const lines: string[] = [
    `# ${snap.atlas.name} — Company-wide Risk Appetite Statement`,
    '',
    `*Draft for approval · generated ${isoDay(snap.exported_at) ?? ''} from the Risk Atlas "${snap.atlas.name}" · snapshot ${sha.slice(0, 12)}${review ? ` · ${review}` : ''}.*`,
    '',
    // The first thing a reader sees is the position, whatever it is.
    tables.overall.split('\n')[0],
    '',
    '> Every position, count and path in the tables is taken from the Risk Atlas and computed by fixed rules. The narrative was drafted by AI for the approver to review — this is not an approved statement until it is signed below.',
    '',
  ];
  const tableFor: Record<AppetiteSectionKey, string> = {
    overall: tables.overall.split('\n').slice(2).join('\n'),
    domains: tables.domains, operational: tables.operational, triggers: tables.triggers,
    remediation: [tables.remediation, '', '**Accepted exceptions — declared more leniently than the residual**', '', tables.exceptions].join('\n'),
  };
  SECTION_ORDER.forEach((key, i) => {
    lines.push(`## ${i + 1}. ${sectionOf(key).heading}`, '', '**From the Risk Atlas**', '', tableFor[key], '', narrative[key]?.trim() || '_Not written in this draft._', '');
  });
  const n = SECTION_ORDER.length;
  lines.push(
    `## ${n + 1}. Approval`, '',
    `Approved by: ___________________________${opts.approverName?.trim() ? `  (${opts.approverName.trim()}${opts.approverRole?.trim() ? `, ${opts.approverRole.trim()}` : ''})` : ''}`, '',
    'Date: ___________________________', '',
    'Signature: ___________________________', '',
    `## ${n + 2}. Methodology note`, '', METHODOLOGY, '',
    '## Consistency check', '',
  );
  if (issues.length === 0) {
    // Say what was checked, not more: the overall position, path scores and the
    // outside count — not every domain position or sentence.
    lines.push(`The check found no statement contradicting the overall position (${rollup.overall_position ?? 'not determined'}), a path's inherent or residual score, or the number of paths outside appetite. It does not check domain positions or other wording — read the narrative against the tables before signing.`);
  } else {
    lines.push('The narrative states the following differently from the Risk Atlas. **The Atlas figures stand; correct the narrative before sign-off.**', '');
    for (const i of issues) {
      const what = i.kind === 'overall_position' ? 'Overall position' : i.kind === 'outside_count' ? 'Paths outside appetite' : i.kind === 'residual_count' ? `Paths at residual ${i.score}` : `${i.path} ${i.kind}`;
      lines.push(`- ${what}: narrative says ${i.stated}, the Atlas has ${i.atlas} — "${i.excerpt}"`);
    }
  }
  return lines.join('\n');
}

// ── 4. Consistency check ───────────────────────────────────────────────────

const POSITION_OF_WORD: Record<string, AppetitePosition> = {
  within: 'within', boundary: 'boundary', 'at the boundary': 'boundary', 'at boundary': 'boundary', outside: 'outside', unacceptable: 'unacceptable',
};
const POSITION_WORD = '(within|at (?:the )?boundary|boundary|outside|unacceptable)';
const COUNT_OF: Record<string, number> = {
  no: 0, none: 0, zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
};
/** A count of paths: one or two digits (never a year) or a number word. */
const COUNT_WORD = `\\d{1,2}|${Object.keys(COUNT_OF).join('|')}`;
/** A sentence about one domain or dimension, not the company as a whole. */
const SCOPED_TO_PART = /\b(?:aml|cft|sanctions?|fraud|brib\w*|corruption|market abuse|tax|export controls?|slavery|operational|dimension|domain|on\s+TP-\d+|for\s+TP-\d+)\b/i;
/** Negation or a condition earlier in the sentence: the position is not being asserted. */
const NOT_ASSERTED = /\b(?:not|no longer|never|cannot|can't|could not|couldn't|unable|neither|nor|whether|if|unless|until|once|would|should)\b|n't\b/i;

/**
 * Per-path scores are checked as in the BWRA, everywhere. The count of paths
 * outside appetite is the whole Atlas's, so it is checked in the overall
 * section only: the domain and dimension sections count their own paths ("five
 * paths outside appetite" in the operational section of a live draft was one
 * dimension's five, not a wrong total). On top: any sentence naming the overall
 * position, and any sentence putting the company as a whole within or outside
 * its appetite, must agree with the rollup.
 */
export function checkAppetiteConsistency(
  narrativeText: string, snap: AtlasExportSnapshot, rollup: CompanyAppetiteRollup, overallSection?: string,
): AppetiteConsistencyIssue[] {
  const text = narrativeText.replace(/\r\n/g, '\n');
  const overallText = (overallSection ?? text).replace(/\r\n/g, '\n');
  const issues: AppetiteConsistencyIssue[] = [
    ...checkConsistency(text, snap).filter((i) => i.kind !== 'outside_count'),
    ...checkConsistency(overallText, snap).filter((i) => i.kind === 'outside_count'),
  ];
  // "five threat paths carry a residual score of 5" — the whole Atlas's count at
  // that residual (a live draft said five; the Atlas had eight). Checked in the
  // overall section only, like the outside count.
  const countAt = (score: number) => snap.paths.filter((p) => p.residual?.residual_score === score).length;
  const residualCount = new RegExp(`\\b(${COUNT_WORD})\\s+(?:threat\\s+|of\\s+the\\s+\\w+\\s+)?paths?\\b[^.;\\n]{0,40}?\\bresidual(?:\\s+score)?\\s+(?:of\\s+|at\\s+)?([1-5])\\b`, 'gi');
  for (const m of overallText.matchAll(residualCount)) {
    const stated = COUNT_OF[m[1].toLowerCase()] ?? Number(m[1]);
    const score = Number(m[2]);
    if (Number.isFinite(stated) && stated !== countAt(score)) {
      issues.push({ kind: 'residual_count', score, stated, atlas: countAt(score), excerpt: m[0].slice(0, 160) });
    }
  }
  const overall = rollup.overall_position;
  if (!overall) return issues;
  // A claim is only a claim when it is asserted: "cannot attest that the
  // business operates within its stated appetite" (a live draft) and "whether
  // the company is within appetite" state nothing about the position.
  const asserted = (m: RegExpMatchArray): boolean => {
    const start = Math.max(text.lastIndexOf('.', m.index!), text.lastIndexOf('\n', m.index!), text.lastIndexOf(';', m.index!)) + 1;
    return !NOT_ASSERTED.test(text.slice(start, m.index! + m[0].length));
  };
  const flag = (stated: AppetitePosition, excerpt: string) => {
    if (stated !== overall) issues.push({ kind: 'overall_position', stated, atlas: overall, excerpt: excerpt.slice(0, 160) });
  };
  // "The overall position is Outside appetite", "Overall position: **within**".
  // The gap stops at a comma and at a path code: in "the overall position,
  // with TP-1 outside, is unacceptable" the first position word is a path's.
  const named = new RegExp(`\\boverall\\s+(?:risk\\s+)?(?:appetite\\s+)?position\\b(?:(?![A-Z]{2,}-\\d)[^.;,\\n]){0,40}?\\b${POSITION_WORD}\\b`, 'gi');
  for (const m of text.matchAll(named)) if (asserted(m)) flag(POSITION_OF_WORD[m[1].toLowerCase()], m[0]);
  // "The company is within its risk appetite" / "the firm operates outside appetite".
  const whole = new RegExp(`\\b(?:the\\s+)?(?:company|firm|business|institution|group|organisation|organization)\\s+(?:as\\s+a\\s+whole\\s+)?(?:is|remains|operates|sits|stands)\\s+(?:currently\\s+|therefore\\s+|now\\s+)?(within|outside)\\s+(?:of\\s+)?(?:its|the|our)?\\s*(?:stated\\s+|risk\\s+|board\\s+)*appetite\\b`, 'gi');
  const sentenceOf = (m: RegExpMatchArray): string => {
    const start = Math.max(text.lastIndexOf('.', m.index!), text.lastIndexOf('\n', m.index!), text.lastIndexOf(';', m.index!)) + 1;
    const ends = ['.', '\n', ';'].map((c) => text.indexOf(c, m.index! + m[0].length)).filter((i) => i >= 0);
    return text.slice(start, ends.length ? Math.min(...ends) : text.length);
  };
  for (const m of text.matchAll(whole)) {
    if (!asserted(m)) continue;
    // "The company is within its appetite on fraud" is one domain's position, not the company's.
    if (SCOPED_TO_PART.test(sentenceOf(m))) continue;
    const stated = m[1].toLowerCase() as AppetitePosition;
    // "outside" agrees with an unacceptable overall; "within" agrees only with within.
    const agrees = stated === 'within' ? overall === 'within' : overall === 'outside' || overall === 'unacceptable';
    if (!agrees) issues.push({ kind: 'overall_position', stated, atlas: overall, excerpt: m[0].slice(0, 160) });
  }
  return issues;
}

// ── 5. Generate, store, read ───────────────────────────────────────────────

export type ChatFn = (config: StreamChatConfig) => Promise<ChatResult>;

export class CompanyAppetiteInputError extends Error {}

interface DocRow {
  id: string; atlas_id: string; markdown: string; snapshot_sha256: string; overall_position: AppetitePosition | null;
  rollup: unknown; approver_name: string | null; approver_role: string | null; review_cadence: ReviewCadence | null;
  model_requested: string | null; model_served: string | null; consistency_issues: unknown;
  created_by: string | null; created_at: string | Date;
}

const fromJson = <T>(v: unknown, fallback: T): T => (typeof v === 'string' ? JSON.parse(v) as T : (v as T | null) ?? fallback);

function rowToDocument(r: DocRow): CompanyAppetiteDocument {
  return {
    ...r,
    rollup: fromJson<CompanyAppetiteRollup>(r.rollup, {} as CompanyAppetiteRollup),
    consistency_issues: fromJson<AppetiteConsistencyIssue[]>(r.consistency_issues, []),
    created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  };
}

export function createAtlasCompanyAppetite(db: DatabaseAdapter, deps: { chat?: ChatFn } = {}) {
  const chat = deps.chat ?? callChat;
  const atlasExport = createAtlasExport(db);
  const service = createAtlasService(db);
  const fcp = createAtlasFcpScopeService(db);
  const events = createAtlasEventLogger(db);

  async function generate(
    atlasId: string, userId: string | null, opts: CompanyAppetiteOptions = {},
    onStatus: (s: string) => void = () => undefined,
  ): Promise<CompanyAppetiteDocument> {
    onStatus('Reading the Risk Atlas');
    const snap = await atlasExport.buildSnapshot(atlasId, userId);
    if (!snap) throw new CompanyAppetiteInputError('Atlas not found');
    if (snap.paths.length === 0) throw new CompanyAppetiteInputError('The Atlas has no threat paths yet — add and score paths first.');
    const [rollup, scope, triggers] = await Promise.all([fcp.computeCompanyAppetite(atlasId), fcp.getScope(atlasId), service.listTriggers(atlasId)]);

    const tables = renderAppetiteTables(snap, rollup, scope, triggers);
    const modulePrompt = await getModuleSystemPrompt(COMPANY_APPETITE_MODULE_ID);
    if (!modulePrompt) throw new Error(`The ${COMPANY_APPETITE_MODULE_ID} module prompt is missing`);

    onStatus('Writing the statement');
    const result = await chat({
      tier: 'large',
      system: modulePrompt + COMPANY_MODE_INSTRUCTION,
      messages: [{ role: 'user', content: buildAppetiteFacts(snap, rollup, tables, opts) }],
      maxTokens: 8000,
      thinkingLevel: 'think_hard',
      db,
      purpose: 'atlas_company_appetite',
    });

    onStatus('Checking the narrative against the Atlas');
    const narrative = parseAppetiteNarrative(result.text);
    const issues = checkAppetiteConsistency(Object.values(narrative).join('\n\n'), snap, rollup, narrative.overall ?? '');
    const sha = snapshotSha256(snap);
    const markdown = assembleAppetiteDocument(snap, rollup, narrative, tables, issues, sha, opts);

    const doc: CompanyAppetiteDocument = {
      id: crypto.randomUUID(), atlas_id: atlasId, markdown, snapshot_sha256: sha, overall_position: rollup.overall_position,
      rollup, approver_name: opts.approverName?.trim() || null, approver_role: opts.approverRole?.trim() || null,
      review_cadence: opts.reviewCadence ?? null, model_requested: 'large', model_served: result.modelServed ?? null,
      consistency_issues: issues, created_by: userId, created_at: new Date().toISOString(),
    };
    await db.run(
      `INSERT INTO atlas_company_appetite_documents
         (id, atlas_id, markdown, snapshot_sha256, overall_position, rollup, approver_name, approver_role, review_cadence,
          model_requested, model_served, consistency_issues, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      doc.id, doc.atlas_id, doc.markdown, doc.snapshot_sha256, doc.overall_position, JSON.stringify(doc.rollup),
      doc.approver_name, doc.approver_role, doc.review_cadence, doc.model_requested, doc.model_served,
      JSON.stringify(doc.consistency_issues), doc.created_by, doc.created_at,
    );
    await events.logEvent({
      atlasId, event: 'company_appetite_generated', userId, subResourceId: doc.id,
      details: { overall_position: rollup.overall_position, snapshot_sha256: sha, consistency_issues: issues.length },
    });
    return doc;
  }

  async function list(atlasId: string): Promise<Array<Omit<CompanyAppetiteDocument, 'markdown'>>> {
    const rows = await db.all<DocRow>(
      `SELECT id, atlas_id, '' AS markdown, snapshot_sha256, overall_position, rollup, approver_name, approver_role, review_cadence,
              model_requested, model_served, consistency_issues, created_by, created_at
         FROM atlas_company_appetite_documents WHERE atlas_id = ? ORDER BY created_at DESC LIMIT 20`, atlasId);
    return rows.map((r) => { const { markdown: _m, ...rest } = rowToDocument(r); return rest; });
  }

  async function get(atlasId: string, docId: string): Promise<CompanyAppetiteDocument | null> {
    const row = await db.get<DocRow>(`SELECT * FROM atlas_company_appetite_documents WHERE id = ? AND atlas_id = ?`, docId, atlasId);
    return row ? rowToDocument(row) : null;
  }

  return { generate, list, get };
}
