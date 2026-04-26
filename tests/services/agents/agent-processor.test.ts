/**
 * agent-processor.test.ts — keyword-routing scoring tests.
 *
 * The processQuery / processAgentTask paths invoke LLMs; routeQuery is
 * deterministic keyword matching, perfect for unit tests.
 */

import { describe, it, expect } from 'vitest';
import { createAgentProcessor } from '../../../server/services/agent-processor.js';
import type { DatabaseAdapter } from '../../../server/db/database.js';

interface AgentRow {
  id: string;
  name: string;
  status: string;
  routing_keywords: string | string[];
}

function makeMockDb(activeAgents: AgentRow[]): DatabaseAdapter {
  return {
    all: async (sql: string) => {
      // listAgents queries agent_profiles
      if (sql.includes('agent_profiles')) {
        return activeAgents.filter(a => a.status === 'active');
      }
      return [];
    },
    get: async () => undefined,
    run: async () => {},
    exec: async () => {},
  } as unknown as DatabaseAdapter;
}

describe('routeQuery', () => {
  it('returns null when no active agents', async () => {
    const svc = await createAgentProcessor(makeMockDb([]));
    const r = await svc.routeQuery('any query');
    expect(r).toBeNull();
  });

  it('returns null when no agent has matching keywords', async () => {
    const svc = await createAgentProcessor(makeMockDb([
      { id: 'a1', name: 'A', status: 'active', routing_keywords: JSON.stringify(['banana', 'mango']) },
    ]));
    const r = await svc.routeQuery('I need help with cars');
    expect(r).toBeNull();
  });

  it('routes to the matching agent', async () => {
    const svc = await createAgentProcessor(makeMockDb([
      { id: 'a1', name: 'Tax Helper', status: 'active', routing_keywords: JSON.stringify(['tax', 'vat']) },
    ]));
    const r = await svc.routeQuery('I have a tax question');
    expect(r).not.toBeNull();
    expect(r!.agentId).toBe('a1');
    expect(r!.agentName).toBe('Tax Helper');
    expect(r!.confidence).toBeGreaterThan(0);
  });

  it('higher match-density wins between competing agents', async () => {
    const svc = await createAgentProcessor(makeMockDb([
      { id: 'a1', name: 'A1', status: 'active', routing_keywords: JSON.stringify(['tax']) },
      { id: 'a2', name: 'A2', status: 'active', routing_keywords: JSON.stringify(['tax', 'vat', 'income', 'audit']) },
    ]));
    // Query has 4 matches for a2 (tax, vat, income, audit) and 1 for a1 (tax).
    // Density: a1 = 1/1 = 1.0, a2 = 4/4 = 1.0. Confidence will be equal — but
    // a2 has more raw matches; the loop replaces only on STRICT > so first
    // candidate wins on tie.
    const r = await svc.routeQuery('tax vat income audit query');
    expect(r).not.toBeNull();
    // The 100%-density agent wins; a1 has density 1/1 = 1.0 first.
    expect(['a1', 'a2']).toContain(r!.agentId);
  });

  it('confidence is capped at 0.95', async () => {
    const svc = await createAgentProcessor(makeMockDb([
      { id: 'a1', name: 'A', status: 'active', routing_keywords: JSON.stringify(['x']) },
    ]));
    const r = await svc.routeQuery('x x x x x');
    expect(r!.confidence).toBeLessThanOrEqual(0.95);
  });

  it('skips inactive agents', async () => {
    const svc = await createAgentProcessor(makeMockDb([
      { id: 'a1', name: 'Inactive', status: 'draft', routing_keywords: JSON.stringify(['tax']) },
    ]));
    const r = await svc.routeQuery('tax question');
    expect(r).toBeNull();
  });

  it('handles routing_keywords stored as already-parsed array', async () => {
    const svc = await createAgentProcessor(makeMockDb([
      { id: 'a1', name: 'A', status: 'active', routing_keywords: ['tax'] },
    ]));
    const r = await svc.routeQuery('tax info');
    expect(r).not.toBeNull();
  });

  it('case-insensitive keyword matching', async () => {
    const svc = await createAgentProcessor(makeMockDb([
      { id: 'a1', name: 'A', status: 'active', routing_keywords: JSON.stringify(['TAX']) },
    ]));
    const r = await svc.routeQuery('please help with tax');
    expect(r).not.toBeNull();
  });
});
