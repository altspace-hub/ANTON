/**
 * tabular-review.ts — REST + SSE for the Tabular Review workspace.
 *
 *   GET    /api/tabular-review/playbooks         List available playbooks
 *   GET    /api/tabular-review/runs              User's runs (most recent first)
 *   POST   /api/tabular-review/runs              Create + start a run
 *   GET    /api/tabular-review/runs/:id          Full run state (docs, cells)
 *   GET    /api/tabular-review/runs/:id/stream   SSE — live cell events
 *   GET    /api/tabular-review/runs/:id/export.xlsx  Download grid as XLSX
 *   DELETE /api/tabular-review/runs/:id          Remove a run + its cells
 *
 * Phase 1 customer-testing (May 2026) — feedback + share-link surface:
 *   POST   /api/tabular-review/runs/:id/cells/:docId/:columnId/feedback
 *   GET    /api/tabular-review/runs/:id/feedback
 *   GET    /api/tabular-review/runs/:id/calibration
 *   GET    /api/tabular-review/runs/:id/feedback-export.xlsx
 *   GET    /api/tabular-review/runs/:id/shares
 *   POST   /api/tabular-review/runs/:id/share
 *   DELETE /api/tabular-review/runs/:id/share/:token
 *
 * Public (no auth — opaque share token):
 *   GET    /api/tabular-review/shared/:token
 *   POST   /api/tabular-review/shared/:token/feedback
 */

import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'crypto';
import type { DatabaseAdapter } from '../db/database.js';
import { requireAuth } from '../middleware/auth.js';
import { safeError } from '../lib/error-response.js';
import { ALL_PLAYBOOKS, getPlaybook } from '../services/tabular-review-playbooks.js';
import { startRun, runEventBus, MAX_DOC_CHARS } from '../services/tabular-review-executor.js';
import { generateXlsx } from '../services/export-xlsx.js';

function getUserId(req: Request): string {
  return (req as unknown as { user?: { id?: string } }).user?.id ?? 'solo';
}

interface RunRow {
  id: string;
  user_id: string;
  name: string;
  playbook_id: string;
  playbook_snapshot: unknown;
  status: string;
  total_cells: number;
  completed_cells: number;
  failed_cells: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  error: string | null;
}

interface DocRow {
  run_id: string;
  doc_id: string;
  file_name: string;
  byte_size: number;
  text_excerpt: string;
  text_truncated: boolean;
}

interface CellRow {
  run_id: string;
  doc_id: string;
  column_id: string;
  status: string;
  result: { status?: string; evidence?: string; rationale?: string } | null;
  model_used: string | null;
  error: string | null;
  started_at: string | null;
  completed_at: string | null;
}

interface FeedbackRow {
  doc_id: string;
  column_id: string;
  reviewer_id?: string;
  reviewer_name?: string | null;
  verdict: string;
  reviewer_status?: string | null;
  note?: string | null;
  created_at?: string;
  updated_at?: string;
}

interface ShareRow {
  token: string;
  created_at: string;
  expires_at: string;
  allow_feedback: boolean;
  message: string | null;
  revoked_at: string | null;
}

const VALID_VERDICTS = new Set([
  'correct', 'false_positive', 'false_negative', 'partial', 'unclear',
]);
const VALID_REVIEWER_STATUSES = new Set([
  'covered', 'partial', 'missing', 'not_applicable',
]);

async function upsertFeedback(
  db: DatabaseAdapter,
  f: {
    runId: string; docId: string; columnId: string;
    reviewerId: string; reviewerName: string | null;
    verdict: string; reviewerStatus: string | null; note: string | null;
  },
): Promise<void> {
  await db.run(
    `INSERT INTO tabular_review_cell_feedback
       (run_id, doc_id, column_id, reviewer_id, reviewer_name,
        verdict, reviewer_status, note)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (run_id, doc_id, column_id, reviewer_id)
     DO UPDATE SET
       reviewer_name   = EXCLUDED.reviewer_name,
       verdict         = EXCLUDED.verdict,
       reviewer_status = EXCLUDED.reviewer_status,
       note            = EXCLUDED.note,
       updated_at      = NOW()`,
    f.runId, f.docId, f.columnId, f.reviewerId, f.reviewerName,
    f.verdict, f.reviewerStatus, f.note,
  );
}

interface CalibrationSummary {
  overall: {
    feedbackCount: number;
    reviewerCount: number;
    correctPct: number;            // 0..1
    falsePositivePct: number;
    falseNegativePct: number;
    partialPct: number;
    unclearPct: number;
  };
  perColumn: Array<{
    columnId: string;
    header: string;
    feedbackCount: number;
    correctPct: number;
    falsePositivePct: number;
    falseNegativePct: number;
  }>;
  perReviewer: Array<{
    reviewerId: string;
    reviewerName: string | null;
    feedbackCount: number;
    correctPct: number;
  }>;
}

function computeCalibration(
  rows: FeedbackRow[],
  columns: Array<{ id: string; header: string }>,
): CalibrationSummary {
  const total = rows.length;
  const safe = (n: number, d: number) => (d === 0 ? 0 : n / d);
  const count = (preds: FeedbackRow[], v: string) => preds.filter((r) => r.verdict === v).length;

  const overall = {
    feedbackCount: total,
    reviewerCount: new Set(rows.map((r) => r.reviewer_id ?? '')).size,
    correctPct: safe(count(rows, 'correct'), total),
    falsePositivePct: safe(count(rows, 'false_positive'), total),
    falseNegativePct: safe(count(rows, 'false_negative'), total),
    partialPct: safe(count(rows, 'partial'), total),
    unclearPct: safe(count(rows, 'unclear'), total),
  };

  const perColumn = columns.map((c) => {
    const colRows = rows.filter((r) => r.column_id === c.id);
    const n = colRows.length;
    return {
      columnId: c.id,
      header: c.header,
      feedbackCount: n,
      correctPct: safe(count(colRows, 'correct'), n),
      falsePositivePct: safe(count(colRows, 'false_positive'), n),
      falseNegativePct: safe(count(colRows, 'false_negative'), n),
    };
  });

  const byReviewer = new Map<string, { name: string | null; rows: FeedbackRow[] }>();
  for (const r of rows) {
    const id = r.reviewer_id ?? '';
    let entry = byReviewer.get(id);
    if (!entry) { entry = { name: r.reviewer_name ?? null, rows: [] }; byReviewer.set(id, entry); }
    entry.rows.push(r);
    if (!entry.name && r.reviewer_name) entry.name = r.reviewer_name;
  }
  const perReviewer = [...byReviewer.entries()].map(([reviewerId, e]) => ({
    reviewerId,
    reviewerName: e.name,
    feedbackCount: e.rows.length,
    correctPct: safe(count(e.rows, 'correct'), e.rows.length),
  }));

  return { overall, perColumn, perReviewer };
}

function buildFeedbackMarkdown(
  playbook: { name: string; columns: Array<{ id: string; header: string }> },
  documents: DocRow[],
  cells: CellRow[],
  feedback: FeedbackRow[],
  runName: string,
): string {
  const md: string[] = [];
  md.push(`# ${playbook.name} — Reviewer Feedback`);
  md.push('');
  md.push(`*Run: ${runName}*`);
  md.push('');
  md.push('| Document | Column | AI status | AI rationale | Reviewer verdict | Reviewer status | Reviewer note |');
  md.push('|---|---|---|---|---|---|---|');
  const cellByKey = new Map<string, CellRow>();
  for (const c of cells) cellByKey.set(`${c.doc_id} ${c.column_id}`, c);
  const fbByKey = new Map<string, FeedbackRow[]>();
  for (const f of feedback) {
    const k = `${f.doc_id} ${f.column_id}`;
    const arr = fbByKey.get(k) ?? [];
    arr.push(f);
    fbByKey.set(k, arr);
  }
  for (const doc of documents) {
    for (const col of playbook.columns) {
      const k = `${doc.doc_id} ${col.id}`;
      const cell = cellByKey.get(k);
      const fbs = fbByKey.get(k) ?? [];
      if (fbs.length === 0) continue; // only export cells with feedback
      for (const f of fbs) {
        md.push([
          '',
          doc.file_name,
          col.header,
          cell?.status ?? '',
          (cell?.result?.rationale ?? '').replace(/\|/g, '/'),
          f.verdict,
          f.reviewer_status ?? '',
          (f.note ?? '').replace(/\|/g, '/'),
          '',
        ].join(' | '));
      }
    }
  }
  return md.join('\n');
}

export function createTabularReviewRoutes(db: DatabaseAdapter): Router {
  const router = Router();

  // ── Playbooks ─────────────────────────────────────────────────────────
  router.get('/tabular-review/playbooks', requireAuth, (_req, res) => {
    // Strip the per-column prompt template — frontend only needs the
    // surface (id, header, regulatoryRef, question) for the grid.
    const summaries = ALL_PLAYBOOKS.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      defaultModel: p.defaultModel,
      columns: p.columns.map((c) => ({
        id: c.id, header: c.header, regulatoryRef: c.regulatoryRef, question: c.question,
      })),
    }));
    res.json({ playbooks: summaries });
  });

  // ── List runs ────────────────────────────────────────────────────────
  router.get('/tabular-review/runs', requireAuth, async (req, res) => {
    try {
      const rows = await db.all<RunRow>(
        `SELECT id, name, playbook_id, status, total_cells, completed_cells, failed_cells,
                created_at, started_at, completed_at, error
           FROM tabular_review_runs
          WHERE user_id = $1
          ORDER BY created_at DESC
          LIMIT 100`,
        getUserId(req),
      );
      res.json({ runs: rows });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── Create + start a run ─────────────────────────────────────────────
  router.post('/tabular-review/runs', requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const body = req.body as {
        name?: string;
        playbookId?: string;
        documents?: Array<{ fileName: string; text: string; byteSize?: number }>;
      };
      const name = (body.name ?? '').trim() || 'Untitled run';
      const playbookId = body.playbookId ?? '';
      const documents = body.documents ?? [];

      const playbook = getPlaybook(playbookId);
      if (!playbook) {
        return res.status(400).json({ error: `Unknown playbook: ${playbookId}` });
      }
      if (documents.length === 0) {
        return res.status(400).json({ error: 'At least one document is required' });
      }
      if (documents.length > 200) {
        return res.status(400).json({ error: 'Wave 1 cap: 200 documents per run' });
      }

      const runId = randomUUID();
      const totalCells = documents.length * playbook.columns.length;

      // Insert run + documents + pending cells in one transaction so a
      // half-built run never appears to the user.
      await db.transaction(async (tx) => {
        await tx.run(
          `INSERT INTO tabular_review_runs
             (id, user_id, name, playbook_id, playbook_snapshot, status, total_cells)
           VALUES ($1, $2, $3, $4, $5, 'pending', $6)`,
          runId, userId, name, playbookId, JSON.stringify(playbook), totalCells,
        );

        const docRows: Array<{ docId: string; fileName: string; text: string }> = [];
        for (const d of documents) {
          const docId = randomUUID();
          const truncated = d.text.length > MAX_DOC_CHARS;
          const excerpt = truncated ? d.text.slice(0, MAX_DOC_CHARS) : d.text;
          await tx.run(
            `INSERT INTO tabular_review_documents
               (run_id, doc_id, file_name, byte_size, text_excerpt, text_truncated)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            runId, docId, d.fileName, d.byteSize ?? d.text.length, excerpt, truncated,
          );
          docRows.push({ docId, fileName: d.fileName, text: excerpt });

          for (const col of playbook.columns) {
            await tx.run(
              `INSERT INTO tabular_review_cells (run_id, doc_id, column_id, status)
               VALUES ($1, $2, $3, 'pending')`,
              runId, docId, col.id,
            );
          }
        }

        // Stash on res.locals so the post-commit kick can read it without
        // a second SELECT round-trip.
        (res.locals as { _docRows?: typeof docRows })._docRows = docRows;
      });

      // Kick the executor — fire and forget. Errors are surfaced via the
      // run's `status` column + SSE, not the HTTP response.
      const docRows = (res.locals as { _docRows: Array<{ docId: string; fileName: string; text: string }> })._docRows;
      void startRun(db, { runId, documents: docRows, playbook });

      return res.status(201).json({ runId, totalCells });
    } catch (err) {
      return res.status(500).json({ error: safeError(err) });
    }
  });

  // ── Read a run (snapshot for the grid) ───────────────────────────────
  router.get('/tabular-review/runs/:id', requireAuth, async (req, res) => {
    try {
      const run = await db.get<RunRow>(
        `SELECT * FROM tabular_review_runs WHERE id = $1 AND user_id = $2`,
        req.params.id, getUserId(req),
      );
      if (!run) return res.status(404).json({ error: 'Run not found' });

      const documents = await db.all<DocRow>(
        `SELECT run_id, doc_id, file_name, byte_size, text_truncated
           FROM tabular_review_documents
          WHERE run_id = $1
          ORDER BY file_name`,
        req.params.id,
      );
      const cells = await db.all<CellRow>(
        `SELECT run_id, doc_id, column_id, status, result, model_used, error,
                started_at, completed_at
           FROM tabular_review_cells
          WHERE run_id = $1`,
        req.params.id,
      );
      return res.json({ run, documents, cells });
    } catch (err) {
      return res.status(500).json({ error: safeError(err) });
    }
  });

  // ── SSE stream of live cell events ───────────────────────────────────
  router.get('/tabular-review/runs/:id/stream', requireAuth, async (req, res) => {
    try {
      const run = await db.get<RunRow>(
        `SELECT id, status FROM tabular_review_runs WHERE id = $1 AND user_id = $2`,
        req.params.id, getUserId(req),
      );
      if (!run) return res.status(404).json({ error: 'Run not found' });

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      res.write(`data: ${JSON.stringify({ type: 'connected', runId: run.id, status: run.status })}\n\n`);

      const unsubscribe = runEventBus.subscribe(run.id, res);

      const heartbeat = setInterval(() => {
        try { res.write(': heartbeat\n\n'); } catch { /* ignored */ }
      }, 25_000);

      req.on('close', () => {
        clearInterval(heartbeat);
        unsubscribe();
      });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── XLSX export of the grid ──────────────────────────────────────────
  router.get('/tabular-review/runs/:id/export.xlsx', requireAuth, async (req, res) => {
    try {
      const run = await db.get<RunRow>(
        `SELECT * FROM tabular_review_runs WHERE id = $1 AND user_id = $2`,
        req.params.id, getUserId(req),
      );
      if (!run) return res.status(404).json({ error: 'Run not found' });

      const documents = await db.all<DocRow>(
        `SELECT doc_id, file_name FROM tabular_review_documents
           WHERE run_id = $1 ORDER BY file_name`,
        req.params.id,
      );
      const cells = await db.all<CellRow>(
        `SELECT doc_id, column_id, status, result, error FROM tabular_review_cells
           WHERE run_id = $1`,
        req.params.id,
      );

      const playbook = run.playbook_snapshot as { name: string; columns: Array<{ id: string; header: string }> };
      const colHeaders = playbook.columns.map((c) => c.header);
      const cellByKey = new Map<string, CellRow>();
      for (const c of cells) cellByKey.set(`${c.doc_id} ${c.column_id}`, c);

      // Render a Markdown table that the existing generateXlsx exporter
      // turns into a coloured, auto-filtered spreadsheet. The status
      // emoji prefixes drive the RAG conditional formatting downstream.
      const md: string[] = [];
      md.push(`# ${playbook.name}`);
      md.push('');
      md.push(`*Run: ${run.name} — ${run.completed_at ?? 'in progress'}*`);
      md.push('');
      md.push(`| Document | ${colHeaders.join(' | ')} |`);
      md.push(`|${'---|'.repeat(colHeaders.length + 1)}`);
      for (const doc of documents) {
        const row = [doc.file_name];
        for (const col of playbook.columns) {
          const cell = cellByKey.get(`${doc.doc_id} ${col.id}`);
          row.push(formatCellForXlsx(cell));
        }
        md.push(`| ${row.join(' | ')} |`);
      }

      const buffer = await generateXlsx(md.join('\n'), {
        title: playbook.name,
        subject: run.name,
      });

      const safeFilename = run.name.replace(/[^a-zA-Z0-9-_]+/g, '_').slice(0, 60) || 'tabular-review';
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}.xlsx"`);
      return res.end(buffer);
    } catch (err) {
      return res.status(500).json({ error: safeError(err) });
    }
  });

  // ── Delete a run ─────────────────────────────────────────────────────
  router.delete('/tabular-review/runs/:id', requireAuth, async (req, res) => {
    try {
      const result = await db.run(
        `DELETE FROM tabular_review_runs WHERE id = $1 AND user_id = $2`,
        req.params.id, getUserId(req),
      );
      if (result.changes === 0) return res.status(404).json({ error: 'Run not found' });
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: safeError(err) });
    }
  });

  // ───────────────────────────────────────────────────────────────────────
  // Phase 1 customer-testing — feedback + share-link surface
  // ───────────────────────────────────────────────────────────────────────

  // Submit / update feedback on a single cell. Reviewer can change their
  // mind by POSTing again — upsert on (run × doc × column × reviewer).
  router.post(
    '/tabular-review/runs/:id/cells/:docId/:columnId/feedback',
    requireAuth,
    async (req, res) => {
      try {
        const run = await db.get<RunRow>(
          `SELECT id FROM tabular_review_runs WHERE id = $1 AND user_id = $2`,
          req.params.id, getUserId(req),
        );
        if (!run) return res.status(404).json({ error: 'Run not found' });

        const body = req.body as {
          verdict?: string;
          reviewerStatus?: string | null;
          note?: string | null;
          reviewerName?: string | null;
        };
        const verdict = body.verdict ?? '';
        if (!VALID_VERDICTS.has(verdict)) {
          return res.status(400).json({ error: `Invalid verdict: ${verdict}` });
        }
        const reviewerStatus = body.reviewerStatus ?? null;
        if (reviewerStatus !== null && !VALID_REVIEWER_STATUSES.has(reviewerStatus)) {
          return res.status(400).json({ error: `Invalid reviewerStatus: ${reviewerStatus}` });
        }

        await upsertFeedback(db, {
          runId: String(req.params.id),
          docId: String(req.params.docId),
          columnId: String(req.params.columnId),
          reviewerId: getUserId(req),
          reviewerName: body.reviewerName ?? null,
          verdict,
          reviewerStatus,
          note: body.note ?? null,
        });
        return res.json({ ok: true });
      } catch (err) {
        return res.status(500).json({ error: safeError(err) });
      }
    },
  );

  // All feedback for a run (for the calibration view + per-cell drawer).
  router.get('/tabular-review/runs/:id/feedback', requireAuth, async (req, res) => {
    try {
      const run = await db.get<RunRow>(
        `SELECT id FROM tabular_review_runs WHERE id = $1 AND user_id = $2`,
        req.params.id, getUserId(req),
      );
      if (!run) return res.status(404).json({ error: 'Run not found' });

      const rows = await db.all<FeedbackRow>(
        `SELECT doc_id, column_id, reviewer_id, reviewer_name, verdict,
                reviewer_status, note, created_at, updated_at
           FROM tabular_review_cell_feedback
          WHERE run_id = $1
          ORDER BY updated_at DESC`,
        req.params.id,
      );
      return res.json({ feedback: rows });
    } catch (err) {
      return res.status(500).json({ error: safeError(err) });
    }
  });

  // Computed calibration summary. Per-column agreement %, per-reviewer
  // counts, overall agreement %, false-positive + false-negative split.
  router.get('/tabular-review/runs/:id/calibration', requireAuth, async (req, res) => {
    try {
      const run = await db.get<RunRow>(
        `SELECT id, playbook_snapshot FROM tabular_review_runs WHERE id = $1 AND user_id = $2`,
        req.params.id, getUserId(req),
      );
      if (!run) return res.status(404).json({ error: 'Run not found' });

      const rows = await db.all<FeedbackRow>(
        `SELECT doc_id, column_id, reviewer_id, reviewer_name, verdict
           FROM tabular_review_cell_feedback
          WHERE run_id = $1`,
        req.params.id,
      );
      const playbook = run.playbook_snapshot as {
        columns: Array<{ id: string; header: string }>;
      };
      return res.json({ calibration: computeCalibration(rows, playbook.columns) });
    } catch (err) {
      return res.status(500).json({ error: safeError(err) });
    }
  });

  // Feedback as XLSX — for sharing back with the reviewer + the user's
  // own iteration backlog. Rows = (doc × column), cells = AI status + the
  // reviewer's verdict + reviewer's status + note.
  router.get(
    '/tabular-review/runs/:id/feedback-export.xlsx',
    requireAuth,
    async (req, res) => {
      try {
        const run = await db.get<RunRow>(
          `SELECT * FROM tabular_review_runs WHERE id = $1 AND user_id = $2`,
          req.params.id, getUserId(req),
        );
        if (!run) return res.status(404).json({ error: 'Run not found' });

        const documents = await db.all<DocRow>(
          `SELECT doc_id, file_name FROM tabular_review_documents
             WHERE run_id = $1 ORDER BY file_name`,
          req.params.id,
        );
        const cells = await db.all<CellRow>(
          `SELECT doc_id, column_id, status, result FROM tabular_review_cells
             WHERE run_id = $1`,
          req.params.id,
        );
        const feedback = await db.all<FeedbackRow>(
          `SELECT doc_id, column_id, reviewer_name, verdict, reviewer_status, note
             FROM tabular_review_cell_feedback
            WHERE run_id = $1`,
          req.params.id,
        );

        const playbook = run.playbook_snapshot as {
          name: string;
          columns: Array<{ id: string; header: string }>;
        };
        const md = buildFeedbackMarkdown(playbook, documents, cells, feedback, run.name);
        const buffer = await generateXlsx(md, {
          title: `${playbook.name} — Reviewer Feedback`,
          subject: run.name,
        });
        const safeFilename =
          run.name.replace(/[^a-zA-Z0-9-_]+/g, '_').slice(0, 60) || 'tabular-review';
        res.setHeader(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        );
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${safeFilename}-feedback.xlsx"`,
        );
        return res.end(buffer);
      } catch (err) {
        return res.status(500).json({ error: safeError(err) });
      }
    },
  );

  // ── Share tokens ─────────────────────────────────────────────────────
  router.get('/tabular-review/runs/:id/shares', requireAuth, async (req, res) => {
    try {
      const run = await db.get<RunRow>(
        `SELECT id FROM tabular_review_runs WHERE id = $1 AND user_id = $2`,
        req.params.id, getUserId(req),
      );
      if (!run) return res.status(404).json({ error: 'Run not found' });
      const shares = await db.all<ShareRow>(
        `SELECT token, created_at, expires_at, allow_feedback, message, revoked_at
           FROM tabular_review_share_tokens
          WHERE run_id = $1
          ORDER BY created_at DESC`,
        req.params.id,
      );
      return res.json({ shares });
    } catch (err) {
      return res.status(500).json({ error: safeError(err) });
    }
  });

  router.post('/tabular-review/runs/:id/share', requireAuth, async (req, res) => {
    try {
      const run = await db.get<RunRow>(
        `SELECT id FROM tabular_review_runs WHERE id = $1 AND user_id = $2`,
        req.params.id, getUserId(req),
      );
      if (!run) return res.status(404).json({ error: 'Run not found' });

      const body = req.body as {
        expiresInDays?: number;
        allowFeedback?: boolean;
        message?: string;
      };
      const days = Math.max(1, Math.min(365, body.expiresInDays ?? 30));
      const allowFeedback = body.allowFeedback !== false;
      const message = body.message?.slice(0, 1000) ?? null;
      const token = randomUUID().replace(/-/g, '');
      const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

      await db.run(
        `INSERT INTO tabular_review_share_tokens
           (token, run_id, created_by, expires_at, allow_feedback, message)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        token, req.params.id, getUserId(req), expiresAt, allowFeedback, message,
      );
      return res.status(201).json({ token, expiresAt: expiresAt.toISOString() });
    } catch (err) {
      return res.status(500).json({ error: safeError(err) });
    }
  });

  router.delete('/tabular-review/runs/:id/share/:token', requireAuth, async (req, res) => {
    try {
      const result = await db.run(
        `UPDATE tabular_review_share_tokens
            SET revoked_at = NOW()
          WHERE token = $1
            AND run_id = $2
            AND run_id IN (SELECT id FROM tabular_review_runs WHERE user_id = $3)`,
        req.params.token, req.params.id, getUserId(req),
      );
      if (result.changes === 0) return res.status(404).json({ error: 'Share not found' });
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: safeError(err) });
    }
  });

  // ── Public share-link routes (no auth) ───────────────────────────────
  // Anyone with the opaque token gets read access; feedback POST allowed
  // iff allow_feedback + not revoked + not expired.

  router.get('/tabular-review/shared/:token', async (req, res) => {
    try {
      const share = await db.get<ShareRow & { run_id: string }>(
        `SELECT token, run_id, expires_at, allow_feedback, message, revoked_at
           FROM tabular_review_share_tokens
          WHERE token = $1`,
        req.params.token,
      );
      if (!share || share.revoked_at) return res.status(404).json({ error: 'Share not found' });
      if (new Date(share.expires_at).getTime() < Date.now()) {
        return res.status(410).json({ error: 'Share expired' });
      }

      const run = await db.get<RunRow>(
        `SELECT id, name, playbook_id, playbook_snapshot, status,
                total_cells, completed_cells, failed_cells,
                created_at, started_at, completed_at
           FROM tabular_review_runs WHERE id = $1`,
        share.run_id,
      );
      if (!run) return res.status(404).json({ error: 'Run not found' });
      const documents = await db.all<DocRow>(
        `SELECT run_id, doc_id, file_name, byte_size, text_truncated
           FROM tabular_review_documents WHERE run_id = $1 ORDER BY file_name`,
        share.run_id,
      );
      const cells = await db.all<CellRow>(
        `SELECT run_id, doc_id, column_id, status, result, model_used, error,
                started_at, completed_at
           FROM tabular_review_cells WHERE run_id = $1`,
        share.run_id,
      );
      // Feedback specific to this share token's anonymous reviewer.
      const reviewerId = `share:${req.params.token}`;
      const feedback = await db.all<FeedbackRow>(
        `SELECT doc_id, column_id, verdict, reviewer_status, note
           FROM tabular_review_cell_feedback
          WHERE run_id = $1 AND reviewer_id = $2`,
        share.run_id, reviewerId,
      );

      return res.json({
        share: {
          token: share.token,
          expiresAt: share.expires_at,
          allowFeedback: share.allow_feedback,
          message: share.message,
        },
        run,
        documents,
        cells,
        feedback,
      });
    } catch (err) {
      return res.status(500).json({ error: safeError(err) });
    }
  });

  router.post('/tabular-review/shared/:token/feedback', async (req, res) => {
    try {
      const share = await db.get<ShareRow & { run_id: string }>(
        `SELECT run_id, expires_at, allow_feedback, revoked_at
           FROM tabular_review_share_tokens WHERE token = $1`,
        req.params.token,
      );
      if (!share || share.revoked_at) return res.status(404).json({ error: 'Share not found' });
      if (new Date(share.expires_at).getTime() < Date.now()) {
        return res.status(410).json({ error: 'Share expired' });
      }
      if (!share.allow_feedback) {
        return res.status(403).json({ error: 'This share is read-only' });
      }

      const body = req.body as {
        docId?: string;
        columnId?: string;
        verdict?: string;
        reviewerStatus?: string | null;
        note?: string | null;
        reviewerName?: string | null;
      };
      const docId = body.docId ?? '';
      const columnId = body.columnId ?? '';
      const verdict = body.verdict ?? '';
      if (!docId || !columnId) {
        return res.status(400).json({ error: 'docId + columnId required' });
      }
      if (!VALID_VERDICTS.has(verdict)) {
        return res.status(400).json({ error: `Invalid verdict: ${verdict}` });
      }
      const reviewerStatus = body.reviewerStatus ?? null;
      if (reviewerStatus !== null && !VALID_REVIEWER_STATUSES.has(reviewerStatus)) {
        return res.status(400).json({ error: `Invalid reviewerStatus: ${reviewerStatus}` });
      }

      await upsertFeedback(db, {
        runId: share.run_id,
        docId, columnId,
        reviewerId: `share:${req.params.token}`,
        reviewerName: body.reviewerName?.slice(0, 100) ?? null,
        verdict,
        reviewerStatus,
        note: body.note?.slice(0, 2000) ?? null,
      });
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: safeError(err) });
    }
  });

  return router;
}

function formatCellForXlsx(cell: CellRow | undefined): string {
  if (!cell || cell.status === 'pending' || cell.status === 'running') return '…';
  if (cell.status === 'error') return '⚠ error';
  const r = cell.result;
  switch (cell.status) {
    case 'covered':        return `🟢 covered — ${r?.rationale ?? ''}`;
    case 'partial':        return `🟡 partial — ${r?.rationale ?? ''}`;
    case 'missing':        return `🔴 missing — ${r?.rationale ?? ''}`;
    case 'not_applicable': return `⚪ N/A — ${r?.rationale ?? ''}`;
    default:               return cell.status;
  }
}
