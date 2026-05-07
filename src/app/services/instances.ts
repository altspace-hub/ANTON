/**
 * instances.ts — multi-instance store per spec §4.2 + §8.9.
 *
 * One record per paired ANTON instance. The "active" instance is the one
 * the rest of the app talks to; switching it rebinds api.ts + socket.ts
 * + push.ts on the next call.
 *
 * Persistent in localStorage (non-secret — only endpoints + names + last
 * sync timestamps live here). The actual session token + device cert
 * live in secure storage keyed by instance id.
 */

import { setSecure, getSecure, removeSecure } from './secure-store';

/**
 * How this paired instance is reached. See docs/ANTON_MESH_SPEC.md.
 *   - 'public_https': direct HTTPS to server_base / endpoints (current default)
 *   - 'mesh':         Noise-IK over relay (Phase 4+; field accepted earlier so
 *                     records survive a future schema flip without re-pairing)
 *
 * Treat absent / unknown as 'public_https' — every existing pairing pre-dates
 * this field and must continue to work without migration.
 */
export type TransportKind = 'public_https' | 'mesh';

export interface Instance {
  id: string;                       // local-only uuid
  display_name: string;             // user-visible name
  contact_hash: string | null;      // ANTON-XXXX-XXXX-XXXX-XXXX
  server_base: string;              // canonical https / lan URL the app talks to (public_https only)
  endpoints: { lan?: string; wan?: string; mdns_name?: string };
  /** Which transport adapter the app uses for this instance. Default 'public_https'. */
  transport?: TransportKind;
  /** Ranked WSS relay URLs. Required when transport === 'mesh', ignored otherwise. */
  relay_endpoints?: string[];
  device_id: string;                // server-issued device id
  pubkey_pinned: string;            // instance Ed25519 pubkey we trust
  cert_fp_pinned: string | null;    // TLS cert fingerprint we trust
  org: { id: string; name: string; role: string } | null;
  paired_at: string;                // ISO
  last_sync_at: string | null;      // ISO
  last_status: 'online' | 'offline' | 'unknown';
  /** Which endpoint the most recent successful ping reached. null when offline. */
  last_transport: 'lan' | 'wan' | null;
  notification_categories: string[]; // ['approval', 'radar', 'mission_complete']
  default_voice_language: string | null;
}

/** Resolve the effective transport for an Instance, defaulting to 'public_https'
 *  when the field is absent on a pre-mesh-era pairing. */
export function effectiveTransport(inst: Instance | null): TransportKind {
  return inst?.transport === 'mesh' ? 'mesh' : 'public_https';
}

const KEY_INSTANCES = 'anton-companion-instances';
const KEY_ACTIVE = 'anton-companion-active-instance';

function load(): Instance[] {
  try { return JSON.parse(localStorage.getItem(KEY_INSTANCES) || '[]'); }
  catch { return []; }
}

function save(list: Instance[]): void {
  localStorage.setItem(KEY_INSTANCES, JSON.stringify(list));
}

// ── Public API ──────────────────────────────────────────────────────────

export function listInstances(): Instance[] {
  return load();
}

export function getInstance(id: string): Instance | null {
  return load().find(i => i.id === id) ?? null;
}

export function getActiveInstanceId(): string | null {
  return localStorage.getItem(KEY_ACTIVE);
}

export function getActiveInstance(): Instance | null {
  const id = getActiveInstanceId();
  if (!id) return null;
  return getInstance(id);
}

/**
 * setActiveInstance — synchronous fast path. Use setActiveInstanceAsync()
 * when you need the per-instance session token mirrored *before* the
 * next API call fires (Phase H fix Arch 2 — race window between switch
 * and notify could leak the prior instance's session token to a request
 * routed at the new instance's server_base).
 */
export function setActiveInstance(id: string): void {
  if (!getInstance(id)) throw new Error('Unknown instance');
  localStorage.setItem(KEY_ACTIVE, id);
  void getInstanceSessionToken(id).then(tok => {
    if (tok) localStorage.setItem('anton-companion-session', tok);
    else localStorage.removeItem('anton-companion-session');
  }).catch(() => { /* swallow */ });
  for (const cb of activeListeners) cb(id);
}

/**
 * setActiveInstanceAsync — race-free variant that awaits the secure-store
 * read AND completes the localStorage bridge write *before* notifying
 * listeners. Use from instance-switcher UIs so any subscriber's
 * getSessionToken() read sees the new instance's token.
 */
export async function setActiveInstanceAsync(id: string): Promise<void> {
  if (!getInstance(id)) throw new Error('Unknown instance');
  const tok = await getInstanceSessionToken(id);
  // Atomic: write active id + session bridge in one sync block, THEN notify.
  localStorage.setItem(KEY_ACTIVE, id);
  if (tok) localStorage.setItem('anton-companion-session', tok);
  else localStorage.removeItem('anton-companion-session');
  for (const cb of activeListeners) cb(id);
}

const activeListeners = new Set<(id: string) => void>();
export function onActiveInstanceChange(cb: (id: string) => void): () => void {
  activeListeners.add(cb);
  return () => activeListeners.delete(cb);
}

export async function addInstance(input: Omit<Instance, 'id' | 'paired_at' | 'last_sync_at' | 'last_status' | 'last_transport' | 'notification_categories' | 'default_voice_language'> & {
  session_token: string;
  device_certificate: string;
}): Promise<Instance> {
  const id = crypto.randomUUID();
  const list = load();
  const inst: Instance = {
    id,
    display_name: input.display_name,
    contact_hash: input.contact_hash,
    server_base: input.server_base,
    endpoints: input.endpoints,
    transport: input.transport,
    relay_endpoints: input.relay_endpoints,
    device_id: input.device_id,
    pubkey_pinned: input.pubkey_pinned,
    cert_fp_pinned: input.cert_fp_pinned,
    org: input.org,
    paired_at: new Date().toISOString(),
    last_sync_at: null,
    last_status: 'unknown',
    last_transport: null,
    notification_categories: ['approval'],   // approvals on by default
    default_voice_language: null,
  };
  list.push(inst);
  save(list);
  // Persist secrets in secure store, keyed by instance id
  await setSecure(`session:${id}`, input.session_token);
  await setSecure(`devcert:${id}`, input.device_certificate);
  if (list.length === 1) setActiveInstance(id);
  // If this addition is the active instance, also bridge the session token now
  // (synchronous mirror so the next API call reads it without awaiting).
  if (getActiveInstanceId() === id && input.session_token) {
    localStorage.setItem('anton-companion-session', input.session_token);
  }
  return inst;
}

export async function getInstanceSessionToken(id: string): Promise<string | null> {
  return getSecure(`session:${id}`);
}

export async function getInstanceDeviceCert(id: string): Promise<string | null> {
  return getSecure(`devcert:${id}`);
}

export async function removeInstance(id: string): Promise<void> {
  const list = load().filter(i => i.id !== id);
  save(list);
  await removeSecure(`session:${id}`);
  await removeSecure(`devcert:${id}`);
  // If active was removed, pick the next available
  if (getActiveInstanceId() === id) {
    if (list.length > 0) setActiveInstance(list[0].id);
    else localStorage.removeItem(KEY_ACTIVE);
  }
}

export function updateInstance(id: string, patch: Partial<Pick<Instance, 'display_name' | 'last_status' | 'last_transport' | 'last_sync_at' | 'notification_categories' | 'default_voice_language' | 'org' | 'relay_endpoints'>>): void {
  const list = load();
  const idx = list.findIndex(i => i.id === id);
  if (idx < 0) return;
  list[idx] = { ...list[idx], ...patch };
  save(list);
}

/**
 * refreshInstanceInfo — pull canonical instance metadata from the paired
 * server and update the local row. Track C Slice 1: catches relay-list
 * rotations so paired phones don't need to re-pair when the operator points
 * the instance at a new relay (e.g. moving from relay.futurechain.eu to a
 * corporate relay).
 *
 * Returns:
 *  - updated:        any field changed
 *  - relays_changed: relay_endpoints specifically changed (caller may want
 *                    to drop any in-flight mesh connection and reconnect)
 *
 * Lazy-imported clientFetch to avoid an import cycle (api.ts imports from
 * here for active-instance lookup).
 */
export async function refreshInstanceInfo(id: string): Promise<{ updated: boolean; relays_changed: boolean }> {
  const inst = getInstance(id);
  if (!inst) return { updated: false, relays_changed: false };
  try {
    // Use clientFetch so the call routes through whichever transport this
    // instance is paired on (mesh or public_https).
    const { clientFetch } = await import('./api');
    const res = await clientFetch('/instance-info', { method: 'GET' });
    if (!res.ok) return { updated: false, relays_changed: false };
    const info = await res.json() as {
      display_name?: string;
      relay_endpoints?: string[];
    };
    const patch: Partial<Pick<Instance, 'display_name' | 'relay_endpoints'>> = {};
    let relaysChanged = false;
    if (Array.isArray(info.relay_endpoints)) {
      const current = inst.relay_endpoints ?? [];
      const next = info.relay_endpoints;
      const sameLength = current.length === next.length;
      const sameItems = sameLength && current.every((u, i) => u === next[i]);
      if (!sameItems) {
        patch.relay_endpoints = next;
        relaysChanged = true;
      }
    }
    if (typeof info.display_name === 'string' && info.display_name && info.display_name !== inst.display_name) {
      patch.display_name = info.display_name;
    }
    if (Object.keys(patch).length > 0) {
      updateInstance(id, patch);
      return { updated: true, relays_changed: relaysChanged };
    }
    return { updated: false, relays_changed: false };
  } catch {
    // Network errors are non-fatal — phone just keeps its current copy.
    return { updated: false, relays_changed: false };
  }
}

export function markSeen(id: string, status: 'online' | 'offline' = 'online', transport: 'lan' | 'wan' | null = null): void {
  updateInstance(id, {
    last_status: status,
    last_transport: status === 'online' ? transport : null,
    last_sync_at: new Date().toISOString(),
  });
}

// ── Convenience: build the auth headers for the active instance ─────────

export async function activeAuthHeaders(): Promise<Record<string, string>> {
  const inst = getActiveInstance();
  if (!inst) return {};
  const token = await getInstanceSessionToken(inst.id);
  return token ? { 'x-app-session': token } : {};
}

export function activeServerBase(): string {
  const inst = getActiveInstance();
  return inst?.server_base ?? '';
}
