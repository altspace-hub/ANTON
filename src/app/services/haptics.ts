/**
 * haptics.ts — micro-interaction haptics per spec §9.4.
 *
 * Wraps @capacitor/haptics. Web fallback uses navigator.vibrate where
 * available. Always non-blocking — failures are swallowed.
 *
 * Style guide per spec:
 *   - tick():    voice recording start, state transition (medium impact)
 *   - light():   approval signed (light impact)
 *   - success(): mission completed (double-tap)
 *   - warning(): re-auth required
 *   - error():   action failed
 *   No haptic for scrolling. No haptic for screen changes.
 */

let plugin: { Haptics: { impact: (o: { style: string }) => Promise<void>; notification: (o: { type: string }) => Promise<void> } } | null = null;
let probed = false;

async function load(): Promise<typeof plugin> {
  if (probed) return plugin;
  probed = true;
  try {
    const mod = await import('@capacitor/haptics');
    // ImpactStyle / NotificationType are enums; the strings below match the values
    plugin = { Haptics: mod.Haptics as never };
  } catch {
    plugin = null;
  }
  return plugin;
}

function webVibrate(pattern: number | number[]): void {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try { navigator.vibrate(pattern); } catch { /* swallow */ }
  }
}

export async function tick(): Promise<void> {
  const p = await load();
  if (p) { try { await p.Haptics.impact({ style: 'MEDIUM' }); return; } catch { /* fall through */ } }
  webVibrate(15);
}

export async function light(): Promise<void> {
  const p = await load();
  if (p) { try { await p.Haptics.impact({ style: 'LIGHT' }); return; } catch { /* fall through */ } }
  webVibrate(8);
}

export async function success(): Promise<void> {
  const p = await load();
  if (p) { try { await p.Haptics.notification({ type: 'SUCCESS' }); return; } catch { /* fall through */ } }
  webVibrate([10, 30, 10]);
}

export async function warning(): Promise<void> {
  const p = await load();
  if (p) { try { await p.Haptics.notification({ type: 'WARNING' }); return; } catch { /* fall through */ } }
  webVibrate([15, 50, 15]);
}

export async function error(): Promise<void> {
  const p = await load();
  if (p) { try { await p.Haptics.notification({ type: 'ERROR' }); return; } catch { /* fall through */ } }
  webVibrate([30, 50, 30]);
}
