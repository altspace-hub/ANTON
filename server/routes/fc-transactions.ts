import { Router } from 'express';
import type { DatabaseAdapter } from '../db/database.js';
import { assertSigningSession, SigningSessionError } from '../services/fc-signing-session.js';

export async function createFCTransactionRoutes(db: DatabaseAdapter): Promise<Router> {
  const router = Router();
  // 2026-07-17: construct WITH real-mode deps — the bare constructor hard-returns
  // stub behavior, which made stub_mode=false a no-op on this route.
  const { createRealModeFCServices } = await import('../services/fc-real-mode.js');
  const { fcTx: svc, isRealMode } = await createRealModeFCServices(db);

  router.post('/futurechain/transactions/build', async (req, res) => {
    try {
      const { fromAddress, toAddress, amountFtc, walletType, purpose, nature, goal, taskRef } = req.body;
      if (!fromAddress || !toAddress || !amountFtc || !walletType) {
        return res.status(400).json({ error: 'fromAddress, toAddress, amountFtc, walletType are required' });
      }
      const tx = await svc.buildTransaction({ fromAddress, toAddress, amountFtc: Number(amountFtc), walletType, purpose, nature, goal, taskRef });
      res.status(201).json(tx);
    } catch (err) { res.status(500).json({ error: 'Failed to build transaction' }); }
  });

  router.get('/futurechain/transactions', async (req, res) => {
    try {
      const status = req.query.status as string | undefined;
      const limit = req.query.limit ? Number(req.query.limit) : undefined;
      const txs = await svc.listTransactions({ status, limit });
      res.json(txs);
    } catch (err) { res.status(500).json({ error: 'Failed to list transactions' }); }
  });

  router.get('/futurechain/transactions/:id', async (req, res) => {
    try {
      const tx = await svc.getTransaction(req.params.id);
      if (!tx) return res.status(404).json({ error: 'Transaction not found' });
      res.json(tx);
    } catch (err) { res.status(500).json({ error: 'Failed to get transaction' }); }
  });

  router.post('/futurechain/transactions/:id/submit', async (req, res) => {
    try {
      // Signing-session enforcement (LOCAL_PAYMENTS_PLAN Phase 0, wired
      // 2026-07-17): in REAL mode a spend must be an explicit, time-boxed
      // action — the browser first unlocks the wallet
      // (POST /futurechain/wallets/:id/unlock) and presents the minted token
      // here. Stub mode stays tokenless (nothing real moves). Mission payments
      // use the service directly under their own approval gates.
      if (await isRealMode()) {
        const tx = await svc.getTransaction(req.params.id) as { from_address?: string } | undefined;
        if (!tx) return res.status(404).json({ error: 'Transaction not found' });
        const wallet = await db.get<{ id: string }>(
          'SELECT id FROM fc_wallets WHERE address = ? AND is_active = TRUE', tx.from_address,
        );
        if (!wallet) return res.status(400).json({ error: 'Sender wallet not found' });
        const token = String(req.headers['x-signing-session'] ?? req.body?.signingSession ?? '');
        try {
          assertSigningSession(token, wallet.id);
        } catch (e) {
          if (e instanceof SigningSessionError) {
            return res.status(401).json({ error: 'Signing session missing, expired, or for a different wallet — unlock the wallet and retry' });
          }
          throw e;
        }
      }
      const result = await svc.submitTransaction(req.params.id);
      res.json(result);
    } catch (err) { res.status(500).json({ error: 'Failed to submit transaction' }); }
  });

  // Auto-fill creditor info from contact's payment details
  router.get('/futurechain/transactions/autofill/:contactHash', async (req, res) => {
    try {
      const conn = await db.get(
        `SELECT payment_address, payment_name, payment_country, payment_street, payment_city, payment_postal_code,
                agent_wallet_address, agent_wallet_name, display_name
         FROM community_connections WHERE contact_hash = ? AND status = 'accepted'`,
        req.params.contactHash
      );
      if (!conn) return res.status(404).json({ error: 'Contact not found' });
      res.json({
        toAddress: conn.payment_address ?? conn.agent_wallet_address ?? '',
        creditorName: conn.payment_name ?? conn.display_name ?? '',
        creditorCountry: conn.payment_country ?? '',
        creditorStreet: conn.payment_street ?? '',
        creditorCity: conn.payment_city ?? '',
        creditorPostalCode: conn.payment_postal_code ?? '',
        agentWalletAddress: conn.agent_wallet_address ?? '',
        agentWalletName: conn.agent_wallet_name ?? '',
      });
    } catch (err) { res.status(500).json({ error: 'Failed to get contact payment info' }); }
  });

  return router;
}
