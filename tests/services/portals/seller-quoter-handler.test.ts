/**
 * seller-quoter-handler.test.ts — the auto-quote HOOK in portal-handler.handleInvoke.
 * Uses the same SQL-pattern DB stub as portal-handler-invoke.test.ts (no Postgres)
 * + an INJECTED stub quoter (no LLM/network). Proves:
 *   - auto-quote ON  → the invocation row is written status='responded' + responded_at,
 *     the priced quote is returned to the visitor, and the poll endpoint surfaces it.
 *   - auto-quote OFF → status stays 'pending' + the baseline placeholder output
 *     (today's human-inbox behavior unchanged — the load-bearing regression).
 */
import { describe, it, expect } from 'vitest';
import { createPortalHandler } from '../../../server/services/portals/portal-handler.js';
import type { DatabaseAdapter, RunResult } from '../../../server/db/database.js';
import type { SellerQuoter, AutoQuoteResult } from '../../../server/services/portals/seller-quoter.js';

const ADDRESS = 'kicks.sthlm.portal';

const descriptor: Record<string, unknown> = {
  portal: { displayTitle: 'Kicks', category: 'commerce' },
  capabilities: [{ id: 'cap-ord', verb: 'order', title: 'Order', aapEndpoint: 'orders' }],
};

interface Captured { status?: unknown; respondedAt?: unknown; output?: unknown }

function stubDb(captured: Captured): DatabaseAdapter {
  const ok: RunResult = { changes: 1, lastInsertRowid: 0 };
  return {
    dialect: 'postgresql',
    async get<T>(sql: string, ...params: unknown[]): Promise<T | undefined> {
      if (sql.includes('SELECT origin_endpoint')) return undefined;
      if (sql.includes('SELECT descriptor FROM portal_descriptor_cache')) return { descriptor } as T;
      if (sql.includes('SELECT metadata FROM portals')) return { metadata: null } as T;
      if (sql.includes('FROM portals WHERE namespace')) {
        return { id: 'portal-1', name: 'kicks', namespace: 'sthlm', category: 'commerce', display_title: 'Kicks', status: 'active' } as T;
      }
      if (sql.includes('INSERT INTO portal_capability_invocations')) {
        // params: portalId, capId, verb, aapEndpoint, visitorHash, input, output, responseId, status, respondedAt, metadata
        captured.output = params[6];
        captured.status = params[8];
        captured.respondedAt = params[9];
        return { id: 'inv-1' } as T;
      }
      return undefined;
    },
    async all<T>(): Promise<T[]> { return []; },
    async run(): Promise<RunResult> { return ok; },
    async exec(): Promise<void> { /* noop */ },
    async transaction<T>(fn: (db: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(this); },
    async close(): Promise<void> { /* noop */ },
  };
}

function quoterReturning(result: AutoQuoteResult): SellerQuoter {
  return { tryAutoQuote: async () => result };
}

describe('handleInvoke — seller auto-quote hook', () => {
  it('auto-quote ON: writes status=responded + responded_at and returns the priced quote', async () => {
    const captured: Captured = {};
    const quoter = quoterReturning({
      ok: true, reason: 'auto_quoted',
      output: { orderId: 'order_x', status: 'quoted', currency: 'FTC', amountMicroFtc: '1800000', priceFtc: 1.8, available: true },
    });
    const handler = createPortalHandler(stubDb(captured), { quoter });
    const r = await handler.handleInvoke({ portalAddress: ADDRESS, capabilityId: 'cap-ord', input: { sku: 'AJ43', qty: 1 } });

    expect(r.kind).toBe('invoke_accepted');
    if (r.kind === 'invoke_accepted') {
      expect(r.output.amountMicroFtc).toBe('1800000'); // buyer parseQuote reads this
      expect(r.output.available).toBe(true);
    }
    expect(captured.status).toBe('responded');
    expect(captured.respondedAt).toBeInstanceOf(Date);
    expect(JSON.parse(captured.output as string).amountMicroFtc).toBe('1800000');
  });

  it('FAIL-SAFE: a throwing quoter (e.g. migration 243 not run) falls back to pending, never crashes', async () => {
    const captured: Captured = {};
    const quoter: SellerQuoter = { tryAutoQuote: async () => { throw new Error('relation "portal_capability_auto_quote" does not exist'); } };
    const handler = createPortalHandler(stubDb(captured), { quoter });
    const r = await handler.handleInvoke({ portalAddress: ADDRESS, capabilityId: 'cap-ord', input: { sku: 'AJ43' } });
    expect(r.kind).toBe('invoke_accepted'); // did NOT throw
    expect(captured.status).toBe('pending'); // degraded to the human path
    expect(captured.respondedAt).toBeNull();
  });

  it('auto-quote OFF: status stays pending + the baseline placeholder (today’s behavior)', async () => {
    const captured: Captured = {};
    const quoter = quoterReturning({ ok: false, reason: 'auto_quote_disabled' });
    const handler = createPortalHandler(stubDb(captured), { quoter });
    const r = await handler.handleInvoke({ portalAddress: ADDRESS, capabilityId: 'cap-ord', input: { sku: 'AJ43' } });

    expect(r.kind).toBe('invoke_accepted');
    if (r.kind === 'invoke_accepted') {
      // baseline order output (buildVerbOutput): { orderId, status:'quoted', currency:'EUR' } — no amountMicroFtc
      expect(r.output.amountMicroFtc).toBeUndefined();
      expect(r.output.status).toBe('quoted');
    }
    expect(captured.status).toBe('pending');
    expect(captured.respondedAt).toBeNull();
  });
});
