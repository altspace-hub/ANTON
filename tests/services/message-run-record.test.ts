/**
 * message-run-record.test.ts — the module-run path's record, and failed runs.
 *
 * 2026-09-22 Work QA: module runs wrote run_artifacts with no engine, model,
 * usage or cost (6 records ever, none with any of them), a failed run wrote no
 * record at all, and the failure reached the person as raw provider JSON that
 * the page then offered to export, transform and approve.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { messageRunRecordFields, isSseErrorFrame } from '../../server/services/run-artifact-writer.js';
import { describeRunError, isErrorMessage, ERROR_BUBBLE_PREFIX } from '../../src/lib/run-error';

describe('messageRunRecordFields', () => {
  it('a subscription run: engine anthropic_sdk, plan usage, no dollar figure, usage kept', () => {
    const f = messageRunRecordFields({
      modelRequested: 'sdk:claude-opus-5', modelServed: 'claude-opus-5',
      inputTokens: 7000, outputTokens: 8500, costUsd: 0.4, text: 'answer', status: 'completed',
    });
    expect(f.engine).toBe('anthropic_sdk');
    expect(f.modelRequested).toBe('sdk:claude-opus-5');
    expect(f.modelServed).toBe('claude-opus-5');
    expect(f.costBasis).toBe('plan_usage');
    expect(f.costUsd).toBeNull();
    expect(f.usage).toEqual({ inputTokens: 7000, outputTokens: 8500, cacheReadTokens: 0, cacheCreationTokens: 0 });
    expect(f.outputSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(f.status).toBe('completed');
  });

  it('an API run with list pricing: dollars', () => {
    const f = messageRunRecordFields({ modelRequested: 'claude-opus-5', costUsd: 0.12, inputTokens: 1, outputTokens: 1, status: 'completed' });
    expect(f.engine).toBe('anthropic_api');
    expect(f.costBasis).toBe('usd');
    expect(f.costUsd).toBe(0.12);
  });

  it('a failed run: status failed, no served model, no usage, no output hash', () => {
    const f = messageRunRecordFields({ modelRequested: 'claude-opus-5', status: 'failed' });
    expect(f.status).toBe('failed');
    expect(f.modelServed).toBeNull();
    expect(f.usage).toBeNull();
    expect(f.outputSha256).toBeNull();
  });
});

describe('isSseErrorFrame', () => {
  it('recognises the frame every engine writes for a failure', () => {
    expect(isSseErrorFrame(`data: ${JSON.stringify({ type: 'error', message: 'x' })}\n\n`)).toBe(true);
    expect(isSseErrorFrame(Buffer.from('data: {"type":"error","message":"x"}\n\n'))).toBe(true);
  });
  it('ignores ordinary frames, including text that mentions an error', () => {
    expect(isSseErrorFrame('data: {"type":"text_delta","content":"{\\"type\\":\\"error\\"}"}\n\n')).toBe(false);
    expect(isSseErrorFrame('data: [DONE]\n\n')).toBe(false);
  });
});

describe('describeRunError', () => {
  const credit = '400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."},"request_id":"req_011"}';

  it('an unfunded key: says what to do, then the provider sentence — not the JSON', () => {
    const text = describeRunError(credit);
    expect(text.startsWith(ERROR_BUBBLE_PREFIX)).toBe(true);
    expect(text).toMatch(/no credit left/);
    expect(text).toMatch(/Subscription/);
    expect(text).toMatch(/Details: Your credit balance is too low/);
    expect(text).not.toMatch(/invalid_request_error|"type"/);
  });

  it('a rate limit and an unknown failure get their own advice', () => {
    expect(describeRunError('Too many requests. Please slow down.')).toMatch(/Wait a minute/);
    expect(describeRunError('something odd')).toMatch(/did not complete/);
  });

  it('isErrorMessage recognises the bubble and nothing else', () => {
    expect(isErrorMessage({ role: 'assistant', content: describeRunError(credit) })).toBe(true);
    expect(isErrorMessage({ role: 'assistant', content: 'A real answer' })).toBe(false);
    expect(isErrorMessage({ role: 'user', content: `${ERROR_BUBBLE_PREFIX} typed by a person` })).toBe(false);
  });
});

describe('wiring — a failed run is shown, not treated as output', () => {
  const read = (p: string) => readFileSync(p, 'utf8');
  it('useClaude writes the explained error bubble', () => {
    const hook = read('src/hooks/useClaude.ts');
    expect(hook).toMatch(/content: describeRunError\(event\.message\)/);
    expect(hook).toMatch(/content: describeRunError\(msg\)/);
  });
  it('the module page gates output actions and the version save on it', () => {
    const page = read('src/pages/ModulePage.tsx');
    expect(page).toMatch(/const lastRunFailed = !isStreaming && isErrorMessage\(lastAssistantMessage\);/);
    expect(page).toMatch(/lastRunFailed \? '' :/);
    expect(page).toMatch(/const content = isErrorMessage\(lastMsg\) \? undefined : lastMsg\?\.content;/);
  });
  it('the thread shows it as an alert without quality stats', () => {
    const thread = read('src/components/shared/ConversationThread.tsx');
    expect(thread).toMatch(/msg\.role === 'assistant' && !isErrorMessage\(msg\) && \(\s*<QualityIndicatorBar/);
    expect(thread).toMatch(/role=\{isErrorMessage\(msg\) \? 'alert' : undefined\}/);
  });
  it('the message route records failed runs and full v2 fields', () => {
    const route = read('server/routes/claude.ts');
    expect(route).toMatch(/isSseErrorFrame\(args\[0\]\)/);
    expect(route).toMatch(/messageRunRecordFields\(\{ modelRequested: String\(selectedModel\), status: 'failed' \}\)/);
    expect(route).toMatch(/status: 'completed',\s*\}\),/);
  });
});
