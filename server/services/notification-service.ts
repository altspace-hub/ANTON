import type { Database } from 'better-sqlite3';
import { randomUUID } from 'crypto';

interface CreateNotificationInput {
  userId?: string;
  type: 'scheduled_workflow' | 'radar_scan' | 'system';
  title: string;
  message?: string;
  link?: string;
}

export function createNotification(db: Database, input: CreateNotificationInput): void {
  try {
    db.prepare(`
      INSERT INTO notifications (id, user_id, type, title, message, link)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      randomUUID(),
      input.userId || 'solo',
      input.type,
      input.title,
      input.message || null,
      input.link || null
    );
  } catch (err) {
    console.error('[notifications] Failed to create notification:', err);
  }
}

export function getUnreadCount(db: Database, userId: string = 'solo'): number {
  const row = db.prepare(
    'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND read_at IS NULL'
  ).get(userId) as { count: number };
  return row?.count ?? 0;
}

export function markRead(db: Database, notificationId: string): void {
  db.prepare(
    "UPDATE notifications SET read_at = datetime('now') WHERE id = ?"
  ).run(notificationId);
}

export function markAllRead(db: Database, userId: string = 'solo'): void {
  db.prepare(
    "UPDATE notifications SET read_at = datetime('now') WHERE user_id = ? AND read_at IS NULL"
  ).run(userId);
}
