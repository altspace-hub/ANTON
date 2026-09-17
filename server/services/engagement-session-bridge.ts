/**
 * engagement-session-bridge.ts — persist an engagement iteration into the
 * session world. (CORE_EXPERIENCE_REVIEW 2026-06, item 4.4 part 2.)
 *
 * Why direct inserts instead of dispatching into the claude.ts route (the
 * rerun.ts "synthetic dispatch" seam): the engagement execute route runs
 * its OWN LLM call with a purpose-built system prompt (scope, client
 * intelligence, RAG retrieval, quality blueprint) and its own SSE event
 * shape. Re-dispatching into /api/claude/query would either re-run the
 * model (double cost, different prompt) or require gutting the engagement
 * prompt assembly. So after the stream completes we insert the
 * session + user-message + assistant-message rows directly — the same
 * columns claude.ts persists (model_id, token_count, cost,
 * config_snapshot) — and link the iteration via
 * engagement_iterations.session_id. Trade-off accepted: run_artifacts /
 * quality scoring are NOT written (those are claude.ts pipeline
 * internals); version history, share links, My Work, the timeline and
 * Trust-Score-over-messages all work because they read sessions/messages.
 *
 * Failure here is non-fatal by design — the iteration row is already
 * saved; the bridge only adds the session-world projection.
 */

import { randomUUID } from 'crypto';
import type { DatabaseAdapter } from '../db/database.js';
import { getModelConfig } from '../types/modelAdapter.js';
import { createOutputStore } from './output-store.js';
import { writeSessionConclusion } from './session-conclusion.js';

/**
 * The area an engagement's atoms belong to: its first domain area as a
 * slug (engagements.domain_areas is free text from the setup form, so
 * "Financial Crime Prevention" becomes 'financial-crime-prevention'; an
 * area id such as 'fcp' passes through unchanged). Null when there is none.
 */
export function engagementAreaId(domainAreasJson: unknown): string | null {
  let parsed: unknown = domainAreasJson;
  if (typeof parsed === 'string') {
    try { parsed = JSON.parse(parsed); } catch { return null; }
  }
  if (!Array.isArray(parsed)) return null;
  const first = parsed.find((d): d is string => typeof d === 'string' && d.trim().length > 0);
  if (!first) return null;
  const slug = first.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return slug || null;
}

export interface IterationBridgeInput {
  engagementId: string;
  engagementTitle: string;
  workstreamId: string | null;
  workstreamTitle: string | null;
  iterationId: string;
  iterationNumber: number;
  projectId: string | null;
  userId: string;
  /** Final (post mapModelToProvider) model id the execution actually used. */
  model: string;
  thinkingLevel: string;
  /** The exact user-turn content sent to the model. */
  userContent: string;
  outputContent: string;
  thinkingContent: string | null;
  inputTokens: number;
  outputTokens: number;
}

export interface IterationBridgeResult {
  sessionId: string;
}

/**
 * Create the bridged session + message pair and link the iteration.
 * Throws on failure — callers wrap in try/catch and treat as non-fatal.
 */
export async function bridgeIterationToSession(
  db: DatabaseAdapter,
  input: IterationBridgeInput,
): Promise<IterationBridgeResult> {
  const sessionId = randomUUID();
  const now = new Date().toISOString();
  const title = `${input.engagementTitle}${input.workstreamTitle ? ` — ${input.workstreamTitle}` : ''} (iteration ${input.iterationNumber})`;

  const config = {
    model: input.model,
    thinking: input.thinkingLevel,
    engagementId: input.engagementId,
    workstreamId: input.workstreamId,
    iterationId: input.iterationId,
  };

  // Best-effort cost from the model registry (same pricing source claude.ts
  // uses). Unknown model (Ollama/compat) → cost stays NULL, honest.
  let cost: number | null = null;
  try {
    const mc = await getModelConfig(input.model, db);
    if (mc) {
      cost = (input.inputTokens * mc.costPer1MInput + input.outputTokens * mc.costPer1MOutput) / 1_000_000;
    }
  } catch { /* cost stays null */ }

  await db.run(
    `INSERT INTO sessions (id, module_id, title, config, project_id, user_id, created_at, updated_at)
     VALUES (?, 'engagement', ?, ?, ?, ?, ?, ?)`,
    sessionId, title.slice(0, 300), JSON.stringify(config),
    input.projectId, input.userId, now, now,
  );

  await db.run(
    `INSERT INTO messages (id, session_id, role, content, created_at)
     VALUES (?, ?, 'user', ?, ?)`,
    randomUUID(), sessionId, input.userContent, now,
  );

  // Hoisted so the conclusion writer can name the message it concludes from.
  const assistantMessageId = randomUUID();
  await db.run(
    `INSERT INTO messages (id, session_id, role, content, thinking_content, token_count, cost, model_id, config_snapshot, created_at)
     VALUES (?, ?, 'assistant', ?, ?, ?, ?, ?, ?, ?)`,
    assistantMessageId, sessionId, input.outputContent,
    input.thinkingContent, input.outputTokens, cost, input.model,
    JSON.stringify(config), now,
  );

  await db.run(
    'UPDATE engagement_iterations SET session_id = ? WHERE id = ?',
    sessionId, input.iterationId,
  );

  await feedIterationMemory(db, input, sessionId, assistantMessageId);

  return { sessionId };
}

/**
 * Wave 4b (2026-09-17): the iteration feeds memory the way a module run
 * does. An engagement iteration is the longest-form output ANTON produces
 * and none of it reached the learning ledger — only the chat route stored
 * an output. The output row is stored here (its pipeline summarises and
 * extracts atoms after the tick and records its progress on the row) and
 * the session's running conclusion is written from the assistant message.
 * Both are non-fatal: the bridged session is already saved.
 */
async function feedIterationMemory(
  db: DatabaseAdapter,
  input: IterationBridgeInput,
  sessionId: string,
  assistantMessageId: string,
): Promise<void> {
  let areaId: string | null = null;
  try {
    const row = await db.get<{ domain_areas: string | null }>(
      'SELECT domain_areas FROM engagements WHERE id = ?', input.engagementId,
    );
    areaId = engagementAreaId(row?.domain_areas);
  } catch { /* the area is a hint, not a requirement */ }

  try {
    const store = await createOutputStore(db);
    await store.storeOutput({
      executionId: sessionId,
      workflowId: `engagement:${input.engagementId}`,
      stepIndex: input.iterationNumber,
      stepType: 'engagement_iteration',
      areaId: areaId ?? undefined,
      moduleId: 'engagement',
      outputData: { text: input.outputContent },
      workflowName: `Engagement: ${input.engagementTitle}`,
      stepName: input.workstreamTitle || `Iteration ${input.iterationNumber}`,
      userId: input.userId,
    });
  } catch (err) {
    console.warn('[engagement-session-bridge] memory feed failed (non-fatal):', err instanceof Error ? err.message : err);
  }

  try {
    // Never rejects by contract; the catch is for a replaced implementation.
    void writeSessionConclusion(db, {
      sessionId,
      messageId: assistantMessageId,
      userId: input.userId,
      moduleId: 'engagement',
      areaId,
      assistantText: input.outputContent,
    }).catch((err: unknown) => {
      console.warn('[engagement-session-bridge] session conclusion failed (non-fatal):', err instanceof Error ? err.message : err);
    });
  } catch (err) {
    console.warn('[engagement-session-bridge] session conclusion failed (non-fatal):', err instanceof Error ? err.message : err);
  }
}
