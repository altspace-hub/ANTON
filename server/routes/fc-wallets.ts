import { Router } from 'express';
import type { DatabaseAdapter } from '../db/database.js';

export async function createFCWalletRoutes(db: DatabaseAdapter): Promise<Router> {
  const router = Router();
  const { createFCWalletService } = await import('../services/fc-wallet-service.js');
  const svc = await createFCWalletService(db);

  router.get('/futurechain/wallets', async (_req, res) => {
    try {
      const wallets = await svc.getWallets();
      res.json(wallets);
    } catch (err) { res.status(500).json({ error: 'Failed to list wallets' }); }
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
