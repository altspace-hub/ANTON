/**
 * lan-discovery.ts — discover ANTON instances on the LAN.
 *
 * Three strategies:
 *   1. /api/app/discover/lan on a paired instance — that instance browses
 *      mDNS on the phone's behalf. Works for PWA + native, no extra
 *      permissions. Authenticated, so the instance can apply its own
 *      visibility policy.
 *   2. (deferred) @capacitor-community/zeroconf — direct mDNS browse from
 *      the phone. Only needed when the user has zero paired instances yet.
 *   3. /api/app/discover on candidate URLs the user types in or that come
 *      from a QR code.
 */

import { activeServerBase, activeAuthHeaders } from './instances';

export interface DiscoveredInstance {
  name: string;
  host: string;
  port: number;
  addresses: string[];
  service_type: string;
  txt: Record<string, string>;
  /** Computed: best URL to try connecting to */
  url: string;
}

function buildUrl(d: { host: string; addresses: string[]; port: number; txt: Record<string, string> }): string {
  // Prefer ipv4 LAN address, fall back to .local hostname
  const ipv4 = d.addresses.find(a => /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(a));
  const host = ipv4 ?? d.host ?? d.addresses[0];
  const path = (d.txt?.path && d.txt.path.startsWith('/')) ? '' : '';
  return `http://${host}:${d.port}${path}`;
}

/** Ask a paired instance to browse the LAN on the phone's behalf. */
export async function discoverViaInstance(): Promise<DiscoveredInstance[]> {
  const base = activeServerBase();
  if (!base) return [];
  const headers = await activeAuthHeaders();
  try {
    const res = await fetch(`${base}/api/app/discover/lan`, { headers, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const data = await res.json();
    return ((data.instances ?? []) as Omit<DiscoveredInstance, 'url'>[]).map(d => ({ ...d, url: buildUrl(d) }));
  } catch {
    return [];
  }
}

/** Probe a candidate server URL — used after typing or scanning. */
export async function probeServer(url: string): Promise<{ ok: boolean; serviceName?: string; serviceType?: string; fingerprint?: string }> {
  try {
    const base = url.replace(/\/$/, '');
    const res = await fetch(`${base}/api/app/discover`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return { ok: false };
    const data = await res.json();
    return {
      ok: true,
      serviceName: data.serviceName,
      serviceType: data.serviceType,
      fingerprint: data.fingerprint,
    };
  } catch {
    return { ok: false };
  }
}
