/**
 * claude-sdk-client.ts — the SDK execution engine.
 *
 * Runs Anthropic models through the Claude Agent SDK subprocess instead of
 * the Messages API (claude-client.ts). The point is auth: the subprocess
 * authenticates with the machine's Claude Code login, so a Claude
 * SUBSCRIPTION can power module runs on an instance whose ANTHROPIC_API_KEY
 * is absent or unfunded. Model ids use the `sdk:` prefix (sdk:claude-opus-5),
 * following the azure:/ollama:/compat: convention — no static registry entry.
 *
 * This engine is a TEXT ENGINE, not an agent:
 *   - `tools: []` — every built-in tool disabled. No file access, no shell.
 *     Nothing needs containing because nothing is granted. The one exception
 *     is opt-in: a caller that passes ANTON's web_search tool gets exactly
 *     WebSearch + WebFetch (network reads, nothing local) and a bounded number
 *     of turns to use them — see SDK_WEB_TOOLS below.
 *   - `maxTurns: 1` — one completion per request (SDK_WEB_MAX_TURNS with web tools).
 *   - `settingSources: []` — the user's personal Claude Code settings, hooks
 *     and CLAUDE.md never leak into an ANTON run.
 *   - `persistSession: false` — runs don't pile up in ~/.claude/projects.
 *
 * AUTH RULE (the load-bearing line): the subprocess env NEVER carries
 * ANTHROPIC_API_KEY (or ANTHROPIC_AUTH_TOKEN). ANTON's server holds the
 * (possibly unfunded) key in its own environment; if the subprocess saw it,
 * the SDK would bill the key instead of the subscription. Since Wave 5 the
 * env is built from an ALLOW-LIST (buildSubprocessEnv) rather than
 * process.env minus the key: the server's environment also holds
 * DATABASE_URL, every other provider's key and the credential-vault key, and
 * a subprocess that can be steered by fetched text must not inherit them.
 * Options.env REPLACES the subprocess environment wholesale, so the list
 * keeps what the runtime needs to start and to find the Claude Code login
 * (PATH, HOME/USERPROFILE, APPDATA, TEMP, proxies, CLAUDE_* config).
 *
 * Capability differences vs the API path, stated rather than hidden:
 *   - Web search runs through the SDK's own WebSearch/WebFetch tools, not the
 *     API's server-side web_search tool; the instruction is reworded to match.
 *   - The SDK reports a cost figure, but on subscription auth the spend is
 *     plan usage, not a bill.
 *   - Each request spawns the Claude Code runtime (~seconds of startup);
 *     concurrent SDK runs are capped at MAX_CONCURRENT_SDK_RUNS.
 */

import os from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import type { DatabaseAdapter } from '../db/database.js';
import type { StreamSink } from './stream-sink.js';
import type { WebSourceRecord } from '../../src/lib/types.js';
import { anthropicUsesAdaptive, anthropicEffort, anthropicBudgetTokens, type AnthropicEffort } from './thinking-map.js';
import { isSdkEngineEnabled } from './sdk-engine-store.js';
import { SDK_MODEL_PREFIX, isSdkModel, sdkUnderlyingModel } from './engine-model-id.js';

// ── Model id convention ─────────────────────────────────────
// The prefix helpers live in engine-model-id.ts — a leaf, so a capability
// lookup can strip the prefix without loading the engine. Re-exported here so
// existing importers are untouched.
export { SDK_MODEL_PREFIX, isSdkModel, sdkUnderlyingModel };

/** The models offered in the picker when the engine is enabled — single
 *  source for the Settings route; the frontend renders what this returns. */
export const SDK_ENGINE_MODELS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'sdk:claude-opus-5', label: 'Claude Opus 5 (subscription)' },
  { id: 'sdk:claude-sonnet-5', label: 'Claude Sonnet 5 (subscription)' },
  { id: 'sdk:claude-fable-5', label: 'Claude Fable 5 (subscription)' },
  { id: 'sdk:claude-fable-5-1', label: 'Claude Fable 5.1 (subscription)' },
];

// ── Subprocess environment ──────────────────────────────────

/**
 * Exact variable names the subprocess may inherit, compared case-insensitively
 * (Windows spells PATH as `Path` and the shell's casing is not ours to fix).
 * Each is there because the Claude Code runtime needs it to start, to find
 * its login, or to reach the network — never because it is convenient:
 *   - process/OS plumbing: PATH, PATHEXT, SystemRoot, SystemDrive, ComSpec,
 *     windir (Node on Windows fails DNS and crypto without SystemRoot);
 *   - temp + home, where the login and config live: TEMP/TMP/TMPDIR, HOME,
 *     USERPROFILE, HOMEDRIVE/HOMEPATH, APPDATA, LOCALAPPDATA, ProgramData,
 *     USERNAME;
 *   - locale/terminal: LANG, LC_ALL, TERM, SHELL;
 *   - network egress: HTTP(S)_PROXY, NO_PROXY and the CA-bundle paths a
 *     corporate proxy needs alongside them (NODE_EXTRA_CA_CERTS, SSL_CERT_*
 *     are file paths, not secrets). NODE_OPTIONS is deliberately absent —
 *     it can preload code into the runtime.
 */
const SUBPROCESS_ENV_ALLOWED: ReadonlySet<string> = new Set([
  'PATH', 'PATHEXT', 'SYSTEMROOT', 'SYSTEMDRIVE', 'COMSPEC', 'WINDIR',
  'TEMP', 'TMP', 'TMPDIR', 'HOME', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH',
  'APPDATA', 'LOCALAPPDATA', 'PROGRAMDATA', 'USERNAME',
  'LANG', 'LC_ALL', 'TERM', 'SHELL',
  'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY',
  'NODE_EXTRA_CA_CERTS', 'SSL_CERT_FILE', 'SSL_CERT_DIR',
]);
/** Prefixes that pass when the name is not secret-shaped: CLAUDE_CONFIG_DIR,
 *  CLAUDE_CODE_* switches, ANTHROPIC_BASE_URL / ANTHROPIC_MODEL style knobs. */
const SUBPROCESS_ENV_PREFIXES: ReadonlyArray<string> = ['CLAUDE_', 'ANTHROPIC_'];
/** A prefixed name carrying a credential never passes, whatever it is called. */
const SECRET_SHAPED_NAME = /API_KEY|AUTH_TOKEN|TOKEN|SECRET|PASSWORD/;
/**
 * The plumbing of a Claude Code session ANTON itself was started from (its
 * session id, messaging socket, parent pid, child-session flag). The engine
 * needs none of it, and handing a subprocess the address of another
 * session's messaging socket is a channel nobody asked for.
 */
const HOST_SESSION_PLUMBING = /^(CLAUDE_CODE_SESSION_ID|CLAUDE_CODE_MESSAGING_SOCKET|CLAUDE_CODE_CHILD_SESSION|CLAUDE_CODE_ENTRYPOINT|CLAUDE_CODE_SSE_PORT|CLAUDE_PID|CLAUDECODE)$/;

/**
 * The env handed to the SDK subprocess, built from `source` by allow-list.
 * ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN never pass — their absence is what
 * makes the SDK authenticate with the machine's Claude Code login — and
 * neither does anything the list does not name (DATABASE_URL, other
 * providers' keys, the vault key). Exported so a test can prove both halves.
 */
export function buildSubprocessEnv(source: NodeJS.ProcessEnv): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {};
  for (const [name, value] of Object.entries(source)) {
    if (value === undefined) continue;
    const upper = name.toUpperCase();
    if (upper === 'ANTHROPIC_API_KEY' || upper === 'ANTHROPIC_AUTH_TOKEN') continue;
    if (HOST_SESSION_PLUMBING.test(upper)) continue;
    const byName = SUBPROCESS_ENV_ALLOWED.has(upper);
    const byPrefix = SUBPROCESS_ENV_PREFIXES.some((p) => upper.startsWith(p)) && !SECRET_SHAPED_NAME.test(upper);
    if (byName || byPrefix) env[name] = value;
  }
  return env;
}

/** The subprocess env for a run: the allow-listed view of the server's environment. */
export function buildSdkEnv(base: NodeJS.ProcessEnv = process.env): Record<string, string | undefined> {
  return buildSubprocessEnv(base);
}

// ── Thinking mapping ────────────────────────────────────────

type ThinkingLevel = 'quick' | 'think' | 'think_hard' | 'investigate' | 'plan_first' | 'deep_investigate';

/**
 * ANTON's six thinking levels map onto the SDK's first-class thinking/effort
 * options via the same single-source tables the API path uses (thinking-map.ts).
 * Adaptive models get { thinking: adaptive, effort }; budget models get an
 * explicit budget; quick on a budget model disables thinking.
 */
export function sdkThinkingOptions(level: ThinkingLevel, underlyingModel: string): {
  thinking?: { type: 'adaptive' } | { type: 'enabled'; budgetTokens: number } | { type: 'disabled' };
  effort?: AnthropicEffort;
} {
  if (anthropicUsesAdaptive(underlyingModel)) {
    return { thinking: { type: 'adaptive' }, effort: anthropicEffort(level, underlyingModel) };
  }
  const budget = anthropicBudgetTokens(level);
  if (budget === null) return { thinking: { type: 'disabled' } };
  return { thinking: { type: 'enabled', budgetTokens: budget } };
}

// ── Config / result shapes (mirror claude-client) ───────────

export interface SdkStreamConfig {
  /** The prefixed id, e.g. sdk:claude-opus-5. */
  model: string;
  thinking: ThinkingLevel;
  /** Dynamic system prompt portion (or the whole prompt when static is absent). */
  system: string;
  /** Static portion — concatenated ahead of `system`. The SDK has no
   *  cache_control surface, so the split collapses; order is preserved. */
  staticSystemPrompt?: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string | object[] }>;
  signal?: AbortSignal;
  sourceManifest?: string[];
  /** Claude-format tools the caller holds for the API path. Only ANTON's
   *  web_search entry means anything here: its presence grants SDK_WEB_TOOLS. */
  tools?: ReadonlyArray<{ type: string; name?: string }>;
  /** Wave 3: a schema-constrained turn. Passed straight to the SDK's
   *  `outputFormat` option — the engine validates the answer against the
   *  schema and retries on its side, and the parsed object comes back as
   *  `SdkCompletionData.structuredOutput`. The containment set (no tools,
   *  one turn) is unchanged: this is the text engine answering in JSON, not
   *  an agent. Used by the structured extractor instead of prompt + regex. */
  outputFormat?: { type: 'json_schema'; schema: Record<string, unknown> };
}

export interface SdkCompletionData {
  text: string;
  thinking: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  /** Wave 0: the model id the engine actually served (from the SDK result's
   *  per-model usage map), so the ledger can record more than the `sdk:` alias. */
  modelServed?: string;
  /** Wave 0: the SDK's own running cost estimate for the query — plan usage,
   *  not a bill; recorded as a basis-tagged figure, never as messages.cost. */
  engineCostUsd?: number;
  /** Wave 0: the exact system prompt string handed to the subprocess (after the
   *  web-search instruction rewording), so the run artifact stores what was sent. */
  systemPromptSent?: string;
  /** Wave 2: every WebSearch / WebFetch call the run made, paired with what
   *  the tool returned (query + hits; URL + sha256 of the fetched text). Present
   *  on this engine — possibly empty — and absent on engines without web tools. */
  webSources?: WebSourceRecord[];
  /** Wave 3: the object the engine produced for a `outputFormat` run —
   *  already parsed and schema-checked by the SDK. Absent on text runs. */
  structuredOutput?: unknown;
  /** Wave 5: the assistant content blocks the engine returned (thinking,
   *  text, tool_use), in order across every assistant envelope — the same
   *  field claude-client.ts fills from the API's final message, so the chat
   *  route stores them in messages.content_blocks. Absent when the runtime
   *  returned no assistant envelope. */
  rawContentBlocks?: unknown[];
}
export type { WebSourceRecord };

interface ContentBlock {
  type: 'thinking' | 'text';
  content: string;
}

// ── Web tools ───────────────────────────────────────────────

/** The only built-in tools this engine ever grants: network reads. Never a
 *  local tool — WebFetch reaches the network, not the filesystem. */
export const SDK_WEB_TOOLS: ReadonlyArray<string> = ['WebSearch', 'WebFetch'];

/** Turns a web run may take — search, read a result or two, answer. Bounded so
 *  a model that keeps searching cannot hold a subscription slot indefinitely.
 *  A run that hits the cap with text already streamed keeps that text. */
export const SDK_WEB_MAX_TURNS = 8;

/** True when the caller's Claude tool list carries ANTON's web_search entry. */
export function sdkWebToolsRequested(tools?: ReadonlyArray<{ type: string; name?: string }>): boolean {
  return (tools ?? []).some((t) => t.type.startsWith('web_search') || t.name === 'web_search');
}

const WEB_SEARCH_BLOCK = /## WEB SEARCH ENABLED\n[^\n]*Use the web_search tool[^\n]*/g;

/**
 * The knowledge resolver writes "Use the web_search tool …" for the API's
 * server-side tool. On this engine the tool is called WebSearch (with WebFetch
 * to read a page), so the instruction is reworded when the tools are granted
 * and removed when they are not — a prompt must never name a tool the request
 * does not carry.
 */
export function adaptWebSearchInstruction(system: string, webToolsGranted: boolean): string {
  if (webToolsGranted) {
    return system.replace(/\bweb_search tool\b/g, 'WebSearch tool (and WebFetch to read a result page)');
  }
  return system.replace(WEB_SEARCH_BLOCK, '').replace(/\n{3,}/g, '\n\n');
}

/** The no-web form, for engines that have no web tools at all (Codex). */
export function stripWebSearchInstructions(system: string): string {
  return adaptWebSearchInstruction(system, false);
}

// ── Concurrency cap ─────────────────────────────────────────

const MAX_CONCURRENT_SDK_RUNS = 2;

/**
 * Slots a BACKGROUND run may occupy. One is always held back for interactive
 * work.
 *
 * The subscription engine allows two concurrent runs. Markets backlog
 * extraction is one LLM call per item and the queue runs to four figures, so a
 * catch-up pass held both slots continuously for minutes at a time — and a user
 * who pressed Run in a module got "Operation aborted" while the machine was
 * demonstrably busy doing something they had not asked for. Background work
 * yields the last slot rather than competing for it.
 */
const MAX_BACKGROUND_SDK_RUNS = MAX_CONCURRENT_SDK_RUNS - 1;
let activeRuns = 0;

// ── Daily cap (Wave 5, 2026-09-17) ──────────────────────────
// A subscription has a plan allowance, not a bill: none of the API path's
// spend guards apply to it, and a scheduled loop can use the day's allowance
// before anyone sits down to work. The cap is a Settings value (app_settings
// 'sdk_daily_run_cap'; absent = unlimited) checked against an in-process
// count of runs STARTED today. The count is seeded once per day from the
// audit log — provider 'anthropic_sdk', created_at today — so a restart does
// not hand out a fresh allowance; runs counted after the seed add to it.

export const SDK_DAILY_RUN_CAP_SETTING_KEY = 'sdk_daily_run_cap';
/** Runs the audit log already holds for today. audit_log carries both
 *  `timestamp` and `created_at`; created_at is the indexed one. */
export const SDK_DAILY_CAP_SEED_SQL =
  "SELECT COUNT(*) AS n FROM audit_log WHERE provider = 'anthropic_sdk' AND created_at >= date_trunc('day', NOW())";

let guardDb: DatabaseAdapter | null = null;
/** undefined = not loaded; null = loaded, unlimited. */
let dailyCap: number | null | undefined;
let capLoading: Promise<void> | null = null;
let runsToday = 0;
/** The local calendar day the counter belongs to; a new day starts at zero. */
let counterDay = '';
let seededDay = '';
let seeding: Promise<void> | null = null;

function localDay(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function rollDay(): void {
  const today = localDay();
  if (counterDay !== today) { counterDay = today; runsToday = 0; }
}
function parseDailyCap(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 ? n : null;
}
async function loadDailyCap(db: DatabaseAdapter): Promise<void> {
  try {
    const row = await db.get<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', SDK_DAILY_RUN_CAP_SETTING_KEY);
    dailyCap = parseDailyCap(row?.value);
  } catch (err) {
    console.warn(`[sdk-engine] could not load the daily run cap: ${err instanceof Error ? err.message : 'db error'}`);
    dailyCap = null;
  }
}

/** Prime the cap and remember the database for the seed. Safe to call repeatedly. */
export function initSdkDailyGuard(db: DatabaseAdapter): void {
  guardDb = db;
  if (dailyCap === undefined && !capLoading) {
    capLoading = loadDailyCap(db).finally(() => { capLoading = null; });
  }
}

/**
 * Seed today's count from the audit log, once per day, before the first run
 * of the day is admitted. Without a database (tests, or a caller that ran
 * before boot wiring) the count starts at zero. A seed that fails logs once
 * and counts from zero rather than refusing runs.
 */
export async function ensureSdkDailyCounterSeeded(): Promise<void> {
  if (capLoading) await capLoading;
  rollDay();
  if (seededDay === counterDay || !guardDb) return;
  if (!seeding) {
    const db = guardDb;
    const day = counterDay;
    seeding = (async () => {
      try {
        const row = await db.get<{ n: number | string }>(SDK_DAILY_CAP_SEED_SQL);
        const n = Number(row?.n ?? 0);
        // Runs admitted while the seed was in flight are already in runsToday.
        if (counterDay === day) runsToday += Number.isFinite(n) ? n : 0;
      } catch (err) {
        console.warn(`[sdk-engine] could not seed today's subscription run count from the audit log: ${err instanceof Error ? err.message : 'db error'}`);
      } finally {
        if (counterDay === day) seededDay = day;
        seeding = null;
      }
    })();
  }
  await seeding;
}

/** Runs started today (seed + runs admitted since). */
export function sdkRunsToday(): number {
  rollDay();
  return runsToday;
}
/** The persisted cap; null = unlimited. */
export function getSdkDailyRunCap(): number | null {
  return dailyCap ?? null;
}
/** Persist the cap (null removes it). The cache updates synchronously. */
export async function setSdkDailyRunCap(db: DatabaseAdapter, cap: number | null): Promise<void> {
  guardDb = db;
  if (cap === null) {
    await db.run('DELETE FROM app_settings WHERE key = ?', SDK_DAILY_RUN_CAP_SETTING_KEY);
  } else {
    await db.run(
      'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      SDK_DAILY_RUN_CAP_SETTING_KEY,
      String(cap),
    );
  }
  dailyCap = cap;
}
/** The refusal for a run that would exceed the cap, or null when it may start. */
export function sdkDailyCapRefusal(): string | null {
  rollDay();
  const cap = dailyCap ?? null;
  if (cap === null || runsToday < cap) return null;
  return `Daily cap of ${cap} subscription runs reached — raise it in Settings → Execution engines.`;
}
function noteSdkRunStarted(): void {
  rollDay();
  runsToday += 1;
}
/** Tests: forget the cap, the count and the database. */
export function resetSdkDailyCounterForTests(): void {
  guardDb = null;
  dailyCap = undefined;
  capLoading = null;
  runsToday = 0;
  counterDay = '';
  seededDay = '';
  seeding = null;
}

/**
 * Set once the process is going down, so an abort can be explained rather than
 * guessed at.
 *
 * In development the server runs under `tsx watch`, which restarts on any file
 * change under server/ — so the single most common cause of an in-flight run
 * aborting is not a timeout or a saturated engine, it is somebody saving a
 * file. Telling the user to retry or switch model when a colleague's editor
 * killed their request wastes their time on the wrong hypothesis.
 */
let shuttingDown = false;
export function markSdkEngineShuttingDown(): void { shuttingDown = true; }

/**
 * Turn an engine failure into something the reader can act on.
 *
 * Every failure used to be reported as "The Claude Code runtime must be
 * installed and logged in on this machine" — including aborts, upstream 529s
 * and a saturated engine. That sentence sent people to reinstall a runtime that
 * was working perfectly, and hid the real cause, which was usually transient.
 */
function explainSdkFailure(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes('abort')) {
    if (shuttingDown) {
      return `SDK engine error: ${msg}. The server restarted while this run was in flight — in development that is usually a file save triggering the watcher, not a problem with the request. Nothing is wrong with the input: run it again.`;
    }
    return `SDK engine error: ${msg}. The run was cancelled — a server restart (a file change under server/ restarts the dev server), a timeout, or the engine saturated by background work. Retry, or pick an API model for this run.`;
  }
  if (m.includes('529') || m.includes('overloaded')) {
    return `SDK engine error: ${msg}. Anthropic is overloaded — transient, retry shortly.`;
  }
  if (m.includes('rate limit') || m.includes('429')) {
    return `SDK engine error: ${msg}. The subscription hit a rate limit — wait a moment or pick an API model.`;
  }
  if (m.includes('enoent') || m.includes('spawn')) {
    return `SDK engine error: ${msg}. The Claude Code runtime could not be started — check it is installed and on PATH.`;
  }
  if (m.includes('login') || m.includes('auth') || m.includes('unauthor') || m.includes('credential')) {
    return `SDK engine error: ${msg}. The Claude Code runtime is not signed in on this machine — run 'claude' once to log in.`;
  }
  return `SDK engine error: ${msg}.`;
}

// ── Prompt flattening ───────────────────────────────────────

/**
 * The SDK takes one prompt string per run (persistSession:false — no session
 * to continue). Multi-turn ANTON sessions are flattened into a transcript:
 * prior turns labelled, final user message last. Content blocks that are not
 * plain strings (tool results from older runs) are JSON-stringified — lossy
 * but honest, and rare on this path.
 */
export function flattenMessages(messages: SdkStreamConfig['messages']): string {
  const text = (content: string | object[]): string =>
    typeof content === 'string' ? content : JSON.stringify(content);
  if (messages.length === 0) return '';
  if (messages.length === 1) return text(messages[0].content);
  const history = messages.slice(0, -1)
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${text(m.content)}`)
    .join('\n\n');
  const last = messages[messages.length - 1];
  return `<conversation_so_far>\n${history}\n</conversation_so_far>\n\n${text(last.content)}`;
}

// ── Streaming ───────────────────────────────────────────────

/** Minimal structural types for the SDK messages this engine consumes —
 *  narrow on discriminants, never trust the rest (strict mode, no `any`). */
interface SdkPartialMessage {
  type: 'stream_event';
  event?: {
    type?: string;
    delta?: { type?: string; text?: string; thinking?: string };
  };
}
interface SdkResultMessage {
  type: 'result';
  subtype: string;
  result?: string;
  total_cost_usd?: number;
  num_turns?: number;
  errors?: string[];
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
  /** Per-model usage keyed by the raw model id the engine ran (SDK `ModelUsage`). */
  modelUsage?: Record<string, { outputTokens?: number; canonicalModel?: string }>;
  /** Present on a successful `outputFormat: { type: 'json_schema' }` run. */
  structured_output?: unknown;
}

/** The model that did the work: the usage-map entry with the most output tokens
 *  (a web run may also touch a helper model; the deliverable comes from the
 *  main one). Undefined when the SDK reports no per-model usage. */
function servedModelFromUsage(usage: SdkResultMessage['modelUsage']): string | undefined {
  if (!usage) return undefined;
  let best: { id: string; out: number } | undefined;
  for (const [id, u] of Object.entries(usage)) {
    const out = u?.outputTokens ?? 0;
    if (!best || out > best.out) best = { id: u?.canonicalModel || id, out };
  }
  return best?.id;
}

// ── Web sources (Wave 2, 2026-09-16) ────────────────────────
// A web-grounded run reads pages through the SDK's WebSearch / WebFetch tools.
// Each call travels as a `tool_use` block on an assistant envelope message and
// its outcome as a `tool_result` block on a user envelope message
// (SDKAssistantMessage / SDKUserMessage in sdk.d.ts); the SDK also attaches
// the tool's structured output to the user envelope as `tool_use_result`
// (WebSearchOutput / WebFetchOutput in sdk-tools.d.ts). The loop used to drop
// both envelopes, so the pages an answer was grounded on were recorded
// nowhere. The tracker pairs every call with its result and reduces the pair
// to a record: query + hits for a search, URL + sha256 + length of the text
// the tool handed the model for a fetch. Page bodies never enter a record.

/** Search hits kept per web_search record. */
export const WEB_SOURCE_RESULT_CAP = 20;

type WebToolName = 'WebSearch' | 'WebFetch';

interface SdkToolUseBlock { type: 'tool_use'; id: string; name: string; input?: unknown }
interface SdkToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content?: string | Array<{ type?: string; text?: string }>;
  is_error?: boolean;
}
/** SDKAssistantMessage: `message` is the API message; its content may hold tool_use blocks. */
interface SdkAssistantEnvelope { type: 'assistant'; message?: { content?: unknown }; timestamp?: string }
/** SDKUserMessage: tool results come back here, with the tool's structured output alongside. */
interface SdkUserEnvelope { type: 'user'; message?: { content?: unknown }; tool_use_result?: unknown; timestamp?: string }

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

/**
 * The reasoning an assistant message carries in its content blocks: every
 * `thinking` block's text, and a marker for a `redacted_thinking` block (the
 * API returns those encrypted — the run did think, the text is not ours to
 * read). Empty when the message has no thinking blocks.
 */
export function thinkingFromContentBlocks(blocks: ReadonlyArray<unknown>): string {
  const parts: string[] = [];
  for (const block of blocks) {
    if (!isRecord(block)) continue;
    if (block.type === 'thinking' && typeof block.thinking === 'string' && block.thinking) parts.push(block.thinking);
    else if (block.type === 'redacted_thinking') parts.push('[redacted thinking block]');
  }
  return parts.join('\n\n');
}
const isToolUseBlock = (v: unknown): v is SdkToolUseBlock =>
  isRecord(v) && v.type === 'tool_use' && typeof v.id === 'string' && typeof v.name === 'string';
const isToolResultBlock = (v: unknown): v is SdkToolResultBlock =>
  isRecord(v) && v.type === 'tool_result' && typeof v.tool_use_id === 'string';
const isWebToolName = (name: string): name is WebToolName => name === 'WebSearch' || name === 'WebFetch';

/** The text a tool_result handed the model: a string, or its text blocks joined. */
function toolResultText(content: SdkToolResultBlock['content']): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map((b) => (isRecord(b) ? str(b.text) : undefined)).filter((t): t is string => t !== undefined).join('\n');
}

const URL_IN_TEXT = /https?:\/\/[^\s<>"')\]]+/g;

/** Hits from the SDK's structured WebSearchOutput; failing that, the URLs in the text the model read. */
function searchHits(structured: Record<string, unknown> | undefined, text: string): Array<{ url: string; title: string }> {
  const hits: Array<{ url: string; title: string }> = [];
  const seen = new Set<string>();
  const add = (url: string, title: string): void => {
    if (hits.length >= WEB_SOURCE_RESULT_CAP || seen.has(url)) return;
    seen.add(url);
    hits.push({ url, title });
  };
  if (structured && Array.isArray(structured.results)) {
    for (const entry of structured.results) {
      if (!isRecord(entry) || !Array.isArray(entry.content)) continue;   // string entries are the tool's commentary
      for (const hit of entry.content) {
        const url = isRecord(hit) ? str(hit.url) : undefined;
        if (url) add(url, (isRecord(hit) && str(hit.title)) || '');
      }
    }
  }
  if (hits.length === 0) {
    for (const url of text.match(URL_IN_TEXT) ?? []) add(url, '');
  }
  return hits;
}

export interface WebSourceTracker {
  /** Feed every SDK message; returns the records this one completed (a user envelope may close several). */
  observe(message: SdkMessage): WebSourceRecord[];
  /** Every record so far, in completion order. */
  readonly records: WebSourceRecord[];
  /** Calls whose result never arrived — an aborted run. */
  pendingCount(): number;
}

export function createWebSourceTracker(): WebSourceTracker {
  const pending = new Map<string, { name: WebToolName; input: Record<string, unknown> }>();
  /** url → title from earlier search hits, so a fetch of a hit carries its title. */
  const titles = new Map<string, string>();
  const records: WebSourceRecord[] = [];

  const observe = (message: SdkMessage): WebSourceRecord[] => {
    if (message.type === 'assistant') {
      const content = (message as SdkAssistantEnvelope).message?.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (isToolUseBlock(block) && isWebToolName(block.name)) {
            pending.set(block.id, { name: block.name, input: isRecord(block.input) ? block.input : {} });
          }
        }
      }
      return [];
    }
    if (message.type !== 'user') return [];
    const envelope = message as SdkUserEnvelope;
    const content = envelope.message?.content;
    if (!Array.isArray(content)) return [];
    const structured = isRecord(envelope.tool_use_result) ? envelope.tool_use_result : undefined;
    const retrievedAt = str(envelope.timestamp) ?? new Date().toISOString();
    const completed: WebSourceRecord[] = [];
    for (const block of content) {
      if (!isToolResultBlock(block)) continue;
      const call = pending.get(block.tool_use_id);
      if (!call) continue;                       // an ANTON MCP tool or anything else: not a web source
      pending.delete(block.tool_use_id);
      const isError = block.is_error === true;
      const text = toolResultText(block.content) || str(structured?.result) || '';
      let record: WebSourceRecord;
      if (call.name === 'WebSearch') {
        const hits = isError ? [] : searchHits(structured, text);
        for (const h of hits) if (h.title) titles.set(h.url, h.title);
        record = {
          kind: 'web_search',
          query: str(structured?.query) ?? str(call.input.query),
          resultUrls: hits.map((h) => h.url),
          results: hits,
          retrievedAt,
        };
      } else {
        const url = str(structured?.url) ?? str(call.input.url);
        const title = url ? titles.get(url) : undefined;
        const code = structured?.code;
        const failed = isError || (typeof code === 'number' && code >= 400);
        record = { kind: 'web_fetch', url, retrievedAt };
        if (title) record.title = title;
        // An error string is not page evidence: no hash for a failed fetch.
        if (!failed && text) {
          record.sha256 = createHash('sha256').update(text, 'utf8').digest('hex');
          record.charCount = text.length;
        }
        if (failed) record.isError = true;
      }
      if (isError) record.isError = true;
      records.push(record);
      completed.push(record);
    }
    return completed;
  };

  return { observe, records, pendingCount: () => pending.size };
}

type SdkMessage = SdkPartialMessage | SdkResultMessage | SdkAssistantEnvelope | SdkUserEnvelope | { type: string };

/** Injectable SDK boundary — tests replace this; production resolves the real
 *  package lazily (the SDK is a ~1.2 MB module; don't pay for it at boot). */
type QueryFn = (params: { prompt: string; options: Record<string, unknown> }) => AsyncIterable<SdkMessage>;
let queryImpl: QueryFn | null = null;
export function setSdkQueryImplForTests(impl: QueryFn | null): void {
  queryImpl = impl;
}
/**
 * The SDK package is imported ONCE, at server boot, and the promise cached.
 * A request-time first-import is forbidden here: under `tsx watch` with an
 * open stdin — i.e. every interactive `pnpm run dev` — the first dynamic
 * import of a not-yet-cached package after boot deadlocks the whole event
 * loop (main thread parked in the module-loader wait; 2026-08-13 diagnosis).
 * Boot-time imports are safe, so the ~0.3s / 1.2 MB cost moves to startup.
 */
let sdkModulePromise: Promise<QueryFn> | null = null;
function startSdkImport(): Promise<QueryFn> {
  sdkModulePromise ??= import('@anthropic-ai/claude-agent-sdk')
    .then((mod) => mod.query as unknown as QueryFn);
  return sdkModulePromise;
}
// Boot-time warmup. On failure, reset so the next run retries and surfaces the error.
startSdkImport().catch(() => { sdkModulePromise = null; });

async function resolveQuery(): Promise<QueryFn> {
  if (queryImpl) return queryImpl;
  return startSdkImport();
}

// ── Agentic runs (Wave 3, 2026-09-08) — shared plumbing ─────
// The agentic runner (sdk-agentic-runner.ts) needs the same SDK module, the
// same slot accounting and the same env/thinking helpers as the text engine,
// but also the SDK's in-process MCP server factory. These accessors keep the
// slot counter and the boot-time import in one place.

/** The SDK surface an agentic run needs. Tests inject a fake. */
export interface AgentSdkModule {
  query: QueryFn;
  createSdkMcpServer: (options: { name: string; version?: string; tools: unknown[] }) => unknown;
  tool: (name: string, description: string, schema: Record<string, unknown>, handler: (args: Record<string, unknown>, extra: unknown) => Promise<unknown>) => unknown;
}
let agentSdkImpl: AgentSdkModule | null = null;
export function setSdkAgentImplForTests(impl: AgentSdkModule | null): void {
  agentSdkImpl = impl;
}
let agentSdkModulePromise: Promise<AgentSdkModule> | null = null;
export async function resolveAgentSdk(): Promise<AgentSdkModule> {
  if (agentSdkImpl) return agentSdkImpl;
  agentSdkModulePromise ??= import('@anthropic-ai/claude-agent-sdk')
    .then((mod) => ({
      query: mod.query as unknown as QueryFn,
      createSdkMcpServer: mod.createSdkMcpServer as unknown as AgentSdkModule['createSdkMcpServer'],
      tool: mod.tool as unknown as AgentSdkModule['tool'],
    }))
    .catch((err) => { agentSdkModulePromise = null; throw err; });
  return agentSdkModulePromise;
}

/**
 * Take a subscription slot for a run, or explain why not. Returns null when
 * the slot is taken (release with releaseSdkSlot); the same caps and wording
 * as streamToResponse so every engine path tells the same story.
 */
export function tryAcquireSdkSlot(background: boolean): string | null {
  if (!isSdkEngineEnabled()) return 'The SDK execution engine is disabled. Enable it in Settings → Execution engines.';
  // Wave 5: the day's allowance is checked before the slot — a caller should
  // have awaited ensureSdkDailyCounterSeeded() so the count includes runs
  // from before a restart.
  const capRefusal = sdkDailyCapRefusal();
  if (capRefusal) return capRefusal;
  const slotCap = background ? MAX_BACKGROUND_SDK_RUNS : MAX_CONCURRENT_SDK_RUNS;
  if (activeRuns >= slotCap) {
    return background
      ? `SDK engine busy — background work is capped at ${MAX_BACKGROUND_SDK_RUNS} of ${MAX_CONCURRENT_SDK_RUNS} concurrent runs so interactive requests always keep a slot. It will retry on the next pass.`
      : `SDK engine busy — at most ${MAX_CONCURRENT_SDK_RUNS} concurrent subscription runs. Try again shortly or pick an API model.`;
  }
  activeRuns++;
  noteSdkRunStarted();
  return null;
}
export function releaseSdkSlot(): void {
  if (activeRuns > 0) activeRuns--;
}
/**
 * Run `fn` with the caller's slot released for its duration. An agentic run's
 * subprocess is idle while one of its tools executes, so a tool that itself
 * needs the engine (consult an expert module) may take the slot the parent
 * was holding. Live finding 2026-09-08: without this, every nested consult
 * was refused "SDK engine busy" the moment one background job was running.
 * The slot is re-taken unconditionally afterwards — a brief overshoot of the
 * cap is preferable to a parent that cannot resume.
 */
export async function yieldSdkSlotDuring<T>(fn: () => Promise<T>): Promise<T> {
  releaseSdkSlot();
  try {
    return await fn();
  } finally {
    activeRuns++;
  }
}
/** Exposed for tests: the live slot count. */
export function activeSdkRunsForTests(): number {
  return activeRuns;
}

export async function streamToResponse(
  config: SdkStreamConfig,
  res: StreamSink,
  onComplete?: (data: SdkCompletionData) => void | Promise<void>,
  opts?: {
    /** The Settings "Test" button probes the engine BEFORE the user enables
     *  it — that one caller may bypass the enabled gate. Route callers never set this. */
    bypassEnabledCheck?: boolean;
    /** Scheduled/batch work. Yields the last slot so an interactive run always
     *  has somewhere to go. Defaults to interactive: a caller must opt IN to
     *  being deprioritised, so a new code path cannot accidentally starve a user. */
    background?: boolean;
  },
): Promise<void> {
  if (!res.headersSent) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
  }

  const sendEvent = (event: object) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  if (!opts?.bypassEnabledCheck && !isSdkEngineEnabled()) {
    sendEvent({ type: 'error', message: 'The SDK execution engine is disabled. Enable it in Settings → Execution engines.' });
    res.write('data: [DONE]\n\n');
    res.end();
    return;
  }
  // Wave 5: the per-day cap, on the same error path as the slot refusal.
  await ensureSdkDailyCounterSeeded();
  const capRefusal = sdkDailyCapRefusal();
  if (capRefusal) {
    sendEvent({ type: 'error', message: capRefusal });
    res.write('data: [DONE]\n\n');
    res.end();
    return;
  }
  const slotCap = opts?.background ? MAX_BACKGROUND_SDK_RUNS : MAX_CONCURRENT_SDK_RUNS;
  if (activeRuns >= slotCap) {
    sendEvent({
      type: 'error',
      message: opts?.background
        ? `SDK engine busy — background work is capped at ${MAX_BACKGROUND_SDK_RUNS} of ${MAX_CONCURRENT_SDK_RUNS} concurrent runs so interactive requests always keep a slot. It will retry on the next pass.`
        : `SDK engine busy — at most ${MAX_CONCURRENT_SDK_RUNS} concurrent subscription runs. Try again shortly or pick an API model.`,
    });
    res.write('data: [DONE]\n\n');
    res.end();
    return;
  }

  const underlying = sdkUnderlyingModel(config.model);
  const webTools = sdkWebToolsRequested(config.tools);
  const systemPrompt = adaptWebSearchInstruction(
    config.staticSystemPrompt && config.staticSystemPrompt.trim()
      ? `${config.staticSystemPrompt}\n\n${config.system}`
      : config.system,
    webTools,
  );

  const abortController = new AbortController();
  if (config.signal) {
    if (config.signal.aborted) abortController.abort();
    else config.signal.addEventListener('abort', () => abortController.abort(), { once: true });
  }

  activeRuns++;
  noteSdkRunStarted();
  // The slot is the SUBPROCESS's, not the request's. It is released the moment
  // the stream has ended — BEFORE onComplete runs — and exactly once. Live
  // finding 2026-09-16: onComplete used to run inside the slot, and the
  // learning pipeline it kicks off (summary → atoms, background:true) asked
  // for a background slot while the interactive slot it was spawned from was
  // still counted. With MAX_BACKGROUND_SDK_RUNS = 1 that request was refused
  // "SDK engine busy" on every single run, so nothing was ever learned.
  let slotReleased = false;
  const releaseSlot = (): void => {
    if (slotReleased) return;
    slotReleased = true;
    activeRuns--;
  };
  const contentBlocks: ContentBlock[] = [];
  const rawContentBlocks: unknown[] = [];
  let currentText = '';
  let currentThinking = '';
  let thinkingStreamed = false;
  let usageData = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 };
  let modelServed: string | undefined;
  let engineCostUsd: number | undefined;
  let structuredOutput: unknown;
  const webSources = createWebSourceTracker();

  try {
    console.log(`[sdk-engine] run → model=${underlying} thinking=${config.thinking}${webTools ? ' tools=web' : ''}`);
    const query = await resolveQuery();
    sendEvent({ type: 'stream_start', messageId: randomUUID() });

    const session = query({
      prompt: flattenMessages(config.messages),
      options: {
        model: underlying,
        systemPrompt,
        // Text engine by default: no built-in tools, one turn. A run whose
        // knowledge mode asked for web search gets exactly the two network
        // tools and enough turns to use them; every other built-in stays
        // denied — 'dontAsk' refuses anything not in allowedTools.
        tools: webTools ? [...SDK_WEB_TOOLS] : [],
        ...(webTools ? { allowedTools: [...SDK_WEB_TOOLS] } : {}),
        maxTurns: webTools ? SDK_WEB_MAX_TURNS : 1,
        permissionMode: 'dontAsk',
        settingSources: [],      // never inherit the user's personal Claude Code config
        persistSession: false,
        includePartialMessages: true,
        env: buildSdkEnv(),      // process.env minus ANTHROPIC_API_KEY → subscription auth
        cwd: os.tmpdir(),        // neutral cwd; nothing reads it (no tools) but never the repo
        abortController,
        ...sdkThinkingOptions(config.thinking, underlying),
        // Schema-constrained turn (Wave 3): the SDK enforces the schema and
        // retries on its side; nothing else in the containment set changes.
        ...(config.outputFormat ? { outputFormat: config.outputFormat } : {}),
      },
    });

    for await (const message of session) {
      if (message.type === 'stream_event') {
        const delta = (message as SdkPartialMessage).event?.delta;
        if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
          currentText += delta.text;
          sendEvent({ type: 'text_delta', content: delta.text });
        } else if (delta?.type === 'thinking_delta' && typeof delta.thinking === 'string') {
          currentThinking += delta.thinking;
          thinkingStreamed = true;
          sendEvent({ type: 'thinking_delta', content: delta.thinking });
        }
      } else if (message.type === 'result') {
        const result = message as SdkResultMessage;
        // A web run that used up its turns with an answer already streamed is
        // a complete answer with a warning, not a failure.
        const cappedWithAnswer = result.subtype === 'error_max_turns' && currentText.length > 0;
        if (cappedWithAnswer) {
          console.warn(`[sdk-engine] run hit the ${SDK_WEB_MAX_TURNS}-turn web cap after streaming text — keeping the answer`);
        }
        if (result.subtype === 'success' || cappedWithAnswer) {
          // Native builds may not emit partials — fall back to the final text.
          if (!currentText && typeof result.result === 'string' && result.result.length > 0) {
            currentText = result.result;
            sendEvent({ type: 'text_delta', content: result.result });
          }
          usageData = {
            inputTokens: result.usage?.input_tokens ?? 0,
            outputTokens: result.usage?.output_tokens ?? 0,
            cacheReadTokens: result.usage?.cache_read_input_tokens ?? 0,
            cacheCreationTokens: result.usage?.cache_creation_input_tokens ?? 0,
          };
          modelServed = servedModelFromUsage(result.modelUsage);
          engineCostUsd = typeof result.total_cost_usd === 'number' ? result.total_cost_usd : undefined;
          if (config.outputFormat && result.structured_output !== undefined) {
            structuredOutput = result.structured_output;
          }
          sendEvent({ type: 'usage', ...usageData, thinkingTokens: 0, ...(modelServed ? { modelServed } : {}) });
        } else {
          const detail = result.errors?.length ? ` — ${result.errors.join('; ')}` : '';
          console.warn(`[sdk-engine] run failed (${result.subtype})${detail}`);
          sendEvent({
            type: 'error',
            message: `SDK engine run failed (${result.subtype})${detail}. If this mentions authentication, run \`claude\` once on this machine and log in.`,
          });
        }
      } else if (message.type === 'assistant' || message.type === 'user') {
        if (message.type === 'assistant') {
          // Wave 5: the assistant envelope is the complete API message. Its
          // blocks go to the ledger as-is (thinking, text, tool_use — what the
          // API path stores), and when the partial stream carried no
          // thinking_delta (live: 3 of 3 stored SDK runs had empty thinking)
          // the thinking blocks are the only copy of the reasoning.
          const blocks = (message as SdkAssistantEnvelope).message?.content;
          if (Array.isArray(blocks)) {
            rawContentBlocks.push(...blocks);
            if (!thinkingStreamed) {
              const captured = thinkingFromContentBlocks(blocks);
              if (captured) {
                currentThinking += (currentThinking ? '\n\n' : '') + captured;
                sendEvent({ type: 'thinking_delta', content: captured });
              }
            }
          }
        }
        // Wave 2: the envelopes carry the WebSearch / WebFetch calls and their
        // results — the only record of what a web-grounded run actually read.
        for (const source of webSources.observe(message)) {
          sendEvent({ type: 'source_fetched', source });
        }
      }
      // system envelope messages carry nothing this engine needs.
    }

    if (currentText) {
      // input_tokens alone is misleading here: most of the prompt lands in the
      // cache fields (a 27k-char run logged "2 in" without them).
      const cached = usageData.cacheReadTokens + usageData.cacheCreationTokens;
      console.log(`[sdk-engine] run complete — ${usageData.inputTokens + cached} in (${cached} cached) / ${usageData.outputTokens} out tokens`);
    }
    if (webSources.records.length > 0 || webSources.pendingCount() > 0) {
      const searches = webSources.records.filter((r) => r.kind === 'web_search').length;
      console.log(`[sdk-engine] web sources recorded: ${searches} search(es), ${webSources.records.length - searches} fetch(es)${webSources.pendingCount() > 0 ? `, ${webSources.pendingCount()} call(s) never returned` : ''}`);
    }
    if (currentThinking) contentBlocks.push({ type: 'thinking', content: currentThinking });
    if (currentText) contentBlocks.push({ type: 'text', content: currentText });
    sendEvent({ type: 'stream_end', contentBlocks, sourceManifest: config.sourceManifest });
    res.write('data: [DONE]\n\n');
    res.end();

    // The subprocess has exited: give the slot back before the caller's
    // completion work runs, so background learning spawned from here can
    // take a slot of its own.
    releaseSlot();

    // A schema-constrained turn ends on the structured_output attachment with
    // no trailing assistant text — the object IS the completion.
    if (onComplete && (currentText || structuredOutput !== undefined)) {
      await onComplete({
        text: currentText,
        thinking: currentThinking,
        ...usageData,
        modelServed,
        engineCostUsd,
        systemPromptSent: systemPrompt,
        webSources: webSources.records,
        ...(structuredOutput !== undefined ? { structuredOutput } : {}),
        ...(rawContentBlocks.length > 0 ? { rawContentBlocks } : {}),
      });
    }
  } catch (err) {
    // Mirror claude-client's contract: failures surface as an SSE error event,
    // never a thrown exception after headers are out.
    const msg = err instanceof Error ? err.message : 'SDK engine failed to start';
    console.error(`[sdk-engine] error: ${msg}`);
    sendEvent({ type: 'error', message: explainSdkFailure(msg) });
    res.write('data: [DONE]\n\n');
    res.end();
  } finally {
    // No-op when the success path already released; the release for every
    // failure path (SDK threw, onComplete threw).
    releaseSlot();
  }
}

// ── Non-streaming + health check ────────────────────────────

/** In-memory StreamSink for callers that want a single aggregated answer. */
class CollectingSink implements StreamSink {
  readonly headersSent = false;
  writeHead(): void { /* no HTTP channel */ }
  write(_chunk: string): void { /* events not needed; onComplete carries the result */ }
  end(): void { /* no-op */ }
}

/** One-shot completion through the SDK engine (unified-llm-client sendRequest path). */
export async function completeText(
  config: SdkStreamConfig,
  opts?: { bypassEnabledCheck?: boolean; background?: boolean },
): Promise<SdkCompletionData> {
  let completion: SdkCompletionData | null = null;
  let errorMessage: string | null = null;
  const sink = new CollectingSink();
  const captureErrors: StreamSink = {
    get headersSent() { return sink.headersSent; },
    writeHead: () => undefined,
    write: (chunk: string) => {
      for (const line of chunk.split('\n')) {
        if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;
        try {
          const event = JSON.parse(line.slice(6)) as { type?: string; message?: string };
          if (event.type === 'error' && event.message) errorMessage = event.message;
        } catch { /* non-JSON line — ignore */ }
      }
    },
    end: () => undefined,
  };
  await streamToResponse(config, captureErrors, (data) => { completion = data; }, opts);
  if (completion) return completion;
  throw new Error(errorMessage ?? 'SDK engine returned no completion');
}

/**
 * Settings "Test" button: a one-word ping through the real engine. Returns an
 * honest status instead of throwing — the caller renders message verbatim.
 */
export async function testSdkEngine(): Promise<{ ok: boolean; message: string }> {
  try {
    const data = await completeText({
      model: 'sdk:claude-sonnet-5',
      thinking: 'quick',
      system: 'You are a connectivity check. Reply with the single word: ready',
      messages: [{ role: 'user', content: 'Reply with the single word: ready' }],
    }, { bypassEnabledCheck: true });
    return {
      ok: true,
      message: `SDK engine works — model replied ("${data.text.slice(0, 40).trim()}"), ${data.inputTokens} in / ${data.outputTokens} out tokens via this machine's Claude Code login.`,
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'SDK engine test failed' };
  }
}
