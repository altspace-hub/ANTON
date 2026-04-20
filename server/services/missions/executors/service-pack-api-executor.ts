// ── service-pack-api-executor.ts ────────────────────────────────────────────
// Runs workflows from Service Packs whose `interaction_type === 'api'`.
// Called by browser-executor after it loads a pack and sees it's API-type
// rather than browser-type — keeps the user-visible task_type='browser' the
// same for both kinds (the LLM planner picks the pack, the executor routes).
//
// Closes the follow-up flagged alongside audit item #1: the Gmail / HubSpot /
// Notion Wave-1 packs were reference-only because no runner existed for
// api-type workflows. This file makes the simple cases executable.
//
// Design:
//   • Each step with `action: 'http'` gets a real HTTP request.
//     - url has already been param-substituted by resolveWorkflow.
//     - method comes from step.method (default 'GET').
//     - body comes from step.body_template (recursively param-substituted
//       JSON). If only step.template (doc string) exists, the step is
//       reference-only and the runner returns a clean error telling the
//       user to add body_template or write an api_call task.
//   • Credential resolved server-side via the mission vault, applied as
//     Authorization: Bearer (bearer_token / api_key / oauth2). cookie_jar
//     credentials aren't meaningful for pure-API packs.
//   • pack.service_info.required_headers injected on every step (e.g.
//     Notion-Version: 2022-06-28).
//   • Per-step timeout 30s. Overall task timeout 60s default / 300s max.
//   • Response body capped at 256KB per step.
//   • Output is the concatenated step log + each step's response.
//
// Security model matches api-call-executor: URLs are restricted to
// pack.service_info.base_urls (same exact-host-or-subdomain anchor as the
// browser executor), CR/LF stripped from header values, credential never
// reaches LLM prompts or the task output.

import type { DatabaseAdapter } from '../../../db/database.js';
import type { Mission, MissionTask } from '../types.js';
import { childLogger } from '../../../lib/logger.js';
import type { ServicePack, ServicePackWorkflowStep } from '../service-pack-manager.js';

const log = childLogger('mission-service-pack-api');

const DEFAULT_STEP_TIMEOUT_MS = 30_000;
const DEFAULT_TOTAL_TIMEOUT_MS = 60_000;
const MAX_TOTAL_TIMEOUT_MS = 300_000;
const MAX_BODY_BYTES = 256 * 1024;

export interface ApiWorkflowResult {
  success: boolean;
  outputFull: string;
  outputSummary: string;
  durationMs: number;
  errorReason?: string;
}

interface ApiStepLogEntry {
  step: number;
  method: string;
  url: string;
  status: number;
  description?: string;
  response?: unknown;
  bytes?: number;
  error?: string;
}

export interface ExecuteApiWorkflowArgs {
  db: DatabaseAdapter;
  mission: Mission;
  task: MissionTask;
  pack: ServicePack;
  resolvedSteps: ServicePackWorkflowStep[];
  credentialSecret: string | null;
  credentialType: string | null;
  totalTimeoutMs: number;
}

export async function executeApiWorkflow(args: ExecuteApiWorkflowArgs): Promise<ApiWorkflowResult> {
  const { mission, task, pack, resolvedSteps, credentialSecret, credentialType } = args;
  const startedAt = Date.now();
  const totalTimeoutMs = Math.min(args.totalTimeoutMs, MAX_TOTAL_TIMEOUT_MS);
  const baseUrls = pack.service_info.base_urls ?? [];
  if (baseUrls.length === 0) {
    return failure(startedAt, `Service pack '${pack.service_id}' declares no base_urls — refusing to make requests`);
  }

  // Shared request headers from the pack (e.g. Notion-Version). Sanitise to
  // prevent header-injection via pack content.
  const sharedHeaders: Record<string, string> = {};
  const required = (pack.service_info as { required_headers?: Record<string, string> }).required_headers ?? {};
  for (const [k, v] of Object.entries(required)) {
    // Skip auth template placeholders — we apply the real credential below.
    if (k.toLowerCase() === 'authorization') continue;
    sharedHeaders[sanitiseHeaderName(k)] = sanitiseHeaderValue(String(v));
  }
  if (credentialSecret && credentialType) {
    if (credentialType === 'bearer_token' || credentialType === 'api_key' || credentialType === 'oauth2') {
      sharedHeaders['Authorization'] = `Bearer ${credentialSecret}`;
    }
  }

  const deadline = startedAt + totalTimeoutMs;
  const stepLog: ApiStepLogEntry[] = [];

  for (let i = 0; i < resolvedSteps.length; i++) {
    const step = resolvedSteps[i]!;
    if (step.action !== 'http') {
      // Mixed-type pack (hybrid): skip non-http steps here — browser-executor
      // will handle those. In practice pure api packs shouldn't hit this path.
      continue;
    }
    if (!step.url) {
      return stepFailure(startedAt, stepLog, i + 1, 'http step missing url');
    }
    if (!isUrlAllowed(step.url, baseUrls)) {
      return stepFailure(startedAt, stepLog, i + 1, `URL ${step.url} is outside pack base_urls`);
    }

    // Body source: prefer body_template (executable). Fall back to refusing
    // to execute string templates since they may contain pseudo-functions.
    const method = (step.method ?? 'GET').toUpperCase();
    let bodyInit: BodyInit | undefined;
    const headers: Record<string, string> = { ...sharedHeaders };
    if (method !== 'GET' && method !== 'HEAD') {
      if (step.body_template !== undefined) {
        bodyInit = JSON.stringify(step.body_template);
        headers['Content-Type'] = headers['Content-Type'] ?? 'application/json';
      } else if (step.template !== undefined) {
        return stepFailure(
          startedAt, stepLog, i + 1,
          `Step has only a documentation 'template' — not executable. Add 'body_template' (JSON object) to the pack step, or use an api_call task directly.`,
        );
      }
    }

    const remaining = Math.max(1_000, deadline - Date.now());
    const stepTimeout = Math.min(DEFAULT_STEP_TIMEOUT_MS, remaining);
    const entry: ApiStepLogEntry = { step: i + 1, method, url: step.url, status: 0, description: step.description };
    try {
      const res = await fetchWithTimeout(step.url, { method, headers, body: bodyInit }, stepTimeout);
      const { text, bytes, truncated } = await readCapped(res, MAX_BODY_BYTES);
      let parsed: unknown = text;
      try { parsed = JSON.parse(text); } catch { /* keep raw */ }
      entry.status = res.status;
      entry.bytes = bytes;
      entry.response = truncated ? { _truncated: true, _bytes: bytes, partial: parsed } : parsed;
      stepLog.push(entry);
      if (res.status >= 400) {
        return stepFailure(startedAt, stepLog, i + 1, `HTTP ${res.status}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      entry.error = msg;
      stepLog.push(entry);
      return stepFailure(startedAt, stepLog, i + 1, `Transport error: ${msg}`);
    }

    if (Date.now() > deadline) {
      return stepFailure(startedAt, stepLog, i + 1, `Workflow exceeded ${totalTimeoutMs}ms overall budget`);
    }
  }

  const outputFull = JSON.stringify({
    service_id: pack.service_id,
    interaction_type: pack.interaction_type,
    steps: stepLog,
  }, null, 2);
  const summary = `api_workflow ok — ${pack.service_id} (${stepLog.length} step${stepLog.length === 1 ? '' : 's'})`;
  log.info({
    missionId: mission.id, taskId: task.id, serviceId: pack.service_id,
    steps: stepLog.length, durationMs: Date.now() - startedAt,
  }, 'api_workflow_ok');

  return {
    success: true,
    outputFull, outputSummary: summary,
    durationMs: Date.now() - startedAt,
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function readCapped(res: Response, maxBytes: number): Promise<{ text: string; bytes: number; truncated: boolean }> {
  const reader = res.body?.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  let truncated = false;
  if (reader) {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) {
        chunks.push(value.slice(0, value.byteLength - (received - maxBytes)));
        truncated = true;
        break;
      }
      chunks.push(value);
    }
  }
  const total = chunks.reduce((s, c) => s + c.byteLength, 0);
  const merged = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { merged.set(c, off); off += c.byteLength; }
  return { text: new TextDecoder().decode(merged), bytes: total, truncated };
}

function isUrlAllowed(urlStr: string, baseUrls: string[]): boolean {
  let url: URL;
  try { url = new URL(urlStr); } catch { return false; }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
  for (const base of baseUrls) {
    try {
      const b = new URL(base);
      if (url.hostname === b.hostname || url.hostname.endsWith(`.${b.hostname}`)) return true;
    } catch { /* skip invalid base */ }
  }
  return false;
}

function sanitiseHeaderName(s: string): string { return s.replace(/[\r\n:]+/g, ''); }
function sanitiseHeaderValue(s: string): string { return s.replace(/[\r\n]+/g, ' '); }

function failure(startedAt: number, reason: string): ApiWorkflowResult {
  return {
    success: false,
    outputFull: JSON.stringify({ error: reason }, null, 2),
    outputSummary: `api_workflow failed: ${reason}`,
    durationMs: Date.now() - startedAt,
    errorReason: reason,
  };
}

function stepFailure(startedAt: number, stepLog: ApiStepLogEntry[], stepNum: number, reason: string): ApiWorkflowResult {
  return {
    success: false,
    outputFull: JSON.stringify({ steps: stepLog, failed_at_step: stepNum, error: reason }, null, 2),
    outputSummary: `api_workflow failed at step ${stepNum}: ${reason}`,
    durationMs: Date.now() - startedAt,
    errorReason: reason,
  };
}
