/**
 * rerun.ts — "Rerun with…" (CORE_EXPERIENCE_REVIEW 2026-06, Wave 2 item 2.3).
 *
 * POST /api/rerun { sessionId, messageId?, newModelId, areaId? }
 *
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
 * source-drift warning.
 *
 * Known fidelity limits (surfaced by drift detection, not hidden):
 *   - uploadedFileIds are not part of config_snapshot — uploaded documents from
 *     the original run appear as "removed" sources in the drift report.
 *   - moduleInputs are not snapshotted per message; best-effort recovery from
 *     the session config.
 */

import { Router } from 'express';
import { assertOwned, type OwnedRequest } from '../middleware/ownership.js';
import type { Request, Response, NextFunction } from 'express';
import { EventEmitter } from 'node:events';
import crypto from 'node:crypto';
import type { DatabaseAdapter } from '../db/database.js';
import { safeError } from '../lib/error-response.js';
import { buildOutputInstruction } from '../../src/lib/output-format-definitions.js';

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
  opts: { userId?: string; timeoutMs?: number } = {},
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
      user: opts.userId ? { id: opts.userId } : undefined,
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

// ── Routes ───────────────────────────────────────────────────────────────────

export function createRerunRoutes(db: DatabaseAdapter, claudeRouter: Router): Router {
  const router = Router();

  // POST /api/rerun — re-execute an assistant message with another model.
  router.post('/rerun', async (req: Request, res: Response) => {
    try {
      const { sessionId, messageId, newModelId, areaId } = (req.body ?? {}) as {
        sessionId?: unknown; messageId?: unknown; newModelId?: unknown; areaId?: unknown;
      };
      if (typeof sessionId !== 'string' || !sessionId) {
        return res.status(400).json({ error: 'sessionId is required' });
      }
      if (typeof newModelId !== 'string' || !newModelId || newModelId.length > 100) {
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

      let snapshot: Record<string, unknown> | null = null;
      if (original.config_snapshot) {
        try {
          const parsed = JSON.parse(original.config_snapshot) as unknown;
          if (parsed !== null && typeof parsed === 'object') snapshot = parsed as Record<string, unknown>;
        } catch { /* fall through */ }
      }
      if (!snapshot) {
        return res.status(400).json({
          error: 'This message has no config snapshot — it predates per-message config capture and cannot be rerun faithfully.',
        });
      }
      if (snapshot.model === newModelId) {
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
        newModelId,
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
      const userId = (req as Request & { user?: { id?: string } }).user?.id;
      const result = await dispatchClaudeMessage(claudeRouter, body, { userId });

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
      const originalArtifact = await db.get<{ source_manifest: unknown }>(
        'SELECT source_manifest FROM run_artifacts WHERE message_id = ?', original.id);
      let rerunArtifact: { source_manifest: unknown } | undefined;
      for (let attempt = 0; attempt < 20; attempt++) {
        rerunArtifact = await db.get<{ source_manifest: unknown }>(
          'SELECT source_manifest FROM run_artifacts WHERE message_id = ?', rerunMsg.id);
        if (rerunArtifact) break;
        await sleep(250);
      }

      const driftAvailable = !!(originalArtifact && rerunArtifact);
      const sourceDrift = driftAvailable
        ? computeSourceDrift(originalArtifact!.source_manifest, rerunArtifact!.source_manifest)
        : [];

      res.json({
        original: toMessageSummary(original),
        rerun: toMessageSummary(rerunMsg),
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
      const msg = await db.get<{ content: string; session_id: string }>(
        'SELECT content, session_id FROM messages WHERE id = ?', req.params.messageId as string);
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
