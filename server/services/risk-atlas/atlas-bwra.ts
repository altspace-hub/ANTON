// ── Risk Atlas → Business-Wide Risk Assessment ──────────────────────────────
//
// "Generate BWRA" in the Atlas workspace (2026-09-22). The Atlas's rule is that
// the calculator owns the numbers; this enforces it in code rather than in a
// prompt:
//
//   1. every score table (the seven stages) is rendered HERE, from the Atlas;
//   2. the model writes only the narrative, under fixed headings, with the
//      BWRA module's own prompt plus an "Atlas mode" instruction;
//   3. the document is assembled narrative + table, stage by stage;
//   4. a consistency check records any narrative that states a score or a
//      count that differs from the Atlas.
//
// Until now the Atlas made no model calls at all and the BWRA module described
// an "executor" that was never built — see the 2026-09-22 investigation.
import crypto from 'node:crypto';
import type { DatabaseAdapter } from '../../db/database.js';
import { createAtlasExport, type AtlasExportSnapshot } from './atlas-export.js';
import { createAtlasEventLogger } from './atlas-event-logger.js';
import { appetitePositionFor } from './atlas-residual-calculator.js';
import { RESIDUAL_REDUCTION, type AppetitePosition, type Score1to5, type ThreatPathFull } from './types.js';
import { getModuleSystemPrompt } from '../module-loader.js';
import { callChat, type ChatResult, type StreamChatConfig } from '../provider-router.js';
// isoDay lives in atlas-dates.ts (atlas-service needs it too); re-exported for existing callers.
import { isoDay } from './atlas-dates.js';
export { isoDay };

export const BWRA_MODULE_ID = 'business-wide-risk-assessment';

/** The narrative sections, in document order. */
export const BWRA_SECTIONS = [
  { key: 'summary', heading: 'Executive summary' },
  { key: 'methodology', heading: 'Methodology' },
  { key: 'stage1', heading: 'Stage 1 — Business context' },
  { key: 'stage2', heading: 'Stage 2 — Threat paths' },
  { key: 'stage3', heading: 'Stage 3 — Vulnerabilities' },
  { key: 'stage4', heading: 'Stage 4 — Inherent risk' },
  { key: 'stage5', heading: 'Stage 5 — Controls' },
  { key: 'stage6', heading: 'Stage 6 — Residual risk' },
  { key: 'stage7', heading: 'Stage 7 — Risk appetite' },
  { key: 'annexA', heading: 'Annex A — Cross-domain bundles' },
  { key: 'annexB', heading: 'Annex B — Maintenance cycle' },
  { key: 'annexC', heading: 'Annex C — Methodology references' },
] as const;
export type BwraSectionKey = (typeof BWRA_SECTIONS)[number]['key'];
type StageKey = 'stage1' | 'stage2' | 'stage3' | 'stage4' | 'stage5' | 'stage6' | 'stage7';

export interface BwraConsistencyIssue {
  kind: 'residual' | 'inherent' | 'outside_count';
  path?: string;
  stated: number;
  atlas: number;
  excerpt: string;
}

export interface BwraDocument {
  id: string;
  atlas_id: string;
  markdown: string;
  snapshot_sha256: string;
  paths_total: number;
  model_requested: string | null;
  model_served: string | null;
  consistency_issues: BwraConsistencyIssue[];
  created_by: string | null;
  created_at: string;
}

const APPETITE_LABEL: Record<AppetitePosition, string> = {
  within: 'Within', boundary: 'Boundary', outside: 'Outside', unacceptable: 'Unacceptable',
};

// Backslashes first, then pipes: escaping only `|` turns a name containing `\|`
// into `\\|` — an escaped backslash and a bare separator that splits the cell.
const cell = (s: unknown): string => String(s ?? '').replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim() || '—';
const table = (head: string[], rows: string[][]): string =>
  rows.length === 0
    ? '_None recorded in the Atlas yet._'
    : [`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...rows.map((r) => `| ${r.map(cell).join(' | ')} |`)].join('\n');


function uniqueBy<T>(items: T[], key: (t: T) => string): T[] {
  const seen = new Map<string, T>();
  for (const i of items) if (!seen.has(key(i))) seen.set(key(i), i);
  return [...seen.values()];
}

/** Stored residual, or null when the path has not been scored. */
function residualOf(p: ThreatPathFull): Score1to5 | null {
  return (p.residual?.residual_score ?? null) as Score1to5 | null;
}

function appetiteOf(p: ThreatPathFull): AppetitePosition | null {
  if (p.appetite?.appetite_position) return p.appetite.appetite_position;
  const r = residualOf(p);
  return r ? appetitePositionFor(r) : null;
}

// ── 1. Stage tables — rendered from the Atlas, never by the model ──────────

export function renderStageTables(snap: AtlasExportSnapshot): Record<StageKey, string> {
  const paths = [...snap.paths].sort((a, b) => a.path.path_code.localeCompare(b.path.path_code, undefined, { numeric: true }));
  const codesFor = (pred: (p: ThreatPathFull) => boolean) => paths.filter(pred).map((p) => p.path.path_code).join(', ');

  const exposures = uniqueBy(paths.flatMap((p) => p.exposures), (e) => e.id);
  const vulns = uniqueBy(paths.flatMap((p) => p.vulnerabilities), (v) => v.id)
    .sort((a, b) => a.vuln_code.localeCompare(b.vuln_code, undefined, { numeric: true }));
  const controls = uniqueBy(paths.flatMap((p) => p.controls), (c) => c.id)
    .sort((a, b) => a.control_code.localeCompare(b.control_code, undefined, { numeric: true }));

  return {
    stage1: table(['Exposure point', 'Category', 'Threat paths'],
      exposures.map((e) => [e.name, e.category ?? '—', codesFor((p) => p.exposures.some((x) => x.id === e.id))])),
    stage2: table(['Code', 'Threat path', 'FCP domain'],
      paths.map((p) => [p.path.path_code, p.path.name, p.path.fcp_domain ?? '—'])),
    stage3: table(['Code', 'Vulnerability', 'Severity (1-5)', 'Threat paths'],
      vulns.map((v) => [v.vuln_code, v.name, String(v.severity), codesFor((p) => p.vulnerabilities.some((x) => x.id === v.id))])),
    stage4: table(['Path', 'Exposure', 'Threat', 'Vulnerability', 'Inherent (highest of the three)'],
      paths.map((p) => p.inherent
        ? [p.path.path_code, String(p.inherent.exposure_score), String(p.inherent.threat_score), String(p.inherent.vulnerability_score), String(p.inherent.inherent_score)]
        : [p.path.path_code, '—', '—', '—', 'not scored yet'])),
    stage5: table(['Code', 'Control', 'Type', 'Strength', 'Evidence recorded', 'Owner'],
      controls.map((c) => [c.control_code, c.name, c.type, c.strength, c.evidence && c.evidence.trim().length >= 5 ? 'yes' : 'no', c.owner_role ?? '—'])),
    stage6: table(['Path', 'Inherent', 'Controls (worst-of)', 'Calculation', 'Residual'],
      paths.map((p) => {
        const r = residualOf(p);
        const inh = p.inherent?.inherent_score;
        const rollup = p.residual?.control_quality_rollup;
        if (!r || !inh || !rollup) return [p.path.path_code, inh ? String(inh) : '—', rollup ?? '—', '—', 'not scored yet'];
        return [p.path.path_code, String(inh), rollup, `${inh} − ${RESIDUAL_REDUCTION[rollup]} = ${Math.max(1, inh - RESIDUAL_REDUCTION[rollup])}`, String(r)];
      })),
    stage7: table(['Path', 'Residual', 'Appetite', 'Required action', 'Target date', 'Approved'],
      paths.map((p) => {
        const ap = appetiteOf(p);
        return [p.path.path_code, residualOf(p) ? String(residualOf(p)) : '—', ap ? APPETITE_LABEL[ap] : 'not scored yet',
          p.appetite?.required_action ?? '—', isoDay(p.appetite?.target_date) ?? '—', p.appetite?.approved_at ? 'yes' : 'no'];
      })),
  };
}

export function outsideCount(snap: AtlasExportSnapshot): number {
  return snap.paths.filter((p) => { const ap = appetiteOf(p); return ap === 'outside' || ap === 'unacceptable'; }).length;
}

/** Hash of the register state a document describes (the export time excluded). */
export function snapshotSha256(snap: AtlasExportSnapshot): string {
  return crypto.createHash('sha256').update(JSON.stringify({ atlas: snap.atlas, paths: snap.paths })).digest('hex');
}

// ── 2. The model's brief ────────────────────────────────────────────────────

export const ATLAS_MODE_INSTRUCTION = `

## Atlas mode — this run

The facts below come from the institution's Risk Atlas: its threat paths, scores, control ratings and appetite positions. They are measured, not proposed — use them as given and never re-score.

The seven stage tables are inserted into the document by the system, verbatim from the Atlas, directly under each stage heading and before your narrative for that stage. Do not reproduce them, and do not write placeholders such as "(table inserted above)". Refer to paths, vulnerabilities and controls by their codes (TP-1, V-2, C-3). If you mention a score, it must be the Atlas's score; prefer pointing to the table.

Write the narrative only, under exactly these level-2 headings, in this order and with no others:
${BWRA_SECTIONS.map((s) => `## ${s.heading}`).join('\n')}

Where the Atlas has gaps — paths not yet scored, controls without recorded evidence, outside-appetite paths without an action, owner or date — say so plainly in the stage where it matters; a regulator will see the same gaps. Do not add a "To record in the Risk Atlas" checklist: the scores are already there.`;

export function buildFactsMessage(snap: AtlasExportSnapshot, tables: Record<StageKey, string>): string {
  const d = snap.dashboard;
  const by = d.paths_by_appetite;
  return [
    `# Risk Atlas facts — ${snap.atlas.name}`,
    `Snapshot: ${isoDay(snap.exported_at) ?? ''}. Industry pack: ${snap.atlas.industry_pack_id ?? '—'}. Mode: ${snap.atlas.mode}.`,
    '',
    '## Institution',
    snap.atlas.business_description?.trim() || snap.atlas.description?.trim() || '(no business description recorded in the Atlas)',
    '',
    '## Headline',
    `- Threat paths: ${d.paths_total}`,
    `- Outside appetite (incl. unacceptable): ${outsideCount(snap)}`,
    `- Boundary: ${by.boundary ?? 0} · Within: ${by.within ?? 0}`,
    '',
    ...BWRA_SECTIONS.filter((s) => s.key.startsWith('stage')).flatMap((s) => [`## ${s.heading} — Atlas table`, tables[s.key as StageKey], '']),
  ].join('\n');
}

// ── 3. Parse and assemble ──────────────────────────────────────────────────

/** Split the model's text into the fixed sections (by heading prefix; unknown headings stay with the section above). */
export function parseNarrative(text: string): Partial<Record<BwraSectionKey, string>> {
  const out: Partial<Record<BwraSectionKey, string>> = {};
  let current: BwraSectionKey | null = null;
  const buf: string[] = [];
  const flush = () => { if (current) out[current] = (out[current] ? `${out[current]}\n\n` : '') + buf.join('\n').trim(); buf.length = 0; };
  for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
    const h = /^##\s+(.+?)\s*$/.exec(line);
    const match = h ? BWRA_SECTIONS.find((s) => h[1].toLowerCase().startsWith(s.heading.split(' — ')[0].toLowerCase())) : undefined;
    if (match) { flush(); current = match.key; continue; }
    if (current) buf.push(line);
  }
  flush();
  return out;
}

export function assembleDocument(
  snap: AtlasExportSnapshot,
  narrative: Partial<Record<BwraSectionKey, string>>,
  tables: Record<StageKey, string>,
  issues: BwraConsistencyIssue[],
  sha: string,
): string {
  const lines: string[] = [
    `# ${snap.atlas.name} — Business-Wide Risk Assessment (AMLR Article 10)`,
    '',
    `*Generated ${isoDay(snap.exported_at) ?? ''} from the Risk Atlas "${snap.atlas.name}" · snapshot ${sha.slice(0, 12)} · ${snap.dashboard.paths_total} threat paths.*`,
    '',
    '> The stage tables are taken from the Risk Atlas; every score in them is computed by fixed rules. The narrative was drafted by AI for the institution to review — it is not an approved assessment until signed off.',
    '',
  ];
  BWRA_SECTIONS.forEach((s, i) => {
    lines.push(`## ${i + 1}. ${s.heading}`, '');
    // Stage sections: the Atlas table first (the facts), then the narrative on it.
    if (s.key.startsWith('stage')) lines.push(`**From the Risk Atlas**`, '', tables[s.key as StageKey], '');
    lines.push(narrative[s.key]?.trim() || '_Not written in this draft._', '');
  });
  lines.push('## Consistency check', '');
  if (issues.length === 0) {
    lines.push('No statement in the narrative contradicts a score or count in the Risk Atlas.');
  } else {
    lines.push('The narrative states the following differently from the Risk Atlas. **The Atlas figures stand; correct the narrative before sign-off.**', '');
    for (const i of issues) {
      lines.push(i.kind === 'outside_count'
        ? `- Paths outside appetite: narrative says ${i.stated}, the Atlas has ${i.atlas} — "${i.excerpt}"`
        : `- ${i.path} ${i.kind}: narrative says ${i.stated}, the Atlas has ${i.atlas} — "${i.excerpt}"`);
    }
  }
  return lines.join('\n');
}

// ── 4. Consistency check ───────────────────────────────────────────────────

const NUMBER_WORDS: Record<string, number> = {
  no: 0, none: 0, zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
};
const toNumber = (s: string): number | null => (/^\d+$/.test(s) ? Number(s) : NUMBER_WORDS[s.toLowerCase()] ?? null);

export function checkConsistency(narrativeText: string, snap: AtlasExportSnapshot): BwraConsistencyIssue[] {
  const text = narrativeText.replace(/\r\n/g, '\n');
  const issues: BwraConsistencyIssue[] = [];
  for (const p of snap.paths) {
    const code = p.path.path_code.replace(/[-]/g, '[-‑–]?');
    for (const kind of ['residual', 'inherent'] as const) {
      const stored = kind === 'residual' ? residualOf(p) : (p.inherent?.inherent_score ?? null);
      if (!stored) continue;
      // Same clause only (no . ; ( ) between), no other path code in between,
      // within 50 characters: 'TP-4); … band (residual 5' defines a band — a
      // live draft was flagged wrongly on it.
      const re = new RegExp(`\\b${code}\\b(?:(?![A-Z]{2,}-\\d)[^.;()\\n]){0,50}?\\b${kind}(?:\\s+(?:score|risk|rating))?\\s*(?:of|is|at|=|:|→|sits at|of just)?\\s*([1-5])\\b`, 'gi');
      for (const m of text.matchAll(re)) {
        const stated = Number(m[1]);
        if (stated !== stored) issues.push({ kind, path: p.path.path_code, stated, atlas: stored, excerpt: m[0].slice(0, 160) });
      }
    }
  }
  // Counts of paths outside appetite. The number that governs "outside" is
  // read, not the first number in the sentence: "seventeen paths, including the
  // three outside appetite" states three (a live run was flagged wrongly).
  //   1. "X of Y (scored) paths … outside" → X
  //   2. otherwise the nearest number before "outside", with no other number in
  //      between, and either "path" in the gap or at most one word of gap
  //      (so "Art. 10 obligations fall outside" is not read as a count).
  const outside = outsideCount(snap);
  // One or two digits: a count of paths, never a year ("the 2027 cycle, leaving this path outside appetite").
  const NUM = '(?:\\d{1,2}|no|none|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)';
  let rest = text;
  const ofRe = new RegExp(`\\b(${NUM})\\s+(?:out\\s+)?of\\s+(?:the\\s+)?${NUM}\\s+(?:(?:scored|threat)\\s+)*paths?\\b((?:\\s+(?!${NUM}\\b)[\\w,'-]+){0,4}?)\\s+outside\\s+(?:the\\s+)?(?:stated\\s+|risk\\s+|board\\s+)?appetite\\b`, 'gi');
  for (const m of text.matchAll(ofRe)) {
    const stated = toNumber(m[1]);
    if (stated !== null && stated !== outside) issues.push({ kind: 'outside_count', stated, atlas: outside, excerpt: m[0].slice(0, 160) });
    rest = rest.replace(m[0], ' '.repeat(m[0].length));
  }
  const directRe = new RegExp(`\\b(${NUM})\\b((?:\\s+(?!${NUM}\\b)[\\w,'-]+){0,4}?)\\s+outside\\s+(?:the\\s+)?(?:stated\\s+|risk\\s+|board\\s+)?appetite\\b`, 'gi');
  for (const m of rest.matchAll(directRe)) {
    const gap = m[2].trim();
    if (!(/\bpaths?\b/i.test(gap) || gap.split(/\s+/).filter(Boolean).length <= 1)) continue;
    const stated = toNumber(m[1]);
    if (stated !== null && stated !== outside) issues.push({ kind: 'outside_count', stated, atlas: outside, excerpt: m[0].slice(0, 160) });
  }
  return issues;
}

// ── 5. Generate, store, read ───────────────────────────────────────────────

export type ChatFn = (config: StreamChatConfig) => Promise<ChatResult>;

export class BwraInputError extends Error {}

interface BwraRow {
  id: string; atlas_id: string; markdown: string; snapshot_sha256: string; paths_total: number | string;
  model_requested: string | null; model_served: string | null; consistency_issues: unknown;
  created_by: string | null; created_at: string | Date;
}

function rowToDocument(r: BwraRow): BwraDocument {
  const issues = typeof r.consistency_issues === 'string' ? JSON.parse(r.consistency_issues) as BwraConsistencyIssue[] : (r.consistency_issues as BwraConsistencyIssue[] | null) ?? [];
  return { ...r, paths_total: Number(r.paths_total), consistency_issues: issues, created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at) };
}

export function createAtlasBwra(db: DatabaseAdapter, deps: { chat?: ChatFn } = {}) {
  const chat = deps.chat ?? callChat;
  const atlasExport = createAtlasExport(db);
  const events = createAtlasEventLogger(db);

  async function generate(atlasId: string, userId: string | null, onStatus: (s: string) => void = () => undefined): Promise<BwraDocument> {
    onStatus('Reading the Risk Atlas');
    const snap = await atlasExport.buildSnapshot(atlasId, userId);
    if (!snap) throw new BwraInputError('Atlas not found');
    if (snap.paths.length === 0) throw new BwraInputError('The Atlas has no threat paths yet — add and score paths first.');

    const tables = renderStageTables(snap);
    const modulePrompt = await getModuleSystemPrompt(BWRA_MODULE_ID);
    if (!modulePrompt) throw new Error(`The ${BWRA_MODULE_ID} module prompt is missing`);

    onStatus('Writing the assessment');
    const result = await chat({
      tier: 'large',
      system: modulePrompt + ATLAS_MODE_INSTRUCTION,
      messages: [{ role: 'user', content: buildFactsMessage(snap, tables) }],
      maxTokens: 16000,
      thinkingLevel: 'think_hard',
      db,
      purpose: 'atlas_bwra',
    });

    onStatus('Checking the narrative against the Atlas');
    const narrative = parseNarrative(result.text);
    const issues = checkConsistency(Object.values(narrative).join('\n\n'), snap);
    const sha = snapshotSha256(snap);
    const markdown = assembleDocument(snap, narrative, tables, issues, sha);

    const doc: BwraDocument = {
      id: crypto.randomUUID(), atlas_id: atlasId, markdown, snapshot_sha256: sha, paths_total: snap.dashboard.paths_total,
      model_requested: 'large', model_served: result.modelServed ?? null, consistency_issues: issues,
      created_by: userId, created_at: new Date().toISOString(),
    };
    await db.run(
      `INSERT INTO atlas_bwra_documents (id, atlas_id, markdown, snapshot_sha256, paths_total, model_requested, model_served, consistency_issues, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      doc.id, doc.atlas_id, doc.markdown, doc.snapshot_sha256, doc.paths_total, doc.model_requested, doc.model_served,
      JSON.stringify(doc.consistency_issues), doc.created_by, doc.created_at,
    );
    await events.logEvent({ atlasId, event: 'bwra_generated', userId, subResourceId: doc.id, details: { snapshot_sha256: sha, consistency_issues: issues.length } });
    return doc;
  }

  async function list(atlasId: string): Promise<Array<Omit<BwraDocument, 'markdown'>>> {
    const rows = await db.all<BwraRow>(
      `SELECT id, atlas_id, '' AS markdown, snapshot_sha256, paths_total, model_requested, model_served, consistency_issues, created_by, created_at
         FROM atlas_bwra_documents WHERE atlas_id = ? ORDER BY created_at DESC LIMIT 20`, atlasId);
    return rows.map((r) => { const { markdown: _m, ...rest } = rowToDocument(r); return rest; });
  }

  async function get(atlasId: string, docId: string): Promise<BwraDocument | null> {
    const row = await db.get<BwraRow>(`SELECT * FROM atlas_bwra_documents WHERE id = ? AND atlas_id = ?`, docId, atlasId);
    return row ? rowToDocument(row) : null;
  }

  return { generate, list, get };
}
