import type { DatabaseAdapter } from '../db/database.js';

export async function createMessageQueueService(db: DatabaseAdapter) {

  async function enqueueMessage(mailId: string, recipientHash: string, encryptedPayload?: string): Promise<string> {
    const id = `mq_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await db.run(`
      INSERT INTO community_message_queue (id, mail_id, recipient_hash, payload_encrypted, status)
      VALUES (?, ?, ?, ?, 'pending')
    `, id, mailId, recipientHash, encryptedPayload ?? null);
    return id;
  }

  async function processQueue(): Promise<{ sent: number; failed: number }> {
    const pending = await db.all<{ id: string; mail_id: string; recipient_hash: string; retry_count: number; max_retries: number }>(
      "SELECT id, mail_id, recipient_hash, retry_count, max_retries FROM community_message_queue WHERE status = 'pending' AND next_retry_at <= NOW() LIMIT 20"
    );

    let sent = 0, failed = 0;
    for (const msg of pending) {
      // For now, local-only mode: mark as sent immediately
      // When P2P or relay transport is added, this is where delivery happens
      await db.run(
        "UPDATE community_message_queue SET status = 'sent', updated_at = NOW() WHERE id = ?",
        msg.id
      );
      await db.run(
        "UPDATE community_mail SET delivery_status = 'sent', delivery_attempts = delivery_attempts + 1, last_delivery_attempt = NOW() WHERE id = ?",
        msg.mail_id
      );
      sent++;
    }
    return { sent, failed };
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

  return { enqueueMessage, processQueue, getQueueStatus, retryFailed };
}

export type MessageQueueService = Awaited<ReturnType<typeof createMessageQueueService>>;
