import { Router } from 'express';
import type { DatabaseAdapter } from '../db/database.js';
import { safeError } from '../lib/error-response.js';
import {
  getMyX25519Keys, getPeerX25519PublicKey, deriveSharedSecret, decryptMessage,
} from '../services/community-e2e.js';

/**
 * P2P message receive endpoint — accepts inbound messages from peer ANTON instances.
 * POST /api/p2p/receive
 *
 * This endpoint does NOT require authentication (it's a public P2P endpoint).
 * Messages are validated by checking the sender is a known, accepted contact.
 * If an encryptedPayload is present, it is decrypted using X25519 DH + AES-256-GCM.
 */
export async function createP2PRoutes(db: DatabaseAdapter): Promise<Router> {
  const router = Router();

  router.post('/p2p/receive', async (req, res) => {
    try {
      let {
        mailId, fromHash, toHashes, subject, body,
        messageType, payload, payloadMetadata,
        threadId, parentId, encryptedPayload,
      } = req.body as {
        mailId: string; fromHash: string; toHashes: string;
        subject: string; body: string;
        messageType?: string; payload?: unknown; payloadMetadata?: unknown;
        threadId?: string; parentId?: string;
        encryptedPayload?: string;
      };

      if (!mailId || !fromHash) {
        return res.status(400).json({ error: 'mailId and fromHash are required' });
      }

      // Verify sender is a known, accepted contact
      const contact = await db.get<{ id: string; import_policy: string; auto_accept_types: string | null }>(
        "SELECT id, import_policy, auto_accept_types FROM community_connections WHERE contact_hash = ? AND status IN ('accepted', 'active')",
        fromHash
      );
      if (!contact) {
        return res.status(403).json({ error: 'Unknown or unaccepted sender' });
      }

      // Check import policy
      if (contact.import_policy === 'block') {
        return res.status(403).json({ error: 'Sender is blocked' });
      }

      // ── E2E Decryption ──────────────────────────────────────────────
      // If the message is encrypted, decrypt it using our X25519 private key
      // and the sender's X25519 public key (Diffie-Hellman shared secret).
      if (encryptedPayload) {
        try {
          const myKeys = await getMyX25519Keys(db);
          const peerPubKey = await getPeerX25519PublicKey(db, fromHash);
          if (myKeys && peerPubKey) {
            const sharedSecret = deriveSharedSecret(myKeys.privateKeyHex, peerPubKey);
            const encryptedData = JSON.parse(encryptedPayload) as {
              ciphertext: string; iv: string; authTag: string; salt?: string; aadHash?: string; nonce?: string; timestamp?: number;
            };
            // Reconstruct AAD (sender:recipient) — must match what sender used
            const myIdentity = await db.get<{ contact_hash: string }>(
              "SELECT contact_hash FROM community_identity WHERE user_id = 'default'"
            );
            const aad = myIdentity ? `${fromHash}:${myIdentity.contact_hash}` : undefined;
            const decrypted = decryptMessage(encryptedData, sharedSecret, aad);
            const parsed = JSON.parse(decrypted) as { subject?: string; body?: string; messageType?: string; nonce?: string; timestamp?: number };

            // ── Replay Protection ──────────────────────────────────────
            const messageNonce = parsed.nonce ?? encryptedData.nonce;
            const messageTimestamp = parsed.timestamp ?? encryptedData.timestamp;
            if (messageNonce) {
              // Check for replay: same sender + nonce = duplicate
              const existing = await db.get<{ nonce: string }>(
                'SELECT nonce FROM p2p_message_nonces WHERE sender_hash = ? AND nonce = ?',
                fromHash, messageNonce
              );
              if (existing) {
                return res.status(409).json({ error: 'Replay detected: duplicate nonce' });
              }
              // Store nonce for deduplication
              await db.run(
                'INSERT INTO p2p_message_nonces (sender_hash, nonce) VALUES (?, ?) ON CONFLICT DO NOTHING',
                fromHash, messageNonce
              );
            }
            // Reject messages older than 10 minutes
            if (messageTimestamp && (Date.now() - messageTimestamp) > 10 * 60 * 1000) {
              return res.status(400).json({ error: 'Message too old (>10 minutes)' });
            }

            // Override plaintext fields with decrypted content
            subject = parsed.subject ?? subject;
            body = parsed.body ?? body;
            if (parsed.messageType) messageType = parsed.messageType;
            if (parsed.payload) payload = parsed.payload;
          } else {
            console.warn(`[p2p] Cannot decrypt: missing X25519 keys (myKeys: ${!!myKeys}, peerPubKey: ${!!peerPubKey})`);
            return res.status(400).json({ error: 'Cannot decrypt: missing X25519 keys' });
          }
        } catch (decryptErr) {
          console.error('[p2p] E2E decryption failed:', decryptErr instanceof Error ? decryptErr.message : decryptErr);
          return res.status(400).json({ error: 'E2E decryption failed' });
        }
      }

      if (!body && !encryptedPayload) {
        return res.status(400).json({ error: 'body or encryptedPayload required' });
      }

      // ── Structured Message Routing ─────────────────────────────────
      // Route special message types to dedicated handlers instead of inbox

      // Agent query — another ANTON wants to query a specific agent
      if (messageType === 'agent_query' && payload) {
        try {
          const { createAgentProcessor } = await import('../services/agent-processor.js');
          const proc = await createAgentProcessor(db);
          const agentPayload = typeof payload === 'string' ? JSON.parse(payload as string) : payload;
          const { agentSlug, agentId, message: agentMessage, conversationId: agentConvId } = agentPayload as {
            agentSlug?: string; agentId?: string; message: string; conversationId?: string;
          };

          // Resolve agent
          let resolvedAgentId = agentId;
          if (!resolvedAgentId && agentSlug) {
            const { createAgentService } = await import('../services/agent-service.js');
            const svc = await createAgentService(db);
            const agent = await svc.getAgentBySlug(agentSlug);
            if (agent) resolvedAgentId = agent.id;
          }

          if (resolvedAgentId) {
            const result = await proc.processQuery(resolvedAgentId, agentMessage, {
              conversationId: agentConvId,
              source: 'p2p',
              requesterHash: fromHash,
            });
            return res.json({ ok: true, type: 'agent_query', ...result });
          }
        } catch (agentErr) {
          console.error('[p2p] Agent query failed:', agentErr instanceof Error ? agentErr.message : agentErr);
        }
      }

      // Task request — another ANTON wants us to do work
      if (messageType === 'task_request' && payload) {
        try {
          const { createTaskAutoProcessor } = await import('../services/task-auto-processor.js');
          const processor = await createTaskAutoProcessor(db);
          const taskPayload = typeof payload === 'string' ? JSON.parse(payload as string) : payload;
          const result = await processor.processInboundTask(fromHash, taskPayload);
          // Also store in inbox for visibility
          const localId = `cm_p2p_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          await db.run(`
            INSERT INTO community_mail (id, from_hash, to_hashes, subject, body, folder, message_type, payload, delivery_status, delivered_at)
            VALUES (?, ?, ?, ?, ?, 'inbox', 'task_request', ?, 'delivered', NOW())
          `, localId, fromHash, typeof toHashes === 'string' ? toHashes : JSON.stringify(toHashes ?? '[]'),
             subject ?? `[Task] ${taskPayload.title}`, body ?? taskPayload.description,
             typeof payload === 'string' ? payload : JSON.stringify(payload));
          return res.json({ ok: true, type: 'task_request', ...result });
        } catch (taskErr) {
          console.error('[p2p] Task processing failed:', taskErr instanceof Error ? taskErr.message : taskErr);
          // Fall through to store as regular mail
        }
      }

      // Task result — another ANTON completed our task and sent the result
      if (messageType === 'task_result') {
        try {
          const { createTaskAutoProcessor } = await import('../services/task-auto-processor.js');
          const processor = await createTaskAutoProcessor(db);
          const resultPayload = typeof payload === 'string' ? JSON.parse(payload as string) : (payload ?? {});
          await processor.processInboundResult(fromHash, resultPayload as { originalTaskId: string; localTaskId?: string; title: string }, body ?? '');
        } catch (resultErr) {
          console.error('[p2p] Task result processing failed:', resultErr instanceof Error ? resultErr.message : resultErr);
        }
        // Always store in inbox too
      }

      if (messageType === 'entity_sync' && payload) {
        try {
          const { createKnowledgeSharingService } = await import('../services/knowledge-sharing-service.js');
          const service = await createKnowledgeSharingService(db);
          const entityPayload = typeof payload === 'string' ? JSON.parse(payload) : payload;
          const result = await service.receiveEntities(fromHash, entityPayload);
          return res.json({ ok: true, type: 'entity_sync', ...result });
        } catch (fedErr) {
          console.error('[p2p] Entity federation import failed:', fedErr instanceof Error ? fedErr.message : fedErr);
          // Fall through to store as regular mail
        }
      }

      // Beehive — multi-party reasoning protocol message (Phase 4)
      if (messageType === 'beehive_message' && payload) {
        try {
          const { createBeehiveProtocol } = await import('../services/beehive/beehive-protocol.js');
          const proto = await createBeehiveProtocol(db);
          const envelope = typeof payload === 'string' ? JSON.parse(payload) : payload;
          const result = await proto.handleInbound(fromHash, envelope);
          return res.json({ ok: result.ok, type: 'beehive_message', applied: result.applied, beehive_type: result.type, reason: result.reason });
        } catch (beehiveErr) {
          console.error('[p2p] BEEHIVE message processing failed:', beehiveErr instanceof Error ? beehiveErr.message : beehiveErr);
          // Fall through to store as regular mail so the user can see something arrived
        }
      }

      // Store in local inbox
      const localId = `cm_p2p_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      await db.run(`
        INSERT INTO community_mail (id, from_hash, to_hashes, subject, body, folder, message_type, payload, payload_metadata, thread_id, parent_id, delivery_status, delivered_at)
        VALUES (?, ?, ?, ?, ?, 'inbox', ?, ?, ?, ?, ?, 'delivered', NOW())
      `, localId, fromHash,
         typeof toHashes === 'string' ? toHashes : JSON.stringify(toHashes ?? '[]'),
         subject ?? '', body ?? '',
         messageType ?? 'text',
         payload ? (typeof payload === 'string' ? payload : JSON.stringify(payload)) : null,
         payloadMetadata ? (typeof payloadMetadata === 'string' ? payloadMetadata : JSON.stringify(payloadMetadata)) : null,
         threadId ?? null, parentId ?? null);

      res.json({ ok: true, localId, encrypted: !!encryptedPayload });
    } catch (err) {
      const { status, message } = safeError(err);
      res.status(status).json({ error: message });
    }
  });

  // Health check for P2P — lets peers verify this instance is reachable
  router.get('/p2p/ping', (_req, res) => {
    res.json({ ok: true, timestamp: new Date().toISOString() });
  });

  // POST /p2p/knowledge-query — peer asks "what do you know about X?"
  // Returns matching knowledge atoms from local knowledge base.
  // Only responds to known, accepted contacts.
  router.post('/p2p/knowledge-query', async (req, res) => {
    try {
      const { fromHash, query, limit = 10 } = req.body as {
        fromHash: string; query: string; limit?: number;
      };
      if (!fromHash || !query) {
        return res.status(400).json({ error: 'fromHash and query required' });
      }

      // Verify sender is a known contact
      const contact = await db.get<{ id: string; import_policy: string }>(
        "SELECT id, import_policy FROM community_connections WHERE contact_hash = ? AND status IN ('accepted', 'active')",
        fromHash
      );
      if (!contact) return res.status(403).json({ error: 'Unknown sender' });
      if (contact.import_policy === 'block') return res.status(403).json({ error: 'Blocked' });

      const maxResults = Math.min(Number(limit) || 10, 20);
      const searchTerms = query.split(/\s+/).slice(0, 5);
      const likePattern = `%${searchTerms.join('%')}%`;

      // Search knowledge atoms
      const knowledgeAtoms = await db.all<{
        id: string; content: string; atom_type: string; category: string;
        confidence: number; created_at: string;
      }>(`
        SELECT id, content, atom_type, category, confidence, created_at
        FROM knowledge_atoms
        WHERE content ILIKE ? AND confidence >= 0.5
        ORDER BY confidence DESC
        LIMIT ?
      `, likePattern, maxResults);

      // Search market atoms
      const marketAtoms = await db.all<{
        id: string; content: string; atom_type: string; category: string;
        confidence: number; sentiment: string;
      }>(`
        SELECT id, content, atom_type, category, confidence, sentiment
        FROM market_atoms
        WHERE is_active = 1 AND content ILIKE ?
        ORDER BY importance_score DESC NULLS LAST
        LIMIT ?
      `, likePattern, maxResults);

      const identity = await db.get<{ contact_hash: string; display_name: string }>(
        "SELECT contact_hash, display_name FROM community_identity WHERE user_id = 'default'"
      );

      res.json({
        ok: true,
        source: identity?.contact_hash ?? 'unknown',
        sourceName: identity?.display_name ?? 'ANTON',
        query,
        knowledgeAtoms: knowledgeAtoms.map(a => ({
          content: a.content, type: a.atom_type, category: a.category, confidence: a.confidence,
        })),
        marketAtoms: marketAtoms.map(a => ({
          content: a.content, type: a.atom_type, category: a.category,
          confidence: a.confidence, sentiment: a.sentiment,
        })),
        totalResults: knowledgeAtoms.length + marketAtoms.length,
      });
    } catch (err) {
      const { status, message } = safeError(err);
      res.status(status).json({ error: message });
    }
  });

  return router;
}
