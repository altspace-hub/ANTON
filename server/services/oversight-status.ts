/**
 * oversight-status.ts — which modules need a human sign-off, and whether a
 * given run has one (Wave 3: "oversight sign-off bound to the run").
 *
 * The three gated module ids used to live in two places that could drift:
 * routes/human-oversight.ts (the API's answer) and the mount condition in
 * src/pages/ModulePage.tsx (whether the gate is even shown). The server list
 * lives here now; the route re-exports it. The client build cannot import
 * from server/ (tsconfig.app.json includes only src/), so the client keeps a
 * mirror in src/components/shared/HumanOversightGate.tsx and
 * tests/services/oversight-status.test.ts fails the run if the two disagree.
 *
 * `getOversightStatus` is what the export route consults: a sign-off counts
 * only when it is bound to the answer being exported (message_id), and it
 * blocks export only when the operator has turned that on — the default is
 * OFF (users are adults; the gate warns, the setting enforces).
 */

import type { DatabaseAdapter } from '../db/database.js';

/** Modules that require mandatory human review before export (EU AI Act Art. 14 scope). */
export const OVERSIGHT_GATED_MODULES = [
  'gap-analysis',
  'sanctions-advisory',
  'investigation-support',
] as const;

export type OversightGatedModule = typeof OVERSIGHT_GATED_MODULES[number];

export function isOversightGatedModule(moduleId: string | null | undefined): boolean {
  return !!moduleId && (OVERSIGHT_GATED_MODULES as readonly string[]).includes(moduleId);
}

/**
 * app_settings key for "an unsigned gated run cannot be exported".
 * Plain 'true' / 'false' like sdk_engine_enabled — not a secret. Absent = OFF.
 */
export const OVERSIGHT_BLOCKS_EXPORT_SETTING_KEY = 'oversight_blocks_export';

/** Values that switch the setting on. Anything else (including no row) is off. */
const ON_VALUES: ReadonlySet<string> = new Set(['true', '1']);

/** A human_oversight_reviews row as the API returns it (migration 273 columns included). */
export interface OversightReviewRow {
  id: number;
  session_id: string;
  module_id: string;
  user_id: string;
  reviewer_name: string;
  reviewer_role: string | null;
  attestation: string;
  verdict: 'approved' | 'requires_amendment' | 'rejected';
  notes: string | null;
  export_blocked: number;
  /** The assistant message the reviewer signed against (null only for rows older than migration 273). */
  message_id: string | null;
  /** run_artifacts.prompt_sha256 of that message at sign-off time. */
  prompt_sha256: string | null;
  /** sha256 of messages.content at sign-off time. */
  output_sha256: string | null;
  evidence_pack_id: string | null;
  created_at: string;
}

export interface OversightStatus {
  /** The module is one of OVERSIGHT_GATED_MODULES. */
  required: boolean;
  /** An 'approved' review exists for the run (bound to messageId when one is given). */
  signed: boolean;
  /** The review the verdict was read from, or null. */
  review: OversightReviewRow | null;
  /** required && !signed && the oversight_blocks_export setting is on. */
  blocksExport: boolean;
}

/**
 * Exported so tests/db/query-column-drift.test.ts can plan the exact statements
 * against a real schema (the columns come from migration 273).
 */
export const OVERSIGHT_STATUS_SQL = {
  /** Latest review bound to one answer. Params: session_id, message_id. */
  sessionMessageReview:
    'SELECT * FROM human_oversight_reviews WHERE session_id = ? AND message_id = ? ORDER BY created_at DESC LIMIT 1',
  /** Latest review for the session, bound or not. Params: session_id. */
  sessionLatestReview:
    'SELECT * FROM human_oversight_reviews WHERE session_id = ? ORDER BY created_at DESC LIMIT 1',
} as const;

/**
 * Whether an unsigned gated run may not be exported. Reads app_settings on
 * every call (the export path is not hot) and treats a missing row or a
 * database error as OFF, so a broken settings table never locks exports.
 */
export async function isOversightBlockingExport(db: DatabaseAdapter): Promise<boolean> {
  try {
    const row = await db.get<{ value: string }>(
      'SELECT value FROM app_settings WHERE key = ?',
      OVERSIGHT_BLOCKS_EXPORT_SETTING_KEY,
    );
    return !!row && ON_VALUES.has(row.value.trim().toLowerCase());
  } catch (err) {
    console.warn(
      `[oversight-status] could not read ${OVERSIGHT_BLOCKS_EXPORT_SETTING_KEY}: ${err instanceof Error ? err.message : 'db error'}`,
    );
    return false;
  }
}

/** Persist the setting (true/false). Same upsert the other Settings stores use. */
export async function setOversightBlocksExport(db: DatabaseAdapter, on: boolean): Promise<void> {
  await db.run(
    'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    OVERSIGHT_BLOCKS_EXPORT_SETTING_KEY,
    on ? 'true' : 'false',
  );
}

/**
 * The oversight state of one run.
 *
 * With `messageId` the review must be bound to that exact answer — a sign-off
 * on an earlier answer in the same session does not cover a later one, and a
 * pre-273 unbound row never satisfies a bound lookup. Without `messageId` the
 * latest review for the session is used (callers that only know the session).
 *
 * Only verdict 'approved' counts as signed: 'requires_amendment' and
 * 'rejected' are reviews, not approvals.
 */
export async function getOversightStatus(
  db: DatabaseAdapter,
  sessionId: string,
  moduleId: string | null | undefined,
  messageId?: string | null,
): Promise<OversightStatus> {
  const required = isOversightGatedModule(moduleId);
  if (!required) return { required: false, signed: false, review: null, blocksExport: false };

  const review = messageId
    ? await db.get<OversightReviewRow>(OVERSIGHT_STATUS_SQL.sessionMessageReview, sessionId, messageId)
    : await db.get<OversightReviewRow>(OVERSIGHT_STATUS_SQL.sessionLatestReview, sessionId);

  const signed = !!review && review.verdict === 'approved';
  // The setting is only consulted when it can change the answer.
  const blocksExport = !signed && (await isOversightBlockingExport(db));

  return { required, signed, review: review ?? null, blocksExport };
}
