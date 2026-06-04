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

/** Cache ONLY a granted result — a denied/dismissed permission must be
 *  re-promptable on the next open (caching `false` would wedge location
 *  sharing off until a full app reload). */
let permissionGranted = false;
const activeShares = new Map<string, { stop: () => void; liveUntil: string; peerContactHash: string }>();
let appStateListener: { remove: () => Promise<void> } | null = null;
type LiveShareListener = (parentMsgId: string, state: 'started' | 'paused' | 'resumed' | 'stopped') => void;
const stateListeners = new Set<LiveShareListener>();

async function loadPlugin(): Promise<LivePlugin | null> {
  // Web has navigator.geolocation; only pull in the Capacitor plugin
  // when running on a native shell (it does extra runtime perm work).
  if (Capacitor.getPlatform() === 'web') return null;
  // Prefer the already-registered native plugin. The dynamic
  // import('@capacitor/geolocation') was observed to NEVER resolve on device
  // (its lazy chunk load hung), which wedged ensureGeoPermission() and left
  // the location picker stuck on "Locating…" forever. The plugin is already
  // on window.Capacitor.Plugins (registered at boot), so use it directly.
  const reg = (window as unknown as { Capacitor?: { Plugins?: { Geolocation?: LivePlugin } } })
    .Capacitor?.Plugins?.Geolocation;
  if (reg) return reg;
  try {
    const mod = await import('@capacitor/geolocation');
    return mod.Geolocation as unknown as LivePlugin;
  } catch {
    return null;
  }
}

export async function ensureGeoPermission(): Promise<boolean> {
  if (permissionGranted) return true;
  const plugin = await loadPlugin();
  if (!plugin) {
    // Web — permission is requested implicitly on first getCurrentPosition.
    return true;
  }
  try {
    const cur = await plugin.checkPermissions();
    if (cur.location === 'granted' || cur.coarseLocation === 'granted') { permissionGranted = true; return true; }
    const req = await plugin.requestPermissions({ permissions: ['location', 'coarseLocation'] });
    const ok = req.location === 'granted' || req.coarseLocation === 'granted';
    if (ok) permissionGranted = true; // only cache success — a denial stays re-promptable
    return ok;
  } catch {
    return false;
  }
}

/** Settle `p` within `ms`, else reject — the native Android getCurrentPosition
 *  can hang indefinitely waiting for a high-accuracy GPS fix indoors (its own
 *  `timeout` option is unreliable), which left the picker stuck on "Locating…"
 *  with no error and no way out. This JS-level guard makes the call ALWAYS
 *  settle. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    p.then((v) => { clearTimeout(timer); resolve(v); },
           (e) => { clearTimeout(timer); reject(e); });
  });
}

export async function getCurrentPosition(): Promise<GeoFix> {
  const plugin = await loadPlugin();
  if (plugin) {
    // Try a high-accuracy GPS fix first, but cap it with a JS timeout; if that
    // doesn't land (indoors / cold GPS), fall back to a fast coarse/network fix
    // (which resolves in seconds and accepts a cached position). Either way the
    // promise settles — the picker never hangs on "Locating…".
    let p: { coords: { latitude: number; longitude: number; accuracy: number } };
    try {
      p = await withTimeout(
        plugin.getCurrentPosition({ enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }),
        8000,
      );
    } catch {
      p = await withTimeout(
        plugin.getCurrentPosition({ enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }),
        9000,
      );
    }
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
