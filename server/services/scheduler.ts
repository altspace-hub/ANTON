import * as cron from 'node-cron';
import type { DatabaseAdapter } from '../db/database.js';
import { executeScheduledWorkflow } from './workflow-executor.js';
import { createNotification } from './notification-service.js';

interface ScheduleRow {
  id: number;
  workflow_id: string;
  cron_expression: string;
  workflow_name?: string;
}

const activeTasks = new Map<number, cron.ScheduledTask>();

export async function initScheduler(db: DatabaseAdapter) {
  // Load all active schedules on startup
  const schedules = await db.all(
    'SELECT * FROM workflow_schedules WHERE is_active = 1'
  ) as ScheduleRow[];

  for (const schedule of schedules) {
    scheduleWorkflow(db, schedule);
  }
  console.log(`[scheduler] Loaded ${schedules.length} active workflow schedules`);
}

export async function scheduleWorkflow(db: DatabaseAdapter, schedule: ScheduleRow) {
  // Validate cron expression
  if (!cron.validate(schedule.cron_expression)) {
    console.warn(`[scheduler] Invalid cron expression for schedule ${schedule.id}: ${schedule.cron_expression}`);
    return;
  }

  const task = cron.schedule(schedule.cron_expression, async () => {
    console.log(`[scheduler] Running workflow ${schedule.workflow_id} (schedule ${schedule.id})`);
    await db.run('UPDATE workflow_schedules SET last_run_at = CURRENT_TIMESTAMP, run_count = run_count + 1 WHERE id = ?', schedule.id);
    // Log to audit log if the table exists
    try {
      await db.run('INSERT INTO audit_log (action, entity_type, entity_id, details) VALUES (?, ?, ?, ?)', 'workflow_scheduled_run', 'workflow', schedule.workflow_id, JSON.stringify({ schedule_id: schedule.id }));
    } catch { /* audit table may not exist in all deploys */ }

    // Execute the workflow
    try {
      const result = await executeScheduledWorkflow(db, schedule.workflow_id, schedule.id);
      createNotification(db, {
        userId: 'solo',
        type: 'scheduled_workflow',
        title: `Scheduled workflow completed`,
        message: result.success
          ? `Completed successfully (${result.stepsCompleted} steps, ${result.stepsSkipped} skipped)`
          : `Failed: ${result.error}`,
        link: `/workflows`,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error(`[scheduler] Workflow execution failed: ${message}`);
      createNotification(db, {
        userId: 'solo',
        type: 'scheduled_workflow',
        title: `Scheduled workflow failed`,
        message: message,
        link: `/workflows`,
      });
    }
  });

  activeTasks.set(schedule.id, task);
}

export function unscheduleWorkflow(scheduleId: number) {
  const task = activeTasks.get(scheduleId);
  if (task) {
    task.stop();
    activeTasks.delete(scheduleId);
  }
}
