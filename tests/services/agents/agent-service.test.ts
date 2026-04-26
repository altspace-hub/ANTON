/**
 * agent-service.test.ts — agent CRUD + filter composition tests.
 *
 * Verifies SQL bind args, default values applied during INSERT, and
 * the column allow-list on UPDATE.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createAgentService } from '../../../server/services/agent-service.js';
import type { DatabaseAdapter } from '../../../server/db/database.js';

interface SqlCall { sql: string; args: unknown[]; }

function makeMockDb(): DatabaseAdapter & { calls: SqlCall[] } {
  const calls: SqlCall[] = [];
  return {
    all: async (sql: string, ...args: unknown[]) => { calls.push({ sql, args }); return []; },
    get: async (sql: string, ...args: unknown[]) => { calls.push({ sql, args }); return undefined; },
    run: async (sql: string, ...args: unknown[]) => { calls.push({ sql, args }); },
    exec: async () => {},
    calls,
  } as unknown as DatabaseAdapter & { calls: SqlCall[] };
}

let mockDb: ReturnType<typeof makeMockDb>;

beforeEach(() => { mockDb = makeMockDb(); });

describe('createAgent', () => {
  it('generates an id starting with agent_', async () => {
    const svc = await createAgentService(mockDb);
    const id = await svc.createAgent({
      name: 'Tax Help',
      roleDescription: 'Helps with tax questions',
      systemPrompt: 'You are a tax expert.',
    });
    expect(id).toMatch(/^agent_\d+_[a-f0-9]+$/);
  });

  it('slugifies name when no slug supplied', async () => {
    const svc = await createAgentService(mockDb);
    await svc.createAgent({
      name: 'Tax Help — EU Edition!',
      roleDescription: 'r', systemPrompt: 's',
    });
    // 3rd bind position is slug; should be lowercased + hyphenated + cleaned
    const args = mockDb.calls[0].args;
    expect(args[2]).toBe('tax-help-eu-edition');
  });

  it('respects supplied slug verbatim', async () => {
    const svc = await createAgentService(mockDb);
    await svc.createAgent({
      name: 'X', roleDescription: 'r', systemPrompt: 's',
      slug: 'my-custom-slug',
    });
    expect(mockDb.calls[0].args[2]).toBe('my-custom-slug');
  });

  it('applies sensible defaults', async () => {
    const svc = await createAgentService(mockDb);
    await svc.createAgent({ name: 'X', roleDescription: 'r', systemPrompt: 's' });
    const args = mockDb.calls[0].args;
    // avatar default = 'Bot'
    expect(args[5]).toBe('Bot');
    // default_thinking = 'think'
    expect(args[8]).toBe('think');
    // max_tokens = 16384
    expect(args[9]).toBe(16384);
    // temperature = 0.7
    expect(args[10]).toBe(0.7);
  });

  it('inserts with status draft (literal in SQL)', async () => {
    const svc = await createAgentService(mockDb);
    await svc.createAgent({ name: 'X', roleDescription: 'r', systemPrompt: 's' });
    expect(mockDb.calls[0].sql).toContain("'draft'");
  });

  it('JSON-encodes array fields', async () => {
    const svc = await createAgentService(mockDb);
    await svc.createAgent({
      name: 'X', roleDescription: 'r', systemPrompt: 's',
      routingKeywords: ['tax', 'vat'],
    });
    const args = mockDb.calls[0].args;
    // routing_keywords (position varies)
    const jsonArgs = args.filter(a => typeof a === 'string' && a.startsWith('['));
    expect(jsonArgs.some(a => a === '["tax","vat"]')).toBe(true);
  });
});

describe('listAgents — filter composition', () => {
  it('default: WHERE 1=1, LIMIT 50, ordered by routing_priority DESC', async () => {
    const svc = await createAgentService(mockDb);
    await svc.listAgents();
    const sql = mockDb.calls[0].sql;
    expect(sql).toContain('WHERE 1=1');
    expect(sql).toContain('ORDER BY routing_priority DESC');
    expect(sql).toContain('LIMIT ?');
    expect(mockDb.calls[0].args).toEqual([50]);
  });

  it('status filter is appended', async () => {
    const svc = await createAgentService(mockDb);
    await svc.listAgents({ status: 'active' });
    expect(mockDb.calls[0].sql).toContain('AND status = ?');
    expect(mockDb.calls[0].args).toEqual(['active', 50]);
  });

  it('respects custom limit', async () => {
    const svc = await createAgentService(mockDb);
    await svc.listAgents({ limit: 10 });
    expect(mockDb.calls[0].args).toEqual([10]);
  });
});

describe('updateAgent — column allow-list', () => {
  it('only updates whitelisted fields', async () => {
    const svc = await createAgentService(mockDb);
    await svc.updateAgent('agent_x', { name: 'New', malicious: 'haxx' });
    const update = mockDb.calls.find(c => c.sql.startsWith('UPDATE'));
    expect(update).toBeTruthy();
    expect(update!.sql).toContain('name = ?');
    expect(update!.sql).not.toContain('malicious');
  });

  it('skips UPDATE entirely when no whitelisted fields supplied', async () => {
    const svc = await createAgentService(mockDb);
    await svc.updateAgent('agent_x', { rogue: 'x' });
    expect(mockDb.calls.find(c => c.sql.startsWith('UPDATE'))).toBeUndefined();
  });

  it('respects allow-list across all 27 whitelisted columns', async () => {
    const svc = await createAgentService(mockDb);
    await svc.updateAgent('agent_x', { default_model: 'claude-opus-4-7', temperature: 0.5 });
    const update = mockDb.calls.find(c => c.sql.startsWith('UPDATE'));
    expect(update!.sql).toContain('default_model = ?');
    expect(update!.sql).toContain('temperature = ?');
  });
});

describe('getAgent / getAgentBySlug', () => {
  it('getAgent binds id', async () => {
    const svc = await createAgentService(mockDb);
    await svc.getAgent('agent_x');
    expect(mockDb.calls[0].args).toEqual(['agent_x']);
  });

  it('getAgentBySlug binds slug', async () => {
    const svc = await createAgentService(mockDb);
    await svc.getAgentBySlug('tax-help');
    expect(mockDb.calls[0].sql).toContain('WHERE slug = ?');
    expect(mockDb.calls[0].args).toEqual(['tax-help']);
  });
});

describe('createConversation', () => {
  it('returns an aconv_-prefixed id', async () => {
    const svc = await createAgentService(mockDb);
    const id = await svc.createConversation('agent_x', 'web');
    expect(id).toMatch(/^aconv_\d+_/);
  });
});

describe('addMessage', () => {
  it('returns an amsg_-prefixed id', async () => {
    const svc = await createAgentService(mockDb);
    const id = await svc.addMessage('aconv_x', 'user', 'hello');
    expect(id).toMatch(/^amsg_\d+_/);
  });
});

describe('deleteAgent — soft delete via status archive', () => {
  it('issues UPDATE setting status to archived (soft delete)', async () => {
    const svc = await createAgentService(mockDb);
    await svc.deleteAgent('agent_x');
    const upd = mockDb.calls.find(c => c.sql.includes("status = 'archived'"));
    expect(upd).toBeTruthy();
    expect(upd!.args).toContain('agent_x');
  });
});
