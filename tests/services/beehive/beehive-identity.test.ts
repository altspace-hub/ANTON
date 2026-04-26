/**
 * beehive-identity.test.ts — local identity resolution + spoofing rejection.
 */

import { describe, it, expect } from 'vitest';
import { getLocalIdentity, resolveCallerIdentity } from '../../../server/services/beehive/beehive-identity.js';
import type { DatabaseAdapter } from '../../../server/db/database.js';

function makeMockDb(identity: { contact_hash: string; display_name: string } | null): DatabaseAdapter {
  return {
    get: async () => identity ?? undefined,
    all: async () => [],
    run: async () => {},
    exec: async () => {},
  } as unknown as DatabaseAdapter;
}

describe('getLocalIdentity', () => {
  it('returns the activated identity', async () => {
    const db = makeMockDb({ contact_hash: 'ANTON-AAAA-AAAA-AAAA-AAAA', display_name: 'Local' });
    const r = await getLocalIdentity(db);
    expect(r).toEqual({ contact_hash: 'ANTON-AAAA-AAAA-AAAA-AAAA', display_name: 'Local' });
  });

  it('returns null when not activated', async () => {
    const db = makeMockDb(null);
    expect(await getLocalIdentity(db)).toBeNull();
  });
});

describe('resolveCallerIdentity', () => {
  it('returns local identity when no claim is made', async () => {
    const db = makeMockDb({ contact_hash: 'ANTON-AAAA-AAAA-AAAA-AAAA', display_name: 'Local' });
    const r = await resolveCallerIdentity(db);
    expect(r.contact_hash).toBe('ANTON-AAAA-AAAA-AAAA-AAAA');
  });

  it('returns local identity when claim matches', async () => {
    const db = makeMockDb({ contact_hash: 'ANTON-AAAA-AAAA-AAAA-AAAA', display_name: 'Local' });
    const r = await resolveCallerIdentity(db, 'ANTON-AAAA-AAAA-AAAA-AAAA');
    expect(r.contact_hash).toBe('ANTON-AAAA-AAAA-AAAA-AAAA');
  });

  it('throws when local identity not activated', async () => {
    const db = makeMockDb(null);
    await expect(resolveCallerIdentity(db)).rejects.toThrow(/not activated/i);
  });

  it('throws when claim does not match local — rejects spoofing', async () => {
    const db = makeMockDb({ contact_hash: 'ANTON-AAAA-AAAA-AAAA-AAAA', display_name: 'Local' });
    await expect(resolveCallerIdentity(db, 'ANTON-BBBB-BBBB-BBBB-BBBB')).rejects.toThrow(/does not match/i);
  });

  it('treats undefined and null claims as no-claim', async () => {
    const db = makeMockDb({ contact_hash: 'ANTON-AAAA-AAAA-AAAA-AAAA', display_name: 'Local' });
    expect((await resolveCallerIdentity(db, undefined)).contact_hash).toBe('ANTON-AAAA-AAAA-AAAA-AAAA');
    expect((await resolveCallerIdentity(db, null)).contact_hash).toBe('ANTON-AAAA-AAAA-AAAA-AAAA');
  });
});
