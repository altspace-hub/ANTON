/**
 * engagement-session-bridge-memory.test.ts — Wave 4b: an engagement
 * iteration feeds memory through the ledger.
 *
 * The bridge already projected an iteration into the session world; it
 * never stored a workflow output, so nothing an engagement produced was
 * learned. Against a fake adapter with output-store and the conclusion
 * writer mocked (no database, no engine):
 *
 *   - storeOutput is called once with the bridged session id as
 *     executionId, workflowId engagement:<id>, stepType
 *     'engagement_iteration', moduleId 'engagement', the engagement's first
 *     domain area, and the iteration's text;
 *   - writeSessionConclusion is called with the hoisted assistant message
 *     id — the same id the INSERT INTO messages … 'assistant' row carries;
 *   - stepName is the workstream title, or 'Iteration <n>' without one;
 *   - a missing / unreadable domain area yields no area, not a crash;
 *   - a store or conclusion writer that fails never fails the bridge.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DatabaseAdapter } from '../../server/db/database.js';
import type { StoreOutputParams } from '../../server/services/output-store.js';
import type { SessionConclusionInput } from '../../server/services/session-conclusion.js';

const storeOutputMock = vi.fn(async (_params: StoreOutputParams) => 'out_1');
const writeConclusionMock = vi.fn(async (_db: unknown, _input: SessionConclusionInput) => ({ written: true }));

vi.mock('../../server/services/output-store.js', () => ({
  createOutputStore: async () => ({ storeOutput: (p: StoreOutputParams) => storeOutputMock(p) }),
}));
vi.mock('../../server/services/session-conclusion.js', () => ({
  writeSessionConclusion: (db: unknown, input: SessionConclusionInput) => writeConclusionMock(db, input),
}));
vi.mock('../../server/types/modelAdapter.js', () => ({
  getModelConfig: async () => null,
}));

import { bridgeIterationToSession, engagementAreaId, type IterationBridgeInput } from '../../server/services/engagement-session-bridge.js';

const LONG_OUTPUT = 'The transaction monitoring workstream found that the current rule set misses structuring below the EUR 10,000 threshold; the deliverable recommends a velocity rule, a 90-day lookback and an MLRO sign-off before the December board meeting.';

interface Fake { db: DatabaseAdapter; runs: Array<{ sql: string; args: unknown[] }> }

function makeDb(opts: { domainAreas?: string | null; selectThrows?: boolean } = {}): Fake {
  const runs: Array<{ sql: string; args: unknown[] }> = [];
  const db = {
    get: async (sql: string) => {
      if (sql.includes('FROM engagements')) {
        if (opts.selectThrows) throw new Error('engagements table unavailable');
        return { domain_areas: opts.domainAreas === undefined ? '["Financial Crime Prevention","Legal"]' : opts.domainAreas };
      }
      return undefined;
    },
    all: async () => [],
    run: async (sql: string, ...args: unknown[]) => {
      runs.push({ sql, args });
      return { changes: 1, lastInsertRowid: 0 };
    },
    exec: async () => undefined,
    transaction: async <T>(fn: (tx: DatabaseAdapter) => Promise<T>) => fn(db as unknown as DatabaseAdapter),
    close: async () => undefined,
  };
  return { db: db as unknown as DatabaseAdapter, runs };
}

function input(overrides: Partial<IterationBridgeInput> = {}): IterationBridgeInput {
  return {
    engagementId: 'eng-1',
    engagementTitle: 'AML Remediation',
    workstreamId: 'ws-1',
    workstreamTitle: 'Transaction Monitoring',
    iterationId: 'iter-1',
    iterationNumber: 2,
    projectId: null,
    userId: 'u-1',
    model: 'sdk:claude-opus-5',
    thinkingLevel: 'think_hard',
    userContent: 'Execute the workstream.',
    outputContent: LONG_OUTPUT,
    thinkingContent: null,
    inputTokens: 10,
    outputTokens: 20,
    ...overrides,
  };
}

function assistantInsert(runs: Fake['runs']): { sql: string; args: unknown[] } {
  const row = runs.find(r => r.sql.includes('INSERT INTO messages') && r.sql.includes("'assistant'"));
  expect(row).toBeTruthy();
  return row!;
}

beforeEach(() => {
  storeOutputMock.mockClear();
  storeOutputMock.mockResolvedValue('out_1');
  writeConclusionMock.mockClear();
  writeConclusionMock.mockResolvedValue({ written: true });
});

describe('bridgeIterationToSession feeds memory', () => {
  it('stores the iteration as an output keyed on the bridged session', async () => {
    const { db, runs } = makeDb();
    const { sessionId } = await bridgeIterationToSession(db, input());

    expect(storeOutputMock).toHaveBeenCalledTimes(1);
    expect(storeOutputMock.mock.calls[0][0]).toEqual({
      executionId: sessionId,
      workflowId: 'engagement:eng-1',
      stepIndex: 2,
      stepType: 'engagement_iteration',
      areaId: 'financial-crime-prevention',
      moduleId: 'engagement',
      outputData: { text: LONG_OUTPUT },
      workflowName: 'Engagement: AML Remediation',
      stepName: 'Transaction Monitoring',
      userId: 'u-1',
    });
    // The session-world rows were still written first.
    expect(runs.some(r => r.sql.includes('INSERT INTO sessions'))).toBe(true);
    expect(runs.some(r => r.sql.startsWith('UPDATE engagement_iterations SET session_id'))).toBe(true);
  });

  it('writes the session conclusion from the hoisted assistant message id', async () => {
    const { db, runs } = makeDb();
    const { sessionId } = await bridgeIterationToSession(db, input());

    const inserted = assistantInsert(runs);
    const assistantMessageId = inserted.args[0];
    expect(typeof assistantMessageId).toBe('string');
    expect(inserted.args[1]).toBe(sessionId);

    expect(writeConclusionMock).toHaveBeenCalledTimes(1);
    expect(writeConclusionMock.mock.calls[0][0]).toBe(db);
    expect(writeConclusionMock.mock.calls[0][1]).toEqual({
      sessionId,
      messageId: assistantMessageId,
      userId: 'u-1',
      moduleId: 'engagement',
      areaId: 'financial-crime-prevention',
      assistantText: LONG_OUTPUT,
    });
  });

  it('names the step after the iteration when there is no workstream', async () => {
    const { db } = makeDb();
    await bridgeIterationToSession(db, input({ workstreamId: null, workstreamTitle: null, iterationNumber: 5 }));
    expect(storeOutputMock.mock.calls[0][0].stepName).toBe('Iteration 5');
    expect(storeOutputMock.mock.calls[0][0].stepIndex).toBe(5);
  });

  it('carries no area when the engagement has no domain areas or the lookup fails', async () => {
    await bridgeIterationToSession(makeDb({ domainAreas: '[]' }).db, input());
    expect(storeOutputMock.mock.calls[0][0].areaId).toBeUndefined();
    expect(writeConclusionMock.mock.calls[0][1].areaId).toBeNull();

    storeOutputMock.mockClear();
    writeConclusionMock.mockClear();
    const { sessionId } = await bridgeIterationToSession(makeDb({ selectThrows: true }).db, input());
    expect(sessionId).toBeTruthy();
    expect(storeOutputMock.mock.calls[0][0].areaId).toBeUndefined();
    expect(writeConclusionMock.mock.calls[0][1].areaId).toBeNull();
  });

  it('a failing store or conclusion writer never fails the bridge', async () => {
    storeOutputMock.mockRejectedValueOnce(new Error('ledger unavailable'));
    writeConclusionMock.mockRejectedValueOnce(new Error('utility model refused'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const { db, runs } = makeDb();
      const { sessionId } = await bridgeIterationToSession(db, input());
      expect(sessionId).toBeTruthy();
      expect(runs.some(r => r.sql.startsWith('UPDATE engagement_iterations SET session_id'))).toBe(true);
      // Both were attempted — the failures were swallowed, not skipped.
      expect(storeOutputMock).toHaveBeenCalledTimes(1);
      expect(writeConclusionMock).toHaveBeenCalledTimes(1);
      // Let the rejected conclusion promise settle so its catch runs here, not after the test.
      await new Promise(r => setTimeout(r, 0));
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('memory feed failed'), 'ledger unavailable');
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('session conclusion failed'), 'utility model refused');
    } finally {
      warn.mockRestore();
    }
  });
});

describe('engagementAreaId', () => {
  it('slugs the first non-empty domain area and passes an area id through', () => {
    expect(engagementAreaId('["Financial Crime Prevention","Legal"]')).toBe('financial-crime-prevention');
    expect(engagementAreaId('["", "  ", "fcp"]')).toBe('fcp');
    expect(engagementAreaId(['Data & Privacy'])).toBe('data-privacy');
  });

  it('is null for nothing, garbage, or non-arrays', () => {
    expect(engagementAreaId('[]')).toBeNull();
    expect(engagementAreaId(null)).toBeNull();
    expect(engagementAreaId(undefined)).toBeNull();
    expect(engagementAreaId('not json')).toBeNull();
    expect(engagementAreaId('{"a":1}')).toBeNull();
    expect(engagementAreaId('["***"]')).toBeNull();
  });
});
