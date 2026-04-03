/**
 * relay-service.ts — Store-and-forward relay for offline ANTON peers
 *
 * The relay stores encrypted message blobs for recipients who are not currently
 * online. Messages are E2E encrypted — the relay sees only ciphertext, sender hash,
 * and recipient hash. It cannot read message content.
 *
 * Design principles:
 * - Self-hostable: organisations can run their own relay
 * - No plaintext storage: relay stores only encrypted payloads
 * - Time-limited: messages expire after configurable TTL (default 30 days)
 * - Minimal metadata: only what's needed for delivery
 */

import type { DatabaseAdapter } from '../db/database.js';

const DEFAULT_TTL_DAYS = parseInt(process.env.RELAY_MESSAGE_TTL_DAYS || '30', 10);

export async function createRelayService(db: DatabaseAdapter) {

  /**
   * Store an encrypted message for an offline recipient.
   */
  async function storeMessage(params: {
    recipientHash: string;
    senderHash: string;
    encryptedPayload: string;
    messageType?: string;
    ttlDays?: number;
  }): Promise<string> {
    const id = `relay_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const ttl = Math.min(params.ttlDays ?? DEFAULT_TTL_DAYS, 90); // max 90 days

    await db.run(`
      INSERT INTO relay_messages (id, recipient_hash, sender_hash, encrypted_payload, message_type, ttl_days, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, NOW() + MAKE_INTERVAL(days => ?))
    `, id, params.recipientHash, params.senderHash, params.encryptedPayload,
       params.messageType ?? 'mail', ttl, ttl);

    return id;
  }

  /**
   * Collect all pending messages for a recipient.
   * Marks them as collected so they won't be returned again.
   */
  async function collectMessages(recipientHash: string): Promise<Array<{
    id: string;
    sender_hash: string;
    encrypted_payload: string;
    message_type: string;
    stored_at: string;
  }>> {
    const messages = await db.all<{
      id: string;
      sender_hash: string;
      encrypted_payload: string;
      message_type: string;
      stored_at: string;
    }>(`
      SELECT id, sender_hash, encrypted_payload, message_type, stored_at
      FROM relay_messages
      WHERE recipient_hash = ? AND collected_at IS NULL AND expires_at > NOW()
      ORDER BY stored_at ASC
    `, recipientHash);

    if (messages.length > 0) {
      const ids = messages.map(m => m.id);
      const placeholders = ids.map(() => '?').join(',');
      await db.run(
        `UPDATE relay_messages SET collected_at = NOW(), collected_by = ? WHERE id IN (${placeholders})`,
        recipientHash, ...ids
      );
    }

    return messages;
  }

  /**
   * Purge expired messages. Run periodically (e.g., daily cron).
   */
  async function purgeExpired(): Promise<number> {
    const result = await db.run('DELETE FROM relay_messages WHERE expires_at < NOW()');
    return (result as { changes?: number })?.changes ?? 0;
  }

  /**
   * Get relay stats (for admin dashboard).
   */
  async function getStats(): Promise<{
    pendingMessages: number;
    collectedMessages: number;
    expiredPurged: number;
  }> {
    const pending = await db.get<{ count: number }>('SELECT COUNT(*) as count FROM relay_messages WHERE collected_at IS NULL AND expires_at > NOW()');
    const collected = await db.get<{ count: number }>('SELECT COUNT(*) as count FROM relay_messages WHERE collected_at IS NOT NULL');
    return {
      pendingMessages: pending?.count ?? 0,
      collectedMessages: collected?.count ?? 0,
      expiredPurged: 0, // tracked by purgeExpired return value
    };
  }

  return { storeMessage, collectMessages, purgeExpired, getStats };
}
