/**
 * rerun.ts — "Rerun with…" (CORE_EXPERIENCE_REVIEW 2026-06, Wave 2 item 2.3)
 * and verbatim replay (Wave 5 track B, 2026-09-17).
 *
 * POST /api/rerun { sessionId, messageId?, mode?, newModelId?, areaId? }
 *
 * Two modes, one endpoint, one JSON transport:
 *
 * ── recompose (default — the original behaviour, unchanged) ─────────────────
 * Rehydrates the per-message config_snapshot of an assistant message, swaps the
 * model, and re-executes the run through the EXACT same pipeline as a live run.
 *
 * Key design choice — pipeline reuse via internal dispatch, not duplication:
 * the /api/claude/message handler is ~1,000 lines of knowledge resolution,
 * prompt composition, provider routing, persistence, artifacts, quality scoring
 * and learning hooks. Instead of copying any of it, this route dispatches a
 * synthetic Express request INTO the claude router (the router instance is a
 * callable (req,res,next) function) with an SSE-capturing response. The rerun
 * therefore gets, for free and always in sync with the live path:
 *   - the same 7-layer prompt composition + knowledge resolution
 *   - the same multi-provider adapters (anthropic/openai/gemini/mistral/
 *     ollama/azure/compat) — newModelId can be any model the UI offers
 *   - the standard onComplete: a NEW persisted assistant message with
 *     model_id + config_snapshot + cost, its own run_artifacts row (item 1.6),
 *     quality scoring, structured extraction
 * After the dispatch, the new assistant message is flagged `rerun_of` (migration
 * 224) and its pinned source manifest is diffed against the original's for the
 * source-drift warning. That is re-execution with drift detection: packs,
 * atoms, framework text and the composer itself may all have moved on.
 *
 * Known fidelity limits (surfaced by drift detection, not hidden):
 *   - uploadedFileIds are not part of config_snapshot — uploaded documents from
 *     the original run appear as "removed" sources in the drift report.
 *   - moduleInputs are not snapshotted per message; best-effort recovery from
 *     the session config.
 *
 * ── replay (Wave 5) ─────────────────────────────────────────────────────────
 * No composer, no knowledge resolver, no module prompt lookup. The stored run
 * record (run_artifacts.composed_prompt, pinned at the original run) is sent
 * byte-for-byte as `system`; the messages array is rebuilt from the messages
 * table — every non-rerun turn up to and including the user message that
 * produced this answer, in order; the model is the one the engine served the
 * first time (run_artifacts.model_served, else the snapshot's served id, else
 * the message's model_id) unless the caller names another; thinking level and
 * effort come from the snapshot; web tools are granted only when the record
 * shows the original used them. Dispatch goes through callChat (the endpoint
 * answers JSON, so the transport stays JSON). Nothing is persisted until the
 * model has answered, so a refused model — unknown, no longer served — fails
 * closed with a 409 and leaves no row behind. The response reports model,
 * prompt and output hash equality against the original; sampling can differ
 * even with identical inputs, and the hashes say whether it did.
 */

import { Router } from 'express';
import { assertOwned, scopesToOwner, type OwnedRequest } from '../middleware/ownership.js';
import type { Request, Response, NextFunction } from 'express';
import { EventEmitter } from 'node:events';
import crypto from 'node:crypto';
import type { DatabaseAdapter } from '../db/database.js';
import { safeError } from '../lib/error-response.js';
import { buildOutputInstruction } from '../../src/lib/output-format-definitions.js';
import { callChat, type ChatResult } from '../services/provider-router.js';
import { getProviderFromModelId } from '../services/model-adapter.js';
import { writeRunArtifact, sha256Hex } from '../services/run-artifact-writer.js';
import { computeRunCostUsd } from '../services/run-cost.js';
import { getModelConfig } from '../types/modelAdapter.js';
import { capabilityModelId } from '../services/engine-model-id.js';
import { MODEL_CAPABILITIES } from '../config/model-capabilities.js';
import { anthropicEffort } from '../services/thinking-map.js';
import { isSdkEngineEnabled } from '../services/sdk-engine-store.js';
import type { ThinkingLevel as LadderThinkingLevel } from '../../src/lib/types.js';

// ── Types ────────────────────────────────────────────────────────────────────

interface MessageRow {
  id: string;
  session_id: string;
  role: string;
  content: string;
  thinking_content: string | null;
  token_count: number | null;
  cost: number | null;
  model_id: string | null;
  config_snapshot: string | null;
  rerun_of: string | null;
  created_at: unknown;
}

interface SessionRow {
  id: string;
  module_id: string;
  config: string | null;
}

/** The columns of run_artifacts a replay needs (migrations 223 + 277). */
interface RunRecordRow {
  id: string;
  composed_prompt: string | null;
  prompt_sha256: string;
  prompt_chars: number | null;
  truncated: boolean | number | null;
  layer_summary: unknown;
  source_manifest: unknown;
  model_requested: string | null;
  model_served: string | null;
  output_sha256: string | null;
  engine: string | null;
}

/** A pinned source from run_artifacts.source_manifest (ResolvedSourceDetail). */
interface ManifestEntry {
  type?: string;
  name?: string;
  sha256?: string;
  charCount?: number;
  contentHashed?: boolean;
}

export interface SourceDriftEntry {
  name: string;
  type: string;
  changed: boolean;
  status: 'unchanged' | 'changed' | 'added' | 'removed' | 'unhashed';
}

interface DispatchResult {
  statusCode: number;
  jsonBody: unknown;
  sseEvents: Array<Record<string, unknown>>;
}

export type RerunMode = 'replay' | 'recompose';

/** Output hash pair — present on both modes. */
export interface OutputEquality {
  sha256: string;
  originalSha256: string;
  equalsOriginal: boolean;
  chars: number;
  originalChars: number;
}

/** The JSON body of a successful replay. */
export interface ReplayResponseBody {
  mode: 'replay';
  originalMessageId: string;
  rerunMessageId: string;
  original: Record<string, unknown>;
  rerun: Record<string, unknown>;
  model: { requested: string; served: string; equalsOriginal: boolean };
  prompt: { sha256: string; equalsOriginal: true };
  output: OutputEquality;
  usage: { inputTokens: number; outputTokens: number };
  note: string;
  /** The drift view is meaningless for a replay (same pinned sources by construction). */
  sourceDriftAvailable: false;
  sourceDrift: [];
  sourceDriftDetected: false;
}

export type ReplayOutcome =
  | { ok: true; status: 200; body: ReplayResponseBody }
  | { ok: false; status: 400 | 404 | 409 | 502; error: string };

export const REPLAY_NOTE =
  'Same prompt, same history, same model: an identical output is still not guaranteed — sampling can differ even with identical inputs. The output hash reports whether it did.';

// ── Internal dispatch into the claude router ─────────────────────────────────

/**
 * Build a synthetic (req, res) pair and run it through the given router.
 * The response captures SSE writes; the promise resolves when the handler
 * calls res.end() (or json()). This is how the rerun reuses the live
 * /api/claude/message pipeline without duplicating any of it.
 */
export function dispatchClaudeMessage(
  claudeRouter: Router,
  body: Record<string, unknown>,
  /** `role` is the caller's: the claude router's team-mode checks (session ownership,
   *  module access) read req.user.role, and an identity without one is treated as a
   *  non-admin — an admin rerunning a colleague's session was refused with a 404. */
  opts: { userId?: string; role?: string; timeoutMs?: number } = {},
): Promise<DispatchResult> {
  return new Promise<DispatchResult>((resolve, reject) => {
    const timeoutMs = opts.timeoutMs ?? 15 * 60 * 1000;

    const req = new EventEmitter() as EventEmitter & Record<string, unknown>;
    Object.assign(req, {
      method: 'POST',
      url: '/claude/message',
      originalUrl: '/api/claude/message',
      baseUrl: '',
      headers: { 'content-type': 'application/json' },
      body,
      query: {},
      params: {},
      user: opts.userId ? { id: opts.userId, ...(opts.role ? { role: opts.role } : {}) } : undefined,
      ip: '127.0.0.1',
      get(name: string): string | undefined {
        return (this as { headers: Record<string, string> }).headers[name.toLowerCase()];
      },
    });

    let settled = false;
    let raw = '';
    let jsonBody: unknown = null;
    const headers: Record<string, unknown> = {};

    const res = new EventEmitter() as EventEmitter & Record<string, unknown>;
    const finish = (): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      res.emit('finish');
      res.emit('close');
      const sseEvents: Array<Record<string, unknown>> = [];
      for (const line of raw.split('\n')) {
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice(6).trim();
        if (!payload || payload === '[DONE]') continue;
        try {
          const parsed = JSON.parse(payload) as unknown;
          if (parsed !== null && typeof parsed === 'object') {
            sseEvents.push(parsed as Record<string, unknown>);
          }
        } catch { /* partial line — ignore */ }
      }
      resolve({ statusCode: (res.statusCode as number) ?? 200, jsonBody, sseEvents });
    };

    Object.assign(res, {
      statusCode: 200,
      headersSent: false,
      setHeader(name: string, value: unknown) { headers[name.toLowerCase()] = value; return res; },
      getHeader(name: string) { return headers[name.toLowerCase()]; },
      removeHeader(name: string) { delete headers[name.toLowerCase()]; },
      writeHead(status: number, hdrs?: Record<string, unknown>) {
        res.statusCode = status;
        if (hdrs) Object.assign(headers, hdrs);
        res.headersSent = true;
        return res;
      },
      flushHeaders() { res.headersSent = true; },
      write(chunk: unknown) {
        res.headersSent = true;
        raw += typeof chunk === 'string' ? chunk : String(chunk);
        return true;
      },
      status(code: number) { res.statusCode = code; return res; },
      json(obj: unknown) {
        jsonBody = obj;
        res.headersSent = true;
        finish();
        return res;
      },
      end(chunk?: unknown) {
        if (chunk !== undefined && chunk !== null) {
          raw += typeof chunk === 'string' ? chunk : String(chunk);
        }
        finish();
        return res;
      },
    });

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      // Let the pipeline's own close-handlers (abort, stream slot release) fire.
      req.emit('close');
      res.emit('close');
      reject(new Error('Rerun timed out waiting for the model'));
    }, timeoutMs);

    const next: NextFunction = (err?: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err) reject(err instanceof Error ? err : new Error(String(err)));
      else reject(new Error('Claude route did not handle the rerun request'));
    };

    try {
      // An Express Router instance is itself a (req, res, next) handler.
      (claudeRouter as unknown as (rq: Request, rs: Response, nx: NextFunction) => void)(
        req as unknown as Request,
        res as unknown as Response,
        next,
      );
    } catch (err) {
      if (!settled) { settled = true; clearTimeout(timer); reject(err as Error); }
    }
  });
}

// ── Config rehydration ───────────────────────────────────────────────────────

const CREATIVITY_VALUES = new Set(['strict', 'balanced', 'creative']);

/**
 * Rebuild a /api/claude/message request body from a stored config_snapshot,
 * swapping in the new model. Exported for tests.
 */
export function rehydrateClaudeBody(input: {
  snapshot: Record<string, unknown>;
  newModelId: string;
  sessionId: string;
  moduleId: string | null;
  areaId: string | null;
  userMessage: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  moduleInputs?: Record<string, unknown> | null;
  /** Original assistant message id — marks the dispatch as a rerun (F2). */
  rerunOf?: string | null;
}): Record<string, unknown> {
  const { snapshot: snap } = input;
  const outputFormats = Array.isArray(snap.selectedOutputFormats)
    ? (snap.selectedOutputFormats as string[]).filter((f) => typeof f === 'string')
    : [];
  const structureRef = snap.structureReference;
  const validStructureRef =
    structureRef !== null && typeof structureRef === 'object' &&
    ['none', 'upload', 'describe'].includes(String((structureRef as Record<string, unknown>).mode)) &&
    typeof (structureRef as Record<string, unknown>).description === 'string'
      ? structureRef
      : undefined;

  const body: Record<string, unknown> = {
    model: input.newModelId,
    userMessage: input.userMessage,
    history: input.history,
    sessionId: input.sessionId,
    moduleId: input.moduleId ?? undefined,
    areaId: input.areaId ?? undefined,
    thinking: typeof snap.thinking === 'string' ? snap.thinking : undefined,
    creativity: typeof snap.creativity === 'string' && CREATIVITY_VALUES.has(snap.creativity)
      ? snap.creativity : undefined,
    precision: typeof snap.precision === 'string' ? snap.precision : undefined,
    transparencyLevel: typeof snap.transparencyLevel === 'number' ? snap.transparencyLevel : undefined,
    systemPrompt: typeof snap.systemPrompt === 'string' && snap.systemPrompt ? snap.systemPrompt : undefined,
    outputFormats,
    outputInstruction: buildOutputInstruction(outputFormats) || undefined,
    outputLanguage: typeof snap.outputLanguage === 'string' && snap.outputLanguage ? snap.outputLanguage : undefined,
    selectedPersonas: Array.isArray(snap.selectedPersonas) ? snap.selectedPersonas : undefined,
    selectedSkills: Array.isArray(snap.selectedSkills) ? snap.selectedSkills : undefined,
    knowledgeSources: snap.knowledgeSources !== null && typeof snap.knowledgeSources === 'object' && !Array.isArray(snap.knowledgeSources)
      ? snap.knowledgeSources : undefined,
    moduleInputs: input.moduleInputs ?? undefined,
    plainTextMode: !!snap.plainTextMode,
    writingTone: typeof snap.writingTone === 'string' ? snap.writingTone : undefined,
    audience: typeof snap.audience === 'string' && snap.audience ? snap.audience : undefined,
    channel: typeof snap.channel === 'string' && snap.channel ? snap.channel : undefined,
    metaCognitiveEnabled: !!snap.metaCognitiveEnabled,
    multiPerspective: !!snap.multiPerspective,
    emojiEnabled: !!snap.emojiEnabled,
    nativeReasoningEnabled: !!snap.nativeReasoningEnabled,
    structureReference: validStructureRef,
    // Reruns are single-model by definition — never multi-agent.
    multiAgentEnabled: false,
    // A rerun must not double-teach the learning layer (the original run
    // already extracted atoms from this input).
    atomCollectionEnabled: false,
    // F2: atom INJECTION follows the original run (snapshot value when
    // captured, default-on otherwise — exactly what the original got)…
    atomInjectionEnabled: typeof snap.atomInjectionEnabled === 'boolean'
      ? snap.atomInjectionEnabled : undefined,
    // …but the rerun marker makes claude.ts skip A/B ARM ASSIGNMENT + arm
    // tagging: an arm from the rerun's fresh message id would straddle arms
    // within the session (excluding it from the experiment stats) or
    // double-count a different model's quality into the original arm.
    // Reruns are not experiment subjects.
    rerunOf: input.rerunOf ?? undefined,
  };

  // Drop undefined keys so Zod validation sees a clean body.
  for (const key of Object.keys(body)) {
    if (body[key] === undefined) delete body[key];
  }
  return body;
}

// ── Source drift ─────────────────────────────────────────────────────────────

function parseManifest(raw: unknown): ManifestEntry[] {
  let value = raw;
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { return []; }
  }
  if (!Array.isArray(value)) return [];
  return value.filter((e): e is ManifestEntry => e !== null && typeof e === 'object');
}

/**
 * Compare the original run's pinned source manifest against the rerun's.
 * A source counts as changed when both runs hashed its content and the hashes
 * differ, or when it is present in only one of the runs. Sources whose content
 * never passes through the resolver (built-in knowledge, native web search)
 * carry contentHashed=false and report 'unhashed'. Exported for tests.
 */
export function computeSourceDrift(
  originalManifest: unknown,
  rerunManifest: unknown,
): SourceDriftEntry[] {
  const orig = parseManifest(originalManifest);
  const rerun = parseManifest(rerunManifest);
  const keyOf = (e: ManifestEntry): string => `${String(e.type ?? 'source')}::${String(e.name ?? '')}`;

  const origMap = new Map<string, ManifestEntry>();
  for (const e of orig) if (!origMap.has(keyOf(e))) origMap.set(keyOf(e), e);
  const rerunMap = new Map<string, ManifestEntry>();
  for (const e of rerun) if (!rerunMap.has(keyOf(e))) rerunMap.set(keyOf(e), e);

  const entries: SourceDriftEntry[] = [];
  const seen = new Set<string>();

  for (const [key, o] of origMap) {
    seen.add(key);
    const n = rerunMap.get(key);
    const name = String(o.name ?? key);
    const type = String(o.type ?? 'source');
    if (!n) {
      entries.push({ name, type, changed: true, status: 'removed' });
    } else if (o.contentHashed && n.contentHashed && o.sha256 && n.sha256) {
      const changed = o.sha256 !== n.sha256;
      entries.push({ name, type, changed, status: changed ? 'changed' : 'unchanged' });
    } else {
      entries.push({ name, type, changed: false, status: 'unhashed' });
    }
  }
  for (const [key, n] of rerunMap) {
    if (seen.has(key)) continue;
    entries.push({ name: String(n.name ?? key), type: String(n.type ?? 'source'), changed: true, status: 'added' });
  }
  return entries;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** sha-256 of the first 5,000 chars, 16 hex chars — quality-ratchet's content hash. */
function qualityContentHash(content: string): string {
  return crypto.createHash('sha256').update(content.slice(0, 5000)).digest('hex').slice(0, 16);
}

function toMessageSummary(m: MessageRow): Record<string, unknown> {
  return {
    messageId: m.id,
    content: m.content,
    thinking: m.thinking_content,
    modelId: m.model_id,
    cost: m.cost,
    outputTokens: m.token_count,
    createdAt: m.created_at instanceof Date ? m.created_at.toISOString() : m.created_at,
    rerunOf: m.rerun_of ?? null,
  };
}

function parseSnapshot(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function parseJsonValue(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw;
  try { return JSON.parse(raw); } catch { return null; }
}

/** The output hash pair both modes report. */
export function outputEquality(rerunContent: string, originalContent: string): OutputEquality {
  const sha256 = sha256Hex(rerunContent);
  const originalSha256 = sha256Hex(originalContent);
  return {
    sha256,
    originalSha256,
    equalsOriginal: sha256 === originalSha256,
    chars: rerunContent.length,
    originalChars: originalContent.length,
  };
}

/** The claude route's own resolution: snapshot's served id, else the alias it ran. */
function servedIdFromSnapshot(snapshot: Record<string, unknown> | null): string | null {
  if (!snapshot) return null;
  const ctx = snapshot.contextUsed;
  if (ctx !== null && typeof ctx === 'object' && typeof (ctx as Record<string, unknown>).modelServed === 'string') {
    return (ctx as Record<string, unknown>).modelServed as string;
  }
  return typeof snapshot.modelServed === 'string' ? snapshot.modelServed : null;
}

const THINKING_LEVELS: ReadonlySet<string> = new Set(['quick', 'think', 'think_hard', 'investigate', 'plan_first', 'deep_investigate']);

/** The served id is a bare model; the engine that served it is what makes it dispatchable. */
export function dispatchableModelId(servedId: string, engine: string | null): string {
  if (servedId.includes(':')) return servedId;                       // already engine-qualified (sdk:, codex:, ollama:, compat:, azure:)
  if (engine === 'anthropic_sdk') return `sdk:${servedId}`;
  if (engine === 'openai_codex') return `codex:${servedId}`;
  return servedId;
}

/**
 * Whether the router can turn a thinking level into the model's own request
 * parameters. Only Anthropic-family ids (claude-*, sdk:claude-*) depend on the
 * capability tables for that — getThinkingConfig and the SDK engine's adaptive
 * check both look the id up by exact key — so every other id resolves as-is.
 */
export function thinkingParamsResolve(modelId: string): boolean {
  if (!modelId.startsWith('claude-') && !modelId.startsWith('sdk:')) return true;
  return Object.prototype.hasOwnProperty.call(MODEL_CAPABILITIES, capabilityModelId(modelId));
}

/**
 * The model a default replay dispatches.
 *
 * The served id is the pin. But engines report a dated snapshot id
 * (claude-opus-5-20260601) while the capability tables are keyed by the alias
 * (claude-opus-5), and an id missing from those tables loses its thinking
 * parameters at dispatch — a request that is no longer the original's. So:
 *   - newModelId given → exactly that;
 *   - served id resolves → the served id, engine-qualified;
 *   - served id is an unlisted snapshot of a recorded alias that resolves →
 *     the alias (viaAlias), so thinking and effort match the original's;
 *   - otherwise → the served id, flagged thinkingResolves=false.
 * Returns null when there is nothing to dispatch.
 */
export function resolveReplayModel(input: {
  newModelId: string | null;
  servedRaw: string | null;
  engine: string | null;
  aliases: ReadonlyArray<string | null | undefined>;
}): { dispatch: string; viaAlias: boolean; thinkingResolves: boolean } | null {
  if (input.newModelId) {
    return { dispatch: input.newModelId, viaAlias: false, thinkingResolves: thinkingParamsResolve(input.newModelId) };
  }
  if (!input.servedRaw) return null;
  const served = dispatchableModelId(input.servedRaw, input.engine);
  if (thinkingParamsResolve(served)) return { dispatch: served, viaAlias: false, thinkingResolves: true };
  const servedKey = capabilityModelId(served);
  for (const alias of input.aliases) {
    if (!alias) continue;
    const qualified = dispatchableModelId(alias, input.engine);
    const aliasKey = capabilityModelId(qualified);
    if (aliasKey !== servedKey && servedKey.startsWith(`${aliasKey}-`) && thinkingParamsResolve(qualified)) {
      return { dispatch: qualified, viaAlias: true, thinkingResolves: true };
    }
  }
  return { dispatch: served, viaAlias: false, thinkingResolves: false };
}

/**
 * Can this instance dispatch the model at all? Used by the replay pre-flight
 * (unknown id → 409, nothing persisted) and by the import-run advisory. Keyed
 * on what the provider router itself would need — not a guess about pricing.
 */
export function modelAvailability(modelId: string, db?: DatabaseAdapter): { available: boolean; provider: string | null; reason?: string } {
  let provider: string;
  try {
    provider = getProviderFromModelId(modelId, db);
  } catch {
    return { available: false, provider: null, reason: `Model ${modelId} is not a model this instance knows how to dispatch` };
  }
  if (provider === 'anthropic_sdk' && !isSdkEngineEnabled()) {
    return { available: false, provider, reason: 'The Claude subscription engine is disabled in Settings → Execution engines' };
  }
  if (provider === 'anthropic' && !process.env.ANTHROPIC_API_KEY) {
    return { available: false, provider, reason: 'ANTHROPIC_API_KEY is not configured on this instance' };
  }
  if (provider === 'mistral' && !process.env.MISTRAL_API_KEY) {
    return { available: false, provider, reason: 'MISTRAL_API_KEY is not configured on this instance' };
  }
  if (provider === 'openai' && !process.env.OPENAI_API_KEY) {
    return { available: false, provider, reason: 'OPENAI_API_KEY is not configured on this instance' };
  }
  if (provider === 'google' && !process.env.GOOGLE_API_KEY) {
    return { available: false, provider, reason: 'GOOGLE_API_KEY is not configured on this instance' };
  }
  return { available: true, provider };
}

/**
 * The engine said no to the model itself (unknown, retired, not on this
 * plan) — as opposed to a network blip or a budget stop. Only this class maps
 * to the fail-closed 409; everything else is a 502 with the engine's words.
 */
export function isModelRefusal(message: string): boolean {
  return /not[_ ]found|no longer (served|available|supported)|unknown model|invalid model|is not a valid model|model .*(does not exist|is not available|not supported|unavailable)|unsupported model|cannot determine provider|is disabled in Settings|not configured on this instance/i.test(message);
}

function modelRefusedError(modelId: string): string {
  return `Model ${modelId} is no longer served; replay fails closed. Use recompose.`;
}

// ── Replay (Wave 5) ──────────────────────────────────────────────────────────

/** True when the pinned record shows the original run reached the web itself. */
export function recordUsedWebTools(sourceManifest: unknown, snapshot: Record<string, unknown> | null): boolean {
  if (parseManifest(sourceManifest).some((e) => e.type === 'web_search' || e.type === 'web_fetch')) return true;
  const ctx = snapshot?.contextUsed;
  return ctx !== null && typeof ctx === 'object' && (ctx as Record<string, unknown>).webSearch === true;
}

/**
 * Rebuild the exact conversation the original answer was produced from: every
 * non-rerun turn up to and including the user message that produced it, in
 * created_at order. Trailing assistant turns after that user message (a
 * sibling answer persisted later) are dropped. Returns null when no user turn
 * precedes the answer.
 */
export function rebuildReplayMessages(
  rows: Array<{ role: string; content: string }>,
): { messages: Array<{ role: 'user' | 'assistant'; content: string }>; userMessage: string } | null {
  const turns = rows
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));
  let lastUser = -1;
  for (let i = turns.length - 1; i >= 0; i--) {
    if (turns[i].role === 'user') { lastUser = i; break; }
  }
  if (lastUser < 0) return null;
  const messages = turns.slice(0, lastUser + 1);
  return { messages, userMessage: messages[lastUser].content };
}

/**
 * Replay one assistant message verbatim. Ownership of the session is the
 * caller's responsibility (the route checks it; the run importer just created
 * the session for this user). Persists nothing unless the model answers.
 */
export async function replayRun(
  db: DatabaseAdapter,
  input: { sessionId: string; messageId?: string | null; newModelId?: string | null },
): Promise<ReplayOutcome> {
  const { sessionId } = input;
  const session = await db.get<SessionRow>('SELECT id, module_id, config FROM sessions WHERE id = ?', sessionId);
  if (!session) return { ok: false, status: 404, error: 'Session not found' };

  const original = typeof input.messageId === 'string' && input.messageId
    ? await db.get<MessageRow>(
        `SELECT * FROM messages WHERE id = ? AND session_id = ? AND role = 'assistant'`,
        input.messageId, sessionId)
    : await db.get<MessageRow>(
        `SELECT * FROM messages
         WHERE session_id = ? AND role = 'assistant' AND rerun_of IS NULL
         ORDER BY created_at DESC LIMIT 1`,
        sessionId);
  if (!original) return { ok: false, status: 404, error: 'Assistant message not found in this session' };

  // 1) The run record — the whole point of a replay. No record, no replay.
  const record = await db.get<RunRecordRow>(
    `SELECT id, composed_prompt, prompt_sha256, prompt_chars, truncated, layer_summary, source_manifest,
            model_requested, model_served, output_sha256, engine
     FROM run_artifacts WHERE message_id = ?`,
    original.id);
  if (!record || typeof record.composed_prompt !== 'string') {
    return { ok: false, status: 404, error: 'No run record with a stored prompt exists for this message — it cannot be replayed verbatim. Use recompose.' };
  }
  if (record.truncated === true || record.truncated === 1) {
    return { ok: false, status: 409, error: 'Prompt too large to replay verbatim' };
  }
  // The stored bytes must still be the pinned bytes.
  if (sha256Hex(record.composed_prompt) !== record.prompt_sha256) {
    return { ok: false, status: 409, error: 'Stored prompt no longer matches its pinned hash — the record cannot be replayed verbatim' };
  }

  const snapshot = parseSnapshot(original.config_snapshot);

  // 2) The exact messages array, from the messages table, in order.
  const rows = await db.all<MessageRow>(
    `SELECT id, role, content, created_at FROM messages
     WHERE session_id = ? AND created_at <= ? AND id <> ? AND rerun_of IS NULL
     ORDER BY created_at ASC`,
    sessionId, original.created_at, original.id);
  const rebuilt = rebuildReplayMessages(rows);
  if (!rebuilt) return { ok: false, status: 400, error: 'No user message found for this output' };
  const { messages, userMessage } = rebuilt;
  const history = messages.slice(0, -1);

  // 3) The model: the caller's pick, else what the engine served the first time.
  const originalEngine = record.engine ?? (typeof snapshot?.engine === 'string' ? snapshot.engine : null);
  const originalServedRaw = record.model_served ?? servedIdFromSnapshot(snapshot) ?? original.model_id
    ?? (typeof snapshot?.model === 'string' ? snapshot.model : null);
  const resolvedModel = resolveReplayModel({
    newModelId: input.newModelId ?? null,
    servedRaw: originalServedRaw,
    engine: originalEngine,
    aliases: [record.model_requested, original.model_id, typeof snapshot?.model === 'string' ? snapshot.model : null],
  });
  if (!resolvedModel) {
    return { ok: false, status: 400, error: 'The record does not say which model served this output — name one with newModelId' };
  }
  const modelRequested = resolvedModel.dispatch;

  // Pre-flight: an id the router cannot dispatch fails closed before any call.
  const availability = modelAvailability(modelRequested, db);
  if (!availability.available) {
    return { ok: false, status: 409, error: modelRefusedError(modelRequested) };
  }
  const provider = availability.provider ?? 'anthropic';

  // 4) Thinking level from the snapshot. The router derives effort from the
  //    level on the dispatched model — recorded next to the original's effort
  //    so a reader can see the two words match (or why they do not).
  const thinkingLevel = typeof snapshot?.thinking === 'string' && THINKING_LEVELS.has(snapshot.thinking)
    ? snapshot.thinking
    : 'think_hard';
  const originalEffort = typeof snapshot?.effort === 'string' ? snapshot.effort : null;
  const effort = (provider === 'anthropic' || provider === 'anthropic_sdk') && resolvedModel.thinkingResolves
    ? anthropicEffort(thinkingLevel as LadderThinkingLevel, capabilityModelId(modelRequested))
    : null;

  // 5) Tools only when the record shows the original reached the web.
  const webUsed = recordUsedWebTools(record.source_manifest, snapshot);
  const tools = webUsed ? [{ type: 'web_search_20250305', name: 'web_search' }] : undefined;

  // Pricing exactly as the live route derives it: registry models bill at
  // list, Ollama is free, engines and unknown providers record NULL.
  const isSdk = modelRequested.startsWith('sdk:');
  const isCodex = modelRequested.startsWith('codex:');
  const isOllama = modelRequested.startsWith('ollama:');
  const isUnpriced = isSdk || isCodex || isOllama || modelRequested.startsWith('azure:') || modelRequested.startsWith('compat:');
  const modelConfig = isUnpriced ? undefined : await getModelConfig(modelRequested, db);
  const hasKnownPricing = !!modelConfig;

  const requestParams = {
    mode: 'replay' as const,
    model: modelRequested,
    servedSnapshot: resolvedModel.viaAlias ? originalServedRaw : null,
    thinkingLevel,
    effort,
    originalEffort,
    thinkingParamsResolved: resolvedModel.thinkingResolves,
    tools: webUsed ? ['web_search'] : [],
    maxTokens: modelConfig?.maxOutputTokens ?? null,
    messages: messages.length,
    historyDefinition: 'every non-rerun turn before the user message, in created_at order',
    promptSha256: record.prompt_sha256,
  };

  // 6) Dispatch — the stored prompt, byte-for-byte, as `system`.
  let result: ChatResult;
  try {
    result = await callChat({
      model: modelRequested,
      system: record.composed_prompt,
      // Replay promises the stored prompt byte-for-byte and records its hash. The
      // router would otherwise append TODAY's date to a prompt that may predate the
      // date layer, or that already carries the date the original run saw.
      currentDate: false,
      messages,
      thinkingLevel,
      ...(tools ? { tools } : {}),
      ...(modelConfig?.maxOutputTokens ? { maxTokens: modelConfig.maxOutputTokens } : {}),
      db,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (isModelRefusal(message)) {
      return { ok: false, status: 409, error: modelRefusedError(modelRequested) };
    }
    return { ok: false, status: 502, error: `Replay failed: ${message}` };
  }

  // 7) Persist: assistant message + run record, then the v2 columns.
  const rerunMessageId = crypto.randomUUID();
  const costUsd = computeRunCostUsd({
    hasKnownPricing,
    isOllama,
    costPer1MInput: modelConfig?.costPer1MInput ?? 0,
    costPer1MOutput: modelConfig?.costPer1MOutput ?? 0,
    inputTokens: result.inputTokens || 0,
    outputTokens: result.outputTokens || 0,
  });
  const costBasis: 'list' | 'free' | 'plan' | 'unknown' =
    isSdk || isCodex ? 'plan' : isOllama ? 'free' : hasKnownPricing ? 'list' : 'unknown';
  // The router now reports the model the engine actually served
  // (ChatResult.modelServed: the API's response.model, the SDK's result).
  // When an engine reports nothing, the id dispatched stands in — for a
  // default replay that is the original's served id by construction (the
  // engine either serves exactly that or refuses), except through an alias,
  // where equality is reported false because the snapshot cannot be confirmed.
  const servedConfirmed = typeof result.modelServed === 'string' && result.modelServed.length > 0;
  const modelServed = capabilityModelId(servedConfirmed ? (result.modelServed as string) : modelRequested);
  const originalServed = originalServedRaw ? capabilityModelId(originalServedRaw) : null;
  const notes = [REPLAY_NOTE];
  if (resolvedModel.viaAlias) {
    notes.push(servedConfirmed
      ? `The original was served as ${originalServedRaw}, a snapshot id this instance's capability tables do not list, so the replay was sent through its alias ${modelRequested}; the engine reported serving ${result.modelServed}, and model equality compares that against the original.`
      : `The original was served as ${originalServedRaw}, a snapshot id this instance's capability tables do not list, so the replay was sent through its alias ${modelRequested}: the recorded thinking level resolves to the same parameters, but the engine may serve a different snapshot, so the model is not reported as equal.`);
  }
  if (!resolvedModel.thinkingResolves) {
    notes.push(`${modelRequested} is not in this instance's capability tables, so the router cannot resolve thinking parameters for it — this request is not identical to the original's.`);
  }
  const rerunSnapshot = {
    ...(snapshot ?? {}),
    model: modelRequested,
    rerun: { mode: 'replay', of: original.id, modelRequested, modelServed },
  };
  const createdAt = new Date().toISOString();
  await db.run(
    `INSERT INTO messages (id, session_id, role, content, thinking_content, token_count, cost, model_id, config_snapshot, rerun_of, created_at)
     VALUES (?, ?, 'assistant', ?, ?, ?, ?, ?, ?, ?, ?)`,
    rerunMessageId, sessionId, result.text, result.thinking || null, result.outputTokens,
    costUsd, modelRequested, JSON.stringify(rerunSnapshot), original.id, createdAt);

  const layerSummary = parseJsonValue(record.layer_summary);
  const sourceManifest = parseJsonValue(record.source_manifest);
  await writeRunArtifact(db, {
    messageId: rerunMessageId,
    sessionId,
    composedPrompt: record.composed_prompt,
    layerSummary: Array.isArray(layerSummary) ? (layerSummary as Array<{ layer: string; chars: number; sha256: string }>) : [],
    sourceManifest: Array.isArray(sourceManifest) ? sourceManifest : [],
  });
  const output = outputEquality(result.text, original.content);
  const usage = { inputTokens: result.inputTokens || 0, outputTokens: result.outputTokens || 0 };
  await db.run(
    `UPDATE run_artifacts
        SET rerun_of = ?, rerun_mode = 'replay', model_requested = ?, model_served = ?,
            output_sha256 = ?, user_message_sha256 = ?, history_sha256 = ?,
            request_params = ?::jsonb, engine = ?, usage = ?::jsonb, cost_usd = ?, cost_basis = ?,
            status = 'completed', finished_at = NOW()
      WHERE message_id = ?`,
    original.id, modelRequested, modelServed,
    output.sha256, sha256Hex(userMessage), sha256Hex(JSON.stringify(history)),
    JSON.stringify(requestParams), provider, JSON.stringify(usage), costUsd, costBasis,
    rerunMessageId);

  const rerunRow: MessageRow = {
    id: rerunMessageId,
    session_id: sessionId,
    role: 'assistant',
    content: result.text,
    thinking_content: result.thinking || null,
    token_count: result.outputTokens,
    cost: costUsd,
    model_id: modelRequested,
    config_snapshot: JSON.stringify(rerunSnapshot),
    rerun_of: original.id,
    created_at: createdAt,
  };

  return {
    ok: true,
    status: 200,
    body: {
      mode: 'replay',
      originalMessageId: original.id,
      rerunMessageId,
      original: toMessageSummary(original),
      rerun: toMessageSummary(rerunRow),
      model: {
        requested: modelRequested,
        served: modelServed,
        equalsOriginal: originalServed !== null && modelServed === originalServed,
      },
      prompt: { sha256: record.prompt_sha256, equalsOriginal: true },
      output,
      usage,
      note: notes.join(' '),
      sourceDriftAvailable: false,
      sourceDrift: [],
      sourceDriftDetected: false,
    },
  };
}

/**
 * For the run importer: can the just-imported run be replayed verbatim here?
 * Replay needs a stored, untruncated prompt, a user turn, and a dispatchable
 * served model; otherwise the honest path is recompose.
 */
export async function describeReplayability(
  db: DatabaseAdapter,
  sessionId: string,
  messageId: string,
): Promise<{ mode: RerunMode; model: string | null; reason: string }> {
  const original = await db.get<MessageRow>(
    `SELECT * FROM messages WHERE id = ? AND session_id = ? AND role = 'assistant'`, messageId, sessionId);
  if (!original) return { mode: 'recompose', model: null, reason: 'The imported assistant message could not be read back.' };
  const record = await db.get<Pick<RunRecordRow, 'composed_prompt' | 'prompt_sha256' | 'truncated' | 'model_requested' | 'model_served' | 'engine'>>(
    'SELECT composed_prompt, prompt_sha256, truncated, model_requested, model_served, engine FROM run_artifacts WHERE message_id = ?', original.id);
  const snapshot = parseSnapshot(original.config_snapshot);
  const servedRaw = record?.model_served ?? servedIdFromSnapshot(snapshot) ?? original.model_id
    ?? (typeof snapshot?.model === 'string' ? snapshot.model : null);
  const engine = record?.engine ?? (typeof snapshot?.engine === 'string' ? snapshot.engine : null);
  // Same resolution the replay itself uses, so the advice names the id it would send.
  const model = resolveReplayModel({
    newModelId: null,
    servedRaw,
    engine,
    aliases: [record?.model_requested, original.model_id, typeof snapshot?.model === 'string' ? snapshot.model : null],
  })?.dispatch ?? null;

  if (!record || typeof record.composed_prompt !== 'string' || !record.prompt_sha256) {
    return { mode: 'recompose', model, reason: 'The bundle did not carry the composed prompt and its hash — only a recompose (fresh composition on this instance) is possible.' };
  }
  if (record.truncated === true || record.truncated === 1) {
    return { mode: 'recompose', model, reason: 'The composed prompt was truncated at export — too large to replay verbatim.' };
  }
  if (sha256Hex(record.composed_prompt) !== record.prompt_sha256) {
    return { mode: 'recompose', model, reason: 'The composed prompt does not match its pinned hash — it cannot be replayed verbatim.' };
  }
  const userTurn = await db.get<{ id: string }>(
    `SELECT id FROM messages WHERE session_id = ? AND role = 'user' AND created_at <= ? ORDER BY created_at DESC LIMIT 1`,
    sessionId, original.created_at);
  if (!userTurn) {
    return { mode: 'recompose', model, reason: 'The originating user input did not travel with the run — neither mode can reproduce it.' };
  }
  if (!model) {
    return { mode: 'recompose', model: null, reason: 'The run does not record which model served it — replay needs one; pick a model and recompose.' };
  }
  const availability = modelAvailability(model, db);
  if (!availability.available) {
    return { mode: 'recompose', model, reason: `${availability.reason ?? `Model ${model} is not available here`} — falling back to recompose with a model of your choice.` };
  }
  return { mode: 'replay', model, reason: `Composed prompt and hashes travelled; ${model} is served here — POST /api/rerun with mode "replay" reproduces the run verbatim.` };
}

// ── Routes ───────────────────────────────────────────────────────────────────

export function createRerunRoutes(db: DatabaseAdapter, claudeRouter: Router): Router {
  const router = Router();

  // POST /api/rerun — re-execute an assistant message: recompose (default,
  // another model through the live pipeline) or replay (verbatim).
  router.post('/rerun', async (req: Request, res: Response) => {
    try {
      const { sessionId, messageId, newModelId, areaId, mode: rawMode } = (req.body ?? {}) as {
        sessionId?: unknown; messageId?: unknown; newModelId?: unknown; areaId?: unknown; mode?: unknown;
      };
      if (typeof sessionId !== 'string' || !sessionId) {
        return res.status(400).json({ error: 'sessionId is required' });
      }
      const mode: RerunMode = rawMode === undefined || rawMode === null ? 'recompose' : (rawMode as RerunMode);
      if (mode !== 'replay' && mode !== 'recompose') {
        return res.status(400).json({ error: "mode must be 'replay' or 'recompose'" });
      }
      const modelGiven = newModelId !== undefined && newModelId !== null && newModelId !== '';
      if (modelGiven && (typeof newModelId !== 'string' || newModelId.length > 100)) {
        return res.status(400).json({ error: 'newModelId must be a model id' });
      }
      if (mode === 'recompose' && !modelGiven) {
        return res.status(400).json({ error: 'newModelId is required' });
      }

      // SECURITY (2026-07-27 survey): this loaded any session by id, then reran it and
      // DELETED its messages — so on a shared instance one user could destroy another's
      // conversation history and re-run their prompts (billing the instance's keys) with
      // nothing but a session id. Checked before the row is loaded, so another tenant's
      // config never reaches memory.
      if (!(await assertOwned(db, req as OwnedRequest, res, {
        table: 'sessions', ownerColumn: 'user_id', id: sessionId,
        notFoundMessage: 'Session not found',
      }))) return;

      // ── Replay: the stored record, verbatim ────────────────────────────────
      if (mode === 'replay') {
        const outcome = await replayRun(db, {
          sessionId,
          messageId: typeof messageId === 'string' ? messageId : null,
          newModelId: modelGiven ? (newModelId as string) : null,
        });
        return res.status(outcome.status).json(outcome.ok ? outcome.body : { error: outcome.error });
      }

      // ── Recompose: today's behaviour ──────────────────────────────────────
      const newModel = newModelId as string;
      const session = await db.get<SessionRow>(
        'SELECT id, module_id, config FROM sessions WHERE id = ?', sessionId);
      if (!session) return res.status(404).json({ error: 'Session not found' });

      // Bridged engagement sessions (module_id 'engagement') cannot be rerun in
      // isolation. They are projections of an engagement iteration (item 4.4
      // bridge): their assistant message DOES carry a config_snapshot, but it is
      // the engagement bridge's minimal config (model/thinking/engagementId) —
      // it lacks the claude pipeline fields (knowledge sources, output formats,
      // scope, client intelligence, quality blueprint) the real run used, and
      // 'engagement' is not a registered module, so a re-dispatch would run a
      // generic prompt and present degraded output as a faithful comparison.
      // (Council 'ai-council' and workflow client sessions don't hit this guard:
      // their assistant messages have no config_snapshot at all, so they are
      // already refused by the snapshot check below.)
      if (session.module_id === 'engagement') {
        return res.status(400).json({
          error: "This engagement output can't be rerun in isolation — re-run it from the engagement workspace.",
        });
      }

      // 1) Resolve the original assistant message (explicit id, or the latest
      //    non-rerun assistant message in the session).
      const original = typeof messageId === 'string' && messageId
        ? await db.get<MessageRow>(
            `SELECT * FROM messages WHERE id = ? AND session_id = ? AND role = 'assistant'`,
            messageId, sessionId)
        : await db.get<MessageRow>(
            `SELECT * FROM messages
             WHERE session_id = ? AND role = 'assistant' AND rerun_of IS NULL
             ORDER BY created_at DESC LIMIT 1`,
            sessionId);
      if (!original) return res.status(404).json({ error: 'Assistant message not found in this session' });

      const snapshot = parseSnapshot(original.config_snapshot);
      if (!snapshot) {
        return res.status(400).json({
          error: 'This message has no config snapshot — it predates per-message config capture and cannot be rerun faithfully.',
        });
      }
      if (snapshot.model === newModel) {
        return res.status(400).json({ error: 'Pick a different model — this output was already produced by that model.' });
      }

      // 2) The input: the user message that immediately precedes the original.
      const userMsg = await db.get<MessageRow>(
        `SELECT * FROM messages
         WHERE session_id = ? AND role = 'user' AND created_at <= ?
         ORDER BY created_at DESC LIMIT 1`,
        sessionId, original.created_at);
      if (!userMsg) return res.status(400).json({ error: 'No user message found for this output' });

      // 3) Conversation history BEFORE that user message (reruns excluded so a
      //    second rerun replays the original context, not earlier comparisons).
      const historyRows = await db.all<MessageRow>(
        `SELECT * FROM messages
         WHERE session_id = ? AND created_at < ? AND rerun_of IS NULL AND id <> ?
         ORDER BY created_at ASC`,
        sessionId, userMsg.created_at, userMsg.id);
      const history = historyRows
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

      // Best-effort moduleInputs recovery (not part of config_snapshot).
      let moduleInputs: Record<string, unknown> | null = null;
      try {
        const sessConfig = session.config ? JSON.parse(session.config) as Record<string, unknown> : null;
        if (sessConfig && sessConfig.moduleInputs !== null && typeof sessConfig.moduleInputs === 'object' && !Array.isArray(sessConfig.moduleInputs)) {
          moduleInputs = sessConfig.moduleInputs as Record<string, unknown>;
        }
      } catch { /* non-fatal */ }

      const moduleId = session.module_id || null;
      const body = rehydrateClaudeBody({
        snapshot,
        newModelId: newModel,
        sessionId,
        moduleId,
        areaId: typeof areaId === 'string' && areaId ? areaId : null,
        userMessage: userMsg.content,
        history,
        moduleInputs,
        rerunOf: original.id,
      });

      // 4) Execute through the live pipeline (internal dispatch — see header).
      const t0 = new Date(Date.now() - 50).toISOString();
      // The caller's role travels with the id, so an admin (already allowed past the
      // ownership check above) is not treated as a non-admin inside the pipeline.
      const { id: userId, role } = (req as Request & { user?: { id?: string; role?: string } }).user ?? {};
      const result = await dispatchClaudeMessage(claudeRouter, body, { userId, role });

      // Non-SSE JSON response = the pipeline rejected the request (bad key,
      // budget, context too large, validation, …). Forward it honestly.
      if (result.jsonBody !== null && result.statusCode >= 400) {
        const errBody = result.jsonBody as Record<string, unknown>;
        return res.status(result.statusCode).json({
          error: String(errBody.error ?? 'Rerun rejected by the model pipeline'),
          details: errBody,
        });
      }
      const sseError = result.sseEvents.find((e) => e.type === 'error');

      // 5) The dispatch's onComplete persisted a fresh user+assistant pair.
      //    Find the new assistant message (persistence is async after stream end
      //    — poll briefly), flag it rerun_of, and remove the duplicate user row.
      let rerunMsg: MessageRow | undefined;
      for (let attempt = 0; attempt < 40; attempt++) {
        rerunMsg = await db.get<MessageRow>(
          `SELECT * FROM messages
           WHERE session_id = ? AND role = 'assistant' AND created_at > ? AND id <> ? AND rerun_of IS NULL
           ORDER BY created_at DESC LIMIT 1`,
          sessionId, t0, original.id);
        if (rerunMsg) break;
        await sleep(250);
      }

      // Always clean up the duplicated user message the pipeline saved.
      try {
        await db.run(
          `DELETE FROM messages WHERE id IN (
             SELECT id FROM messages
             WHERE session_id = ? AND role = 'user' AND created_at > ? AND content = ? AND id <> ?
             ORDER BY created_at DESC LIMIT 1
           )`,
          sessionId, t0, userMsg.content, userMsg.id);
      } catch { /* non-fatal */ }

      if (!rerunMsg) {
        return res.status(502).json({
          error: sseError ? `Rerun failed: ${String(sseError.message ?? 'model error')}` : 'Rerun produced no persisted output',
        });
      }

      await db.run('UPDATE messages SET rerun_of = ? WHERE id = ?', original.id, rerunMsg.id);
      rerunMsg.rerun_of = original.id;

      // 6) Source-drift: compare pinned source manifests (run_artifacts, item
      //    1.6). The rerun's artifact write is fire-and-forget — poll briefly.
      const originalArtifact = await db.get<{ source_manifest: unknown; prompt_sha256: string | null }>(
        'SELECT source_manifest, prompt_sha256 FROM run_artifacts WHERE message_id = ?', original.id);
      let rerunArtifact: { source_manifest: unknown; prompt_sha256: string | null } | undefined;
      for (let attempt = 0; attempt < 20; attempt++) {
        rerunArtifact = await db.get<{ source_manifest: unknown; prompt_sha256: string | null }>(
          'SELECT source_manifest, prompt_sha256 FROM run_artifacts WHERE message_id = ?', rerunMsg.id);
        if (rerunArtifact) break;
        await sleep(250);
      }

      const driftAvailable = !!(originalArtifact && rerunArtifact);
      const sourceDrift = driftAvailable
        ? computeSourceDrift(originalArtifact!.source_manifest, rerunArtifact!.source_manifest)
        : [];

      // Wave 5: the ledger says what kind of rerun this row is (best-effort —
      // the artifact write above is fire-and-forget and may not have landed).
      const output = outputEquality(rerunMsg.content, original.content);
      if (rerunArtifact) {
        try {
          await db.run(
            `UPDATE run_artifacts SET rerun_of = ?, rerun_mode = 'recompose', output_sha256 = COALESCE(output_sha256, ?) WHERE message_id = ?`,
            original.id, output.sha256, rerunMsg.id);
        } catch { /* non-fatal */ }
      }
      const rerunSnapshot = parseSnapshot(rerunMsg.config_snapshot);
      const originalServedRaw = servedIdFromSnapshot(snapshot) ?? original.model_id ?? (typeof snapshot.model === 'string' ? snapshot.model : null);
      const rerunServedRaw = servedIdFromSnapshot(rerunSnapshot) ?? rerunMsg.model_id ?? newModel;
      const originalServed = originalServedRaw ? capabilityModelId(originalServedRaw) : null;
      const rerunServed = capabilityModelId(rerunServedRaw);

      res.json({
        mode: 'recompose',
        originalMessageId: original.id,
        rerunMessageId: rerunMsg.id,
        original: toMessageSummary(original),
        rerun: toMessageSummary(rerunMsg),
        model: {
          requested: newModel,
          served: rerunServed,
          equalsOriginal: originalServed !== null && rerunServed === originalServed,
        },
        prompt: {
          sha256: rerunArtifact?.prompt_sha256 ?? null,
          originalSha256: originalArtifact?.prompt_sha256 ?? null,
          equalsOriginal: !!(rerunArtifact?.prompt_sha256 && originalArtifact?.prompt_sha256 && rerunArtifact.prompt_sha256 === originalArtifact.prompt_sha256),
        },
        output,
        sourceDriftAvailable: driftAvailable,
        sourceDrift,
        sourceDriftDetected: sourceDrift.some((d) => d.changed),
        warning: sseError ? String(sseError.message ?? '') : undefined,
      });
    } catch (err) {
      console.error('[rerun] error:', err);
      if (!res.headersSent) res.status(500).json({ error: safeError(err) });
    }
  });

  // GET /api/rerun/quality/:messageId — quality score for one message's content
  // (quality_scores is keyed by content hash; scoring is async, so the UI polls).
  router.get('/rerun/quality/:messageId', async (req: Request, res: Response) => {
    try {
      const messageId = req.params.messageId as string;
      // Team isolation: the message's session must be the caller's, joined in SQL
      // before anything is read. Another user's message answers the same 404 as a
      // missing one, so the route no longer confirms that an id exists. Solo mode
      // and admins are not scoped.
      const msg = scopesToOwner(req as OwnedRequest)
        ? await db.get<{ content: string; session_id: string }>(
            `SELECT m.content, m.session_id FROM messages m JOIN sessions s ON s.id = m.session_id
              WHERE m.id = ? AND s.user_id = ?`,
            messageId, (req as OwnedRequest).user?.id ?? '')
        : await db.get<{ content: string; session_id: string }>(
            'SELECT content, session_id FROM messages WHERE id = ?', messageId);
      if (!msg) return res.status(404).json({ error: 'Message not found' });
      const hash = qualityContentHash(msg.content);
      const score = await db.get<Record<string, unknown>>(
        `SELECT score_overall, score_completeness, score_accuracy, score_structure,
                score_actionability, score_citations, scored_at
         FROM quality_scores
         WHERE content_hash = ? AND (session_id = ? OR session_id IS NULL)
         ORDER BY scored_at DESC LIMIT 1`,
        hash, msg.session_id);
      if (!score) return res.json({ score: null });
      res.json({
        score: {
          overall: Number(score.score_overall),
          completeness: score.score_completeness !== null ? Number(score.score_completeness) : null,
          accuracy: score.score_accuracy !== null ? Number(score.score_accuracy) : null,
          structure: score.score_structure !== null ? Number(score.score_structure) : null,
          actionability: score.score_actionability !== null ? Number(score.score_actionability) : null,
          citations: score.score_citations !== null ? Number(score.score_citations) : null,
        },
      });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  return router;
}
