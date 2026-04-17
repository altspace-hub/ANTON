// ── Missions — Output Delivery Service (Phase 3) ───────────────────────────
//
// Routes mission deliverables to configured channels:
//   • in_app    — show in dashboard (default; nothing to do here, just record)
//   • webhook   — POST to a URL with the deliverable payload
//   • filesystem — write to a configured local path
//   • email     — SMTP / API-based send (Phase 3.5 — placeholder for now)
//   • slack / google_drive / sharepoint — Phase 3.5+
//
// Failures are logged and retried up to max_retries with exponential backoff.

import type { DatabaseAdapter } from '../../db/database.js';
import path from 'path';
import fs from 'fs/promises';

export type DeliveryChannel = 'in_app' | 'email' | 'webhook' | 'google_drive' | 'sharepoint' | 'slack' | 'filesystem';

export interface DeliveryRequest {
  missionId: string;
  taskId?: string;
  channel: DeliveryChannel;
  destination: Record<string, unknown>;     // channel-specific
  outputFiles?: Array<{ filename: string; content?: string; path?: string; mime_type?: string }>;
  body?: string;                            // text body (e.g. summary for in-app/email)
  subject?: string;                         // for email/slack
}

export interface DeliveryResult {
  success: boolean;
  delivery_id: number;
  status: 'pending' | 'delivering' | 'delivered' | 'failed';
  error?: string;
  details?: Record<string, unknown>;
}

export function createMissionDelivery(db: DatabaseAdapter) {

  /**
   * Queue a delivery and attempt immediate dispatch. Returns the delivery
   * record + final status (delivered or failed-to-be-retried).
   */
  async function deliver(req: DeliveryRequest): Promise<DeliveryResult> {
    const result = await db.run(
      `INSERT INTO missions.mission_deliveries
        (mission_id, task_id, channel, destination, status, output_files, delivery_details)
       VALUES (?, ?, ?, ?, 'pending', ?, ?)`,
      req.missionId, req.taskId ?? null, req.channel,
      JSON.stringify(req.destination ?? {}),
      JSON.stringify(req.outputFiles ?? []),
      JSON.stringify({ subject: req.subject, body: req.body }),
    );
    // Get the new id (PG returns lastInsertRowid via the adapter; but we'll re-query for safety)
    const idRow = await db.get<{ id: number | string }>(
      `SELECT id FROM missions.mission_deliveries
       WHERE mission_id = ? AND channel = ? AND status = 'pending'
       ORDER BY created_at DESC LIMIT 1`,
      req.missionId, req.channel,
    );
    const id = Number(idRow?.id ?? result.lastInsertRowid);

    return executeDelivery(id, req);
  }

  /** Execute a delivery (called by deliver() and by retry worker). */
  async function executeDelivery(id: number, req: DeliveryRequest): Promise<DeliveryResult> {
    await db.run(`UPDATE missions.mission_deliveries SET status = 'delivering' WHERE id = ?`, id);
    try {
      const details = await dispatch(req);
      await db.run(
        `UPDATE missions.mission_deliveries SET status = 'delivered', delivered_at = NOW(), delivery_details = ? WHERE id = ?`,
        JSON.stringify(details), id,
      );
      return { success: true, delivery_id: id, status: 'delivered', details };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const row = await db.get<{ retry_count: number; max_retries: number }>(
        `SELECT retry_count, max_retries FROM missions.mission_deliveries WHERE id = ?`,
        id,
      );
      const newRetry = (row?.retry_count ?? 0) + 1;
      const max = row?.max_retries ?? 3;
      const nextStatus = newRetry > max ? 'failed' : 'pending';
      await db.run(
        `UPDATE missions.mission_deliveries SET status = ?, retry_count = ?, error_message = ? WHERE id = ?`,
        nextStatus, newRetry, message, id,
      );
      return { success: false, delivery_id: id, status: nextStatus, error: message };
    }
  }

  /** Channel-specific dispatch. */
  async function dispatch(req: DeliveryRequest): Promise<Record<string, unknown>> {
    switch (req.channel) {
      case 'in_app':
        // No external action — the dashboard reads from mission_deliveries directly.
        return { recipient: 'dashboard', visible_at: new Date().toISOString() };

      case 'webhook': {
        const url = req.destination.url as string | undefined;
        if (!url) throw new Error('webhook delivery requires destination.url');
        if (!/^https?:\/\//i.test(url)) throw new Error('webhook url must be http(s)');
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (typeof req.destination.auth_header === 'string') headers['Authorization'] = req.destination.auth_header;
        const payload = {
          mission_id: req.missionId,
          task_id: req.taskId,
          subject: req.subject,
          body: req.body,
          output_files: req.outputFiles,
          delivered_at: new Date().toISOString(),
        };
        const res = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(30_000),
        });
        if (!res.ok) throw new Error(`Webhook returned ${res.status}: ${(await res.text()).slice(0, 500)}`);
        return { http_status: res.status, response_size: Number(res.headers.get('content-length') ?? 0) };
      }

      case 'filesystem': {
        const destPath = req.destination.path as string | undefined;
        if (!destPath) throw new Error('filesystem delivery requires destination.path');
        // Restrict to data/missions/deliverables/* — never write outside
        const root = path.resolve(process.cwd(), 'data', 'missions', 'deliverables');
        const resolved = path.resolve(root, req.missionId, destPath);
        if (!resolved.startsWith(root)) throw new Error('destination.path escapes the deliverables root');
        await fs.mkdir(path.dirname(resolved), { recursive: true });
        if (req.outputFiles && req.outputFiles.length > 0) {
          for (const f of req.outputFiles) {
            const filePath = path.join(path.dirname(resolved), f.filename);
            if (f.content) await fs.writeFile(filePath, f.content, 'utf-8');
            else if (f.path) await fs.copyFile(f.path, filePath);
          }
          return { written: req.outputFiles.length, target_dir: path.relative(process.cwd(), path.dirname(resolved)) };
        }
        await fs.writeFile(resolved, req.body ?? '', 'utf-8');
        return { written: 1, target: path.relative(process.cwd(), resolved) };
      }

      case 'email':
      case 'slack':
      case 'google_drive':
      case 'sharepoint':
        // Placeholder — Phase 3.5 wires these via existing email service / Slack MCP /
        // Google Workspace API connector. For now, fail loudly.
        throw new Error(`Delivery channel '${req.channel}' not yet implemented (Phase 3.5)`);

      default:
        throw new Error(`Unknown channel: ${req.channel}`);
    }
  }

  // ── Retry pending failures ───────────────────────────────────────────────

  async function retryPending(limit = 10): Promise<{ retried: number; succeeded: number; failed: number }> {
    interface PendingRow {
      id: number | string;
      mission_id: string;
      task_id: string | null;
      channel: string;
      destination: unknown;
      output_files: unknown;
      delivery_details: unknown;
    }
    const rows = await db.all<PendingRow>(
      `SELECT id, mission_id, task_id, channel, destination, output_files, delivery_details
       FROM missions.mission_deliveries
       WHERE status = 'pending' AND retry_count < max_retries
       ORDER BY created_at ASC LIMIT ?`,
      limit,
    );
    let succeeded = 0;
    let failed = 0;
    for (const row of rows) {
      const id = Number(row.id);
      const dest = parseJson(row.destination, {} as Record<string, unknown>);
      const files = parseJson(row.output_files, [] as Array<{ filename: string; content?: string; path?: string; mime_type?: string }>);
      const details = parseJson(row.delivery_details, {} as { subject?: string; body?: string });
      const result = await executeDelivery(id, {
        missionId: row.mission_id,
        taskId: row.task_id ?? undefined,
        channel: row.channel as DeliveryChannel,
        destination: dest,
        outputFiles: files,
        subject: details.subject,
        body: details.body,
      });
      if (result.success) succeeded++; else failed++;
    }
    return { retried: rows.length, succeeded, failed };
  }

  async function listDeliveries(missionId: string): Promise<Array<{ id: number; channel: string; status: string; delivered_at: string | null; error_message: string | null; created_at: string }>> {
    return db.all(
      `SELECT id, channel, status, delivered_at, error_message, created_at
       FROM missions.mission_deliveries WHERE mission_id = ? ORDER BY created_at DESC`,
      missionId,
    );
  }

  return { deliver, retryPending, listDeliveries };
}

export type MissionDelivery = ReturnType<typeof createMissionDelivery>;

function parseJson<T>(v: unknown, fallback: T): T {
  if (v == null) return fallback;
  if (typeof v === 'string') { try { return JSON.parse(v) as T; } catch { return fallback; } }
  return v as T;
}
