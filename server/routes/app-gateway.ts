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
import { createRegulatoryRadar } from '../services/regulatory-radar.js';
import type { createRadarFetcher } from '../services/radar-fetcher.js';
import { hybridSearch } from '../services/hybrid-search.js';
import { callChat, resolveModel } from '../services/provider-router.js';
import { createAppMailService, type MailProviderKind } from '../services/app-mail-service.js';

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
      res.status(500).json({ error: err instanceof Error ? err.message : 'LAN browse failed' });
    }
  });

  // ── Registration (no auth) ─────────────────────────────────────────────
  publicRouter.post('/register', async (req, res) => {
    try {
      const { publicKey, displayName, preferredLanguage } = req.body;
      if (!publicKey) return res.status(400).json({ error: 'publicKey is required' });
      const result = await svc.registerUser(publicKey, displayName, preferredLanguage);
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Registration failed' });
    }
  });

  // ── Simple registration (no Ed25519 — for HTTP/LAN where crypto.subtle is unavailable) ──
  publicRouter.post('/register-simple', async (req, res) => {
    try {
      const { displayName, preferredLanguage } = req.body;
      if (!displayName?.trim()) return res.status(400).json({ error: 'displayName is required' });
      const result = await svc.registerSimple(displayName.trim(), preferredLanguage || 'en');
      // Phase H fix M2 — don't log identifiers (links logs to a user)
      console.log('[app-gateway] register-simple success');
      res.json(result);
    } catch (err) {
      console.error('[app-gateway] register-simple error:', err instanceof Error ? err.message : 'unknown');
      res.status(400).json({ error: err instanceof Error ? err.message : 'Registration failed' });
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
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to update profile' });
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

  // Non-streaming query — returns JSON directly (works through any proxy)
  publicRouter.post('/org/:orgId/query-sync', appAuth, orgMember, async (req, res) => {
    try {
      const { message, sessionId, intentCategoryId, voiceInput, outputLanguage, capture } = req.body;
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

      // Use a promise to capture the onComplete result
      const queryResult = await new Promise<Record<string, unknown>>((resolve, reject) => {
        svc.processQuery(
          {
            orgId: String(req.params.orgId),
            userId: req.appUser!.id,
            message, sessionId, intentCategoryId, voiceInput, outputLanguage,
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
        const sugResult = await sendRequest({
          model: 'claude-haiku-4-5-20251001' as import('../../src/lib/types.js').ModelId,
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
      res.status(500).json({ error: err instanceof Error ? err.message : 'Query failed' });
    }
  });

  // REST query fallback (for clients that can't use WebSocket)
  publicRouter.post('/org/:orgId/query', appAuth, orgMember, async (req, res) => {
    try {
      const { message, sessionId, intentCategoryId, voiceInput, outputLanguage } = req.body;
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
        res.status(500).json({ error: err instanceof Error ? err.message : 'Query failed' });
      }
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // ADMIN ROUTES (/api/admin/app/*) — uses ANTON session auth
  // ══════════════════════════════════════════════════════════════════════════

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
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to update user' });
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
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to fetch enrollment' });
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
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to fetch enrollment' });
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
      res.status(400).json({ error: err instanceof Error ? err.message : 'Enrollment failed' });
    }
  });

  // Authenticated — list devices belonging to the current user
  publicRouter.get('/devices', appAuth, async (req, res) => {
    try {
      const userId = req.appUser!.id;
      const devices = await enrollment.listDevices(userId);
      res.json({ devices });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to list devices' });
    }
  });

  // Authenticated — unpair (revoke) a device
  publicRouter.delete('/devices/:id', appAuth, async (req, res) => {
    try {
      const userId = req.appUser!.id;
      await enrollment.revokeDevice(userId, String(req.params.id));
      res.json({ revoked: true });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to revoke device' });
    }
  });

  // Authenticated — get the instance's display info (used by Settings)
  publicRouter.get('/instance-info', appAuth, async (_req, res) => {
    try {
      const id = await enrollment.getOrCreateInstanceIdentity();
      res.json({
        display_name: id.display_name,
        contact_hash: id.contact_hash,
        pubkey: id.pubkey,
        cert_fingerprint: id.cert_fingerprint,
        // Optional: enables web-push (PWA) on instances that have configured
        // a VAPID keypair. Native iOS / Android registration doesn't use this.
        vapid_public_key: process.env.VAPID_PUBLIC_KEY || null,
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load instance info' });
    }
  });

  // Admin — generate an enrollment QR (admin issues to a user about to pair)
  adminRouter.post('/enrollment/start', async (req, res) => {
    try {
      const b = req.body ?? {};
      // The desktop UI's `req.user.id` is attached upstream by main auth middleware
      const issuedBy = (req as { user?: { id: string } }).user?.id ?? 'admin';
      // Build the endpoint set from env / request
      const port = parseInt(process.env.PORT || '3011', 10);
      const advertiser = await import('../services/mdns-advertiser.js')
        .then(m => m.createMdnsAdvertiser(port))
        .catch(() => null);
      const info = advertiser?.getInfo();
      const lan = info?.ip ? `http://${info.ip}:${port}` : undefined;
      const wan = process.env.APP_GATEWAY_PUBLIC_URL || undefined;
      const pkg = await enrollment.startEnrollment({
        intended_user_id: typeof b.intended_user_id === 'string' ? b.intended_user_id : null,
        org_id: typeof b.org_id === 'string' ? b.org_id : null,
        intended_role: typeof b.intended_role === 'string' ? b.intended_role : 'member',
        display_name_hint: typeof b.display_name_hint === 'string' ? b.display_name_hint : null,
        language_hint: typeof b.language_hint === 'string' ? b.language_hint : null,
        endpoints: { lan, wan, mdns_name: info?.serviceName },
        issued_by_user_id: issuedBy,
      });
      res.json(pkg);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to start enrollment' });
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
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to register push token' });
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
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to unregister' });
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
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load checkpoints' });
    }
  });

  publicRouter.get('/checkpoints/:id', appAuth, async (req, res) => {
    try {
      const c = await checkpoints.get(String(req.params.id), req.appUser!.id);
      if (!c) return res.status(404).json({ error: 'Checkpoint not found' });
      res.json({ checkpoint: c });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load checkpoint' });
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
          return res.status(401).json({ error: e instanceof Error ? e.message : 'Envelope verification failed' });
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
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to respond' });
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
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to create checkpoint' });
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

      const events = checkpoints.map(c => {
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

      // Source legend — only ANTON is a "real" feed in v1; the other rows
      // appear so the UI strip looks normal but their counts are 0.
      const sources = [
        { id: 'anton',    label: 'ANTON',           count: events.length, color: 'teal'  as const },
        { id: 'work',     label: 'Work · M365',     count: 0,             color: 'blue'  as const },
        { id: 'personal', label: 'Personal',        count: 0,             color: 'gold'  as const },
        { id: 'family',   label: 'Family',          count: 0,             color: 'plum'  as const },
      ];

      // ANTON prep banner — most pressing high/critical event today
      const prepEvent = events.find(e => e.color === 'red');
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

  publicRouter.get('/org/:orgId/modules', appAuth, orgMember, (_req, res) => {
    const pinned = [
      { id: 'sanctions-advisory',  name: 'Sanctions Advisory', description: 'Screen · advise · SAR',     color: 'red',    busy: false },
      { id: 'counsels-desk',        name: "Counsel's Desk",     description: 'Draft · redline · cite',    color: 'blue',   busy: false },
      { id: 'gap-analysis',         name: 'Gap Assessment',     description: 'Policy ↔ control',          color: 'teal',   busy: false },
      { id: 'finance-autopilot',    name: 'Finance Autopilot',  description: 'AP · payments · approvals', color: 'gold',   busy: false },
    ];
    const browse = [
      { id: 'markets-intelligence',  name: 'Markets Intelligence',  description: 'Tape · briefs · scenarios' },
      { id: 'orchestrator',          name: 'Orchestrator',          description: 'Run, monitor missions' },
      { id: 'knowledge-base',        name: 'Knowledge Base',        description: 'Docs · atoms · search' },
      { id: 'presentation-builder',  name: 'Presentation Builder',  description: 'Deck from brief' },
      { id: 'task-agent',            name: 'Task Agent',            description: 'Long-running jobs' },
      { id: 'civic',                 name: 'Civic',                 description: 'Public affairs · NGO' },
      { id: 'talent',                name: 'Talent',                description: 'Hiring · onboarding' },
      { id: 'travel',                name: 'Travel',                description: 'Itineraries · expense' },
      { id: 'risk-atlas',            name: 'Risk Atlas',            description: '7-stage threat paths' },
      { id: 'horizon-radar',         name: 'Horizon Radar',         description: 'Reg + competitor scan' },
    ];
    res.json({ pinned, browse });
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
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to connect provider' });
    }
  });

  // DELETE /api/app/org/:orgId/mail/providers/:id
  publicRouter.delete('/org/:orgId/mail/providers/:id', appAuth, orgMember, async (req, res) => {
    try {
      await mail.disconnectProvider(req.appUser!.id, String(req.params.orgId), String(req.params.id));
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to disconnect provider' });
    }
  });

  // POST /api/app/org/:orgId/mail/providers/:id/sync — trigger a sync
  publicRouter.post('/org/:orgId/mail/providers/:id/sync', appAuth, orgMember, async (req, res) => {
    try {
      const result = await mail.syncProvider(req.appUser!.id, String(req.params.orgId), String(req.params.id));
      res.status(result.ok ? 200 : 503).json(result);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to sync provider' });
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
        throw new Error(`LLM call failed: ${err instanceof Error ? err.message : 'unknown'}`);
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
      res.status(500).json({ error: err instanceof Error ? err.message : 'Pathfinder query failed' });
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
      const { createFCWalletService } = await import('../services/fc-wallet-service.js');
      const { createFCTransactionService } = await import('../services/fc-transaction-service.js');
      const wsvc = await createFCWalletService(db);
      const tsvc = await createFCTransactionService(db);
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
