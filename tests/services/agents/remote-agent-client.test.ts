/**
 * remote-agent-client.test.ts — discovery + matching tests for the
 * cross-instance agent router.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRemoteAgentClient } from '../../../server/services/remote-agent-client.js';
import type { DatabaseAdapter } from '../../../server/db/database.js';

interface SqlCall { sql: string; args: unknown[]; }

interface PeerRow {
  contact_hash: string;
  endpoint: string;
  display_name: string;
}

function makeMockDb(peers: PeerRow[] = []): DatabaseAdapter & { calls: SqlCall[] } {
  const calls: SqlCall[] = [];
  return {
    all: async (sql: string, ...args: unknown[]) => {
      calls.push({ sql, args });
      if (sql.includes('community_connections')) return peers;
      return [];
    },
    get: async () => undefined,
    run: async () => {},
    exec: async () => {},
    calls,
  } as unknown as DatabaseAdapter & { calls: SqlCall[] };
}

describe('discoverRemoteAgents', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('returns empty array when no peers configured', async () => {
    const svc = await createRemoteAgentClient(makeMockDb([]));
    const r = await svc.discoverRemoteAgents();
    expect(r).toEqual([]);
  });

  it('queries community_connections for accepted/active peers with endpoints', async () => {
    const db = makeMockDb([]);
    const svc = await createRemoteAgentClient(db);
    await svc.discoverRemoteAgents();
    expect(db.calls[0].sql).toContain('endpoint IS NOT NULL');
    expect(db.calls[0].sql).toContain("status IN ('accepted', 'active')");
  });

  it('aggregates agents across peers, attaching peer metadata', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const u = String(url);
      if (u.includes('peer1')) {
        return new Response(JSON.stringify({
          agents: [{ slug: 'sales', name: 'Sales', role: 'r', keywords: ['shoes'] }],
        }), { status: 200 });
      }
      if (u.includes('peer2')) {
        return new Response(JSON.stringify({
          agents: [{ slug: 'support', name: 'Support', role: 'r2', keywords: ['help'] }],
        }), { status: 200 });
      }
      return new Response('', { status: 404 });
    });
    const svc = await createRemoteAgentClient(makeMockDb([
      { contact_hash: 'h1', endpoint: 'https://peer1', display_name: 'Peer 1' },
      { contact_hash: 'h2', endpoint: 'https://peer2', display_name: 'Peer 2' },
    ]));
    const r = await svc.discoverRemoteAgents();
    expect(r).toHaveLength(2);
    expect(r.find(a => a.slug === 'sales')?.peerName).toBe('Peer 1');
    expect(r.find(a => a.slug === 'support')?.peerHash).toBe('h2');
  });

  it('skips peers that return non-200 (offline / no agents)', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('', { status: 500 }));
    const svc = await createRemoteAgentClient(makeMockDb([
      { contact_hash: 'h1', endpoint: 'https://peer1', display_name: 'P' },
    ]));
    const r = await svc.discoverRemoteAgents();
    expect(r).toEqual([]);
  });

  it('skips peers whose fetch throws (e.g. network error)', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => { throw new Error('network'); });
    const svc = await createRemoteAgentClient(makeMockDb([
      { contact_hash: 'h1', endpoint: 'https://peer1', display_name: 'P' },
    ]));
    const r = await svc.discoverRemoteAgents();
    expect(r).toEqual([]);
  });
});

describe('findRemoteAgent — keyword matching', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('returns null when no remote agents discovered', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('', { status: 500 }));
    const svc = await createRemoteAgentClient(makeMockDb([
      { contact_hash: 'h1', endpoint: 'https://peer1', display_name: 'P' },
    ]));
    expect(await svc.findRemoteAgent('any')).toBeNull();
  });

  it('routes to highest-density-matching remote agent', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({
      agents: [
        { slug: 'sales', name: 'S', role: 'r', keywords: ['shoes', 'sneakers'] },
        { slug: 'general', name: 'G', role: 'r2', keywords: ['x', 'y', 'z', 'q'] },
      ],
    }), { status: 200 }));
    const svc = await createRemoteAgentClient(makeMockDb([
      { contact_hash: 'h1', endpoint: 'https://peer1', display_name: 'P' },
    ]));
    const r = await svc.findRemoteAgent('looking for running shoes');
    expect(r?.slug).toBe('sales');
  });

  it('returns null when no keywords overlap the query', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({
      agents: [{ slug: 'sales', name: 'S', role: 'r', keywords: ['shoes', 'sneakers'] }],
    }), { status: 200 }));
    const svc = await createRemoteAgentClient(makeMockDb([
      { contact_hash: 'h1', endpoint: 'https://peer1', display_name: 'P' },
    ]));
    const r = await svc.findRemoteAgent('looking for car parts');
    expect(r).toBeNull();
  });
});
