import type { DatabaseAdapter } from '../db/database.js';
import { createHash } from 'crypto';

export async function createSigningService(db: DatabaseAdapter) {

  function sha256(data: string): string {
    return createHash('sha256').update(data, 'utf8').digest('hex');
  }

  async function getIdentity(): Promise<{ contact_hash: string; public_key: string } | null> {
    return await db.get('SELECT contact_hash, public_key FROM community_identity LIMIT 1') as { contact_hash: string; public_key: string } | undefined ?? null;
  }

  /**
   * Create a signed (or unsigned) trail entry linked to a task.
   * Gracefully degrades to unsigned if no signing key available.
   */
  async function createTrailEntry(params: {
    taskId: string;
    entryType: string;
    content: string;
    metadata?: Record<string, unknown>;
  }): Promise<string> {
    const identity = await getIdentity();
    const signerHash = identity?.contact_hash ?? 'unsigned';
    const publicKey = identity?.public_key ?? '';

    // Get trail ID (one trail per task)
    const trailId = `trail_${params.taskId}`;

    // Get previous entry for hash chain
    const prevEntry = await db.get<{ entry_hash: string; entry_index: number }>(
      'SELECT entry_hash, entry_index FROM community_signed_trail_entries WHERE trail_id = ? ORDER BY entry_index DESC LIMIT 1',
      trailId
    );
    const entryIndex = (prevEntry?.entry_index ?? -1) + 1;
    const prevHash = prevEntry?.entry_hash ?? null;

    // Compute hashes
    const contentHash = sha256(params.content);
    const timestamp = new Date().toISOString();
    const entryHash = sha256(`${entryIndex}|${contentHash}|${prevHash ?? 'genesis'}|${signerHash}|${timestamp}`);

    // Sign (placeholder — proper Ed25519 signing requires key management)
    // For now, use HMAC-like signature. Full Ed25519 when key unlocking is implemented.
    const signature = sha256(`sign:${entryHash}:${signerHash}`);

    const id = `ste_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await db.run(`
      INSERT INTO community_signed_trail_entries
        (id, trail_id, task_id, entry_index, entry_type, content, content_hash, prev_hash, entry_hash, signature, signer_hash, signer_public_key, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, id, trailId, params.taskId, entryIndex, params.entryType,
       params.content, contentHash, prevHash, entryHash, signature,
       signerHash, publicKey, JSON.stringify(params.metadata ?? {}));

    return id;
  }

  /**
   * Verify a trail's hash chain integrity.
   */
  async function verifyTrail(taskId: string): Promise<{
    valid: boolean; entriesChecked: number; entriesValid: number;
    failures: Array<{ index: number; reason: string }>;
  }> {
    const trailId = `trail_${taskId}`;
    const entries = await db.all<{
      entry_index: number; content: string; content_hash: string;
      prev_hash: string | null; entry_hash: string; signature: string;
      signer_hash: string;
    }>(
      'SELECT entry_index, content, content_hash, prev_hash, entry_hash, signature, signer_hash FROM community_signed_trail_entries WHERE trail_id = ? ORDER BY entry_index ASC',
      trailId
    );

    const failures: Array<{ index: number; reason: string }> = [];
    let prevHash: string | null = null;

    for (const entry of entries) {
      // Verify content hash
      const expectedContentHash = sha256(entry.content);
      if (expectedContentHash !== entry.content_hash) {
        failures.push({ index: entry.entry_index, reason: 'Content hash mismatch — content may have been tampered' });
      }

      // Verify chain linkage
      if (entry.entry_index > 0 && entry.prev_hash !== prevHash) {
        failures.push({ index: entry.entry_index, reason: 'Hash chain broken — previous entry hash does not match' });
      }

      prevHash = entry.entry_hash;
    }

    return {
      valid: failures.length === 0,
      entriesChecked: entries.length,
      entriesValid: entries.length - failures.length,
      failures,
    };
  }

  /**
   * Get all trail entries for a task.
   */
  async function getTrailEntries(taskId: string) {
    const trailId = `trail_${taskId}`;
    return await db.all(
      'SELECT * FROM community_signed_trail_entries WHERE trail_id = ? ORDER BY entry_index ASC',
      trailId
    );
  }

  return { createTrailEntry, verifyTrail, getTrailEntries, sha256 };
}

export type SigningService = Awaited<ReturnType<typeof createSigningService>>;
