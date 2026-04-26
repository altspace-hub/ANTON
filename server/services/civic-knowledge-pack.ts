/**
 * civic-knowledge-pack.ts — bridge to the Knowledge Pack system for civic-domain content.
 *
 * Surfaces civic_knowledge_packs (mig 092) — bundled jurisdiction-specific
 * knowledge (forms, FAQs, regulatory references) that complements the
 * civic_process_packs declarative rules.
 *
 * Built per Phase B.1 — Civic pillar build-out.
 */

import type { DatabaseAdapter } from '../db/database.js';

export interface CivicKnowledgePack {
  id: string;
  jurisdiction: string;
  domain: string | null;
  title: string;
  description: string | null;
  source_url: string | null;
  pack_uri: string | null;
  created_at: string;
}

export async function createCivicKnowledgePackService(db: DatabaseAdapter) {

  async function listPacks(filter?: { jurisdiction?: string; domain?: string }): Promise<CivicKnowledgePack[]> {
    try {
      const conds: string[] = [];
      const args: unknown[] = [];
      if (filter?.jurisdiction) { conds.push(`jurisdiction = ?`); args.push(filter.jurisdiction); }
      if (filter?.domain)       { conds.push(`domain = ?`);       args.push(filter.domain); }
      const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
      return await db.all<CivicKnowledgePack>(
        `SELECT id, jurisdiction, domain, title, description, source_url, pack_uri, created_at
           FROM civic_knowledge_packs ${where}
           ORDER BY jurisdiction, domain`,
        ...args,
      );
    } catch {
      // Table layout varies across deployments; degrade gracefully.
      return [];
    }
  }

  async function getPack(id: string): Promise<CivicKnowledgePack | null> {
    try {
      return await db.get<CivicKnowledgePack>(
        `SELECT id, jurisdiction, domain, title, description, source_url, pack_uri, created_at
           FROM civic_knowledge_packs WHERE id = ?`,
        id,
      ) ?? null;
    } catch {
      return null;
    }
  }

  return { listPacks, getPack };
}

export type CivicKnowledgePackService = Awaited<ReturnType<typeof createCivicKnowledgePackService>>;
