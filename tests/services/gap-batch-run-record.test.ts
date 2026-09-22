/**
 * gap-batch-run-record.test.ts — a Gap Assessor batch on the agentic engine
 * writes its run record (Wave 5).
 *
 * The batch used to keep only the text of the run. Now the record carries the
 * system prompt as sent, the hash of the user prompt, the hash of the output
 * and the thinking, the engine, the transcript and every tool call — under
 * parent 'gap_batch', id `<assessmentId>:<frameworkId>:<batchIndex>` — and a
 * failed run is recorded as failed before the batch reports the error.
 *
 * The runner is stubbed; the writer's insert is a spy while its pure record
 * builder stays real, so the hashes asserted are the ones that reach the row.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AgenticRunConfig, AgenticEvent } from '../../server/services/sdk-agentic-runner.js';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';
import type { RunArtifactInput } from '../../server/services/run-artifact-writer.js';

const runAgenticMock = vi.fn();
vi.mock('../../server/services/sdk-agentic-runner.js', () => ({
  runAgentic: (config: AgenticRunConfig, onEvent: (e: AgenticEvent) => void) => runAgenticMock(config, onEvent),
  mcpToolName: (n: string) => `mcp__anton__${n}`,
}));
vi.mock('../../server/services/provider-router.js', () => ({
  mapModelToProvider: () => 'sdk:claude-opus-5',
  callChat: vi.fn(async () => { throw new Error('callChat must not be used on the agentic path'); }),
}));
vi.mock('../../server/services/framework-text-retrieval.js', () => ({
  retrieveGroundingText: async (opts: { query: string }) => ({ text: `GROUNDED: ${opts.query}` }),
}));
const writeV2 = vi.fn(async (): Promise<{ id: string } | null> => ({ id: 'run-1' }));
vi.mock('../../server/services/run-artifact-writer.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../server/services/run-artifact-writer.js')>();
  return { ...original, writeRunArtifactV2: (db: DatabaseAdapter, input: RunArtifactInput) => writeV2(db, input) };
});

import { runAssessmentBatch, extractEvidenceItems } from '../../server/services/gap-assessment-engine.js';
import { sha256Hex } from '../../server/services/run-artifact-writer.js';

const contextConfig = {
  entityType: 'Credit institution', jurisdiction: 'Sweden / EU', segments: 'Retail', maturity: 3, concerns: '',
  evidenceItems: [{ name: 'AML Policy v7.pdf', kind: 'document', text: 'The CDD refresh cycle is fixed at three years.' }],
};
const policyId = extractEvidenceItems(contextConfig)[0].docId;
const ARTICLES = [
  { id: 'Art.20', title: 'Customer due diligence', theme: 'Customer Due Diligence', requirement: 'Apply CDD measures.' },
];
const FINDINGS = JSON.stringify([{
  articleId: 'Art.20', articleTitle: 'Customer due diligence', requirement: 'Apply CDD measures.',
  currentState: 'Refresh is not risk-based.',
  criteria: { documented: 'yes', implemented: 'partial', tested: 'no', evidenced: 'yes', ownerAssigned: 'unknown' },
  evidenceRefs: [{ docId: policyId, quote: 'fixed at three years' }],
  notes: 'Cycle is not risk-based.',
}]);
const USAGE = { inputTokens: 1500, outputTokens: 400, cacheReadTokens: 0, cacheCreationTokens: 0 };
const TOOL_CALLS = [
  { id: 1, name: 'read_evidence', input: { doc_id: policyId }, output: 'The CDD refresh cycle is fixed at three years.', isError: false, ms: 12 },
  { id: 2, name: 'search_knowledge', input: { query: 'AMLR Article 20' }, output: 'GROUNDED: AMLR Article 20', isError: false, ms: 30 },
];

const fakeDb = { dialect: 'postgresql', async get() { return undefined; }, async all() { return []; }, async run(): Promise<RunResult> { return { changes: 1, lastInsertRowid: 0 }; } } as unknown as DatabaseAdapter;

beforeEach(() => { runAgenticMock.mockReset(); writeV2.mockClear(); });

describe('runAssessmentBatch — the run record', () => {
  it('writes the record under the assessment batch with the prompt as sent, the hashes, the transcript and the tool calls', async () => {
    runAgenticMock.mockImplementation(async () => ({
      ok: true, text: FINDINGS, thinking: 'weighing the evidence', transcript: ['Reading the policy…', FINDINGS],
      toolCalls: TOOL_CALLS, webSources: [], turns: 3, usage: USAGE,
    }));

    await runAssessmentBatch(null, 'amlr-2024', ARTICLES, contextConfig, 0, 2, 'ORG CONTEXT', 'sdk:claude-opus-5', fakeDb, {
      agentic: { packIds: ['amlr-2024'] },
      runRecord: { assessmentId: 'ga-1', sessionId: 'sess-ga-1' },
    });

    expect(writeV2).toHaveBeenCalledTimes(1);
    const [db, input] = writeV2.mock.calls[0] as unknown as [DatabaseAdapter, RunArtifactInput];
    expect(db).toBe(fakeDb);
    const config = runAgenticMock.mock.calls[0][0] as AgenticRunConfig;

    expect(input.parentKind).toBe('gap_batch');
    expect(input.parentId).toBe('ga-1:amlr-2024:0');
    expect(input.sessionId).toBe('sess-ga-1');
    expect(input.messageId).toBeNull();
    // The prompt the engine was given is the record's composed prompt.
    expect(input.composedPrompt).toBe(config.system);
    expect(input.composedPrompt).toContain('ORG CONTEXT');
    expect(input.composedPrompt).toContain(`[${policyId}]: AML Policy v7.pdf`);
    expect(input.userMessageSha256).toBe(sha256Hex(config.prompt));
    expect(input.outputSha256).toBe(sha256Hex(FINDINGS));
    expect(input.thinkingSha256).toBe(sha256Hex('weighing the evidence'));
    expect(input.engine).toBe('anthropic_sdk');
    expect(input.modelRequested).toBe('sdk:claude-opus-5');
    expect(input.costBasis).toBe('plan_usage');
    expect(input.status).toBe('completed');
    expect(input.usage).toEqual(USAGE);
    expect(input.transcript).toEqual(['Reading the policy…', FINDINGS]);
    expect(input.toolCalls).toEqual([
      { seq: 1, name: 'read_evidence', input: { doc_id: policyId }, output: 'The CDD refresh cycle is fixed at three years.', isError: false, ms: 12 },
      { seq: 2, name: 'search_knowledge', input: { query: 'AMLR Article 20' }, output: 'GROUNDED: AMLR Article 20', isError: false, ms: 30 },
    ]);
    expect(input.requestParams).toMatchObject({
      thinking: config.thinking, maxTurns: 14, webSearch: false, permissionMode: 'dontAsk', turns: 3,
      tools: ['read_evidence', 'search_evidence', 'search_knowledge'],
      framework: 'amlr-2024', batchIndex: 0, totalBatches: 2, articles: ['Art.20'], lane: 'primary', reassessment: false,
    });
  });

  it('records a failed run as failed, then reports the batch error', async () => {
    runAgenticMock.mockImplementation(async () => ({
      ok: false, error: 'SDK engine run failed (error_during_execution)', text: '', thinking: '', transcript: ['partial turn'],
      toolCalls: [{ id: 1, name: 'read_evidence', input: { doc_id: 'doc-nope' }, output: 'No evidence item', isError: true, ms: 3 }],
      webSources: [], turns: 1, usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
    }));
    await expect(runAssessmentBatch(null, 'amlr-2024', ARTICLES, contextConfig, 1, 2, undefined, 'sdk:claude-opus-5', fakeDb, {
      agentic: {}, runRecord: { assessmentId: 'ga-1', lane: 'second_opinion' },
    })).rejects.toThrow(/error_during_execution/);

    expect(writeV2).toHaveBeenCalledTimes(1);
    const input = writeV2.mock.calls[0][1] as unknown as RunArtifactInput;
    expect(input.parentId).toBe('ga-1:amlr-2024:1');
    expect(input.sessionId).toBeNull();
    expect(input.status).toBe('failed');
    expect(input.outputSha256).toBeNull();
    expect(input.transcript).toEqual(['partial turn']);
    expect(input.toolCalls).toHaveLength(1);
    expect(input.toolCalls?.[0].isError).toBe(true);
    expect(input.requestParams).toMatchObject({ error: 'SDK engine run failed (error_during_execution)', lane: 'second_opinion' });
  });

  it("writes under 'unlinked' when the caller names no assessment, and nothing at all without a database", async () => {
    runAgenticMock.mockImplementation(async () => ({
      ok: true, text: FINDINGS, thinking: '', transcript: [FINDINGS], toolCalls: [], webSources: [], turns: 1, usage: USAGE,
    }));
    await runAssessmentBatch(null, 'amlr-2024', ARTICLES, contextConfig, 0, 1, undefined, 'sdk:claude-opus-5', fakeDb, { agentic: {} });
    expect(writeV2).toHaveBeenCalledTimes(1);
    expect((writeV2.mock.calls[0][1] as unknown as RunArtifactInput).parentId).toBe('unlinked:amlr-2024:0');

    writeV2.mockClear();
    await runAssessmentBatch(null, 'amlr-2024', ARTICLES, contextConfig, 0, 1, undefined, 'sdk:claude-opus-5', undefined, {
      agentic: {}, runRecord: { assessmentId: 'ga-1' },
    });
    expect(writeV2).not.toHaveBeenCalled();
  });
});
