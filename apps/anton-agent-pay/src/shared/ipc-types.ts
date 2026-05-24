/**
 * ipc-types.ts — contracts shared between the Electron main process,
 * the renderer (modal + settings), and the JSON-RPC server.
 *
 * Spec: docs/ANTON_AGENT_PAY_SPEC.md
 */

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
  /** Optional structured reference (ISO 20022 remittance, etc). */
  reference?: string;
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
  to: string;
  toLabel?: string; // e.g. "Acme Corp coffee shop"
  toSeenTimes?: number; // counterparty history
  amountFtc: number;
  feeFtc: number;
  agentNote?: string;
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
