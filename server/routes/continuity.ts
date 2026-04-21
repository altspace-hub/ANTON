/**
 * continuity.ts
 * Organisational Continuity (Improvement 5) — key-person risk profiles.
 * Maintains expertise and context continuity across staff changes.
 */

import { Router, Request, Response } from 'express';
import type { DatabaseAdapter } from '../db/database.js';

import { randomUUID } from 'crypto';

interface ContinuityProfile {
  id: string;
  profile_name: string;
  role: string;
  area_ids: string[];
  expertise_summary: string | null;
  active_projects: string[];
  key_decisions: string[];
  critical_knowledge: string | null;
  handover_notes: string | null;
  status: 'active' | 'transitioning' | 'archived';
  user_id: string;
  created_at: string;
  updated_at: string;
}

interface RawProfileRow {
  id: string;
  profile_name: string;
  role: string;
  area_ids: string;
  expertise_summary: string | null;
  active_projects: string;
  key_decisions: string;
  critical_knowledge: string | null;
  handover_notes: string | null;
  status: string;
  user_id: string;
  created_at: string;
  updated_at: string;
}

function parseProfile(row: RawProfileRow): ContinuityProfile {
  return {
    ...row,
    status: row.status as ContinuityProfile['status'],
    area_ids: JSON.parse(row.area_ids || '[]'),
    active_projects: JSON.parse(row.active_projects || '[]'),
    key_decisions: JSON.parse(row.key_decisions || '[]'),
  };
}

export async function createContinuityRoutes(db: DatabaseAdapter): Promise<Router> {
  const router = Router();

  function getUserId(req: Request): string {
    return (req as unknown as { user?: { id?: string } }).user?.id ?? 'default';
  }

  // ── List profiles ──────────────────────────────────────────────────────────
  router.get('/continuity/profiles', async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const status = req.query.status ? String(req.query.status) : undefined;

      let query = 'SELECT * FROM continuity_profiles WHERE user_id = ?';
      const params: (string)[] = [userId];
      if (status) { query += ' AND status = ?'; params.push(status); }
      query += ' ORDER BY updated_at DESC';

      const rows = await db.all(query, ...params) as RawProfileRow[];
      res.json({ profiles: rows.map(parseProfile) });
    } catch (err) {
      console.error('[continuity] list error:', err);
      res.status(500).json({ error: 'Failed to list profiles' });
    }
  });

  // ── Get profile ────────────────────────────────────────────────────────────
  router.get('/continuity/profiles/:id', async (req: Request, res: Response) => {
    try {
      const row = await db.get('SELECT * FROM continuity_profiles WHERE id = ?', String(req.params.id)) as RawProfileRow | undefined;
      if (!row) return res.status(404).json({ error: 'Profile not found' });
      res.json({ profile: parseProfile(row) });
    } catch (err) {
      res.status(500).json({ error: 'Failed to get profile' });
    }
  });

  // ── Create profile ─────────────────────────────────────────────────────────
  router.post('/continuity/profiles', async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const {
        profile_name, role, area_ids, expertise_summary,
        active_projects, key_decisions, critical_knowledge, handover_notes,
      } = req.body as Partial<ContinuityProfile>;

      if (!profile_name || !role) {
        return res.status(400).json({ error: 'profile_name and role are required' });
      }

      const id = randomUUID();
      const now = new Date().toISOString();

      await db.run(`
        INSERT INTO continuity_profiles
          (id, profile_name, role, area_ids, expertise_summary, active_projects,
           key_decisions, critical_knowledge, handover_notes, status, user_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)
      `, id, profile_name, role,
        JSON.stringify(area_ids ?? []),
        expertise_summary ?? null,
        JSON.stringify(active_projects ?? []),
        JSON.stringify(key_decisions ?? []),
        critical_knowledge ?? null,
        handover_notes ?? null,
        userId, now, now,);

      const created = await db.get('SELECT * FROM continuity_profiles WHERE id = ?', id) as RawProfileRow;
      res.status(201).json({ profile: parseProfile(created) });
    } catch (err) {
      console.error('[continuity] create error:', err);
      res.status(500).json({ error: 'Failed to create profile' });
    }
  });

  // ── Update profile ─────────────────────────────────────────────────────────
  router.put('/continuity/profiles/:id', async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const existing = await db.get('SELECT id FROM continuity_profiles WHERE id = ?', id);
      if (!existing) return res.status(404).json({ error: 'Profile not found' });

      const allowed = ['profile_name','role','area_ids','expertise_summary','active_projects','key_decisions','critical_knowledge','handover_notes','status'] as const;
      const updates: string[] = [];
      const values: unknown[] = [];

      for (const field of allowed) {
        if (req.body[field] !== undefined) {
          updates.push(`${field} = ?`);
          if (['area_ids','active_projects','key_decisions'].includes(field)) {
            values.push(JSON.stringify(req.body[field]));
          } else {
            values.push(req.body[field]);
          }
        }
      }

      if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
      updates.push("updated_at = NOW()");
      values.push(id);

      await db.run(`UPDATE continuity_profiles SET ${updates.join(', ')} WHERE id = ?`, ...values);
      const updated = await db.get('SELECT * FROM continuity_profiles WHERE id = ?', id) as RawProfileRow;
      res.json({ profile: parseProfile(updated) });
    } catch (err) {
      res.status(500).json({ error: 'Failed to update profile' });
    }
  });

  // ── Delete profile ─────────────────────────────────────────────────────────
  router.delete('/continuity/profiles/:id', async (req: Request, res: Response) => {
    try {

      if (result.changes === 0) return res.status(404).json({ error: 'Profile not found' });
      res.json({ deleted: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to delete profile' });
    }
  });

  /**
   * Build continuity context prompt for injection.
   * Used when active profiles have knowledge that should persist into new sessions.
   */
  router.get('/continuity/context-prompt', async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const areaId = req.query.area_id ? String(req.query.area_id) : undefined;

      let query = "SELECT * FROM continuity_profiles WHERE user_id = ? AND status IN ('active','transitioning')";
      const params: string[] = [userId];
      if (areaId) {
        query += " AND area_ids LIKE ?";
        params.push(`%${areaId}%`);
      }
      query += ' ORDER BY updated_at DESC LIMIT 3';


      const profiles = rows.map(parseProfile);

      if (profiles.length === 0) {
        return res.json({ prompt: '' });
      }

      const lines: string[] = ['## CONTINUITY CONTEXT'];
      lines.push('The following expertise and institutional knowledge is available from role continuity profiles:\n');

      for (const p of profiles) {
        lines.push(`**${p.profile_name} — ${p.role}**`);
        if (p.expertise_summary) lines.push(`Expertise: ${p.expertise_summary}`);
        if (p.key_decisions.length > 0) {
          lines.push(`Key Decisions Made: ${p.key_decisions.slice(0, 3).join('; ')}`);
        }
        if (p.critical_knowledge) lines.push(`Critical Knowledge: ${p.critical_knowledge}`);
        if (p.handover_notes) lines.push(`Handover Notes: ${p.handover_notes}`);
        lines.push('');
      }

      res.json({ prompt: lines.join('\n') });
    } catch (err) {
      res.status(500).json({ error: 'Failed to build continuity context' });
    }
  });

  return router;
}
