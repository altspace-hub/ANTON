import type { DatabaseAdapter } from '../db/database.js';

interface ComplianceRule {
  id: string; rule_name: string; rule_type: string;
  condition: Record<string, unknown>; action: string;
  action_message: string | null; scope_type: string;
  scope_value: string | null; priority: number; active: number;
}

interface ComplianceCheckResult {
  allowed: boolean;
  requiresApproval: boolean;
  decisions: Array<{ ruleId: string; ruleName: string; result: string; reason: string }>;
  blockedBy: string[];
}

/** Map rule action to DB evaluation_result CHECK values */
function actionToEvalResult(action: string): string {
  switch (action) {
    case 'block': return 'blocked';
    case 'flag': return 'flagged';
    case 'require_approval': return 'approval_required';
    default: return 'allowed';
  }
}

export async function createDelegationComplianceService(db: DatabaseAdapter) {

  function evaluateCondition(condition: Record<string, unknown>, context: Record<string, string>): boolean {
    const type = condition.type as string;
    switch (type) {
      case 'pattern': {
        const field = condition.field as string;
        const pattern = condition.pattern as string;
        const flags = (condition.flags as string) ?? '';
        const text = context[field] ?? '';
        try { return new RegExp(pattern, flags).test(text); }
        catch { return false; }
      }
      case 'module_list': {
        const modules = (condition.modules as string[]) ?? [];
        const required = (context.requiredModules ?? '').split(',').filter(Boolean);
        const mode = condition.mode as string;
        return mode === 'deny'
          ? required.some(m => modules.some(mod => m.includes(mod)))
          : !required.every(m => modules.some(mod => m.includes(mod)));
      }
      case 'contact_list': {
        const contacts = (condition.contacts as string[]) ?? [];
        const mode = condition.mode as string;
        return mode === 'deny'
          ? contacts.includes(context.contactHash ?? '')
          : !contacts.includes(context.contactHash ?? '');
      }
      case 'trust_level': {
        const levels = ['manual', 'suggested', 'pre_approved', 'autonomous'];
        const minimum = condition.minimum as string;
        const current = context.trustLevel ?? 'manual';
        return levels.indexOf(current) < levels.indexOf(minimum);
      }
      case 'always': return true;
      default: return false;
    }
  }

  async function evaluateCompliance(
    direction: 'outbound' | 'inbound',
    context: { title: string; description: string; contactHash: string; requiredModules?: string[]; trustLevel?: string; taskId?: string }
  ): Promise<ComplianceCheckResult> {
    const rules = await db.all<ComplianceRule>(
      'SELECT * FROM delegation_compliance_rules WHERE active = 1 ORDER BY priority ASC'
    );

    const decisions: ComplianceCheckResult['decisions'] = [];
    const blockedBy: string[] = [];
    let requiresApproval = false;

    const evalContext: Record<string, string> = {
      title: context.title,
      description: context.description,
      content: `${context.title} ${context.description}`,
      contactHash: context.contactHash,
      requiredModules: (context.requiredModules ?? []).join(','),
      trustLevel: context.trustLevel ?? 'manual',
    };

    for (const rule of rules) {
      const condition = typeof rule.condition === 'string' ? JSON.parse(rule.condition as unknown as string) : rule.condition;

      // Check scope
      if (rule.scope_type === 'contact' && rule.scope_value !== context.contactHash) continue;
      if (rule.scope_type === 'module' && !(context.requiredModules ?? []).includes(rule.scope_value ?? '')) continue;

      const triggered = evaluateCondition(condition, evalContext);
      if (!triggered) continue;

      const result = rule.action;
      decisions.push({
        ruleId: rule.id, ruleName: rule.rule_name,
        result, reason: rule.action_message ?? `Rule "${rule.rule_name}" triggered`,
      });

      if (result === 'block') blockedBy.push(rule.rule_name);
      if (result === 'require_approval') requiresApproval = true;

      // Log evaluation
      const evalId = `dce_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      await db.run(`
        INSERT INTO delegation_compliance_evaluations (id, task_id, rule_id, direction, evaluation_result, reason, context_snapshot)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, evalId, context.taskId ?? null, rule.id, direction, actionToEvalResult(result),
         rule.action_message ?? rule.rule_name, JSON.stringify(evalContext));
    }

    return {
      allowed: blockedBy.length === 0,
      requiresApproval,
      decisions,
      blockedBy,
    };
  }

  async function listRules(activeOnly = true) {
    const where = activeOnly ? 'WHERE active = 1' : '';
    return await db.all<ComplianceRule>(
      `SELECT * FROM delegation_compliance_rules ${where} ORDER BY priority ASC`
    );
  }

  async function createRule(params: {
    ruleName: string; ruleType: string; condition: Record<string, unknown>;
    action: string; actionMessage?: string; scopeType?: string; scopeValue?: string; priority?: number;
  }): Promise<string> {
    const id = `dcr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await db.run(`
      INSERT INTO delegation_compliance_rules (id, rule_name, rule_type, condition, action, action_message, scope_type, scope_value, priority)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, id, params.ruleName, params.ruleType, JSON.stringify(params.condition),
       params.action, params.actionMessage ?? null,
       params.scopeType ?? 'all', params.scopeValue ?? null, params.priority ?? 100);
    return id;
  }

  async function toggleRule(id: string, active: boolean): Promise<void> {
    await db.run('UPDATE delegation_compliance_rules SET active = ?, updated_at = NOW() WHERE id = ?', active ? 1 : 0, id);
  }

  async function deleteRule(id: string): Promise<void> {
    await db.run('DELETE FROM delegation_compliance_rules WHERE id = ?', id);
  }

  async function getEvaluationLog(taskId?: string, limit = 50) {
    if (taskId) {
      return await db.all('SELECT * FROM delegation_compliance_evaluations WHERE task_id = ? ORDER BY created_at DESC LIMIT ?', taskId, limit);
    }
    return await db.all('SELECT * FROM delegation_compliance_evaluations ORDER BY created_at DESC LIMIT ?', limit);
  }

  return { evaluateCompliance, listRules, createRule, toggleRule, deleteRule, getEvaluationLog };
}

export type DelegationComplianceService = Awaited<ReturnType<typeof createDelegationComplianceService>>;
