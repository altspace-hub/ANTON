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

  // ── Maintenance ────────────────────────────────────────────────────────
  // L4: Periodic cleanup — store interval ID for clean shutdown
  const cleanupInterval = setInterval(() => {
    svc.cleanupExpired().catch((err) => {
      console.error('[app-gateway] Cleanup error:', err);
    });
  }, 600000); // Every 10 minutes
  cleanupInterval.unref?.(); // Don't keep Node alive just for cleanup

  return { publicRouter, adminRouter, service: svc, cleanupInterval };
}
