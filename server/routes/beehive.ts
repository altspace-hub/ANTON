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
import { createBeehiveDeliberation } from '../services/beehive/beehive-deliberation.js';
import { createBeehiveKnowledge } from '../services/beehive/beehive-knowledge.js';
import { createBeehiveSynthesis } from '../services/beehive/beehive-synthesis.js';
import { createBeehiveBundler } from '../services/beehive/beehive-bundle.js';
import { createBeehiveProtocol } from '../services/beehive/beehive-protocol.js';
import { resolveCallerIdentity, getLocalIdentity } from '../services/beehive/beehive-identity.js';
import { claudeLimiter } from '../middleware/rate-limit.js';
import { safeError } from '../lib/error-response.js';
import type { ContributionType, DisclosurePolicy, SharedAtom } from '../services/beehive/types.js';

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

// ── Phase 2 schemas ────────────────────────────────────────────────────────

const sharedAtomSchema = z.object({
  atom_id: z.string().optional(),
  atom_type: z.string(),
  content: z.string(),
  confidence: z.number().min(0).max(1),
  domain: z.string().optional(),
  redacted: z.boolean(),
}).strict();

const contributionTypeSchema = z.enum([
  'position', 'evidence', 'challenge', 'synthesis', 'question',
  'revision', 'dissent', 'build', 'review_note',
]);

const submitContributionSchema = z.object({
  contributor_hash: z.string().min(1).optional(),
  type: contributionTypeSchema,
  content: z.string().min(1).max(20000),
  supporting_atoms: z.array(sharedAtomSchema).max(50).optional(),
  references: z.array(z.string()).max(20).optional(),
  confidence: z.number().min(0).max(1).optional(),
  reasoning_trace: z.string().max(40000).optional(),
}).strict();

const generateContributionSchema = z.object({
  as_contact_hash: z.string().min(1),
  as_display_name: z.string().min(1).max(100),
  type: contributionTypeSchema,
  hint: z.string().max(2000).optional(),
  supporting_atoms: z.array(sharedAtomSchema).max(50).optional(),
  human_guidance: z.string().max(8000).optional(),
  references: z.array(z.string()).max(20).optional(),
}).strict();

const injectSchema = z.object({
  content: z.string().min(1).max(8000),
  apply_to_round: z.number().int().min(1).optional(),
}).strict();

const queenActionSchema = z.object({
  requester_hash: z.string().min(1).optional(),
}).strict();

const concludeSchema = z.object({
  requester_hash: z.string().min(1).optional(),
  synthesis_override: z.string().min(1).max(60000).optional(),
}).strict();

const dissentSchema = z.object({
  content: z.string().min(1).max(20000),
}).strict();

// ── Route factory ───────────────────────────────────────────────────────────

export function createBeehiveRoutes(db: DatabaseAdapter): Router {
  const router = Router();
  const manager = createBeehiveManager(db);
  const knowledge = createBeehiveKnowledge(db);
  let deliberation: Awaited<ReturnType<typeof createBeehiveDeliberation>> | null = null;
  async function getDeliberation() {
    if (!deliberation) deliberation = await createBeehiveDeliberation(db);
    return deliberation;
  }
  let synthesis: Awaited<ReturnType<typeof createBeehiveSynthesis>> | null = null;
  async function getSynthesis() {
    if (!synthesis) synthesis = await createBeehiveSynthesis(db);
    return synthesis;
  }
  let bundler: Awaited<ReturnType<typeof createBeehiveBundler>> | null = null;
  async function getBundler() {
    if (!bundler) bundler = await createBeehiveBundler(db);
    return bundler;
  }
  let protocol: Awaited<ReturnType<typeof createBeehiveProtocol>> | null = null;
  async function getProtocol() {
    if (!protocol) protocol = await createBeehiveProtocol(db);
    return protocol;
  }
  /** Fire-and-forget broadcast — never blocks the user-facing response. */
  function broadcastAsync(hiveId: string, type: Parameters<Awaited<ReturnType<typeof createBeehiveProtocol>>['broadcast']>[1], payload: unknown): void {
    void getProtocol().then(p => p.broadcast(hiveId, type, payload)).catch(err => {
      console.error(`[beehive] Broadcast '${type}' for ${hiveId} failed:`, err instanceof Error ? err.message : err);
    });
  }

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
      const hiveStateAfterInvite = await manager.getHiveState(req.params.id);
      if (hiveStateAfterInvite) {
        broadcastAsync(req.params.id, 'hive:invite', {
          hive: hiveStateAfterInvite.hive,
          invitee_hash: input.anton_contact_hash,
          invitee_display_name: input.display_name,
          role: input.role,
        });
      }
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
      broadcastAsync(req.params.id, 'hive:join', { display_name: participant.display_name });
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
      broadcastAsync(req.params.id, 'hive:leave', {});
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
      broadcastAsync(req.params.id, 'hive:decline', {});
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

  // ──────────────────────────────────────────────────────────────────────────
  // Phase 2: rounds, contributions, consensus, disclosure preview, injection
  // ──────────────────────────────────────────────────────────────────────────

  // POST /api/beehive/hives/:id/rounds — Queen advances to the next round
  router.post('/beehive/hives/:id/rounds', async (req, res) => {
    try {
      const parsed = queenActionSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed' });
        return;
      }
      let identity;
      try {
        identity = await resolveCallerIdentity(db, parsed.data.requester_hash);
      } catch (err) { sendIdentityError(res, err); return; }
      const delib = await getDeliberation();
      const round = await delib.startNextRound(req.params.id, identity.contact_hash);
      broadcastAsync(req.params.id, 'hive:round_advance', {
        round_number: round.round_number,
        phase: round.phase,
        started_at: round.started_at,
      });
      res.status(201).json({ success: true, round });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  // POST /api/beehive/hives/:id/converge — Queen triggers convergence phase
  router.post('/beehive/hives/:id/converge', async (req, res) => {
    try {
      const parsed = queenActionSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed' });
        return;
      }
      let identity;
      try {
        identity = await resolveCallerIdentity(db, parsed.data.requester_hash);
      } catch (err) { sendIdentityError(res, err); return; }
      const delib = await getDeliberation();
      const round = await delib.triggerConvergence(req.params.id, identity.contact_hash);
      broadcastAsync(req.params.id, 'hive:converge', {
        round_number: round.round_number,
        phase: round.phase,
        started_at: round.started_at,
      });
      res.json({ success: true, round });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  // GET /api/beehive/hives/:id/contributions?round=N
  router.get('/beehive/hives/:id/contributions', async (req, res) => {
    try {
      const round = req.query.round ? Number(req.query.round) : undefined;
      const delib = await getDeliberation();
      const contributions = await delib.listContributions(req.params.id, round);
      res.json({ success: true, contributions });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // POST /api/beehive/hives/:id/contributions — submit a contribution
  //
  // In v1 local mode, the local user (Queen) is allowed to submit contributions
  // on behalf of any joined participant — this enables solo-mode demo where
  // the user simulates the multi-party deliberation. Phase 4 will require
  // contributor_hash == verified AAP signer.
  router.post('/beehive/hives/:id/contributions', async (req, res) => {
    try {
      const parsed = submitContributionSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
        return;
      }
      let identity;
      try {
        identity = await resolveCallerIdentity(db, undefined);
      } catch (err) { sendIdentityError(res, err); return; }

      // Ownership check: Queen of this hive may submit for any participant in v1 local mode;
      // self-contributions allowed for non-Queens.
      const state = await manager.getHiveState(req.params.id);
      if (!state) { res.status(404).json({ error: 'Hive not found' }); return; }
      const isQueen = state.hive.created_by === identity.contact_hash;
      const contributorHash = parsed.data.contributor_hash ?? identity.contact_hash;
      if (!isQueen && contributorHash !== identity.contact_hash) {
        res.status(403).json({ error: 'Only the Queen may submit on behalf of other participants in v1 local mode' });
        return;
      }

      const delib = await getDeliberation();
      const contribution = await delib.submitContribution(req.params.id, {
        contributorHash,
        type: parsed.data.type as ContributionType,
        content: parsed.data.content,
        supportingAtoms: parsed.data.supporting_atoms as SharedAtom[] | undefined,
        references: parsed.data.references,
        confidence: parsed.data.confidence,
        reasoningTrace: parsed.data.reasoning_trace,
      });
      broadcastAsync(req.params.id, 'hive:contribution', contribution);
      res.status(201).json({ success: true, contribution });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  // POST /api/beehive/hives/:id/contributions/generate — LLM-drafts a contribution
  router.post('/beehive/hives/:id/contributions/generate', claudeLimiter, async (req, res) => {
    try {
      const parsed = generateContributionSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
        return;
      }
      try {
        await resolveCallerIdentity(db, undefined);
      } catch (err) { sendIdentityError(res, err); return; }

      const delib = await getDeliberation();
      const hiveId = String(req.params.id);
      const draft = await delib.generateContributionDraft(hiveId, {
        asContactHash: parsed.data.as_contact_hash,
        asDisplayName: parsed.data.as_display_name,
        type: parsed.data.type as ContributionType,
        hint: parsed.data.hint,
        supportingAtoms: (parsed.data.supporting_atoms ?? []) as SharedAtom[],
        humanGuidance: parsed.data.human_guidance,
        references: parsed.data.references,
      });
      res.json({ success: true, draft });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  // POST /api/beehive/hives/:id/inject — record private human guidance
  router.post('/beehive/hives/:id/inject', async (req, res) => {
    try {
      const parsed = injectSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
        return;
      }
      let identity;
      try { identity = await resolveCallerIdentity(db, undefined); }
      catch (err) { sendIdentityError(res, err); return; }
      const delib = await getDeliberation();
      await delib.recordHumanInjection(req.params.id, identity.contact_hash, parsed.data.content, parsed.data.apply_to_round);
      res.status(201).json({ success: true });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  // GET /api/beehive/hives/:id/injections — list THIS user's private injections only
  router.get('/beehive/hives/:id/injections', async (req, res) => {
    try {
      let identity;
      try { identity = await resolveCallerIdentity(db, undefined); }
      catch (err) { sendIdentityError(res, err); return; }
      const delib = await getDeliberation();
      const injections = await delib.listHumanInjections(req.params.id, identity.contact_hash);
      res.json({ success: true, injections });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // POST /api/beehive/hives/:id/measure-consensus — recompute consensus for current round (LLM)
  router.post('/beehive/hives/:id/measure-consensus', claudeLimiter, async (req, res) => {
    try {
      const delib = await getDeliberation();
      const result = await delib.refreshConsensusForCurrentRound(String(req.params.id));
      res.json({ success: true, consensus: result });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  // GET /api/beehive/hives/:id/disclosable-atoms — preview what would be shared
  router.get('/beehive/hives/:id/disclosable-atoms', async (req, res) => {
    try {
      const state = await manager.getHiveState(req.params.id);
      if (!state) { res.status(404).json({ error: 'Hive not found' }); return; }
      const contactHash = (req.query.contact_hash as string | undefined) || (await getLocalIdentity(db))?.contact_hash;
      if (!contactHash) { res.status(409).json({ error: 'Local community identity not activated' }); return; }
      const participant = state.participants.find(p => p.anton_contact_hash === contactHash);
      if (!participant) { res.status(404).json({ error: 'Not a participant of this hive' }); return; }

      const policy: DisclosurePolicy = participant.disclosure_policy;
      const atoms = await knowledge.selectAtomsForDisclosure({
        hiveQuestion: state.hive.question,
        policy,
      });
      res.json({ success: true, atoms, policy });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // GET /api/beehive/hives/:id/shared-atoms — atoms already disclosed to this hive
  router.get('/beehive/hives/:id/shared-atoms', async (req, res) => {
    try {
      const atoms = await knowledge.listSharedAtoms(req.params.id);
      res.json({ success: true, atoms });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Phase 3: synthesis draft, approve/dissent, conclude, output, export
  // ──────────────────────────────────────────────────────────────────────────

  // POST /api/beehive/hives/:id/synthesis-draft — Queen previews synthesis (not persisted)
  router.post('/beehive/hives/:id/synthesis-draft', claudeLimiter, async (req, res) => {
    try {
      const parsed = queenActionSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed' });
        return;
      }
      let identity;
      try { identity = await resolveCallerIdentity(db, parsed.data.requester_hash); }
      catch (err) { sendIdentityError(res, err); return; }

      const hiveId = String(req.params.id);
      const stateData = await manager.getHiveState(hiveId);
      if (!stateData) { res.status(404).json({ error: 'Hive not found' }); return; }
      if (stateData.hive.created_by !== identity.contact_hash) {
        res.status(403).json({ error: 'Only the Queen can draft synthesis' });
        return;
      }

      const synth = await getSynthesis();
      const draft = await synth.generateSynthesisDraft(hiveId);
      res.json({ success: true, draft });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  // POST /api/beehive/hives/:id/approve — record participant approval
  router.post('/beehive/hives/:id/approve', async (req, res) => {
    try {
      let identity;
      try { identity = await resolveCallerIdentity(db, undefined); }
      catch (err) { sendIdentityError(res, err); return; }
      const synth = await getSynthesis();
      const contribution = await synth.approveOrDissent(req.params.id, identity.contact_hash, 'approve');
      if (contribution) broadcastAsync(req.params.id, 'hive:contribution', contribution);
      res.status(201).json({ success: true, contribution });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  // POST /api/beehive/hives/:id/dissent — record formal dissent
  router.post('/beehive/hives/:id/dissent', async (req, res) => {
    try {
      const parsed = dissentSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Dissent content is required' });
        return;
      }
      let identity;
      try { identity = await resolveCallerIdentity(db, undefined); }
      catch (err) { sendIdentityError(res, err); return; }
      const synth = await getSynthesis();
      const contribution = await synth.approveOrDissent(req.params.id, identity.contact_hash, 'dissent', parsed.data.content);
      if (contribution) broadcastAsync(req.params.id, 'hive:contribution', contribution);
      res.status(201).json({ success: true, contribution });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  // POST /api/beehive/hives/:id/conclude — Queen finalizes the hive (heavy LLM call)
  router.post('/beehive/hives/:id/conclude', claudeLimiter, async (req, res) => {
    try {
      const parsed = concludeSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed' });
        return;
      }
      let identity;
      try { identity = await resolveCallerIdentity(db, parsed.data.requester_hash); }
      catch (err) { sendIdentityError(res, err); return; }
      const synth = await getSynthesis();
      const hiveId = String(req.params.id);
      const output = await synth.concludeHive(hiveId, identity.contact_hash, parsed.data.synthesis_override);
      broadcastAsync(hiveId, 'hive:conclude', {
        id: output.id,
        output_type: output.output_type,
        synthesis_text: output.synthesis_text,
        dissents: output.dissents,
        convergence_path: output.convergence_path,
        participant_approvals: output.participant_approvals,
        created_at: output.created_at,
      });
      res.status(201).json({ success: true, output });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  // GET /api/beehive/hives/:id/output — fetch the concluded output
  router.get('/beehive/hives/:id/output', async (req, res) => {
    try {
      const stateData = await manager.getHiveState(req.params.id);
      if (!stateData) { res.status(404).json({ error: 'Hive not found' }); return; }
      if (!stateData.output) { res.status(404).json({ error: 'Hive has no output yet' }); return; }
      res.json({ success: true, output: stateData.output });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // GET /api/beehive/hives/:id/output/export — download as .anton bundle
  router.get('/beehive/hives/:id/output/export', async (req, res) => {
    try {
      const b = await getBundler();
      const result = await b.bundleHiveOutput(req.params.id);
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
      res.setHeader('Content-Length', String(result.byteSize));
      res.end(result.buffer);
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  return router;
}
