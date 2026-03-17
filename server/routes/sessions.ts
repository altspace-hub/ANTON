import { Router } from 'express';
import type { DatabaseAdapter } from '../db/database.js';

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
        conditions.push('(s.title LIKE ? OR s.note LIKE ?)');
        const searchParam = `%${search.trim()}%`;
        params.push(searchParam, searchParam);
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
      const { moduleId, title, config } = req.body;
      const userId = req.user?.id;
      const id = crypto.randomUUID();
      await db.run('INSERT INTO sessions (id, module_id, title, config, user_id) VALUES (?, ?, ?, ?, ?)', id,
        moduleId,
        title,
        JSON.stringify(config || {}),
        userId);
      res.json({ id, moduleId, title, config });
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
        WHERE created_at >= datetime('now', '-7 days')
        ${userRole === 'admin' ? '' : 'AND user_id = ?'}
      `, ...userParams) as { count: number } | undefined;

      const thisMonthRow = await db.get(`
        SELECT COUNT(*) as count FROM sessions
        WHERE created_at >= datetime('now', '-30 days')
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
      const whereClause = userRole === 'admin' ? 'WHERE id = ?' : 'WHERE id = ? AND user_id = ?';
      const params = userRole === 'admin' ? [req.params.id] : [req.params.id, userId!];

      const session = await db.get(`SELECT * FROM sessions ${whereClause}`, ...params);
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

      await db.run('UPDATE sessions SET review_status = ?, reviewed_by = ?, reviewed_at = ?, updated_at = ? WHERE id = ?'
      , 
        status,
        status === 'draft' ? null : (reviewedBy || null),
        status === 'draft' ? null : new Date().toISOString(),
        new Date().toISOString(),
        req.params.id
      );
      res.json({ ok: true, status, reviewedBy: reviewedBy || null });
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
