// ── Beehive REST API ────────────────────────────────────────────────────────
// Phase 1: hive lifecycle + participants. No contributions/rounds/synthesis
// yet — those land in Phase 2/3.
//
// Identity model (Phase 1 local-only):
//   Every operation that names a "who" (create Queen, invite, join, leave,
//   archive) is bound to the locally activated community identity. The client
//   MAY supply the hash for UX clarity, but the server always validates it
//   against `community_identity` and rejects mismatches. This prevents the
//   client from impersonating an arbitrary ANTON. Phase 4 will replace this
//   with Ed25519 signature verification on AAP messages.

import { Router } from 'express';
import { z } from 'zod';
import type { DatabaseAdapter } from '../db/database.js';
import { createBeehiveManager } from '../services/beehive/beehive-manager.js';
import { resolveCallerIdentity, getLocalIdentity } from '../services/beehive/beehive-identity.js';
import { safeError } from '../lib/error-response.js';

// ── Validation schemas ─────────────────────────────────────────────────────

const disclosurePolicySchema = z.object({
  level: z.enum(['reasoning_only', 'atoms_tagged', 'atoms_domain', 'full_context']).optional(),
  excluded_clients: z.array(z.string()).optional(),
  excluded_tags: z.array(z.string()).optional(),
  redact_names: z.boolean().optional(),
  max_atoms_shared: z.number().int().min(0).max(500).optional(),
  require_human_approval: z.boolean().optional(),
}).strict();

const governanceSchema = z.object({
  consensus_mode: z.enum(['unanimous', 'supermajority', 'majority', 'queen_decides', 'no_consensus']).optional(),
  max_rounds: z.number().int().min(1).max(50).optional(),
  round_timeout_minutes: z.number().int().min(1).max(1440).optional(),
  min_contributions_per_round: z.number().int().min(0).max(20).optional(),
  convergence_threshold: z.number().min(0).max(1).optional(),
  allow_human_injection: z.boolean().optional(),
  allow_late_join: z.boolean().optional(),
  require_dissent_on_disagree: z.boolean().optional(),
  output_format: z.enum(['synthesis_report', 'anton_bundle', 'artifact', 'raw_trail']).optional(),
}).strict();

const createHiveSchema = z.object({
  name: z.string().min(1).max(200),
  question: z.string().min(1).max(4000),
  description: z.string().max(8000).optional(),
  type: z.enum(['deliberation', 'build', 'review', 'brainstorm']),
  governance: governanceSchema.optional(),
  max_participants: z.number().int().min(2).max(50).optional(),
  ttl_hours: z.number().int().min(1).max(720).optional(),
  // Server reads Queen identity from local community_identity and validates
  // any claim the client sends matches it. These fields are optional; when
  // absent, the server uses the local identity's display name.
  queen_contact_hash: z.string().min(1).optional(),
  queen_display_name: z.string().min(1).max(100).optional(),
  queen_disclosure_policy: disclosurePolicySchema.optional(),
}).strict();

const inviteSchema = z.object({
  anton_contact_hash: z.string().min(1),
  display_name: z.string().min(1).max(100),
  role: z.enum(['queen', 'worker', 'scout', 'observer']),
  // invited_by is the Queen — validated against local identity server-side
  invited_by: z.string().min(1).optional(),
}).strict();

const joinSchema = z.object({
  anton_contact_hash: z.string().min(1).optional(),
  display_name: z.string().min(1).max(100).optional(),
  disclosure_policy: disclosurePolicySchema.optional(),
}).strict();

const leaveSchema = z.object({
  anton_contact_hash: z.string().min(1).optional(),
}).strict();

const updateDisclosureSchema = z.object({
  anton_contact_hash: z.string().min(1).optional(),
  disclosure_policy: disclosurePolicySchema,
}).strict();

// ── Helpers ────────────────────────────────────────────────────────────────

/** Convert identity-related errors to the right HTTP status. */
function sendIdentityError(res: import('express').Response, err: unknown): void {
  const msg = safeError(err);
  if (/not activated/i.test(msg)) {
    res.status(409).json({ error: msg });
    return;
  }
  if (/does not match/i.test(msg)) {
    res.status(403).json({ error: msg });
    return;
  }
  res.status(400).json({ error: msg });
}

// ── Route factory ───────────────────────────────────────────────────────────

export function createBeehiveRoutes(db: DatabaseAdapter): Router {
  const router = Router();
  const manager = createBeehiveManager(db);

  // GET /api/beehive/hives — list (filter by status, createdBy)
  router.get('/beehive/hives', async (req, res) => {
    try {
      const statusParam = req.query.status as string | undefined;
      const createdBy = req.query.created_by as string | undefined;
      const limit = req.query.limit ? Number(req.query.limit) : undefined;

      const status = statusParam
        ? (statusParam.split(',').filter(Boolean) as Array<'forming' | 'active' | 'converging' | 'concluded' | 'archived'>)
        : undefined;

      const hives = await manager.listHives({ status, createdBy, limit });
      res.json({ success: true, hives });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // GET /api/beehive/identity — exposes the local Queen identity so the
  // frontend doesn't have to hit /api/community/status + interpret activation.
  // Also confirms that Beehive is ready to use on this instance.
  router.get('/beehive/identity', async (_req, res) => {
    try {
      const identity = await getLocalIdentity(db);
      res.json({ success: true, identity });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // POST /api/beehive/hives — create
  router.post('/beehive/hives', async (req, res) => {
    try {
      const parsed = createHiveSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
        return;
      }
      const { queen_contact_hash, queen_display_name, queen_disclosure_policy, ...input } = parsed.data;

      let identity;
      try {
        identity = await resolveCallerIdentity(db, queen_contact_hash);
      } catch (err) {
        sendIdentityError(res, err);
        return;
      }

      const displayName = queen_display_name?.trim() || identity.display_name;
      const hive = await manager.createHive(input, identity.contact_hash, displayName, queen_disclosure_policy);
      res.status(201).json({ success: true, hive });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  // GET /api/beehive/hives/:id — full state
  router.get('/beehive/hives/:id', async (req, res) => {
    try {
      const state = await manager.getHiveState(req.params.id);
      if (!state) {
        res.status(404).json({ error: 'Hive not found' });
        return;
      }
      res.json({ success: true, state });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // DELETE /api/beehive/hives/:id — archive (Queen only; identity server-resolved)
  router.delete('/beehive/hives/:id', async (req, res) => {
    try {
      let identity;
      try {
        identity = await resolveCallerIdentity(db, req.body?.requester_hash);
      } catch (err) {
        sendIdentityError(res, err);
        return;
      }
      await manager.archiveHive(req.params.id, identity.contact_hash);
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  // POST /api/beehive/hives/:id/invite — Queen invites a participant
  router.post('/beehive/hives/:id/invite', async (req, res) => {
    try {
      const parsed = inviteSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
        return;
      }
      const { invited_by, ...input } = parsed.data;

      let identity;
      try {
        identity = await resolveCallerIdentity(db, invited_by);
      } catch (err) {
        sendIdentityError(res, err);
        return;
      }

      const participant = await manager.inviteParticipant(req.params.id, identity.contact_hash, input);
      res.status(201).json({ success: true, participant });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  // POST /api/beehive/hives/:id/join — accept invitation (or self-join in v1 local mode)
  router.post('/beehive/hives/:id/join', async (req, res) => {
    try {
      const parsed = joinSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
        return;
      }

      let identity;
      try {
        identity = await resolveCallerIdentity(db, parsed.data.anton_contact_hash);
      } catch (err) {
        sendIdentityError(res, err);
        return;
      }

      const participant = await manager.joinHive(req.params.id, {
        anton_contact_hash: identity.contact_hash,
        display_name: parsed.data.display_name?.trim() || identity.display_name,
        disclosure_policy: parsed.data.disclosure_policy,
      });
      res.json({ success: true, participant });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  // POST /api/beehive/hives/:id/leave
  router.post('/beehive/hives/:id/leave', async (req, res) => {
    try {
      const parsed = leaveSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
        return;
      }

      let identity;
      try {
        identity = await resolveCallerIdentity(db, parsed.data.anton_contact_hash);
      } catch (err) {
        sendIdentityError(res, err);
        return;
      }

      await manager.leaveHive(req.params.id, identity.contact_hash);
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  // POST /api/beehive/hives/:id/decline — decline invitation without joining
  router.post('/beehive/hives/:id/decline', async (req, res) => {
    try {
      const parsed = leaveSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed' });
        return;
      }

      let identity;
      try {
        identity = await resolveCallerIdentity(db, parsed.data.anton_contact_hash);
      } catch (err) {
        sendIdentityError(res, err);
        return;
      }

      await manager.declineInvitation(req.params.id, identity.contact_hash);
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  // PATCH /api/beehive/hives/:id/disclosure — update participant disclosure policy
  router.patch('/beehive/hives/:id/disclosure', async (req, res) => {
    try {
      const parsed = updateDisclosureSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
        return;
      }

      let identity;
      try {
        identity = await resolveCallerIdentity(db, parsed.data.anton_contact_hash);
      } catch (err) {
        sendIdentityError(res, err);
        return;
      }

      const policy = await manager.updateDisclosurePolicy(
        req.params.id,
        identity.contact_hash,
        parsed.data.disclosure_policy,
      );
      res.json({ success: true, disclosure_policy: policy });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  return router;
}
