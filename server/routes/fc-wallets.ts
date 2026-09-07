import { Router } from 'express';
import type { DatabaseAdapter } from '../db/database.js';
import { createSigningSession, revokeSigningSession, DEFAULT_SIGNING_TTL_MS } from '../services/fc-signing-session.js';
import { ownerFilter } from '../middleware/ownership.js';
import { loadOwnedRow, respondToRowAccessError } from '../lib/owned-row.js';

/**
 * fc-wallets.ts — desktop FutureChain wallet routes.
 *
 * ── Ownership (2026-09 team-mode audit) ─────────────────────────────────────
 *
 * fc_wallets had no user column at all until migration 265, so none of these
 * routes could express a tenant predicate and none tried. On a
 * DEPLOYMENT_MODE=team install that meant: GET /wallets listed every wallet on
 * the instance, and POST /wallets/:id/unlock took the id alone and handed back a
 * signing session for it. That session IS the spend gate (fc-transactions.ts) and
 * the private keys are server-custodial, so a role-'viewer' account could unlock a
 * colleague's wallet and have the server sign a payment out of it.
 *
 * Every route below is now scoped on `owner_user_id`, via the shared helpers so
 * the three properties stay in one place: solo mode is a pass-through (one
 * operator, and wallets predating the column are unattributed), admins are not
 * scoped, and a miss answers 404 rather than 403 so a wallet id cannot be used to
 * confirm another tenant's wallet exists.
 *
 * Do not "simplify" any of these back to a bare `WHERE id = ?`: on this surface
 * that is not an information leak, it is a spend.
 */
export async function createFCWalletRoutes(db: DatabaseAdapter): Promise<Router> {
  const router = Router();
  // 2026-07-17: construct WITH real-mode deps (bare constructor = permanent stub).
  const { createRealModeFCServices } = await import('../services/fc-real-mode.js');
  const { fcWallet: svc } = await createRealModeFCServices(db);

  router.get('/futurechain/wallets', async (req, res) => {
    try {
      const wallets = await svc.getWallets(ownerFilter(req, 'owner_user_id'));
      res.json(wallets);
    } catch (err) { res.status(500).json({ error: 'Failed to list wallets' }); }
  });

  // ── Signing sessions (LOCAL_PAYMENTS_PLAN Phase 0, wired 2026-07-17) ────
  // Spending in real mode requires an explicit, time-boxed unlock: the browser
  // mints a session here and presents its token on POST /transactions/:id/submit.
  // The token is in-memory only; a restart just forces a re-unlock.
  router.post('/futurechain/wallets/:id/unlock', async (req, res) => {
    try {
      // loadOwnedRow rather than a hand-rolled `WHERE id = ? AND owner_user_id = ?`:
      // it IS the fetch, so this handler cannot end up holding a wallet row it never
      // checked. is_active is still verified here because the helper takes no extra
      // predicate — and it must stay verified, or a deactivated wallet becomes
      // spendable again.
      const wallet = await loadOwnedRow<{ id: string; name: string; is_active: boolean }>(db, req, {
        table: 'fc_wallets',
        ownerColumn: 'owner_user_id',
        id: req.params.id,
        columns: ['id', 'name', 'is_active'],
        notFoundMessage: 'Wallet not found',
      });
      if (!wallet.is_active) return res.status(404).json({ error: 'Wallet not found' });
      const session = createSigningSession(wallet.id);
      res.json({
        token: session.token,
        walletId: session.walletId,
        expiresAt: session.expiresAt,
        ttlMs: DEFAULT_SIGNING_TTL_MS,
      });
    } catch (err) {
      // FIRST in the catch: below the generic arm, a 404 would be answered as a 500.
      if (respondToRowAccessError(err, res)) return;
      res.status(500).json({ error: 'Failed to unlock wallet' });
    }
  });

  router.post('/futurechain/wallets/:id/lock', async (req, res) => {
    try {
      // Deliberately NOT owner-scoped: this revokes the token the caller presents,
      // and a caller can only present a token that was minted for them. There is
      // nothing here to reach across tenants with.
      const token = String(req.headers['x-signing-session'] ?? req.body?.signingSession ?? '');
      if (token) revokeSigningSession(token);
      res.json({ locked: true });
    } catch (err) { res.status(500).json({ error: 'Failed to lock wallet' }); }
  });

  router.post('/futurechain/wallets/human', async (req, res) => {
    try {
      const { name } = req.body;
      if (!name) return res.status(400).json({ error: 'name is required' });
      // Stamp the creator. Without this every new wallet is unattributed and, in
      // team mode, invisible to the person who just made it.
      const wallet = await svc.createWallet({ name, walletType: 'human', ownerUserId: req.user?.id ?? null });
      res.status(201).json(wallet);
    } catch (err) { res.status(500).json({ error: 'Failed to create human wallet' }); }
  });

  router.post('/futurechain/wallets/agent', async (req, res) => {
    try {
      const { name, ownerAddress, agentId } = req.body;
      if (!name) return res.status(400).json({ error: 'name is required' });
      const wallet = await svc.createWallet({
        name, walletType: 'agent', ownerAddress, agentId,
        ownerUserId: req.user?.id ?? null,
      });
      res.status(201).json(wallet);
    } catch (err) { res.status(500).json({ error: 'Failed to create agent wallet' }); }
  });

  router.post('/futurechain/wallets/refresh-balances', async (req, res) => {
    try {
      // Scoped for the response as much as the refresh: an unscoped call returns
      // every wallet on the instance, which is the same leak the list route had.
      const wallets = await svc.refreshBalances(ownerFilter(req, 'owner_user_id'));
      res.json(wallets);
    } catch (err) { res.status(500).json({ error: 'Failed to refresh balances' }); }
  });

  return router;
}
