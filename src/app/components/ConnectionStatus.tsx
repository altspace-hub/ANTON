/**
 * ConnectionStatus — surfaces why the app is (or isn't) reachable.
 *
 * Audit improvement #4 — previously this was a binary online/offline banner
 * driven by `navigator.onLine`. That hides the cases that actually burn
 * trust on a mobile companion: LAN endpoint dark while WAN silently retries,
 * paired instance unreachable with pending messages queued, or no instance
 * paired at all.
 *
 * Now shows one of:
 *   • Unpaired — no active instance
 *   • Offline + queued — device offline AND there are messages waiting
 *   • Offline — device offline, nothing queued
 *   • Instance unreachable — device online but the active ANTON failed its
 *     last reachability ping (tried LAN then WAN — both failed)
 *
 * When the app is online, the active instance is reachable, and nothing is
 * queued, we render nothing — the transport tag in InstanceTopBar already
 * tells the user whether they're on LAN or WAN.
 */

import { useEffect, useState } from 'react';
import { getActiveInstance, listInstances, onActiveInstanceChange } from '../services/instances';
import { getQueue } from '../services/offline';
import { isOnline, onConnectionChange } from '../services/offline';

type Banner =
  | { kind: 'hidden' }
  | { kind: 'unpaired' }
  | { kind: 'offline'; queued: number }
  | { kind: 'instance_unreachable' };

function pickBanner(deviceOnline: boolean, queued: number): Banner {
  const instances = listInstances();
  if (instances.length === 0) return { kind: 'unpaired' };
  if (!deviceOnline) return { kind: 'offline', queued };
  const active = getActiveInstance();
  if (active && active.last_status === 'offline') return { kind: 'instance_unreachable' };
  return { kind: 'hidden' };
}

export default function ConnectionStatus() {
  const [deviceOnline, setDeviceOnline] = useState(isOnline());
  const [queued, setQueued] = useState<number>(() => getQueue().length);
  const [, setTick] = useState(0);

  useEffect(() => onConnectionChange(setDeviceOnline), []);
  useEffect(() => onActiveInstanceChange(() => setTick(t => t + 1)), []);

  // Poll the queue size + instance last_status every 5s. Cheap — both reads
  // are synchronous localStorage lookups.
  useEffect(() => {
    const id = window.setInterval(() => {
      setQueued(getQueue().length);
      setTick(t => t + 1);
    }, 5000);
    return () => window.clearInterval(id);
  }, []);

  const banner = pickBanner(deviceOnline, queued);
  if (banner.kind === 'hidden') return null;

  let message: string;
  let tone: 'gold' | 'red';
  switch (banner.kind) {
    case 'unpaired':
      message = 'No ANTON instance paired — tap the menu to connect one.';
      tone = 'gold';
      break;
    case 'offline':
      message = banner.queued > 0
        ? `You're offline — ${banner.queued} message${banner.queued === 1 ? '' : 's'} queued, will send when back online.`
        : `You're offline — cached conversations available.`;
      tone = 'gold';
      break;
    case 'instance_unreachable':
      message = `Can't reach this ANTON — last LAN and WAN attempts failed. Check the laptop, VPN, or pairing.`;
      tone = 'red';
      break;
  }

  const bg = tone === 'gold' ? 'bg-adv-gold/90 text-adv-dark' : 'bg-adv-red/90 text-adv-off-white';
  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed top-0 left-0 right-0 z-50 px-4 py-2 text-center text-xs font-medium safe-top ${bg}`}
    >
      {message}
    </div>
  );
}
