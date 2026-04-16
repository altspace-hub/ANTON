import type { DatabaseAdapter } from '../db/database.js';
import { createHash, sign, verify, generateKeyPairSync } from 'crypto';
import { encrypt, decrypt } from './credential-vault.js';

export async function createSigningService(db: DatabaseAdapter) {

  function sha256(data: string): string {
    return createHash('sha256').update(data, 'utf8').digest('hex');
  }

  async function getIdentity(): Promise<{ contact_hash: string; public_key: string; private_key_encrypted: string | null } | null> {
    return await db.get(
      'SELECT contact_hash, public_key, private_key_encrypted FROM community_identity LIMIT 1'
    ) as { contact_hash: string; public_key: string; private_key_encrypted: string | null } | undefined ?? null;
  }

  /**
   * Generate an Ed25519 keypair, encrypt the private key, and store both.
   * Called once during identity activation. Returns the public key (hex).
   */
  async function generateAndStoreKeypair(identityId: string): Promise<string> {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const pubHex = publicKey.export({ type: 'spki', format: 'der' }).toString('hex');
    const privHex = privateKey.export({ type: 'pkcs8', format: 'der' }).toString('hex');
    const encryptedPriv = encrypt(privHex);

    await db.run(
      `UPDATE community_identity SET public_key = ?, private_key_encrypted = ? WHERE id = ?`,
      pubHex, encryptedPriv, identityId
    );

    return pubHex;
  }

  /**
   * Sign data with Ed25519 private key. Falls back to SHA256 hash if no private key available.
   */
  function ed25519Sign(data: string, encryptedPrivKey: string | null): string {
    if (!encryptedPrivKey) {
      // Fallback: deterministic hash (not cryptographically provable, but preserves chain integrity)
      return 'unsigned:' + sha256(data);
    }
    try {
      const privHex = decrypt(encryptedPrivKey);
      const privDer = Buffer.from(privHex, 'hex');
      // Use Node.js built-in Ed25519 signing
      const signature = sign(null, Buffer.from(data, 'utf8'), {
        key: privDer,
        format: 'der',
        type: 'pkcs8',
      });
      return signature.toString('hex');
    } catch (err) {
      console.error('[signing] Ed25519 sign failed, falling back to unsigned:', err instanceof Error ? err.message : err);
      return 'unsigned:' + sha256(data);
    }
  }

  /**
   * Verify an Ed25519 signature against a public key.
   */
  function ed25519Verify(data: string, signature: string, pubKeyHex: string): boolean {
    if (signature.startsWith('unsigned:')) return false; // Unsigned entries cannot be verified
    if (!pubKeyHex) return false;
    try {
      const pubDer = Buffer.from(pubKeyHex, 'hex');
      return verify(null, Buffer.from(data, 'utf8'), {
        key: pubDer,
        format: 'der',
        type: 'spki',
      }, Buffer.from(signature, 'hex'));
    } catch {
      return false;
    }
  }

  /**
   * Create a signed trail entry linked to a task.
   * Uses Ed25519 signing when private key is available.
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
    const privateKeyEncrypted = identity?.private_key_encrypted ?? null;

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

    // Ed25519 signature over the entry hash
    const signature = ed25519Sign(entryHash, privateKeyEncrypted);

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
   * Verify a trail's hash chain integrity AND Ed25519 signatures.
   */
  async function verifyTrail(taskId: string): Promise<{
    valid: boolean; entriesChecked: number; entriesValid: number;
    signatureVerified: boolean;
    failures: Array<{ index: number; reason: string }>;
  }> {
    const trailId = `trail_${taskId}`;
    const entries = await db.all<{
      entry_index: number; content: string; content_hash: string;
      prev_hash: string | null; entry_hash: string; signature: string;
      signer_hash: string; signer_public_key: string;
    }>(
      'SELECT entry_index, content, content_hash, prev_hash, entry_hash, signature, signer_hash, signer_public_key FROM community_signed_trail_entries WHERE trail_id = ? ORDER BY entry_index ASC',
      trailId
    );

    const failures: Array<{ index: number; reason: string }> = [];
    let prevHash: string | null = null;
    let allSigned = true;

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

      // Verify Ed25519 signature
      if (entry.signature.startsWith('unsigned:')) {
        allSigned = false;
      } else if (entry.signer_public_key) {
        const sigValid = ed25519Verify(entry.entry_hash, entry.signature, entry.signer_public_key);
        if (!sigValid) {
          failures.push({ index: entry.entry_index, reason: 'Ed25519 signature verification failed — entry may have been forged' });
        }
      }

      prevHash = entry.entry_hash;
    }

    return {
      valid: failures.length === 0,
      entriesChecked: entries.length,
      entriesValid: entries.length - failures.length,
      signatureVerified: allSigned && entries.length > 0,
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

  return { createTrailEntry, verifyTrail, getTrailEntries, generateAndStoreKeypair, ed25519Sign, ed25519Verify, sha256 };
}

export type SigningService = Awaited<ReturnType<typeof createSigningService>>;
