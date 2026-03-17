import { Router } from 'express';
import type { DatabaseAdapter } from '../db/database.js';
import { getUnreadCount, markRead, markAllRead } from '../services/notification-service.js';

export default function createNotificationsRouter(db: DatabaseAdapter) {
  const router = Router();

  // GET /api/notifications - list (newest first, limit 20)
  router.get('/notifications', async (req, res) => {
    try {
      const userId = (req as any).user?.id || 'solo';
      const notifications = await db.all(`
        SELECT * FROM notifications
        WHERE user_id = ?
        ORDER BY read_at IS NULL DESC, created_at DESC
        LIMIT 20
      `, userId);
      res.json(notifications);
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch notifications' });
    }
  });

  // GET /api/notifications/count - unread count
  router.get('/notifications/count', async (req, res) => {
    try {
      const userId = (req as any).user?.id || 'solo';
      const unread = getUnreadCount(db, userId);
      res.json({ unread });
    } catch (err) {
      res.status(500).json({ error: 'Failed to get notification count' });
    }
  });

  // PATCH /api/notifications/:id/read - mark one read
  router.patch('/notifications/:id/read', async (req, res) => {
    try {
      markRead(db, req.params.id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to mark notification as read' });
    }
  });

  // POST /api/notifications/read-all - mark all read
  router.post('/notifications/read-all', async (req, res) => {
    try {
      const userId = (req as any).user?.id || 'solo';
      markAllRead(db, userId);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to mark all notifications as read' });
    }
  });

  return router;
}
