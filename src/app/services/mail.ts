/**
 * mail.ts — typed companion-app client for /api/app/org/:orgId/mail/*.
 *
 * Backed by app-mail-service.ts on the server. ANTON-native synthetic
 * rows are merged in by the inbox endpoint — clients don't need to
 * know about the difference.
 */

import { activeServerBase, activeAuthHeaders } from './instances';

export type MailProviderKind = 'anton' | 'm365' | 'gmail' | 'imap' | 'exchange';
export type MailProviderStatus = 'active' | 'disconnected' | 'error' | 'pending';

export type AiAction = 'DRAFTED' | 'SUMMARIZED' | 'ARCHIVE?' | 'YOUR ACTION';
export type AiActionTone = 'teal' | 'red' | 'gold' | 'neutral' | 'blue';

export interface MailProvider {
  id: string;
  provider: MailProviderKind;
  display_name: string;
  email_address: string | null;
  status: MailProviderStatus;
  last_sync_at: string | null;
  last_sync_error: string | null;
  unread_count: number;
  is_default: boolean;
  created_at: string;
}

export interface MailMessage {
  id: string;
  provider: MailProviderKind;
  provider_id: string | null;
  thread_id: string | null;
  from_name: string;
  from_email: string | null;
  subject: string;
  preview: string;
  is_read: boolean;
  is_external: boolean;
  ai_action: AiAction | null;
  ai_action_tone: AiActionTone | null;
  received_at: string;
  deep_link: string | null;
}

export interface ProviderConnectInput {
  provider: MailProviderKind;
  display_name?: string;
  email_address?: string;
  oauth_tokens?: Record<string, unknown>;
  imap_config?: { host: string; port: number; user: string; password: string; secure?: boolean };
}

async function authedJson<T>(path: string, init?: RequestInit): Promise<T> {
  const base = activeServerBase();
  const headers = await activeAuthHeaders();
  const r = await fetch(`${base}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...headers, ...(init?.headers as Record<string, string> ?? {}) },
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
  return r.json() as Promise<T>;
}

export async function listMailProviders(orgId: string): Promise<MailProvider[]> {
  const data = await authedJson<{ providers: MailProvider[] }>(
    `/api/app/org/${encodeURIComponent(orgId)}/mail/providers`
  );
  return data.providers ?? [];
}

export async function connectMailProvider(orgId: string, input: ProviderConnectInput): Promise<MailProvider> {
  const data = await authedJson<{ provider: MailProvider }>(
    `/api/app/org/${encodeURIComponent(orgId)}/mail/providers`,
    { method: 'POST', body: JSON.stringify(input) }
  );
  return data.provider;
}

export async function disconnectMailProvider(orgId: string, providerId: string): Promise<void> {
  await authedJson<{ ok: true }>(
    `/api/app/org/${encodeURIComponent(orgId)}/mail/providers/${encodeURIComponent(providerId)}`,
    { method: 'DELETE' }
  );
}

export async function syncMailProvider(orgId: string, providerId: string): Promise<{ ok: boolean; message: string }> {
  const base = activeServerBase();
  const headers = await activeAuthHeaders();
  const r = await fetch(
    `${base}/api/app/org/${encodeURIComponent(orgId)}/mail/providers/${encodeURIComponent(providerId)}/sync`,
    { method: 'POST', headers }
  );
  // 503 carries a friendly TODO message — also a valid response shape
  return r.json() as Promise<{ ok: boolean; message: string }>;
}

export async function listMailInbox(
  orgId: string,
  opts?: { provider?: MailProviderKind | 'all'; limit?: number }
): Promise<MailMessage[]> {
  const params = new URLSearchParams();
  if (opts?.provider && opts.provider !== 'all') params.set('provider', opts.provider);
  if (opts?.limit) params.set('limit', String(opts.limit));
  const q = params.toString() ? `?${params.toString()}` : '';
  const data = await authedJson<{ messages: MailMessage[] }>(
    `/api/app/org/${encodeURIComponent(orgId)}/mail/inbox${q}`
  );
  return data.messages ?? [];
}

/** Compact relative time for inbox rows ("9:10", "Yst", "Mon", "12 Apr") */
export function inboxTime(iso: string): string {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return '';
  const now = new Date();
  const sameDay = t.toDateString() === now.toDateString();
  if (sameDay) return t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (t.toDateString() === yesterday.toDateString()) return 'Yst';
  const diffDays = Math.floor((now.getTime() - t.getTime()) / 86400000);
  if (diffDays < 7) return t.toLocaleDateString(undefined, { weekday: 'short' });
  return t.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
