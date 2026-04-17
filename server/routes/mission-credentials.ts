// ── Missions — Credential Vault REST API (Phase 2) ─────────────────────────
//
// SECURITY: secrets are NEVER returned in responses. Only metadata + masked
// info goes out. The actual decrypted secret is only available to server-side
// execution paths via createCredentialVault().resolveSecret().

import { Router } from 'express';
import { z } from 'zod';
import type { DatabaseAdapter } from '../db/database.js';
import { createCredentialVault } from '../services/missions/mission-credential-vault.js';
import { resolveCallerIdentity, resolveUserId } from '../services/missions/mission-identity.js';
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
      const credentials = await vault.listCredentials({ service });
      res.json({ success: true, credentials });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.get('/credentials/:id', async (req, res) => {
    try {
      const cred = await vault.getCredentialMeta(String(req.params.id));
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
      const userId = await resolveUserId(db);
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
      await vault.rotateCredential(String(req.params.id), parsed.data.secret);
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  router.delete('/credentials/:id', async (req, res) => {
    try {
      try { await resolveCallerIdentity(db, undefined); }
      catch (err) { sendIdentityError(res, err); return; }
      await vault.revokeCredential(String(req.params.id));
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  router.get('/credentials/:id/access-log', async (req, res) => {
    try {
      const limit = req.query.limit ? Math.min(Number(req.query.limit), 1000) : 100;
      const log = await vault.listAccessLog(String(req.params.id), limit);
      res.json({ success: true, access_log: log });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  return router;
}
