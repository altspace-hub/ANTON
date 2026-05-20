/**
 * wallet-audit-log.ts — append-only audit trail for wallet operations.
 *
 * Phase B4 (May 20 2026). Every privkey decryption, signing call, and
 * wallet-lifecycle event lands here, regardless of whether it succeeds
 * (so a deny / error stream is visible to the auditor). The wire shape
 * is the `wallet_audit_log` table from migration 212 / 091.
 *
 * Design:
 *   • Best-effort write — a failed audit write must NOT swallow the
 *     real operation's result. If the DB write throws, we surface a
 *     warning on stderr and let the caller continue (the auditor
 *     would rather see a missing row than an unsigned transaction).
 *   • Synchronous-style API (`async log(...)`) that callers can
 *     `await` for ordering, or `void` for fire-and-forget when the
 *     operation has already completed.
 *   • Details payload is JSON — operators add structured metadata
 *     without table migrations.
 *
 * What goes in `details`:
 *   - amount + recipient address for signing (both already public)
 *   - the SDK call site for sanity ("via fc-transaction-service")
 *   - timing if useful
 * What MUST NOT go in `details`:
 *   - plaintext privkey, mnemonic, password, API key, secret of any
 *     kind. The audit log is meant to be exportable to SIEM.
 */
import type { DatabaseAdapter } from '../db/database.js';

export type AuditResult = 'ok' | 'denied' | 'error';

export interface AuditEntry {
  /** Module that emitted the event, e.g. 'fc-wallet-service'. */
  component: string;
  /** Action verb, e.g. 'get_decrypted_privkey', 'sign_transaction',
   *  'create_wallet', 'restore_wallet'. */
  action: string;
  /** Wallet primary key the event concerns. Omit for instance-level
   *  events (e.g. bootstrap). */
  walletId?: string | null;
  /** Who initiated this — user id, agent id, 'system' for housekeeping
   *  jobs. The server bootstrap is responsible for plumbing the right
   *  identity here. */
  actor?: string | null;
  /** Optional correlation id with an inbound RPC request — so an
   *  auditor can join app log → server log → audit log. */
  requestId?: string | null;
  /** Outcome class. 'denied' = the access was refused (e.g. legacy
   *  stub wallet, missing env key), 'error' = unexpected failure. */
  result: AuditResult;
  /** Short error tag for 'denied' / 'error' rows. */
  errorCode?: string | null;
  /** Structured metadata. JSON-serialisable, MUST NOT contain secrets. */
  details?: Record<string, unknown> | null;
}

export interface AuditLogger {
  log(entry: AuditEntry): Promise<void>;
}

/** Create an audit logger backed by `wallet_audit_log` table. */
export function createWalletAuditLogger(db: DatabaseAdapter): AuditLogger {
  return {
    async log(entry: AuditEntry): Promise<void> {
      try {
        const detailsBlob = entry.details
          ? JSON.stringify(entry.details)
          : null;
        await db.run(
          `INSERT INTO wallet_audit_log
             (component, action, wallet_id, actor, request_id, result, error_code, details)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          entry.component,
          entry.action,
          entry.walletId ?? null,
          entry.actor ?? null,
          entry.requestId ?? null,
          entry.result,
          entry.errorCode ?? null,
          detailsBlob,
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn(
          `[wallet-audit-log] failed to write entry (${entry.component}/${entry.action} ${entry.result}): ${msg}`,
        );
      }
    },
  };
}

/** No-op logger — used in tests and when audit is disabled at the
 *  call site. Always-succeeds, never touches the DB. */
export const noopAuditLogger: AuditLogger = {
  async log(): Promise<void> { /* no-op */ },
};
