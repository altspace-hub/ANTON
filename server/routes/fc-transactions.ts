import { Router } from 'express';
import type { DatabaseAdapter } from '../db/database.js';

export async function createFCTransactionRoutes(db: DatabaseAdapter): Promise<Router> {
  const router = Router();
  const { createFCTransactionService } = await import('../services/fc-transaction-service.js');
  const svc = await createFCTransactionService(db);

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
      const result = await svc.submitTransaction(req.params.id);
      res.json(result);
    } catch (err) { res.status(500).json({ error: 'Failed to submit transaction' }); }
  });

  return router;
}
