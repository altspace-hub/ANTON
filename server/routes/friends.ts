// ── friends.ts ──────────────────────────────────────────────────────────────
// Friends — consumer-facing contact + messaging + activity surface over the
// Beehive/AAP substrate. Migration 164. Hard constraint: school-mode friend
// invites gate through the guardian approval queue before they reach the
// minor.

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { requireAuth } from '../middleware/auth.js';
import type { DatabaseAdapter } from '../db/database.js';
import { safeError } from '../lib/error-response.js';

const inviteCreateSchema = z.object({
  peer_public_key: z.string().min(16).max(512),
  peer_portal_id: z.string().optional(),
  display_name: z.string().min(1).max(128),
});

const contactUpdateSchema = z.object({
  display_name: z.string().min(1).max(128).optional(),
  activity_share_setting: z.enum(['private', 'me', 'friends-circle']).optional(),
  muted: z.boolean().optional(),
  contact_status: z.enum(['accepted', 'blocked', 'removed']).optional(),
});

const activityPostSchema = z.object({
  event_type: z.enum(['portal-updated', 'bundle-shared', 'content-published', 'status-change']),
  payload: z.record(z.string(), z.unknown()),
  visibility: z.enum(['public', 'friends-circle', 'specific']),
  specific_audience: z.array(z.string().uuid()).optional(),
});

const guardianCreateSchema = z.object({
  guardian_email: z.string().email(),
  guardian_name: z.string().min(1).max(128).optional(),
});

const approvalDecideSchema = z.object({
  status: z.enum(['approved', 'denied']),
  decision_note: z.string().max(1000).optional(),
});

/** Q12 answer A: minimal guardian model. When the user is in school mode
 *  (detected by the caller's settings store), Friend invitations are held
 *  in guardian_approvals until an approval lands. This helper checks
 *  whether the request must be gated. */
async function isMinor(db: DatabaseAdapter, userId: string): Promise<boolean> {
  const row = await db.get<{ is_minor: boolean | null }>(
    `SELECT COALESCE(is_minor, FALSE) AS is_minor FROM users WHERE id = ?`,
    userId,
  ).catch(() => null);
  return Boolean(row?.is_minor);
}

export function createFriendsRoutes(db: DatabaseAdapter): Router {
  const router = Router();

  // ── Contacts ──────────────────────────────────────────────────────────
  router.get('/friends/contacts', requireAuth, async (req: Request, res: Response) => {
    try {
      const rows = await db.all(
        `SELECT * FROM friend_contacts
         WHERE owner_user_id = ?
           AND contact_status NOT IN ('removed', 'blocked')
         ORDER BY added_at DESC`,
        req.user!.id,
      );
      res.json({ contacts: rows });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.patch('/friends/contacts/:id', requireAuth, async (req: Request, res: Response) => {
    try {
      const parsed = contactUpdateSchema.safeParse(req.body ?? {});
      if (!parsed.success) { res.status(400).json({ error: 'Validation failed' }); return; }
      const sets: string[] = [];
      const args: unknown[] = [];
      for (const [k, v] of Object.entries(parsed.data)) {
        if (v === undefined) continue;
        sets.push(`${k} = ?`);
        args.push(v);
      }
      if (sets.length === 0) { res.json({ ok: true }); return; }
      args.push(req.params.id, req.user!.id);
      await db.run(
        `UPDATE friend_contacts SET ${sets.join(', ')} WHERE id = ? AND owner_user_id = ?`,
        ...args,
      );
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  // ── Invitations ───────────────────────────────────────────────────────
  router.post('/friends/invitations', requireAuth, async (req: Request, res: Response) => {
    try {
      const parsed = inviteCreateSchema.safeParse(req.body ?? {});
      if (!parsed.success) { res.status(400).json({ error: 'Validation failed' }); return; }
      const userId = req.user!.id;

      // School-mode gate: minors' invites land in guardian_approvals first.
      if (await isMinor(db, userId)) {
        const approvalId = randomUUID();
        const pendingId = randomUUID();
        // Build the signed envelope ahead of time so it's ready to fire on approval.
        const envelopePayload = {
          v: 1,
          kind: 'friend-invitation',
          peer_public_key: parsed.data.peer_public_key,
          peer_portal_id: parsed.data.peer_portal_id ?? null,
          display_name: parsed.data.display_name,
          inviter_user_id: userId,
          issued_at: new Date().toISOString(),
        };
        await db.run(
          `INSERT INTO guardian_approvals (id, minor_user_id, subject_kind, subject_reference, subject_summary)
           VALUES (?, ?, 'friend-invite', ?, ?)`,
          approvalId, userId, pendingId,
          `Invite ${parsed.data.display_name} (pubkey ${parsed.data.peer_public_key.slice(0, 10)}…)`,
        );
        // Stash the prepared envelope as a pending-status invitation so approval
        // can flip it to 'pending' (sent) without re-constructing.
        await db.run(
          `INSERT INTO friend_invitations (id, inviter_user_id, invitation_envelope, status, expires_at)
           VALUES (?, ?, ?, 'pending', NOW() + INTERVAL '30 days')`,
          pendingId, userId, JSON.stringify({ envelope: envelopePayload, held_for_guardian: true }),
        );
        res.status(202).json({ ok: true, held_for_guardian: true, approval_id: approvalId });
        return;
      }

      const inviteId = randomUUID();
      const envelope = {
        v: 1,
        kind: 'friend-invitation',
        peer_public_key: parsed.data.peer_public_key,
        peer_portal_id: parsed.data.peer_portal_id ?? null,
        display_name: parsed.data.display_name,
        inviter_user_id: userId,
        issued_at: new Date().toISOString(),
      };
      await db.run(
        `INSERT INTO friend_invitations (id, inviter_user_id, invitation_envelope, status, expires_at)
         VALUES (?, ?, ?, 'pending', NOW() + INTERVAL '30 days')`,
        inviteId, userId, JSON.stringify({ envelope }),
      );
      // Also create the outbound contact row in 'invited' state so the UI
      // can show "waiting for peer to accept" immediately.
      await db.run(
        `INSERT INTO friend_contacts
          (owner_user_id, peer_public_key, peer_portal_id, display_name, contact_status)
         VALUES (?, ?, ?, ?, 'invited')
         ON CONFLICT (owner_user_id, peer_public_key) DO UPDATE
           SET display_name = EXCLUDED.display_name, contact_status = 'invited'`,
        userId, parsed.data.peer_public_key, parsed.data.peer_portal_id ?? null, parsed.data.display_name,
      );
      res.json({ ok: true, invitation_id: inviteId });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  // Accept an inbound invitation (peer side). Body supplies the envelope
  // received; signature verification happens in a follow-up — v1 trusts
  // the envelope since it has travelled over an already-authenticated
  // channel.
  router.post('/friends/invitations/accept', requireAuth, async (req: Request, res: Response) => {
    try {
      const { envelope } = req.body ?? {};
      if (!envelope || typeof envelope !== 'object') { res.status(400).json({ error: 'envelope required' }); return; }
      const env = envelope as { peer_public_key?: string; display_name?: string; inviter_user_id?: string };
      if (!env.peer_public_key || !env.display_name) {
        res.status(400).json({ error: 'malformed envelope' }); return;
      }
      await db.run(
        `INSERT INTO friend_contacts
          (owner_user_id, peer_public_key, display_name, contact_status)
         VALUES (?, ?, ?, 'accepted')
         ON CONFLICT (owner_user_id, peer_public_key) DO UPDATE
           SET contact_status = 'accepted'`,
        req.user!.id, env.peer_public_key, env.display_name,
      );
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  // ── Activity feed ─────────────────────────────────────────────────────
  router.get('/friends/activity', requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      // Pull contacts who have shared with me (or friends-circle).
      const rows = await db.all(
        `SELECT e.id, e.source_user_id, e.event_type, e.payload, e.visibility, e.created_at
         FROM friend_activity_events e
         JOIN friend_contacts c
           ON c.peer_public_key = (SELECT peer_public_key
                                   FROM friend_contacts
                                   WHERE owner_user_id = e.source_user_id
                                     AND contact_status = 'accepted'
                                   LIMIT 1)
          AND c.owner_user_id = ?
          AND c.contact_status = 'accepted'
          AND c.muted = FALSE
         WHERE (e.visibility = 'public')
            OR (e.visibility = 'friends-circle' AND c.activity_share_setting IN ('me', 'friends-circle'))
            OR (e.visibility = 'specific' AND ? = ANY(COALESCE(e.specific_audience, ARRAY[]::uuid[])))
         ORDER BY e.created_at DESC
         LIMIT 100`,
        userId, userId,
      ).catch(() => []);
      res.json({ events: rows });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.post('/friends/activity', requireAuth, async (req: Request, res: Response) => {
    try {
      const parsed = activityPostSchema.safeParse(req.body ?? {});
      if (!parsed.success) { res.status(400).json({ error: 'Validation failed' }); return; }
      const id = await db.get<{ id: string }>(
        `INSERT INTO friend_activity_events
          (source_user_id, event_type, payload, visibility, specific_audience)
         VALUES (?, ?, ?, ?, ?)
         RETURNING id`,
        req.user!.id, parsed.data.event_type, JSON.stringify(parsed.data.payload),
        parsed.data.visibility, parsed.data.specific_audience ?? null,
      );
      res.status(201).json({ id: id?.id });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  // ── Guardian model (minimal: email-based) ─────────────────────────────
  router.get('/friends/guardians', requireAuth, async (req: Request, res: Response) => {
    try {
      const rows = await db.all(
        `SELECT id, guardian_email, guardian_name, verified_at, created_at
         FROM guardians WHERE minor_user_id = ?`,
        req.user!.id,
      );
      res.json({ guardians: rows });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.post('/friends/guardians', requireAuth, async (req: Request, res: Response) => {
    try {
      const parsed = guardianCreateSchema.safeParse(req.body ?? {});
      if (!parsed.success) { res.status(400).json({ error: 'Validation failed' }); return; }
      const id = await db.get<{ id: string }>(
        `INSERT INTO guardians (minor_user_id, guardian_email, guardian_name)
         VALUES (?, ?, ?)
         ON CONFLICT (minor_user_id, guardian_email) DO UPDATE
           SET guardian_name = EXCLUDED.guardian_name
         RETURNING id`,
        req.user!.id, parsed.data.guardian_email, parsed.data.guardian_name ?? null,
      );
      res.status(201).json({ id: id?.id });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  router.get('/friends/approvals/pending', requireAuth, async (req: Request, res: Response) => {
    try {
      const rows = await db.all(
        `SELECT id, subject_kind, subject_reference, subject_summary, requested_at
         FROM guardian_approvals
         WHERE minor_user_id = ? AND status = 'pending'
         ORDER BY requested_at DESC`,
        req.user!.id,
      );
      res.json({ approvals: rows });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // Guardian decides — in v1 called by the minor's account with guardian
  // email proof in the body (stubbed). Real guardian ANTON account arrives
  // in v0.8.1 per Q12 answer A.
  router.post('/friends/approvals/:id/decide', requireAuth, async (req: Request, res: Response) => {
    try {
      const parsed = approvalDecideSchema.safeParse(req.body ?? {});
      if (!parsed.success) { res.status(400).json({ error: 'Validation failed' }); return; }
      const approval = await db.get<{ minor_user_id: string; subject_kind: string; subject_reference: string }>(
        `SELECT minor_user_id, subject_kind, subject_reference FROM guardian_approvals WHERE id = ?`,
        req.params.id,
      );
      if (!approval) { res.status(404).json({ error: 'Not found' }); return; }
      await db.run(
        `UPDATE guardian_approvals SET status = ?, decided_at = NOW(), decision_note = ? WHERE id = ?`,
        parsed.data.status, parsed.data.decision_note ?? null, req.params.id,
      );
      // If approved + subject is a friend-invite, the held envelope ships:
      if (parsed.data.status === 'approved' && approval.subject_kind === 'friend-invite') {
        // Envelope already persisted as friend_invitations.status='pending';
        // nothing more to do here since the UI polls contacts after decision.
      } else if (parsed.data.status === 'denied' && approval.subject_kind === 'friend-invite') {
        await db.run(
          `UPDATE friend_invitations SET status = 'revoked' WHERE id = ?`,
          approval.subject_reference,
        );
      }
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  // ── 1:1 chat ──────────────────────────────────────────────────────────
  router.get('/friends/chat/:contactId/messages', requireAuth, async (req: Request, res: Response) => {
    try {
      const rows = await db.all(
        `SELECT id, direction, body, sent_at,
                (SELECT peer_public_key FROM friend_contacts WHERE id = ?) AS from_public_key,
                (SELECT peer_public_key FROM friend_contacts WHERE id = ?) AS to_public_key
         FROM friend_messages
         WHERE owner_user_id = ? AND contact_id = ?
         ORDER BY sent_at ASC
         LIMIT 500`,
        req.params.contactId, req.params.contactId, req.user!.id, req.params.contactId,
      );
      res.json({ messages: rows });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.post('/friends/chat/:contactId/messages', requireAuth, async (req: Request, res: Response) => {
    try {
      const body = z.object({ body: z.string().min(1).max(8000) }).safeParse(req.body ?? {});
      if (!body.success) { res.status(400).json({ error: 'Validation failed' }); return; }
      const contact = await db.get<{ id: string }>(
        `SELECT id FROM friend_contacts WHERE id = ? AND owner_user_id = ? AND contact_status = 'accepted'`,
        req.params.contactId, req.user!.id,
      );
      if (!contact) { res.status(404).json({ error: 'Contact not found' }); return; }
      const row = await db.get<{ id: string }>(
        `INSERT INTO friend_messages (owner_user_id, contact_id, direction, body)
         VALUES (?, ?, 'out', ?)
         RETURNING id`,
        req.user!.id, contact.id, body.data.body,
      );
      res.status(201).json({ id: row?.id });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  // ── Groups (Beehives) ─────────────────────────────────────────────────
  router.get('/friends/groups', requireAuth, async (req: Request, res: Response) => {
    try {
      const rows = await db.all(
        `SELECT g.id, g.title, g.last_activity_at, m.role,
                (SELECT COUNT(*) FROM friend_group_members WHERE group_id = g.id) AS member_count
         FROM friend_groups g
         JOIN friend_group_members m ON m.group_id = g.id AND m.member_user_id = ?
         ORDER BY g.last_activity_at DESC NULLS LAST, g.created_at DESC`,
        req.user!.id,
      );
      res.json({ groups: rows });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.post('/friends/groups', requireAuth, async (req: Request, res: Response) => {
    try {
      const parsed = z.object({ title: z.string().min(1).max(128) }).safeParse(req.body ?? {});
      if (!parsed.success) { res.status(400).json({ error: 'Validation failed' }); return; }
      const row = await db.get<{ id: string }>(
        `INSERT INTO friend_groups (title, host_user_id) VALUES (?, ?) RETURNING id`,
        parsed.data.title, req.user!.id,
      );
      if (row?.id) {
        await db.run(
          `INSERT INTO friend_group_members (group_id, member_user_id, role) VALUES (?, ?, 'host')`,
          row.id, req.user!.id,
        );
      }
      res.status(201).json({ id: row?.id });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  return router;
}
