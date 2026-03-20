import type { DatabaseAdapter } from '../db/database.js';

export async function createBundleSharingService(db: DatabaseAdapter) {

  async function pushBundle(bundleType: string, contactHash: string, options?: { name?: string }): Promise<{ mailId: string }> {
    // Get sender identity
    const identity = await db.get<{ contact_hash: string; display_name: string }>(
      'SELECT contact_hash, display_name FROM community_identity LIMIT 1'
    );

    // Validate connection
    const conn = await db.get<{ id: string }>(
      "SELECT id FROM community_connections WHERE contact_hash = ? AND status = 'accepted'",
      contactHash
    );
    if (!conn) throw new Error(`No active connection with ${contactHash}`);

    const payload = {
      bundleType,
      bundleName: options?.name ?? `${bundleType} bundle`,
      senderHash: identity?.contact_hash ?? 'unknown',
      senderName: identity?.display_name ?? 'ANTON',
      pushedAt: new Date().toISOString(),
    };

    // Use from_hash / to_hashes to match community_mail schema
    const mailId = `cm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await db.run(`
      INSERT INTO community_mail (id, from_hash, to_hashes, subject, body, folder, message_type, payload)
      VALUES (?, ?, ?, ?, ?, 'sent', 'bundle_push', ?)
    `, mailId, identity?.contact_hash ?? 'self', JSON.stringify([contactHash]),
       `[Bundle] ${payload.bundleName}`, `Bundle push: ${bundleType}`, JSON.stringify(payload));

    return { mailId };
  }

  async function previewPushedBundle(mailId: string) {
    const mail = await db.get<{ payload: string }>(
      "SELECT payload FROM community_mail WHERE id = ? AND message_type = 'bundle_push'", mailId
    );
    if (!mail) throw new Error(`Bundle push mail not found: ${mailId}`);
    const payload = typeof mail.payload === 'string' ? JSON.parse(mail.payload) : mail.payload;
    return { bundleType: payload.bundleType, bundleName: payload.bundleName, senderName: payload.senderName, pushedAt: payload.pushedAt };
  }

  async function acceptPushedBundle(mailId: string): Promise<{ accepted: boolean }> {
    // Mark as accepted
    await db.run("UPDATE community_mail SET delivery_status = 'delivered' WHERE id = ?", mailId);
    return { accepted: true };
  }

  async function rejectPushedBundle(mailId: string): Promise<void> {
    await db.run("UPDATE community_mail SET delivery_status = 'failed' WHERE id = ?", mailId);
  }

  return { pushBundle, previewPushedBundle, acceptPushedBundle, rejectPushedBundle };
}

export type BundleSharingService = Awaited<ReturnType<typeof createBundleSharingService>>;
