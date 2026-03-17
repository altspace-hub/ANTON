import { Router } from 'express';
import type { DatabaseAdapter } from '../db/database.js';
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

export async function createScheduleRoutes(db: DatabaseAdapter) {
  const router = Router();

  // GET /api/workflows/:workflowId/schedules — list schedules for a workflow
  router.get('/workflows/:workflowId/schedules', async (req, res) => {
    try {
      const schedules = await db.all(
        'SELECT * FROM workflow_schedules WHERE workflow_id = ? ORDER BY created_at DESC'
      , req.params.workflowId) as ScheduleRow[];
      res.json(schedules);
    } catch {
      res.status(500).json({ error: 'Failed to fetch schedules' });
    }
  });

  // POST /api/workflows/:workflowId/schedules — create a schedule
  router.post('/workflows/:workflowId/schedules', async (req, res) => {
    try {
      const { cron_expression, workflow_definition } = req.body as { cron_expression: string; workflow_definition?: unknown };
      if (!cron_expression?.trim()) {
        res.status(400).json({ error: 'cron_expression is required' });
        return;
      }
      if (!cron.validate(cron_expression.trim())) {
        res.status(400).json({ error: 'Invalid cron expression' });
        return;
      }

      // Store the workflow definition JSON so the scheduler can execute it headlessly
      const definitionJson = workflow_definition ? JSON.stringify(workflow_definition) : null;
      const result = await db.run(
        'INSERT INTO workflow_schedules (workflow_id, cron_expression, is_active, workflow_definition) VALUES (?, ?, 1, ?)'
      , req.params.workflowId, cron_expression.trim(), definitionJson);

      const newId = result.lastInsertRowid as number;
      const newSchedule = await db.get('SELECT * FROM workflow_schedules WHERE id = ?', newId) as ScheduleRow;

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
  router.patch('/workflows/:workflowId/schedules/:id', async (req, res) => {
    try {
      const scheduleId = parseInt(req.params.id, 10);
      const existing = await db.get(
        'SELECT * FROM workflow_schedules WHERE id = ? AND workflow_id = ?'
      , scheduleId, req.params.workflowId) as ScheduleRow | undefined;

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

      await db.run('UPDATE workflow_schedules SET cron_expression = ?, is_active = ? WHERE id = ?'
      , newCron, newActive, scheduleId);

      // Update in-memory scheduler
      unscheduleWorkflow(scheduleId);
      if (newActive) {
        scheduleWorkflow(db, {
          id: scheduleId,
          workflow_id: req.params.workflowId,
          cron_expression: newCron,
        });
      }

      const updated = await db.get('SELECT * FROM workflow_schedules WHERE id = ?', scheduleId) as ScheduleRow;
      res.json(updated);
    } catch {
      res.status(500).json({ error: 'Failed to update schedule' });
    }
  });

  // DELETE /api/workflows/:workflowId/schedules/:id — delete a schedule
  router.delete('/workflows/:workflowId/schedules/:id', async (req, res) => {
    try {
      const scheduleId = parseInt(req.params.id, 10);
      const existing = await db.get(
        'SELECT * FROM workflow_schedules WHERE id = ? AND workflow_id = ?'
      , scheduleId, req.params.workflowId) as ScheduleRow | undefined;

      if (!existing) {
        res.status(404).json({ error: 'Schedule not found' });
        return;
      }

      // Stop the in-memory task first
      unscheduleWorkflow(scheduleId);

      await db.run('DELETE FROM workflow_schedules WHERE id = ?', scheduleId);
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: 'Failed to delete schedule' });
    }
  });

  return router;
}
