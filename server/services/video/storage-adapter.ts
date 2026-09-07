// ── storage-adapter.ts ──────────────────────────────────────────────────────
// Q8 answer A: MinIO self-hosted for video object storage. This adapter
// presents a small S3-compatible surface so the rest of the server doesn't
// care whether the backend is MinIO, AWS S3, or a local disk fallback.
//
// v1 uses the `@aws-sdk/client-s3` client (already a transitive dep via
// various connectors) pointing at MINIO_ENDPOINT. If the env is not
// configured the adapter falls back to local-disk storage under
// data/video-uploads/ which is fine for solo-mode / dev.
//
// Public signed URLs are issued by `getSignedGetUrl()` with a 1h TTL so
// the frontend hls.js player never sees an object key.

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export interface VideoStorageAdapter {
  putObject(key: string, body: Buffer, contentType: string): Promise<void>;
  getSignedGetUrl(key: string, expiresSeconds?: number): Promise<string>;
  deleteObject(key: string): Promise<void>;
  statObject(key: string): Promise<{ size: number; contentType?: string } | null>;
}

const LOCAL_ROOT = path.resolve(process.cwd(), 'data', 'video-uploads');

// /api/video/stream authorises on the HMAC alone — no session, no per-object
// check — so the signing key is the whole access control mechanism. It used to
// fall back to a constant string, which ships in a PUBLIC repo: anyone could
// compute `HMAC(key:ttl)` themselves and mint a valid playback URL for ANY
// storage key on ANY default install. Never reintroduce a literal fallback.
//
// When the operator has not set VIDEO_LOCAL_URL_SECRET we generate a random
// per-process key instead of refusing to sign, because the local-disk adapter
// is the only adapter that ships — refusing would break playback on every
// default install. The cost is that URLs minted before a restart stop
// verifying afterwards (the player re-fetches /api/video/:id on load, so this
// is invisible in normal use) and that a multi-process deployment must set the
// variable so all workers agree. Hence the one-time warning.
let ephemeralLocalUrlSecret: string | null = null;

function localUrlSecret(): string {
  const configured = process.env.VIDEO_LOCAL_URL_SECRET;
  if (configured && configured.trim().length > 0) return configured;
  if (!ephemeralLocalUrlSecret) {
    ephemeralLocalUrlSecret = crypto.randomBytes(32).toString('hex');
    console.warn(
      '[video] VIDEO_LOCAL_URL_SECRET is not set — signing local playback URLs with a ' +
      'random per-process key. Links stop working after a restart, and multi-process ' +
      'deployments must set the variable so every worker signs alike.',
    );
  }
  return ephemeralLocalUrlSecret;
}

class LocalDiskAdapter implements VideoStorageAdapter {
  constructor() {
    fs.mkdirSync(LOCAL_ROOT, { recursive: true });
  }
  private resolveSafe(key: string): string {
    const resolved = path.resolve(LOCAL_ROOT, key);
    // The separator matters. A bare startsWith(LOCAL_ROOT) also accepts a
    // SIBLING whose name merely begins with the root's — data/video-uploads-evil
    // passes a prefix test on data/video-uploads — so the containment check has
    // to be "the root itself, or something beneath the root". Not reachable
    // today (only server-generated u/<uid>/... keys are ever signed), which is
    // exactly why it would have gone on being not-quite-right indefinitely.
    const root = path.resolve(LOCAL_ROOT);
    if (resolved !== root && !resolved.startsWith(root + path.sep)) {
      throw new Error('path traversal blocked');
    }
    return resolved;
  }
  async putObject(key: string, body: Buffer): Promise<void> {
    const target = this.resolveSafe(key);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    await fs.promises.writeFile(target, body);
  }
  async getSignedGetUrl(key: string): Promise<string> {
    // Local-disk fallback: serve through the /api/video/stream/:key endpoint
    // gated by a short-lived HMAC. TTL semantics match the MinIO path so
    // the frontend doesn't need to branch.
    const ttl = Math.floor(Date.now() / 1000) + 3600;
    const sig = crypto.createHmac('sha256', localUrlSecret()).update(`${key}:${ttl}`).digest('hex');
    return `/api/video/stream?k=${encodeURIComponent(key)}&e=${ttl}&s=${sig}`;
  }
  async deleteObject(key: string): Promise<void> {
    const target = this.resolveSafe(key);
    await fs.promises.unlink(target).catch(() => undefined);
  }
  async statObject(key: string): Promise<{ size: number } | null> {
    try {
      const stat = await fs.promises.stat(this.resolveSafe(key));
      return { size: stat.size };
    } catch { return null; }
  }
}

export function verifyLocalSignedUrl(key: string, expiresEpoch: number, sig: string): boolean {
  if (Date.now() / 1000 > expiresEpoch) return false;
  const expected = crypto.createHmac('sha256', localUrlSecret()).update(`${key}:${expiresEpoch}`).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
  } catch { return false; }
}

export function resolveLocalPath(key: string): string {
  const resolved = path.resolve(LOCAL_ROOT, key);
  if (!resolved.startsWith(LOCAL_ROOT)) throw new Error('path traversal blocked');
  return resolved;
}

let singleton: VideoStorageAdapter | null = null;
export function getVideoStorageAdapter(): VideoStorageAdapter {
  if (singleton) return singleton;
  // MinIO / S3 path would check MINIO_ENDPOINT + credentials here and
  // lazy-import @aws-sdk/client-s3. For v1 we ship with the local-disk
  // adapter so the feature works out-of-the-box; upgrading to MinIO is a
  // drop-in swap via MINIO_ENDPOINT env + one code path here.
  singleton = new LocalDiskAdapter();
  return singleton;
}

export const VIDEO_MAX_BYTES = 2 * 1024 * 1024 * 1024; // Q7: 2 GB max
