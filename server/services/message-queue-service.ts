import type { DatabaseAdapter } from '../db/database.js';

// Track A5: SSRF guard moved into peer-transport-service alongside the
// HTTPS dispatcher (the only place that opens fetch on a peer URL).

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
   * Resolve a contact hash to a deliverable connection. Track A5: returns
   * the full connection row so peer-transport-service can pick mesh vs
   * HTTPS, not just the endpoint URL. Null means local-only contact (no
   * delivery attempt — mail is marked delivered locally).
   *
   * "deliverable" = (HTTPS endpoint set) OR (mesh address fields set).
   * A connection with neither stays local-only.
   */
  async function resolveConnection(recipientHash: string): Promise<{
    id: string;
    endpoint: string | null;
    peer_instance_pubkey: string | null;
    peer_relay_endpoints: string | string[] | null;
  } | null> {
    const conn = await db.get<{
      id: string; endpoint: string | null;
      peer_instance_pubkey: string | null;
      peer_relay_endpoints: string | string[] | null;
    }>(
      `SELECT id, endpoint, peer_instance_pubkey, peer_relay_endpoints
         FROM community_connections
        WHERE contact_hash = ? AND status IN ('accepted', 'active')`,
      recipientHash,
    );
    if (!conn) return null;
    const meshReady = !!conn.peer_instance_pubkey
      && !!conn.peer_relay_endpoints;
    if (!conn.endpoint && !meshReady) return null;
    return conn;
  }

  /**
   * Deliver a queued mail message to its recipient. Track A5: routes
   * through peer-transport-service which prefers mesh and falls back to
   * HTTPS — the body construction (subject/body redaction when encrypted,
   * payload metadata) is the same as before, just no longer tied to a
   * specific transport.
   *
   * The legacy SSRF guard now lives inside peer-transport-service for the
   * HTTPS path; this function trusts that and focuses on body shape.
   */
  async function deliverMail(
    connectionId: string,
    mailId: string,
    encryptedPayload: string | null,
  ): Promise<{ success: boolean; httpStatus: number; transport: 'mesh' | 'https' | 'none' }> {
    const mail = await db.get<Record<string, unknown>>(
      'SELECT id, from_hash, to_hashes, subject, body, message_type, payload, payload_metadata, thread_id, parent_id FROM community_mail WHERE id = ?',
      mailId,
    );
    if (!mail) return { success: false, httpStatus: 0, transport: 'none' };

    // When the payload is end-to-end encrypted, the plaintext subject/body
    // are redacted on the wire — the peer decrypts the envelope.
    const hasEncryption = !!encryptedPayload;
    const body = JSON.stringify({
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
    });

    const { sendToPeer } = await import('./peer-transport-service.js');
    const outcome = await sendToPeer(db, {
      connectionId,
      path: '/api/p2p/receive',
      body,
      totalTimeoutMs: 15_000,
    });
    if (!outcome.ok) {
      console.error(`[p2p] delivery via ${outcome.transport} failed: ${outcome.error ?? `HTTP ${outcome.httpStatus}`}`);
    }
    return { success: outcome.ok, httpStatus: outcome.httpStatus, transport: outcome.transport };
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
      const conn = await resolveConnection(msg.recipient_hash);

      if (!conn) {
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

      // Track A5: route through peer-transport-service (mesh-first, HTTPS-fallback)
      const result = await deliverMail(conn.id, msg.mail_id, msg.payload_encrypted);

      if (result.success) {
        await db.run(
          "UPDATE community_message_queue SET status = 'sent', delivery_method = ?, last_http_status = ?, updated_at = NOW() WHERE id = ?",
          result.transport, result.httpStatus, msg.id
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
              const identity = await db.get<{ contact_hash: string }>(
                "SELECT contact_hash FROM community_identity WHERE user_id = 'default'"
              );
              const senderHash = identity?.contact_hash ?? 'unknown';

              // Try public relay first (works across networks)
              let relayed = false;
              const { isPublicRelayConfigured, storeOnPublicRelay } = await import('./public-relay-client.js');
              if (isPublicRelayConfigured()) {
                const stored = await storeOnPublicRelay({
                  recipientHash: msg.recipient_hash,
                  senderHash,
                  encryptedPayload: msg.payload_encrypted,
                });
                if (stored) relayed = true;
              }

              // Fall back to local relay (works when peer polls our relay)
              if (!relayed) {
                const { createRelayService } = await import('./relay-service.js');
                const relay = await createRelayService(db);
                await relay.storeMessage({
                  recipientHash: msg.recipient_hash,
                  senderHash,
                  encryptedPayload: msg.payload_encrypted,
                  messageType: 'mail',
                });
              }
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

    let collected = 0, processed = 0;

    // ── Collect from public relay first (cross-network messages) ──
    try {
      const { isPublicRelayConfigured, collectFromPublicRelay } = await import('./public-relay-client.js');
      if (isPublicRelayConfigured()) {
        const relayMessages = await collectFromPublicRelay(identity.contact_hash);
        for (const msg of relayMessages) {
          try {
            const receiveUrl = `http://localhost:${process.env.PORT || '3001'}/api/p2p/receive`;
            const receiveRes = await fetch(receiveUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                mailId: `relay_pub_${msg.id}`,
                fromHash: msg.sender_hash,
                toHashes: JSON.stringify([identity.contact_hash]),
                subject: '[Relayed]',
                body: '',
                encryptedPayload: msg.encrypted_payload,
                messageType: msg.message_type,
              }),
              signal: AbortSignal.timeout(30_000),
            });
            if (receiveRes.ok) { collected++; processed++; }
          } catch { /* skip individual failures */ }
        }
      }
    } catch { /* public relay not available */ }

    // ── Collect from peer relays (same-network fallback) ──

    // Get all connected peers with endpoints
    const peers = await db.all<{ contact_hash: string; endpoint: string }>(
      "SELECT contact_hash, endpoint FROM community_connections WHERE endpoint IS NOT NULL AND status IN ('accepted', 'active')"
    );

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

  return { enqueueMessage, processQueue, getQueueStatus, retryFailed, collectFromPeerRelays };
}

export type MessageQueueService = Awaited<ReturnType<typeof createMessageQueueService>>;
