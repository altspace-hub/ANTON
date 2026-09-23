// ── Risk Atlas — AI proposals a person accepts or rejects ───────────────────
//
// The seven atlas-* stage prompts have always ended in a fenced JSON diff
// ("atlas_exposure_diff", "atlas_controls_diff", …) and nothing ever read one.
// Here each diff becomes a list of proposals: stored as produced, reviewed by
// a person, and applied on acceptance through the same atlas-service calls
// hand entry uses — same tenancy checks, same audit events.
//
// Two rules hold the Atlas's guarantees:
//   1. the model never sets a score the calculator owns. Stage 4 proposes
//      exposure/threat/vulnerability (1-5) and scoreInherent computes inherent;
//      residual only ever comes from recalculateResidualForPath. The schemas
//      reject inherent_score / residual_score outright.
//   2. references are resolved against the Atlas, never invented: an unknown
//      TP-/V- code or exposure name is stored `unresolved` with the reason.
//
// v1 proposes additions only. An edit or removal of an existing row is stored
// `skipped` (it rewrites an audited record and needs its own review UI), so
// nothing the model produced is silently dropped.
import crypto from 'node:crypto';
import { z } from 'zod';
import type { DatabaseAdapter } from '../../db/database.js';
import { createAtlasService } from './atlas-service.js';
import { createAtlasExport, type AtlasExportSnapshot } from './atlas-export.js';
import { createAtlasPackLoader } from './atlas-pack-loader.js';
import { getModuleSystemPrompt } from '../module-loader.js';
import { callChat, type ChatResult, type StreamChatConfig } from '../provider-router.js';
import { isoDay } from './atlas-bwra.js';
import { appetitePositionFor } from './atlas-residual-calculator.js';
import type { Score1to5 } from './types.js';

export type ProposalStage = 'exposures' | 'threat_paths' | 'vulnerabilities' | 'inherent' | 'controls' | 'appetite';
export type ProposalKind = 'exposure' | 'threat_path' | 'vulnerability' | 'inherent_score' | 'control' | 'appetite' | 'trigger';
export type ProposalStatus = 'pending' | 'accepted' | 'rejected' | 'skipped' | 'unresolved' | 'failed';

export interface Proposal {
  id: string;
  set_id: string;
  atlas_id: string;
  kind: ProposalKind;
  payload: Record<string, unknown>;
  rationale: string | null;
  status: ProposalStatus;
  applied_ref_id: string | null;
  error: string | null;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
}

export class ProposalInputError extends Error {}

/** Accept / reject: an expected refusal carries its own reason. */
export type DecisionResult = { ok: true; proposal: Proposal } | { ok: false; reason: string };

// ── Schemas — what a stage may propose ─────────────────────────────────────
//
// `.strict()` everywhere: a diff carrying inherent_score or residual_score (or
// any other unknown key) is rejected rather than quietly ignored.

const score = z.number().int().min(1).max(5);
const EXPOSURE_CATEGORIES = ['service', 'customer_segment', 'channel', 'partner', 'geography', 'product', 'process', 'system'] as const;
const FCP_DOMAINS = ['amlcft', 'sanctions', 'fraud', 'abc', 'market_abuse', 'tax_evasion_facilitation', 'export_controls', 'modern_slavery'] as const;
const CONTROL_TYPES = ['prevent', 'detect', 'respond'] as const;

const exposureSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(4000).optional(),
  category: z.enum(EXPOSURE_CATEGORIES).optional(),
  source_pack_exposure_id: z.string().max(200).optional(),
  source: z.string().max(200).optional(),
  rationale: z.string().max(4000).optional(),
}).strict();

const threatPathSchema = z.object({
  path_code: z.string().min(1).max(40),
  name: z.string().min(1).max(200),
  description: z.string().max(4000).optional(),
  fcp_domain: z.enum(FCP_DOMAINS).nullable().optional(),
  exposure_ids: z.array(z.string()).max(50).optional(),
  exposure_names: z.array(z.string()).max(50).optional(),
  source_pack_path_id: z.string().max(200).nullable().optional(),
  source: z.string().max(200).optional(),
  rationale: z.string().max(4000).optional(),
}).strict();

const vulnerabilitySchema = z.object({
  vuln_code: z.string().min(1).max(40),
  name: z.string().min(1).max(200),
  description: z.string().max(4000).optional(),
  severity: score,
  threat_path_codes: z.array(z.string()).max(50).optional(),
  threat_path_ids: z.array(z.string()).max(50).optional(),
  source_pack_vuln_id: z.string().max(200).nullable().optional(),
  source: z.string().max(200).optional(),
  rationale: z.string().max(4000).optional(),
  severity_rationale: z.string().max(4000).optional(),
}).strict();

const inherentSchema = z.object({
  threat_path_id: z.string().optional(),
  threat_path_code: z.string().optional(),
  exposure_score: score,
  threat_score: score,
  vulnerability_score: score,
  rationale: z.string().max(4000).optional(),
}).strict();

const controlSchema = z.object({
  control_code: z.string().min(1).max(40),
  name: z.string().min(1).max(200),
  description: z.string().max(4000).optional(),
  type: z.enum(CONTROL_TYPES),
  strength: z.enum(['strong', 'adequate', 'weak']),
  evidence: z.string().max(4000).optional(),
  owner_role: z.string().max(200).optional(),
  vulnerability_links: z.array(z.object({
    vulnerability_id: z.string().optional(),
    vulnerability_code: z.string().optional(),
    type: z.enum(CONTROL_TYPES),
    notes: z.string().max(500).optional(),
  }).strict()).max(50).optional(),
  source_pack_control_id: z.string().max(200).nullable().optional(),
  source: z.string().max(200).optional(),
  rationale: z.string().max(4000).optional(),
  uncovered_vulnerabilities: z.array(z.string()).max(100).optional(),
}).strict();

const appetiteSchema = z.object({
  threat_path_id: z.string().optional(),
  threat_path_code: z.string().optional(),
  appetite_position: z.enum(['within', 'boundary', 'outside', 'unacceptable']),
  required_action: z.string().max(2000).optional(),
  target_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  budget_eur: z.number().min(0).nullable().optional(),
  rationale: z.string().max(4000).optional(),
  // Accepted and then dropped: approval is a person's act (approveAppetite),
  // and the override reason is kept as rationale, not written to the row.
  approved_by: z.null().optional(),
  override_reason: z.string().max(4000).nullable().optional(),
}).strict();

const triggerSchema = z.object({
  trigger_event: z.string().min(1).max(500),
  required_action: z.string().min(1).max(500),
  timeline: z.string().max(200).optional(),
  source: z.string().max(40).optional(),
}).strict();

interface StageSpec {
  module: string;
  fence: string;
  /** Where the additions live in the diff, and what kind each is. */
  lists: Array<{ key: string; kind: ProposalKind; schema: z.ZodTypeAny }>;
  /** Keys that carry edits/removals — parsed, stored `skipped`. */
  outOfScope: string[];
  title: string;
}

export const STAGES: Record<ProposalStage, StageSpec> = {
  exposures: { module: 'atlas-exposure-mapper', fence: 'atlas_exposure_diff', title: 'Stage 1 — Exposure points',
    lists: [{ key: 'additions', kind: 'exposure', schema: exposureSchema }], outOfScope: ['edits', 'removals'] },
  threat_paths: { module: 'atlas-threat-cataloguer', fence: 'atlas_threat_paths_diff', title: 'Stage 2 — Threat paths',
    lists: [{ key: 'additions', kind: 'threat_path', schema: threatPathSchema }], outOfScope: ['edits', 'removals'] },
  vulnerabilities: { module: 'atlas-vulnerability-assessor', fence: 'atlas_vulnerabilities_diff', title: 'Stage 3 — Vulnerabilities',
    lists: [{ key: 'additions', kind: 'vulnerability', schema: vulnerabilitySchema }], outOfScope: ['edits', 'removals'] },
  inherent: { module: 'atlas-inherent-scorer', fence: 'atlas_inherent_scores_diff', title: 'Stage 4 — Inherent scores',
    lists: [{ key: 'scores', kind: 'inherent_score', schema: inherentSchema }], outOfScope: [] },
  controls: { module: 'atlas-control-mapper', fence: 'atlas_controls_diff', title: 'Stage 5 — Controls',
    lists: [{ key: 'additions', kind: 'control', schema: controlSchema }], outOfScope: ['edits', 'removals'] },
  appetite: { module: 'atlas-appetite-manager', fence: 'atlas_appetite_diff', title: 'Stage 7 — Appetite',
    lists: [{ key: 'statements', kind: 'appetite', schema: appetiteSchema }, { key: 'escalation_triggers', kind: 'trigger', schema: triggerSchema }], outOfScope: [] },
};

export function isProposalStage(v: unknown): v is ProposalStage {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(STAGES, v);
}

// ── Parsing ────────────────────────────────────────────────────────────────

/** The fenced JSON block a stage prompt ends with. Last one wins (a prompt may show the shape first). */
export function extractFencedJson(text: string, fence: string): { value: unknown } | { error: string } {
  const re = new RegExp('```(?:' + fence + ')\\s*\\n([\\s\\S]*?)```', 'g');
  const blocks = [...text.matchAll(re)].map((m) => m[1]);
  if (blocks.length === 0) return { error: `The model produced no \`${fence}\` block.` };
  try {
    return { value: JSON.parse(blocks[blocks.length - 1]) as unknown };
  } catch (err) {
    return { error: `The \`${fence}\` block is not valid JSON: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export interface ParsedItem {
  kind: ProposalKind;
  payload: Record<string, unknown>;
  rationale: string | null;
  status: Extract<ProposalStatus, 'pending' | 'skipped' | 'failed' | 'unresolved'>;
  error?: string;
}

/** Validate every list in the diff; out-of-scope keys become `skipped` items. */
export function parseDiff(stage: ProposalStage, diff: unknown): ParsedItem[] {
  const spec = STAGES[stage];
  const out: ParsedItem[] = [];
  const obj = (diff && typeof diff === 'object' ? diff : {}) as Record<string, unknown>;
  for (const list of spec.lists) {
    const raw = Array.isArray(obj[list.key]) ? obj[list.key] as unknown[] : [];
    for (const entry of raw) {
      const parsed = list.schema.safeParse(entry);
      if (parsed.success) {
        const payload = parsed.data as Record<string, unknown>;
        const rationale = [payload.rationale, payload.severity_rationale, payload.override_reason, payload.source]
          .filter((r): r is string => typeof r === 'string' && r.trim().length > 0).join(' · ');
        // What is stored is what would be written: the descriptive keys the
        // stage prompts emit (source, rationale) and the ones a model may not
        // set (approved_by) are kept out of the payload.
        for (const k of ['rationale', 'severity_rationale', 'override_reason', 'source', 'approved_by', 'uncovered_vulnerabilities']) delete payload[k];
        out.push({ kind: list.kind, payload, rationale: rationale || null, status: 'pending' });
      } else {
        out.push({
          kind: list.kind, payload: entry as Record<string, unknown>, rationale: null, status: 'failed',
          error: parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ').slice(0, 500),
        });
      }
    }
  }
  for (const key of spec.outOfScope) {
    const raw = Array.isArray(obj[key]) ? obj[key] as unknown[] : [];
    for (const entry of raw) {
      out.push({
        kind: spec.lists[0].kind, payload: entry as Record<string, unknown>, rationale: null, status: 'skipped',
        error: `${key} of existing rows are reviewed by hand — not applied from a suggestion.`,
      });
    }
  }
  return out;
}

// ── Reference resolution — against the Atlas, never invented ───────────────

interface AtlasIndex {
  pathIdByCode: Map<string, string>;
  pathIds: Set<string>;
  /** Stored residual per path — the appetite band follows from it, not from the model. */
  residualByPathId: Map<string, Score1to5>;
  vulnIdByCode: Map<string, string>;
  vulnIds: Set<string>;
  exposureIdByName: Map<string, string>;
  exposureIds: Set<string>;
}

export function indexAtlas(snap: AtlasExportSnapshot): AtlasIndex {
  const idx: AtlasIndex = {
    pathIdByCode: new Map(), pathIds: new Set(), residualByPathId: new Map(), vulnIdByCode: new Map(), vulnIds: new Set(),
    exposureIdByName: new Map(), exposureIds: new Set(),
  };
  for (const p of snap.paths) {
    idx.pathIdByCode.set(p.path.path_code.toLowerCase(), p.path.id);
    idx.pathIds.add(p.path.id);
    if (p.residual?.residual_score) idx.residualByPathId.set(p.path.id, p.residual.residual_score as Score1to5);
    for (const v of p.vulnerabilities) { idx.vulnIdByCode.set(v.vuln_code.toLowerCase(), v.id); idx.vulnIds.add(v.id); }
    for (const e of p.exposures) { idx.exposureIdByName.set(e.name.trim().toLowerCase(), e.id); idx.exposureIds.add(e.id); }
  }
  return idx;
}

/** Turn codes/names into ids. Returns the reason when something does not exist in this Atlas. */
export function resolveItem(item: ParsedItem, idx: AtlasIndex): ParsedItem {
  if (item.status !== 'pending') return item;
  const p = { ...item.payload };
  const missing: string[] = [];

  const resolvePath = (): void => {
    const id = typeof p.threat_path_id === 'string' ? p.threat_path_id : undefined;
    const code = typeof p.threat_path_code === 'string' ? p.threat_path_code : undefined;
    if (id && idx.pathIds.has(id)) { p.threat_path_id = id; delete p.threat_path_code; return; }
    const byCode = code ? idx.pathIdByCode.get(code.toLowerCase()) : undefined;
    if (byCode) { p.threat_path_id = byCode; delete p.threat_path_code; return; }
    missing.push(`threat path ${JSON.stringify(code ?? id ?? '(none given)')}`);
  };

  if (item.kind === 'inherent_score' || item.kind === 'appetite') resolvePath();

  if (item.kind === 'appetite' && typeof p.threat_path_id === 'string') {
    // The band follows from the residual by fixed rules (1-2 within, 3
    // boundary, 4 outside, 5 unacceptable). A model may state the action and
    // the date; it does not get to move a path into appetite.
    const residual = idx.residualByPathId.get(p.threat_path_id);
    if (residual) {
      const band = appetitePositionFor(residual);
      if (p.appetite_position !== band) {
        item.rationale = [item.rationale, `Position set to "${band}" from the Atlas residual ${residual} (the model proposed "${String(p.appetite_position)}").`].filter(Boolean).join(' · ');
        p.appetite_position = band;
      }
    }
  }

  if (item.kind === 'threat_path') {
    const ids = [
      ...(Array.isArray(p.exposure_ids) ? p.exposure_ids as string[] : []).filter((id) => idx.exposureIds.has(id)),
      ...(Array.isArray(p.exposure_names) ? p.exposure_names as string[] : [])
        .map((n) => idx.exposureIdByName.get(String(n).trim().toLowerCase()))
        .filter((v): v is string => !!v),
    ];
    const unknownIds = (Array.isArray(p.exposure_ids) ? p.exposure_ids as string[] : []).filter((id) => !idx.exposureIds.has(id));
    const unknownNames = (Array.isArray(p.exposure_names) ? p.exposure_names as string[] : [])
      .filter((n) => !idx.exposureIdByName.has(String(n).trim().toLowerCase()));
    // Unknown exposures are dropped with a note, not invented: the path is still useful.
    if (unknownIds.length || unknownNames.length) {
      item.rationale = [item.rationale, `Exposures not in this Atlas were left off: ${[...unknownIds, ...unknownNames].join(', ')}`].filter(Boolean).join(' · ');
    }
    p.exposure_ids = [...new Set(ids)];
    delete p.exposure_names;
  }

  if (item.kind === 'vulnerability') {
    const codes = Array.isArray(p.threat_path_codes) ? p.threat_path_codes as string[] : [];
    const ids = [
      ...(Array.isArray(p.threat_path_ids) ? p.threat_path_ids as string[] : []).filter((id) => idx.pathIds.has(id)),
      ...codes.map((c) => idx.pathIdByCode.get(String(c).toLowerCase())).filter((v): v is string => !!v),
    ];
    const unknown = codes.filter((c) => !idx.pathIdByCode.has(String(c).toLowerCase()));
    if (ids.length === 0) missing.push(`threat paths ${JSON.stringify(codes.join(', ') || '(none given)')}`);
    else if (unknown.length) item.rationale = [item.rationale, `Unknown paths left off: ${unknown.join(', ')}`].filter(Boolean).join(' · ');
    p.threat_path_ids = [...new Set(ids)];
    delete p.threat_path_codes;
  }

  if (item.kind === 'control') {
    const links = Array.isArray(p.vulnerability_links) ? p.vulnerability_links as Array<Record<string, unknown>> : [];
    const resolved: Array<{ vulnerability_id: string; type: string; notes?: string }> = [];
    const unknown: string[] = [];
    for (const l of links) {
      const id = typeof l.vulnerability_id === 'string' && idx.vulnIds.has(l.vulnerability_id) ? l.vulnerability_id
        : typeof l.vulnerability_code === 'string' ? idx.vulnIdByCode.get(l.vulnerability_code.toLowerCase()) : undefined;
      if (id) resolved.push({ vulnerability_id: id, type: String(l.type), ...(typeof l.notes === 'string' ? { notes: l.notes } : {}) });
      else unknown.push(String(l.vulnerability_code ?? l.vulnerability_id ?? '(none)'));
    }
    if (resolved.length === 0) missing.push(`vulnerabilities ${JSON.stringify(unknown.join(', ') || '(none given)')}`);
    else if (unknown.length) item.rationale = [item.rationale, `Unknown vulnerabilities left off: ${unknown.join(', ')}`].filter(Boolean).join(' · ');
    p.vulnerability_links = resolved;
  }

  if (missing.length) return { ...item, payload: p, status: 'unresolved', error: `Not in this Atlas: ${missing.join('; ')}` };
  return { ...item, payload: p };
}

// ── Facts the stage sees ───────────────────────────────────────────────────

const line = (s: unknown): string => String(s ?? '').replace(/\r?\n/g, ' ').trim();

export interface PackCatalogue {
  exposurePoints: Array<{ id: string; name: string }>;
  threatPaths: Array<{ id: string; name: string }>;
  vulnerabilities: Array<{ id: string; name: string }>;
  controls: Array<{ id: string; name: string }>;
}

/** The Atlas's current state for this stage, plus the pack catalogue to draw on. */
export function buildStageFacts(stage: ProposalStage, snap: AtlasExportSnapshot, pack: PackCatalogue | null): string {
  const paths = [...snap.paths].sort((a, b) => a.path.path_code.localeCompare(b.path.path_code, undefined, { numeric: true }));
  const exposures = new Map(paths.flatMap((p) => p.exposures.map((e) => [e.id, e] as const)));
  const vulns = new Map(paths.flatMap((p) => p.vulnerabilities.map((v) => [v.id, v] as const)));
  const controls = new Map(paths.flatMap((p) => p.controls.map((c) => [c.id, c] as const)));
  const out: string[] = [
    `# Risk Atlas — ${line(snap.atlas.name)}`,
    `Industry pack: ${snap.atlas.industry_pack_id ?? '—'}. Mode: ${snap.atlas.mode}. As at ${isoDay(snap.exported_at) ?? ''}.`,
    '',
    '## The business',
    line(snap.atlas.business_description) || line(snap.atlas.description) || '(no business description recorded)',
    '',
    '## Already in the Atlas',
    `- Exposure points (${exposures.size}): ${[...exposures.values()].map((e) => `${line(e.name)} [${e.id}]`).join(' · ') || 'none'}`,
    `- Threat paths (${paths.length}): ${paths.map((p) => `${p.path.path_code} ${line(p.path.name)} [${p.path.id}]`).join(' · ') || 'none'}`,
    `- Vulnerabilities (${vulns.size}): ${[...vulns.values()].map((v) => `${v.vuln_code} ${line(v.name)} (severity ${v.severity}) [${v.id}]`).join(' · ') || 'none'}`,
    `- Controls (${controls.size}): ${[...controls.values()].map((c) => `${c.control_code} ${line(c.name)} (${c.type}, ${c.strength})`).join(' · ') || 'none'}`,
    '',
  ];
  if (stage === 'inherent' || stage === 'appetite') {
    out.push('## Scores per path', '', '| Path | Name | Inherent | Controls | Residual | Appetite |', '| --- | --- | --- | --- | --- | --- |');
    for (const p of paths) {
      out.push(`| ${p.path.path_code} | ${line(p.path.name)} | ${p.inherent?.inherent_score ?? 'not scored'} | ${p.residual?.control_quality_rollup ?? '—'} | ${p.residual?.residual_score ?? 'not scored'} | ${p.appetite?.appetite_position ?? 'none'} |`);
    }
    out.push('');
  }
  if (pack) {
    out.push('## Industry pack catalogue (suggestions you may draw on — say which you used)', '');
    if (pack.exposurePoints.length) out.push(`- Pack exposures: ${pack.exposurePoints.slice(0, 60).map((e) => `${line(e.name)} [${e.id}]`).join(' · ')}`);
    if (pack.threatPaths.length) out.push(`- Pack threat paths: ${pack.threatPaths.slice(0, 60).map((p) => `${line(p.name)} [${p.id}]`).join(' · ')}`);
    if (pack.vulnerabilities.length) out.push(`- Pack vulnerabilities: ${pack.vulnerabilities.slice(0, 60).map((v) => `${line(v.name)} [${v.id}]`).join(' · ')}`);
    if (pack.controls.length) out.push(`- Pack controls: ${pack.controls.slice(0, 60).map((c) => `${line(c.name)} [${c.id}]`).join(' · ')}`);
    out.push('');
  }
  return out.join('\n');
}

/** What the stage module is told about this run, on top of its own prompt. */
export function proposalInstruction(stage: ProposalStage): string {
  const spec = STAGES[stage];
  return `

## Proposal mode — this run

You are proposing additions to an existing Risk Atlas. Every suggestion is reviewed by a person before it is written: propose what is well founded, and say why in the rationale.

- Use the ids in brackets when you refer to something already in the Atlas; refer to threat paths and vulnerabilities by their codes (TP-1, V-2).
- Do not propose anything already in the Atlas.
- Do not propose edits or removals of existing rows — they are reviewed by hand.
- Never state an inherent or residual score: the calculator computes both. Stage 4 proposes exposure, threat and vulnerability 1-5 only.
- End with the fenced \`${spec.fence}\` block, and put every suggestion in it. Prose outside the block is not read.`;
}

// ── Generate, store, decide ────────────────────────────────────────────────

export type ChatFn = (config: StreamChatConfig) => Promise<ChatResult>;

interface ProposalRow extends Omit<Proposal, 'payload' | 'created_at' | 'decided_at'> {
  payload: unknown;
  created_at: string | Date;
  decided_at: string | Date | null;
}

function rowToProposal(r: ProposalRow): Proposal {
  return {
    ...r,
    payload: (typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload ?? {}) as Record<string, unknown>,
    created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    decided_at: r.decided_at ? (r.decided_at instanceof Date ? r.decided_at.toISOString() : String(r.decided_at)) : null,
  };
}

export function createAtlasProposals(db: DatabaseAdapter, deps: { chat?: ChatFn } = {}) {
  const chat = deps.chat ?? callChat;
  const service = createAtlasService(db);
  const atlasExport = createAtlasExport(db);
  const packs = createAtlasPackLoader(db);

  async function packCatalogue(packId: string | null): Promise<PackCatalogue | null> {
    if (!packId) return null;
    try {
      const content = await packs.getPackContent(packId);
      if (!content) return null;
      const pick = (rows: unknown): Array<{ id: string; name: string }> => (Array.isArray(rows) ? rows : [])
        .map((r) => r as { id?: unknown; name?: unknown })
        .filter((r) => typeof r.id === 'string' && typeof r.name === 'string')
        .map((r) => ({ id: r.id as string, name: r.name as string }));
      return {
        exposurePoints: pick(content.exposurePoints), threatPaths: pick(content.threatPaths),
        vulnerabilities: pick(content.vulnerabilities), controls: pick(content.controls),
      };
    } catch { return null; }   // a missing pack must not stop a proposal run
  }

  async function generate(
    atlasId: string, stage: ProposalStage, userId: string | null,
    onStatus: (s: string) => void = () => undefined,
  ): Promise<{ setId: string; proposals: Proposal[] }> {
    onStatus('Reading the Risk Atlas');
    const snap = await atlasExport.buildSnapshot(atlasId, userId);
    if (!snap) throw new ProposalInputError('Atlas not found');
    const spec = STAGES[stage];
    const modulePrompt = await getModuleSystemPrompt(spec.module);
    if (!modulePrompt) throw new Error(`The ${spec.module} module prompt is missing`);
    if (snap.paths.length === 0 && stage !== 'exposures' && stage !== 'threat_paths') {
      throw new ProposalInputError('Add threat paths to the Atlas before asking for suggestions at this stage.');
    }

    onStatus(`Asking for ${spec.title.toLowerCase()}`);
    const result = await chat({
      tier: 'large',
      system: modulePrompt + proposalInstruction(stage),
      messages: [{ role: 'user', content: buildStageFacts(stage, snap, await packCatalogue(snap.atlas.industry_pack_id)) }],
      maxTokens: 12000,
      thinkingLevel: 'think_hard',
      db,
      purpose: 'atlas_proposals',
    });

    onStatus('Checking the suggestions against the Atlas');
    const block = extractFencedJson(result.text, spec.fence);
    if ('error' in block) throw new ProposalInputError(block.error);
    const idx = indexAtlas(snap);
    const items = parseDiff(stage, block.value).map((i) => resolveItem(i, idx));

    const setId = crypto.randomUUID();
    await db.run(
      `INSERT INTO atlas_proposal_sets (id, atlas_id, stage, model_served, created_by) VALUES (?, ?, ?, ?, ?)`,
      setId, atlasId, stage, result.modelServed ?? null, userId,
    );
    const proposals: Proposal[] = [];
    const now = new Date().toISOString();
    for (const item of items) {
      const id = crypto.randomUUID();
      await db.run(
        `INSERT INTO atlas_proposals (id, set_id, atlas_id, kind, payload, rationale, status, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        id, setId, atlasId, item.kind, JSON.stringify(item.payload), item.rationale, item.status, item.error ?? null,
      );
      proposals.push({
        id, set_id: setId, atlas_id: atlasId, kind: item.kind, payload: item.payload, rationale: item.rationale,
        status: item.status, applied_ref_id: null, error: item.error ?? null, decided_by: null, decided_at: null, created_at: now,
      });
    }
    return { setId, proposals };
  }

  async function list(atlasId: string, opts: { status?: ProposalStatus } = {}): Promise<Proposal[]> {
    const rows = opts.status
      ? await db.all<ProposalRow>(`SELECT * FROM atlas_proposals WHERE atlas_id = ? AND status = ? ORDER BY created_at DESC LIMIT 300`, atlasId, opts.status)
      : await db.all<ProposalRow>(`SELECT * FROM atlas_proposals WHERE atlas_id = ? ORDER BY created_at DESC LIMIT 300`, atlasId);
    return rows.map(rowToProposal);
  }

  async function get(atlasId: string, id: string): Promise<Proposal | null> {
    const row = await db.get<ProposalRow>(`SELECT * FROM atlas_proposals WHERE id = ? AND atlas_id = ?`, id, atlasId);
    return row ? rowToProposal(row) : null;
  }

  /** Apply one accepted proposal through atlas-service; returns the new row's id. */
  async function applyProposal(atlasId: string, p: Proposal, userId: string): Promise<string> {
    const v = p.payload as never;
    switch (p.kind) {
      case 'exposure':
        return (await service.addExposure(atlasId, v, userId)).id;
      case 'threat_path':
        return (await service.addThreatPath(atlasId, v, userId)).id;
      case 'vulnerability':
        return (await service.addVulnerability(atlasId, v, userId)).id;
      case 'control': {
        const control = await service.addControl(atlasId, v, userId);
        // A new control changes residuals: recalculate every path it touches.
        // The calculator decides the number — never the model.
        const linked = new Set(((p.payload.vulnerability_links as Array<{ vulnerability_id: string }> | undefined) ?? []).map((l) => l.vulnerability_id));
        const fresh = await atlasExport.buildSnapshot(atlasId, userId);
        for (const path of fresh?.paths ?? []) {
          if (path.vulnerabilities.some((vu) => linked.has(vu.id))) await service.recalculateResidualForPath(path.path.id, userId, atlasId);
        }
        return control.id;
      }
      case 'inherent_score': {
        const scores = {
          exposure: p.payload.exposure_score as Score1to5,
          threat: p.payload.threat_score as Score1to5,
          vulnerability: p.payload.vulnerability_score as Score1to5,
          // The rationale lives in its own column; scoreInherent stores it with the score.
          ...(p.rationale ? { rationale: p.rationale } : {}),
        };
        const res = await service.scoreInherent(atlasId, String(p.payload.threat_path_id), scores, userId);
        return res.inherent.id;
      }
      case 'appetite':
        return (await service.upsertAppetite(atlasId, v, userId)).id;
      case 'trigger':
        return (await service.addTrigger(atlasId, v, userId)).id;
      default:
        throw new ProposalInputError(`Unknown suggestion kind ${String(p.kind)}`);
    }
  }

  /** Expected outcomes (missing, already decided) are results, not exceptions;
   *  only a failure while applying throws. */
  async function accept(atlasId: string, id: string, userId: string): Promise<DecisionResult> {
    const p = await get(atlasId, id);
    if (!p) return { ok: false, reason: 'Suggestion not found' };
    if (p.status !== 'pending') return { ok: false, reason: `This suggestion is already ${p.status}.` };
    try {
      const ref = await applyProposal(atlasId, p, userId);
      await db.run(
        `UPDATE atlas_proposals SET status = 'accepted', applied_ref_id = ?, decided_by = ?, decided_at = NOW(), error = NULL WHERE id = ? AND status = 'pending'`,
        ref, userId, id,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await db.run(
        `UPDATE atlas_proposals SET status = 'failed', error = ?, decided_by = ?, decided_at = NOW() WHERE id = ? AND status = 'pending'`,
        message.slice(0, 500), userId, id,
      );
      throw err;
    }
    return { ok: true, proposal: (await get(atlasId, id))! };
  }

  async function reject(atlasId: string, id: string, userId: string): Promise<DecisionResult> {
    const p = await get(atlasId, id);
    if (!p) return { ok: false, reason: 'Suggestion not found' };
    if (p.status !== 'pending') return { ok: false, reason: `This suggestion is already ${p.status}.` };
    await db.run(`UPDATE atlas_proposals SET status = 'rejected', decided_by = ?, decided_at = NOW() WHERE id = ? AND status = 'pending'`, userId, id);
    return { ok: true, proposal: (await get(atlasId, id))! };
  }

  return { generate, list, get, accept, reject };
}
