/**
 * checkpoints.ts — pending approvals client API per spec §8.6.
 */

import { activeServerBase, activeAuthHeaders, getActiveInstance } from './instances';

export type CheckpointSeverity = 'low' | 'normal' | 'high' | 'critical';
export type CheckpointStatus = 'pending' | 'approved' | 'rejected' | 'modified' | 'expired';

export interface Checkpoint {
  id: string;
  org_id: string;
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
  responded_at: string | null;
  created_at: string;
  updated_at: string;
}

async function authedFetch(path: string, init?: RequestInit): Promise<Response> {
  const base = activeServerBase();
  const headers = await activeAuthHeaders();
  return fetch(`${base}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...headers, ...(init?.headers as Record<string, string> ?? {}) },
  });
}

export async function listPendingCheckpoints(opts?: { orgId?: string; limit?: number }): Promise<Checkpoint[]> {
  const params = new URLSearchParams();
  if (opts?.orgId) params.set('orgId', opts.orgId);
  if (opts?.limit) params.set('limit', String(opts.limit));
  const q = params.toString() ? `?${params.toString()}` : '';
  const res = await authedFetch(`/api/app/checkpoints${q}`);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to load checkpoints');
  return ((await res.json()).checkpoints ?? []) as Checkpoint[];
}

export async function getCheckpoint(id: string): Promise<Checkpoint> {
  const res = await authedFetch(`/api/app/checkpoints/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to load checkpoint');
  return ((await res.json()).checkpoint) as Checkpoint;
}

export async function respondToCheckpoint(id: string, input: {
  decision: 'approved' | 'rejected' | 'modified';
  note?: string;
  modification?: Record<string, unknown>;
  biometric_confirmed?: boolean;
}): Promise<Checkpoint> {
  const inst = getActiveInstance();
  const res = await authedFetch(`/api/app/checkpoints/${encodeURIComponent(id)}/respond`, {
    method: 'POST',
    body: JSON.stringify({
      ...input,
      device_id: inst?.device_id,
    }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to respond');
  return ((await res.json()).checkpoint) as Checkpoint;
}
