/**
 * compliance-on-completion.ts — run the Work compliance rules against a
 * finished module run, in the background, and record what they found.
 *
 * Called by the chat route after the assistant message is persisted (alongside
 * audit, usage, quality and extraction bookkeeping). It never throws and never
 * blocks the response: a failure is a `ran: false` result with a reason.
 *
 * Gate: app_settings 'compliance_on_completion' — absent means ON (owner
 * decision, review §7 item 9); 'false' / '0' / 'off' / 'no' turns it off.
 * Outputs shorter than 200 chars are skipped: a refusal or a one-line answer
 * would fail half the rules for no reason a reader would act on.
 *
 * Persistence is exactly the engine's: one rule_executions row per active
 * 'work' rule (execution_context = ids and derived facts, never the output
 * text) and one rule_violations row per finding, affected_entity = message id.
 */
import type { DatabaseAdapter } from '../db/database.js';
import { createComplianceRulesService, type RuleExecution } from './compliance-rules.js';
import {
  buildWorkRecordContext,
  buildWorkRuleContext,
  WORK_RULE_CATEGORY,
  type WorkRunInput,
} from './work-compliance-rules.js';

export const COMPLIANCE_ON_COMPLETION_SETTING_KEY = 'compliance_on_completion';
export const COMPLIANCE_MIN_TEXT_CHARS = 200;

/** The statements, exported so a fake adapter can answer them by identity. */
export const COMPLIANCE_ON_COMPLETION_SQL = {
  read: 'SELECT value FROM app_settings WHERE key = ?',
  upsert: 'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  sessionUser: 'SELECT user_id FROM sessions WHERE id = ?',
  allowedModels: 'SELECT model_id FROM model_allowed WHERE user_id IS NULL OR user_id = ? ORDER BY model_id',
} as const;

export type ComplianceOnCompletionInput = Omit<WorkRunInput, 'allowedModels'>;

export interface ComplianceOnCompletionResult {
  ran: boolean;
  executions: number;
  violations: number;
  reason?: string;
}

const OFF_VALUES = new Set(['false', '0', 'off', 'no', 'disabled']);

/** Absent → on. Only an explicit off-word turns it off. */
export function parseComplianceOnCompletion(raw: unknown): boolean {
  if (raw === undefined || raw === null) return true;
  const v = String(raw).trim().toLowerCase();
  return !OFF_VALUES.has(v);
}

export async function isComplianceOnCompletionEnabled(db: DatabaseAdapter): Promise<boolean> {
  const row = await db.get<{ value: string }>(COMPLIANCE_ON_COMPLETION_SQL.read, COMPLIANCE_ON_COMPLETION_SETTING_KEY);
  return parseComplianceOnCompletion(row?.value);
}

export async function setComplianceOnCompletion(db: DatabaseAdapter, enabled: boolean): Promise<void> {
  await db.run(COMPLIANCE_ON_COMPLETION_SQL.upsert, COMPLIANCE_ON_COMPLETION_SETTING_KEY, enabled ? 'true' : 'false');
}

function countFindings(execution: RuleExecution): number {
  if (!execution.findings) return 0;
  try {
    const parsed: unknown = JSON.parse(execution.findings);
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

/** Global rows plus the session owner's rows; [] when there is no allow-list at all. */
async function loadAllowedModels(db: DatabaseAdapter, sessionId: string): Promise<string[]> {
  const session = await db.get<{ user_id: string | null }>(COMPLIANCE_ON_COMPLETION_SQL.sessionUser, sessionId);
  const rows = await db.all<{ model_id: string }>(COMPLIANCE_ON_COMPLETION_SQL.allowedModels, session?.user_id ?? '');
  return rows.map((r) => r.model_id);
}

export async function runComplianceOnCompletion(
  db: DatabaseAdapter,
  input: ComplianceOnCompletionInput,
): Promise<ComplianceOnCompletionResult> {
  const skipped = (reason: string): ComplianceOnCompletionResult => ({ ran: false, executions: 0, violations: 0, reason });
  try {
    if (!(await isComplianceOnCompletionEnabled(db))) return skipped('disabled');
    const text = typeof input.text === 'string' ? input.text : '';
    if (text.length < COMPLIANCE_MIN_TEXT_CHARS) return skipped(`text shorter than ${COMPLIANCE_MIN_TEXT_CHARS} chars`);

    const allowedModels = await loadAllowedModels(db, input.sessionId);
    const context = buildWorkRuleContext({ ...input, text, allowedModels });
    const recordContext = buildWorkRecordContext(context);

    const service = await createComplianceRulesService(db);
    const executions = await service.executeAllRules(context, WORK_RULE_CATEGORY, {
      recordContext,
      affectedEntity: input.messageId,
    });

    let violations = 0;
    let errors = 0;
    for (const e of executions) {
      if (e.result === 'fail') violations += countFindings(e);
      else if (e.result === 'error') errors += 1;
    }
    console.log(
      `[compliance] completion ${input.messageId}: ${executions.length} rules, ${violations} violations, ${errors} errors`,
    );
    return { ran: true, executions: executions.length, violations };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.warn(`[compliance] completion run skipped: ${reason}`);
    return skipped(reason);
  }
}
