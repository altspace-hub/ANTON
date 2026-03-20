import type { DatabaseAdapter } from '../db/database.js';

export async function createFCConnectionService(db: DatabaseAdapter) {
  async function getConfig() {
    let config = await db.get('SELECT * FROM fc_connection_config WHERE id = ?', 'default');
    if (!config) {
      await db.run("INSERT INTO fc_connection_config (id) VALUES ('default') ON CONFLICT DO NOTHING");
      config = await db.get('SELECT * FROM fc_connection_config WHERE id = ?', 'default');
    }
    return config;
  }

  async function updateConfig(updates: Record<string, unknown>) {
    const sets: string[] = []; const vals: unknown[] = [];
    for (const [k, v] of Object.entries(updates)) {
      if (['node_url', 'cli_binary_path', 'wallet_dir', 'stub_mode'].includes(k)) {
        sets.push(`${k} = ?`); vals.push(v);
      }
    }
    if (sets.length > 0) {
      sets.push('updated_at = NOW()'); vals.push('default');
      await db.run(`UPDATE fc_connection_config SET ${sets.join(', ')} WHERE id = ?`, ...vals);
    }
    return await getConfig();
  }

  async function healthCheck() {
    const config = await getConfig();
    try {
      const nodeUrl = (config as Record<string, unknown>)?.node_url as string | undefined;
      if (!nodeUrl) throw new Error('No node URL configured');
      const res = await fetch(`${nodeUrl}/health`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as Record<string, unknown>;
      await db.run(`UPDATE fc_connection_config SET connected = TRUE, last_health_check = NOW(),
        node_version = ?, pacs008_support = ?, two_tier_storage = ?, stub_mode = FALSE WHERE id = 'default'`,
        data.version ?? null, data.compliance_gateway ?? false, data.two_tier_storage ?? false);
      return { connected: true, version: data.version, stubMode: false };
    } catch {
      await db.run("UPDATE fc_connection_config SET connected = FALSE, last_health_check = NOW(), stub_mode = TRUE WHERE id = 'default'");
      return { connected: false, version: null, stubMode: true };
    }
  }

  async function isStubMode() { return ((await getConfig()) as Record<string, unknown>)?.stub_mode ?? true; }

  return { getConfig, updateConfig, healthCheck, isStubMode };
}
export type FCConnectionService = Awaited<ReturnType<typeof createFCConnectionService>>;
