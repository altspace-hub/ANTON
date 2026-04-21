// ── market-data-backlog-triage-service.ts ──────────────────────────────────
// Markets effectiveness M7 — drain the news backlog without burning tokens.
//
// Context: the April 2026 audit found 14,605 unprocessed rows in
// market_data_raw. The extractor is LLM-gated (Haiku per item), FIFO-
// ordered, and processes 40 rows per workflow run. Under normal operation
// that's ~280 rows/week; under MARKETS_THINKING_DISABLED (current state)
// zero rows/week. Left alone the backlog grows forever and when thinking
// resumes the oldest items get processed first — which is exactly wrong
// because old news is the LEAST valuable atom source.
//
// This service runs deterministic filters that mark obviously-worthless
// items as processed, shrinking the backlog without LLM spend. Memory
// directive says "don't add more generation until existing predictions
// feed back into weights" so we don't ramp up throughput — we just stop
// the set from drowning the extractor forever.
//
// Rules (each row that matches ANY rule is marked processed with the rule
// as the triage_reason appended to metadata):
//
//   1. stale_age
//      published_at (or fetched_at fallback) older than 30 days. News
//      atoms past that horizon rarely inform active theses.
//
//   2. empty_content
//      content is NULL / empty / whitespace-only — nothing for an LLM to
//      extract from.
//
//   3. too_short
//      content < 200 characters. Below this length, extraction tends to
//      hallucinate more than it finds real signal (audit observation).
//
//   4. duplicate_in_source
//      Same (source_id, symbol, LEFT(content, 200)) as another unprocessed
//      row within 24h. Keep newest, triage older duplicates. Handles feed
//      reposts + RSS hiccups that emit the same headline twice.
//
// triage_reason is stamped into metadata JSON so operators can audit
// "why did this row get marked processed without atoms?" without a new
// column. No LLM spend; safe under every pause flag.

import type { DatabaseAdapter } from '../db/database.js';
import { childLogger } from '../lib/logger.js';

const log = childLogger('market-backlog-triage');

const STALE_AGE_DAYS = 30;
const MIN_CONTENT_CHARS = 200;
const DUPLICATE_WINDOW_HOURS = 24;

export type TriageReason = 'stale_age' | 'empty_content' | 'too_short' | 'duplicate_in_source';

export interface BacklogTriageResult {
  scanned: number;
  triaged_stale: number;
  triaged_empty: number;
  triaged_short: number;
  triaged_duplicate: number;
  still_pending: number;
  errors: Array<{ row_id: string; reason: string }>;
}

export async function createMarketDataBacklogTriageService(db: DatabaseAdapter) {

  /**
   * One pass over unprocessed rows. Each rule fires independently; a row
   * that matches multiple rules is counted under the FIRST match in the
   * rule order (stale > empty > short > duplicate) so the tally reflects
   * the headline reason, not the compound.
   */
  async function triageBacklog(options: { batchLimit?: number } = {}): Promise<BacklogTriageResult> {
    const limit = options.batchLimit ?? 5000;
    const staleCutoff = new Date(Date.now() - STALE_AGE_DAYS * 86400000).toISOString();

    const result: BacklogTriageResult = {
      scanned: 0,
      triaged_stale: 0, triaged_empty: 0, triaged_short: 0, triaged_duplicate: 0,
      still_pending: 0, errors: [],
    };

    // Rule 1: stale — batch UPDATE stamps triage_reason into the metadata
    // JSONB and flips is_processed in one pass.
    //
    // Timestamp comparison: published_at is TEXT and feeds aren't guaranteed
    // to use ISO-8601. A naive `published_at < $1` is lexicographic — 'Mon,
    // 21 Apr 2026 10:30 GMT' would compare as a string and silently rank
    // wrong against '2026-03-22T00:00:00Z'. The CASE below only trusts
    // published_at when it's unambiguously ISO-8601-prefixed (YYYY-MM-DD);
    // anything else falls through to fetched_at (which is a real TIMESTAMPTZ
    // set by the ingest path and always trustworthy). Both sides of the
    // comparison are TIMESTAMPTZ so the result is time-correct regardless
    // of provider format drift.
    const stale = await db.run(
      `UPDATE market_data_raw
         SET is_processed = 1,
             metadata = (
               COALESCE(NULLIF(metadata, '')::jsonb, '{}'::jsonb)
               || jsonb_build_object('triage_reason', 'stale_age', 'triaged_at', NOW()::text)
             )::text
       WHERE is_processed = 0
         AND data_type NOT IN ('price')
         AND COALESCE(
               CASE WHEN published_at ~ '^\\d{4}-\\d{2}-\\d{2}'
                    THEN published_at::timestamptz
                    ELSE NULL
               END,
               fetched_at
             ) < $1::timestamptz`,
      staleCutoff,
    );
    result.triaged_stale = stale?.changes ?? 0;

    // Rule 2: empty content.
    const empty = await db.run(
      `UPDATE market_data_raw
         SET is_processed = 1,
             metadata = (
               COALESCE(NULLIF(metadata, '')::jsonb, '{}'::jsonb)
               || jsonb_build_object('triage_reason', 'empty_content', 'triaged_at', NOW()::text)
             )::text
       WHERE is_processed = 0
         AND data_type NOT IN ('price')
         AND (content IS NULL OR LENGTH(TRIM(content)) = 0)`,
    );
    result.triaged_empty = empty?.changes ?? 0;

    // Rule 3: too short.
    const short = await db.run(
      `UPDATE market_data_raw
         SET is_processed = 1,
             metadata = (
               COALESCE(NULLIF(metadata, '')::jsonb, '{}'::jsonb)
               || jsonb_build_object('triage_reason', 'too_short', 'triaged_at', NOW()::text)
             )::text
       WHERE is_processed = 0
         AND data_type NOT IN ('price')
         AND LENGTH(content) < ${MIN_CONTENT_CHARS}`,
    );
    result.triaged_short = short?.changes ?? 0;

    // Rule 4: duplicates within window. Keep the newest per (source_id, symbol,
    // content prefix) group; mark older siblings processed. Done per-row via a
    // window function rather than a complex DELETE so the metadata stamp is
    // correct and we don't race with concurrent fetches.
    const duplicates = await db.run(
      `UPDATE market_data_raw m
         SET is_processed = 1,
             metadata = (
               COALESCE(NULLIF(m.metadata, '')::jsonb, '{}'::jsonb)
               || jsonb_build_object('triage_reason', 'duplicate_in_source', 'triaged_at', NOW()::text)
             )::text
       FROM (
         SELECT id FROM (
           SELECT id,
             ROW_NUMBER() OVER (
               PARTITION BY source_id, symbol, LEFT(content, 200)
               ORDER BY fetched_at DESC, id DESC
             ) AS rn,
             fetched_at
           FROM market_data_raw
           WHERE is_processed = 0 AND data_type NOT IN ('price')
             AND fetched_at >= NOW() - INTERVAL '${DUPLICATE_WINDOW_HOURS} hours' * 2
         ) ranked
         WHERE rn > 1
       ) dupes
       WHERE m.id = dupes.id`,
    );
    result.triaged_duplicate = duplicates?.changes ?? 0;

    // Still pending after triage — informational, useful for ops to see
    // when backlog growth outpaces triage.
    const pending = await db.get<{ n: number | string }>(
      `SELECT COUNT(*) AS n FROM market_data_raw
       WHERE is_processed = 0 AND data_type NOT IN ('price')`,
    );
    result.still_pending = Number(pending?.n ?? 0);
    result.scanned = result.triaged_stale + result.triaged_empty + result.triaged_short + result.triaged_duplicate;

    if (result.scanned > 0 || result.still_pending > 0) {
      log.info(
        {
          triaged: result.scanned,
          stale: result.triaged_stale,
          empty: result.triaged_empty,
          short: result.triaged_short,
          duplicate: result.triaged_duplicate,
          still_pending: result.still_pending,
        },
        'backlog_triage_complete',
      );
    }
    void limit; // keeps the option in the signature for future per-rule caps
    return result;
  }

  return { triageBacklog };
}

export type MarketDataBacklogTriageService = Awaited<ReturnType<typeof createMarketDataBacklogTriageService>>;
