/**
 * mdns-advertiser.ts
 * Advertises the ANTON server on the local network via mDNS/Bonjour.
 * Companion apps can discover the server without knowing the IP address.
 *
 * Uses the `bonjour-service` package (pure JS, no native deps).
 * Controlled by APP_GATEWAY_MDNS=true environment variable.
 */

import { networkInterfaces } from 'os';

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

export interface MdnsAdvertiser {
  start: () => void;
  stop: () => void;
  getInfo: () => { enabled: boolean; ip: string | null; port: number; serviceName: string };
}

export async function createMdnsAdvertiser(port: number): Promise<MdnsAdvertiser> {
  const enabled = process.env.APP_GATEWAY_MDNS === 'true';
  const lanIp = getLanIp();
  const serviceName = process.env.APP_GATEWAY_MDNS_NAME || 'ANTON Server';
  let bonjourInstance: { destroy: () => void } | null = null;

  async function start() {
    if (!enabled) {
      console.log('[mdns] mDNS advertising disabled (set APP_GATEWAY_MDNS=true to enable)');
      return;
    }

    try {
      // Dynamic import — bonjour-service is optional
      const { Bonjour } = await import('bonjour-service');
      const bonjour = new Bonjour();
      bonjourInstance = bonjour;

      bonjour.publish({
        name: serviceName,
        type: 'anton-gateway',
        protocol: 'tcp',
        port,
        txt: {
          version: '1.0',
          ip: lanIp || 'unknown',
          path: '/app/',
          api: '/api/app/',
        },
      });

      console.log(`[mdns] Advertising "${serviceName}" on ${lanIp}:${port} (type: _anton-gateway._tcp)`);
    } catch (err) {
      // bonjour-service not installed — graceful fallback
      console.log('[mdns] mDNS not available (install bonjour-service for LAN discovery)');
    }
  }

  function stop() {
    if (bonjourInstance) {
      bonjourInstance.destroy();
      bonjourInstance = null;
      console.log('[mdns] Stopped advertising');
    }
  }

  function getInfo() {
    return { enabled, ip: lanIp, port, serviceName };
  }

  return { start, stop, getInfo };
}
