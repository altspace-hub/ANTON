import { Router } from 'express';
import type Database from 'better-sqlite3';
import * as cron from 'node-cron';
import { scheduleWorkflow, unscheduleWorkflow } from '../services/scheduler.js';

interface ScheduleRow {
  id: number;
  workflow_id: string;
  cron_expression: string;
  is_active: number;
  last_run_at: string | null;
  next_run_at: string | null;
  run_count: number;
  created_at: string;
}

export function createScheduleRoutes(db: Database.Database) {
  const router = Router();

  // GET /api/workflows/:workflowId/schedules — list schedules for a workflow
  router.get('/workflows/:workflowId/schedules', (req, res) => {
    try {
      const schedules = db.prepare(
        'SELECT * FROM workflow_schedules WHERE workflow_id = ? ORDER BY created_at DESC'
      ).all(req.params.workflowId) as ScheduleRow[];
      res.json(schedules);
    } catch {
      res.status(500).json({ error: 'Failed to fetch schedules' });
    }
  });

  // POST /api/workflows/:workflowId/schedules — create a schedule
  router.post('/workflows/:workflowId/schedules', (req, res) => {
    try {
      const { cron_expression } = req.body as { cron_expression: string };
      if (!cron_expression?.trim()) {
        res.status(400).json({ error: 'cron_expression is required' });
        return;
      }
      if (!cron.validate(cron_expression.trim())) {
        res.status(400).json({ error: 'Invalid cron expression' });
        return;
      }

      const result = db.prepare(
        'INSERT INTO workflow_schedules (workflow_id, cron_expression, is_active) VALUES (?, ?, 1)'
      ).run(req.params.workflowId, cron_expression.trim());

      const newId = result.lastInsertRowid as number;
      const newSchedule = db.prepare('SELECT * FROM workflow_schedules WHERE id = ?').get(newId) as ScheduleRow;

      // Register with in-memory scheduler
      scheduleWorkflow(db, {
        id: newId,
        workflow_id: req.params.workflowId,
        cron_expression: cron_expression.trim(),
      });

      res.status(201).json(newSchedule);
    } catch {
      res.status(500).json({ error: 'Failed to create schedule' });
    }
  });

  // PATCH /api/workflows/:workflowId/schedules/:id — update (toggle active, change cron)
  router.patch('/workflows/:workflowId/schedules/:id', (req, res) => {
    try {
      const scheduleId = parseInt(req.params.id, 10);
      const existing = db.prepare(
        'SELECT * FROM workflow_schedules WHERE id = ? AND workflow_id = ?'
      ).get(scheduleId, req.params.workflowId) as ScheduleRow | undefined;

      if (!existing) {
        res.status(404).json({ error: 'Schedule not found' });
        return;
      }

      const { cron_expression, is_active } = req.body as { cron_expression?: string; is_active?: number };

      // Validate new cron expression if provided
      if (cron_expression !== undefined && !cron.validate(cron_expression.trim())) {
        res.status(400).json({ error: 'Invalid cron expression' });
        return;
      }

      const newCron = cron_expression !== undefined ? cron_expression.trim() : existing.cron_expression;
      const newActive = is_active !== undefined ? (is_active ? 1 : 0) : existing.is_active;

      db.prepare(
        'UPDATE workflow_schedules SET cron_expression = ?, is_active = ? WHERE id = ?'
      ).run(newCron, newActive, scheduleId);

      // Update in-memory scheduler
      unscheduleWorkflow(scheduleId);
      if (newActive) {
        scheduleWorkflow(db, {
          id: scheduleId,
          workflow_id: req.params.workflowId,
          cron_expression: newCron,
        });
      }

      const updated = db.prepare('SELECT * FROM workflow_schedules WHERE id = ?').get(scheduleId) as ScheduleRow;
      res.json(updated);
    } catch {
      res.status(500).json({ error: 'Failed to update schedule' });
    }
  });

  // DELETE /api/workflows/:workflowId/schedules/:id — delete a schedule
  router.delete('/workflows/:workflowId/schedules/:id', (req, res) => {
    try {
      const scheduleId = parseInt(req.params.id, 10);
      const existing = db.prepare(
        'SELECT * FROM workflow_schedules WHERE id = ? AND workflow_id = ?'
      ).get(scheduleId, req.params.workflowId) as ScheduleRow | undefined;

      if (!existing) {
        res.status(404).json({ error: 'Schedule not found' });
        return;
      }

      // Stop the in-memory task first
      unscheduleWorkflow(scheduleId);

      db.prepare('DELETE FROM workflow_schedules WHERE id = ?').run(scheduleId);
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: 'Failed to delete schedule' });
    }
  });

  return router;
}
