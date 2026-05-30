/**
 * portal-llm-suggest.ts — orchestrate one LLM-driven phase suggestion.
 *
 * Flow:
 *   1. Load session, verify it's active
 *   2. Check per-walkthrough cap (16 calls)
 *   3. Build system prompt (engine.generatePhasePrompt) + user message
 *      (prompt-enrichment.buildPhaseUserMessage)
 *   4. Map session.depth → model (haiku / sonnet / opus)
 *   5. Call provider-router.callChat with maxTokens from
 *      walkthrough-depth.maxPhaseOutputTokens
 *   6. Extract JSON, zod-validate against PHASE_SCHEMAS[phase]
 *   7. Persist as a draft (accumulated_state.__drafts.<phase>)
 *   8. Record cost row in portal_walkthrough_llm_calls
 *   9. Return { suggestion, usage } — caller's UI populates the form
 */

import type { Response } from 'express';
import { z } from 'zod';
import type { DatabaseAdapter } from '../../db/database.js';
import { childLogger } from '../../lib/logger.js';
import { callChat, streamChat, mapModelToProvider, type ChatResult } from '../provider-router.js';
import { MODEL_CAPABILITIES } from '../../config/model-capabilities.js';
import {
  createWalkthroughEngine,
  PHASE_SCHEMAS,
  type SessionState,
  type PhaseId,
} from './portal-walkthrough-engine.js';
import { maxPhaseOutputTokens, type WalkthroughDepth } from './walkthrough-depth.js';
import { buildPhaseUserMessage } from './portal-prompt-enrichment.js';

const log = childLogger('portal-llm-suggest');

export const PER_WALKTHROUGH_CAP = 16; // 8 phases × 2 retries

// ── Result types ───────────────────────────────────────────────────────────

export type SuggestResult =
  | {
      kind: 'ok';
      phase: PhaseId;
      suggestion: Record<string, unknown>;
      usage: { inputTokens: number; outputTokens: number; costUsdCents: number; model: string };
    }
  | {
      kind: 'parse_error';
      phase: PhaseId;
      rawText: string;
      reason: string;
      retryable: true;
    }
  | {
      kind: 'shape_error';
      phase: PhaseId;
      partial: unknown;
      zodErrors: Array<{ path: string; message: string }>;
      retryable: true;
    }
  | { kind: 'cap_exceeded'; phase: PhaseId; limit: number }
  | { kind: 'no_provider'; reason: string }
  | { kind: 'session_inactive'; status: string }
  | { kind: 'provider_error'; phase: PhaseId; message: string };

// ── Public API ─────────────────────────────────────────────────────────────

export async function suggestPhase(db: DatabaseAdapter, sessionId: string): Promise<SuggestResult> {
  // 1. Load session.
  const engine = createWalkthroughEngine(db);
  const session = await engine.getSession(sessionId);
  if (!session) {
    return { kind: 'session_inactive', status: 'not_found' };
  }
  if (session.status !== 'active') {
    return { kind: 'session_inactive', status: session.status };
  }

  // 2. Check cap.
  const callsUsedRow = await db.get<{ llm_calls_used: number }>(
    `SELECT llm_calls_used FROM portal_walkthrough_sessions WHERE id = ?`, sessionId,
  );
  const callsUsed = callsUsedRow?.llm_calls_used ?? 0;
  if (callsUsed >= PER_WALKTHROUGH_CAP) {
    log.info({ sessionId, callsUsed }, 'cap_exceeded — refusing further LLM calls');
    return { kind: 'cap_exceeded', phase: session.currentPhase, limit: PER_WALKTHROUGH_CAP };
  }

  // 3. Provider availability — degrade gracefully when no API key configured.
  const provider = detectProvider();
  if (!provider) {
    return { kind: 'no_provider', reason: 'No LLM provider API key configured (set ANTHROPIC_API_KEY or similar)' };
  }

  // 4. Build prompts.
  const phase = session.currentPhase;
  const phasePrompt = await engine.generatePhasePrompt(sessionId);
  const userMessage = buildPhaseUserMessage(session, phase);
  const model = mapDepthToModel(session.depth);
  const maxTokens = maxPhaseOutputTokens(session.depth);

  // First attempt.
  const first = await runOneAttempt(db, sessionId, phase, model, maxTokens, phasePrompt.systemPrompt, userMessage, null);

  // Retry once on retryable failures, if we still have cap budget. ~5-10%
  // of LLM responses fluff the JSON contract; one targeted retry rescues
  // most of them at the cost of a second cap slot.
  if ((first.kind === 'parse_error' || first.kind === 'shape_error') && first.retryable) {
    const after = await db.get<{ llm_calls_used: number }>(
      `SELECT llm_calls_used FROM portal_walkthrough_sessions WHERE id = ?`, sessionId,
    );
    if ((after?.llm_calls_used ?? 0) < PER_WALKTHROUGH_CAP) {
      const retryHint = first.kind === 'parse_error'
        ? `Your previous response could not be parsed as JSON. Output ONLY a single JSON object — no prose, no code fences, no preamble.`
        : `Your previous response was JSON but did not match the phase schema. Errors: ${JSON.stringify(first.zodErrors).slice(0, 300)}. Output a corrected JSON object that addresses every error.`;
      log.info({ sessionId, phase, firstFailureKind: first.kind }, 'retry_after_failure');
      return runOneAttempt(db, sessionId, phase, model, maxTokens, phasePrompt.systemPrompt, userMessage, retryHint);
    }
    // No budget for retry — return the original failure.
  }

  return first;
}

/**
 * One LLM round-trip for the current phase. Records a cost row + bumps
 * llm_calls_used regardless of outcome (any provider call costs cap budget).
 * Returns a fully-formed SuggestResult — caller decides whether to retry.
 *
 * `retryHint`, when set, is appended to the system prompt and signals this is
 * the second attempt. Recorded as 'ok-retry' / 'parse_error-retry' / etc. in
 * the cost rows for audit clarity.
 */
async function runOneAttempt(
  db: DatabaseAdapter,
  sessionId: string,
  phase: PhaseId,
  model: string,
  maxTokens: number,
  systemPrompt: string,
  userMessage: string,
  retryHint: string | null,
): Promise<SuggestResult> {
  const isRetry = retryHint !== null;
  const statusSuffix = isRetry ? '-retry' : '';
  const fullSystem = systemPrompt
    + '\n\nIMPORTANT: Output must be ONLY a single JSON object that validates against the phase schema. No prose, no code fences, no preamble.'
    + (retryHint ? `\n\nRETRY: ${retryHint}` : '');

  let chatResult: ChatResult;
  try {
    chatResult = await callChat({
      model: mapModelToProvider(model),
      system: fullSystem,
      messages: [{ role: 'user', content: userMessage }],
      maxTokens,
      thinkingLevel: 'think',
      db,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error({ sessionId, phase, model, isRetry, err: message }, 'provider_error');
    await recordCallRow(db, sessionId, phase, model, `provider_error${statusSuffix}`, 0, 0, 0, message);
    return { kind: 'provider_error', phase, message };
  }

  const costUsdCents = estimateCostCents(model, chatResult.inputTokens, chatResult.outputTokens);

  // Extract JSON.
  const extracted = extractJsonObject(chatResult.text);
  if (!extracted) {
    log.warn({ sessionId, phase, isRetry, rawSnippet: chatResult.text.slice(0, 200) }, 'parse_error');
    await recordCallRow(db, sessionId, phase, model, `parse_error${statusSuffix}`,
      chatResult.inputTokens, chatResult.outputTokens, costUsdCents,
      'no JSON object found in response');
    await bumpCallsUsed(db, sessionId);
    return { kind: 'parse_error', phase, rawText: chatResult.text, reason: 'no JSON object found in response', retryable: true };
  }

  // Validate.
  const schema = PHASE_SCHEMAS[phase];
  const parsed = schema.safeParse(extracted);
  if (!parsed.success) {
    const zodErrors = parsed.error.issues.map((i) => ({
      path: (i.path as ReadonlyArray<unknown>).join('.') || '<root>',
      message: i.message,
    }));
    log.warn({ sessionId, phase, isRetry, zodErrors }, 'shape_error');
    await recordCallRow(db, sessionId, phase, model, `shape_error${statusSuffix}`,
      chatResult.inputTokens, chatResult.outputTokens, costUsdCents,
      JSON.stringify(zodErrors).slice(0, 500));
    await bumpCallsUsed(db, sessionId);
    return { kind: 'shape_error', phase, partial: extracted, zodErrors, retryable: true };
  }

  // Persist as draft.
  await persistDraft(db, sessionId, phase, parsed.data as Record<string, unknown>);

  // Record cost + bump cap counter.
  await recordCallRow(db, sessionId, phase, model, `ok${statusSuffix}`,
    chatResult.inputTokens, chatResult.outputTokens, costUsdCents, null);
  await bumpCallsUsed(db, sessionId);

  log.info({
    sessionId, phase, model, isRetry,
    inputTokens: chatResult.inputTokens, outputTokens: chatResult.outputTokens,
    costUsdCents,
  }, 'suggest_ok');

  return {
    kind: 'ok',
    phase,
    suggestion: parsed.data as Record<string, unknown>,
    usage: {
      inputTokens: chatResult.inputTokens,
      outputTokens: chatResult.outputTokens,
      costUsdCents,
      model,
    },
  };
}

/**
 * Streaming variant of suggestPhase. Emits SSE events as the LLM tokens
 * arrive, then a final `event: complete` with the validated suggestion (or
 * `event: error` with the failure shape). Use only for content_generation
 * (or future long-output phases) — short phases don't benefit and the
 * synchronous endpoint is simpler.
 *
 * SSE event vocabulary on the wire:
 *   - text_delta / thinking_delta — emitted by streamChat itself
 *   - event: complete + JSON  — final success payload (suggestion + usage)
 *   - event: error + JSON     — final failure (kind + retryable + details)
 *   - event: aborted + JSON   — cap/provider/session pre-flight failure
 *
 * The caller is responsible for headers + final `data: [DONE]` / res.end().
 */
export async function suggestPhaseStream(
  db: DatabaseAdapter,
  sessionId: string,
  res: Response,
): Promise<void> {
  // Pre-flight checks. These don't stream — the caller has already set SSE
  // headers, so we emit a single `event: aborted` and return.
  const engine = createWalkthroughEngine(db);
  const session = await engine.getSession(sessionId);
  if (!session) {
    return writeSseEvent(res, 'aborted', { kind: 'session_inactive', status: 'not_found' });
  }
  if (session.status !== 'active') {
    return writeSseEvent(res, 'aborted', { kind: 'session_inactive', status: session.status });
  }
  const callsUsedRow = await db.get<{ llm_calls_used: number }>(
    `SELECT llm_calls_used FROM portal_walkthrough_sessions WHERE id = ?`, sessionId,
  );
  if ((callsUsedRow?.llm_calls_used ?? 0) >= PER_WALKTHROUGH_CAP) {
    return writeSseEvent(res, 'aborted', { kind: 'cap_exceeded', limit: PER_WALKTHROUGH_CAP });
  }
  if (!detectProvider()) {
    return writeSseEvent(res, 'aborted', {
      kind: 'no_provider',
      reason: 'No LLM provider API key configured (set ANTHROPIC_API_KEY or similar)',
    });
  }

  const phase = session.currentPhase;
  const phasePrompt = await engine.generatePhasePrompt(sessionId);
  const userMessage = buildPhaseUserMessage(session, phase);
  const model = mapDepthToModel(session.depth);
  const maxTokens = maxPhaseOutputTokens(session.depth);

  let chatResult: ChatResult;
  try {
    chatResult = await streamChat({
      model: mapModelToProvider(model),
      system: phasePrompt.systemPrompt + '\n\nIMPORTANT: Output must be ONLY a single JSON object that validates against the phase schema. No prose, no code fences, no preamble.',
      messages: [{ role: 'user', content: userMessage }],
      maxTokens,
      thinkingLevel: 'think',
      db,
    }, res);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error({ sessionId, phase, model, err: message }, 'provider_error_stream');
    await recordCallRow(db, sessionId, phase, model, 'provider_error', 0, 0, 0, message);
    return writeSseEvent(res, 'error', { kind: 'provider_error', phase, message });
  }

  const costUsdCents = estimateCostCents(model, chatResult.inputTokens, chatResult.outputTokens);

  const extracted = extractJsonObject(chatResult.text);
  if (!extracted) {
    log.warn({ sessionId, phase, rawSnippet: chatResult.text.slice(0, 200) }, 'parse_error_stream');
    await recordCallRow(db, sessionId, phase, model, 'parse_error',
      chatResult.inputTokens, chatResult.outputTokens, costUsdCents,
      'no JSON object found in stream');
    await bumpCallsUsed(db, sessionId);
    return writeSseEvent(res, 'error', {
      kind: 'parse_error', phase, reason: 'no JSON object found in stream', retryable: true,
    });
  }

  const schema = PHASE_SCHEMAS[phase];
  const parsed = schema.safeParse(extracted);
  if (!parsed.success) {
    const zodErrors = parsed.error.issues.map((i) => ({
      path: (i.path as ReadonlyArray<unknown>).join('.') || '<root>',
      message: i.message,
    }));
    log.warn({ sessionId, phase, zodErrors }, 'shape_error_stream');
    await recordCallRow(db, sessionId, phase, model, 'shape_error',
      chatResult.inputTokens, chatResult.outputTokens, costUsdCents,
      JSON.stringify(zodErrors).slice(0, 500));
    await bumpCallsUsed(db, sessionId);
    return writeSseEvent(res, 'error', {
      kind: 'shape_error', phase, zodErrors, retryable: true,
    });
  }

  await persistDraft(db, sessionId, phase, parsed.data as Record<string, unknown>);
  await recordCallRow(db, sessionId, phase, model, 'ok',
    chatResult.inputTokens, chatResult.outputTokens, costUsdCents, null);
  await bumpCallsUsed(db, sessionId);

  log.info({
    sessionId, phase, model, mode: 'stream',
    inputTokens: chatResult.inputTokens, outputTokens: chatResult.outputTokens,
    costUsdCents,
  }, 'suggest_ok_stream');

  writeSseEvent(res, 'complete', {
    phase,
    suggestion: parsed.data,
    usage: {
      inputTokens: chatResult.inputTokens,
      outputTokens: chatResult.outputTokens,
      costUsdCents,
      model,
    },
  });
}

function writeSseEvent(res: Response, name: string, payload: unknown): void {
  res.write(`event: ${name}\ndata: ${JSON.stringify(payload)}\n\n`);
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Map walkthrough depth bucket to the canonical Anthropic model. The
 * provider-router will further translate this if a non-Anthropic provider
 * is configured.
 */
export function mapDepthToModel(depth: WalkthroughDepth): string {
  switch (depth) {
    case 'simple': return 'claude-haiku-4-5-20251001';
    case 'standard': return 'claude-sonnet-4-6';
    case 'deep': return 'claude-opus-4-8';
  }
}

/**
 * Detect a configured provider. We check the canonical env vars; the
 * provider-router does its own resolution at call time, but failing fast
 * here avoids a long round-trip just to discover there's no key.
 */
function detectProvider(): string | null {
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.MISTRAL_API_KEY) return 'mistral';
  if (process.env.OPENAI_API_KEY) return 'openai';
  if (process.env.GOOGLE_API_KEY) return 'google';
  if (process.env.OLLAMA_BASE_URL) return 'ollama';
  return null;
}

/**
 * Cost estimate in USD cents (as a numeric string compatible with NUMERIC).
 * Uses the cached pricing table; pre-multiplied by 100 to keep cents granular.
 */
function estimateCostCents(model: string, inputTokens: number, outputTokens: number): number {
  const caps = MODEL_CAPABILITIES[model];
  if (!caps) return 0;
  const inputCost = (inputTokens / 1_000_000) * caps.pricing.inputPerMillion * 100;
  const outputCost = (outputTokens / 1_000_000) * caps.pricing.outputPerMillion * 100;
  return Number((inputCost + outputCost).toFixed(4));
}

/**
 * Extract a JSON object from the LLM's response. Handles:
 *   - bare JSON object: {...}
 *   - code-fenced JSON: ```json\n{...}\n```
 *   - leading/trailing prose around the object
 * Returns null if no valid JSON object can be parsed.
 */
function extractJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  // Try direct parse first (LLM did the right thing).
  if (trimmed.startsWith('{')) {
    try { return JSON.parse(trimmed) as Record<string, unknown>; } catch { /* fall through */ }
  }
  // Strip code fences.
  const fenced = /```(?:json)?\s*\n([\s\S]*?)\n```/m.exec(trimmed);
  if (fenced) {
    try { return JSON.parse(fenced[1]) as Record<string, unknown>; } catch { /* fall through */ }
  }
  // Find first balanced { ... } block.
  const start = trimmed.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(trimmed.slice(start, i + 1)) as Record<string, unknown>; } catch { return null; }
      }
    }
  }
  return null;
}

async function persistDraft(db: DatabaseAdapter, sessionId: string, phase: PhaseId, draft: Record<string, unknown>): Promise<void> {
  const row = await db.get<{ accumulated_state: Record<string, unknown> | string }>(
    `SELECT accumulated_state FROM portal_walkthrough_sessions WHERE id = ?`, sessionId,
  );
  if (!row) return;
  const acc = typeof row.accumulated_state === 'string'
    ? JSON.parse(row.accumulated_state) : row.accumulated_state;
  const drafts = (acc.__drafts as Record<string, unknown> | undefined) ?? {};
  drafts[phase] = draft;
  acc.__drafts = drafts;
  await db.run(
    `UPDATE portal_walkthrough_sessions SET accumulated_state = ? WHERE id = ?`,
    JSON.stringify(acc), sessionId,
  );
}

async function recordCallRow(
  db: DatabaseAdapter, sessionId: string, phase: PhaseId, model: string, status: string,
  inputTokens: number, outputTokens: number, costUsdCents: number, errorMessage: string | null,
): Promise<void> {
  await db.run(
    `INSERT INTO portal_walkthrough_llm_calls
       (session_id, phase_id, model, status, input_tokens, output_tokens, cost_usd_cents, error_message)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    sessionId, phase, model, status, inputTokens, outputTokens, costUsdCents, errorMessage,
  );
}

async function bumpCallsUsed(db: DatabaseAdapter, sessionId: string): Promise<void> {
  await db.run(
    `UPDATE portal_walkthrough_sessions SET llm_calls_used = llm_calls_used + 1 WHERE id = ?`,
    sessionId,
  );
}

// ── Per-capability schema suggestion ────────────────────────────────────────
//
// The Phase-5 capability form is the highest-friction step in the walkthrough
// because users have to define inputSchema + outputSchema (JSON Schema
// concepts) by hand. This helper takes a natural-language description of what
// the portal collects + the chosen verb + accumulated portal context, and
// returns a sensible JSON-Schema pair the user can review / edit / accept.
//
// Costs one cap slot. Validates the LLM output is a real object with both
// schemas before returning.

const CAPABILITY_SCHEMA_OUTPUT = z.object({
  inputSchema: z.record(z.string(), z.unknown()),
  outputSchema: z.record(z.string(), z.unknown()),
  notes: z.string().optional(),
});

export type CapabilitySchemaResult =
  | { kind: 'ok'; inputSchema: Record<string, unknown>; outputSchema: Record<string, unknown>; notes?: string; usage: { inputTokens: number; outputTokens: number; costUsdCents: number; model: string } }
  | { kind: 'parse_error'; rawText: string; reason: string }
  | { kind: 'shape_error'; partial: unknown; zodErrors: Array<{ path: string; message: string }> }
  | { kind: 'cap_exceeded'; limit: number }
  | { kind: 'no_provider'; reason: string }
  | { kind: 'session_inactive'; status: string }
  | { kind: 'provider_error'; message: string };

export async function suggestCapabilitySchema(
  db: DatabaseAdapter,
  sessionId: string,
  args: {
    verb: string;
    capabilityTitle: string;
    capabilityDescription?: string;
    collectionDescription: string;     // "I need their name, pet's name, preferred date, allergies"
  },
): Promise<CapabilitySchemaResult> {
  const engine = createWalkthroughEngine(db);
  const session = await engine.getSession(sessionId);
  if (!session) return { kind: 'session_inactive', status: 'not_found' };
  if (session.status !== 'active') return { kind: 'session_inactive', status: session.status };

  const callsUsedRow = await db.get<{ llm_calls_used: number }>(
    `SELECT llm_calls_used FROM portal_walkthrough_sessions WHERE id = ?`, sessionId,
  );
  const callsUsed = callsUsedRow?.llm_calls_used ?? 0;
  if (callsUsed >= PER_WALKTHROUGH_CAP) {
    return { kind: 'cap_exceeded', limit: PER_WALKTHROUGH_CAP };
  }

  const provider = detectProvider();
  if (!provider) {
    return { kind: 'no_provider', reason: 'No LLM provider API key configured (set ANTHROPIC_API_KEY or similar)' };
  }

  // Pull intent + identity from accumulated state so the schema reflects the
  // portal's actual context (a "book" capability for a haircut studio looks
  // different from a "book" for a tutoring service).
  const intent = (session.accumulatedState.intent ?? {}) as Record<string, unknown>;
  const identity = (session.accumulatedState.identity ?? {}) as Record<string, unknown>;

  const systemPrompt = [
    'You generate JSON Schema (Draft 2020-12) for a single ANTON portal capability.',
    'You output exactly one JSON object with two keys: `inputSchema` and `outputSchema`. Optionally a `notes` string explaining design choices.',
    '',
    '## Rules',
    '- Use `type`, `properties`, `required`, `title`, `description`, `format`, `enum` as needed.',
    '- Recognised formats: "email", "tel", "uri", "date", "time", "date-time".',
    '- For enums use `"enum": [...]` with human-friendly values.',
    '- Mark a field required by adding it to `"required": [...]`.',
    '- Field names: lowercase, snake_case or camelCase.',
    '- `outputSchema` describes what the portal returns to the visitor (typically a confirmation id, status, and friendly message — keep it minimal).',
    '- No examples, no `$schema` declaration, no `$id` — just `type` + `properties` + `required`.',
    '- Match the verb\'s natural semantics:',
    '  - `contact` / `inquire` — message + sender details',
    '  - `order` / `pay` — line items + total + delivery info',
    '  - `book` — date + time + service + party size',
    '  - `subscribe` / `join` — contact + preferences',
    '  - `query` — structured question fields',
    '',
    '## Output contract',
    'Output ONLY this JSON object:',
    '{ "inputSchema": { "type": "object", "properties": {...}, "required": [...] }, "outputSchema": { "type": "object", "properties": {...} }, "notes": "optional one-sentence rationale" }',
    'No prose, no code fences, no preamble.',
  ].join('\n');

  const userMessage = [
    `## Portal context`,
    `Portal: ${(identity.display_title as string) ?? '(unnamed)'}`,
    `Audience: ${(intent.audience as string) ?? '(unspecified)'}`,
    `Problem solved: ${(intent.problem_solved as string) ?? '(unspecified)'}`,
    '',
    `## Capability`,
    `Verb: ${args.verb}`,
    `Title: ${args.capabilityTitle}`,
    args.capabilityDescription ? `Description: ${args.capabilityDescription}` : '',
    '',
    `## What this capability needs to collect`,
    args.collectionDescription,
    '',
    `Generate the inputSchema + outputSchema now.`,
  ].filter(Boolean).join('\n');

  const model = mapDepthToModel(session.depth);

  let chatResult: ChatResult;
  try {
    chatResult = await callChat({
      model: mapModelToProvider(model),
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
      maxTokens: 1500,
      thinkingLevel: 'think',
      db,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error({ sessionId, verb: args.verb, err: message }, 'capability_schema_provider_error');
    await recordCallRow(db, sessionId, session.currentPhase, model, 'provider_error', 0, 0, 0, message);
    return { kind: 'provider_error', message };
  }

  const costUsdCents = estimateCostCents(model, chatResult.inputTokens, chatResult.outputTokens);

  const extracted = extractJsonObject(chatResult.text);
  if (!extracted) {
    await recordCallRow(db, sessionId, session.currentPhase, model, 'parse_error',
      chatResult.inputTokens, chatResult.outputTokens, costUsdCents,
      'capability schema: no JSON object found');
    await bumpCallsUsed(db, sessionId);
    return { kind: 'parse_error', rawText: chatResult.text, reason: 'no JSON object in response' };
  }

  const parsed = CAPABILITY_SCHEMA_OUTPUT.safeParse(extracted);
  if (!parsed.success) {
    const zodErrors = parsed.error.issues.map((i) => ({
      path: (i.path as ReadonlyArray<unknown>).join('.') || '<root>',
      message: i.message,
    }));
    await recordCallRow(db, sessionId, session.currentPhase, model, 'shape_error',
      chatResult.inputTokens, chatResult.outputTokens, costUsdCents,
      JSON.stringify(zodErrors).slice(0, 500));
    await bumpCallsUsed(db, sessionId);
    return { kind: 'shape_error', partial: extracted, zodErrors };
  }

  await recordCallRow(db, sessionId, session.currentPhase, model, 'ok',
    chatResult.inputTokens, chatResult.outputTokens, costUsdCents, null);
  await bumpCallsUsed(db, sessionId);

  log.info({ sessionId, verb: args.verb, costUsdCents }, 'capability_schema_ok');

  return {
    kind: 'ok',
    inputSchema: parsed.data.inputSchema,
    outputSchema: parsed.data.outputSchema,
    notes: parsed.data.notes,
    usage: {
      inputTokens: chatResult.inputTokens,
      outputTokens: chatResult.outputTokens,
      costUsdCents,
      model,
    },
  };
}

/**
 * Returns the cumulative cost for the session (in USD cents) — used by the
 * UI's cost chip in the walkthrough header.
 */
export async function getSessionCostCents(db: DatabaseAdapter, sessionId: string): Promise<number> {
  const row = await db.get<{ total: string | number }>(
    `SELECT COALESCE(SUM(cost_usd_cents), 0)::numeric AS total
     FROM portal_walkthrough_llm_calls WHERE session_id = ?`,
    sessionId,
  );
  return Number(row?.total ?? 0);
}
