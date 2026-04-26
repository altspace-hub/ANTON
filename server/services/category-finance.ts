/**
 * category-finance.ts — Life pillar / Finance area service.
 *
 * Phase B.3 build-out. Pure functions for personal-finance calculators
 * (compound interest, FIRE number, mortgage payment, debt-payoff order)
 * + watchlist + goals queries.
 *
 * The calculators are deliberately separated from the DB queries so they
 * can be unit-tested without a database. The DB-bound functions wrap them.
 */

import type { DatabaseAdapter } from '../db/database.js';

export interface FinanceWatchlistEntry {
  id: string;
  user_id: string;
  symbol: string;
  name: string | null;
  asset_type: string;
  currency: string;
  target_price: number | null;
  notes: string | null;
  added_at: string;
}

export interface FinanceGoal {
  id: string;
  user_id: string;
  goal_type: 'savings' | 'purchase' | 'retirement' | 'debt_payoff' | 'emergency_fund' | 'investment' | 'custom';
  title: string;
  target_amount: number | null;
  current_amount: number;
  currency: string;
  target_date: string | null;
  monthly_contribution: number | null;
  parameters: Record<string, unknown>;
  status: 'active' | 'paused' | 'completed' | 'abandoned';
  created_at: string;
}

// ── Pure-function calculators (no DB) ────────────────────────────────

/**
 * Compound interest: future value of recurring monthly contributions
 * plus an initial balance, at an annualised return rate.
 *
 * @param principal     Starting balance.
 * @param monthly       Monthly contribution.
 * @param annualReturn  Annualised return as a decimal (e.g. 0.07 for 7%).
 * @param years         Time horizon in years.
 */
export function compoundInterest(
  principal: number,
  monthly: number,
  annualReturn: number,
  years: number,
): { finalBalance: number; totalContributed: number; totalGrowth: number } {
  const monthsTotal = years * 12;
  const r = annualReturn / 12;
  // FV of principal: P * (1+r)^n
  const fvPrincipal = principal * Math.pow(1 + r, monthsTotal);
  // FV of annuity: M * ((1+r)^n - 1) / r   — for r > 0
  const fvAnnuity = r === 0
    ? monthly * monthsTotal
    : monthly * ((Math.pow(1 + r, monthsTotal) - 1) / r);
  const finalBalance     = Math.round((fvPrincipal + fvAnnuity) * 100) / 100;
  const totalContributed = Math.round((principal + monthly * monthsTotal) * 100) / 100;
  const totalGrowth      = Math.round((finalBalance - totalContributed) * 100) / 100;
  return { finalBalance, totalContributed, totalGrowth };
}

/**
 * FIRE (Financial Independence, Retire Early) number using the 4% rule.
 * Returns the invested-asset target needed to fund the given annual spend.
 */
export function fireNumber(annualSpend: number, withdrawalRate = 0.04): number {
  if (withdrawalRate <= 0 || withdrawalRate > 0.10) {
    throw new Error('withdrawalRate must be in (0, 0.10]');
  }
  return Math.round(annualSpend / withdrawalRate);
}

/**
 * Mortgage monthly payment (principal + interest) for a fixed-rate loan.
 * @param principal     Loan amount.
 * @param annualRate    Annualised rate as decimal (e.g. 0.045).
 * @param years         Loan term in years.
 */
export function mortgagePayment(principal: number, annualRate: number, years: number): number {
  const r = annualRate / 12;
  const n = years * 12;
  if (r === 0) return Math.round((principal / n) * 100) / 100;
  const m = principal * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  return Math.round(m * 100) / 100;
}

/**
 * Debt-payoff order using the avalanche method (highest APR first) — the
 * mathematically optimal approach. Returns the input debts sorted by
 * descending APR with running totals.
 */
export interface Debt { name: string; balance: number; apr: number; minimumPayment: number; }
export function avalancheOrder(debts: Debt[]): Array<Debt & { rank: number }> {
  return [...debts]
    .sort((a, b) => b.apr - a.apr)
    .map((d, i) => ({ ...d, rank: i + 1 }));
}

/**
 * Snowball-method order (smallest balance first) — psychologically motivating
 * but mathematically suboptimal. Useful when the user prioritises behavioural
 * momentum over interest savings.
 */
export function snowballOrder(debts: Debt[]): Array<Debt & { rank: number }> {
  return [...debts]
    .sort((a, b) => a.balance - b.balance)
    .map((d, i) => ({ ...d, rank: i + 1 }));
}

/**
 * Required monthly contribution to reach a target by a deadline,
 * given an expected return rate and current balance.
 */
export function requiredMonthlyContribution(
  current: number,
  target: number,
  annualReturn: number,
  years: number,
): number {
  if (years <= 0) return Math.max(0, target - current);
  const r = annualReturn / 12;
  const n = years * 12;
  const fvOfCurrent = current * Math.pow(1 + r, n);
  const remaining   = Math.max(0, target - fvOfCurrent);
  if (r === 0) return Math.round((remaining / n) * 100) / 100;
  const m = remaining * r / (Math.pow(1 + r, n) - 1);
  return Math.round(m * 100) / 100;
}

// ── DB-bound functions ────────────────────────────────────────────────

export function createFinanceCategoryService(db: DatabaseAdapter) {

  async function listWatchlist(userId = 'default'): Promise<FinanceWatchlistEntry[]> {
    return await db.all<FinanceWatchlistEntry>(
      'SELECT * FROM finance_watchlist WHERE user_id = ? ORDER BY added_at DESC',
      userId,
    );
  }

  async function addWatchlist(entry: Omit<FinanceWatchlistEntry, 'id' | 'added_at'>): Promise<string> {
    const id = `fw_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    await db.run(
      `INSERT INTO finance_watchlist (id, user_id, symbol, name, asset_type, currency, target_price, notes)
         VALUES (?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING`,
      id, entry.user_id, entry.symbol.toUpperCase(),
      entry.name, entry.asset_type ?? 'stock', entry.currency ?? 'USD',
      entry.target_price, entry.notes,
    );
    return id;
  }

  async function listGoals(userId = 'default'): Promise<FinanceGoal[]> {
    const rows = await db.all<FinanceGoal & { parameters: string | Record<string, unknown> }>(
      'SELECT * FROM finance_goals WHERE user_id = ? ORDER BY created_at DESC',
      userId,
    );
    return rows.map(g => ({
      ...g,
      parameters: typeof g.parameters === 'string' ? JSON.parse(g.parameters || '{}') : (g.parameters ?? {}),
    }));
  }

  /**
   * Compute the projection summary for a goal: how on-track it is at
   * current contribution rate, and what the gap is.
   */
  async function projectGoal(goalId: string, expectedReturn = 0.05): Promise<{
    onTrack: boolean;
    projectedAtTarget: number;
    gap: number;
    requiredMonthly: number;
  } | null> {
    const goal = (await db.get<FinanceGoal>('SELECT * FROM finance_goals WHERE id = ?', goalId)) ?? null;
    if (!goal || !goal.target_amount || !goal.target_date) return null;
    const monthsToTarget = monthsBetween(new Date(), new Date(goal.target_date));
    if (monthsToTarget <= 0) return null;
    const projectedAtTarget = compoundInterest(
      goal.current_amount,
      goal.monthly_contribution ?? 0,
      expectedReturn,
      monthsToTarget / 12,
    ).finalBalance;
    const gap = Math.max(0, goal.target_amount - projectedAtTarget);
    const requiredMonthly = requiredMonthlyContribution(
      goal.current_amount,
      goal.target_amount,
      expectedReturn,
      monthsToTarget / 12,
    );
    return {
      onTrack: gap === 0,
      projectedAtTarget,
      gap,
      requiredMonthly,
    };
  }

  return {
    listWatchlist,
    addWatchlist,
    listGoals,
    projectGoal,
  };
}

export type FinanceCategoryService = ReturnType<typeof createFinanceCategoryService>;

// ── helpers ──────────────────────────────────────────────────────────

function monthsBetween(from: Date, to: Date): number {
  return Math.max(0, (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth()));
}
