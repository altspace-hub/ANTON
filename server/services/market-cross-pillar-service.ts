import type { DatabaseAdapter } from '../db/database.js';

// ── Types ────────────────────────────────────────────────────────────────────

interface CrossPillarRef {
  id: number;
  market_entity_type: string;
  market_entity_id: string;
  external_type: string;
  external_id: string;
  relationship: string;
  notes: string | null;
  created_at: string;
}

interface CrossPillarRefWithDetails extends CrossPillarRef {
  market_entity_name?: string;
  external_name?: string;
}

// ── Factory ──────────────────────────────────────────────────────────────────

export async function createMarketCrossPillarService(db: DatabaseAdapter) {

  async function linkEntities(params: {
    marketEntityType: string;
    marketEntityId: string;
    externalType: string;
    externalId: string;
    relationship?: string;
    notes?: string;
  }): Promise<CrossPillarRef> {
    const { marketEntityType, marketEntityId, externalType, externalId, relationship = 'related', notes } = params;

    await db.run(`
      INSERT INTO market_cross_pillar_refs (market_entity_type, market_entity_id, external_type, external_id, relationship, notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `, marketEntityType, marketEntityId, externalType, externalId, relationship, notes ?? null);

    const ref = await db.get<CrossPillarRef>(
      'SELECT * FROM market_cross_pillar_refs WHERE market_entity_id = ? AND external_id = ? AND relationship = ?',
      marketEntityId, externalId, relationship
    );
    return ref!;
  }

  async function unlinkEntities(marketEntityId: string, externalId: string, relationship?: string): Promise<void> {
    if (relationship) {
      await db.run(
        'DELETE FROM market_cross_pillar_refs WHERE market_entity_id = ? AND external_id = ? AND relationship = ?',
        marketEntityId, externalId, relationship
      );
    } else {
      await db.run(
        'DELETE FROM market_cross_pillar_refs WHERE market_entity_id = ? AND external_id = ?',
        marketEntityId, externalId
      );
    }
  }

  async function getRefsForMarketEntity(entityType: string, entityId: string): Promise<CrossPillarRef[]> {
    return await db.all<CrossPillarRef>(
      'SELECT * FROM market_cross_pillar_refs WHERE market_entity_type = ? AND market_entity_id = ? ORDER BY created_at DESC',
      entityType, entityId
    );
  }

  async function getRefsForExternal(externalType: string, externalId: string): Promise<CrossPillarRef[]> {
    return await db.all<CrossPillarRef>(
      'SELECT * FROM market_cross_pillar_refs WHERE external_type = ? AND external_id = ? ORDER BY created_at DESC',
      externalType, externalId
    );
  }

  async function getRefsWithDetails(entityType: string, entityId: string): Promise<CrossPillarRefWithDetails[]> {
    const refs = await getRefsForMarketEntity(entityType, entityId);
    const results: CrossPillarRefWithDetails[] = [];

    for (const ref of refs) {
      let marketName: string | undefined;
      let externalName: string | undefined;

      // Resolve market entity name
      if (ref.market_entity_type === 'thesis') {
        const t = await db.get<{ title: string }>('SELECT title FROM market_theses WHERE id = ?', ref.market_entity_id);
        marketName = t?.title;
      } else if (ref.market_entity_type === 'index') {
        const i = await db.get<{ name: string }>('SELECT name FROM market_indexes WHERE id = ?', ref.market_entity_id);
        marketName = i?.name;
      } else if (ref.market_entity_type === 'investigation') {
        const inv = await db.get<{ title: string }>('SELECT title FROM market_investigations WHERE id = ?', ref.market_entity_id);
        marketName = inv?.title;
      }

      // Resolve external entity name
      if (ref.external_type === 'engagement') {
        const e = await db.get<{ name: string }>('SELECT name FROM engagements WHERE id = ?', ref.external_id);
        externalName = e?.name;
      } else if (ref.external_type === 'project') {
        const p = await db.get<{ name: string }>('SELECT name FROM projects WHERE id = ?', ref.external_id);
        externalName = p?.name;
      } else if (ref.external_type === 'session') {
        const s = await db.get<{ title: string }>('SELECT title FROM sessions WHERE id = ?', ref.external_id);
        externalName = s?.title;
      }

      results.push({ ...ref, market_entity_name: marketName, external_name: externalName });
    }

    return results;
  }

  return {
    linkEntities,
    unlinkEntities,
    getRefsForMarketEntity,
    getRefsForExternal,
    getRefsWithDetails,
  };
}

export type MarketCrossPillarService = Awaited<ReturnType<typeof createMarketCrossPillarService>>;
