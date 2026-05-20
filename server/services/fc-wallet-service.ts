import type { DatabaseAdapter } from '../db/database.js';
import {
  generateSeedPhrase,
  walletFromSeedPhrase,
  walletFromPrivateKey,
  type Wallet as SdkWallet,
} from '@futurechain/sdk/wallet';
import { RpcClient } from '@futurechain/sdk/rpc';
import {
  encryptBlob,
  decryptBlob,
  warnPlaintextOnce,
} from '../util/at-rest-encryption.js';

/**
 * fc-wallet-service — Phase 2 (May 20 2026).
 *
 * Two operating modes, selected by the `fc_connection_config.stub_mode`
 * column (default TRUE → stub, FALSE → real). Both modes share the same
 * public API; only the internals differ. Existing callers stay unchanged.
 *
 * STUB MODE (legacy, dev / unconfigured installs):
 *   • Fake `fc_STUB_…` address — no real Ed25519 key.
 *   • Demo balances (100 / 10 FTC).
 *   • sdk_schema_version stays at 1 on the row.
 *
 * REAL MODE (Phase 2 — node configured + stub_mode flipped):
 *   • 24-word BIP-39 mnemonic + an Ed25519 keypair via
 *     @futurechain/sdk/wallet.
 *   • Address = `fc_…` (Base58(0x46 ‖ SHA-256(pub)[0..20] ‖ dSHA-256[..4])).
 *   • Privkey + mnemonic encrypted at rest under
 *     INSTANCE_KEY_ENCRYPTION_KEY (AES-256-GCM, see at-rest-encryption.ts).
 *     When the env var is unset the row falls back to plaintext + a
 *     one-time stderr warning — for dev only; production should set it.
 *   • Mnemonic is returned ONCE from `createWallet` so the UI can show
 *     it for offline backup. Never returned again.
 *   • sdk_schema_version = 2.
 */

const COMPONENT = 'fc-wallet-service';

export interface WalletRow {
  id: string;
  name: string;
  wallet_file_name: string;
  address: string;
  wallet_type: 'human' | 'agent';
  owner_wallet_address: string | null;
  agent_id: string | null;
  balance_raw: number | string;
  balance_ftc: number;
  utxo_count: number;
  balance_updated_at: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  pubkey?: Buffer | null;
  privkey_encrypted?: Buffer | null;
  privkey_iv?: Buffer | null;
  mnemonic_encrypted?: Buffer | null;
  mnemonic_iv?: Buffer | null;
  sdk_schema_version?: number;
}

export interface CreateWalletParams {
  name: string;
  walletType: 'human' | 'agent';
  ownerAddress?: string;
  agentId?: string;
  /** Force real-mode keygen even if `fc_connection_config.stub_mode` is
   *  true (e.g. for integration tests). Default: follows the config. */
  forceRealKeygen?: boolean;
}

export interface CreateWalletResult {
  id: string;
  address: string;
  name: string;
  walletType: 'human' | 'agent';
  /** Real-mode + human wallets only — the 24-word BIP-39 mnemonic for
   *  one-time backup display. Stub mode + agent wallets: omitted. */
  mnemonic?: string;
  sdkSchemaVersion: 1 | 2;
}

interface FCConnectionConfig {
  node_url: string | null;
  stub_mode: boolean;
}

export async function createFCWalletService(
  db: DatabaseAdapter,
  // Optional FC connection lookup. When omitted, all flows run in stub
  // mode (legacy callers stay unchanged).
  getConnectionConfig?: () => Promise<FCConnectionConfig | undefined>,
) {
  // ─── Read path (unchanged from the stub) ──────────────────────────

  async function getWallets() {
    return await db.all<WalletRow>(
      'SELECT * FROM fc_wallets WHERE is_active = TRUE ORDER BY wallet_type, created_at',
    );
  }
  async function getHumanWallet() {
    return await db.get<WalletRow>(
      "SELECT * FROM fc_wallets WHERE wallet_type = 'human' AND is_active = TRUE LIMIT 1",
    );
  }
  async function getAgentWallet() {
    return await db.get<WalletRow>(
      "SELECT * FROM fc_wallets WHERE wallet_type = 'agent' AND is_active = TRUE LIMIT 1",
    );
  }
  async function getWalletById(id: string) {
    return await db.get<WalletRow>(
      'SELECT * FROM fc_wallets WHERE id = ? AND is_active = TRUE',
      id,
    );
  }
  async function getWalletByAddress(address: string) {
    return await db.get<WalletRow>(
      'SELECT * FROM fc_wallets WHERE address = ? AND is_active = TRUE',
      address,
    );
  }

  // ─── Stub-mode decision ───────────────────────────────────────────

  async function shouldUseStub(force?: boolean): Promise<boolean> {
    if (force) return false; // force real-mode keygen
    if (!getConnectionConfig) return true;
    const cfg = await getConnectionConfig();
    if (!cfg) return true;
    if (cfg.stub_mode === false && cfg.node_url) return false;
    return true;
  }

  // ─── Create — Phase 2 implementation ──────────────────────────────

  async function createWallet(params: CreateWalletParams): Promise<CreateWalletResult> {
    const stub = await shouldUseStub(params.forceRealKeygen);
    const id = `fcw_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const fileName = params.name.replace(/\s+/g, '_').toLowerCase();

    if (stub) {
      // ── STUB MODE — legacy behaviour, demo address + demo balance ──
      const address = `fc_STUB_${Math.random().toString(36).slice(2, 14)}`;
      await db.run(
        `INSERT INTO fc_wallets (id, name, wallet_file_name, address, wallet_type, owner_wallet_address, agent_id, balance_ftc, sdk_schema_version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        id, params.name, fileName, address, params.walletType,
        params.ownerAddress ?? null, params.agentId ?? null,
        params.walletType === 'human' ? 100.0 : 10.0,
      );
      return { id, address, name: params.name, walletType: params.walletType, sdkSchemaVersion: 1 };
    }

    // ── REAL MODE — Ed25519 + at-rest encryption ──
    const phrase = generateSeedPhrase();
    const sdkW: SdkWallet = walletFromSeedPhrase(phrase, 0, 0);
    const pubkeyBuf = Buffer.from(sdkW.publicKey);
    const privkeyBuf = Buffer.from(sdkW.privateKey);

    const encPriv = encryptBlob(privkeyBuf);
    if (!encPriv) warnPlaintextOnce(COMPONENT);

    // Mnemonic backup only for human wallets. An agent wallet is auto-
    // managed by ANTON-local and recovered via the instance-identity
    // restore path, not a user mnemonic.
    let encMnemonic: { encrypted: Buffer; iv: Buffer } | null = null;
    if (params.walletType === 'human') {
      encMnemonic = encryptBlob(Buffer.from(phrase.mnemonic, 'utf8'));
    }

    await db.run(
      `INSERT INTO fc_wallets (
         id, name, wallet_file_name, address, wallet_type, owner_wallet_address, agent_id,
         balance_ftc, balance_raw,
         pubkey, privkey_encrypted, privkey_iv, mnemonic_encrypted, mnemonic_iv,
         sdk_schema_version
       ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?, 2)`,
      id, params.name, fileName, sdkW.address, params.walletType,
      params.ownerAddress ?? null, params.agentId ?? null,
      pubkeyBuf,
      encPriv ? encPriv.encrypted : privkeyBuf,
      encPriv ? encPriv.iv : null,
      encMnemonic ? encMnemonic.encrypted : (params.walletType === 'human' ? Buffer.from(phrase.mnemonic, 'utf8') : null),
      encMnemonic ? encMnemonic.iv : null,
    );

    return {
      id,
      address: sdkW.address,
      name: params.name,
      walletType: params.walletType,
      mnemonic: params.walletType === 'human' ? phrase.mnemonic : undefined,
      sdkSchemaVersion: 2,
    };
  }

  // ─── Decrypt for signing — Phase 2 ────────────────────────────────

  /** Return the decrypted Ed25519 secret key for a real-mode wallet.
   *  Throws if the wallet is a stub (sdk_schema_version=1), or if the
   *  privkey columns are missing, or if INSTANCE_KEY_ENCRYPTION_KEY is
   *  unset and the row was stored encrypted. */
  async function getDecryptedPrivkey(walletId: string): Promise<Buffer> {
    const row = await db.get<WalletRow>(
      'SELECT id, sdk_schema_version, privkey_encrypted, privkey_iv FROM fc_wallets WHERE id = ?',
      walletId,
    );
    if (!row) {
      throw new Error(`fc-wallet-service.getDecryptedPrivkey: wallet ${walletId} not found`);
    }
    if ((row.sdk_schema_version ?? 1) < 2) {
      throw new Error(
        `fc-wallet-service.getDecryptedPrivkey: wallet ${walletId} is a legacy stub (sdk_schema_version=${row.sdk_schema_version}) — no real privkey. Re-create the wallet in real mode (fc_connection_config.stub_mode = FALSE).`,
      );
    }
    if (!row.privkey_encrypted) {
      throw new Error(
        `fc-wallet-service.getDecryptedPrivkey: wallet ${walletId} is sdk v2 but privkey_encrypted is NULL — corrupted row`,
      );
    }
    if (!row.privkey_iv) {
      // No IV → row was stored in plaintext (dev mode, no env key).
      // privkey_encrypted then literally holds the 32-byte raw privkey.
      if (row.privkey_encrypted.length !== 32) {
        throw new Error(
          `fc-wallet-service.getDecryptedPrivkey: wallet ${walletId} plaintext privkey wrong length (${row.privkey_encrypted.length} != 32)`,
        );
      }
      return Buffer.from(row.privkey_encrypted);
    }
    return decryptBlob(row.privkey_encrypted, row.privkey_iv);
  }

  /** Reconstruct an SDK Wallet object from a stored fc_wallets row.
   *  Convenience for callers (fc-transaction-service) that already have
   *  the row + just want a `Wallet` shape to pass to the SDK. */
  async function getDecryptedWallet(walletId: string): Promise<SdkWallet> {
    const priv = await getDecryptedPrivkey(walletId);
    return walletFromPrivateKey(new Uint8Array(priv));
  }

  // ─── Balance refresh — Phase 2 hits real RPC when configured ──────

  async function refreshBalances() {
    if (await shouldUseStub()) {
      await db.run('UPDATE fc_wallets SET balance_updated_at = NOW() WHERE is_active = TRUE');
      return await getWallets();
    }
    const cfg = await getConnectionConfig?.();
    const nodeUrl = cfg?.node_url;
    if (!nodeUrl) return await getWallets();
    const client = new RpcClient({ endpoint: nodeUrl, timeoutMs: 8_000 });
    const rows = await getWallets();
    for (const row of rows) {
      if ((row.sdk_schema_version ?? 1) < 2) continue; // stub wallets: skip
      try {
        const bal = await client.getBalance(row.address);
        await db.run(
          'UPDATE fc_wallets SET balance_raw = ?, balance_ftc = ?, utxo_count = ?, balance_updated_at = NOW() WHERE id = ?',
          bal.balance, bal.balance_ftc, bal.utxo_count, row.id,
        );
      } catch (e) {
        // Don't fail the whole refresh on one wallet's RPC error — log + continue.
        console.warn(`[${COMPONENT}] refreshBalances: ${row.address} failed: ${(e as Error).message}`);
      }
    }
    return await getWallets();
  }

  return {
    getWallets,
    getHumanWallet,
    getAgentWallet,
    getWalletById,
    getWalletByAddress,
    createWallet,
    getDecryptedPrivkey,
    getDecryptedWallet,
    refreshBalances,
  };
}
export type FCWalletService = Awaited<ReturnType<typeof createFCWalletService>>;
