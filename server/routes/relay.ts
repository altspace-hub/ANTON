/**
 * relay.ts — Relay server API routes
 *
 * Store-and-forward for offline ANTON peers.
 * All payloads are E2E encrypted — relay cannot read content.
 *
 * Security (when RELAY_PUBLIC=true):
 * - API key auth (RELAY_API_KEYS)
 * - IP allowlist (RELAY_ALLOWED_IPS)
 * - HMAC request signing (RELAY_HMAC_SECRET)
 * - Rate limiting via p2pLimiter
 *
 * When RELAY_PUBLIC is not set (default), only localhost can access.
 */

import { safeError } from '../lib/error-response.js';
import { Router } from 'express';
import type { DatabaseAdapter } from '../db/database.js';
import { createRelayService } from '../services/relay-service.js';
import { relayAuth } from '../middleware/relay-auth.js';

export async function createRelayRoutes(db: DatabaseAdapter) {
  const router = Router();
  const relay = await createRelayService(db);

  // Apply relay auth to all relay endpoints
  router.use('/relay', relayAuth);

  // POST /relay/store — Store an encrypted message for an offline recipient
  router.post('/relay/store', async (req, res) => {
    try {
      const { recipientHash, senderHash, encryptedPayload, messageType, ttlDays } = req.body;
      if (!recipientHash || !senderHash || !encryptedPayload) {
        return res.status(400).json({ error: 'recipientHash, senderHash, and encryptedPayload are required' });
      }
      // Limit payload size (1MB max)
      if (typeof encryptedPayload === 'string' && encryptedPayload.length > 1_048_576) {
        return res.status(413).json({ error: 'Payload too large (max 1MB)' });
      }
      const id = await relay.storeMessage({ recipientHash, senderHash, encryptedPayload, messageType, ttlDays });
      res.status(201).json({ id });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // GET /relay/collect/:contactHash — Collect pending messages for a recipient
  router.get('/relay/collect/:contactHash', async (req, res) => {
    try {
      const messages = await relay.collectMessages(req.params.contactHash);
      res.json(messages);
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // DELETE /relay/purge — Remove expired messages (admin/cron)
  router.delete('/relay/purge', async (_req, res) => {
    try {
      const purged = await relay.purgeExpired();
      res.json({ purged });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // GET /relay/stats — Relay statistics (admin)
  router.get('/relay/stats', async (_req, res) => {
    try {
      const stats = await relay.getStats();
      res.json(stats);
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  return router;
}
