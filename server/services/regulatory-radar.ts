import type Database from 'better-sqlite3';

export function createRegulatoryRadar(db: Database.Database) {

  function getSources(activeOnly = true, category?: string) {
    let where = activeOnly ? 'WHERE is_active = 1' : 'WHERE 1=1';
    const args: unknown[] = [];
    if (category && category !== 'all') {
      where += ' AND category = ?';
      args.push(category);
    }
    return db.prepare(`SELECT * FROM radar_sources ${where} ORDER BY display_name`).all(...args);
  }

  function createSource(params: {
    displayName: string;
    url: string;
    sourceType: string;
    fetchIntervalHours?: number;
    areas?: string[];
    keywords?: string[];
    category?: string;
  }) {
    const id = `src_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
    db.prepare(`
      INSERT INTO radar_sources (id, display_name, url, source_type, fetch_interval_hours, areas, keywords, category)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, params.displayName, params.url, params.sourceType,
           params.fetchIntervalHours ?? 24,
           JSON.stringify(params.areas ?? []),
           JSON.stringify(params.keywords ?? []),
           params.category ?? 'regulatory');
    return id;
  }

  function getItems(params: {
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

    return db.prepare(`
      SELECT ri.*, rs.display_name as source_name, rs.source_type, rs.category as source_category
      FROM radar_items ri
      JOIN radar_sources rs ON ri.source_id = rs.id
      ${where}
      ORDER BY ri.relevance_score DESC, ri.published_at DESC
      LIMIT ? OFFSET ?
    `).all(...bindArgs);
  }

  function getRadarSummary() {
    const newItems = (db.prepare("SELECT COUNT(*) as n FROM radar_items WHERE status = 'new'").get() as { n: number }).n;
    const highRelevance = (db.prepare("SELECT COUNT(*) as n FROM radar_items WHERE relevance_score >= 0.7 AND status = 'new'").get() as { n: number }).n;
    const consultationsOpen = (db.prepare("SELECT COUNT(*) as n FROM radar_items WHERE item_type = 'consultation' AND status != 'dismissed' AND status != 'archived'").get() as { n: number }).n;
    const recent = db.prepare(`
      SELECT ri.title, ri.relevance_score, ri.item_type, ri.published_at, rs.display_name as source_name, ri.category
      FROM radar_items ri JOIN radar_sources rs ON ri.source_id = rs.id
      WHERE ri.status = 'new' AND ri.relevance_score >= 0.5
      ORDER BY ri.relevance_score DESC, ri.published_at DESC
      LIMIT 5
    `).all();

    // Per-category counts
    const categoryCounts = db.prepare(`
      SELECT category, COUNT(*) as count FROM radar_items
      WHERE status = 'new'
      GROUP BY category
    `).all() as Array<{ category: string; count: number }>;

    return { newItems, highRelevance, consultationsOpen, recentHighRelevance: recent, categoryCounts };
  }

  function updateItemStatus(id: string, status: string, userId?: string) {
    if (status === 'dismissed') {
      db.prepare(
        'UPDATE radar_items SET status = ?, dismissed_by = ?, dismissed_at = ? WHERE id = ?'
      ).run(status, userId ?? 'user', new Date().toISOString(), id);
    } else {
      db.prepare('UPDATE radar_items SET status = ? WHERE id = ?').run(status, id);
    }
  }

  function scoreItem(id: string, relevanceScore: number, urgencyScore: number, aiSummary: string, impactAreas: string[]) {
    db.prepare(`
      UPDATE radar_items
      SET relevance_score = ?, urgency_score = ?, ai_summary = ?, impact_areas = ?, ai_scored = 1
      WHERE id = ?
    `).run(relevanceScore, urgencyScore, aiSummary, JSON.stringify(impactAreas), id);
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
    db.prepare(`
      INSERT OR IGNORE INTO radar_items
        (id, source_id, external_id, title, summary, url, item_type, published_at, relevance_score)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0.7)
    `).run(id, params.sourceId, extId, params.title, params.summary,
           params.url ?? null, params.itemType ?? 'publication',
           params.publishedAt ?? new Date().toISOString());
    return id;
  }

  return {
    getSources, createSource, getItems, getRadarSummary,
    updateItemStatus, scoreItem, ingestManualItem,
  };
}
