import type { DatabaseAdapter } from '../db/database.js';

/**
 * Validate a peer endpoint URL to prevent SSRF attacks.
 * Only allows http/https schemes, blocks localhost and private IP ranges
 * (except when ALLOW_PRIVATE_P2P=true for local development).
 */
function validateEndpointUrl(endpoint: string): boolean {
  try {
    const parsed = new URL(endpoint);
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;

    // In production, block private networks. Allow for local dev.
    if (process.env.ALLOW_PRIVATE_P2P === 'true') return true;

    const hostname = parsed.hostname.toLowerCase();
    // Block localhost
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') return false;
    // Block private IPv4 ranges
    if (/^10\./.test(hostname)) return false;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) return false;
    if (/^192\.168\./.test(hostname)) return false;
    // Block link-local
    if (/^169\.254\./.test(hostname)) return false;

    return true;
  } catch {
    return false;
  }
}

export async function createMessageQueueService(db: DatabaseAdapter) {

  async function enqueueMessage(mailId: string, recipientHash: string, encryptedPayload?: string): Promise<string> {
    const id = `mq_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await db.run(`
      INSERT INTO community_message_queue (id, mail_id, recipient_hash, payload_encrypted, status)
      VALUES (?, ?, ?, ?, 'pending')
    `, id, mailId, recipientHash, encryptedPayload ?? null);
    return id;
  }

  /**
   * Resolve a contact hash to their P2P endpoint URL.
   * Returns null if no endpoint configured (local-only contact).
   */
  async function resolveEndpoint(recipientHash: string): Promise<string | null> {
    const conn = await db.get<{ endpoint: string | null }>(
      "SELECT endpoint FROM community_connections WHERE contact_hash = ? AND status IN ('accepted', 'active')",
      recipientHash
    );
    return conn?.endpoint ?? null;
  }

  /**
   * Attempt HTTP delivery of a message to a peer ANTON instance.
   * The peer exposes POST /api/p2p/receive for inbound messages.
   */
  async function deliverViaHttp(
    endpoint: string,
    mailId: string,
    recipientHash: string,
    encryptedPayload: string | null,
  ): Promise<{ success: boolean; httpStatus: number }> {
    // Validate endpoint URL to prevent SSRF
    if (!validateEndpointUrl(endpoint)) {
      console.warn(`[p2p] Blocked delivery to invalid/private endpoint: ${endpoint}`);
      return { success: false, httpStatus: 0 };
    }

    const url = `${endpoint.replace(/\/+$/, '')}/api/p2p/receive`;
    try {
      // Load the full mail record for delivery
      const mail = await db.get<Record<string, unknown>>(
        'SELECT id, from_hash, to_hashes, subject, body, message_type, payload, payload_metadata, thread_id, parent_id FROM community_mail WHERE id = ?',
        mailId
      );
      if (!mail) return { success: false, httpStatus: 0 };

      // If we have an encrypted payload, send it as the primary content
      // The receiver will decrypt using X25519 DH + AES-256-GCM
      // Plaintext subject/body are sent as empty when encrypted (peer decrypts from encryptedPayload)
      const hasEncryption = !!encryptedPayload;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mailId: mail.id,
          fromHash: mail.from_hash,
          toHashes: mail.to_hashes,
          subject: hasEncryption ? '[encrypted]' : mail.subject,
          body: hasEncryption ? '[encrypted]' : mail.body,
          messageType: mail.message_type,
          payload: hasEncryption ? null : mail.payload,
          payloadMetadata: hasEncryption ? null : mail.payload_metadata,
          threadId: mail.thread_id,
          parentId: mail.parent_id,
          encryptedPayload: encryptedPayload ?? undefined,
        }),
        signal: AbortSignal.timeout(15_000), // 15s timeout
      });

      return { success: response.ok, httpStatus: response.status };
    } catch (err) {
      // Network error, timeout, DNS failure, etc.
      console.error(`[p2p] HTTP delivery to ${url} failed:`, err instanceof Error ? err.message : err);
      return { success: false, httpStatus: 0 };
    }
  }

  /**
   * Compute exponential backoff delay for retries.
   * Retry 1: 1 min, Retry 2: 2 min, Retry 3: 4 min, Retry 4: 8 min, Retry 5: 16 min
   */
  function getRetryDelay(retryCount: number): number {
    return Math.min(Math.pow(2, retryCount), 16) * 60; // seconds, max 16 minutes
  }

  async function processQueue(): Promise<{ sent: number; failed: number; local: number }> {
    const pending = await db.all<{
      id: string; mail_id: string; recipient_hash: string;
      payload_encrypted: string | null;
      retry_count: number; max_retries: number;
    }>(
      "SELECT id, mail_id, recipient_hash, payload_encrypted, retry_count, max_retries FROM community_message_queue WHERE status = 'pending' AND next_retry_at <= NOW() LIMIT 20"
    );

    let sent = 0, failed = 0, local = 0;
    for (const msg of pending) {
      const endpoint = await resolveEndpoint(msg.recipient_hash);

      if (!endpoint) {
        // Local-only contact — mark as delivered locally
        await db.run(
          "UPDATE community_message_queue SET status = 'sent', delivery_method = 'local', updated_at = NOW() WHERE id = ?",
          msg.id
        );
        await db.run(
          "UPDATE community_mail SET delivery_status = 'delivered', delivery_attempts = delivery_attempts + 1, last_delivery_attempt = NOW(), delivered_at = NOW() WHERE id = ?",
          msg.mail_id
        );
        local++;
        sent++;
        continue;
      }

      // Attempt HTTP delivery to peer
      const result = await deliverViaHttp(endpoint, msg.mail_id, msg.recipient_hash, msg.payload_encrypted);

      if (result.success) {
        await db.run(
          "UPDATE community_message_queue SET status = 'sent', delivery_method = 'http', last_http_status = ?, updated_at = NOW() WHERE id = ?",
          result.httpStatus, msg.id
        );
        await db.run(
          "UPDATE community_mail SET delivery_status = 'delivered', delivery_attempts = delivery_attempts + 1, last_delivery_attempt = NOW(), delivered_at = NOW() WHERE id = ?",
          msg.mail_id
        );
        sent++;
      } else {
        // Delivery failed — retry with exponential backoff, then fall back to relay
        const newRetryCount = msg.retry_count + 1;
        if (newRetryCount >= msg.max_retries) {
          // ── Relay Fallback: store encrypted message for later collection ──
          if (msg.payload_encrypted) {
            try {
              const { createRelayService } = await import('./relay-service.js');
              const relay = await createRelayService(db);
              const identity = await db.get<{ contact_hash: string }>(
                "SELECT contact_hash FROM community_identity WHERE user_id = 'default'"
              );
              await relay.storeMessage({
                recipientHash: msg.recipient_hash,
                senderHash: identity?.contact_hash ?? 'unknown',
                encryptedPayload: msg.payload_encrypted,
                messageType: 'mail',
              });
              await db.run(
                "UPDATE community_message_queue SET status = 'sent', delivery_method = 'relay', retry_count = ?, last_http_status = ?, updated_at = NOW() WHERE id = ?",
                newRetryCount, result.httpStatus, msg.id
              );
              await db.run(
                "UPDATE community_mail SET delivery_status = 'relayed', delivery_attempts = delivery_attempts + 1, last_delivery_attempt = NOW() WHERE id = ?",
                msg.mail_id
              );
              console.log(`[p2p] Direct delivery failed → stored on relay for ${msg.recipient_hash}`);
              sent++;
              continue;
            } catch (relayErr) {
              console.error('[p2p] Relay fallback also failed:', relayErr instanceof Error ? relayErr.message : relayErr);
            }
          }

          await db.run(
            "UPDATE community_message_queue SET status = 'failed', retry_count = ?, last_http_status = ?, updated_at = NOW() WHERE id = ?",
            newRetryCount, result.httpStatus, msg.id
          );
          await db.run(
            "UPDATE community_mail SET delivery_status = 'failed', delivery_attempts = delivery_attempts + 1, last_delivery_attempt = NOW() WHERE id = ?",
            msg.mail_id
          );
          failed++;
        } else {
          const delaySec = getRetryDelay(newRetryCount);
          await db.run(
            "UPDATE community_message_queue SET retry_count = ?, last_http_status = ?, next_retry_at = NOW() + INTERVAL '1 second' * ?, updated_at = NOW() WHERE id = ?",
            newRetryCount, result.httpStatus, delaySec, msg.id
          );
          await db.run(
            "UPDATE community_mail SET delivery_attempts = delivery_attempts + 1, last_delivery_attempt = NOW() WHERE id = ?",
            msg.mail_id
          );
          // Not counted as sent or failed yet — will retry
        }
      }
    }
    return { sent, failed, local };
  }

  async function getQueueStatus(): Promise<{ pending: number; sent: number; failed: number; expired: number }> {
    const rows = await db.all<{ status: string; count: number }>(
      "SELECT status, COUNT(*) as count FROM community_message_queue GROUP BY status"
    );
    const result = { pending: 0, sent: 0, failed: 0, expired: 0 };
    for (const r of rows) {
      if (r.status in result) (result as Record<string, number>)[r.status] = Number(r.count);
    }
    return result;
  }

  async function retryFailed(queueId: string): Promise<void> {
    await db.run(
      "UPDATE community_message_queue SET status = 'pending', retry_count = retry_count + 1, next_retry_at = NOW(), updated_at = NOW() WHERE id = ? AND status = 'failed'",
      queueId
    );
  }

  /**
   * Collect messages from peer relays.
   * For each connected peer with an endpoint, check their relay for messages addressed to us.
   * This enables delivery across different networks: sender stores on their relay,
   * recipient collects from sender's relay when online.
   */
  async function collectFromPeerRelays(): Promise<{ collected: number; processed: number }> {
    const identity = await db.get<{ contact_hash: string }>(
      "SELECT contact_hash FROM community_identity WHERE user_id = 'default'"
    );
    if (!identity) return { collected: 0, processed: 0 };

    // Get all connected peers with endpoints
    const peers = await db.all<{ contact_hash: string; endpoint: string }>(
      "SELECT contact_hash, endpoint FROM community_connections WHERE endpoint IS NOT NULL AND status IN ('accepted', 'active')"
    );

    let collected = 0, processed = 0;

    for (const peer of peers) {
      try {
        const collectUrl = `${peer.endpoint.replace(/\/+$/, '')}/api/relay/collect/${encodeURIComponent(identity.contact_hash)}`;
        const res = await fetch(collectUrl, { signal: AbortSignal.timeout(10_000) });
        if (!res.ok) continue;

        const messages = await res.json() as Array<{
          id: string; sender_hash: string; encrypted_payload: string;
          message_type: string; stored_at: string;
        }>;

        if (!Array.isArray(messages) || messages.length === 0) continue;
        collected += messages.length;

        // Process each relayed message through the P2P receive pipeline
        for (const msg of messages) {
          try {
            const receiveUrl = `http://localhost:${process.env.PORT || '3001'}/api/p2p/receive`;
            const receiveRes = await fetch(receiveUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                mailId: `relay_${msg.id}`,
                fromHash: msg.sender_hash,
                toHashes: JSON.stringify([identity.contact_hash]),
                subject: '[Relayed]',
                body: '',
                encryptedPayload: msg.encrypted_payload,
                messageType: msg.message_type,
              }),
              signal: AbortSignal.timeout(30_000),
            });
            if (receiveRes.ok) processed++;
          } catch (procErr) {
            console.error(`[relay-collect] Failed to process relayed message ${msg.id}:`, procErr instanceof Error ? procErr.message : procErr);
          }
        }

        if (messages.length > 0) {
          console.log(`[relay-collect] Collected ${messages.length} messages from ${peer.contact_hash}'s relay`);
        }
      } catch {
        // Peer offline or relay not available — skip silently
      }
    }

    return { collected, processed };
  }

  return { enqueueMessage, processQueue, getQueueStatus, retryFailed, resolveEndpoint, collectFromPeerRelays };
}

export type MessageQueueService = Awaited<ReturnType<typeof createMessageQueueService>>;
