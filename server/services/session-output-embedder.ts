/**
 * session-output-embedder.ts — embed completed assistant outputs as
 * `session_output` (CORE_EXPERIENCE_REVIEW 2026-06, Wave 3 item 3.2).
 *
 * hybrid-search.ts has declared the 'session_output' content type since day
 * one, but nothing ever populated it — "what did we conclude about X in
 * March?" was unanswerable. This module is the write path: called
 * fire-and-forget from routes/claude.ts onComplete (gated by the same
 * atomCollectionEnabled toggle that gates atom extraction), it stores one
 * embeddings row per persisted assistant message via the provider-fallback
 * embedding adapter.
 *
 * Honesty contract:
 *  - Only the first SESSION_OUTPUT_EMBED_HEAD_CHARS chars are embedded (the
 *    embedding models truncate far earlier anyway); metadata carries the
 *    sha256 + length of the FULL content and a `truncated` flag, so nothing
 *    pretends the whole document was embedded.
 *  - Reruns never reach this path: rerun.ts pins atomCollectionEnabled=false
 *    on its dispatched body, which is the gate the caller checks. Embedding
 *    rerun outputs would store near-duplicate content under fresh ids and
 *    crowd the top-K with copies of the same conclusion.
 *  - Never throws; returns false on skip/failure (embedAndStore itself drops
 *    zero-vector results rather than storing dead rows).
 */

import type { DatabaseAdapter } from '../db/database.js';
import { embedAndStore } from './hybrid-search.js';
import { sha256Hex } from './run-artifact-writer.js';

/** Head of the output that is actually embedded (chars). */
export const SESSION_OUTPUT_EMBED_HEAD_CHARS = 8_000;

/** Outputs shorter than this carry no retrievable conclusion — skipped. */
export const SESSION_OUTPUT_MIN_CHARS = 200;

export interface SessionOutputEmbedInput {
  /** id of the persisted assistant message row (becomes content_id). */
  messageId: string;
  sessionId: string;
  /** Full assistant output text. */
  content: string;
  moduleId?: string | null;
  areaId?: string | null;
}

export async function embedSessionOutput(
  db: DatabaseAdapter,
  input: SessionOutputEmbedInput,
): Promise<boolean> {
  try {
    const content = input.content ?? '';
    if (content.length < SESSION_OUTPUT_MIN_CHARS) return false;

    // Session title makes search results readable without an extra join.
    let title: string | null = null;
    try {
      const row = await db.get(
        'SELECT title FROM sessions WHERE id = ?', input.sessionId,
      ) as { title: string | null } | undefined;
      title = row?.title ?? null;
    } catch { /* non-fatal — title is cosmetic */ }

    const head = content.slice(0, SESSION_OUTPUT_EMBED_HEAD_CHARS);
    await embedAndStore(db, {
      contentType: 'session_output',
      contentId: input.messageId,
      contentText: head,
      metadata: {
        session_id: input.sessionId,
        title,
        module_id: input.moduleId ?? null,
        area_id: input.areaId ?? null,
        created_at: new Date().toISOString(),
        // The honest cap: hash + length of the FULL content.
        full_sha256: sha256Hex(content),
        full_chars: content.length,
        truncated: content.length > SESSION_OUTPUT_EMBED_HEAD_CHARS,
      },
    });
    return true;
  } catch (err) {
    console.warn(
      '[session-output-embedder] failed to embed session output (non-fatal):',
      err instanceof Error ? err.message : err,
    );
    return false;
  }
}
