import { Router } from 'express';
import type { DatabaseAdapter } from '../db/database.js';

export async function createFCGatewayRoutes(db: DatabaseAdapter) {
  const adminRouter = Router();
  const publicRouter = Router();
  const { createFCGatewayService } = await import('../services/fc-gateway-service.js');
  const svc = await createFCGatewayService(db);

  // ── Admin routes (session auth, /api/futurechain/gateway/*) ──────────

  adminRouter.get('/futurechain/gateway/config', async (_req, res) => {
    try {
      const config = (await svc.getConfig()) ?? {};
      // Mask API key for display
      const key = String(config.api_key ?? '');
      res.json({ ...config, api_key_display: key.length > 8 ? `gw_${'*'.repeat(8)}...${key.slice(-8)}` : key });
    } catch (err) { res.status(500).json({ error: 'Failed to get config' }); }
  });

  adminRouter.put('/futurechain/gateway/config', async (req, res) => {
    try { const config = await svc.updateConfig(req.body); res.json(config); }
    catch (err) { res.status(500).json({ error: 'Failed to update config' }); }
  });

  adminRouter.post('/futurechain/gateway/regenerate-key', async (_req, res) => {
    try { const key = await svc.regenerateApiKey(); res.json({ apiKey: key }); }
    catch (err) { res.status(500).json({ error: 'Failed to regenerate key' }); }
  });

  adminRouter.get('/futurechain/gateway/audit-log', async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
      res.json(await svc.getAuditLog(limit));
    } catch (err) { res.status(500).json({ error: 'Failed to get audit log' }); }
  });

  adminRouter.get('/futurechain/gateway/stats', async (_req, res) => {
    try { res.json(await svc.getStats()); }
    catch (err) { res.status(500).json({ error: 'Failed to get stats' }); }
  });

  // ── Public gateway routes (API key auth, /api/gateway/*) ─────────────

  // Auth middleware
  publicRouter.use(async (req, res, next) => {
    // /gateway/status doesn't need auth
    if (req.path === '/status') return next();
    const key = req.headers['x-gateway-key'] as string;
    if (!key) return res.status(401).json({ error: 'Missing x-gateway-key header' });
    const { valid, config } = await svc.validateApiKey(key);
    if (!valid) { await svc.logAction('auth_failed', req.ip, null, 'error', undefined, 'Invalid API key'); return res.status(401).json({ error: 'Invalid API key' }); }
    if (!config?.enabled) return res.status(403).json({ error: 'Gateway is disabled' });
    (req as unknown as Record<string, unknown>).gatewayConfig = config;
    next();
  });

  publicRouter.get('/status', async (_req, res) => {
    try {
      const config = await svc.getConfig();
      res.json({ enabled: !!config?.enabled, version: '1.0.0' });
    } catch { res.json({ enabled: false, version: '1.0.0' }); }
  });

  publicRouter.get('/balance', async (req, res) => {
    try {
      const perm = await svc.checkPermission('balance_check', (req as unknown as Record<string, unknown>).gatewayConfig as Record<string, unknown>);
      if (!perm.allowed) return res.status(403).json({ error: perm.reason });
      const { createRealModeFCServices } = await import('../services/fc-real-mode.js');
      const { fcWallet: walletService } = await createRealModeFCServices(db);
      const wallets = await walletService.getWallets();
      await svc.logAction('balance_check', req.ip, null, 'success');
      res.json(wallets.map((w) => ({ name: w.name, type: w.wallet_type, address: w.address, balance_ftc: w.balance_ftc })));
    } catch (err) { res.status(500).json({ error: 'Failed to get balance' }); }
  });

  publicRouter.get('/contacts/:hash', async (req, res) => {
    try {
      const perm = await svc.checkPermission('contact_lookup', (req as unknown as Record<string, unknown>).gatewayConfig as Record<string, unknown>);
      if (!perm.allowed) return res.status(403).json({ error: perm.reason });
      const conn = await db.get(
        "SELECT display_name, payment_address, payment_name, payment_country, agent_wallet_address FROM community_connections WHERE contact_hash = ? AND status = 'accepted'",
        req.params.hash
      );
      await svc.logAction('contact_lookup', req.ip, { contactHash: req.params.hash }, 'success');
      res.json(conn ?? { error: 'Contact not found' });
    } catch (err) { res.status(500).json({ error: 'Failed to lookup contact' }); }
  });

  publicRouter.post('/pay', async (req, res) => {
    try {
      const perm = await svc.checkPermission('send_payment', (req as unknown as Record<string, unknown>).gatewayConfig as Record<string, unknown>);
      if (!perm.allowed) return res.status(403).json({ error: perm.reason });
      const { contactHash, toAddress, amount, purpose, nature, goal } = req.body;
      if (!amount || amount <= 0) return res.status(400).json({ error: 'amount must be positive' });
      const result = await svc.processPayment({ contactHash, toAddress, amount: Number(amount), purpose, nature, goal });
      await svc.logAction('send_payment', req.ip, req.body, 'success', Number(amount));
      res.json(result);
    } catch (err) {
      const msg = (err as Error).message;
      await svc.logAction('send_payment', req.ip, req.body, 'error', req.body?.amount, msg);
      res.status(400).json({ error: msg });
    }
  });

  publicRouter.get('/transactions', async (req, res) => {
    try {
      const perm = await svc.checkPermission('balance_check', (req as unknown as Record<string, unknown>).gatewayConfig as Record<string, unknown>);
      if (!perm.allowed) return res.status(403).json({ error: perm.reason });
      const { createRealModeFCServices } = await import('../services/fc-real-mode.js');
      const { fcTx: txService } = await createRealModeFCServices(db);
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
      const txs = await txService.listTransactions({ limit });
      await svc.logAction('list_transactions', req.ip, null, 'success');
      res.json(txs);
    } catch (err) { res.status(500).json({ error: 'Failed to list transactions' }); }
  });

  return { adminRouter, publicRouter };
}
