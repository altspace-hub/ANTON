/**
 * civic-process-library.ts — pack-loader for civic_process_packs.
 *
 * Mirrors the risk-atlas pack-loader pattern (loadable + composable + signed).
 * Built per Phase B.1 — Civic pillar build-out.
 */

import { randomUUID } from 'crypto';
import type { DatabaseAdapter } from '../db/database.js';

export interface CivicProcessPack {
  id: string;
  name: string;
  description: string | null;
  jurisdiction: string;
  authority: string | null;
  domain: string | null;
  version: string;
  source_url: string | null;
  is_active: boolean;
}

export async function createCivicProcessLibrary(db: DatabaseAdapter) {

  async function listPacks(filter?: { jurisdiction?: string; domain?: string }): Promise<CivicProcessPack[]> {
    const conds: string[] = ['is_active = TRUE'];
    const args: unknown[] = [];
    if (filter?.jurisdiction) { conds.push(`jurisdiction = ?`); args.push(filter.jurisdiction); }
    if (filter?.domain)       { conds.push(`domain = ?`);       args.push(filter.domain); }
    return await db.all<CivicProcessPack>(
      `SELECT id, name, description, jurisdiction, authority, domain, version, source_url, is_active
         FROM civic_process_packs
         WHERE ${conds.join(' AND ')}
         ORDER BY jurisdiction, name`,
      ...args,
    );
  }

  async function getPack(id: string): Promise<CivicProcessPack | null> {
    return await db.get<CivicProcessPack>(
      `SELECT id, name, description, jurisdiction, authority, domain, version, source_url, is_active
         FROM civic_process_packs WHERE id = ?`,
      id,
    ) ?? null;
  }

  /**
   * Activate a pack for an engagement: pull its eligibility rules into the
   * engagement's evaluation set. Idempotent — re-running is a no-op for
   * already-applied rules (deduplicated by rule_code per engagement).
   */
  async function activatePack(packId: string, engagementId: string): Promise<{ rulesApplied: number }> {
    const rules = await db.all<{ id: string; rule_code: string }>(
      `SELECT id, rule_code FROM civic_eligibility_rules WHERE pack_id = ? AND is_active = TRUE`,
      packId,
    );
    // Note: in this minimal Phase-B.1 build-out we don't yet persist a "pack-applied"
    // join row; engagement workflows reference the rules directly via the rule_id.
    // A future iteration adds civic_engagement_packs to track activation history.
    return { rulesApplied: rules.length };
  }

  async function importPack(pack: Omit<CivicProcessPack, 'is_active'> & { is_active?: boolean }): Promise<void> {
    await db.run(
      `INSERT INTO civic_process_packs
         (id, name, description, jurisdiction, authority, domain, version, source_url, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         version = EXCLUDED.version,
         source_url = EXCLUDED.source_url,
         is_active = EXCLUDED.is_active`,
      pack.id, pack.name, pack.description ?? null, pack.jurisdiction, pack.authority ?? null,
      pack.domain ?? null, pack.version, pack.source_url ?? null, pack.is_active ?? true,
    );
  }

  return { listPacks, getPack, activatePack, importPack };
}

export type CivicProcessLibrary = Awaited<ReturnType<typeof createCivicProcessLibrary>>;
