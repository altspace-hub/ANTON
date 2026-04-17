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

export async function createAppGatewayRoutes(db: DatabaseAdapter) {
  const publicRouter = Router();
  const adminRouter = Router();
  const svc = await createAppGatewayService(db);
  const appAuth = createAppAuthMiddleware(db);
  const orgMember = createOrgMembershipCheck(db);
  const enrollment = createAppEnrollmentService(db);
  const push = createAppPushService(db);
  const checkpoints = createAppCheckpointService(db);

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
  publicRouter.get('/discover/lan', appAuth, async (_req, res) => {
    try {
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
      console.log('[app-gateway] register-simple success:', result.contactHash);
      res.json(result);
    } catch (err) {
      console.error('[app-gateway] register-simple error:', err);
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
      const { message, sessionId, intentCategoryId, voiceInput, outputLanguage } = req.body;
      if (!message) return res.status(400).json({ error: 'message is required' });

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

  // Public — fetch a pre-issued enrollment package by token (read-only)
  publicRouter.get('/enrollment/:token', async (req, res) => {
    try {
      const token = String(req.params.token);
      // Validate shape — URL-safe base64
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
      const b = req.body ?? {};
      if (!['approved', 'rejected', 'modified'].includes(b.decision)) {
        return res.status(400).json({ error: 'decision must be approved, rejected, or modified' });
      }
      const result = await checkpoints.respond(String(req.params.id), req.appUser!.id,
        typeof b.device_id === 'string' ? b.device_id : null, {
          decision: b.decision as 'approved' | 'rejected' | 'modified',
          note: typeof b.note === 'string' ? b.note.slice(0, 4000) : undefined,
          modification: typeof b.modification === 'object' && b.modification !== null ? b.modification : undefined,
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
