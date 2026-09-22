/**
 * run-artifact-writer.ts — persist the run record: the assembled system prompt
 * + pinned source manifest per assistant message (Core Experience Review
 * 2026-06, item 1.6), and since Wave 5 (2026-09-17) the run record v2 that
 * every engine path can write — a gap batch, a task step, an engagement
 * iteration — with the engine, the served model, the request parameters, the
 * hashes of what went in and what came out, the usage, the transcript, and
 * the tool calls the run made (run_tool_calls).
 *
 * Before v2 the 7-layer system prompt was composed inline in routes/claude.ts
 * and evaporated after the call; the agentic runner returned its transcript
 * and tool calls and the three call sites kept text, a 300-character preview,
 * or text + tokens. No table held a transcript or a tool call.
 *
 * Contract:
 *  - Fire-and-forget tolerable: nothing here throws — failures are logged and
 *    reported through the return value so streaming is never broken.
 *  - Size guards: composed prompts can reach ~900k tokens; stored text is
 *    capped at MAX_STORED_PROMPT_BYTES (2 MB). Tool outputs are capped at
 *    MAX_STORED_TOOL_OUTPUT_CHARS (40,000). When capped, the sha256 still
 *    covers the FULL text (the hash is the pin) and the full length is kept.
 *  - One row per assistant message: a message-parented write keeps the
 *    ON CONFLICT (message_id) DO NOTHING idempotency. A non-message parent has
 *    no message id and inserts plainly (a step that retried has one record per
 *    attempt, all under the same parent).
 */

import crypto from 'crypto';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import type { DatabaseAdapter } from '../db/database.js';
import { isSdkModel } from './engine-model-id.js';

/** Stored-prompt cap (bytes of UTF-8). The sha256 always covers the full prompt. */
export const MAX_STORED_PROMPT_BYTES = 2 * 1024 * 1024;
/** Stored tool-output cap (characters). output_sha256 / output_chars cover the full output. */
export const MAX_STORED_TOOL_OUTPUT_CHARS = 40_000;

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

// ── Run record v2 types (migration 277) ─────────────────────────────────────

/** What a run record belongs to. 'message' is the chat route's assistant message. */
export type RunParentKind = 'message' | 'gap_batch' | 'task_step' | 'engagement_step';
export type RunArtifactStatus = 'completed' | 'interrupted' | 'failed';
/** How cost_usd is to be read: metered dollars, subscription plan usage, free (local), or not known. */
export type RunCostBasis = 'usd' | 'plan_usage' | 'unknown' | 'free';

export interface RunUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

/** One tool call of an agentic run, in call order. */
export interface RunToolCallInput {
  seq: number;
  name: string;
  input: Record<string, unknown> | null;
  output: string;
  isError: boolean;
  ms: number | null;
}

export interface RunArtifactInput {
  /** id of the persisted assistant message row (FK). Null/absent for a non-message parent. */
  messageId?: string | null;
  sessionId?: string | null;
  /** Final composed system prompt as passed to the LLM (static + dynamic when split) */
  composedPrompt: string;
  layerSummary?: LayerSummaryEntry[];
  /** Resolved source manifest entries (ResolvedSourceDetail[] or name-only fallbacks) */
  sourceManifest?: unknown[];

  // ── v2 (migration 277) — all optional; a legacy caller writes a message-parented row ──
  parentKind?: RunParentKind;
  /** e.g. `<assessmentId>:<frameworkId>:<batchIndex>`, `<taskId>:<stepIndex>`, an iteration id. */
  parentId?: string | null;
  /** 'anthropic_sdk' | 'anthropic_api' | 'openai' | 'google' | 'mistral' | 'ollama' | 'azure' | … */
  engine?: string | null;
  engineVersion?: string | null;
  modelRequested?: string | null;
  modelServed?: string | null;
  requestParams?: Record<string, unknown> | null;
  userMessageSha256?: string | null;
  historySha256?: string | null;
  outputSha256?: string | null;
  thinkingSha256?: string | null;
  usage?: RunUsage | null;
  costUsd?: number | null;
  costBasis?: RunCostBasis | null;
  status?: RunArtifactStatus;
  rerunOf?: string | null;
  rerunMode?: string | null;
  /** Assistant turns in order (the agentic runner's transcript). */
  transcript?: string[] | null;
  finishedAt?: string | Date | null;
  /** Written to run_tool_calls after the record, in seq order. */
  toolCalls?: RunToolCallInput[];
}

export interface RunArtifactFinalizePatch {
  status?: RunArtifactStatus;
  outputSha256?: string | null;
  thinkingSha256?: string | null;
  usage?: RunUsage | null;
  costUsd?: number | null;
  costBasis?: RunCostBasis | null;
  finishedAt?: string | Date | null;
  transcript?: string[] | null;
}

function isoOrNull(v: string | Date | null | undefined): string | null {
  if (v instanceof Date) return v.toISOString();
  return typeof v === 'string' && v.length > 0 ? v : null;
}

function jsonOrNull(v: unknown): string | null {
  return v === null || v === undefined ? null : JSON.stringify(v);
}

// ── Engine versions ─────────────────────────────────────────────────────────

const versionCache = new Map<string, string>();

/**
 * The installed version of a package, read from its package.json. Packages
 * whose `exports` map hides package.json (the Agent SDK does) are found by
 * resolving their entry file and walking up to the package root.
 */
export function installedPackageVersion(pkgName: string): string {
  const cached = versionCache.get(pkgName);
  if (cached) return cached;
  let version = 'unknown';
  try {
    const require = createRequire(import.meta.url);
    let dir: string;
    try {
      dir = path.dirname(require.resolve(`${pkgName}/package.json`));
    } catch {
      dir = path.dirname(require.resolve(pkgName));
    }
    for (let i = 0; i < 8 && dir; i++) {
      const candidate = path.join(dir, 'package.json');
      if (fs.existsSync(candidate)) {
        const parsed = JSON.parse(fs.readFileSync(candidate, 'utf8')) as { name?: unknown; version?: unknown };
        if (parsed.name === pkgName && typeof parsed.version === 'string') { version = parsed.version; break; }
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  } catch {
    version = 'unknown';
  }
  versionCache.set(pkgName, version);
  return version;
}

/** Installed @anthropic-ai/claude-agent-sdk version ('unknown' when it cannot be read). */
export function sdkEngineVersion(): string {
  return installedPackageVersion('@anthropic-ai/claude-agent-sdk');
}

/** Installed @anthropic-ai/sdk version ('unknown' when it cannot be read). */
export function apiEngineVersion(): string {
  return installedPackageVersion('@anthropic-ai/sdk');
}

/** Which engine a model id is dispatched to, for the record's `engine` column. */
export function engineForModel(modelId: string): string {
  const id = String(modelId ?? '').trim();
  if (!id) return 'unknown';
  if (isSdkModel(id)) return 'anthropic_sdk';
  const colon = id.indexOf(':');
  if (colon > 0) return id.slice(0, colon).toLowerCase();
  if (/^claude-/i.test(id)) return 'anthropic_api';
  if (/^(gpt-|o\d|chatgpt-)/i.test(id)) return 'openai';
  if (/^gemini/i.test(id)) return 'google';
  if (/^(mistral|codestral|pixtral|ministral|magistral)/i.test(id)) return 'mistral';
  return 'unknown';
}

/** What the module-run (message) path knows about one run, success or failure. */
export interface MessageRunFacts {
  modelRequested: string;
  modelServed?: string | null;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  /** Metered dollars for the run, when the model has list pricing. */
  costUsd?: number | null;
  text?: string;
  thinking?: string;
  status: RunArtifactStatus;
}

/**
 * The v2 record fields for a module run (pure). The message path used to write
 * only the prompt, layers and sources — no engine, model, usage or cost — so
 * the most-used path in Work had the thinnest record (2026-09-22 Work QA).
 * Subscription engines are plan usage, not dollars; Ollama is free.
 */
export function messageRunRecordFields(f: MessageRunFacts): Partial<RunArtifactInput> {
  const engine = engineForModel(f.modelRequested);
  const plan = engine === 'anthropic_sdk' || engine === 'codex';
  const hasUsage = typeof f.inputTokens === 'number' || typeof f.outputTokens === 'number';
  return {
    engine,
    engineVersion: engine === 'anthropic_sdk' ? sdkEngineVersion() : engine === 'anthropic_api' ? apiEngineVersion() : null,
    modelRequested: f.modelRequested,
    modelServed: f.modelServed ?? (f.status === 'completed' ? f.modelRequested : null),
    usage: hasUsage
      ? {
          inputTokens: f.inputTokens ?? 0,
          outputTokens: f.outputTokens ?? 0,
          cacheReadTokens: f.cacheReadTokens ?? 0,
          cacheCreationTokens: f.cacheCreationTokens ?? 0,
        }
      : null,
    costUsd: plan ? null : (typeof f.costUsd === 'number' && Number.isFinite(f.costUsd) ? f.costUsd : null),
    costBasis: plan ? 'plan_usage' : engine === 'ollama' ? 'free' : typeof f.costUsd === 'number' ? 'usd' : 'unknown',
    outputSha256: f.text ? sha256Hex(f.text) : null,
    thinkingSha256: f.thinking ? sha256Hex(f.thinking) : null,
    status: f.status,
    finishedAt: new Date(),
  };
}

/**
 * True for an SSE frame that reports a failed run. Every engine client reports
 * failure this way — it writes `data: {"type":"error",…}` and returns normally —
 * so the route learns of a failure only by seeing the frame go out.
 */
export function isSseErrorFrame(chunk: unknown): boolean {
  const text = typeof chunk === 'string' ? chunk : Buffer.isBuffer(chunk) ? chunk.toString('utf8') : '';
  return /(^|\n)data: \{"type":"error"/.test(text);
}

// ── Writers ─────────────────────────────────────────────────────────────────

const INSERT_COLUMNS = [
  'id', 'message_id', 'session_id', 'composed_prompt', 'prompt_sha256', 'prompt_chars', 'truncated',
  'layer_summary', 'source_manifest', 'created_at',
  'parent_kind', 'parent_id', 'engine', 'engine_version', 'model_requested', 'model_served',
  'request_params', 'user_message_sha256', 'history_sha256', 'output_sha256', 'thinking_sha256',
  'usage', 'cost_usd', 'cost_basis', 'status', 'rerun_of', 'rerun_mode', 'transcript', 'finished_at',
] as const;

/**
 * Write one run_artifacts row (v2) and its tool calls. Never throws; returns
 * the record id, or null (and logs) when nothing could be written.
 *
 * A message-parented write keeps ON CONFLICT (message_id) DO NOTHING — one
 * row per assistant message; when the row already existed its id is returned
 * and no tool calls are added. A write with no message id inserts plainly.
 */
export async function writeRunArtifactV2(
  db: DatabaseAdapter,
  input: RunArtifactInput,
): Promise<{ id: string } | null> {
  let id: string;
  try {
    id = crypto.randomUUID();
    const full = input.composedPrompt ?? '';
    const promptSha = sha256Hex(full);
    const truncated = Buffer.byteLength(full, 'utf8') > MAX_STORED_PROMPT_BYTES;
    const stored = truncated ? truncateToBytes(full, MAX_STORED_PROMPT_BYTES) : full;
    const messageId = input.messageId ?? null;
    const parentKind: RunParentKind = input.parentKind ?? 'message';

    const params: unknown[] = [
      id,
      messageId,
      input.sessionId ?? null,
      stored,
      promptSha,
      full.length,
      truncated,
      JSON.stringify(input.layerSummary ?? []),
      JSON.stringify(input.sourceManifest ?? []),
      new Date().toISOString(),
      parentKind,
      input.parentId ?? null,
      input.engine ?? null,
      input.engineVersion ?? null,
      input.modelRequested ?? null,
      input.modelServed ?? null,
      jsonOrNull(input.requestParams ?? null),
      input.userMessageSha256 ?? null,
      input.historySha256 ?? null,
      input.outputSha256 ?? null,
      input.thinkingSha256 ?? null,
      jsonOrNull(input.usage ?? null),
      typeof input.costUsd === 'number' && Number.isFinite(input.costUsd) ? input.costUsd : null,
      input.costBasis ?? null,
      input.status ?? 'completed',
      input.rerunOf ?? null,
      input.rerunMode ?? null,
      jsonOrNull(input.transcript ?? null),
      isoOrNull(input.finishedAt),
    ];

    const sql =
      `INSERT INTO run_artifacts\n         (${INSERT_COLUMNS.join(', ')})\n       VALUES (${INSERT_COLUMNS.map(() => '?').join(', ')})` +
      (messageId ? '\n       ON CONFLICT (message_id) DO NOTHING' : '');

    const result = await db.run(sql, ...params);
    if (messageId && result && typeof result.changes === 'number' && result.changes === 0) {
      // The message already had its record: hand that one back, add nothing.
      const existing = await db.get<{ id: string }>('SELECT id FROM run_artifacts WHERE message_id = ?', messageId);
      return existing?.id ? { id: existing.id } : null;
    }
  } catch (err) {
    // Non-fatal by contract — the run's output was already streamed/persisted.
    console.warn(
      '[run-artifacts] failed to persist run artifact (non-fatal):',
      err instanceof Error ? err.message : err,
    );
    return null;
  }

  const toolCalls = Array.isArray(input.toolCalls) ? input.toolCalls : [];
  for (const call of toolCalls) {
    try {
      const output = typeof call.output === 'string' ? call.output : String(call.output ?? '');
      await db.run(
        `INSERT INTO run_tool_calls
           (id, run_artifact_id, seq, tool_name, input, output_text, output_sha256, output_chars, is_error, duration_ms, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        crypto.randomUUID(),
        id,
        call.seq,
        String(call.name ?? 'tool'),
        jsonOrNull(call.input ?? null),
        output.length > MAX_STORED_TOOL_OUTPUT_CHARS ? output.slice(0, MAX_STORED_TOOL_OUTPUT_CHARS) : output,
        sha256Hex(output),
        output.length,
        call.isError === true,
        typeof call.ms === 'number' && Number.isFinite(call.ms) ? Math.round(call.ms) : null,
        new Date().toISOString(),
      );
    } catch (err) {
      console.warn(
        `[run-artifacts] failed to persist tool call #${call.seq} of ${id} (non-fatal):`,
        err instanceof Error ? err.message : err,
      );
    }
  }
  return { id };
}

/**
 * Write one run_artifacts row for an assistant message. Never throws; returns
 * false (and logs) on failure. ON CONFLICT (message_id) DO NOTHING — one row
 * per assistant message. Delegates to writeRunArtifactV2.
 */
export async function writeRunArtifact(
  db: DatabaseAdapter,
  input: RunArtifactInput,
): Promise<boolean> {
  const written = await writeRunArtifactV2(db, input);
  return written !== null;
}

/**
 * Patch a run record after the fact (a run that finished, was interrupted,
 * or whose usage arrived late). Only the given fields change. Never throws;
 * returns false (and logs) on failure, true when there was nothing to patch.
 */
export async function finalizeRunArtifact(
  db: DatabaseAdapter,
  id: string,
  patch: RunArtifactFinalizePatch,
): Promise<boolean> {
  try {
    const sets: string[] = [];
    const params: unknown[] = [];
    if (patch.status !== undefined) { sets.push('status = ?'); params.push(patch.status); }
    if (patch.outputSha256 !== undefined) { sets.push('output_sha256 = ?'); params.push(patch.outputSha256); }
    if (patch.thinkingSha256 !== undefined) { sets.push('thinking_sha256 = ?'); params.push(patch.thinkingSha256); }
    if (patch.usage !== undefined) { sets.push('usage = ?'); params.push(jsonOrNull(patch.usage)); }
    if (patch.costUsd !== undefined) {
      sets.push('cost_usd = ?');
      params.push(typeof patch.costUsd === 'number' && Number.isFinite(patch.costUsd) ? patch.costUsd : null);
    }
    if (patch.costBasis !== undefined) { sets.push('cost_basis = ?'); params.push(patch.costBasis); }
    if (patch.finishedAt !== undefined) { sets.push('finished_at = ?'); params.push(isoOrNull(patch.finishedAt)); }
    if (patch.transcript !== undefined) { sets.push('transcript = ?'); params.push(jsonOrNull(patch.transcript)); }
    if (sets.length === 0) return true;
    params.push(id);
    await db.run(`UPDATE run_artifacts SET ${sets.join(', ')} WHERE id = ?`, ...params);
    return true;
  } catch (err) {
    console.warn(
      '[run-artifacts] failed to finalize run artifact (non-fatal):',
      err instanceof Error ? err.message : err,
    );
    return false;
  }
}

// ── Agentic runs → record input (pure) ──────────────────────────────────────

/** The parts of an AgenticRunConfig the record needs (structural, so the runner is not imported). */
export interface AgenticConfigLike {
  model: string;
  thinking: string;
  system: string;
  prompt: string;
  tools: ReadonlyArray<{ name: string }>;
  webSearch?: boolean;
  maxTurns?: number;
  timeoutMs?: number;
}

/** The parts of an AgenticRunResult the record needs. */
export interface AgenticResultLike {
  ok: boolean;
  text: string;
  thinking: string;
  transcript: ReadonlyArray<string>;
  toolCalls: ReadonlyArray<{ name: string; input: Record<string, unknown>; output: string; isError: boolean; ms: number }>;
  turns?: number;
  usage: RunUsage;
  warning?: string;
  error?: string;
  /** The runner does not report it today; a future runner may. */
  modelServed?: string | null;
}

export interface AgenticRunRecordArgs {
  parentKind: RunParentKind;
  parentId: string;
  sessionId?: string | null;
  config: AgenticConfigLike;
  result: AgenticResultLike;
  /** Extra request parameters worth keeping (attempt number, lane, …). */
  requestParams?: Record<string, unknown>;
  layerSummary?: LayerSummaryEntry[];
  sourceManifest?: unknown[];
  rerunOf?: string | null;
  rerunMode?: string | null;
  /** Defaults to now. */
  finishedAt?: string | Date;
}

/**
 * Build the v2 record input for one agentic run: the system prompt as
 * composed prompt, the user prompt / output / thinking hashed, the engine and
 * its version, the request parameters, usage, transcript and tool calls.
 * Pure — the call site writes it with writeRunArtifactV2 (fire-and-forget).
 */
export function buildAgenticRunArtifactInput(args: AgenticRunRecordArgs): RunArtifactInput {
  const { config, result } = args;
  const engine = engineForModel(config.model);
  const engineVersion = engine === 'anthropic_sdk' ? sdkEngineVersion() : engine === 'anthropic_api' ? apiEngineVersion() : null;
  const requestParams: Record<string, unknown> = {
    thinking: config.thinking,
    maxTurns: config.maxTurns ?? null,
    timeoutMs: config.timeoutMs ?? null,
    webSearch: config.webSearch === true,
    tools: config.tools.map((t) => t.name),
    permissionMode: 'dontAsk',
    turns: typeof result.turns === 'number' ? result.turns : null,
    ...(result.warning ? { warning: result.warning } : {}),
    ...(result.error ? { error: result.error } : {}),
    ...(args.requestParams ?? {}),
  };
  const text = typeof result.text === 'string' ? result.text : '';
  const thinking = typeof result.thinking === 'string' ? result.thinking : '';
  return {
    messageId: null,
    sessionId: args.sessionId ?? null,
    parentKind: args.parentKind,
    parentId: args.parentId,
    composedPrompt: config.system ?? '',
    layerSummary: args.layerSummary,
    sourceManifest: args.sourceManifest,
    engine,
    engineVersion,
    modelRequested: config.model,
    modelServed: result.modelServed ?? null,
    requestParams,
    userMessageSha256: sha256Hex(config.prompt ?? ''),
    historySha256: null,
    outputSha256: text.length > 0 ? sha256Hex(text) : null,
    thinkingSha256: thinking.length > 0 ? sha256Hex(thinking) : null,
    usage: result.usage,
    costUsd: null,
    costBasis: engine === 'anthropic_sdk' ? 'plan_usage' : engine === 'ollama' ? 'free' : 'unknown',
    status: result.ok ? 'completed' : 'failed',
    rerunOf: args.rerunOf ?? null,
    rerunMode: args.rerunMode ?? null,
    transcript: [...result.transcript],
    finishedAt: args.finishedAt ?? new Date(),
    toolCalls: result.toolCalls.map((c, i) => ({
      seq: i + 1,
      name: c.name,
      input: c.input ?? null,
      output: c.output,
      isError: c.isError === true,
      ms: c.ms,
    })),
  };
}
