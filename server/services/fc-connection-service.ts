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

  /**
   * One-shot startup hook for the portable bundle (and any deployment
   * that exposes the node URL via env). When `FUTURECHAIN_RPC_URL` is
   * set and the config row is still at its migration-081 defaults
   * (node_url='http://localhost:8545' and stub_mode=TRUE), we point the
   * config at the env URL and flip stub_mode off so fc-wallet-service
   * and fc-transaction-service take the real path.
   *
   * Pristine-row rule: if the user has already customised either field
   * via the UI (Settings → FutureChain), the env var is ignored. We
   * never clobber a manual configuration on restart.
   *
   * Returns `{ applied, reason, node_url? }` for the boot log.
   */
  async function applyEnvOverrides(env: NodeJS.ProcessEnv = process.env): Promise<{
    applied: boolean; reason: string; node_url?: string;
  }> {
    const envUrl = env.FUTURECHAIN_RPC_URL?.trim();
    if (!envUrl) return { applied: false, reason: 'no FUTURECHAIN_RPC_URL set' };
    if (!/^https?:\/\//.test(envUrl)) {
      return { applied: false, reason: `ignored — FUTURECHAIN_RPC_URL "${envUrl}" is not http(s)://` };
    }
    const cfg = (await getConfig()) as Record<string, unknown>;
    const currentUrl = (cfg?.node_url as string | undefined) ?? '';
    const currentStub = cfg?.stub_mode;
    const isPristine = currentUrl === 'http://localhost:8545' && (currentStub === true || currentStub === 1);
    if (!isPristine) {
      return { applied: false, reason: `config already customised (node_url=${currentUrl}, stub_mode=${String(currentStub)})` };
    }
    await updateConfig({ node_url: envUrl, stub_mode: false });
    return { applied: true, reason: 'seeded from FUTURECHAIN_RPC_URL', node_url: envUrl };
  }

  return { getConfig, updateConfig, healthCheck, isStubMode, applyEnvOverrides };
}
export type FCConnectionService = Awaited<ReturnType<typeof createFCConnectionService>>;
