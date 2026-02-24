import { Router } from 'express';
import { randomUUID } from 'crypto';
import type Database from 'better-sqlite3';
import { createTimeIntelligence } from '../services/time-intelligence.js';

export function createDeadlinesRoutes(db: Database.Database) {
  const router = Router();
  const ti = createTimeIntelligence(db);

  // Resolve current user id (solo mode uses 'default', team mode uses JWT user)
  function getUserId(req: Parameters<Parameters<typeof router.get>[1]>[0]): string {
    return (req as unknown as { user?: { id?: string } }).user?.id ?? 'default';
  }

  // GET /api/deadlines/morning-brief — must be before /:id route
  router.get('/deadlines/morning-brief', (req, res) => {
    try {
      const userId = getUserId(req);
      const brief = ti.getMorningBrief(userId);
      res.json(brief);
    } catch (err) {
      console.error('[deadlines] morning-brief error:', err);
      res.status(500).json({ error: 'Failed to fetch morning brief' });
    }
  });

  // GET /api/deadlines/conflicts
  router.get('/deadlines/conflicts', (req, res) => {
    try {
      const userId = getUserId(req);
      const conflicts = ti.detectConflicts(userId);
      res.json(conflicts);
    } catch (err) {
      console.error('[deadlines] conflicts error:', err);
      res.status(500).json({ error: 'Failed to detect conflicts' });
    }
  });

  // DELETE /api/deadlines/reminders/:reminderId
  router.delete('/deadlines/reminders/:reminderId', (req, res) => {
    try {
      const result = db.prepare('DELETE FROM deadline_reminders WHERE id = ?').run(req.params.reminderId);
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
  router.put('/deadlines/reorder', (req, res) => {
    try {
      const updates = req.body as Array<{ id: string; sort_order: number; kanban_column?: string }>;
      if (!Array.isArray(updates)) {
        res.status(400).json({ error: 'Expected array of updates' });
        return;
      }
      ti.reorderDeadlines(updates);
      res.json({ ok: true });
    } catch (err) {
      console.error('[deadlines] reorder error:', err);
      res.status(500).json({ error: 'Failed to reorder deadlines' });
    }
  });

  // GET /api/deadline-labels
  router.get('/deadline-labels', (_req, res) => {
    try {
      const labels = db.prepare('SELECT * FROM deadline_labels ORDER BY name').all();
      res.json(labels);
    } catch (err) {
      console.error('[deadlines] labels error:', err);
      res.status(500).json({ error: 'Failed to fetch labels' });
    }
  });

  // POST /api/deadline-labels
  router.post('/deadline-labels', (req, res) => {
    try {
      const { name, color } = req.body as { name?: string; color?: string };
      if (!name?.trim()) {
        res.status(400).json({ error: 'name is required' });
        return;
      }
      const id = 'lbl-' + randomUUID().slice(0, 8);
      db.prepare('INSERT INTO deadline_labels (id, name, color) VALUES (?, ?, ?)').run(id, name.trim(), color || '#2DD4A8');
      const label = db.prepare('SELECT * FROM deadline_labels WHERE id = ?').get(id);
      res.status(201).json(label);
    } catch (err) {
      console.error('[deadlines] create label error:', err);
      res.status(500).json({ error: 'Failed to create label' });
    }
  });

  // DELETE /api/deadline-labels/:id
  router.delete('/deadline-labels/:id', (req, res) => {
    try {
      const result = db.prepare('DELETE FROM deadline_labels WHERE id = ?').run(req.params.id);
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
  router.get('/deadlines', (req, res) => {
    try {
      const userId = getUserId(req);
      const { status, priority, from, to, project_id, parent_id, kanban_column } = req.query as Record<string, string | undefined>;
      const deadlines = ti.getDeadlines(userId, { status, priority, from, to, project_id, parent_id, kanban_column });
      res.json(deadlines);
    } catch (err) {
      console.error('[deadlines] list error:', err);
      res.status(500).json({ error: 'Failed to fetch deadlines' });
    }
  });

  // POST /api/deadlines
  router.post('/deadlines', (req, res) => {
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

      const deadline = ti.createDeadline(
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
  router.get('/deadlines/:id/subtasks', (req, res) => {
    try {
      const subtasks = ti.getSubtasks(req.params.id);
      res.json(subtasks);
    } catch (err) {
      console.error('[deadlines] subtasks error:', err);
      res.status(500).json({ error: 'Failed to fetch subtasks' });
    }
  });

  // GET /api/deadlines/:id/reminders
  router.get('/deadlines/:id/reminders', (req, res) => {
    try {
      const reminders = db.prepare('SELECT * FROM deadline_reminders WHERE deadline_id = ? ORDER BY remind_days_before').all(req.params.id);
      res.json(reminders);
    } catch (err) {
      console.error('[deadlines] reminders error:', err);
      res.status(500).json({ error: 'Failed to fetch reminders' });
    }
  });

  // POST /api/deadlines/:id/reminders
  router.post('/deadlines/:id/reminders', (req, res) => {
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
      db.prepare('INSERT INTO deadline_reminders (id, deadline_id, remind_days_before, remind_via, email_address) VALUES (?, ?, ?, ?, ?)')
        .run(id, req.params.id, remind_days_before, remind_via || 'email', email_address || null);
      const reminder = db.prepare('SELECT * FROM deadline_reminders WHERE id = ?').get(id);
      res.status(201).json(reminder);
    } catch (err) {
      console.error('[deadlines] create reminder error:', err);
      res.status(500).json({ error: 'Failed to create reminder' });
    }
  });

  // GET /api/deadlines/:id/comments
  router.get('/deadlines/:id/comments', (req, res) => {
    try {
      const comments = db.prepare('SELECT * FROM deadline_comments WHERE deadline_id = ? ORDER BY created_at ASC').all(req.params.id);
      res.json(comments);
    } catch (err) {
      console.error('[deadlines] comments error:', err);
      res.status(500).json({ error: 'Failed to fetch comments' });
    }
  });

  // POST /api/deadlines/:id/comments
  router.post('/deadlines/:id/comments', (req, res) => {
    try {
      const userId = getUserId(req);
      const { content } = req.body as { content?: string };
      if (!content?.trim()) {
        res.status(400).json({ error: 'content is required' });
        return;
      }
      const id = randomUUID();
      db.prepare('INSERT INTO deadline_comments (id, deadline_id, user_id, content) VALUES (?, ?, ?, ?)')
        .run(id, req.params.id, userId, content.trim());
      const comment = db.prepare('SELECT * FROM deadline_comments WHERE id = ?').get(id);
      res.status(201).json(comment);
    } catch (err) {
      console.error('[deadlines] create comment error:', err);
      res.status(500).json({ error: 'Failed to create comment' });
    }
  });

  // GET /api/deadlines/:id
  router.get('/deadlines/:id', (req, res) => {
    try {
      const deadline = ti.getDeadline(req.params.id);
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
  router.put('/deadlines/:id', (req, res) => {
    try {
      const updated = ti.updateDeadline(req.params.id, req.body as Parameters<typeof ti.updateDeadline>[1]);
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
  router.delete('/deadlines/:id', (req, res) => {
    try {
      const deleted = ti.deleteDeadline(req.params.id);
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
  router.post('/deadlines/:id/complete', (req, res) => {
    try {
      const completed = ti.completeDeadline(req.params.id);
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
  router.get('/rhythms', (_req, res) => {
    try {
      const rhythms = ti.getRhythms();
      res.json(rhythms);
    } catch (err) {
      console.error('[rhythms] list error:', err);
      res.status(500).json({ error: 'Failed to fetch rhythms' });
    }
  });

  // POST /api/rhythms
  router.post('/rhythms', (req, res) => {
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

      const rhythm = ti.createRhythm({
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
