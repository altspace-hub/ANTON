/**
 * Transport adapter interface — the boundary between
 *   "I want to call /api/app/foo on my paired instance"
 * and
 *   the actual bytes-on-the-wire mechanism that gets it there.
 *
 * Phase 0 ships only the interface + a public_https adapter that wraps
 * fetch(). Existing call sites continue to use fetch() directly; they'll
 * migrate to currentTransport().fetch() in Phase 4 when the mesh adapter
 * is wired up.
 *
 * Why an interface up front? Two reasons:
 *   1. The Instance record's transport field is already plumbed end-to-end,
 *      so the wire shape is locked. New transports plug in without touching
 *      pairing code.
 *   2. Forces us to write the contract in one place — easier to security-review
 *      than 59 ad-hoc fetch sites.
 *
 * See docs/ANTON_MESH_SPEC.md §1.
 */

import { effectiveTransport, getActiveInstance, type Instance, type TransportKind } from '../instances';
import { publicHttpsTransport } from './public_https';
import { meshTransportForInstance } from './mesh';
import { getDeviceX25519Keypair } from '../identity';

/** A request the app wants to make to its paired instance. Mirrors the
 *  small subset of fetch() options the existing call sites actually use. */
export interface TransportRequest {
  /** API path including the /api/app prefix, e.g. "/api/app/org/abc/query-sync" */
  path: string;
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  /** Header bag. Auth headers are attached by the adapter — callers don't add them here. */
  headers?: Record<string, string>;
  /** Stringified JSON body, or a raw string. Adapters never re-serialize. */
  body?: string;
  /** Set when the caller wants to abort an in-flight request. */
  signal?: AbortSignal;
}

/** What the adapter returns. Shaped to be cheap to wrap with a Response-like
 *  view at call sites that expect Response semantics. */
export interface TransportResponse {
  status: number;
  ok: boolean;
  /** Response body as text. Most call sites JSON.parse this. */
  text(): Promise<string>;
  /** Convenience: parsed JSON, or throws on non-JSON. */
  json<T = unknown>(): Promise<T>;
  /** Headers visible to the caller (case-insensitive lookup). */
  headers: Headers;
}

export interface Transport {
  kind: TransportKind;
  /** Make a request to the paired instance. Adapter is responsible for:
   *    - resolving the active server / relay
   *    - attaching auth headers (x-app-session)
   *    - signing the envelope (where applicable)
   *    - mapping protocol-level errors into TransportResponse.status. */
  fetch(req: TransportRequest): Promise<TransportResponse>;
  /** Liveness check used by the connection-status indicator. Adapters
   *  return true if a recent request succeeded. Cheap; no network call. */
  isLikelyOnline(): boolean;
}

/** Pick the right adapter for the active instance. Returns the public_https
 *  adapter when no instance is active or the field is absent (back-compat
 *  for every pre-mesh-era pairing). */
export function currentTransport(): Transport {
  return transportFor(getActiveInstance());
}

/** Pick the adapter for a specific instance — useful when an action is
 *  bound to a non-active instance (e.g. background sync of a secondary).
 *
 *  Each instance gets at most ONE cached transport instance — re-creating
 *  a MeshTransport per call would tear down the WS+Noise session and
 *  re-handshake on every fetch. The cache is keyed by `Instance.id`.
 */
const transportCache = new Map<string, Transport>();

export function transportFor(inst: Instance | null): Transport {
  const cached = inst ? transportCache.get(inst.id) : null;
  if (cached) return cached;

  let transport: Transport;
  switch (effectiveTransport(inst)) {
    case 'mesh': {
      if (!inst) throw new Error('mesh transport requires an Instance');
      // The mesh transport needs the phone's X25519 keypair, derived from
      // the device Ed25519 identity. We pass a lazy keypair-loader since
      // the secure store read is async — actual handshake doesn't fire
      // until first .fetch() so we can resolve at that point.
      transport = meshTransportForInstanceAsync(inst);
      break;
    }
    case 'public_https':
    default:
      transport = publicHttpsTransport(inst);
      break;
  }
  if (inst) transportCache.set(inst.id, transport);
  return transport;
}

/** Drop a cached transport — call after instance unpair, sign-out, or
 *  pubkey rotation. Closes any active mesh WS connection. */
export function evictTransport(instanceId: string): void {
  const t = transportCache.get(instanceId);
  transportCache.delete(instanceId);
  // MeshTransportHandle has a close(); public_https doesn't.
  const maybeMesh = t as Transport & { close?: () => void };
  maybeMesh.close?.();
}

/**
 * Build the mesh transport for an Instance. Wraps the underlying factory
 * with a lazy X25519-keypair load, since the keypair lives in the secure
 * store (async read) but the Transport interface is sync at construction.
 *
 * The first .fetch() awaits the keypair resolution; subsequent fetches
 * reuse the cached transport.
 */
function meshTransportForInstanceAsync(inst: Instance): Transport {
  let resolved: Transport | null = null;
  let resolving: Promise<Transport> | null = null;

  async function resolve(): Promise<Transport> {
    const phoneStaticKeypair = await getDeviceX25519Keypair();
    return meshTransportForInstance(inst, {
      phoneStaticKeypair,
      getAuthHeaders: (): Record<string, string> => {
        const t = (typeof localStorage !== 'undefined')
          ? localStorage.getItem('anton-companion-session')
          : null;
        return t ? { 'x-app-session': t } : {};
      },
    });
  }
  // Start the keypair load eagerly so the first request feels fast.
  resolving = resolve().then(t => { resolved = t; return t; });

  return {
    kind: 'mesh',
    isLikelyOnline: () => resolved?.isLikelyOnline() ?? false,
    async fetch(req): Promise<TransportResponse> {
      const t = resolved ?? await resolving!;
      return t.fetch(req);
    },
  };
}

/** Re-export the canonical TransportKind alias from instances.ts so
 *  consumers can `import { TransportKind } from './transports'`. */
export type { TransportKind } from '../instances';
