/**
 * REST API client for the companion app gateway.
 */

// For Play Store app: use stored server URL. For PWA/dev: use relative path (proxy handles it).
function getApiBase(): string {
  const storedServer = localStorage.getItem('anton-companion-server');
  if (storedServer) return `${storedServer}/api/app`;
  return '/api/app';
}

const API_BASE_DEFAULT = '/api/app';
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
