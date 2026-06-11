/**
 * run-artifact-writer.ts — persist the assembled system prompt + pinned source
 * manifest per assistant message (Core Experience Review 2026-06, item 1.6).
 *
 * Today the 7-layer system prompt is composed inline in routes/claude.ts and
 * evaporated after the call; resolved knowledge sources were only console.logged.
 * This module writes one `run_artifacts` row per persisted assistant message
 * (migration 223) so any run can later be inspected, exported as a `module-run`
 * bundle (Wave-2 item 2.2), or reproduced.
 *
 * Contract:
 *  - Fire-and-forget tolerable: writeRunArtifact NEVER throws — failures are
 *    logged and reported via the boolean return so streaming is never broken.
 *  - Size guard: composed prompts can reach ~900k tokens; stored text is capped
 *    at MAX_STORED_PROMPT_BYTES (2 MB). When capped, `truncated = TRUE` and
 *    `prompt_sha256` still covers the FULL prompt (the hash is the pin).
 */

import crypto from 'crypto';
import type { DatabaseAdapter } from '../db/database.js';

/** Stored-prompt cap (bytes of UTF-8). The sha256 always covers the full prompt. */
export const MAX_STORED_PROMPT_BYTES = 2 * 1024 * 1024;

export function sha256Hex(text: string): string {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

export interface LayerSummaryEntry {
  layer: string;
  chars: number;
  sha256: string;
}

/**
 * Derive a per-layer summary (name + char count + sha256) from the identifiable
 * prompt-layer strings available at composition time. Empty/blank layers are
 * omitted. Deliberately simple — the composed prompt itself is the artifact;
 * this is the index into it.
 */
export function buildLayerSummary(
  layers: Record<string, string | null | undefined>,
): LayerSummaryEntry[] {
  const entries: LayerSummaryEntry[] = [];
  for (const [layer, value] of Object.entries(layers)) {
    if (typeof value !== 'string' || value.trim().length === 0) continue;
    entries.push({ layer, chars: value.length, sha256: sha256Hex(value) });
  }
  return entries;
}

/** Truncate a string so its UTF-8 byte length is <= maxBytes (never splits a code point). */
export function truncateToBytes(text: string, maxBytes: number): string {
  if (Buffer.byteLength(text, 'utf8') <= maxBytes) return text;
  // chars <= bytes, so slicing to maxBytes chars is a safe upper bound
  let s = text.slice(0, maxBytes);
  let bytes = Buffer.byteLength(s, 'utf8');
  while (bytes > maxBytes) {
    // Shrink proportionally to the overshoot, at least 1 char per pass
    const overshootChars = Math.max(1, Math.ceil((bytes - maxBytes) / 4));
    s = s.slice(0, s.length - overshootChars);
    bytes = Buffer.byteLength(s, 'utf8');
  }
  return s;
}

export interface RunArtifactInput {
  /** id of the persisted assistant message row (FK) */
  messageId: string;
  sessionId?: string | null;
  /** Final composed system prompt as passed to the LLM (static + dynamic when split) */
  composedPrompt: string;
  layerSummary?: LayerSummaryEntry[];
  /** Resolved source manifest entries (ResolvedSourceDetail[] or name-only fallbacks) */
  sourceManifest?: unknown[];
}

/**
 * Write one run_artifacts row. Never throws; returns false (and logs) on failure.
 * ON CONFLICT (message_id) DO NOTHING — one row per assistant message.
 */
export async function writeRunArtifact(
  db: DatabaseAdapter,
  input: RunArtifactInput,
): Promise<boolean> {
  try {
    const full = input.composedPrompt ?? '';
    const promptSha = sha256Hex(full);
    const truncated = Buffer.byteLength(full, 'utf8') > MAX_STORED_PROMPT_BYTES;
    const stored = truncated ? truncateToBytes(full, MAX_STORED_PROMPT_BYTES) : full;

    await db.run(
      `INSERT INTO run_artifacts
         (id, message_id, session_id, composed_prompt, prompt_sha256, prompt_chars, truncated, layer_summary, source_manifest, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (message_id) DO NOTHING`,
      crypto.randomUUID(),
      input.messageId,
      input.sessionId ?? null,
      stored,
      promptSha,
      full.length,
      truncated,
      JSON.stringify(input.layerSummary ?? []),
      JSON.stringify(input.sourceManifest ?? []),
      new Date().toISOString(),
    );
    return true;
  } catch (err) {
    // Non-fatal by contract — the assistant message was already streamed/persisted.
    console.warn(
      '[run-artifacts] failed to persist run artifact (non-fatal):',
      err instanceof Error ? err.message : err,
    );
    return false;
  }
}
