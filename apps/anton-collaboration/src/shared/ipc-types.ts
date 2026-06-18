/**
 * ipc-types.ts — contracts shared across the collaboration program.
 * (Cloned from the agent-pay shell; only what the collaboration shell needs.)
 */

/** Identity of a paired AI agent — issued by the pairing flow. */
export interface PairedAgent {
  /** Stable ID assigned at pairing. */
  id: string;
  /** Human-readable name supplied by the agent at /pair time. */
  name: string;
  /** Bearer token used by the agent on every subsequent request — stored
   *  ONLY as its SHA-256 hash server-side. */
  tokenSha256: string;
  /** When the pairing was issued. */
  pairedAt: number;
  /** When the pairing expires (re-pair required after this). */
  expiresAt: number;
  /** When the bearer was last used. */
  lastUsedAt?: number;
}
