import * as cron from 'node-cron';
import type { Database } from 'better-sqlite3';
import { executeScheduledWorkflow } from './workflow-executor.js';
import { createNotification } from './notification-service.js';

interface ScheduleRow {
  id: number;
  workflow_id: string;
  cron_expression: string;
  workflow_name?: string;
}

const activeTasks = new Map<number, cron.ScheduledTask>();

export function initScheduler(db: Database) {
  // Load all active schedules on startup
  const schedules = db.prepare(
    'SELECT * FROM workflow_schedules WHERE is_active = 1'
  ).all() as ScheduleRow[];

  for (const schedule of schedules) {
    scheduleWorkflow(db, schedule);
  }
  console.log(`[scheduler] Loaded ${schedules.length} active workflow schedules`);
}

export function scheduleWorkflow(db: Database, schedule: ScheduleRow) {
  // Validate cron expression
  if (!cron.validate(schedule.cron_expression)) {
    console.warn(`[scheduler] Invalid cron expression for schedule ${schedule.id}: ${schedule.cron_expression}`);
    return;
  }

  const task = cron.schedule(schedule.cron_expression, async () => {
    console.log(`[scheduler] Running workflow ${schedule.workflow_id} (schedule ${schedule.id})`);
    db.prepare('UPDATE workflow_schedules SET last_run_at = CURRENT_TIMESTAMP, run_count = run_count + 1 WHERE id = ?')
      .run(schedule.id);
    // Log to audit log if the table exists
    try {
      db.prepare('INSERT INTO audit_log (action, entity_type, entity_id, details) VALUES (?, ?, ?, ?)')
        .run('workflow_scheduled_run', 'workflow', schedule.workflow_id, JSON.stringify({ schedule_id: schedule.id }));
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
