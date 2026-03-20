import type { DatabaseAdapter } from '../db/database.js';

export async function createFCWalletService(db: DatabaseAdapter) {
  async function getWallets() {
    return await db.all('SELECT * FROM fc_wallets WHERE is_active = TRUE ORDER BY wallet_type, created_at');
  }
  async function getHumanWallet() {
    return await db.get("SELECT * FROM fc_wallets WHERE wallet_type = 'human' AND is_active = TRUE LIMIT 1");
  }
  async function getAgentWallet() {
    return await db.get("SELECT * FROM fc_wallets WHERE wallet_type = 'agent' AND is_active = TRUE LIMIT 1");
  }
  async function createWallet(params: { name: string; walletType: 'human' | 'agent'; ownerAddress?: string; agentId?: string }) {
    const id = `fcw_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    // Stub mode: generate demo address
    const address = `fc_STUB_${Math.random().toString(36).slice(2, 14)}`;
    const fileName = params.name.replace(/\s+/g, '_').toLowerCase();
    await db.run(`INSERT INTO fc_wallets (id, name, wallet_file_name, address, wallet_type, owner_wallet_address, agent_id, balance_ftc)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      id, params.name, fileName, address, params.walletType,
      params.ownerAddress ?? null, params.agentId ?? null,
      params.walletType === 'human' ? 100.0 : 10.0); // Demo balances
    return { id, address, name: params.name, walletType: params.walletType };
  }
  async function refreshBalances() {
    // In stub mode, just update timestamps
    await db.run("UPDATE fc_wallets SET balance_updated_at = NOW() WHERE is_active = TRUE");
    return await getWallets();
  }
  return { getWallets, getHumanWallet, getAgentWallet, createWallet, refreshBalances };
}
export type FCWalletService = Awaited<ReturnType<typeof createFCWalletService>>;
