/**
 * compliance-rules.ts — the Compliance-as-Code engine behind routes/compliance.ts.
 *
 * Rules live in `compliance_rules` with a JSON `rule_logic`; the evaluators here
 * are pure functions over a context object, so a rule can be exercised in a unit
 * test without a database and the persisted execution is only the record of what
 * the pure evaluation said.
 *
 * Rule kinds (`rule_logic.type`):
 *   threshold        — numeric field compared with an operator against a threshold
 *   pattern          — regex must NOT match a string field (each match is a finding)
 *   required_pattern — regex MUST match a string field (absence is the finding)
 *   section_pattern  — per markdown section: `pattern` matches but `unless` does not
 *   lookup           — value must be in `allowedValues` / not in `forbiddenValues`
 *   allowlist        — value must be in a LIST CARRIED BY THE CONTEXT (empty list = pass)
 *   composite        — AND / OR over sub-rules
 *
 * Every kind takes an optional `when` precondition; a rule whose precondition does
 * not hold passes with no findings ("not applicable"), so one rule can say "for
 * regulated areas only" or "only when the run promised a provenance section".
 *
 * Wave 6 track E (2026-09-17): until this change the engine had no caller except
 * the manual execute-all route and rule_executions had never had a row. The Work
 * rules (work-compliance-rules.ts) run on every completed module run through
 * compliance-on-completion.ts.
 */
import type { DatabaseAdapter } from '../db/database.js';

import { emitInternalEvent } from './event-emitter.js';

export type ComplianceCategory =
  | 'kyc' | 'transaction_monitoring' | 'sanctions' | 'reporting' | 'governance'
  | 'data_quality' | 'operational' | 'work';

export type ComplianceSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface ComplianceRule {
  id: number;
  rule_code: string;
  title: string;
  description: string;
  category: ComplianceCategory;
  severity: ComplianceSeverity;
  regulatory_source: string | null;
  rule_logic: string; // JSON
  active: number;
  auto_remediate: number;
  remediation_steps: string | null; // JSON
  created_at: string;
  updated_at: string;
}

export interface RuleExecution {
  id: number;
  rule_id: number;
  execution_context: string; // JSON
  result: 'pass' | 'fail' | 'warning' | 'error';
  findings: string | null; // JSON
  auto_remediated: number;
  executed_at: string;
}

export interface RuleViolation {
  id: number;
  rule_id: number;
  execution_id: number;
  severity: string;
  description: string;
  affected_entity: string;
  remediation_status: 'open' | 'remediated' | 'accepted_risk' | 'false_positive';
  remediated_at: string | null;
  remediated_by: string | null;
  notes: string | null;
  created_at: string;
}

// ── Rule logic (the JSON in compliance_rules.rule_logic) ─────────────────────

export type RuleContext = Record<string, unknown>;

export interface RuleFinding {
  description: string;
  /** What the finding is about; the caller may override it per execution. */
  entity?: string;
}

export type RuleOutcome = 'pass' | 'fail' | 'warning';

export interface RuleEvaluation {
  result: RuleOutcome;
  findings: RuleFinding[];
  /** Always false today: no evaluator remediates anything. Kept on the shape so a
   *  remediating kind can be added without touching the persistence path. */
  autoRemediated: boolean;
}

/** A precondition. When it does not hold the rule is not applicable and passes. */
export interface RuleWhen {
  field: string;
  equals?: unknown;
  in?: unknown[];
  /** Regex the (string) value must match. */
  matches?: string;
  /** Regex the value must NOT match; a non-string value counts as "does not match". */
  notMatches?: string;
  flags?: string;
}

export interface ThresholdConfig {
  field: string;
  operator: string;
  threshold: number;
  warningThreshold?: number;
  /** Human name for the field in the finding text. */
  description?: string;
}

export interface PatternConfig {
  field: string;
  pattern: string;
  flags?: string;
  description?: string;
  /** Show only the first characters of a match — for secrets, which must not be
   *  copied into rule_violations by the rule that exists to catch them. */
  redact?: boolean;
  /** Cap on findings per execution (default 10). */
  maxFindings?: number;
}

export interface RequiredPatternConfig {
  field: string;
  pattern: string;
  flags?: string;
  description?: string;
}

export interface SectionPatternConfig {
  field: string;
  pattern: string;
  flags?: string;
  /** A section where this matches is exempt. */
  unless: string;
  unlessFlags?: string;
  description?: string;
  maxFindings?: number;
}

export interface LookupConfig {
  field: string;
  allowedValues?: unknown[];
  forbiddenValues?: unknown[];
}

export interface AllowlistConfig {
  field: string;
  /** Context field holding the list. Missing or empty → the rule passes. */
  listField: string;
  /** A second context field whose value also satisfies the list (e.g. the bare
   *  model id behind an `sdk:` prefix). */
  altField?: string;
}

export interface CompositeConfig {
  operator: 'AND' | 'OR';
  rules: RuleLogic[];
}

export type RuleLogic =
  | { type: 'threshold'; config: ThresholdConfig; when?: RuleWhen }
  | { type: 'pattern'; config: PatternConfig; when?: RuleWhen }
  | { type: 'required_pattern'; config: RequiredPatternConfig; when?: RuleWhen }
  | { type: 'section_pattern'; config: SectionPatternConfig; when?: RuleWhen }
  | { type: 'lookup'; config: LookupConfig; when?: RuleWhen }
  | { type: 'allowlist'; config: AllowlistConfig; when?: RuleWhen }
  | { type: 'composite'; config: CompositeConfig; when?: RuleWhen };

export const RULE_LOGIC_TYPES = [
  'threshold', 'pattern', 'required_pattern', 'section_pattern', 'lookup', 'allowlist', 'composite',
] as const;

const DEFAULT_MAX_FINDINGS = 10;

const PASS: RuleEvaluation = { result: 'pass', findings: [], autoRemediated: false };

function fail(findings: RuleFinding[]): RuleEvaluation {
  return { result: 'fail', findings, autoRemediated: false };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Dotted-path read: 'a.b.c'. */
export function getNestedValue(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => (isRecord(current) ? current[key] : undefined), obj);
}

function compare(a: unknown, operator: string, b: unknown): boolean {
  const x = typeof a === 'number' ? a : Number(a);
  const y = typeof b === 'number' ? b : Number(b);
  switch (operator) {
    case '>': return x > y;
    case '>=': return x >= y;
    case '<': return x < y;
    case '<=': return x <= y;
    case '==': return a == b; // eslint-disable-line eqeqeq
    case '===': return a === b;
    case '!=': return a != b; // eslint-disable-line eqeqeq
    case '!==': return a !== b;
    default: return false;
  }
}

function withGlobalFlag(flags: string | undefined): string {
  const f = flags ?? '';
  return f.includes('g') ? f : `${f}g`;
}

function redactMatch(match: string): string {
  const head = match.slice(0, 4);
  return `${head}…(${match.length} chars, redacted)`;
}

/** Does the precondition hold? A rule without one always applies. */
export function ruleApplies(when: RuleWhen | undefined, context: RuleContext): boolean {
  if (!when) return true;
  const value = getNestedValue(context, when.field);
  if ('equals' in when && value !== when.equals) return false;
  if (when.in && !when.in.includes(value)) return false;
  if (when.matches !== undefined) {
    if (typeof value !== 'string' || !new RegExp(when.matches, when.flags ?? '').test(value)) return false;
  }
  if (when.notMatches !== undefined) {
    if (typeof value === 'string' && new RegExp(when.notMatches, when.flags ?? '').test(value)) return false;
  }
  return true;
}

function evaluateThreshold(config: ThresholdConfig, context: RuleContext): RuleEvaluation {
  const value = getNestedValue(context, config.field);
  if (value === undefined || value === null) return PASS;

  const label = config.description ?? config.field;
  const verb = config.operator === '<' || config.operator === '<=' ? 'is below' : 'exceeds';

  if (compare(value, config.operator, config.threshold)) {
    return fail([{ description: `${label} (${String(value)}) ${verb} threshold ${config.threshold}`, entity: config.field }]);
  }
  if (config.warningThreshold !== undefined && compare(value, config.operator, config.warningThreshold)) {
    return {
      result: 'warning',
      findings: [{ description: `${label} (${String(value)}) approaching threshold ${config.threshold}`, entity: config.field }],
      autoRemediated: false,
    };
  }
  return PASS;
}

function evaluatePattern(config: PatternConfig, context: RuleContext): RuleEvaluation {
  const value = getNestedValue(context, config.field);
  if (typeof value !== 'string') return PASS;
  if (typeof config.pattern !== 'string' || config.pattern.length === 0) {
    throw new Error('pattern rule has no pattern');
  }

  const regex = new RegExp(config.pattern, withGlobalFlag(config.flags));
  const seen = new Set<string>();
  const max = config.maxFindings ?? DEFAULT_MAX_FINDINGS;
  const findings: RuleFinding[] = [];
  for (const m of value.matchAll(regex)) {
    const text = m[0];
    if (text.length === 0 || seen.has(text)) continue;
    seen.add(text);
    const shown = config.redact ? redactMatch(text) : text;
    findings.push({
      description: config.description ? `${config.description}: ${shown}` : `Pattern match: ${shown}`,
      entity: config.field,
    });
    if (findings.length >= max) break;
  }
  return findings.length > 0 ? fail(findings) : PASS;
}

function evaluateRequiredPattern(config: RequiredPatternConfig, context: RuleContext): RuleEvaluation {
  const value = getNestedValue(context, config.field);
  const text = typeof value === 'string' ? value : '';
  if (typeof config.pattern !== 'string' || config.pattern.length === 0) {
    throw new Error('required_pattern rule has no pattern');
  }
  if (new RegExp(config.pattern, config.flags ?? '').test(text)) return PASS;
  return fail([{
    description: config.description ?? `Required content missing from ${config.field}`,
    entity: config.field,
  }]);
}

interface MarkdownSection { title: string; body: string }

/** Split on markdown headings; text before the first heading is its own section. */
export function splitMarkdownSections(text: string): MarkdownSection[] {
  const sections: MarkdownSection[] = [];
  let title = '(preamble)';
  let lines: string[] = [];
  const flush = () => {
    const body = lines.join('\n');
    if (body.trim().length > 0) sections.push({ title, body });
  };
  for (const line of text.split('\n')) {
    const heading = /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading) {
      flush();
      title = heading[1];
      lines = [];
      continue;
    }
    lines.push(line);
  }
  flush();
  return sections;
}

function evaluateSectionPattern(config: SectionPatternConfig, context: RuleContext): RuleEvaluation {
  const value = getNestedValue(context, config.field);
  if (typeof value !== 'string') return PASS;
  if (typeof config.pattern !== 'string' || typeof config.unless !== 'string') {
    throw new Error('section_pattern rule needs both pattern and unless');
  }
  const pattern = new RegExp(config.pattern, (config.flags ?? '').replace('g', ''));
  const unless = new RegExp(config.unless, (config.unlessFlags ?? '').replace('g', ''));
  const max = config.maxFindings ?? DEFAULT_MAX_FINDINGS;
  const findings: RuleFinding[] = [];
  for (const section of splitMarkdownSections(value)) {
    const hit = pattern.exec(section.body);
    if (!hit || unless.test(section.body)) continue;
    findings.push({
      description: `${config.description ?? 'Unmarked figure'} in section "${section.title}": "${hit[0]}"`,
      entity: config.field,
    });
    if (findings.length >= max) break;
  }
  return findings.length > 0 ? fail(findings) : PASS;
}

function evaluateLookup(config: LookupConfig, context: RuleContext): RuleEvaluation {
  const value = getNestedValue(context, config.field);
  if (value === undefined) return PASS;

  const allowed = config.allowedValues ?? [];
  const forbidden = config.forbiddenValues ?? [];

  if (forbidden.includes(value)) {
    return fail([{ description: `${config.field} value '${String(value)}' is forbidden`, entity: config.field }]);
  }
  if (allowed.length > 0 && !allowed.includes(value)) {
    return fail([{ description: `${config.field} value '${String(value)}' not in allowed list`, entity: config.field }]);
  }
  return PASS;
}

function evaluateAllowlist(config: AllowlistConfig, context: RuleContext): RuleEvaluation {
  const list = getNestedValue(context, config.listField);
  if (!Array.isArray(list) || list.length === 0) return PASS;
  const value = getNestedValue(context, config.field);
  if (value === undefined || value === null) return PASS;
  if (list.includes(value)) return PASS;
  if (config.altField) {
    const alt = getNestedValue(context, config.altField);
    if (alt !== undefined && list.includes(alt)) return PASS;
  }
  return fail([{
    description: `${config.field} '${String(value)}' is not on the allow-list (${list.length} permitted)`,
    entity: config.field,
  }]);
}

function evaluateComposite(config: CompositeConfig, context: RuleContext): RuleEvaluation {
  if (!Array.isArray(config.rules)) throw new Error('composite rule has no rules');
  const subResults = config.rules.map((r) => evaluateRuleLogic(r, context));

  if (config.operator === 'AND') {
    const failed = subResults.filter((r) => r.result === 'fail');
    if (failed.length > 0) return fail(failed.flatMap((r) => r.findings));
    const warned = subResults.filter((r) => r.result === 'warning');
    if (warned.length > 0) return { result: 'warning', findings: warned.flatMap((r) => r.findings), autoRemediated: false };
    return PASS;
  }
  if (config.operator === 'OR') {
    if (subResults.some((r) => r.result === 'pass')) return PASS;
    const warned = subResults.find((r) => r.result === 'warning');
    if (warned) return { result: 'warning', findings: warned.findings, autoRemediated: false };
    return fail(subResults.flatMap((r) => r.findings));
  }
  throw new Error(`Unknown composite operator: ${String(config.operator)}`);
}

/**
 * Evaluate one rule's logic against a context. Pure: no database, no clock.
 * Throws on malformed logic (unknown type, missing pattern) — executeRule turns
 * that into an 'error' execution row.
 */
export function evaluateRuleLogic(logic: RuleLogic, context: RuleContext): RuleEvaluation {
  if (!isRecord(logic) || typeof logic.type !== 'string') throw new Error('rule logic has no type');
  if (!ruleApplies(logic.when, context)) return PASS;
  switch (logic.type) {
    case 'threshold': return evaluateThreshold(logic.config, context);
    case 'pattern': return evaluatePattern(logic.config, context);
    case 'required_pattern': return evaluateRequiredPattern(logic.config, context);
    case 'section_pattern': return evaluateSectionPattern(logic.config, context);
    case 'lookup': return evaluateLookup(logic.config, context);
    case 'allowlist': return evaluateAllowlist(logic.config, context);
    case 'composite': return evaluateComposite(logic.config, context);
    default: throw new Error(`Unknown rule type: ${String((logic as { type: unknown }).type)}`);
  }
}

/** Parse compliance_rules.rule_logic; throws on non-JSON so the caller records an error. */
export function parseRuleLogic(raw: string): RuleLogic {
  const parsed: unknown = JSON.parse(raw);
  if (!isRecord(parsed) || typeof parsed.type !== 'string') throw new Error('rule logic has no type');
  return parsed as RuleLogic;
}

export interface ExecuteRuleOptions {
  /**
   * What to persist as execution_context. Defaults to the evaluation context;
   * the completion hook passes ids and counts so the full output text is not
   * copied into every execution row.
   */
  recordContext?: unknown;
  /** Overrides each violation's affected_entity (e.g. the message id). */
  affectedEntity?: string;
}

export async function createComplianceRulesService(db: DatabaseAdapter) {
  // Rule management
  async function getAllRules(category?: string): Promise<ComplianceRule[]> {
    if (category) {
      return await db.all<ComplianceRule>('SELECT * FROM compliance_rules WHERE category = ? ORDER BY severity DESC, title', category);
    }
    return await db.all<ComplianceRule>('SELECT * FROM compliance_rules ORDER BY category, severity DESC, title');
  }

  async function getRule(id: number): Promise<ComplianceRule | null> {
    return (await db.get<ComplianceRule>('SELECT * FROM compliance_rules WHERE id = ?', id)) ?? null;
  }

  async function createRule(rule: Omit<ComplianceRule, 'id' | 'created_at' | 'updated_at'>): Promise<number> {
    const result = await db.run(`
      INSERT INTO compliance_rules (rule_code, title, description, category, severity, regulatory_source, rule_logic, active, auto_remediate, remediation_steps)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, rule.rule_code,
      rule.title,
      rule.description,
      rule.category,
      rule.severity,
      rule.regulatory_source,
      rule.rule_logic,
      rule.active,
      rule.auto_remediate,
      rule.remediation_steps);
    return Number(result.lastInsertRowid);
  }

  const RULE_UPDATABLE = new Set([
    'rule_code', 'title', 'description', 'category', 'severity', 'regulatory_source',
    'rule_logic', 'active', 'auto_remediate', 'remediation_steps',
  ]);

  async function updateRule(id: number, updates: Partial<ComplianceRule>): Promise<void> {
    const fields: string[] = [];
    const values: unknown[] = [];

    for (const [key, value] of Object.entries(updates)) {
      if (RULE_UPDATABLE.has(key) && value !== undefined) {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    }

    if (fields.length > 0) {
      fields.push('updated_at = CURRENT_TIMESTAMP');
      values.push(id);
      await db.run(`UPDATE compliance_rules SET ${fields.join(', ')} WHERE id = ?`, ...values);
    }
  }

  async function deleteRule(id: number): Promise<void> {
    await db.run('DELETE FROM compliance_rules WHERE id = ?', id);
  }

  // ── Rule execution engine ──

  async function recordErrorExecution(ruleId: number, contextStr: string, error: unknown): Promise<RuleExecution> {
    const execution = await db.run(`
      INSERT INTO rule_executions (rule_id, execution_context, result, findings)
      VALUES (?, ?, 'error', ?)
    `, ruleId, contextStr, JSON.stringify([{ description: error instanceof Error ? error.message : String(error) }]));
    return (await db.get<RuleExecution>('SELECT * FROM rule_executions WHERE id = ?', execution.lastInsertRowid)) as RuleExecution;
  }

  /** Evaluate an already-loaded rule and persist the execution (+ violations on fail). */
  async function executeLoadedRule(rule: ComplianceRule, context: RuleContext, options: ExecuteRuleOptions = {}): Promise<RuleExecution> {
    const recordContext = options.recordContext === undefined ? context : options.recordContext;
    const contextStr = JSON.stringify(recordContext);

    let evaluation: RuleEvaluation;
    try {
      evaluation = evaluateRuleLogic(parseRuleLogic(rule.rule_logic), context);
    } catch (error) {
      return recordErrorExecution(rule.id, contextStr, error);
    }

    try {
      const execution = await db.run(`
        INSERT INTO rule_executions (rule_id, execution_context, result, findings, auto_remediated)
        VALUES (?, ?, ?, ?, ?)
      `,
        rule.id,
        contextStr,
        evaluation.result,
        JSON.stringify(evaluation.findings),
        evaluation.autoRemediated ? 1 : 0,
      );

      const executionId = Number(execution.lastInsertRowid);

      // Create violation records if rule failed
      if (evaluation.result === 'fail' && evaluation.findings.length > 0) {
        for (const finding of evaluation.findings) {
          await db.run(`
            INSERT INTO rule_violations (rule_id, execution_id, severity, description, affected_entity, remediation_status)
            VALUES (?, ?, ?, ?, ?, ?)
          `,
            rule.id,
            executionId,
            rule.severity,
            finding.description,
            options.affectedEntity ?? finding.entity ?? contextStr,
            'open',
          );
        }

        // Emit internal event so event triggers can fire workflows on violations
        void emitInternalEvent('compliance_rules', {
          event_type: 'violation_detected',
          rule_id: rule.id,
          rule_code: rule.rule_code,
          severity: rule.severity,
          category: rule.category,
          violation_count: evaluation.findings.length,
          findings: evaluation.findings.slice(0, 5), // truncate for payload
        });
      }

      return (await db.get<RuleExecution>('SELECT * FROM rule_executions WHERE id = ?', executionId)) as RuleExecution;
    } catch (error) {
      return recordErrorExecution(rule.id, contextStr, error);
    }
  }

  async function executeRule(ruleId: number, context: RuleContext, options: ExecuteRuleOptions = {}): Promise<RuleExecution> {
    const rule = await getRule(ruleId);
    if (!rule || !rule.active) {
      throw new Error(`Rule ${ruleId} not found or inactive`);
    }
    return executeLoadedRule(rule, context, options);
  }

  // Violation management
  async function getViolations(filters?: { status?: string; severity?: string; ruleId?: number }): Promise<RuleViolation[]> {
    let query = 'SELECT * FROM rule_violations WHERE 1=1';
    const params: unknown[] = [];

    if (filters?.status) {
      query += ' AND remediation_status = ?';
      params.push(filters.status);
    }
    if (filters?.severity) {
      query += ' AND severity = ?';
      params.push(filters.severity);
    }
    if (filters?.ruleId) {
      query += ' AND rule_id = ?';
      params.push(filters.ruleId);
    }

    query += ' ORDER BY created_at DESC';
    return await db.all<RuleViolation>(query, ...params);
  }

  const VIOLATION_UPDATABLE = new Set(['remediation_status', 'remediated_at', 'remediated_by', 'notes']);

  async function updateViolation(id: number, updates: Partial<RuleViolation>): Promise<void> {
    const fields: string[] = [];
    const values: unknown[] = [];

    for (const [key, value] of Object.entries(updates)) {
      if (VIOLATION_UPDATABLE.has(key) && value !== undefined) {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    }

    if (fields.length > 0) {
      values.push(id);
      await db.run(`UPDATE rule_violations SET ${fields.join(', ')} WHERE id = ?`, ...values);
    }
  }

  // Batch execution - run all active rules (optionally of one category) against a context
  async function executeAllRules(context: RuleContext, category?: string, options: ExecuteRuleOptions = {}): Promise<RuleExecution[]> {
    const rules = (await getAllRules(category)).filter((r) => Number(r.active) === 1);
    const executions: RuleExecution[] = [];

    for (const rule of rules) {
      try {
        executions.push(await executeLoadedRule(rule, context, options));
      } catch (error) {
        console.error(`Failed to execute rule ${rule.id}:`, error);
      }
    }

    return executions;
  }

  // Compliance dashboard stats
  async function getComplianceDashboard(): Promise<{
    activeRules: number;
    openViolations: number;
    criticalViolations: number;
    recentExecutions: number;
    violationsByCategory: Array<Record<string, unknown>>;
    violationsBySeverity: Array<Record<string, unknown>>;
    executionStats: Array<Record<string, unknown>>;
  }> {
    const count = async (sql: string): Promise<number> => Number((await db.get<{ count: number | string }>(sql))?.count ?? 0);

    const totalRules = await count("SELECT COUNT(*) as count FROM compliance_rules WHERE active = 1");
    const totalViolations = await count("SELECT COUNT(*) as count FROM rule_violations WHERE remediation_status = 'open'");
    const criticalViolations = await count("SELECT COUNT(*) as count FROM rule_violations WHERE severity = 'critical' AND remediation_status = 'open'");
    const recentExecutions = await count("SELECT COUNT(*) as count FROM rule_executions WHERE executed_at >= NOW() - INTERVAL '7 days'");

    const violationsByCategory = await db.all(`
      SELECT
        r.category,
        COUNT(*) as count
      FROM rule_violations rv
      JOIN compliance_rules r ON rv.rule_id = r.id
      WHERE rv.remediation_status = 'open'
      GROUP BY r.category
    `);

    const violationsBySeverity = await db.all(`
      SELECT
        severity,
        COUNT(*) as count
      FROM rule_violations
      WHERE remediation_status = 'open'
      GROUP BY severity
    `);

    const executionStats = await db.all(`
      SELECT
        result,
        COUNT(*) as count
      FROM rule_executions
      WHERE executed_at >= NOW() - INTERVAL '7 days'
      GROUP BY result
    `);

    return {
      activeRules: totalRules,
      openViolations: totalViolations,
      criticalViolations,
      recentExecutions,
      violationsByCategory,
      violationsBySeverity,
      executionStats,
    };
  }

  return {
    getAllRules,
    getRule,
    createRule,
    updateRule,
    deleteRule,
    executeRule,
    getViolations,
    updateViolation,
    executeAllRules,
    getComplianceDashboard,
  };
}
