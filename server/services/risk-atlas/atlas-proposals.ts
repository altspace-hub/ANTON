// ── Risk Atlas — AI proposals a person accepts or rejects ───────────────────
//
// The seven atlas-* stage prompts have always ended in a fenced JSON diff
// ("atlas_exposure_diff", "atlas_controls_diff", …) and nothing ever read one.
// Here each diff becomes a list of proposals: stored as produced, reviewed by
// a person, and applied on acceptance through the same atlas-service calls
// hand entry uses — same tenancy checks, same audit events.
//
// Three rules hold the Atlas's guarantees:
//   1. the model never sets a score the calculator owns. Stage 4 proposes
//      exposure/threat/vulnerability (1-5) and scoreInherent computes inherent;
//      residual only ever comes from recalculateResidualForPath; an appetite
//      band follows from the residual. The schemas reject inherent_score /
//      residual_score outright, and no edit may set a score.
//   2. references are resolved against the Atlas, never invented: an unknown
//      TP-/V-/C- code, id or exposure name is stored `unresolved` with the reason.
//   3. a suggestion that rewrites an existing record — a changed field, a
//      removal, new scores or a new appetite statement for a path that already
//      has them — is an `edit` or `remove`: it is decided on its own (never in
//      "accept all"), it shows the value it replaces, and it is refused if the
//      record has changed since the suggestion was made.
import crypto from 'node:crypto';
import { z } from 'zod';
import type { DatabaseAdapter } from '../../db/database.js';
import { createAtlasService, EDITABLE_FIELDS, type ChangeContext } from './atlas-service.js';
import { createAtlasExport, type AtlasExportSnapshot } from './atlas-export.js';
import { createAtlasPackLoader } from './atlas-pack-loader.js';
import { createAtlasFcpScopeService } from './atlas-fcp-scope-service.js';
import { getModuleSystemPrompt } from '../module-loader.js';
import { callChat, type ChatResult, type StreamChatConfig } from '../provider-router.js';
import { isoDay } from './atlas-bwra.js';
import { appetitePositionFor } from './atlas-residual-calculator.js';
import type {
  AppetitePosition, AtlasAppetiteStatementRow, AtlasControlRow, AtlasExposurePointRow, AtlasInherentScoreRow,
  AtlasThreatPathRow, AtlasVulnerabilityRow, FcpDomain, Score1to5,
} from './types.js';

export type ProposalStage = 'exposures' | 'threat_paths' | 'vulnerabilities' | 'inherent' | 'controls' | 'appetite';
export type ProposalKind = 'exposure' | 'threat_path' | 'vulnerability' | 'inherent_score' | 'control' | 'appetite' | 'trigger' | 'bundle';
export type ProposalAction = 'add' | 'edit' | 'remove';
export type ProposalStatus = 'pending' | 'accepted' | 'rejected' | 'skipped' | 'unresolved' | 'failed';

/** The row kinds a suggestion may change a field of, or remove. */
export type EditableKind = keyof typeof EDITABLE_FIELDS;

export interface Proposal {
  id: string;
  set_id: string;
  atlas_id: string;
  kind: ProposalKind;
  action: ProposalAction;
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
const CONTROL_STRENGTHS = ['strong', 'adequate', 'weak'] as const;

const exposureSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(4000).optional(),
  category: z.enum(EXPOSURE_CATEGORIES).optional(),
  source_pack_exposure_id: z.string().max(200).optional(),
  source: z.string().max(200).optional(),
  rationale: z.string().max(4000).optional(),
  reason: z.string().max(4000).optional(),
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
  reason: z.string().max(4000).optional(),
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
  reason: z.string().max(4000).optional(),
  severity_rationale: z.string().max(4000).optional(),
}).strict();

const inherentSchema = z.object({
  threat_path_id: z.string().optional(),
  threat_path_code: z.string().optional(),
  exposure_score: score,
  threat_score: score,
  vulnerability_score: score,
  rationale: z.string().max(4000).optional(),
  reason: z.string().max(4000).optional(),
}).strict();

const controlSchema = z.object({
  control_code: z.string().min(1).max(40),
  name: z.string().min(1).max(200),
  description: z.string().max(4000).optional(),
  type: z.enum(CONTROL_TYPES),
  strength: z.enum(CONTROL_STRENGTHS),
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
  reason: z.string().max(4000).optional(),
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
  reason: z.string().max(4000).optional(),
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
  rationale: z.string().max(4000).optional(),
  reason: z.string().max(4000).optional(),
}).strict();

// A cross-domain bundle groups existing paths from several FCP domains into one
// causal story for the board pack. The threat-path prompt has always emitted
// them; v1 dropped them without a word.
const bundleSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(4000).optional(),
  primary_domain: z.enum(FCP_DOMAINS).nullable().optional(),
  member_path_codes: z.array(z.string()).min(2).max(50),
  rationale: z.string().max(4000).optional(),
  reason: z.string().max(4000).optional(),
}).strict();

// A change or removal names its row by id (as shown in brackets), by code, or —
// for an exposure, which has no code — by name.
const target = {
  id: z.string().max(200).optional(),
  code: z.string().max(40).optional(),
  name: z.string().max(200).optional(),
};
const editSchema = z.object({
  ...target,
  field: z.string().min(1).max(60),
  new_value: z.union([z.string().max(4000), z.number(), z.null()]),
  reason: z.string().max(4000).optional(),
  rationale: z.string().max(4000).optional(),
}).strict();
const removalSchema = z.object({
  ...target,
  reason: z.string().max(4000).optional(),
  rationale: z.string().max(4000).optional(),
}).strict();

const text = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) => z.string().max(max).nullable();

/** The value each editable field may take. Keys match EDITABLE_FIELDS in atlas-service. */
export const FIELD_RULES: { [K in EditableKind]: Record<(typeof EDITABLE_FIELDS)[K][number], z.ZodTypeAny> } = {
  exposure: { name: text(200), description: optionalText(4000), category: z.enum(EXPOSURE_CATEGORIES).nullable() },
  threat_path: { name: text(200), description: optionalText(4000), fcp_domain: z.enum(FCP_DOMAINS).nullable() },
  vulnerability: { name: text(200), description: optionalText(4000), severity: score },
  control: {
    name: text(200), description: optionalText(4000), type: z.enum(CONTROL_TYPES), strength: z.enum(CONTROL_STRENGTHS),
    evidence: optionalText(4000), owner_role: optionalText(200),
  },
};

/** Fields the calculator computes — named in the refusal so the reason is plain. */
const CALCULATOR_FIELDS = new Set([
  'inherent_score', 'residual_score', 'exposure_score', 'threat_score', 'vulnerability_score',
  'control_quality_rollup', 'appetite_position',
]);

interface StageSpec {
  module: string;
  fence: string;
  /** Where the additions live in the diff, and what kind each is. */
  lists: Array<{ key: string; kind: ProposalKind; schema: z.ZodTypeAny }>;
  /** The row kind this stage may change or remove (under `edits` / `removals`). */
  editable?: EditableKind;
  title: string;
}

export const STAGES: Record<ProposalStage, StageSpec> = {
  exposures: { module: 'atlas-exposure-mapper', fence: 'atlas_exposure_diff', title: 'Stage 1 — Exposure points',
    lists: [{ key: 'additions', kind: 'exposure', schema: exposureSchema }], editable: 'exposure' },
  threat_paths: { module: 'atlas-threat-cataloguer', fence: 'atlas_threat_paths_diff', title: 'Stage 2 — Threat paths',
    lists: [{ key: 'additions', kind: 'threat_path', schema: threatPathSchema }, { key: 'cross_domain_bundles', kind: 'bundle', schema: bundleSchema }],
    editable: 'threat_path' },
  vulnerabilities: { module: 'atlas-vulnerability-assessor', fence: 'atlas_vulnerabilities_diff', title: 'Stage 3 — Vulnerabilities',
    lists: [{ key: 'additions', kind: 'vulnerability', schema: vulnerabilitySchema }], editable: 'vulnerability' },
  inherent: { module: 'atlas-inherent-scorer', fence: 'atlas_inherent_scores_diff', title: 'Stage 4 — Inherent scores',
    lists: [{ key: 'scores', kind: 'inherent_score', schema: inherentSchema }] },
  controls: { module: 'atlas-control-mapper', fence: 'atlas_controls_diff', title: 'Stage 5 — Controls',
    lists: [{ key: 'additions', kind: 'control', schema: controlSchema }], editable: 'control' },
  appetite: { module: 'atlas-appetite-manager', fence: 'atlas_appetite_diff', title: 'Stage 7 — Appetite',
    lists: [{ key: 'statements', kind: 'appetite', schema: appetiteSchema }, { key: 'escalation_triggers', kind: 'trigger', schema: triggerSchema }] },
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
  action: ProposalAction;
  payload: Record<string, unknown>;
  rationale: string | null;
  status: Extract<ProposalStatus, 'pending' | 'skipped' | 'failed' | 'unresolved'>;
  error?: string;
}

const issues = (e: z.ZodError): string => e.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ').slice(0, 500);
const joinRationale = (...parts: unknown[]): string | null =>
  parts.filter((r): r is string => typeof r === 'string' && r.trim().length > 0).join(' · ') || null;

/** A change to one field of an existing row: validated against that field's rules. */
function parseEdit(kind: EditableKind, entry: unknown): ParsedItem {
  const parsed = editSchema.safeParse(entry);
  if (!parsed.success) return { kind, action: 'edit', payload: (entry ?? {}) as Record<string, unknown>, rationale: null, status: 'failed', error: issues(parsed.error) };
  const e = parsed.data;
  const rules = FIELD_RULES[kind] as Record<string, z.ZodTypeAny>;
  const rationale = joinRationale(e.reason, e.rationale);
  const payload: Record<string, unknown> = { target_id: e.id, target_code: e.code, target_name: e.name, field: e.field, new_value: e.new_value };
  if (!Object.prototype.hasOwnProperty.call(rules, e.field)) {
    const why = CALCULATOR_FIELDS.has(e.field) ? ' — the calculator sets it' : '';
    return { kind, action: 'edit', payload, rationale, status: 'failed',
      error: `"${e.field}" cannot be changed from a suggestion${why}. Changeable: ${Object.keys(rules).join(', ')}.` };
  }
  const value = rules[e.field].safeParse(e.new_value);
  if (!value.success) return { kind, action: 'edit', payload, rationale, status: 'failed', error: `new_value: ${issues(value.error)}` };
  return { kind, action: 'edit', payload: { ...payload, new_value: value.data }, rationale, status: 'pending' };
}

function parseRemoval(kind: EditableKind, entry: unknown): ParsedItem {
  const parsed = removalSchema.safeParse(entry);
  if (!parsed.success) return { kind, action: 'remove', payload: (entry ?? {}) as Record<string, unknown>, rationale: null, status: 'failed', error: issues(parsed.error) };
  const r = parsed.data;
  return {
    kind, action: 'remove', payload: { target_id: r.id, target_code: r.code, target_name: r.name },
    rationale: joinRationale(r.reason, r.rationale), status: 'pending',
  };
}

/** Validate every list in the diff: additions, and — where the stage allows — edits and removals. */
export function parseDiff(stage: ProposalStage, diff: unknown): ParsedItem[] {
  const spec = STAGES[stage];
  const out: ParsedItem[] = [];
  const obj = (diff && typeof diff === 'object' ? diff : {}) as Record<string, unknown>;
  const listOf = (key: string): unknown[] => (Array.isArray(obj[key]) ? obj[key] as unknown[] : []);
  for (const list of spec.lists) {
    for (const entry of listOf(list.key)) {
      const parsed = list.schema.safeParse(entry);
      if (parsed.success) {
        const payload = parsed.data as Record<string, unknown>;
        // A trigger's `source` is a column (user / pack / regulatory — a CHECK in
        // the table), kept when it is one of those; anything else is a note.
        const sourceColumn = list.kind === 'trigger' && ['user', 'pack', 'regulatory'].includes(String(payload.source));
        const note = sourceColumn ? undefined : payload.source;
        const rationale = joinRationale(payload.rationale, payload.reason, payload.severity_rationale, payload.override_reason, note);
        // What is stored is what would be written: the descriptive keys the
        // stage prompts emit (source, rationale — and "reason", which a live
        // run put on every addition once edits asked for one) and the ones a
        // model may not set (approved_by) are kept out of the payload.
        for (const k of ['rationale', 'reason', 'severity_rationale', 'override_reason', 'approved_by', 'uncovered_vulnerabilities']) delete payload[k];
        if (!sourceColumn) delete payload.source;
        out.push({ kind: list.kind, action: 'add', payload, rationale, status: 'pending' });
      } else {
        out.push({ kind: list.kind, action: 'add', payload: entry as Record<string, unknown>, rationale: null, status: 'failed', error: issues(parsed.error) });
      }
    }
  }
  if (spec.editable) {
    for (const entry of listOf('edits')) out.push(parseEdit(spec.editable, entry));
    for (const entry of listOf('removals')) out.push(parseRemoval(spec.editable, entry));
  }
  return out;
}

// ── The Atlas as the proposals see it ──────────────────────────────────────
//
// Every row the Atlas holds — not only the ones linked to a threat path. The
// export snapshot hydrates paths, so an exposure accepted at Stage 1 and not yet
// on a path was invisible to Stage 2, which then dropped the model's reference
// to it as "not in this Atlas" (found 2026-09-23).

export interface AtlasInventory {
  exposures: AtlasExposurePointRow[];
  paths: AtlasThreatPathRow[];
  vulnerabilities: AtlasVulnerabilityRow[];
  controls: AtlasControlRow[];
}

/** The inventory a snapshot implies (rows linked to a path) — used when no fuller one is given. */
export function inventoryFromSnapshot(snap: AtlasExportSnapshot): AtlasInventory {
  const uniq = <T extends { id: string }>(rows: T[]): T[] => [...new Map(rows.map((r) => [r.id, r])).values()];
  return {
    exposures: uniq(snap.paths.flatMap((p) => p.exposures)),
    paths: snap.paths.map((p) => p.path),
    vulnerabilities: uniq(snap.paths.flatMap((p) => p.vulnerabilities)),
    controls: uniq(snap.paths.flatMap((p) => p.controls)),
  };
}

/** An existing cross-domain bundle, as the proposals need it. */
export interface BundleLite {
  bundle_code: string;
  name: string;
  members: Array<{ threat_path_id: string }>;
}

interface AtlasIndex {
  inv: AtlasInventory;
  rows: { [K in EditableKind]: Map<string, Record<string, unknown>> };
  idByCode: { [K in EditableKind]: Map<string, string> };
  /** Names held by exactly one exposure; a name two exposures share cannot pick a row. */
  exposureIdByName: Map<string, string>;
  ambiguousExposureNames: Set<string>;
  pathIdByCode: Map<string, string>;
  vulnIdByCode: Map<string, string>;
  /** Stored residual per path — the appetite band follows from it, not from the model. */
  residualByPathId: Map<string, Score1to5>;
  inherentByPathId: Map<string, AtlasInherentScoreRow>;
  appetiteByPathId: Map<string, AtlasAppetiteStatementRow>;
  /** Which paths each row sits on — for what a removal takes with it. */
  pathCodesByExposure: Map<string, string[]>;
  pathCodesByVuln: Map<string, string[]>;
  pathCodesByControl: Map<string, string[]>;
  /** Existing bundles: a suggestion repeating one (same name or same paths) is not added twice. */
  bundles: Array<{ code: string; name: string; memberKey: string; memberCodes: string[] }>;
}

const lower = (s: unknown): string => String(s ?? '').trim().toLowerCase();
const memberKey = (ids: string[]): string => [...new Set(ids)].sort().join('|');

export function indexAtlas(snap: AtlasExportSnapshot, inventory?: AtlasInventory, bundles: BundleLite[] = []): AtlasIndex {
  const inv = inventory ?? inventoryFromSnapshot(snap);
  const byId = <T extends { id: string }>(rows: T[]) => new Map(rows.map((r) => [r.id, r as unknown as Record<string, unknown>]));
  const push = (m: Map<string, string[]>, k: string, v: string) => m.set(k, [...(m.get(k) ?? []), v]);
  const nameCount = new Map<string, number>();
  for (const e of inv.exposures) nameCount.set(lower(e.name), (nameCount.get(lower(e.name)) ?? 0) + 1);
  const codeOfPath = new Map(inv.paths.map((p) => [p.id, p.path_code]));
  const idx: AtlasIndex = {
    inv,
    rows: { exposure: byId(inv.exposures), threat_path: byId(inv.paths), vulnerability: byId(inv.vulnerabilities), control: byId(inv.controls) },
    idByCode: {
      exposure: new Map(),
      threat_path: new Map(inv.paths.map((p) => [lower(p.path_code), p.id])),
      vulnerability: new Map(inv.vulnerabilities.map((v) => [lower(v.vuln_code), v.id])),
      control: new Map(inv.controls.map((c) => [lower(c.control_code), c.id])),
    },
    exposureIdByName: new Map(inv.exposures.filter((e) => nameCount.get(lower(e.name)) === 1).map((e) => [lower(e.name), e.id])),
    ambiguousExposureNames: new Set([...nameCount].filter(([, n]) => n > 1).map(([name]) => name)),
    pathIdByCode: new Map(), vulnIdByCode: new Map(),
    residualByPathId: new Map(), inherentByPathId: new Map(), appetiteByPathId: new Map(),
    pathCodesByExposure: new Map(), pathCodesByVuln: new Map(), pathCodesByControl: new Map(),
    bundles: bundles.map((b) => {
      const ids = b.members.map((m) => m.threat_path_id);
      return { code: b.bundle_code, name: lower(b.name), memberKey: memberKey(ids), memberCodes: ids.map((id) => codeOfPath.get(id) ?? id) };
    }),
  };
  idx.pathIdByCode = idx.idByCode.threat_path;
  idx.vulnIdByCode = idx.idByCode.vulnerability;
  for (const p of snap.paths) {
    if (p.residual?.residual_score) idx.residualByPathId.set(p.path.id, p.residual.residual_score as Score1to5);
    if (p.inherent) idx.inherentByPathId.set(p.path.id, p.inherent);
    if (p.appetite) idx.appetiteByPathId.set(p.path.id, p.appetite);
    for (const e of p.exposures) push(idx.pathCodesByExposure, e.id, p.path.path_code);
    for (const v of p.vulnerabilities) push(idx.pathCodesByVuln, v.id, p.path.path_code);
    for (const c of p.controls) push(idx.pathCodesByControl, c.id, p.path.path_code);
  }
  return idx;
}

// ── Reference resolution — against the Atlas, never invented ───────────────

const LABEL: Record<EditableKind, string> = { exposure: 'exposure', threat_path: 'threat path', vulnerability: 'vulnerability', control: 'control' };

/** The row a change or removal names, found by id, code or (exposures) name — or why it cannot be picked. */
function findTarget(kind: EditableKind, p: Record<string, unknown>, idx: AtlasIndex): Record<string, unknown> | { ambiguous: string } | undefined {
  const rows = idx.rows[kind];
  for (const key of ['target_id', 'target_code', 'target_name']) {
    const v = p[key];
    if (typeof v !== 'string' || !v.trim()) continue;
    const hit = rows.get(v) ?? rows.get(idx.idByCode[kind].get(lower(v)) ?? '')
      ?? (kind === 'exposure' ? rows.get(idx.exposureIdByName.get(lower(v)) ?? '') : undefined);
    if (hit) return hit;
    if (kind === 'exposure' && idx.ambiguousExposureNames.has(lower(v))) return { ambiguous: v };
  }
  return undefined;
}

/** A row's editable fields, normalised — what a change or removal was reviewed against. */
function editableSnapshot(kind: EditableKind, row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(EDITABLE_FIELDS[kind].map((f) => [f, normalise(row[f])]));
}

/** How a row is named to a reviewer: its code and name, or an exposure's name. */
function labelOf(kind: EditableKind, row: Record<string, unknown>): string {
  const code = row.path_code ?? row.vuln_code ?? row.control_code;
  return code ? `${String(code)} ${String(row.name ?? '')}`.trim() : String(row.name ?? row.id);
}

/** What a removal takes with it, in words — shown next to the Remove button. */
function removalImpact(kind: EditableKind, id: string, idx: AtlasIndex): string {
  const on = (codes: string[] | undefined) => (codes?.length ? codes.join(', ') : '');
  switch (kind) {
    case 'exposure': {
      const paths = on(idx.pathCodesByExposure.get(id));
      return paths ? `Its links to ${paths} go; the paths stay.` : 'It is not on any threat path.';
    }
    case 'threat_path':
      return 'The path goes with its inherent and residual scores, its appetite statement, and its links to exposures, vulnerabilities and bundles.';
    case 'vulnerability': {
      const paths = on(idx.pathCodesByVuln.get(id));
      return paths ? `It comes off ${paths}, with the control links on it; the residual of ${paths} is recalculated.` : 'It is not on any threat path.';
    }
    case 'control': {
      const paths = on(idx.pathCodesByControl.get(id));
      return paths ? `Its cover goes from ${paths}; their residuals are recalculated.` : 'It covers no vulnerability on a threat path.';
    }
  }
}

/** A stored value in the form a suggestion states it: dates as YYYY-MM-DD, numbers as numbers. */
function normalise(v: unknown): unknown {
  if (v === undefined || v === null) return null;
  if (v instanceof Date) return isoDay(v);
  if (typeof v === 'string') return v.trim() === '' ? null : v.trim();
  return v;
}
const sameValue = (a: unknown, b: unknown): boolean => {
  const x = normalise(a); const y = normalise(b);
  if (typeof x === 'number' || typeof y === 'number') return x !== null && y !== null && Number(x) === Number(y);
  return x === y;
};

/** An appetite statement's reviewable content, normalised. */
function appetiteContent(a: { appetite_position: unknown; required_action?: unknown; target_date?: unknown; budget_eur?: unknown }): Record<string, unknown> {
  return {
    appetite_position: a.appetite_position,
    required_action: normalise(a.required_action),
    target_date: normalise(a.target_date),
    budget_eur: a.budget_eur === null || a.budget_eur === undefined || a.budget_eur === '' ? null : Number(a.budget_eur),
  };
}
const sameContent = (a: Record<string, unknown>, b: Record<string, unknown>): boolean =>
  Object.keys({ ...a, ...b }).every((k) => sameValue(a[k], b[k]));

/** Turn codes/names into ids. Returns the reason when something does not exist in this Atlas. */
export function resolveItem(item: ParsedItem, idx: AtlasIndex): ParsedItem {
  if (item.status !== 'pending') return item;
  const p = { ...item.payload };
  const missing: string[] = [];
  let action = item.action;
  let rationale = item.rationale;
  const note = (s: string) => { rationale = joinRationale(rationale, s); };
  const skip = (why: string): ParsedItem => ({ ...item, action, payload: p, rationale, status: 'skipped', error: why });

  // Changes and removals of existing rows.
  if (item.action === 'edit' || item.action === 'remove') {
    const kind = item.kind as EditableKind;
    const found = findTarget(kind, p, idx);
    if (found && 'ambiguous' in found) {
      return { ...item, payload: p, status: 'unresolved', error: `More than one exposure is named ${JSON.stringify(found.ambiguous)} — the suggestion must name it by id.` };
    }
    const row = found;
    if (!row) {
      const named = p.target_id ?? p.target_code ?? p.target_name ?? '(none given)';
      return { ...item, payload: p, status: 'unresolved', error: `Not in this Atlas: ${LABEL[kind]} ${JSON.stringify(named)}` };
    }
    const id = String(row.id);
    const resolved: Record<string, unknown> = { target_id: id, target_label: labelOf(kind, row) };
    if (item.action === 'remove') {
      // What the reviewer saw: the row and what removing it takes with it. Both
      // are compared again at acceptance.
      Object.assign(resolved, { impact: removalImpact(kind, id, idx), before: editableSnapshot(kind, row) });
      return { ...item, payload: resolved, rationale };
    }
    const field = String(p.field);
    Object.assign(resolved, { field, before: normalise(row[field]), new_value: p.new_value });
    if (sameValue(row[field], p.new_value)) return { ...item, payload: resolved, rationale, status: 'skipped', error: `${resolved.target_label} already has this ${field}.` };
    // Rated strong only with recorded evidence — the rule addControl and
    // updateControl apply to the row as it would be after the change, so a
    // rename of a strong control imported without evidence fails there too.
    // Caught here so it is not a failure at acceptance.
    if (kind === 'control') {
      const strength = field === 'strength' ? p.new_value : row.strength;
      const evidence = field === 'evidence' ? p.new_value : row.evidence;
      if (strength === 'strong' && String(evidence ?? '').trim().length < 5) {
        return { ...item, payload: resolved, rationale, status: 'failed',
          error: field === 'strength'
            ? 'A control is rated strong only with recorded evidence — record the evidence first.'
            : `${String(resolved.target_label)} is rated strong without recorded evidence — record the evidence or lower the rating before changing it.` };
      }
    }
    return { ...item, payload: resolved, rationale };
  }

  const resolvePath = (): void => {
    const id = typeof p.threat_path_id === 'string' ? p.threat_path_id : undefined;
    const code = typeof p.threat_path_code === 'string' ? p.threat_path_code : undefined;
    if (id && idx.rows.threat_path.has(id)) { p.threat_path_id = id; delete p.threat_path_code; return; }
    const byCode = code ? idx.pathIdByCode.get(lower(code)) : undefined;
    if (byCode) { p.threat_path_id = byCode; delete p.threat_path_code; return; }
    missing.push(`threat path ${JSON.stringify(code ?? id ?? '(none given)')}`);
  };
  const pathLabel = (id: string): string => labelOf('threat_path', idx.rows.threat_path.get(id) ?? { id });

  if (item.kind === 'inherent_score' || item.kind === 'appetite') resolvePath();

  if (item.kind === 'inherent_score' && typeof p.threat_path_id === 'string') {
    // New scores for a path that already has them replace audited scores: an edit.
    const cur = idx.inherentByPathId.get(p.threat_path_id);
    p.target_label = pathLabel(p.threat_path_id);
    if (cur) {
      const before = { exposure_score: cur.exposure_score, threat_score: cur.threat_score, vulnerability_score: cur.vulnerability_score };
      action = 'edit';
      p.before = before;
      if (sameContent(before, { exposure_score: p.exposure_score, threat_score: p.threat_score, vulnerability_score: p.vulnerability_score })) {
        return skip(`${String(p.target_label)} is already scored this way.`);
      }
    }
  }

  if (item.kind === 'appetite' && typeof p.threat_path_id === 'string') {
    // The band follows from the residual by fixed rules (1-2 within, 3
    // boundary, 4 outside, 5 unacceptable). A model may state the action and
    // the date; it does not get to move a path into appetite.
    const residual = idx.residualByPathId.get(p.threat_path_id);
    const cur = idx.appetiteByPathId.get(p.threat_path_id);
    p.target_label = pathLabel(p.threat_path_id);
    if (residual) {
      const band = appetitePositionFor(residual);
      if (p.appetite_position !== band) {
        note(`Position set to "${band}" from the Atlas residual ${residual} (the model proposed "${String(p.appetite_position)}").`);
        p.appetite_position = band;
      }
    } else if (cur) {
      // No residual to take a band from: the recorded position stands.
      if (p.appetite_position !== cur.appetite_position) {
        note(`Position kept at "${cur.appetite_position}": ${String(p.target_label)} has no residual yet (the model proposed "${String(p.appetite_position)}").`);
        p.appetite_position = cur.appetite_position;
      }
    } else {
      return skip(`${String(p.target_label)} has no residual yet — score it first; its position follows from the residual.`);
    }
    if (cur) {
      // Replacing a recorded statement is an edit. What the suggestion leaves
      // out keeps its recorded value — accepting new wording for the action must
      // not wipe the target date.
      action = 'edit';
      const before = appetiteContent(cur);
      for (const k of ['required_action', 'target_date', 'budget_eur'] as const) if (p[k] === undefined) p[k] = before[k];
      p.before = { ...before, approved: !!cur.approved_at };
      if (sameContent(before, appetiteContent(p as { appetite_position: AppetitePosition }))) {
        return skip(`${String(p.target_label)} already has this appetite statement.`);
      }
    }
  }

  // An addition that is already in the Atlas would be a duplicate (or, for a
  // code, a database refusal at acceptance).
  if (item.kind === 'exposure' && idx.exposureIdByName.has(lower(p.name))) return skip(`An exposure named "${String(p.name)}" is already in the Atlas.`);
  if (item.kind === 'threat_path' && idx.pathIdByCode.has(lower(p.path_code))) return skip(`${String(p.path_code)} is already in the Atlas.`);
  if (item.kind === 'vulnerability' && idx.vulnIdByCode.has(lower(p.vuln_code))) return skip(`${String(p.vuln_code)} is already in the Atlas.`);
  if (item.kind === 'control' && idx.idByCode.control.has(lower(p.control_code))) return skip(`${String(p.control_code)} is already in the Atlas.`);

  if (item.kind === 'threat_path') {
    const ids = [
      ...(Array.isArray(p.exposure_ids) ? p.exposure_ids as string[] : []).filter((id) => idx.rows.exposure.has(id)),
      ...(Array.isArray(p.exposure_names) ? p.exposure_names as string[] : [])
        .map((n) => idx.exposureIdByName.get(lower(n)))
        .filter((v): v is string => !!v),
    ];
    const unknownIds = (Array.isArray(p.exposure_ids) ? p.exposure_ids as string[] : []).filter((id) => !idx.rows.exposure.has(id));
    const names = Array.isArray(p.exposure_names) ? p.exposure_names as string[] : [];
    const sharedNames = names.filter((n) => idx.ambiguousExposureNames.has(lower(n)));
    const unknownNames = names.filter((n) => !idx.exposureIdByName.has(lower(n)) && !idx.ambiguousExposureNames.has(lower(n)));
    // Unknown exposures are dropped with a note, not invented: the path is still useful.
    if (unknownIds.length || unknownNames.length) note(`Exposures not in this Atlas were left off: ${[...unknownIds, ...unknownNames].join(', ')}`);
    if (sharedNames.length) note(`Left off because more than one exposure has the name: ${sharedNames.join(', ')} — link them by hand.`);
    p.exposure_ids = [...new Set(ids)];
    delete p.exposure_names;
  }

  if (item.kind === 'vulnerability') {
    const codes = Array.isArray(p.threat_path_codes) ? p.threat_path_codes as string[] : [];
    const givenIds = Array.isArray(p.threat_path_ids) ? p.threat_path_ids as string[] : [];
    const ids = [
      ...givenIds.filter((id) => idx.rows.threat_path.has(id)),
      ...codes.map((c) => idx.pathIdByCode.get(lower(c))).filter((v): v is string => !!v),
    ];
    const unknown = [...givenIds.filter((id) => !idx.rows.threat_path.has(id)), ...codes.filter((c) => !idx.pathIdByCode.has(lower(c)))];
    if (ids.length === 0) missing.push(`threat paths ${JSON.stringify(unknown.join(', ') || '(none given)')}`);
    else if (unknown.length) note(`Unknown paths left off: ${unknown.join(', ')}`);
    p.threat_path_ids = [...new Set(ids)];
    delete p.threat_path_codes;
  }

  if (item.kind === 'control') {
    const links = Array.isArray(p.vulnerability_links) ? p.vulnerability_links as Array<Record<string, unknown>> : [];
    const resolved: Array<{ vulnerability_id: string; type: string; notes?: string }> = [];
    const unknown: string[] = [];
    for (const l of links) {
      const id = typeof l.vulnerability_id === 'string' && idx.rows.vulnerability.has(l.vulnerability_id) ? l.vulnerability_id
        : typeof l.vulnerability_code === 'string' ? idx.vulnIdByCode.get(lower(l.vulnerability_code))
        : typeof l.vulnerability_id === 'string' ? idx.vulnIdByCode.get(lower(l.vulnerability_id)) : undefined;
      if (id) resolved.push({ vulnerability_id: id, type: String(l.type), ...(typeof l.notes === 'string' ? { notes: l.notes } : {}) });
      else unknown.push(String(l.vulnerability_code ?? l.vulnerability_id ?? '(none)'));
    }
    if (resolved.length === 0) missing.push(`vulnerabilities ${JSON.stringify(unknown.join(', ') || '(none given)')}`);
    else if (unknown.length) note(`Unknown vulnerabilities left off: ${unknown.join(', ')}`);
    p.vulnerability_links = resolved;
  }

  if (item.kind === 'bundle') {
    const codes = (p.member_path_codes as string[]).map(String);
    const ids = [...new Set(codes.map((c) => idx.pathIdByCode.get(lower(c))).filter((v): v is string => !!v))];
    const unknown = codes.filter((c) => !idx.pathIdByCode.has(lower(c)));
    // A bundle is a story across paths: fewer than two known paths is not one.
    if (ids.length < 2) missing.push(`threat paths ${JSON.stringify(unknown.join(', ') || codes.join(', '))} (a bundle needs two paths already in the Atlas)`);
    else if (unknown.length) note(`Paths not in this Atlas were left out of the bundle: ${unknown.join(', ')}`);
    p.member_path_ids = ids;
    p.member_path_codes = codes.filter((c) => idx.pathIdByCode.has(lower(c)));
    // The same story told twice would show twice in the board pack.
    const same = idx.bundles.find((b) => b.name === lower(p.name) || (ids.length >= 2 && b.memberKey === memberKey(ids)));
    if (same) return skip(`${same.code} already groups ${same.memberCodes.join(', ')}${same.name === lower(p.name) ? ' under this name' : ''}.`);
  }

  if (missing.length) return { ...item, action, payload: p, rationale, status: 'unresolved', error: `Not in this Atlas: ${missing.join('; ')}` };
  return { ...item, action, payload: p, rationale };
}

// ── Facts the stage sees ───────────────────────────────────────────────────

const line = (s: unknown): string => String(s ?? '').replace(/\r?\n/g, ' ').trim();
const clip = (s: unknown, n = 200): string => { const t = line(s); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
const byCode = <T>(key: (t: T) => string) => (a: T, b: T) => key(a).localeCompare(key(b), undefined, { numeric: true });

export interface PackCatalogue {
  exposurePoints: Array<{ id: string; name: string }>;
  threatPaths: Array<{ id: string; name: string }>;
  vulnerabilities: Array<{ id: string; name: string }>;
  controls: Array<{ id: string; name: string }>;
}

/** The Atlas's current state for this stage, plus the pack catalogue to draw on. */
export function buildStageFacts(stage: ProposalStage, snap: AtlasExportSnapshot, pack: PackCatalogue | null, inventory?: AtlasInventory, bundles: BundleLite[] = []): string {
  const inv = inventory ?? inventoryFromSnapshot(snap);
  const idx = indexAtlas(snap, inv, bundles);
  const on = (codes: string[] | undefined) => (codes?.length ? `on ${codes.join(', ')}` : 'not on a threat path');
  const desc = (d: unknown) => (line(d) ? ` — ${clip(d)}` : '');
  const paths = [...snap.paths].sort(byCode((p) => p.path.path_code));
  const out: string[] = [
    `# Risk Atlas — ${line(snap.atlas.name)}`,
    `Industry pack: ${snap.atlas.industry_pack_id ?? '—'}. Mode: ${snap.atlas.mode}. As at ${isoDay(snap.exported_at) ?? ''}.`,
    '',
    '## The business',
    line(snap.atlas.business_description) || line(snap.atlas.description) || '(no business description recorded)',
    '',
    '## Already in the Atlas',
    '',
    `### Exposure points (${inv.exposures.length})`,
    ...(inv.exposures.length ? inv.exposures.map((e) => `- [${e.id}] ${line(e.name)} · ${e.category ?? 'no category'} · ${on(idx.pathCodesByExposure.get(e.id))}${desc(e.description)}`) : ['- none']),
    '',
    `### Threat paths (${inv.paths.length})`,
    ...(inv.paths.length ? [...inv.paths].sort(byCode((p) => p.path_code)).map((p) => `- ${p.path_code} [${p.id}] ${line(p.name)} · ${p.fcp_domain ?? 'no FCP domain'}${desc(p.description)}`) : ['- none']),
    '',
    `### Vulnerabilities (${inv.vulnerabilities.length})`,
    ...(inv.vulnerabilities.length ? [...inv.vulnerabilities].sort(byCode((v) => v.vuln_code)).map((v) => `- ${v.vuln_code} [${v.id}] ${line(v.name)} (severity ${v.severity}) · ${on(idx.pathCodesByVuln.get(v.id))}${desc(v.description)}`) : ['- none']),
    '',
    `### Controls (${inv.controls.length})`,
    ...(inv.controls.length ? [...inv.controls].sort(byCode((c) => c.control_code)).map((c) => `- ${c.control_code} [${c.id}] ${line(c.name)} (${c.type}, ${c.strength}) · evidence ${c.evidence && c.evidence.trim().length >= 5 ? 'recorded' : 'not recorded'} · owner ${line(c.owner_role) || 'not recorded'} · ${on(idx.pathCodesByControl.get(c.id))}${desc(c.description)}`) : ['- none']),
    '',
  ];
  if (stage === 'threat_paths') {
    out.push(`### Cross-domain bundles (${idx.bundles.length})`,
      ...(idx.bundles.length ? idx.bundles.map((b) => `- ${b.code} ${b.name} · ${b.memberCodes.join(', ')}`) : ['- none']), '');
  }
  if (stage === 'inherent' || stage === 'appetite') {
    out.push('## Scores per path', '', '| Path | Name | Exposure | Threat | Vulnerability | Inherent | Controls | Residual | Appetite | Required action | Target date |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
    for (const p of paths) {
      const i = p.inherent;
      out.push(`| ${p.path.path_code} | ${line(p.path.name)} | ${i?.exposure_score ?? '—'} | ${i?.threat_score ?? '—'} | ${i?.vulnerability_score ?? '—'} | ${i?.inherent_score ?? 'not scored'} | ${p.residual?.control_quality_rollup ?? '—'} | ${p.residual?.residual_score ?? 'not scored'} | ${p.appetite?.appetite_position ?? 'none'} | ${clip(p.appetite?.required_action, 120) || '—'} | ${isoDay(p.appetite?.target_date) ?? '—'} |`);
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
  const rows = ['## Proposal mode — this run', '',
    'You are reviewing an existing Risk Atlas and proposing changes to it. Every suggestion is reviewed by a person before anything is written: propose what is well founded, and give the reason for each.', '',
    '- Use the ids in brackets when you refer to something already in the Atlas; refer to threat paths, vulnerabilities and controls by their codes (TP-1, V-2, C-3).',
    '- Additions: do not propose anything already in the Atlas, and give a new row a code the Atlas does not use yet.'];
  if (spec.editable) {
    const fields = EDITABLE_FIELDS[spec.editable].join(', ');
    rows.push(
      `- Edits: only where a recorded field is wrong, unclear or out of date for this business. One field per edit, under "edits": {"id": "<id in brackets>", "field": "<one of: ${fields}>", "new_value": <value>, "reason": "<why>"}. Codes, links and scores cannot be edited.`,
      '- Removals: only for a row that does not apply to this business, under "removals": {"id": "<id in brackets>", "reason": "<why>"}. A removal takes the row\'s links with it.',
    );
  }
  if (stage === 'threat_paths') {
    rows.push('- Cross-domain bundles: group two or more paths ALREADY in the Atlas that form one causal story across FCP domains, under "cross_domain_bundles": {"name", "primary_domain", "member_path_codes": ["TP-1", "TP-3"], "description"}.');
  }
  if (stage === 'inherent') {
    rows.push('- A path that is already scored: propose new exposure/threat/vulnerability scores only where the recorded ones are wrong, and say why — they replace audited scores once a person accepts them.');
  }
  if (stage === 'appetite') {
    rows.push('- A path that already has a statement: propose a new one only where the recorded action, date or budget is wrong or missing, and say why. The position always follows from the residual.');
  }
  rows.push(
    '- Never state an inherent or residual score: the calculator computes both. Stage 4 proposes exposure, threat and vulnerability 1-5 only.',
    `- End with the fenced \`${spec.fence}\` block, and put every suggestion in it. Prose outside the block is not read.`,
  );
  return `\n\n${rows.join('\n')}`;
}

// ── Generate, store, decide ────────────────────────────────────────────────

export type ChatFn = (config: StreamChatConfig) => Promise<ChatResult>;

interface ProposalRow extends Omit<Proposal, 'payload' | 'created_at' | 'decided_at' | 'action'> {
  payload: unknown;
  action?: ProposalAction | null;
  created_at: string | Date;
  decided_at: string | Date | null;
}

function rowToProposal(r: ProposalRow): Proposal {
  return {
    ...r,
    action: r.action ?? 'add',
    payload: (typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload ?? {}) as Record<string, unknown>,
    created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    decided_at: r.decided_at ? (r.decided_at instanceof Date ? r.decided_at.toISOString() : String(r.decided_at)) : null,
  };
}

/** The table behind each editable kind — constants, never input. */
const TABLE: Record<EditableKind, string> = {
  exposure: 'atlas_exposure_points', threat_path: 'atlas_threat_paths', vulnerability: 'atlas_vulnerabilities', control: 'atlas_controls',
};

export function createAtlasProposals(db: DatabaseAdapter, deps: { chat?: ChatFn } = {}) {
  const chat = deps.chat ?? callChat;
  const service = createAtlasService(db);
  const atlasExport = createAtlasExport(db);
  const packs = createAtlasPackLoader(db);
  const fcp = createAtlasFcpScopeService(db);

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

  async function inventory(atlasId: string): Promise<AtlasInventory> {
    const [exposures, paths, vulnerabilities, controls] = await Promise.all([
      service.listExposures(atlasId), service.listThreatPaths(atlasId), service.listVulnerabilities(atlasId), service.listControls(atlasId),
    ]);
    return { exposures, paths, vulnerabilities, controls };
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
    const inv = await inventory(atlasId);
    const bundles: BundleLite[] = stage === 'threat_paths' ? await fcp.listBundles(atlasId) : [];

    onStatus(`Asking for ${spec.title.toLowerCase()}`);
    const result = await chat({
      tier: 'large',
      system: modulePrompt + proposalInstruction(stage),
      messages: [{ role: 'user', content: buildStageFacts(stage, snap, await packCatalogue(snap.atlas.industry_pack_id), inv, bundles) }],
      maxTokens: 12000,
      thinkingLevel: 'think_hard',
      db,
      purpose: 'atlas_proposals',
    });

    onStatus('Checking the suggestions against the Atlas');
    const block = extractFencedJson(result.text, spec.fence);
    if ('error' in block) throw new ProposalInputError(block.error);
    const idx = indexAtlas(snap, inv, bundles);
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
        `INSERT INTO atlas_proposals (id, set_id, atlas_id, kind, action, payload, rationale, status, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id, setId, atlasId, item.kind, item.action, JSON.stringify(item.payload), item.rationale, item.status, item.error ?? null,
      );
      proposals.push({
        id, set_id: setId, atlas_id: atlasId, kind: item.kind, action: item.action, payload: item.payload, rationale: item.rationale,
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

  async function currentRow(kind: EditableKind, atlasId: string, id: string): Promise<Record<string, unknown> | undefined> {
    return db.get<Record<string, unknown>>(`SELECT * FROM ${TABLE[kind]} WHERE id = ? AND atlas_id = ?`, id, atlasId);
  }

  /** Whether every id is a row of this Atlas in `table` (a constant, never input). */
  async function allInAtlas(table: string, atlasId: string, ids: string[]): Promise<boolean> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return true;
    const rows = await db.all<{ id: string }>(
      `SELECT id FROM ${table} WHERE atlas_id = ? AND id IN (${unique.map(() => '?').join(',')})`, atlasId, ...unique,
    );
    return rows.length === unique.length;
  }

  async function codeTaken(table: string, column: string, atlasId: string, code: unknown): Promise<boolean> {
    return !!(await db.get(`SELECT id FROM ${table} WHERE atlas_id = ? AND LOWER(TRIM(${column})) = ?`, atlasId, lower(code)));
  }

  /**
   * Why this suggestion no longer fits the Atlas, or null when it still does.
   * Every suggestion was reviewed against the Atlas as it was when it was made.
   * If the rows it changes, removes or links to have moved on since, applying
   * it would write something the reviewer never saw — so it is set aside and
   * the reviewer asks again.
   */
  async function staleReason(atlasId: string, p: Proposal, userId: string): Promise<string | null> {
    const v = p.payload;
    const label = String(v.target_label ?? v.target_id ?? v.name ?? v.path_code ?? v.vuln_code ?? v.control_code ?? '');
    const askAgain = 'has changed since this suggestion was made — ask again';

    if ((p.action === 'edit' || p.action === 'remove') && p.kind in TABLE) {
      const kind = p.kind as EditableKind;
      const row = await currentRow(kind, atlasId, String(v.target_id));
      if (!row) return `${label} is no longer in the Atlas.`;
      if (p.action === 'edit') {
        return sameValue(row[String(v.field)], v.before) ? null : `The ${String(v.field)} of ${label} ${askAgain}, or change it by hand.`;
      }
      const before = v.before as Record<string, unknown> | undefined;
      if (before && !sameContent(before, editableSnapshot(kind, row))) return `${label} ${askAgain}, or remove it by hand.`;
      // What the removal takes with it (links, the paths rescored) was part of what was accepted.
      const snap = await atlasExport.buildSnapshot(atlasId, userId);
      if (snap && typeof v.impact === 'string') {
        const now = removalImpact(kind, String(v.target_id), indexAtlas(snap, await inventory(atlasId), await fcp.listBundles(atlasId)));
        if (now !== v.impact) return `What removing ${label} takes with it ${askAgain}.`;
      }
      return null;
    }

    if (p.action === 'add') {
      const gone = (what: string) => `${what} is no longer in the Atlas — ask again.`;
      switch (p.kind) {
        case 'exposure':
          if (await db.get(`SELECT id FROM atlas_exposure_points WHERE atlas_id = ? AND LOWER(TRIM(name)) = ?`, atlasId, lower(v.name))) {
            return `An exposure named "${String(v.name)}" has been added since this suggestion was made.`;
          }
          return null;
        case 'threat_path':
          if (await codeTaken('atlas_threat_paths', 'path_code', atlasId, v.path_code)) return `${String(v.path_code)} has been added since this suggestion was made.`;
          return (await allInAtlas('atlas_exposure_points', atlasId, (v.exposure_ids as string[] | undefined) ?? [])) ? null : gone('An exposure this path links to');
        case 'vulnerability':
          if (await codeTaken('atlas_vulnerabilities', 'vuln_code', atlasId, v.vuln_code)) return `${String(v.vuln_code)} has been added since this suggestion was made.`;
          return (await allInAtlas('atlas_threat_paths', atlasId, (v.threat_path_ids as string[] | undefined) ?? [])) ? null : gone('A threat path this vulnerability sits on');
        case 'control':
          if (await codeTaken('atlas_controls', 'control_code', atlasId, v.control_code)) return `${String(v.control_code)} has been added since this suggestion was made.`;
          return (await allInAtlas('atlas_vulnerabilities', atlasId, ((v.vulnerability_links as Array<{ vulnerability_id: string }> | undefined) ?? []).map((l) => l.vulnerability_id)))
            ? null : gone('A vulnerability this control covers');
        case 'bundle':
          return (await allInAtlas('atlas_threat_paths', atlasId, (v.member_path_ids as string[] | undefined) ?? [])) ? null : gone('A threat path in this bundle');
        default:
          break;
      }
    }

    if (p.kind === 'inherent_score' || p.kind === 'appetite') {
      if (!(await allInAtlas('atlas_threat_paths', atlasId, [String(v.threat_path_id)]))) return `${label} is no longer in the Atlas.`;
    }

    if (p.kind === 'inherent_score') {
      const cur = await db.get<AtlasInherentScoreRow>(
        `SELECT s.* FROM atlas_inherent_scores s JOIN atlas_threat_paths tp ON tp.id = s.threat_path_id WHERE s.threat_path_id = ? AND tp.atlas_id = ?`,
        String(v.threat_path_id), atlasId,
      );
      const before = v.before as Record<string, unknown> | undefined;
      if (!before && cur) return `${label} has been scored since this suggestion was made — ask again to compare.`;
      if (before && (!cur || !sameContent(before, { exposure_score: cur.exposure_score, threat_score: cur.threat_score, vulnerability_score: cur.vulnerability_score }))) {
        return `The scores of ${label} ${askAgain}, or score it by hand.`;
      }
      return null;
    }

    if (p.kind === 'appetite') {
      // The position is the band of the residual — as it is now, not as it was.
      const residual = await db.get<{ residual_score: number }>(
        `SELECT r.residual_score FROM atlas_residual_scores r JOIN atlas_threat_paths tp ON tp.id = r.threat_path_id WHERE r.threat_path_id = ? AND tp.atlas_id = ?`,
        String(v.threat_path_id), atlasId,
      );
      if (residual && appetitePositionFor(residual.residual_score as Score1to5) !== v.appetite_position) {
        return `The residual of ${label} ${askAgain}, or set the appetite by hand.`;
      }
      const cur = await db.get<AtlasAppetiteStatementRow>(
        `SELECT * FROM atlas_appetite_statements WHERE atlas_id = ? AND threat_path_id = ?`, atlasId, String(v.threat_path_id),
      );
      const before = v.before as Record<string, unknown> | undefined;
      if (!before && cur) return `${label} has an appetite statement since this suggestion was made — ask again to compare.`;
      if (before) {
        const { approved, ...content } = before;
        if (!cur || !sameContent(content, appetiteContent(cur))) return `The appetite statement of ${label} ${askAgain}, or change it by hand.`;
        // Approved (or un-approved) since: the reviewer did not see what accepting would withdraw.
        if (!!approved !== !!cur.approved_at) return `The approval of the appetite statement of ${label} ${askAgain}.`;
      }
      return null;
    }
    return null;
  }

  async function nextBundleCode(atlasId: string): Promise<string> {
    const used = new Set((await fcp.listBundles(atlasId)).map((b) => b.bundle_code.toUpperCase()));
    let n = used.size + 1;
    while (used.has(`XB-${n}`)) n++;
    return `XB-${n}`;
  }

  /** Apply one accepted proposal through atlas-service; returns the id of the row it created or changed. */
  async function applyProposal(atlasId: string, p: Proposal, userId: string): Promise<string> {
    const v = p.payload as never;
    // Every write records where it came from, in the Atlas's own audit ledger.
    const ctx: ChangeContext = { source: 'ai_suggestion', proposal_id: p.id, ...(p.rationale ? { reason: p.rationale } : {}) };

    if (p.action === 'remove' && p.kind in TABLE) {
      const id = String(p.payload.target_id);
      switch (p.kind as EditableKind) {
        case 'exposure': await service.removeExposure(atlasId, id, userId, ctx); break;
        case 'threat_path': await service.removeThreatPath(atlasId, id, userId, ctx); break;
        case 'vulnerability': await service.removeVulnerability(atlasId, id, userId, ctx); break;
        case 'control': await service.removeControl(atlasId, id, userId, ctx); break;
      }
      return id;
    }
    if (p.action === 'edit' && p.kind in TABLE) {
      const id = String(p.payload.target_id);
      const change = { [String(p.payload.field)]: p.payload.new_value };
      switch (p.kind as EditableKind) {
        case 'exposure': await service.updateExposure(atlasId, id, change, userId, ctx); break;
        case 'threat_path': await service.updateThreatPath(atlasId, id, change, userId, ctx); break;
        case 'vulnerability': await service.updateVulnerability(atlasId, id, change, userId, ctx); break;
        case 'control': await service.updateControl(atlasId, id, change, userId, ctx); break;
      }
      return id;
    }

    switch (p.kind) {
      case 'exposure':
        return (await service.addExposure(atlasId, v, userId, ctx)).id;
      case 'threat_path':
        return (await service.addThreatPath(atlasId, v, userId, ctx)).id;
      case 'vulnerability':
        return (await service.addVulnerability(atlasId, v, userId, ctx)).id;
      case 'control':
        // addControl rescores every path the control covers — the calculator
        // decides the number, never the model.
        return (await service.addControl(atlasId, v, userId, ctx)).id;
      case 'inherent_score': {
        const scores = {
          exposure: p.payload.exposure_score as Score1to5,
          threat: p.payload.threat_score as Score1to5,
          vulnerability: p.payload.vulnerability_score as Score1to5,
          // The rationale lives in its own column; scoreInherent stores it with the score.
          ...(p.rationale ? { rationale: p.rationale } : {}),
        };
        const res = await service.scoreInherent(atlasId, String(p.payload.threat_path_id), scores, userId, ctx);
        return res.inherent.id;
      }
      case 'appetite': {
        const a = p.payload;
        return (await service.upsertAppetite(atlasId, {
          threat_path_id: String(a.threat_path_id),
          appetite_position: a.appetite_position as AppetitePosition,
          required_action: (a.required_action as string | null | undefined) ?? undefined,
          target_date: (a.target_date as string | null | undefined) ?? null,
          budget_eur: (a.budget_eur as number | null | undefined) ?? null,
        }, userId, ctx)).id;
      }
      case 'trigger':
        return (await service.addTrigger(atlasId, v, userId, ctx)).id;
      case 'bundle': {
        const b = p.payload;
        const created = await fcp.createBundle(atlasId, {
          bundle_code: await nextBundleCode(atlasId),
          name: String(b.name),
          description: typeof b.description === 'string' ? b.description : undefined,
          primary_domain: (b.primary_domain as FcpDomain | null | undefined) ?? undefined,
          member_path_ids: b.member_path_ids as string[],
        }, userId, ctx);
        return String(created.id);
      }
      default:
        throw new ProposalInputError(`Unknown suggestion kind ${String(p.kind)}`);
    }
  }

  /**
   * Expected outcomes (missing, already decided, out of date, not allowed in
   * bulk) are results, not exceptions; only a failure while applying throws.
   * A change or removal is never applied in bulk: each rewrites an audited
   * record and is decided on its own.
   *
   * The suggestion is claimed (pending → accepted, in one conditional UPDATE)
   * before anything is written, so two reviewers — or "Add all" and a single
   * Add — cannot both apply it.
   */
  async function accept(atlasId: string, id: string, userId: string, opts: { bulk?: boolean } = {}): Promise<DecisionResult> {
    const p = await get(atlasId, id);
    if (!p) return { ok: false, reason: 'Suggestion not found' };
    if (p.status !== 'pending') return { ok: false, reason: `This suggestion is already ${p.status}.` };
    if (opts.bulk && p.action !== 'add') return { ok: false, reason: 'Changes and removals are decided one at a time.' };
    const stale = await staleReason(atlasId, p, userId);
    if (stale) {
      await db.run(
        `UPDATE atlas_proposals SET status = 'skipped', error = ?, decided_by = ?, decided_at = NOW() WHERE id = ? AND atlas_id = ? AND status = 'pending'`,
        stale, userId, id, atlasId,
      );
      return { ok: false, reason: stale };
    }
    const claimed = await db.run(
      `UPDATE atlas_proposals SET status = 'accepted', decided_by = ?, decided_at = NOW(), error = NULL WHERE id = ? AND atlas_id = ? AND status = 'pending'`,
      userId, id, atlasId,
    );
    if (!claimed.changes) {
      const now = await get(atlasId, id);
      return { ok: false, reason: `This suggestion is already ${now?.status ?? 'decided'}.` };
    }
    try {
      const ref = await applyProposal(atlasId, p, userId);
      await db.run(`UPDATE atlas_proposals SET applied_ref_id = ? WHERE id = ? AND atlas_id = ?`, ref, id, atlasId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await db.run(
        `UPDATE atlas_proposals SET status = 'failed', error = ? WHERE id = ? AND atlas_id = ?`,
        message.slice(0, 500), id, atlasId,
      );
      throw err;
    }
    return { ok: true, proposal: (await get(atlasId, id))! };
  }

  async function reject(atlasId: string, id: string, userId: string): Promise<DecisionResult> {
    const p = await get(atlasId, id);
    if (!p) return { ok: false, reason: 'Suggestion not found' };
    if (p.status !== 'pending') return { ok: false, reason: `This suggestion is already ${p.status}.` };
    const done = await db.run(
      `UPDATE atlas_proposals SET status = 'rejected', decided_by = ?, decided_at = NOW() WHERE id = ? AND atlas_id = ? AND status = 'pending'`,
      userId, id, atlasId,
    );
    if (!done.changes) return { ok: false, reason: `This suggestion is already ${(await get(atlasId, id))?.status ?? 'decided'}.` };
    return { ok: true, proposal: (await get(atlasId, id))! };
  }

  return { generate, list, get, accept, reject };
}
