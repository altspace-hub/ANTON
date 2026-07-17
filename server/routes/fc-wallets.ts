import { Router } from 'express';
import type { DatabaseAdapter } from '../db/database.js';
import { createSigningSession, revokeSigningSession, DEFAULT_SIGNING_TTL_MS } from '../services/fc-signing-session.js';

export async function createFCWalletRoutes(db: DatabaseAdapter): Promise<Router> {
  const router = Router();
  // 2026-07-17: construct WITH real-mode deps (bare constructor = permanent stub).
  const { createRealModeFCServices } = await import('../services/fc-real-mode.js');
  const { fcWallet: svc } = await createRealModeFCServices(db);

  router.get('/futurechain/wallets', async (_req, res) => {
    try {
      const wallets = await svc.getWallets();
      res.json(wallets);
    } catch (err) { res.status(500).json({ error: 'Failed to list wallets' }); }
  });

  // ── Signing sessions (LOCAL_PAYMENTS_PLAN Phase 0, wired 2026-07-17) ────
  // Spending in real mode requires an explicit, time-boxed unlock: the browser
  // mints a session here and presents its token on POST /transactions/:id/submit.
  // The token is in-memory only; a restart just forces a re-unlock.
  router.post('/futurechain/wallets/:id/unlock', async (req, res) => {
    try {
      const wallet = await db.get<{ id: string; name: string }>(
        'SELECT id, name FROM fc_wallets WHERE id = ? AND is_active = TRUE', req.params.id,
      );
      if (!wallet) return res.status(404).json({ error: 'Wallet not found' });
      const session = createSigningSession(wallet.id);
      res.json({
        token: session.token,
        walletId: session.walletId,
        expiresAt: session.expiresAt,
        ttlMs: DEFAULT_SIGNING_TTL_MS,
      });
    } catch (err) { res.status(500).json({ error: 'Failed to unlock wallet' }); }
  });

  router.post('/futurechain/wallets/:id/lock', async (req, res) => {
    try {
      const token = String(req.headers['x-signing-session'] ?? req.body?.signingSession ?? '');
      if (token) revokeSigningSession(token);
      res.json({ locked: true });
    } catch (err) { res.status(500).json({ error: 'Failed to lock wallet' }); }
  });

  router.post('/futurechain/wallets/human', async (req, res) => {
    try {
      const { name } = req.body;
      if (!name) return res.status(400).json({ error: 'name is required' });
      const wallet = await svc.createWallet({ name, walletType: 'human' });
      res.status(201).json(wallet);
    } catch (err) { res.status(500).json({ error: 'Failed to create human wallet' }); }
  });

  router.post('/futurechain/wallets/agent', async (req, res) => {
    try {
      const { name, ownerAddress, agentId } = req.body;
      if (!name) return res.status(400).json({ error: 'name is required' });
      const wallet = await svc.createWallet({ name, walletType: 'agent', ownerAddress, agentId });
      res.status(201).json(wallet);
    } catch (err) { res.status(500).json({ error: 'Failed to create agent wallet' }); }
  });

  router.post('/futurechain/wallets/refresh-balances', async (_req, res) => {
    try {
      const wallets = await svc.refreshBalances();
      res.json(wallets);
    } catch (err) { res.status(500).json({ error: 'Failed to refresh balances' }); }
  });

  return router;
}
