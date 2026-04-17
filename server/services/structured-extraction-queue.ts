// ── Structured Extraction Queue ──────────────────────────────────────────
//
// Thin bounded-concurrency wrapper around createStructuredExtractor so
// the post-generation hook in /claude/* routes doesn't spawn 100 parallel
// Haiku calls under bursty load.
//
// Also deduplicates in-flight extractions per session_id: if a second
// request arrives for a session whose extraction is still running, we
// return the running promise instead of kicking a second call.
//
// Used by both the streaming and sync claude endpoints so MCP + direct
// callers get the same extraction coverage as the chat UI.

import type { DatabaseAdapter } from '../db/database.js';
import { createStructuredExtractor, type ExtractionInput, type ExtractionResult } from './structured-extractor.js';
import type { ContentType } from '../schemas/content-types/index.js';

const MAX_CONCURRENT = Number(process.env.OTS_EXTRACTION_CONCURRENCY ?? '5');

export interface EnqueueInput {
  sessionId: string;
  markdown: string;
  moduleId: string | null;
  areaId?: string | null;
  userId?: string | null;
  generationModel?: string | null;
}

export function createExtractionQueue(db: DatabaseAdapter, resolveContentType: (moduleId: string | null) => Promise<ContentType>) {
  const extractor = createStructuredExtractor(db);
  const inflight = new Map<string, Promise<ExtractionResult>>();
  const pending: Array<() => void> = [];
  let running = 0;

  async function acquire(): Promise<void> {
    if (running < MAX_CONCURRENT) { running++; return; }
    return new Promise<void>(resolve => {
      pending.push(() => { running++; resolve(); });
    });
  }
  function release(): void {
    running--;
    const next = pending.shift();
    if (next) next();
  }

  /**
   * Fire-and-forget enqueue. Callers MUST NOT await this (it's non-blocking
   * by design). Errors are logged, never thrown. Returns the running promise
   * if the same session is already in flight so callers can optionally wait.
   */
  function enqueue(input: EnqueueInput): Promise<ExtractionResult> | null {
    if (!input.sessionId || !input.markdown || input.markdown.length < 100) return null;

    const existing = inflight.get(input.sessionId);
    if (existing) return existing;

    const promise = (async (): Promise<ExtractionResult> => {
      try {
        await acquire();
        const contentType = await resolveContentType(input.moduleId);
        const extractionInput: ExtractionInput = {
          markdown: input.markdown,
          contentType,
          moduleId: input.moduleId ?? 'open-chat',
          areaId: input.areaId ?? '',
          generationModel: input.generationModel ?? 'unknown',
          userId: input.userId ?? null,
        };
        return await extractor.extractAndStore(input.sessionId, extractionInput);
      } catch (err) {
        console.warn('[extraction-queue] extraction failed:', err instanceof Error ? err.message : err);
        return { status: 'failed', payload: null, cached: false, hash: '', error: err instanceof Error ? err.message : String(err) };
      } finally {
        release();
        inflight.delete(input.sessionId);
      }
    })();

    inflight.set(input.sessionId, promise);
    // Swallow rejections — callers may or may not await
    promise.catch(() => {});
    return promise;
  }

  function inflightCount(): number {
    return inflight.size;
  }

  return { enqueue, inflightCount, MAX_CONCURRENT };
}

export type ExtractionQueue = ReturnType<typeof createExtractionQueue>;
