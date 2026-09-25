/**
 * llm-spend.ts — the spend ledger and the daily USD caps for priced model calls.
 *
 * A compat:<slug>:<model> run used to record a NULL cost, so neither the monthly
 * cap nor anything else could see what an OpenRouter key was spending. Now every
 * priced compat call writes one llm_spend_ledger row (migration 288): the cost
 * the endpoint reported (OpenRouter's usage.cost), or, when it reports none, the
 * admin's per-endpoint prices times the tokens.
 *
 * Two caps read the ledger, both per UTC day and both off when unset:
 *   LLM_DAILY_SPEND_CAP_USD       — the whole instance.
 *   LLM_USER_DAILY_SPEND_CAP_USD  — each user, taken from the request context
 *                                   (server/lib/request-context.ts). Admins are
 *                                   exempt from this one, not from the first.
 * assertSpendAllowed() is called at the entry of both routers and in the Work
 * route before a priced call is dispatched.
 *
 * 2026-09-25 (review C1/C9): a run that was aborted, timed out or failed
 * part-way wrote no row at all — the adapter recorded spend only when a reply
 * finished — so closing the connection before the last chunk got past every
 * cap while OpenRouter still billed the prompt and the tokens generated. Now a
 * priced call reserves its worst case before it is sent (reserveSpend: a
 * 'reserved' row, the caps read with every other call in flight counted), and
 * the row is settled afterwards to the reported cost, the priced usage, or —
 * for a call cut short — an estimate ('estimated'), which OpenRouter's own
 * figure replaces when it can be fetched. Concurrent calls can no longer all
 * pass at the same settled total. The OpenRouter key limit stays the hard stop.
 *
 * cost_source values: 'reported' (the endpoint's usage.cost or its generation
 * record), 'endpoint_price' (tokens × the endpoint's prices), 'estimated'
 * (a call cut short, priced from the request size and the text received),
 * 'reserved' (a call still in flight, at its worst case).
 *
 * A cap value that cannot be read ("0,25", "$3") is not silently "no cap":
 * it is logged, and in demo mode priced calls are refused until it is fixed
 * (llm-spend-cap-env.ts).
 */

import type { DatabaseAdapter } from '../db/database.js';
import { currentRequestContext } from '../lib/request-context.js';
import { getRouterDb } from './compat-endpoint.js';
import { parseSpendCap, invalidSpendCapVars, invalidSpendCapMessage } from './llm-spend-cap-env.js';

export type SpendCostSource = 'reported' | 'endpoint_price' | 'estimated' | 'reserved';

export interface SpendEntry {
  /** The full model id as ANTON names it, e.g. compat:openrouter:z-ai/glm-5.3-flash. */
  model: string;
  costUsd: number;
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  source: SpendCostSource;
  /** Undefined = take it from the request context; null = no user. */
  userId?: string | null;
  purpose?: string | null;
  sessionId?: string | null;
}

let warnedNoDb = false;

/**
 * Write one ledger row. Never throws — a failed write is logged and the
 * answer the call produced is still returned to its caller.
 */
export async function recordSpend(entry: SpendEntry, db?: DatabaseAdapter): Promise<boolean> {
  if (!Number.isFinite(entry.costUsd) || entry.costUsd < 0) return false;
  const target = db ?? getRouterDb();
  if (!target) {
    if (!warnedNoDb) {
      warnedNoDb = true;
      console.warn('[llm-spend] no database registered (setRouterDb) — priced calls are not being recorded');
    }
    return false;
  }
  const ctx = currentRequestContext();
  const userId = entry.userId !== undefined ? entry.userId : (ctx?.userId ?? null);
  const sessionId = entry.sessionId !== undefined ? entry.sessionId : (ctx?.sessionId ?? null);
  try {
    await target.run(
      `INSERT INTO llm_spend_ledger
         (user_id, model, cost_usd, input_tokens, output_tokens, reasoning_tokens, cost_source, purpose, session_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      userId,
      entry.model,
      entry.costUsd,
      Math.max(0, Math.round(entry.inputTokens ?? 0)),
      Math.max(0, Math.round(entry.outputTokens ?? 0)),
      Math.max(0, Math.round(entry.reasoningTokens ?? 0)),
      entry.source,
      entry.purpose ?? null,
      sessionId,
    );
    return true;
  } catch (err) {
    console.warn('[llm-spend] ledger write failed:', err instanceof Error ? err.message : String(err));
    return false;
  }
}

export interface EndpointPricing {
  inputPerMillion: number;
  outputPerMillion: number;
}

/** USD for a call at the endpoint's prices, or null when it has none. */
export function priceFromEndpoint(
  pricing: EndpointPricing | null | undefined,
  inputTokens: number,
  outputTokens: number,
): number | null {
  if (!pricing) return null;
  const { inputPerMillion, outputPerMillion } = pricing;
  if (!Number.isFinite(inputPerMillion) || !Number.isFinite(outputPerMillion)) return null;
  return ((inputTokens || 0) * inputPerMillion + (outputTokens || 0) * outputPerMillion) / 1_000_000;
}

// ── Caps ────────────────────────────────────────────────────────

export interface SpendCaps {
  instanceDailyUsd: number | null;
  userDailyUsd: number | null;
}

/** The two caps; unset, 0 and unreadable values all read as no cap here (see refuseOnInvalidCaps). */
export function readSpendCaps(env: Readonly<Record<string, string | undefined>> = process.env): SpendCaps {
  return {
    instanceDailyUsd: parseSpendCap(env.LLM_DAILY_SPEND_CAP_USD).value,
    userDailyUsd: parseSpendCap(env.LLM_USER_DAILY_SPEND_CAP_USD).value,
  };
}

function isDemoModeEnv(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return String(env.DEMO_MODE ?? '').trim().toLowerCase() === 'true';
}

/**
 * What to log at boot about the cap variables (names only, never values):
 * each one set to something that is not a number.
 */
export function spendCapConfigWarnings(env: Readonly<Record<string, string | undefined>> = process.env): string[] {
  return invalidSpendCapVars(env).map((name) => `${invalidSpendCapMessage(name)} — ${isDemoModeEnv(env)
    ? 'priced model calls are refused until it is fixed (demo mode)'
    : 'it is treated as no cap'}.`);
}

const warnedInvalidCaps = new Set<string>();

/** Test hook — forget which invalid cap variables were already logged. */
export function resetSpendCapWarningsForTests(): void {
  warnedInvalidCaps.clear();
}

/**
 * An unreadable cap is logged once. In demo mode — a public server where the
 * operator relies on the cap — the call is refused instead of run uncapped.
 */
function refuseOnInvalidCaps(): void {
  if (invalidSpendCapVars().length === 0) return;
  for (const line of spendCapConfigWarnings()) {
    if (warnedInvalidCaps.has(line)) continue;
    warnedInvalidCaps.add(line);
    console.warn(`[llm-spend] ${line}`);
  }
  if (isDemoModeEnv()) throw new SpendCapError('instance', CAP_UNCHECKABLE_MESSAGE);
}

/** Midnight UTC at the start of the day `now` falls in. */
export function utcDayStart(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export const INSTANCE_CAP_MESSAGE =
  "Today's AI budget for this demo is used up. It resets at midnight UTC — please try again tomorrow.";
export const USER_CAP_MESSAGE =
  "You have used today's AI budget for your account. It resets at midnight UTC — please try again tomorrow.";
const CAP_UNCHECKABLE_MESSAGE =
  "Today's AI budget could not be checked, so the request was not sent. Please try again later.";

/** A priced call refused because a daily cap is reached. HTTP 402 at a route. */
export class SpendCapError extends Error {
  readonly code = 'DAILY_SPEND_CAP';
  readonly status = 402;
  /** Written for the visitor; shown in production (publicErrorMessage). */
  readonly publicMessage: string;
  constructor(readonly scope: 'instance' | 'user', message: string) {
    super(message);
    this.name = 'SpendCapError';
    this.publicMessage = message;
  }
}

export function isSpendCapError(err: unknown): err is SpendCapError {
  return err instanceof SpendCapError;
}

/** Today's (UTC) spend, instance-wide and for one user. */
export async function spendToday(
  db: DatabaseAdapter,
  userId?: string | null,
  now: Date = new Date(),
): Promise<{ instanceUsd: number; userUsd: number | null }> {
  const since = utcDayStart(now).toISOString();
  const all = await db.get<{ total: number | string | null }>(
    'SELECT COALESCE(SUM(cost_usd), 0) AS total FROM llm_spend_ledger WHERE created_at >= ?',
    since,
  );
  let userUsd: number | null = null;
  if (userId) {
    const mine = await db.get<{ total: number | string | null }>(
      'SELECT COALESCE(SUM(cost_usd), 0) AS total FROM llm_spend_ledger WHERE user_id = ? AND created_at >= ?',
      userId, since,
    );
    userUsd = Number(mine?.total ?? 0);
  }
  return { instanceUsd: Number(all?.total ?? 0), userUsd };
}

/**
 * Throw SpendCapError when today's spend has reached a cap. No-op when neither
 * cap is set. Fails closed: with a cap set and no readable ledger, the call is
 * refused rather than run unmetered.
 */
export async function assertSpendAllowed(opts: {
  db?: DatabaseAdapter;
  userId?: string | null;
  role?: string | null;
} = {}): Promise<void> {
  refuseOnInvalidCaps();
  const caps = readSpendCaps();
  if (caps.instanceDailyUsd === null && caps.userDailyUsd === null) return;

  const target = opts.db ?? getRouterDb();
  if (!target) throw new SpendCapError('instance', CAP_UNCHECKABLE_MESSAGE);

  const ctx = currentRequestContext();
  const userId = opts.userId !== undefined ? opts.userId : (ctx?.userId ?? null);
  const role = opts.role !== undefined ? opts.role : (ctx?.role ?? null);
  const checkUser = caps.userDailyUsd !== null && !!userId && role !== 'admin';

  let spent: { instanceUsd: number; userUsd: number | null };
  try {
    spent = await spendToday(target, checkUser ? userId : null);
  } catch (err) {
    console.warn('[llm-spend] cap check failed:', err instanceof Error ? err.message : String(err));
    throw new SpendCapError('instance', CAP_UNCHECKABLE_MESSAGE);
  }
  if (caps.instanceDailyUsd !== null && spent.instanceUsd >= caps.instanceDailyUsd) {
    throw new SpendCapError('instance', INSTANCE_CAP_MESSAGE);
  }
  if (checkUser && caps.userDailyUsd !== null && (spent.userUsd ?? 0) >= caps.userDailyUsd) {
    throw new SpendCapError('user', USER_CAP_MESSAGE);
  }
}

// ── Reservations ────────────────────────────────────────────────

/** A ledger row this process holds by id: a reservation, or a row to be corrected later. */
export interface SpendRow {
  readonly id: number;
  /** The cost the row was written with. */
  readonly costUsd: number;
  readonly db: DatabaseAdapter;
}

export interface SpendRowEntry {
  model: string;
  costUsd: number;
  inputTokens?: number;
  outputTokens?: number;
  /** Undefined = take it from the request context; null = no user. */
  userId?: string | null;
  /** Undefined = take it from the request context. Admins skip the per-user cap. */
  role?: string | null;
  purpose?: string | null;
  sessionId?: string | null;
}

async function insertRow(
  target: DatabaseAdapter,
  entry: SpendRowEntry,
  source: SpendCostSource,
): Promise<SpendRow | null> {
  const ctx = currentRequestContext();
  const userId = entry.userId !== undefined ? entry.userId : (ctx?.userId ?? null);
  const sessionId = entry.sessionId !== undefined ? entry.sessionId : (ctx?.sessionId ?? null);
  try {
    const row = await target.get<{ id: number | string }>(
      `INSERT INTO llm_spend_ledger
         (user_id, model, cost_usd, input_tokens, output_tokens, reasoning_tokens, cost_source, purpose, session_id)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)
       RETURNING id`,
      userId,
      entry.model,
      entry.costUsd,
      Math.max(0, Math.round(entry.inputTokens ?? 0)),
      Math.max(0, Math.round(entry.outputTokens ?? 0)),
      source,
      entry.purpose ?? null,
      sessionId,
    );
    const id = Number(row?.id);
    return Number.isFinite(id) && id > 0 ? { id, costUsd: entry.costUsd, db: target } : null;
  } catch (err) {
    console.warn('[llm-spend] ledger write failed:', err instanceof Error ? err.message : String(err));
    return null;
  }
}

/**
 * Reserve a priced call's worst-case cost before it is sent, and refuse it
 * (SpendCapError) when today's spend — settled rows plus every other call
 * still in flight, this call's own reservation left out — has reached a cap.
 * The row is written before the caps are read, so two calls started together
 * each see the other's reservation: they cannot both pass at a total only one
 * of them fits under. Returns null when nothing could be reserved and no cap
 * is set; with a cap set, a reservation that cannot be written refuses the
 * call (fail closed, as assertSpendAllowed does).
 */
export async function reserveSpend(entry: SpendRowEntry, db?: DatabaseAdapter): Promise<SpendRow | null> {
  refuseOnInvalidCaps();
  const caps = readSpendCaps();
  const capped = caps.instanceDailyUsd !== null || caps.userDailyUsd !== null;
  if (!Number.isFinite(entry.costUsd) || entry.costUsd < 0) return null;
  const target = db ?? getRouterDb();
  const reservation = target ? await insertRow(target, entry, 'reserved') : null;
  if (!reservation) {
    if (capped) throw new SpendCapError('instance', CAP_UNCHECKABLE_MESSAGE);
    return null;
  }
  if (!capped) return reservation;

  const ctx = currentRequestContext();
  const userId = entry.userId !== undefined ? entry.userId : (ctx?.userId ?? null);
  const role = entry.role !== undefined ? entry.role : (ctx?.role ?? null);
  const checkUser = caps.userDailyUsd !== null && !!userId && role !== 'admin';
  let spent: { instanceUsd: number; userUsd: number | null };
  try {
    spent = await spendToday(reservation.db, checkUser ? userId : null);
  } catch (err) {
    console.warn('[llm-spend] cap check failed:', err instanceof Error ? err.message : String(err));
    await releaseSpend(reservation);
    throw new SpendCapError('instance', CAP_UNCHECKABLE_MESSAGE);
  }
  if (caps.instanceDailyUsd !== null && spent.instanceUsd - entry.costUsd >= caps.instanceDailyUsd) {
    await releaseSpend(reservation);
    throw new SpendCapError('instance', INSTANCE_CAP_MESSAGE);
  }
  if (checkUser && caps.userDailyUsd !== null && (spent.userUsd ?? 0) - entry.costUsd >= caps.userDailyUsd) {
    await releaseSpend(reservation);
    throw new SpendCapError('user', USER_CAP_MESSAGE);
  }
  return reservation;
}

/**
 * Write a row now that will be corrected later (an unfinished call whose real
 * cost is fetched afterwards). No cap check. Never throws.
 */
export async function openSpendRow(
  entry: SpendRowEntry,
  source: Exclude<SpendCostSource, 'reserved'>,
  db?: DatabaseAdapter,
): Promise<SpendRow | null> {
  if (!Number.isFinite(entry.costUsd) || entry.costUsd < 0) return null;
  const target = db ?? getRouterDb();
  return target ? insertRow(target, entry, source) : null;
}

/**
 * Replace a row's cost with what the call actually came to. Token counts left
 * undefined keep the row's own. Never throws; false when nothing was written.
 */
export async function settleSpend(
  row: SpendRow,
  final: {
    costUsd: number;
    source: Exclude<SpendCostSource, 'reserved'>;
    inputTokens?: number;
    outputTokens?: number;
    reasoningTokens?: number;
  },
): Promise<boolean> {
  if (!Number.isFinite(final.costUsd) || final.costUsd < 0) return false;
  const tokens = (n: number | undefined): number | null => (n === undefined ? null : Math.max(0, Math.round(n)));
  try {
    const result = await row.db.run(
      `UPDATE llm_spend_ledger
          SET cost_usd = ?, cost_source = ?,
              input_tokens = COALESCE(?, input_tokens),
              output_tokens = COALESCE(?, output_tokens),
              reasoning_tokens = COALESCE(?, reasoning_tokens)
        WHERE id = ?`,
      final.costUsd,
      final.source,
      tokens(final.inputTokens),
      tokens(final.outputTokens),
      tokens(final.reasoningTokens),
      row.id,
    );
    return result.changes > 0;
  } catch (err) {
    console.warn('[llm-spend] ledger update failed:', err instanceof Error ? err.message : String(err));
    return false;
  }
}

/** Drop a reservation for a call that was never billed (refused before it ran). Never throws. */
export async function releaseSpend(row: SpendRow): Promise<void> {
  try {
    await row.db.run(`DELETE FROM llm_spend_ledger WHERE id = ? AND cost_source = 'reserved'`, row.id);
  } catch (err) {
    console.warn('[llm-spend] releasing a reservation failed:', err instanceof Error ? err.message : String(err));
  }
}
