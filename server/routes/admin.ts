import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import type { Database } from 'better-sqlite3';
import { requireRole } from '../middleware/auth.js';
import * as budgetManager from '../services/budget-manager.js';

export function createAdminRoutes(db: Database) {
  const router = Router();

  // GET /api/admin/users — list all users (admin only)
  router.get('/admin/users', requireRole('admin'), (_req, res) => {
    const users = db.prepare(
      `SELECT u.id, u.username, u.role, u.display_name, u.monthly_token_budget, u.last_login,
       COALESCE(SUM(m.input_tokens + m.output_tokens), 0) as tokens_this_month
       FROM users u
       LEFT JOIN user_monthly_usage m ON u.id = m.user_id AND m.year_month = strftime('%Y-%m', 'now')
       GROUP BY u.id`
    ).all();
    res.json(users);
  });

  // POST /api/admin/users — create user (admin only)
  router.post('/admin/users', requireRole('admin'), async (req, res) => {
    const { username, password, role = 'analyst', display_name, monthly_token_budget = 0 } = req.body as {
      username: string;
      password: string;
      role?: string;
      display_name?: string;
      monthly_token_budget?: number;
    };
    if (!username || !password) { res.status(400).json({ error: 'username and password required' }); return; }
    const hash = await bcrypt.hash(password, 10);
    const id = randomUUID();
    try {
      db.prepare('INSERT INTO users (id, username, password_hash, role, display_name, monthly_token_budget) VALUES (?, ?, ?, ?, ?, ?)')
        .run(id, username, hash, role, display_name || username, monthly_token_budget);
      res.json({ success: true, id });
    } catch {
      res.status(409).json({ error: 'Username already exists' });
    }
  });

  // PATCH /api/admin/users/:id — update user (admin only)
  router.patch('/admin/users/:id', requireRole('admin'), async (req, res) => {
    const { role, display_name, monthly_token_budget, password } = req.body as {
      role?: string;
      display_name?: string;
      monthly_token_budget?: number;
      password?: string;
    };
    if (password) {
      const hash = await bcrypt.hash(password, 10);
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.params.id);
    }
    if (role) db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, req.params.id);
    if (display_name) db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(display_name, req.params.id);
    if (monthly_token_budget !== undefined) db.prepare('UPDATE users SET monthly_token_budget = ? WHERE id = ?').run(monthly_token_budget, req.params.id);
    res.json({ success: true });
  });

  // DELETE /api/admin/users/:id — delete user (admin only, cannot delete self)
  router.delete('/admin/users/:id', requireRole('admin'), (req, res) => {
    if (req.params.id === req.user?.id) { res.status(400).json({ error: 'Cannot delete yourself' }); return; }
    db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  });

  // GET /api/admin/usage — usage stats per user this month (admin only)
  router.get('/admin/usage', requireRole('admin'), (_req, res) => {
    const usage = db.prepare(
      `SELECT u.username, u.display_name, u.role, u.monthly_token_budget,
       COALESCE(SUM(m.input_tokens), 0) as input_tokens,
       COALESCE(SUM(m.output_tokens), 0) as output_tokens
       FROM users u
       LEFT JOIN user_monthly_usage m ON u.id = m.user_id AND m.year_month = strftime('%Y-%m', 'now')
       GROUP BY u.id ORDER BY output_tokens DESC`
    ).all();
    res.json(usage);
  });

  // GET /api/admin/budgets — all user budget statuses (admin only)
  router.get('/admin/budgets', requireRole('admin'), (_req, res) => {
    try {
      const budgets = budgetManager.getAllUserBudgets(db);
      res.json({ budgets });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // PUT /api/admin/users/:id/budget — update user budget (admin only)
  router.put('/admin/users/:id/budget', requireRole('admin'), (req, res) => {
    try {
      const userId = String(req.params.id);
      const { monthlyTokenBudget, alertThreshold } = req.body as { monthlyTokenBudget?: number; alertThreshold?: number };

      if (monthlyTokenBudget === undefined || typeof monthlyTokenBudget !== 'number' || monthlyTokenBudget < 0) {
        res.status(400).json({ error: 'monthlyTokenBudget must be a non-negative number' });
        return;
      }

      const success = budgetManager.updateUserBudget(db, userId, monthlyTokenBudget, alertThreshold);
      res.json({ success });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // POST /api/admin/users/:id/reset-usage — reset monthly usage for user (admin only)
  router.post('/admin/users/:id/reset-usage', requireRole('admin'), (req, res) => {
    try {
      const userId = String(req.params.id);
      const success = budgetManager.resetMonthlyUsage(db, userId);
      res.json({ success });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  return router;
}
