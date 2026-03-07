/**
 * RATE-04: Async audit logging queue.
 * Batches audit_log INSERT calls every 5 seconds instead of per-request synchronous writes.
 * Falls back to immediate write if queue is too large (> 100 pending entries).
 */

import type Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import { childLogger } from '../lib/logger.js';
import type { AuditEntry } from './auditLogger.js';

const log = childLogger('audit-queue');

const FLUSH_INTERVAL_MS = Number(process.env.AUDIT_FLUSH_INTERVAL_MS) || 5_000;
const MAX_QUEUE_SIZE    = Number(process.env.AUDIT_MAX_QUEUE_SIZE)    || 100;

let db: Database.Database | null = null;
let queue: AuditEntry[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;

export function initAuditQueue(database: Database.Database): void {
  db = database;
  if (flushTimer) clearInterval(flushTimer);
  flushTimer = setInterval(flush, FLUSH_INTERVAL_MS);
  // Don't keep Node process alive just for flushing
  flushTimer.unref?.();
  log.info({ flushIntervalMs: FLUSH_INTERVAL_MS }, 'Audit queue initialised');
}

export function enqueueAudit(entry: AuditEntry): void {
  if (!db) return;
  queue.push(entry);
  // Emergency flush when queue grows too large
  if (queue.length >= MAX_QUEUE_SIZE) flush();
}

function flush(): void {
  if (!db || queue.length === 0) return;

  const batch = queue.splice(0, queue.length);
  try {
    const insert = db.prepare(`
      INSERT INTO audit_log (
        id, session_id, module_id, area_id, model, provider, thinking_level,
        creativity, writing_tone, emoji_enabled, structured_reasoning,
        transparency_level, knowledge_sources_used, input_token_count,
        output_token_count, cached_tokens, cache_creation_tokens,
        estimated_cost_usd, response_status, seed, user_id,
        rag_chunks, system_prompt_version_id
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?
      )
    `);

    const insertMany = db.transaction((entries: AuditEntry[]) => {
      for (const e of entries) {
        try {
          insert.run(
            randomUUID(),
            e.sessionId ?? null,
            e.moduleId ?? null,
            e.areaId ?? null,
            e.model,
            e.provider ?? 'anthropic',
            e.thinkingLevel ?? null,
            e.creativity ?? null,
            e.writingTone ?? null,
            e.emojiEnabled ? 1 : 0,
            e.structuredReasoning ? 1 : 0,
            e.transparencyLevel ?? 0,
            e.knowledgeSourcesUsed ? JSON.stringify(e.knowledgeSourcesUsed) : null,
            e.inputTokenCount ?? 0,
            e.outputTokenCount ?? 0,
            e.cachedTokens ?? 0,
            e.cacheCreationTokens ?? 0,
            e.estimatedCostUsd ?? 0,
            e.responseStatus ?? 'success',
            e.seed ?? null,
            e.userId ?? null,
            e.ragChunks ?? null,
            e.systemPromptVersionId ?? null,
          );
        } catch (rowErr) {
          // Non-fatal — skip bad row
          log.warn({ err: rowErr }, 'Failed to insert audit entry (skipped)');
        }
      }
    });

    insertMany(batch);
    log.debug({ count: batch.length }, 'Audit queue flushed');
  } catch (err) {
    log.error({ err, dropped: batch.length }, 'Audit queue flush failed — entries dropped');
  }
}

/** Flush remaining entries on graceful shutdown. */
export function flushAuditQueue(): void {
  flush();
}
