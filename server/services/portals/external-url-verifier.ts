// ── external-url-verifier.ts ────────────────────────────────────────────────
// Pings a portal's external_primary_url and writes the result to
// portals.external_url_verified_at. Used by:
//   - PATCH /portals/:id when external_primary_url changes (best-effort,
//     runs after the PATCH returns so the response isn't blocked by a
//     slow external site)
//   - POST /portals/:id/verify-external-url for manual re-check
//
// HEAD first, falls back to GET when the site rejects HEAD (many static
// hosts do). 4s hard timeout — a stuck verifier can't stall the request.

import type { DatabaseAdapter } from '../../db/database.js';

export interface VerifyResult {
  ok: boolean;
  status: number | null;
  checkedAt: string;
  reason?: string;
}

const TIMEOUT_MS = 4000;

export async function verifyExternalUrl(url: string): Promise<VerifyResult> {
  const checkedAt = new Date().toISOString();
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { ok: false, status: null, checkedAt, reason: 'Only http(s) URLs can be verified' };
    }
  } catch {
    return { ok: false, status: null, checkedAt, reason: 'Malformed URL' };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    // HEAD first.
    let res = await fetch(url, { method: 'HEAD', signal: controller.signal, redirect: 'follow' });
    if (res.status === 405 || res.status === 501) {
      // Not every site supports HEAD. Retry with a short GET.
      res = await fetch(url, { method: 'GET', signal: controller.signal, redirect: 'follow' });
    }
    return {
      ok: res.status >= 200 && res.status < 400,
      status: res.status,
      checkedAt,
      reason: res.status >= 400 ? `HTTP ${res.status}` : undefined,
    };
  } catch (err) {
    return {
      ok: false,
      status: null,
      checkedAt,
      reason: err instanceof Error ? err.message : 'Fetch failed',
    };
  } finally {
    clearTimeout(timeout);
  }
}

/** Run verification for a single portal and persist the result. Returns
 *  the verification outcome so the caller can surface it immediately. */
export async function verifyAndPersist(
  db: DatabaseAdapter,
  portalId: string,
): Promise<VerifyResult | null> {
  const row = await db.get<{ external_primary_url: string | null; surface_mode: string }>(
    `SELECT external_primary_url, surface_mode FROM portals WHERE id = ?`,
    portalId,
  );
  if (!row || row.surface_mode !== 'external' || !row.external_primary_url) {
    return null;
  }
  const result = await verifyExternalUrl(row.external_primary_url);
  if (result.ok) {
    await db.run(
      `UPDATE portals SET external_url_verified_at = ? WHERE id = ?`,
      result.checkedAt, portalId,
    );
  } else {
    await db.run(
      `UPDATE portals SET external_url_verified_at = NULL WHERE id = ?`,
      portalId,
    );
  }
  return result;
}
