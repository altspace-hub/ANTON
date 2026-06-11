/**
 * bundle-sharing.test.ts — Wave 4.9: bundle push moves the REAL file.
 *
 *   • pushBundle without bundleBase64 → honest error (no metadata-only pushes)
 *   • pushBundle stores the base64 + sha256 in the community-mail payload and
 *     ENQUEUES it on the existing P2P delivery queue (mocked transport = the
 *     in-memory fake db records the community_message_queue insert)
 *   • size cap → honest error
 *   • acceptPushedBundle: sha256-verifies, runs the dispatching validator,
 *     stores non-module bundles under the managed dir, marks delivered
 *   • tampered hash → refuses + marks failed
 *   • legacy metadata-only push → accepted with fileReceived:false
 *
 * In-memory fake DatabaseAdapter — no Postgres needed.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'crypto';
import os from 'os';
import path from 'path';
import { mkdtemp, rm, readFile } from 'fs/promises';
import AdmZip from 'adm-zip';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';
import { createBundleSharingService, MAX_PUSH_BUNDLE_BYTES } from '../../server/services/bundle-sharing-service.js';
import { buildSpecManifest } from '../../server/services/anton-bundler.js';

interface MailRow {
  id: string;
  message_type: string;
  payload: string | null;
  delivery_status: string;
}

function makeFakeDb() {
  const mails = new Map<string, MailRow>();
  const queue: Array<{ mail_id: string; recipient_hash: string; payload_encrypted: string | null }> = [];
  const db: DatabaseAdapter = {
    dialect: 'postgresql',
    async get<T>(sql: string, ...params: unknown[]): Promise<T | undefined> {
      if (sql.includes('FROM community_identity') && sql.includes('contact_hash')) {
        return { contact_hash: 'me_hash', display_name: 'Sender' } as T;
      }
      if (sql.includes('FROM community_identity') && sql.includes('x25519')) {
        return undefined; // no E2E keys in this fixture → plain enqueue path
      }
      if (sql.includes('FROM community_connections')) {
        return String(params[0]) === 'peer_hash' ? ({ id: 'conn_1' } as T) : undefined;
      }
      if (sql.includes('FROM community_mail WHERE id = ?')) {
        const row = mails.get(String(params[0]));
        return row ? ({ payload: row.payload } as T) : undefined;
      }
      return undefined;
    },
    async all<T>(): Promise<T[]> { return []; },
    async run(sql: string, ...params: unknown[]): Promise<RunResult> {
      if (sql.includes('INSERT INTO community_mail')) {
        mails.set(String(params[0]), {
          id: String(params[0]),
          message_type: 'bundle_push',
          payload: String(params[5]),
          delivery_status: 'local',
        });
      }
      if (sql.includes('INSERT INTO community_message_queue')) {
        queue.push({
          mail_id: String(params[1]),
          recipient_hash: String(params[2]),
          payload_encrypted: (params[3] as string | null) ?? null,
        });
      }
      if (sql.includes("UPDATE community_mail SET delivery_status")) {
        const status = sql.includes("'delivered'") ? 'delivered' : 'failed';
        const row = mails.get(String(params[0]));
        if (row) row.delivery_status = status;
      }
      return { changes: 1, lastInsertRowid: 0 };
    },
    async exec(): Promise<void> { /* noop */ },
    async transaction<T>(fn: (db: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(db); },
    async close(): Promise<void> { /* noop */ },
  };
  return { db, mails, queue };
}

/** Minimal structural .anton (bundle_type 'skill') the dispatching validator passes. */
function makeSkillBundle(): Buffer {
  const zip = new AdmZip();
  const manifest = buildSpecManifest({
    bundleType: 'skill', id: 'test-skill', name: 'Test Skill',
    description: 'a test skill', contentsCount: { skills: 1 },
  });
  zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2)));
  zip.addFile('skills/test-skill.md', Buffer.from('# Test skill\nReusable prompt fragment.'));
  return zip.toBuffer();
}

let tmpDir: string;

beforeAll(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), 'anton-received-bundles-test-'));
  process.env.ANTON_RECEIVED_BUNDLES_DIR = tmpDir;
});

afterAll(async () => {
  delete process.env.ANTON_RECEIVED_BUNDLES_DIR;
  await rm(tmpDir, { recursive: true, force: true });
});

describe('bundle sharing — push moves real bytes (Wave 4.9)', () => {
  it('refuses a push without the actual file', async () => {
    const { db } = makeFakeDb();
    const svc = await createBundleSharingService(db);
    await expect(svc.pushBundle('skill', 'peer_hash', { name: 'x' }))
      .rejects.toThrow(/bundleBase64 is required/);
  });

  it('refuses a push above the 10 MB cap', async () => {
    const { db } = makeFakeDb();
    const svc = await createBundleSharingService(db);
    const big = Buffer.alloc(MAX_PUSH_BUNDLE_BYTES + 1).toString('base64');
    await expect(svc.pushBundle('skill', 'peer_hash', { bundleBase64: big }))
      .rejects.toThrow(/capped at 10 MB/);
  });

  it('push stores sha256 + bytes in the mail payload and enqueues delivery', async () => {
    const { db, mails, queue } = makeFakeDb();
    const svc = await createBundleSharingService(db);
    const bundle = makeSkillBundle();
    const result = await svc.pushBundle('skill', 'peer_hash', {
      name: 'Test Skill', bundleBase64: bundle.toString('base64'),
    });

    expect(result.bundleSha256).toBe(crypto.createHash('sha256').update(bundle).digest('hex'));
    expect(result.bundleSizeBytes).toBe(bundle.length);
    expect(result.queued).toBe(true);

    // payload carries the real bytes
    const mail = mails.get(result.mailId);
    expect(mail).toBeDefined();
    const payload = JSON.parse(mail!.payload!);
    expect(payload.bundleSha256).toBe(result.bundleSha256);
    expect(Buffer.from(payload.bundleBase64, 'base64').equals(bundle)).toBe(true);

    // enqueued on the existing delivery pipeline (mocked transport)
    expect(queue).toHaveLength(1);
    expect(queue[0].mail_id).toBe(result.mailId);
    expect(queue[0].recipient_hash).toBe('peer_hash');
  });

  it('accept verifies the hash, validates, stores the file, marks delivered', async () => {
    const { db, mails } = makeFakeDb();
    const svc = await createBundleSharingService(db);
    const bundle = makeSkillBundle();
    const { mailId, bundleSha256 } = await svc.pushBundle('skill', 'peer_hash', {
      bundleBase64: bundle.toString('base64'),
    });

    const result = await svc.acceptPushedBundle(mailId);
    expect(result.accepted).toBe(true);
    expect(result.fileReceived).toBe(true);
    expect(result.bundleSha256).toBe(bundleSha256);
    expect(result.validation?.bundle_type).toBe('skill');
    expect(result.validation?.valid).toBe(true);
    expect(result.imported).toBe(false); // non-module → stored, not auto-installed
    expect(result.storedPath).toBeTruthy();
    // the stored file is byte-identical
    const stored = await readFile(result.storedPath!);
    expect(stored.equals(bundle)).toBe(true);
    expect(mails.get(mailId)?.delivery_status).toBe('delivered');
  });

  it('refuses a tampered bundle (declared hash ≠ received bytes) and marks failed', async () => {
    const { db, mails } = makeFakeDb();
    const svc = await createBundleSharingService(db);
    const bundle = makeSkillBundle();
    const { mailId } = await svc.pushBundle('skill', 'peer_hash', {
      bundleBase64: bundle.toString('base64'),
    });
    // tamper: swap the payload bytes but keep the declared hash
    const mail = mails.get(mailId)!;
    const payload = JSON.parse(mail.payload!);
    payload.bundleBase64 = Buffer.from('tampered-bytes').toString('base64');
    mail.payload = JSON.stringify(payload);

    await expect(svc.acceptPushedBundle(mailId)).rejects.toThrow(/integrity check failed/);
    expect(mails.get(mailId)?.delivery_status).toBe('failed');
  });

  it('legacy metadata-only push accepts honestly with fileReceived:false', async () => {
    const { db, mails } = makeFakeDb();
    mails.set('cm_legacy', {
      id: 'cm_legacy', message_type: 'bundle_push',
      payload: JSON.stringify({ bundleType: 'skill', bundleName: 'old push' }),
      delivery_status: 'local',
    });
    const svc = await createBundleSharingService(db);
    const result = await svc.acceptPushedBundle('cm_legacy');
    expect(result.accepted).toBe(true);
    expect(result.fileReceived).toBe(false);
    expect(result.note).toMatch(/no file/);
  });
});
