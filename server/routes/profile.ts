import { Router, type Request, type Response } from 'express';
import type { DatabaseAdapter } from '../db/database.js';
import { isTeamMode } from '../middleware/role-guards.js';

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

/**
 * ── One profile per person in team mode (B4, team isolation 2026-09-23) ──────
 *
 * user_profiles began as a singleton: one row, id='default', read and written by
 * everyone. The Layer-0 block of every system prompt is built from it, so on a
 * shared server each user saw a colleague's name, role and focus in their own runs,
 * and any viewer could plant standing instructions (communication_preferences,
 * team_context) in everybody's prompts.
 *
 * Now the row is chosen by deployment mode:
 *   - solo: still 'default'. One human; their existing profile must not vanish.
 *   - team: the caller's user id. A person who has not filled in a profile gets the
 *     empty one — never the 'default' row, which on an instance that started in solo
 *     holds the original owner's personal details.
 *
 * brand_config is the exception and stays instance-wide on the 'default' row: it is
 * the house style that export.ts, renderer-registry.ts and presentations.ts apply to
 * every document the server produces, and it never reaches a prompt. One brand per
 * organisation is the point of a brand, so in team mode only an admin may change it
 * (personal rows never carry one). Every other field — including organisation and
 * company — is part of how the model addresses one person, so it is per person.
 *
 * The personal fields of the 'default' row still have readers in team mode: the
 * instance's community capability card (capability-card-generator.ts publishes its
 * role_title, organisation, expertise and focus_areas) and the organisation fallback
 * on generated decks (presentations.ts). With PUT /profile writing only the caller's
 * row, nobody could change them any more, so `?scope=instance` reads and writes that
 * row directly — admins only in team mode, because it is instance-wide and, on an
 * instance that began in solo, still holds the original owner's personal details.
 * In solo the parameter changes nothing: the caller's row already is 'default'.
 */
export const INSTANCE_PROFILE_ID = 'default';

/**
 * The user_profiles row that holds this caller's personal (Layer-0) profile, or null
 * when there is none to read (team mode without an identity).
 */
export function profileRowId(user: { id?: string } | undefined): string | null {
  if (!isTeamMode()) return INSTANCE_PROFILE_ID;
  const id = user?.id;
  // A team account can never alias the instance row — that would hand one person
  // the brand row and everyone's old solo profile.
  if (!id || id === INSTANCE_PROFILE_ID) return null;
  return id;
}

/**
 * The caller's Layer-0 profile for the prompt composer. Every prompt-building route
 * reads it through here, so no route can fall back to the shared row by accident.
 */
export async function loadLayer0Profile(
  db: DatabaseAdapter,
  req: { user?: { id?: string } },
): Promise<Record<string, string | null> | undefined> {
  const id = profileRowId(req.user);
  if (!id) return undefined;
  return await db.get<Record<string, string | null>>('SELECT * FROM user_profiles WHERE id = ?', id);
}

function emptyProfile(id: string): Omit<UserProfile, 'updated_at'> {
  return {
    id,
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
  };
}

const UPSERT_PROFILE_SQL = `
        INSERT INTO user_profiles (id, name, role, company, industry, expertise, experience_level, communication_preferences, team_context, current_focus, display_name, role_title, organisation, jurisdiction, output_language, org_size, focus_areas, hourly_rate_eur, brand_config, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
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
          updated_at = NOW()
      `;

/** The personal columns of a PUT body, in UPSERT_PROFILE_SQL order (after id, before brand_config). */
function personalParams(body: Record<string, unknown>): unknown[] {
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
  } = body;
  return [
    name || null,
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
  ];
}

export async function createProfileRoutes(db: DatabaseAdapter) {
  const router = Router();

  async function instanceBrand(): Promise<string | null> {
    const row = await db.get<{ brand_config: string | null }>(
      'SELECT brand_config FROM user_profiles WHERE id = ?', INSTANCE_PROFILE_ID,
    );
    return row?.brand_config ?? null;
  }

  /**
   * Which row a `?scope=instance` request addresses in team mode: 'instance' for an
   * admin, 'refused' once a 401/403 has been sent, 'caller' otherwise — no parameter,
   * or solo mode, where the plain route already serves the 'default' row.
   */
  function instanceScope(req: Request, res: Response): 'instance' | 'caller' | 'refused' {
    if (req.query.scope !== 'instance' || !isTeamMode()) return 'caller';
    if (!req.user?.id) { res.status(401).json({ error: 'Authentication required' }); return 'refused'; }
    if (req.user.role !== 'admin') { res.status(403).json({ error: 'Admin access required' }); return 'refused'; }
    return 'instance';
  }

  // GET /api/profile — the caller's profile (solo: the single 'default' row)
  // GET /api/profile?scope=instance — the instance row (team: admins only)
  router.get('/profile', async (req, res) => {
    try {
      const scope = instanceScope(req, res);
      if (scope === 'refused') return;
      if (scope === 'instance') {
        const row = await db.get<UserProfile>('SELECT * FROM user_profiles WHERE id = ?', INSTANCE_PROFILE_ID);
        res.json(row ?? emptyProfile(INSTANCE_PROFILE_ID));
        return;
      }

      if (isTeamMode()) {
        const id = profileRowId(req.user);
        if (!id) { res.status(401).json({ error: 'Authentication required' }); return; }
        const own = await db.get<UserProfile>('SELECT * FROM user_profiles WHERE id = ?', id);
        // The brand is shown to everyone (it styles their exports) but is not theirs.
        res.json({ ...(own ?? emptyProfile(id)), brand_config: await instanceBrand() });
        return;
      }

      const profile = await db.get('SELECT * FROM user_profiles WHERE id = ?', 'default') as UserProfile | undefined;
      res.json(profile || emptyProfile('default'));
    } catch {
      res.status(500).json({ error: 'Failed to fetch profile' });
    }
  });

  // PUT /api/profile — upsert the caller's profile (solo: the single 'default' row)
  // PUT /api/profile?scope=instance — upsert the instance row (team: admins only)
  router.put('/profile', async (req, res) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;

      const scope = instanceScope(req, res);
      if (scope === 'refused') return;
      if (scope === 'instance') {
        // The brand lives on this row too. A body that leaves brand_config out keeps
        // the current one — the upsert writes every column, so it must be re-sent.
        const brandSent = Object.prototype.hasOwnProperty.call(body, 'brand_config');
        const brand = brandSent ? ((body.brand_config as string | null | undefined) || null) : await instanceBrand();
        await db.run(UPSERT_PROFILE_SQL, INSTANCE_PROFILE_ID, ...personalParams(body), brand);
        const updated = await db.get<UserProfile>('SELECT * FROM user_profiles WHERE id = ?', INSTANCE_PROFILE_ID);
        res.json(updated ?? emptyProfile(INSTANCE_PROFILE_ID));
        return;
      }

      if (isTeamMode()) {
        const id = profileRowId(req.user);
        if (!id) { res.status(401).json({ error: 'Authentication required' }); return; }

        // The Settings brand panel PUTs the whole profile with brand_config changed;
        // the profile forms echo it back or leave it out. Only a CHANGE is refused
        // for a non-admin, so their own profile keeps saving either way.
        const brandSent = Object.prototype.hasOwnProperty.call(body, 'brand_config');
        const sentBrand = (body.brand_config as string | null | undefined) || null;
        const currentBrand = await instanceBrand();
        const changesBrand = brandSent && sentBrand !== currentBrand;
        if (changesBrand && req.user?.role !== 'admin') {
          res.status(403).json({ error: 'Only an administrator can change the organisation brand.' });
          return;
        }

        await db.transaction(async (tx) => {
          // Personal rows never carry a brand — it lives on the instance row only.
          await tx.run(UPSERT_PROFILE_SQL, id, ...personalParams(body), null);
          if (changesBrand) {
            await tx.run(
              `INSERT INTO user_profiles (id, brand_config, updated_at) VALUES (?, ?, NOW())
               ON CONFLICT(id) DO UPDATE SET brand_config = excluded.brand_config, updated_at = NOW()`,
              INSTANCE_PROFILE_ID, sentBrand,
            );
          }
        });

        const updated = await db.get<UserProfile>('SELECT * FROM user_profiles WHERE id = ?', id);
        res.json({ ...(updated ?? emptyProfile(id)), brand_config: await instanceBrand() });
        return;
      }

      await db.run(UPSERT_PROFILE_SQL, 'default', ...personalParams(body), body.brand_config || null);

      const updated = await db.get('SELECT * FROM user_profiles WHERE id = ?', 'default');
      res.json(updated);
    } catch {
      res.status(500).json({ error: 'Failed to save profile' });
    }
  });

  return router;
}
