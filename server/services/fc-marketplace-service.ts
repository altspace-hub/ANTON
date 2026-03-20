import type { DatabaseAdapter } from '../db/database.js';

export async function createFCMarketplaceService(db: DatabaseAdapter) {
  async function listServices(activeOnly = true) {
    const where = activeOnly ? 'WHERE is_active = TRUE' : '';
    return await db.all(`SELECT * FROM fc_service_listings ${where} ORDER BY total_completions DESC, created_at DESC`);
  }
  async function getService(id: string) { return await db.get('SELECT * FROM fc_service_listings WHERE id = ?', id); }

  async function createService(params: {
    moduleId: string; title: string; description: string; priceFtc: number;
    pricingModel?: string; qualityThresholdFull?: number; qualityThresholdPartial?: number;
    partialPayPercent?: number; maxTurnaroundHours?: number;
  }) {
    const id = `fcs_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await db.run(`INSERT INTO fc_service_listings (id, module_id, title, description, price_ftc, pricing_model,
      quality_threshold_full, quality_threshold_partial, partial_pay_percent, max_turnaround_hours)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id, params.moduleId, params.title, params.description, params.priceFtc,
      params.pricingModel ?? 'fixed', params.qualityThresholdFull ?? 8.0,
      params.qualityThresholdPartial ?? 6.0, params.partialPayPercent ?? 50,
      params.maxTurnaroundHours ?? 24);
    return id;
  }

  async function toggleService(id: string, active: boolean) {
    await db.run('UPDATE fc_service_listings SET is_active = ?, updated_at = NOW() WHERE id = ?', active, id);
  }
  async function deleteService(id: string) { await db.run('DELETE FROM fc_service_listings WHERE id = ?', id); }

  async function recordCompletion(id: string, qualityScore: number, revenueFtc: number) {
    await db.run(`UPDATE fc_service_listings SET total_completions = total_completions + 1,
      avg_quality_score = COALESCE((avg_quality_score * total_completions + ?) / (total_completions + 1), ?),
      total_revenue_ftc = total_revenue_ftc + ?, updated_at = NOW() WHERE id = ?`,
      qualityScore, qualityScore, revenueFtc, id);
  }

  return { listServices, getService, createService, toggleService, deleteService, recordCompletion };
}
export type FCMarketplaceService = Awaited<ReturnType<typeof createFCMarketplaceService>>;
