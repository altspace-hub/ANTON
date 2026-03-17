import { Router } from 'express';
import type { DatabaseAdapter } from '../db/database.js';
import { randomUUID, randomBytes } from 'crypto';
import { sendProjectInvitationEmail } from '../services/email.js';

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
      const { userId, role } = req.body as { userId: string; role?: string };
      if (!userId) return res.status(400).json({ error: 'userId is required' });

      const user = getUserFromReq(req);
      const id = randomUUID();
      const memberRole = role || 'member';

      await db.run(`
        INSERT INTO project_members (id, project_id, user_id, role, added_by)
        VALUES (?, ?, ?, ?, ?)
      `, id, req.params.id, userId, memberRole, user.id);

      res.json({ id, project_id: req.params.id, user_id: userId, role: memberRole });
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes('UNIQUE')) {
        return res.status(409).json({ error: 'User is already a member of this project' });
      }
      console.error('[project-collab] add member error:', err);
      res.status(500).json({ error: 'Failed to add member' });
    }
  });

  // PATCH /api/projects/:id/members/:memberId — update member role
  router.patch('/projects/:id/members/:memberId', async (req, res) => {
    try {
      const { role } = req.body as { role: string };
      if (!role) return res.status(400).json({ error: 'role is required' });

      await db.run(
        'UPDATE project_members SET role = ? WHERE id = ? AND project_id = ?'
      , role, req.params.memberId, req.params.id);

      res.json({ ok: true });
    } catch (err) {
      console.error('[project-collab] update member error:', err);
      res.status(500).json({ error: 'Failed to update member' });
    }
  });

  // DELETE /api/projects/:id/members/:memberId — remove member
  router.delete('/projects/:id/members/:memberId', async (req, res) => {
    try {
      await db.run(
        'DELETE FROM project_members WHERE id = ? AND project_id = ?'
      , req.params.memberId, req.params.id);
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
      const { email, role } = req.body as { email: string; role?: string };
      if (!email) return res.status(400).json({ error: 'email is required' });

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

      // Send invitation email
      const baseUrl = `${req.protocol}://${req.get('host')}`;
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
      const invitations = await db.all("SELECT * FROM project_invitations WHERE project_id = ? AND status = 'pending' ORDER BY created_at DESC"
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
      const invitation = await db.all(`
        SELECT * FROM project_invitations
        WHERE token = ? AND status = 'pending' AND expires_at > datetime('now')
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
