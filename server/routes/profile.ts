import { Router } from 'express';
import type { DatabaseAdapter } from '../db/database.js';

export interface UserProfile {
  id: string;
  name: string | null;
  role: string | null;
  company: string | null;
  industry: string | null;
  expertise: string | null;
  experience_level: string | null;
  communication_preferences: string | null;
  team_context: string | null;
  current_focus: string | null;
  display_name: string | null;
  role_title: string | null;
  organisation: string | null;
  jurisdiction: string | null;
  output_language: string | null;
  org_size: string | null;
  focus_areas: string | null;
  hourly_rate_eur: number | null;
  brand_config: string | null;
  updated_at: string;
}

export async function createProfileRoutes(db: DatabaseAdapter) {
  const router = Router();

  // GET /api/profile — fetch the single user profile
  router.get('/profile', async (req, res) => {
    try {
      const profile = await db.get('SELECT * FROM user_profiles WHERE id = ?', 'default') as UserProfile | undefined;
      res.json(
        profile || {
          id: 'default',
          name: null,
          role: null,
          company: null,
          industry: null,
          expertise: null,
          experience_level: null,
          communication_preferences: null,
          team_context: null,
          current_focus: null,
          display_name: '',
          role_title: '',
          organisation: '',
          jurisdiction: '',
          output_language: 'en',
          org_size: 'mid-market',
          focus_areas: '[]',
          hourly_rate_eur: 250,
          brand_config: null,
        }
      );
    } catch {
      res.status(500).json({ error: 'Failed to fetch profile' });
    }
  });

  // PUT /api/profile — upsert the profile
  router.put('/profile', async (req, res) => {
    try {
      const {
        name,
        role,
        company,
        industry,
        expertise,
        experience_level,
        communication_preferences,
        team_context,
        current_focus,
        display_name,
        role_title,
        organisation,
        jurisdiction,
        output_language,
        org_size,
        focus_areas,
        hourly_rate_eur,
        brand_config,
      } = req.body;

      await db.run(`
        INSERT INTO user_profiles (id, name, role, company, industry, expertise, experience_level, communication_preferences, team_context, current_focus, display_name, role_title, organisation, jurisdiction, output_language, org_size, focus_areas, hourly_rate_eur, brand_config, updated_at)
        VALUES ('default', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          role = excluded.role,
          company = excluded.company,
          industry = excluded.industry,
          expertise = excluded.expertise,
          experience_level = excluded.experience_level,
          communication_preferences = excluded.communication_preferences,
          team_context = excluded.team_context,
          current_focus = excluded.current_focus,
          display_name = excluded.display_name,
          role_title = excluded.role_title,
          organisation = excluded.organisation,
          jurisdiction = excluded.jurisdiction,
          output_language = excluded.output_language,
          org_size = excluded.org_size,
          focus_areas = excluded.focus_areas,
          hourly_rate_eur = excluded.hourly_rate_eur,
          brand_config = excluded.brand_config,
          updated_at = datetime('now')
      `, name || null,
        role || null,
        company || null,
        industry || null,
        expertise || null,
        experience_level || null,
        communication_preferences || null,
        team_context || null,
        current_focus || null,
        display_name ?? '',
        role_title ?? '',
        organisation ?? '',
        jurisdiction ?? '',
        output_language ?? 'en',
        org_size ?? 'mid-market',
        focus_areas ?? '[]',
        typeof hourly_rate_eur === 'number' ? hourly_rate_eur : 250,
        brand_config || null);

      const updated = await db.get('SELECT * FROM user_profiles WHERE id = ?', 'default');
      res.json(updated);
    } catch {
      res.status(500).json({ error: 'Failed to save profile' });
    }
  });

  return router;
}
