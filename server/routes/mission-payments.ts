// ── Missions — Financial Payment REST API (Phase 4) ───────────────────────
//
// All payment-creating endpoints are identity-bound (caller must own a
// `community_identity`). Payment proposal returns the cancel window so the
// UI can show a countdown.
//
// Settings update is a separate endpoint so a mission must explicitly opt
// into a financial budget before any proposal is allowed.

import { Router } from 'express';
import { z } from 'zod';
import type { DatabaseAdapter } from '../db/database.js';
import { createMissionBudget } from '../services/missions/mission-budget.js';
import { resolveCallerIdentity } from '../services/missions/mission-identity.js';
import { safeError } from '../lib/error-response.js';

function sendIdentityError(res: import('express').Response, err: unknown): void {
  const msg = safeError(err);
  if (/not activated/i.test(msg)) { res.status(409).json({ error: msg }); return; }
  if (/does not match/i.test(msg)) { res.status(403).json({ error: msg }); return; }
  res.status(400).json({ error: msg });
}

export function createMissionPaymentRoutes(db: DatabaseAdapter): Router {
  const router = Router();
  // The factory is async — but Express Router doesn't await on registration.
  // We resolve the budget service lazily on first use.
  let _budget: Awaited<ReturnType<typeof createMissionBudget>> | null = null;
  async function budget(): Promise<Awaited<ReturnType<typeof createMissionBudget>>> {
    if (!_budget) _budget = await createMissionBudget(db);
    return _budget;
  }

  // ── Get / update per-mission financial settings ────────────────────────

  router.get('/missions/:id/financial-settings', async (req, res) => {
    try {
      const b = await budget();
      const settings = await b.getMissionFinancialSettings(String(req.params.id));
      res.json({ success: true, settings });
    } catch (err) {
      res.status(404).json({ error: safeError(err) });
    }
  });

  router.put('/missions/:id/financial-settings', async (req, res) => {
    try {
      const schema = z.object({
        financial_budget_max: z.number().min(0).optional(),
        financial_max_per_transaction: z.number().min(0).optional(),
        approved_spend_categories: z.array(z.string().min(1).max(80)).max(50).optional(),
        payment_approval_delay_seconds: z.number().int().min(0).max(86400).optional(),
        payment_requires_human_approval: z.boolean().optional(),
        payment_wallet_id: z.string().nullable().optional(),
      }).strict();
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) { res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }); return; }
      try { await resolveCallerIdentity(db, undefined); }
      catch (err) { sendIdentityError(res, err); return; }
      const b = await budget();
      const settings = await b.updateFinancialSettings(String(req.params.id), parsed.data);
      res.json({ success: true, settings });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  // ── Propose a payment ──────────────────────────────────────────────────

  router.post('/missions/:id/payments/propose', async (req, res) => {
    try {
      const schema = z.object({
        task_id: z.string().optional(),
        recipient_address: z.string().min(8).max(200),
        recipient_label: z.string().max(200).optional(),
        amount_ftc: z.number().positive().max(1_000_000),
        category: z.string().min(1).max(80),
        purpose: z.string().min(1).max(1000),
        wallet_id: z.string().optional(),
      }).strict();
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) { res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }); return; }
      let identity: Awaited<ReturnType<typeof resolveCallerIdentity>>;
      try { identity = await resolveCallerIdentity(db, undefined); }
      catch (err) { sendIdentityError(res, err); return; }
      const b = await budget();
      const proposal = await b.proposePayment({
        missionId: String(req.params.id),
        taskId: parsed.data.task_id,
        recipientAddress: parsed.data.recipient_address,
        recipientLabel: parsed.data.recipient_label,
        amountFtc: parsed.data.amount_ftc,
        category: parsed.data.category,
        purpose: parsed.data.purpose,
        walletId: parsed.data.wallet_id,
      }, identity.contact_hash);
      res.status(201).json({ success: true, payment: proposal });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  // ── Approve / cancel ───────────────────────────────────────────────────

  router.post('/missions/payments/:paymentId/approve', async (req, res) => {
    try {
      let identity: Awaited<ReturnType<typeof resolveCallerIdentity>>;
      try { identity = await resolveCallerIdentity(db, undefined); }
      catch (err) { sendIdentityError(res, err); return; }
      const b = await budget();
      const payment = await b.approvePayment(String(req.params.paymentId), identity.contact_hash);
      res.json({ success: true, payment });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  router.post('/missions/payments/:paymentId/cancel', async (req, res) => {
    try {
      const schema = z.object({ reason: z.string().max(500).optional() }).strict();
      const parsed = schema.safeParse(req.body ?? {});
      if (!parsed.success) { res.status(400).json({ error: 'Validation failed' }); return; }
      let identity: Awaited<ReturnType<typeof resolveCallerIdentity>>;
      try { identity = await resolveCallerIdentity(db, undefined); }
      catch (err) { sendIdentityError(res, err); return; }
      const b = await budget();
      const payment = await b.cancelPayment(String(req.params.paymentId), identity.contact_hash, parsed.data.reason);
      res.json({ success: true, payment });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  // ── Listing + audit ────────────────────────────────────────────────────

  router.get('/missions/:id/payments', async (req, res) => {
    try {
      const b = await budget();
      const payments = await b.listMissionPayments(String(req.params.id));
      res.json({ success: true, payments });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.get('/missions/payments/:paymentId', async (req, res) => {
    try {
      const b = await budget();
      const payment = await b.getPayment(String(req.params.paymentId));
      if (!payment) { res.status(404).json({ error: 'Payment not found' }); return; }
      const log = await b.getPaymentLog(payment.id);
      res.json({ success: true, payment, log });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── Worker tick (executes ready payments) ──────────────────────────────

  router.post('/missions/payments/run-pending', async (_req, res) => {
    try {
      const b = await budget();
      const result = await b.runPendingExecutions();
      res.json({ success: true, ...result });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  return router;
}
