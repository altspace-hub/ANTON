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
