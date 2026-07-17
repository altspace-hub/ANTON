/**
 * portal-lan-discovery.ts — Track B-LAN: cross-instance portal discovery.
 *
 * Layer 3 (Network) proof: two ANTON instances on the same LAN can find each
 * other and surface their public portals to each other's owners. No registry
 * server, no internet, just mDNS + a single unauthenticated HTTP fetch.
 *
 * Flow:
 *   1. browse() — use the existing _anton._tcp mDNS advertiser to find peers
 *   2. For each peer, GET http://host:port/api/portals/public-directory
 *   3. Upsert portal_lan_neighbors row + ingest each portal into
 *      portal_descriptor_cache with origin_endpoint = http://host:port
 *   4. portal-handler.handle*() proxies subsequent visit/invoke calls to
 *      origin_endpoint when the cache row has one (Track B-LAN/W2)
 *
 * Self-skip: we compare each candidate against the local mDNS fingerprint to
 * avoid ingesting our own portals as remote — that would create a confusing
 * "you can visit yourself" loop and proxy traffic for nothing.
 */

import type { DatabaseAdapter } from '../../db/database.js';
import { childLogger } from '../../lib/logger.js';
import { assertSafeLanEgressUrl } from '../../lib/ssrf-guard.js';
import { createMdnsAdvertiser, type DiscoveredInstance } from '../mdns-advertiser.js';
import { verifyDescriptor, type SignedDescriptorEnvelope } from '../capability-descriptor/signer.js';
import { publicKeyWireToHex } from '../../lib/portal-crypto.js';

const log = childLogger('portal-lan-discovery');

const FETCH_TIMEOUT_MS = 3000;

export interface LanScanResult {
  peersFound: number;
  peersScanned: number;
  peersUnreachable: number;
  portalsIngested: number;
  selfSkipped: boolean;
  durationMs: number;
}

export interface KnownNeighbor {
  id: string;
  instanceName: string;
  fingerprint: string | null;
  endpoint: string;
  portalsCount: number;
  lastSeenAt: string;
  lastScanStatus: string | null;
  lastScanError: string | null;
}

interface PublicDirectoryResponse {
  instance: { name?: string; fingerprint?: string };
  portals: Array<{
    portalAddress: string;
    descriptorHash: string;
    descriptor: Record<string, unknown>;
    signature: string;
    signingKeyFingerprint: string;
    validFrom?: string;
    validUntil?: string;
  }>;
}

/**
 * Run one full LAN scan. Safe to call multiple times — upserts by endpoint.
 * Should be triggered by the user (via `POST /api/portals/lan/scan`) rather
 * than scheduled, so we don't spam the LAN with mDNS chatter.
 */
export async function scanLan(db: DatabaseAdapter, localPort: number): Promise<LanScanResult> {
  const start = Date.now();
  const advertiser = await createMdnsAdvertiser(localPort);
  const localInfo = advertiser.getInfo();
  const peers = await advertiser.browse();

  let peersScanned = 0;
  let peersUnreachable = 0;
  let portalsIngested = 0;
  let selfSkipped = false;

  for (const peer of peers) {
    if (isSelf(peer, localInfo)) { selfSkipped = true; continue; }
    const endpoint = chooseEndpoint(peer);
    if (!endpoint) { peersUnreachable++; continue; }

    try {
      const directory = await fetchPublicDirectory(endpoint);
      if (!directory) {
        await upsertNeighbor(db, peer, endpoint, 0, 'invalid_response', 'public-directory returned non-OK or invalid JSON');
        peersUnreachable++;
        continue;
      }
      await upsertNeighbor(db, peer, endpoint, directory.portals.length, 'ok', null);
      for (const p of directory.portals) {
        await ingestPortal(db, p, endpoint);
        portalsIngested++;
      }
      peersScanned++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.warn({ peer: peer.name, endpoint, err: message }, 'peer_unreachable');
      await upsertNeighbor(db, peer, endpoint, 0, 'unreachable', message.slice(0, 250));
      peersUnreachable++;
    }
  }

  const result: LanScanResult = {
    peersFound: peers.length,
    peersScanned,
    peersUnreachable,
    portalsIngested,
    selfSkipped,
    durationMs: Date.now() - start,
  };
  log.info(result, 'lan_scan_complete');
  return result;
}

export async function listKnownNeighbors(db: DatabaseAdapter): Promise<KnownNeighbor[]> {
  const rows = await db.all<{
    id: string; instance_name: string; fingerprint: string | null;
    endpoint: string; portals_count: number; last_seen_at: string;
    last_scan_status: string | null; last_scan_error: string | null;
  }>(
    `SELECT id, instance_name, fingerprint, endpoint, portals_count,
            last_seen_at, last_scan_status, last_scan_error
     FROM portal_lan_neighbors
     ORDER BY last_seen_at DESC`,
  );
  return rows.map((r) => ({
    id: r.id, instanceName: r.instance_name, fingerprint: r.fingerprint,
    endpoint: r.endpoint, portalsCount: r.portals_count,
    lastSeenAt: r.last_seen_at, lastScanStatus: r.last_scan_status, lastScanError: r.last_scan_error,
  }));
}

// ── Internals ──────────────────────────────────────────────────────────────

function isSelf(peer: DiscoveredInstance, local: { fingerprint?: string; ip: string | null; port: number }): boolean {
  if (local.fingerprint && peer.txt.fp === local.fingerprint) return true;
  if (local.ip && peer.addresses.includes(local.ip) && peer.port === local.port) return true;
  return false;
}

function chooseEndpoint(peer: DiscoveredInstance): string | null {
  // Prefer IPv4, fall back to host. Skip link-local + loopback.
  const ipv4 = peer.addresses.find((a) => /^\d+\.\d+\.\d+\.\d+$/.test(a) && !a.startsWith('127.') && !a.startsWith('169.254.'));
  if (ipv4) return `http://${ipv4}:${peer.port}`;
  if (peer.host) return `http://${peer.host}:${peer.port}`;
  return null;
}

async function fetchPublicDirectory(endpoint: string): Promise<PublicDirectoryResponse | null> {
  // SSRF guard: a malicious mDNS responder could advertise a host resolving to
  // loopback/metadata. Block those (LAN peers on private ranges stay allowed).
  try {
    await assertSafeLanEgressUrl(endpoint);
  } catch {
    return null; // blocked target — treat the peer as unreachable
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${endpoint}/api/portals/public-directory`, { signal: ctrl.signal });
    if (!res.ok) return null;
    const json = await res.json() as PublicDirectoryResponse;
    if (!json || !Array.isArray(json.portals)) return null;
    return json;
  } finally {
    clearTimeout(timer);
  }
}

async function upsertNeighbor(
  db: DatabaseAdapter,
  peer: DiscoveredInstance,
  endpoint: string,
  portalsCount: number,
  status: string,
  error: string | null,
): Promise<void> {
  const host = chooseEndpoint(peer)?.replace(/^http:\/\//, '').split(':')[0] ?? peer.host;
  await db.run(
    `INSERT INTO portal_lan_neighbors
       (instance_name, fingerprint, host, port, endpoint, portals_count,
        last_seen_at, first_seen_at, last_scan_status, last_scan_error)
     VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW(), ?, ?)
     ON CONFLICT (endpoint) DO UPDATE SET
       instance_name = EXCLUDED.instance_name,
       fingerprint = EXCLUDED.fingerprint,
       portals_count = EXCLUDED.portals_count,
       last_seen_at = NOW(),
       last_scan_status = EXCLUDED.last_scan_status,
       last_scan_error = EXCLUDED.last_scan_error`,
    peer.name, peer.txt.fp ?? null, host, peer.port, endpoint, portalsCount, status, error,
  );
}

async function ingestPortal(
  db: DatabaseAdapter,
  p: PublicDirectoryResponse['portals'][number],
  endpoint: string,
): Promise<void> {
  // We only ingest into the descriptor cache — we never write into the local
  // `portals` table for remote portals. The proxy layer (W2) is what makes
  // the portal visit/invoke route to the remote ANTON.
  //
  // SECURITY (2026-07-17 hardening — this cache is the trust root for visits
  // and Trusted-Stores pins, and the upsert used to be unconditional):
  // (1) UNSIGNED descriptors are dropped. Previously `if (p.signature)` meant a
  //     peer could skip verification entirely by omitting the signature and
  //     still poison the cache for any address.
  if (!p.signature) {
    log.warn({ portalAddress: p.portalAddress, endpoint },
      'dropping LAN-ingested descriptor: unsigned');
    return;
  }
  // Verify the peer-supplied descriptor is self-consistently signed. A tampered
  // descriptor — signature/key/payload mismatch — is dropped, never cached.
  // (Self-consistency can't vouch for a malicious peer's OWN self-signed
  // descriptor — the checks below + registry/handshake carry that.)
  {
    const wire = (p.descriptor as { portal?: { publicKey?: unknown } })?.portal?.publicKey;
    try {
      if (typeof wire !== 'string') throw new Error('descriptor.portal.publicKey missing');
      const envelope: SignedDescriptorEnvelope = {
        descriptor: p.descriptor as Record<string, unknown>,
        signature: p.signature,
        signatureAlgorithm: 'Ed25519',
        signingKeyFingerprint: p.signingKeyFingerprint,
      };
      const result = verifyDescriptor(envelope, { publicKey: publicKeyWireToHex(wire) });
      if (!result.valid) {
        log.warn({ portalAddress: p.portalAddress, endpoint, reasons: result.reasons },
          'dropping LAN-ingested descriptor: signature did not verify');
        return;
      }
    } catch (err) {
      log.warn({ portalAddress: p.portalAddress, endpoint, err: err instanceof Error ? err.message : String(err) },
        'dropping LAN-ingested descriptor: could not verify signature');
      return;
    }
  }
  // (2) Never let a LAN peer claim an address WE own — a poisoned cache row
  //     would redirect visits/pins for the operator's own portal to the peer.
  const locallyOwned = await db.get<{ id: string }>(
    `SELECT id FROM portals WHERE (name || '.' || namespace || '.portal') = ?`,
    p.portalAddress,
  );
  if (locallyOwned) {
    log.warn({ portalAddress: p.portalAddress, endpoint },
      'dropping LAN-ingested descriptor: address is locally owned');
    return;
  }
  // (3) Key continuity: refuse a silent signing-key change for a cached address.
  //     A legitimate rotation needs the operator to clear the cache row (or the
  //     registry/trusted-stores path, which verifies against the pinned key).
  const cached = await db.get<{ signing_key_fingerprint: string | null; origin_endpoint: string | null }>(
    `SELECT signing_key_fingerprint, origin_endpoint FROM portal_descriptor_cache WHERE portal_address = ?`,
    p.portalAddress,
  );
  if (cached?.signing_key_fingerprint && p.signingKeyFingerprint
      && cached.signing_key_fingerprint !== p.signingKeyFingerprint) {
    log.warn({
      portalAddress: p.portalAddress, endpoint,
      cachedFingerprint: cached.signing_key_fingerprint, offeredFingerprint: p.signingKeyFingerprint,
      cachedOrigin: cached.origin_endpoint,
    }, 'dropping LAN-ingested descriptor: signing key differs from cached (possible address hijack; clear the cache row to accept a legitimate rotation)');
    return;
  }
  await db.run(
    `INSERT INTO portal_descriptor_cache
       (portal_address, descriptor_hash, descriptor, signature, signing_key_fingerprint,
        valid_from, valid_until, fetched_at, origin_endpoint)
     VALUES (?, ?, ?, ?, ?, COALESCE(?::timestamptz, NOW()),
             COALESCE(?::timestamptz, NOW() + INTERVAL '1 day'), NOW(), ?)
     ON CONFLICT (portal_address) DO UPDATE SET
       descriptor_hash = EXCLUDED.descriptor_hash,
       descriptor = EXCLUDED.descriptor,
       signature = EXCLUDED.signature,
       signing_key_fingerprint = EXCLUDED.signing_key_fingerprint,
       valid_from = EXCLUDED.valid_from,
       valid_until = EXCLUDED.valid_until,
       fetched_at = NOW(),
       origin_endpoint = EXCLUDED.origin_endpoint`,
    p.portalAddress, p.descriptorHash, JSON.stringify(p.descriptor),
    p.signature, p.signingKeyFingerprint,
    p.validFrom ?? null, p.validUntil ?? null, endpoint,
  );
}
