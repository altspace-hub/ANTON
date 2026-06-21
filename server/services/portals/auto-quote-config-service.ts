/**
 * auto-quote-config-service.ts — the DB-backed readers the seller auto-quoter
 * (seller-quoter.ts) injects. Kept separate from the quoter core so the core is
 * pure + unit-testable with stubs; this is the thin Postgres adapter.
 *
 * - getAutoQuoteConfig: the seller-private config row (migration 243).
 * - lookupSku:          a per-SKU product row from portal_structured_data
 *                       (kind='product'), reused — no new catalog table.
 * - incrementUsage:     atomic per-portal daily LLM-call counter (single UPSERT
 *                       … ON CONFLICT … RETURNING — TOCTOU-safe under concurrency).
 *
 * All reads are portal_id-scoped. NUMERIC(40,0) columns come back from
 * node-postgres as base-10 strings (µFTC), exactly what the guards expect.
 */
import type { DatabaseAdapter } from '../../db/database.js';
import { isMicro, ftcToMicro } from './seller-quoter.guards.js';
import type { AutoQuoteConfig, SkuRecord, QuoterDeps } from './seller-quoter.js';

interface ConfigRow {
  capability_id: string;
  enabled: boolean;
  floor_micro_ftc: string;
  auto_quote_max_micro_ftc: string | null;
  max_qty_per_order: number | null;
  currency: string;
  catalog_text: string | null;
  autonomy: unknown;
  daily_llm_call_cap: number;
}

export async function getAutoQuoteConfig(
  db: DatabaseAdapter, portalId: string, capabilityId: string,
): Promise<AutoQuoteConfig | null> {
  let row: ConfigRow | undefined;
  try {
    row = await db.get<ConfigRow>(
      `SELECT capability_id, enabled, floor_micro_ftc, auto_quote_max_micro_ftc,
              max_qty_per_order, currency, catalog_text, autonomy, daily_llm_call_cap
         FROM portal_capability_auto_quote
        WHERE portal_id = ? AND capability_id = ?`,
      portalId, capabilityId,
    );
  } catch {
    // Table absent (migration 243 not run yet) or any DB error → treat as
    // no-config so auto-quote is simply OFF (today's human-inbox path). Never
    // let an auto-quote DB error break a portal invoke.
    return null;
  }
  if (!row) return null;
  const autonomy = parseAutonomy(row.autonomy);
  return {
    portalId,
    capabilityId: row.capability_id,
    enabled: !!row.enabled,
    floorMicroFtc: String(row.floor_micro_ftc),
    ...(row.auto_quote_max_micro_ftc != null ? { autoQuoteMaxMicroFtc: String(row.auto_quote_max_micro_ftc) } : {}),
    ...(row.max_qty_per_order != null ? { maxQtyPerOrder: row.max_qty_per_order } : {}),
    currency: 'FTC',
    ...(row.catalog_text ? { catalogText: row.catalog_text } : {}),
    autonomy,
    dailyLlmCallCap: row.daily_llm_call_cap,
  };
}

export async function lookupSku(
  db: DatabaseAdapter, portalId: string, sku: string,
): Promise<SkuRecord | null> {
  const row = await db.get<{ value: unknown }>(
    `SELECT value FROM portal_structured_data
      WHERE portal_id = ? AND kind = 'product' AND key = ?`,
    portalId, sku,
  );
  if (!row) return null;
  const v = (typeof row.value === 'string' ? safeParse(row.value) : row.value) as Record<string, unknown> | null;
  if (!v || typeof v !== 'object') return null;

  // Price: prefer an explicit µFTC string; else convert a priceFtc number.
  let priceMicroFtc: string | undefined;
  if (isMicro(v.priceMicroFtc)) priceMicroFtc = v.priceMicroFtc as string;
  else if (typeof v.priceFtc === 'number' && Number.isFinite(v.priceFtc) && v.priceFtc >= 0) {
    const m = ftcToMicro(v.priceFtc);
    if (isMicro(m)) priceMicroFtc = m;
  }
  const stock = typeof v.stock === 'number' && Number.isFinite(v.stock) ? Math.max(0, Math.floor(v.stock)) : 0;
  return {
    sku,
    priceMicroFtc: priceMicroFtc ?? '0',
    ...(isMicro(v.floorMicroFtc) ? { floorMicroFtc: v.floorMicroFtc as string } : {}),
    stock,
  };
}

/** Atomic per-portal daily counter. Returns the NEW count after incrementing. */
export async function incrementUsage(db: DatabaseAdapter, portalId: string): Promise<number> {
  const row = await db.get<{ llm_calls: number }>(
    `INSERT INTO portal_auto_quote_usage (portal_id, usage_date, llm_calls)
     VALUES (?, CURRENT_DATE, 1)
     ON CONFLICT (portal_id, usage_date)
     DO UPDATE SET llm_calls = portal_auto_quote_usage.llm_calls + 1
     RETURNING llm_calls`,
    portalId,
  );
  return row?.llm_calls ?? 1;
}

/** Bind the DB-backed readers into the QuoterDeps the quoter expects (the `llm`
 *  is supplied separately by the handler). */
export function makeQuoterDbDeps(db: DatabaseAdapter): Omit<QuoterDeps, 'llm'> {
  return {
    getConfig: (portalId, capabilityId) => getAutoQuoteConfig(db, portalId, capabilityId),
    lookupSku: (portalId, sku) => lookupSku(db, portalId, sku),
    incrementUsage: (portalId) => incrementUsage(db, portalId),
  };
}

function parseAutonomy(raw: unknown): AutoQuoteConfig['autonomy'] {
  const o = (typeof raw === 'string' ? safeParse(raw) : raw) as Record<string, unknown> | null;
  if (!o || typeof o !== 'object') return {};
  return { ...(typeof o.requireVisitorIdentity === 'boolean' ? { requireVisitorIdentity: o.requireVisitorIdentity } : {}) };
}

function safeParse(s: string): unknown {
  try { return JSON.parse(s); } catch { return null; }
}
