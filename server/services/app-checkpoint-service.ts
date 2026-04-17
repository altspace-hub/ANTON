// ── App Checkpoint Service — pending approvals per spec §8.6 ────────────
//
// A workflow / mission / atlas integrity finding raises a checkpoint that
// a specific connected user must respond to. Push notifications surface
// the existence; the full payload + rationale only travel over the
// authenticated channel (spec §8.7 end-to-end privacy).
//
// Severity drives push priority + biometric re-auth: critical / high
// always require biometric on response; normal is optional.

import type { DatabaseAdapter } from '../db/database.js';
import { createAppPushService, type PushPayload } from './app-push-service.js';

export type CheckpointSeverity = 'low' | 'normal' | 'high' | 'critical';
export type CheckpointStatus = 'pending' | 'approved' | 'rejected' | 'modified' | 'expired';

export interface CheckpointRow {
  id: string;
  org_id: string;
  connected_user_id: string;
  title: string;
  summary: string | null;
  rationale: string | null;
  severity: CheckpointSeverity;
  payload: Record<string, unknown>;
  source_kind: string | null;
  source_id: string | null;
  deep_link: string | null;
  requires_biometric: boolean;
  expires_at: string | null;
  status: CheckpointStatus;
  response: Record<string, unknown> | null;
  responded_at: string | null;
  responded_device_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateCheckpointInput {
  org_id: string;
  connected_user_id: string;
  title: string;
  summary?: string;
  rationale?: string;
  severity?: CheckpointSeverity;
  payload?: Record<string, unknown>;
  source_kind?: string;
  source_id?: string;
  deep_link?: string;
  expires_at?: string;
}

export interface RespondInput {
  decision: 'approved' | 'rejected' | 'modified';
  note?: string;
  /** For modified responses, the structured override the user supplied */
  modification?: Record<string, unknown>;
  /** Whether the device confirmed biometric on this response */
  biometric_confirmed?: boolean;
}

function parseJsonbField(v: unknown): Record<string, unknown> {
  if (!v) return {};
  if (typeof v === 'string') { try { return JSON.parse(v); } catch { return {}; } }
  return v as Record<string, unknown>;
}

function rowToCheckpoint(r: Record<string, unknown>): CheckpointRow {
  return {
    id: String(r.id),
    org_id: String(r.org_id),
    connected_user_id: String(r.connected_user_id),
    title: String(r.title),
    summary: r.summary as string | null,
    rationale: r.rationale as string | null,
    severity: r.severity as CheckpointSeverity,
    payload: parseJsonbField(r.payload),
    source_kind: r.source_kind as string | null,
    source_id: r.source_id as string | null,
    deep_link: r.deep_link as string | null,
    requires_biometric: !!r.requires_biometric,
    expires_at: r.expires_at as string | null,
    status: r.status as CheckpointStatus,
    response: r.response ? parseJsonbField(r.response) : null,
    responded_at: r.responded_at as string | null,
    responded_device_id: r.responded_device_id as string | null,
    created_at: String(r.created_at),
    updated_at: String(r.updated_at),
  };
}

export function createAppCheckpointService(db: DatabaseAdapter) {
  const pushService = createAppPushService(db);

  // ── CRUD ────────────────────────────────────────────────────────────

  async function create(input: CreateCheckpointInput): Promise<CheckpointRow> {
    const severity: CheckpointSeverity = input.severity ?? 'normal';
    const requiresBiometric = severity === 'critical' || severity === 'high';
    const row = await db.get<Record<string, unknown>>(
      `INSERT INTO app_checkpoints
         (org_id, connected_user_id, title, summary, rationale,
          severity, payload, source_kind, source_id, deep_link,
          requires_biometric, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING *`,
      input.org_id, input.connected_user_id,
      input.title, input.summary ?? null, input.rationale ?? null,
      severity, JSON.stringify(input.payload ?? {}),
      input.source_kind ?? null, input.source_id ?? null,
      input.deep_link ?? null, requiresBiometric,
      input.expires_at ?? null,
    );
    if (!row) throw new Error('Failed to create checkpoint');
    const checkpoint = rowToCheckpoint(row);

    // Fire push (no confidential content in payload — only id + severity)
    const pushPayload: PushPayload = {
      title: titleFor(severity),
      event_id: checkpoint.id,
      severity,
      category: 'approval',
      deep_link: `/approvals/${checkpoint.id}`,
    };
    pushService.dispatch(input.connected_user_id, pushPayload).catch(err => {
      console.warn('[checkpoint] push dispatch failed:', err instanceof Error ? err.message : err);
    });

    return checkpoint;
  }

  async function listPending(connectedUserId: string, opts?: { orgId?: string; limit?: number }): Promise<CheckpointRow[]> {
    const limit = Math.min(opts?.limit ?? 100, 500);
    const params: unknown[] = [connectedUserId];
    let where = `connected_user_id = ? AND status = 'pending' AND (expires_at IS NULL OR expires_at > NOW())`;
    if (opts?.orgId) { where += ` AND org_id = ?`; params.push(opts.orgId); }
    params.push(limit);
    const rows = await db.all<Record<string, unknown>>(
      `SELECT * FROM app_checkpoints WHERE ${where} ORDER BY
         CASE severity
           WHEN 'critical' THEN 0
           WHEN 'high' THEN 1
           WHEN 'normal' THEN 2
           WHEN 'low' THEN 3
         END,
         created_at DESC
       LIMIT ?`,
      ...params,
    );
    return rows.map(rowToCheckpoint);
  }

  async function get(id: string, connectedUserId: string): Promise<CheckpointRow | null> {
    const row = await db.get<Record<string, unknown>>(
      `SELECT * FROM app_checkpoints WHERE id = ? AND connected_user_id = ?`,
      id, connectedUserId,
    );
    return row ? rowToCheckpoint(row) : null;
  }

  async function respond(id: string, connectedUserId: string, deviceId: string | null, input: RespondInput): Promise<CheckpointRow> {
    const existing = await get(id, connectedUserId);
    if (!existing) throw new Error('Checkpoint not found');
    if (existing.status !== 'pending') throw new Error(`Checkpoint already ${existing.status}`);
    if (existing.expires_at && new Date(existing.expires_at) < new Date()) {
      throw new Error('Checkpoint has expired');
    }
    if (existing.requires_biometric && !input.biometric_confirmed) {
      throw new Error('Biometric confirmation required for this checkpoint');
    }

    const response = {
      decision: input.decision,
      note: input.note ?? null,
      modification: input.modification ?? null,
      biometric_confirmed: !!input.biometric_confirmed,
    };
    const row = await db.get<Record<string, unknown>>(
      `UPDATE app_checkpoints
          SET status = ?,
              response = ?,
              responded_at = NOW(),
              responded_device_id = ?,
              updated_at = NOW()
        WHERE id = ? AND connected_user_id = ? AND status = 'pending'
        RETURNING *`,
      input.decision, JSON.stringify(response), deviceId, id, connectedUserId,
    );
    if (!row) throw new Error('Checkpoint already responded to');
    return rowToCheckpoint(row);
  }

  async function expireOverdue(): Promise<number> {
    const r = await db.run(
      `UPDATE app_checkpoints
          SET status = 'expired', updated_at = NOW()
        WHERE status = 'pending'
          AND expires_at IS NOT NULL
          AND expires_at < NOW()`,
    );
    return r?.changes ?? 0;
  }

  return { create, listPending, get, respond, expireOverdue };
}

export type AppCheckpointService = ReturnType<typeof createAppCheckpointService>;

// ── Helpers ──────────────────────────────────────────────────────────────

function titleFor(severity: CheckpointSeverity): string {
  switch (severity) {
    case 'critical': return 'Critical approval needed';
    case 'high':     return 'Approval needed';
    case 'normal':   return 'Action requested';
    case 'low':      return 'For your review';
  }
}
