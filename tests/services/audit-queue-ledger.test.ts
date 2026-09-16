/**
 * audit-queue-ledger.test.ts — Wave 0 (2026-09-16): the audit ledger records
 * the provider it was given and keeps an unknown cost NULL.
 *
 * Verified on the live instance before this change: `provider` was 'anthropic'
 * on 100% of 7,094 rows (Mistral, Azure and sdk: runs included) because the
 * queue defaulted it and the chat route never passed one; `estimated_cost_usd`
 * was 0 on subscription runs while messages.cost was NULL for the same runs —
 * two ledgers disagreeing about the same call.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { initAuditQueue, enqueueAudit, flushAuditQueue } from '../../server/services/audit-queue.js';
import type { DatabaseAdapter } from '../../server/db/database.js';

/** Positional parameter index of each column in the queue's INSERT. */
const COL = { model: 4, provider: 5, knowledgeSourcesUsed: 12, estimatedCostUsd: 17 } as const;

function fakeDb() {
  const runs: unknown[][] = [];
  const db = {
    run: async (_sql: string, ...params: unknown[]) => { runs.push(params); },
    get: async () => undefined,
    all: async () => [],
  } as unknown as DatabaseAdapter;
  return { db, runs };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('audit queue — provider and cost basis', () => {
  let runs: unknown[][];
  beforeEach(() => {
    const f = fakeDb();
    runs = f.runs;
    initAuditQueue(f.db);
  });

  it('writes the provider it is given (not the historical anthropic default)', async () => {
    enqueueAudit({ model: 'sdk:claude-opus-5', provider: 'anthropic_sdk', knowledgeSourcesUsed: ['Claude built-in knowledge', 'brief.pdf (uploaded)'] });
    flushAuditQueue();
    await tick();
    expect(runs).toHaveLength(1);
    expect(runs[0][COL.model]).toBe('sdk:claude-opus-5');
    expect(runs[0][COL.provider]).toBe('anthropic_sdk');
    expect(JSON.parse(String(runs[0][COL.knowledgeSourcesUsed]))).toEqual(['Claude built-in knowledge', 'brief.pdf (uploaded)']);
  });

  it('keeps an unknown cost NULL instead of 0, and a known cost as given', async () => {
    enqueueAudit({ model: 'sdk:claude-opus-5', provider: 'anthropic_sdk', estimatedCostUsd: undefined });
    enqueueAudit({ model: 'claude-opus-4-8', provider: 'anthropic', estimatedCostUsd: 0.42 });
    flushAuditQueue();
    await tick();
    expect(runs).toHaveLength(2);
    expect(runs[0][COL.estimatedCostUsd]).toBeNull();
    expect(runs[1][COL.estimatedCostUsd]).toBe(0.42);
  });

  it('still defaults provider to anthropic only when a caller passes none', async () => {
    enqueueAudit({ model: 'claude-opus-4-8' });
    flushAuditQueue();
    await tick();
    expect(runs[0][COL.provider]).toBe('anthropic');
  });
});
