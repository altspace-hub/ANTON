// ── Missions — AAP Delegation REST API (Phase 5) ──────────────────────────
//
// Outbound (originator side):
//   POST   /missions/:id/tasks/:taskId/delegate     — create draft delegation
//   POST   /missions/delegations/:dId/send          — sign and queue for AAP transport
//   POST   /missions/delegations/:dId/cancel
//   POST   /missions/delegations/:dId/approve       — approve returned result
//   POST   /missions/delegations/:dId/reject
//
// Inbound (recipient side):
//   GET    /missions/delegations/inbound            — pending inbound delegations
//   POST   /missions/delegations/:dId/accept        — accept + create sub-mission
//   POST   /missions/delegations/:dId/decline
//   POST   /missions/delegations/:dId/submit-result — sign and return to originator
//
// Inbound P2P transport hook:
//   POST   /missions/p2p/receive                    — called by community P2P;
//                                                    routes mission_delegation
//                                                    + mission_delegation_result
//
// Shared:
//   GET    /missions/:id/delegations                — all delegations linked to a mission
//   GET    /missions/delegations/:dId               — single + audit log

import { Router } from 'express';
import { z } from 'zod';
import type { DatabaseAdapter } from '../db/database.js';
import { createMissionDelegation } from '../services/missions/mission-delegation.js';
import { resolveCallerIdentity } from '../services/missions/mission-identity.js';
import { safeError } from '../lib/error-response.js';

function sendIdentityError(res: import('express').Response, err: unknown): void {
  const msg = safeError(err);
  if (/not activated/i.test(msg)) { res.status(409).json({ error: msg }); return; }
  if (/does not match/i.test(msg)) { res.status(403).json({ error: msg }); return; }
  res.status(400).json({ error: msg });
}

export function createMissionDelegationRoutes(db: DatabaseAdapter): Router {
  const router = Router();
  let _service: Awaited<ReturnType<typeof createMissionDelegation>> | null = null;
  async function service(): Promise<Awaited<ReturnType<typeof createMissionDelegation>>> {
    if (!_service) _service = await createMissionDelegation(db);
    return _service;
  }

  const briefSchema = z.object({
    title: z.string().min(1).max(200),
    objective: z.string().min(1).max(8000),
    context: z.record(z.string(), z.unknown()).optional(),
    requiredModules: z.array(z.string().min(1).max(80)).max(20).optional(),
    expectedOutput: z.string().max(8000).optional(),
    deadline: z.string().datetime().optional(),
    paymentAmountFtc: z.number().min(0).max(1_000_000).optional(),
  }).strict();

  // ── Outbound: create + send ────────────────────────────────────────────

  router.post('/missions/:id/tasks/:taskId/delegate', async (req, res) => {
    try {
      const schema = z.object({
        peer_contact_hash: z.string().min(8).max(200),
        brief: briefSchema,
      }).strict();
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) { res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }); return; }
      try { await resolveCallerIdentity(db, undefined); }
      catch (err) { sendIdentityError(res, err); return; }
      const s = await service();
      const delegation = await s.createOutboundDelegation({
        missionId: String(req.params.id),
        taskId: String(req.params.taskId),
        peerContactHash: parsed.data.peer_contact_hash,
        brief: parsed.data.brief,
      });
      res.status(201).json({ success: true, delegation });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  router.post('/missions/delegations/:dId/send', async (req, res) => {
    try {
      try { await resolveCallerIdentity(db, undefined); }
      catch (err) { sendIdentityError(res, err); return; }
      const s = await service();
      const delegation = await s.sendDelegation(String(req.params.dId));
      res.json({ success: true, delegation });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  router.post('/missions/delegations/:dId/cancel', async (req, res) => {
    try {
      const schema = z.object({ reason: z.string().max(500).optional() }).strict();
      const parsed = schema.safeParse(req.body ?? {});
      if (!parsed.success) { res.status(400).json({ error: 'Validation failed' }); return; }
      let identity;
      try { identity = await resolveCallerIdentity(db, undefined); }
      catch (err) { sendIdentityError(res, err); return; }
      const s = await service();
      const delegation = await s.cancelOutbound(String(req.params.dId), identity.contact_hash, parsed.data.reason);
      res.json({ success: true, delegation });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  router.post('/missions/delegations/:dId/approve', async (req, res) => {
    try {
      let identity;
      try { identity = await resolveCallerIdentity(db, undefined); }
      catch (err) { sendIdentityError(res, err); return; }
      const s = await service();
      const delegation = await s.approveResult(String(req.params.dId), identity.contact_hash);
      res.json({ success: true, delegation });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  router.post('/missions/delegations/:dId/reject', async (req, res) => {
    try {
      const schema = z.object({ reason: z.string().min(1).max(500) }).strict();
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) { res.status(400).json({ error: 'Validation failed' }); return; }
      let identity;
      try { identity = await resolveCallerIdentity(db, undefined); }
      catch (err) { sendIdentityError(res, err); return; }
      const s = await service();
      const delegation = await s.rejectResult(String(req.params.dId), identity.contact_hash, parsed.data.reason);
      res.json({ success: true, delegation });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  // ── Inbound: list + accept/decline + submit-result ─────────────────────

  router.get('/missions/delegations/inbound', async (_req, res) => {
    try {
      const s = await service();
      const items = await s.listInbound();
      res.json({ success: true, delegations: items });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.post('/missions/delegations/:dId/accept', async (req, res) => {
    try {
      const schema = z.object({ create_sub_mission: z.boolean().optional() }).strict();
      const parsed = schema.safeParse(req.body ?? {});
      if (!parsed.success) { res.status(400).json({ error: 'Validation failed' }); return; }
      let identity;
      try { identity = await resolveCallerIdentity(db, undefined); }
      catch (err) { sendIdentityError(res, err); return; }
      const s = await service();
      const delegation = await s.acceptInbound(String(req.params.dId), identity.contact_hash, { createSubMission: parsed.data.create_sub_mission });
      res.json({ success: true, delegation });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  router.post('/missions/delegations/:dId/decline', async (req, res) => {
    try {
      const schema = z.object({ reason: z.string().max(500).optional() }).strict();
      const parsed = schema.safeParse(req.body ?? {});
      if (!parsed.success) { res.status(400).json({ error: 'Validation failed' }); return; }
      let identity;
      try { identity = await resolveCallerIdentity(db, undefined); }
      catch (err) { sendIdentityError(res, err); return; }
      const s = await service();
      const delegation = await s.declineInbound(String(req.params.dId), identity.contact_hash, parsed.data.reason);
      res.json({ success: true, delegation });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  router.post('/missions/delegations/:dId/submit-result', async (req, res) => {
    try {
      const schema = z.object({
        payload: z.record(z.string(), z.unknown()),
        files: z.array(z.object({
          filename: z.string(),
          content: z.string().optional(),
          path: z.string().optional(),
        })).optional(),
      }).strict();
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) { res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }); return; }
      let identity;
      try { identity = await resolveCallerIdentity(db, undefined); }
      catch (err) { sendIdentityError(res, err); return; }
      const s = await service();
      const delegation = await s.submitInboundResult(String(req.params.dId), identity.contact_hash, parsed.data);
      res.json({ success: true, delegation });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  // ── Inbound P2P transport hook ─────────────────────────────────────────
  //
  // The community P2P receiver dispatches messages by message_type. For
  // 'mission_delegation' and 'mission_delegation_result' it forwards here.
  // This endpoint is intentionally NOT identity-bound on the caller — the
  // signature on the payload is what authenticates the sender.

  router.post('/missions/p2p/receive', async (req, res) => {
    try {
      const schema = z.object({
        kind: z.enum(['mission_delegation', 'mission_delegation_result']),
        mail_id: z.string().optional(),
        // Delegation request payload
        delegation_id: z.string().min(8),
        from_contact_hash: z.string().optional(),
        from_display_name: z.string().optional(),
        brief: briefSchema.optional(),
        signature: z.string().optional(),
        signer_public_key: z.string().optional(),
        // Result payload
        result_signed: z.object({
          payload_json: z.string(),
          signature_b64: z.string(),
          signer_public_key: z.string(),
          signer_contact_hash: z.string(),
          files: z.array(z.object({
            filename: z.string(),
            content: z.string().optional(),
            path: z.string().optional(),
          })).optional(),
        }).optional(),
      }).strict();
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) { res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }); return; }
      const s = await service();
      if (parsed.data.kind === 'mission_delegation') {
        if (!parsed.data.brief || !parsed.data.signature || !parsed.data.signer_public_key || !parsed.data.from_contact_hash) {
          res.status(400).json({ error: 'mission_delegation requires brief, from_contact_hash, signature, signer_public_key' }); return;
        }
        const delegation = await s.receiveDelegation({
          delegationId: parsed.data.delegation_id,
          fromContactHash: parsed.data.from_contact_hash,
          fromDisplayName: parsed.data.from_display_name,
          brief: parsed.data.brief,
          signature: parsed.data.signature,
          signerPublicKey: parsed.data.signer_public_key,
        }, parsed.data.mail_id ?? null);
        res.status(201).json({ success: true, delegation });
        return;
      }
      // result kind
      if (!parsed.data.result_signed) { res.status(400).json({ error: 'mission_delegation_result requires result_signed' }); return; }
      const delegation = await s.receiveDelegationResult(parsed.data.delegation_id, parsed.data.result_signed);
      res.json({ success: true, delegation });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  // ── Listings ───────────────────────────────────────────────────────────

  router.get('/missions/:id/delegations', async (req, res) => {
    try {
      const s = await service();
      const delegations = await s.listMissionDelegations(String(req.params.id));
      res.json({ success: true, delegations });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.get('/missions/delegations/:dId', async (req, res) => {
    try {
      const s = await service();
      const delegation = await s.getDelegation(String(req.params.dId));
      if (!delegation) { res.status(404).json({ error: 'Delegation not found' }); return; }
      const log = await s.getDelegationLog(delegation.id);
      res.json({ success: true, delegation, log });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  return router;
}
