/**
 * REST API client for the companion app gateway.
 */

// For Play Store app: use the active instance's server URL or fall back to
// the legacy single stored URL. For PWA/dev served from same origin: use
// the relative path (Vite proxy handles it).
function getApiBase(): string {
  // Prefer the active instance's base if multi-instance is in play
  try {
    const activeId = localStorage.getItem('anton-companion-active-instance');
    if (activeId) {
      const list = JSON.parse(localStorage.getItem('anton-companion-instances') || '[]') as Array<{ id: string; server_base: string }>;
      const inst = list.find(i => i.id === activeId);
      if (inst?.server_base) return `${inst.server_base.replace(/\/$/, '')}/api/app`;
    }
  } catch { /* fall through */ }
  const storedServer = localStorage.getItem('anton-companion-server');
  if (storedServer) return `${storedServer.replace(/\/$/, '')}/api/app`;
  return '/api/app';
}

const SESSION_KEY = 'anton-companion-session';

export function getSessionToken(): string | null {
  return localStorage.getItem(SESSION_KEY);
}

export function saveSessionToken(token: string): void {
  localStorage.setItem(SESSION_KEY, token);
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
}

/** Get auth headers for ANTON main API calls (uses JWT from main app if available) */
export function getAuthHeader(): Record<string, string> {
  const token = localStorage.getItem('openexpert-token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Get auth headers for companion app API calls */
export async function fetchWithAuth(path: string, init?: RequestInit): Promise<Response> {
  const base = getApiBase();
  const token = getSessionToken();
  const h: Record<string, string> = { ...(init?.headers as Record<string, string> || {}) };
  if (token) h['x-app-session'] = token;
  return fetch(`${base}${path.startsWith('/api/app') ? path.replace('/api/app', '') : path}`, { ...init, headers: h });
}

function headers(extra?: Record<string, string>): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json', ...extra };
  const token = getSessionToken();
  if (token) h['x-app-session'] = token;
  return h;
}

// ── Auth ──────────────────────────────────────────────────────────

export async function register(publicKey: string, displayName: string, preferredLanguage: string) {
  const res = await fetch(`${getApiBase()}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ publicKey, displayName, preferredLanguage }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Registration failed');
  return res.json() as Promise<{ id: string; contactHash: string }>;
}

/** Simplified registration — no Ed25519 needed. Works over HTTP/LAN. */
export async function registerSimple(displayName: string, preferredLanguage: string) {
  // Production: no PII logging
  const res = await fetch(`${getApiBase()}/register-simple`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName, preferredLanguage }),
  });
  // debug: console.log('[api] Response status:', res.status);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    // debug: console.error('[api] Error body:', body);
    let errorMsg = 'Registration failed';
    try { errorMsg = JSON.parse(body).error || errorMsg; } catch {}
    throw new Error(errorMsg);
  }
  return res.json() as Promise<{ id: string; contactHash: string; sessionToken: string }>;
}

export async function joinOrg(contactHash: string, invitationToken: string) {
  const res = await fetch(`${getApiBase()}/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contactHash, invitationToken }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Join failed');
  return res.json() as Promise<{ orgId: string; orgName: string }>;
}

export async function authChallenge(contactHash: string) {
  const res = await fetch(`${getApiBase()}/auth/challenge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contactHash }),
  });
  if (!res.ok) throw new Error('Authentication failed');
  return res.json() as Promise<{ nonce: string }>;
}

export async function authVerify(contactHash: string, nonce: string, signature: string) {
  const res = await fetch(`${getApiBase()}/auth/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contactHash, nonce, signature }),
  });
  if (!res.ok) throw new Error('Authentication failed');
  return res.json() as Promise<{
    sessionToken: string;
    expiresAt: string;
    user: { id: string; contactHash: string; displayName: string | null };
  }>;
}

// ── Authenticated endpoints ───────────────────────────────────────

export async function getConnections() {
  const res = await fetch(`${getApiBase()}/connections`, { headers: headers() });
  if (!res.ok) throw new Error('Failed to load connections');
  return res.json() as Promise<Array<{
    id: string; name: string; org_type: string; description: string | null;
    welcome_message: string | null; role: string; joined_at: string;
  }>>;
}

export async function getOrgProfile(orgId: string) {
  const res = await fetch(`${getApiBase()}/org/${orgId}/profile`, { headers: headers() });
  if (!res.ok) throw new Error('Failed to load org');
  return res.json();
}

export async function getSessions(orgId: string) {
  const res = await fetch(`${getApiBase()}/org/${orgId}/sessions`, { headers: headers() });
  if (!res.ok) throw new Error('Failed to load sessions');
  return res.json();
}

export async function getSessionDetail(orgId: string, sessionId: string) {
  const res = await fetch(`${getApiBase()}/org/${orgId}/sessions/${sessionId}`, { headers: headers() });
  if (!res.ok) throw new Error('Failed to load session');
  return res.json();
}

export async function getProfile() {
  const res = await fetch(`${getApiBase()}/profile`, { headers: headers() });
  if (!res.ok) throw new Error('Failed to load profile');
  return res.json();
}

export async function updateProfile(data: { display_name?: string; preferred_language?: string }) {
  const res = await fetch(`${getApiBase()}/profile`, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update profile');
  return res.json();
}

export async function getLanguages() {
  const res = await fetch(`${getApiBase()}/languages`);
  return res.json() as Promise<Record<string, string>>;
}

// ── Tasks ────────────────────────────────────────────────────────
export async function getOrgTasks(orgId: string, opts?: { status?: string; limit?: number }) {
  const qs = new URLSearchParams();
  if (opts?.status) qs.set('status', opts.status);
  if (opts?.limit) qs.set('limit', String(opts.limit));
  const url = `${getApiBase()}/org/${orgId}/tasks${qs.toString() ? `?${qs}` : ''}`;
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) throw new Error('Failed to load tasks');
  return res.json() as Promise<{ tasks: Array<Record<string, unknown>>; total: number }>;
}

export async function createOrgTask(orgId: string, body: { title: string; description?: string; priority?: string; due_date?: string }) {
  const res = await fetch(`${getApiBase()}/org/${orgId}/tasks`, {
    method: 'POST', headers: headers(), body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('Failed to create task');
  return res.json() as Promise<{ task: Record<string, unknown> }>;
}

// ── Schedule ─────────────────────────────────────────────────────
export async function getOrgMorningBrief(orgId: string) {
  const res = await fetch(`${getApiBase()}/org/${orgId}/deadlines/morning-brief`, { headers: headers() });
  if (!res.ok) throw new Error('Failed to load schedule');
  return res.json() as Promise<{ overdue?: unknown[]; atRisk?: unknown[]; upcoming?: unknown[] }>;
}

// ── Daily brief (AI Orchestrator) ───────────────────────────────
export interface DailyBrief {
  id: string;
  period: 'heartbeat' | 'daily' | 'weekly' | 'on_demand';
  signals_read: number;
  proposals_count: number;
  content: string;
  status: 'unread' | 'read' | 'actioned' | 'dismissed';
  created_at: string;
}

export async function getOrgDailyBrief(orgId: string): Promise<{ brief: DailyBrief | null }> {
  const res = await fetch(`${getApiBase()}/org/${orgId}/home/brief`, { headers: headers() });
  if (!res.ok) throw new Error('Failed to load brief');
  return res.json() as Promise<{ brief: DailyBrief | null }>;
}

// ── Missions ────────────────────────────────────────────────────
export interface MissionSummary {
  id: string;
  title: string;
  description: string | null;
  status: 'draft' | 'briefed' | 'active' | 'paused' | 'review' | 'completed' | 'aborted';
  task_total: number;
  task_done: number;
  created_at: string;
  updated_at: string;
}

export interface MissionTask {
  id: string;
  title: string;
  description: string | null;
  status: string;
  order_index: number;
  created_at: string;
}

export async function getOrgMissions(orgId: string): Promise<{ missions: MissionSummary[] }> {
  const res = await fetch(`${getApiBase()}/org/${orgId}/missions`, { headers: headers() });
  if (!res.ok) throw new Error('Failed to load missions');
  return res.json() as Promise<{ missions: MissionSummary[] }>;
}

export async function getOrgMissionDetail(orgId: string, missionId: string): Promise<{
  mission: Record<string, unknown>; tasks: MissionTask[];
}> {
  const res = await fetch(`${getApiBase()}/org/${orgId}/missions/${missionId}`, { headers: headers() });
  if (!res.ok) throw new Error('Failed to load mission');
  return res.json() as Promise<{ mission: Record<string, unknown>; tasks: MissionTask[] }>;
}

export async function missionAction(orgId: string, missionId: string, action: 'pause' | 'resume' | 'abort'): Promise<{ ok: boolean; status: string }> {
  const res = await fetch(`${getApiBase()}/org/${orgId}/missions/${missionId}/${action}`, {
    method: 'POST', headers: headers(),
  });
  if (!res.ok) throw new Error(`Failed to ${action} mission`);
  return res.json() as Promise<{ ok: boolean; status: string }>;
}

// ── My Work (sessions browse) ───────────────────────────────────
export interface WorkSession {
  id: string;
  title: string | null;
  module_id: string | null;
  note: string | null;
  message_count: number | null;
  total_tokens: number | null;
  created_at: string;
  updated_at: string;
}

export async function getOrgWork(orgId: string, opts?: {
  q?: string; module?: string; since?: 'today' | 'week' | 'month' | 'all'; limit?: number;
}): Promise<{ sessions: WorkSession[] }> {
  const qs = new URLSearchParams();
  if (opts?.q) qs.set('q', opts.q);
  if (opts?.module) qs.set('module', opts.module);
  if (opts?.since) qs.set('since', opts.since);
  if (opts?.limit) qs.set('limit', String(opts.limit));
  const url = `${getApiBase()}/org/${orgId}/work${qs.toString() ? `?${qs}` : ''}`;
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) throw new Error('Failed to load work');
  return res.json() as Promise<{ sessions: WorkSession[] }>;
}

// ── Wallet ───────────────────────────────────────────────────────
export async function getOrgWallet(orgId: string, limit = 20) {
  const res = await fetch(`${getApiBase()}/org/${orgId}/wallet?limit=${limit}`, { headers: headers() });
  if (!res.ok) throw new Error('Failed to load wallet');
  return res.json() as Promise<{ wallets: Array<Record<string, unknown>>; transactions: Array<Record<string, unknown>> }>;
}

// ── Portals (visitor view) ──────────────────────────────────────
export interface PortalSummary {
  id: string;
  name: string;
  display_title: string | null;
  description: string | null;
  category: string | null;
  status: string;
  public_index: boolean;
  surface_mode: string | null;
  external_primary_url: string | null;
  created_at: string;
}

export async function discoverPortals(orgId: string, query?: string): Promise<{ portals: PortalSummary[]; query: string }> {
  const qs = query && query.trim() ? `?q=${encodeURIComponent(query.trim())}` : '';
  const res = await fetch(`${getApiBase()}/org/${orgId}/portals/discover${qs}`, { headers: headers() });
  if (!res.ok) throw new Error('Failed to load portals');
  return res.json() as Promise<{ portals: PortalSummary[]; query: string }>;
}

// ── Community ────────────────────────────────────────────────────
export interface CommunityIdentity {
  contact_hash: string | null;
  display_name: string | null;
  public_key: string | null;
  activated_at: string | null;
}

export interface CommunityConnection {
  id: string;
  contact_hash: string;
  display_name: string | null;
  status: 'pending' | 'accepted';
  connected_at: string;
}

export async function getOrgCommunity(orgId: string): Promise<{
  identity: CommunityIdentity | null;
  connections: CommunityConnection[];
}> {
  const res = await fetch(`${getApiBase()}/org/${orgId}/community`, { headers: headers() });
  if (!res.ok) throw new Error('Failed to load community');
  return res.json() as Promise<{ identity: CommunityIdentity | null; connections: CommunityConnection[] }>;
}

// ── Community: QR + chat ────────────────────────────────────────
export interface CommunityQr {
  qrDataUrl: string;
  contactHash: string;
  displayName: string | null;
  payload: string;
}

export async function getOrgCommunityQr(orgId: string): Promise<CommunityQr> {
  const res = await fetch(`${getApiBase()}/org/${orgId}/community/qr`, { headers: headers() });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error || 'Failed to generate QR');
  }
  return res.json() as Promise<CommunityQr>;
}

export interface CommunityScannedConnection {
  id: string;
  contact_hash: string;
  display_name: string | null;
  status: string;
  connected_at: string;
}

export async function scanCommunityContact(orgId: string, payload: string): Promise<{ connection: CommunityScannedConnection | null }> {
  const res = await fetch(`${getApiBase()}/org/${orgId}/community/connections/scan`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ payload }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error || 'Failed to add contact');
  }
  return res.json() as Promise<{ connection: CommunityScannedConnection | null }>;
}

export async function respondToConnection(orgId: string, connId: string, decision: 'accept' | 'decline'): Promise<{ ok: boolean; status: string }> {
  const res = await fetch(`${getApiBase()}/org/${orgId}/community/connections/${connId}/respond`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ decision }),
  });
  if (!res.ok) throw new Error('Failed to update connection');
  return res.json() as Promise<{ ok: boolean; status: string }>;
}

export interface CommunityMessage {
  id: string;
  from_hash: string;
  is_me: boolean;
  subject: string | null;
  body: string | null;
  timestamp: string;
}

export async function getCommunityMessages(orgId: string, withHash: string): Promise<{
  me: string; with: string; messages: CommunityMessage[];
}> {
  const url = `${getApiBase()}/org/${orgId}/community/messages?with=${encodeURIComponent(withHash)}`;
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) throw new Error('Failed to load messages');
  return res.json() as Promise<{ me: string; with: string; messages: CommunityMessage[] }>;
}

export async function sendCommunityMessage(orgId: string, to: string, body: string): Promise<{ id: string; sent_at: string }> {
  const res = await fetch(`${getApiBase()}/org/${orgId}/community/messages`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ to, body }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error || 'Failed to send message');
  }
  return res.json() as Promise<{ id: string; sent_at: string }>;
}
