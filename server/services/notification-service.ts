import type { DatabaseAdapter } from '../db/database.js';
import { randomUUID } from 'crypto';

interface CreateNotificationInput {
  userId?: string;
  type: 'scheduled_workflow' | 'radar_scan' | 'system';
  title: string;
  message?: string;
  link?: string;
}

export async function createNotification(db: DatabaseAdapter, input: CreateNotificationInput): Promise<void> {
  try {
    await db.run(`
      INSERT INTO notifications (id, user_id, type, title, message, link)
      VALUES (?, ?, ?, ?, ?, ?)
    `, randomUUID(),
      input.userId || 'solo',
      input.type,
      input.title,
      input.message || null,
      input.link || null);
  } catch (err) {
    console.error('[notifications] Failed to create notification:', err);
  }
}

export async function getUnreadCount(db: DatabaseAdapter, userId: string = 'solo'): Promise<number> {
  const row = await db.get('SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND read_at IS NULL'
  , userId) as { count: number };
  return row?.count ?? 0;
}

export async function markRead(db: DatabaseAdapter, notificationId: string): Promise<void> {
  await db.run("UPDATE notifications SET read_at = NOW() WHERE id = ?"
  , notificationId);
}

export async function markAllRead(db: DatabaseAdapter, userId: string = 'solo'): Promise<void> {
  await db.run(
    "UPDATE notifications SET read_at = NOW() WHERE user_id = ? AND read_at IS NULL"
  , userId);
}
