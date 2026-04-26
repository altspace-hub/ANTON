/**
 * agent-connector-executor.test.ts — connector queries + tool-description
 * builder tests.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createConnectorExecutor, type ConnectorConfig } from '../../../server/services/agent-connector-executor.js';
import type { DatabaseAdapter } from '../../../server/db/database.js';

interface SqlCall { sql: string; args: unknown[]; }

interface RawConnectorRow {
  id: string;
  name: string;
  connector_type: string;
  description: string | null;
  config: string;
  auth_config: string;
  is_active: boolean;
}

function makeMockDb(connectors: RawConnectorRow[] = []): DatabaseAdapter & { calls: SqlCall[] } {
  const calls: SqlCall[] = [];
  return {
    all: async (sql: string, ...args: unknown[]) => { calls.push({ sql, args }); return connectors; },
    get: async () => undefined,
    run: async () => {},
    exec: async () => {},
    calls,
  } as unknown as DatabaseAdapter & { calls: SqlCall[] };
}

let mockDb: ReturnType<typeof makeMockDb>;

beforeEach(() => { mockDb = makeMockDb(); });

describe('getAgentConnectors', () => {
  it('binds agentId + filters is_active = TRUE', async () => {
    const svc = await createConnectorExecutor(mockDb);
    await svc.getAgentConnectors('agent_x');
    expect(mockDb.calls[0].sql).toContain('agent_id = ?');
    expect(mockDb.calls[0].sql).toContain('is_active = TRUE');
    expect(mockDb.calls[0].args).toEqual(['agent_x']);
  });

  it('parses JSON-stringified config + auth_config', async () => {
    const db = makeMockDb([{
      id: 'c1', name: 'API', connector_type: 'rest_api',
      description: null,
      config: '{"baseUrl":"https://api.example.com"}',
      auth_config: '{"type":"bearer"}',
      is_active: true,
    }]);
    const svc = await createConnectorExecutor(db);
    const r = await svc.getAgentConnectors('agent_x');
    expect(r[0].config).toEqual({ baseUrl: 'https://api.example.com' });
    expect(r[0].auth_config).toEqual({ type: 'bearer' });
  });

  it('handles already-parsed config (passthrough)', async () => {
    const db = makeMockDb([{
      id: 'c1', name: 'API', connector_type: 'rest_api',
      description: null,
      config: { baseUrl: 'x' } as unknown as string,
      auth_config: { } as unknown as string,
      is_active: true,
    }]);
    const svc = await createConnectorExecutor(db);
    const r = await svc.getAgentConnectors('agent_x');
    expect(r[0].config).toEqual({ baseUrl: 'x' });
  });

  it('returns empty array when no connectors', async () => {
    const svc = await createConnectorExecutor(mockDb);
    const r = await svc.getAgentConnectors('agent_x');
    expect(r).toEqual([]);
  });
});

describe('buildToolDescriptions', () => {
  function rest(c: Partial<ConnectorConfig> & { name: string; connector_type: string }): ConnectorConfig {
    return {
      id: c.id ?? 'c1',
      name: c.name,
      connector_type: c.connector_type,
      description: c.description ?? null,
      config: c.config ?? {},
      auth_config: c.auth_config ?? {},
      is_active: c.is_active ?? true,
    };
  }

  it('returns empty string when no connectors', async () => {
    const svc = await createConnectorExecutor(mockDb);
    expect(svc.buildToolDescriptions([])).toBe('');
  });

  it('describes REST API endpoints', async () => {
    const svc = await createConnectorExecutor(mockDb);
    const out = svc.buildToolDescriptions([rest({
      name: 'StripeAPI', connector_type: 'rest_api',
      description: 'Stripe payments',
      config: { endpoints: [{ method: 'GET', path: '/charges', description: 'List charges' }] },
    })]);
    expect(out).toContain('TOOL: StripeAPI (REST API)');
    expect(out).toContain('GET /charges');
    expect(out).toContain('AVAILABLE TOOLS');
  });

  it('describes Database connectors with READ-ONLY note', async () => {
    const svc = await createConnectorExecutor(mockDb);
    const out = svc.buildToolDescriptions([rest({
      name: 'AnalyticsDB', connector_type: 'database',
      config: { tables: ['orders', 'customers'] },
    })]);
    expect(out).toContain('TOOL: AnalyticsDB (Database)');
    expect(out).toContain('orders');
    expect(out).toContain('READ-ONLY');
  });

  it('describes Webhook connectors', async () => {
    const svc = await createConnectorExecutor(mockDb);
    const out = svc.buildToolDescriptions([rest({
      name: 'SlackHook', connector_type: 'webhook',
      description: 'Posts to Slack',
    })]);
    expect(out).toContain('TOOL: SlackHook (Webhook)');
  });

  it('falls back to generic description for unknown types', async () => {
    const svc = await createConnectorExecutor(mockDb);
    const out = svc.buildToolDescriptions([rest({
      name: 'Custom', connector_type: 'custom_kind',
    })]);
    expect(out).toContain('TOOL: Custom (custom_kind)');
  });

  it('combines multiple connectors with separators', async () => {
    const svc = await createConnectorExecutor(mockDb);
    const out = svc.buildToolDescriptions([
      rest({ name: 'A', connector_type: 'rest_api', config: { endpoints: [] } }),
      rest({ name: 'B', connector_type: 'webhook' }),
    ]);
    expect(out).toContain('TOOL: A');
    expect(out).toContain('TOOL: B');
  });
});
