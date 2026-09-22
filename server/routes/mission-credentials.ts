// ── Missions — Credential Vault REST API (Phase 2) ─────────────────────────
//
// SECURITY: secrets are NEVER returned in responses. Only metadata + masked
// info goes out. The actual decrypted secret is only available to server-side
// execution paths via createCredentialVault().resolveSecret().
//
// ── Ownership (2026-09) ────────────────────────────────────────────────────
//
// The vault service has taken a CredentialOwnerScope on every API-facing read and
// write since it was written, defaulting to UNSCOPED. Not one route passed it, so
// every endpoint below operated instance-wide: on a DEPLOYMENT_MODE=team install any
// authenticated user could list, inspect, rotate, revoke and read the access log of
// every other user's stored credentials. A complete scope API with no caller reads as
// finished work, which is why it survived — the routes are the half that was missing.
//
// Two changes, and the second is load-bearing for the first. Every call site now
// passes ownerFilter(req, 'created_by'). And createCredential is stamped with the
// AUTHENTICATED caller instead of resolveUserId(db), which ignores the request
// entirely: it returns community_identity.user_id, else the 'solo'/'default'
// sentinel, else whichever account happens to sort first by created_at. Scoping the
// reads without that would have been worse than leaving it open — a non-admin would
// create a credential, have it stamped with somebody else's id, and immediately lose
// sight of it.
//
// Pre-existing rows keep whatever sentinel resolveUserId picked, so in team mode a
// non-admin cannot see them: the same fail-closed treatment of unattributed rows that
// middleware/ownership.ts documents. Admins still see everything, and solo mode is
// unscoped, so a single-operator install is unaffected.

import { Router } from 'express';
import { z } from 'zod';
import type { DatabaseAdapter } from '../db/database.js';
import { createCredentialVault } from '../services/missions/mission-credential-vault.js';
import { resolveCallerIdentity } from '../services/missions/mission-identity.js';
import { ownerFilter } from '../middleware/ownership.js';
import { safeError } from '../lib/error-response.js';

const createSchema = z.object({
  name: z.string().min(1).max(200),
  credential_type: z.enum(['api_key', 'oauth2', 'username_password', 'client_certificate', 'cookie_jar', 'bearer_token']),
  service_name: z.string().max(100).optional(),
  secret: z.string().min(1).max(50_000),
  oauth_token_url: z.string().url().max(500).optional(),
  oauth_refresh_token: z.string().max(50_000).optional(),
  oauth_expires_at: z.string().optional(),
  oauth_scopes: z.string().max(2000).optional(),
  allowed_mission_templates: z.array(z.string()).optional(),
  allowed_services: z.array(z.string()).optional(),
  expires_at: z.string().optional(),
}).strict();

const rotateSchema = z.object({
  secret: z.string().min(1).max(50_000),
}).strict();

/**
 * 'Credential not found' is what the vault throws when the SCOPED lookup misses — for a
 * row that does not exist and for one belonging to another user alike. It must answer
 * 404, not the 400 these handlers used to give everything: a distinct status would turn
 * a credential id into an existence oracle, which is the same reason loadOwnedRow
 * answers 404 rather than 403.
 */
function sendVaultError(res: import('express').Response, err: unknown): void {
  const msg = safeError(err);
  if (/not found/i.test(msg)) { res.status(404).json({ error: msg }); return; }
  res.status(400).json({ error: msg });
}

function sendIdentityError(res: import('express').Response, err: unknown): void {
  const msg = safeError(err);
  if (/not activated/i.test(msg)) { res.status(409).json({ error: msg }); return; }
  if (/does not match/i.test(msg)) { res.status(403).json({ error: msg }); return; }
  res.status(400).json({ error: msg });
}

export function createMissionCredentialRoutes(db: DatabaseAdapter): Router {
  const router = Router();
  const vault = createCredentialVault(db);

  router.get('/credentials', async (req, res) => {
    try {
      const service = req.query.service as string | undefined;
      const credentials = await vault.listCredentials({ service }, ownerFilter(req, 'created_by'));
      res.json({ success: true, credentials });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.get('/credentials/:id', async (req, res) => {
    try {
      const cred = await vault.getCredentialMeta(String(req.params.id), ownerFilter(req, 'created_by'));
      if (!cred) { res.status(404).json({ error: 'Credential not found' }); return; }
      res.json({ success: true, credential: cred });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.post('/credentials', async (req, res) => {
    try {
      const parsed = createSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
        return;
      }
      try { await resolveCallerIdentity(db, undefined); }
      catch (err) { sendIdentityError(res, err); return; }
      // The caller, not the instance. created_by is NOT NULL with an FK to users(id),
      // and req.user is stamped by authMiddleware in both modes ('solo' in solo, which
      // is a real row), so this always satisfies it. No identity means no owner to
      // record, and a credential nobody can be scoped to is not worth storing.
      const userId = req.user?.id;
      if (!userId) { res.status(401).json({ error: 'Authentication required' }); return; }
      const cred = await vault.createCredential(parsed.data, userId);
      res.status(201).json({ success: true, credential: cred });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  router.post('/credentials/:id/rotate', async (req, res) => {
    try {
      const parsed = rotateSchema.safeParse(req.body);
      if (!parsed.success) { res.status(400).json({ error: 'Validation failed' }); return; }
      try { await resolveCallerIdentity(db, undefined); }
      catch (err) { sendIdentityError(res, err); return; }
      await vault.rotateCredential(String(req.params.id), parsed.data.secret, ownerFilter(req, 'created_by'));
      res.json({ success: true });
    } catch (err) {
      sendVaultError(res, err);
    }
  });

  router.delete('/credentials/:id', async (req, res) => {
    try {
      try { await resolveCallerIdentity(db, undefined); }
      catch (err) { sendIdentityError(res, err); return; }
      await vault.revokeCredential(String(req.params.id), ownerFilter(req, 'created_by'));
      res.json({ success: true });
    } catch (err) {
      sendVaultError(res, err);
    }
  });

  router.get('/credentials/:id/access-log', async (req, res) => {
    try {
      const limit = req.query.limit ? Math.min(Number(req.query.limit), 1000) : 100;
      // Scoped like the rest: another user's credential yields an empty log rather
      // than a 404, which is the same answer a nonexistent id gives — no oracle.
      const log = await vault.listAccessLog(String(req.params.id), limit, ownerFilter(req, 'created_by'));
      res.json({ success: true, access_log: log });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  return router;
}
