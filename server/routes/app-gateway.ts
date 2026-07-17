/**
 * app-gateway.ts
 * REST API routes for the companion app gateway.
 * Dual router pattern (like FC Gateway):
 *   - publicRouter: mounted before auth middleware (/api/app/*)
 *   - adminRouter: mounted after auth middleware (/api/admin/app/*)
 *
 * SEC: Public auth endpoints use generic error messages to prevent oracle attacks.
 * SEC: Rate limiting applied via index.ts (authLimiter on /api/app/auth/*).
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import type { DatabaseAdapter } from '../db/database.js';
import { createAppAuthMiddleware } from '../middleware/app-auth.js';
import { createAppGatewayService, SUPPORTED_LANGUAGES } from '../services/app-gateway.js';
import { createAppEnrollmentService } from '../services/app-enrollment-service.js';
import { createAppPushService } from '../services/app-push-service.js';
import { createAppCheckpointService } from '../services/app-checkpoint-service.js';
import { createAgentService } from '../services/agent-service.js';
import { createAgentProcessor } from '../services/agent-processor.js';
import { createRegulatoryRadar } from '../services/regulatory-radar.js';
import type { createRadarFetcher } from '../services/radar-fetcher.js';
import { hybridSearch } from '../services/hybrid-search.js';
import { callChat, resolveModel } from '../services/provider-router.js';
import { createAppMailService, type MailProviderKind } from '../services/app-mail-service.js';
import type { ModuleDefinition } from '../../src/lib/types.js';
import { safeError } from '../lib/error-response.js';
// MODULES + AREAS are loaded at boot via dynamic import — the existing
// pattern across app-gateway.ts. A static import drags in src/lib/constants.ts
// which has hundreds of relative imports without .js extensions, tripping
// nodenext module resolution. Dynamic import sidesteps the static graph
// while still letting us cache the catalog once.

// ── Org membership check middleware ──────────────────────────────────────────
function createOrgMembershipCheck(db: DatabaseAdapter) {
  return async (req: Request, res: Response, next: () => void) => {
    const orgId = String(req.params.orgId);
    const userId = req.appUser?.id;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    // H5: Check membership AND per-org status
    const membership = await db.get<{ status: string }>(
      'SELECT status FROM connected_user_orgs WHERE connected_user_id = $1 AND org_id = $2',
      userId, orgId
    );
    if (!membership) return res.status(403).json({ error: 'Not a member of this organisation' });
    if (membership.status !== 'active') return res.status(403).json({ error: 'Suspended in this organisation' });
    next();
  };
}

type RadarFetcher = Awaited<ReturnType<typeof createRadarFetcher>>;

export async function createAppGatewayRoutes(db: DatabaseAdapter, radarFetcher?: RadarFetcher) {
  const publicRouter = Router();
  const adminRouter = Router();
  const svc = await createAppGatewayService(db);
  const appAuth = createAppAuthMiddleware(db);
  const orgMember = createOrgMembershipCheck(db);
  const enrollment = createAppEnrollmentService(db);
  const push = createAppPushService(db);
  const checkpoints = createAppCheckpointService(db);
  const radar = await createRegulatoryRadar(db);
  const mail = createAppMailService(db);
  // Specialized Agents — exposed to the ANTON Agent phone app over the same
  // app-session auth as the rest of the gateway (the desktop /api/agents mount
  // uses the webgui's auth; phones authenticate with their device session).
  const agentService = await createAgentService(db);
  const agentProcessor = await createAgentProcessor(db);

  // Module catalog — loaded once at boot, then served from memory. Typed via
  // ModuleDefinition (static import is fine for type-only) but loaded via
  // dynamic import so nodenext doesn't choke on src/lib/constants.ts's
  // extensionless relative imports.
  type AreaEntry = { id: string; label: string; moduleIds: string[] };
  const constantsMod = await import('../../src/lib/constants.js' as string) as {
    MODULES: ModuleDefinition[];
    AREAS: AreaEntry[];
  };
  const MODULES_CATALOG: ModuleDefinition[] = constantsMod.MODULES;
  const AREAS_CATALOG: AreaEntry[] = constantsMod.AREAS;

  // ══════════════════════════════════════════════════════════════════════════
  // PUBLIC ROUTES (/api/app/*) — mounted BEFORE auth middleware
  // ══════════════════════════════════════════════════════════════════════════

  // ── Supported languages (no auth — needed by companion app before login) ──
  publicRouter.get('/languages', (_req, res) => {
    res.json(SUPPORTED_LANGUAGES);
  });

  // ── Server discovery info (no auth — for LAN discovery fallback) ──
  publicRouter.get('/discover', async (_req, res) => {
    try {
      const { createMdnsAdvertiser } = await import('../services/mdns-advertiser.js');
      const advertiser = await createMdnsAdvertiser(parseInt(process.env.PORT || '3011', 10));
      res.json(advertiser.getInfo());
    } catch {
      res.json({ enabled: false, ip: null, port: parseInt(process.env.PORT || '3011', 10), serviceName: 'ANTON' });
    }
  });

  // ── Browse the LAN for other ANTON instances (spec §5.1 Mode A) ──────
  // The phone sometimes can't browse mDNS itself (PWA, restrictive
  // network APIs); the instance can do it on the phone's behalf as long
  // as the phone is already authenticated to one instance and trusts it.
  // Phase H fix M4 — gated by APP_GATEWAY_LAN_BROWSE=true so an instance
  // operator opts in explicitly. Off by default to avoid leaking peer
  // metadata to authenticated-but-untrusted users.
  publicRouter.get('/discover/lan', appAuth, async (_req, res) => {
    try {
      if (process.env.APP_GATEWAY_LAN_BROWSE !== 'true') {
        return res.json({ instances: [], reason: 'LAN browse disabled by operator' });
      }
      const { createMdnsAdvertiser } = await import('../services/mdns-advertiser.js');
      const advertiser = await createMdnsAdvertiser(parseInt(process.env.PORT || '3011', 10));
      const instances = await advertiser.browse(2500);
      res.json({ instances });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── Registration (no auth) ─────────────────────────────────────────────
  // 2026-07-17 hardening: open self-registration mints a session for ANYONE who can
  // reach the port, and a session unlocks LLM-spending appAuth routes. Default OFF —
  // devices onboard via the admin-issued enrollment QR (/api/admin/app/enrollment/start).
  // Set APP_GATEWAY_OPEN_REGISTRATION=true to restore walk-up registration.
  const openRegistrationEnabled = () => process.env.APP_GATEWAY_OPEN_REGISTRATION === 'true';
  const OPEN_REG_DISABLED = 'Self-registration is disabled on this instance — pair via the "Connect a device" QR (admin enrollment), or the operator can set APP_GATEWAY_OPEN_REGISTRATION=true';

  publicRouter.post('/register', async (req, res) => {
    try {
      if (!openRegistrationEnabled()) return res.status(403).json({ error: OPEN_REG_DISABLED });
      const { publicKey, displayName, preferredLanguage } = req.body;
      if (!publicKey) return res.status(400).json({ error: 'publicKey is required' });
      const result = await svc.registerUser(publicKey, displayName, preferredLanguage);
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  // ── Simple registration (no Ed25519 — for HTTP/LAN where crypto.subtle is unavailable) ──
  publicRouter.post('/register-simple', async (req, res) => {
    try {
      if (!openRegistrationEnabled()) return res.status(403).json({ error: OPEN_REG_DISABLED });
      const { displayName, preferredLanguage } = req.body;
      if (!displayName?.trim()) return res.status(400).json({ error: 'displayName is required' });
      const result = await svc.registerSimple(displayName.trim(), preferredLanguage || 'en');
      // Phase H fix M2 — don't log identifiers (links logs to a user)
      console.log('[app-gateway] register-simple success');
      res.json(result);
    } catch (err) {
      console.error('[app-gateway] register-simple error:', safeError(err));
      res.status(400).json({ error: safeError(err) });
    }
  });

  // ── Join org via invitation (no auth) ──────────────────────────────────
  publicRouter.post('/join', async (req, res) => {
    try {
      const { contactHash, invitationToken } = req.body;
      if (!contactHash || !invitationToken) {
        return res.status(400).json({ error: 'contactHash and invitationToken are required' });
      }
      const result = await svc.joinOrg(contactHash, invitationToken);
      res.json(result);
    } catch {
      // SEC: Generic error — don't reveal if token exists, is expired, or is exhausted
      res.status(400).json({ error: 'Invalid or expired invitation' });
    }
  });

  // ── Auth challenge (no auth) ───────────────────────────────────────────
  publicRouter.post('/auth/challenge', async (req, res) => {
    try {
      const { contactHash } = req.body;
      if (!contactHash) return res.status(400).json({ error: 'contactHash is required' });
      const result = await svc.createChallenge(contactHash);
      res.json(result);
    } catch {
      // SEC: Generic error — don't reveal if user exists
      res.status(400).json({ error: 'Authentication failed' });
    }
  });

  // ── Auth verify (no auth) ─────────────────────────────────────────────
  publicRouter.post('/auth/verify', async (req, res) => {
    try {
      const { contactHash, nonce, signature } = req.body;
      if (!contactHash || !nonce || !signature) {
        return res.status(400).json({ error: 'contactHash, nonce, and signature are required' });
      }
      const result = await svc.verifyChallenge(contactHash, nonce, signature);
      res.json(result);
    } catch {
      // SEC: Generic error — don't reveal nonce state or signature validity
      res.status(401).json({ error: 'Authentication failed' });
    }
  });

  // ── Logout (app auth) ─────────────────────────────────────────────────
  publicRouter.post('/logout', appAuth, async (req, res) => {
    try {
      const token = req.headers['x-app-session'] as string;
      await svc.revokeSession(token);
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: 'Logout failed' });
    }
  });

  // ── App-authenticated routes (require x-app-session header) ────────────

  // Org profile (public info) — SEC: requires org membership
  publicRouter.get('/org/:orgId/profile', appAuth, orgMember, async (req, res) => {
    try {
      const org = await svc.getOrgProfile(String(req.params.orgId));
      if (!org) return res.status(404).json({ error: 'Organisation not found' });
      // Return public-safe subset
      res.json({
        id: org.id,
        name: org.name,
        org_type: org.org_type,
        description: org.description,
        welcome_message: org.welcome_message,
        branding: org.branding,
        allow_file_upload: org.allow_file_upload,
        allow_voice_input: org.allow_voice_input,
        allow_reasoning_view: org.allow_reasoning_view,
      });
    } catch {
      res.status(500).json({ error: 'Failed to load organisation' });
    }
  });

  // Intent categories for an org — SEC: requires org membership
  publicRouter.get('/org/:orgId/intents', appAuth, orgMember, async (req, res) => {
    try {
      const intents = await svc.listIntentCategories(String(req.params.orgId));
      res.json(intents);
    } catch {
      res.status(500).json({ error: 'Failed to load intents' });
    }
  });

  // M7: Announcements for an org (active only for app users)
  publicRouter.get('/org/:orgId/announcements', appAuth, orgMember, async (req, res) => {
    try {
      const announcements = await svc.listAnnouncements(String(req.params.orgId), true);
      res.json(announcements);
    } catch {
      res.status(500).json({ error: 'Failed to load announcements' });
    }
  });

  // User's sessions for an org
  publicRouter.get('/org/:orgId/sessions', appAuth, orgMember, async (req, res) => {
    try {
      const sessions = await svc.getUserSessions(req.appUser!.id, String(req.params.orgId));
      res.json(sessions);
    } catch {
      res.status(500).json({ error: 'Failed to load sessions' });
    }
  });

  // Session detail
  publicRouter.get('/org/:orgId/sessions/:id', appAuth, orgMember, async (req, res) => {
    try {
      const detail = await svc.getSessionDetail(String(req.params.id), req.appUser!.id);
      if (!detail) return res.status(404).json({ error: 'Session not found' });
      res.json(detail);
    } catch {
      res.status(500).json({ error: 'Failed to load session' });
    }
  });

  // Delete own session
  publicRouter.delete('/org/:orgId/sessions/:id', appAuth, orgMember, async (req, res) => {
    try {
      const deleted = await svc.deleteSession(String(req.params.id), req.appUser!.id);
      res.json({ deleted });
    } catch {
      res.status(500).json({ error: 'Failed to delete session' });
    }
  });

  // Own profile
  publicRouter.get('/profile', appAuth, async (req, res) => {
    try {
      const profile = await svc.getUserProfile(req.appUser!.id);
      res.json(profile);
    } catch {
      res.status(500).json({ error: 'Failed to load profile' });
    }
  });

  // Update own profile
  publicRouter.put('/profile', appAuth, async (req, res) => {
    try {
      await svc.updateUserProfile(req.appUser!.id, req.body);
      const updated = await svc.getUserProfile(req.appUser!.id);
      res.json(updated);
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  // List org connections
  publicRouter.get('/connections', appAuth, async (req, res) => {
    try {
      const connections = await svc.getUserConnections(req.appUser!.id);
      res.json(connections);
    } catch {
      res.status(500).json({ error: 'Failed to load connections' });
    }
  });

  // Leave org
  publicRouter.delete('/leave/:orgId', appAuth, async (req, res) => {
    try {
      const left = await svc.leaveOrg(req.appUser!.id, String(req.params.orgId));
      res.json({ left });
    } catch {
      res.status(500).json({ error: 'Failed to leave organisation' });
    }
  });

  // ── Specialized Agents (ANTON Agent app) ─────────────────────────────
  // List this instance's agents so the phone can show + talk to them.
  publicRouter.get('/agents', appAuth, async (_req, res) => {
    try {
      const agents = await agentService.listAgents({ status: 'active' });
      // Lean projection — the phone needs identity + greeting, not the full
      // system prompt / connector config.
      res.json({
        agents: agents.map((a) => ({
          id: a.id,
          slug: a.slug,
          name: a.name,
          role: a.role_description,
          avatar: a.avatar,
          greeting: a.greeting_message,
          status: a.status,
        })),
      });
    } catch {
      res.status(500).json({ error: 'Failed to load agents' });
    }
  });

  // Talk to an agent — the chat + task-delegation surface. Sync (mirrors the
  // desktop /api/agents/:id/query); the /stream variant below is preferred.
  publicRouter.post('/agents/:id/query', appAuth, async (req, res) => {
    try {
      const { message, conversationId } = req.body as { message?: string; conversationId?: string };
      if (!message || typeof message !== 'string') {
        return res.status(400).json({ error: 'message required' });
      }
      const result = await agentProcessor.processQuery(String(req.params.id), message, {
        conversationId,
        source: 'app_gateway',
      });
      res.json({ success: true, ...result });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // Streaming chat — SSE `text_delta` events as the agent answers, then a
  // `complete` event ({ conversationId, tokens }). The phone renders tokens live.
  publicRouter.post('/agents/:id/query/stream', appAuth, async (req, res) => {
    const { message, conversationId } = req.body as { message?: string; conversationId?: string };
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'message required' });
    }
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    try {
      await agentProcessor.processQueryStream(String(req.params.id), message, {
        conversationId, source: 'app_gateway',
      }, res);
    } catch {
      // processQueryStream handles its own errors + res.end(); this only fires
      // if it threw before writing — surface as an SSE error so the client knows.
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ type: 'error', error: 'stream failed' })}\n\n`);
        res.end();
      }
    }
  });

  // Activity feed — what the agent has been doing: a flat, newest-first timeline
  // of the messages across its conversations (your asks, its answers, and the
  // tools it ran). The "see what they're doing" surface.
  publicRouter.get('/agents/:id/activity', appAuth, async (req, res) => {
    try {
      const agentId = String(req.params.id);
      const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '40'), 10) || 40));
      const rows = await db.all<{
        id: string; role: string; content: string; created_at: string;
        conversation_id: string; source: string | null;
      }>(
        `SELECT m.id, m.role, m.content, m.created_at, m.conversation_id, c.source
           FROM agent_messages m
           JOIN agent_conversations c ON m.conversation_id = c.id
          WHERE c.agent_id = ?
          ORDER BY m.created_at DESC
          LIMIT ?`,
        agentId, limit,
      );
      const activity = rows.map((r) => {
        let toolSummary: string | null = null;
        if (r.role === 'tool') {
          try {
            const t = JSON.parse(r.content) as { tool?: string; action?: string; success?: boolean };
            toolSummary = `${t.tool ?? 'tool'}${t.action ? '.' + t.action : ''}${t.success === false ? ' — failed' : ''}`;
          } catch { /* keep raw */ }
        }
        return {
          id: r.id,
          role: r.role, // user | assistant | tool
          text: toolSummary ?? String(r.content ?? '').slice(0, 280),
          at: r.created_at,
          conversationId: r.conversation_id,
          source: r.source,
        };
      });
      res.json({ activity });
    } catch {
      res.status(500).json({ error: 'Failed to load activity' });
    }
  });

  // ── Agent wallet (W1 — the agent-pay standalone bridge) ───────────────
  // The agent's FutureChain wallet lives in the agent-pay standalone on the
  // owner's computer. The phone reads it THROUGH this instance: the instance
  // holds the /pair bearer (admin-configured via /api/admin/app/agent-pay/*),
  // the phone uses its app-session. Instance-level (one agent-pay standalone
  // per instance) — the `agentId` query param is reserved for a future
  // per-agent-standalone model and is currently ignored.
  publicRouter.get('/agent/wallet', appAuth, async (_req, res) => {
    try {
      const { getAgentPayConfig } = await import('../services/agent-pay-config-service.js');
      const cfg = await getAgentPayConfig(db);
      if (!cfg) return res.json({ configured: false });
      const { getWalletStatus } = await import('../services/agent-pay-client.js');
      try {
        const s = await getWalletStatus(cfg);
        res.json({
          configured: true,
          reachable: true,
          address: s.walletAddress,
          balanceFtc: s.balanceFtc,
          lastSeenBlock: s.lastSeenBlock ?? null,
        });
      } catch (err) {
        // Standalone configured but down — tell the phone so it can show a
        // gentle "not reachable" state rather than an empty wallet.
        res.json({ configured: true, reachable: false, error: err instanceof Error ? err.message : 'agent-pay unavailable' });
      }
    } catch {
      res.status(500).json({ error: 'Failed to read agent wallet' });
    }
  });

  // Transaction ledger — newest-first, what the agent has bought/received.
  // This is the "see the transaction" surface.
  publicRouter.get('/agent/wallet/transactions', appAuth, async (req, res) => {
    try {
      const { getAgentPayConfig } = await import('../services/agent-pay-config-service.js');
      const cfg = await getAgentPayConfig(db);
      if (!cfg) return res.json({ configured: false, transactions: [] });
      const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit ?? '25'), 10) || 25));
      const { listTransactions } = await import('../services/agent-pay-client.js');
      try {
        const transactions = await listTransactions(cfg, limit);
        res.json({ configured: true, reachable: true, transactions });
      } catch (err) {
        res.json({ configured: true, reachable: false, transactions: [], error: err instanceof Error ? err.message : 'agent-pay unavailable' });
      }
    } catch {
      res.status(500).json({ error: 'Failed to read agent transactions' });
    }
  });

  // ── Agent tasks (W2 — the talk rail / collaboration task inbox) ───────
  // The phone gives the agent a task + reads its replies THROUGH this instance:
  // the instance holds the collaboration /pair bearer (admin-configured via
  // /api/admin/app/agent-collab/*), the phone uses its app-session. The phone
  // is ALWAYS the human side — it posts role:'human'; the person's brain (a
  // separate client of the same standalone) polls + replies role:'agent'.

  // Give a task → returns the new taskId.
  publicRouter.post('/agent/task', appAuth, async (req, res) => {
    try {
      const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
      if (!text || text.length > 8000) return res.status(400).json({ error: 'text must be 1–8000 characters' });
      const { getCollabConfig } = await import('../services/collab-config-service.js');
      const cfg = await getCollabConfig(db);
      if (!cfg) return res.status(409).json({ configured: false, error: 'No collaboration tool configured' });
      const { postTask } = await import('../services/collab-client.js');
      try {
        const r = await postTask(cfg, text);
        res.json({ configured: true, reachable: true, ...r });
      } catch (err) {
        res.status(502).json({ configured: true, reachable: false, error: err instanceof Error ? err.message : 'collaboration unavailable' });
      }
    } catch {
      res.status(500).json({ error: 'Failed to post task' });
    }
  });

  // The list of tasks (threads), newest-updated first — the "what I asked"
  // surface. ?since=<ms> returns only what changed.
  publicRouter.get('/agent/tasks', appAuth, async (req, res) => {
    try {
      const { getCollabConfig } = await import('../services/collab-config-service.js');
      const cfg = await getCollabConfig(db);
      if (!cfg) return res.json({ configured: false, tasks: [] });
      const since = req.query.since ? parseInt(String(req.query.since), 10) : undefined;
      const { listTasks } = await import('../services/collab-client.js');
      try {
        const tasks = await listTasks(cfg, Number.isFinite(since) ? { since } : {});
        res.json({ configured: true, reachable: true, tasks });
      } catch (err) {
        res.json({ configured: true, reachable: false, tasks: [], error: err instanceof Error ? err.message : 'collaboration unavailable' });
      }
    } catch {
      res.status(500).json({ error: 'Failed to load tasks' });
    }
  });

  // One task's thread (human + agent messages) — the app polls this.
  publicRouter.get('/agent/task/:id/messages', appAuth, async (req, res) => {
    try {
      const { getCollabConfig } = await import('../services/collab-config-service.js');
      const cfg = await getCollabConfig(db);
      if (!cfg) return res.json({ configured: false, messages: [] });
      const { listMessages } = await import('../services/collab-client.js');
      try {
        const thread = await listMessages(cfg, String(req.params.id));
        res.json({ configured: true, reachable: true, ...thread });
      } catch (err) {
        if (err && typeof err === 'object' && (err as { code?: number }).code === -32005) {
          return res.status(404).json({ configured: true, reachable: true, messages: [], error: 'Task not found' });
        }
        res.json({ configured: true, reachable: false, messages: [], error: err instanceof Error ? err.message : 'collaboration unavailable' });
      }
    } catch {
      res.status(500).json({ error: 'Failed to load task' });
    }
  });

  // A human follow-up message in a thread (role is always 'human' here).
  publicRouter.post('/agent/task/:id/message', appAuth, async (req, res) => {
    try {
      const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
      if (!text || text.length > 8000) return res.status(400).json({ error: 'text must be 1–8000 characters' });
      const { getCollabConfig } = await import('../services/collab-config-service.js');
      const cfg = await getCollabConfig(db);
      if (!cfg) return res.status(409).json({ configured: false, error: 'No collaboration tool configured' });
      const { postHumanMessage } = await import('../services/collab-client.js');
      try {
        const r = await postHumanMessage(cfg, String(req.params.id), text);
        res.json({ configured: true, reachable: true, ...r });
      } catch (err) {
        // -32005 = task not found (a real 404) vs the standalone being down (502).
        if (err && typeof err === 'object' && (err as { code?: number }).code === -32005) {
          return res.status(404).json({ configured: true, reachable: true, error: 'Task not found' });
        }
        res.status(502).json({ configured: true, reachable: false, error: err instanceof Error ? err.message : 'collaboration unavailable' });
      }
    } catch {
      res.status(500).json({ error: 'Failed to post message' });
    }
  });

  // Non-streaming query — returns JSON directly (works through any proxy)
  publicRouter.post('/org/:orgId/query-sync', appAuth, orgMember, async (req, res) => {
    try {
      const { message, sessionId, intentCategoryId, voiceInput, outputLanguage, capture, moduleId, model } = req.body;
      if (!message) return res.status(400).json({ error: 'message is required' });
      // Phase I fix Arch-3 — soft cap on inline capture payload size.
      // Spec §10.4 — keep per-screen usable at 200 kbps. 1MB is the
      // ceiling; clients should resize before sending.
      if (capture && typeof capture === 'object' && typeof (capture as { base64?: string }).base64 === 'string') {
        const b64 = (capture as { base64: string }).base64;
        const approxBytes = Math.floor((b64.length * 3) / 4);
        if (approxBytes > 1_048_576) {
          return res.status(413).json({ error: 'Capture too large — resize to ≤1MB before sending' });
        }
      }

      // Use a promise to capture the onComplete result. Forward the inline
      // capture payload (image base64 or text share) so processQuery can
      // wrap it in a content block — without this the photo never reaches
      // the LLM and only the typed message gets answered.
      const queryResult = await new Promise<Record<string, unknown>>((resolve, reject) => {
        svc.processQuery(
          {
            orgId: String(req.params.orgId),
            userId: req.appUser!.id,
            message, sessionId, intentCategoryId, voiceInput, outputLanguage, moduleId, model,
            capture,
          },
          () => {}, // Events not needed for sync
          (r) => { resolve(r as unknown as Record<string, unknown>); }
        ).catch(reject);
      });

      const text = (queryResult.text as string) || '';
      console.log(`[app-gateway] query-sync complete: ${text.length} chars`);

      // Generate follow-up suggestions via Haiku (fast, cheap)
      let suggestions: string[] = [];
      try {
        const { sendRequest } = await import('../services/unified-llm-client.js');
        const { getRoutedUtilityModel } = await import('../services/utility-model.js');
        const sugResult = await sendRequest({
          // Configured utility model, provider-routed (review 3.8).
          model: await getRoutedUtilityModel(db) as import('../../src/lib/types.js').ModelId,
          thinking: 'quick' as import('../../src/lib/types.js').ThinkingLevel,
          system: 'Given a conversation, suggest 3 short follow-up questions the user might ask next. Return ONLY a JSON array of strings, e.g. ["question 1", "question 2", "question 3"]. Each under 50 chars.',
          messages: [
            { role: 'user', content: message },
            { role: 'assistant', content: text.slice(0, 500) },
          ],
          maxTokens: 200,
        });
        const parsed = JSON.parse(sugResult.text.replace(/```json?\n?/g, '').replace(/```/g, '').trim());
        if (Array.isArray(parsed)) suggestions = parsed.slice(0, 3);
      } catch { /* non-fatal */ }

      res.json({
        text,
        sessionId: queryResult.sessionId || sessionId,
        messageId: queryResult.messageId || '',
        suggestions,
      });
    } catch (err) {
      console.error('[app-gateway] query-sync error:', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  // REST query fallback (for clients that can't use WebSocket)
  publicRouter.post('/org/:orgId/query', appAuth, orgMember, async (req, res) => {
    try {
      const { message, sessionId, intentCategoryId, voiceInput, outputLanguage, moduleId, model } = req.body;
      if (!message) return res.status(400).json({ error: 'message is required' });

      // Set SSE headers for streaming
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      });

      await svc.processQuery(
        {
          orgId: String(req.params.orgId),
          userId: req.appUser!.id,
          message,
          sessionId,
          intentCategoryId,
          voiceInput,
          outputLanguage,
          moduleId,
          model,
        },
        (event) => {
          res.write(`data: ${JSON.stringify(event)}\n\n`);
        },
        (result) => {
          res.write(`data: ${JSON.stringify({ type: 'complete', ...result })}\n\n`);
          res.end();
        }
      );
    } catch (err) {
      // If headers already sent, write error as SSE
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ type: 'error', error: 'Query processing failed' })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ error: safeError(err) });
      }
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // ADMIN ROUTES (/api/admin/app/*) — uses ANTON session auth
  // ══════════════════════════════════════════════════════════════════════════

  // ── Mesh relay override (Track C Slice 2) ──────────────────────────────
  // Read / set the canonical mesh relay list. Empty array clears the
  // override and reverts to ANTON_MESH_RELAYS env. Phones see the new list
  // on next launch via /instance-info; the active dialer keeps using its
  // boot-time list until the next server restart (acceptable since the
  // pain we're fixing is "re-pair the fleet", not "restart the server").

  adminRouter.get('/mesh/relays', async (_req, res) => {
    try {
      const { getRelayEndpoints } = await import('../services/mesh-config-service.js');
      const cfg = await getRelayEndpoints(db);
      res.json(cfg);
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  adminRouter.put('/mesh/relays', async (req, res) => {
    try {
      const body = req.body ?? {};
      if (!Array.isArray(body.endpoints)) {
        return res.status(400).json({ error: 'endpoints must be a string array' });
      }
      const { setRelayEndpoints, getRelayEndpoints } = await import('../services/mesh-config-service.js');
      await setRelayEndpoints(db, body.endpoints);
      const cfg = await getRelayEndpoints(db);
      res.json(cfg);
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  // ── Agent-Pay standalone bridge config (W1) ────────────────────────────
  // Point this instance at the owner's agent-pay standalone (the agent's
  // FutureChain wallet, a loopback JSON-RPC server). The phone then reads the
  // wallet through /api/app/agent/wallet. Two ways to set the bearer: paste an
  // existing one, OR send the 6-digit code the standalone prints on boot and
  // we pair headlessly (long TTL so the bridge survives). The bearer is stored
  // AES-256-GCM-encrypted (when INSTANCE_KEY_ENCRYPTION_KEY is set) and is
  // NEVER returned to any client.
  adminRouter.get('/agent-pay/config', async (_req, res) => {
    try {
      const { getAgentPayConfigPublic } = await import('../services/agent-pay-config-service.js');
      res.json(await getAgentPayConfigPublic(db));
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  adminRouter.put('/agent-pay/config', async (req, res) => {
    try {
      const body = req.body ?? {};
      const url = typeof body.url === 'string' ? body.url.trim() : '';
      if (!url) return res.status(400).json({ error: 'url is required' });
      let bearer: string | undefined =
        typeof body.bearer === 'string' && body.bearer ? body.bearer : undefined;
      if (!bearer && typeof body.code === 'string' && body.code) {
        // Headless pairing: exchange the standalone's boot code for a
        // long-lived bearer (30d — the standalone clamps to its max).
        const { pairWithCode } = await import('../services/agent-pay-client.js');
        const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
        const paired = await pairWithCode(url, 'anton-instance', String(body.code).trim(), THIRTY_DAYS);
        bearer = paired.sessionToken;
      }
      if (!bearer) {
        return res.status(400).json({ error: 'provide either bearer or a 6-digit pairing code' });
      }
      const { setAgentPayConfig, getAgentPayConfigPublic } = await import('../services/agent-pay-config-service.js');
      await setAgentPayConfig(db, { url, bearer });
      res.json({ ...(await getAgentPayConfigPublic(db)), paired: true });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  adminRouter.delete('/agent-pay/config', async (_req, res) => {
    try {
      const { clearAgentPayConfig } = await import('../services/agent-pay-config-service.js');
      await clearAgentPayConfig(db);
      res.json({ configured: false, url: null });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // Live probe — verify pairing actually works (reads getStatus off the
  // standalone). Lets the operator confirm the wiring before the phone tries.
  adminRouter.get('/agent-pay/status', async (_req, res) => {
    try {
      const { getAgentPayConfig } = await import('../services/agent-pay-config-service.js');
      const cfg = await getAgentPayConfig(db);
      if (!cfg) return res.json({ configured: false, reachable: false });
      const { getWalletStatus } = await import('../services/agent-pay-client.js');
      try {
        const s = await getWalletStatus(cfg);
        res.json({
          configured: true,
          reachable: true,
          url: cfg.url,
          walletAddress: s.walletAddress,
          balanceFtc: s.balanceFtc,
          paired: s.paired,
        });
      } catch (err) {
        res.json({ configured: true, reachable: false, url: cfg.url, error: err instanceof Error ? err.message : 'agent-pay unavailable' });
      }
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── Agent-Collaboration standalone bridge config (W2 talk rail) ────────
  // Point this instance at the owner's anton-collaboration standalone (the
  // agent's task inbox). Same shape as the agent-pay config: paste a bearer OR
  // send the 6-digit boot code for headless pairing. Bearer stored encrypted,
  // never returned.
  adminRouter.get('/agent-collab/config', async (_req, res) => {
    try {
      const { getCollabConfigPublic } = await import('../services/collab-config-service.js');
      res.json(await getCollabConfigPublic(db));
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  adminRouter.put('/agent-collab/config', async (req, res) => {
    try {
      const body = req.body ?? {};
      const url = typeof body.url === 'string' ? body.url.trim() : '';
      if (!url) return res.status(400).json({ error: 'url is required' });
      let bearer: string | undefined =
        typeof body.bearer === 'string' && body.bearer ? body.bearer : undefined;
      if (!bearer && typeof body.code === 'string' && body.code) {
        const { pairWithCode } = await import('../services/collab-client.js');
        const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
        const paired = await pairWithCode(url, 'anton-instance', String(body.code).trim(), THIRTY_DAYS);
        bearer = paired.sessionToken;
      }
      if (!bearer) {
        return res.status(400).json({ error: 'provide either bearer or a 6-digit pairing code' });
      }
      const { setCollabConfig, getCollabConfigPublic } = await import('../services/collab-config-service.js');
      await setCollabConfig(db, { url, bearer });
      res.json({ ...(await getCollabConfigPublic(db)), paired: true });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  adminRouter.delete('/agent-collab/config', async (_req, res) => {
    try {
      const { clearCollabConfig } = await import('../services/collab-config-service.js');
      await clearCollabConfig(db);
      res.json({ configured: false, url: null });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  adminRouter.get('/agent-collab/status', async (_req, res) => {
    try {
      const { getCollabConfig } = await import('../services/collab-config-service.js');
      const cfg = await getCollabConfig(db);
      if (!cfg) return res.json({ configured: false, reachable: false });
      const { getStatus } = await import('../services/collab-client.js');
      try {
        const s = await getStatus(cfg);
        res.json({ configured: true, reachable: true, url: cfg.url, agentName: s.agentName, paired: s.paired });
      } catch (err) {
        res.json({ configured: true, reachable: false, url: cfg.url, error: err instanceof Error ? err.message : 'collaboration unavailable' });
      }
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── Org Profiles ───────────────────────────────────────────────────────

  adminRouter.get('/orgs', async (_req, res) => {
    try {
      res.json(await svc.listOrgProfiles());
    } catch {
      res.status(500).json({ error: 'Failed to list organisations' });
    }
  });

  adminRouter.post('/orgs', async (req, res) => {
    try {
      const { name, org_type } = req.body;
      if (!name || !org_type) return res.status(400).json({ error: 'name and org_type are required' });
      const org = await svc.createOrgProfile(req.body);
      res.status(201).json(org);
    } catch {
      res.status(500).json({ error: 'Failed to create organisation' });
    }
  });

  adminRouter.get('/orgs/:id', async (req, res) => {
    try {
      const org = await svc.getOrgProfile(String(req.params.id));
      if (!org) return res.status(404).json({ error: 'Organisation not found' });
      res.json(org);
    } catch {
      res.status(500).json({ error: 'Failed to load organisation' });
    }
  });

  adminRouter.put('/orgs/:id', async (req, res) => {
    try {
      const org = await svc.updateOrgProfile(String(req.params.id), req.body);
      if (!org) return res.status(404).json({ error: 'Organisation not found' });
      res.json(org);
    } catch {
      res.status(500).json({ error: 'Failed to update organisation' });
    }
  });

  adminRouter.delete('/orgs/:id', async (req, res) => {
    try {
      const deleted = await svc.deleteOrgProfile(String(req.params.id));
      res.json({ deleted });
    } catch {
      res.status(500).json({ error: 'Failed to delete organisation' });
    }
  });

  // ── Intent Categories ──────────────────────────────────────────────────

  adminRouter.get('/orgs/:orgId/intents', async (req, res) => {
    try {
      res.json(await svc.listIntentCategories(String(req.params.orgId)));
    } catch {
      res.status(500).json({ error: 'Failed to list intents' });
    }
  });

  adminRouter.post('/orgs/:orgId/intents', async (req, res) => {
    try {
      const { name } = req.body;
      if (!name) return res.status(400).json({ error: 'name is required' });
      const intent = await svc.createIntentCategory(String(req.params.orgId), req.body);
      res.status(201).json(intent);
    } catch {
      res.status(500).json({ error: 'Failed to create intent' });
    }
  });

  adminRouter.put('/intents/:id', async (req, res) => {
    try {
      const intent = await svc.updateIntentCategory(String(req.params.id), req.body);
      res.json(intent);
    } catch {
      res.status(500).json({ error: 'Failed to update intent' });
    }
  });

  adminRouter.delete('/intents/:id', async (req, res) => {
    try {
      const deleted = await svc.deleteIntentCategory(String(req.params.id));
      res.json({ deleted });
    } catch {
      res.status(500).json({ error: 'Failed to delete intent' });
    }
  });

  // ── Invitations ────────────────────────────────────────────────────────

  adminRouter.get('/orgs/:orgId/invitations', async (req, res) => {
    try {
      res.json(await svc.listInvitations(String(req.params.orgId)));
    } catch {
      res.status(500).json({ error: 'Failed to list invitations' });
    }
  });

  adminRouter.post('/orgs/:orgId/invitations', async (req, res) => {
    try {
      const invitation = await svc.createInvitation(String(req.params.orgId), req.body);
      res.status(201).json(invitation);
    } catch {
      res.status(500).json({ error: 'Failed to create invitation' });
    }
  });

  adminRouter.delete('/invitations/:id', async (req, res) => {
    try {
      const deleted = await svc.deleteInvitation(String(req.params.id));
      res.json({ deleted });
    } catch {
      res.status(500).json({ error: 'Failed to delete invitation' });
    }
  });

  // ── Connected Users ────────────────────────────────────────────────────

  adminRouter.get('/orgs/:orgId/users', async (req, res) => {
    try {
      res.json(await svc.listConnectedUsers(String(req.params.orgId)));
    } catch {
      res.status(500).json({ error: 'Failed to list users' });
    }
  });

  adminRouter.put('/orgs/:orgId/users/:userId', async (req, res) => {
    try {
      await svc.updateConnectedUser(String(req.params.userId), String(req.params.orgId), req.body);
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  adminRouter.delete('/orgs/:orgId/users/:userId', async (req, res) => {
    try {
      const removed = await svc.removeConnectedUser(String(req.params.userId), String(req.params.orgId));
      res.json({ removed });
    } catch {
      res.status(500).json({ error: 'Failed to remove user' });
    }
  });

  // ── Analytics ──────────────────────────────────────────────────────────

  adminRouter.get('/orgs/:orgId/analytics', async (req, res) => {
    try {
      // SEC: Clamp days parameter to prevent unbounded queries
      const days = Math.min(Math.max(parseInt(req.query.days as string, 10) || 30, 1), 365);
      res.json(await svc.getAnalytics(String(req.params.orgId), days));
    } catch {
      res.status(500).json({ error: 'Failed to load analytics' });
    }
  });

  adminRouter.get('/orgs/:orgId/analytics/summary', async (req, res) => {
    try {
      res.json(await svc.getAnalyticsSummary(String(req.params.orgId)));
    } catch {
      res.status(500).json({ error: 'Failed to load analytics summary' });
    }
  });

  // ── Announcements (admin) ────────────────────────────────────────────

  adminRouter.get('/orgs/:orgId/announcements', async (req, res) => {
    try {
      res.json(await svc.listAnnouncements(String(req.params.orgId), false));
    } catch {
      res.status(500).json({ error: 'Failed to list announcements' });
    }
  });

  adminRouter.post('/orgs/:orgId/announcements', async (req, res) => {
    try {
      const { title, content } = req.body;
      if (!title || !content) return res.status(400).json({ error: 'title and content are required' });
      const announcement = await svc.createAnnouncement(String(req.params.orgId), req.body);
      res.status(201).json(announcement);
    } catch {
      res.status(500).json({ error: 'Failed to create announcement' });
    }
  });

  adminRouter.put('/announcements/:id', async (req, res) => {
    try {
      const announcement = await svc.updateAnnouncement(String(req.params.id), req.body);
      res.json(announcement);
    } catch {
      res.status(500).json({ error: 'Failed to update announcement' });
    }
  });

  adminRouter.delete('/announcements/:id', async (req, res) => {
    try {
      const deleted = await svc.deleteAnnouncement(String(req.params.id));
      res.json({ deleted });
    } catch {
      res.status(500).json({ error: 'Failed to delete announcement' });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // ENROLLMENT (spec §5.2) — Ed25519 pairing replaces register-simple for v2 clients
  // Legacy register-simple stays available for backwards compatibility.
  // ══════════════════════════════════════════════════════════════════════════

  // Public — fetch a pre-issued enrollment package (POST so the token
  // rides in the body, not the URL — Phase H fix H1, prevents leakage
  // via proxy / server access logs).
  publicRouter.post('/enrollment/lookup', async (req, res) => {
    try {
      const token = typeof req.body?.token === 'string' ? req.body.token : '';
      if (!/^[A-Za-z0-9_-]+$/.test(token) || token.length < 16 || token.length > 128) {
        return res.status(400).json({ error: 'Invalid enrollment token' });
      }
      const pkg = await enrollment.getEnrollment(token);
      if (!pkg) return res.status(404).json({ error: 'Enrollment token expired or already used' });
      res.json(pkg);
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // Legacy GET retained briefly for clients that haven't been updated.
  // Logs the token-prefix only (so the full token doesn't appear in
  // access logs). Will be removed in a future major version.
  publicRouter.get('/enrollment/:token', async (req, res) => {
    try {
      const token = String(req.params.token);
      if (!/^[A-Za-z0-9_-]+$/.test(token) || token.length < 16 || token.length > 128) {
        return res.status(400).json({ error: 'Invalid enrollment token' });
      }
      const pkg = await enrollment.getEnrollment(token);
      if (!pkg) return res.status(404).json({ error: 'Enrollment token expired or already used' });
      res.json(pkg);
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // Public — complete enrollment (signed by client's fresh Ed25519 keypair)
  publicRouter.post('/enrollment/complete', async (req, res) => {
    try {
      const b = req.body ?? {};
      const required = ['token', 'nonce', 'device_pubkey', 'device_name', 'device_model', 'device_os', 'app_version', 'signature'] as const;
      for (const k of required) {
        if (typeof b[k] !== 'string' || !b[k].trim()) {
          return res.status(400).json({ error: `${k} is required` });
        }
      }
      // Length caps to bound DB columns
      if (b.device_pubkey.length > 256) return res.status(400).json({ error: 'device_pubkey too long' });
      if (b.signature.length > 512) return res.status(400).json({ error: 'signature too long' });
      const result = await enrollment.completeEnrollment({
        token: String(b.token), nonce: String(b.nonce),
        device_pubkey: String(b.device_pubkey),
        device_name: String(b.device_name).slice(0, 200),
        device_model: String(b.device_model).slice(0, 200),
        device_os: String(b.device_os).slice(0, 100),
        app_version: String(b.app_version).slice(0, 32),
        signature: String(b.signature),
        preferred_language: typeof b.preferred_language === 'string' ? b.preferred_language : undefined,
      });
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  // Authenticated — list devices belonging to the current user
  publicRouter.get('/devices', appAuth, async (req, res) => {
    try {
      const userId = req.appUser!.id;
      const devices = await enrollment.listDevices(userId);
      res.json({ devices });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // Authenticated — unpair (revoke) a device
  publicRouter.delete('/devices/:id', appAuth, async (req, res) => {
    try {
      const userId = req.appUser!.id;
      await enrollment.revokeDevice(userId, String(req.params.id));
      res.json({ revoked: true });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // Authenticated — get the instance's display info (used by Settings).
  //
  // Track C: publishes the canonical mesh relay list so paired phones can
  // discover relay rotations without re-pairing. The list is sourced via
  // mesh-config-service (DB override → env fallback), so an operator can
  // flip the value through the admin endpoint without restarting.
  publicRouter.get('/instance-info', appAuth, async (_req, res) => {
    try {
      const id = await enrollment.getOrCreateInstanceIdentity();
      const { getRelayEndpoints } = await import('../services/mesh-config-service.js');
      const relays = await getRelayEndpoints(db);
      res.json({
        display_name: id.display_name,
        contact_hash: id.contact_hash,
        pubkey: id.pubkey,
        cert_fingerprint: id.cert_fingerprint,
        relay_endpoints: relays.endpoints,
        // Optional: enables web-push (PWA) on instances that have configured
        // a VAPID keypair. Native iOS / Android registration doesn't use this.
        vapid_public_key: process.env.WEBPUSH_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY || null,
      });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // Admin — generate an enrollment QR (admin issues to a user about to pair)
  adminRouter.post('/enrollment/start', async (req, res) => {
    try {
      const b = req.body ?? {};
      // The desktop UI's `req.user.id` is attached upstream by main auth middleware
      const issuedBy = (req as { user?: { id: string } }).user?.id ?? 'admin';
      // Build the endpoint set from env / request. Default port MUST match the
      // server's actual listen port (server/index.ts: 3001) — otherwise the
      // enrollment QR points phones at the wrong port and pairing fails.
      const port = parseInt(process.env.PORT || '3001', 10);
      const advertiser = await import('../services/mdns-advertiser.js')
        .then(m => m.createMdnsAdvertiser(port))
        .catch(() => null);
      const info = advertiser?.getInfo();
      // LAN endpoint: prefer the mDNS-resolved host IP, but fall back to the
      // primary non-internal IPv4 so a fresh download still produces a usable
      // pairing QR when mDNS can't resolve the host (common on first run).
      let lanIp = info?.ip;
      if (!lanIp) {
        try {
          const os = await import('node:os');
          outer: for (const ifaces of Object.values(os.networkInterfaces())) {
            for (const i of ifaces ?? []) {
              if (i.family === 'IPv4' && !i.internal) { lanIp = i.address; break outer; }
            }
          }
        } catch { /* no LAN IP resolvable */ }
      }
      const lan = lanIp ? `http://${lanIp}:${port}` : undefined;
      const wan = process.env.APP_GATEWAY_PUBLIC_URL || undefined;
      // Honour the caller's transport choice — without this the route
      // silently downgrades every request to public_https because
      // startEnrollment() defaults to that when transport is undefined.
      const transport: 'mesh' | 'public_https' | undefined =
        b.transport === 'mesh' || b.transport === 'public_https' ? b.transport : undefined;
      const relayEndpoints: string[] | undefined =
        Array.isArray(b.relay_endpoints) && b.relay_endpoints.every((x: unknown) => typeof x === 'string')
          ? (b.relay_endpoints as string[])
          : undefined;
      const pkg = await enrollment.startEnrollment({
        intended_user_id: typeof b.intended_user_id === 'string' ? b.intended_user_id : null,
        org_id: typeof b.org_id === 'string' ? b.org_id : null,
        intended_role: typeof b.intended_role === 'string' ? b.intended_role : 'member',
        display_name_hint: typeof b.display_name_hint === 'string' ? b.display_name_hint : null,
        language_hint: typeof b.language_hint === 'string' ? b.language_hint : null,
        endpoints: { lan, wan, mdns_name: info?.serviceName },
        issued_by_user_id: issuedBy,
        transport,
        relay_endpoints: relayEndpoints,
        require_confirmation_code: b.require_confirmation_code === true,
      });
      res.json(pkg);
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // PUSH NOTIFICATIONS (spec §8.7)
  // ══════════════════════════════════════════════════════════════════════════

  publicRouter.post('/push/register', appAuth, async (req, res) => {
    try {
      const b = req.body ?? {};
      if (typeof b.device_id !== 'string' || typeof b.platform !== 'string' || typeof b.token !== 'string') {
        return res.status(400).json({ error: 'device_id, platform and token are required' });
      }
      if (!['apns', 'fcm', 'web-push'].includes(b.platform)) {
        return res.status(400).json({ error: 'platform must be apns, fcm, or web-push' });
      }
      // Tenancy: device must belong to this user
      const owns = await db.get<{ id: string }>(
        `SELECT id FROM app_devices WHERE id = ? AND connected_user_id = ? AND revoked_at IS NULL`,
        b.device_id, req.appUser!.id,
      );
      if (!owns) return res.status(404).json({ error: 'Device not found' });
      const result = await push.registerToken({
        device_id: String(b.device_id),
        platform: b.platform as 'apns' | 'fcm' | 'web-push',
        token: String(b.token).slice(0, 1024),
        environment: b.environment === 'development' ? 'development' : 'production',
        topic: typeof b.topic === 'string' ? b.topic.slice(0, 200) : undefined,
        endpoint: typeof b.endpoint === 'string' ? b.endpoint.slice(0, 1024) : undefined,
        p256dh_key: typeof b.p256dh_key === 'string' ? b.p256dh_key.slice(0, 256) : undefined,
        auth_key: typeof b.auth_key === 'string' ? b.auth_key.slice(0, 256) : undefined,
      });
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  publicRouter.delete('/push/:platform/:token', appAuth, async (req, res) => {
    try {
      const b = req.body ?? {};
      if (typeof b.device_id !== 'string') return res.status(400).json({ error: 'device_id is required' });
      const owns = await db.get<{ id: string }>(
        `SELECT id FROM app_devices WHERE id = ? AND connected_user_id = ?`,
        b.device_id, req.appUser!.id,
      );
      if (!owns) return res.status(404).json({ error: 'Device not found' });
      const platform = req.params.platform;
      if (platform !== 'apns' && platform !== 'fcm' && platform !== 'web-push') {
        return res.status(400).json({ error: 'invalid platform' });
      }
      await push.unregisterToken(String(b.device_id), platform, String(req.params.token));
      res.json({ unregistered: true });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // CHECKPOINTS (spec §8.6 — pending approvals)
  // ══════════════════════════════════════════════════════════════════════════

  publicRouter.get('/checkpoints', appAuth, async (req, res) => {
    try {
      const orgId = typeof req.query.orgId === 'string' ? req.query.orgId : undefined;
      const limit = req.query.limit ? Math.min(parseInt(String(req.query.limit), 10) || 100, 500) : undefined;
      const list = await checkpoints.listPending(req.appUser!.id, { orgId, limit });
      res.json({ checkpoints: list });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  publicRouter.get('/checkpoints/:id', appAuth, async (req, res) => {
    try {
      const c = await checkpoints.get(String(req.params.id), req.appUser!.id);
      if (!c) return res.status(404).json({ error: 'Checkpoint not found' });
      res.json({ checkpoint: c });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  publicRouter.post('/checkpoints/:id/respond', appAuth, async (req, res) => {
    try {
      // Phase H fix C1 — accept either a raw body OR a signed envelope.
      // When the envelope is present, verify Ed25519 signature against
      // the device's pubkey AND record the nonce to prevent replay.
      // Falls back to raw body for legacy clients (still session-token
      // gated) so the rollout is backwards compatible.
      let b: Record<string, unknown> = req.body ?? {};
      if (b.envelope && typeof b.envelope === 'object') {
        const env = b.envelope as { payload?: string; nonce?: string; signature?: string; device_pubkey?: string };
        if (typeof env.payload !== 'string' || typeof env.nonce !== 'string' || typeof env.signature !== 'string' || typeof env.device_pubkey !== 'string') {
          return res.status(400).json({ error: 'Malformed signed envelope' });
        }
        try {
          await enrollment.verifySignedEnvelope({
            device_pubkey: env.device_pubkey,
            nonce: env.nonce,
            payload: `${env.nonce}.${env.payload}`,    // matches client signEnvelope
            signature: env.signature,
          });
        } catch (e) {
          return res.status(401).json({ error: safeError(e) });
        }
        try { b = JSON.parse(env.payload); }
        catch { return res.status(400).json({ error: 'Envelope payload not JSON' }); }
      }
      if (!['approved', 'rejected', 'modified'].includes(b.decision as string)) {
        return res.status(400).json({ error: 'decision must be approved, rejected, or modified' });
      }
      const result = await checkpoints.respond(String(req.params.id), req.appUser!.id,
        typeof b.device_id === 'string' ? b.device_id : null, {
          decision: b.decision as 'approved' | 'rejected' | 'modified',
          note: typeof b.note === 'string' ? (b.note as string).slice(0, 4000) : undefined,
          modification: typeof b.modification === 'object' && b.modification !== null ? b.modification as Record<string, unknown> : undefined,
          biometric_confirmed: !!b.biometric_confirmed,
        });
      res.json({ checkpoint: result });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  // Admin — create a checkpoint (used by workflow / mission / atlas integrations)
  adminRouter.post('/checkpoints', async (req, res) => {
    try {
      const b = req.body ?? {};
      const required = ['org_id', 'connected_user_id', 'title'] as const;
      for (const k of required) {
        if (typeof b[k] !== 'string' || !b[k].trim()) {
          return res.status(400).json({ error: `${k} is required` });
        }
      }
      const result = await checkpoints.create({
        org_id: String(b.org_id),
        connected_user_id: String(b.connected_user_id),
        title: String(b.title).slice(0, 300),
        summary: typeof b.summary === 'string' ? b.summary.slice(0, 2000) : undefined,
        rationale: typeof b.rationale === 'string' ? b.rationale.slice(0, 8000) : undefined,
        severity: ['low','normal','high','critical'].includes(b.severity) ? b.severity : 'normal',
        payload: typeof b.payload === 'object' && b.payload !== null ? b.payload : undefined,
        source_kind: typeof b.source_kind === 'string' ? b.source_kind.slice(0, 64) : undefined,
        source_id: typeof b.source_id === 'string' ? b.source_id.slice(0, 200) : undefined,
        deep_link: typeof b.deep_link === 'string' ? b.deep_link.slice(0, 500) : undefined,
        expires_at: typeof b.expires_at === 'string' ? b.expires_at : undefined,
      });
      res.json({ checkpoint: result });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // CALENDAR (companion app surface) — unified day view.
  //
  // v1 sources:
  //   • ANTON-internal: pending app_checkpoints with expires_at land here
  //     as time-anchored events (the deadline is the event time)
  //   • External providers: scaffolded for M365 / Google / iCloud / Family
  //     in the source-legend strip; actual sync arrives with the mail
  //     OAuth/IMAP work in a follow-up phase.
  // ══════════════════════════════════════════════════════════════════════════

  publicRouter.get('/org/:orgId/calendar/today', appAuth, orgMember, async (req, res) => {
    try {
      const userId = req.appUser!.id;
      const orgId = String(req.params.orgId);
      const dayParam = typeof req.query.date === 'string' ? req.query.date : undefined;
      // Default to "today in the server's timezone"
      const day = dayParam ? new Date(dayParam) : new Date();
      const start = new Date(day); start.setHours(0, 0, 0, 0);
      const end = new Date(day);   end.setHours(23, 59, 59, 999);

      // ANTON-internal events: pending checkpoints whose deadline lands in the day
      const checkpoints = await db.all<{
        id: string; title: string; summary: string | null;
        severity: string; expires_at: string; deep_link: string | null;
      }>(
        `SELECT id, title, summary, severity, expires_at, deep_link
         FROM app_checkpoints
         WHERE status = 'pending' AND connected_user_id = $1 AND org_id = $2
           AND expires_at IS NOT NULL
           AND expires_at >= $3 AND expires_at <= $4
         ORDER BY expires_at ASC`,
        userId, orgId, start.toISOString(), end.toISOString()
      ).catch(() => []);

      // Personal events: rows the user (or a linked community contact) added
      // via POST /calendar/events. The companion-app create-event sheet writes
      // here. Pulled for the same day window as checkpoints.
      const personalEvents = await db.all<{
        id: string; title: string; description: string | null; location: string | null;
        start_at: string; end_at: string; all_day: number;
      }>(
        `SELECT id, title, description, location, start_at, end_at, all_day
         FROM community_events
         WHERE start_at >= $1 AND start_at <= $2
         ORDER BY start_at ASC`,
        start.toISOString(), end.toISOString()
      ).catch(() => []);

      const checkpointEvents = checkpoints.map(c => {
        const t = new Date(c.expires_at);
        return {
          id: `ck:${c.id}`,
          time: t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
          duration_minutes: 15,
          title: c.title,
          location: c.summary || 'ANTON checkpoint',
          source: 'anton' as const,
          source_label: 'ANTON',
          color: c.severity === 'critical' || c.severity === 'high' ? 'red' as const : 'teal' as const,
          anton: true,
          ext:   false,
          personal: false,
          anton_prep: c.severity === 'high' || c.severity === 'critical' ? 'High-severity approval expires soon' : null,
          deep_link: c.deep_link || `/approvals/${c.id}`,
        };
      });

      const personalEventRows = personalEvents.map(e => {
        const startD = new Date(e.start_at);
        const endD = new Date(e.end_at);
        const durMin = Math.max(15, Math.round((endD.getTime() - startD.getTime()) / 60000));
        return {
          id: `ev:${e.id}`,
          time: e.all_day ? '—' : startD.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
          duration_minutes: e.all_day ? 1440 : durMin,
          title: e.title,
          location: e.location || (e.description ?? ''),
          source: 'personal' as const,
          source_label: 'Personal',
          color: 'gold' as const,
          anton: false,
          ext:   false,
          personal: true,
          anton_prep: null,
          deep_link: null,
        };
      });

      // Merge + sort chronologically (all-day events surface first).
      const events = [...checkpointEvents, ...personalEventRows].sort((a, b) => {
        if (a.time === '—' && b.time !== '—') return -1;
        if (b.time === '—' && a.time !== '—') return 1;
        return a.time.localeCompare(b.time);
      });

      // Source legend — ANTON + Personal are real; others are scaffolded.
      const sources = [
        { id: 'anton',    label: 'ANTON',           count: checkpointEvents.length, color: 'teal'  as const },
        { id: 'personal', label: 'Personal',        count: personalEventRows.length, color: 'gold'  as const },
        { id: 'work',     label: 'Work · M365',     count: 0,                       color: 'blue'  as const },
        { id: 'family',   label: 'Family',          count: 0,                       color: 'plum'  as const },
      ];

      // ANTON prep banner — most pressing high/critical event today
      const prepEvent = checkpointEvents.find(e => e.color === 'red');
      const prep = prepEvent ? {
        title: prepEvent.title,
        note: prepEvent.anton_prep || 'Brief ready · open to review.',
      } : null;

      res.json({
        date: start.toISOString().slice(0, 10),
        sources,
        events,
        prep,
      });
    } catch (err) {
      console.error('[app-gateway] calendar/today error:', err);
      res.status(500).json({ error: 'Failed to load calendar' });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // SCHOOL (companion app surface) — daily lesson feed.
  //
  // The School pillar today uses a prompt overlay (school-prompt-builder.ts)
  // rather than dedicated student/lesson tables. This endpoint returns the
  // surface the UI needs — when proper school content + student progress
  // tables land, plug them in here.
  // ══════════════════════════════════════════════════════════════════════════

  publicRouter.get('/org/:orgId/school/today', appAuth, orgMember, async (req, res) => {
    try {
      const userId = req.appUser!.id;
      // Streak — derive from a user-prefs-like source; for v1, count
      // distinct days in the last 30 days the user has had a session.
      const streakRow = await db.get<{ days: number }>(
        `SELECT COUNT(DISTINCT DATE(created_at)) AS days
         FROM app_messages m
         JOIN app_sessions s ON s.id = m.session_id
         WHERE s.connected_user_id = $1
           AND s.org_id = $2
           AND m.role = 'user'
           AND m.created_at >= NOW() - INTERVAL '30 days'`,
        userId, String(req.params.orgId)
      ).catch(() => null);
      const streak = Math.min(99, Number(streakRow?.days ?? 0));

      // For v1: no curriculum tables, so today_lesson is null. UI shows
      // a "set up your school profile" empty state. Up-next is empty;
      // the homework camera CTA is always available.
      res.json({
        streak,
        day_label: streak > 0 ? `Day ${streak}` : 'Welcome',
        course_label: 'School Mode',
        today_lesson: null,
        up_next: [
          {
            id: 'ask-anton',
            kind: 'ask',
            title: 'Ask ANTON anything',
            subtitle: 'Stuck? Voice or text.',
            color: 'blue',
            icon: 'mic',
          },
        ],
      });
    } catch (err) {
      console.error('[app-gateway] school/today error:', err);
      res.status(500).json({ error: 'Failed to load school feed' });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // WORK MODULES (companion app surface) — curated subset for mobile.
  // Returns Pinned (highlighted) + Browse list with the colour/desc the
  // design needs. Module ids match the main app's MODULES registry so
  // tapping one can deep-link into the desktop UI on the connected ANTON.
  // ══════════════════════════════════════════════════════════════════════════

  // Map desktop adv-* color tokens to the companion's compact palette.
  // Unknown colours fall back to teal so a new module never crashes the UI.
  const COMPANION_COLOR_MAP: Record<string, 'red' | 'blue' | 'teal' | 'gold' | 'green'> = {
    'adv-red':   'red',
    'adv-blue':  'blue',
    'adv-teal':  'teal',
    'adv-gold':  'gold',
    'adv-green': 'green',
  };
  function companionColor(c: string | undefined): 'red' | 'blue' | 'teal' | 'gold' | 'green' {
    return COMPANION_COLOR_MAP[c || ''] ?? 'teal';
  }
  // Curated 4-tile pinned set the phone home screen highlights. Anything not
  // in MODULES is filtered out so a typo never ships an empty tile.
  const PINNED_MODULE_IDS = ['sanctions-advisory', 'gap-analysis', 'document-creation', 'regulatory-monitor'] as const;

  publicRouter.get('/org/:orgId/modules', appAuth, orgMember, (_req, res) => {
    const byId = new Map(MODULES_CATALOG.map(m => [m.id, m]));
    const pinned = PINNED_MODULE_IDS
      .map(id => byId.get(id))
      .filter((m): m is ModuleDefinition => !!m)
      .map(m => ({
        id: m.id,
        name: m.shortLabel || m.label,
        description: m.description.split(/[.!?]/)[0].slice(0, 60),
        color: companionColor(m.color),
        busy: false,
      }));

    // Browse = full catalog minus what's already pinned, alphabetised by label.
    const pinnedIds = new Set<string>(PINNED_MODULE_IDS as readonly string[]);
    const browse = MODULES_CATALOG
      .filter(m => !pinnedIds.has(m.id))
      .map(m => ({
        id: m.id,
        name: m.shortLabel || m.label,
        description: m.description.split(/[.!?]/)[0].slice(0, 80),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    res.json({ pinned, browse });
  });

  // Cache of parsed prompt previews (file → {persona, role}). Prompts are
  // immutable at runtime, so a per-process Map is enough — no invalidation
  // needed unless we hot-reload prompts (which we don't).
  const promptPreviewCache = new Map<string, { persona: string | null; role: string | null }>();

  async function loadModulePromptPreview(moduleId: string): Promise<{ persona: string | null; role: string | null }> {
    if (promptPreviewCache.has(moduleId)) return promptPreviewCache.get(moduleId)!;
    const result = { persona: null as string | null, role: null as string | null };
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      const url = await import('url');
      // Resolve relative to this source file so it works under both ts-node
      // and the compiled dist tree.
      const here = path.dirname(url.fileURLToPath(import.meta.url));
      const promptPath = path.resolve(here, '..', 'prompts', `${moduleId}.md`);
      const raw = await fs.readFile(promptPath, 'utf-8');
      // Persona = first non-blank, non-heading paragraph after the H1
      const lines = raw.split(/\r?\n/);
      let i = 0;
      // Skip H1 + blanks
      while (i < lines.length && (lines[i].startsWith('# ') || lines[i].trim() === '')) i++;
      const personaLines: string[] = [];
      while (i < lines.length && lines[i].trim() !== '' && !lines[i].startsWith('#')) {
        personaLines.push(lines[i].trim());
        i++;
      }
      if (personaLines.length) result.persona = personaLines.join(' ').trim();
      // Role = paragraph(s) under the first ## heading that mentions Role/Objective/Mission/Purpose
      const roleHeadingIdx = lines.findIndex(l => /^##\s+(role|objective|mission|purpose)/i.test(l.trim()));
      if (roleHeadingIdx >= 0) {
        const roleLines: string[] = [];
        for (let j = roleHeadingIdx + 1; j < lines.length; j++) {
          if (lines[j].startsWith('#')) break;
          roleLines.push(lines[j]);
        }
        const roleText = roleLines.join('\n').trim();
        if (roleText) result.role = roleText;
      }
    } catch {
      // Prompt file missing or unreadable — leave both null and the client
      // will just show the catalog description. Common for some areas where
      // prompts haven't been authored yet.
    }
    promptPreviewCache.set(moduleId, result);
    return result;
  }

  // Pretty labels for the most common output-format ids. Anything not in
  // the map falls back to a title-cased version of the id ("gap-scoring-matrix"
  // → "Gap Scoring Matrix") so the UI never shows a slug.
  const OUTPUT_FORMAT_LABELS: Record<string, string> = {
    'executive-summary':       'Executive Summary',
    'detailed-findings':       'Detailed Findings',
    'gap-scoring-matrix':      'Gap Scoring Matrix',
    'action-plan':             'Action Plan',
    'policy-document':         'Policy Document',
    'quick-briefing':          'Quick Briefing',
    'impact-assessment':       'Impact Assessment',
    'training-material':       'Training Material',
    'data-readiness-scorecard':'Data Readiness Scorecard',
    'risk-appetite-statement': 'Risk Appetite Statement',
    'decision-memo':           'Decision Memo',
    'regulatory-comparison':   'Regulatory Comparison',
    'project-plan':            'Project Plan',
    'raci-matrix':             'RACI Matrix',
    'maturity-assessment':     'Maturity Assessment',
    'compliance-calendar':     'Compliance Calendar',
    'monitoring-plan':         'Monitoring Plan',
    'budget-estimate':         'Budget Estimate',
    'engagement-proposal':     'Engagement Proposal',
    'board-deck':              'Board Deck',
  };
  function prettyFormatLabel(id: string): string {
    return OUTPUT_FORMAT_LABELS[id]
      ?? id.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  // GET /api/app/org/:orgId/modules/:moduleId — detailed config for the chat
  // header + intro card. The full system prompt is composed server-side at
  // run time (it pulls in atoms, org context, knowledge packs); we expose
  // only the persona + role-objective summary so the user knows what they
  // just walked into.
  publicRouter.get('/org/:orgId/modules/:moduleId', appAuth, orgMember, async (req, res) => {
    const moduleId = String(req.params.moduleId);
    const m = MODULES_CATALOG.find(x => x.id === moduleId);
    if (!m) return res.status(404).json({ error: 'Module not found' });
    const area = AREAS_CATALOG.find(a => a.moduleIds.includes(moduleId));
    const preview = await loadModulePromptPreview(moduleId);
    const outputFormatLabels = (m.defaults.outputFormats || []).map(prettyFormatLabel);
    res.json({
      module: {
        id: m.id,
        label: m.label,
        shortLabel: m.shortLabel,
        description: m.description,
        color: companionColor(m.color),
        areaId: area?.id ?? null,
        areaLabel: area?.label ?? null,
        persona: preview.persona,
        roleObjective: preview.role,
        defaults: {
          thinking: m.defaults.thinking,
          creativity: m.defaults.creativity,
          outputFormats: m.defaults.outputFormats,
          outputFormatLabels,
        },
      },
    });
  });

  // GET /api/app/org/:orgId/models — list of models the user can pick from
  // in the chat composer. Curated short list (only the 4-5 most useful per
  // provider), gated on the relevant API key being configured. The org's
  // default_model is marked so the UI can flag it. Local Ollama models are
  // discovered separately because they require a running daemon — for v1
  // the phone only sees cloud providers.
  publicRouter.get('/org/:orgId/models', appAuth, orgMember, async (req, res) => {
    type Tier = 'fast' | 'balanced' | 'top';
    const out: Array<{
      id: string; label: string; provider: string; tier: Tier; description: string;
    }> = [];
    if (process.env.ANTHROPIC_API_KEY) {
      out.push(
        { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5', provider: 'anthropic', tier: 'fast',     description: 'Fastest. Quick questions, drafts, summaries.' },
        { id: 'claude-sonnet-4-6',         label: 'Claude Sonnet 4.6', provider: 'anthropic', tier: 'balanced', description: 'Balanced. Day-to-day work, most modules.' },
        { id: 'claude-opus-4-8',           label: 'Claude Opus 4.8',   provider: 'anthropic', tier: 'top',      description: 'Most capable. Long, hard reasoning.' },
      );
    }
    if (process.env.OPENAI_API_KEY) {
      out.push(
        { id: 'gpt-4o',  label: 'GPT-4o',  provider: 'openai', tier: 'balanced', description: 'OpenAI multimodal.' },
      );
    }
    if (process.env.MISTRAL_API_KEY) {
      out.push(
        { id: 'mistral-large-latest', label: 'Mistral Large', provider: 'mistral', tier: 'top', description: 'European, strong reasoning.' },
      );
    }
    if (process.env.GOOGLE_API_KEY) {
      out.push(
        { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', provider: 'google', tier: 'top', description: 'Google Gemini.' },
      );
    }
    // Look up the org's default so the UI can highlight it. Table is
    // org_profiles, not organisations — caught the rename late.
    const orgRow = await db.get<{ default_model: string | null }>(
      'SELECT default_model FROM org_profiles WHERE id = $1',
      String(req.params.orgId)
    ).catch(() => null);
    res.json({
      models: out,
      defaultModel: orgRow?.default_model ?? null,
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // MAIL (companion app surface) — Unified inbox merging ANTON-native
  // (synthesised from app_messages + app_checkpoints) with external
  // providers (M365 / Gmail / IMAP / Exchange). External provider sync
  // is scaffolded — connections are stored encrypted, and providers
  // appear in the source-filter strip, but actual mail pulling is gated
  // on the per-provider implementation landing in a follow-up phase.
  // ══════════════════════════════════════════════════════════════════════════

  // GET /api/app/org/:orgId/mail/providers — list connected providers
  publicRouter.get('/org/:orgId/mail/providers', appAuth, orgMember, async (req, res) => {
    try {
      const providers = await mail.listProviders(req.appUser!.id, String(req.params.orgId));
      // ANTON-native is always implicitly active; surface it as a provider
      // entry so the UI can render the source-filter chip without a DB row.
      res.json({
        providers: [
          {
            id: 'anton',
            provider: 'anton' as MailProviderKind,
            display_name: 'ANTON',
            email_address: `${req.appUser!.id}@anton.${String(req.params.orgId)}`,
            status: 'active' as const,
            last_sync_at: null,
            last_sync_error: null,
            unread_count: 0,
            is_default: true,
            created_at: new Date().toISOString(),
          },
          ...providers,
        ],
      });
    } catch (err) {
      console.error('[app-gateway] mail providers error:', err);
      res.status(500).json({ error: 'Failed to load mail providers' });
    }
  });

  // POST /api/app/org/:orgId/mail/providers — connect a new provider
  publicRouter.post('/org/:orgId/mail/providers', appAuth, orgMember, async (req, res) => {
    const body = (req.body ?? {}) as {
      provider?: MailProviderKind;
      display_name?: string;
      email_address?: string;
      oauth_tokens?: Record<string, unknown>;
      imap_config?: { host: string; port: number; user: string; password: string; secure?: boolean };
    };
    if (!body.provider) return res.status(400).json({ error: 'provider is required' });
    try {
      const row = await mail.connectProvider(req.appUser!.id, String(req.params.orgId), {
        provider: body.provider,
        display_name: body.display_name,
        email_address: body.email_address,
        oauth_tokens: body.oauth_tokens,
        imap_config: body.imap_config,
      });
      res.json({ provider: row });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  // DELETE /api/app/org/:orgId/mail/providers/:id
  publicRouter.delete('/org/:orgId/mail/providers/:id', appAuth, orgMember, async (req, res) => {
    try {
      await mail.disconnectProvider(req.appUser!.id, String(req.params.orgId), String(req.params.id));
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  // POST /api/app/org/:orgId/mail/providers/:id/sync — trigger a sync
  publicRouter.post('/org/:orgId/mail/providers/:id/sync', appAuth, orgMember, async (req, res) => {
    try {
      const result = await mail.syncProvider(req.appUser!.id, String(req.params.orgId), String(req.params.id));
      res.status(result.ok ? 200 : 503).json(result);
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  // GET /api/app/org/:orgId/mail/inbox?provider=...&limit=...
  publicRouter.get('/org/:orgId/mail/inbox', appAuth, orgMember, async (req, res) => {
    try {
      const provider = typeof req.query.provider === 'string'
        ? req.query.provider as MailProviderKind | 'all'
        : 'all';
      const limit = req.query.limit ? Math.max(1, Math.min(100, parseInt(String(req.query.limit), 10) || 30)) : 30;
      const messages = await mail.listInbox(req.appUser!.id, String(req.params.orgId), { provider, limit });
      res.json({ messages });
    } catch (err) {
      console.error('[app-gateway] mail inbox error:', err);
      res.status(500).json({ error: 'Failed to load inbox' });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // PATHFINDER (companion app surface) — "search that thinks before it
  // answers". Runs a hybrid vector + BM25 search over the org's knowledge,
  // then asks Claude to produce a short, JSON-structured response containing:
  //   • thoughts[] — 4-6 brief reasoning steps for the trace UI
  //   • answer     — the prose answer with [^n] citation markers
  //
  // Sources returned with n=1..N matching the markers, tagged 'private' for
  // the org's own KB (tinted accent in the UI) so users can immediately tell
  // their own material apart from public web results.
  // ══════════════════════════════════════════════════════════════════════════
  publicRouter.post('/org/:orgId/pathfinder/query', appAuth, orgMember, async (req, res) => {
    const orgId = String(req.params.orgId);
    const body = (req.body ?? {}) as { question?: unknown };
    const question = typeof body.question === 'string' ? body.question.trim() : '';
    if (!question) return res.status(400).json({ error: 'question is required' });
    if (question.length > 1000) return res.status(400).json({ error: 'question is too long (1000 char max)' });

    const t0 = Date.now();
    try {
      // 1. Pull top private sources from the org's knowledge.
      const hits = await hybridSearch(db, {
        query: question,
        topK: 5,
        includeDocumentChunks: false, // no folderPaths → atoms + chunks only via vector
      }).catch(() => []);

      const sources = hits.slice(0, 5).map((h, i) => {
        const meta = h.metadata as Record<string, unknown>;
        const titleCandidate =
          (typeof meta.title === 'string' && meta.title) ||
          (typeof meta.documentName === 'string' && meta.documentName) ||
          (typeof meta.atom_type === 'string' && `${meta.atom_type} atom`) ||
          h.content_type;
        const folderHint = typeof meta.folderPath === 'string' ? meta.folderPath : 'this instance';
        return {
          n: i + 1,
          title: String(titleCandidate),
          domain: `${folderHint} · private`,
          type: 'private' as const,
          snippet: (h.snippet || h.content_text || '').slice(0, 280),
          score: h.score,
        };
      });

      // 2. Build the context block from snippets + numbered references.
      const context = sources.length > 0
        ? sources.map(s => `[${s.n}] ${s.title}\n${s.snippet}`).join('\n\n')
        : '(no private sources matched — answer from general knowledge.)';

      const system = [
        'You are ANTON Pathfinder — a search assistant that shows its reasoning.',
        'You will be given a question and a set of numbered private sources from the user\'s instance.',
        'Respond with ONLY a JSON object (no prose, no markdown fences) of shape:',
        '  { "thoughts": [string, ...], "answer": string }',
        'Rules:',
        '  • thoughts: 4-6 short reasoning steps in plain language, each ≤90 chars.',
        '  • answer: 2-4 sentences. Use citation markers like [^1], [^2] inline where you draw on the numbered sources.',
        '  • Only cite sources you actually used. If none apply, omit citation markers.',
        '  • If the private sources cover the question well, lead with them; else say so plainly.',
      ].join('\n');

      const user = `Question: ${question}\n\n--- Private sources ---\n${context}`;

      // 3. Call Claude with extended thinking enabled (Haiku for speed).
      const result = await callChat({
        model: resolveModel('small'),
        system,
        messages: [{ role: 'user', content: user }],
        maxTokens: 1500,
        temperature: 0.3,
        thinkingLevel: 'think',
      }).catch((err) => {
        throw new Error(`LLM call failed: ${safeError(err)}`);
      });

      // 4. Parse the JSON. Tolerate stray code fences / leading prose.
      const raw = result.text.trim();
      const jsonStart = raw.indexOf('{');
      const jsonEnd   = raw.lastIndexOf('}');
      let parsed: { thoughts?: unknown; answer?: unknown } = {};
      try {
        parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1)) as typeof parsed;
      } catch { /* fall through to defaults */ }

      const thoughts = Array.isArray(parsed.thoughts)
        ? parsed.thoughts.filter((t): t is string => typeof t === 'string').slice(0, 6)
        : [];
      const answer = typeof parsed.answer === 'string' && parsed.answer
        ? parsed.answer
        : raw; // raw fallback if JSON parse failed

      res.json({
        question,
        thoughts: thoughts.length > 0 ? thoughts : ['Read the question.', 'Searched your instance.', 'Synthesised an answer.'],
        answer,
        sources,
        org_id: orgId,
        took_ms: Date.now() - t0,
        used_thinking: !!result.thinking,
        input_tokens: result.inputTokens,
        output_tokens: result.outputTokens,
      });
    } catch (err) {
      console.error('[app-gateway] pathfinder error:', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // MARKETS (companion app surface) — small read-only adapter that pulls
  // from the existing markets pillar tables (market_indexes, _holdings,
  // _data_raw, _predictions, _narratives) and returns the shape the new
  // MarketsScreen wants: morning briefing hero + tape + Monte-Carlo card.
  //
  // Read-only and per-instance (markets pillar isn't org-scoped today).
  // ══════════════════════════════════════════════════════════════════════════

  // GET /api/app/markets/briefing — single morning brief from the
  // strongest active narrative, with citation/portfolio/flag counts so
  // the design's pill row can render without extra calls.
  publicRouter.get('/markets/briefing', appAuth, async (_req, res) => {
    try {
      const narrative = await db.get<{
        id: string; title: string; description: string;
        narrative_type: string; strength: number; momentum: string;
        updated_at: string;
      }>(
        `SELECT id, title, description, narrative_type, strength, momentum, updated_at
         FROM market_narratives
         WHERE lifecycle IN ('emerging', 'active', 'mature')
         ORDER BY strength DESC, updated_at DESC
         LIMIT 1`
      );

      const portfolioRow = await db.get<{ n: number }>(
        "SELECT COUNT(DISTINCT symbol) as n FROM market_index_holdings WHERE removed_at IS NULL"
      );
      const flagsRow = await db.get<{ n: number }>(
        "SELECT COUNT(*) as n FROM market_predictions WHERE status = 'active' AND confidence >= 0.7 AND deadline > NOW()::text"
      );
      const citationsRow = await db.get<{ n: number }>(
        "SELECT COUNT(*) as n FROM market_data_raw WHERE fetched_at >= NOW() - INTERVAL '24 hours' AND data_type = 'news'"
      );

      if (!narrative) {
        return res.json({
          available: false,
          headline: null,
          blurb: 'No active narratives. Trigger a market intelligence run on the main ANTON instance to populate this brief.',
          citations: 0,
          portfolio_size: Number(portfolioRow?.n ?? 0),
          flags: 0,
          updated_at: null,
        });
      }

      res.json({
        available: true,
        narrative_type: narrative.narrative_type,
        momentum: narrative.momentum,
        strength: Number(narrative.strength),
        headline: narrative.title,
        blurb: narrative.description,
        citations: Number(citationsRow?.n ?? 0),
        portfolio_size: Number(portfolioRow?.n ?? 0),
        flags: Number(flagsRow?.n ?? 0),
        updated_at: narrative.updated_at,
      });
    } catch (err) {
      console.error('[app-gateway] markets briefing error:', err);
      res.status(500).json({ error: 'Failed to load market briefing' });
    }
  });

  // GET /api/app/markets/tape — top holdings across active indexes with
  // their current prices + a small sparkline derived from raw price data.
  publicRouter.get('/markets/tape', appAuth, async (req, res) => {
    try {
      const limit = req.query.limit ? Math.min(20, parseInt(String(req.query.limit), 10) || 8) : 8;

      // Top symbols by aggregate weight across active indexes
      const rows = await db.all<{
        symbol: string; name: string | null;
        current_price: number | null; entry_price: number | null;
        weight: number;
      }>(
        `SELECT h.symbol, MAX(h.name) AS name,
                MAX(h.current_price) AS current_price,
                MAX(h.entry_price)   AS entry_price,
                SUM(h.weight)        AS weight
         FROM market_index_holdings h
         JOIN market_indexes i ON i.id = h.index_id AND i.status = 'active'
         WHERE h.removed_at IS NULL
         GROUP BY h.symbol
         ORDER BY weight DESC
         LIMIT $1`,
        limit
      );

      const out = await Promise.all(rows.map(async (r) => {
        // Pull last ~7 price points for a tiny sparkline
        const points = await db.all<{ content: string; fetched_at: string }>(
          `SELECT content, fetched_at FROM market_data_raw
           WHERE data_type = 'price' AND symbol = $1
           ORDER BY fetched_at DESC LIMIT 7`,
          r.symbol
        );
        const series: number[] = [];
        for (const p of points) {
          try {
            const parsed = JSON.parse(p.content) as Record<string, unknown>;
            const px = Number(parsed.close ?? parsed.price ?? parsed.last ?? parsed.c);
            if (Number.isFinite(px)) series.unshift(px);
          } catch { /* skip malformed */ }
        }

        const price = r.current_price ?? series[series.length - 1] ?? null;
        const ref   = r.entry_price ?? series[0] ?? null;
        const change_pct = (price && ref && ref !== 0)
          ? ((price - ref) / ref) * 100
          : null;

        return {
          symbol: r.symbol,
          name: r.name,
          price,
          change_pct,
          spark: series.length >= 2 ? series : null,
        };
      }));

      res.json({ tape: out });
    } catch (err) {
      console.error('[app-gateway] markets tape error:', err);
      res.status(500).json({ error: 'Failed to load market tape' });
    }
  });

  // GET /api/app/markets/prediction — most recent active prediction,
  // expressed as a 3-bucket Monte-Carlo-style distribution for the design.
  publicRouter.get('/markets/prediction', appAuth, async (_req, res) => {
    try {
      const p = await db.get<{
        id: string; title: string; description: string;
        prediction_type: string; target_symbol: string | null;
        predicted_direction: string | null; predicted_outcome: string;
        confidence: number; deadline: string | null; created_at: string;
      }>(
        `SELECT id, title, description, prediction_type, target_symbol,
                predicted_direction, predicted_outcome, confidence, deadline, created_at
         FROM market_predictions
         WHERE status = 'active'
         ORDER BY created_at DESC
         LIMIT 1`
      );

      if (!p) {
        return res.json({ available: false });
      }

      const conf = Math.max(0, Math.min(1, Number(p.confidence) || 0.5));
      const dir = (p.predicted_direction || '').toLowerCase();
      const remainder = Math.max(0, 1 - conf);

      // Split the "not the predicted direction" mass between the two
      // alternatives, biased slightly toward "flat" (more plausible than the
      // opposite move). For non-directional predictions, fall back to a
      // balanced 50/30/20 split.
      let buckets: Array<{ label: string; pct: number; color: 'accent' | 'gold' | 'red' }>;
      if (dir === 'up') {
        buckets = [
          { label: 'up',   pct: Math.round(conf * 100),                   color: 'accent' },
          { label: 'flat', pct: Math.round(remainder * 0.7 * 100),        color: 'gold'   },
          { label: 'down', pct: Math.max(0, 100 - Math.round(conf * 100) - Math.round(remainder * 0.7 * 100)), color: 'red' },
        ];
      } else if (dir === 'down') {
        buckets = [
          { label: 'down', pct: Math.round(conf * 100),                   color: 'accent' },
          { label: 'flat', pct: Math.round(remainder * 0.7 * 100),        color: 'gold'   },
          { label: 'up',   pct: Math.max(0, 100 - Math.round(conf * 100) - Math.round(remainder * 0.7 * 100)), color: 'red' },
        ];
      } else if (dir === 'flat') {
        buckets = [
          { label: 'flat', pct: Math.round(conf * 100),                   color: 'accent' },
          { label: 'up',   pct: Math.round(remainder * 0.5 * 100),        color: 'gold'   },
          { label: 'down', pct: Math.max(0, 100 - Math.round(conf * 100) - Math.round(remainder * 0.5 * 100)), color: 'red' },
        ];
      } else {
        buckets = [
          { label: p.predicted_outcome.slice(0, 16), pct: Math.round(conf * 100), color: 'accent' },
          { label: 'partial', pct: Math.round(remainder * 0.6 * 100),              color: 'gold'   },
          { label: 'miss',    pct: Math.max(0, 100 - Math.round(conf * 100) - Math.round(remainder * 0.6 * 100)), color: 'red' },
        ];
      }

      res.json({
        available: true,
        id: p.id,
        title: p.title,
        target_symbol: p.target_symbol,
        prediction_type: p.prediction_type,
        deadline: p.deadline,
        buckets,
      });
    } catch (err) {
      console.error('[app-gateway] markets prediction error:', err);
      res.status(500).json({ error: 'Failed to load market prediction' });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // HORIZON RADAR (companion app surface) — thin adapter over the existing
  // /api/radar service. Returns items + sources reshaped for the new
  // HorizonRadarScreen design (companion JSX shape: cat / src / blurb /
  // rel 0-100 / tone / tag / meta).
  //
  // Read-only for the companion app. Source CRUD lives in the main ANTON UI.
  // ══════════════════════════════════════════════════════════════════════════

  type RadarRow = {
    id: string; title: string; summary: string | null; ai_summary: string | null;
    relevance_score: number | null; urgency_score: number | null;
    status: string; item_type: string | null; category: string | null;
    impact_areas: string | null;
    published_at: string | null; fetched_at: string | null; url: string | null;
    source_name: string | null; source_type: string | null; source_category: string | null;
  };

  function shapeItem(r: RadarRow) {
    const rel = Math.round(((r.relevance_score ?? 0)) * 100);
    let tone: 'red' | 'gold' | 'neutral' | 'teal';
    let tag: string;
    if (rel >= 85)      { tone = 'red';     tag = 'HIGH RELEVANCE'; }
    else if (rel >= 65) { tone = 'gold';    tag = 'WATCHLIST'; }
    else if (rel >= 50) { tone = 'gold';    tag = 'ACTION SUGGESTED'; }
    else                { tone = 'neutral'; tag = 'FYI'; }

    // Impact areas are stored JSON-stringified in radar_items.impact_areas
    let areas: string[] = [];
    if (r.impact_areas) {
      try {
        const v = JSON.parse(r.impact_areas);
        if (Array.isArray(v)) areas = v.filter((a) => typeof a === 'string').slice(0, 3);
      } catch { /* malformed — ignore */ }
    }

    const cat = (r.category || r.source_category || 'Other')
      .replace(/^./, (c) => c.toUpperCase());
    const srcType = (r.source_type || 'official').toLowerCase();
    const srcLabel = `${(r.source_name || 'Unknown')} · ${
      srcType === 'official' ? 'Official' :
      srcType === 'paper'    ? 'Paper'    :
      srcType === 'rss'      ? 'News'     :
      srcType
    }`;

    return {
      id: r.id,
      cat,
      src: srcLabel,
      source_type: srcType,
      title: r.title,
      blurb: r.ai_summary || r.summary || '',
      rel,
      tone,
      tag,
      areas,
      url: r.url,
      published_at: r.published_at,
      fetched_at: r.fetched_at,
      status: r.status,
    };
  }

  // GET /api/app/radar/summary — 3-up dashboard numbers + scanned-today count
  publicRouter.get('/radar/summary', appAuth, async (_req, res) => {
    try {
      const summary = await radar.getRadarSummary();
      // Items fetched in the last 24h — proxy for "scanned today"
      const scannedRow = await db.get<{ n: number }>(
        "SELECT COUNT(*) as n FROM radar_items WHERE fetched_at >= NOW() - INTERVAL '24 hours'"
      );
      const sourcesRow = await db.get<{ n: number }>(
        "SELECT COUNT(*) as n FROM radar_sources WHERE is_active = 1"
      );
      const actionRow = await db.get<{ n: number }>(
        "SELECT COUNT(*) as n FROM radar_items WHERE relevance_score >= 0.5 AND relevance_score < 0.85 AND status = 'new'"
      );
      res.json({
        new_today: Number(scannedRow?.n ?? 0),
        high_relevance: summary.highRelevance,
        action_suggested: Number(actionRow?.n ?? 0),
        sources_active: Number(sourcesRow?.n ?? 0),
        scanned_today: Number(scannedRow?.n ?? 0),
        category_counts: summary.categoryCounts,
      });
    } catch (err) {
      console.error('[app-gateway] radar summary error:', err);
      res.status(500).json({ error: 'Failed to load radar summary' });
    }
  });

  // GET /api/app/radar/items?category=...&limit=...
  publicRouter.get('/radar/items', appAuth, async (req, res) => {
    try {
      const category = typeof req.query.category === 'string' ? req.query.category : undefined;
      const limit = req.query.limit ? Math.min(100, parseInt(String(req.query.limit), 10) || 30) : 30;
      const rows = await radar.getItems({
        category,
        limit,
        offset: req.query.offset ? parseInt(String(req.query.offset), 10) || 0 : 0,
      }) as RadarRow[];
      res.json({ items: rows.map(shapeItem) });
    } catch (err) {
      console.error('[app-gateway] radar items error:', err);
      res.status(500).json({ error: 'Failed to load radar items' });
    }
  });

  // GET /api/app/radar/sources — active source pills for the footer strip
  publicRouter.get('/radar/sources', appAuth, async (_req, res) => {
    try {
      const rows = await radar.getSources(true) as Array<{
        id: string; display_name: string; source_type: string; category: string;
      }>;
      res.json({
        sources: rows.map((s) => ({
          id: s.id,
          label: s.display_name,
          type: s.source_type,
          category: s.category,
        })),
      });
    } catch (err) {
      console.error('[app-gateway] radar sources error:', err);
      res.status(500).json({ error: 'Failed to load radar sources' });
    }
  });

  // POST /api/app/radar/scan — trigger a scan; respects RADAR_AUTOMATION_DISABLED
  publicRouter.post('/radar/scan', appAuth, async (req, res) => {
    if (!radarFetcher) {
      return res.status(503).json({ error: 'Radar fetcher not initialized on this instance.' });
    }
    if (String(process.env.RADAR_AUTOMATION_DISABLED || '').toLowerCase() === 'true') {
      return res.status(503).json({ error: 'Radar automation is paused on this instance.' });
    }
    const category = (req.body as { category?: string } | undefined)?.category || undefined;
    res.json({ started: true, category: category ?? 'all' });
    radarFetcher.scanAllSources(category).catch((err: unknown) => {
      console.error('[app-gateway] radar scan error:', err);
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // Tasks / Schedule / Wallet adapters (companion More-tab surfaces).
  // Mirrors the desktop `/api/task-agent`, `/api/deadlines`, `/api/futurechain`
  // endpoints but scoped to the companion's app session. The desktop owner
  // and connected companion users see the same instance-level data
  // (single-operator instance assumption).
  // ──────────────────────────────────────────────────────────────────────

  // GET /api/app/org/:orgId/tasks — list tasks for the instance owner
  publicRouter.get('/org/:orgId/tasks', appAuth, orgMember, async (req, res) => {
    try {
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const limit = Math.min(parseInt(String(req.query.limit ?? '20'), 10) || 20, 100);
      const offset = Math.max(parseInt(String(req.query.offset ?? '0'), 10) || 0, 0);

      const where = status ? 'WHERE user_id = $1 AND status = $2' : 'WHERE user_id = $1';
      const params: unknown[] = status ? ['default', status] : ['default'];
      const tasks = await db.all(
        `SELECT id, title, description, status, source, source_ref, priority, tags, due_date,
                created_at, updated_at, chosen_approach_id, completed_at
         FROM anton_tasks ${where} ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        ...params, limit, offset
      ) as Array<Record<string, unknown>>;
      const countRow = await db.get<{ count: number | string }>(
        `SELECT COUNT(*) as count FROM anton_tasks ${where}`,
        ...params
      );
      res.json({
        tasks: tasks.map(t => ({
          ...t,
          tags: typeof t.tags === 'string'
            ? (() => { try { return JSON.parse(t.tags as string); } catch { return []; } })()
            : (t.tags ?? []),
        })),
        total: Number(countRow?.count ?? 0),
      });
    } catch (err) {
      console.error('[app-gateway] tasks list error:', err);
      res.status(500).json({ error: 'Failed to load tasks' });
    }
  });

  // POST /api/app/org/:orgId/tasks — quick-add a task
  publicRouter.post('/org/:orgId/tasks', appAuth, orgMember, async (req, res) => {
    try {
      const { title, description, priority = 'normal', due_date } = req.body as {
        title?: string; description?: string; priority?: string; due_date?: string;
      };
      if (!title || typeof title !== 'string') {
        return res.status(400).json({ error: 'title is required' });
      }
      const { randomUUID } = await import('crypto');
      const id = randomUUID();
      const trimmedTitle = title.trim();
      // anton_tasks.description is NOT NULL; fall back to title if client omits it.
      const desc = (description && description.trim()) ? description.trim() : trimmedTitle;
      await db.run(
        `INSERT INTO anton_tasks (id, user_id, title, description, status, source, priority, tags, due_date, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'intake', 'companion', $5, $6, $7, NOW(), NOW())`,
        id, 'default', trimmedTitle, desc, priority, '[]', due_date ?? null
      );
      const task = await db.get(
        `SELECT id, title, description, status, source, priority, tags, due_date, created_at, updated_at FROM anton_tasks WHERE id = $1`,
        id
      );
      res.status(201).json({ task });
    } catch (err) {
      console.error('[app-gateway] tasks create error:', err);
      res.status(500).json({ error: 'Failed to create task' });
    }
  });

  // GET /api/app/org/:orgId/deadlines/morning-brief
  publicRouter.get('/org/:orgId/deadlines/morning-brief', appAuth, orgMember, async (_req, res) => {
    try {
      const { createTimeIntelligence } = await import('../services/time-intelligence.js');
      const ti = await createTimeIntelligence(db);
      const brief = await ti.getMorningBrief('default');
      res.json(brief);
    } catch (err) {
      console.error('[app-gateway] morning-brief error:', err);
      res.status(500).json({ error: 'Failed to load morning brief' });
    }
  });

  // GET /api/app/org/:orgId/wallet — bundles wallets + recent transactions
  publicRouter.get('/org/:orgId/wallet', appAuth, orgMember, async (req, res) => {
    try {
      // 2026-07-17: real-mode deps wired — bare constructors returned stub
      // wallets (fc_STUB_ balances) no matter what stub_mode said.
      const { createRealModeFCServices } = await import('../services/fc-real-mode.js');
      const { fcWallet: wsvc, fcTx: tsvc } = await createRealModeFCServices(db);
      const limit = Math.min(parseInt(String(req.query.limit ?? '20'), 10) || 20, 100);
      const [wallets, transactions] = await Promise.all([
        wsvc.getWallets(),
        tsvc.listTransactions({ limit }),
      ]);
      res.json({ wallets, transactions });
    } catch (err) {
      console.error('[app-gateway] wallet error:', err);
      res.status(500).json({ error: 'Failed to load wallet' });
    }
  });

  // GET /api/app/org/:orgId/portals/discover — visitor view of portals.
  //
  // The companion app's purpose is to *visit other people's portals*, not
  // to build them. This returns active+public_index portals from this
  // instance's directory plus any cached remote portals (peers' portals
  // discovered via LAN scan). Optional ?q text filter.
  publicRouter.get('/org/:orgId/portals/discover', appAuth, orgMember, async (req, res) => {
    try {
      const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
      const params: unknown[] = [];
      let whereExtras = '';
      if (q.length > 0) {
        // Case-insensitive LIKE across name + display_title + description
        whereExtras = ` AND (lower(p.name) LIKE $1 OR lower(coalesce(p.display_title,'')) LIKE $1 OR lower(coalesce(p.description,'')) LIKE $1)`;
        params.push(`%${q.toLowerCase()}%`);
      }
      const rows = await db.all<{
        id: string; name: string; namespace: string | null; category: string | null;
        display_title: string | null; description: string | null; status: string;
        public_index: boolean;
        surface_mode: string | null; external_primary_url: string | null;
        registered_at: string | null; created_at: string;
      }>(
        `SELECT p.id, p.name, p.namespace, p.category, p.display_title, p.description, p.status,
                p.public_index, p.surface_mode, p.external_primary_url,
                p.registered_at, p.created_at
           FROM portals p
          WHERE p.status = 'active' AND p.public_index = TRUE${whereExtras}
          ORDER BY p.created_at DESC
          LIMIT 100`,
        ...params
      );
      res.json({ portals: rows, query: q });
    } catch (err) {
      console.error('[app-gateway] portals discover error:', err);
      res.status(500).json({ error: 'Failed to load portals' });
    }
  });

  // POST /api/app/org/:orgId/mail/:mailId/reply — reply to an ANTON-native
  // message. Mirrors /api/community/mail/:id/reply but only handles the
  // company's own community_mail table; provider mail (m365/gmail) needs
  // its own send pipeline which doesn't exist yet.
  publicRouter.post('/org/:orgId/mail/:mailId/reply', appAuth, orgMember, async (req, res) => {
    try {
      const { body } = req.body as { body?: string };
      if (!body || !body.trim()) return res.status(400).json({ error: 'body required' });
      const me = await db.get<{ contact_hash: string }>(
        `SELECT contact_hash FROM community_identity WHERE user_id = 'default'`
      );
      if (!me) return res.status(403).json({ error: 'Community not activated' });
      const parent = await db.get<{
        id: string; thread_id: string | null; from_hash: string;
        to_hashes: string; subject: string | null;
      }>(
        `SELECT id, thread_id, from_hash, to_hashes, subject FROM community_mail WHERE id = $1`,
        req.params.mailId
      );
      if (!parent) return res.status(404).json({ error: 'Parent mail not found' });
      const threadId = parent.thread_id || parent.id;
      if (!parent.thread_id) {
        await db.run(`UPDATE community_mail SET thread_id = $1 WHERE id = $2`, threadId, parent.id);
      }
      // Reply goes BACK to the original sender (and any other recipients
      // minus self).
      const originalRecips: string[] = (() => {
        try { return JSON.parse(parent.to_hashes); } catch { return []; }
      })();
      const replyTo = Array.from(new Set([parent.from_hash, ...originalRecips])).filter(h => h !== me.contact_hash);
      const id = `mail_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const now = new Date().toISOString();
      await db.run(
        `INSERT INTO community_mail (id, from_hash, to_hashes, cc_hashes, subject, body, thread_id, parent_id, folder, draft, sent_at)
         VALUES ($1, $2, $3, '[]', $4, $5, $6, $7, 'sent', 0, $8)`,
        id, me.contact_hash, JSON.stringify(replyTo),
        `Re: ${parent.subject || '(no subject)'}`, body.trim(),
        threadId, parent.id, now
      );
      // Mirror an inbox copy for each recipient so it shows in their list
      for (const recip of replyTo) {
        const inboxId = `mail_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        await db.run(
          `INSERT INTO community_mail (id, from_hash, to_hashes, cc_hashes, subject, body, thread_id, parent_id, folder, draft, sent_at)
           VALUES ($1, $2, $3, '[]', $4, $5, $6, $7, 'inbox', 0, $8)`,
          inboxId, me.contact_hash, JSON.stringify(replyTo),
          `Re: ${parent.subject || '(no subject)'}`, body.trim(),
          threadId, parent.id, now
        );
      }
      res.status(201).json({ id, sent_at: now });
    } catch (err) {
      console.error('[app-gateway] mail reply error:', err);
      res.status(500).json({ error: 'Failed to send reply' });
    }
  });

  // POST /api/app/org/:orgId/calendar/events — create a calendar event.
  // Maps to community_events (the unified calendar pulls from there).
  publicRouter.post('/org/:orgId/calendar/events', appAuth, orgMember, async (req, res) => {
    try {
      const { title, start_at, end_at, all_day, location, description } = req.body as {
        title?: string; start_at?: string; end_at?: string;
        all_day?: boolean; location?: string; description?: string;
      };
      if (!title || !title.trim()) return res.status(400).json({ error: 'title required' });
      if (!start_at) return res.status(400).json({ error: 'start_at required (ISO 8601)' });
      const me = await db.get<{ contact_hash: string }>(
        `SELECT contact_hash FROM community_identity WHERE user_id = 'default'`
      );
      if (!me) return res.status(403).json({ error: 'Community not activated' });
      // If end_at omitted, default to 1h after start (or end-of-day for all-day)
      let resolvedEnd = end_at;
      if (!resolvedEnd) {
        const d = new Date(start_at);
        if (all_day) d.setHours(23, 59, 0, 0);
        else d.setHours(d.getHours() + 1);
        resolvedEnd = d.toISOString();
      }
      const id = `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      await db.run(
        `INSERT INTO community_events
           (id, group_id, creator_hash, title, description, event_type, start_at, end_at,
            all_day, location, meeting_link, recurrence, rsvp_required)
         VALUES ($1, NULL, $2, $3, $4, 'event', $5, $6, $7, $8, NULL, 'none', 0)`,
        id, me.contact_hash, title.trim(), description?.trim() || null,
        start_at, resolvedEnd, all_day ? 1 : 0, location?.trim() || null
      );
      const event = await db.get(
        `SELECT id, title, description, start_at, end_at, all_day, location, creator_hash
           FROM community_events WHERE id = $1`,
        id
      );
      res.status(201).json({ event });
    } catch (err) {
      console.error('[app-gateway] calendar event create error:', err);
      res.status(500).json({ error: 'Failed to create event' });
    }
  });

  // POST /api/app/org/:orgId/deadlines — quick-add a deadline from the
  // companion app. Mirrors the desktop's POST /api/deadlines but only
  // accepts the minimal fields a phone user can comfortably enter.
  publicRouter.post('/org/:orgId/deadlines', appAuth, orgMember, async (req, res) => {
    try {
      const { title, due_date, priority, description } = req.body as {
        title?: string; due_date?: string; priority?: 'low' | 'medium' | 'high' | 'critical'; description?: string;
      };
      if (!title || !title.trim()) return res.status(400).json({ error: 'title required' });
      if (!due_date) return res.status(400).json({ error: 'due_date required (ISO 8601)' });
      const { randomUUID } = await import('crypto');
      const id = randomUUID();
      await db.run(
        `INSERT INTO deadlines (id, title, description, due_date, source_type, priority, owner_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'manual', $5, 'default', NOW(), NOW())`,
        id, title.trim(), description?.trim() || null, due_date, priority || 'medium'
      );
      const row = await db.get(
        `SELECT id, title, description, due_date, priority, status, created_at FROM deadlines WHERE id = $1`,
        id
      );
      res.status(201).json({ deadline: row });
    } catch (err) {
      console.error('[app-gateway] deadline create error:', err);
      res.status(500).json({ error: 'Failed to create deadline' });
    }
  });

  // POST /api/app/org/:orgId/deadlines/:id/complete — mark a deadline done.
  publicRouter.post('/org/:orgId/deadlines/:id/complete', appAuth, orgMember, async (req, res) => {
    try {
      await db.run(
        `UPDATE deadlines SET status = 'completed', completed_at = NOW(), updated_at = NOW() WHERE id = $1`,
        req.params.id
      );
      res.json({ ok: true, status: 'completed' });
    } catch (err) {
      console.error('[app-gateway] deadline complete error:', err);
      res.status(500).json({ error: 'Failed to complete deadline' });
    }
  });

  // PATCH /api/app/org/:orgId/tasks/:id — mark complete / rename.
  publicRouter.patch('/org/:orgId/tasks/:id', appAuth, orgMember, async (req, res) => {
    try {
      const { status, title, description } = req.body as {
        status?: string; title?: string; description?: string;
      };
      const sets: string[] = [];
      const params: unknown[] = [];
      if (status) { params.push(status); sets.push(`status = $${params.length}`); }
      if (title)  { params.push(title.trim()); sets.push(`title = $${params.length}`); }
      if (description !== undefined) { params.push(description); sets.push(`description = $${params.length}`); }
      if (sets.length === 0) return res.status(400).json({ error: 'no fields to update' });
      // Toggle completed_at when transitioning to completed
      if (status === 'completed') sets.push(`completed_at = NOW()`);
      sets.push(`updated_at = NOW()`);
      params.push(req.params.id);
      await db.run(
        `UPDATE anton_tasks SET ${sets.join(', ')} WHERE id = $${params.length} AND user_id = 'default'`,
        ...params
      );
      const task = await db.get(
        `SELECT id, title, description, status, priority, due_date, created_at, updated_at, completed_at
           FROM anton_tasks WHERE id = $1`,
        req.params.id
      );
      res.json({ task });
    } catch (err) {
      console.error('[app-gateway] task patch error:', err);
      res.status(500).json({ error: 'Failed to update task' });
    }
  });

  // PATCH /api/app/org/:orgId/sessions/:id — rename or annotate a session.
  publicRouter.patch('/org/:orgId/sessions/:id', appAuth, orgMember, async (req, res) => {
    try {
      const { title, note } = req.body as { title?: string; note?: string };
      const sets: string[] = [];
      const params: unknown[] = [];
      if (title !== undefined) { params.push(title.trim()); sets.push(`title = $${params.length}`); }
      if (note  !== undefined) { params.push(note); sets.push(`note = $${params.length}`); }
      if (sets.length === 0) return res.status(400).json({ error: 'no fields to update' });
      sets.push(`updated_at = NOW()`);
      params.push(req.params.id);
      await db.run(
        `UPDATE sessions SET ${sets.join(', ')} WHERE id = $${params.length}`,
        ...params
      );
      res.json({ ok: true });
    } catch (err) {
      console.error('[app-gateway] session patch error:', err);
      res.status(500).json({ error: 'Failed to update session' });
    }
  });

  // GET /api/app/org/:orgId/home/brief — latest AI-generated daily briefing.
  // Reads the most recent orchestrator_briefings row (the AI Orchestrator
  // generates one per day on cron + any heartbeat-triggered ones in
  // between). Returns null if the orchestrator hasn't produced one yet.
  publicRouter.get('/org/:orgId/home/brief', appAuth, orgMember, async (_req, res) => {
    try {
      const row = await db.get<{
        id: string; period: string; signals_read: number; proposals_count: number;
        content: string; status: string; created_at: string;
      }>(
        `SELECT id, period, signals_read, proposals_count, content, status, created_at
           FROM orchestrator_briefings
          ORDER BY created_at DESC
          LIMIT 1`
      ).catch(() => null);
      res.json({ brief: row ?? null });
    } catch (err) {
      console.error('[app-gateway] home/brief error:', err);
      res.status(500).json({ error: 'Failed to load briefing' });
    }
  });

  // GET /api/app/org/:orgId/missions — active + recent missions list.
  publicRouter.get('/org/:orgId/missions', appAuth, orgMember, async (_req, res) => {
    try {
      const rows = await db.all<{
        id: string; title: string; description: string | null; status: string;
        created_at: string; updated_at: string;
      }>(
        `SELECT id, title, description, status, created_at, updated_at
           FROM missions
          ORDER BY
            CASE status
              WHEN 'active' THEN 0
              WHEN 'paused' THEN 1
              WHEN 'review' THEN 2
              WHEN 'briefed' THEN 3
              WHEN 'draft' THEN 4
              WHEN 'completed' THEN 5
              WHEN 'aborted' THEN 6
              ELSE 7
            END,
            updated_at DESC
          LIMIT 50`
      ).catch(() => []);
      // Per-mission counts
      const enriched = await Promise.all(rows.map(async m => {
        const tc = await db.get<{ total: number; done: number }>(
          `SELECT COUNT(*)::int AS total,
                  COUNT(*) FILTER (WHERE status IN ('completed', 'approved'))::int AS done
             FROM mission_tasks WHERE mission_id = $1`,
          m.id
        ).catch(() => ({ total: 0, done: 0 }));
        return { ...m, task_total: tc?.total ?? 0, task_done: tc?.done ?? 0 };
      }));
      res.json({ missions: enriched });
    } catch (err) {
      console.error('[app-gateway] missions error:', err);
      res.status(500).json({ error: 'Failed to load missions' });
    }
  });

  // GET /api/app/org/:orgId/missions/:missionId — single mission with tasks.
  publicRouter.get('/org/:orgId/missions/:missionId', appAuth, orgMember, async (req, res) => {
    try {
      const m = await db.get(
        `SELECT id, title, description, status, created_at, updated_at, metadata
           FROM missions WHERE id = $1`,
        req.params.missionId
      );
      if (!m) return res.status(404).json({ error: 'Mission not found' });
      const tasks = await db.all<{
        id: string; title: string; description: string | null; status: string;
        order_index: number; created_at: string;
      }>(
        `SELECT id, title, description, status, order_index, created_at
           FROM mission_tasks
          WHERE mission_id = $1
          ORDER BY order_index ASC, created_at ASC
          LIMIT 100`,
        req.params.missionId
      ).catch(() => []);
      res.json({ mission: m, tasks });
    } catch (err) {
      console.error('[app-gateway] mission detail error:', err);
      res.status(500).json({ error: 'Failed to load mission' });
    }
  });

  // POST /api/app/org/:orgId/missions/:missionId/:action — pause/resume/abort.
  // Server-only state transitions (no LLM cost). LLM-heavy actions
  // (decompose, advance) stay in the desktop Pro UI.
  publicRouter.post('/org/:orgId/missions/:missionId/:action', appAuth, orgMember, async (req, res) => {
    try {
      const action = String(req.params.action);
      const allowed: Record<string, string> = {
        pause: 'paused',
        resume: 'active',
        abort: 'aborted',
      };
      const newStatus = allowed[action];
      if (!newStatus) return res.status(400).json({ error: `action must be one of ${Object.keys(allowed).join(', ')}` });
      await db.run(
        `UPDATE missions SET status = $1, updated_at = NOW() WHERE id = $2`,
        newStatus, req.params.missionId
      );
      res.json({ ok: true, status: newStatus });
    } catch (err) {
      console.error('[app-gateway] mission action error:', err);
      res.status(500).json({ error: 'Failed to update mission' });
    }
  });

  // GET /api/app/org/:orgId/work — sessions with output (My Work browse).
  // Mirrors the desktop MyWorkPage's fetchSessions() but companion-friendly.
  // Filters: ?q=<text>&module=<id>&since=today|week|month|all
  publicRouter.get('/org/:orgId/work', appAuth, orgMember, async (req, res) => {
    try {
      const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';
      const moduleFilter = typeof req.query.module === 'string' ? req.query.module : '';
      const since = typeof req.query.since === 'string' ? req.query.since : 'all';
      const limit = Math.min(parseInt(String(req.query.limit ?? '50'), 10) || 50, 100);
      const userId = req.appUser!.id;
      const orgId = String(req.params.orgId);

      // Companion-app sessions live in `app_sessions` (migration 094), NOT
      // the desktop's `sessions` table — the previous query was always empty
      // because it hit the wrong table. Filter by user + org so people only
      // see their own work.
      const wheres: string[] = [
        'connected_user_id = $1', 'org_id = $2',
        '(message_count IS NULL OR message_count > 0)',
      ];
      const params: unknown[] = [userId, orgId];
      if (q) {
        wheres.push(`lower(coalesce(title,'')) LIKE $${params.length + 1}`);
        params.push(`%${q}%`);
      }
      if (moduleFilter) {
        wheres.push(`resolved_module_id = $${params.length + 1}`);
        params.push(moduleFilter);
      }
      if (since !== 'all') {
        const intervalMap: Record<string, string> = {
          today: '1 day',
          week:  '7 days',
          month: '30 days',
        };
        const interval = intervalMap[since];
        if (interval) wheres.push(`updated_at > NOW() - INTERVAL '${interval}'`);
      }
      const whereClause = 'WHERE ' + wheres.join(' AND ');

      const rows = await db.all<{
        id: string; title: string | null; module_id: string | null; note: string | null;
        message_count: number | null; total_tokens: number | null;
        created_at: string; updated_at: string;
      }>(
        `SELECT id,
                title,
                resolved_module_id AS module_id,
                NULL::text AS note,
                message_count,
                (COALESCE(total_input_tokens,0) + COALESCE(total_output_tokens,0)) AS total_tokens,
                created_at, updated_at
           FROM app_sessions ${whereClause}
          ORDER BY updated_at DESC NULLS LAST, created_at DESC
          LIMIT ${limit}`,
        ...params
      ).catch(() => []);
      res.json({ sessions: rows, query: q, module: moduleFilter, since });
    } catch (err) {
      console.error('[app-gateway] work error:', err);
      res.status(500).json({ error: 'Failed to load work history' });
    }
  });

  // GET /api/app/org/:orgId/community/qr — your QR data for sharing.
  // Companion app users show this so peers can scan it on their phones.
  publicRouter.get('/org/:orgId/community/qr', appAuth, orgMember, async (_req, res) => {
    try {
      const identity = await db.get<{
        contact_hash: string; display_name: string | null; public_key: string | null;
      }>(
        `SELECT contact_hash, display_name, public_key
           FROM community_identity WHERE user_id = 'default' LIMIT 1`
      );
      if (!identity) return res.status(404).json({ error: 'Community not activated. Activate it from the Pro UI on your desktop ANTON.' });
      // Serialise the contact card as a JSON envelope so a scanning client
      // gets the contact_hash + public_key in one tap.
      const payload = JSON.stringify({
        kind: 'anton-contact',
        contact_hash: identity.contact_hash,
        display_name: identity.display_name,
        public_key: identity.public_key,
      });
      // Use the same `qrcode` package the desktop uses, branded in ANTON green.
      const qrcode = await import('qrcode');
      const qrDataUrl = await (qrcode as { default: { toDataURL: (s: string, o: Record<string, unknown>) => Promise<string> } }).default.toDataURL(payload, {
        width: 320, margin: 2, color: { dark: '#0D7D6C', light: '#F5F3EF' },
      });
      res.json({
        qrDataUrl,
        contactHash: identity.contact_hash,
        displayName: identity.display_name,
        payload,
      });
    } catch (err) {
      console.error('[app-gateway] community qr error:', err);
      res.status(500).json({ error: 'Failed to generate QR' });
    }
  });

  // POST /api/app/org/:orgId/community/connections/scan — add contact from
  // a scanned QR payload. Body: { payload: string } — JSON string from QR.
  publicRouter.post('/org/:orgId/community/connections/scan', appAuth, orgMember, async (req, res) => {
    try {
      const { payload } = req.body as { payload?: string };
      if (typeof payload !== 'string' || payload.length === 0) {
        return res.status(400).json({ error: 'payload required' });
      }
      let parsed: { kind?: string; contact_hash?: string; display_name?: string | null; public_key?: string | null };
      try { parsed = JSON.parse(payload); }
      catch { return res.status(400).json({ error: 'payload must be JSON from an ANTON contact QR' }); }
      if (parsed.kind !== 'anton-contact' || !parsed.contact_hash || !parsed.public_key) {
        return res.status(400).json({ error: 'Not a valid ANTON contact QR' });
      }
      const id = `conn_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      await db.run(
        `INSERT INTO community_connections (id, owner_user_id, contact_hash, display_name, public_key, status)
         VALUES ($1, $2, $3, $4, $5, 'active')
         ON CONFLICT DO NOTHING`,
        id, 'default', parsed.contact_hash, parsed.display_name ?? 'Anonymous', parsed.public_key
      );
      // Return the (possibly pre-existing) connection
      const conn = await db.get(
        `SELECT id, contact_hash, display_name, status, connected_at
           FROM community_connections
          WHERE owner_user_id = 'default' AND contact_hash = $1
          LIMIT 1`,
        parsed.contact_hash
      );
      res.json({ connection: conn ?? null });
    } catch (err) {
      console.error('[app-gateway] community scan error:', err);
      res.status(500).json({ error: 'Failed to add contact' });
    }
  });

  // POST /api/app/org/:orgId/community/connections/:connId/respond — accept or
  // decline a pending request.
  publicRouter.post('/org/:orgId/community/connections/:connId/respond', appAuth, orgMember, async (req, res) => {
    try {
      const { decision } = req.body as { decision?: 'accept' | 'decline' };
      if (decision !== 'accept' && decision !== 'decline') {
        return res.status(400).json({ error: 'decision must be "accept" or "decline"' });
      }
      const newStatus = decision === 'accept' ? 'accepted' : 'blocked';
      await db.run(
        `UPDATE community_connections SET status = $1
          WHERE id = $2 AND owner_user_id = 'default'`,
        newStatus, req.params.connId
      );
      res.json({ ok: true, status: newStatus });
    } catch (err) {
      console.error('[app-gateway] community respond error:', err);
      res.status(500).json({ error: 'Failed to update connection' });
    }
  });

  // GET /api/app/org/:orgId/community/messages?with=<contactHash> — chat
  // thread with one contact. Returns latest 50 messages (community_mail
  // rows where I'm the sender or recipient with this contact).
  publicRouter.get('/org/:orgId/community/messages', appAuth, orgMember, async (req, res) => {
    try {
      const withHash = typeof req.query.with === 'string' ? req.query.with : null;
      if (!withHash) return res.status(400).json({ error: '`with` query param required' });
      const me = await db.get<{ contact_hash: string }>(
        `SELECT contact_hash FROM community_identity WHERE user_id = 'default'`
      );
      if (!me) return res.status(404).json({ error: 'Community not activated' });
      const messages = await db.all<{
        id: string; from_hash: string; to_hashes: string;
        subject: string | null; body: string | null;
        sent_at: string | null; created_at: string;
      }>(
        `SELECT id, from_hash, to_hashes, subject, body, sent_at, created_at
           FROM community_mail
          WHERE draft = 0
            AND (
              (from_hash = $1 AND to_hashes::text LIKE $2)
              OR (from_hash = $3 AND to_hashes::text LIKE $4)
            )
          ORDER BY COALESCE(sent_at, created_at) DESC
          LIMIT 50`,
        me.contact_hash, `%${withHash}%`,
        withHash, `%${me.contact_hash}%`
      );
      // Reverse so oldest first (chat-thread natural order)
      const ordered = [...messages].reverse().map(m => ({
        id: m.id,
        from_hash: m.from_hash,
        is_me: m.from_hash === me.contact_hash,
        subject: m.subject,
        body: m.body,
        timestamp: m.sent_at || m.created_at,
      }));
      res.json({ me: me.contact_hash, with: withHash, messages: ordered });
    } catch (err) {
      console.error('[app-gateway] community messages error:', err);
      res.status(500).json({ error: 'Failed to load messages' });
    }
  });

  // POST /api/app/org/:orgId/community/messages — send a message.
  // Body: { to: string, body: string, subject?: string }
  publicRouter.post('/org/:orgId/community/messages', appAuth, orgMember, async (req, res) => {
    try {
      const { to, body, subject } = req.body as { to?: string; body?: string; subject?: string };
      if (!to || !body || !body.trim()) {
        return res.status(400).json({ error: '`to` and `body` required' });
      }
      const me = await db.get<{ contact_hash: string }>(
        `SELECT contact_hash FROM community_identity WHERE user_id = 'default'`
      );
      if (!me) return res.status(404).json({ error: 'Community not activated' });

      const sentId = `mail_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const inboxId = `mail_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const now = new Date().toISOString();
      const trimmedBody = body.trim();
      const subj = (subject && subject.trim()) || (trimmedBody.length > 60 ? trimmedBody.slice(0, 57) + '...' : trimmedBody);

      // Sender's "sent" copy
      await db.run(
        `INSERT INTO community_mail (id, from_hash, to_hashes, cc_hashes, subject, body, folder, draft, sent_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'sent', 0, $7)`,
        sentId, me.contact_hash, JSON.stringify([to]), '[]', subj, trimmedBody, now
      );
      // Recipient's "inbox" copy (local mirror — real P2P delivery happens
      // in the desktop community route; the companion app reads/writes the
      // same table so messages sync once both ANTONs are online).
      await db.run(
        `INSERT INTO community_mail (id, from_hash, to_hashes, cc_hashes, subject, body, folder, draft, sent_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'inbox', 0, $7)`,
        inboxId, me.contact_hash, JSON.stringify([to]), '[]', subj, trimmedBody, now
      );
      res.status(201).json({ id: sentId, sent_at: now });
    } catch (err) {
      console.error('[app-gateway] community send error:', err);
      res.status(500).json({ error: 'Failed to send message' });
    }
  });

  // GET /api/app/org/:orgId/community — bundle for the Community tile.
  //
  // Returns this instance's contact card (the "your ANTON" identity that
  // peers connect to) + pending/accepted connections, so the companion app
  // can show "this is you" + "people you know" in one round-trip.
  publicRouter.get('/org/:orgId/community', appAuth, orgMember, async (_req, res) => {
    try {
      const identity = await db.get<{
        contact_hash: string | null;
        display_name: string | null;
        public_key: string | null;
        activated_at: string | null;
      }>(
        `SELECT contact_hash, display_name, public_key, activated_at
           FROM community_identity
          WHERE user_id = 'default'
          LIMIT 1`
      ).catch(() => null);
      const connections = await db.all<{
        id: string; contact_hash: string; display_name: string | null;
        status: string; connected_at: string;
      }>(
        `SELECT id, contact_hash, display_name, status, connected_at
           FROM community_connections
          WHERE owner_user_id = 'default' AND status IN ('pending', 'accepted')
          ORDER BY status ASC, connected_at DESC
          LIMIT 50`
      ).catch(() => []);
      res.json({
        identity: identity ?? null,
        connections: Array.isArray(connections) ? connections : [],
      });
    } catch (err) {
      console.error('[app-gateway] community error:', err);
      res.status(500).json({ error: 'Failed to load community' });
    }
  });

  // ── Maintenance ────────────────────────────────────────────────────────
  // L4: Periodic cleanup — store interval ID for clean shutdown
  const cleanupInterval = setInterval(() => {
    svc.cleanupExpired().catch((err) => {
      console.error('[app-gateway] Cleanup error:', err);
    });
    enrollment.pruneExpired().catch((err) => {
      console.error('[app-gateway] Enrollment cleanup error:', err);
    });
    checkpoints.expireOverdue().catch((err) => {
      console.error('[app-gateway] Checkpoint cleanup error:', err);
    });
  }, 600000); // Every 10 minutes
  cleanupInterval.unref?.(); // Don't keep Node alive just for cleanup

  return { publicRouter, adminRouter, service: svc, cleanupInterval };
}
