import { Router } from 'express';
import type { DatabaseAdapter } from '../db/database.js';
import { safeError } from '../lib/error-response.js';

/**
 * P2P message receive endpoint — accepts inbound messages from peer ANTON instances.
 * POST /api/p2p/receive
 *
 * This endpoint does NOT require authentication (it's a public P2P endpoint).
 * Messages are validated by checking the sender is a known, accepted contact.
 */
export async function createP2PRoutes(db: DatabaseAdapter): Promise<Router> {
  const router = Router();

  router.post('/p2p/receive', async (req, res) => {
    try {
      const {
        mailId, fromHash, toHashes, subject, body,
        messageType, payload, payloadMetadata,
        threadId, parentId,
      } = req.body as {
        mailId: string; fromHash: string; toHashes: string;
        subject: string; body: string;
        messageType?: string; payload?: unknown; payloadMetadata?: unknown;
        threadId?: string; parentId?: string;
        encryptedPayload?: string;
      };

      if (!mailId || !fromHash || !body) {
        return res.status(400).json({ error: 'mailId, fromHash, and body are required' });
      }

      // Verify sender is a known, accepted contact
      const contact = await db.get<{ id: string; import_policy: string; auto_accept_types: string | null }>(
        "SELECT id, import_policy, auto_accept_types FROM community_connections WHERE contact_hash = ? AND status = 'accepted'",
        fromHash
      );
      if (!contact) {
        return res.status(403).json({ error: 'Unknown or unaccepted sender' });
      }

      // Check import policy
      if (contact.import_policy === 'block') {
        return res.status(403).json({ error: 'Sender is blocked' });
      }

      // Store in local inbox
      const localId = `cm_p2p_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      await db.run(`
        INSERT INTO community_mail (id, from_hash, to_hashes, subject, body, folder, message_type, payload, payload_metadata, thread_id, parent_id, delivery_status, delivered_at)
        VALUES (?, ?, ?, ?, ?, 'inbox', ?, ?, ?, ?, ?, 'delivered', NOW())
      `, localId, fromHash,
         typeof toHashes === 'string' ? toHashes : JSON.stringify(toHashes),
         subject ?? '', body,
         messageType ?? 'text',
         payload ? (typeof payload === 'string' ? payload : JSON.stringify(payload)) : null,
         payloadMetadata ? (typeof payloadMetadata === 'string' ? payloadMetadata : JSON.stringify(payloadMetadata)) : null,
         threadId ?? null, parentId ?? null);

      res.json({ ok: true, localId });
    } catch (err) {
      const { status, message } = safeError(err);
      res.status(status).json({ error: message });
    }
  });

  // Health check for P2P — lets peers verify this instance is reachable
  router.get('/p2p/ping', (_req, res) => {
    res.json({ ok: true, timestamp: new Date().toISOString() });
  });

  return router;
}
