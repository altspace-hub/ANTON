#!/usr/bin/env tsx
/**
 * atom-ab-report.ts — print the HONEST coding-atoms loop effectiveness verdict
 * from the terminal (ANTON Studio's first dogfood instrument).
 *
 * Usage:
 *   npx tsx scripts/atom-ab-report.ts            # human-readable readout
 *   npx tsx scripts/atom-ab-report.ts --json     # machine-readable report JSON
 *
 * Reads DATABASE_URL from .env (same as run-migration.cjs), counts per-task
 * revise-rounds from coding_workspace_applications, assigns each task to its
 * deterministic arm with the SHARED assignTaskAtomArm(), and runs the SHARED
 * buildCodingAtomAbReport() — so the CLI verdict is identical to the dashboard's
 * (no duplicated statistics, no drift). Honest "insufficient data" when the
 * loop has not run enough tasks yet.
 */

import fs from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';
import { assignTaskAtomArm, type CodingAtomAbSamples } from '../server/services/coding-atom-stats.js';
import { buildCodingAtomAbReport } from '../server/services/coding-atom-ab-report.js';

function readDatabaseUrl(): string {
  const envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) {
    console.error('No .env found in', process.cwd());
    process.exit(1);
  }
  const env = fs.readFileSync(envPath, 'utf8');
  const m = env.match(/^DATABASE_URL=(.+)$/m);
  if (!m) {
    console.error('DATABASE_URL not found in .env');
    process.exit(1);
  }
  return m[1].trim();
}

function fmt(x: number | null, d = 2): string {
  return x === null || !Number.isFinite(x) ? '—' : x.toFixed(d);
}

async function main(): Promise<void> {
  const asJson = process.argv.includes('--json');
  const client = new Client({ connectionString: readDatabaseUrl() });
  await client.connect();

  const samples: CodingAtomAbSamples = { injected: [], holdout: [] };
  try {
    const { rows } = await client.query<{ coding_task_id: string; revisions: string }>(
      `SELECT coding_task_id,
              SUM(CASE WHEN kind = 'revision' THEN 1 ELSE 0 END) AS revisions
       FROM coding_workspace_applications
       WHERE coding_task_id IS NOT NULL
       GROUP BY coding_task_id`,
    );
    for (const r of rows) {
      if (!r.coding_task_id) continue;
      samples[assignTaskAtomArm(r.coding_task_id)].push(Number(r.revisions) || 0);
    }
  } catch (err) {
    // Table missing (un-migrated) — honest empty samples → insufficient_data.
    if (!asJson) console.error('(coding_workspace_applications not found — treating as no data)');
    void err;
  } finally {
    await client.end();
  }

  const report = buildCodingAtomAbReport(samples);

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const { injected: inj, holdout: hld, comparison: c } = report;
  console.log('');
  console.log('  ANTON Studio — coding-atoms loop effectiveness (honest verdict)');
  console.log('  ' + '─'.repeat(64));
  console.log(`  injected (with project lessons) : n=${inj.n}  mean=${fmt(inj.mean)}  sd=${fmt(inj.stdev)} rev/task`);
  console.log(`  holdout  (no lessons, det. 20%) : n=${hld.n}  mean=${fmt(hld.mean)}  sd=${fmt(hld.stdev)} rev/task`);
  console.log(`  delta (injected − holdout)      : ${fmt(report.delta)} rev/task  (negative = fewer = better)`);
  console.log(`  effect size (Cohen's d)         : ${fmt(report.effectSize)} (${report.effectMagnitude ?? '—'})`);
  console.log(`  p-value (two-sided, large-N z)  : ${fmt(report.pValue, 4)}   α=${c.alpha}`);
  console.log('  ' + '─'.repeat(64));
  console.log(`  VERDICT: ${report.verdict.toUpperCase()}`);
  console.log(`  ${report.headline}`);
  console.log('');
  console.log('  ' + report.detail.replace(/\s+/g, ' ').trim());
  console.log('');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
