#!/usr/bin/env node
/**
 * check-app-drift.mjs — report drift across the per-app service copy-family
 * (2026-07-17, Tier 3b).
 *
 * Pay / Comm / Business each keep hand-maintained copies of the same wallet
 * service files (received.ts, wallets.ts, fx.ts, fraud-engine.ts,
 * secure-signer.ts, enrollment.ts, …). The audit flagged ~44 such files with
 * 60%+ line divergence and "comments pleading for parity" — silent drift a
 * shared package would end, but that extraction is a large 3-app build-chain
 * change. This is the cheap interim: a visible report so the drift stops being
 * invisible. It also names the BYTE-IDENTICAL files, which are the clean
 * candidates to promote into @futurechain/sdk first.
 *
 * Read-only. Operates on the gitignored src/{pay,comm,business}/services trees
 * that exist locally. Exit 0 always (informational) unless --strict is passed.
 *
 * Usage: node scripts/check-app-drift.mjs [--strict]
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APPS = ['pay', 'comm', 'business'];
const strict = process.argv.includes('--strict');

function serviceDir(app) {
  return path.join(repoRoot, 'src', app, 'services');
}

/** basename → { app → { hash, lines } } for files present in ≥2 apps. */
function collect() {
  const byName = new Map();
  for (const app of APPS) {
    const dir = serviceDir(app);
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile() || !/\.[cm]?tsx?$/.test(entry.name)) continue;
      if (/\.(test|spec)\./.test(entry.name)) continue;
      const raw = readFileSync(path.join(dir, entry.name), 'utf8').replace(/\r\n/g, '\n');
      const rec = byName.get(entry.name) ?? {};
      rec[app] = { hash: createHash('sha256').update(raw).digest('hex'), lines: raw.split('\n').length };
      byName.set(entry.name, rec);
    }
  }
  return byName;
}

const byName = collect();
const shared = [...byName.entries()].filter(([, r]) => Object.keys(r).length >= 2).sort();

if (shared.length === 0) {
  console.log('[app-drift] no shared service files found (are the gitignored app dirs present?)');
  process.exit(0);
}

const identical = [];
const diverged = [];
for (const [name, rec] of shared) {
  const apps = Object.keys(rec);
  const hashes = new Set(apps.map((a) => rec[a].hash));
  const where = apps.map((a) => `${a}:${rec[a].lines}L`).join(' ');
  if (hashes.size === 1) identical.push({ name, where });
  else diverged.push({ name, where, appCount: apps.length });
}

console.log(`\n[app-drift] ${shared.length} service files shared across ≥2 of pay/comm/business\n`);

console.log(`── BYTE-IDENTICAL (${identical.length}) — clean @futurechain/sdk promotion candidates ──`);
for (const f of identical) console.log(`  ✓ ${f.name.padEnd(28)} ${f.where}`);

console.log(`\n── DIVERGED (${diverged.length}) — hand-maintained copies that have drifted ──`);
for (const f of diverged) console.log(`  ~ ${f.name.padEnd(28)} ${f.where}`);

console.log(`\n[app-drift] ${identical.length} identical, ${diverged.length} diverged.`);
if (strict && diverged.length > 0) {
  console.error('[app-drift] --strict: diverged copies present.');
  process.exit(1);
}
process.exit(0);
