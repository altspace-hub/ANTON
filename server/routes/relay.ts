/**
 * relay.ts — Relay server API routes
 *
 * Store-and-forward for offline ANTON peers.
 * All payloads are E2E encrypted — relay cannot read content.
 */

import { Router } from 'express';
import type { DatabaseAdapter } from '../db/database.js';
import { createRelayService } from '../services/relay-service.js';

export async function createRelayRoutes(db: DatabaseAdapter) {
  const router = Router();
  const relay = await createRelayService(db);

  // POST /relay/store — Store an encrypted message for an offline recipient
  router.post('/relay/store', async (req, res) => {
    try {
      const { recipientHash, senderHash, encryptedPayload, messageType, ttlDays } = req.body;
      if (!recipientHash || !senderHash || !encryptedPayload) {
        return res.status(400).json({ error: 'recipientHash, senderHash, and encryptedPayload are required' });
      }
      const id = await relay.storeMessage({ recipientHash, senderHash, encryptedPayload, messageType, ttlDays });
      res.status(201).json({ id });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // GET /relay/collect/:contactHash — Collect pending messages for a recipient
  router.get('/relay/collect/:contactHash', async (req, res) => {
    try {
      const messages = await relay.collectMessages(req.params.contactHash);
      res.json({ messages, count: messages.length });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // DELETE /relay/purge — Remove expired messages (admin/cron)
  router.delete('/relay/purge', async (_req, res) => {
    try {
      const purged = await relay.purgeExpired();
      res.json({ purged });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // GET /relay/stats — Relay statistics (admin)
  router.get('/relay/stats', async (_req, res) => {
    try {
      const stats = await relay.getStats();
      res.json(stats);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  return router;
}
