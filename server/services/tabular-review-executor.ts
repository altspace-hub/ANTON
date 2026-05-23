/**
 * tabular-review-executor.ts — runs a tabular-review job to completion.
 *
 * For each (doc × column) pair the executor:
 *   1. Renders a per-cell prompt from the playbook column + the doc text.
 *   2. Calls Claude via `callSync` (one-shot, no streaming — we want the
 *      whole JSON answer per cell, and we want N cells in flight at once).
 *   3. Parses the JSON status answer.
 *   4. UPDATEs the cell row + publishes an SSE event for any subscribed
 *      client watching the grid update live.
 *
 * Concurrency is bounded by env `TABULAR_REVIEW_CONCURRENCY` (default 8).
 * A single-failed-cell does NOT fail the run — the cell row gets status
 * `error` and the rest keep going. Run-level failure is reserved for
 * genuine system errors (DB down, Anthropic key missing).
 */

import type { Response } from 'express';
import type { DatabaseAdapter } from '../db/database.js';
import { callSync } from './claude-client.js';
import type { Playbook, PlaybookColumn } from './tabular-review-playbooks.js';

const DEFAULT_CONCURRENCY = Number(process.env.TABULAR_REVIEW_CONCURRENCY ?? 8);
const PER_CELL_TIMEOUT_MS = 60_000;
/** Cap of plaintext sent to Claude per cell, in characters. Keeps cost
 *  predictable and avoids 1000-page-PDF blow-ups. The DB excerpt is
 *  truncated at the same length on insert. */
export const MAX_DOC_CHARS = 30_000;

export type CellStatus =
  | 'pending' | 'running'
  | 'covered' | 'partial' | 'missing' | 'not_applicable'
  | 'error';

interface CellResult {
  status: 'covered' | 'partial' | 'missing' | 'not_applicable';
  evidence: string;
  rationale: string;
}

// ───────────────────────────────────────────────────────────────────────
// In-process event bus — SSE subscribers per run
// ───────────────────────────────────────────────────────────────────────

class RunEventBus {
  private subscribers = new Map<string, Set<Response>>();

  subscribe(runId: string, res: Response): () => void {
    let set = this.subscribers.get(runId);
    if (!set) {
      set = new Set();
      this.subscribers.set(runId, set);
    }
    set.add(res);
    return () => {
      const s = this.subscribers.get(runId);
      if (!s) return;
      s.delete(res);
      if (s.size === 0) this.subscribers.delete(runId);
    };
  }

  publish(runId: string, event: object): void {
    const set = this.subscribers.get(runId);
    if (!set) return;
    const payload = `data: ${JSON.stringify(event)}\n\n`;
    for (const res of set) {
      try { res.write(payload); } catch { /* client gone — sweep on next publish */ }
    }
  }
}

export const runEventBus = new RunEventBus();

// ───────────────────────────────────────────────────────────────────────
// Cell prompt — the core ask
// ───────────────────────────────────────────────────────────────────────

function renderCellPrompt(column: PlaybookColumn, docName: string, docText: string): string {
  const text = docText.length > MAX_DOC_CHARS ? docText.slice(0, MAX_DOC_CHARS) : docText;
  return [
    `You are auditing a corporate AML/CFT policy or procedure document against`,
    `the AMLR (Regulation (EU) 2024/1624).`,
    ``,
    `REGULATORY REFERENCE: ${column.regulatoryRef}`,
    ``,
    `OBLIGATION TO CHECK: ${column.question}`,
    ``,
    `WHAT "COVERED" LOOKS LIKE: ${column.expects}`,
    ``,
    `DOCUMENT NAME: "${docName}"`,
    `DOCUMENT TEXT:`,
    `"""`,
    text,
    `"""`,
    ``,
    `Answer in this exact JSON shape (no markdown, no commentary, just JSON):`,
    `{`,
    `  "status": "covered" | "partial" | "missing" | "not_applicable",`,
    `  "evidence": "exact short quoted passage from the document (max 300 chars), or '' if missing or N/A",`,
    `  "rationale": "1-2 sentence explanation"`,
    `}`,
    ``,
    `Rules:`,
    `- "covered" requires explicit, specific coverage — not implication.`,
    `- "partial" if the document addresses the obligation but misses one or more required elements (see "What covered looks like").`,
    `- "missing" if the document is silent or only uses generic compliance language.`,
    `- "not_applicable" only if the obligation genuinely does not apply to the scope of this document.`,
    `- "evidence" must be a verbatim quote from the document, not a paraphrase.`,
    `- Be strict. Do not infer coverage from generic language.`,
    ``,
    `Output ONLY the JSON object.`,
  ].join('\n');
}

const SYSTEM_PROMPT =
  'You are an experienced AML/CFT compliance auditor. You assess corporate policy ' +
  'documents against the EU Anti-Money Laundering Regulation (AMLR, (EU) 2024/1624) ' +
  'with the discipline of a regulatory examiner: explicit > implicit, evidence > ' +
  'paraphrase, strict > lenient. You respond ONLY with the requested JSON object.';

function parseCellResponse(raw: string): CellResult {
  // Strip ```json``` fences if the model added them anyway.
  let s = raw.trim();
  if (s.startsWith('```')) {
    s = s.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '').trim();
  }
  const obj = JSON.parse(s) as Record<string, unknown>;
  const status = String(obj.status ?? '').toLowerCase();
  if (!['covered', 'partial', 'missing', 'not_applicable'].includes(status)) {
    throw new Error(`invalid status in cell response: ${status}`);
  }
  return {
    status: status as CellResult['status'],
    evidence: String(obj.evidence ?? '').slice(0, 600),
    rationale: String(obj.rationale ?? '').slice(0, 1000),
  };
}

// ───────────────────────────────────────────────────────────────────────
// Per-cell execution
// ───────────────────────────────────────────────────────────────────────

async function executeCell(
  db: DatabaseAdapter,
  runId: string,
  docId: string,
  docName: string,
  docText: string,
  column: PlaybookColumn,
  model: Playbook['defaultModel'],
): Promise<void> {
  const startedAt = new Date();
  await db.run(
    `UPDATE tabular_review_cells
        SET status = 'running', started_at = $1, model_used = $2
      WHERE run_id = $3 AND doc_id = $4 AND column_id = $5`,
    startedAt, model, runId, docId, column.id,
  );
  runEventBus.publish(runId, {
    type: 'cell_started', docId, columnId: column.id,
  });

  let result: CellResult | null = null;
  let errorMsg: string | null = null;

  try {
    const completion = await Promise.race([
      callSync({
        model,
        thinking: 'quick',
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: renderCellPrompt(column, docName, docText) }],
      }),
      new Promise<never>((_, rej) =>
        setTimeout(() => rej(new Error('cell timeout (60s)')), PER_CELL_TIMEOUT_MS),
      ),
    ]);
    result = parseCellResponse(completion.text);
  } catch (err) {
    errorMsg = err instanceof Error ? err.message : String(err);
  }

  const completedAt = new Date();
  if (result) {
    await db.run(
      `UPDATE tabular_review_cells
          SET status = $1, result = $2, completed_at = $3, error = NULL
        WHERE run_id = $4 AND doc_id = $5 AND column_id = $6`,
      result.status, JSON.stringify(result), completedAt, runId, docId, column.id,
    );
    await db.run(
      `UPDATE tabular_review_runs SET completed_cells = completed_cells + 1 WHERE id = $1`,
      runId,
    );
    runEventBus.publish(runId, {
      type: 'cell_done', docId, columnId: column.id,
      status: result.status, evidence: result.evidence, rationale: result.rationale,
    });
  } else {
    await db.run(
      `UPDATE tabular_review_cells
          SET status = 'error', error = $1, completed_at = $2
        WHERE run_id = $3 AND doc_id = $4 AND column_id = $5`,
      errorMsg, completedAt, runId, docId, column.id,
    );
    await db.run(
      `UPDATE tabular_review_runs
          SET completed_cells = completed_cells + 1, failed_cells = failed_cells + 1
        WHERE id = $1`,
      runId,
    );
    runEventBus.publish(runId, {
      type: 'cell_done', docId, columnId: column.id,
      status: 'error', error: errorMsg,
    });
  }
}

// ───────────────────────────────────────────────────────────────────────
// Bounded-concurrency worker pool
// ───────────────────────────────────────────────────────────────────────

interface CellJob {
  docId: string;
  docName: string;
  docText: string;
  column: PlaybookColumn;
}

async function runWorkerPool(
  db: DatabaseAdapter,
  runId: string,
  jobs: CellJob[],
  model: Playbook['defaultModel'],
  concurrency: number,
): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, jobs.length) }, async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= jobs.length) return;
      const job = jobs[idx]!;
      await executeCell(db, runId, job.docId, job.docName, job.docText, job.column, model);
    }
  });
  await Promise.all(workers);
}

// ───────────────────────────────────────────────────────────────────────
// Entry point — kick a run from POST /runs
// ───────────────────────────────────────────────────────────────────────

export interface StartRunInput {
  runId: string;
  documents: Array<{ docId: string; fileName: string; text: string }>;
  playbook: Playbook;
}

/**
 * Fire-and-forget: returns immediately, the worker pool runs in the
 * background and publishes per-cell events to `runEventBus`.
 *
 * Safe to call as `void startRun(...)` from the POST handler.
 */
export async function startRun(db: DatabaseAdapter, input: StartRunInput): Promise<void> {
  const { runId, documents, playbook } = input;
  const startedAt = new Date();

  try {
    await db.run(
      `UPDATE tabular_review_runs SET status = 'running', started_at = $1 WHERE id = $2`,
      startedAt, runId,
    );
    runEventBus.publish(runId, { type: 'run_started', startedAt: startedAt.toISOString() });

    const jobs: CellJob[] = [];
    for (const doc of documents) {
      for (const column of playbook.columns) {
        jobs.push({ docId: doc.docId, docName: doc.fileName, docText: doc.text, column });
      }
    }

    await runWorkerPool(db, runId, jobs, playbook.defaultModel, DEFAULT_CONCURRENCY);

    // Determine final status: any cell errors mean the run is `done` with
    // partial failures (visible via failed_cells > 0). Only a system error
    // promotes to run-level `error` (handled in the catch below).
    const completedAt = new Date();
    await db.run(
      `UPDATE tabular_review_runs SET status = 'done', completed_at = $1 WHERE id = $2`,
      completedAt, runId,
    );
    runEventBus.publish(runId, { type: 'run_done', completedAt: completedAt.toISOString() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db.run(
      `UPDATE tabular_review_runs SET status = 'error', error = $1, completed_at = NOW() WHERE id = $2`,
      msg, runId,
    );
    runEventBus.publish(runId, { type: 'run_error', error: msg });
  }
}
