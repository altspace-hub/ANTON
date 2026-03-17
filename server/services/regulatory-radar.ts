import type { DatabaseAdapter } from '../db/database.js';

import { emitInternalEvent } from './event-emitter.js';

export async function createRegulatoryRadar(db: DatabaseAdapter) {

  async function getSources(activeOnly = true, category?: string) {
    let where = activeOnly ? 'WHERE is_active = 1' : 'WHERE 1=1';
    const args: unknown[] = [];
    if (category && category !== 'all') {
      where += ' AND category = ?';
      args.push(category);
    }
    return await db.all(`SELECT * FROM radar_sources ${where} ORDER BY display_name`, ...args);
  }

  async function createSource(params: {
    displayName: string;
    url: string;
    sourceType: string;
    fetchIntervalHours?: number;
    areas?: string[];
    keywords?: string[];
    category?: string;
  }) {
    const id = `src_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
    await db.run(`
      INSERT INTO radar_sources (id, display_name, url, source_type, fetch_interval_hours, areas, keywords, category)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, id, params.displayName, params.url, params.sourceType,
           params.fetchIntervalHours ?? 24,
           JSON.stringify(params.areas ?? []),
           JSON.stringify(params.keywords ?? []),
           params.category ?? 'regulatory');
    return id;
  }

  async function getItems(params: {
    status?: string;
    minRelevance?: number;
    limit?: number;
    offset?: number;
    search?: string;
    areas?: string[];
    category?: string;
  }) {
    let where = 'WHERE ri.status != \'archived\'';
    const bindArgs: unknown[] = [];

    if (params.status) { where += ' AND ri.status = ?'; bindArgs.push(params.status); }
    if (params.minRelevance) { where += ' AND ri.relevance_score >= ?'; bindArgs.push(params.minRelevance); }
    if (params.category && params.category !== 'all') { where += ' AND ri.category = ?'; bindArgs.push(params.category); }
    if (params.search) {
      where += ' AND (ri.title LIKE ? OR ri.summary LIKE ? OR ri.ai_summary LIKE ?)';
      const s = `%${params.search}%`;
      bindArgs.push(s, s, s);
    }

    bindArgs.push(params.limit ?? 50, params.offset ?? 0);

    return await db.all(`
      SELECT ri.*, rs.display_name as source_name, rs.source_type, rs.category as source_category
      FROM radar_items ri
      JOIN radar_sources rs ON ri.source_id = rs.id
      ${where}
      ORDER BY ri.relevance_score DESC, ri.published_at DESC
      LIMIT ? OFFSET ?
    `, ...bindArgs);
  }

  async function getRadarSummary() {
    const newItems = (await db.get("SELECT COUNT(*) as n FROM radar_items WHERE status = 'new'") as { n: number }).n;
    const highRelevance = (await db.get("SELECT COUNT(*) as n FROM radar_items WHERE relevance_score >= 0.7 AND status = 'new'") as { n: number }).n;
    const consultationsOpen = (await db.get("SELECT COUNT(*) as n FROM radar_items WHERE item_type = 'consultation' AND status != 'dismissed' AND status != 'archived'") as { n: number }).n;


    // Recent high-relevance items (last 7 days)
    const recent = await db.all(
      "SELECT title, relevance_score, item_type, source_id, published_at FROM radar_items WHERE relevance_score >= 0.7 AND fetched_at >= datetime('now', '-7 days') ORDER BY relevance_score DESC LIMIT 5"
    ) as Array<{ title: string; relevance_score: number; item_type: string; source_id: string; published_at: string }>;

    // Per-category counts
    const categoryCounts = await db.all(`
      SELECT category, COUNT(*) as count FROM radar_items
      WHERE status = 'new'
      GROUP BY category
    `) as Array<{ category: string; count: number }>;

    return { newItems, highRelevance, consultationsOpen, recentHighRelevance: recent, categoryCounts };
  }

  async function updateItemStatus(id: string, status: string, userId?: string) {
    if (status === 'dismissed') {
      await db.run('UPDATE radar_items SET status = ?, dismissed_by = ?, dismissed_at = ? WHERE id = ?'
      , status, userId ?? 'user', new Date().toISOString(), id);
    } else {
      await db.run('UPDATE radar_items SET status = ? WHERE id = ?', status, id);
    }
  }

  async function scoreItem(id: string, relevanceScore: number, urgencyScore: number, aiSummary: string, impactAreas: string[]) {
    await db.run(`
      UPDATE radar_items
      SET relevance_score = ?, urgency_score = ?, ai_summary = ?, impact_areas = ?, ai_scored = 1
      WHERE id = ?
    `, relevanceScore, urgencyScore, aiSummary, JSON.stringify(impactAreas), id);

    // Emit internal event for high-relevance items so event triggers can fire
    if (relevanceScore >= 0.7 || urgencyScore >= 0.8) {
      void emitInternalEvent('regulatory_radar', {
        event_type: 'item_scored',
        radar_item_id: id,
        relevance_score: relevanceScore,
        urgency_score: urgencyScore,
        severity: urgencyScore >= 0.9 ? 'critical' : urgencyScore >= 0.7 ? 'high' : 'medium',
        impact_areas: impactAreas,
      });
    }
  }

  async function ingestManualItem(params: {
    sourceId: string;
    title: string;
    summary: string;
    url?: string;
    itemType?: string;
    publishedAt?: string;
  }) {
    const id = `ri_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
    const extId = `manual_${Date.now()}`;
    await db.run(`
      INSERT OR IGNORE INTO radar_items
        (id, source_id, external_id, title, summary, url, item_type, published_at, relevance_score)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0.7)
    `, id, params.sourceId, extId, params.title, params.summary,
           params.url ?? null, params.itemType ?? 'publication',
           params.publishedAt ?? new Date().toISOString());

    void emitInternalEvent('regulatory_radar', {
      event_type: 'item_ingested',
      radar_item_id: id,
      title: params.title,
      source_id: params.sourceId,
      item_type: params.itemType ?? 'publication',
      severity: 'medium',
    });

    return id;
  }

  async function updateSource(id: string, params: {
    displayName?: string;
    url?: string;
    sourceType?: string;
    areas?: string[];
    keywords?: string[];
    category?: string;
    isActive?: boolean;
  }) {
    await db.run(`
      UPDATE radar_sources SET
        display_name = COALESCE(?, display_name),
        url = COALESCE(?, url),
        source_type = COALESCE(?, source_type),
        areas = COALESCE(?, areas),
        keywords = COALESCE(?, keywords),
        category = COALESCE(?, category),
        is_active = COALESCE(?, is_active)
      WHERE id = ?
    `, 
      params.displayName ?? null,
      params.url ?? null,
      params.sourceType ?? null,
      params.areas !== undefined ? JSON.stringify(params.areas) : null,
      params.keywords !== undefined ? JSON.stringify(params.keywords) : null,
      params.category ?? null,
      params.isActive !== undefined ? (params.isActive ? 1 : 0) : null,
      id,
    );
  }

  async function deleteSource(id: string) {
    await db.run('DELETE FROM radar_sources WHERE id = ?', id);
  }

  return {
    getSources, createSource, updateSource, deleteSource,
    getItems, getRadarSummary,
    updateItemStatus, scoreItem, ingestManualItem,
  };
}
