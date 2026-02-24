import type { Database } from 'better-sqlite3';

export interface BudgetStatus {
  userId: string;
  username: string;
  currentMonth: string;
  budget: number; // 0 = unlimited
  used: number;
  remaining: number;
  percentUsed: number;
  alertThreshold: number;
  isOverBudget: boolean;
  isNearLimit: boolean;
}

export function getUserBudgetStatus(db: Database, userId: string): BudgetStatus {
  const user = db.prepare('SELECT username, monthly_token_budget FROM users WHERE id = ?').get(userId) as { username: string; monthly_token_budget: number } | undefined;

  if (!user) {
    throw new Error('User not found');
  }

  const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM format
  const usage = db.prepare(
    'SELECT input_tokens, output_tokens FROM user_monthly_usage WHERE user_id = ? AND year_month = ?'
  ).get(userId, currentMonth) as { input_tokens: number; output_tokens: number } | undefined;

  const budget = user.monthly_token_budget || 0;
  const used = (usage?.input_tokens || 0) + (usage?.output_tokens || 0);
  const remaining = budget > 0 ? budget - used : Infinity;
  const percentUsed = budget > 0 ? (used / budget) * 100 : 0;
  const alertThreshold = 0.8; // 80% warning threshold

  return {
    userId,
    username: user.username,
    currentMonth,
    budget,
    used,
    remaining,
    percentUsed,
    alertThreshold,
    isOverBudget: budget > 0 && used >= budget,
    isNearLimit: budget > 0 && percentUsed >= alertThreshold * 100,
  };
}

export function checkBudgetBeforeApiCall(
  db: Database,
  userId: string,
  estimatedTokens: number
): { allowed: boolean; reason?: string } {
  const status = getUserBudgetStatus(db, userId);

  if (status.budget === 0) {
    return { allowed: true }; // No budget = unlimited
  }

  if (status.isOverBudget) {
    return {
      allowed: false,
      reason: `Monthly budget exceeded (${status.used.toLocaleString()}/${status.budget.toLocaleString()} tokens)`,
    };
  }

  if (status.remaining < estimatedTokens) {
    return {
      allowed: false,
      reason: `Insufficient budget (need ${estimatedTokens.toLocaleString()}, have ${status.remaining.toLocaleString()})`,
    };
  }

  return { allowed: true };
}

export function updateUserBudget(
  db: Database,
  userId: string,
  monthlyTokenBudget: number,
  alertThreshold?: number
): boolean {
  try {
    // Only update budget; alert threshold is currently hardcoded but column is ready for future use
    db.prepare('UPDATE users SET monthly_token_budget = ? WHERE id = ?').run(monthlyTokenBudget, userId);
    return true;
  } catch (err) {
    console.error('[budget-manager] Failed to update user budget:', err);
    return false;
  }
}

export function getAllUserBudgets(db: Database): BudgetStatus[] {
  const users = db.prepare('SELECT id FROM users').all() as { id: string }[];
  return users.map((u) => getUserBudgetStatus(db, u.id));
}

export function resetMonthlyUsage(db: Database, userId: string): boolean {
  try {
    const currentMonth = new Date().toISOString().slice(0, 7);
    db.prepare('DELETE FROM user_monthly_usage WHERE user_id = ? AND year_month = ?').run(userId, currentMonth);
    return true;
  } catch (err) {
    console.error('[budget-manager] Failed to reset usage:', err);
    return false;
  }
}
