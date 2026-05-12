/**
 * geo.ts — wrap @capacitor/geolocation for the Comm App.
 *
 * One-shot: getCurrentPosition() returns { lat, lng, accuracyM }.
 * Live-share: startLiveShare(peer, parentMsgId, durationMin) polls every
 * 15s and dispatches sendLocationUpdate until the duration elapses or
 * stopLiveShare(parentMsgId) is called. Multiple concurrent shares
 * tracked in a registry keyed by parentMsgId.
 */
import { Capacitor } from '@capacitor/core';
import { sendLocationUpdate } from './chat';

export interface GeoFix { lat: number; lng: number; accuracyM: number; ts: string; }

interface LivePlugin {
  getCurrentPosition: (opts: { enableHighAccuracy?: boolean; timeout?: number; maximumAge?: number }) => Promise<{ coords: { latitude: number; longitude: number; accuracy: number } }>;
  checkPermissions: () => Promise<{ location: string; coarseLocation?: string }>;
  requestPermissions: (opts?: { permissions: Array<'location' | 'coarseLocation'> }) => Promise<{ location: string; coarseLocation?: string }>;
}

let permissionPromise: Promise<boolean> | null = null;
const activeShares = new Map<string, { stop: () => void; liveUntil: string; peerContactHash: string }>();
let appStateListener: { remove: () => Promise<void> } | null = null;
type LiveShareListener = (parentMsgId: string, state: 'started' | 'paused' | 'resumed' | 'stopped') => void;
const stateListeners = new Set<LiveShareListener>();

async function loadPlugin(): Promise<LivePlugin | null> {
  // Web has navigator.geolocation; only pull in the Capacitor plugin
  // when running on a native shell (it does extra runtime perm work).
  if (Capacitor.getPlatform() === 'web') return null;
  try {
    const mod = await import('@capacitor/geolocation');
    return mod.Geolocation as unknown as LivePlugin;
  } catch {
    return null;
  }
}

export async function ensureGeoPermission(): Promise<boolean> {
  if (permissionPromise) return permissionPromise;
  permissionPromise = (async () => {
    const plugin = await loadPlugin();
    if (!plugin) {
      // Web — permission is requested implicitly on first getCurrentPosition.
      return true;
    }
    try {
      const cur = await plugin.checkPermissions();
      if (cur.location === 'granted' || cur.coarseLocation === 'granted') return true;
      const req = await plugin.requestPermissions({ permissions: ['location', 'coarseLocation'] });
      return req.location === 'granted' || req.coarseLocation === 'granted';
    } catch {
      return false;
    }
  })();
  return permissionPromise;
}

export async function getCurrentPosition(): Promise<GeoFix> {
  const plugin = await loadPlugin();
  if (plugin) {
    const p = await plugin.getCurrentPosition({ enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
    return {
      lat: p.coords.latitude,
      lng: p.coords.longitude,
      accuracyM: p.coords.accuracy,
      ts: new Date().toISOString(),
    };
  }
  // Web fallback
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    throw new Error('Geolocation not available');
  }
  return new Promise<GeoFix>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracyM: pos.coords.accuracy,
        ts: new Date().toISOString(),
      }),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  });
}

/**
 * R13 — start a live-share that pushes the user's fix every 15s to a
 * peer's chat. Stops automatically at `liveUntil` or when
 * `stopLiveShare(parentMsgId)` is called.
 *
 * Caller is responsible for first sending the initial `location`
 * bubble (so the parentMsgId exists) — this helper only drives the
 * subsequent `location_update` wires.
 */
export function startLiveShare(
  peerContactHash: string,
  parentMsgId: string,
  liveUntilIso: string,
): { stop: () => void } {
  stopLiveShare(parentMsgId); // dedupe

  const intervalMs = 15_000;
  const handle = { stopped: false };

  async function tick() {
    if (handle.stopped) return;
    if (new Date().toISOString() >= liveUntilIso) {
      stopLiveShare(parentMsgId);
      emitState(parentMsgId, 'stopped');
      return;
    }
    try {
      const fix = await getCurrentPosition();
      await sendLocationUpdate(peerContactHash, parentMsgId, {
        lat: fix.lat, lng: fix.lng, accuracyM: fix.accuracyM,
      });
    } catch (err) {
      console.warn('[geo] live tick failed', err);
    }
  }

  const t = setInterval(() => void tick(), intervalMs);
  const entry = {
    stop: () => { handle.stopped = true; clearInterval(t); activeShares.delete(parentMsgId); },
    liveUntil: liveUntilIso,
    peerContactHash,
  };
  activeShares.set(parentMsgId, entry);
  emitState(parentMsgId, 'started');
  // Set up the app-state listener once. When the app backgrounds, the
  // JS setInterval will be throttled or paused by Android Doze — we mark
  // the share as paused so the UI can warn the user, and emit no tick.
  void ensureAppStateListener();
  return { stop: entry.stop };
}

let appBackgrounded = false;

async function ensureAppStateListener(): Promise<void> {
  if (appStateListener) return;
  if (Capacitor.getPlatform() === 'web') return;
  try {
    const mod = await import('@capacitor/app');
    appStateListener = await mod.App.addListener('appStateChange', (state) => {
      const wasBackgrounded = appBackgrounded;
      appBackgrounded = !state.isActive;
      // On background: tell every active share's listener to render the
      // "paused" banner. On foreground: ask listeners to re-render fresh.
      if (appBackgrounded && !wasBackgrounded) {
        for (const id of activeShares.keys()) emitState(id, 'paused');
      }
      if (!appBackgrounded && wasBackgrounded) {
        for (const id of activeShares.keys()) emitState(id, 'resumed');
      }
    });
  } catch {
    /* not native; ignore */
  }
}

export function isAppBackgrounded(): boolean { return appBackgrounded; }

export function subscribeLiveShareState(listener: LiveShareListener): () => void {
  stateListeners.add(listener);
  return () => { stateListeners.delete(listener); };
}

function emitState(parentMsgId: string, state: 'started' | 'paused' | 'resumed' | 'stopped'): void {
  for (const l of stateListeners) {
    try { l(parentMsgId, state); } catch { /* ignore listener errors */ }
  }
}

export function stopLiveShare(parentMsgId: string): void {
  const entry = activeShares.get(parentMsgId);
  if (!entry) return;
  entry.stop();
  emitState(parentMsgId, 'stopped');
}

/** Stop every active share. Called from clearIdentity / sign-out so a
 *  signed-out tab doesn't keep firing GPS polls under the old identity. */
export function stopAllLiveShares(): void {
  for (const id of Array.from(activeShares.keys())) stopLiveShare(id);
  if (appStateListener) {
    void appStateListener.remove().catch(() => {});
    appStateListener = null;
  }
  stateListeners.clear();
  appBackgrounded = false;
}

export function isLiveSharing(parentMsgId: string): boolean {
  return activeShares.has(parentMsgId);
}

/**
 * Resumes live-share tickers for any of the user's outgoing location
 * messages whose liveUntil is still in the future. Called on app boot
 * (mirrors event-reminders.reconcileAllReminders).
 */
export async function reconcileLiveShares(): Promise<void> {
  const { listContacts } = await import('./contacts');
  const { listThread } = await import('./messages');
  const { getIdentity } = await import('./identity');
  const me = getIdentity();
  if (!me) return;
  const contacts = await listContacts();
  const nowIso = new Date().toISOString();
  for (const c of contacts) {
    const thread = await listThread(c.contactHash);
    for (const m of thread) {
      if (m.kind !== 'location' || m.fromHash !== me.contactHash) continue;
      let parsed: { liveUntil?: string } = {};
      try { parsed = JSON.parse(m.plaintext); } catch { /* skip */ }
      if (parsed.liveUntil && parsed.liveUntil > nowIso) {
        startLiveShare(c.contactHash, m.id, parsed.liveUntil);
      }
    }
  }
}
