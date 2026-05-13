/**
 * portal-walkthrough-engine.ts — 8-phase guided portal builder.
 *
 * Per Spec v0.2 §E.4 and §E.5. Pure state machine + persistence; LLM I/O
 * is delegated to the caller via `generatePhasePrompt(session, phase)`.
 * The engine's contract:
 *
 *   1. createSession(opts)              starts a new session, sets phase='intent'
 *   2. generatePhasePrompt(sessionId)   returns the system prompt the caller
 *                                       should feed to its LLM for the current
 *                                       phase (template-aware, depth-aware)
 *   3. advanceSession(sessionId, output) validates the LLM's structured output
 *                                       against the phase schema, persists it,
 *                                       transitions to the next phase
 *   4. getSession(sessionId)            current state for resume
 *   5. finalizeSession(sessionId)       called after Phase 8: insert portal,
 *                                       seed pages + structured data, build
 *                                       capability descriptor, register name
 *
 * Phases per Spec §E.4:
 *   1 intent              what kind of portal, who is it for
 *   2 identity            name + namespace + claim, description, tagline
 *   3 content_structure   pages list (paths, titles, sort)
 *   4 content_generation  each page's HTML body
 *   5 capabilities        which verbs, with input/output customisation
 *   6 aesthetics          theme/colour palette/font choices
 *   7 review              quality ratchet score + apprentice progression
 *   8 publish             commit to portals + register + activate
 */

import { z } from 'zod';

import type { DatabaseAdapter } from '../../db/database.js';
import { childLogger } from '../../lib/logger.js';
import { generateAppKeypair } from '../identity.js';
import { encryptPortalKey } from '../../lib/portal-key-cipher.js';
import { buildDescriptor, type CapabilityDeclaration } from '../capability-descriptor/builder.js';
import { createPortalDatabaseService } from './portal-database-service.js';
import { createRegistryClient, RegistryError } from '../registry-client/index.js';
import {
  submitToRelay,
  RelaySubmitError,
  type RelayKycFields,
} from '../registry-client/relay-submit.js';

const log = childLogger('portal-walkthrough');
import {
  getTemplate,
  type PortalTemplate,
  type PhaseId,
} from './portal-walkthrough-templates.js';
export type { PhaseId };
import {
  getWalkthroughDepth,
  type WalkthroughDepth,
} from './walkthrough-depth.js';
import type { CapabilityVerb, PORTAL_CATEGORIES } from '../capability-descriptor/schema.js';

// ── Phase order (locked) ────────────────────────────────────────────────────

export const PHASE_ORDER: PhaseId[] = [
  'intent',
  'identity',
  'content_structure',
  'content_generation',
  'capabilities',
  'aesthetics',
  'review',
  'publish',
];

export function nextPhase(current: PhaseId): PhaseId | null {
  const idx = PHASE_ORDER.indexOf(current);
  if (idx === -1 || idx === PHASE_ORDER.length - 1) return null;
  return PHASE_ORDER[idx + 1];
}

// ── Per-phase output schemas (zod) ──────────────────────────────────────────

const intentSchema = z.object({
  audience: z.string().min(3).max(500),
  problem_solved: z.string().min(3).max(500),
  visitor_actions: z.array(z.string()).min(1),
  notes: z.string().optional(),
});

const identitySchema = z.object({
  name: z.string().regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/, 'lowercase alphanumeric, dots/dashes between segments'),
  namespace: z.string().regex(/^[a-z][a-z0-9-]{2,31}$/),
  display_title: z.string().min(1).max(200),
  tagline: z.string().max(200).optional(),
  description: z.string().max(2000).optional(),
  category: z.enum([
    'personal', 'business', 'community', 'commerce',
    'team', 'creator', 'bulletin', 'classroom', 'teacher', 'organisation', 'other',
  ]),
});

const contentStructureSchema = z.object({
  pages: z.array(z.object({
    path: z.string().min(1).max(200),
    title: z.string().min(1).max(200),
    sort_order: z.number().int().min(0).default(0),
  })).min(1),
});

const contentGenerationSchema = z.object({
  pages: z.array(z.object({
    path: z.string(),
    html: z.string().min(1),
    structured_data: z.record(z.string(), z.unknown()).optional(),
  })).min(1),
  structured_kinds: z.array(z.object({
    kind: z.string(),
    items: z.array(z.object({
      key: z.string(),
      value: z.record(z.string(), z.unknown()),
    })),
  })).optional(),
});

const capabilitySchema = z.object({
  capabilities: z.array(z.object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
    verb: z.enum([
      'contact', 'inquire', 'request', 'order', 'pay',
      'book', 'subscribe', 'join', 'query', 'publish',
      'delegate', 'authenticate', 'custom',
    ]),
    title: z.string().min(1).max(200),
    description: z.string().min(1).max(2000),
    aap_endpoint: z.string().min(1).max(200),
    payment_required: z.boolean().optional(),
    tags: z.array(z.string()).optional(),
  })).min(1),
  policies: z.object({
    privacy_url: z.string().optional(),
    terms_url: z.string().optional(),
    data_retention_days: z.record(z.string(), z.number()).optional(),
  }).optional(),
});

const aestheticsSchema = z.object({
  palette: z.string().optional(),
  font_family: z.string().optional(),
  custom_css: z.string().max(20_000).optional(),
});

const reviewSchema = z.object({
  approved: z.boolean(),
  reviewer_notes: z.string().max(5000).optional(),
  quality_score: z.number().min(0).max(10).optional(),
  flagged_issues: z.array(z.string()).optional(),
});

const publishSchema = z.object({
  public_index: z.boolean().default(false),
  ready_to_register: z.literal(true),
  // Site-surface choice captured at creation time. Defaults to 'managed'
  // so existing flows + LLM-driven runs keep working without a change.
  // When 'external', external_primary_url is required — see the refine()
  // below and the DB check constraint.
  surface_mode: z.enum(['managed', 'external']).default('managed'),
  external_primary_url: z.string().url().max(2000).optional(),
}).refine(
  (v) => v.surface_mode === 'managed' || !!v.external_primary_url,
  { path: ['external_primary_url'], message: 'Required when surface_mode is external' },
);

export const PHASE_SCHEMAS: Record<PhaseId, z.ZodType> = {
  intent: intentSchema,
  identity: identitySchema,
  content_structure: contentStructureSchema,
  content_generation: contentGenerationSchema,
  capabilities: capabilitySchema,
  aesthetics: aestheticsSchema,
  review: reviewSchema,
  publish: publishSchema,
};

// ── Public types ────────────────────────────────────────────────────────────

export interface SessionState {
  id: string;
  ownerId: string;
  templateId: string;
  template: PortalTemplate;
  currentPhase: PhaseId;
  phasesCompleted: PhaseId[];
  accumulatedState: Record<string, unknown>;
  depth: WalkthroughDepth;
  status: 'active' | 'finalized' | 'abandoned';
  portalId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSessionInput {
  ownerId: string;
  templateId: string;
  modelId?: string;
  thinkingLevel?: 'quick' | 'think' | 'think_hard' | 'investigate' | 'plan_first' | 'deep_investigate';
}

export interface PhasePrompt {
  phaseId: PhaseId;
  systemPrompt: string;
  expectedOutputSchemaName: string;
  maxOutputTokens: number;
}

export interface AdvanceResult {
  newPhase: PhaseId | null; // null = walkthrough done, awaiting finalize
  session: SessionState;
}

export interface FinalizeResult {
  portalId: string;
  portalAddress: string;
  /** True only if PORTAL_REGISTRY_URL is set AND the legacy registry
   *  protocol accepted the register op. The legacy path stays around
   *  for any future federation with a stand-alone registry server. */
  registeredOk: boolean;
  /** Populated when legacy registry submission failed. */
  registerError?: string;
  /** Step 11: when RELAY_PORTAL_SUBMIT_URL is set AND kyc fields were
   *  provided, this is the UUID returned by the relay's
   *  /v1/portals/submit endpoint. The portal sits in the relay's
   *  review queue until an operator approves it. */
  relaySubmissionId?: string;
  /** Status reported by the relay at submit time. Always 'pending' on
   *  success; the management UI polls /v1/portals/submissions/:id
   *  /status to track approval. */
  relayStatus?: 'pending' | 'in_review' | 'approved' | 'rejected';
  /** Populated when the relay submission failed (network, validation,
   *  reserved-name collision, etc.). The local portal is still usable
   *  — relay submission is best-effort. */
  relayError?: string;
}

export interface FinalizeOptions {
  /** KYC fields for Tier 3 self-service submission to the relay.
   *  When omitted, the relay submission is skipped (logged + the
   *  local portal still ships). Required for any portal that should
   *  be publicly discoverable via the relay's search. */
  kyc?: RelayKycFields;
}

// ── Engine ─────────────────────────────────────────────────────────────────

export interface WalkthroughEngine {
  createSession(input: CreateSessionInput): Promise<SessionState>;
  getSession(sessionId: string): Promise<SessionState | null>;
  generatePhasePrompt(sessionId: string): Promise<PhasePrompt>;
  advanceSession(sessionId: string, phaseOutput: unknown): Promise<AdvanceResult>;
  abandonSession(sessionId: string): Promise<void>;
  finalizeSession(sessionId: string, options?: FinalizeOptions): Promise<FinalizeResult>;
}

export function createWalkthroughEngine(db: DatabaseAdapter): WalkthroughEngine {
  const portalDb = createPortalDatabaseService(db);

  async function loadSession(sessionId: string): Promise<SessionState | null> {
    const row = await db.get<SessionRow>(
      `SELECT * FROM portal_walkthrough_sessions WHERE id = ?`,
      sessionId,
    );
    if (!row) return null;
    const template = getTemplate(row.template_id);
    if (!template) throw new Error(`Unknown template_id: ${row.template_id}`);
    return rowToState(row, template);
  }

  async function saveSession(state: SessionState): Promise<void> {
    await db.run(
      `UPDATE portal_walkthrough_sessions SET
         current_phase = ?,
         phases_completed = ?,
         accumulated_state = ?,
         depth = ?,
         status = ?,
         portal_id = ?,
         finalized_at = ?
       WHERE id = ?`,
      state.currentPhase,
      JSON.stringify(state.phasesCompleted),
      JSON.stringify(state.accumulatedState),
      state.depth,
      state.status,
      state.portalId,
      state.status === 'finalized' ? new Date().toISOString() : null,
      state.id,
    );
  }

  return {
    async createSession(input) {
      const template = getTemplate(input.templateId);
      if (!template) throw new Error(`Unknown templateId: ${input.templateId}`);

      const depth = getWalkthroughDepth(
        input.modelId ?? 'claude-sonnet-4-6',
        input.thinkingLevel ?? 'think',
      );

      const inserted = await db.get<{ id: string }>(
        `INSERT INTO portal_walkthrough_sessions
           (owner_id, template_id, current_phase, phases_completed,
            accumulated_state, depth, status)
         VALUES (?, ?, 'intent', '[]'::jsonb, '{}'::jsonb, ?, 'active')
         RETURNING id`,
        input.ownerId,
        input.templateId,
        depth,
      );
      if (!inserted) throw new Error('createSession: insert returned no id');
      const session = await loadSession(inserted.id);
      if (!session) throw new Error('createSession: just-inserted session missing');
      return session;
    },

    async getSession(sessionId) {
      return loadSession(sessionId);
    },

    async generatePhasePrompt(sessionId) {
      const session = await loadSession(sessionId);
      if (!session) throw new Error(`Session ${sessionId} not found`);
      if (session.status !== 'active') {
        throw new Error(`Session is ${session.status} — cannot generate a prompt`);
      }
      const phase = session.currentPhase;
      const hint = session.template.phaseHints[phase];

      const systemPrompt = buildPhaseSystemPrompt(session, phase, hint);
      const maxOutput = session.depth === 'deep' ? 16_384 : session.depth === 'standard' ? 4096 : 1024;

      return {
        phaseId: phase,
        systemPrompt,
        expectedOutputSchemaName: phase,
        maxOutputTokens: maxOutput,
      };
    },

    async advanceSession(sessionId, phaseOutput) {
      const session = await loadSession(sessionId);
      if (!session) throw new Error(`Session ${sessionId} not found`);
      if (session.status !== 'active') {
        throw new Error(`Session is ${session.status} — cannot advance`);
      }
      const phase = session.currentPhase;
      // Refuse to re-advance a phase that has already been recorded. This
      // matters most for the terminal `publish` phase, where currentPhase
      // stays at 'publish' (no next) but phases_completed already contains it
      // — calling advance again would duplicate the entry.
      if (session.phasesCompleted.includes(phase)) {
        throw new Error(`Phase ${phase} already completed; call finalizeSession to commit.`);
      }
      const schema = PHASE_SCHEMAS[phase];
      const parsed = schema.safeParse(phaseOutput);
      if (!parsed.success) {
        throw new Error(`Phase ${phase} output failed validation: ${parsed.error.message}`);
      }

      session.accumulatedState[phase] = parsed.data;
      session.phasesCompleted = [...session.phasesCompleted, phase];

      const next = nextPhase(phase);
      if (next === null) {
        // Last phase committed — caller should now call finalizeSession.
        await saveSession(session);
        return { newPhase: null, session };
      }
      session.currentPhase = next;
      await saveSession(session);
      return { newPhase: next, session };
    },

    async abandonSession(sessionId) {
      await db.run(
        `UPDATE portal_walkthrough_sessions SET status = 'abandoned' WHERE id = ?`,
        sessionId,
      );
    },

    async finalizeSession(sessionId, options = {}) {
      const session = await loadSession(sessionId);
      if (!session) throw new Error(`Session ${sessionId} not found`);
      if (session.status !== 'active') {
        throw new Error(`Session is already ${session.status}`);
      }
      if (session.phasesCompleted.length !== PHASE_ORDER.length) {
        throw new Error(`Cannot finalize: ${session.phasesCompleted.length}/${PHASE_ORDER.length} phases complete`);
      }

      const identity = session.accumulatedState.identity as z.infer<typeof identitySchema>;
      const structure = session.accumulatedState.content_structure as z.infer<typeof contentStructureSchema>;
      const generation = session.accumulatedState.content_generation as z.infer<typeof contentGenerationSchema>;
      const caps = session.accumulatedState.capabilities as z.infer<typeof capabilitySchema>;
      const publish = session.accumulatedState.publish as z.infer<typeof publishSchema>;

      // Generate keypair + build the descriptor BEFORE the transaction so
      // failures in build (validation, signing) don't leave a partial portal.
      const kp = generateAppKeypair();
      const portalAddress = `${identity.name}.${identity.namespace}.portal`;
      const declarations: CapabilityDeclaration[] = caps.capabilities.map((c) => ({
        id: c.id,
        verb: c.verb as CapabilityVerb,
        title: c.title,
        description: c.description,
        aapEndpoint: c.aap_endpoint,
        paymentCoupling: c.payment_required ? { required: true } : undefined,
        tags: c.tags,
      }));
      const built = buildDescriptor({
        portal: {
          name: identity.name,
          namespace: identity.namespace,
          displayTitle: identity.display_title,
          category: identity.category as (typeof PORTAL_CATEGORIES)[number],
          contactHash: kp.contactHash,
          publicKeyHex: kp.publicKeyHex,
          surface: publish.surface_mode === 'external' && publish.external_primary_url
            ? { mode: 'external', url: publish.external_primary_url }
            : { mode: 'managed' },
        },
        identity: {
          humanContact: { available: true, displayName: identity.display_title, languages: ['en'] },
        },
        capabilities: declarations,
        policies: caps.policies as Record<string, unknown> | undefined,
        discoveryMetadata: publish.public_index
          ? {
              publicIndex: true,
              primaryCategory: identity.category,
              tags: declarations.flatMap((d) => d.tags ?? []),
            }
          : { publicIndex: false },
      }, kp.privateKeyPem);

      // All DB writes go in one transaction — if any fails, the whole
      // finalize is rolled back and the session stays 'active' so the
      // user can retry without a half-built portal in the table.
      const portalId = await db.transaction(async (tx) => {
        const inserted = await tx.get<{ id: string }>(
          `INSERT INTO portals (name, namespace, category, display_title, description,
                                template, contact_hash, public_key_hex, private_key_pem,
                                public_index, status, descriptor_hash, capability_summary, metadata,
                                surface_mode, external_primary_url)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)
           RETURNING id`,
          identity.name,
          identity.namespace,
          identity.category,
          identity.display_title,
          identity.description ?? null,
          session.templateId,
          kp.contactHash,
          kp.publicKeyHex,
          encryptPortalKey(kp.privateKeyPem),
          publish.public_index,
          built.hash,
          JSON.stringify(built.capabilitySummary),
          JSON.stringify({ walkthroughSessionId: session.id, ownerId: session.ownerId }),
          publish.surface_mode ?? 'managed',
          publish.surface_mode === 'external' ? (publish.external_primary_url ?? null) : null,
        );
        if (!inserted) throw new Error('finalize: portal insert returned no id');
        const pid = inserted.id;

        // Seed pages — fall back to template seed HTML when generation skipped a path.
        const generatedByPath = new Map(generation.pages.map((p) => [p.path, p]));
        const templateSeedByPath = new Map(session.template.seedPages.map((p) => [p.path, p]));
        for (const declared of structure.pages) {
          const gen = generatedByPath.get(declared.path);
          const seed = templateSeedByPath.get(declared.path);
          const html = gen?.html ?? seed?.html ?? `<h1>${declared.title}</h1><p>{{data.placeholder}}</p>`;
          await tx.run(
            `INSERT INTO portal_pages (portal_id, path, title, html, sort_order, visible, structured_data)
             VALUES (?, ?, ?, ?, ?, TRUE, ?)
             ON CONFLICT (portal_id, path) DO UPDATE SET
               title = EXCLUDED.title, html = EXCLUDED.html,
               sort_order = EXCLUDED.sort_order, visible = TRUE,
               structured_data = EXCLUDED.structured_data`,
            pid, declared.path, declared.title, html, declared.sort_order,
            gen?.structured_data ? JSON.stringify(gen.structured_data) : null,
          );
        }

        // Seed structured data (commerce products, team roster, etc.).
        if (generation.structured_kinds) {
          for (const k of generation.structured_kinds) {
            for (const item of k.items) {
              await tx.run(
                `INSERT INTO portal_structured_data (portal_id, kind, key, value)
                 VALUES (?, ?, ?, ?)
                 ON CONFLICT (portal_id, kind, key) DO UPDATE SET value = EXCLUDED.value`,
                pid, k.kind, item.key, JSON.stringify(item.value),
              );
            }
          }
        }

        // Cache the signed descriptor envelope so visitors can fetch + verify.
        await tx.run(
          `INSERT INTO portal_descriptor_cache (portal_address, descriptor_hash, descriptor,
                                                signature, signing_key_fingerprint,
                                                valid_from, valid_until)
           VALUES (?, ?, ?, ?, ?, NOW(), NOW() + INTERVAL '365 days')
           ON CONFLICT (portal_address) DO UPDATE SET
             descriptor_hash = EXCLUDED.descriptor_hash,
             descriptor = EXCLUDED.descriptor,
             signature = EXCLUDED.signature,
             signing_key_fingerprint = EXCLUDED.signing_key_fingerprint,
             valid_from = EXCLUDED.valid_from,
             valid_until = EXCLUDED.valid_until`,
          portalAddress, built.hash, JSON.stringify(built.descriptor),
          built.envelope.signature, built.envelope.signingKeyFingerprint,
        );

        // Mark the session finalized within the same transaction.
        await tx.run(
          `UPDATE portal_walkthrough_sessions SET
             current_phase = ?, phases_completed = ?, accumulated_state = ?,
             depth = ?, status = 'finalized', portal_id = ?, finalized_at = NOW()
           WHERE id = ?`,
          session.currentPhase,
          JSON.stringify(session.phasesCompleted),
          JSON.stringify(session.accumulatedState),
          session.depth,
          pid,
          session.id,
        );

        return pid;
      });

      // Resolution-cache invalidation: if a stale entry for this address
      // existed (unlikely on first publish but possible if the name was
      // previously revoked + dormancy-released), drop it now.
      await db.run(
        `DELETE FROM portal_resolution_cache WHERE cache_key = ?`,
        `${identity.namespace}/${identity.name}`,
      );

      // Optional registry submission — best-effort. The registry server may
      // not exist yet (v0.7.x ships without it); we never block finalize on
      // it. Configure with PORTAL_REGISTRY_URL env var to enable.
      let registeredOk = false;
      let registerError: string | undefined;
      const registryUrl = process.env.PORTAL_REGISTRY_URL;
      if (registryUrl) {
        try {
          const client = createRegistryClient(db, { baseUrl: registryUrl });
          const accepted = await client.register({
            name: identity.name,
            namespace: identity.namespace,
            category: identity.category as never,
            title: identity.display_title,
            description: identity.description,
            publicIndex: publish.public_index,
            actor: { contactHash: kp.contactHash, publicKeyHex: kp.publicKeyHex },
            privateKeyPem: kp.privateKeyPem,
          });
          // Persist the registry's UUID + log id for chain-continuity on subsequent ops.
          await db.run(
            `UPDATE portals SET registered_at = NOW(), last_synced_at = NOW(),
                                registry_portal_id = ?, registry_log_id = ? WHERE id = ?`,
            accepted.portalId, accepted.logId, portalId,
          );
          registeredOk = true;
          log.info({ portalId, portalAddress, registryLogId: accepted.logId }, 'portal registered with registry');
        } catch (err) {
          registerError = err instanceof RegistryError ? `${err.code}: ${err.message}` :
                          err instanceof Error ? err.message : String(err);
          log.warn({ portalId, portalAddress, error: registerError }, 'registry submission failed (portal still usable locally)');
        }
      } else {
        log.info({ portalId, portalAddress }, 'PORTAL_REGISTRY_URL not set — local portal created, registry submission skipped');
      }

      // Step 11: relay submission. Same best-effort posture as the
      // legacy registry path above — a failure here never undoes the
      // local portal insert, just logs and lets the user retry.
      //
      // Gated by:
      //   1. RELAY_PORTAL_SUBMIT_URL env var (e.g. https://relay.futurechain.eu/v1)
      //   2. KYC fields passed to finalizeSession (Tier 3 self-service
      //      requires them; the relay rejects without)
      //
      // Both missing → log + skip (local-only portal).
      let relaySubmissionId: string | undefined;
      let relayStatus: FinalizeResult['relayStatus'];
      let relayError: string | undefined;
      const relayBaseUrl = process.env.RELAY_PORTAL_SUBMIT_URL;
      if (relayBaseUrl && options.kyc) {
        try {
          const result = await submitToRelay({
            relayBaseUrl,
            name: identity.name,
            namespace: identity.namespace,
            descriptorJson: built.descriptor as Record<string, unknown>,
            publicKeyHex: kp.publicKeyHex,
            privateKeyPem: kp.privateKeyPem,
            kyc: options.kyc,
          });
          relaySubmissionId = result.submissionId;
          relayStatus = result.status;
          // Patch the portal's metadata with relay state so the
          // management UI can render a status badge without polling
          // the relay just to know "did we even submit?".
          await db.run(
            `UPDATE portals
             SET metadata = metadata || ?::jsonb
             WHERE id = ?`,
            JSON.stringify({
              relayStatus: result.status,
              relaySubmissionId: result.submissionId,
              relaySubmittedAt: result.submittedAt,
              relayBaseUrl,
            }),
            portalId,
          );
          log.info({ portalId, portalAddress, submissionId: result.submissionId },
            'portal submitted to relay; awaiting operator review');
        } catch (err) {
          relayError = err instanceof RelaySubmitError
            ? `${err.code}: ${err.message}`
            : err instanceof Error ? err.message : String(err);
          await db.run(
            `UPDATE portals
             SET metadata = metadata || ?::jsonb
             WHERE id = ?`,
            JSON.stringify({ relayError, relayBaseUrl }),
            portalId,
          );
          log.warn({ portalId, portalAddress, error: relayError },
            'relay submission failed (local portal still usable)');
        }
      } else if (relayBaseUrl && !options.kyc) {
        relayError = 'kyc_fields_missing';
        log.warn({ portalId, portalAddress },
          'RELAY_PORTAL_SUBMIT_URL is set but no KYC provided to finalize — relay submission skipped');
      } else {
        log.info({ portalId, portalAddress },
          'RELAY_PORTAL_SUBMIT_URL not set — relay submission skipped (local-only portal)');
      }

      return {
        portalId, portalAddress,
        registeredOk, registerError,
        relaySubmissionId, relayStatus, relayError,
      };
    },
  };
}

// ── Internals ──────────────────────────────────────────────────────────────

function buildPhaseSystemPrompt(session: SessionState, phase: PhaseId, hint?: string): string {
  const lines: string[] = [];
  lines.push(`# ANTON Portal Builder — Phase: ${phase}`);
  lines.push('');
  lines.push(`Template: ${session.template.label} — ${session.template.description}`);
  lines.push(`Walkthrough depth: ${session.depth}`);
  lines.push('');
  lines.push(PHASE_INSTRUCTIONS[phase]);
  lines.push('');
  if (hint) {
    lines.push(`## Template-specific guidance`);
    lines.push(hint);
    lines.push('');
  }
  // Recap accumulated state for downstream phases.
  if (Object.keys(session.accumulatedState).length > 0) {
    lines.push(`## So far`);
    for (const [pid, value] of Object.entries(session.accumulatedState)) {
      lines.push(`- **${pid}**: ${JSON.stringify(value).slice(0, 280)}`);
    }
    lines.push('');
  }
  lines.push(`## Output requirement`);
  lines.push(`Return ONLY a JSON object that validates against the \`${phase}\` schema. No prose.`);
  return lines.join('\n');
}

const PHASE_INSTRUCTIONS: Record<PhaseId, string> = {
  intent: `Determine WHO this portal is for and WHAT visitors should be able to do. Ask the user (concisely) about their audience, the problem solved, and the visitor actions you want to support.`,
  identity: `Pick a portal name (lowercase, dashes/dots OK), confirm the namespace (default 'futurechain'), category, display title. The display title is what visitors see; the name is the address.`,
  content_structure: `List the pages this portal needs (path + title + sort order). Start small — three pages cover most cases.`,
  content_generation: `For each page in content_structure, write the HTML body using the minimal-interpolation grammar ({{title}}, {{portal.*}}, {{data.*}}, {{#each kind}}…{{/each}}, {{asset:path}}). If the portal has products / events / members / etc., return them as structured_kinds for the renderer to iterate over.`,
  capabilities: `Decide which capability verbs the portal exposes. Use the 12-verb taxonomy (contact, inquire, request, order, pay, book, subscribe, join, query, publish, delegate, authenticate). Each capability needs id (slug), verb, title, description, aap_endpoint name. For commerce verbs, set payment_required: true.`,
  aesthetics: `Pick a palette and font family. Optional custom CSS for advanced users (capped at 20 KB).`,
  review: `Run a structured pre-publish review. Report approved boolean + flagged_issues array + optional reviewer_notes + quality_score (0-10). The Quality Ratchet wraps this to record the score against the apprentice progression.`,
  publish: `Confirm public_index choice (default false) and ready_to_register: true. Pick a surface_mode: 'managed' (default — ANTON hosts the HTML pages generated in earlier phases) or 'external' (owner is bringing their own self-hosted site; supply external_primary_url as an http(s) URL). AAP capability endpoints stay on ANTON in either mode, so the trust chain is preserved. After this phase, the engine creates the local portal + caches the signed descriptor + leaves registry registration to the caller.`,
};

// ── Row mapping ────────────────────────────────────────────────────────────

interface SessionRow {
  id: string;
  owner_id: string;
  template_id: string;
  current_phase: PhaseId;
  phases_completed: PhaseId[] | string;
  accumulated_state: Record<string, unknown> | string;
  depth: WalkthroughDepth;
  status: 'active' | 'finalized' | 'abandoned';
  portal_id: string | null;
  created_at: string;
  updated_at: string;
}

function rowToState(row: SessionRow, template: PortalTemplate): SessionState {
  const phasesCompleted: PhaseId[] = Array.isArray(row.phases_completed)
    ? (row.phases_completed as PhaseId[])
    : (JSON.parse(row.phases_completed as string) as PhaseId[]);
  const accumulated: Record<string, unknown> = typeof row.accumulated_state === 'string'
    ? (JSON.parse(row.accumulated_state) as Record<string, unknown>)
    : (row.accumulated_state as Record<string, unknown>);
  return {
    id: row.id,
    ownerId: row.owner_id,
    templateId: row.template_id,
    template,
    currentPhase: row.current_phase,
    phasesCompleted,
    accumulatedState: accumulated,
    depth: row.depth,
    status: row.status,
    portalId: row.portal_id,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}
