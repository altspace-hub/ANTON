/**
 * checkpoints.ts — pending approvals client API per spec §8.6.
 */

import { activeServerBase, activeAuthHeaders, getActiveInstance } from './instances';
import { hasPrivateKey, signEnvelope } from './identity';

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
  const innerBody = { ...input, device_id: inst?.device_id };
  // Phase H fix C1 — wrap in a signed envelope when an Ed25519 keypair
  // exists on this device. Server verifies the signature and records the
  // nonce to prevent replay. Falls back to a raw body for legacy
  // register-simple paired clients (still session-token gated).
  let body: unknown = innerBody;
  if (await hasPrivateKey()) {
    try {
      const env = await signEnvelope(innerBody);
      body = { envelope: env };
    } catch { /* fall back to raw body */ }
  }
  const res = await authedFetch(`/api/app/checkpoints/${encodeURIComponent(id)}/respond`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to respond');
  return ((await res.json()).checkpoint) as Checkpoint;
}
