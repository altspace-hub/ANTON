import { randomUUID } from 'node:crypto';
import type { DatabaseAdapter } from '../db/database.js';

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

export async function getUserBudgetStatus(db: DatabaseAdapter, userId: string): Promise<BudgetStatus> {
  const user = await db.get('SELECT username, monthly_token_budget FROM users WHERE id = ?', userId) as { username: string; monthly_token_budget: number } | undefined;

  if (!user) {
    throw new Error('User not found');
  }

  const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM format
  const usage = await db.get(
    'SELECT input_tokens, output_tokens FROM user_monthly_usage WHERE user_id = ? AND year_month = ?'
  , userId, currentMonth) as { input_tokens: number; output_tokens: number } | undefined;

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

export async function checkBudgetBeforeApiCall(
  db: DatabaseAdapter,
  userId: string,
  estimatedTokens: number
): Promise<{ allowed: boolean; reason?: string }> {
  const status = await getUserBudgetStatus(db, userId);

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

export async function updateUserBudget(
  db: DatabaseAdapter,
  userId: string,
  monthlyTokenBudget: number,
  alertThreshold?: number
): Promise<boolean> {
  try {
    // Only update budget; alert threshold is currently hardcoded but column is ready for future use
    await db.run('UPDATE users SET monthly_token_budget = ? WHERE id = ?', monthlyTokenBudget, userId);
    return true;
  } catch (err) {
    console.error('[budget-manager] Failed to update user budget:', err);
    return false;
  }
}

export async function getAllUserBudgets(db: DatabaseAdapter): Promise<BudgetStatus[]> {
  const users = await db.all('SELECT id FROM users') as { id: string }[];
  return Promise.all(users.map((u) => getUserBudgetStatus(db, u.id)));
}

export async function resetMonthlyUsage(db: DatabaseAdapter, userId: string): Promise<boolean> {
  try {
    const currentMonth = new Date().toISOString().slice(0, 7);
    await db.run('DELETE FROM user_monthly_usage WHERE user_id = ? AND year_month = ?', userId, currentMonth);
    return true;
  } catch (err) {
    console.error('[budget-manager] Failed to reset usage:', err);
    return false;
  }
}

/**
 * Adds one call's tokens to the user's monthly usage (team mode), the count
 * checkBudgetBeforeApiCall reads. The Work route charges every run; a route
 * that calls a model on its own (a review, an explain-for rewrite, a replay)
 * charges here, so DEMO_USER_MONTHLY_TOKENS holds for it too. Solo mode and
 * the solo user are not counted. Never throws.
 */
export async function chargeMonthlyUsage(
  db: DatabaseAdapter,
  user: { id?: string | null } | null | undefined,
  inputTokens: number,
  outputTokens: number,
): Promise<void> {
  if (process.env.DEPLOYMENT_MODE !== 'team' || !user?.id || user.id === 'solo') return;
  const input = Math.max(0, Math.round(inputTokens || 0));
  const output = Math.max(0, Math.round(outputTokens || 0));
  if (input === 0 && output === 0) return;
  try {
    await db.run(`
      INSERT INTO user_monthly_usage (id, user_id, year_month, input_tokens, output_tokens)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id, year_month) DO UPDATE SET
        input_tokens = user_monthly_usage.input_tokens + excluded.input_tokens,
        output_tokens = user_monthly_usage.output_tokens + excluded.output_tokens
    `, randomUUID(), user.id, new Date().toISOString().slice(0, 7), input, output);
  } catch {
    // Non-fatal
  }
}
