// ── Missions — Browser Automation Service (Phase 2) ────────────────────────
//
// Wraps Playwright for production server-side browser sessions. Used when
// no Service Pack covers the target site, and as the executor for Service
// Pack workflows.
//
// Playwright is loaded via dynamic import so the codebase typechecks without
// the runtime dependency installed. To enable browser automation:
//
//   pnpm add playwright
//   npx playwright install chromium
//
// Then the routes and services that use this layer become functional.

import { randomUUID } from 'crypto';
import path from 'path';
import fs from 'fs/promises';
import type { DatabaseAdapter } from '../../db/database.js';
import { encrypt } from '../credential-vault.js';

export interface BrowserSession {
  id: string;
  mission_id: string;
  task_id: string | null;
  browser: 'chromium' | 'firefox' | 'webkit';
  headless: boolean;
  status: 'active' | 'closed' | 'error';
  pages_visited: string[];
  actions_count: number;
  domains_allowed: string[];
  created_at: string;
  closed_at: string | null;
}

export type BrowserActionType =
  | 'navigate' | 'click' | 'fill' | 'select' | 'upload' | 'download'
  | 'screenshot' | 'extract' | 'wait' | 'scroll' | 'evaluate' | 'submit_form';

export interface BrowserAction {
  type: BrowserActionType;
  selector?: string;
  value?: string;
  url?: string;
  waitFor?: string;
  llmReasoning?: string;
}

export interface BrowserActionResult {
  success: boolean;
  result_summary?: string;
  extracted?: unknown;
  screenshot_before?: string;
  screenshot_after?: string;
  error_message?: string;
}

interface PlaywrightModule {
  chromium: { launch: (opts: { headless?: boolean }) => Promise<unknown> };
  firefox: { launch: (opts: { headless?: boolean }) => Promise<unknown> };
  webkit: { launch: (opts: { headless?: boolean }) => Promise<unknown> };
}

// ── Module loader (cached) ─────────────────────────────────────────────────
let cachedPlaywright: PlaywrightModule | null = null;
let playwrightLoadError: Error | null = null;

async function loadPlaywright(): Promise<PlaywrightModule> {
  if (cachedPlaywright) return cachedPlaywright;
  if (playwrightLoadError) throw playwrightLoadError;
  try {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore — playwright is an optional dependency installed by the user
    const mod = (await import('playwright')) as unknown as PlaywrightModule;
    cachedPlaywright = mod;
    return mod;
  } catch (err) {
    playwrightLoadError = new Error(
      'Playwright is not installed. Install it to enable browser automation:\n' +
      '  pnpm add playwright\n' +
      '  npx playwright install chromium\n' +
      `Original error: ${err instanceof Error ? err.message : String(err)}`,
    );
    throw playwrightLoadError;
  }
}

// ── In-memory active sessions (Playwright objects) ─────────────────────────
// Sessions are keyed by id; the underlying browser/context/page is held here.
// Long-lived but bounded — enforced via session timeout + max concurrent.

interface ActiveSession {
  browser: unknown;          // Playwright Browser
  context: unknown;          // Playwright BrowserContext
  page: unknown;             // Playwright Page
  config: BrowserSession;
  createdAt: number;
}

const activeSessions = new Map<string, ActiveSession>();
const MAX_CONCURRENT_SESSIONS = 4;
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

function newSessionId(): string {
  return `browser_${Date.now()}_${randomUUID().slice(0, 8)}`;
}

function isDomainAllowed(url: string, allowList: string[]): boolean {
  if (allowList.includes('*')) return true;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return allowList.some(pattern => {
      const p = pattern.toLowerCase();
      if (p === host) return true;
      // suffix match for *.example.com → matches sub.example.com but not other.com
      if (p.startsWith('*.')) return host.endsWith(p.slice(1));
      return host.endsWith('.' + p);
    });
  } catch {
    return false;
  }
}

export function createBrowserAutomation(db: DatabaseAdapter, options?: { screenshotsRoot?: string }) {
  const screenshotsRoot = options?.screenshotsRoot ?? path.join(process.cwd(), 'data', 'missions', 'screenshots');

  // ── Session lifecycle ────────────────────────────────────────────────────

  async function createSession(input: {
    missionId: string;
    taskId?: string;
    browser?: 'chromium' | 'firefox' | 'webkit';
    headless?: boolean;
    domainsAllowed?: string[];
  }): Promise<BrowserSession> {
    if (activeSessions.size >= MAX_CONCURRENT_SESSIONS) {
      throw new Error(`Maximum concurrent browser sessions (${MAX_CONCURRENT_SESSIONS}) reached. Close an existing session first.`);
    }
    const playwright = await loadPlaywright();
    const id = newSessionId();
    const browserType = input.browser ?? 'chromium';
    const headless = input.headless ?? true;
    const browser = await playwright[browserType].launch({ headless });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const context = await (browser as any).newContext();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const page = await (context as any).newPage();

    const config: BrowserSession = {
      id,
      mission_id: input.missionId,
      task_id: input.taskId ?? null,
      browser: browserType,
      headless,
      status: 'active',
      pages_visited: [],
      actions_count: 0,
      domains_allowed: input.domainsAllowed ?? ['*'],
      created_at: new Date().toISOString(),
      closed_at: null,
    };

    activeSessions.set(id, { browser, context, page, config, createdAt: Date.now() });

    await db.run(
      `INSERT INTO missions.browser_sessions
        (id, mission_id, task_id, browser, headless, status, pages_visited,
         actions_count, domains_allowed, credential_ids_used)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '[]')`,
      id, config.mission_id, config.task_id, browserType, headless, 'active',
      JSON.stringify([]), 0, JSON.stringify(config.domains_allowed),
    );

    return config;
  }

  async function closeSession(sessionId: string): Promise<void> {
    const sess = activeSessions.get(sessionId);
    if (sess) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cookies = await (sess.context as any).cookies();
        const cookiesEncrypted = encrypt(JSON.stringify(cookies));
        await db.run(
          `UPDATE missions.browser_sessions SET cookies_snapshot_encrypted = ? WHERE id = ?`,
          cookiesEncrypted, sessionId,
        );
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (sess.context as any).close();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (sess.browser as any).close();
      } catch (err) {
        console.error(`[mission-browser] Error closing session ${sessionId}:`, err);
      }
      activeSessions.delete(sessionId);
    }
    await db.run(
      `UPDATE missions.browser_sessions SET status = 'closed', closed_at = NOW() WHERE id = ?`,
      sessionId,
    );
  }

  // ── Action execution ─────────────────────────────────────────────────────

  async function executeAction(sessionId: string, action: BrowserAction): Promise<BrowserActionResult> {
    const sess = activeSessions.get(sessionId);
    if (!sess) throw new Error(`Browser session ${sessionId} not found or has been closed`);

    // Domain allow-list check for navigate
    if (action.type === 'navigate' && action.url) {
      if (!isDomainAllowed(action.url, sess.config.domains_allowed)) {
        const error = `Navigation blocked — domain not in allow list: ${action.url}`;
        await logAction(sess.config, action, { success: false, error_message: error });
        return { success: false, error_message: error };
      }
    }

    // Form submission requires explicit allow
    if (action.type === 'submit_form' && !sess.config.domains_allowed.includes('*')) {
      // For now treat submit_form as click on a submit selector — Phase 2
      // adds explicit form-submission policy on the mission's data_scope
    }

    let result: BrowserActionResult;
    let screenshotBefore: string | undefined;
    let screenshotAfter: string | undefined;
    try {
      // Optional pre-action screenshot for clicks/fills/submits
      if (action.type === 'click' || action.type === 'fill' || action.type === 'submit_form') {
        screenshotBefore = await captureScreenshot(sess, 'before');
      }
      result = await dispatchAction(sess, action);
      if (action.type === 'click' || action.type === 'fill' || action.type === 'submit_form') {
        screenshotAfter = await captureScreenshot(sess, 'after');
      }
      result.screenshot_before = screenshotBefore;
      result.screenshot_after = screenshotAfter;
    } catch (err) {
      result = {
        success: false,
        error_message: err instanceof Error ? err.message : String(err),
        screenshot_before: screenshotBefore,
        screenshot_after: screenshotAfter,
      };
    }

    sess.config.actions_count++;
    await logAction(sess.config, action, result);
    return result;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function dispatchAction(sess: ActiveSession, action: BrowserAction): Promise<BrowserActionResult> {
    const page = sess.page as any;
    switch (action.type) {
      case 'navigate':
        if (!action.url) throw new Error('navigate requires url');
        await page.goto(action.url, { waitUntil: 'networkidle', timeout: 30_000 });
        sess.config.pages_visited.push(action.url);
        return { success: true, result_summary: `navigated to ${action.url}` };
      case 'click':
        if (!action.selector) throw new Error('click requires selector');
        await page.click(action.selector, { timeout: 15_000 });
        return { success: true, result_summary: `clicked ${action.selector}` };
      case 'fill':
        if (!action.selector) throw new Error('fill requires selector');
        await page.fill(action.selector, action.value ?? '', { timeout: 15_000 });
        return { success: true, result_summary: `filled ${action.selector}` };
      case 'select':
        if (!action.selector) throw new Error('select requires selector');
        await page.selectOption(action.selector, action.value ?? '');
        return { success: true, result_summary: `selected ${action.value} in ${action.selector}` };
      case 'wait':
        if (action.selector) {
          await page.waitForSelector(action.selector, { timeout: 30_000 });
          return { success: true, result_summary: `waited for ${action.selector}` };
        }
        await page.waitForTimeout(parseInt(action.value ?? '1000', 10));
        return { success: true, result_summary: 'waited' };
      case 'extract': {
        if (action.selector) {
          const text = await page.textContent(action.selector);
          return { success: true, result_summary: 'extracted text', extracted: text };
        }
        const html = await page.content();
        return { success: true, result_summary: 'extracted full HTML', extracted: html };
      }
      case 'screenshot': {
        const sPath = await captureScreenshot(sess, 'manual');
        return { success: true, result_summary: 'captured screenshot', screenshot_after: sPath };
      }
      case 'scroll':
        await page.evaluate(`window.scrollBy(0, ${action.value ? parseInt(action.value, 10) : 500})`);
        return { success: true, result_summary: 'scrolled' };
      default:
        throw new Error(`Action type '${action.type}' not yet implemented`);
    }
  }

  async function captureScreenshot(sess: ActiveSession, label: string): Promise<string> {
    const dir = path.join(screenshotsRoot, sess.config.mission_id, sess.config.task_id ?? '_no_task');
    await fs.mkdir(dir, { recursive: true });
    const filename = `${Date.now()}_${randomUUID().slice(0, 8)}_${label}.png`;
    const fullPath = path.join(dir, filename);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sess.page as any).screenshot({ path: fullPath, fullPage: false });
    return path.relative(process.cwd(), fullPath);
  }

  async function logAction(session: BrowserSession, action: BrowserAction, result: BrowserActionResult): Promise<void> {
    await db.run(
      `INSERT INTO missions.browser_actions
        (session_id, mission_id, task_id, action_type, url, selector, value,
         result_summary, screenshot_before, screenshot_after, success, error_message, llm_reasoning)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      session.id, session.mission_id, session.task_id, action.type,
      action.url ?? null, action.selector ?? null, action.value ?? null,
      result.result_summary ?? null, result.screenshot_before ?? null, result.screenshot_after ?? null,
      result.success, result.error_message ?? null, action.llmReasoning ?? null,
    );
    await db.run(
      `UPDATE missions.browser_sessions SET actions_count = actions_count + 1 WHERE id = ?`,
      session.id,
    );
  }

  // ── Listing for UI ───────────────────────────────────────────────────────

  async function listSessions(missionId?: string): Promise<BrowserSession[]> {
    const where = missionId ? 'WHERE mission_id = ?' : '';
    const args = missionId ? [missionId] : [];
    interface Row {
      id: string; mission_id: string; task_id: string | null; browser: string; headless: boolean;
      status: string; pages_visited: unknown; actions_count: number; domains_allowed: unknown;
      created_at: string; closed_at: string | null;
    }
    const rows = await db.all<Row>(
      `SELECT id, mission_id, task_id, browser, headless, status, pages_visited,
              actions_count, domains_allowed, created_at, closed_at
       FROM missions.browser_sessions ${where} ORDER BY created_at DESC LIMIT 100`,
      ...args,
    );
    return rows.map(r => ({
      id: r.id, mission_id: r.mission_id, task_id: r.task_id,
      browser: r.browser as BrowserSession['browser'], headless: !!r.headless,
      status: r.status as BrowserSession['status'],
      pages_visited: parseJsonArr<string>(r.pages_visited),
      actions_count: r.actions_count,
      domains_allowed: parseJsonArr<string>(r.domains_allowed),
      created_at: r.created_at, closed_at: r.closed_at,
    }));
  }

  // ── Periodic cleanup of stale sessions ───────────────────────────────────

  function startCleanupLoop(): NodeJS.Timeout {
    return setInterval(() => {
      const now = Date.now();
      for (const [id, sess] of activeSessions.entries()) {
        if (now - sess.createdAt > SESSION_TIMEOUT_MS) {
          console.log(`[mission-browser] Auto-closing stale session ${id} (>${SESSION_TIMEOUT_MS / 60000} min)`);
          void closeSession(id);
        }
      }
    }, 5 * 60 * 1000);
  }

  return {
    createSession, closeSession, executeAction, listSessions,
    startCleanupLoop,
    isPlaywrightInstalled: async () => {
      try { await loadPlaywright(); return true; } catch { return false; }
    },
  };
}

export type BrowserAutomation = ReturnType<typeof createBrowserAutomation>;

function parseJsonArr<T>(v: unknown): T[] {
  if (Array.isArray(v)) return v as T[];
  if (typeof v === 'string') { try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; } }
  return [];
}
