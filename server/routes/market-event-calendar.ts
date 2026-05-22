import { Router } from 'express';
import { z } from 'zod';
import type { DatabaseAdapter } from '../db/database.js';
import { createMarketEventTriggerService } from '../services/market-event-trigger-service.js';
import { safeError } from '../lib/error-response.js';

// ── Zod Schemas ───────────────────────────────────────────────────────────────

const createEventSchema = z.object({
  eventType: z.string().min(1).max(100),
  title: z.string().min(1).max(500),
  description: z.string().optional(),
  symbol: z.string().max(50).optional(),
  entityId: z.string().optional(),
  scheduledAt: z.string().min(1),
  importance: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  preEventHours: z.number().int().min(0).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const updateEventSchema = z.object({
  eventType: z.string().min(1).max(100).optional(),
  title: z.string().min(1).max(500).optional(),
  description: z.string().optional(),
  symbol: z.string().max(50).optional(),
  entityId: z.string().optional(),
  scheduledAt: z.string().optional(),
  importance: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  preEventHours: z.number().int().min(0).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const completeEventSchema = z.object({
  actualOutcome: z.string().min(1),
});

export async function createMarketEventCalendarRoutes(db: DatabaseAdapter) {
  const router = Router();
  const service = await createMarketEventTriggerService(db);

  // Create an event
  router.post('/markets/events', async (req, res) => {
    try {
      const parsed = createEventSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
        return;
      }
      const { eventType, title, description, symbol, entityId, scheduledAt, importance, preEventHours, metadata } = parsed.data;
      const event = await service.addEvent({ eventType, title, description, symbol, entityId, scheduledAt, importance, preEventHours, metadata });
      res.json(event);
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // Update an event
  router.patch('/markets/events/:id', async (req, res) => {
    try {
      const parsed = updateEventSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
        return;
      }
      const event = await service.updateEvent(req.params.id, parsed.data);
      if (!event) { res.status(404).json({ error: 'Event not found' }); return; }
      res.json(event);
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // Delete an event
  router.delete('/markets/events/:id', async (req, res) => {
    try {
      await service.deleteEvent(req.params.id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // List upcoming events
  router.get('/markets/events', async (req, res) => {
    try {
      const horizonHours = parseInt(req.query.horizonHours as string || '168', 10);
      const events = await service.listUpcomingEvents(horizonHours);
      res.json(events);
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // Complete an event
  router.post('/markets/events/:id/complete', async (req, res) => {
    try {
      const parsed = completeEventSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
        return;
      }
      const { actualOutcome } = parsed.data;
      const event = await service.completeEvent(req.params.id, actualOutcome);
      if (!event) { res.status(404).json({ error: 'Event not found' }); return; }
      res.json(event);
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // Manually trigger check
  router.post('/markets/events/check-triggers', async (req, res) => {
    try {
      const result = await service.checkAndFireTriggers();
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  return router;
}
