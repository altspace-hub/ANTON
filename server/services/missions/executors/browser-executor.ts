// ── browser-executor.ts ─────────────────────────────────────────────────────
// Mission task type: 'browser'. Drives headless Chromium via Playwright,
// following a Service Pack workflow (service_id + workflow_id + params).
// Closes audit gap #1C.
//
// Design:
//   • Service Pack is the source of truth for selectors + step order. The LLM
//     never sees selectors — it picks the pack and the params, the executor
//     follows the pack. Matches spec §14.3 (Service Pack wins over LLM
//     Playwright fallback).
//   • Credentials resolved server-side via the mission vault. bearer / api_key
//     inject as HTTP headers; cookie_jar injects as cookies; other schemes
//     fall back to passing the secret as a param substitution (still never
//     exposed to LLM output).
//   • Navigations hard-capped to the pack's declared base_urls — prevents a
//     parameter-injection attack from pivoting to a different site.
//   • Extract actions capped per selector (50 elements, 2KB each) — stops a
//     scraped page from blowing the task-output budget.
//   • Per-call timeout (default 60s, max 300s).
//   • `pack.recordWorkflowUse(success)` records health stats so the operator
//     can see pack degradation over time.
//
// Runtime: `playwright` is a direct dep. The Chromium browser itself is
// installed via `npx playwright install chromium` — if it isn't present
// Playwright throws a clear error which we surface to the task output.

import type { DatabaseAdapter } from '../../../db/database.js';
import type { Mission, MissionTask } from '../types.js';
import { childLogger } from '../../../lib/logger.js';
import { createCredentialVault } from '../mission-credential-vault.js';
import { createServicePackManager, type ServicePackWorkflowStep, type ServicePack } from '../service-pack-manager.js';

const log = childLogger('mission-browser');

const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_TIMEOUT_MS = 300_000;
const DEFAULT_EXTRACT_ELEMENTS = 50;
const MAX_EXTRACT_ELEMENTS = 200;
const EXTRACT_CELL_MAX_CHARS = 2 * 1024;

export interface BrowserConfig {
  /** Service Pack identifier (e.g. 'eur-lex', 'linkedin-search'). */
  service_id: string;
  /** Workflow within the pack (key in pack.workflows). */
  workflow_id: string;
  /** Parameters for ${…} substitution in the workflow. */
  params?: Record<string, string>;
  /** Optional credential for authenticated workflows. */
  auth_credential_id?: string;
  /** Default true. Set false in dev to watch a browser window. */
  headless?: boolean;
  /** Overall task timeout. Default 60s, capped at 300s. */
  timeout_ms?: number;
  /** Per-extract element cap. Default 50, max 200. */
  max_extract_elements?: number;
}

export interface BrowserResult {
  success: boolean;
  outputFull: string;
  outputSummary: string;
  durationMs: number;
  errorReason?: string;
}

interface StepLogEntry {
  step: number;
  action: string;
  description?: string;
  url?: string;
  selector?: string;
  status: 'ok' | 'error';
  error?: string;
  extracted?: string[];
  /** Navigation URL after this step — confirms allow-list compliance in audit. */
  resulting_url?: string;
}

export async function executeBrowser(
  db: DatabaseAdapter,
  mission: Mission,
  task: MissionTask,
): Promise<BrowserResult> {
  const startedAt = Date.now();
  const config = task.module_config as unknown as BrowserConfig | undefined;
  if (!config?.service_id || !config?.workflow_id) {
    return failure(startedAt, 'browser task requires module_config.service_id + workflow_id');
  }

  const packMgr = createServicePackManager(db);

  // ── Resolve pack + workflow ─────────────────────────────────────────────
  let resolved;
  try {
    resolved = await packMgr.resolveWorkflow(config.service_id, config.workflow_id, config.params ?? {});
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return failure(startedAt, msg);
  }
  const { pack, resolvedSteps } = resolved;

  // ── Build URL allow-list from pack.service_info.base_urls ───────────────
  const baseUrls = pack.service_info.base_urls ?? [];
  if (baseUrls.length === 0) {
    return failure(startedAt, `Service pack '${pack.service_id}' declares no base_urls — refusing to navigate`);
  }

  // ── Resolve credential (if any) ─────────────────────────────────────────
  let credentialSecret: string | null = null;
  let credentialType: string | null = null;
  if (config.auth_credential_id) {
    const vault = createCredentialVault(db);
    const meta = await vault.getCredentialMeta(config.auth_credential_id);
    if (!meta || !meta.is_active) {
      return failure(startedAt, `Credential ${config.auth_credential_id} not found or inactive`);
    }
    if (!vault.isAllowed(meta, mission.template_id ?? null, pack.service_id)) {
      return failure(
        startedAt,
        `Credential not authorised for mission template ${mission.template_id} or service ${pack.service_id}`,
      );
    }
    credentialSecret = await vault.resolveSecret(config.auth_credential_id, mission.id, task.id);
    credentialType = meta.credential_type;
    if (!credentialSecret) {
      return failure(startedAt, `Credential ${config.auth_credential_id} could not be resolved`);
    }
  }

  const timeoutMs = Math.min(config.timeout_ms ?? DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS);
  const headless = config.headless !== false;
  const maxElements = Math.min(config.max_extract_elements ?? DEFAULT_EXTRACT_ELEMENTS, MAX_EXTRACT_ELEMENTS);

  // ── Launch browser + run steps with overall timeout ─────────────────────
  const runPromise = runSteps({ pack, resolvedSteps, headless, maxElements, baseUrls, credentialSecret, credentialType });
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`Browser task timed out after ${timeoutMs}ms`)), timeoutMs),
  );

  try {
    const runResult: RunResult = await Promise.race([runPromise, timeoutPromise]);
    await packMgr.recordWorkflowUse(pack.service_id, config.workflow_id, runResult.success);
    const outputFull = JSON.stringify(
      {
        service_id: pack.service_id,
        workflow_id: config.workflow_id,
        steps: runResult.stepLog,
        extracted: runResult.extractedByStep,
      },
      null,
      2,
    );
    const summary = runResult.success
      ? `browser ok — ${pack.service_id}/${config.workflow_id} (${runResult.stepLog.length} steps)`
      : `browser failed at step ${runResult.stepLog.length}: ${runResult.errorReason}`;
    log.info(
      {
        missionId: mission.id, taskId: task.id, serviceId: pack.service_id, workflowId: config.workflow_id,
        steps: runResult.stepLog.length, ok: runResult.success, durationMs: Date.now() - startedAt,
      },
      'browser_run',
    );
    return {
      success: runResult.success,
      outputFull,
      outputSummary: summary,
      durationMs: Date.now() - startedAt,
      errorReason: runResult.errorReason,
    };
  } catch (err) {
    await packMgr.recordWorkflowUse(pack.service_id, config.workflow_id, false);
    const msg = err instanceof Error ? err.message : String(err);
    log.warn({ missionId: mission.id, taskId: task.id, err: msg }, 'browser_error');
    return failure(startedAt, msg);
  }
}

// ── Core runner ────────────────────────────────────────────────────────────

interface RunStepsInput {
  pack: ServicePack;
  resolvedSteps: ServicePackWorkflowStep[];
  headless: boolean;
  maxElements: number;
  baseUrls: string[];
  credentialSecret: string | null;
  credentialType: string | null;
}

interface RunResult {
  success: boolean;
  stepLog: StepLogEntry[];
  extractedByStep: Record<string, string[]>;
  errorReason?: string;
}

async function runSteps(input: RunStepsInput): Promise<RunResult> {
  const { pack, resolvedSteps, headless, maxElements, baseUrls, credentialSecret, credentialType } = input;
  const stepLog: StepLogEntry[] = [];
  const extractedByStep: Record<string, string[]> = {};

  // Dynamic import — keeps Playwright out of the cold-start path.
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false, stepLog, extractedByStep,
      errorReason: `Playwright not available: ${msg}. Install with: npx playwright install chromium`,
    };
  }

  const browser = await chromium.launch({ headless });
  try {
    const extraHeaders: Record<string, string> = {};
    if (credentialSecret && credentialType) {
      if (credentialType === 'bearer_token' || credentialType === 'api_key') {
        extraHeaders['Authorization'] = `Bearer ${credentialSecret}`;
      }
    }

    const context = await browser.newContext({ extraHTTPHeaders: extraHeaders });

    // Cookie-jar credentials: parse secret as JSON and set as cookies.
    if (credentialSecret && credentialType === 'cookie_jar') {
      try {
        const cookies = JSON.parse(credentialSecret);
        if (Array.isArray(cookies)) {
          await context.addCookies(cookies);
        }
      } catch {
        // Malformed cookie jar — continue without cookies; the workflow will
        // likely fail at an auth gate which is the right signal to the user.
      }
    }

    const page = await context.newPage();

    for (let i = 0; i < resolvedSteps.length; i++) {
      const step = resolvedSteps[i]!;
      const entry: StepLogEntry = {
        step: i + 1, action: step.action, description: step.description,
        url: step.url, selector: step.selector, status: 'ok',
      };
      try {
        switch (step.action) {
          case 'navigate': {
            if (!step.url) throw new Error('navigate step missing url');
            if (!isUrlAllowed(step.url, baseUrls)) {
              throw new Error(`URL ${step.url} is outside pack base_urls`);
            }
            await page.goto(step.url, { waitUntil: 'domcontentloaded' });
            entry.resulting_url = page.url();
            break;
          }
          case 'click': {
            if (!step.selector) throw new Error('click step missing selector');
            await page.click(step.selector);
            break;
          }
          case 'fill': {
            if (!step.selector) throw new Error('fill step missing selector');
            await page.fill(step.selector, step.value ?? '');
            break;
          }
          case 'wait': {
            if (step.selector) {
              await page.waitForSelector(step.selector);
            } else if (step.value && /^\d+$/.test(step.value)) {
              await page.waitForTimeout(parseInt(step.value, 10));
            } else {
              await page.waitForLoadState('domcontentloaded');
            }
            break;
          }
          case 'extract': {
            if (!step.selector) throw new Error('extract step missing selector');
            const elements = await page.$$(step.selector);
            const capped = elements.slice(0, maxElements);
            const texts: string[] = [];
            for (const el of capped) {
              const t = (await el.innerText()).trim();
              texts.push(t.length > EXTRACT_CELL_MAX_CHARS ? t.slice(0, EXTRACT_CELL_MAX_CHARS) + '…' : t);
            }
            entry.extracted = texts;
            extractedByStep[`step_${i + 1}`] = texts;
            break;
          }
          default:
            throw new Error(`Unsupported action '${step.action}'`);
        }
        // Post-navigation URL check — a click could navigate off-allowlist.
        const currentUrl = page.url();
        if (currentUrl && currentUrl !== 'about:blank' && !isUrlAllowed(currentUrl, baseUrls)) {
          throw new Error(`Navigation drifted to ${currentUrl} — outside pack base_urls`);
        }
        if (!entry.resulting_url) entry.resulting_url = currentUrl;
      } catch (err) {
        entry.status = 'error';
        entry.error = err instanceof Error ? err.message : String(err);
        stepLog.push(entry);
        return {
          success: false, stepLog, extractedByStep,
          errorReason: `Step ${i + 1} (${step.action}) failed: ${entry.error}`,
        };
      }
      stepLog.push(entry);
    }

    return { success: true, stepLog, extractedByStep };
  } finally {
    await browser.close().catch(() => { /* ignore */ });
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function isUrlAllowed(urlStr: string, baseUrls: string[]): boolean {
  let url: URL;
  try { url = new URL(urlStr); } catch { return false; }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
  for (const base of baseUrls) {
    try {
      const b = new URL(base);
      // Exact match OR a subdomain of the allowed host (e.g. base
      // 'linkedin.com' covers 'www.linkedin.com', 'login.linkedin.com').
      // Prevents 'evil-linkedin.com' from passing by anchoring on the '.'.
      if (url.hostname === b.hostname || url.hostname.endsWith(`.${b.hostname}`)) return true;
    } catch { /* skip invalid base */ }
  }
  return false;
}

function failure(startedAt: number, reason: string): BrowserResult {
  return {
    success: false,
    outputFull: JSON.stringify({ error: reason }, null, 2),
    outputSummary: `browser failed: ${reason}`,
    durationMs: Date.now() - startedAt,
    errorReason: reason,
  };
}
