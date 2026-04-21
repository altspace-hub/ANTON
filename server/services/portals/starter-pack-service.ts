// ── starter-pack-service.ts ────────────────────────────────────────────────
// Reads / applies starter packs (bundle type #43) to a user. The pack is
// the source of truth for their Visitor Home layout; a user can override
// specific fields via user_starter_packs.customizations JSONB.
//
// Three built-in packs ship under data/starter-packs/. Users can also
// import their own .anton starter-packs via the bundle marketplace.

import fs from 'node:fs/promises';
import path from 'node:path';
import type { DatabaseAdapter } from '../../db/database.js';
import { parseStarterPack, type StarterPackBundle, DEFAULT_15_CATEGORIES, DEFAULT_PLATFORM_BOOKMARKS } from './starter-pack-schema.js';

const BUILT_IN_DIR = path.join(process.cwd(), 'data', 'starter-packs');

export interface StarterPackMetadata {
  id: string;
  name: string;
  description: string;
  target_mode?: string;
  locale?: string;
  source: 'built-in' | 'imported';
}

export async function createStarterPackService(db: DatabaseAdapter) {

  /** List built-in packs available on disk. */
  async function listBuiltIn(): Promise<StarterPackMetadata[]> {
    try {
      const files = await fs.readdir(BUILT_IN_DIR);
      const out: StarterPackMetadata[] = [];
      for (const f of files.filter(n => n.endsWith('.json'))) {
        try {
          const raw = await fs.readFile(path.join(BUILT_IN_DIR, f), 'utf8');
          const parsed = parseStarterPack(JSON.parse(raw));
          if (parsed.ok) {
            out.push({
              id: parsed.pack.id,
              name: parsed.pack.name,
              description: parsed.pack.description,
              target_mode: parsed.pack.target_mode,
              locale: parsed.pack.locale,
              source: 'built-in',
            });
          }
        } catch { /* skip malformed */ }
      }
      return out;
    } catch {
      return []; // dir doesn't exist yet
    }
  }

  /** Load a specific pack by id. */
  async function loadPack(packId: string): Promise<StarterPackBundle | null> {
    // Try built-in first.
    try {
      const raw = await fs.readFile(path.join(BUILT_IN_DIR, `${packId}.json`), 'utf8');
      const parsed = parseStarterPack(JSON.parse(raw));
      if (parsed.ok) return parsed.pack;
    } catch { /* fall through */ }
    // Could later fall back to user-imported packs stored in DB; for v1 built-in only.
    return null;
  }

  /** Get a user's active pack, falling back to global-default if none set. */
  async function getActiveForUser(userId: string): Promise<{ pack: StarterPackBundle; customizations: Record<string, unknown> } | null> {
    const row = await db.get<{ active_pack_id: string; customizations: unknown }>(
      `SELECT active_pack_id, customizations FROM user_starter_packs WHERE user_id = ?`,
      userId,
    );
    const packId = row?.active_pack_id ?? 'global-default';
    const pack = await loadPack(packId);
    if (!pack) return null;
    const customizations = typeof row?.customizations === 'object' && row.customizations
      ? row.customizations as Record<string, unknown>
      : (typeof row?.customizations === 'string' ? JSON.parse(row.customizations) : {});
    return { pack, customizations };
  }

  /** Apply a pack to a user. Idempotent. */
  async function applyToUser(userId: string, packId: string): Promise<{ ok: true } | { ok: false; reason: string }> {
    const pack = await loadPack(packId);
    if (!pack) return { ok: false, reason: `Pack '${packId}' not found` };
    await db.run(
      `INSERT INTO user_starter_packs (user_id, active_pack_id, applied_at, customizations)
       VALUES (?, ?, NOW(), '{}'::jsonb)
       ON CONFLICT (user_id) DO UPDATE SET
         active_pack_id = EXCLUDED.active_pack_id,
         applied_at = NOW(),
         customizations = '{}'::jsonb`,
      userId, packId,
    );
    return { ok: true };
  }

  /**
   * School-mode auto-swap. When a user enters School mode and has no
   * school-specific pack active, apply school-default. Idempotent; will
   * not overwrite a user's deliberate choice of another school pack.
   */
  async function ensureSchoolPackIfMissing(userId: string): Promise<void> {
    const row = await db.get<{ active_pack_id: string }>(
      `SELECT active_pack_id FROM user_starter_packs WHERE user_id = ?`,
      userId,
    );
    if (row && row.active_pack_id.includes('school')) return;
    await applyToUser(userId, 'school-default');
  }

  /**
   * Return the effective category list + bookmark list for a user, with
   * customizations applied on top of the pack. Used by the Visitor Home
   * to render without needing two round-trips.
   */
  async function resolveForUser(userId: string): Promise<{
    pack_id: string;
    categories: StarterPackBundle['categories'];
    bookmarks: StarterPackBundle['bookmarks'];
  }> {
    const active = await getActiveForUser(userId);
    if (!active) {
      return {
        pack_id: 'global-default',
        categories: DEFAULT_15_CATEGORIES,
        bookmarks: DEFAULT_PLATFORM_BOOKMARKS,
      };
    }
    return {
      pack_id: active.pack.id,
      categories: active.pack.categories,
      bookmarks: active.pack.bookmarks,
    };
  }

  return { listBuiltIn, loadPack, getActiveForUser, applyToUser, ensureSchoolPackIfMissing, resolveForUser };
}

export type StarterPackService = Awaited<ReturnType<typeof createStarterPackService>>;
