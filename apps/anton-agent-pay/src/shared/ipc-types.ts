/**
 * ipc-types.ts — contracts shared between the Electron main process,
 * the renderer (modal + settings), and the JSON-RPC server.
 *
 * Spec: docs/ANTON_AGENT_PAY_SPEC.md
 */
import type { AntonRemittance } from '@futurechain/sdk/pacs008';

/** A payment proposal — created by an agent via `proposePayment`,
 *  shown in the confirmation modal, lives in the in-memory proposal
 *  store until it expires / is approved / is rejected. */
export interface PaymentProposal {
  /** Server-issued opaque ID returned to the agent. */
  id: string;
  /** Recipient `fc_` address. */
  to: string;
  /** Amount in FTC (decimal — not satoshi). */
  amountFtc: number;
  /** Optional free-text reference (PACS.008 unstructured Ustrd). */
  reference?: string;
  /** Optional structured remittance (invoice / agreement / info) the agent
   *  attached — encoded into the PACS.008 RmtInf on submit, summarised in the
   *  approval modal. Carried internally; not echoed back via getProposal. */
  remittance?: AntonRemittance;
  /** Optional free-text note from the agent. Shown in the modal,
   *  clearly marked as agent-supplied. NOT chain-validated. */
  agentNote?: string;
  /** Name of the paired agent that proposed this payment. */
  agentName: string;
  /** Unix ms when the proposal was created. */
  createdAt: number;
  /** Unix ms when the proposal expires if no decision is made. */
  expiresAt: number;
  /** Current state of the proposal. */
  state: ProposalState;
  /** Tx id, set once the proposal is approved + submitted. */
  txId?: string;
  /** Reason if rejected (e.g. "user clicked Reject", "expired"). */
  rejectReason?: string;
}

export type ProposalState =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'sent'
  | 'expired'
  | 'cancelled';

/** Result of asking the user via the modal whether to approve a proposal.
 *  The modal abstraction (see modal.ts) returns one of these synchronously
 *  once the user clicks / dismisses.
 *
 *  Approve may optionally carry a passphrase — the modal renderer collects
 *  it from the user when the wallet is passphrase-protected (see modal.js
 *  in src/renderer/modal/). When unset, the wallet is expected to be
 *  unlockable without one. The passphrase NEVER leaves the main process
 *  (and is dropped from memory as soon as the unlock-and-sign cycle
 *  completes). */
export type ModalDecision =
  | { kind: 'approve'; passphrase?: string }
  | { kind: 'reject'; reason: string };

/** Payload that the main process sends to the modal renderer when a
 *  proposal needs a decision. Kept minimal + serialisable. */
export interface ModalPayload {
  proposalId: string;
  agentName: string;
  agentPairedAgo: string; // human-readable e.g. "14h ago"
  /** The pseudonymous on-wire identity this payment goes out AS — e.g.
   *  "ANTON VWRf68" — so the human knows the Dbtr the recipient will see. */
  payingAs?: string;
  /** The configured human owner (Ultimate Debtor / UBO) disclosed on the
   *  wire, e.g. "Daniel Bardun". Absent when no owner is configured. */
  uboName?: string;
  to: string;
  toLabel?: string; // e.g. "Acme Corp coffee shop"
  toSeenTimes?: number; // counterparty history
  amountFtc: number;
  feeFtc: number;
  agentNote?: string;
  /** Human-readable lines summarising the structured remittance the agent
   *  attached (invoice items, agreed terms, info message). Shown in the modal
   *  so the human sees the contract / information that rides with the payment. */
  remittanceSummary?: string[];
  balanceAfterFtc: number;
  walletHasPassphrase: boolean;
  expiresAtMs: number;
}

/** Identity of a paired AI agent — issued by the pairing flow. */
export interface PairedAgent {
  /** Stable ID assigned at pairing. */
  id: string;
  /** Human-readable name supplied by the agent at /pair time. */
  name: string;
  /** Bearer token used by the agent on every subsequent request.
   *  Stored ONLY as its SHA-256 hash server-side (cf. attestation
   *  sessions on Bahnhof). */
  tokenSha256: string;
  /** When the pairing was issued. */
  pairedAt: number;
  /** When the pairing expires (re-pair required after this). */
  expiresAt: number;
  /** When the bearer was last used. */
  lastUsedAt?: number;
}

// ── Settings IPC channels (main ↔ settings renderer) ─────────────
//
// Used by src/renderer/settings/preload.cjs to expose a typed API to
// the settings window. main.ts registers the matching ipcMain.handle
// for each channel. Renderer sends a payload, gets back a result OR
// an `{ error: string }` shape on failure (renderer surfaces inline).

export const IPC_SETTINGS = {
  // Wallet state + actions
  WALLET_INFO: 'agent-pay:settings:wallet:info',
  WALLET_CREATE: 'agent-pay:settings:wallet:create',
  WALLET_IMPORT: 'agent-pay:settings:wallet:import',
  WALLET_REVEAL_MNEMONIC: 'agent-pay:settings:wallet:reveal-mnemonic',
  WALLET_DELETE: 'agent-pay:settings:wallet:delete',
  WALLET_ENABLE_PASSPHRASE: 'agent-pay:settings:wallet:enable-passphrase',
  WALLET_CHANGE_PASSPHRASE: 'agent-pay:settings:wallet:change-passphrase',
  WALLET_REMOVE_PASSPHRASE: 'agent-pay:settings:wallet:remove-passphrase',
  // Pairing
  PAIRING_NEW_CODE: 'agent-pay:settings:pairing:new-code',
  PAIRING_LIST: 'agent-pay:settings:pairing:list',
  PAIRING_REVOKE: 'agent-pay:settings:pairing:revoke',
  // Network / boot info
  BOOT_INFO: 'agent-pay:settings:boot-info',
} as const;

/** Renderer-side typed surface. settings preload.cjs exposes this on
 *  window.agentPaySettings. Each method returns either the success
 *  result OR `{ error: string }`. */
export interface SettingsApi {
  // Wallet
  walletInfo(): Promise<{ exists: boolean; address?: string; hasPassphrase?: boolean }>;
  walletCreate(): Promise<{ address: string; mnemonic: string } | { error: string }>;
  walletImport(args: { mnemonic: string }): Promise<{ address: string } | { error: string }>;
  walletRevealMnemonic(args: { passphrase?: string }): Promise<{ mnemonic: string | null } | { error: string }>;
  walletDelete(args: { confirm: string }): Promise<{ ok: true } | { error: string }>;
  walletEnablePassphrase(args: { passphrase: string }): Promise<{ ok: true } | { error: string }>;
  walletChangePassphrase(args: { oldPassphrase: string; newPassphrase: string }): Promise<{ ok: true } | { error: string }>;
  walletRemovePassphrase(args: { passphrase: string }): Promise<{ ok: true } | { error: string }>;

  // Pairing
  pairingNewCode(): Promise<{ code: string; expiresInMs: number }>;
  pairingList(): Promise<{ agents: PairedAgent[] }>;
  pairingRevoke(args: { agentId: string }): Promise<{ ok: boolean }>;

  // Network / boot info
  bootInfo(): Promise<{
    port: number;
    pid: number;
    discoveryFile: string;
    endpoint: string;
  }>;
}
