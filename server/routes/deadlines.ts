import { Router } from 'express';
import { randomUUID } from 'crypto';
import type { DatabaseAdapter } from '../db/database.js';
import { createTimeIntelligence } from '../services/time-intelligence.js';

export async function createDeadlinesRoutes(db: DatabaseAdapter) {
  const router = Router();
  const ti = await createTimeIntelligence(db);

  // Resolve current user id (solo mode uses 'default', team mode uses JWT user)
  function getUserId(req: Parameters<Parameters<typeof router.get>[1]>[0]): string {
    return (req as unknown as { user?: { id?: string } }).user?.id ?? 'default';
  }

  // GET /api/deadlines/morning-brief — must be before /:id route
  router.get('/deadlines/morning-brief', async (req, res) => {
    try {
      const userId = getUserId(req);
      const brief = await ti.getMorningBrief(userId);
      res.json(brief);
    } catch (err) {
      console.error('[deadlines] morning-brief error:', err);
      res.status(500).json({ error: 'Failed to fetch morning brief' });
    }
  });

  // GET /api/deadlines/conflicts
  router.get('/deadlines/conflicts', async (req, res) => {
    try {
      const userId = getUserId(req);
      const conflicts = await ti.detectConflicts(userId);
      res.json(conflicts);
    } catch (err) {
      console.error('[deadlines] conflicts error:', err);
      res.status(500).json({ error: 'Failed to detect conflicts' });
    }
  });

  // DELETE /api/deadlines/reminders/:reminderId
  router.delete('/deadlines/reminders/:reminderId', async (req, res) => {
    try {
      const result = await db.run('DELETE FROM deadline_reminders WHERE id = ?', req.params.reminderId);
      if (result.changes === 0) {
        res.status(404).json({ error: 'Reminder not found' });
        return;
      }
      res.json({ ok: true });
    } catch (err) {
      console.error('[deadlines] delete reminder error:', err);
      res.status(500).json({ error: 'Failed to delete reminder' });
    }
  });

  // PUT /api/deadlines/reorder
  router.put('/deadlines/reorder', async (req, res) => {
    try {
      const updates = req.body as Array<{ id: string; sort_order: number; kanban_column?: string }>;
      if (!Array.isArray(updates)) {
        res.status(400).json({ error: 'Expected array of updates' });
        return;
      }
      await ti.reorderDeadlines(updates);
      res.json({ ok: true });
    } catch (err) {
      console.error('[deadlines] reorder error:', err);
      res.status(500).json({ error: 'Failed to reorder deadlines' });
    }
  });

  // GET /api/deadline-labels
  router.get('/deadline-labels', async (_req, res) => {
    try {
      const labels = await db.all('SELECT * FROM deadline_labels ORDER BY name');
      res.json(labels);
    } catch (err) {
      console.error('[deadlines] labels error:', err);
      res.status(500).json({ error: 'Failed to fetch labels' });
    }
  });

  // POST /api/deadline-labels
  router.post('/deadline-labels', async (req, res) => {
    try {
      const { name, color } = req.body as { name?: string; color?: string };
      if (!name?.trim()) {
        res.status(400).json({ error: 'name is required' });
        return;
      }
      const id = 'lbl-' + randomUUID().slice(0, 8);
      await db.run('INSERT INTO deadline_labels (id, name, color) VALUES (?, ?, ?)', id, name.trim(), color || '#2DD4A8');
      const label = await db.get('SELECT * FROM deadline_labels WHERE id = ?', id);
      res.status(201).json(label);
    } catch (err) {
      console.error('[deadlines] create label error:', err);
      res.status(500).json({ error: 'Failed to create label' });
    }
  });

  // DELETE /api/deadline-labels/:id
  router.delete('/deadline-labels/:id', async (req, res) => {
    try {
      const result = await db.run('DELETE FROM deadline_labels WHERE id = ?', req.params.id);
      if (result.changes === 0) {
        res.status(404).json({ error: 'Label not found' });
        return;
      }
      res.json({ ok: true });
    } catch (err) {
      console.error('[deadlines] delete label error:', err);
      res.status(500).json({ error: 'Failed to delete label' });
    }
  });

  // GET /api/deadlines
  router.get('/deadlines', async (req, res) => {
    try {
      const userId = getUserId(req);
      const { status, priority, from, to, project_id, parent_id, kanban_column } = req.query as Record<string, string | undefined>;
      const deadlines = await ti.getDeadlines(userId, { status, priority, from, to, project_id, parent_id, kanban_column });
      res.json(deadlines);
    } catch (err) {
      console.error('[deadlines] list error:', err);
      res.status(500).json({ error: 'Failed to fetch deadlines' });
    }
  });

  // POST /api/deadlines
  router.post('/deadlines', async (req, res) => {
    try {
      const userId = getUserId(req);
      const {
        title, description, due_date, category, priority,
        preparation_days, review_days, buffer_days, owner_id,
        parent_id, project_id, labels, assigned_to, effort_hours,
        kanban_column, notes,
      } = req.body as {
        title?: string;
        description?: string;
        due_date?: string;
        category?: string;
        priority?: string;
        preparation_days?: number;
        review_days?: number;
        buffer_days?: number;
        owner_id?: string;
        parent_id?: string;
        project_id?: string;
        labels?: string;
        assigned_to?: string;
        effort_hours?: number;
        kanban_column?: string;
        notes?: string;
      };

      if (!title?.trim()) {
        res.status(400).json({ error: 'title is required' });
        return;
      }
      if (!due_date) {
        res.status(400).json({ error: 'due_date is required' });
        return;
      }

      const deadline = await ti.createDeadline(
        {
          title: title.trim(), description, due_date, category, priority,
          preparation_days, review_days, buffer_days, owner_id,
          parent_id, project_id, labels, assigned_to, effort_hours,
          kanban_column, notes,
        },
        userId
      );
      res.status(201).json(deadline);
    } catch (err) {
      console.error('[deadlines] create error:', err);
      res.status(500).json({ error: 'Failed to create deadline' });
    }
  });

  // GET /api/deadlines/:id/subtasks
  router.get('/deadlines/:id/subtasks', async (req, res) => {
    try {
      const subtasks = await ti.getSubtasks(req.params.id);
      res.json(subtasks);
    } catch (err) {
      console.error('[deadlines] subtasks error:', err);
      res.status(500).json({ error: 'Failed to fetch subtasks' });
    }
  });

  // GET /api/deadlines/:id/reminders
  router.get('/deadlines/:id/reminders', async (req, res) => {
    try {
      const reminders = await db.all('SELECT * FROM deadline_reminders WHERE deadline_id = ? ORDER BY remind_days_before DESC', req.params.id);
      res.json(reminders);
    } catch (err) {
      console.error('[deadlines] reminders error:', err);
      res.status(500).json({ error: 'Failed to fetch reminders' });
    }
  });

  // POST /api/deadlines/:id/reminders
  router.post('/deadlines/:id/reminders', async (req, res) => {
    try {
      const { remind_days_before, remind_via, email_address } = req.body as {
        remind_days_before?: number;
        remind_via?: string;
        email_address?: string;
      };
      if (!remind_days_before || remind_days_before < 1) {
        res.status(400).json({ error: 'remind_days_before must be >= 1' });
        return;
      }
      const id = randomUUID();
      await db.run('INSERT INTO deadline_reminders (id, deadline_id, remind_days_before, remind_via, email_address) VALUES (?, ?, ?, ?, ?)', id, req.params.id, remind_days_before, remind_via || 'email', email_address || null);
      const reminder = await db.get('SELECT * FROM deadline_reminders WHERE id = ?', id);
      res.status(201).json(reminder);
    } catch (err) {
      console.error('[deadlines] create reminder error:', err);
      res.status(500).json({ error: 'Failed to create reminder' });
    }
  });

  // GET /api/deadlines/:id/comments
  router.get('/deadlines/:id/comments', async (req, res) => {
    try {
      const comments = await db.all('SELECT * FROM deadline_comments WHERE deadline_id = ? ORDER BY created_at ASC', req.params.id);
      res.json(comments);
    } catch (err) {
      console.error('[deadlines] comments error:', err);
      res.status(500).json({ error: 'Failed to fetch comments' });
    }
  });

  // POST /api/deadlines/:id/comments
  router.post('/deadlines/:id/comments', async (req, res) => {
    try {
      const userId = getUserId(req);
      const { content } = req.body as { content?: string };
      if (!content?.trim()) {
        res.status(400).json({ error: 'content is required' });
        return;
      }
      const id = randomUUID();
      await db.run('INSERT INTO deadline_comments (id, deadline_id, user_id, content) VALUES (?, ?, ?, ?)', id, req.params.id, userId, content.trim());

      const comment = { id, deadline_id: req.params.id, user_id: userId, content: content.trim() };
      res.status(201).json(comment);
    } catch (err) {
      console.error('[deadlines] create comment error:', err);
      res.status(500).json({ error: 'Failed to create comment' });
    }
  });

  // GET /api/deadlines/:id
  router.get('/deadlines/:id', async (req, res) => {
    try {
      const deadline = await ti.getDeadline(req.params.id);
      if (!deadline) {
        res.status(404).json({ error: 'Deadline not found' });
        return;
      }
      res.json(deadline);
    } catch (err) {
      console.error('[deadlines] get error:', err);
      res.status(500).json({ error: 'Failed to fetch deadline' });
    }
  });

  // PUT /api/deadlines/:id
  router.put('/deadlines/:id', async (req, res) => {
    try {
      const updated = await ti.updateDeadline(req.params.id, req.body as Parameters<typeof ti.updateDeadline>[1]);
      if (!updated) {
        res.status(404).json({ error: 'Deadline not found' });
        return;
      }
      res.json(updated);
    } catch (err) {
      console.error('[deadlines] update error:', err);
      res.status(500).json({ error: 'Failed to update deadline' });
    }
  });

  // DELETE /api/deadlines/:id
  router.delete('/deadlines/:id', async (req, res) => {
    try {
      const deleted = await ti.deleteDeadline(req.params.id);
      if (!deleted) {
        res.status(404).json({ error: 'Deadline not found' });
        return;
      }
      res.json({ ok: true });
    } catch (err) {
      console.error('[deadlines] delete error:', err);
      res.status(500).json({ error: 'Failed to delete deadline' });
    }
  });

  // POST /api/deadlines/:id/complete
  router.post('/deadlines/:id/complete', async (req, res) => {
    try {
      const completed = await ti.completeDeadline(req.params.id);
      if (!completed) {
        res.status(404).json({ error: 'Deadline not found' });
        return;
      }
      res.json(completed);
    } catch (err) {
      console.error('[deadlines] complete error:', err);
      res.status(500).json({ error: 'Failed to complete deadline' });
    }
  });

  // GET /api/rhythms
  router.get('/rhythms', async (_req, res) => {
    try {
      const rhythms = await ti.getRhythms();
      res.json(rhythms);
    } catch (err) {
      console.error('[rhythms] list error:', err);
      res.status(500).json({ error: 'Failed to fetch rhythms' });
    }
  });

  // POST /api/rhythms
  router.post('/rhythms', async (req, res) => {
    try {
      const { name, description, frequency, anchor_expression, typical_duration_days, typical_effort_hours, source } = req.body as {
        name?: string;
        description?: string;
        frequency?: string;
        anchor_expression?: string;
        typical_duration_days?: number;
        typical_effort_hours?: number;
        source?: string;
      };

      if (!name?.trim()) {
        res.status(400).json({ error: 'name is required' });
        return;
      }
      if (!frequency?.trim()) {
        res.status(400).json({ error: 'frequency is required' });
        return;
      }
      if (!anchor_expression?.trim()) {
        res.status(400).json({ error: 'anchor_expression is required' });
        return;
      }

      const rhythm = await ti.createRhythm({
        name: name.trim(),
        description,
        frequency: frequency.trim(),
        anchor_expression: anchor_expression.trim(),
        typical_duration_days,
        typical_effort_hours,
        source,
      });
      res.status(201).json(rhythm);
    } catch (err) {
      console.error('[rhythms] create error:', err);
      res.status(500).json({ error: 'Failed to create rhythm' });
    }
  });

  return router;
}
