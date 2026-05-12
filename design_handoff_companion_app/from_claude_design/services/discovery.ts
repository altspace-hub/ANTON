/**
 * discovery.ts — Server discovery for LAN mode.
 * Tries the current origin first, then saved servers, then manual entry.
 */

const SERVERS_KEY = 'anton-companion-servers';

export interface ServerInfo {
  url: string;
  name: string;
  lastSeen: number;
}

/** Get saved server list */
export function getSavedServers(): ServerInfo[] {
  try {
    return JSON.parse(localStorage.getItem(SERVERS_KEY) || '[]');
  } catch {
    return [];
  }
}

/** Save a working server */
export function saveServer(url: string, name: string): void {
  const servers = getSavedServers().filter(s => s.url !== url);
  servers.unshift({ url: url.replace(/\/$/, ''), name, lastSeen: Date.now() });
  localStorage.setItem(SERVERS_KEY, JSON.stringify(servers.slice(0, 10)));
}

/** Remove a server */
export function removeServer(url: string): void {
  const servers = getSavedServers().filter(s => s.url !== url);
  localStorage.setItem(SERVERS_KEY, JSON.stringify(servers));
}

/** Get the current API base URL */
export function getApiBase(): string {
  // If we're served from the ANTON server directly (production), use same origin
  // If we're on the Vite dev server, proxy handles it
  return '';
}

/** Test if a server is reachable */
export async function testServer(url: string): Promise<{ ok: boolean; name?: string }> {
  try {
    const base = url.replace(/\/$/, '');
    const res = await fetch(`${base}/api/app/discover`, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const data = await res.json();
      return { ok: true, name: data.serviceName || 'ANTON Server' };
    }
    // Try languages endpoint as fallback
    const langRes = await fetch(`${base}/api/app/languages`, { signal: AbortSignal.timeout(5000) });
    return { ok: langRes.ok, name: 'ANTON Server' };
  } catch {
    return { ok: false };
  }
}
