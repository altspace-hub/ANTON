/**
 * video-signed-url.test.ts — the local video playback URL must not be
 * signable by anyone reading the repo.
 *
 * The defect: both the mint side (LocalDiskAdapter.getSignedGetUrl) and the
 * verify side (verifyLocalSignedUrl) keyed their HMAC on
 *   process.env.VIDEO_LOCAL_URL_SECRET ?? 'anton-video-dev-secret'
 * and VIDEO_LOCAL_URL_SECRET was documented nowhere, so every default install
 * signed with a constant published in a PUBLIC repo. /api/video/stream
 * authorises on that signature alone — no session, no per-object check — so
 * anyone could compute HMAC(`${key}:${ttl}`) with the known constant and
 * stream any stored object.
 *
 * The fix keeps the operator's secret when set and otherwise generates a
 * random per-process key (refusing to sign would have broken playback on every
 * default install, since the local-disk adapter is the only one that ships).
 * The test below is therefore about the property that matters: a signature
 * built from the previously published constant must not open the door.
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import crypto from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  verifyLocalSignedUrl,
  getVideoStorageAdapter,
} from '../../server/services/video/storage-adapter.js';

/** The constant that used to be the fallback key. Kept here, and nowhere else. */
const PUBLISHED_CONSTANT = 'anton-video-dev-secret';
const KEY = 'u/bob/1756900000000_abc123.bin';

function sign(secret: string, key: string, expiresEpoch: number): string {
  return crypto.createHmac('sha256', secret).update(`${key}:${expiresEpoch}`).digest('hex');
}

function parseSignedUrl(url: string): { k: string; e: number; s: string } {
  const q = new URLSearchParams(url.slice(url.indexOf('?') + 1));
  return { k: q.get('k') ?? '', e: Number(q.get('e') ?? 0), s: q.get('s') ?? '' };
}

const originalSecret = process.env.VIDEO_LOCAL_URL_SECRET;
beforeEach(() => { delete process.env.VIDEO_LOCAL_URL_SECRET; });
afterAll(() => {
  if (originalSecret === undefined) delete process.env.VIDEO_LOCAL_URL_SECRET;
  else process.env.VIDEO_LOCAL_URL_SECRET = originalSecret;
});

describe('local playback URLs are not forgeable from the repo', () => {
  it('rejects a signature minted with the formerly hard-coded secret', () => {
    const inOneHour = Math.floor(Date.now() / 1000) + 3600;
    expect(verifyLocalSignedUrl(KEY, inOneHour, sign(PUBLISHED_CONSTANT, KEY, inOneHour))).toBe(false);
  });

  it('rejects it for an arbitrary attacker-chosen key too', () => {
    const inOneHour = Math.floor(Date.now() / 1000) + 3600;
    const victimKey = 'u/alice/1700000000000_private.bin';
    expect(verifyLocalSignedUrl(victimKey, inOneHour, sign(PUBLISHED_CONSTANT, victimKey, inOneHour))).toBe(false);
  });

  it('does not mention the old constant anywhere in the adapter', () => {
    // Belt and braces: the behavioural checks above only fail if the fallback
    // is still *used*; this one fails if it is merely still *present*, which is
    // how it would come back during a merge.
    const src = readFileSync(join(process.cwd(), 'server/services/video/storage-adapter.ts'), 'utf8');
    expect(src).not.toContain(`'${PUBLISHED_CONSTANT}'`);
  });
});

describe('playback still works out of the box', () => {
  it('round-trips a URL it minted itself with no secret configured', async () => {
    const url = await getVideoStorageAdapter().getSignedGetUrl(KEY);
    const { k, e, s } = parseSignedUrl(url);
    expect(k).toBe(KEY);
    expect(verifyLocalSignedUrl(k, e, s)).toBe(true);
  });

  it("honours the operator's VIDEO_LOCAL_URL_SECRET when set", async () => {
    process.env.VIDEO_LOCAL_URL_SECRET = 'operator-chosen-key-0123456789';
    const url = await getVideoStorageAdapter().getSignedGetUrl(KEY);
    const { k, e, s } = parseSignedUrl(url);
    expect(s).toBe(sign('operator-chosen-key-0123456789', k, e));
    expect(verifyLocalSignedUrl(k, e, s)).toBe(true);
  });

  it('still refuses an expired signature', async () => {
    const past = Math.floor(Date.now() / 1000) - 1;
    process.env.VIDEO_LOCAL_URL_SECRET = 'operator-chosen-key-0123456789';
    expect(verifyLocalSignedUrl(KEY, past, sign('operator-chosen-key-0123456789', KEY, past))).toBe(false);
  });
});
