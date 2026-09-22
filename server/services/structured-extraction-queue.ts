// ── Structured Extraction Queue ──────────────────────────────────────────
//
// Thin bounded-concurrency wrapper around createStructuredExtractor so
// the post-generation hook in /claude/* routes doesn't spawn 100 parallel
// extraction calls under bursty load.
//
// Also deduplicates in-flight extractions per session_id: if a second
// request arrives for a session whose extraction is still running, we
// return the running promise instead of kicking a second call.
//
// Used by both the streaming and sync claude endpoints so MCP + direct
// callers get the same extraction coverage as the chat UI — and, since
// Wave 3, by the renderer route for extraction ON DEMAND.
//
// Wave 3 (2026-09-16) — extraction after every run is a setting:
//   app_settings 'structured_extraction_auto'. Unset, it defaults OFF when
//   the Settings default model is a subscription engine (`sdk:` — every
//   extraction is a full engine turn on the one background slot) and ON
//   otherwise (an API Haiku call per run is cheap). With auto off a session
//   stays 'pending' until someone presses a transform that needs the
//   payload; the renderer route then calls extractNow() and waits for it.

import type { DatabaseAdapter } from '../db/database.js';
import {
  createStructuredExtractor,
  safeContentType,
  type ExtractionInput,
  type ExtractionResult,
  type ExtractorOptions,
} from './structured-extractor.js';
import type { ContentType } from '../schemas/content-types/index.js';
import { getEffectiveDefaultModel } from './default-model-store.js';

const MAX_CONCURRENT = Number(process.env.OTS_EXTRACTION_CONCURRENCY ?? '5');
/** Below this there is no structure worth an engine call. */
const MIN_MARKDOWN_CHARS = 100;
const MAX_ERROR_LEN = 1_000;

// ── The auto-extraction setting ────────────────────────────────────────

export const AUTO_EXTRACTION_SETTING_KEY = 'structured_extraction_auto';
const AUTO_CACHE_TTL_MS = 60_000;

/** undefined = never loaded; value null = loaded, no row persisted. */
let autoCache: { value: boolean | null; at: number } | undefined;

/**
 * The default when nothing is persisted: OFF under an `sdk:` default model
 * (each extraction is a schema-constrained engine turn on the scarce
 * background slot), ON for API / local providers.
 */
export function autoExtractionDefault(): boolean {
  const model = getEffectiveDefaultModel();
  return !(typeof model === 'string' && model.startsWith('sdk:'));
}

function parseBoolSetting(v: string): boolean | null {
  const s = v.trim().toLowerCase();
  if (s === 'true' || s === '1' || s === 'on' || s === 'yes') return true;
  if (s === 'false' || s === '0' || s === 'off' || s === 'no') return false;
  return null;
}

/** Effective value: persisted Settings choice → default rule. Cached 60 s. */
export async function isAutoExtractionEnabled(db: DatabaseAdapter): Promise<boolean> {
  if (!autoCache || Date.now() - autoCache.at >= AUTO_CACHE_TTL_MS) {
    try {
      const row = await db.get<{ value: string }>(
        'SELECT value FROM app_settings WHERE key = ?',
        AUTO_EXTRACTION_SETTING_KEY,
      );
      autoCache = { value: row?.value !== undefined ? parseBoolSetting(row.value) : null, at: Date.now() };
    } catch (err) {
      // Settings read must never break a run — keep the last known value.
      console.warn(`[extraction-queue] could not read ${AUTO_EXTRACTION_SETTING_KEY}: ${err instanceof Error ? err.message : 'db error'}`);
      autoCache = { value: autoCache?.value ?? null, at: Date.now() };
    }
  }
  return autoCache.value ?? autoExtractionDefault();
}

/** For a Settings surface: what is persisted, what applies, and why. */
export async function getAutoExtractionSetting(db: DatabaseAdapter): Promise<{ enabled: boolean; persisted: boolean | null; default: boolean }> {
  const enabled = await isAutoExtractionEnabled(db);
  return { enabled, persisted: autoCache?.value ?? null, default: autoExtractionDefault() };
}

/** Persist (or clear, with null) the toggle. The cache updates synchronously. */
export async function setAutoExtraction(db: DatabaseAdapter, enabled: boolean | null): Promise<void> {
  if (enabled === null) {
    await db.run('DELETE FROM app_settings WHERE key = ?', AUTO_EXTRACTION_SETTING_KEY);
    autoCache = { value: null, at: Date.now() };
    return;
  }
  await db.run(
    'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    AUTO_EXTRACTION_SETTING_KEY,
    enabled ? 'true' : 'false',
  );
  autoCache = { value: enabled, at: Date.now() };
}

/** Test hook — reset module state between tests. */
export function resetAutoExtractionForTests(): void {
  autoCache = undefined;
}

// ── Content type resolution ────────────────────────────────────────────

/**
 * The content type a module declares in its module.json (`contentType`),
 * analytic_report when unknown. Shared by the claude routes (auto
 * extraction), the renderer route (on demand) and the registry (which
 * offers content-aware transforms before any payload exists). module-loader
 * is imported lazily: it starts a directory watcher outside production.
 */
export async function resolveModuleContentType(moduleId: string | null): Promise<ContentType> {
  if (!moduleId) return 'analytic_report';
  try {
    const { getModule } = await import('./module-loader.js');
    const mod = await getModule(moduleId);
    return safeContentType(mod?.contentType);
  } catch {
    return 'analytic_report';
  }
}

// ── The queue ──────────────────────────────────────────────────────────

export interface EnqueueInput {
  sessionId: string;
  markdown: string;
  moduleId: string | null;
  areaId?: string | null;
  userId?: string | null;
  generationModel?: string | null;
}

export interface EnqueueOptions {
  /** Skip the structured_extraction_auto gate — somebody is waiting for the payload. */
  force?: boolean;
}

export function createExtractionQueue(
  db: DatabaseAdapter,
  resolveContentType: (moduleId: string | null) => Promise<ContentType> = resolveModuleContentType,
  extractorOpts?: ExtractorOptions,
) {
  const extractor = createStructuredExtractor(db, extractorOpts);
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
   *
   * Without `force`, a run with the auto setting off resolves to status
   * 'disabled' and touches nothing — the session stays 'pending' for an
   * on-demand extraction later.
   */
  function enqueue(input: EnqueueInput, opts: EnqueueOptions = {}): Promise<ExtractionResult> | null {
    if (!input.sessionId || !input.markdown || input.markdown.length < MIN_MARKDOWN_CHARS) return null;

    const existing = inflight.get(input.sessionId);
    if (existing) return existing;

    const promise = (async (): Promise<ExtractionResult> => {
      let acquired = false;
      try {
        if (!opts.force && !(await isAutoExtractionEnabled(db))) {
          return {
            status: 'disabled', payload: null, cached: false, hash: '',
            error: 'Automatic structured extraction is off — it runs when a transform that needs it is requested.',
          };
        }
        await acquire();
        acquired = true;
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
        // extractAndStore persists every failure it can name; what lands
        // here escaped it (a DB write that threw, a resolver crash). The
        // session must not sit at 'pending' with nothing to explain it.
        const message = err instanceof Error ? err.message : String(err);
        console.warn('[extraction-queue] extraction failed:', message);
        await recordUnhandledFailure(input.sessionId, message);
        return { status: 'failed', payload: null, cached: false, hash: '', error: message };
      } finally {
        if (acquired) release();
        inflight.delete(input.sessionId);
      }
    })();

    inflight.set(input.sessionId, promise);
    // Swallow rejections — callers may or may not await
    promise.catch(() => {});
    return promise;
  }

  /**
   * Extraction on demand (Wave 3): the renderer route calls this when a
   * content-aware transform is requested and the session has no payload.
   * Same semaphore and per-session dedup as enqueue, but the auto gate is
   * bypassed and the caller awaits the metered result.
   */
  async function extractNow(input: EnqueueInput): Promise<ExtractionResult> {
    const running = enqueue(input, { force: true });
    if (running) return running;
    const error = !input.markdown || input.markdown.length < MIN_MARKDOWN_CHARS
      ? `Nothing to extract — the output is under ${MIN_MARKDOWN_CHARS} characters.`
      : 'Nothing to extract.';
    return { status: 'failed', payload: null, cached: false, hash: '', error };
  }

  async function recordUnhandledFailure(sessionId: string, message: string): Promise<void> {
    try {
      await db.run(
        `UPDATE sessions
         SET structured_status = 'failed', structured_error = ?, structured_attempts = structured_attempts + 1, updated_at = NOW()
         WHERE id = ?`,
        message.slice(0, MAX_ERROR_LEN), sessionId,
      );
    } catch (err) {
      console.warn('[extraction-queue] could not record the failure on the session:', err instanceof Error ? err.message : err);
    }
  }

  function inflightCount(): number {
    return inflight.size;
  }

  return { enqueue, extractNow, inflightCount, MAX_CONCURRENT };
}

export type ExtractionQueue = ReturnType<typeof createExtractionQueue>;
