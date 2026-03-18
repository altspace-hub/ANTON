import type { DatabaseAdapter } from '../db/database.js';

import { emitInternalEvent } from './event-emitter.js';

export interface ComplianceRule {
  id: number;
  rule_code: string;
  title: string;
  description: string;
  category: 'kyc' | 'transaction_monitoring' | 'sanctions' | 'reporting' | 'governance' | 'data_quality' | 'operational';
  severity: 'critical' | 'high' | 'medium' | 'low';
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

export async function createComplianceRulesService(db: DatabaseAdapter) {
  // Rule management
  async function getAllRules(category?: string): ComplianceRule[] {
    if (category) {
      return await db.all('SELECT * FROM compliance_rules WHERE category = ? ORDER BY severity DESC, title', category) as ComplianceRule[];
    }
    return await db.all('SELECT * FROM compliance_rules ORDER BY category, severity DESC, title') as ComplianceRule[];
  }

  async function getRule(id: number): ComplianceRule | null {
    return await db.get('SELECT * FROM compliance_rules WHERE id = ?', id) as ComplianceRule | null;
  }

  async function createRule(rule: Omit<ComplianceRule, 'id' | 'created_at' | 'updated_at'>): number {
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
    return result.lastInsertRowid as number;
  }

  async function updateRule(id: number, updates: Partial<ComplianceRule>): Promise<void> {
    const fields: string[] = [];
    const values: any[] = [];

    Object.entries(updates).forEach(([key, value]) => {
      if (key !== 'id' && key !== 'created_at' && key !== 'updated_at' && value !== undefined) {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    });

    if (fields.length > 0) {
      fields.push('updated_at = CURRENT_TIMESTAMP');
      values.push(id);
      await db.run(`UPDATE compliance_rules SET ${fields.join(', ')} WHERE id = ?`, ...values);
    }
  }

  async function deleteRule(id: number): void {
    await db.run('DELETE FROM compliance_rules WHERE id = ?', id);
  }

  // Rule execution engine
  async function executeRule(ruleId: number, context: any): Promise<RuleExecution> {
    const rule = getRule(ruleId);
    if (!rule || !rule.active) {
      throw new Error(`Rule ${ruleId} not found or inactive`);
    }

    const logic = JSON.parse(rule.rule_logic);
    const contextStr = JSON.stringify(context);

    try {
      const evaluationResult = await evaluateRuleLogic(logic, context);

      const execution = await db.run(`
        INSERT INTO rule_executions (rule_id, execution_context, result, findings, auto_remediated)
        VALUES (?, ?, ?, ?, ?)
      `, 
        ruleId,
        contextStr,
        evaluationResult.result,
        JSON.stringify(evaluationResult.findings),
        evaluationResult.autoRemediated ? 1 : 0
      );

      const executionId = execution.lastInsertRowid as number;

      // Create violation records if rule failed
      if (evaluationResult.result === 'fail' && evaluationResult.findings) {
        for (const finding of evaluationResult.findings) {
          await db.run(`
            INSERT INTO rule_violations (rule_id, execution_id, severity, description, affected_entity, remediation_status)
            VALUES (?, ?, ?, ?, ?, ?)
          `, 
            ruleId,
            executionId,
            rule.severity,
            finding.description,
            finding.entity || JSON.stringify(context),
            'open'
          );
        }

        // Emit internal event so event triggers can fire workflows on violations
        void emitInternalEvent('compliance_rules', {
          event_type: 'violation_detected',
          rule_id: ruleId,
          rule_code: rule.rule_code,
          severity: rule.severity,
          category: rule.category,
          violation_count: evaluationResult.findings.length,
          findings: evaluationResult.findings.slice(0, 5), // truncate for payload
        });
      }

      return await db.get('SELECT * FROM rule_executions WHERE id = ?', executionId) as RuleExecution;
    } catch (error) {
      // Log error execution
      const execution = await db.run(`
        INSERT INTO rule_executions (rule_id, execution_context, result, findings)
        VALUES (?, ?, 'error', ?)
      `, ruleId, contextStr, JSON.stringify([{ description: String(error) }]));

      return await db.get('SELECT * FROM rule_executions WHERE id = ?', execution.lastInsertRowid) as RuleExecution;
    }
  }

  // Rule logic evaluator - supports 4 rule types
  async function evaluateRuleLogic(logic: any, context: any): Promise<{ result: 'pass' | 'fail' | 'warning'; findings: any[]; autoRemediated: boolean }> {
    switch (logic.type) {
      case 'threshold':
        return evaluateThreshold(logic.config, context);
      case 'pattern':
        return evaluatePattern(logic.config, context);
      case 'lookup':
        return evaluateLookup(logic.config, context);
      case 'composite':
        return evaluateComposite(logic.config, context);
      default:
        throw new Error(`Unknown rule type: ${logic.type}`);
    }
  }

  function evaluateThreshold(config: any, context: any): { result: 'pass' | 'fail' | 'warning'; findings: any[]; autoRemediated: boolean } {
    // Example: { field: 'token_count', operator: '>', threshold: 100000, warningThreshold: 80000 }
    const value = getNestedValue(context, config.field);
    if (value === undefined) return { result: 'pass', findings: [], autoRemediated: false };

    const exceeded = compare(value, config.operator, config.threshold);
    const warningExceeded = config.warningThreshold && compare(value, config.operator, config.warningThreshold);

    if (exceeded) {
      return {
        result: 'fail',
        findings: [{ description: `${config.field} (${value}) exceeds threshold ${config.threshold}`, entity: config.field }],
        autoRemediated: false
      };
    } else if (warningExceeded) {
      return {
        result: 'warning',
        findings: [{ description: `${config.field} (${value}) approaching threshold ${config.threshold}`, entity: config.field }],
        autoRemediated: false
      };
    }
    return { result: 'pass', findings: [], autoRemediated: false };
  }

  function evaluatePattern(config: any, context: any): { result: 'pass' | 'fail' | 'warning'; findings: any[]; autoRemediated: boolean } {
    // Example: { field: 'output_text', pattern: '\\b(TODO|FIXME)\\b', flags: 'gi' }
    const value = getNestedValue(context, config.field);
    if (typeof value !== 'string') return { result: 'pass', findings: [], autoRemediated: false };

    const regex = new RegExp(config.pattern, config.flags || '');
    const matches = value.match(regex);

    if (matches && matches.length > 0) {
      return {
        result: 'fail',
        findings: matches.map(m => ({ description: `Pattern match: ${m}`, entity: config.field })),
        autoRemediated: false
      };
    }
    return { result: 'pass', findings: [], autoRemediated: false };
  }

  function evaluateLookup(config: any, context: any): { result: 'pass' | 'fail' | 'warning'; findings: any[]; autoRemediated: boolean } {
    // Example: { field: 'model', allowedValues: ['claude-opus-4-6', 'claude-sonnet-4-5'] }
    const value = getNestedValue(context, config.field);
    if (value === undefined) return { result: 'pass', findings: [], autoRemediated: false };

    const allowed = config.allowedValues || [];
    const forbidden = config.forbiddenValues || [];

    if (forbidden.includes(value)) {
      return {
        result: 'fail',
        findings: [{ description: `${config.field} value '${value}' is forbidden`, entity: config.field }],
        autoRemediated: false
      };
    }

    if (allowed.length > 0 && !allowed.includes(value)) {
      return {
        result: 'fail',
        findings: [{ description: `${config.field} value '${value}' not in allowed list`, entity: config.field }],
        autoRemediated: false
      };
    }

    return { result: 'pass', findings: [], autoRemediated: false };
  }

  async function evaluateComposite(config: any, context: any): Promise<{ result: 'pass' | 'fail' | 'warning'; findings: any[]; autoRemediated: boolean }> {
    // Example: { operator: 'AND', rules: [{ type: 'threshold', config: {...} }, { type: 'pattern', config: {...} }] }
    const subResults = await Promise.all(config.rules.map((r: any) => evaluateRuleLogic(r, context)));

    if (config.operator === 'AND') {
      const failed = subResults.filter(r => r.result === 'fail');
      if (failed.length > 0) {
        return {
          result: 'fail',
          findings: failed.flatMap(r => r.findings),
          autoRemediated: false
        };
      }
      const warned = subResults.filter(r => r.result === 'warning');
      if (warned.length > 0) {
        return {
          result: 'warning',
          findings: warned.flatMap(r => r.findings),
          autoRemediated: false
        };
      }
      return { result: 'pass', findings: [], autoRemediated: false };
    } else if (config.operator === 'OR') {
      const passed = subResults.find(r => r.result === 'pass');
      if (passed) return { result: 'pass', findings: [], autoRemediated: false };

      const warned = subResults.find(r => r.result === 'warning');
      if (warned) return { result: 'warning', findings: warned.findings, autoRemediated: false };

      return {
        result: 'fail',
        findings: subResults.flatMap(r => r.findings),
        autoRemediated: false
      };
    }

    throw new Error(`Unknown composite operator: ${config.operator}`);
  }

  // Helper functions
  function getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  function compare(a: any, operator: string, b: any): boolean {
    switch (operator) {
      case '>': return a > b;
      case '>=': return a >= b;
      case '<': return a < b;
      case '<=': return a <= b;
      case '==': return a == b;
      case '===': return a === b;
      case '!=': return a != b;
      case '!==': return a !== b;
      default: return false;
    }
  }

  // Violation management
  async function getViolations(filters?: { status?: string; severity?: string; ruleId?: number }): RuleViolation[] {
    let query = 'SELECT * FROM rule_violations WHERE 1=1';
    const params: any[] = [];

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
    return await db.all(query, ...params) as RuleViolation[];
  }

  async function updateViolation(id: number, updates: Partial<RuleViolation>): Promise<void> {
    const fields: string[] = [];
    const values: any[] = [];

    Object.entries(updates).forEach(([key, value]) => {
      if (key !== 'id' && key !== 'created_at' && value !== undefined) {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    });

    if (fields.length > 0) {
      values.push(id);
      await db.run(`UPDATE rule_violations SET ${fields.join(', ')} WHERE id = ?`, ...values);
    }
  }

  // Batch execution - run all active rules against a context
  async function executeAllRules(context: any, category?: string): Promise<RuleExecution[]> {
    const rules = getAllRules(category).filter(r => r.active === 1);
    const executions: RuleExecution[] = [];

    for (const rule of rules) {
      try {
        const execution = await executeRule(rule.id, context);
        executions.push(execution);
      } catch (error) {
        console.error(`Failed to execute rule ${rule.id}:`, error);
      }
    }

    return executions;
  }

  // Compliance dashboard stats
  async function getComplianceDashboard(): any {

    const totalViolations = await db.get("SELECT COUNT(*) as count FROM rule_violations WHERE remediation_status = 'open'") as { count: number };
    const criticalViolations = await db.get("SELECT COUNT(*) as count FROM rule_violations WHERE severity = 'critical' AND remediation_status = 'open'") as { count: number };



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
      activeRules: totalRules.count,
      openViolations: totalViolations.count,
      criticalViolations: criticalViolations.count,
      recentExecutions,
      violationsByCategory,
      violationsBySeverity,
      executionStats
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
    getComplianceDashboard
  };
}
