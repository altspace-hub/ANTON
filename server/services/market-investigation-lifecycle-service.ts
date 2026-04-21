// ── market-investigation-lifecycle-service.ts ─────────────────────────────
// Markets effectiveness M5 — close investigations so the queue stops
// growing forever.
//
// Context: the April 2026 audit found 159 open investigations and 0 closed.
// Workflow-orchestrator auto-creates one per prediction-anomaly plus a
// linked why-chain, but nothing maps why-chain completion back to the
// investigation's own status. Result: investigations accumulate, the
// dashboard drowns in stale items, and the "we investigated this" signal
// for pattern/weight feedback never fires.
//
// Deterministic rules — no LLM spend, safe under MARKETS_THINKING_DISABLED:
//
//   1. completed_via_why_chain
//      Investigation has a linked market_why_chains row with status
//      'completed' OR root_cause_reached=1. Copy root_cause_type into
//      market_investigation_tasks.root_cause, findings gets the chain's
//      root_cause_summary, status → 'completed'.
//
//   2. superseded
//      Two+ open investigations share the same trigger_reference
//      (typically a prediction_id). Keep the newest, abandon older ones.
//
//   3. stale_no_progress
//      Investigation is ≥ 90 days old, still open, and has neither
//      findings nor atoms_created nor process_improvements nor a linked
//      why-chain reaching root cause. Mark as 'abandoned'.
//
// Rule order matters: completed > superseded > stale, so a finished
// investigation isn't demoted to "abandoned" on the same pass.

import type { DatabaseAdapter } from '../db/database.js';
import { childLogger } from '../lib/logger.js';

const log = childLogger('market-investigation-lifecycle');

const STALE_AGE_DAYS = 90;

export type InvestigationCloseReason =
  | 'completed_via_why_chain'
  | 'superseded'
  | 'stale_no_progress';

export interface InvestigationLifecycleResult {
  considered: number;
  completed_via_why_chain: number;
  abandoned_superseded: number;
  abandoned_stale: number;
  left_open: number;
  errors: Array<{ investigation_id: string; reason: string }>;
}

interface OpenInvestigationRow {
  id: string;
  trigger_type: string;
  trigger_reference: string | null;
  status: string;
  findings: string;
  atoms_created: string;
  process_improvements: string;
  created_at: string;
  chain_id: string | null;
  chain_status: string | null;
  chain_root_cause_reached: number | null;
  chain_root_cause_type: string | null;
  chain_root_cause_summary: string | null;
}

export async function createMarketInvestigationLifecycleService(db: DatabaseAdapter) {

  async function applyInvestigationLifecycle(
    options: { batchLimit?: number } = {},
  ): Promise<InvestigationLifecycleResult> {
    const limit = options.batchLimit ?? 500;

    // Pull every open/in_progress investigation plus its (optional) linked
    // why-chain in one join — cheap and enough for all three rules.
    const rows = await db.all<OpenInvestigationRow>(
      `SELECT
         i.id, i.trigger_type, i.trigger_reference, i.status,
         i.findings, i.atoms_created, i.process_improvements, i.created_at,
         c.id AS chain_id, c.status AS chain_status,
         c.root_cause_reached AS chain_root_cause_reached,
         c.root_cause_type AS chain_root_cause_type,
         c.root_cause_summary AS chain_root_cause_summary
       FROM market_investigation_tasks i
       LEFT JOIN market_why_chains c ON c.investigation_id = i.id
       WHERE i.status IN ('open', 'in_progress')
       ORDER BY i.created_at ASC
       LIMIT ?`,
      limit,
    );

    const result: InvestigationLifecycleResult = {
      considered: rows.length,
      completed_via_why_chain: 0,
      abandoned_superseded: 0,
      abandoned_stale: 0,
      left_open: 0,
      errors: [],
    };
    if (rows.length === 0) return result;

    // Pre-compute supersession: per trigger_reference, keep the most-recent
    // investigation open; older ones are candidates for 'abandoned'.
    const newestByTrigger = buildNewestByTrigger(rows);

    for (const row of rows) {
      try {
        // Rule 1: why-chain resolved?
        if (isWhyChainResolved(row)) {
          await db.run(
            `UPDATE market_investigation_tasks
               SET status = 'completed',
                   root_cause = COALESCE(?, root_cause),
                   findings = CASE WHEN findings IS NULL OR findings = '[]'
                                   THEN COALESCE(?, findings)
                                   ELSE findings END,
                   completed_at = NOW()
             WHERE id = ?`,
            row.chain_root_cause_type,
            row.chain_root_cause_summary ? JSON.stringify([row.chain_root_cause_summary]) : null,
            row.id,
          );
          result.completed_via_why_chain++;
          continue;
        }

        // Rule 2: superseded by a newer investigation on the same reference?
        if (row.trigger_reference && newestByTrigger.get(row.trigger_reference) !== row.id) {
          await db.run(
            `UPDATE market_investigation_tasks
               SET status = 'abandoned', completed_at = NOW()
             WHERE id = ?`,
            row.id,
          );
          result.abandoned_superseded++;
          continue;
        }

        // Rule 3: stale with no progress?
        if (isStaleWithNoProgress(row)) {
          await db.run(
            `UPDATE market_investigation_tasks
               SET status = 'abandoned', completed_at = NOW()
             WHERE id = ?`,
            row.id,
          );
          result.abandoned_stale++;
          continue;
        }

        result.left_open++;
      } catch (err) {
        result.errors.push({
          investigation_id: row.id,
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (rows.length > 0) {
      log.info(
        {
          considered: result.considered,
          completed: result.completed_via_why_chain,
          superseded: result.abandoned_superseded,
          stale: result.abandoned_stale,
          left_open: result.left_open,
          errors: result.errors.length,
        },
        'investigation_lifecycle_sweep_complete',
      );
    }
    return result;
  }

  return { applyInvestigationLifecycle };
}

export type MarketInvestigationLifecycleService = Awaited<ReturnType<typeof createMarketInvestigationLifecycleService>>;

// ── Rule helpers ───────────────────────────────────────────────────────────

function isWhyChainResolved(row: OpenInvestigationRow): boolean {
  if (!row.chain_id) return false;
  if (row.chain_status === 'completed') return true;
  if (row.chain_root_cause_reached === 1) return true;
  return false;
}

function isStaleWithNoProgress(row: OpenInvestigationRow): boolean {
  const ageDays = (Date.now() - Date.parse(row.created_at)) / (24 * 3600 * 1000);
  if (!Number.isFinite(ageDays) || ageDays < STALE_AGE_DAYS) return false;
  const hasProgress =
    !isEmptyJsonArray(row.findings) ||
    !isEmptyJsonArray(row.atoms_created) ||
    !isEmptyJsonArray(row.process_improvements);
  if (hasProgress) return false;
  // A linked why-chain that's still actively in_progress counts as progress
  // — the investigator is presumably still walking the chain.
  if (row.chain_id && row.chain_status === 'in_progress') return false;
  return true;
}

function isEmptyJsonArray(raw: string | null | undefined): boolean {
  if (!raw) return true;
  const trimmed = raw.trim();
  if (trimmed === '' || trimmed === '[]') return true;
  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) && parsed.length === 0;
  } catch {
    return false; // treat parse-fail as "has content" so we don't abandon weird rows
  }
}

/**
 * Map trigger_reference → id of the most-recent investigation that targets
 * it. Rows arrive in created_at ASC order, so the last-seen id is newest.
 */
function buildNewestByTrigger(rows: OpenInvestigationRow[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const r of rows) {
    if (r.trigger_reference) out.set(r.trigger_reference, r.id);
  }
  return out;
}
