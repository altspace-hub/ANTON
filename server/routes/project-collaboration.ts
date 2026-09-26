import { Router, Request, Response, NextFunction } from 'express';
import type { DatabaseAdapter } from '../db/database.js';
import { randomUUID, randomBytes } from 'crypto';
import { sendProjectInvitationEmail } from '../services/email.js';
import { scopesToOwner } from '../middleware/ownership.js';
import { isTeamMode } from '../middleware/role-guards.js';
import { publicBaseUrl } from '../lib/request-origin.js';

/** The roles project_members.role accepts (its CHECK constraint). */
const PROJECT_ROLES = ['owner', 'admin', 'member', 'viewer'] as const;
type ProjectRole = typeof PROJECT_ROLES[number];

function isProjectRole(value: unknown): value is ProjectRole {
  return typeof value === 'string' && (PROJECT_ROLES as readonly string[]).includes(value);
}

type MemberChange = 'ok' | 'not_found' | 'last_owner';

/**
 * Whether an invitation's sender may still vouch for it: an instance admin, or
 * a CURRENT owner of the project (only owners and admins can send one). Params:
 * invited_by, project_id.
 */
export const INVITER_STILL_AUTHORISED_SQL =
  `SELECT 1 AS ok FROM users u
    WHERE u.id = ?
      AND (u.role = 'admin' OR EXISTS (
        SELECT 1 FROM project_members pm
         WHERE pm.project_id = ? AND pm.user_id = u.id AND pm.role = 'owner'))`;

/**
 * Team mode: may this pending invitation still be accepted? Its role was the
 * sender's to give when it was sent — a sender who has since been removed or
 * demoted can no longer give it. Without this an owner could invite their own
 * address, be removed, and accept the invitation to come back as owner
 * (round-2 gap "verify2:projects-2"). Solo mode is not checked (invitations are
 * a team feature and solo behaves as before). Exported so every place that
 * accepts an invitation can apply the same rule.
 */
export async function invitationStillValid(
  db: DatabaseAdapter,
  invitation: { project_id: string; invited_by: string | null },
): Promise<boolean> {
  if (!isTeamMode()) return true;
  if (!invitation.invited_by) return false;
  return !!(await db.get(INVITER_STILL_AUTHORISED_SQL, invitation.invited_by, invitation.project_id));
}

export async function createProjectCollaborationRoutes(db: DatabaseAdapter) {
  const router = Router();
  const IS_TEAM_MODE = process.env.DEPLOYMENT_MODE === 'team';

  function getUserFromReq(req: unknown): { id: string; display_name?: string; role?: string } {
    const r = req as { user?: { id?: string; display_name?: string; role?: string } };
    return {
      id: r.user?.id ?? 'solo',
      display_name: r.user?.display_name,
      role: r.user?.role,
    };
  }

  async function projectRoleOf(projectId: string, userId: string): Promise<string | null> {
    const row = await db.get(
      'SELECT role FROM project_members WHERE project_id = ? AND user_id = ?', projectId, userId,
    ) as { role?: string } | undefined;
    return row?.role ?? null;
  }

  // Only the project owner (or a global admin) may manage members / invitations.
  // No-op in solo mode. Returns false and sends 403 when blocked — the caller is
  // a member by then (gate below), so a 403 discloses nothing they cannot see.
  async function requireProjectOwner(req: Request, res: Response): Promise<boolean> {
    if (!scopesToOwner(req)) return true;
    const user = getUserFromReq(req);
    if ((await projectRoleOf(String(req.params.id), user.id)) !== 'owner') {
      res.status(403).json({ error: 'Only the project owner can manage members' });
      return false;
    }
    return true;
  }

  /**
   * Change or remove one member without ever leaving the project ownerless (H7):
   * with no owner nobody but a global admin could manage it again. The project's
   * owner rows are locked first, so two concurrent demotions cannot each see
   * "another owner remains" and together remove both. `apply` runs only when
   * the change keeps at least one owner. Applies in every mode — it is integrity,
   * not authorisation.
   *
   * When the member leaving the owner role (removed, or demoted) is the one
   * projects.user_id names — the creator, since projects.ts records them there —
   * that column moves to a remaining owner in the same transaction. The Code
   * Studio routes read it as the owner, and a removed creator must not keep what
   * removal was meant to take away (round-1 verifier gap, 2026-09-23). With no
   * owner left to take it (legacy rows only — the rule above keeps one), it goes
   * back to the column default 'default', which is nobody.
   *
   * Team mode: when the member leaves the owner role (removed, or given any
   * other role), the project's pending invitations they SENT are revoked — they
   * can no longer grant what those invitations offer — and so are pending
   * invitations ADDRESSED to them, so a removed person cannot walk back in
   * through one (round-2 gap "verify2:projects-2": a removed owner rejoined as
   * owner through an invitation they had sent to their own address). Acceptance
   * re-checks the sender as well (invitationStillValid); this keeps the list of
   * pending invitations honest.
   */
  async function changeMember(
    projectId: string,
    memberId: string,
    keepsOwner: boolean,
    apply: (tx: DatabaseAdapter) => Promise<unknown>,
  ): Promise<MemberChange> {
    return db.transaction(async (tx) => {
      const owners = await tx.all<{ id: string }>(
        "SELECT id FROM project_members WHERE project_id = ? AND role = 'owner' FOR UPDATE", projectId,
      );
      const target = await tx.get<{ role: string; user_id: string }>(
        'SELECT role, user_id FROM project_members WHERE id = ? AND project_id = ?', memberId, projectId,
      );
      if (!target) return 'not_found';
      if (target.role === 'owner' && !keepsOwner && owners.length <= 1) return 'last_owner';
      await apply(tx);
      if (!keepsOwner) {
        const heir = await tx.get<{ user_id: string }>(
          `SELECT user_id FROM project_members
           WHERE project_id = ? AND role = 'owner' AND user_id <> ?
           ORDER BY created_at ASC, id ASC LIMIT 1`,
          projectId, target.user_id,
        );
        await tx.run(
          'UPDATE projects SET user_id = ? WHERE id = ? AND user_id = ?',
          heir?.user_id ?? 'default', projectId, target.user_id,
        );
        if (isTeamMode()) {
          await tx.run(
            `UPDATE project_invitations SET status = 'revoked'
              WHERE project_id = ? AND status = 'pending'
                AND (invited_by = ? OR lower(email) = (SELECT lower(email) FROM users WHERE id = ?))`,
            projectId, target.user_id, target.user_id,
          );
        }
      }
      return 'ok';
    });
  }

  // ── Team-mode membership gate ──────────────────────────────────────────────────
  // Every route addressed to a project carries it as :id. Require membership here —
  // once — so no route can be reached cross-tenant by project UUID (round-2 finding
  // #21). No-op in solo mode / for admins, so the default deployment is unaffected.
  // A non-member gets 404, the same as for a project that does not exist: a 403
  // confirmed the id belonged to someone (see ownership.ts).
  // (The invitation-accept route has no :id, so it is intentionally not gated.)
  router.param('id', async (req: Request, res: Response, next: NextFunction, id: string) => {
    try {
      if (!scopesToOwner(req)) return next();
      if (!(await projectRoleOf(String(id), getUserFromReq(req).id))) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }
      next();
    } catch (err) {
      next(err);
    }
  });

  // ── Members ──────────────────────────────────────────────────────────────────

  // GET /api/projects/:id/members
  router.get('/projects/:id/members', async (req, res) => {
    try {
      const members = await db.all(`
        SELECT pm.id, pm.project_id, pm.user_id, pm.role, pm.added_by, pm.created_at,
               u.username, u.display_name, u.email
        FROM project_members pm
        JOIN users u ON pm.user_id = u.id
        WHERE pm.project_id = ?
        ORDER BY pm.created_at
      `, req.params.id);
      res.json(members);
    } catch (err) {
      console.error('[project-collab] members list error:', err);
      res.status(500).json({ error: 'Failed to list members' });
    }
  });

  // POST /api/projects/:id/members — add existing user by user_id
  router.post('/projects/:id/members', async (req, res) => {
    try {
      if (!(await requireProjectOwner(req, res))) return;
      const { userId, role } = req.body as { userId: string; role?: unknown };
      if (!userId) return res.status(400).json({ error: 'userId is required' });
      if (role !== undefined && role !== '' && !isProjectRole(role)) {
        return res.status(400).json({ error: `role must be one of: ${PROJECT_ROLES.join(', ')}` });
      }

      const user = getUserFromReq(req);
      const id = randomUUID();
      const memberRole: ProjectRole = isProjectRole(role) ? role : 'member';

      await db.run(`
        INSERT INTO project_members (id, project_id, user_id, role, added_by)
        VALUES (?, ?, ?, ?, ?)
      `, id, req.params.id, userId, memberRole, user.id);

      res.json({ id, project_id: req.params.id, user_id: userId, role: memberRole });
    } catch (err: unknown) {
      // PostgreSQL words it "duplicate key value violates unique constraint".
      if (err instanceof Error && /UNIQUE|duplicate key/i.test(err.message)) {
        return res.status(409).json({ error: 'User is already a member of this project' });
      }
      console.error('[project-collab] add member error:', err);
      res.status(500).json({ error: 'Failed to add member' });
    }
  });

  // PATCH /api/projects/:id/members/:memberId — update member role
  router.patch('/projects/:id/members/:memberId', async (req, res) => {
    try {
      if (!(await requireProjectOwner(req, res))) return;
      const { role } = req.body as { role?: unknown };
      if (!role) return res.status(400).json({ error: 'role is required' });
      if (!isProjectRole(role)) {
        return res.status(400).json({ error: `role must be one of: ${PROJECT_ROLES.join(', ')}` });
      }

      const projectId = String(req.params.id);
      const memberId = String(req.params.memberId);
      const outcome = await changeMember(projectId, memberId, role === 'owner', (tx) => tx.run(
        'UPDATE project_members SET role = ? WHERE id = ? AND project_id = ?', role, memberId, projectId,
      ));
      if (outcome === 'not_found') return res.status(404).json({ error: 'Member not found' });
      if (outcome === 'last_owner') return res.status(409).json({ error: 'A project must keep at least one owner' });

      res.json({ ok: true });
    } catch (err) {
      console.error('[project-collab] update member error:', err);
      res.status(500).json({ error: 'Failed to update member' });
    }
  });

  // DELETE /api/projects/:id/members/:memberId — remove member
  router.delete('/projects/:id/members/:memberId', async (req, res) => {
    try {
      if (!(await requireProjectOwner(req, res))) return;
      const projectId = String(req.params.id);
      const memberId = String(req.params.memberId);
      const outcome = await changeMember(projectId, memberId, false, (tx) => tx.run(
        'DELETE FROM project_members WHERE id = ? AND project_id = ?', memberId, projectId,
      ));
      if (outcome === 'not_found') return res.status(404).json({ error: 'Member not found' });
      if (outcome === 'last_owner') return res.status(409).json({ error: 'A project must keep at least one owner' });
      res.json({ ok: true });
    } catch (err) {
      console.error('[project-collab] remove member error:', err);
      res.status(500).json({ error: 'Failed to remove member' });
    }
  });

  // ── Invitations ──────────────────────────────────────────────────────────────

  // POST /api/projects/:id/invitations — send invitation
  router.post('/projects/:id/invitations', async (req, res) => {
    if (!IS_TEAM_MODE) {
      return res.status(400).json({ error: 'Invitations are only available in team mode' });
    }
    try {
      if (!(await requireProjectOwner(req, res))) return;
      const { email, role } = req.body as { email: string; role?: string };
      if (!email) return res.status(400).json({ error: 'email is required' });
      // Checked now, not at acceptance: an invalid role failed the member INSERT
      // there silently and the invitation was still marked accepted.
      if (role !== undefined && role !== '' && !isProjectRole(role)) {
        return res.status(400).json({ error: `role must be one of: ${PROJECT_ROLES.join(', ')}` });
      }

      const user = getUserFromReq(req);
      const project = await db.get('SELECT name FROM projects WHERE id = ?', req.params.id) as { name: string } | undefined;
      if (!project) return res.status(404).json({ error: 'Project not found' });

      const id = randomUUID();
      const token = randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      await db.run(`
        INSERT INTO project_invitations (id, project_id, email, role, invited_by, token, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, id, req.params.id, email, role || 'member', user.id, token, expiresAt);

      // Send invitation email. The link's host comes from configuration, not
      // the request: a forged Host header would mail a link to another server.
      const baseUrl = publicBaseUrl(req);
      const acceptUrl = `${baseUrl}/api/projects/invitations/accept/${token}`;
      try {
        await sendProjectInvitationEmail(
          email,
          project.name,
          user.display_name || 'A team member',
          role || 'member',
          acceptUrl
        );
      } catch (emailErr) {
        console.error('[project-collab] invitation email error:', emailErr);
      }

      res.json({ id, email, role: role || 'member', token, expires_at: expiresAt });
    } catch (err) {
      console.error('[project-collab] invitation error:', err);
      res.status(500).json({ error: 'Failed to send invitation' });
    }
  });

  // GET /api/projects/:id/invitations — list pending invitations
  router.get('/projects/:id/invitations', async (req, res) => {
    try {
      // Every column but `token`: any member may list invitations, and the token
      // is the invitation's acceptance secret — only the owner who sent it gets it
      // (in the POST response). The members page does not use it.
      const invitations = await db.all(
        `SELECT id, project_id, email, role, invited_by, status, expires_at, created_at
         FROM project_invitations WHERE project_id = ? AND status = 'pending' ORDER BY created_at DESC`
      , req.params.id);
      res.json(invitations);
    } catch (err) {
      console.error('[project-collab] invitations list error:', err);
      res.status(500).json({ error: 'Failed to list invitations' });
    }
  });

  // GET /api/projects/invitations/accept/:token — accept invitation
  router.get('/projects/invitations/accept/:token', async (req, res) => {
    try {
      const invitation = await db.get(`
        SELECT * FROM project_invitations
        WHERE token = ? AND status = 'pending' AND expires_at > NOW()
      `, req.params.token) as {
        id: string;
        project_id: string;
        email: string;
        role: string;
        invited_by: string;
      } | undefined;

      if (!invitation) {
        return res.redirect('/?error=invitation_invalid_or_expired');
      }

      // The sender must still be allowed to give this role (see invitationStillValid).
      // Refused like an expired invitation, and retired so it cannot be tried again.
      if (!(await invitationStillValid(db, invitation))) {
        await db.run("UPDATE project_invitations SET status = 'revoked' WHERE id = ? AND status = 'pending'", invitation.id);
        return res.redirect('/?error=invitation_invalid_or_expired');
      }

      // Check if user with this email exists
      const existingUser = await db.get('SELECT id FROM users WHERE email = ?', invitation.email) as { id: string } | undefined;

      if (existingUser) {
        // Auto-add as member
        const memberId = randomUUID();
        try {
          await db.run(`
            INSERT INTO project_members (id, project_id, user_id, role, added_by)
            VALUES (?, ?, ?, ?, ?)
          `, memberId, invitation.project_id, existingUser.id, invitation.role, invitation.invited_by);
        } catch {
          // Already a member — ignore
        }

        // Mark invitation as accepted
        await db.run("UPDATE project_invitations SET status = 'accepted' WHERE id = ?", invitation.id);

        return res.redirect(`/?invitation_accepted=true&project=${invitation.project_id}`);
      }

      // User doesn't exist — redirect to signup with invitation token
      return res.redirect(`/?signup=true&invitation=${req.params.token}`);
    } catch (err) {
      console.error('[project-collab] accept invitation error:', err);
      res.redirect('/?error=invitation_failed');
    }
  });

  // DELETE /api/projects/:id/invitations/:invitationId — revoke invitation
  router.delete('/projects/:id/invitations/:invitationId', async (req, res) => {
    try {
      if (!(await requireProjectOwner(req, res))) return;
      await db.run(
        "UPDATE project_invitations SET status = 'revoked' WHERE id = ? AND project_id = ?"
      , req.params.invitationId, req.params.id);
      res.json({ ok: true });
    } catch (err) {
      console.error('[project-collab] revoke invitation error:', err);
      res.status(500).json({ error: 'Failed to revoke invitation' });
    }
  });

  // ── Notes ────────────────────────────────────────────────────────────────────

  // GET /api/projects/:id/notes
  router.get('/projects/:id/notes', async (req, res) => {
    try {
      const notes = await db.all('SELECT * FROM project_notes WHERE project_id = ? ORDER BY created_at DESC'
      , req.params.id);
      res.json(notes);
    } catch (err) {
      console.error('[project-collab] notes list error:', err);
      res.status(500).json({ error: 'Failed to list notes' });
    }
  });

  // POST /api/projects/:id/notes
  router.post('/projects/:id/notes', async (req, res) => {
    try {
      const { content, noteType } = req.body as { content: string; noteType?: string };
      if (!content?.trim()) return res.status(400).json({ error: 'content is required' });

      const user = getUserFromReq(req);
      const id = randomUUID();

      await db.run(`
        INSERT INTO project_notes (id, project_id, user_id, user_name, content, note_type)
        VALUES (?, ?, ?, ?, ?, ?)
      `, id, req.params.id, user.id, user.display_name || 'User', content.trim(), noteType || 'note');

      const note = await db.get('SELECT * FROM project_notes WHERE id = ?', id);
      res.json(note);
    } catch (err) {
      console.error('[project-collab] add note error:', err);
      res.status(500).json({ error: 'Failed to add note' });
    }
  });

  // DELETE /api/projects/:id/notes/:noteId
  router.delete('/projects/:id/notes/:noteId', async (req, res) => {
    try {
      const user = getUserFromReq(req);
      const note = await db.get(
        'SELECT user_id FROM project_notes WHERE id = ? AND project_id = ?'
      , req.params.noteId, req.params.id) as { user_id: string } | undefined;

      if (!note) return res.status(404).json({ error: 'Note not found' });

      // Only allow deleting own notes (or admin)
      if (note.user_id !== user.id && user.role !== 'admin') {
        return res.status(403).json({ error: 'Can only delete your own notes' });
      }

      await db.run('DELETE FROM project_notes WHERE id = ? AND project_id = ?'
      , req.params.noteId, req.params.id);
      res.json({ ok: true });
    } catch (err) {
      console.error('[project-collab] delete note error:', err);
      res.status(500).json({ error: 'Failed to delete note' });
    }
  });

  return router;
}
