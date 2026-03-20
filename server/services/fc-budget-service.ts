import type { DatabaseAdapter } from '../db/database.js';

export async function createFCBudgetService(db: DatabaseAdapter) {
  async function getRules() {
    return await db.get('SELECT * FROM fc_budget_rules WHERE id = ?', 'default');
  }
  async function updateRules(updates: Record<string, unknown>) {
    const allowed = ['max_per_transaction_ftc', 'max_daily_transactions', 'max_daily_spend_ftc', 'max_monthly_spend_ftc', 'auto_approve_below_ftc', 'per_contact_monthly_limit_ftc', 'require_approval_above_ftc'];
    const sets: string[] = []; const vals: unknown[] = [];
    for (const [k, v] of Object.entries(updates)) {
      if (allowed.includes(k)) { sets.push(`${k} = ?`); vals.push(v); }
    }
    if (sets.length > 0) {
      sets.push('updated_at = NOW()'); vals.push('default');
      await db.run(`UPDATE fc_budget_rules SET ${sets.join(', ')} WHERE id = ?`, ...vals);
    }
    return await getRules();
  }

  async function checkSpending(amount: number): Promise<{ result: 'approved' | 'requires_approval' | 'blocked'; reason?: string }> {
    const rules = await getRules() as Record<string, unknown> | undefined;
    const state = await db.get('SELECT * FROM fc_spending_state WHERE id = ?', 'default') as Record<string, unknown> | undefined;
    if (!rules || !state) return { result: 'approved' };

    // Reset daily/monthly if needed
    const today = new Date().toISOString().slice(0, 10);
    const month = new Date().toISOString().slice(0, 7);
    if (state.last_daily_reset !== today) {
      await db.run("UPDATE fc_spending_state SET transactions_today = 0, total_spent_today_ftc = 0, last_daily_reset = ? WHERE id = 'default'", today);
      state.transactions_today = 0; state.total_spent_today_ftc = 0;
    }
    if (state.last_monthly_reset !== month) {
      await db.run("UPDATE fc_spending_state SET total_spent_month_ftc = 0, last_monthly_reset = ? WHERE id = 'default'", month);
      state.total_spent_month_ftc = 0;
    }

    if (amount > Number(rules.max_per_transaction_ftc)) return { result: 'blocked', reason: `Exceeds per-transaction limit (${rules.max_per_transaction_ftc} FTC)` };
    if (Number(state.transactions_today) >= Number(rules.max_daily_transactions)) return { result: 'blocked', reason: `Daily transaction limit reached (${rules.max_daily_transactions})` };
    if (Number(state.total_spent_today_ftc) + amount > Number(rules.max_daily_spend_ftc)) return { result: 'blocked', reason: `Would exceed daily spend limit (${rules.max_daily_spend_ftc} FTC)` };
    if (Number(state.total_spent_month_ftc) + amount > Number(rules.max_monthly_spend_ftc)) return { result: 'blocked', reason: `Would exceed monthly spend limit (${rules.max_monthly_spend_ftc} FTC)` };
    if (amount > Number(rules.require_approval_above_ftc)) return { result: 'requires_approval', reason: `Amount exceeds auto-approve threshold (${rules.require_approval_above_ftc} FTC)` };
    return { result: 'approved' };
  }

  async function recordSpend(amount: number, txId?: string) {
    await db.run("UPDATE fc_spending_state SET transactions_today = transactions_today + 1, total_spent_today_ftc = total_spent_today_ftc + ?, total_spent_month_ftc = total_spent_month_ftc + ?, updated_at = NOW() WHERE id = 'default'", amount, amount);
    const logId = `fsl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    await db.run("INSERT INTO fc_spending_log (id, transaction_id, amount_ftc, check_result) VALUES (?, ?, ?, 'approved')", logId, txId ?? null, amount);
  }

  async function getSpendingState() { return await db.get("SELECT * FROM fc_spending_state WHERE id = 'default'"); }
  async function getSpendingLog(limit = 20) { return await db.all('SELECT * FROM fc_spending_log ORDER BY created_at DESC LIMIT ?', limit); }

  return { getRules, updateRules, checkSpending, recordSpend, getSpendingState, getSpendingLog };
}
export type FCBudgetService = Awaited<ReturnType<typeof createFCBudgetService>>;
