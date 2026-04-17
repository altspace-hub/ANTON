/**
 * mdns-advertiser.ts
 * Advertises the ANTON server on the local network via mDNS / Bonjour
 * so companion apps can discover it without knowing the IP address.
 *
 * Spec §5.1 Mode A — service type is `_anton._tcp.local`. We also keep
 * the legacy `_anton-gateway._tcp` advertisement so existing v1 apps
 * stay discoverable until they upgrade.
 *
 * Uses the `bonjour-service` package (pure JS, no native deps).
 * Controlled by APP_GATEWAY_MDNS=true environment variable.
 */

import { networkInterfaces } from 'os';
import crypto from 'crypto';

// Get the server's LAN IP address
function getLanIp(): string | null {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return null;
}

export interface MdnsAdvertiserInfo {
  enabled: boolean;
  ip: string | null;
  port: number;
  serviceName: string;
  /** Spec-compliant service type clients should browse for */
  serviceType: string;
  /** Identifier the app pins after first connection */
  fingerprint?: string;
}

export interface MdnsAdvertiser {
  start: () => Promise<void>;
  stop: () => void;
  getInfo: () => MdnsAdvertiserInfo;
  /** Browse for ANTON instances on the LAN (server-side helper for /discover) */
  browse: (timeoutMs?: number) => Promise<DiscoveredInstance[]>;
}

export interface DiscoveredInstance {
  name: string;
  host: string;
  port: number;
  addresses: string[];
  service_type: string;
  txt: Record<string, string>;
}

let cached: MdnsAdvertiser | null = null;

export async function createMdnsAdvertiser(port: number): Promise<MdnsAdvertiser> {
  if (cached) return cached;

  const enabled = process.env.APP_GATEWAY_MDNS === 'true';
  const lanIp = getLanIp();
  const serviceName = process.env.APP_GATEWAY_MDNS_NAME || process.env.APP_GATEWAY_INSTANCE_NAME || 'ANTON Server';
  const fingerprint = process.env.APP_GATEWAY_MDNS_FP
    || crypto.createHash('sha256').update(`${serviceName}:${lanIp}:${port}`).digest('hex').slice(0, 16);
  const SERVICE_TYPE = 'anton';            // spec §5.1 — `_anton._tcp.local`
  const LEGACY_TYPE  = 'anton-gateway';    // v1 compat

  let bonjourInstance: { destroy: () => void } | null = null;

  async function start(): Promise<void> {
    if (!enabled) {
      console.log('[mdns] mDNS advertising disabled (set APP_GATEWAY_MDNS=true to enable)');
      return;
    }
    try {
      const { Bonjour } = await import('bonjour-service');
      const bonjour = new Bonjour();
      bonjourInstance = bonjour as never;

      // Spec-compliant service type
      bonjour.publish({
        name: serviceName,
        type: SERVICE_TYPE, protocol: 'tcp', port,
        txt: {
          version: '1.0', ip: lanIp || 'unknown',
          path: '/app/', api: '/api/app/',
          fp: fingerprint,
        },
      });
      // Legacy alias for v1 clients
      bonjour.publish({
        name: serviceName,
        type: LEGACY_TYPE, protocol: 'tcp', port,
        txt: {
          version: '1.0', ip: lanIp || 'unknown',
          path: '/app/', api: '/api/app/',
        },
      });

      console.log(`[mdns] Advertising "${serviceName}" on ${lanIp}:${port} (types: _${SERVICE_TYPE}._tcp + _${LEGACY_TYPE}._tcp)`);
    } catch {
      console.log('[mdns] mDNS not available (install bonjour-service for LAN discovery)');
    }
  }

  function stop(): void {
    if (bonjourInstance) {
      bonjourInstance.destroy();
      bonjourInstance = null;
      console.log('[mdns] Stopped advertising');
    }
  }

  function getInfo(): MdnsAdvertiserInfo {
    return { enabled, ip: lanIp, port, serviceName, serviceType: `_${SERVICE_TYPE}._tcp`, fingerprint };
  }

  async function browse(timeoutMs = 2500): Promise<DiscoveredInstance[]> {
    if (!enabled) return [];
    try {
      const { Bonjour } = await import('bonjour-service');
      const bonjour = new Bonjour();
      const found: DiscoveredInstance[] = [];
      const browser = bonjour.find({ type: SERVICE_TYPE }, (svc: unknown) => {
        const s = svc as { name: string; host: string; port: number; addresses: string[]; type: string; txt: Record<string, string> };
        found.push({
          name: s.name, host: s.host, port: s.port,
          addresses: s.addresses ?? [],
          service_type: `_${s.type}._tcp`,
          txt: s.txt ?? {},
        });
      });
      await new Promise(r => setTimeout(r, timeoutMs));
      browser.stop();
      bonjour.destroy();
      // Dedup by (name, port, addresses[0])
      const seen = new Set<string>();
      return found.filter(f => {
        const k = `${f.name}|${f.port}|${f.addresses[0] ?? ''}`;
        if (seen.has(k)) return false;
        seen.add(k); return true;
      });
    } catch {
      return [];
    }
  }

  cached = { start, stop, getInfo, browse };
  return cached;
}
