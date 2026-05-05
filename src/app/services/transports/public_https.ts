/**
 * public_https — direct HTTPS fetch to the paired instance's server_base.
 *
 * Wraps fetch() with the same headers + base-URL logic that api.ts has been
 * doing inline. Keeping the wrapper trivial means there's nothing new to
 * break when call sites migrate; this adapter is behaviourally identical
 * to a plain fetch with x-app-session attached.
 *
 * See docs/ANTON_MESH_SPEC.md §1.4.
 */

import { getInstanceSessionToken, type Instance } from '../instances';
import type { Transport, TransportRequest, TransportResponse } from './index';

let lastRequestOk = false;

export function publicHttpsTransport(inst: Instance | null): Transport {
  return {
    kind: 'public_https',
    isLikelyOnline: () => lastRequestOk,
    async fetch(req: TransportRequest): Promise<TransportResponse> {
      // Resolve base URL. server_base is canonical; fall back to localStorage
      // bridge for the rare path where the active-instance switch hasn't
      // synced yet (existing behaviour from api.ts).
      const base = inst?.server_base
        || localStorage.getItem('anton-companion-server')
        || '';
      // Auth: attach x-app-session from the secure store via instance id.
      // For pre-instance flows (register, join, auth/challenge) inst is null
      // and we skip — caller is responsible for any auth they do need there.
      const headers: Record<string, string> = { ...(req.headers || {}) };
      if (inst) {
        const tok = await getInstanceSessionToken(inst.id);
        if (tok && !headers['x-app-session']) headers['x-app-session'] = tok;
      }
      // Default Content-Type for POST/PUT/PATCH bodies that look like JSON.
      // Mirror existing api.ts behaviour exactly — call sites that already
      // set Content-Type win.
      if (req.body && !headers['Content-Type'] && !headers['content-type']) {
        headers['Content-Type'] = 'application/json';
      }
      const res = await fetch(`${base}${req.path}`, {
        method: req.method ?? (req.body ? 'POST' : 'GET'),
        headers,
        body: req.body,
        signal: req.signal,
      });
      lastRequestOk = res.ok;
      return {
        status: res.status,
        ok: res.ok,
        headers: res.headers,
        text: () => res.text(),
        json: <T = unknown>() => res.json() as Promise<T>,
      };
    },
  };
}
