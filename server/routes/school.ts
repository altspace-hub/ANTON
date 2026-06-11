/**
 * School Mode API Routes
 *
 * POST /api/school/chat             — Streaming chat (Socratic AI tutor)
 * POST /api/school/laxhjalp         — Läxhjälp deep-focus session stream
 * GET  /api/school/dashboard        — Student/teacher dashboard
 *
 * Classes
 * GET  /api/school/classes          — Teacher: list own classes
 * POST /api/school/classes          — Teacher: create class
 * GET  /api/school/classes/:id      — Get class details
 * PUT  /api/school/classes/:id      — Teacher: update class
 * POST /api/school/classes/join     — Student: join class by code
 *
 * Assignments
 * GET  /api/school/assignments      — List assignments
 * POST /api/school/assignments      — Teacher: create assignment
 * GET  /api/school/assignments/:id  — Get assignment
 * POST /api/school/assignments/:id/export-anton  — Export as .anton
 * POST /api/school/assignments/import            — Student: import .anton
 *
 * Submissions
 * GET  /api/school/submissions             — List submissions
 * GET  /api/school/submissions/:id         — Get submission
 * POST /api/school/submissions             — Save/submit answers
 * POST /api/school/submissions/:id/grade        — Teacher: set grade
 * POST /api/school/submissions/:id/export-anton — Export submission .anton
 * POST /api/school/submissions/:id/ai-grade     — AI auto-grade (streaming)
 *
 * Guardian
 * GET  /api/school/guardian/children   — List linked children
 * POST /api/school/guardian/link       — Link to child via invite code
 *
 * Curriculum
 * POST /api/school/curricula/upload    — Upload curriculum → AI study plan (streaming)
 *
 * Personas
 * GET  /api/school/personas            — List teacher personas
 */

import { Router } from 'express';
import crypto from 'crypto';
import type { DatabaseAdapter } from '../db/database.js';

import type { Response } from 'express';
import { streamToResponse, isApiKeyConfigured } from '../services/claude-client.js';
import { getRoutedUtilityModel } from '../services/utility-model.js';
import { streamChat, callChat, mapModelToProvider, setSSEHeaders } from '../services/provider-router.js';
import { buildSchoolPrompt, inferMathsModule, inferSubjectModule, type SchoolPromptConfig } from '../services/school-prompt-builder.js';
import { safeError } from '../lib/error-response.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs-extra';
import AdmZip from 'adm-zip';
import { extractTextFromFile } from '../services/text-extractor.js';
import { buildSpecManifest, attachPayloadChecksum } from '../services/anton-bundler.js';

// ── Tier C — Ollama local model streaming ──────────────────────────────────

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? 'mistral:7b';

// Runtime override for Tier C (persisted in DB, loaded on startup, toggled via PATCH /admin/model-tier)
let _ollamaTierEnabled: boolean = process.env.SCHOOL_MODEL_TIER === 'C';

/**
 * Stream a response from Ollama's OpenAI-compatible API (/v1/chat/completions).
 * Emits SSE text_delta events matching the format used by streamToResponse().
 * On failure, returns false — caller should fallback to Claude.
 */
async function streamOllamaToResponse(
  system: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  res: Response,
  onComplete?: (data: { text: string; outputTokens: number }) => void
): Promise<boolean> {
  try {
    const body = JSON.stringify({
      model: OLLAMA_MODEL,
      messages: [
        { role: 'system', content: system },
        ...messages,
      ],
      stream: true,
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000); // 5s connect timeout

    let fetchRes: globalThis.Response;
    try {
      fetchRes = await fetch(`${OLLAMA_BASE_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!fetchRes.ok) return false;

    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const sendEvent = (event: object) => res.write(`data: ${JSON.stringify(event)}\n\n`);

    let fullText = '';
    const reader = fetchRes.body?.getReader();
    if (!reader) return false;

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') continue;
        const jsonStr = trimmed.startsWith('data: ') ? trimmed.slice(6) : trimmed;
        try {
          const chunk = JSON.parse(jsonStr) as { choices?: Array<{ delta?: { content?: string } }> };
          const delta = chunk.choices?.[0]?.delta?.content;
          if (delta) {
            fullText += delta;
            sendEvent({ type: 'text_delta', content: delta });
          }
        } catch { /* skip malformed chunks */ }
      }
    }

    sendEvent({ type: 'done', text: fullText, inputTokens: 0, outputTokens: Math.ceil(fullText.length / 4) });
    res.end();
    onComplete?.({ text: fullText, outputTokens: Math.ceil(fullText.length / 4) });
    return true;
  } catch {
    return false; // Ollama unreachable — caller falls back to Claude
  }
}

/** Returns true when Tier C (Ollama) is active — set via env var or runtime toggle */
function isOllamaTierEnabled(): boolean {
  return _ollamaTierEnabled;
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** SM-2 spaced repetition algorithm */
function sm2Update(
  interval: number, ease: number, repetitions: number, quality: number
): { interval: number; ease: number; repetitions: number; dueDate: string } {
  let newInterval: number;
  const newEase = Math.max(1.3, ease + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  let newReps: number;

  if (quality < 3) {
    newInterval = 1;
    newReps = 0;
  } else {
    if (repetitions === 0) newInterval = 1;
    else if (repetitions === 1) newInterval = 6;
    else newInterval = Math.round(interval * ease);
    newReps = repetitions + 1;
  }

  const due = new Date();
  due.setDate(due.getDate() + newInterval);
  return {
    interval: newInterval,
    ease: newEase,
    repetitions: newReps,
    dueDate: due.toISOString().split('T')[0],
  };
}

function generateClassCode(): string {
  return crypto.randomBytes(3).toString('hex').toUpperCase();
}

/** Build a SchoolPromptConfig from the request body + resolved class row */
const DEFAULT_PERSONA_FOR_SUBJECT: Record<string, string> = {
  mathematics: 'alma',
  svenska: 'saga',
  english: 'saga',
  science: 'viktor',
  'social-studies': 'erik',
  'computational-thinking': 'alma',
  technology: 'leo',
  'life-skills': 'mia',
  'study-skills': 'mia',
  // T3 Gymnasiet subjects
  'advanced-mathematics': 'alma',
  physics: 'viktor',
  chemistry: 'viktor',
  biology: 'viktor',
  'swedish-advanced': 'saga',
  philosophy: 'erik',
  // P9 new subjects
  'idrott-halsa': 'oscar',
  statistics: 'nora',
  'data-science': 'nora',
  modersmal: 'saga',
  'sfi-bridge': 'saga',
  // T1 Primary subjects
  'primary-mathematics': 'alma',
  'primary-reading': 'saga',
  'primary-writing': 'saga',
  'primary-science': 'viktor',
  'primary-english': 'alma',
  'primary-art': 'alma',
  // T3 new subjects
  'gymnasiet-economics': 'nora',
  'gymnasiet-technology': 'leo',
  // T4 University subjects
  'uni-mathematics': 'professor-lindstrom',
  'uni-physics': 'professor-lindstrom',
  'uni-economics': 'professor-lindstrom',
  'uni-computer-science': 'professor-lindstrom',
  'uni-law': 'professor-lindstrom',
  'uni-psychology': 'professor-lindstrom',
  'uni-biology': 'professor-lindstrom',
  'uni-chemistry': 'professor-lindstrom',
  'uni-philosophy': 'professor-lindstrom',
  'uni-statistics': 'nora',
  // T4 new program-specific subjects
  'uni-industriell-ekonomi': 'professor-lindstrom',
  'uni-datateknik': 'leo',
  'uni-kemiteknik': 'viktor',
  'uni-maskinteknik': 'professor-lindstrom',
  'uni-elektroteknik': 'professor-lindstrom',
};

function buildPromptConfig(
  body: Record<string, unknown>,
  classRow: Record<string, unknown> | null,
  overrides?: { growthStage?: string; senMode?: string | null; explanationStyle?: string; gymnasietProgram?: string; universityProgram?: string }
): SchoolPromptConfig {
  const subjectId = (classRow?.subject_id as string) || (body.subjectId as string) || 'mathematics';
  const defaultPersona = DEFAULT_PERSONA_FOR_SUBJECT[subjectId] ?? 'alma';
  return {
    educationTier: ((classRow?.education_tier as string) || (body.educationTier as string) || 'T2') as SchoolPromptConfig['educationTier'],
    subjectId,
    moduleId: (body.moduleId as string) || undefined,
    topic: (body.topic as string) || undefined,
    teacherPersonaId: (classRow?.default_teacher_persona as string) || (body.teacherPersonaId as string) || defaultPersona,
    assistanceLevel: ((body.assistanceLevel as string) || (classRow?.default_assistance_level as string) || 'L2') as SchoolPromptConfig['assistanceLevel'],
    taskType: ((body.taskType as string) || 'studying') as SchoolPromptConfig['taskType'],
    curriculumId: (classRow?.curriculum_id as string) || 'lgr22',
    additionalContext: (body.additionalContext as string) || undefined,
    growthStage: overrides?.growthStage,
    senMode: overrides?.senMode ?? null,
    explanationStyle: overrides?.explanationStyle,
    gymnasietProgram: overrides?.gymnasietProgram,
    universityProgram: overrides?.universityProgram,
  };
}

// ── XP + Level constants ────────────────────────────────────────────────────

const XP_VALUES: Record<string, number> = {
  chat_turn: 5,
  assignment_submitted: 50,
  assignment_perfect: 100,
  streak_day: 20,
  first_session: 25,
  quest_complete: 50,
};

// Minimum XP to reach level N (index = level - 1)
const XP_THRESHOLDS = [0, 100, 300, 600, 1000];

function computeXpLevel(xp: number): number {
  for (let i = XP_THRESHOLDS.length - 1; i >= 0; i--) {
    if (xp >= XP_THRESHOLDS[i]) return i + 1;
  }
  return 1;
}

// ── Achievement definitions ────────────────────────────────────────────────

const ACHIEVEMENT_DEFS = [
  { id: 'first_session',    label: 'First Step',          description: 'Complete your first study session' },
  { id: 'three_day_streak', label: '3-Day Streak',        description: 'Study 3 days in a row' },
  { id: 'five_day_streak',  label: '5-Day Streak',        description: 'Study 5 days in a row' },
  { id: 'ten_day_streak',   label: '10-Day Streak',       description: 'Study 10 days in a row' },
  { id: 'level_2',          label: 'Level 2',             description: 'Reach XP Level 2' },
  { id: 'level_3',          label: 'Level 3',             description: 'Reach XP Level 3' },
  { id: 'level_5',          label: 'Level 5',             description: 'Reach XP Level 5' },
  { id: 'ten_sessions',     label: '10 Sessions',         description: 'Complete 10 study sessions' },
  { id: 'fifty_sessions',   label: '50 Sessions',         description: 'Complete 50 study sessions' },
  { id: 'bloom_any_50',     label: 'Half Way There',      description: 'Reach 50% in any learning dimension' },
  { id: 'bloom_any_100',    label: 'Bloom Master',        description: 'Master any learning dimension' },
  { id: 's2_reached',       label: 'Building Confidence', description: 'Advance to learning stage S2' },
  { id: 's4_reached',       label: 'Independent Learner', description: 'Advance to learning stage S4' },
  { id: 'radar_explorer',   label: 'Radar Explorer',      description: 'Visit My Radar for the first time' },
  { id: 'coding_first',     label: 'First Code',          description: 'Complete your first coding session' },
  { id: 'shield_collector', label: 'Shield Collector',    description: 'Replenish streak shields to 3' },
] as const;

// ── Growth model helpers ────────────────────────────────────────────────────

/** Returns the XP multiplier for any active season today, or 1.0 if none. */
async function getActiveSeasonMultiplier(db: DatabaseAdapter): Promise<number> {
  try {
    const today = new Date().toISOString().split('T')[0];
    const season = await db.get(
      `SELECT xp_multiplier FROM xp_seasons WHERE active = 1 AND start_date <= ? AND end_date >= ? LIMIT 1`
    , today, today) as { xp_multiplier: number } | undefined;
    return season?.xp_multiplier ?? 1.0;
  } catch {
    return 1.0;
  }
}

/** Record (or update) the student's XP earned in the current ISO week. */
async function updateWeeklySnapshot(db: DatabaseAdapter, userId: string, xpEarned: number): Promise<void> {
  try {
    // ISO week start = Monday of current week
    const now = new Date();
    const day = now.getDay(); // 0 = Sunday
    const diffToMonday = (day === 0 ? -6 : 1 - day);
    const monday = new Date(now);
    monday.setDate(now.getDate() + diffToMonday);
    const weekStart = monday.toISOString().split('T')[0];
    const updatedAt = new Date().toISOString();
    await db.run(
      `INSERT INTO weekly_xp_snapshots (id, student_user_id, week_start, week_xp, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(student_user_id, week_start)
       DO UPDATE SET week_xp = week_xp + excluded.week_xp, updated_at = excluded.updated_at`
    , crypto.randomUUID(), userId, weekStart, xpEarned, updatedAt);
  } catch { /* non-fatal */ }
}

async function updateGrowthProfile(db: DatabaseAdapter, userId: string, eventType = 'chat_turn'): Promise<void> {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().split('T')[0];

  const profile = await db.get(
    `SELECT session_count, total_xp, xp_level, current_streak, longest_streak, last_active_date, streak_shields
     FROM student_growth_profiles WHERE student_user_id = ?`
  , userId) as {
    session_count: number; total_xp: number; xp_level: number;
    current_streak: number; longest_streak: number; last_active_date: string | null;
    streak_shields: number;
  } | undefined;

  const now = new Date().toISOString();

  if (!profile) {
    const initXp = (XP_VALUES['first_session'] ?? 25) + (XP_VALUES[eventType] ?? 5);
    await db.run(
      `INSERT INTO student_growth_profiles
         (id, student_user_id, stage, session_count, total_xp, xp_level, current_streak, longest_streak, last_active_date, updated_at)
       VALUES (?, ?, 'S1', 1, ?, 1, 1, 1, ?, ?)`
    , crypto.randomUUID(), userId, initXp, today, now);
    try {
      await db.run(`INSERT INTO student_xp_events (id, student_user_id, event_type, xp_earned, created_at) VALUES (?, ?, ?, ?, ?)`,
        crypto.randomUUID(), userId, 'first_session', XP_VALUES['first_session'] ?? 25, now);
      if (eventType !== 'first_session') {
        await db.run(`INSERT INTO student_xp_events (id, student_user_id, event_type, xp_earned, created_at) VALUES (?, ?, ?, ?, ?)`, crypto.randomUUID(), userId, eventType, XP_VALUES[eventType] ?? 5, now);
      }
    } catch { /* non-fatal */ }
    checkAndAwardAchievements(db, userId, { session_count: 1, xp_level: 1, current_streak: 1, stage: 'S1' });
    return;
  }

  const count = (profile.session_count ?? 0) + 1;
  const stage = count >= 50 ? 'S4' : count >= 20 ? 'S3' : count >= 5 ? 'S2' : 'S1';

  // Streak logic (with shield protection)
  let newStreak = profile.current_streak ?? 0;
  let longestStreak = profile.longest_streak ?? 0;
  let streakXp = 0;

  if (profile.last_active_date === today) {
    // Already active today — preserve streak, no streak XP
  } else if (profile.last_active_date === yesterday) {
    newStreak = newStreak + 1;
    if (newStreak > longestStreak) longestStreak = newStreak;
    streakXp = XP_VALUES['streak_day'] ?? 20;
  } else if (profile.last_active_date && profile.last_active_date !== today) {
    // Streak broken — check shields
    const shields = (profile as unknown as Record<string, unknown>).streak_shields as number ?? 0;
    if (shields > 0) {
      // Shield absorbs the break — keep streak
      await db.run(`UPDATE student_growth_profiles SET streak_shields = streak_shields - 1 WHERE student_user_id = ?`, userId);
      try {
        await db.run(`INSERT INTO student_xp_events (id, student_user_id, event_type, xp_earned, context, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
          crypto.randomUUID(), userId, 'shield_used', 0, 'Streak shield activated', now);
      } catch {}
    } else {
      // No shields — reset streak
      newStreak = 1;
    }
  } else {
    newStreak = 1;
  }

  const baseEventXp = XP_VALUES[eventType] ?? 5;
  const seasonMult = await getActiveSeasonMultiplier(db);
  const eventXp = Math.round(baseEventXp * seasonMult);
  const newXp = (profile.total_xp ?? 0) + eventXp + streakXp;
  const newLevel = computeXpLevel(newXp);

  await db.run(
    `UPDATE student_growth_profiles
     SET session_count = ?, stage = ?, total_xp = ?, xp_level = ?,
         current_streak = ?, longest_streak = ?, last_active_date = ?, updated_at = ?
     WHERE student_user_id = ?`
  , count, stage, newXp, newLevel, newStreak, longestStreak, today, now, userId);

  try {
    if (eventXp > 0) {
      await db.run(`INSERT INTO student_xp_events (id, student_user_id, event_type, xp_earned, created_at) VALUES (?, ?, ?, ?, ?)`,
        crypto.randomUUID(), userId, eventType, eventXp, now);
    }
    if (streakXp > 0) {
      await db.run(`INSERT INTO student_xp_events (id, student_user_id, event_type, xp_earned, created_at) VALUES (?, ?, ?, ?, ?)`, crypto.randomUUID(), userId, 'streak_day', streakXp, now);
    }
  } catch { /* non-fatal */ }
  // Update weekly snapshot for leaderboard
  updateWeeklySnapshot(db, userId, eventXp + streakXp);
  checkAndAwardAchievements(db, userId, { session_count: count, xp_level: newLevel, current_streak: newStreak, stage });

  // Grant a shield when streak reaches 7
  if (newStreak === 7) {
    try {
      await db.run(`UPDATE student_growth_profiles SET streak_shields = MIN(3, streak_shields + 1) WHERE student_user_id = ?`, userId);
    } catch {}
  }
}

async function checkAndAwardAchievements(
  db: DatabaseAdapter,
  userId: string,
  profile: { session_count: number; xp_level: number; current_streak: number; stage: string }
): Promise<void> {
  try {
    const now = new Date().toISOString();
    const earnedRows = await db.all('SELECT achievement_id FROM student_achievements WHERE student_user_id = ?', userId) as { achievement_id: string }[];
    const earned = new Set(earnedRows.map(r => r.achievement_id));

    async function award(id: string) {
      if (earned.has(id)) return;
      earned.add(id);
      try {
        await db.run('INSERT INTO student_achievements (id, student_user_id, achievement_id, earned_at) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING', crypto.randomUUID(), userId, id, now);
      } catch { /* ignore */ }
    }

    if (profile.session_count >= 1)  await award('first_session');
    if (profile.current_streak >= 3)  await award('three_day_streak');
    if (profile.current_streak >= 5)  await award('five_day_streak');
    if (profile.current_streak >= 10) await award('ten_day_streak');
    if (profile.xp_level >= 2) await award('level_2');
    if (profile.xp_level >= 3) await award('level_3');
    if (profile.xp_level >= 5) await award('level_5');
    if (profile.session_count >= 10)  await award('ten_sessions');
    if (profile.session_count >= 50)  await award('fifty_sessions');
    if (['S2', 'S3', 'S4'].includes(profile.stage)) await award('s2_reached');
    if (profile.stage === 'S4') await award('s4_reached');

    // bloom_any_50 / bloom_any_100 — check all progress rows
    try {
      const rows = await db.all('SELECT blooms_data FROM student_progress WHERE student_user_id = ?', userId) as { blooms_data: string }[];
      for (const row of rows) {
        if (!row.blooms_data) continue;
        const vals = Object.values(JSON.parse(row.blooms_data) as Record<string, number>);
        if (vals.some(v => v >= 50))  await award('bloom_any_50');
        if (vals.some(v => v >= 100)) await award('bloom_any_100');
      }
    } catch { /* ignore */ }
  } catch { /* non-fatal */ }
}

async function updateStudentProgress(
  db: DatabaseAdapter,
  userId: string,
  classId: string,
  subjectId: string,
  taskType: string
): Promise<void> {
  const existing = await db.get(
    `SELECT blooms_data, overall_progress_pct FROM student_progress WHERE student_user_id = ? AND class_id = ?`
  , userId, classId) as { blooms_data: string; overall_progress_pct: number } | undefined;
  const blooms = existing?.blooms_data
    ? JSON.parse(existing.blooms_data)
    : { knowledge: 0, application: 0, analysis: 0, evaluation: 0, creation: 0, metacognition: 0 };
  const bloomMap: Record<string, string[]> = {
    homework: ['knowledge', 'application'],
    studying: ['knowledge'],
    practice: ['application', 'analysis'],
    assessment: ['analysis', 'evaluation'],
  };
  for (const dim of (bloomMap[taskType] ?? ['knowledge'])) {
    blooms[dim] = Math.min(100, (blooms[dim] ?? 0) + 2);
  }
  const newPct = Math.min(100, (existing?.overall_progress_pct ?? 0) + 1);
  const now = new Date().toISOString();
  if (existing) {
    await db.run(
      `UPDATE student_progress SET blooms_data = ?, overall_progress_pct = ?, updated_at = ? WHERE student_user_id = ? AND class_id = ?`
    , JSON.stringify(blooms), newPct, now, userId, classId);
  } else {
    await db.run(
      `INSERT INTO student_progress (id, student_user_id, class_id, subject_id, blooms_data, overall_progress_pct, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
    , crypto.randomUUID(), userId, classId, subjectId, JSON.stringify(blooms), 1, now);
  }
}

// ── Daily Quest helpers ─────────────────────────────────────────────────────

/** Deterministic daily quest generation — same 3 quests for same user+date */
function generateDailyQuests(userId: string, date: string): Array<{ quest_type: string; target: number; xp_reward: number }> {
  const QUEST_POOL = [
    { quest_type: 'chat_turns', target: 5, xp_reward: 30 },
    { quest_type: 'complete_assignment', target: 1, xp_reward: 75 },
    { quest_type: 'review_card', target: 3, xp_reward: 40 },
    { quest_type: 'streak_protect', target: 1, xp_reward: 20 },
  ];
  // Seed based on userId + date — deterministic selection of 3
  let seed = 0;
  for (const c of userId + date) seed = (seed * 31 + c.charCodeAt(0)) & 0xffffffff;
  const shuffled = [...QUEST_POOL].sort((a, b) => {
    seed = (seed * 1664525 + 1013904223) & 0xffffffff;
    return (seed & 1) ? 1 : -1;
  });
  return shuffled.slice(0, 3);
}

// ── Factory ────────────────────────────────────────────────────────────────

export async function createSchoolRoutes(db: DatabaseAdapter) {
  // Schema evolution moved to `server/db/migrations-pg/204_school_inline_migrations_consolidation.sql`.
  // Previously this file ran ~30 inline try-blocks wrapping db.exec('ALTER…') on every server
  // start — flagged by G.15 as silent catches and obscured the real schema history. Mig 204 owns
  // those changes; this block now only handles non-schema startup tasks.
  (async () => {
    // Load persisted model-tier override (if any). Stays here because it's
    // route-state initialization, not schema evolution.
    try {
      const cfgRow = await db.get("SELECT value FROM school_admin_config WHERE key = 'model_tier'") as { value: string } | undefined;
      if (cfgRow) _ollamaTierEnabled = cfgRow.value === 'C';
    } catch (err) {
      // school_admin_config is created by mig 204; tolerate races on first boot.
      console.warn('[school] model_tier load deferred (mig 204 may not have run yet):', err instanceof Error ? err.message : err);
    }
  })();

  const router = Router();

  // ── POST /api/school/chat ──────────────────────────────────────────────
  router.post('/school/chat', async (req, res) => {
    try {
      if (!isApiKeyConfigured()) {
        return res.status(503).json({ error: 'API key not configured' });
      }

      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorised' });

      const {
        sessionId,
        classId,
        messages = [],
        lessonId,
      } = req.body as Record<string, unknown>;

      let classRow: Record<string, unknown> | null = null;
      if (classId) {
        classRow = await db.get('SELECT * FROM school_classes WHERE id = ?', classId as string) as Record<string, unknown> | null;
      }

      // Query growth profile for stage-adaptive prompting
      const profile = await db.get(
        `SELECT stage, sen_mode, explanation_style, gymnasiet_program, university_program FROM student_growth_profiles WHERE student_user_id = ?`
      , userId) as { stage: string; sen_mode: string | null; explanation_style: string; gymnasiet_program: string | null; university_program: string | null } | undefined;

      // Auto-infer module from last user message if not supplied
      const lastUserMsg = Array.isArray(messages) && messages.length > 0
        ? String((messages[messages.length - 1] as Record<string, unknown>)?.content ?? '')
        : '';
      const subjectForInfer = (classRow?.subject_id as string) || (req.body.subjectId as string) || 'mathematics';
      const resolvedModuleId = (req.body.moduleId as string) || inferSubjectModule(lastUserMsg, subjectForInfer);

      // Load lesson content when lessonId provided — overrides Layer 3 module context
      let lessonContext: string | undefined;
      if (lessonId) {
        const lesson = await db.get('SELECT * FROM teacher_lessons WHERE id = ?', lessonId as string) as Record<string, unknown> | null;
        if (lesson) {
          const objectives: string[] = lesson.learning_objectives ? JSON.parse(lesson.learning_objectives as string) : [];
          const blocks: Array<{ type: string; content: string; durationMins?: number }> = lesson.content_blocks ? JSON.parse(lesson.content_blocks as string) : [];
          lessonContext = `## TEACHER-DESIGNED LESSON: ${lesson.title}\n\n**Learning Objectives:**\n${objectives.length ? objectives.map((o, i) => `${i + 1}. ${o}`).join('\n') : '(none specified)'}\n\n**Lesson Content (deliver in sequence, one block at a time):**\n${blocks.length ? blocks.map((b, i) => `### Block ${i + 1} [${b.type.toUpperCase()}]${b.durationMins ? ` ~${b.durationMins} min` : ''}\n${b.content}`).join('\n\n') : '(no content blocks defined)'}\n\nDeliver this lesson conversationally. Work through each block with the student, checking understanding before moving to the next. Never skip ahead — let the student guide the pace.`;
        }
      }

      const promptConfig = buildPromptConfig(
        {
          ...req.body as Record<string, unknown>,
          moduleId: resolvedModuleId,
          ...(lessonContext ? { additionalContext: lessonContext } : {}),
        },
        classRow,
        { growthStage: profile?.stage, senMode: profile?.sen_mode, explanationStyle: profile?.explanation_style, gymnasietProgram: profile?.gymnasiet_program ?? undefined, universityProgram: profile?.university_program ?? undefined }
      );

      const systemPrompt = await buildSchoolPrompt(promptConfig);

      const apiMessages = (Array.isArray(messages) ? messages : []).map(
        (m: Record<string, unknown>) => ({
          role: (m.role as 'user' | 'assistant') || 'user',
          content: String(m.content || ''),
        })
      );

      const resolvedClassId = (classId as string) || '';
      const resolvedSubjectId = (classRow?.subject_id as string) || (req.body.subjectId as string) || 'mathematics';
      const resolvedTaskType = (req.body.taskType as string) || 'studying';

      const onComplete = async (data: { text: string; outputTokens: number }) => {
        try {
          if (sessionId) {
            await db.run(
              `INSERT INTO messages (id, session_id, role, content, token_count, created_at)
               VALUES (?, ?, 'assistant', ?, ?, ?)`
            , crypto.randomUUID(), sessionId as string, data.text, data.outputTokens, new Date().toISOString());
            await db.run('UPDATE sessions SET updated_at = ? WHERE id = ? AND user_id = ?',
              new Date().toISOString(), sessionId as string, userId);
          }
          await updateGrowthProfile(db, userId);
          if (resolvedClassId) await updateStudentProgress(db, userId, resolvedClassId, resolvedSubjectId, resolvedTaskType);
          // Daily quest: chat_turns
          try {
            const today = new Date().toISOString().split('T')[0];
            const chatQuest = await db.get(`SELECT id FROM student_daily_quests WHERE student_user_id = ? AND quest_date = ? AND quest_type = 'chat_turns' AND completed = 0`, userId, today) as { id: string } | undefined;
            if (chatQuest) {
              await db.run(`UPDATE student_daily_quests SET progress = MIN(target, progress + 1), completed = CASE WHEN progress + 1 >= target THEN 1 ELSE 0 END WHERE id = ?`, chatQuest.id);
            }
          } catch {}
        } catch (e) {
          console.warn('[school/chat] onComplete error (non-fatal):', e);
        }
      };

      // Tier C: try Ollama first; fall back to Claude on failure
      if (isOllamaTierEnabled()) {
        const ollamaOk = await streamOllamaToResponse(systemPrompt, apiMessages, res, onComplete);
        if (ollamaOk) return;
        // Fall-through: Ollama unreachable — continue to Claude
        console.warn('[school/chat] Ollama unreachable — falling back to Claude Sonnet');
      }

      await streamToResponse(
        { model: 'claude-sonnet-4-6', thinking: 'think', system: systemPrompt, messages: apiMessages, maxTokens: 4096 },
        res,
        onComplete
      );
    } catch (err) {
      console.error('[school/chat]', err);
      if (!res.headersSent) res.status(500).json({ error: safeError(err) });
    }
  });

  // ── POST /api/school/laxhjalp ──────────────────────────────────────────
  router.post('/school/laxhjalp', async (req, res) => {
    try {
      if (!isApiKeyConfigured()) {
        return res.status(503).json({ error: 'API key not configured' });
      }

      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorised' });

      const { sessionId, classId, stuckPoint, priorMessages = [], moduleId, topic } = req.body as Record<string, unknown>;

      let classRow: Record<string, unknown> | null = null;
      if (classId) {
        classRow = await db.get('SELECT * FROM school_classes WHERE id = ?', classId as string) as Record<string, unknown> | null;
      }

      const subjectForLax = (classRow?.subject_id as string) || (req.body.subjectId as string) || 'mathematics';
      const resolvedModuleId = (moduleId as string) || inferSubjectModule(String(stuckPoint || ''), subjectForLax);

      const promptConfig = buildPromptConfig(
        {
          moduleId: resolvedModuleId, topic,
          assistanceLevel: 'L1', taskType: 'homework',
          additionalContext: `## LÄXHJÄLP SESSION\nThe student is stuck at this specific point:\n\n"${stuckPoint}"\n\nUse the Läxhjälp Protocol: identify the precise barrier → trace back to firm ground → bridge the gap → practice → return to original problem → verify.`,
        },
        classRow
      );

      const systemPrompt = await buildSchoolPrompt(promptConfig);

      const messages = [
        ...(Array.isArray(priorMessages) ? priorMessages : []).map(
          (m: Record<string, unknown>) => ({ role: (m.role as 'user' | 'assistant') || 'user', content: String(m.content || '') })
        ),
        { role: 'user' as const, content: `Jag fastnade här: ${stuckPoint || 'jag förstår inte hur jag ska gå vidare'}` },
      ];

      // Create Läxhjälp session record
      let laxhjalpId: string | null = null;
      if (sessionId) {
        try {
          laxhjalpId = crypto.randomUUID();
          await db.run(
            `INSERT INTO laxhjalp_sessions (id, student_user_id, class_id, subject_id, topic, stuck_point, module_id, session_id, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ,
            laxhjalpId, userId,
            (classId as string) || null,
            (classRow?.subject_id as string) || 'mathematics',
            (topic as string) || resolvedModuleId,
            String(stuckPoint || ''),
            resolvedModuleId,
            sessionId as string,
            new Date().toISOString()
          );
        } catch (e) {
          console.warn('[school/laxhjalp] session insert error (non-fatal):', e);
          laxhjalpId = null;
        }
      }

      const onComplete = laxhjalpId
        ? async (data: { text: string; outputTokens: number }) => {
            try {
              await db.run('UPDATE laxhjalp_sessions SET resolved = 1, status = ?, updated_at = ? WHERE id = ?',
                'resolved', new Date().toISOString(), laxhjalpId);
              if (sessionId) {
                await db.run(
                  `INSERT INTO messages (id, session_id, role, content, token_count, created_at)
                   VALUES (?, ?, 'assistant', ?, ?, ?)`
                , crypto.randomUUID(), sessionId as string, data.text, data.outputTokens, new Date().toISOString());
              }
            } catch (e) {
              console.warn('[school/laxhjalp] onComplete error (non-fatal):', e);
            }
          }
        : undefined;

      await streamToResponse(
        { model: 'claude-sonnet-4-6', thinking: 'think_hard', system: systemPrompt, messages, maxTokens: 6144 },
        res,
        onComplete as Parameters<typeof streamToResponse>[2]
      );
    } catch (err) {
      console.error('[school/laxhjalp]', err);
      if (!res.headersSent) res.status(500).json({ error: safeError(err) });
    }
  });

  // ── POST /api/school/socratic-chat ────────────────────────────────────
  router.post('/school/socratic-chat', async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorised' });
      if (!isApiKeyConfigured()) return res.status(503).json({ error: 'API key not configured' });

      const { assignmentId, messages = [], subjectId = 'mathematics' } = req.body as {
        assignmentId?: string;
        messages: { role: 'user' | 'assistant'; content: string }[];
        subjectId?: string;
      };

      // Load objectives from assignment instructions
      let objectivesText = '';
      if (assignmentId) {
        try {
          const assignment = await db.get('SELECT title, instructions FROM teacher_assignments WHERE id = ?', assignmentId) as { title: string; instructions: string } | null;
          if (assignment) {
            objectivesText = `\nExamination: "${assignment.title}"\nLearning objectives to assess:\n${assignment.instructions}`;
          }
        } catch { /* non-fatal */ }
      }

      const systemPrompt = `You are an AI examiner conducting an oral-style examination in ${subjectId}. Your role is to assess the student's understanding through dialogue — not to teach.
${objectivesText}

EXAMINATION RULES:
1. Ask ONE clear, focused question at a time
2. Listen carefully and ask follow-up questions to probe reasoning and depth
3. NEVER confirm correctness or give away answers during the examination
4. Cover all the stated objectives through your questions
5. If the student is stuck, you may rephrase a question — but never explain
6. Maintain a calm, professional, encouraging tone
7. When you have sufficiently assessed all objectives, signal that the examination is complete

Begin by briefly introducing yourself and asking your first question.`;

      await streamToResponse(
        { model: 'claude-sonnet-4-6', thinking: 'quick', messages, system: systemPrompt, maxTokens: 800 },
        res
      );
    } catch (err) {
      console.error('[school/socratic-chat]', err);
      if (!res.headersSent) res.status(500).json({ error: safeError(err) });
    }
  });

  // ── POST /api/school/assignments/:id/socratic-evaluate ────────────────
  router.post('/school/assignments/:id/socratic-evaluate', async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorised' });
      if (!isApiKeyConfigured()) return res.status(503).json({ error: 'API key not configured' });

      const { conversation = [] } = req.body as {
        conversation: { role: string; content: string }[];
      };

      const assignment = await db.get('SELECT title, instructions FROM teacher_assignments WHERE id = ?', req.params.id) as { title: string; instructions: string } | null;

      const objectives = assignment?.instructions ?? 'General subject knowledge and reasoning';
      const title = assignment?.title ?? 'Oral Examination';

      const evaluationPrompt = `Review this oral examination conversation and provide a structured evaluation.

Examination: "${title}"
Learning Objectives:
${objectives}

Conversation transcript:
${conversation.map(m => `${m.role === 'user' ? 'Student' : 'Examiner'}: ${m.content}`).join('\n\n')}

Provide a structured evaluation with these exact sections:

## Overall Assessment
[2–3 sentences summarising the student's performance]

## Score
[Single integer 0–100]

## Objectives Coverage
[For each objective listed: ✓ Met / ~ Partially Met / ✗ Not Met with brief justification]

## Strengths
- [bullet point 1]
- [bullet point 2]
- [bullet point 3]

## Areas for Improvement
- [bullet point 1]
- [bullet point 2]
- [bullet point 3]

## Suggested Grade
[A / B / C / D / E / F — with one sentence of justification]`;

      await streamToResponse(
        { model: 'claude-sonnet-4-6', thinking: 'quick', system: '', messages: [{ role: 'user', content: evaluationPrompt }], maxTokens: 1500 },
        res
      );
    } catch (err) {
      console.error('[school/socratic-evaluate]', err);
      if (!res.headersSent) res.status(500).json({ error: safeError(err) });
    }
  });

  // ── GET /api/school/dashboard ──────────────────────────────────────────
  router.get('/school/dashboard', async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorised' });

      const schoolRole = req.user?.school_role;

      if (schoolRole === 'teacher' || schoolRole === 'school_admin') {
        const classes = await db.all(
          `SELECT sc.*, (SELECT COUNT(*) FROM class_enrollments ce WHERE ce.class_id = sc.id) AS student_count
           FROM school_classes sc WHERE sc.teacher_user_id = ? ORDER BY sc.created_at DESC`
        , userId) as Record<string, unknown>[];
        return res.json({ role: 'teacher', classes });
      }

      // Student view
      const classes = await db.all(
        `SELECT sc.*, ce.enrolled_at,
           (SELECT sp.current_block FROM student_progress sp
            WHERE sp.student_user_id = ? AND sp.class_id = sc.id LIMIT 1) AS last_topic,
           (SELECT sp.overall_progress_pct FROM student_progress sp
            WHERE sp.student_user_id = ? AND sp.class_id = sc.id LIMIT 1) AS completion_pct
         FROM class_enrollments ce
         JOIN school_classes sc ON sc.id = ce.class_id
         WHERE ce.student_user_id = ?
         ORDER BY ce.enrolled_at DESC`
      , userId, userId, userId) as Record<string, unknown>[];

      const assignments = await db.all(
        `SELECT ta.id, ta.title, ta.due_date, sc.name AS class_name
         FROM teacher_assignments ta
         JOIN school_classes sc ON sc.id = ta.class_id
         JOIN class_enrollments ce ON ce.class_id = ta.class_id
         WHERE ce.student_user_id = ? AND (ta.due_date IS NULL OR ta.due_date >= CURRENT_DATE)
         ORDER BY ta.due_date ASC
         LIMIT 5`
      , userId) as Record<string, unknown>[];

      // Growth profile — created on first interaction if missing
      const growthProfile = await db.get(
        `SELECT stage, session_count, total_xp, xp_level, current_streak, longest_streak, streak_shields
         FROM student_growth_profiles WHERE student_user_id = ?`
      , userId) as {
        stage: string; session_count: number;
        total_xp: number; xp_level: number; current_streak: number; longest_streak: number;
        streak_shields: number;
      } | undefined;

      const sessionsThisWeek = await db.get(
        `SELECT COUNT(*) AS cnt FROM laxhjalp_sessions
         WHERE student_user_id = ? AND created_at >= DATE('now', '-7 days')`
      , userId) as { cnt: number } | undefined;

      const xpTotal = growthProfile?.total_xp ?? 0;
      const xpLevel = growthProfile?.xp_level ?? 1;
      const nextLevelAt = xpLevel < XP_THRESHOLDS.length ? XP_THRESHOLDS[xpLevel] : null;

      res.json({
        role: 'student',
        classes,
        assignments,
        growthProfile: growthProfile ?? { stage: 'S1', session_count: 0 },
        xp: {
          total: xpTotal,
          level: xpLevel,
          nextLevelAt,
          currentStreak: growthProfile?.current_streak ?? 0,
          longestStreak: growthProfile?.longest_streak ?? 0,
          streakShields: growthProfile?.streak_shields ?? 2,
        },
        stats: {
          assignmentsDue: assignments.length,
          sessionsThisWeek: sessionsThisWeek?.cnt ?? 0,
        },
      });
    } catch (err) {
      console.error('[school/dashboard]', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── GET /api/school/achievements ───────────────────────────────────────
  router.get('/school/achievements', async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorised' });

      const earned = await db.all(
        'SELECT achievement_id, earned_at FROM student_achievements WHERE student_user_id = ? ORDER BY earned_at ASC'
      , userId) as { achievement_id: string; earned_at: string }[];

      res.json({ achievements: ACHIEVEMENT_DEFS, earned });
    } catch (err) {
      console.error('[school/achievements]', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── GET /api/school/classes ────────────────────────────────────────────
  router.get('/school/classes', async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorised' });

      const classes = await db.all(
        `SELECT sc.*,
           (SELECT COUNT(*) FROM class_enrollments ce WHERE ce.class_id = sc.id) AS student_count
         FROM school_classes sc
         WHERE sc.teacher_user_id = ?
         ORDER BY sc.created_at DESC`
      , userId) as Record<string, unknown>[];

      res.json(classes);
    } catch (err) {
      console.error('[school/classes GET]', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── POST /api/school/classes ───────────────────────────────────────────
  router.post('/school/classes', async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorised' });

      const {
        name, subject = 'mathematics', educationTier = 'T2',
        curriculumId = 'lgr22', defaultAssistanceLevel = 'L2',
        webSearchEnabled = true,
      } = req.body as Record<string, unknown>;

      if (!name) return res.status(400).json({ error: 'Class name is required' });

      const id = crypto.randomUUID();
      const classCode = generateClassCode();
      const now = new Date().toISOString();

      await db.run(
        `INSERT INTO school_classes
           (id, teacher_user_id, name, subject_id, education_tier, curriculum_id,
            default_assistance_level, web_search_enabled, class_code, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      , id, userId, name as string, subject as string, educationTier as string,
        curriculumId as string, defaultAssistanceLevel as string,
        webSearchEnabled ? 1 : 0, classCode, now, now);

      res.status(201).json({ id, classCode, name, subject, educationTier });
    } catch (err) {
      console.error('[school/classes POST]', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── GET /api/school/classes/:id ────────────────────────────────────────
  router.get('/school/classes/:id', async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorised' });

      const classRow = await db.get('SELECT * FROM school_classes WHERE id = ?', req.params.id) as Record<string, unknown> | null;
      if (!classRow) return res.status(404).json({ error: 'Class not found' });

      const isTeacher = classRow.teacher_user_id === userId;
      if (!isTeacher) {
        const enrolled = await db.get('SELECT 1 FROM class_enrollments WHERE class_id = ? AND student_user_id = ?', req.params.id, userId);
        if (!enrolled) return res.status(403).json({ error: 'Access denied' });
      }

      const students = isTeacher
        ? await db.all(
            `SELECT u.id, u.name, u.email, ce.enrolled_at
             FROM class_enrollments ce
             JOIN users u ON u.id = ce.student_user_id
             WHERE ce.class_id = ?`
          , req.params.id)
        : [];

      // Compute class-average Bloom's across all enrolled students' progress rows
      const progressRows = await db.all(
        `SELECT sp.blooms_data FROM student_progress sp
         JOIN class_enrollments ce ON ce.student_user_id = sp.student_user_id
         WHERE ce.class_id = ?`
      , req.params.id) as { blooms_data: string }[];

      const BLOOMS_DIMS = ['knowledge', 'application', 'analysis', 'evaluation', 'creation', 'metacognition'];
      const averageBlooms: Record<string, number> = Object.fromEntries(BLOOMS_DIMS.map(d => [d, 0]));
      if (progressRows.length > 0) {
        for (const row of progressRows) {
          const b = row.blooms_data ? JSON.parse(row.blooms_data) as Record<string, number> : {};
          for (const dim of BLOOMS_DIMS) averageBlooms[dim] += b[dim] ?? 0;
        }
        for (const dim of BLOOMS_DIMS) averageBlooms[dim] = Math.round(averageBlooms[dim] / progressRows.length);
      }

      res.json({ ...classRow, students, averageBlooms });
    } catch (err) {
      console.error('[school/classes/:id GET]', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── PUT /api/school/classes/:id ────────────────────────────────────────
  router.put('/school/classes/:id', async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorised' });

      const exists = await db.get('SELECT 1 FROM school_classes WHERE id = ? AND teacher_user_id = ?', req.params.id, userId);
      if (!exists) return res.status(404).json({ error: 'Class not found or access denied' });

      const { name, subject, educationTier, curriculumId, defaultAssistanceLevel, webSearchEnabled, leaderboardEnabled } = req.body as Record<string, unknown>;

      await db.run(
        `UPDATE school_classes SET
           name = COALESCE(?, name),
           subject_id = COALESCE(?, subject_id),
           education_tier = COALESCE(?, education_tier),
           curriculum_id = COALESCE(?, curriculum_id),
           default_assistance_level = COALESCE(?, default_assistance_level),
           web_search_enabled = COALESCE(?, web_search_enabled),
           leaderboard_enabled = COALESCE(?, leaderboard_enabled),
           updated_at = ?
         WHERE id = ?`
      , 
        name ?? null, subject ?? null, educationTier ?? null,
        curriculumId ?? null, defaultAssistanceLevel ?? null,
        webSearchEnabled !== undefined ? (webSearchEnabled ? 1 : 0) : null,
        leaderboardEnabled !== undefined ? (leaderboardEnabled ? 1 : 0) : null,
        new Date().toISOString(), req.params.id
      );

      res.json(await db.get('SELECT * FROM school_classes WHERE id = ?', req.params.id));
    } catch (err) {
      console.error('[school/classes/:id PUT]', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── GET /api/school/classes/:id/leaderboard ────────────────────────────
  router.get('/school/classes/:id/leaderboard', async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorised' });

      const classRow = await db.get(
        'SELECT leaderboard_enabled FROM school_classes WHERE id = ?'
      , req.params.id) as { leaderboard_enabled: number } | null;

      if (!classRow) return res.status(404).json({ error: 'Class not found' });
      if (!classRow.leaderboard_enabled) return res.json({ enabled: false, entries: [] });

      const rows = await db.all(
        `SELECT u.display_name, u.username, COALESCE(sgp.total_xp, 0) AS total_xp, COALESCE(sgp.xp_level, 1) AS xp_level
         FROM class_enrollments ce
         JOIN users u ON u.id = ce.student_user_id
         LEFT JOIN student_growth_profiles sgp ON sgp.student_user_id = ce.student_user_id
         WHERE ce.class_id = ?
         ORDER BY total_xp DESC
         LIMIT 10`
      , req.params.id) as { display_name: string | null; username: string; total_xp: number; xp_level: number }[];

      // Anonymise: first name + last initial
      const entries = rows.map((e, i) => {
        const name = (e.display_name || e.username || '').trim();
        const parts = name.split(/\s+/);
        const first = parts[0] ?? '?';
        const last = parts.length > 1 ? `${parts[parts.length - 1][0]}.` : '';
        return { rank: i + 1, name: last ? `${first} ${last}` : first, xp: e.total_xp, level: e.xp_level };
      });

      res.json({ enabled: true, entries });
    } catch (err) {
      console.error('[school/classes/:id/leaderboard]', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── POST /api/school/classes/join ──────────────────────────────────────
  router.post('/school/classes/join', async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorised' });

      const { classCode } = req.body as { classCode: string };
      if (!classCode) return res.status(400).json({ error: 'Class code required' });

      const classRow = await db.get('SELECT * FROM school_classes WHERE class_code = ?', classCode.toUpperCase()) as Record<string, unknown> | null;
      if (!classRow) return res.status(404).json({ error: 'Invalid class code' });

      const existing = await db.get('SELECT 1 FROM class_enrollments WHERE class_id = ? AND student_user_id = ?', classRow.id as string, userId);
      if (existing) return res.status(409).json({ error: 'Already enrolled' });

      await db.run(`INSERT INTO class_enrollments (id, class_id, student_user_id, enrolled_at) VALUES (?, ?, ?, ?)`, crypto.randomUUID(), classRow.id as string, userId, new Date().toISOString());

      res.status(201).json({ message: 'Enrolled successfully', class: classRow });
    } catch (err) {
      console.error('[school/classes/join]', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── GET /api/school/assignments ────────────────────────────────────────
  router.get('/school/assignments', async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorised' });

      const schoolRole = req.user?.school_role;
      const classId = req.query.classId as string | undefined;

      if (schoolRole === 'teacher' || schoolRole === 'school_admin') {
        const params: unknown[] = [userId];
        if (classId) params.push(classId);

        const assignments = await db.all(
          `SELECT ta.*, sc.name AS class_name
           FROM teacher_assignments ta
           JOIN school_classes sc ON sc.id = ta.class_id
           WHERE sc.teacher_user_id = ?${classId ? ' AND ta.class_id = ?' : ''}
           ORDER BY ta.due_date ASC`
        , ...params) as Record<string, unknown>[];

        return res.json(assignments.map(a => ({
          ...a,
          questions: a.questions ? JSON.parse(a.questions as string) : [],
        })));
      }

      // Student
      const params: unknown[] = [userId, userId];
      if (classId) params.push(classId);
      const assignments = await db.all(
        `SELECT ta.*, sc.name AS class_name,
           asub.id AS submission_id, asub.submitted_at, asub.teacher_grade
         FROM teacher_assignments ta
         JOIN school_classes sc ON sc.id = ta.class_id
         JOIN class_enrollments ce ON ce.class_id = ta.class_id AND ce.student_user_id = ?
         LEFT JOIN assignment_submissions asub ON asub.assignment_id = ta.id AND asub.student_user_id = ?
         ${classId ? 'WHERE ta.class_id = ?' : ''}
         ORDER BY ta.due_date ASC`
      , ...params) as Record<string, unknown>[];

      res.json(assignments.map(a => ({
        ...a,
        questions: a.questions ? JSON.parse(a.questions as string) : [],
      })));
    } catch (err) {
      console.error('[school/assignments GET]', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── POST /api/school/assignments ──────────────────────────────────────
  router.post('/school/assignments', async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorised' });

      const {
        classId, title, description = '', questions = [],
        dueDate, totalMarks = 0, assistanceLevelOverride,
        assignmentType = 'homework', subjectId, isTemplate = false,
      } = req.body as Record<string, unknown>;

      if (!classId || !title) return res.status(400).json({ error: 'classId and title required' });

      const classRow = await db.get('SELECT * FROM school_classes WHERE id = ? AND teacher_user_id = ?', classId as string, userId) as Record<string, unknown> | null;
      if (!classRow) return res.status(403).json({ error: 'Class not found or access denied' });

      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const resolvedSubjectId = (subjectId as string) || (classRow.subject_id as string) || 'mathematics';

      await db.run(
        `INSERT INTO teacher_assignments
           (id, teacher_user_id, class_id, title, description, assignment_type, subject_id,
            questions, total_marks, assistance_level_override, due_date, content, is_template, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      , 
        id, userId, classId as string, title as string, description as string,
        assignmentType as string, resolvedSubjectId,
        JSON.stringify(questions), totalMarks as number,
        (assistanceLevelOverride as string) || null,
        (dueDate as string) || null,
        '{}', isTemplate ? 1 : 0, now, now
      );

      res.status(201).json({ id, classId, title });
    } catch (err) {
      console.error('[school/assignments POST]', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── GET /api/school/assignments/templates ─────────────────────────────
  router.get('/school/assignments/templates', async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorised' });

      const templates = await db.all(
        `SELECT ta.*, sc.name AS class_name
         FROM teacher_assignments ta
         JOIN school_classes sc ON sc.id = ta.class_id
         WHERE ta.teacher_user_id = ? AND ta.is_template = 1
         ORDER BY ta.created_at DESC`
      , userId) as Record<string, unknown>[];

      res.json(templates.map(a => ({
        ...a,
        questions: a.questions ? JSON.parse(a.questions as string) : [],
      })));
    } catch (err) {
      console.error('[school/assignments/templates]', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── POST /api/school/assignments/:id/duplicate ─────────────────────────
  router.post('/school/assignments/:id/duplicate', async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorised' });

      const original = await db.get(
        `SELECT ta.* FROM teacher_assignments ta
         JOIN school_classes sc ON sc.id = ta.class_id
         WHERE ta.id = ? AND sc.teacher_user_id = ?`
      , req.params.id, userId) as Record<string, unknown> | null;

      if (!original) return res.status(404).json({ error: 'Assignment not found or access denied' });

      const newId = crypto.randomUUID();
      const now = new Date().toISOString();
      const newTitle = `${original.title} (copy)`;

      await db.run(
        `INSERT INTO teacher_assignments
           (id, teacher_user_id, class_id, title, description, assignment_type, subject_id,
            questions, total_marks, assistance_level_override, due_date, content, is_template, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
      ,
        newId, userId,
        original.class_id as string,
        newTitle,
        (original.description as string) || '',
        (original.assignment_type as string) || 'homework',
        (original.subject_id as string) || 'mathematics',
        (original.questions as string) || '[]',
        (original.total_marks as number) || 0,
        (original.assistance_level_override as string) || null,
        null,
        (original.content as string) || '{}',
        now, now
      );

      res.status(201).json({ id: newId, title: newTitle });
    } catch (err) {
      console.error('[school/assignments/:id/duplicate]', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── GET /api/school/assignments/:id ───────────────────────────────────
  router.get('/school/assignments/:id', async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorised' });

      const assignment = await db.get(
        `SELECT ta.*, sc.name AS class_name, sc.teacher_user_id, sc.subject_id, sc.education_tier
         FROM teacher_assignments ta
         JOIN school_classes sc ON sc.id = ta.class_id
         WHERE ta.id = ?`
      , req.params.id) as Record<string, unknown> | null;
      if (!assignment) return res.status(404).json({ error: 'Assignment not found' });

      if (assignment.teacher_user_id !== userId) {
        const enrolled = await db.get('SELECT 1 FROM class_enrollments WHERE class_id = ? AND student_user_id = ?', assignment.class_id as string, userId);
        if (!enrolled) return res.status(403).json({ error: 'Access denied' });
      }

      res.json({
        ...assignment,
        questions: assignment.questions ? JSON.parse(assignment.questions as string) : [],
      });
    } catch (err) {
      console.error('[school/assignments/:id GET]', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── POST /api/school/assignments/:id/export-anton ─────────────────────
  router.post('/school/assignments/:id/export-anton', async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorised' });

      const assignment = await db.get(
        `SELECT ta.*, sc.name AS class_name, sc.subject_id, sc.education_tier, sc.curriculum_id, sc.default_assistance_level
         FROM teacher_assignments ta JOIN school_classes sc ON sc.id = ta.class_id
         WHERE ta.id = ? AND sc.teacher_user_id = ?`
      , req.params.id, userId) as Record<string, unknown> | null;
      if (!assignment) return res.status(404).json({ error: 'Assignment not found or access denied' });

      const bundle = {
        type: 'assignment',
        version: '1.0',
        exportedAt: new Date().toISOString(),
        exportedBy: userId,
        assignment: {
          id: assignment.id, title: assignment.title, description: assignment.description,
          questions: assignment.questions ? JSON.parse(assignment.questions as string) : [],
          dueDate: assignment.due_date, totalMarks: assignment.total_marks,
          assistanceLevelOverride: assignment.assistance_level_override,
        },
        classConfig: {
          classId: assignment.class_id, className: assignment.class_name,
          subject: assignment.subject_id, educationTier: assignment.education_tier,
          curriculumId: assignment.curriculum_id,
          defaultAssistanceLevel: assignment.default_assistance_level,
        },
      };

      const filename = `assignment-${(assignment.title as string).replace(/\s+/g, '-').toLowerCase()}.anton`;
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Type', 'application/json');
      res.json(bundle);
    } catch (err) {
      console.error('[school/assignments/:id/export-anton]', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── POST /api/school/assignments/import ───────────────────────────────
  router.post('/school/assignments/import', async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorised' });

      const bundle = req.body as { type: string; assignment?: Record<string, unknown>; classConfig?: Record<string, unknown> };
      if (bundle.type !== 'assignment' || !bundle.assignment) {
        return res.status(400).json({ error: 'Invalid .anton bundle — expected type: assignment' });
      }

      const now = new Date().toISOString();
      const assignmentId = (bundle.assignment.id as string) || crypto.randomUUID();

      const existingA = await db.get('SELECT id FROM teacher_assignments WHERE id = ?', assignmentId) as { id: string } | null;
      if (!existingA) {
        try {
          await db.run(
            `INSERT INTO teacher_assignments
               (id, teacher_user_id, class_id, title, description, assignment_type, subject_id,
                questions, total_marks, assistance_level_override, due_date, content, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT DO NOTHING`
          ,
            assignmentId, 'imported',
            (bundle.classConfig?.classId as string) || '',
            (bundle.assignment.title as string) || 'Imported Assignment',
            (bundle.assignment.description as string) || '',
            'homework', 'mathematics',
            JSON.stringify(bundle.assignment.questions || []),
            (bundle.assignment.totalMarks as number) || 0,
            (bundle.assignment.assistanceLevelOverride as string) || null,
            (bundle.assignment.dueDate as string) || null,
            '{}', now, now
          );
        } catch (e) {
          console.warn('[school/assignments/import] insert (non-fatal):', e);
        }
      }

      const submissionId = crypto.randomUUID();
      await db.run(
        `INSERT INTO assignment_submissions
           (id, assignment_id, student_user_id, answers, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'draft', ?, ?)
         ON CONFLICT DO NOTHING`
      , submissionId, assignmentId, userId, '{}', now, now);

      res.status(201).json({ submissionId, assignmentId, assignment: bundle.assignment, classConfig: bundle.classConfig });
    } catch (err) {
      console.error('[school/assignments/import]', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── GET /api/school/submissions ────────────────────────────────────────
  router.get('/school/submissions', async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorised' });

      const schoolRole = req.user?.school_role;
      const assignmentId = req.query.assignmentId as string | undefined;

      if (schoolRole === 'teacher' || schoolRole === 'school_admin') {
        const params: unknown[] = [userId];
        if (assignmentId) params.push(assignmentId);
        const submissions = await db.all(
          `SELECT asub.*, ta.title AS assignment_title, u.name AS student_name, u.email AS student_email
           FROM assignment_submissions asub
           JOIN teacher_assignments ta ON ta.id = asub.assignment_id
           JOIN school_classes sc ON sc.id = ta.class_id
           JOIN users u ON u.id = asub.student_user_id
           WHERE sc.teacher_user_id = ?${assignmentId ? ' AND asub.assignment_id = ?' : ''}
           ORDER BY asub.submitted_at DESC`
        , ...params) as Record<string, unknown>[];

        return res.json(submissions.map(s => ({
          ...s,
          answers: s.answers ? JSON.parse(s.answers as string) : {},
          learning_evidence_log: s.learning_evidence_log ? JSON.parse(s.learning_evidence_log as string) : null,
        })));
      }

      // Student
      const params: unknown[] = [userId];
      if (assignmentId) params.push(assignmentId);
      const submissions = await db.all(
        `SELECT asub.*, ta.title AS assignment_title, sc.name AS class_name
         FROM assignment_submissions asub
         JOIN teacher_assignments ta ON ta.id = asub.assignment_id
         JOIN school_classes sc ON sc.id = ta.class_id
         WHERE asub.student_user_id = ?${assignmentId ? ' AND asub.assignment_id = ?' : ''}
         ORDER BY asub.created_at DESC`
      , ...params) as Record<string, unknown>[];

      res.json(submissions.map(s => ({
        ...s,
        answers: s.answers ? JSON.parse(s.answers as string) : {},
      })));
    } catch (err) {
      console.error('[school/submissions GET]', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── GET /api/school/submissions/:id ───────────────────────────────────
  router.get('/school/submissions/:id', async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorised' });

      const submission = await db.get(
        `SELECT asub.*, ta.title AS assignment_title, ta.questions, ta.total_marks,
           sc.name AS class_name, sc.teacher_user_id, u.name AS student_name
         FROM assignment_submissions asub
         JOIN teacher_assignments ta ON ta.id = asub.assignment_id
         JOIN school_classes sc ON sc.id = ta.class_id
         JOIN users u ON u.id = asub.student_user_id
         WHERE asub.id = ?`
      , req.params.id) as Record<string, unknown> | null;
      if (!submission) return res.status(404).json({ error: 'Submission not found' });

      if (submission.student_user_id !== userId && submission.teacher_user_id !== userId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      res.json({
        ...submission,
        questions: submission.questions ? JSON.parse(submission.questions as string) : [],
        answers: submission.answers ? JSON.parse(submission.answers as string) : {},
        learning_evidence_log: submission.learning_evidence_log ? JSON.parse(submission.learning_evidence_log as string) : null,
      });
    } catch (err) {
      console.error('[school/submissions/:id GET]', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── POST /api/school/submissions ──────────────────────────────────────
  router.post('/school/submissions', async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorised' });

      const { assignmentId, answers = {}, learningEvidenceLog, submit = false } = req.body as Record<string, unknown>;
      if (!assignmentId) return res.status(400).json({ error: 'assignmentId required' });

      const now = new Date().toISOString();
      const existing = await db.get('SELECT id FROM assignment_submissions WHERE assignment_id = ? AND student_user_id = ?', assignmentId as string, userId) as { id: string } | null;

      if (existing) {
        await db.run(
          `UPDATE assignment_submissions
           SET answers = ?,
               learning_evidence_log = COALESCE(?, learning_evidence_log),
               status = ?,
               submitted_at = CASE WHEN ? = 1 THEN ? ELSE submitted_at END,
               updated_at = ?
           WHERE id = ?`
        , 
          JSON.stringify(answers),
          learningEvidenceLog ? JSON.stringify(learningEvidenceLog) : null,
          submit ? 'submitted' : 'draft',
          submit ? 1 : 0, now, now, existing.id
        );
        return res.json({ id: existing.id, status: submit ? 'submitted' : 'draft' });
      }

      const id = crypto.randomUUID();
      await db.run(
        `INSERT INTO assignment_submissions
           (id, assignment_id, student_user_id, answers, learning_evidence_log,
            status, submitted_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      , 
        id, assignmentId as string, userId,
        JSON.stringify(answers),
        learningEvidenceLog ? JSON.stringify(learningEvidenceLog) : null,
        submit ? 'submitted' : 'draft',
        submit ? now : null, now, now
      );

      res.status(201).json({ id, status: submit ? 'submitted' : 'draft' });
    } catch (err) {
      console.error('[school/submissions POST]', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── POST /api/school/submissions/:id/grade ────────────────────────────
  router.post('/school/submissions/:id/grade', async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorised' });

      const { grade, feedback } = req.body as { grade?: string; feedback?: string };

      const row = await db.get(
        `SELECT asub.id, sc.teacher_user_id
         FROM assignment_submissions asub
         JOIN teacher_assignments ta ON ta.id = asub.assignment_id
         JOIN school_classes sc ON sc.id = ta.class_id
         WHERE asub.id = ?`
      , req.params.id) as { id: string; teacher_user_id: string } | null;

      if (!row) return res.status(404).json({ error: 'Submission not found' });
      if (row.teacher_user_id !== userId) return res.status(403).json({ error: 'Access denied' });

      const now = new Date().toISOString();
      await db.run(
        `UPDATE assignment_submissions
         SET teacher_grade = ?, teacher_feedback = ?, graded_at = ?, updated_at = ?
         WHERE id = ?`
      , grade ?? null, feedback ?? null, now, now, req.params.id);

      res.json({ id: req.params.id, grade, feedback });
    } catch (err) {
      console.error('[school/submissions/:id/grade]', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── POST /api/school/submissions/:id/export-anton ─────────────────────
  router.post('/school/submissions/:id/export-anton', async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorised' });

      const submission = await db.get(
        `SELECT asub.*, ta.title AS assignment_title, ta.questions,
           sc.subject_id, sc.education_tier
         FROM assignment_submissions asub
         JOIN teacher_assignments ta ON ta.id = asub.assignment_id
         JOIN school_classes sc ON sc.id = ta.class_id
         WHERE asub.id = ? AND asub.student_user_id = ?`
      , req.params.id, userId) as Record<string, unknown> | null;
      if (!submission) return res.status(404).json({ error: 'Submission not found or access denied' });

      const bundle = {
        type: 'submission', version: '1.0',
        exportedAt: new Date().toISOString(), exportedBy: userId,
        submission: {
          id: submission.id, assignmentId: submission.assignment_id,
          assignmentTitle: submission.assignment_title, status: submission.status,
          submittedAt: submission.submitted_at,
          answers: submission.answers ? JSON.parse(submission.answers as string) : {},
          learningEvidenceLog: submission.learning_evidence_log ? JSON.parse(submission.learning_evidence_log as string) : null,
          aiGrade: submission.ai_grade ?? null, aiFeedback: submission.ai_feedback ?? null,
        },
        assignmentContext: {
          questions: submission.questions ? JSON.parse(submission.questions as string) : [],
          subject: submission.subject_id, educationTier: submission.education_tier,
        },
      };

      const filename = `submission-${(submission.assignment_title as string).replace(/\s+/g, '-').toLowerCase()}.anton`;
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Type', 'application/json');
      res.json(bundle);
    } catch (err) {
      console.error('[school/submissions/:id/export-anton]', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── POST /api/school/submissions/:id/ai-grade ─────────────────────────
  router.post('/school/submissions/:id/ai-grade', async (req, res) => {
    try {
      if (!isApiKeyConfigured()) return res.status(503).json({ error: 'API key not configured' });

      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorised' });

      const submission = await db.get(
        `SELECT asub.*, ta.title AS assignment_title, ta.questions, ta.total_marks,
           sc.subject_id, sc.education_tier, sc.teacher_user_id
         FROM assignment_submissions asub
         JOIN teacher_assignments ta ON ta.id = asub.assignment_id
         JOIN school_classes sc ON sc.id = ta.class_id
         WHERE asub.id = ?`
      , req.params.id) as Record<string, unknown> | null;

      if (!submission) return res.status(404).json({ error: 'Submission not found' });
      if (submission.teacher_user_id !== userId) return res.status(403).json({ error: 'Access denied' });

      const questions: Record<string, unknown>[] = submission.questions ? JSON.parse(submission.questions as string) : [];
      const answers: Record<string, unknown> = submission.answers ? JSON.parse(submission.answers as string) : {};

      const gradingPrompt = `You are an expert mathematics teacher grading a student's assignment.

## Assignment: ${submission.assignment_title}
## Total marks: ${submission.total_marks}
## Education tier: ${submission.education_tier}

## Questions and Student Answers:
${questions.map((q, i) =>
  `**Q${i + 1} (${q.marks} marks):** ${q.text}\nStudent answer: ${answers[String(q.id)] || '(no answer)'}`
).join('\n\n')}

Provide:
1. Per-question grade (marks awarded / total) with reasoning
2. Overall grade: X / ${submission.total_marks}
3. Strengths: what the student understood well
4. Areas to improve: specific gaps or misconceptions
5. Encouraging feedback appropriate for ${submission.education_tier}

Format with clear markdown headers.`;

      const onComplete = async (data: { text: string }) => {
        try {
          await db.run('UPDATE assignment_submissions SET ai_feedback = ?, updated_at = ? WHERE id = ?',
            data.text, new Date().toISOString(), req.params.id);
        } catch (e) {
          console.warn('[school/ai-grade] update error (non-fatal):', e);
        }
      };

      await streamToResponse(
        {
          model: 'claude-sonnet-4-6', thinking: 'think',
          system: 'You are an expert, encouraging mathematics teacher. Grade this assignment fairly and provide constructive feedback.',
          messages: [{ role: 'user', content: gradingPrompt }],
          maxTokens: 3000,
        },
        res,
        onComplete as Parameters<typeof streamToResponse>[2]
      );
    } catch (err) {
      console.error('[school/submissions/:id/ai-grade]', err);
      if (!res.headersSent) res.status(500).json({ error: safeError(err) });
    }
  });

  // ── GET /api/school/guardian/children ─────────────────────────────────
  router.get('/school/guardian/children', async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorised' });

      const children = await db.all(
        `SELECT u.id, u.name, u.email, gsl.created_at AS linked_at
         FROM guardian_student_links gsl
         JOIN users u ON u.id = gsl.student_user_id
         WHERE gsl.guardian_user_id = ?`
      , userId) as Record<string, unknown>[];

      res.json(children);
    } catch (err) {
      console.error('[school/guardian/children]', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── POST /api/school/guardian/link ────────────────────────────────────
  router.post('/school/guardian/link', async (req, res) => {
    try {
      const guardianId = req.user?.id;
      if (!guardianId) return res.status(401).json({ error: 'Unauthorised' });

      const { inviteCode } = req.body as { inviteCode: string };
      if (!inviteCode) return res.status(400).json({ error: 'Invite code required' });

      const student = await db.get('SELECT id, name, email FROM users WHERE guardian_invite_code = ?', inviteCode.toUpperCase()) as { id: string; name: string; email: string } | null;
      if (!student) return res.status(404).json({ error: 'Invalid invite code' });

      const existing = await db.get('SELECT 1 FROM guardian_student_links WHERE guardian_user_id = ? AND student_user_id = ?', guardianId, student.id);
      if (existing) return res.status(409).json({ error: 'Already linked' });

      await db.run(
        `INSERT INTO guardian_student_links (id, guardian_user_id, student_user_id, created_at)
         VALUES (?, ?, ?, ?)`
      , crypto.randomUUID(), guardianId, student.id, new Date().toISOString());

      res.status(201).json({ message: 'Linked successfully', student });
    } catch (err) {
      console.error('[school/guardian/link]', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── GET /api/school/guardian/digest/:studentId ─────────────────────────
  router.get('/school/guardian/digest/:studentId', async (req, res) => {
    const guardianId = req.user?.id;
    if (!guardianId) return res.status(401).json({ error: 'Unauthorised' });

    const studentId = req.params.studentId;

    // Verify guardian link
    const link = await db.get(
      `SELECT * FROM guardian_student_links WHERE guardian_user_id = ? AND student_user_id = ?`
    , guardianId, studentId) as { id: string } | undefined;
    if (!link) return res.status(403).json({ error: 'Not linked to this student' });

    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();

    // Sessions in past 7 days
    const sessions = await db.get(
      `SELECT COUNT(*) as count FROM laxhjalp_sessions WHERE student_user_id = ? AND created_at >= ?`
    , studentId, sevenDaysAgo) as { count: number };

    // Growth profile
    const growth = await db.get(
      `SELECT stage, total_xp, current_streak FROM student_growth_profiles WHERE student_user_id = ?`
    , studentId) as { stage: string; total_xp: number; current_streak: number } | undefined;

    // XP earned in past 7 days
    const xpEarned = await db.get(
      `SELECT COALESCE(SUM(xp_earned), 0) as total FROM student_xp_events WHERE student_user_id = ? AND created_at >= ?`
    , studentId, sevenDaysAgo) as { total: number };

    // Assignments submitted in past 7 days
    const submissions = await db.get(
      `SELECT COUNT(*) as count FROM assignment_submissions WHERE student_user_id = ? AND submitted_at >= ?`
    , studentId, sevenDaysAgo) as { count: number };

    // Student name
    const student = await db.get(`SELECT display_name, username FROM users WHERE id = ?`, studentId) as { display_name: string; username: string } | undefined;

    // Next send time (Monday 08:00)
    const now = new Date();
    const daysUntilMonday = (8 - now.getDay()) % 7 || 7;
    const nextMonday = new Date(now);
    nextMonday.setDate(now.getDate() + daysUntilMonday);
    nextMonday.setHours(8, 0, 0, 0);

    // Last digest
    const lastDigest = await db.get(
      `SELECT sent_at FROM guardian_digest_log WHERE guardian_user_id = ? AND student_user_id = ? ORDER BY sent_at DESC LIMIT 1`
    , guardianId, studentId) as { sent_at: string } | undefined;

    return res.json({
      student: { name: student?.display_name || student?.username || 'Student' },
      period: '7 days',
      sessionsCount: sessions.count,
      xpEarned: xpEarned.total,
      currentStreak: growth?.current_streak ?? 0,
      growthStage: growth?.stage ?? 'S1',
      assignmentsSubmitted: submissions.count,
      lastSentAt: lastDigest?.sent_at ?? null,
      nextSendAt: nextMonday.toISOString(),
    });
  });

  // ── POST /api/school/guardian/digest/:studentId/send-email ─────────────
  router.post('/school/guardian/digest/:studentId/send-email', async (req, res) => {
    const guardianId = req.user?.id;
    if (!guardianId) return res.status(401).json({ error: 'Unauthorised' });

    const studentId = req.params.studentId;
    const link = await db.get(`SELECT * FROM guardian_student_links WHERE guardian_user_id = ? AND student_user_id = ?`, guardianId, studentId);
    if (!link) return res.status(403).json({ error: 'Not linked' });

    // Build digest
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const growth = await db.get(`SELECT stage, total_xp, current_streak FROM student_growth_profiles WHERE student_user_id = ?`, studentId) as { stage: string; total_xp: number; current_streak: number } | undefined;
    const xpEarned = await db.get(`SELECT COALESCE(SUM(xp_earned), 0) as total FROM student_xp_events WHERE student_user_id = ? AND created_at >= ?`, studentId, sevenDaysAgo) as { total: number };
    const student = await db.get(`SELECT display_name, username FROM users WHERE id = ?`, studentId) as { display_name: string; username: string } | undefined;
    const guardian = await db.get(`SELECT email FROM users WHERE id = ?`, guardianId) as { email: string } | undefined;

    const digestData = { student: student?.display_name || student?.username || 'Student', xpEarned: xpEarned.total, stage: growth?.stage, streak: growth?.current_streak, sentAt: new Date().toISOString() };

    const now = new Date().toISOString();
    try {
      await db.run(`INSERT INTO guardian_digest_log (id, guardian_user_id, student_user_id, sent_at, digest_data) VALUES (?, ?, ?, ?, ?)`, crypto.randomUUID(), guardianId, studentId, now, JSON.stringify(digestData));
    } catch {}

    // Log to console (email sending requires Nodemailer setup — log if EMAIL_FROM not configured)
    const emailFrom = process.env.EMAIL_FROM;
    if (emailFrom && guardian?.email) {
      console.log(`[digest] Would send email to ${guardian.email} for student ${digestData.student}`);
    } else {
      console.log(`[digest] Weekly digest generated for ${digestData.student}:`, digestData);
    }

    return res.json({ ok: true, digestData });
  });

  // ── POST /api/school/curricula/upload ─────────────────────────────────
  router.post('/school/curricula/upload', async (req, res) => {
    try {
      if (!isApiKeyConfigured()) return res.status(503).json({ error: 'API key not configured' });

      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorised' });

      const { classId, curriculumText, gradeLevel = 'Year 7-9' } = req.body as Record<string, unknown>;
      if (!classId || !curriculumText) return res.status(400).json({ error: 'classId and curriculumText required' });

      const classRow = await db.get('SELECT 1 FROM school_classes WHERE id = ? AND teacher_user_id = ?', classId as string, userId);
      if (!classRow) return res.status(403).json({ error: 'Class not found or access denied' });

      const studyPlanPrompt = `You are an expert curriculum designer for ${gradeLevel}.

The teacher has uploaded the following curriculum text:

---
${curriculumText}
---

Based on this curriculum, generate a structured study plan with:
1. **Topic areas** — list the main topics to cover
2. **Learning objectives** — 3-5 objectives per topic
3. **Suggested sequence** — order of topics with estimated weeks
4. **Key skills** — what students should master
5. **Assessment suggestions** — types of tasks for each topic

Format as structured markdown with clear headers. Be practical and teacher-friendly.`;

      await streamToResponse(
        {
          model: 'claude-sonnet-4-6', thinking: 'think',
          system: 'You are an expert curriculum designer. Generate a clear, practical study plan from the provided curriculum text.',
          messages: [{ role: 'user', content: studyPlanPrompt }],
          maxTokens: 4096,
        },
        res
      );
    } catch (err) {
      console.error('[school/curricula/upload]', err);
      if (!res.headersSent) res.status(500).json({ error: safeError(err) });
    }
  });

  // ── GET /api/school/personas ───────────────────────────────────────────
  router.get('/school/personas', async (req, res) => {
    try {
      const personas = await db.all('SELECT * FROM teacher_personas ORDER BY name ASC') as Record<string, unknown>[];

      res.json(personas.map(p => ({
        id: p.id, name: p.name, specialisation: p.specialisation,
        teachingStyle: p.teaching_style, personality: p.personality,
        tierAdaptations: p.tier_adaptations ? JSON.parse(p.tier_adaptations as string) : null,
      })));
    } catch (err) {
      console.error('[school/personas]', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── GET /api/school/progress ──────────────────────────────────────────
  router.get('/school/progress', async (req, res) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorised' });
    try {
      const rows = await db.all(
        `SELECT sp.class_id, sc.name as class_name, sp.subject_id, sp.overall_progress_pct, sp.blooms_data
         FROM student_progress sp
         JOIN school_classes sc ON sc.id = sp.class_id
         WHERE sp.student_user_id = ?`
      , userId) as Array<{ class_id: string; class_name: string; subject_id: string; overall_progress_pct: number; blooms_data: string }>;

      res.json(rows.map((r) => ({
        classId: r.class_id, className: r.class_name, subjectId: r.subject_id,
        overallProgressPct: r.overall_progress_pct,
        blooms: r.blooms_data ? JSON.parse(r.blooms_data as string)
          : { knowledge: 0, application: 0, analysis: 0, evaluation: 0, creation: 0, metacognition: 0 },
      })));
    } catch (err) {
      console.error('[school/progress]', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── GET /api/school/settings ───────────────────────────────────────────
  router.get('/school/settings', async (req, res) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorised' });
    try {
      const profile = await db.get(
        `SELECT sen_mode, explanation_style, gymnasiet_program, university_program FROM student_growth_profiles WHERE student_user_id = ?`
      , userId) as { sen_mode: string | null; explanation_style: string; gymnasiet_program: string | null; university_program: string | null } | undefined;
      res.json({
        senMode: profile?.sen_mode ?? null,
        explanationStyle: profile?.explanation_style ?? 'balanced',
        gymnasietProgram: profile?.gymnasiet_program ?? null,
        universityProgram: profile?.university_program ?? null,
      });
    } catch (err) {
      console.error('[school/settings GET]', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── PATCH /api/school/settings ─────────────────────────────────────────
  router.patch('/school/settings', async (req, res) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorised' });
    try {
      const { senMode, explanationStyle, gymnasietProgram, universityProgram } = req.body as { senMode?: string | null; explanationStyle?: string; gymnasietProgram?: string; universityProgram?: string };
      const now = new Date().toISOString();
      const existing = await db.get('SELECT id FROM student_growth_profiles WHERE student_user_id = ?', userId) as { id: string } | undefined;
      if (existing) {
        // Build dynamic update — only update program fields if explicitly provided
        const updates: string[] = ['sen_mode = ?', 'explanation_style = ?', 'updated_at = ?'];
        const params: unknown[] = [senMode ?? null, explanationStyle ?? 'balanced', now];
        if (gymnasietProgram !== undefined) { updates.push('gymnasiet_program = ?'); params.push(gymnasietProgram); }
        if (universityProgram !== undefined) { updates.push('university_program = ?'); params.push(universityProgram); }
        params.push(userId);
        await db.run(`UPDATE student_growth_profiles SET ${updates.join(', ')} WHERE student_user_id = ?`, ...params);
      } else {
        await db.run(
          `INSERT INTO student_growth_profiles (id, student_user_id, stage, session_count, sen_mode, explanation_style, gymnasiet_program, university_program, updated_at) VALUES (?, ?, 'S1', 0, ?, ?, ?, ?, ?)`
        , crypto.randomUUID(), userId, senMode ?? null, explanationStyle ?? 'balanced', gymnasietProgram ?? null, universityProgram ?? null, now);
      }
      res.json({ ok: true });
    } catch (err) {
      console.error('[school/settings PATCH]', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── GET /api/school/admin/model-tier ──────────────────────────────────
  router.get('/school/admin/model-tier', async (req, res) => {
    if (req.user?.school_role !== 'school_admin') return res.status(403).json({ error: 'Forbidden' });
    res.json({
      modelTier: _ollamaTierEnabled ? 'C' : 'A',
      ollamaUrl: OLLAMA_BASE_URL,
      ollamaModel: OLLAMA_MODEL,
    });
  });

  // ── PATCH /api/school/admin/model-tier ─────────────────────────────────
  router.patch('/school/admin/model-tier', async (req, res) => {
    if (req.user?.school_role !== 'school_admin') return res.status(403).json({ error: 'Forbidden' });
    const { modelTier } = req.body as { modelTier?: 'C' | 'A' };
    const tier = modelTier === 'C' ? 'C' : 'A';
    try {
      await db.run(
        `INSERT INTO school_admin_config (key, value) VALUES ('model_tier', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      , tier);
      _ollamaTierEnabled = tier === 'C';
      res.json({ ok: true, modelTier: tier, ollamaUrl: tier === 'C' ? OLLAMA_BASE_URL : null });
    } catch (err) {
      console.error('[school/admin/model-tier PATCH]', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── DELETE /api/school/learning-history ────────────────────────────────
  router.delete('/school/learning-history', async (req, res) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorised' });
    try {
      await db.run(`DELETE FROM messages WHERE session_id IN (SELECT id FROM sessions WHERE user_id = ? AND module_id LIKE 'school%')`, userId);
      await db.run(`DELETE FROM sessions WHERE user_id = ? AND module_id LIKE 'school%'`, userId);
      res.json({ ok: true });
    } catch (err) {
      console.error('[school/learning-history DELETE]', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── GET /api/school/radar ──────────────────────────────────────────────
  const radarCache = new Map<string, { items: unknown[]; expiresAt: number }>();

  router.get('/school/radar', async (req, res) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorised' });
    if (!isApiKeyConfigured()) return res.status(503).json({ error: 'API key not configured' });

    const subjectId = (req.query.subjectId as string) || 'mathematics';
    const personaId = DEFAULT_PERSONA_FOR_SUBJECT[subjectId] ?? 'alma';

    const cached = radarCache.get(subjectId);
    if (cached && cached.expiresAt > Date.now()) return res.json({ items: cached.items, personaId });

    try {
      const result = await callChat({
        model: await getRoutedUtilityModel(db),
        system: 'You are a helpful assistant that generates current real-world events connected to school subjects. Return ONLY valid JSON.',
        messages: [{
          role: 'user',
          content: `Generate exactly 4 current real-world events/stories (sports, gaming, technology, science, culture, world events) that connect to the school subject "${subjectId}" (Swedish Lgr22, Year 7-9).\n\nReturn ONLY valid JSON, no markdown:\n{"items":[{"headline":"short headline max 12 words","category":"Sports|Gaming|Technology|Science|Culture|World","curriculumLink":"one sentence how this connects to ${subjectId}","discussionQuestion":"engaging open question max 20 words","chatPrompt":"I saw that [brief summary]. How does this connect to ${subjectId}?"}]}`,
        }],
        maxTokens: 1024,
      });
      const text = result.text ?? '';
      const match = text.match(/\{[\s\S]*\}/);
      const parsed = match ? JSON.parse(match[0]) : { items: [] };
      const items = Array.isArray(parsed.items) ? parsed.items : [];
      radarCache.set(subjectId, { items, expiresAt: Date.now() + 6 * 60 * 60 * 1000 });
      res.json({ items, personaId });
    } catch (err) {
      console.error('[school/radar]', err);
      if (!res.headersSent) res.status(500).json({ error: safeError(err) });
    }
  });

  // ── POST /api/school/coding-chat ──────────────────────────────────────
  router.post('/school/coding-chat', async (req, res) => {
    try {
      if (!isApiKeyConfigured()) {
        return res.status(503).json({ error: 'API key not configured' });
      }

      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorised' });

      const {
        module: moduleId = 'code-mentor',
        language = 'python',
        messages = [],
        assistanceLevel = 'L2',
        educationTier = 'T2',
      } = req.body as Record<string, unknown>;

      const promptConfig: SchoolPromptConfig = {
        educationTier: (educationTier as SchoolPromptConfig['educationTier']) || 'T2',
        subjectId: 'computational-thinking',
        moduleId: moduleId as string,
        teacherPersonaId: 'alma',
        assistanceLevel: (assistanceLevel as SchoolPromptConfig['assistanceLevel']) || 'L2',
        taskType: 'studying',
        additionalContext: `## Programming Language\nThe student is working in **${language}**. All code examples must use ${language}. Adapt your vocabulary and concepts to ${language} conventions.`,
      };

      const systemPrompt = await buildSchoolPrompt(promptConfig);

      const apiMessages = (Array.isArray(messages) ? messages : []).map(
        (m: Record<string, unknown>) => ({
          role: (m.role as 'user' | 'assistant') || 'user',
          content: String(m.content || ''),
        })
      );

      await streamToResponse(
        {
          model: 'claude-sonnet-4-6',
          thinking: 'think',
          system: systemPrompt,
          messages: apiMessages,
          maxTokens: 4096,
        },
        res
      );
    } catch (err) {
      console.error('[school/coding-chat]', err);
      if (!res.headersSent) res.status(500).json({ error: safeError(err) });
    }
  });

  // ── GET /api/school/lessons ───────────────────────────────────────────
  router.get('/school/lessons', async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorised' });

      const lessons = await db.all(
        'SELECT * FROM teacher_lessons WHERE teacher_user_id = ? ORDER BY created_at DESC'
      , userId) as Record<string, unknown>[];

      res.json(lessons.map(l => ({
        id: l.id,
        title: l.title,
        subjectId: l.subject_id,
        tier: l.tier,
        classId: l.class_id,
        isTemplate: Boolean(l.is_template),
        createdAt: l.created_at,
        updatedAt: l.updated_at,
        learningObjectives: l.learning_objectives ? JSON.parse(l.learning_objectives as string) : [],
        blockCount: l.content_blocks ? (JSON.parse(l.content_blocks as string) as unknown[]).length : 0,
      })));
    } catch (err) {
      console.error('[school/lessons GET]', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── POST /api/school/lessons ──────────────────────────────────────────
  router.post('/school/lessons', async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorised' });

      const {
        title, subjectId = 'mathematics', tier = 'T2',
        learningObjectives = [], contentBlocks = [],
        classId, isTemplate = false,
      } = req.body as Record<string, unknown>;

      if (!title) return res.status(400).json({ error: 'title required' });

      const id = crypto.randomUUID();
      const now = new Date().toISOString();

      await db.run(
        `INSERT INTO teacher_lessons
           (id, teacher_user_id, class_id, title, subject_id, learning_objectives, content_blocks, tier, is_template, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ,
        id, userId,
        (classId as string) || null,
        title as string,
        subjectId as string,
        JSON.stringify(learningObjectives),
        JSON.stringify(contentBlocks),
        tier as string,
        isTemplate ? 1 : 0,
        now, now
      );

      res.status(201).json({ id, title, subjectId, tier });
    } catch (err) {
      console.error('[school/lessons POST]', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── GET /api/school/lessons/:id ───────────────────────────────────────
  router.get('/school/lessons/:id', async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorised' });

      const lesson = await db.get('SELECT * FROM teacher_lessons WHERE id = ? AND teacher_user_id = ?', req.params.id, userId) as Record<string, unknown> | null;
      if (!lesson) return res.status(404).json({ error: 'Lesson not found' });

      res.json({
        id: lesson.id,
        title: lesson.title,
        subjectId: lesson.subject_id,
        tier: lesson.tier,
        classId: lesson.class_id,
        isTemplate: Boolean(lesson.is_template),
        createdAt: lesson.created_at,
        updatedAt: lesson.updated_at,
        learningObjectives: lesson.learning_objectives ? JSON.parse(lesson.learning_objectives as string) : [],
        contentBlocks: lesson.content_blocks ? JSON.parse(lesson.content_blocks as string) : [],
      });
    } catch (err) {
      console.error('[school/lessons/:id GET]', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── PUT /api/school/lessons/:id ───────────────────────────────────────
  router.put('/school/lessons/:id', async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorised' });

      const exists = await db.get('SELECT 1 FROM teacher_lessons WHERE id = ? AND teacher_user_id = ?', req.params.id, userId);
      if (!exists) return res.status(404).json({ error: 'Lesson not found or access denied' });

      const { title, subjectId, tier, learningObjectives, contentBlocks, isTemplate } = req.body as Record<string, unknown>;
      const now = new Date().toISOString();

      await db.run(
        `UPDATE teacher_lessons SET
           title = COALESCE(?, title),
           subject_id = COALESCE(?, subject_id),
           tier = COALESCE(?, tier),
           learning_objectives = COALESCE(?, learning_objectives),
           content_blocks = COALESCE(?, content_blocks),
           is_template = COALESCE(?, is_template),
           updated_at = ?
         WHERE id = ?`
      ,
        title ?? null,
        subjectId ?? null,
        tier ?? null,
        learningObjectives !== undefined ? JSON.stringify(learningObjectives) : null,
        contentBlocks !== undefined ? JSON.stringify(contentBlocks) : null,
        isTemplate !== undefined ? (isTemplate ? 1 : 0) : null,
        now, req.params.id
      );

      const updated = await db.get('SELECT * FROM teacher_lessons WHERE id = ?', req.params.id) as Record<string, unknown>;
      res.json({
        id: updated.id,
        title: updated.title,
        subjectId: updated.subject_id,
        tier: updated.tier,
        learningObjectives: updated.learning_objectives ? JSON.parse(updated.learning_objectives as string) : [],
        contentBlocks: updated.content_blocks ? JSON.parse(updated.content_blocks as string) : [],
      });
    } catch (err) {
      console.error('[school/lessons/:id PUT]', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── POST /api/school/lessons/:id/assign ──────────────────────────────
  router.post('/school/lessons/:id/assign', async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorised' });

      const { classId } = req.body as { classId: string };
      if (!classId) return res.status(400).json({ error: 'classId required' });

      const lesson = await db.get('SELECT 1 FROM teacher_lessons WHERE id = ? AND teacher_user_id = ?', req.params.id, userId);
      if (!lesson) return res.status(404).json({ error: 'Lesson not found or access denied' });

      const classRow = await db.get('SELECT 1 FROM school_classes WHERE id = ? AND teacher_user_id = ?', classId, userId);
      if (!classRow) return res.status(403).json({ error: 'Class not found or access denied' });

      await db.run('UPDATE teacher_lessons SET class_id = ?, updated_at = ? WHERE id = ?', classId, new Date().toISOString(), req.params.id);

      res.json({ ok: true, lessonId: req.params.id, classId });
    } catch (err) {
      console.error('[school/lessons/:id/assign]', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── POST /api/school/upload-doc ────────────────────────────────────────
  const schoolUpload = multer({
    dest: process.env.UPLOAD_DIR || './uploads',
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      if (['.pdf', '.docx', '.txt', '.md'].includes(ext)) cb(null, true);
      else cb(new Error('Unsupported file type'));
    },
  });

  router.post('/school/upload-doc', schoolUpload.single('file'), async (req, res) => {
    if (!req.user?.id) return res.status(401).json({ error: 'Unauthorised' });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    try {
      const text = (await extractTextFromFile(req.file.path)) ?? '';
      const wordCount = text.split(/\s+/).filter(Boolean).length;
      // Clean up temp file
      try { await fs.remove(req.file.path); } catch {}
      return res.json({ text: text.slice(0, 80000), filename: req.file.originalname, wordCount });
    } catch (err) {
      return res.status(500).json({ error: safeError(err) });
    }
  });

  // ── GET /api/school/quests/today ──────────────────────────────────────────
  router.get('/school/quests/today', async (req, res) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorised' });

    const today = new Date().toISOString().split('T')[0];

    // Check if today's quests already exist
    const existing = await db.all(
      `SELECT id, quest_type, target, progress, completed, xp_reward FROM student_daily_quests WHERE student_user_id = ? AND quest_date = ?`
    , userId, today) as Array<{ id: string; quest_type: string; target: number; progress: number; completed: number; xp_reward: number }>;

    if (existing.length >= 3) return res.json({ quests: existing, date: today });

    // Generate quests for today
    const questDefs = generateDailyQuests(userId, today);
    const now = new Date().toISOString();
    const quests = [];
    for (const def of questDefs) {
      const existingQuest = existing.find(e => e.quest_type === def.quest_type);
      if (existingQuest) { quests.push(existingQuest); continue; }
      const id = crypto.randomUUID();
      try {
        await db.run(
          `INSERT INTO student_daily_quests (id, student_user_id, quest_type, quest_date, target, progress, completed, xp_reward, created_at) VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?) ON CONFLICT DO NOTHING`
        , id, userId, def.quest_type, today, def.target, def.xp_reward, now);
      } catch {}
      quests.push({ id, quest_type: def.quest_type, target: def.target, progress: 0, completed: 0, xp_reward: def.xp_reward });
    }

    return res.json({ quests, date: today });
  });

  // ── POST /api/school/quests/:id/progress ──────────────────────────────────
  router.post('/school/quests/:id/progress', async (req, res) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorised' });

    const quest = await db.get(
      `SELECT * FROM student_daily_quests WHERE id = ? AND student_user_id = ?`
    , req.params.id, userId) as { id: string; progress: number; target: number; completed: number; xp_reward: number; quest_date: string } | undefined;

    if (!quest) return res.status(404).json({ error: 'Quest not found' });
    if (quest.completed) return res.json({ quest, alreadyCompleted: true });

    const newProgress = quest.progress + 1;
    const nowComplete = newProgress >= quest.target ? 1 : 0;

    await db.run(
      `UPDATE student_daily_quests SET progress = ?, completed = ? WHERE id = ?`
    , newProgress, nowComplete, quest.id);

    if (nowComplete) {
      await updateGrowthProfile(db, userId, 'quest_complete');
    }

    return res.json({ progress: newProgress, completed: nowComplete === 1, xp_reward: quest.xp_reward });
  });

  // ── GET /api/school/review-cards ──────────────────────────────────────────
  router.get('/school/review-cards', async (req, res) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorised' });
    const today = new Date().toISOString().split('T')[0];
    const cards = await db.all(
      `SELECT * FROM review_cards WHERE student_user_id = ? AND (due_date IS NULL OR due_date <= ?) ORDER BY due_date ASC LIMIT 20`
    , userId, today);
    return res.json({ cards, date: today });
  });

  // ── POST /api/school/review-cards ─────────────────────────────────────────
  router.post('/school/review-cards', async (req, res) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorised' });
    const { subjectId = 'mathematics', front, back, source = 'manual' } = req.body as Record<string, string>;
    if (!front || !back) return res.status(400).json({ error: 'front and back required' });
    const id = crypto.randomUUID();
    const today = new Date().toISOString().split('T')[0];
    await db.run(
      `INSERT INTO review_cards (id, student_user_id, subject_id, front, back, source, due_date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    , id, userId, subjectId, front, back, source, today, new Date().toISOString());
    return res.status(201).json({ id });
  });

  // ── PATCH /api/school/review-cards/:id/review ─────────────────────────────
  router.patch('/school/review-cards/:id/review', async (req, res) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorised' });
    const card = await db.get(`SELECT * FROM review_cards WHERE id = ? AND student_user_id = ?`, req.params.id, userId) as {
      id: string; interval_days: number; ease_factor: number; repetitions: number;
    } | undefined;
    if (!card) return res.status(404).json({ error: 'Card not found' });
    const quality = Number(req.body.quality ?? 3);
    const updated = sm2Update(card.interval_days, card.ease_factor, card.repetitions, quality);
    await db.run(
      `UPDATE review_cards SET interval_days = ?, ease_factor = ?, repetitions = ?, due_date = ? WHERE id = ?`
    , updated.interval, updated.ease, updated.repetitions, updated.dueDate, card.id);
    // Quest progress for review_card
    try {
      const today = new Date().toISOString().split('T')[0];
      const reviewQuest = await db.get(`SELECT id FROM student_daily_quests WHERE student_user_id = ? AND quest_date = ? AND quest_type = 'review_card' AND completed = 0`, userId, today) as { id: string } | undefined;
      if (reviewQuest) {
        await db.run(`UPDATE student_daily_quests SET progress = MIN(target, progress + 1), completed = CASE WHEN progress + 1 >= target THEN 1 ELSE 0 END WHERE id = ?`, reviewQuest.id);
      }
    } catch {}
    return res.json({ ok: true, ...updated });
  });

  // ── DELETE /api/school/review-cards/:id ───────────────────────────────────
  router.delete('/school/review-cards/:id', async (req, res) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorised' });
    await db.run(`DELETE FROM review_cards WHERE id = ? AND student_user_id = ?`, req.params.id, userId);
    return res.json({ ok: true });
  });

  // ── GET /api/school/seasons/active ────────────────────────────────────────
  router.get('/school/seasons/active', async (req, res) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const season = await db.get(
        `SELECT id, name, emoji, start_date, end_date, xp_multiplier, description FROM xp_seasons WHERE active = 1 AND start_date <= ? AND end_date >= ? LIMIT 1`
      , today, today) as Record<string, unknown> | undefined;

      if (!season) return res.json({ season: null });

      const endDate = new Date(season.end_date as string);
      const daysLeft = Math.max(0, Math.ceil((endDate.getTime() - Date.now()) / 86_400_000));
      return res.json({ season: { ...season, daysLeft } });
    } catch (err) {
      console.error('[school/seasons/active]', err);
      return res.status(500).json({ error: 'Internal error' });
    }
  });

  // ── GET /api/school/leaderboard ───────────────────────────────────────────
  // period=all_time|weekly. If class_id provided, scoped to that class.
  router.get('/school/leaderboard', async (req, res) => {
    try {
      const { period = 'weekly', class_id, limit = '10' } = req.query as Record<string, string>;
      const lim = Math.min(parseInt(limit, 10) || 10, 50);

      let entries: Array<{ student_user_id: string; display_name: string; total_xp: number; rank: number }>;

      if (period === 'weekly') {
        // ISO week start = Monday
        const now = new Date();
        const day = now.getDay();
        const diffToMonday = day === 0 ? -6 : 1 - day;
        const monday = new Date(now);
        monday.setDate(now.getDate() + diffToMonday);
        const weekStart = monday.toISOString().split('T')[0];

        if (class_id) {
          entries = await db.all(`
            SELECT w.student_user_id, COALESCE(u.display_name, u.username, 'Student') as display_name,
                   COALESCE(w.week_xp, 0) as total_xp
            FROM student_class_enrollments e
            JOIN weekly_xp_snapshots w ON w.student_user_id = e.student_user_id AND w.week_start = ?
            JOIN users u ON u.id = e.student_user_id
            WHERE e.class_id = ?
            ORDER BY total_xp DESC
            LIMIT ?
          `, weekStart, class_id, lim) as typeof entries;
        } else {
          entries = await db.all(`
            SELECT w.student_user_id, COALESCE(u.display_name, u.username, 'Student') as display_name,
                   COALESCE(w.week_xp, 0) as total_xp
            FROM weekly_xp_snapshots w
            JOIN users u ON u.id = w.student_user_id
            WHERE w.week_start = ?
            ORDER BY total_xp DESC
            LIMIT ?
          `, weekStart, lim) as typeof entries;
        }
      } else {
        // All-time (use student_growth_profiles)
        if (class_id) {
          entries = await db.all(`
            SELECT g.student_user_id, COALESCE(u.display_name, u.username, 'Student') as display_name,
                   COALESCE(g.total_xp, 0) as total_xp
            FROM student_class_enrollments e
            JOIN student_growth_profiles g ON g.student_user_id = e.student_user_id
            JOIN users u ON u.id = e.student_user_id
            WHERE e.class_id = ?
            ORDER BY total_xp DESC
            LIMIT ?
          `, class_id, lim) as typeof entries;
        } else {
          entries = await db.all(`
            SELECT g.student_user_id, COALESCE(u.display_name, u.username, 'Student') as display_name,
                   COALESCE(g.total_xp, 0) as total_xp
            FROM student_growth_profiles g
            JOIN users u ON u.id = g.student_user_id
            ORDER BY total_xp DESC
            LIMIT ?
          `, lim) as typeof entries;
        }
      }

      const ranked = entries.map((e, i) => ({ ...e, rank: i + 1 }));
      return res.json({ period, entries: ranked });
    } catch (err) {
      console.error('[school/leaderboard]', err);
      return res.status(500).json({ error: 'Internal error' });
    }
  });

  // ── GET /api/school/avatar ────────────────────────────────────────────────
  router.get('/school/avatar', async (req, res) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorised' });
    const row = await db.get(`SELECT * FROM student_avatars WHERE student_user_id = ?`, userId) as Record<string, unknown> | undefined;
    if (!row) {
      // Return defaults
      return res.json({ avatarChar: '🦊', colorScheme: 'teal', frame: 'none', title: '', unlockedItems: [] });
    }
    return res.json({
      avatarChar: row.avatar_char,
      colorScheme: row.color_scheme,
      frame: row.frame,
      title: row.title,
      unlockedItems: JSON.parse((row.unlocked_items as string) || '[]'),
    });
  });

  // ── PATCH /api/school/avatar ───────────────────────────────────────────────
  router.patch('/school/avatar', async (req, res) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorised' });
    const { avatarChar, colorScheme, frame, title } = req.body as {
      avatarChar?: string; colorScheme?: string; frame?: string; title?: string;
    };
    const now = new Date().toISOString();
    const existing = await db.get(`SELECT * FROM student_avatars WHERE student_user_id = ?`, userId) as Record<string, unknown> | undefined;
    if (!existing) {
      await db.run(`INSERT INTO student_avatars (student_user_id, avatar_char, color_scheme, frame, title, unlocked_items, updated_at) VALUES (?, ?, ?, ?, ?, '[]', ?)`, 
        userId, avatarChar ?? '🦊', colorScheme ?? 'teal', frame ?? 'none', title ?? '', now
      );
    } else {
      const updates: string[] = [];
      const vals: unknown[] = [];
      if (avatarChar !== undefined) { updates.push('avatar_char = ?'); vals.push(avatarChar); }
      if (colorScheme !== undefined) { updates.push('color_scheme = ?'); vals.push(colorScheme); }
      if (frame !== undefined) { updates.push('frame = ?'); vals.push(frame); }
      if (title !== undefined) { updates.push('title = ?'); vals.push(title); }
      if (updates.length > 0) {
        updates.push('updated_at = ?'); vals.push(now); vals.push(userId);
        await db.run(`UPDATE student_avatars SET ${updates.join(', ')} WHERE student_user_id = ?`, ...vals);
      }
    }
    return res.json({ ok: true });
  });

  // ── POST /api/school/avatar/unlock ────────────────────────────────────────
  router.post('/school/avatar/unlock', async (req, res) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorised' });
    const { item } = req.body as { item: string };
    if (!item) return res.status(400).json({ error: 'item required' });
    const row = await db.get(`SELECT unlocked_items FROM student_avatars WHERE student_user_id = ?`, userId) as { unlocked_items: string } | undefined;
    const current: string[] = row ? JSON.parse(row.unlocked_items || '[]') : [];
    if (!current.includes(item)) current.push(item);
    const now = new Date().toISOString();
    await db.run(`INSERT INTO student_avatars (student_user_id, unlocked_items, updated_at) VALUES (?, ?, ?) ON CONFLICT(student_user_id) DO UPDATE SET unlocked_items = excluded.unlocked_items, updated_at = excluded.updated_at`, userId, JSON.stringify(current), now);
    return res.json({ ok: true, unlockedItems: current });
  });

  // ── GET /api/school/parent/child-summary/:childId ─────────────────────────
  router.get('/school/parent/child-summary/:childId', async (req, res) => {
    const guardianId = req.user?.id;
    if (!guardianId) return res.status(401).json({ error: 'Unauthorised' });
    const childId = req.params.childId;

    // Verify guardian link
    const link = await db.get(`SELECT * FROM guardian_student_links WHERE guardian_user_id = ? AND student_user_id = ?`, guardianId, childId);
    if (!link) return res.status(403).json({ error: 'Not linked' });

    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const today = new Date().toISOString().split('T')[0];

    const growth = await db.get(`SELECT stage, total_xp, current_streak, last_active_date FROM student_growth_profiles WHERE student_user_id = ?`, childId) as { stage: string; total_xp: number; current_streak: number; last_active_date: string } | undefined;
    const student = await db.get(`SELECT display_name, username FROM users WHERE id = ?`, childId) as { display_name: string; username: string } | undefined;

    // Sessions count (use XP events as proxy)
    const sessions = await db.get(`SELECT COUNT(*) as count FROM student_xp_events WHERE student_user_id = ? AND created_at >= ?`, childId, sevenDaysAgo) as { count: number };

    // Review cards due
    let reviewCardsDue = 0;
    try {
      const rc = await db.get(`SELECT COUNT(*) as count FROM review_cards WHERE student_user_id = ? AND due_date <= ?`, childId, today) as { count: number };
      reviewCardsDue = rc.count;
    } catch {}

    // Subjects from progress
    let subjects: string[] = [];
    try {
      const progressRows = await db.all(`SELECT subject_id FROM student_progress WHERE student_user_id = ?`, childId) as { subject_id: string }[];
      subjects = progressRows.map(r => r.subject_id);
    } catch {}

    return res.json({
      name: student?.display_name || student?.username || 'Student',
      sessionsThisWeek: sessions.count,
      totalXp: growth?.total_xp ?? 0,
      currentStreak: growth?.current_streak ?? 0,
      growthStage: growth?.stage ?? 'S1',
      subjects,
      reviewCardsDue,
      lastActive: growth?.last_active_date ?? null,
    });
  });

  // ── PATCH /api/school/classes/:classId/students/:studentId/settings ───────
  router.patch('/school/classes/:classId/students/:studentId/settings', async (req, res) => {
    const teacherId = req.user?.id;
    if (!teacherId) return res.status(401).json({ error: 'Unauthorised' });
    const { teacherLevelOverride, senOverride } = req.body as Record<string, string>;

    // Verify teacher owns this class
    const cls = await db.all(`SELECT id FROM school_classes WHERE id = ? AND teacher_user_id = ?`, req.params.classId, teacherId);
    if (!cls) return res.status(403).json({ error: 'Forbidden' });

    // Columns added by mig 204 (teacher_level_override, sen_override).
    await db.run(`UPDATE student_class_enrollments SET teacher_level_override = ?, sen_override = ? WHERE class_id = ? AND student_user_id = ?`, teacherLevelOverride ?? null, senOverride ?? null, req.params.classId, req.params.studentId);

    return res.json({ ok: true });
  });

  // ── POST /api/school/ucas/draft ──────────────────────────────────────────
  // Generate a UCAS personal statement draft using streaming Claude
  router.post('/school/ucas/draft', async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorised' });

      const {
        courseTitle,
        universities,
        subjectsSummary,
        whyThisSubject,
        workExperience,
        extracurriculars,
        futureGoals,
        draftLength = 'standard',
      } = req.body as Record<string, string>;

      if (!courseTitle || !whyThisSubject) {
        return res.status(400).json({ error: 'courseTitle and whyThisSubject are required' });
      }

      const wordTarget = draftLength === 'short' ? '300-350 words' : draftLength === 'long' ? '550-600 words' : '450-500 words';

      const systemPrompt = `You are an experienced UCAS personal statement advisor who has helped thousands of UK students gain places at competitive universities. You write authentic, compelling personal statements that:
- Open with a strong hook (NOT "From a young age...")
- Demonstrate genuine intellectual passion for the subject
- Show self-awareness and growth
- Highlight specific skills and experiences
- Connect past experiences to future ambitions
- Close with a forward-looking statement
- Stay within the UCAS 4,000 character / 47-line limit

Write in the student's voice — authentic, specific, and confident. Avoid clichés. Every sentence must earn its place.`;

      const userMessage = `Please write a UCAS personal statement draft for this student.

**Course applying for:** ${courseTitle}
${universities ? `**Target universities:** ${universities}` : ''}
**A-Level subjects:** ${subjectsSummary || 'Not specified'}
**Why this subject:** ${whyThisSubject}
${workExperience ? `**Work experience / volunteering:** ${workExperience}` : ''}
${extracurriculars ? `**Extracurricular activities:** ${extracurriculars}` : ''}
${futureGoals ? `**Future goals / career aspirations:** ${futureGoals}` : ''}

Write a complete personal statement draft of ${wordTarget}. After the draft, provide 3 specific improvement suggestions.`;

      const model = 'claude-sonnet-4-5-20250929';

      setSSEHeaders(res);

      const result = await streamChat({
        model: mapModelToProvider(model),
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
        maxTokens: 2048,
      }, res);

      res.write('data: [DONE]\n\n');
      res.end();
    } catch (err) {
      console.error('UCAS draft error:', err);
      if (!res.headersSent) res.status(500).json({ error: 'Failed to generate draft' });
    }
  });

  // ── POST /api/school/export-bundle/:type ──────────────────────────────────
  // Export a school .anton bundle. Supported types: lesson-plan, study-pack, assessment-bank
  router.post('/school/export-bundle/:type', async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorised' });

      const bundleType = req.params.type as 'lesson-plan' | 'study-pack' | 'assessment-bank';
      if (!['lesson-plan', 'study-pack', 'assessment-bank'].includes(bundleType)) {
        return res.status(400).json({ error: `Unsupported bundle type: ${bundleType}` });
      }

      const zip = new AdmZip();
      const now = new Date().toISOString();
      let contentCount = 0;

      if (bundleType === 'lesson-plan') {
        // Export teacher lesson from teacher_lessons table
        const { lessonId } = req.body as { lessonId?: string };
        if (!lessonId) return res.status(400).json({ error: 'lessonId required' });

        const lesson = await db.get('SELECT * FROM teacher_lessons WHERE id = ?', lessonId as string) as Record<string, unknown> | null;
        if (!lesson) return res.status(404).json({ error: 'Lesson not found' });

        // Spec envelope from the unified writer (Wave 2.1) — same shape the
        // school importer reads (format_version, bundle_type, package.name, contents).
        const manifest = buildSpecManifest({
          bundleType: 'lesson-plan',
          id: lessonId,
          name: lesson.title as string,
          author: (lesson.teacher_user_id as string) ?? userId,
          tags: ['school', 'lesson-plan'],
          targetAreas: ['school'],
          contentsCount: { lesson_plans: 1 },
          createdAt: now,
        });
        zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2)));
        zip.addFile('contents/lesson-plans/lesson.json', Buffer.from(JSON.stringify({
          bundle_type: 'lesson-plan',
          lesson: {
            id: lesson.id,
            title: lesson.title,
            subject_id: lesson.subject_id,
            education_tier: lesson.tier,
            learning_objectives: JSON.parse((lesson.learning_objectives as string) || '[]'),
            content_blocks: JSON.parse((lesson.content_blocks as string) || '[]'),
          },
        }, null, 2)));
        contentCount = 1;

      } else if (bundleType === 'study-pack') {
        // Export student's review cards for a subject
        const { subjectId } = req.body as { subjectId?: string };
        const cards = await db.get(
          `SELECT * FROM review_cards WHERE student_user_id = ?${subjectId ? ' AND subject_id = ?' : ''} ORDER BY created_at ASC`
        , ...[userId, ...(subjectId ? [subjectId] : [])]) as Record<string, unknown>[];

        // Spec envelope from the unified writer (Wave 2.1)
        const manifest = buildSpecManifest({
          bundleType: 'study-pack',
          id: `${userId}.${Date.now()}`,
          name: subjectId ? `Study Pack — ${subjectId}` : 'My Study Pack',
          author: userId,
          tags: ['school', 'study-pack', 'review-cards'],
          targetAreas: ['school'],
          contentsCount: { study_packs: 1, review_cards: cards.length },
          createdAt: now,
        });
        zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2)));
        zip.addFile('contents/study-packs/review-cards.json', Buffer.from(JSON.stringify({
          bundle_type: 'study-pack',
          subject_id: subjectId ?? 'mixed',
          cards: cards.map(c => ({ front: c.front, back: c.back, subject_id: c.subject_id, source: c.source })),
        }, null, 2)));
        contentCount = cards.length;

      } else if (bundleType === 'assessment-bank') {
        // Export assessment questions from teacher_lessons content_blocks of type 'quiz'
        const { classId } = req.body as { classId?: string };
        const lessons = await db.all(
          classId
            ? `SELECT * FROM teacher_lessons WHERE teacher_user_id = ? AND class_id = ?`
            : `SELECT * FROM teacher_lessons WHERE teacher_user_id = ?`
        , ...[userId, ...(classId ? [classId] : [])]) as Record<string, unknown>[];

        const questions: unknown[] = [];
        for (const lesson of lessons) {
          const blocks = JSON.parse((lesson.content_blocks as string) || '[]') as Array<{ type: string; questions?: unknown[] }>;
          for (const block of blocks) {
            if (block.type === 'quiz' && Array.isArray(block.questions)) {
              questions.push(...block.questions);
            }
          }
        }

        // Spec envelope from the unified writer (Wave 2.1)
        const manifest = buildSpecManifest({
          bundleType: 'assessment-bank',
          id: `${userId}.${Date.now()}`,
          name: 'Assessment Question Bank',
          author: userId,
          tags: ['school', 'assessment-bank', 'questions'],
          targetAreas: ['school'],
          contentsCount: { assessment_banks: 1, questions: questions.length },
          createdAt: now,
        });
        zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2)));
        zip.addFile('contents/assessment-banks/questions.json', Buffer.from(JSON.stringify({
          bundle_type: 'assessment-bank',
          questions,
        }, null, 2)));
        contentCount = questions.length;
      }

      // F1: self-describing payload checksum (security.checksum +
      // checksum_files) so the dispatching validator can attest the payload.
      attachPayloadChecksum(zip);
      const buf = zip.toBuffer();
      const filename = `${bundleType}-${Date.now()}.anton`;
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('X-Anton-Bundle-Type', bundleType);
      res.setHeader('X-Anton-Item-Count', String(contentCount));
      return res.send(buf);
    } catch (err) {
      console.error('[school/export-bundle]', err);
      return res.status(500).json({ error: 'Export failed' });
    }
  });

  // ── POST /api/school/import-bundle ────────────────────────────────────────
  // Import a .anton education bundle (multipart file upload)
  const antonUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
  router.post('/school/import-bundle', antonUpload.single('bundle'), async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorised' });

      // multer should have handled the file — access via req.file
      const file = (req as unknown as { file?: { buffer: Buffer; originalname: string } }).file;
      if (!file) return res.status(400).json({ error: 'No file uploaded' });

      const zip = new AdmZip(file.buffer);
      const manifestEntry = zip.getEntry('manifest.json');
      if (!manifestEntry) return res.status(400).json({ error: 'Invalid .anton file: missing manifest.json' });

      const manifest = JSON.parse(manifestEntry.getData().toString('utf8')) as {
        format_version: string;
        bundle_type: string;
        package?: { name?: string };
        contents?: Record<string, number>;
      };

      if (!manifest.format_version || !manifest.bundle_type) {
        return res.status(400).json({ error: 'Invalid .anton manifest' });
      }

      const bundleType = manifest.bundle_type;
      const imported: { type: string; count: number; message: string } = { type: bundleType, count: 0, message: '' };

      if (bundleType === 'study-pack') {
        // Import review cards from study pack
        const cardsEntry = zip.getEntry('contents/study-packs/review-cards.json');
        if (!cardsEntry) return res.status(400).json({ error: 'study-pack missing review-cards.json' });

        const packData = JSON.parse(cardsEntry.getData().toString('utf8')) as {
          cards?: Array<{ front: string; back: string; subject_id?: string; source?: string }>;
        };
        const cards = packData.cards ?? [];
        const now = new Date().toISOString();
        const today = now.split('T')[0];

        for (const card of cards) {
          if (!card.front || !card.back) continue;
          await db.run(`INSERT INTO review_cards (id, student_user_id, subject_id, front, back, source, due_date, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT DO NOTHING`
          , crypto.randomUUID(), userId, card.subject_id ?? 'mixed', card.front, card.back, card.source ?? 'imported', today, now);
          imported.count++;
        }
        imported.message = `Imported ${imported.count} review cards`;

      } else if (bundleType === 'lesson-plan') {
        // Lesson plans are read-only reference — just acknowledge receipt
        imported.count = manifest.contents?.['lesson_plans'] ?? 1;
        imported.message = `Lesson plan "${manifest.package?.name ?? 'Unknown'}" received (read-only reference)`;

      } else if (bundleType === 'assessment-bank') {
        // Assessment banks are read-only reference
        imported.count = manifest.contents?.['questions'] ?? 0;
        imported.message = `Assessment bank with ${imported.count} questions received`;

      } else {
        return res.status(400).json({ error: `Unsupported bundle type for school import: ${bundleType}` });
      }

      return res.json({ ok: true, imported });
    } catch (err) {
      console.error('[school/import-bundle]', err);
      return res.status(500).json({ error: 'Import failed' });
    }
  });

  // ── GET /api/school/study-rooms ──────────────────────────────────────────
  router.get('/school/study-rooms', async (req, res) => {
    try {
      const { subject_id, limit = '20' } = req.query as Record<string, string>;
      const now = new Date().toISOString();
      const rooms = await db.all(`SELECT r.id, r.name, r.subject_id, r.max_participants, r.join_code, r.created_at,
                COALESCE(u.display_name, u.username) as host_name
         FROM study_rooms r
         JOIN users u ON u.id = r.host_user_id
         WHERE r.is_public = 1 AND (r.expires_at IS NULL OR r.expires_at > ?)
         ${subject_id ? 'AND r.subject_id = ?' : ''}
         ORDER BY r.created_at DESC
         LIMIT ?`
      , ...[now, ...(subject_id ? [subject_id] : []), parseInt(limit, 10) || 20]) as Record<string, unknown>[];
      return res.json({ rooms });
    } catch (err) {
      console.error('[school/study-rooms GET]', err);
      return res.status(500).json({ error: 'Internal error' });
    }
  });

  // ── POST /api/school/study-rooms ─────────────────────────────────────────
  router.post('/school/study-rooms', async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorised' });
      const { name, subjectId, maxParticipants = 8, isPublic = true, expiresInHours = 4 } = req.body as Record<string, unknown>;
      if (!name) return res.status(400).json({ error: 'name required' });

      const id = crypto.randomUUID();
      const joinCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      const now = new Date().toISOString();
      const expiresAt = new Date(Date.now() + (Number(expiresInHours) * 3_600_000)).toISOString();

      await db.run(`INSERT INTO study_rooms (id, name, subject_id, host_user_id, max_participants, is_public, join_code, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      , id, name, subjectId ?? null, userId, Number(maxParticipants), isPublic ? 1 : 0, joinCode, now, expiresAt);

      return res.status(201).json({ id, joinCode, expiresAt });
    } catch (err) {
      console.error('[school/study-rooms POST]', err);
      return res.status(500).json({ error: 'Internal error' });
    }
  });

  // ── GET /api/school/study-rooms/:id ──────────────────────────────────────
  router.get('/school/study-rooms/:id', async (req, res) => {
    try {
      const room = await db.get(`SELECT r.*, COALESCE(u.display_name, u.username) as host_name
         FROM study_rooms r JOIN users u ON u.id = r.host_user_id
         WHERE r.id = ?`
      , req.params.id) as Record<string, unknown> | undefined;
      if (!room) return res.status(404).json({ error: 'Room not found' });
      return res.json(room);
    } catch (err) {
      console.error('[school/study-rooms GET/:id]', err);
      return res.status(500).json({ error: 'Internal error' });
    }
  });

  // ── POST /api/school/study-rooms/join ────────────────────────────────────
  router.post('/school/study-rooms/join', async (req, res) => {
    try {
      const { joinCode } = req.body as { joinCode?: string };
      if (!joinCode) return res.status(400).json({ error: 'joinCode required' });
      const now = new Date().toISOString();
      const room = await db.get(
        `SELECT id, name, subject_id FROM study_rooms WHERE join_code = ? AND (expires_at IS NULL OR expires_at > ?)`
      , joinCode.toUpperCase(), now) as { id: string; name: string; subject_id: string } | undefined;
      if (!room) return res.status(404).json({ error: 'Room not found or expired' });
      return res.json({ roomId: room.id, name: room.name, subjectId: room.subject_id });
    } catch (err) {
      console.error('[school/study-rooms/join]', err);
      return res.status(500).json({ error: 'Internal error' });
    }
  });

  // ── DELETE /api/school/study-rooms/:id ───────────────────────────────────
  router.delete('/school/study-rooms/:id', async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorised' });
      const room = await db.get(`SELECT host_user_id FROM study_rooms WHERE id = ?`, req.params.id) as { host_user_id: string } | undefined;
      if (!room) return res.status(404).json({ error: 'Not found' });
      if (room.host_user_id !== userId) return res.status(403).json({ error: 'Only the host can delete this room' });
      await db.run(`DELETE FROM study_rooms WHERE id = ?`, req.params.id);
      return res.json({ ok: true });
    } catch (err) {
      console.error('[school/study-rooms DELETE]', err);
      return res.status(500).json({ error: 'Internal error' });
    }
  });

  // ── Lesson/Curriculum endpoints (School Enhancements) ────────────────────

  // GET /api/school/curricula
  router.get('/school/curricula', async (req, res) => {
    try {
      const { subject_id } = req.query;
      let sql = 'SELECT * FROM school_curricula';
      const params: unknown[] = [];
      if (subject_id) { sql += ' WHERE subject_id = ?'; params.push(subject_id); }
      sql += ' ORDER BY created_at DESC';
      res.json(await db.run(sql, ...params));
    } catch (e) { res.status(500).json({ error: safeError(e) }); }
  });

  // POST /api/school/curricula
  router.post('/school/curricula', async (req, res) => {
    try {
      const body = req.body as Record<string, unknown>;
      const id = `cur_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      await db.run(`INSERT INTO school_curricula (id, subject_id, title, description, tier, language, units, created_by) VALUES (?,?,?,?,?,?,?,?)`, 
        id, body.subject_id || '', body.title || 'Untitled Curriculum', body.description || null,
        body.tier || 'T2', body.language || 'en', JSON.stringify(body.units || []), body.created_by || 'teacher'
      );
      res.json({ id, ok: true });
    } catch (e) { res.status(500).json({ error: safeError(e) }); }
  });

  // GET /api/school/lessons
  router.get('/school/lessons', async (req, res) => {
    try {
      const { subject_id, curriculum_id } = req.query;
      let sql = 'SELECT * FROM school_lessons';
      const params: unknown[] = [];
      const conditions: string[] = [];
      if (subject_id) { conditions.push('subject_id = ?'); params.push(subject_id); }
      if (curriculum_id) { conditions.push('curriculum_id = ?'); params.push(curriculum_id); }
      if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
      sql += ' ORDER BY created_at DESC';
      const rows = await db.all(sql, ...params) as Record<string, unknown>[];
      res.json(rows.map(r => ({ ...r, content_blocks: JSON.parse((r.content_blocks as string) || '[]') })));
    } catch (e) { res.status(500).json({ error: safeError(e) }); }
  });

  // GET /api/school/lessons/:id
  router.get('/school/lessons/:id', async (req, res) => {
    try {
      const row = await db.get('SELECT * FROM school_lessons WHERE id = ?', req.params.id) as Record<string, unknown> | undefined;
      if (!row) return res.status(404).json({ error: 'Lesson not found' });
      return res.json({ ...row, content_blocks: JSON.parse((row.content_blocks as string) || '[]') });
    } catch (e) { return res.status(500).json({ error: safeError(e) }); }
  });

  // POST /api/school/lessons
  router.post('/school/lessons', async (req, res) => {
    try {
      const body = req.body as Record<string, unknown>;
      const id = `lesson_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      await db.run(`INSERT INTO school_lessons (id, curriculum_id, subject_id, title, description, content_blocks, estimated_minutes, bloom_level, tier, published, created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)`, 
        id, body.curriculum_id || null, body.subject_id || '',
        body.title || 'Untitled Lesson', body.description || null,
        JSON.stringify(body.content_blocks || []),
        body.estimated_minutes || 30, body.bloom_level || 'understand',
        body.tier || 'T2', body.published ? 1 : 0, body.created_by || 'teacher'
      );
      res.json({ id, ok: true });
    } catch (e) { res.status(500).json({ error: safeError(e) }); }
  });

  // PATCH /api/school/lessons/:id
  router.patch('/school/lessons/:id', async (req, res) => {
    try {
      const body = req.body as Record<string, unknown>;
      const fields: string[] = [];
      const values: unknown[] = [];
      if (body.title !== undefined) { fields.push('title = ?'); values.push(body.title); }
      if (body.description !== undefined) { fields.push('description = ?'); values.push(body.description); }
      if (body.content_blocks !== undefined) { fields.push('content_blocks = ?'); values.push(JSON.stringify(body.content_blocks)); }
      if (body.estimated_minutes !== undefined) { fields.push('estimated_minutes = ?'); values.push(body.estimated_minutes); }
      if (body.bloom_level !== undefined) { fields.push('bloom_level = ?'); values.push(body.bloom_level); }
      if (body.published !== undefined) { fields.push('published = ?'); values.push(body.published ? 1 : 0); }
      if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });
      values.push(req.params.id);
      await db.run(`UPDATE school_lessons SET ${fields.join(', ')} WHERE id = ?`, ...values);
      return res.json({ ok: true });
    } catch (e) { return res.status(500).json({ error: safeError(e) }); }
  });

  // DELETE /api/school/lessons/:id
  router.delete('/school/lessons/:id', async (req, res) => {
    try {
      await db.run('DELETE FROM school_lessons WHERE id = ?', req.params.id);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: safeError(e) }); }
  });

  // POST /api/school/lessons/:id/progress — track student progress through lesson
  router.post('/school/lessons/:id/progress', async (req, res) => {
    try {
      const body = req.body as { student_user_id?: string; completed_block?: string; status?: string; score?: number; time_spent_seconds?: number };
      const studentId = body.student_user_id || 'default';
      const existing = await db.get('SELECT * FROM school_lesson_progress WHERE lesson_id = ? AND student_user_id = ?', req.params.id, studentId) as Record<string, unknown> | undefined;
      const completed = existing ? JSON.parse((existing.completed_blocks as string) || '[]') : [];
      if (body.completed_block && !completed.includes(body.completed_block)) completed.push(body.completed_block);
      const id = existing ? (existing.id as string) : `lp_${Date.now()}`;
      const status = body.status || (existing?.status as string) || 'in_progress';
      await db.run(`INSERT INTO school_lesson_progress (id, lesson_id, student_user_id, status, completed_blocks, score, time_spent_seconds, started_at, completed_at) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, completed_blocks = EXCLUDED.completed_blocks, score = EXCLUDED.score, time_spent_seconds = EXCLUDED.time_spent_seconds, completed_at = EXCLUDED.completed_at`, 
        id, req.params.id, studentId, status, JSON.stringify(completed),
        body.score ?? (existing?.score as number ?? null),
        (body.time_spent_seconds ?? 0) + ((existing?.time_spent_seconds as number) ?? 0),
        existing?.started_at || new Date().toISOString(),
        status === 'completed' ? new Date().toISOString() : (existing?.completed_at || null)
      );
      res.json({ ok: true, completed_blocks: completed, status });
    } catch (e) { res.status(500).json({ error: safeError(e) }); }
  });

  // POST /api/school/lessons/generate — AI generates a lesson
  router.post('/school/lessons/generate', async (req, res) => {
    try {
      if (!isApiKeyConfigured()) return res.status(503).json({ error: 'Anthropic client not available' });
      const { subject_id, topic, tier, learning_objectives } = req.body as { subject_id: string; topic: string; tier?: string; learning_objectives?: string[] };

      setSSEHeaders(res);

      const chatResult = await streamChat({
        model: mapModelToProvider('claude-sonnet-4-6'),
        system: 'You are a helpful lesson generator. Return ONLY valid JSON.',
        messages: [{
          role: 'user',
          content: `Generate a structured lesson on "${topic}" for ${subject_id} (tier: ${tier || 'T2'}).
${learning_objectives?.length ? `Learning objectives: ${learning_objectives.join(', ')}` : ''}

Return a JSON lesson structure with content_blocks array. Each block has type and content:
- type "text": {content: "markdown text"}
- type "exercise": {content: "exercise instructions", solution: "solution hint"}
- type "quiz": {question: "...", options: ["A","B","C","D"], correct: 0, explanation: "..."}
- type "video": {provider: "youtube", search_query: "search terms to find relevant video", title: "suggested title"}
- type "key_concepts": {concepts: [{term: "...", definition: "..."}]}

Return ONLY valid JSON: {"title": "Lesson Title", "description": "Brief description", "estimated_minutes": 30, "bloom_level": "understand|apply|analyze", "content_blocks": [...]}`
        }],
        maxTokens: 2000,
      }, res);

      const fullText = chatResult.text;

      // Try to save the generated lesson
      try {
        const parsed = JSON.parse(fullText.replace(/```json\n?|\n?```/g, '').trim()) as Record<string, unknown>;
        const id = `lesson_${Date.now()}_gen`;
        await db.run(`INSERT INTO school_lessons (id, subject_id, title, description, content_blocks, estimated_minutes, bloom_level, tier) VALUES (?,?,?,?,?,?,?,?)`, 
          id, subject_id, parsed.title || topic, parsed.description || null,
          JSON.stringify(parsed.content_blocks || []),
          parsed.estimated_minutes || 30, parsed.bloom_level || 'understand', tier || 'T2'
        );
        res.write(`data: ${JSON.stringify({ type: 'lesson_id', content: id })}\n\n`);
      } catch {}

      res.write('data: [DONE]\n\n');
      res.end();
    } catch (e) { res.status(500).json({ error: safeError(e) }); }
  });

  // ── Teacher Oversight ─────────────────────────────────────────────────────

  // GET /api/school/oversight/summary
  // Returns aggregate stats for the teacher's classes
  router.get('/school/oversight/summary', async (req, res) => {
    try {
      const teacherId = req.user?.id;
      if (!teacherId) return res.status(401).json({ error: 'Unauthorised' });

      const { range = '7d' } = req.query as { range?: string };
      const dayMap: Record<string, number> = { today: 1, '7d': 7, '30d': 30 };
      const days = dayMap[range] ?? 7;
      const since = new Date(Date.now() - days * 86_400_000).toISOString();

      // Count students in teacher's classes
      const classes = await db.all(
        'SELECT id FROM school_classes WHERE teacher_user_id = ?'
      , teacherId) as { id: string }[];
      const classIds = classes.map(c => c.id);

      let totalStudents = 0;
      let activeToday = 0;
      let totalSessions = 0;

      if (classIds.length > 0) {
        const placeholders = classIds.map(() => '?').join(',');
        const students = await db.all(
          `SELECT DISTINCT student_user_id FROM class_members WHERE class_id IN (${placeholders})`
        , ...classIds) as { student_user_id: string }[];
        totalStudents = students.length;

        const studentIds = students.map(s => s.student_user_id);
        if (studentIds.length > 0) {
          const sPlaceholders = studentIds.map(() => '?').join(',');
          const todaySince = new Date(Date.now() - 86_400_000).toISOString();
          const activeTodayRows = await db.get(
            `SELECT COUNT(DISTINCT user_id) as cnt FROM sessions WHERE user_id IN (${sPlaceholders}) AND created_at > ?`
          , ...studentIds, todaySince) as { cnt: number };
          activeToday = activeTodayRows.cnt ?? 0;

          const sessionRows = await db.get(
            `SELECT COUNT(*) as cnt FROM sessions WHERE user_id IN (${sPlaceholders}) AND created_at > ?`
          , ...studentIds, since) as { cnt: number };
          totalSessions = sessionRows.cnt ?? 0;
        }
      }

      // Flags (oversight_flags table may not exist — handle gracefully)
      let flagCount = 0;
      let unresolvedFlags = 0;
      try {
        const flags = await db.get(
          `SELECT COUNT(*) as total, SUM(CASE WHEN resolved = 0 THEN 1 ELSE 0 END) as unresolved
           FROM oversight_flags WHERE teacher_id = ? AND created_at > ?`
        , teacherId, since) as { total: number; unresolved: number } | undefined;
        flagCount = flags?.total ?? 0;
        unresolvedFlags = flags?.unresolved ?? 0;
      } catch {}

      return res.json({ totalStudents, activeToday, totalSessions, flagCount, unresolvedFlags, range });
    } catch (err) {
      console.error('[school/oversight/summary]', err);
      return res.status(500).json({ error: 'Internal error' });
    }
  });

  // GET /api/school/oversight/students
  // Returns student list with recent activity for teacher's classes
  router.get('/school/oversight/students', async (req, res) => {
    try {
      const teacherId = req.user?.id;
      if (!teacherId) return res.status(401).json({ error: 'Unauthorised' });

      const { class_id, range = '7d' } = req.query as { class_id?: string; range?: string };
      const dayMap: Record<string, number> = { today: 1, '7d': 7, '30d': 30 };
      const days = dayMap[range] ?? 7;
      const since = new Date(Date.now() - days * 86_400_000).toISOString();

      const classes = await db.get(
        `SELECT id FROM school_classes WHERE teacher_user_id = ?`
      , teacherId) as { id: string }[];
      const classIds = class_id
        ? classes.map(c => c.id).filter(id => id === class_id)
        : classes.map(c => c.id);

      if (classIds.length === 0) return res.json([]);

      const placeholders = classIds.map(() => '?').join(',');
      const rows = await db.all(
        `SELECT u.id, COALESCE(u.display_name, u.username) as name,
                COUNT(DISTINCT s.id) as session_count,
                MAX(s.created_at) as last_active
         FROM class_members cm
         JOIN users u ON u.id = cm.student_user_id
         LEFT JOIN sessions s ON s.user_id = u.id AND s.created_at > ?
         WHERE cm.class_id IN (${placeholders})
         GROUP BY u.id
         ORDER BY last_active DESC NULLS LAST`
      , since, ...classIds) as { id: string; name: string; session_count: number; last_active: string | null }[];

      return res.json(rows);
    } catch (err) {
      console.error('[school/oversight/students]', err);
      return res.status(500).json({ error: 'Internal error' });
    }
  });

  // GET /api/school/oversight/flags
  // Returns oversight flags for the teacher's classes
  router.get('/school/oversight/flags', async (req, res) => {
    try {
      const teacherId = req.user?.id;
      if (!teacherId) return res.status(401).json({ error: 'Unauthorised' });

      const { resolved = '0', range = '30d' } = req.query as { resolved?: string; range?: string };
      const dayMap: Record<string, number> = { today: 1, '7d': 7, '30d': 30 };
      const days = dayMap[range] ?? 30;
      const since = new Date(Date.now() - days * 86_400_000).toISOString();

      try {
        const flags = await db.all(
          `SELECT f.id, f.student_id, f.session_id, f.flag_type, f.reason, f.created_at, f.resolved,
                  COALESCE(u.display_name, u.username) as student_name
           FROM oversight_flags f
           LEFT JOIN users u ON u.id = f.student_id
           WHERE f.teacher_id = ? AND f.created_at > ?
             AND f.resolved = ?
           ORDER BY f.created_at DESC
           LIMIT 200`
        , teacherId, since, resolved === '1' ? 1 : 0) as Record<string, unknown>[];
        return res.json(flags);
      } catch {
        // oversight_flags table may not exist yet
        return res.json([]);
      }
    } catch (err) {
      console.error('[school/oversight/flags]', err);
      return res.status(500).json({ error: 'Internal error' });
    }
  });

  // POST /api/school/oversight/flags/:id/resolve
  // Mark an oversight flag as resolved
  router.post('/school/oversight/flags/:id/resolve', async (req, res) => {
    try {
      const teacherId = req.user?.id;
      if (!teacherId) return res.status(401).json({ error: 'Unauthorised' });

      const { id } = req.params;
      try {
        const flag = await db.get('SELECT id FROM oversight_flags WHERE id = ?', id) as { id: string } | undefined;
        if (!flag) return res.status(404).json({ error: 'Flag not found' });
        await db.run(`UPDATE oversight_flags SET resolved = 1, resolved_at = ? WHERE id = ?`, new Date().toISOString(), id);
        return res.json({ ok: true });
      } catch {
        return res.status(404).json({ error: 'Flag not found or table not initialised' });
      }
    } catch (err) {
      console.error('[school/oversight/flags/resolve]', err);
      return res.status(500).json({ error: 'Internal error' });
    }
  });

  return router;
}
