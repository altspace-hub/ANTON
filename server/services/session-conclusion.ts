/**
 * session-conclusion.ts — the model-written conclusion of a session, taken
 * after each substantive answer (Wave 4, track C: "a session that remembers
 * what it concluded").
 *
 * Before this, cross-session memory had no writer: session_snapshots had 0
 * rows and sessions.summary was NULL on every one of the 55 sessions. The only
 * writers were a manual POST nobody used and a heuristic "first 300 chars of
 * the last answer" route nothing called. The resume layer and the project
 * context layer both read from here, so what is written must say what was
 * CONCLUDED — findings, positions, figures agreed — not what was discussed.
 *
 * Contract:
 *   - never throws; any failure → { written: false, reason } plus one warn
 *     line that names the session id and nothing else (no content in logs);
 *   - one write per (session, message) — idempotent on message_id;
 *   - one writer per session at a time — an overlapping turn is refused, not
 *     queued (the next turn concludes again anyway);
 *   - answers under CONCLUSION_MIN_CHARS are not worth an LLM call.
 *
 * Storage: one session_snapshots row per answer (migration 276 dropped the
 * old UNIQUE (session_id)); message_id records which answer each conclusion
 * was taken after and readers take the newest by created_at. The latest
 * summary is mirrored onto sessions.summary, which the project-context layer
 * reads.
 */

import { randomUUID } from 'crypto';
import type { DatabaseAdapter } from '../db/database.js';
import { callChat } from './provider-router.js';
import { getRoutedUtilityModel } from './utility-model.js';
import { recordParseOutcome } from './parse-telemetry.js';

/** Below this many characters an answer is a pleasantry or an error, not a conclusion. */
export const CONCLUSION_MIN_CHARS = 200;
/** How many of the session's latest messages the concluder reads (oldest first). */
export const CONCLUSION_MESSAGE_WINDOW = 12;
/** Per-message character cap inside the transcript. */
export const CONCLUSION_MESSAGE_CAP = 1500;
/** Max items per list (key_decisions / open_questions / next_steps). */
export const CONCLUSION_MAX_ITEMS = 5;
/** parse-telemetry service key. */
export const CONCLUSION_SERVICE = 'session-conclusion';

const MAX_TITLE_CHARS = 120;
const MAX_ITEM_CHARS = 300;
const MAX_SUMMARY_CHARS = 1200;
const MIN_SUMMARY_CHARS = 20;

export interface SessionConclusionInput {
  sessionId: string;
  messageId: string;
  userId: string;
  moduleId?: string | null;
  areaId?: string | null;
  assistantText: string;
}

export interface SessionConclusionResult {
  written: boolean;
  reason?: string;
  snapshotId?: string;
}

export interface SessionConclusion {
  title: string | null;
  summary: string;
  key_decisions: string[];
  open_questions: string[];
  next_steps: string[];
}

export interface TranscriptMessage {
  id?: string | null;
  role: string;
  content: string;
}

export const CONCLUSION_SYSTEM_PROMPT = `You write the running conclusion of a professional working session so the person can come back to it after a break, and so other sessions in the same project can build on it.

Return ONLY a JSON object with exactly these keys:
{"title": string, "summary": string, "key_decisions": string[], "open_questions": string[], "next_steps": string[]}

Rules:
- title: at most 8 words naming the matter itself, not the tool or the module.
- summary: 2-4 sentences, at most 80 words, stating what was CONCLUDED — findings reached, positions taken, figures or thresholds agreed, documents produced. Not what was discussed or asked.
- key_decisions, open_questions, next_steps: at most ${CONCLUSION_MAX_ITEMS} short items each; use [] when there are none. Only what the conversation actually established — never invent.
- Write in the language of the conversation. No markdown, no text outside the JSON.`;

// ── In-flight guard ────────────────────────────────────────────────────────

/** sessionId → messageId currently being concluded. */
const inFlight = new Map<string, string>();

/** Test hook — clears the per-session in-flight guard. */
export function resetSessionConclusionForTests(): void {
  inFlight.clear();
}

// ── Tolerant JSON object parser ────────────────────────────────────────────

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Parse the first JSON object out of a model reply. Small and local models
 * wrap the object in markdown fences, put prose before or after it, or add
 * a trailing sentence that itself contains braces; all of those are
 * recovered here. Returns null when no object could be salvaged.
 * (parseJsonArrayTolerant in atom-extractor.ts is the array-rooted twin.)
 */
export function parseJsonObjectTolerant(text: string): Record<string, unknown> | null {
  const cleaned = text.trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();
  if (!cleaned) return null;

  try {
    const direct: unknown = JSON.parse(cleaned);
    if (isPlainObject(direct)) return direct;
  } catch { /* fall through to repair */ }

  const open = cleaned.indexOf('{');
  const close = cleaned.lastIndexOf('}');
  if (open < 0 || close <= open) return null;

  // Prose around the object: first '{' … last '}'.
  try {
    const sliced: unknown = JSON.parse(cleaned.slice(open, close + 1));
    if (isPlainObject(sliced)) return sliced;
  } catch { /* fall through */ }

  // Trailing prose that contains braces: walk to the first balanced object.
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = open; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        try {
          const v: unknown = JSON.parse(cleaned.slice(open, i + 1));
          return isPlainObject(v) ? v : null;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

// ── Normalisation ──────────────────────────────────────────────────────────

function stringList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) {
    if (typeof item !== 'string') continue;
    const s = item.replace(/\s+/g, ' ').trim();
    if (!s) continue;
    out.push(s.slice(0, MAX_ITEM_CHARS));
    if (out.length >= CONCLUSION_MAX_ITEMS) break;
  }
  return out;
}

/**
 * Shape-check the parsed object. A conclusion without a real summary is
 * worthless to the resume and project layers, so that is the one hard
 * requirement; everything else degrades to empty.
 */
export function normaliseConclusion(raw: Record<string, unknown>): SessionConclusion | null {
  const summary = typeof raw.summary === 'string' ? raw.summary.replace(/\s+/g, ' ').trim() : '';
  if (summary.length < MIN_SUMMARY_CHARS) return null;
  const title = typeof raw.title === 'string' && raw.title.trim()
    ? raw.title.replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE_CHARS)
    : null;
  return {
    title,
    summary: summary.slice(0, MAX_SUMMARY_CHARS),
    key_decisions: stringList(raw.key_decisions),
    open_questions: stringList(raw.open_questions),
    next_steps: stringList(raw.next_steps),
  };
}

// ── Transcript ─────────────────────────────────────────────────────────────

function capMessage(content: string, isConcludingAnswer: boolean): string {
  const text = content.trim();
  if (text.length <= CONCLUSION_MESSAGE_CAP) return text;
  if (!isConcludingAnswer) return `${text.slice(0, CONCLUSION_MESSAGE_CAP)} …`;
  // The answer being concluded keeps its head AND its tail — conclusions
  // usually live in the closing section, which a head-only cap would drop.
  if (text.length <= CONCLUSION_MESSAGE_CAP * 2) return text;
  return `${text.slice(0, CONCLUSION_MESSAGE_CAP)}\n[…]\n${text.slice(-CONCLUSION_MESSAGE_CAP)}`;
}

/**
 * Render the last CONCLUSION_MESSAGE_WINDOW messages, oldest first, each
 * capped. `history` is what the messages table holds; when the answer being
 * concluded is not among those rows yet (the caller may run before its row
 * is persisted) it is appended from `current.assistantText`.
 */
export function buildConclusionTranscript(
  history: TranscriptMessage[],
  current: { messageId: string; assistantText: string },
): string {
  const persisted = history.some((m) => m.id === current.messageId);
  const rows: TranscriptMessage[] = persisted
    ? history
    : [...history, { id: current.messageId, role: 'assistant', content: current.assistantText }];
  return rows
    .slice(-CONCLUSION_MESSAGE_WINDOW)
    .map((m) => `[${m.role}]: ${capMessage(m.content, m.id === current.messageId)}`)
    .join('\n\n');
}

// ── Writer ─────────────────────────────────────────────────────────────────

function shortError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.replace(/\s+/g, ' ').slice(0, 120);
}

function refuse(sessionId: string, reason: string): SessionConclusionResult {
  // Session id only — never the answer, the transcript or the model reply.
  console.warn(`[session-conclusion] session ${sessionId}: not written (${reason})`);
  return { written: false, reason };
}

const INSERT_SNAPSHOT_SQL = `
  INSERT INTO session_snapshots
    (id, session_id, snapshot_type, title, summary, key_decisions, open_questions, next_steps,
     context_state, token_count, user_id, module_id, model_id, message_id, created_at)
  VALUES (?, ?, 'auto', ?, ?, ?, ?, ?, '{}', 0, ?, ?, ?, ?, NOW())
  RETURNING id
`;

/**
 * Conclude the session after the answer `messageId`. Reads the last
 * CONCLUSION_MESSAGE_WINDOW messages, asks the utility model for a JSON
 * conclusion, upserts the session's snapshot row and mirrors the summary
 * onto sessions.summary. Never throws.
 */
export async function writeSessionConclusion(
  db: DatabaseAdapter,
  input: SessionConclusionInput,
): Promise<SessionConclusionResult> {
  const { sessionId, messageId } = input;
  if (!sessionId || !messageId) return { written: false, reason: 'missing ids' };
  if ((input.assistantText ?? '').trim().length < CONCLUSION_MIN_CHARS) {
    return { written: false, reason: 'too short' };
  }
  if (inFlight.has(sessionId)) return { written: false, reason: 'in flight' };
  inFlight.set(sessionId, messageId);

  let model = 'unknown';
  try {
    const existing = await db.get<{ id: string }>(
      'SELECT id FROM session_snapshots WHERE session_id = ? AND message_id = ? LIMIT 1',
      sessionId, messageId,
    );
    if (existing) return { written: false, reason: 'already written', snapshotId: existing.id };

    const newestFirst = await db.all<{ id: string; role: string; content: string }>(
      'SELECT id, role, content FROM messages WHERE session_id = ? ORDER BY created_at DESC LIMIT ?',
      sessionId, CONCLUSION_MESSAGE_WINDOW,
    );
    const transcript = buildConclusionTranscript(
      [...newestFirst].reverse(),
      { messageId, assistantText: input.assistantText },
    );

    model = await getRoutedUtilityModel(db);
    let text: string;
    try {
      const result = await callChat({
        model,
        background: true,
        jsonMode: true,
        maxTokens: 700,
        purpose: 'session-conclusion',
        db,
        system: CONCLUSION_SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: `Conversation so far (oldest first):\n\n${transcript}\n\nWrite the conclusion JSON now.`,
        }],
      });
      text = result.text;
    } catch (err) {
      return refuse(sessionId, `llm call failed: ${shortError(err)}`);
    }

    const raw = parseJsonObjectTolerant(text);
    const conclusion = raw ? normaliseConclusion(raw) : null;
    if (!conclusion) {
      await recordParseOutcome(
        db, CONCLUSION_SERVICE, model, false,
        raw ? 'JSON object without a usable summary' : 'no JSON object in reply',
      );
      return refuse(sessionId, raw ? 'unusable conclusion' : 'unparseable response');
    }
    await recordParseOutcome(db, CONCLUSION_SERVICE, model, true);

    const snapshotId = randomUUID();
    const row = await db.get<{ id: string }>(
      INSERT_SNAPSHOT_SQL,
      snapshotId, sessionId, conclusion.title, conclusion.summary,
      JSON.stringify(conclusion.key_decisions),
      JSON.stringify(conclusion.open_questions),
      JSON.stringify(conclusion.next_steps),
      input.userId || 'default', input.moduleId ?? null, model, messageId,
    );
    await db.run('UPDATE sessions SET summary = ? WHERE id = ?', conclusion.summary, sessionId);
    return { written: true, snapshotId: row?.id ?? snapshotId };
  } catch (err) {
    return refuse(sessionId, `write failed: ${shortError(err)}`);
  } finally {
    inFlight.delete(sessionId);
  }
}
