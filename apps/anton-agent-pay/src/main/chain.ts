/**
 * chain.ts — bridge from the Wallet module + the JSON-RPC server into
 * the @futurechain/sdk RpcClient + PACS.008 builders.
 *
 * Surface:
 *   - getChainClient()             returns a cached RpcClient
 *   - submitPayment(args)          build PACS.008 + sign + submit
 *                                  → { txId, feeFtc }
 *   - fetchRecentTransactions(addr) → returns the last N txs touching addr
 *
 * Endpoint + auth come from env vars for MVP:
 *   AGENT_PAY_NODE_URL   (default https://rpc.futurechain.eu)
 *   AGENT_PAY_API_KEY    (Bahnhof install bearer; required for prod
 *                         endpoints — issued automatically by the
 *                         enrollment flow in src/main/enrollment.ts.)
 *
 * Attestation: Bahnhof's /submit_signed_transaction also requires a
 * valid `X-Attestation-Token` per PAY_DEVICE_ATTESTATION_SPEC.md §3.3.
 * Agent Pay obtains the session token via the desktop-attestation
 * primitive in src/main/attestation/ (DESKTOP_ATTESTATION_SPEC.md). The
 * `attestationProvider` field on ChainConfig is the hookpoint — when
 * present, the chain client wraps `fetch` to inject the header on
 * submit calls. When absent, no attestation header is sent (suitable
 * for local dev nodes that have no Caddy gate).
 *
 * Spec: docs/ANTON_AGENT_PAY_SPEC.md §9 + §10
 */
import { pacs008, rpc } from '@futurechain/sdk';
type Transaction = pacs008.Transaction;
import type { UnlockedWallet } from './wallet/index.js';

/** Default FTC ↔ satoshi multiplier (8 decimals, matches the chain). */
const SATOSHI_PER_FTC = 100_000_000;
/** Default fee for a Pay submit. Matches src/pay/services/payment.ts
 *  default. ~0.001 FTC at SATOSHI_PER_FTC=1e8 + fee=100000. */
const DEFAULT_FEE_SATOSHI = 100;
const DEFAULT_FEE_FTC = DEFAULT_FEE_SATOSHI / SATOSHI_PER_FTC;

/** Default endpoint — Bahnhof's public RPC. Override via
 *  AGENT_PAY_NODE_URL env var (e.g. http://127.0.0.1:8545 for dev). */
const DEFAULT_NODE_URL = 'https://rpc.futurechain.eu';

// ── RpcClient wiring ────────────────────────────────────────────

export interface ChainConfig {
  /** Base URL of a FutureChain node, e.g. https://rpc.futurechain.eu
   *  or http://127.0.0.1:8545. Trailing slash optional. */
  endpoint: string;
  /** Bahnhof install bearer for the auth-required submit endpoint.
   *  Optional — local dev nodes accept submits without auth. */
  apiKey?: string;
  /** Optional attestation-token provider. When set, the chain client
   *  wraps `fetch` to add `X-Attestation-Token: <session_token>` on
   *  requests to /submit_signed_transaction (the only HIGH_RISK path
   *  Bahnhof's /verify gate currently enforces). When unset, no
   *  attestation header is sent — suitable for local dev nodes. */
  attestationProvider?: () => Promise<string>;
  /** Override the fetch impl (tests use this to stub the network). */
  fetch?: typeof fetch;
}

let _cached: rpc.RpcClient | null = null;
let _cachedKey: string | null = null;

/** Returns the singleton RpcClient configured from env (or from a
 *  test-injected ChainConfig). Recreates the client when the config
 *  changes — that almost never happens at runtime in production but
 *  tests rotate freely. */
export function getChainClient(cfg?: ChainConfig): rpc.RpcClient {
  const endpoint = cfg?.endpoint
    ?? process.env.AGENT_PAY_NODE_URL
    ?? DEFAULT_NODE_URL;
  const apiKey = cfg?.apiKey ?? process.env.AGENT_PAY_API_KEY;
  const key = `${endpoint}|${apiKey ?? ''}|${cfg?.attestationProvider ? 'att' : 'noatt'}`;
  if (_cached && _cachedKey === key && !cfg?.fetch && !cfg?.attestationProvider) {
    return _cached;
  }
  // Wrap fetch to inject X-Attestation-Token when an attestationProvider
  // is configured. The wrap is per-call so a token refresh between calls
  // doesn't need to recreate the client.
  const baseFetch = cfg?.fetch ?? (globalThis.fetch?.bind(globalThis) as typeof fetch | undefined);
  const fetchImpl: typeof fetch | undefined = cfg?.attestationProvider && baseFetch
    ? _wrapFetchWithAttestation(baseFetch, cfg.attestationProvider)
    : baseFetch;
  _cached = new rpc.RpcClient({
    endpoint,
    ...(apiKey ? { apiKey } : {}),
    ...(fetchImpl ? { fetch: fetchImpl } : {}),
    timeoutMs: 20_000,
  });
  _cachedKey = key;
  return _cached;
}

/** Wrap `fetch` so any POST to /submit_signed_transaction gets
 *  X-Attestation-Token added from the configured provider. Other
 *  paths pass through unchanged (no extra round-trip cost on
 *  /balance / /utxos / /info / etc). */
function _wrapFetchWithAttestation(
  base: typeof fetch, provider: () => Promise<string>,
): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
    // Match the high-risk path the Bahnhof Caddyfile forward_auth gates.
    // We don't try to match other paths defensively — Bahnhof only
    // enforces attestation on this one; sending the header on other
    // calls is harmless but wasted bandwidth.
    const needsAttestation = url.includes('/submit_signed_transaction');
    if (!needsAttestation) return base(input, init);
    const sessionToken = await provider();
    const headers = new Headers(init?.headers ?? {});
    headers.set('X-Attestation-Token', sessionToken);
    return base(input, { ...init, headers });
  }) as typeof fetch;
}

/** Test helper — force the singleton to drop on the next get. */
export function _resetChainClient(): void {
  _cached = null;
  _cachedKey = null;
}

// ── Payment submit ──────────────────────────────────────────────

export interface SubmitPaymentArgs {
  /** Unlocked wallet (caller must call .zero() after this returns). */
  unlocked: UnlockedWallet;
  /** Recipient fc_ address. */
  to: string;
  /** Amount in FTC (decimal). */
  amountFtc: number;
  /** Optional payment reference. */
  reference?: string;
  /** Override chain config for tests. */
  chainConfig?: ChainConfig;
}

export interface SubmitPaymentResult {
  txId: string;
  feeFtc: number;
  /** Full SDK SubmitResult — passed through for richer callers. */
  raw: rpc.SubmitResult;
}

/** Build a PACS.008 transaction for `args`, sign with the unlocked
 *  wallet's priv, submit to the configured chain endpoint. Returns
 *  the tx id from the chain on success; throws on any failure (modal
 *  caller in server.ts turns the throw into a `rejected` state). */
export async function submitPayment(args: SubmitPaymentArgs): Promise<SubmitPaymentResult> {
  const client = getChainClient(args.chainConfig);
  const amountSatoshi = Math.round(args.amountFtc * SATOSHI_PER_FTC);
  if (amountSatoshi <= 0) {
    throw new Error('submitPayment: amountFtc must be > 0');
  }

  // 1. Fetch the wallet's spendable UTXOs.
  const utxos = await client.getUtxos(args.unlocked.address);
  if (!Array.isArray(utxos) || utxos.length === 0) {
    throw new Error(
      `submitPayment: wallet ${args.unlocked.address} has no UTXOs — `
      + 'cannot fund the payment',
    );
  }

  // 2. Build the PACS.008 message. Minimal shape — agent payments
  //    rarely carry rich remittance; the agent's free-text reference
  //    goes into the unstructured `Ustrd` field. Names are placeholder
  //    "Agent Pay user" / "Recipient" because Agent Pay doesn't yet
  //    have an address book (Phase 2c). `accountId` is the fc_ address
  //    on both sides — that's what the chain UTXO model needs.
  const builder = new pacs008.Pacs008Builder()
    .debtor({ name: 'Agent Pay user', accountId: args.unlocked.address })
    .creditor({ name: 'Recipient', accountId: args.to })
    .amountFtc(args.amountFtc);
  if (args.reference) builder.remittance(args.reference);
  const message = builder.build();

  // 3. Build + sign the on-chain Transaction. Uses the in-JS signer
  //    path — priv is in args.unlocked.privateKey + signs with
  //    @noble/ed25519 via the SDK's signer-callback API.
  const tx: Transaction = await pacs008.buildSignedPacs008TransactionWithSigner({
    publicKey: args.unlocked.publicKey,
    senderAddress: args.unlocked.address,
    signer: async (digest: Uint8Array) => signEd25519(args.unlocked.privateKey, digest),
    utxos,
    recipient: args.to,
    amountSatoshi,
    feeSatoshi: DEFAULT_FEE_SATOSHI,
    pacs008: message,
    uetr: extractUetr(message),
  });

  // 4. Submit. Bahnhof requires X-API-Key + X-Attestation-Token on
  //    /submit_signed_transaction; local nodes don't. The SDK passes
  //    the apiKey through automatically when isAuthRequired() matches.
  const raw = await client.submitSignedTransaction(tx);
  const txId = raw.tx_id ?? tx.id;
  return { txId, feeFtc: DEFAULT_FEE_FTC, raw };
}

// ── Recent transactions ──────────────────────────────────────────

export interface RecentTxRow {
  txId: string;
  amount: number;
  direction: 'in' | 'out';
  counterparty: string;
  ts: number;
  confirmed: boolean;
}

/** Fetch a best-effort list of recent transactions touching `address`.
 *  MVP impl uses /iso_received (deliveries to the address); a full
 *  history walk would also include outgoing, which the chain RPC
 *  doesn't currently expose as a single endpoint. Returns [] on RPC
 *  failure rather than throwing — the JSON-RPC layer surfaces the
 *  empty list without breaking the agent's getStatus call. */
export async function fetchRecentTransactions(
  address: string, limit: number, chainConfig?: ChainConfig,
): Promise<RecentTxRow[]> {
  try {
    const client = getChainClient(chainConfig);
    const raw = await client.getIsoReceived(address) as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.slice(0, limit).map((r) => coerceRecentTx(r, address))
      .filter((r): r is RecentTxRow => r !== null);
  } catch {
    return [];
  }
}

function coerceRecentTx(raw: unknown, address: string): RecentTxRow | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const txId = typeof r.tx_id === 'string' ? r.tx_id
    : typeof r.id === 'string' ? r.id : null;
  if (!txId) return null;
  return {
    txId,
    amount: Number(r.amount ?? 0),
    direction: r.sender === address ? 'out' : 'in',
    counterparty: typeof r.sender === 'string' ? r.sender
      : typeof r.receiver === 'string' ? r.receiver : 'unknown',
    ts: Number(r.timestamp ?? r.ts ?? 0),
    confirmed: r.confirmed === true,
  };
}

// ── Internal helpers ─────────────────────────────────────────────

/** Sign a 32-byte digest with an Ed25519 priv. Async to match the
 *  SDK's AsyncEd25519Signer contract (the Pay app's signer is async
 *  because it talks to Android Keystore — ours doesn't, but we
 *  preserve the shape so the SDK doesn't care about the difference). */
async function signEd25519(priv: Uint8Array, digest: Uint8Array): Promise<Uint8Array> {
  // Lazy import to keep startup snappy — @noble/ed25519 brings in
  // a few KB of math tables we don't need until a signing happens.
  // @noble/ed25519 v2 split sync/async: signAsync works out of the
  // box (uses Node's webcrypto SHA-512); the sync `sign` needs an
  // explicit sha512 hook (not worth wiring for one call).
  const ed = await import('@noble/ed25519');
  return ed.signAsync(digest, priv);
}

function extractUetr(message: pacs008.Pacs008Message): string {
  // The Pacs008Builder produces { document: { … FIToFICstmrCdtTrf … } }
  // with the UETR inside CdtTrfTxInf[0].PmtId.UETR. Walk the tree
  // defensively — if any node is missing we fall back to a random
  // UUID (the chain accepts any unique UETR).
  try {
    const doc = (message as { document?: unknown }).document as
      Record<string, unknown> | undefined;
    const ccf = doc?.['FIToFICstmrCdtTrf'] as Record<string, unknown> | undefined;
    const ctti = ccf?.['CdtTrfTxInf'] as Array<Record<string, unknown>> | undefined;
    const pmtId = ctti?.[0]?.['PmtId'] as Record<string, unknown> | undefined;
    const uetr = pmtId?.['UETR'];
    if (typeof uetr === 'string' && uetr.length > 0) return uetr;
  } catch { /* fall through to random */ }
  return cryptoRandomUuid();
}

function cryptoRandomUuid(): string {
  // Node 19+ has crypto.randomUUID built in; for the Electron-bundled
  // Node runtime this is always available.
  const { randomUUID } = require('node:crypto') as { randomUUID: () => string };
  return randomUUID();
}
