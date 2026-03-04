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
import { streamToResponse, isApiKeyConfigured } from '../services/claude-client.js';
import { buildSchoolPrompt, inferMathsModule, inferSubjectModule, type SchoolPromptConfig } from '../services/school-prompt-builder.js';
import { safeError } from '../lib/error-response.js';

// ── Helpers ────────────────────────────────────────────────────────────────

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
};

function buildPromptConfig(
  body: Record<string, unknown>,
  classRow: Record<string, unknown> | null
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
  };
}

// ── Factory ────────────────────────────────────────────────────────────────

export function createSchoolRoutes(db: Database.Database) {
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
      } = req.body as Record<string, unknown>;

      let classRow: Record<string, unknown> | null = null;
      if (classId) {
        classRow = db.prepare('SELECT * FROM school_classes WHERE id = ?')
          .get(classId as string) as Record<string, unknown> | null;
      }

      // Auto-infer module from last user message if not supplied
      const lastUserMsg = Array.isArray(messages) && messages.length > 0
        ? String((messages[messages.length - 1] as Record<string, unknown>)?.content ?? '')
        : '';
      const subjectForInfer = (classRow?.subject_id as string) || (req.body.subjectId as string) || 'mathematics';
      const resolvedModuleId = (req.body.moduleId as string) || inferSubjectModule(lastUserMsg, subjectForInfer);

      const promptConfig = buildPromptConfig(
        { ...req.body as Record<string, unknown>, moduleId: resolvedModuleId },
        classRow
      );

      const systemPrompt = await buildSchoolPrompt(promptConfig);

      const apiMessages = (Array.isArray(messages) ? messages : []).map(
        (m: Record<string, unknown>) => ({
          role: (m.role as 'user' | 'assistant') || 'user',
          content: String(m.content || ''),
        })
      );

      const onComplete = sessionId
        ? (data: { text: string; outputTokens: number }) => {
            try {
              db.prepare(
                `INSERT INTO messages (id, session_id, role, content, token_count, created_at)
                 VALUES (?, ?, 'assistant', ?, ?, ?)`
              ).run(crypto.randomUUID(), sessionId as string, data.text, data.outputTokens, new Date().toISOString());
              db.prepare('UPDATE sessions SET updated_at = ? WHERE id = ? AND user_id = ?')
                .run(new Date().toISOString(), sessionId as string, userId);
            } catch (e) {
              console.warn('[school/chat] persist error (non-fatal):', e);
            }
          }
        : undefined;

      await streamToResponse(
        { model: 'claude-sonnet-4-6', thinking: 'think', system: systemPrompt, messages: apiMessages, maxTokens: 4096 },
        res,
        onComplete as Parameters<typeof streamToResponse>[2]
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

      res.json({ role: 'student', classes, assignments });
    } catch (err) {
      console.error('[school/dashboard]', err);
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

      res.json({ ...classRow, students });
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

      const { name, subject, educationTier, curriculumId, defaultAssistanceLevel, webSearchEnabled } = req.body as Record<string, unknown>;

      db.prepare(
        `UPDATE school_classes SET
           name = COALESCE(?, name),
           subject_id = COALESCE(?, subject_id),
           education_tier = COALESCE(?, education_tier),
           curriculum_id = COALESCE(?, curriculum_id),
           default_assistance_level = COALESCE(?, default_assistance_level),
           web_search_enabled = COALESCE(?, web_search_enabled),
           updated_at = ?
         WHERE id = ?`
      ).run(
        name ?? null, subject ?? null, educationTier ?? null,
        curriculumId ?? null, defaultAssistanceLevel ?? null,
        webSearchEnabled !== undefined ? (webSearchEnabled ? 1 : 0) : null,
        new Date().toISOString(), req.params.id
      );

      res.json(db.prepare('SELECT * FROM school_classes WHERE id = ?').get(req.params.id));
    } catch (err) {
      console.error('[school/classes/:id PUT]', err);
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
        assignmentType = 'homework', subjectId,
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
            questions, total_marks, assistance_level_override, due_date, content, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id, userId, classId as string, title as string, description as string,
        assignmentType as string, resolvedSubjectId,
        JSON.stringify(questions), totalMarks as number,
        (assistanceLevelOverride as string) || null,
        (dueDate as string) || null,
        '{}', now, now
      );

      res.status(201).json({ id, classId, title });
    } catch (err) {
      console.error('[school/assignments POST]', err);
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

  return router;
}
