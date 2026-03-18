import type { DatabaseAdapter } from '../db/database.js';

// ── Types ────────────────────────────────────────────────────────────────────

interface InvestigationRow {
  id: string;
  trigger_type: string;
  trigger_reference: string | null;
  title: string;
  question: string;
  status: string;
  assigned_consul: string | null;
  findings: string;
  atoms_created: string;
  process_improvements: string;
  root_cause: string | null;
  created_at: string;
  completed_at: string | null;
}

// ── Factory ──────────────────────────────────────────────────────────────────

export async function createMarketInvestigationService(db: DatabaseAdapter) {

  async function createInvestigation(params: {
    triggerType: string;
    triggerReference?: string;
    title: string;
    question: string;
    assignedConsul?: string;
  }) {
    const id = `minv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await db.run(`
      INSERT INTO market_investigation_tasks (id, trigger_type, trigger_reference, title, question, assigned_consul)
      VALUES (?, ?, ?, ?, ?, ?)
    `, id, params.triggerType, params.triggerReference ?? null,
       params.title, params.question, params.assignedConsul ?? null);
    return id;
  }

  async function getInvestigation(id: string) {
    return await db.get<InvestigationRow>('SELECT * FROM market_investigation_tasks WHERE id = ?', id);
  }

  async function listInvestigations(params: {
    status?: string;
    triggerType?: string;
    limit?: number;
  }) {
    let where = 'WHERE 1=1';
    const args: unknown[] = [];

    if (params.status) { where += ' AND status = ?'; args.push(params.status); }
    if (params.triggerType) { where += ' AND trigger_type = ?'; args.push(params.triggerType); }

    args.push(params.limit ?? 50);

    return await db.all<InvestigationRow>(
      `SELECT * FROM market_investigation_tasks ${where} ORDER BY created_at DESC LIMIT ?`, ...args
    );
  }

  async function updateInvestigation(id: string, updates: {
    status?: string;
    findings?: string[];
    atomsCreated?: string[];
    processImprovements?: string[];
    rootCause?: string;
  }) {
    const fields: string[] = [];
    const args: unknown[] = [];

    if (updates.status !== undefined) { fields.push('status = ?'); args.push(updates.status); }
    if (updates.findings !== undefined) { fields.push('findings = ?'); args.push(JSON.stringify(updates.findings)); }
    if (updates.atomsCreated !== undefined) { fields.push('atoms_created = ?'); args.push(JSON.stringify(updates.atomsCreated)); }
    if (updates.processImprovements !== undefined) { fields.push('process_improvements = ?'); args.push(JSON.stringify(updates.processImprovements)); }
    if (updates.rootCause !== undefined) { fields.push('root_cause = ?'); args.push(updates.rootCause); }

    if (updates.status === 'completed') {
      fields.push("completed_at = NOW()");
    }

    if (fields.length === 0) return;
    args.push(id);

    await db.run(`UPDATE market_investigation_tasks SET ${fields.join(', ')} WHERE id = ?`, ...args);
  }

  async function getInvestigationStats() {
    const open = await db.get<{ n: number }>("SELECT COUNT(*) as n FROM market_investigation_tasks WHERE status IN ('open', 'in_progress')");
    const completed = await db.get<{ n: number }>("SELECT COUNT(*) as n FROM market_investigation_tasks WHERE status = 'completed'");
    const byTrigger = await db.all<{ trigger_type: string; count: number }>(
      "SELECT trigger_type, COUNT(*) as count FROM market_investigation_tasks GROUP BY trigger_type ORDER BY count DESC"
    );
    const byRootCause = await db.all<{ root_cause: string; count: number }>(
      "SELECT root_cause, COUNT(*) as count FROM market_investigation_tasks WHERE root_cause IS NOT NULL GROUP BY root_cause ORDER BY count DESC"
    );

    return {
      open: open?.n ?? 0,
      completed: completed?.n ?? 0,
      byTrigger,
      byRootCause,
    };
  }

  return {
    createInvestigation,
    getInvestigation,
    listInvestigations,
    updateInvestigation,
    getInvestigationStats,
  };
}

export type MarketInvestigationService = Awaited<ReturnType<typeof createMarketInvestigationService>>;
