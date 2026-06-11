/**
 * bundle-sharing-service.ts — push real .anton files to community contacts.
 *
 * Wave 4.9 (CORE_EXPERIENCE_REVIEW_2026-06): before this, pushBundle sent
 * only {bundleType, name, sender} metadata over community mail — the file
 * never travelled. Now the actual bundle bytes ride INSIDE the community-mail
 * payload (base64) and the mail is enqueued on the existing P2P delivery
 * pipeline (message-queue-service → HTTPS direct / mesh / relay):
 *
 *   • push   = community_mail row (message_type 'bundle_push') whose payload
 *              carries { bundleBase64, bundleSha256, bundleSizeBytes, … },
 *              E2E-encrypted with the same X25519 path as regular mail when
 *              both parties have keys (which also enables the relay
 *              store-and-forward fallback), then enqueueMessage().
 *   • accept = sha256-verify the received bytes, run the dispatching
 *              validator (provenance/signature surfaces from Wave 2.4 apply
 *              automatically), auto-install module bundles via the normal
 *              importer, and store every other type under a managed dir for
 *              the type-specific import surface.
 *
 * Size cap: 10 MB raw (≈13.4 MB base64) — well inside the 50 MB JSON body
 * limit on /p2p/receive, with an honest error above.
 */

import crypto from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import type { DatabaseAdapter } from '../db/database.js';

export const MAX_PUSH_BUNDLE_BYTES = 10 * 1024 * 1024; // 10 MB raw

/** Managed storage dir for accepted non-module bundles. No user paths. */
function receivedBundlesDir(): string {
  return process.env.ANTON_RECEIVED_BUNDLES_DIR
    || path.join(process.cwd(), 'data', 'received-bundles');
}

/** mailIds are server-generated, but sanitize anyway before touching the fs. */
function safeFileStem(mailId: string): string {
  return mailId.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80);
}

export interface PushBundleOptions {
  name?: string;
  /** Base64 of the actual .anton file — REQUIRED to move real bytes. */
  bundleBase64?: string;
}

export async function createBundleSharingService(db: DatabaseAdapter) {

  async function pushBundle(bundleType: string, contactHash: string, options?: PushBundleOptions): Promise<{
    mailId: string;
    bundleSha256: string;
    bundleSizeBytes: number;
    queued: boolean;
  }> {
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

    // The real file is mandatory now — a push without bytes is the old
    // metadata-only behaviour this wave removes.
    const b64 = options?.bundleBase64;
    if (!b64 || typeof b64 !== 'string' || b64.trim().length === 0) {
      throw new Error('bundleBase64 is required — attach the exported .anton file (base64) to push it');
    }
    const data = Buffer.from(b64, 'base64');
    if (data.length === 0) throw new Error('bundleBase64 did not decode to any bytes');
    if (data.length > MAX_PUSH_BUNDLE_BYTES) {
      throw new Error(
        `Bundle is ${(data.length / 1024 / 1024).toFixed(1)} MB — pushes over community mail are capped at ${MAX_PUSH_BUNDLE_BYTES / 1024 / 1024} MB. Publish to the marketplace instead.`
      );
    }
    const bundleSha256 = crypto.createHash('sha256').update(data).digest('hex');

    const payload = {
      bundleType,
      bundleName: options?.name ?? `${bundleType} bundle`,
      senderHash: identity?.contact_hash ?? 'unknown',
      senderName: identity?.display_name ?? 'ANTON',
      pushedAt: new Date().toISOString(),
      bundleSha256,
      bundleSizeBytes: data.length,
      bundleBase64: data.toString('base64'),
    };

    // Use from_hash / to_hashes to match community_mail schema
    const mailId = `cm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const subject = `[Bundle] ${payload.bundleName}`;
    const body = `Bundle push: ${bundleType} (${(data.length / 1024).toFixed(1)} KB, sha256 ${bundleSha256.slice(0, 12)}…)`;
    await db.run(`
      INSERT INTO community_mail (id, from_hash, to_hashes, subject, body, folder, message_type, payload)
      VALUES (?, ?, ?, ?, ?, 'sent', 'bundle_push', ?)
    `, mailId, identity?.contact_hash ?? 'self', JSON.stringify([contactHash]),
       subject, body, JSON.stringify(payload));

    // Enqueue on the existing P2P delivery pipeline (the old code never did —
    // pushes were silently local-only). E2E-encrypt when both sides have
    // X25519 keys, mirroring the regular mail-send path in routes/community.ts;
    // the encrypted payload also enables the relay store-and-forward fallback.
    let queued = false;
    try {
      const { getMyX25519Keys, getPeerX25519PublicKey, deriveSharedSecret, encryptMessage } =
        await import('./community-e2e.js');
      const { createMessageQueueService } = await import('./message-queue-service.js');
      const queueService = await createMessageQueueService(db);

      let encryptedPayload: string | undefined;
      const myKeys = await getMyX25519Keys(db);
      if (myKeys && identity?.contact_hash) {
        const peerPubKey = await getPeerX25519PublicKey(db, contactHash);
        if (peerPubKey) {
          const sharedSecret = deriveSharedSecret(myKeys.privateKeyHex, peerPubKey);
          const plaintext = JSON.stringify({
            subject, body,
            messageType: 'bundle_push',
            payload,
            nonce: crypto.randomUUID(),
            timestamp: Date.now(),
          });
          const aad = `${identity.contact_hash}:${contactHash}`;
          encryptedPayload = JSON.stringify(encryptMessage(plaintext, sharedSecret, aad));
        }
      }
      await queueService.enqueueMessage(mailId, contactHash, encryptedPayload);
      queued = true;
    } catch (err) {
      // Queueing failure is surfaced (delivery_status stays 'local') but the
      // mail row exists — the queue cron can be retried manually.
      console.error('[bundle-sharing] enqueue for delivery failed:', err instanceof Error ? err.message : err);
    }

    return { mailId, bundleSha256, bundleSizeBytes: data.length, queued };
  }

  async function previewPushedBundle(mailId: string) {
    const mail = await db.get<{ payload: string }>(
      "SELECT payload FROM community_mail WHERE id = ? AND message_type = 'bundle_push'", mailId
    );
    if (!mail) throw new Error(`Bundle push mail not found: ${mailId}`);
    const payload = typeof mail.payload === 'string' ? JSON.parse(mail.payload) : mail.payload;
    return {
      bundleType: payload.bundleType,
      bundleName: payload.bundleName,
      senderName: payload.senderName,
      pushedAt: payload.pushedAt,
      bundleSha256: payload.bundleSha256 ?? null,
      bundleSizeBytes: payload.bundleSizeBytes ?? null,
      hasFile: typeof payload.bundleBase64 === 'string' && payload.bundleBase64.length > 0,
    };
  }

  /**
   * Accept a pushed bundle: verify the sha256, run the dispatching validator
   * (structure + Ed25519 provenance), then either install (module bundles)
   * or store the file under the managed received-bundles dir and point at
   * the type-specific import surface.
   */
  async function acceptPushedBundle(mailId: string): Promise<{
    accepted: boolean;
    fileReceived: boolean;
    bundleSha256?: string;
    validation?: {
      valid: boolean;
      bundle_type?: string;
      validated_depth?: string;
      provenance?: unknown;
      notes?: string[];
      errors: unknown[];
      warnings: unknown[];
    };
    imported?: boolean;
    importMessage?: string;
    storedPath?: string;
    note?: string;
  }> {
    const mail = await db.get<{ payload: string | null }>(
      "SELECT payload FROM community_mail WHERE id = ? AND message_type = 'bundle_push'", mailId
    );
    if (!mail) throw new Error(`Bundle push mail not found: ${mailId}`);
    const payload = typeof mail.payload === 'string' ? JSON.parse(mail.payload) : (mail.payload ?? {});

    // Legacy metadata-only push (sent before file transfer support) — accept
    // the notification honestly, but say there was no file.
    if (typeof payload.bundleBase64 !== 'string' || payload.bundleBase64.length === 0) {
      await db.run("UPDATE community_mail SET delivery_status = 'delivered' WHERE id = ?", mailId);
      return {
        accepted: true,
        fileReceived: false,
        note: 'This push carried no file (sent before file-transfer support) — ask the sender to push again.',
      };
    }

    const data = Buffer.from(payload.bundleBase64, 'base64');
    const actualHash = crypto.createHash('sha256').update(data).digest('hex');
    if (typeof payload.bundleSha256 === 'string' && payload.bundleSha256.toLowerCase() !== actualHash) {
      await db.run("UPDATE community_mail SET delivery_status = 'failed' WHERE id = ?", mailId);
      throw new Error(
        `Bundle integrity check failed: declared sha256 ${String(payload.bundleSha256).slice(0, 12)}… but received ${actualHash.slice(0, 12)}… — refusing to accept`
      );
    }

    // Dispatching validator — Wave 2.1 structure pass per type, Wave 2.4
    // Ed25519 provenance + TOFU signer check ride along automatically.
    const { validateAntonFile } = await import('./anton-validator.js');
    const validation = await validateAntonFile(data, db);
    const validationSummary = {
      valid: validation.valid,
      bundle_type: validation.bundle_type,
      validated_depth: validation.validated_depth,
      provenance: validation.provenance,
      notes: validation.notes,
      errors: validation.errors,
      warnings: validation.warnings,
    };

    // Module bundles route straight into the normal import flow.
    if (validation.valid && validation.bundle_type === 'module') {
      const { importAntonFile } = await import('./anton-importer.js');
      const importResult = await importAntonFile(data, db);
      await db.run("UPDATE community_mail SET delivery_status = 'delivered' WHERE id = ?", mailId);
      return {
        accepted: true,
        fileReceived: true,
        bundleSha256: actualHash,
        validation: validationSummary,
        imported: importResult.success,
        importMessage: importResult.success
          ? `Module installed${importResult.moduleId ? `: ${importResult.moduleId}` : ''}`
          : 'Import failed — see validation errors',
      };
    }

    // Every other type: persist the file under the managed dir so the
    // type-specific import surface (see anton-validator DOMAIN_VALIDATED_TYPES
    // notes) can pick it up. Path is server-controlled — no user input.
    const dir = receivedBundlesDir();
    await mkdir(dir, { recursive: true });
    const storedPath = path.join(dir, `${safeFileStem(mailId)}.anton`);
    await writeFile(storedPath, data);
    await db.run("UPDATE community_mail SET delivery_status = 'delivered' WHERE id = ?", mailId);
    return {
      accepted: true,
      fileReceived: true,
      bundleSha256: actualHash,
      validation: validationSummary,
      imported: false,
      storedPath,
      note: validation.valid
        ? 'Bundle verified and stored — import it via the matching import surface for its type.'
        : 'Bundle stored but FAILED validation — review the errors before importing.',
    };
  }

  async function rejectPushedBundle(mailId: string): Promise<void> {
    await db.run("UPDATE community_mail SET delivery_status = 'failed' WHERE id = ?", mailId);
  }

  return { pushBundle, previewPushedBundle, acceptPushedBundle, rejectPushedBundle };
}

export type BundleSharingService = Awaited<ReturnType<typeof createBundleSharingService>>;
