import type { DatabaseAdapter } from '../db/database.js';

// ── Types ────────────────────────────────────────────────────────────────────

interface PartitionConfig {
  tableName: string;
  column: string;
  interval: 'monthly' | 'quarterly' | 'semi-annual';
}

export interface PgPartitionManager {
  ensureFuturePartitions(monthsAhead?: number): Promise<{ created: string[] }>;
}

const PARTITION_CONFIGS: PartitionConfig[] = [
  { tableName: 'market_data_raw', column: 'fetched_at', interval: 'quarterly' },
  { tableName: 'market_atoms', column: 'created_at', interval: 'quarterly' },
  { tableName: 'market_index_nav_history', column: 'nav_date', interval: 'semi-annual' },
  { tableName: 'market_pattern_detections', column: 'detected_at', interval: 'semi-annual' },
];

// ── No-op for SQLite ─────────────────────────────────────────────────────────

const noopManager: PgPartitionManager = {
  async ensureFuturePartitions() { return { created: [] }; },
};

// ── Factory ──────────────────────────────────────────────────────────────────

export function createPartitionManager(db: DatabaseAdapter): PgPartitionManager {
  if (db.dialect !== 'postgresql') {
    return noopManager;
  }

  function getIntervalMonths(interval: PartitionConfig['interval']): number {
    switch (interval) {
      case 'monthly': return 1;
      case 'quarterly': return 3;
      case 'semi-annual': return 6;
    }
  }

  function formatDate(d: Date): string {
    return d.toISOString().slice(0, 10);
  }

  function generatePartitionName(tableName: string, from: Date, interval: PartitionConfig['interval']): string {
    const y = from.getFullYear();
    const m = from.getMonth() + 1;
    if (interval === 'quarterly') {
      const q = Math.ceil(m / 3);
      return `${tableName}_${y}q${q}`;
    } else if (interval === 'semi-annual') {
      const h = m <= 6 ? 'h1' : 'h2';
      return `${tableName}_${y}${h}`;
    }
    return `${tableName}_${y}_${String(m).padStart(2, '0')}`;
  }

  async function ensureFuturePartitions(monthsAhead = 12): Promise<{ created: string[] }> {
    const created: string[] = [];

    for (const config of PARTITION_CONFIGS) {
      // Check if table is actually partitioned
      const isPartitioned = await db.get<{ n: number }>(
        `SELECT COUNT(*) as n FROM pg_partitioned_table pt
         JOIN pg_class c ON pt.partrelid = c.oid
         WHERE c.relname = $1`, config.tableName
      );
      if (!isPartitioned || isPartitioned.n === 0) continue;

      const intervalMonths = getIntervalMonths(config.interval);
      const now = new Date();
      const end = new Date(now);
      end.setMonth(end.getMonth() + monthsAhead);

      // Start from current interval boundary
      let current = new Date(now.getFullYear(), Math.floor(now.getMonth() / intervalMonths) * intervalMonths, 1);

      while (current < end) {
        const next = new Date(current);
        next.setMonth(next.getMonth() + intervalMonths);

        const partName = generatePartitionName(config.tableName, current, config.interval);

        try {
          await db.run(
            `CREATE TABLE IF NOT EXISTS ${partName} PARTITION OF ${config.tableName}
             FOR VALUES FROM ('${formatDate(current)}') TO ('${formatDate(next)}')`
          );
          created.push(partName);
        } catch {
          // Partition may already exist or overlap — safe to ignore
        }

        current = next;
      }
    }

    return { created: created.filter(Boolean) };
  }

  return { ensureFuturePartitions };
}
