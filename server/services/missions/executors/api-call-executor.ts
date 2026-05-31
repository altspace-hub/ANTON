// ── api-call-executor.ts ────────────────────────────────────────────────────
// Mission task type: 'api_call'. Makes a real HTTP request, captures the
// response into the task output. Closes the #1 gap from the April audit
// (Action Layer was previously LLM fallback; LinkedIn-scrape mission would
// hallucinate data instead of calling the API).
//
// Security model:
//   • Credential resolution lives entirely server-side via the credential
//     vault. The decrypted secret never reaches an LLM prompt or the task
//     output (only the response body does, which the user authored).
//   • URL is validated against an allow-list pattern OR explicit scheme
//     check (https only by default; http allowed when localhost or
//     credential-vault flag set).
//   • Response body capped at 256KB to prevent token-budget runaway when
//     the response is later summarised.
//   • Per-call timeout (default 30s, configurable up to 120s).
//   • Header injection protected: header names + values stripped of CR/LF.

import type { DatabaseAdapter } from '../../../db/database.js';
import type { Mission, MissionTask } from '../types.js';
import { childLogger } from '../../../lib/logger.js';
import { createCredentialVault } from '../mission-credential-vault.js';
import { assertSafeEgressUrl } from '../../../lib/ssrf-guard.js';

const log = childLogger('mission-api-call');

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 120_000;
const MAX_BODY_BYTES = 256 * 1024;

export interface ApiCallConfig {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD';
  headers?: Record<string, string>;
  body?: unknown;
  /** Credential id from missions.credential_vault. Resolved server-side. */
  auth_credential_id?: string;
  /** How to apply the credential. Default 'bearer' for api_key creds. */
  auth_scheme?: 'bearer' | 'header' | 'basic' | 'query';
  /** Header name when auth_scheme = 'header'. Default 'X-API-Key'. */
  auth_header_name?: string;
  /** Query param name when auth_scheme = 'query'. */
  auth_query_param?: string;
  timeout_ms?: number;
  /** When true, allow non-https URLs (for localhost dev fixtures). */
  allow_insecure?: boolean;
  /** Stop accepting bytes after this many. Default 256KB. */
  max_response_bytes?: number;
  /** Capture only specific JSON paths in the output (jq-lite dotpath). */
  capture_paths?: string[];
}

export interface ApiCallResult {
  success: boolean;
  outputFull: string;
  outputSummary: string;
  durationMs: number;
  /** HTTP status code; -1 on transport error. */
  statusCode: number;
  /** Empty when no error; otherwise short reason. */
  errorReason?: string;
}

export async function executeApiCall(
  db: DatabaseAdapter,
  mission: Mission,
  task: MissionTask,
): Promise<ApiCallResult> {
  const startedAt = Date.now();
  const config = task.module_config as unknown as ApiCallConfig | undefined;
  if (!config?.url) {
    return failure(startedAt, 'api_call task has no module_config.url');
  }

  // ── URL validation ───────────────────────────────────────────────────────
  let url: URL;
  try { url = new URL(config.url); }
  catch { return failure(startedAt, `Invalid URL: ${config.url}`); }

  // SSRF guard: block loopback/private/link-local/CGNAT + 169.254.169.254 cloud
  // metadata so a mission api_call can't be pointed at the internal network or
  // a metadata endpoint. Operators who need a localhost/private target set
  // ALLOWED_AGENT_HOSTS (shared allowlist with the agent connector executor).
  try {
    await assertSafeEgressUrl(config.url);
  } catch (err) {
    return failure(startedAt, `Blocked by SSRF guard: ${err instanceof Error ? err.message : String(err)}`);
  }

  const allowInsecure = config.allow_insecure === true;
  if (url.protocol !== 'https:' && !allowInsecure) {
    if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
      return failure(startedAt, `Refusing non-https URL ${url.toString()} (set allow_insecure=true to override)`);
    }
  }

  const method = (config.method ?? 'GET').toUpperCase() as NonNullable<ApiCallConfig['method']>;
  const timeoutMs = Math.min(config.timeout_ms ?? DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS);
  const maxBytes = config.max_response_bytes ?? MAX_BODY_BYTES;

  // ── Headers (sanitise CR/LF to prevent injection) ───────────────────────
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(config.headers ?? {})) {
    headers[sanitiseHeaderName(k)] = sanitiseHeaderValue(String(v));
  }

  // ── Credential resolution ───────────────────────────────────────────────
  if (config.auth_credential_id) {
    const vault = createCredentialVault(db);
    const meta = await vault.getCredentialMeta(config.auth_credential_id);
    if (!meta || !meta.is_active) {
      return failure(startedAt, `Credential ${config.auth_credential_id} not found or inactive`);
    }
    const allowedService = (() => {
      try { return new URL(config.url).hostname; } catch { return null; }
    })();
    if (!vault.isAllowed(meta, mission.template_id ?? null, allowedService)) {
      return failure(startedAt, `Credential not authorised for mission template ${mission.template_id} or service ${allowedService}`);
    }
    const secret = await vault.resolveSecret(config.auth_credential_id, mission.id, task.id);
    if (!secret) {
      return failure(startedAt, `Credential ${config.auth_credential_id} could not be resolved`);
    }
    applyAuth(secret, config, headers, url);
  }

  // ── Body ────────────────────────────────────────────────────────────────
  let body: BodyInit | undefined;
  if (config.body !== undefined && method !== 'GET' && method !== 'HEAD') {
    if (typeof config.body === 'string') {
      body = config.body;
    } else {
      body = JSON.stringify(config.body);
      if (!headers['Content-Type'] && !headers['content-type']) {
        headers['Content-Type'] = 'application/json';
      }
    }
  }

  // ── Make the request with timeout ───────────────────────────────────────
  // Note: redactedUrl is used for logs + task output so credentials applied
  // via auth_scheme='query' never leak into stored mission history.
  const redactedUrl = redactAuthQueryParam(url, config);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(url.toString(), { method, headers, body, signal: ctrl.signal });
  } catch (err) {
    clearTimeout(timer);
    const msg = err instanceof Error ? err.message : String(err);
    log.warn({ missionId: mission.id, taskId: task.id, url: redactedUrl, err: msg }, 'api_call_transport_error');
    return failure(startedAt, `Transport error: ${msg}`);
  }
  clearTimeout(timer);

  // ── Read response with byte cap ─────────────────────────────────────────
  const reader = res.body?.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  if (reader) {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) {
        chunks.push(value.slice(0, value.byteLength - (received - maxBytes)));
        break;
      }
      chunks.push(value);
    }
  }
  const totalBytes = chunks.reduce((s, c) => s + c.byteLength, 0);
  const responseText = new TextDecoder().decode(concat(chunks, totalBytes));

  // ── Parse + capture-paths filter ────────────────────────────────────────
  let captured: unknown = responseText;
  if (config.capture_paths && config.capture_paths.length > 0) {
    try {
      const parsed = JSON.parse(responseText);
      const out: Record<string, unknown> = {};
      for (const p of config.capture_paths) out[p] = pickDotPath(parsed, p);
      captured = out;
    } catch { /* fall through to raw */ }
  }

  const outputFull = JSON.stringify({
    url: redactedUrl,
    method,
    status: res.status,
    response_headers: Object.fromEntries(res.headers.entries()),
    response: captured,
    bytes_received: totalBytes,
    truncated: received > maxBytes,
  }, null, 2);
  const summary = `${method} ${redactedUrl} → ${res.status} (${totalBytes} bytes)`;

  log.info({
    missionId: mission.id, taskId: task.id, url: redactedUrl,
    method, status: res.status, bytes: totalBytes, durationMs: Date.now() - startedAt,
  }, 'api_call_ok');

  return {
    success: res.status >= 200 && res.status < 400,
    outputFull, outputSummary: summary,
    durationMs: Date.now() - startedAt,
    statusCode: res.status,
    errorReason: res.status >= 400 ? `HTTP ${res.status}` : undefined,
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function failure(startedAt: number, reason: string): ApiCallResult {
  return {
    success: false,
    outputFull: JSON.stringify({ error: reason }, null, 2),
    outputSummary: `api_call failed: ${reason}`,
    durationMs: Date.now() - startedAt,
    statusCode: -1,
    errorReason: reason,
  };
}

function applyAuth(secret: string, config: ApiCallConfig, headers: Record<string, string>, url: URL): void {
  const scheme = config.auth_scheme ?? 'bearer';
  if (scheme === 'bearer') {
    headers['Authorization'] = `Bearer ${secret}`;
  } else if (scheme === 'basic') {
    headers['Authorization'] = `Basic ${Buffer.from(secret).toString('base64')}`;
  } else if (scheme === 'header') {
    const name = sanitiseHeaderName(config.auth_header_name ?? 'X-API-Key');
    headers[name] = sanitiseHeaderValue(secret);
  } else if (scheme === 'query') {
    const param = config.auth_query_param ?? 'api_key';
    url.searchParams.set(param, secret);
  }
}

// CR/LF in header names + values can cause request smuggling; strip them.
function sanitiseHeaderName(s: string): string {
  return s.replace(/[\r\n:]+/g, '');
}
function sanitiseHeaderValue(s: string): string {
  return s.replace(/[\r\n]+/g, ' ');
}

// When the credential was applied via ?api_key=..., return a URL string with
// that param replaced by "[redacted]" for logging + task output. Other schemes
// (bearer, basic, header) never touch the URL so this is a no-op for them.
function redactAuthQueryParam(url: URL, config: ApiCallConfig): string {
  if (!config.auth_credential_id || config.auth_scheme !== 'query') return url.toString();
  const param = config.auth_query_param ?? 'api_key';
  const copy = new URL(url.toString());
  if (copy.searchParams.has(param)) copy.searchParams.set(param, '[redacted]');
  return copy.toString();
}

function concat(chunks: Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.byteLength; }
  return out;
}

function pickDotPath(value: unknown, path: string): unknown {
  const parts = path.split('.');
  let cur: unknown = value;
  for (const p of parts) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}
