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
import type Database from 'better-sqlite3';
import type { Response } from 'express';
import { streamToResponse, isApiKeyConfigured } from '../services/claude-client.js';
import { buildSchoolPrompt, inferMathsModule, inferSubjectModule, type SchoolPromptConfig } from '../services/school-prompt-builder.js';
import { safeError } from '../lib/error-response.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs-extra';
import { extractTextFromFile } from '../services/text-extractor.js';

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
};

function buildPromptConfig(
  body: Record<string, unknown>,
  classRow: Record<string, unknown> | null,
  overrides?: { growthStage?: string; senMode?: string | null; explanationStyle?: string }
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

function updateGrowthProfile(db: Database.Database, userId: string, eventType = 'chat_turn'): void {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().split('T')[0];

  const profile = db.prepare(
    `SELECT session_count, total_xp, xp_level, current_streak, longest_streak, last_active_date, streak_shields
     FROM student_growth_profiles WHERE student_user_id = ?`
  ).get(userId) as {
    session_count: number; total_xp: number; xp_level: number;
    current_streak: number; longest_streak: number; last_active_date: string | null;
    streak_shields: number;
  } | undefined;

  const now = new Date().toISOString();

  if (!profile) {
    const initXp = (XP_VALUES['first_session'] ?? 25) + (XP_VALUES[eventType] ?? 5);
    db.prepare(
      `INSERT INTO student_growth_profiles
         (id, student_user_id, stage, session_count, total_xp, xp_level, current_streak, longest_streak, last_active_date, updated_at)
       VALUES (?, ?, 'S1', 1, ?, 1, 1, 1, ?, ?)`
    ).run(crypto.randomUUID(), userId, initXp, today, now);
    try {
      db.prepare(`INSERT INTO student_xp_events (id, student_user_id, event_type, xp_earned, created_at) VALUES (?, ?, ?, ?, ?)`)
        .run(crypto.randomUUID(), userId, 'first_session', XP_VALUES['first_session'] ?? 25, now);
      if (eventType !== 'first_session') {
        db.prepare(`INSERT INTO student_xp_events (id, student_user_id, event_type, xp_earned, created_at) VALUES (?, ?, ?, ?, ?)`)
          .run(crypto.randomUUID(), userId, eventType, XP_VALUES[eventType] ?? 5, now);
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
      db.prepare(`UPDATE student_growth_profiles SET streak_shields = streak_shields - 1 WHERE student_user_id = ?`).run(userId);
      try {
        db.prepare(`INSERT INTO student_xp_events (id, student_user_id, event_type, xp_earned, context, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
          .run(crypto.randomUUID(), userId, 'shield_used', 0, 'Streak shield activated', now);
      } catch {}
    } else {
      // No shields — reset streak
      newStreak = 1;
    }
  } else {
    newStreak = 1;
  }

  const eventXp = XP_VALUES[eventType] ?? 5;
  const newXp = (profile.total_xp ?? 0) + eventXp + streakXp;
  const newLevel = computeXpLevel(newXp);

  db.prepare(
    `UPDATE student_growth_profiles
     SET session_count = ?, stage = ?, total_xp = ?, xp_level = ?,
         current_streak = ?, longest_streak = ?, last_active_date = ?, updated_at = ?
     WHERE student_user_id = ?`
  ).run(count, stage, newXp, newLevel, newStreak, longestStreak, today, now, userId);

  try {
    if (eventXp > 0) {
      db.prepare(`INSERT INTO student_xp_events (id, student_user_id, event_type, xp_earned, created_at) VALUES (?, ?, ?, ?, ?)`)
        .run(crypto.randomUUID(), userId, eventType, eventXp, now);
    }
    if (streakXp > 0) {
      db.prepare(`INSERT INTO student_xp_events (id, student_user_id, event_type, xp_earned, created_at) VALUES (?, ?, ?, ?, ?)`)
        .run(crypto.randomUUID(), userId, 'streak_day', streakXp, now);
    }
  } catch { /* non-fatal */ }
  checkAndAwardAchievements(db, userId, { session_count: count, xp_level: newLevel, current_streak: newStreak, stage });

  // Grant a shield when streak reaches 7
  if (newStreak === 7) {
    try {
      db.prepare(`UPDATE student_growth_profiles SET streak_shields = MIN(3, streak_shields + 1) WHERE student_user_id = ?`).run(userId);
    } catch {}
  }
}

function checkAndAwardAchievements(
  db: Database.Database,
  userId: string,
  profile: { session_count: number; xp_level: number; current_streak: number; stage: string }
): void {
  try {
    const now = new Date().toISOString();
    const earned = new Set(
      (db.prepare('SELECT achievement_id FROM student_achievements WHERE student_user_id = ?')
        .all(userId) as { achievement_id: string }[]).map(r => r.achievement_id)
    );

    function award(id: string) {
      if (earned.has(id)) return;
      earned.add(id);
      try {
        db.prepare('INSERT OR IGNORE INTO student_achievements (id, student_user_id, achievement_id, earned_at) VALUES (?, ?, ?, ?)')
          .run(crypto.randomUUID(), userId, id, now);
      } catch { /* ignore */ }
    }

    if (profile.session_count >= 1)  award('first_session');
    if (profile.current_streak >= 3)  award('three_day_streak');
    if (profile.current_streak >= 5)  award('five_day_streak');
    if (profile.current_streak >= 10) award('ten_day_streak');
    if (profile.xp_level >= 2) award('level_2');
    if (profile.xp_level >= 3) award('level_3');
    if (profile.xp_level >= 5) award('level_5');
    if (profile.session_count >= 10)  award('ten_sessions');
    if (profile.session_count >= 50)  award('fifty_sessions');
    if (['S2', 'S3', 'S4'].includes(profile.stage)) award('s2_reached');
    if (profile.stage === 'S4') award('s4_reached');

    // bloom_any_50 / bloom_any_100 — check all progress rows
    try {
      const rows = db.prepare('SELECT blooms_data FROM student_progress WHERE student_user_id = ?')
        .all(userId) as { blooms_data: string }[];
      for (const row of rows) {
        if (!row.blooms_data) continue;
        const vals = Object.values(JSON.parse(row.blooms_data) as Record<string, number>);
        if (vals.some(v => v >= 50))  award('bloom_any_50');
        if (vals.some(v => v >= 100)) award('bloom_any_100');
      }
    } catch { /* ignore */ }
  } catch { /* non-fatal */ }
}

function updateStudentProgress(
  db: Database.Database,
  userId: string,
  classId: string,
  subjectId: string,
  taskType: string
): void {
  const existing = db.prepare(
    'SELECT blooms_data, overall_progress_pct FROM student_progress WHERE student_user_id = ? AND class_id = ?'
  ).get(userId, classId) as { blooms_data: string; overall_progress_pct: number } | undefined;
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
    db.prepare(
      `UPDATE student_progress SET blooms_data = ?, overall_progress_pct = ?, updated_at = ? WHERE student_user_id = ? AND class_id = ?`
    ).run(JSON.stringify(blooms), newPct, now, userId, classId);
  } else {
    db.prepare(
      `INSERT INTO student_progress (id, student_user_id, class_id, subject_id, blooms_data, overall_progress_pct, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(crypto.randomUUID(), userId, classId, subjectId, JSON.stringify(blooms), 1, now);
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

export function createSchoolRoutes(db: Database.Database) {
  // ── DB migrations (non-fatal) ─────────────────────────────────────────
  try { db.exec(`ALTER TABLE student_growth_profiles ADD COLUMN sen_mode TEXT DEFAULT NULL`); } catch {}
  try { db.exec(`ALTER TABLE student_growth_profiles ADD COLUMN explanation_style TEXT DEFAULT 'balanced'`); } catch {}
  try { db.exec(`ALTER TABLE student_growth_profiles ADD COLUMN streak_shields INTEGER DEFAULT 2`); } catch {}
  try { db.exec(`CREATE TABLE IF NOT EXISTS teacher_lessons (id TEXT PRIMARY KEY, teacher_user_id TEXT NOT NULL, class_id TEXT, title TEXT NOT NULL, subject_id TEXT NOT NULL DEFAULT 'mathematics', learning_objectives TEXT DEFAULT '[]', content_blocks TEXT DEFAULT '[]', tier TEXT DEFAULT 'T2', is_template INTEGER DEFAULT 0, created_at DATETIME, updated_at DATETIME)`); } catch {}
  try { db.exec(`ALTER TABLE teacher_assignments ADD COLUMN is_template INTEGER DEFAULT 0`); } catch {}
  try { db.exec(`ALTER TABLE student_growth_profiles ADD COLUMN total_xp INTEGER DEFAULT 0`); } catch {}
  try { db.exec(`ALTER TABLE student_growth_profiles ADD COLUMN xp_level INTEGER DEFAULT 1`); } catch {}
  try { db.exec(`ALTER TABLE student_growth_profiles ADD COLUMN current_streak INTEGER DEFAULT 0`); } catch {}
  try { db.exec(`ALTER TABLE student_growth_profiles ADD COLUMN longest_streak INTEGER DEFAULT 0`); } catch {}
  try { db.exec(`ALTER TABLE student_growth_profiles ADD COLUMN last_active_date TEXT`); } catch {}
  try { db.exec(`CREATE TABLE IF NOT EXISTS student_xp_events (id TEXT PRIMARY KEY, student_user_id TEXT NOT NULL, event_type TEXT NOT NULL, xp_earned INTEGER NOT NULL, context TEXT, created_at DATETIME)`); } catch {}
  try { db.exec(`CREATE TABLE IF NOT EXISTS student_achievements (id TEXT PRIMARY KEY, student_user_id TEXT NOT NULL, achievement_id TEXT NOT NULL, earned_at DATETIME, UNIQUE(student_user_id, achievement_id))`); } catch {}
  try { db.exec(`ALTER TABLE school_classes ADD COLUMN leaderboard_enabled INTEGER DEFAULT 0`); } catch {}
  try { db.exec(`CREATE TABLE IF NOT EXISTS school_admin_config (key TEXT PRIMARY KEY, value TEXT)`); } catch {}
  try { db.exec(`CREATE TABLE IF NOT EXISTS student_daily_quests (id TEXT PRIMARY KEY, student_user_id TEXT NOT NULL, quest_type TEXT NOT NULL, quest_date TEXT NOT NULL, target INTEGER NOT NULL, progress INTEGER DEFAULT 0, completed INTEGER DEFAULT 0, xp_reward INTEGER NOT NULL, created_at DATETIME, UNIQUE(student_user_id, quest_date, quest_type))`); } catch {}
  try { db.exec(`CREATE TABLE IF NOT EXISTS guardian_digest_log (id TEXT PRIMARY KEY, guardian_user_id TEXT NOT NULL, student_user_id TEXT NOT NULL, sent_at DATETIME, digest_data TEXT)`); } catch {}
  try { db.exec(`ALTER TABLE guardian_student_links ADD COLUMN email_digest INTEGER DEFAULT 1`); } catch {}
  // Session D: review_cards (SM-2 spaced repetition)
  try { db.exec(`CREATE TABLE IF NOT EXISTS review_cards (id TEXT PRIMARY KEY, student_user_id TEXT NOT NULL, subject_id TEXT NOT NULL, front TEXT NOT NULL, back TEXT NOT NULL, source TEXT, due_date TEXT, interval_days INTEGER DEFAULT 1, ease_factor REAL DEFAULT 2.5, repetitions INTEGER DEFAULT 0, created_at DATETIME)`); } catch {}
  // Load persisted model-tier override (if any)
  try {
    const cfgRow = db.prepare(`SELECT value FROM school_admin_config WHERE key = 'model_tier'`).get() as { value: string } | undefined;
    if (cfgRow) _ollamaTierEnabled = cfgRow.value === 'C';
  } catch {}

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
        classRow = db.prepare('SELECT * FROM school_classes WHERE id = ?')
          .get(classId as string) as Record<string, unknown> | null;
      }

      // Query growth profile for stage-adaptive prompting
      const profile = db.prepare(
        `SELECT stage, sen_mode, explanation_style FROM student_growth_profiles WHERE student_user_id = ?`
      ).get(userId) as { stage: string; sen_mode: string | null; explanation_style: string } | undefined;

      // Auto-infer module from last user message if not supplied
      const lastUserMsg = Array.isArray(messages) && messages.length > 0
        ? String((messages[messages.length - 1] as Record<string, unknown>)?.content ?? '')
        : '';
      const subjectForInfer = (classRow?.subject_id as string) || (req.body.subjectId as string) || 'mathematics';
      const resolvedModuleId = (req.body.moduleId as string) || inferSubjectModule(lastUserMsg, subjectForInfer);

      // Load lesson content when lessonId provided — overrides Layer 3 module context
      let lessonContext: string | undefined;
      if (lessonId) {
        const lesson = db.prepare('SELECT * FROM teacher_lessons WHERE id = ?')
          .get(lessonId as string) as Record<string, unknown> | null;
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
        { growthStage: profile?.stage, senMode: profile?.sen_mode, explanationStyle: profile?.explanation_style }
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

      const onComplete = (data: { text: string; outputTokens: number }) => {
        try {
          if (sessionId) {
            db.prepare(
              `INSERT INTO messages (id, session_id, role, content, token_count, created_at)
               VALUES (?, ?, 'assistant', ?, ?, ?)`
            ).run(crypto.randomUUID(), sessionId as string, data.text, data.outputTokens, new Date().toISOString());
            db.prepare('UPDATE sessions SET updated_at = ? WHERE id = ? AND user_id = ?')
              .run(new Date().toISOString(), sessionId as string, userId);
          }
          updateGrowthProfile(db, userId);
          if (resolvedClassId) updateStudentProgress(db, userId, resolvedClassId, resolvedSubjectId, resolvedTaskType);
          // Daily quest: chat_turns
          try {
            const today = new Date().toISOString().split('T')[0];
            const chatQuest = db.prepare(
              `SELECT id FROM student_daily_quests WHERE student_user_id = ? AND quest_date = ? AND quest_type = 'chat_turns' AND completed = 0`
            ).get(userId, today) as { id: string } | undefined;
            if (chatQuest) {
              db.prepare(`UPDATE student_daily_quests SET progress = MIN(target, progress + 1), completed = CASE WHEN progress + 1 >= target THEN 1 ELSE 0 END WHERE id = ?`).run(chatQuest.id);
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
        classRow = db.prepare('SELECT * FROM school_classes WHERE id = ?')
          .get(classId as string) as Record<string, unknown> | null;
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
          db.prepare(
            `INSERT INTO laxhjalp_sessions (id, student_user_id, class_id, subject_id, topic, stuck_point, module_id, session_id, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).run(
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
        ? (data: { text: string; outputTokens: number }) => {
            try {
              db.prepare('UPDATE laxhjalp_sessions SET resolved = 1, status = ?, updated_at = ? WHERE id = ?')
                .run('resolved', new Date().toISOString(), laxhjalpId);
              if (sessionId) {
                db.prepare(
                  `INSERT INTO messages (id, session_id, role, content, token_count, created_at)
                   VALUES (?, ?, 'assistant', ?, ?, ?)`
                ).run(crypto.randomUUID(), sessionId as string, data.text, data.outputTokens, new Date().toISOString());
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
          const assignment = db.prepare('SELECT title, instructions FROM teacher_assignments WHERE id = ?')
            .get(assignmentId) as { title: string; instructions: string } | null;
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
        { model: 'claude-sonnet-4-6', messages, system: systemPrompt, maxTokens: 800 },
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

      const assignment = db.prepare('SELECT title, instructions FROM teacher_assignments WHERE id = ?')
        .get(req.params.id) as { title: string; instructions: string } | null;

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
        { model: 'claude-sonnet-4-6', messages: [{ role: 'user', content: evaluationPrompt }], maxTokens: 1500 },
        res
      );
    } catch (err) {
      console.error('[school/socratic-evaluate]', err);
      if (!res.headersSent) res.status(500).json({ error: safeError(err) });
    }
  });

  // ── GET /api/school/dashboard ──────────────────────────────────────────
  router.get('/school/dashboard', (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorised' });

      const schoolRole = req.user?.school_role;

      if (schoolRole === 'teacher' || schoolRole === 'school_admin') {
        const classes = db.prepare(
          `SELECT sc.*,
             (SELECT COUNT(*) FROM class_enrollments ce WHERE ce.class_id = sc.id) AS student_count,
             (SELECT COUNT(*) FROM assignment_submissions asub
              JOIN teacher_assignments ta ON ta.id = asub.assignment_id
              WHERE ta.class_id = sc.id AND asub.submitted_at IS NOT NULL AND asub.teacher_grade IS NULL) AS pending_submissions
           FROM school_classes sc
           WHERE sc.teacher_user_id = ?
           ORDER BY sc.created_at DESC`
        ).all(userId) as Record<string, unknown>[];

        return res.json({ role: 'teacher', classes });
      }

      // Student view
      const classes = db.prepare(
        `SELECT sc.*, ce.enrolled_at,
           (SELECT sp.current_block FROM student_progress sp
            WHERE sp.student_user_id = ? AND sp.class_id = sc.id LIMIT 1) AS last_topic,
           (SELECT sp.overall_progress_pct FROM student_progress sp
            WHERE sp.student_user_id = ? AND sp.class_id = sc.id LIMIT 1) AS completion_pct
         FROM class_enrollments ce
         JOIN school_classes sc ON sc.id = ce.class_id
         WHERE ce.student_user_id = ?
         ORDER BY ce.enrolled_at DESC`
      ).all(userId, userId, userId) as Record<string, unknown>[];

      const assignments = db.prepare(
        `SELECT ta.id, ta.title, ta.due_date, sc.name AS class_name
         FROM teacher_assignments ta
         JOIN school_classes sc ON sc.id = ta.class_id
         JOIN class_enrollments ce ON ce.class_id = ta.class_id
         WHERE ce.student_user_id = ? AND (ta.due_date IS NULL OR ta.due_date >= DATE('now'))
         ORDER BY ta.due_date ASC
         LIMIT 5`
      ).all(userId) as Record<string, unknown>[];

      // Growth profile — created on first interaction if missing
      const growthProfile = db.prepare(
        `SELECT stage, session_count, total_xp, xp_level, current_streak, longest_streak, streak_shields
         FROM student_growth_profiles WHERE student_user_id = ?`
      ).get(userId) as {
        stage: string; session_count: number;
        total_xp: number; xp_level: number; current_streak: number; longest_streak: number;
        streak_shields: number;
      } | undefined;

      const sessionsThisWeek = db.prepare(
        `SELECT COUNT(*) AS cnt FROM laxhjalp_sessions
         WHERE student_user_id = ? AND created_at >= DATE('now', '-7 days')`
      ).get(userId) as { cnt: number } | undefined;

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
  router.get('/school/achievements', (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorised' });

      const earned = db.prepare(
        'SELECT achievement_id, earned_at FROM student_achievements WHERE student_user_id = ? ORDER BY earned_at ASC'
      ).all(userId) as { achievement_id: string; earned_at: string }[];

      res.json({ achievements: ACHIEVEMENT_DEFS, earned });
    } catch (err) {
      console.error('[school/achievements]', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── GET /api/school/classes ────────────────────────────────────────────
  router.get('/school/classes', (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorised' });

      const classes = db.prepare(
        `SELECT sc.*,
           (SELECT COUNT(*) FROM class_enrollments ce WHERE ce.class_id = sc.id) AS student_count
         FROM school_classes sc
         WHERE sc.teacher_user_id = ?
         ORDER BY sc.created_at DESC`
      ).all(userId) as Record<string, unknown>[];

      res.json(classes);
    } catch (err) {
      console.error('[school/classes GET]', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── POST /api/school/classes ───────────────────────────────────────────
  router.post('/school/classes', (req, res) => {
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

      db.prepare(
        `INSERT INTO school_classes
           (id, teacher_user_id, name, subject_id, education_tier, curriculum_id,
            default_assistance_level, web_search_enabled, class_code, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(id, userId, name as string, subject as string, educationTier as string,
        curriculumId as string, defaultAssistanceLevel as string,
        webSearchEnabled ? 1 : 0, classCode, now, now);

      res.status(201).json({ id, classCode, name, subject, educationTier });
    } catch (err) {
      console.error('[school/classes POST]', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── GET /api/school/classes/:id ────────────────────────────────────────
  router.get('/school/classes/:id', (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorised' });

      const classRow = db.prepare('SELECT * FROM school_classes WHERE id = ?')
        .get(req.params.id) as Record<string, unknown> | null;
      if (!classRow) return res.status(404).json({ error: 'Class not found' });

      const isTeacher = classRow.teacher_user_id === userId;
      if (!isTeacher) {
        const enrolled = db.prepare('SELECT 1 FROM class_enrollments WHERE class_id = ? AND student_user_id = ?')
          .get(req.params.id, userId);
        if (!enrolled) return res.status(403).json({ error: 'Access denied' });
      }

      const students = isTeacher
        ? db.prepare(
            `SELECT u.id, u.name, u.email, ce.enrolled_at
             FROM class_enrollments ce
             JOIN users u ON u.id = ce.student_user_id
             WHERE ce.class_id = ?`
          ).all(req.params.id)
        : [];

      // Compute class-average Bloom's across all enrolled students' progress rows
      const progressRows = db.prepare(
        `SELECT sp.blooms_data FROM student_progress sp
         JOIN class_enrollments ce ON ce.student_user_id = sp.student_user_id
         WHERE ce.class_id = ?`
      ).all(req.params.id) as { blooms_data: string }[];

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
  router.put('/school/classes/:id', (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorised' });

      const exists = db.prepare('SELECT 1 FROM school_classes WHERE id = ? AND teacher_user_id = ?')
        .get(req.params.id, userId);
      if (!exists) return res.status(404).json({ error: 'Class not found or access denied' });

      const { name, subject, educationTier, curriculumId, defaultAssistanceLevel, webSearchEnabled, leaderboardEnabled } = req.body as Record<string, unknown>;

      db.prepare(
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
      ).run(
        name ?? null, subject ?? null, educationTier ?? null,
        curriculumId ?? null, defaultAssistanceLevel ?? null,
        webSearchEnabled !== undefined ? (webSearchEnabled ? 1 : 0) : null,
        leaderboardEnabled !== undefined ? (leaderboardEnabled ? 1 : 0) : null,
        new Date().toISOString(), req.params.id
      );

      res.json(db.prepare('SELECT * FROM school_classes WHERE id = ?').get(req.params.id));
    } catch (err) {
      console.error('[school/classes/:id PUT]', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── GET /api/school/classes/:id/leaderboard ────────────────────────────
  router.get('/school/classes/:id/leaderboard', (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorised' });

      const classRow = db.prepare(
        'SELECT leaderboard_enabled FROM school_classes WHERE id = ?'
      ).get(req.params.id) as { leaderboard_enabled: number } | null;

      if (!classRow) return res.status(404).json({ error: 'Class not found' });
      if (!classRow.leaderboard_enabled) return res.json({ enabled: false, entries: [] });

      const rows = db.prepare(
        `SELECT u.display_name, u.username, COALESCE(sgp.total_xp, 0) AS total_xp, COALESCE(sgp.xp_level, 1) AS xp_level
         FROM class_enrollments ce
         JOIN users u ON u.id = ce.student_user_id
         LEFT JOIN student_growth_profiles sgp ON sgp.student_user_id = ce.student_user_id
         WHERE ce.class_id = ?
         ORDER BY total_xp DESC
         LIMIT 10`
      ).all(req.params.id) as { display_name: string | null; username: string; total_xp: number; xp_level: number }[];

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
  router.post('/school/classes/join', (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorised' });

      const { classCode } = req.body as { classCode: string };
      if (!classCode) return res.status(400).json({ error: 'Class code required' });

      const classRow = db.prepare('SELECT * FROM school_classes WHERE class_code = ?')
        .get(classCode.toUpperCase()) as Record<string, unknown> | null;
      if (!classRow) return res.status(404).json({ error: 'Invalid class code' });

      const existing = db.prepare('SELECT 1 FROM class_enrollments WHERE class_id = ? AND student_user_id = ?')
        .get(classRow.id as string, userId);
      if (existing) return res.status(409).json({ error: 'Already enrolled' });

      db.prepare(`INSERT INTO class_enrollments (id, class_id, student_user_id, enrolled_at) VALUES (?, ?, ?, ?)`)
        .run(crypto.randomUUID(), classRow.id as string, userId, new Date().toISOString());

      res.status(201).json({ message: 'Enrolled successfully', class: classRow });
    } catch (err) {
      console.error('[school/classes/join]', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── GET /api/school/assignments ────────────────────────────────────────
  router.get('/school/assignments', (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorised' });

      const schoolRole = req.user?.school_role;
      const classId = req.query.classId as string | undefined;

      if (schoolRole === 'teacher' || schoolRole === 'school_admin') {
        const params: unknown[] = [userId];
        if (classId) params.push(classId);
        const assignments = db.prepare(
          `SELECT ta.*, sc.name AS class_name,
             (SELECT COUNT(*) FROM assignment_submissions asub WHERE asub.assignment_id = ta.id) AS submission_count
           FROM teacher_assignments ta
           JOIN school_classes sc ON sc.id = ta.class_id
           WHERE sc.teacher_user_id = ?${classId ? ' AND ta.class_id = ?' : ''}
           ORDER BY ta.created_at DESC`
        ).all(...params) as Record<string, unknown>[];

        return res.json(assignments.map(a => ({
          ...a,
          questions: a.questions ? JSON.parse(a.questions as string) : [],
        })));
      }

      // Student
      const params: unknown[] = [userId, userId];
      if (classId) params.push(classId);
      const assignments = db.prepare(
        `SELECT ta.*, sc.name AS class_name,
           asub.id AS submission_id, asub.submitted_at, asub.teacher_grade
         FROM teacher_assignments ta
         JOIN school_classes sc ON sc.id = ta.class_id
         JOIN class_enrollments ce ON ce.class_id = ta.class_id AND ce.student_user_id = ?
         LEFT JOIN assignment_submissions asub ON asub.assignment_id = ta.id AND asub.student_user_id = ?
         ${classId ? 'WHERE ta.class_id = ?' : ''}
         ORDER BY ta.due_date ASC`
      ).all(...params) as Record<string, unknown>[];

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
  router.post('/school/assignments', (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorised' });

      const {
        classId, title, description = '', questions = [],
        dueDate, totalMarks = 0, assistanceLevelOverride,
        assignmentType = 'homework', subjectId, isTemplate = false,
      } = req.body as Record<string, unknown>;

      if (!classId || !title) return res.status(400).json({ error: 'classId and title required' });

      const classRow = db.prepare('SELECT * FROM school_classes WHERE id = ? AND teacher_user_id = ?')
        .get(classId as string, userId) as Record<string, unknown> | null;
      if (!classRow) return res.status(403).json({ error: 'Class not found or access denied' });

      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const resolvedSubjectId = (subjectId as string) || (classRow.subject_id as string) || 'mathematics';

      db.prepare(
        `INSERT INTO teacher_assignments
           (id, teacher_user_id, class_id, title, description, assignment_type, subject_id,
            questions, total_marks, assistance_level_override, due_date, content, is_template, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
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
  router.get('/school/assignments/templates', (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorised' });

      const templates = db.prepare(
        `SELECT ta.*, sc.name AS class_name
         FROM teacher_assignments ta
         JOIN school_classes sc ON sc.id = ta.class_id
         WHERE ta.teacher_user_id = ? AND ta.is_template = 1
         ORDER BY ta.created_at DESC`
      ).all(userId) as Record<string, unknown>[];

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
  router.post('/school/assignments/:id/duplicate', (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorised' });

      const original = db.prepare(
        `SELECT ta.* FROM teacher_assignments ta
         JOIN school_classes sc ON sc.id = ta.class_id
         WHERE ta.id = ? AND sc.teacher_user_id = ?`
      ).get(req.params.id, userId) as Record<string, unknown> | null;

      if (!original) return res.status(404).json({ error: 'Assignment not found or access denied' });

      const newId = crypto.randomUUID();
      const now = new Date().toISOString();
      const newTitle = `${original.title} (copy)`;

      db.prepare(
        `INSERT INTO teacher_assignments
           (id, teacher_user_id, class_id, title, description, assignment_type, subject_id,
            questions, total_marks, assistance_level_override, due_date, content, is_template, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
      ).run(
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
  router.get('/school/assignments/:id', (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorised' });

      const assignment = db.prepare(
        `SELECT ta.*, sc.name AS class_name, sc.teacher_user_id, sc.subject_id, sc.education_tier
         FROM teacher_assignments ta
         JOIN school_classes sc ON sc.id = ta.class_id
         WHERE ta.id = ?`
      ).get(req.params.id) as Record<string, unknown> | null;
      if (!assignment) return res.status(404).json({ error: 'Assignment not found' });

      if (assignment.teacher_user_id !== userId) {
        const enrolled = db.prepare('SELECT 1 FROM class_enrollments WHERE class_id = ? AND student_user_id = ?')
          .get(assignment.class_id as string, userId);
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
  router.post('/school/assignments/:id/export-anton', (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorised' });

      const assignment = db.prepare(
        `SELECT ta.*, sc.name AS class_name, sc.subject_id, sc.education_tier,
           sc.curriculum_id, sc.default_assistance_level
         FROM teacher_assignments ta
         JOIN school_classes sc ON sc.id = ta.class_id
         WHERE ta.id = ? AND sc.teacher_user_id = ?`
      ).get(req.params.id, userId) as Record<string, unknown> | null;
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
  router.post('/school/assignments/import', (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorised' });

      const bundle = req.body as { type: string; assignment?: Record<string, unknown>; classConfig?: Record<string, unknown> };
      if (bundle.type !== 'assignment' || !bundle.assignment) {
        return res.status(400).json({ error: 'Invalid .anton bundle — expected type: assignment' });
      }

      const now = new Date().toISOString();
      const assignmentId = (bundle.assignment.id as string) || crypto.randomUUID();

      const existingA = db.prepare('SELECT id FROM teacher_assignments WHERE id = ?').get(assignmentId) as { id: string } | null;
      if (!existingA) {
        try {
          db.prepare(
            `INSERT OR IGNORE INTO teacher_assignments
               (id, teacher_user_id, class_id, title, description, assignment_type, subject_id,
                questions, total_marks, assistance_level_override, due_date, content, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).run(
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
      db.prepare(
        `INSERT OR IGNORE INTO assignment_submissions
           (id, assignment_id, student_user_id, answers, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'draft', ?, ?)`
      ).run(submissionId, assignmentId, userId, '{}', now, now);

      res.status(201).json({ submissionId, assignmentId, assignment: bundle.assignment, classConfig: bundle.classConfig });
    } catch (err) {
      console.error('[school/assignments/import]', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── GET /api/school/submissions ────────────────────────────────────────
  router.get('/school/submissions', (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorised' });

      const schoolRole = req.user?.school_role;
      const assignmentId = req.query.assignmentId as string | undefined;

      if (schoolRole === 'teacher' || schoolRole === 'school_admin') {
        const params: unknown[] = [userId];
        if (assignmentId) params.push(assignmentId);
        const submissions = db.prepare(
          `SELECT asub.*, ta.title AS assignment_title, u.name AS student_name, u.email AS student_email
           FROM assignment_submissions asub
           JOIN teacher_assignments ta ON ta.id = asub.assignment_id
           JOIN school_classes sc ON sc.id = ta.class_id
           JOIN users u ON u.id = asub.student_user_id
           WHERE sc.teacher_user_id = ?${assignmentId ? ' AND asub.assignment_id = ?' : ''}
           ORDER BY asub.submitted_at DESC`
        ).all(...params) as Record<string, unknown>[];

        return res.json(submissions.map(s => ({
          ...s,
          answers: s.answers ? JSON.parse(s.answers as string) : {},
          learning_evidence_log: s.learning_evidence_log ? JSON.parse(s.learning_evidence_log as string) : null,
        })));
      }

      // Student
      const params: unknown[] = [userId];
      if (assignmentId) params.push(assignmentId);
      const submissions = db.prepare(
        `SELECT asub.*, ta.title AS assignment_title, sc.name AS class_name
         FROM assignment_submissions asub
         JOIN teacher_assignments ta ON ta.id = asub.assignment_id
         JOIN school_classes sc ON sc.id = ta.class_id
         WHERE asub.student_user_id = ?${assignmentId ? ' AND asub.assignment_id = ?' : ''}
         ORDER BY asub.created_at DESC`
      ).all(...params) as Record<string, unknown>[];

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
  router.get('/school/submissions/:id', (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorised' });

      const submission = db.prepare(
        `SELECT asub.*, ta.title AS assignment_title, ta.questions, ta.total_marks,
           sc.name AS class_name, sc.teacher_user_id, u.name AS student_name
         FROM assignment_submissions asub
         JOIN teacher_assignments ta ON ta.id = asub.assignment_id
         JOIN school_classes sc ON sc.id = ta.class_id
         JOIN users u ON u.id = asub.student_user_id
         WHERE asub.id = ?`
      ).get(req.params.id) as Record<string, unknown> | null;
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
  router.post('/school/submissions', (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorised' });

      const { assignmentId, answers = {}, learningEvidenceLog, submit = false } = req.body as Record<string, unknown>;
      if (!assignmentId) return res.status(400).json({ error: 'assignmentId required' });

      const now = new Date().toISOString();
      const existing = db.prepare('SELECT id FROM assignment_submissions WHERE assignment_id = ? AND student_user_id = ?')
        .get(assignmentId as string, userId) as { id: string } | null;

      if (existing) {
        db.prepare(
          `UPDATE assignment_submissions
           SET answers = ?,
               learning_evidence_log = COALESCE(?, learning_evidence_log),
               status = ?,
               submitted_at = CASE WHEN ? = 1 THEN ? ELSE submitted_at END,
               updated_at = ?
           WHERE id = ?`
        ).run(
          JSON.stringify(answers),
          learningEvidenceLog ? JSON.stringify(learningEvidenceLog) : null,
          submit ? 'submitted' : 'draft',
          submit ? 1 : 0, now, now, existing.id
        );
        return res.json({ id: existing.id, status: submit ? 'submitted' : 'draft' });
      }

      const id = crypto.randomUUID();
      db.prepare(
        `INSERT INTO assignment_submissions
           (id, assignment_id, student_user_id, answers, learning_evidence_log,
            status, submitted_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
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
  router.post('/school/submissions/:id/grade', (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorised' });

      const { grade, feedback } = req.body as { grade?: string; feedback?: string };

      const row = db.prepare(
        `SELECT asub.id, sc.teacher_user_id
         FROM assignment_submissions asub
         JOIN teacher_assignments ta ON ta.id = asub.assignment_id
         JOIN school_classes sc ON sc.id = ta.class_id
         WHERE asub.id = ?`
      ).get(req.params.id) as { id: string; teacher_user_id: string } | null;

      if (!row) return res.status(404).json({ error: 'Submission not found' });
      if (row.teacher_user_id !== userId) return res.status(403).json({ error: 'Access denied' });

      const now = new Date().toISOString();
      db.prepare(
        `UPDATE assignment_submissions
         SET teacher_grade = ?, teacher_feedback = ?, graded_at = ?, updated_at = ?
         WHERE id = ?`
      ).run(grade ?? null, feedback ?? null, now, now, req.params.id);

      res.json({ id: req.params.id, grade, feedback });
    } catch (err) {
      console.error('[school/submissions/:id/grade]', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── POST /api/school/submissions/:id/export-anton ─────────────────────
  router.post('/school/submissions/:id/export-anton', (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorised' });

      const submission = db.prepare(
        `SELECT asub.*, ta.title AS assignment_title, ta.questions,
           sc.subject_id, sc.education_tier
         FROM assignment_submissions asub
         JOIN teacher_assignments ta ON ta.id = asub.assignment_id
         JOIN school_classes sc ON sc.id = ta.class_id
         WHERE asub.id = ? AND asub.student_user_id = ?`
      ).get(req.params.id, userId) as Record<string, unknown> | null;
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

      const submission = db.prepare(
        `SELECT asub.*, ta.title AS assignment_title, ta.questions, ta.total_marks,
           sc.subject_id, sc.education_tier, sc.teacher_user_id
         FROM assignment_submissions asub
         JOIN teacher_assignments ta ON ta.id = asub.assignment_id
         JOIN school_classes sc ON sc.id = ta.class_id
         WHERE asub.id = ?`
      ).get(req.params.id) as Record<string, unknown> | null;

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

      const onComplete = (data: { text: string }) => {
        try {
          db.prepare('UPDATE assignment_submissions SET ai_feedback = ?, updated_at = ? WHERE id = ?')
            .run(data.text, new Date().toISOString(), req.params.id);
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
  router.get('/school/guardian/children', (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorised' });

      const children = db.prepare(
        `SELECT u.id, u.name, u.email,
           (SELECT COUNT(*) FROM class_enrollments ce WHERE ce.student_user_id = u.id) AS class_count
         FROM guardian_student_links gsl
         JOIN users u ON u.id = gsl.student_user_id
         WHERE gsl.guardian_user_id = ?`
      ).all(userId) as Record<string, unknown>[];

      res.json(children);
    } catch (err) {
      console.error('[school/guardian/children]', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── POST /api/school/guardian/link ────────────────────────────────────
  router.post('/school/guardian/link', (req, res) => {
    try {
      const guardianId = req.user?.id;
      if (!guardianId) return res.status(401).json({ error: 'Unauthorised' });

      const { inviteCode } = req.body as { inviteCode: string };
      if (!inviteCode) return res.status(400).json({ error: 'Invite code required' });

      const student = db.prepare('SELECT id, name, email FROM users WHERE guardian_invite_code = ?')
        .get(inviteCode.toUpperCase()) as { id: string; name: string; email: string } | null;
      if (!student) return res.status(404).json({ error: 'Invalid invite code' });

      const existing = db.prepare('SELECT 1 FROM guardian_student_links WHERE guardian_user_id = ? AND student_user_id = ?')
        .get(guardianId, student.id);
      if (existing) return res.status(409).json({ error: 'Already linked' });

      db.prepare(
        `INSERT INTO guardian_student_links (id, guardian_user_id, student_user_id, created_at)
         VALUES (?, ?, ?, ?)`
      ).run(crypto.randomUUID(), guardianId, student.id, new Date().toISOString());

      res.status(201).json({ message: 'Linked successfully', student });
    } catch (err) {
      console.error('[school/guardian/link]', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── GET /api/school/guardian/digest/:studentId ─────────────────────────
  router.get('/school/guardian/digest/:studentId', (req, res) => {
    const guardianId = req.user?.id;
    if (!guardianId) return res.status(401).json({ error: 'Unauthorised' });

    const studentId = req.params.studentId;

    // Verify guardian link
    const link = db.prepare(
      `SELECT * FROM guardian_student_links WHERE guardian_user_id = ? AND student_user_id = ?`
    ).get(guardianId, studentId) as { id: string } | undefined;
    if (!link) return res.status(403).json({ error: 'Not linked to this student' });

    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();

    // Sessions in past 7 days
    const sessions = db.prepare(
      `SELECT COUNT(*) as count FROM laxhjalp_sessions WHERE user_id = ? AND created_at >= ?`
    ).get(studentId, sevenDaysAgo) as { count: number };

    // Growth profile
    const growth = db.prepare(
      `SELECT stage, total_xp, current_streak FROM student_growth_profiles WHERE student_user_id = ?`
    ).get(studentId) as { stage: string; total_xp: number; current_streak: number } | undefined;

    // XP earned in past 7 days
    const xpEarned = db.prepare(
      `SELECT COALESCE(SUM(xp_earned), 0) as total FROM student_xp_events WHERE student_user_id = ? AND created_at >= ?`
    ).get(studentId, sevenDaysAgo) as { total: number };

    // Assignments submitted in past 7 days
    const submissions = db.prepare(
      `SELECT COUNT(*) as count FROM assignment_submissions WHERE student_user_id = ? AND submitted_at >= ?`
    ).get(studentId, sevenDaysAgo) as { count: number };

    // Student name
    const student = db.prepare(`SELECT display_name, username FROM users WHERE id = ?`).get(studentId) as { display_name: string; username: string } | undefined;

    // Next send time (Monday 08:00)
    const now = new Date();
    const daysUntilMonday = (8 - now.getDay()) % 7 || 7;
    const nextMonday = new Date(now);
    nextMonday.setDate(now.getDate() + daysUntilMonday);
    nextMonday.setHours(8, 0, 0, 0);

    // Last digest
    const lastDigest = db.prepare(
      `SELECT sent_at FROM guardian_digest_log WHERE guardian_user_id = ? AND student_user_id = ? ORDER BY sent_at DESC LIMIT 1`
    ).get(guardianId, studentId) as { sent_at: string } | undefined;

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
    const link = db.prepare(`SELECT * FROM guardian_student_links WHERE guardian_user_id = ? AND student_user_id = ?`).get(guardianId, studentId);
    if (!link) return res.status(403).json({ error: 'Not linked' });

    // Build digest
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const growth = db.prepare(`SELECT stage, total_xp, current_streak FROM student_growth_profiles WHERE student_user_id = ?`).get(studentId) as { stage: string; total_xp: number; current_streak: number } | undefined;
    const xpEarned = db.prepare(`SELECT COALESCE(SUM(xp_earned), 0) as total FROM student_xp_events WHERE student_user_id = ? AND created_at >= ?`).get(studentId, sevenDaysAgo) as { total: number };
    const student = db.prepare(`SELECT display_name, username FROM users WHERE id = ?`).get(studentId) as { display_name: string; username: string } | undefined;
    const guardian = db.prepare(`SELECT email FROM users WHERE id = ?`).get(guardianId) as { email: string } | undefined;

    const digestData = { student: student?.display_name || student?.username || 'Student', xpEarned: xpEarned.total, stage: growth?.stage, streak: growth?.current_streak, sentAt: new Date().toISOString() };

    const now = new Date().toISOString();
    try {
      db.prepare(`INSERT INTO guardian_digest_log (id, guardian_user_id, student_user_id, sent_at, digest_data) VALUES (?, ?, ?, ?, ?)`).run(crypto.randomUUID(), guardianId, studentId, now, JSON.stringify(digestData));
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

      const classRow = db.prepare('SELECT 1 FROM school_classes WHERE id = ? AND teacher_user_id = ?').get(classId as string, userId);
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
  router.get('/school/personas', (req, res) => {
    try {
      const personas = db.prepare('SELECT * FROM teacher_personas ORDER BY name ASC')
        .all() as Record<string, unknown>[];

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
  router.get('/school/progress', (req, res) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorised' });
    try {
      const rows = db.prepare(
        `SELECT sp.class_id, sc.name AS class_name, sc.subject_id, sp.blooms_data, sp.overall_progress_pct
         FROM student_progress sp JOIN school_classes sc ON sc.id = sp.class_id
         WHERE sp.student_user_id = ?`
      ).all(userId) as Record<string, unknown>[];
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
  router.get('/school/settings', (req, res) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorised' });
    try {
      const profile = db.prepare(
        `SELECT sen_mode, explanation_style FROM student_growth_profiles WHERE student_user_id = ?`
      ).get(userId) as { sen_mode: string | null; explanation_style: string } | undefined;
      res.json({ senMode: profile?.sen_mode ?? null, explanationStyle: profile?.explanation_style ?? 'balanced' });
    } catch (err) {
      console.error('[school/settings GET]', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── PATCH /api/school/settings ─────────────────────────────────────────
  router.patch('/school/settings', (req, res) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorised' });
    try {
      const { senMode, explanationStyle } = req.body as { senMode?: string | null; explanationStyle?: string };
      const now = new Date().toISOString();
      const existing = db.prepare('SELECT id FROM student_growth_profiles WHERE student_user_id = ?').get(userId) as { id: string } | undefined;
      if (existing) {
        db.prepare(
          `UPDATE student_growth_profiles SET sen_mode = ?, explanation_style = ?, updated_at = ? WHERE student_user_id = ?`
        ).run(senMode ?? null, explanationStyle ?? 'balanced', now, userId);
      } else {
        db.prepare(
          `INSERT INTO student_growth_profiles (id, student_user_id, stage, session_count, sen_mode, explanation_style, updated_at) VALUES (?, ?, 'S1', 0, ?, ?, ?)`
        ).run(crypto.randomUUID(), userId, senMode ?? null, explanationStyle ?? 'balanced', now);
      }
      res.json({ ok: true });
    } catch (err) {
      console.error('[school/settings PATCH]', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── GET /api/school/admin/model-tier ──────────────────────────────────
  router.get('/school/admin/model-tier', (req, res) => {
    if (req.user?.school_role !== 'school_admin') return res.status(403).json({ error: 'Forbidden' });
    res.json({
      modelTier: _ollamaTierEnabled ? 'C' : 'A',
      ollamaUrl: OLLAMA_BASE_URL,
      ollamaModel: OLLAMA_MODEL,
    });
  });

  // ── PATCH /api/school/admin/model-tier ─────────────────────────────────
  router.patch('/school/admin/model-tier', (req, res) => {
    if (req.user?.school_role !== 'school_admin') return res.status(403).json({ error: 'Forbidden' });
    const { modelTier } = req.body as { modelTier?: 'C' | 'A' };
    const tier = modelTier === 'C' ? 'C' : 'A';
    try {
      db.prepare(
        `INSERT INTO school_admin_config (key, value) VALUES ('model_tier', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      ).run(tier);
      _ollamaTierEnabled = tier === 'C';
      res.json({ ok: true, modelTier: tier, ollamaUrl: tier === 'C' ? OLLAMA_BASE_URL : null });
    } catch (err) {
      console.error('[school/admin/model-tier PATCH]', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── DELETE /api/school/learning-history ────────────────────────────────
  router.delete('/school/learning-history', (req, res) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorised' });
    try {
      db.prepare(`DELETE FROM messages WHERE session_id IN (SELECT id FROM sessions WHERE user_id = ? AND module_id LIKE 'school%')`).run(userId);
      db.prepare(`DELETE FROM sessions WHERE user_id = ? AND module_id LIKE 'school%'`).run(userId);
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
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001', max_tokens: 1024,
        messages: [{
          role: 'user',
          content: `Generate exactly 4 current real-world events/stories (sports, gaming, technology, science, culture, world events) that connect to the school subject "${subjectId}" (Swedish Lgr22, Year 7-9).\n\nReturn ONLY valid JSON, no markdown:\n{"items":[{"headline":"short headline max 12 words","category":"Sports|Gaming|Technology|Science|Culture|World","curriculumLink":"one sentence how this connects to ${subjectId}","discussionQuestion":"engaging open question max 20 words","chatPrompt":"I saw that [brief summary]. How does this connect to ${subjectId}?"}]}`,
        }],
      });
      const text = (response.content[0] as { type: string; text: string }).text ?? '';
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
  router.get('/school/lessons', (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorised' });

      const lessons = db.prepare(
        'SELECT * FROM teacher_lessons WHERE teacher_user_id = ? ORDER BY created_at DESC'
      ).all(userId) as Record<string, unknown>[];

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
  router.post('/school/lessons', (req, res) => {
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

      db.prepare(
        `INSERT INTO teacher_lessons
           (id, teacher_user_id, class_id, title, subject_id, learning_objectives, content_blocks, tier, is_template, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
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
  router.get('/school/lessons/:id', (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorised' });

      const lesson = db.prepare('SELECT * FROM teacher_lessons WHERE id = ? AND teacher_user_id = ?')
        .get(req.params.id, userId) as Record<string, unknown> | null;
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
  router.put('/school/lessons/:id', (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorised' });

      const exists = db.prepare('SELECT 1 FROM teacher_lessons WHERE id = ? AND teacher_user_id = ?')
        .get(req.params.id, userId);
      if (!exists) return res.status(404).json({ error: 'Lesson not found or access denied' });

      const { title, subjectId, tier, learningObjectives, contentBlocks, isTemplate } = req.body as Record<string, unknown>;
      const now = new Date().toISOString();

      db.prepare(
        `UPDATE teacher_lessons SET
           title = COALESCE(?, title),
           subject_id = COALESCE(?, subject_id),
           tier = COALESCE(?, tier),
           learning_objectives = COALESCE(?, learning_objectives),
           content_blocks = COALESCE(?, content_blocks),
           is_template = COALESCE(?, is_template),
           updated_at = ?
         WHERE id = ?`
      ).run(
        title ?? null,
        subjectId ?? null,
        tier ?? null,
        learningObjectives !== undefined ? JSON.stringify(learningObjectives) : null,
        contentBlocks !== undefined ? JSON.stringify(contentBlocks) : null,
        isTemplate !== undefined ? (isTemplate ? 1 : 0) : null,
        now, req.params.id
      );

      const updated = db.prepare('SELECT * FROM teacher_lessons WHERE id = ?')
        .get(req.params.id) as Record<string, unknown>;
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
  router.post('/school/lessons/:id/assign', (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorised' });

      const { classId } = req.body as { classId: string };
      if (!classId) return res.status(400).json({ error: 'classId required' });

      const lesson = db.prepare('SELECT 1 FROM teacher_lessons WHERE id = ? AND teacher_user_id = ?')
        .get(req.params.id, userId);
      if (!lesson) return res.status(404).json({ error: 'Lesson not found or access denied' });

      const classRow = db.prepare('SELECT 1 FROM school_classes WHERE id = ? AND teacher_user_id = ?')
        .get(classId, userId);
      if (!classRow) return res.status(403).json({ error: 'Class not found or access denied' });

      db.prepare('UPDATE teacher_lessons SET class_id = ?, updated_at = ? WHERE id = ?')
        .run(classId, new Date().toISOString(), req.params.id);

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
      const text = await extractTextFromFile(req.file.path);
      const wordCount = text.split(/\s+/).filter(Boolean).length;
      // Clean up temp file
      try { await fs.remove(req.file.path); } catch {}
      return res.json({ text: text.slice(0, 80000), filename: req.file.originalname, wordCount });
    } catch (err) {
      return res.status(500).json({ error: safeError(err) });
    }
  });

  // ── GET /api/school/quests/today ──────────────────────────────────────────
  router.get('/school/quests/today', (req, res) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorised' });

    const today = new Date().toISOString().split('T')[0];

    // Check if today's quests already exist
    const existing = db.prepare(
      `SELECT * FROM student_daily_quests WHERE student_user_id = ? AND quest_date = ?`
    ).all(userId, today) as Array<{ id: string; quest_type: string; target: number; progress: number; completed: number; xp_reward: number }>;

    if (existing.length >= 3) return res.json({ quests: existing, date: today });

    // Generate quests for today
    const questDefs = generateDailyQuests(userId, today);
    const now = new Date().toISOString();
    const quests = questDefs.map(def => {
      const existingQuest = existing.find(e => e.quest_type === def.quest_type);
      if (existingQuest) return existingQuest;
      const id = crypto.randomUUID();
      try {
        db.prepare(
          `INSERT OR IGNORE INTO student_daily_quests (id, student_user_id, quest_type, quest_date, target, progress, completed, xp_reward, created_at) VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?)`
        ).run(id, userId, def.quest_type, today, def.target, def.xp_reward, now);
      } catch {}
      return { id, quest_type: def.quest_type, target: def.target, progress: 0, completed: 0, xp_reward: def.xp_reward };
    });

    return res.json({ quests, date: today });
  });

  // ── POST /api/school/quests/:id/progress ──────────────────────────────────
  router.post('/school/quests/:id/progress', (req, res) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorised' });

    const quest = db.prepare(
      `SELECT * FROM student_daily_quests WHERE id = ? AND student_user_id = ?`
    ).get(req.params.id, userId) as { id: string; progress: number; target: number; completed: number; xp_reward: number; quest_date: string } | undefined;

    if (!quest) return res.status(404).json({ error: 'Quest not found' });
    if (quest.completed) return res.json({ quest, alreadyCompleted: true });

    const newProgress = quest.progress + 1;
    const nowComplete = newProgress >= quest.target ? 1 : 0;

    db.prepare(
      `UPDATE student_daily_quests SET progress = ?, completed = ? WHERE id = ?`
    ).run(newProgress, nowComplete, quest.id);

    if (nowComplete) {
      updateGrowthProfile(db, userId, 'quest_complete');
    }

    return res.json({ progress: newProgress, completed: nowComplete === 1, xp_reward: quest.xp_reward });
  });

  // ── GET /api/school/review-cards ──────────────────────────────────────────
  router.get('/school/review-cards', (req, res) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorised' });
    const today = new Date().toISOString().split('T')[0];
    const cards = db.prepare(
      `SELECT * FROM review_cards WHERE student_user_id = ? AND (due_date IS NULL OR due_date <= ?) ORDER BY due_date ASC LIMIT 20`
    ).all(userId, today);
    return res.json({ cards, date: today });
  });

  // ── POST /api/school/review-cards ─────────────────────────────────────────
  router.post('/school/review-cards', (req, res) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorised' });
    const { subjectId = 'mathematics', front, back, source = 'manual' } = req.body as Record<string, string>;
    if (!front || !back) return res.status(400).json({ error: 'front and back required' });
    const id = crypto.randomUUID();
    const today = new Date().toISOString().split('T')[0];
    db.prepare(
      `INSERT INTO review_cards (id, student_user_id, subject_id, front, back, source, due_date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, userId, subjectId, front, back, source, today, new Date().toISOString());
    return res.status(201).json({ id });
  });

  // ── PATCH /api/school/review-cards/:id/review ─────────────────────────────
  router.patch('/school/review-cards/:id/review', (req, res) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorised' });
    const card = db.prepare(`SELECT * FROM review_cards WHERE id = ? AND student_user_id = ?`).get(req.params.id, userId) as {
      id: string; interval_days: number; ease_factor: number; repetitions: number;
    } | undefined;
    if (!card) return res.status(404).json({ error: 'Card not found' });
    const quality = Number(req.body.quality ?? 3);
    const updated = sm2Update(card.interval_days, card.ease_factor, card.repetitions, quality);
    db.prepare(
      `UPDATE review_cards SET interval_days = ?, ease_factor = ?, repetitions = ?, due_date = ? WHERE id = ?`
    ).run(updated.interval, updated.ease, updated.repetitions, updated.dueDate, card.id);
    // Quest progress for review_card
    try {
      const today = new Date().toISOString().split('T')[0];
      const reviewQuest = db.prepare(`SELECT id FROM student_daily_quests WHERE student_user_id = ? AND quest_date = ? AND quest_type = 'review_card' AND completed = 0`).get(userId, today) as { id: string } | undefined;
      if (reviewQuest) {
        db.prepare(`UPDATE student_daily_quests SET progress = MIN(target, progress + 1), completed = CASE WHEN progress + 1 >= target THEN 1 ELSE 0 END WHERE id = ?`).run(reviewQuest.id);
      }
    } catch {}
    return res.json({ ok: true, ...updated });
  });

  // ── DELETE /api/school/review-cards/:id ───────────────────────────────────
  router.delete('/school/review-cards/:id', (req, res) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorised' });
    db.prepare(`DELETE FROM review_cards WHERE id = ? AND student_user_id = ?`).run(req.params.id, userId);
    return res.json({ ok: true });
  });

  // ── GET /api/school/parent/child-summary/:childId ─────────────────────────
  router.get('/school/parent/child-summary/:childId', (req, res) => {
    const guardianId = req.user?.id;
    if (!guardianId) return res.status(401).json({ error: 'Unauthorised' });
    const childId = req.params.childId;

    // Verify guardian link
    const link = db.prepare(`SELECT * FROM guardian_student_links WHERE guardian_user_id = ? AND student_user_id = ?`).get(guardianId, childId);
    if (!link) return res.status(403).json({ error: 'Not linked' });

    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const today = new Date().toISOString().split('T')[0];

    const growth = db.prepare(`SELECT stage, total_xp, current_streak, last_active_date FROM student_growth_profiles WHERE student_user_id = ?`).get(childId) as { stage: string; total_xp: number; current_streak: number; last_active_date: string } | undefined;
    const student = db.prepare(`SELECT display_name, username FROM users WHERE id = ?`).get(childId) as { display_name: string; username: string } | undefined;

    // Sessions count (use XP events as proxy)
    const sessions = db.prepare(`SELECT COUNT(*) as count FROM student_xp_events WHERE student_user_id = ? AND created_at >= ?`).get(childId, sevenDaysAgo) as { count: number };

    // Review cards due
    let reviewCardsDue = 0;
    try {
      const rc = db.prepare(`SELECT COUNT(*) as count FROM review_cards WHERE student_user_id = ? AND due_date <= ?`).get(childId, today) as { count: number };
      reviewCardsDue = rc.count;
    } catch {}

    // Subjects from progress
    let subjects: string[] = [];
    try {
      const progressRows = db.prepare(`SELECT subject_id FROM student_progress WHERE student_user_id = ?`).all(childId) as { subject_id: string }[];
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
  router.patch('/school/classes/:classId/students/:studentId/settings', (req, res) => {
    const teacherId = req.user?.id;
    if (!teacherId) return res.status(401).json({ error: 'Unauthorised' });
    const { teacherLevelOverride, senOverride } = req.body as Record<string, string>;

    // Verify teacher owns this class
    const cls = db.prepare(`SELECT id FROM school_classes WHERE id = ? AND teacher_user_id = ?`).get(req.params.classId, teacherId);
    if (!cls) return res.status(403).json({ error: 'Forbidden' });

    // Store override in student_class_enrollments (add columns if needed)
    try { db.exec(`ALTER TABLE student_class_enrollments ADD COLUMN teacher_level_override TEXT`); } catch {}
    try { db.exec(`ALTER TABLE student_class_enrollments ADD COLUMN sen_override TEXT`); } catch {}

    db.prepare(`UPDATE student_class_enrollments SET teacher_level_override = ?, sen_override = ? WHERE class_id = ? AND student_user_id = ?`)
      .run(teacherLevelOverride ?? null, senOverride ?? null, req.params.classId, req.params.studentId);

    return res.json({ ok: true });
  });

  return router;
}
