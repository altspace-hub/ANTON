import type { DatabaseAdapter } from '../db/database.js';
import { sendDeadlineReminderEmail } from './email.js';

interface DeadlineReminder {
  id: string;
  deadline_id: string;
  remind_days_before: number;
  remind_via: string;
  email_address: string | null;
  sent_at: string | null;
}

interface DeadlineRow {
  deadline_title: string;
  due_date: string;
  priority: string;
  status: string;
  owner_id: string | null;
}

export async function createDeadlineReminderService(db: DatabaseAdapter) {
  async function checkAndSendReminders(): Promise<number> {
    const now = new Date();

    // Find unsent reminders where the reminder time has arrived
    const reminders = await db.all(`
      SELECT r.*, d.title as deadline_title, d.due_date, d.priority, d.status, d.owner_id
      FROM deadline_reminders r
      JOIN deadlines d ON r.deadline_id = d.id
      WHERE r.sent_at IS NULL
        AND d.status NOT IN ('completed')
        AND d.due_date - (r.remind_days_before || ' days')::INTERVAL <= ?::timestamptz
    `, now.toISOString()) as Array<DeadlineReminder & DeadlineRow>;

    let sentCount = 0;

    for (const reminder of reminders) {
      if (reminder.remind_via === 'email' && reminder.email_address) {
        try {
          await sendDeadlineReminderEmail(
            reminder.email_address,
            { title: reminder.deadline_title, due_date: reminder.due_date, priority: reminder.priority },
            reminder.remind_days_before
          );
          await db.run('UPDATE deadline_reminders SET sent_at = ? WHERE id = ?', now.toISOString(), reminder.id);
          sentCount++;
        } catch (err) {
          console.error(`[deadline-reminders] Failed to send reminder ${reminder.id}:`, err);
        }
      } else {
        // in_app reminders: just mark as sent (UI can poll for these)
        await db.run('UPDATE deadline_reminders SET sent_at = ? WHERE id = ?', now.toISOString(), reminder.id);
        sentCount++;
      }
    }

    return sentCount;
  }

  let intervalId: ReturnType<typeof setInterval> | null = null;

  return {
    checkAndSendReminders,

    startTimer(intervalMinutes: number = 15) {
      if (intervalId) clearInterval(intervalId);
      intervalId = setInterval(async () => {
        try {
          const count = await checkAndSendReminders();
          if (count > 0) {
            console.log(`[deadline-reminders] Sent ${count} reminders`);
          }
        } catch (err) {
          console.error('[deadline-reminders] Timer error:', err);
        }
      }, intervalMinutes * 60 * 1000);
      console.log(`[deadline-reminders] Timer started (every ${intervalMinutes} minutes)`);
    },

    stopTimer() {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    },
  };
}
