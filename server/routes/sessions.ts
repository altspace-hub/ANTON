import { Router } from 'express';
import type { DatabaseAdapter } from '../db/database.js';
import { ilike } from '../db/dialect-helpers.js';
import { callChat } from '../services/provider-router.js';
import { getRoutedUtilityModel } from '../services/utility-model.js';
import { resolveProjectAccess } from '../services/project-context.js';
import { isDemoMode } from '../middleware/demo-mode.js';
import { deleteSessionRows } from '../services/demo-retention.js';

// Lazy read — a module-scope snapshot would evaluate before index.ts resolves
// DEPLOYMENT_MODE (see middleware/auth.ts).
const isTeamMode = () => process.env.DEPLOYMENT_MODE === 'team';

/** Neutral on purpose: the old browser-side prompt titled every chat as an
 *  "FCP compliance consultation", whatever it was about. */
const TITLE_SYSTEM_PROMPT =
  'You write concise titles for saved work sessions. Given the user request and a preview of the answer, ' +
  'output ONLY a 5-8 word title that captures the core topic. No quotes, no trailing punctuation, no explanation.';

/**
 * Title generations in flight, per user. The route is a priced model call on a
 * compat default, behind no model-call limiter: one account could put hundreds
 * of them in flight at once, every one passing the daily spend cap at the same
 * settled total (review L1). One at a time per user is all the page needs —
 * it asks once, after a session's first answer.
 */
const titleGenerationsInFlight = new Set<string>();

export async function createSessionRoutes(db: DatabaseAdapter) {
  const router = Router();

  // GET /api/sessions — list sessions with aggregated token counts
  router.get('/sessions', async (req, res) => {
    try {
      const userId = req.user?.id;
      const userRole = req.user?.role;
      const moduleId = req.query.moduleId as string | undefined;
      const search = req.query.search as string | undefined;
      const hasOutput = req.query.hasOutput === 'true';
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const offset = parseInt(req.query.offset as string) || 0;

      // Build WHERE conditions
      const conditions: string[] = [];
      const params: (string | number)[] = [];

      if (userRole !== 'admin') {
        conditions.push('s.user_id = ?');
        params.push(userId!);
      }
      if (moduleId) {
        conditions.push('s.module_id = ?');
        params.push(moduleId);
      }
      if (search?.trim()) {
        const term = search.trim();
        const searchParam = `%${term}%`;
        // Case-insensitive on both dialects (PG LIKE is case-sensitive; use ILIKE there)
        const searchClauses = [ilike(db.dialect, 's.title'), ilike(db.dialect, 's.note')];
        params.push(searchParam, searchParam);
        // Also match message content — guarded to terms ≥ 3 chars so short
        // queries don't scan the (much larger) messages table needlessly.
        if (term.length >= 3) {
          searchClauses.push(
            `EXISTS (SELECT 1 FROM messages ms WHERE ms.session_id = s.id AND ${ilike(db.dialect, 'ms.content')})`
          );
          params.push(searchParam);
        }
        conditions.push(`(${searchClauses.join(' OR ')})`);
      }

      const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

      // HAVING clause for hasOutput filter (sessions with at least 1 assistant message)
      const havingClause = hasOutput ? 'HAVING COUNT(CASE WHEN m.role = \'assistant\' THEN 1 END) > 0' : '';

      const baseQuery = `
        SELECT s.*,
          COALESCE(SUM(CASE WHEN m.role = 'assistant' THEN COALESCE(m.token_count, 0) ELSE 0 END), 0) AS total_tokens,
          COUNT(CASE WHEN m.role = 'assistant' THEN 1 END) AS message_count,
          (SELECT SUBSTR(m2.content, 1, 120) FROM messages m2
           WHERE m2.session_id = s.id AND m2.role = 'assistant'
           ORDER BY m2.created_at DESC LIMIT 1) AS last_message_preview
        FROM sessions s
        LEFT JOIN messages m ON m.session_id = s.id
        ${whereClause}
        GROUP BY s.id
        ${havingClause}
        ORDER BY s.updated_at DESC
        LIMIT ? OFFSET ?
      `;

      params.push(limit, offset);

      const sessions = await db.all(baseQuery, ...params);
      res.json(sessions);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch sessions' });
    }
  });

  // POST /api/sessions — create session
  router.post('/sessions', async (req, res) => {
    try {
      const { moduleId, title, config, projectId } = req.body as { moduleId: string; title: string; config?: unknown; projectId?: unknown };
      const userId = req.user?.id;
      const id = crypto.randomUUID();
      // A session can be born inside a project. project_id could only ever be
      // set by a later PATCH, and containment that needs a second step after
      // the work is done is containment nobody performs: 0 of 54 sessions here.
      const project = typeof projectId === 'string' && projectId.trim() ? projectId.trim() : null;
      // Wave 4: a project id was stored unchecked — any string, any project,
      // any caller — and the run then read that project's sessions. The
      // project must exist and, in team mode, be one the caller belongs to.
      if (project) {
        const access = await resolveProjectAccess(db, { projectId: project, userId: userId ?? 'solo', userRole: req.user?.role ?? null, teamMode: isTeamMode() });
        if (access === 'not_found') { res.status(404).json({ error: 'Project not found' }); return; }
        if (access === 'forbidden') { res.status(403).json({ error: 'Not a member of this project' }); return; }
      }
      await db.run('INSERT INTO sessions (id, module_id, title, config, user_id, project_id) VALUES (?, ?, ?, ?, ?, ?)', id,
        moduleId,
        title,
        JSON.stringify(config || {}),
        userId,
        project);
      res.json({ id, moduleId, title, config, projectId: project });
    } catch (error) {
      res.status(500).json({ error: 'Failed to create session' });
    }
  });

  // GET /api/sessions/stats — aggregate stats for dashboard
  router.get('/sessions/stats', async (req, res) => {
    try {
      const userId = req.user?.id;
      const userRole = req.user?.role;

      // Build where clause for user isolation
      const userFilter = userRole === 'admin' ? '' : 'WHERE user_id = ?';
      const userParams = userRole === 'admin' ? [] : [userId!];

      const totalSessionsRow = await db.get(`SELECT COUNT(*) as count FROM sessions ${userFilter}`, ...userParams) as { count: number };

      const totalMessagesRow = await db.get(`
        SELECT COUNT(*) as count FROM messages
        WHERE role = 'assistant'
        ${userRole === 'admin' ? '' : 'AND session_id IN (SELECT id FROM sessions WHERE user_id = ?)'}
      `, ...userParams) as { count: number };

      const totalOutputTokensRow = await db.get(`
        SELECT SUM(token_count) as total FROM messages
        WHERE role = 'assistant'
        ${userRole === 'admin' ? '' : 'AND session_id IN (SELECT id FROM sessions WHERE user_id = ?)'}
      `, ...userParams) as { total: number | null };

      const topModules = await db.all(`
        SELECT module_id as moduleId, COUNT(*) as count FROM sessions
        ${userFilter}
        GROUP BY module_id ORDER BY count DESC LIMIT 5
      `, ...userParams) as Array<{ moduleId: string; count: number }>;

      // Sprint 5: Additional stats
      const thisWeekRow = await db.get(`
        SELECT COUNT(*) as count FROM sessions
        WHERE created_at >= NOW() - INTERVAL '7 days'
        ${userRole === 'admin' ? '' : 'AND user_id = ?'}
      `, ...userParams) as { count: number } | undefined;

      const thisMonthRow = await db.get(`
        SELECT COUNT(*) as count FROM sessions
        WHERE created_at >= NOW() - INTERVAL '30 days'
        ${userRole === 'admin' ? '' : 'AND user_id = ?'}
      `, ...userParams) as { count: number } | undefined;

      const recentSessions = await db.all(`
        SELECT s.id, s.title, s.module_id, s.created_at,
               COALESCE(SUM(m.token_count), 0) as tokens
        FROM sessions s
        LEFT JOIN messages m ON s.id = m.session_id AND m.role = 'assistant'
        ${userFilter}
        GROUP BY s.id
        ORDER BY s.created_at DESC
        LIMIT 5
      `, ...userParams) as Array<{ id: string; title: string; module_id: string; created_at: string; tokens: number }>;

      res.json({
        totalSessions: totalSessionsRow.count,
        totalMessages: totalMessagesRow.count,
        totalOutputTokens: totalOutputTokensRow.total ?? 0,
        topModules,
        thisWeekSessions: thisWeekRow?.count ?? 0,
        thisMonthSessions: thisMonthRow?.count ?? 0,
        recentSessions,
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch stats' });
    }
  });

  // GET /api/sessions/:id — get session with messages
  router.get('/sessions/:id', async (req, res) => {
    try {
      const userId = req.user?.id;
      const userRole = req.user?.role;

      // Check ownership (admins can see all sessions)
      const whereClause = userRole === 'admin' ? 'WHERE s.id = ?' : 'WHERE s.id = ? AND s.user_id = ?';
      const params = userRole === 'admin' ? [req.params.id] : [req.params.id, userId!];

      // project_name rides along so a restored chat can show its matter without a second call.
      const session = await db.get(
        `SELECT s.*, p.name AS project_name FROM sessions s LEFT JOIN projects p ON p.id = s.project_id ${whereClause}`,
        ...params,
      );
      if (!session) {
        res.status(404).json({ error: 'Session not found or access denied' });
        return;
      }
      const messages = (await db.all('SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC', req.params.id) as Record<string, unknown>[])
        .map((m) => ({
          ...m,
          config_snapshot: m.config_snapshot
            ? JSON.parse(m.config_snapshot as string)
            : null,
        }));
      res.json({ ...session as object, messages });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch session' });
    }
  });

  // POST /api/sessions/:id/title/generate — a 5-8 word title from the first
  // exchange. Used to be a full /claude/message turn from the browser: every
  // knowledge layer assembled, an interactive engine slot taken at the moment
  // the user is most likely to type a follow-up (the engine has two), and an
  // FCP-flavoured prompt for every chat. Now one small utility call, marked
  // background so it yields to interactive work. Best-effort: on failure the
  // 80-character first-line title simply stays.
  router.post('/sessions/:id/title/generate', async (req, res) => {
    const flightKey = req.user?.id || req.ip || 'anonymous';
    let holdsSlot = false;
    try {
      const { userMessage, responsePreview } = req.body as { userMessage?: string; responsePreview?: string };
      if (typeof userMessage !== 'string' || !userMessage.trim()) {
        res.status(400).json({ error: 'userMessage is required' });
        return;
      }
      const userId = req.user?.id;
      const userRole = req.user?.role;
      const owned = userRole === 'admin'
        ? await db.get('SELECT id FROM sessions WHERE id = ?', req.params.id)
        : await db.get('SELECT id FROM sessions WHERE id = ? AND user_id = ?', req.params.id, userId!);
      if (!owned) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }
      if (titleGenerationsInFlight.has(flightKey)) {
        // Best-effort by contract: the caller keeps its first-line title.
        res.status(429).json({ title: null, error: 'A title is already being generated. Try again in a moment.' });
        return;
      }
      titleGenerationsInFlight.add(flightKey);
      holdsSlot = true;

      const chat = await callChat({
        model: await getRoutedUtilityModel(db),
        system: TITLE_SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: `User request: "${userMessage.slice(0, 400)}"\nAnswer preview: "${String(responsePreview ?? '').slice(0, 600)}"`,
        }],
        maxTokens: 40,
        background: true,
        db,
      });
      const title = chat.text.trim().split('\n')[0].replace(/^["']|["']$/g, '').replace(/[.!?]$/, '').slice(0, 120);
      if (title) {
        await db.run('UPDATE sessions SET title = ?, updated_at = ? WHERE id = ?', title, new Date().toISOString(), req.params.id);
      }
      res.json({ title: title || null });
    } catch (error) {
      // Best-effort by contract: the caller keeps the first-line title.
      console.warn('[sessions] title generation failed:', error instanceof Error ? error.message : error);
      res.json({ title: null });
    } finally {
      if (holdsSlot) titleGenerationsInFlight.delete(flightKey);
    }
  });

  // PATCH /api/sessions/:id — update title and/or note
  router.patch('/sessions/:id', async (req, res) => {
    try {
      const { title, note } = req.body as { title?: string; note?: string };
      if (!title?.trim() && note === undefined) {
        res.status(400).json({ error: 'title or note is required' });
        return;
      }

      const userId = req.user?.id;
      const userRole = req.user?.role;

      // Build SET clause dynamically
      const setClauses: string[] = [];
      const setParams: (string | null)[] = [];

      if (title?.trim()) {
        setClauses.push('title = ?');
        setParams.push(title.trim());
      }
      if (note !== undefined) {
        setClauses.push('note = ?');
        setParams.push(note?.trim() || null);
      }
      setClauses.push('updated_at = ?');
      setParams.push(new Date().toISOString());

      // Check ownership before update
      const whereClause = userRole === 'admin' ? 'WHERE id = ?' : 'WHERE id = ? AND user_id = ?';
      const params = userRole === 'admin'
        ? [...setParams, req.params.id]
        : [...setParams, req.params.id, userId!];

      const result = await db.run(`UPDATE sessions SET ${setClauses.join(', ')} ${whereClause}`, ...params);

      if (result.changes === 0) {
        res.status(404).json({ error: 'Session not found or access denied' });
        return;
      }

      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to update session' });
    }
  });

  // PATCH /api/sessions/:id/review-status — update human review status
  router.patch('/sessions/:id/review-status', async (req, res) => {
    try {
      const { status, reviewedBy } = req.body as { status: string; reviewedBy?: string };
      if (!['draft', 'reviewed', 'approved'].includes(status)) {
        res.status(400).json({ error: 'Invalid status. Must be draft, reviewed, or approved.' });
        return;
      }

      const userId = req.user?.id;
      const userRole = req.user?.role;

      // Check ownership
      const whereClause = userRole === 'admin' ? 'WHERE id = ?' : 'WHERE id = ? AND user_id = ?';
      const checkParams = userRole === 'admin' ? [req.params.id] : [req.params.id, userId!];

      const session = await db.get(`SELECT * FROM sessions ${whereClause}`, ...checkParams);
      if (!session) {
        res.status(404).json({ error: 'Session not found or access denied' });
        return;
      }

      // Public demo: a visitor's review carries no name. The page sends only
      // the status; a name typed into a direct API call would be a real name
      // the demo says it does not collect (privacy review L8).
      const reviewer = isDemoMode() && userRole !== 'admin' ? null : (reviewedBy || null);
      await db.run('UPDATE sessions SET review_status = ?, reviewed_by = ?, reviewed_at = ?, updated_at = ? WHERE id = ?'
      ,
        status,
        status === 'draft' ? null : reviewer,
        status === 'draft' ? null : new Date().toISOString(),
        new Date().toISOString(),
        req.params.id
      );
      res.json({ ok: true, status, reviewedBy: reviewer });
    } catch (error) {
      res.status(500).json({ error: 'Failed to update review status' });
    }
  });

  // DELETE /api/sessions/:id
  router.delete('/sessions/:id', async (req, res) => {
    try {
      const userId = req.user?.id;
      const userRole = req.user?.role;

      // Check ownership before delete
      const whereClause = userRole === 'admin' ? 'WHERE id = ?' : 'WHERE id = ? AND user_id = ?';
      const params = userRole === 'admin' ? [req.params.id] : [req.params.id, userId!];

      // Ownership first: the rows below are deleted only for a session that is
      // the caller's. They have no foreign key to sessions — copies of its
      // answers (versions, embeddings) and, on the public demo, every row keyed
      // by it — and nothing could reach them once the session is gone.
      const owned = await db.get<{ id: string }>(`SELECT id FROM sessions ${whereClause}`, ...params);
      if (!owned) {
        res.status(404).json({ error: 'Session not found or access denied' });
        return;
      }
      const related = await deleteSessionRows(db, owned.id, { allSessionRows: isDemoMode() });
      if (related.errors.length > 0) {
        console.warn(`[sessions] delete: ${related.errors.length} related statement(s) failed: ${related.errors.map((e) => `${e.table}(${e.code})`).join(' ')}`);
      }

      const result = await db.run(`DELETE FROM sessions ${whereClause}`, ...params);

      if (result.changes === 0) {
        res.status(404).json({ error: 'Session not found or access denied' });
        return;
      }

      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete session' });
    }
  });

  // POST /api/sessions/:id/share — generate a shareable read-only link
  router.post('/sessions/:id/share', async (req, res) => {
    try {
      const userId = req.user?.id;
      const userRole = req.user?.role;

      // Check ownership
      const whereClause = userRole === 'admin' ? 'WHERE id = ?' : 'WHERE id = ? AND user_id = ?';
      const params = userRole === 'admin' ? [req.params.id] : [req.params.id, userId!];

      const session = await db.get(`SELECT * FROM sessions ${whereClause}`, ...params) as Record<string, unknown> | undefined;
      if (!session) {
        res.status(404).json({ error: 'Session not found or access denied' });
        return;
      }
      // Reuse existing token or generate a new one
      let token = session.share_token as string | null;
      if (!token) {
        token = crypto.randomUUID().replace(/-/g, '');
        await db.run('UPDATE sessions SET share_token = ?, shared_at = ? WHERE id = ?', token, new Date().toISOString(), req.params.id);
      }
      res.json({ token, url: `/share/${token}` });
    } catch (error) {
      res.status(500).json({ error: 'Failed to generate share link' });
    }
  });

  // GET /api/share/:token — public read-only session viewer (no auth required)
  router.get('/share/:token', async (req, res) => {
    try {
      const session = await db.get('SELECT * FROM sessions WHERE share_token = ?', req.params.token) as Record<string, unknown> | undefined;
      if (!session) {
        res.status(404).json({ error: 'Share link not found or expired' });
        return;
      }
      const messages = await db.all('SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC', session.id as string) as Array<Record<string, unknown>>;
      const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
      res.json({
        sessionId: session.id,
        title: session.title,
        moduleId: session.module_id,
        sharedAt: session.shared_at,
        output: lastAssistant?.content ?? '',
        messageCount: messages.length,
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch shared session' });
    }
  });

  return router;
}
