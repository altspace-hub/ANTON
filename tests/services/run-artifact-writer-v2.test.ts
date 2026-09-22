/**
 * run-artifact-writer-v2.test.ts — the run record v2 (Wave 5, migration 277).
 *
 * Against a fake adapter that records every statement (no database):
 *
 *   - writeRunArtifactV2 inserts the 29-column row; with a message id it keeps
 *     ON CONFLICT (message_id) DO NOTHING, without one it inserts plainly;
 *   - tool calls land in run_tool_calls in seq order, output_text capped at
 *     40,000 characters while output_sha256 / output_chars cover the FULL text;
 *   - a message whose record already exists hands back the existing id and
 *     adds no tool calls;
 *   - finalizeRunArtifact patches only what it is given;
 *   - the legacy writeRunArtifact call is unchanged (same first ten params);
 *   - nothing here throws — a failing insert is a null / false, a failing
 *     tool-call insert keeps the record;
 *   - the engine versions come from the installed packages;
 *   - buildAgenticRunArtifactInput hashes the prompt, the output and the
 *     thinking, names the engine, and turns a failed run into a failed record.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';
import {
  writeRunArtifact,
  writeRunArtifactV2,
  finalizeRunArtifact,
  buildAgenticRunArtifactInput,
  sdkEngineVersion,
  apiEngineVersion,
  installedPackageVersion,
  engineForModel,
  sha256Hex,
  MAX_STORED_TOOL_OUTPUT_CHARS,
  MAX_STORED_PROMPT_BYTES,
} from '../../server/services/run-artifact-writer.js';

interface Call { sql: string; params: unknown[] }

function makeFakeDb(opts?: { failRun?: boolean; failToolCalls?: boolean; conflict?: boolean; existingId?: string }) {
  const calls: Call[] = [];
  const gets: Call[] = [];
  const db: DatabaseAdapter = {
    dialect: 'postgresql' as DatabaseAdapter['dialect'],
    async get<T>(sql: string, ...params: unknown[]): Promise<T | undefined> {
      gets.push({ sql, params });
      if (/SELECT id FROM run_artifacts WHERE message_id = \?/.test(sql)) {
        return opts?.existingId ? ({ id: opts.existingId } as T) : undefined;
      }
      return undefined;
    },
    async all<T>(): Promise<T[]> { return []; },
    async run(sql: string, ...params: unknown[]): Promise<RunResult> {
      if (opts?.failRun) throw new Error('relation "run_artifacts" does not exist');
      if (opts?.failToolCalls && /INSERT INTO run_tool_calls/.test(sql)) throw new Error('column "seq" does not exist');
      calls.push({ sql, params });
      const conflicted = opts?.conflict === true && /ON CONFLICT \(message_id\) DO NOTHING/.test(sql);
      return { changes: conflicted ? 0 : 1, lastInsertRowid: 0 };
    },
    async exec() { /* noop */ },
    async transaction<T>(fn: (d: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(db); },
    async close() { /* noop */ },
  };
  return { db, calls, gets };
}

/** Column order of the INSERT, read from the statement itself so the test follows the writer. */
function columnsOf(sql: string): string[] {
  const m = sql.match(/INSERT INTO run_artifacts\s*\(([^)]*)\)/);
  if (!m) throw new Error('not an INSERT INTO run_artifacts');
  return m[1].split(',').map((c) => c.trim());
}

function paramByColumn(call: Call, column: string): unknown {
  const idx = columnsOf(call.sql).indexOf(column);
  if (idx < 0) throw new Error(`column ${column} not in INSERT`);
  return call.params[idx];
}

const USAGE = { inputTokens: 1200, outputTokens: 340, cacheReadTokens: 900, cacheCreationTokens: 0 };

describe('writeRunArtifactV2 — the record row', () => {
  it('writes a non-message record plainly (no ON CONFLICT), with every v2 column', async () => {
    const { db, calls } = makeFakeDb();
    const finished = new Date('2026-09-17T09:30:00Z');
    const written = await writeRunArtifactV2(db, {
      parentKind: 'gap_batch',
      parentId: 'ga-1:amlr-2024:0',
      sessionId: 'sess-1',
      composedPrompt: 'SYSTEM PROMPT',
      engine: 'anthropic_sdk',
      engineVersion: '0.3.229',
      modelRequested: 'sdk:claude-opus-5',
      requestParams: { thinking: 'think_hard', maxTurns: 14, tools: ['read_evidence'] },
      userMessageSha256: sha256Hex('user'),
      outputSha256: sha256Hex('out'),
      thinkingSha256: sha256Hex('think'),
      usage: USAGE,
      costUsd: null,
      costBasis: 'plan_usage',
      status: 'completed',
      transcript: ['turn 1', 'turn 2'],
      finishedAt: finished,
    });
    expect(written).toEqual({ id: expect.any(String) });
    expect(calls).toHaveLength(1);
    const call = calls[0];
    expect(call.sql).toContain('INSERT INTO run_artifacts');
    expect(call.sql).not.toContain('ON CONFLICT');
    const columns = columnsOf(call.sql);
    expect(columns).toHaveLength(29);
    expect((call.sql.match(/\?/g) ?? []).length).toBe(29);
    expect(call.params).toHaveLength(29);

    expect(paramByColumn(call, 'id')).toBe(written!.id);
    expect(paramByColumn(call, 'message_id')).toBeNull();
    expect(paramByColumn(call, 'session_id')).toBe('sess-1');
    expect(paramByColumn(call, 'composed_prompt')).toBe('SYSTEM PROMPT');
    expect(paramByColumn(call, 'prompt_sha256')).toBe(sha256Hex('SYSTEM PROMPT'));
    expect(paramByColumn(call, 'prompt_chars')).toBe('SYSTEM PROMPT'.length);
    expect(paramByColumn(call, 'truncated')).toBe(false);
    expect(paramByColumn(call, 'parent_kind')).toBe('gap_batch');
    expect(paramByColumn(call, 'parent_id')).toBe('ga-1:amlr-2024:0');
    expect(paramByColumn(call, 'engine')).toBe('anthropic_sdk');
    expect(paramByColumn(call, 'engine_version')).toBe('0.3.229');
    expect(paramByColumn(call, 'model_requested')).toBe('sdk:claude-opus-5');
    expect(paramByColumn(call, 'model_served')).toBeNull();
    expect(JSON.parse(String(paramByColumn(call, 'request_params')))).toEqual({ thinking: 'think_hard', maxTurns: 14, tools: ['read_evidence'] });
    expect(paramByColumn(call, 'user_message_sha256')).toBe(sha256Hex('user'));
    expect(paramByColumn(call, 'history_sha256')).toBeNull();
    expect(paramByColumn(call, 'output_sha256')).toBe(sha256Hex('out'));
    expect(paramByColumn(call, 'thinking_sha256')).toBe(sha256Hex('think'));
    expect(JSON.parse(String(paramByColumn(call, 'usage')))).toEqual(USAGE);
    expect(paramByColumn(call, 'cost_usd')).toBeNull();
    expect(paramByColumn(call, 'cost_basis')).toBe('plan_usage');
    expect(paramByColumn(call, 'status')).toBe('completed');
    expect(JSON.parse(String(paramByColumn(call, 'transcript')))).toEqual(['turn 1', 'turn 2']);
    expect(paramByColumn(call, 'finished_at')).toBe(finished.toISOString());
  });

  it('keeps ON CONFLICT (message_id) DO NOTHING for a message-parented record', async () => {
    const { db, calls } = makeFakeDb();
    const written = await writeRunArtifactV2(db, {
      messageId: 'msg-1',
      sessionId: 'sess-1',
      composedPrompt: 'P',
      modelRequested: 'claude-opus-4-8',
      outputSha256: sha256Hex('answer'),
    });
    expect(written).not.toBeNull();
    expect(calls[0].sql).toContain('ON CONFLICT (message_id) DO NOTHING');
    expect(paramByColumn(calls[0], 'message_id')).toBe('msg-1');
    expect(paramByColumn(calls[0], 'parent_kind')).toBe('message');
    expect(paramByColumn(calls[0], 'status')).toBe('completed');
  });

  it('hands back the existing record when the message already has one, and adds no tool calls', async () => {
    const { db, calls } = makeFakeDb({ conflict: true, existingId: 'run-existing' });
    const written = await writeRunArtifactV2(db, {
      messageId: 'msg-1',
      composedPrompt: 'P',
      toolCalls: [{ seq: 1, name: 'search', input: {}, output: 'x', isError: false, ms: 5 }],
    });
    expect(written).toEqual({ id: 'run-existing' });
    expect(calls.filter((c) => /run_tool_calls/.test(c.sql))).toHaveLength(0);
  });

  it('caps the stored prompt at 2 MB and hashes the full prompt, as before', async () => {
    const { db, calls } = makeFakeDb();
    const big = 'B'.repeat(MAX_STORED_PROMPT_BYTES + 10);
    await writeRunArtifactV2(db, { parentKind: 'task_step', parentId: 't:0', composedPrompt: big });
    expect(paramByColumn(calls[0], 'truncated')).toBe(true);
    expect(Buffer.byteLength(String(paramByColumn(calls[0], 'composed_prompt')), 'utf8')).toBeLessThanOrEqual(MAX_STORED_PROMPT_BYTES);
    expect(paramByColumn(calls[0], 'prompt_sha256')).toBe(sha256Hex(big));
    expect(paramByColumn(calls[0], 'prompt_chars')).toBe(big.length);
  });
});

describe('writeRunArtifactV2 — tool calls', () => {
  it('writes run_tool_calls in seq order, capped at 40,000 chars with the sha and length of the FULL output', async () => {
    const { db, calls } = makeFakeDb();
    const huge = 'x'.repeat(MAX_STORED_TOOL_OUTPUT_CHARS + 5_000);
    const written = await writeRunArtifactV2(db, {
      parentKind: 'task_step',
      parentId: 'task-1:0',
      composedPrompt: 'P',
      toolCalls: [
        { seq: 1, name: 'read_document', input: { name: 'policy.pdf' }, output: huge, isError: false, ms: 812.6 },
        { seq: 2, name: 'search_knowledge', input: { query: 'Art 20' }, output: 'boom', isError: true, ms: 40 },
      ],
    });
    const toolInserts = calls.filter((c) => /INSERT INTO run_tool_calls/.test(c.sql));
    expect(toolInserts).toHaveLength(2);

    const [first, second] = toolInserts;
    // (id, run_artifact_id, seq, tool_name, input, output_text, output_sha256, output_chars, is_error, duration_ms, created_at)
    expect(first.params[1]).toBe(written!.id);
    expect(first.params[2]).toBe(1);
    expect(first.params[3]).toBe('read_document');
    expect(JSON.parse(String(first.params[4]))).toEqual({ name: 'policy.pdf' });
    expect((first.params[5] as string).length).toBe(MAX_STORED_TOOL_OUTPUT_CHARS);
    expect(first.params[6]).toBe(sha256Hex(huge));
    expect(first.params[7]).toBe(huge.length);
    expect(first.params[8]).toBe(false);
    expect(first.params[9]).toBe(813);

    expect(second.params[2]).toBe(2);
    expect(second.params[3]).toBe('search_knowledge');
    expect(second.params[5]).toBe('boom');
    expect(second.params[6]).toBe(sha256Hex('boom'));
    expect(second.params[7]).toBe(4);
    expect(second.params[8]).toBe(true);
    expect(second.params[9]).toBe(40);
  });

  it('keeps the record when a tool-call insert fails', async () => {
    const { db, calls } = makeFakeDb({ failToolCalls: true });
    const written = await writeRunArtifactV2(db, {
      parentKind: 'engagement_step',
      parentId: 'it-1',
      composedPrompt: 'P',
      toolCalls: [{ seq: 1, name: 'list_resources', input: {}, output: '', isError: false, ms: 1 }],
    });
    expect(written).toEqual({ id: expect.any(String) });
    expect(calls.filter((c) => /INSERT INTO run_artifacts/.test(c.sql))).toHaveLength(1);
  });
});

describe('finalizeRunArtifact', () => {
  it('patches only the fields given, by id', async () => {
    const { db, calls } = makeFakeDb();
    const ok = await finalizeRunArtifact(db, 'run-1', {
      status: 'interrupted',
      outputSha256: sha256Hex('partial'),
      usage: USAGE,
      finishedAt: '2026-09-17T10:00:00.000Z',
    });
    expect(ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toBe('UPDATE run_artifacts SET status = ?, output_sha256 = ?, usage = ?, finished_at = ? WHERE id = ?');
    expect(calls[0].params).toEqual(['interrupted', sha256Hex('partial'), JSON.stringify(USAGE), '2026-09-17T10:00:00.000Z', 'run-1']);
  });

  it('clears a field given as null and issues nothing for an empty patch', async () => {
    const { db, calls } = makeFakeDb();
    expect(await finalizeRunArtifact(db, 'run-1', {})).toBe(true);
    expect(calls).toHaveLength(0);
    await finalizeRunArtifact(db, 'run-1', { transcript: null, costUsd: 0.42, costBasis: 'usd' });
    expect(calls[0].sql).toBe('UPDATE run_artifacts SET cost_usd = ?, cost_basis = ?, transcript = ? WHERE id = ?');
    expect(calls[0].params).toEqual([0.42, 'usd', null, 'run-1']);
  });
});

describe('writeRunArtifact — the legacy call is unchanged', () => {
  it('returns true and issues the same first ten parameters in the same order', async () => {
    const { db, calls } = makeFakeDb();
    const prompt = 'You are ANTON.';
    const ok = await writeRunArtifact(db, {
      messageId: 'msg-9',
      sessionId: 'sess-9',
      composedPrompt: prompt,
      layerSummary: [{ layer: 'l1', chars: 3, sha256: sha256Hex('abc') }],
      sourceManifest: [{ type: 'builtin', name: 'Claude', contentHashed: false }],
    });
    expect(ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toContain('ON CONFLICT (message_id) DO NOTHING');
    const [id, messageId, sessionId, stored, sha, chars, truncated, layerJson, manifestJson, createdAt] = calls[0].params;
    expect(typeof id).toBe('string');
    expect(messageId).toBe('msg-9');
    expect(sessionId).toBe('sess-9');
    expect(stored).toBe(prompt);
    expect(sha).toBe(sha256Hex(prompt));
    expect(chars).toBe(prompt.length);
    expect(truncated).toBe(false);
    expect(JSON.parse(layerJson as string)).toEqual([{ layer: 'l1', chars: 3, sha256: sha256Hex('abc') }]);
    expect(JSON.parse(manifestJson as string)).toEqual([{ type: 'builtin', name: 'Claude', contentHashed: false }]);
    expect(Number.isNaN(Date.parse(createdAt as string))).toBe(false);
    // v2 defaults for a legacy caller
    expect(paramByColumn(calls[0], 'parent_kind')).toBe('message');
    expect(paramByColumn(calls[0], 'status')).toBe('completed');
  });
});

describe('never throws', () => {
  it('a failing insert is null / false, never an exception', async () => {
    const { db } = makeFakeDb({ failRun: true });
    await expect(writeRunArtifactV2(db, { parentKind: 'gap_batch', parentId: 'x:0', composedPrompt: 'p' })).resolves.toBeNull();
    await expect(writeRunArtifact(db, { messageId: 'm', composedPrompt: 'p' })).resolves.toBe(false);
    await expect(finalizeRunArtifact(db, 'run-1', { status: 'failed' })).resolves.toBe(false);
  });

  it('survives an adapter that is not a database at all', async () => {
    const broken = { async run() { throw new Error('no'); } } as unknown as DatabaseAdapter;
    await expect(writeRunArtifactV2(broken, { composedPrompt: 'p' })).resolves.toBeNull();
    await expect(finalizeRunArtifact(broken, 'id', { status: 'completed' })).resolves.toBe(false);
  });
});

describe('engine versions', () => {
  it('reads the installed Agent SDK and API SDK versions from their package.json', () => {
    const sdkPkg = JSON.parse(readFileSync(join(process.cwd(), 'node_modules/@anthropic-ai/claude-agent-sdk/package.json'), 'utf8')) as { version: string };
    const apiPkg = JSON.parse(readFileSync(join(process.cwd(), 'node_modules/@anthropic-ai/sdk/package.json'), 'utf8')) as { version: string };
    expect(sdkEngineVersion()).toBe(sdkPkg.version);
    expect(apiEngineVersion()).toBe(apiPkg.version);
    expect(sdkEngineVersion()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("answers 'unknown' for a package that is not installed", () => {
    expect(installedPackageVersion('@anthropic-ai/this-package-does-not-exist')).toBe('unknown');
  });
});

describe('engineForModel', () => {
  it('names the engine an id is dispatched to', () => {
    expect(engineForModel('sdk:claude-opus-5')).toBe('anthropic_sdk');
    expect(engineForModel('claude-opus-4-8')).toBe('anthropic_api');
    expect(engineForModel('gpt-4o')).toBe('openai');
    expect(engineForModel('gemini-2.0-flash')).toBe('google');
    expect(engineForModel('mistral-large-latest')).toBe('mistral');
    expect(engineForModel('azure:gpt-4o-deploy')).toBe('azure');
    expect(engineForModel('ollama:llama3')).toBe('ollama');
    expect(engineForModel('')).toBe('unknown');
  });
});

describe('buildAgenticRunArtifactInput', () => {
  const config = {
    model: 'sdk:claude-opus-5',
    thinking: 'think_hard',
    system: 'SYSTEM',
    prompt: 'Execute Step 1',
    tools: [{ name: 'read_document' }, { name: 'search_knowledge' }],
    webSearch: false,
    maxTurns: 12,
  };
  const result = {
    ok: true,
    text: 'The deliverable.',
    thinking: 'reasoning',
    transcript: ['Reading…', 'The deliverable.'],
    toolCalls: [
      { name: 'read_document', input: { name: 'a.pdf' }, output: 'text of a', isError: false, ms: 120 },
      { name: 'search_knowledge', input: { query: 'q' }, output: 'no hits', isError: true, ms: 30 },
    ],
    turns: 3,
    usage: USAGE,
  };

  it('hashes the prompt, the output and the thinking, and names the engine, the plan basis and the tools', () => {
    const input = buildAgenticRunArtifactInput({ parentKind: 'task_step', parentId: 'task-1:0', config, result, requestParams: { attempt: 1 } });
    expect(input.messageId).toBeNull();
    expect(input.parentKind).toBe('task_step');
    expect(input.parentId).toBe('task-1:0');
    expect(input.composedPrompt).toBe('SYSTEM');
    expect(input.userMessageSha256).toBe(sha256Hex('Execute Step 1'));
    expect(input.outputSha256).toBe(sha256Hex('The deliverable.'));
    expect(input.thinkingSha256).toBe(sha256Hex('reasoning'));
    expect(input.engine).toBe('anthropic_sdk');
    expect(input.engineVersion).toBe(sdkEngineVersion());
    expect(input.modelRequested).toBe('sdk:claude-opus-5');
    expect(input.costBasis).toBe('plan_usage');
    expect(input.costUsd).toBeNull();
    expect(input.status).toBe('completed');
    expect(input.usage).toEqual(USAGE);
    expect(input.transcript).toEqual(['Reading…', 'The deliverable.']);
    expect(input.requestParams).toEqual({
      thinking: 'think_hard', maxTurns: 12, timeoutMs: null, webSearch: false,
      tools: ['read_document', 'search_knowledge'], permissionMode: 'dontAsk', turns: 3, attempt: 1,
    });
    expect(input.toolCalls).toEqual([
      { seq: 1, name: 'read_document', input: { name: 'a.pdf' }, output: 'text of a', isError: false, ms: 120 },
      { seq: 2, name: 'search_knowledge', input: { query: 'q' }, output: 'no hits', isError: true, ms: 30 },
    ]);
    expect(input.finishedAt).toBeInstanceOf(Date);
  });

  it('records a failed run as failed with its error, and a capped run as completed with its warning', () => {
    const failed = buildAgenticRunArtifactInput({
      parentKind: 'gap_batch', parentId: 'ga:fw:0', config,
      result: { ...result, ok: false, text: '', thinking: '', error: 'SDK engine run failed (error_during_execution)' },
    });
    expect(failed.status).toBe('failed');
    expect(failed.outputSha256).toBeNull();
    expect(failed.thinkingSha256).toBeNull();
    expect(failed.requestParams?.error).toBe('SDK engine run failed (error_during_execution)');

    const capped = buildAgenticRunArtifactInput({
      parentKind: 'engagement_step', parentId: 'it-1', sessionId: 'sess-b', config,
      result: { ...result, warning: 'The run hit its 12-turn cap; the last answer was kept.' },
    });
    expect(capped.status).toBe('completed');
    expect(capped.sessionId).toBe('sess-b');
    expect(capped.requestParams?.warning).toMatch(/turn cap/);
  });
});
