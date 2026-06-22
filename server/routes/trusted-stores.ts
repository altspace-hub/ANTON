/**
 * trusted-stores.ts — Trusted Stores P0 routes (pin + mutual key verification).
 *
 * Buyer side (the local user managing their pins — requireAuth, owner-scoped):
 *   GET    /trusted-stores                      list pins
 *   POST   /trusted-stores/resolve              preview (resolve + integrity + look-alike)
 *   POST   /trusted-stores/pin                  pin (TOFU on the cached descriptor key)
 *   POST   /trusted-stores/handshake/request    mint a nonce + deliver the challenge to the seller's inbox
 *   POST   /trusted-stores/handshake/verify      verify the seller's signed proof → status 'trusted'
 *   POST   /trusted-stores/recheck-key           re-resolve + key-rotation alert
 *   DELETE /trusted-stores/:portalAddress        revoke a pin
 *
 * Seller side (the portal owner clicking "Agree" — requireAuth + portal ownership):
 *   POST   /trusted-stores/agree                 sign a buyer's handshake challenge
 *
 * The mutual handshake rides the EXISTING portal invoke/inbox loop: the challenge
 * is stored as a portal_capability_invocation (the seller's inbox), the seller
 * AGREES + signs it, and the buyer verifies the signature against the pinned key.
 *
 * Honest P0 boundary: challenge DELIVERY is wired for a seller portal hosted on
 * THIS instance (the invocation row is inserted directly). Cross-instance delivery
 * (POST the challenge to a remote seller's public origin + poll it back) is a thin
 * mechanical follow-on (P0.5) — no new crypto; the verify path is identical.
 */
import { randomBytes } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';

import type { DatabaseAdapter } from '../db/database.js';
import { requireAuth } from '../middleware/auth.js';
import { safeError } from '../lib/error-response.js';
import {
  listTrustedSellers, previewSeller, pinSeller, removeTrustedSeller,
  reResolveAndCheckKey, issueHandshakeNonce, recordHandshakeResult, signHandshakeChallenge,
  type HandshakeChallenge,
} from '../services/trusted-stores/trusted-seller-service.js';

const AddressBody = z.object({ portalAddress: z.string().min(3).max(256) });

/** Split "name.namespace.portal" → { name, namespace }. */
function parseAddress(address: string): { name: string; namespace: string } | null {
  const m = address.match(/^([a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*)\.([a-z][a-z0-9-]{2,31})\.portal$/i);
  // Greedy first group can swallow the namespace; recover by taking the last two labels.
  const parts = address.replace(/\.portal$/i, '').split('.');
  if (parts.length < 2) return null;
  const namespace = parts[parts.length - 1];
  const name = parts.slice(0, -1).join('.');
  return m ? { name, namespace } : { name, namespace };
}

export function createTrustedStoreRoutes(db: DatabaseAdapter): Router {
  const router = Router();
  const ownerOf = (req: Request): string => req.user?.id ?? 'solo';

  // ── Buyer: trust management ──────────────────────────────────────────────
  router.get('/trusted-stores', requireAuth, async (req: Request, res: Response) => {
    try {
      res.json({ sellers: await listTrustedSellers(db, ownerOf(req)) });
    } catch (err) { res.status(500).json({ error: safeError(err) }); }
  });

  router.post('/trusted-stores/resolve', requireAuth, async (req: Request, res: Response) => {
    const p = AddressBody.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: 'portalAddress required' });
    try {
      const preview = await previewSeller(db, ownerOf(req), p.data.portalAddress);
      res.json(preview);
    } catch (err) { res.status(500).json({ error: safeError(err) }); }
  });

  router.post('/trusted-stores/pin', requireAuth, async (req: Request, res: Response) => {
    const p = AddressBody.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: 'portalAddress required' });
    try {
      const result = await pinSeller(db, ownerOf(req), p.data.portalAddress);
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  router.post('/trusted-stores/recheck-key', requireAuth, async (req: Request, res: Response) => {
    const p = AddressBody.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: 'portalAddress required' });
    try {
      res.json(await reResolveAndCheckKey(db, ownerOf(req), p.data.portalAddress));
    } catch (err) { res.status(500).json({ error: safeError(err) }); }
  });

  router.delete('/trusted-stores/:portalAddress', requireAuth, async (req: Request, res: Response) => {
    try {
      const removed = await removeTrustedSeller(db, ownerOf(req), String(req.params.portalAddress));
      res.json({ removed });
    } catch (err) { res.status(500).json({ error: safeError(err) }); }
  });

  // ── Buyer: mutual handshake ──────────────────────────────────────────────
  router.post('/trusted-stores/handshake/request', requireAuth, async (req: Request, res: Response) => {
    const Body = AddressBody.extend({ buyerContactHash: z.string().max(256).optional() });
    const p = Body.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: 'portalAddress required' });
    try {
      const ownerId = ownerOf(req);
      const buyerHash = p.data.buyerContactHash ?? `local:${ownerId}`;
      const { challenge } = await issueHandshakeNonce(db, ownerId, p.data.portalAddress, buyerHash);

      // Deliver the challenge to the seller's inbox. P0: the seller portal must be
      // hosted on THIS instance (look it up by address). Cross-instance delivery is
      // the P0.5 follow-on (POST to the seller's public origin).
      const parsed = parseAddress(p.data.portalAddress);
      if (!parsed) return res.status(400).json({ error: 'invalid portal address' });
      const portal = await db.get<{ id: string }>(
        `SELECT id FROM portals WHERE name = ? AND namespace = ? AND status = 'active'`,
        parsed.name, parsed.namespace,
      );
      if (!portal) {
        return res.status(409).json({
          error: 'cross-instance handshake delivery is not yet wired (P0.5); the seller portal must be hosted on this instance',
          challenge,
        });
      }
      const responseId = `th_${randomBytes(12).toString('hex')}`;
      await db.run(
        `INSERT INTO portal_capability_invocations
           (portal_id, capability_id, capability_verb, aap_endpoint, visitor_contact_hash,
            input, output, response_id, status)
         VALUES (?, 'trust-handshake', 'connect', 'trust-handshake', ?, ?, NULL, ?, 'pending')`,
        portal.id, buyerHash, JSON.stringify(challenge), responseId,
      );
      res.json({ responseId, portalId: portal.id, status: 'pending' });
    } catch (err) { res.status(500).json({ error: safeError(err) }); }
  });

  router.post('/trusted-stores/handshake/verify', requireAuth, async (req: Request, res: Response) => {
    const Body = AddressBody.extend({ responseId: z.string().min(1).max(128) });
    const p = Body.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: 'portalAddress + responseId required' });
    try {
      const inv = await db.get<{ output: Record<string, unknown> | null; status: string }>(
        `SELECT output, status FROM portal_capability_invocations WHERE response_id = ?`,
        p.data.responseId,
      );
      if (!inv) return res.status(404).json({ error: 'handshake not found' });
      if (inv.status !== 'responded' || !inv.output) {
        return res.json({ verified: false, pending: true, reasons: ['awaiting-seller-agree'] });
      }
      const out = inv.output as { signature?: string; signedPayload?: Record<string, unknown>; signingPubkeyHex?: string };
      if (!out.signature || !out.signedPayload || !out.signingPubkeyHex) {
        return res.json({ verified: false, reasons: ['malformed-proof'] });
      }
      const result = await recordHandshakeResult(db, ownerOf(req), p.data.portalAddress, {
        signature: out.signature, signedPayload: out.signedPayload, signingPubkeyHex: out.signingPubkeyHex,
      });
      res.json(result);
    } catch (err) { res.status(500).json({ error: safeError(err) }); }
  });

  // ── Seller: the "Agree" click (owner-gated) ──────────────────────────────
  router.post('/trusted-stores/agree', requireAuth, async (req: Request, res: Response) => {
    const Body = z.object({ responseId: z.string().min(1).max(128) });
    const p = Body.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: 'responseId required' });
    try {
      const inv = await db.get<{ id: string; portal_id: string; input: Record<string, unknown>; status: string }>(
        `SELECT id, portal_id, input, status FROM portal_capability_invocations WHERE response_id = ?`,
        p.data.responseId,
      );
      if (!inv) return res.status(404).json({ error: 'handshake not found' });
      // Ownership: the agreeing user must own the portal the challenge targets.
      const portal = await db.get<{ metadata: { ownerId?: string } | null }>(
        `SELECT metadata FROM portals WHERE id = ?`, inv.portal_id,
      );
      const portalOwner = portal?.metadata?.ownerId;
      if (portalOwner && portalOwner !== ownerOf(req)) {
        return res.status(403).json({ error: 'not the portal owner' });
      }
      const challenge = inv.input as unknown as HandshakeChallenge;
      if (challenge?.kind !== 'trust-handshake') {
        return res.status(400).json({ error: 'not a trust-handshake invocation' });
      }
      const proof = await signHandshakeChallenge(db, inv.portal_id, ownerOf(req), challenge);
      await db.run(
        `UPDATE portal_capability_invocations SET output = ?, status = 'responded', responded_at = NOW() WHERE id = ?`,
        JSON.stringify(proof), inv.id,
      );
      res.json({ agreed: true, responseId: p.data.responseId });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  return router;
}
