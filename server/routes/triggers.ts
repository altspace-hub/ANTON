/**
 * triggers.ts
 * RBAC-protected API for managing event-driven webhook triggers.
 * Follows the same pattern as other routes (see workflows.ts, connections.ts).
 */

import { Router, Request, Response } from 'express';
import type { DatabaseAdapter } from '../db/database.js';

import { createWebhookListener, type TriggerType } from '../services/webhook-listener.js';

export async function createTriggersRoutes(db: DatabaseAdapter): Router {
  const router = Router();
  const listener = await createWebhookListener(db);

  function getUserId(req: Request): string {
    return (req as unknown as { user?: { id?: string } }).user?.id ?? 'default';
  }

  // ── List triggers ──────────────────────────────────────────────────────────
  router.get('/triggers', async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const triggers = listener.listTriggers(userId);

      // Augment with 24h metrics
      const withMetrics = triggers.map((t) => ({
        ...t,
        auth_config: { ...t.auth_config, secret: undefined }, // Never expose secrets
        metrics: listener.getTriggerMetrics(t.id, 24),
      }));

      res.json({ triggers: withMetrics });
    } catch (err) {
      console.error('[triggers] list error:', err);
      res.status(500).json({ error: 'Failed to list triggers' });
    }
  });

  // ── Get trigger ────────────────────────────────────────────────────────────
  router.get('/triggers/:id', async (req: Request, res: Response) => {
    try {
      const trigger = listener.getTrigger(String(req.params.id));
      if (!trigger) return res.status(404).json({ error: 'Trigger not found' });

      res.json({
        trigger: { ...trigger, auth_config: { ...trigger.auth_config, secret: undefined } },
        metrics: listener.getTriggerMetrics(trigger.id, 24),
      });
    } catch (err) {
      console.error('[triggers] get error:', err);
      res.status(500).json({ error: 'Failed to get trigger' });
    }
  });

  // ── Create trigger ─────────────────────────────────────────────────────────
  router.post('/triggers', async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const {
        name, description, trigger_type, workflow_id,
        auth_config, filter_config, payload_mapping,
        rate_limit_max, rate_limit_window_seconds, cooldown_seconds,
      } = req.body as {
        name: string;
        description?: string;
        trigger_type: TriggerType;
        workflow_id: string;
        auth_config: { method: string; secret?: string; header?: string; prefix?: string };
        filter_config?: Record<string, unknown>;
        payload_mapping?: Record<string, string>;
        rate_limit_max?: number;
        rate_limit_window_seconds?: number;
        cooldown_seconds?: number;
      };

      if (!name || !trigger_type || !workflow_id || !auth_config) {
        return res.status(400).json({ error: 'name, trigger_type, workflow_id, and auth_config are required' });
      }

      const validTypes: TriggerType[] = ['webhook', 'git_push', 'slack_event', 'teams_event', 'mcp_event', 'internal'];
      if (!validTypes.includes(trigger_type)) {
        return res.status(400).json({ error: `trigger_type must be one of: ${validTypes.join(', ')}` });
      }

      // Enforce auth for non-internal triggers in production
      if (trigger_type !== 'internal' && auth_config.method === 'none' && process.env.NODE_ENV !== 'development') {
        return res.status(400).json({ error: 'External triggers must have authentication configured' });
      }

      const trigger = listener.createTrigger({
        name, description, trigger_type, workflow_id,
        auth_config: auth_config as Parameters<typeof listener.createTrigger>[0]['auth_config'],
        filter_config: filter_config as Parameters<typeof listener.createTrigger>[0]['filter_config'],
        payload_mapping,
        rate_limit_max,
        rate_limit_window_seconds,
        cooldown_seconds,
        user_id: userId,
      });

      res.status(201).json({
        trigger: { ...trigger, auth_config: { ...trigger.auth_config, secret: undefined } },
        webhook_url: `${req.protocol}://${req.get('host')}${trigger.endpoint_path}`,
      });
    } catch (err) {
      console.error('[triggers] create error:', err);
      res.status(500).json({ error: 'Failed to create trigger' });
    }
  });

  // ── Update trigger ─────────────────────────────────────────────────────────
  router.put('/triggers/:id', async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const trigger = listener.getTrigger(String(req.params.id));
      if (!trigger) return res.status(404).json({ error: 'Trigger not found' });
      if (trigger.user_id !== userId && userId !== 'default') {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const { name, description, filter_config, payload_mapping, rate_limit_max, rate_limit_window_seconds, cooldown_seconds } = req.body as {
        name?: string; description?: string;
        filter_config?: Record<string, unknown>;
        payload_mapping?: Record<string, string>;
        rate_limit_max?: number; rate_limit_window_seconds?: number; cooldown_seconds?: number;
      };

      const updates: string[] = [];
      const values: unknown[] = [];

      if (name !== undefined) { updates.push('name = ?'); values.push(name); }
      if (description !== undefined) { updates.push('description = ?'); values.push(description); }
      if (filter_config !== undefined) { updates.push('filter_config = ?'); values.push(JSON.stringify(filter_config)); }
      if (payload_mapping !== undefined) { updates.push('payload_mapping = ?'); values.push(JSON.stringify(payload_mapping)); }
      if (rate_limit_max !== undefined) { updates.push('rate_limit_max = ?'); values.push(rate_limit_max); }
      if (rate_limit_window_seconds !== undefined) { updates.push('rate_limit_window_seconds = ?'); values.push(rate_limit_window_seconds); }
      if (cooldown_seconds !== undefined) { updates.push('cooldown_seconds = ?'); values.push(cooldown_seconds); }

      if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

      updates.push("updated_at = NOW()");
      values.push(String(req.params.id));

      await db.run(`UPDATE webhook_triggers SET ${updates.join(', ')} WHERE id = ?`, ...values);

      const updated = listener.getTrigger(String(req.params.id))!;
      res.json({ trigger: { ...updated, auth_config: { ...updated.auth_config, secret: undefined } } });
    } catch (err) {
      console.error('[triggers] update error:', err);
      res.status(500).json({ error: 'Failed to update trigger' });
    }
  });

  // ── Activate / pause trigger ───────────────────────────────────────────────
  router.patch('/triggers/:id/status', async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const trigger = listener.getTrigger(String(req.params.id));
      if (!trigger) return res.status(404).json({ error: 'Trigger not found' });
      if (trigger.user_id !== userId && userId !== 'default') {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const { status } = req.body as { status: 'active' | 'paused' };
      if (!['active', 'paused'].includes(status)) {
        return res.status(400).json({ error: 'status must be "active" or "paused"' });
      }

      listener.setTriggerStatus(String(req.params.id), status);
      res.json({ status });
    } catch (err) {
      console.error('[triggers] status error:', err);
      res.status(500).json({ error: 'Failed to update status' });
    }
  });

  // ── Delete trigger ─────────────────────────────────────────────────────────
  router.delete('/triggers/:id', async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const trigger = listener.getTrigger(String(req.params.id));
      if (!trigger) return res.status(404).json({ error: 'Trigger not found' });
      if (trigger.user_id !== userId && userId !== 'default') {
        return res.status(403).json({ error: 'Forbidden' });
      }
      const deleted = listener.deleteTrigger(String(req.params.id));
      if (!deleted) return res.status(404).json({ error: 'Trigger not found' });
      res.json({ deleted: true });
    } catch (err) {
      console.error('[triggers] delete error:', err);
      res.status(500).json({ error: 'Failed to delete trigger' });
    }
  });

  // ── Event log ──────────────────────────────────────────────────────────────
  router.get('/triggers/:id/events', async (req: Request, res: Response) => {
    try {
      const trigger = listener.getTrigger(String(req.params.id));
      if (!trigger) return res.status(404).json({ error: 'Trigger not found' });

      const limit = Math.min(parseInt(String(String(req.query.limit) || '50')), 200);
      const offset = parseInt(String(String(req.query.offset) || '0'));

      const events = listener.getEventLog(String(req.params.id), limit, offset);
      res.json({ events, total: events.length });
    } catch (err) {
      console.error('[triggers] event log error:', err);
      res.status(500).json({ error: 'Failed to get event log' });
    }
  });

  router.get('/triggers/:id/events/:event_id', async (req: Request, res: Response) => {
    try {
      const row = await db.get('SELECT * FROM webhook_events WHERE id = ? AND trigger_id = ?', String(req.params.event_id), String(req.params.id)) as Record<string, unknown> | undefined;
      if (!row) return res.status(404).json({ error: 'Event not found' });
      res.json({ event: row });
    } catch (err) {
      console.error('[triggers] get event error:', err);
      res.status(500).json({ error: 'Failed to get event' });
    }
  });

  // ── Replay event ───────────────────────────────────────────────────────────
  router.post('/triggers/:id/events/:event_id/replay', async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const result = await listener.replayEvent(String(req.params.event_id), userId);
      res.json(result);
    } catch (err) {
      console.error('[triggers] replay error:', err);
      res.status(500).json({ error: 'Failed to replay event' });
    }
  });

  // ── Metrics (summary MUST be before /:id/metrics to avoid route shadowing) ──
  router.get('/triggers/metrics/summary', async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const triggers = listener.listTriggers(userId);
      const summary = triggers.map((t) => ({
        trigger_id: t.id,
        name: t.name,
        type: t.trigger_type,
        status: t.status,
        metrics: listener.getTriggerMetrics(t.id, 24),
      }));
      res.json({ summary });
    } catch (err) {
      console.error('[triggers] summary metrics error:', err);
      res.status(500).json({ error: 'Failed to get metrics summary' });
    }
  });

  router.get('/triggers/:id/metrics', async (req: Request, res: Response) => {
    try {
      const trigger = listener.getTrigger(String(req.params.id));
      if (!trigger) return res.status(404).json({ error: 'Trigger not found' });

      const hours = parseInt(String(req.query.hours || '24'), 10) || 24;
      const metrics = listener.getTriggerMetrics(String(req.params.id), hours);
      res.json({ metrics });
    } catch (err) {
      console.error('[triggers] metrics error:', err);
      res.status(500).json({ error: 'Failed to get metrics' });
    }
  });

  return router;
}
