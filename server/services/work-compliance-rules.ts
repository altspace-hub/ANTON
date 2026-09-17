/**
 * work-compliance-rules.ts — the Work-output rules (category 'work') and the
 * context a completed module run is evaluated in.
 *
 * Seven rules over the answer a module run produced, expressed in the engine's
 * rule_logic format (compliance-rules.ts) so they are inspectable and editable
 * in Compliance-as-Code like any other rule:
 *
 *   WORK-001  provenance section present when the run promised one
 *   WORK-002  no placeholders (TODO / TBD / [insert / lorem ipsum / XXX)
 *   WORK-003  at least one article / section / regulation reference in a regulated area
 *   WORK-004  output length floor for deliverables (quick briefings exempt)
 *   WORK-005  the model used is on the allow-list, when an allow-list exists
 *   WORK-006  a percentage or amount with no verification marker in its section
 *   WORK-007  no API key / IBAN-like / private-key material in the output
 *
 * `ensureWorkComplianceRules(db)` seeds them at boot, idempotently: a rule that
 * exists is left alone unless its seed text changed, and `active` /
 * `auto_remediate` — the operator's toggles — are never written back.
 */
import type { DatabaseAdapter } from '../db/database.js';
import type { ComplianceSeverity, RuleContext, RuleLogic } from './compliance-rules.js';
import { capabilityModelId } from './engine-model-id.js';

export const WORK_RULE_CATEGORY = 'work';

/** Areas where an answer without a single citable reference is a finding. */
export const REGULATED_AREAS: readonly string[] = ['fcp', 'legal', 'tax', 'data-privacy', 'payments-dora'];

/** Output length floor for a deliverable (chars). */
export const WORK_MIN_DELIVERABLE_CHARS = 400;

/** Module ids that produce a short form by design — exempt from the length floor. */
const QUICK_MODULE_RE = /(^|-)(quick|brief|briefing|snapshot|tldr|one-liner)(-|$)/i;

export interface WorkRuleSeed {
  rule_code: string;
  title: string;
  description: string;
  severity: ComplianceSeverity;
  regulatory_source: string | null;
  rule_logic: RuleLogic;
  remediation_steps: string[];
}

const PROVENANCE_HEADING =
  String.raw`^[ \t]*(?:#{1,6}[ \t]*|\*\*)[^\n]*\b(sources?|assumptions?|provenance|limitations|not[ \t]+(?:been[ \t]+)?(?:checked|verified))\b`;

const PLACEHOLDER =
  String.raw`\b(?:TODO|TBD|FIXME|XXX)\b|\[[Ii]nsert\b|\b[Ll]orem [Ii]psum\b|\[(?:[Pp]laceholder|[Tt]o be (?:confirmed|determined|added|completed))\]`;

const CITATION =
  String.raw`\bArt(?:icles?|\.)?[ \t]*\d+[a-z]?\b` +
  String.raw`|§[ \t]*\d+` +
  String.raw`|\bSections?[ \t]+\d+` +
  String.raw`|\b(?:Regulation|Directive|Decision)[ \t]*\(?(?:EU|EC|EEC)\)?[ \t]*(?:No\.?[ \t]*)?\d{1,4}/\d{2,4}` +
  String.raw`|\b(?:EU|EC)\)?[ \t]*\d{4}/\d{1,4}\b` +
  String.raw`|\bRecital[ \t]+\d+` +
  String.raw`|\bChapter[ \t]+\d+` +
  String.raw`|\bPara(?:graph)?\.?[ \t]*\d+` +
  String.raw`|\bRule[ \t]+\d+(?:\.\d+)*\b` +
  String.raw`|\b\d+[ \t]*U\.?S\.?C\.?[ \t]*§?[ \t]*\d+` +
  String.raw`|\bC\.?F\.?R\.?[ \t]*(?:§|Part)?[ \t]*\d+` +
  String.raw`|\b(?:AMLR|AMLD\d?|DORA|GDPR|MiCA|PSD[23]|MiFID[ \t]*II|CRR|CRD[ \t]*[IVX]+|FATF|BSA|OFAC|CCPA|HIPAA|SOX|ISO[ \t]*\d{4,5})\b`;

const MAGNITUDE = String.raw`(?:[ \t]?(?:k|m|bn|million|billion)\b)?`;

const FIGURE =
  String.raw`[€$£¥][ \t]?\d[\d,.]*` + MAGNITUDE +
  String.raw`|\b(?:EUR|USD|GBP|SEK|NOK|DKK|CHF)[ \t]?\d[\d,.]*` + MAGNITUDE +
  String.raw`|\b\d[\d,.]*[ \t]?(?:%|percent\b|per cent\b|bps\b|basis points\b|EUR\b|USD\b|GBP\b|SEK\b|NOK\b|DKK\b|CHF\b)`;

const FIGURE_MARKER =
  String.raw`not[ \t]+(?:yet[ \t]+)?verified|unverified|assumption|assumed|estimate|illustrative|indicative|hypothetical|source:|\bsources?\b|according to|\[\d+\]|\(\d{4}\)|https?://`;

const SECRET =
  String.raw`sk-ant-[A-Za-z0-9_-]{20,}` +
  String.raw`|\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}` +
  String.raw`|\bAKIA[0-9A-Z]{16}\b` +
  String.raw`|\bgh[pousr]_[A-Za-z0-9]{36,}\b` +
  String.raw`|\bxox[abprs]-[A-Za-z0-9-]{10,}` +
  String.raw`|\bAIza[0-9A-Za-z_-]{35}\b` +
  String.raw`|-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----` +
  String.raw`|\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}` +
  String.raw`|\b[A-Z]{2}\d{2}[A-Z0-9]{4}(?:[ \t]?[A-Z0-9]{4}){2,6}(?:[ \t]?[A-Z0-9]{1,4})?\b`;

export const WORK_COMPLIANCE_RULES: readonly WorkRuleSeed[] = [
  {
    rule_code: 'WORK-001',
    title: 'Provenance section present',
    description: 'A run that composed the provenance contract (layer 7) must end with a "Sources, assumptions and what was not checked" section, or an equivalent sources / assumptions / limitations heading.',
    severity: 'medium',
    regulatory_source: 'ANTON explainability contract (layer 7); EU AI Act 2024/1689 Art. 13',
    rule_logic: {
      type: 'required_pattern',
      when: { field: 'provenanceContract', equals: true },
      config: {
        field: 'text',
        pattern: PROVENANCE_HEADING,
        flags: 'im',
        description: 'No "Sources, assumptions and what was not checked" section in an output that promised one',
      },
    },
    remediation_steps: [
      'Re-run the module, or ask a follow-up for the sources, assumptions and unchecked items.',
      'If the output format legitimately has no closing section, mark the violation a false positive.',
    ],
  },
  {
    rule_code: 'WORK-002',
    title: 'No placeholders in the deliverable',
    description: 'The output contains TODO / TBD / FIXME / XXX, an "[insert …]" bracket, "lorem ipsum" or a "[placeholder]" marker — text that was meant to be filled in before delivery.',
    severity: 'medium',
    regulatory_source: null,
    rule_logic: {
      type: 'pattern',
      config: {
        field: 'text',
        pattern: PLACEHOLDER,
        flags: 'g',
        description: 'Placeholder left in the output',
        maxFindings: 10,
      },
    },
    remediation_steps: [
      'Fill in or remove each placeholder before the deliverable leaves ANTON.',
      'If the module inputs were incomplete, supply them and re-run.',
    ],
  },
  {
    rule_code: 'WORK-003',
    title: 'Citation present in a regulated area',
    description: 'An answer in fcp, legal, tax, data-privacy or payments-dora must reference at least one article, section, paragraph or named regulation.',
    severity: 'medium',
    regulatory_source: 'Professional standards for regulated advice; EU AI Act 2024/1689 Art. 13',
    rule_logic: {
      type: 'required_pattern',
      when: { field: 'regulatedArea', equals: true },
      config: {
        field: 'text',
        pattern: CITATION,
        flags: 'i',
        description: 'No article, section or regulation reference in a regulated-area output',
      },
    },
    remediation_steps: [
      'Ask for the legal basis: which article, section or regulation each finding rests on.',
      'Attach the regulation or a knowledge pack and re-run with Local / Combined knowledge sources.',
    ],
  },
  {
    rule_code: 'WORK-004',
    title: 'Deliverable length floor',
    description: `A deliverable shorter than ${WORK_MIN_DELIVERABLE_CHARS} characters is usually a truncated or refused run. Quick briefings and short-form modules are exempt.`,
    severity: 'low',
    regulatory_source: null,
    rule_logic: {
      type: 'threshold',
      when: { field: 'quickBriefing', equals: false },
      config: {
        field: 'textLength',
        operator: '<',
        threshold: WORK_MIN_DELIVERABLE_CHARS,
        description: 'Output length (chars)',
      },
    },
    remediation_steps: [
      'Check the run for a truncated stream or a refusal, then re-run.',
      'If the short answer was intended, select the Quick Briefing format so the rule does not apply.',
    ],
  },
  {
    rule_code: 'WORK-005',
    title: 'Model on the allow-list',
    description: 'When the instance carries model allow-list entries (Compliance policy → allow-list, global or for this user), the model that produced the answer must be one of them.',
    severity: 'high',
    regulatory_source: 'MGOV-02 model governance policy',
    rule_logic: {
      type: 'allowlist',
      config: { field: 'model', listField: 'allowedModels', altField: 'modelBare' },
    },
    remediation_steps: [
      'Re-run on a permitted model, or have an administrator add this model to the allow-list.',
      'Review how the session selected a model outside the policy (session override, area default).',
    ],
  },
  {
    rule_code: 'WORK-006',
    title: 'Figure without a verification marker',
    description: 'A percentage or currency amount appears in a section that carries no "not verified", "assumption", "estimate" or "source:" marker. The number may be fine; the reader cannot tell.',
    severity: 'low',
    regulatory_source: null,
    rule_logic: {
      type: 'section_pattern',
      config: {
        field: 'text',
        pattern: FIGURE,
        flags: 'i',
        unless: FIGURE_MARKER,
        unlessFlags: 'i',
        description: 'Figure with no verification marker',
        maxFindings: 10,
      },
    },
    remediation_steps: [
      'Label each figure: its source, or that it is an assumption or an estimate.',
      'Mark accepted risk if the figures are the client\'s own inputs.',
    ],
  },
  {
    rule_code: 'WORK-007',
    title: 'No secret or account identifier in the output',
    description: 'The output contains what looks like an API key, an access token, a private key block, a JWT or an IBAN. Findings are redacted; the violation record never carries the value.',
    severity: 'high',
    regulatory_source: 'GDPR 2016/679 Art. 32; PCI DSS v4 req. 3',
    rule_logic: {
      type: 'pattern',
      config: {
        field: 'text',
        pattern: SECRET,
        flags: 'g',
        redact: true,
        description: 'Possible secret or account identifier in the output',
        maxFindings: 5,
      },
    },
    remediation_steps: [
      'Remove the value from the deliverable and from any uploaded source that carried it.',
      'If a real credential was exposed, rotate it now.',
      'If it is a public test IBAN or a documented example key, mark the violation a false positive.',
    ],
  },
];

export const WORK_RULE_CODES: readonly string[] = WORK_COMPLIANCE_RULES.map((r) => r.rule_code);

// ── Evaluation context ───────────────────────────────────────────────────────

export interface WorkRunInput {
  sessionId: string;
  messageId: string;
  moduleId: string | null;
  areaId: string | null;
  model: string;
  text: string;
  provenanceContract: boolean;
  /** Output formats selected for the run, when the caller knows them. */
  outputFormats?: string[];
  /** Model ids permitted for this run (global + user allow-list rows). Empty = no policy. */
  allowedModels?: string[];
}

/** The context the Work rules read. Derived fields are computed here, once, so the rules stay declarative. */
export function buildWorkRuleContext(input: WorkRunInput): RuleContext {
  const outputFormats = input.outputFormats ?? [];
  const moduleId = input.moduleId ?? null;
  return {
    sessionId: input.sessionId,
    messageId: input.messageId,
    moduleId,
    areaId: input.areaId ?? null,
    model: input.model,
    modelBare: capabilityModelId(input.model),
    text: input.text,
    textLength: input.text.length,
    provenanceContract: input.provenanceContract === true,
    regulatedArea: REGULATED_AREAS.includes(input.areaId ?? ''),
    quickBriefing: outputFormats.includes('quick-briefing') || QUICK_MODULE_RE.test(moduleId ?? ''),
    outputFormats,
    allowedModels: input.allowedModels ?? [],
  };
}

/** What is persisted per execution: ids and derived facts, never the output text. */
export function buildWorkRecordContext(context: RuleContext): Record<string, unknown> {
  const { text: _text, outputFormats: _formats, allowedModels, ...rest } = context;
  void _text; void _formats;
  return {
    trigger: 'completion',
    ...rest,
    allowedModelCount: Array.isArray(allowedModels) ? allowedModels.length : 0,
  };
}

// ── Seeding ──────────────────────────────────────────────────────────────────

export const WORK_RULES_SQL = {
  existing: "SELECT id, rule_code, title, description, severity, regulatory_source, rule_logic, remediation_steps FROM compliance_rules WHERE rule_code LIKE 'WORK-%'",
  insert: `INSERT INTO compliance_rules (rule_code, title, description, category, severity, regulatory_source, rule_logic, active, auto_remediate, remediation_steps)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0, ?)
           ON CONFLICT (rule_code) DO NOTHING`,
  update: `UPDATE compliance_rules
              SET title = ?, description = ?, severity = ?, regulatory_source = ?, rule_logic = ?, remediation_steps = ?, updated_at = CURRENT_TIMESTAMP
            WHERE rule_code = ?`,
} as const;

interface ExistingRuleRow {
  id: number;
  rule_code: string;
  title: string;
  description: string | null;
  severity: string;
  regulatory_source: string | null;
  rule_logic: string;
  remediation_steps: string | null;
}

export interface EnsureWorkRulesResult {
  inserted: number;
  updated: number;
  unchanged: number;
  /** Set when seeding could not run (e.g. migration 278 not applied). Never thrown. */
  error?: string;
}

function seedColumns(seed: WorkRuleSeed): { logic: string; steps: string } {
  return { logic: JSON.stringify(seed.rule_logic), steps: JSON.stringify(seed.remediation_steps) };
}

/**
 * Seed the Work rules; safe to call at every boot. Existing rows are updated
 * only when the seed's text or logic changed; `active` and `auto_remediate`
 * belong to the operator and are not touched.
 */
export async function ensureWorkComplianceRules(db: DatabaseAdapter): Promise<EnsureWorkRulesResult> {
  const result: EnsureWorkRulesResult = { inserted: 0, updated: 0, unchanged: 0 };
  try {
    const existing = await db.all<ExistingRuleRow>(WORK_RULES_SQL.existing);
    const byCode = new Map(existing.map((r) => [r.rule_code, r]));

    for (const seed of WORK_COMPLIANCE_RULES) {
      const { logic, steps } = seedColumns(seed);
      const row = byCode.get(seed.rule_code);
      if (!row) {
        const ins = await db.run(
          WORK_RULES_SQL.insert,
          seed.rule_code, seed.title, seed.description, WORK_RULE_CATEGORY, seed.severity,
          seed.regulatory_source, logic, steps,
        );
        if (Number(ins.changes) > 0) result.inserted += 1; else result.unchanged += 1;
        continue;
      }
      const same =
        row.title === seed.title &&
        (row.description ?? '') === seed.description &&
        row.severity === seed.severity &&
        (row.regulatory_source ?? null) === seed.regulatory_source &&
        row.rule_logic === logic &&
        (row.remediation_steps ?? '') === steps;
      if (same) { result.unchanged += 1; continue; }
      await db.run(
        WORK_RULES_SQL.update,
        seed.title, seed.description, seed.severity, seed.regulatory_source, logic, steps, seed.rule_code,
      );
      result.updated += 1;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    result.error = message;
    console.warn(`[compliance] Work rules not seeded (${message}). The 'work' category needs migration 278.`);
  }
  return result;
}
