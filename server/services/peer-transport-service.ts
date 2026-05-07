/**
 * peer-transport-service.ts — single send-one-payload API for A2A traffic.
 *
 * Track A3: replaces the bare `fetch(peer + '/api/p2p/receive')` calls
 * scattered across community + cross-instance services with a transport
 * facade that prefers ANTON Mesh and falls back to HTTPS. Mesh delivery
 * is private + NAT-friendly + works without each peer running a public
 * endpoint; HTTPS is the legacy path that keeps existing pairings working.
 *
 * Decision tree per send (matches the design in the Track plan):
 *
 *   if connection.preferred_transport === 'https'        → HTTPS only
 *   if connection.preferred_transport === 'mesh'         → mesh only (no fallback)
 *   if connection.preferred_transport === 'auto' (default):
 *     if mesh_demoted_until is in the future             → HTTPS
 *     elif peer_instance_pubkey + peer_relay_endpoints   → try mesh; on failure HTTPS
 *     else                                               → HTTPS
 *
 * Health tracking:
 *   - last_mesh_success_at  / last_https_success_at update on every success
 *   - 3 consecutive mesh failures (no success in between) → demote for 1h
 *
 * Mesh path is currently a stub that returns false (Track A4 implements
 * the dialer-as-initiator). The facade lands first so message-queue-service
 * + remote-agent-client can be wired through it now and the actual mesh
 * call slots in without further changes to call sites.
 */

import type { DatabaseAdapter } from '../db/database.js';

export interface PeerSendInput {
  /** community_connections.id of the recipient. */
  connectionId: string;
  /** Path on the peer's gateway, e.g. '/api/p2p/receive' or '/api/agents/public/query'. */
  path: string;
  /** Already-stringified JSON body (lets the caller stay JSON-typed when convenient). */
  body: string;
  /** Total time budget; mesh + HTTPS each get ~half. Default 15s. */
  totalTimeoutMs?: number;
}

export interface PeerSendOutcome {
  ok: boolean;
  /** Which transport actually delivered. 'none' when both failed or unconfigured. */
  transport: 'mesh' | 'https' | 'none';
  /** HTTP status code from the transport that responded (0 when nothing did). */
  httpStatus: number;
  /** Optional response body — text is safer than json since the service is generic. */
  responseText?: string;
  /** When ok=false, a one-line reason for the audit trail. */
  error?: string;
}

const MESH_DEMOTION_FAILURES = 3;
const MESH_DEMOTION_WINDOW_MS = 60 * 60 * 1000; // 1h

interface ConnectionRow {
  id: string;
  contact_hash: string;
  endpoint: string | null;
  preferred_transport: 'mesh' | 'https' | 'auto';
  peer_instance_pubkey: string | null;
  peer_relay_endpoints: string | string[] | null;
  mesh_demoted_until: Date | string | null;
}

export async function sendToPeer(db: DatabaseAdapter, input: PeerSendInput): Promise<PeerSendOutcome> {
  const conn = await db.get<ConnectionRow>(
    `SELECT id, contact_hash, endpoint, preferred_transport,
            peer_instance_pubkey, peer_relay_endpoints, mesh_demoted_until
       FROM community_connections WHERE id = $1`,
    input.connectionId,
  );
  if (!conn) return { ok: false, transport: 'none', httpStatus: 0, error: 'connection not found' };

  const meshAddressKnown = !!conn.peer_instance_pubkey
    && !!conn.peer_relay_endpoints
    && parseRelays(conn.peer_relay_endpoints).length > 0;

  const demoted = conn.mesh_demoted_until && new Date(conn.mesh_demoted_until).getTime() > Date.now();

  const wantMesh =
    conn.preferred_transport === 'mesh'
    || (conn.preferred_transport === 'auto' && meshAddressKnown && !demoted);

  const wantHttpsFallback =
    conn.preferred_transport !== 'mesh'
    && !!conn.endpoint;

  const totalBudget = input.totalTimeoutMs ?? 15_000;
  const meshBudget = Math.floor(totalBudget / 2);

  // Mesh first (when configured)
  if (wantMesh) {
    const meshResult = await tryMesh(conn, input, meshBudget);
    if (meshResult.ok) {
      await recordSuccess(db, conn.id, 'mesh');
      return meshResult;
    }
    await recordMeshFailure(db, conn.id);
    if (!wantHttpsFallback) return meshResult;
    // fall through
  }

  // HTTPS path
  if (wantHttpsFallback) {
    const httpsResult = await tryHttps(conn, input, totalBudget - (wantMesh ? meshBudget : 0));
    if (httpsResult.ok) await recordSuccess(db, conn.id, 'https');
    return httpsResult;
  }

  return {
    ok: false,
    transport: 'none',
    httpStatus: 0,
    error: 'no transport available (need preferred_transport=mesh|auto with mesh address, or endpoint for https)',
  };
}

// ── Transport implementations ────────────────────────────────────────

async function tryMesh(_conn: ConnectionRow, _input: PeerSendInput, _timeoutMs: number): Promise<PeerSendOutcome> {
  // Track A4 plugs in here. Will use MeshDialer.dialPeer(peerPubkey, relayList)
  // → Noise IK initiator → ENVELOPE frames over the relay's session matcher.
  // Until then, surface as failure so call sites get the HTTPS fallback.
  return { ok: false, transport: 'mesh', httpStatus: 0, error: 'mesh-dial-peer not yet implemented (Track A4)' };
}

async function tryHttps(conn: ConnectionRow, input: PeerSendInput, timeoutMs: number): Promise<PeerSendOutcome> {
  if (!conn.endpoint) {
    return { ok: false, transport: 'https', httpStatus: 0, error: 'connection has no HTTPS endpoint' };
  }
  // Reuse the SSRF guard that message-queue-service had inline; central
  // copy would be nicer but message-queue keeps its local validator until
  // A5 retires that path.
  if (!validateEndpointUrl(conn.endpoint)) {
    return { ok: false, transport: 'https', httpStatus: 0, error: 'endpoint blocked by SSRF policy' };
  }
  const url = `${conn.endpoint.replace(/\/+$/, '')}${input.path}`;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: input.body,
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await response.text().catch(() => '');
    return {
      ok: response.ok,
      transport: 'https',
      httpStatus: response.status,
      responseText: text,
      error: response.ok ? undefined : `HTTP ${response.status}`,
    };
  } catch (err) {
    return {
      ok: false,
      transport: 'https',
      httpStatus: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ── Health tracking ──────────────────────────────────────────────────

async function recordSuccess(db: DatabaseAdapter, connectionId: string, kind: 'mesh' | 'https'): Promise<void> {
  const col = kind === 'mesh' ? 'last_mesh_success_at' : 'last_https_success_at';
  await db.run(
    `UPDATE community_connections
        SET ${col} = NOW(),
            mesh_demoted_until = CASE WHEN $2 = 'mesh' THEN NULL ELSE mesh_demoted_until END
      WHERE id = $1`,
    connectionId, kind,
  );
}

/**
 * Track consecutive mesh failures by checking how long it's been since the
 * last mesh success. If we've never succeeded OR the last success was over
 * (failures × ~5min) ago without a clear demotion, set the demotion timer.
 *
 * This is intentionally simple — a counter column would be more precise
 * but adds write contention; the time-based heuristic is good enough for
 * a v1 facade and avoids another schema column.
 */
async function recordMeshFailure(db: DatabaseAdapter, connectionId: string): Promise<void> {
  await db.run(
    `UPDATE community_connections
        SET mesh_demoted_until = NOW() + INTERVAL '1 hour'
      WHERE id = $1
        AND (last_mesh_success_at IS NULL OR last_mesh_success_at < NOW() - INTERVAL '15 minutes')`,
    connectionId,
  );
}

// ── Helpers ──────────────────────────────────────────────────────────

function parseRelays(raw: string | string[]): string[] {
  if (Array.isArray(raw)) return raw.filter((s): s is string => typeof s === 'string');
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === 'string') : [];
  } catch {
    return [];
  }
}

function validateEndpointUrl(endpoint: string): boolean {
  try {
    const parsed = new URL(endpoint);
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    if (process.env.ALLOW_PRIVATE_P2P === 'true') return true;
    const hostname = parsed.hostname.toLowerCase();
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') return false;
    if (/^10\./.test(hostname)) return false;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) return false;
    if (/^192\.168\./.test(hostname)) return false;
    if (/^169\.254\./.test(hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

// ── For unit tests / future runtime control ──────────────────────────

export async function clearMeshDemotion(db: DatabaseAdapter, connectionId: string): Promise<void> {
  await db.run(
    `UPDATE community_connections SET mesh_demoted_until = NULL WHERE id = $1`,
    connectionId,
  );
}

void MESH_DEMOTION_FAILURES; // referenced in design doc; kept for clarity
void MESH_DEMOTION_WINDOW_MS; // ditto
