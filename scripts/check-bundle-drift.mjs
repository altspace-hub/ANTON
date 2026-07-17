#!/usr/bin/env node
/**
 * check-bundle-drift.mjs — detect drift between the repo and the installable
 * standalone bundle at C:\ANTON_Agent_Standalone (2026-07-17).
 *
 * The bundle is a point-in-time COPY (vendored @futurechain/sdk + both
 * standalone apps) with NO automation — a repo change to the SDK (e.g. a fee or
 * signing tweak) or to apps/anton-{agent-pay,collaboration} does not propagate,
 * so the installed standalone can silently run stale money-critical logic. This
 * script hash-compares the source trees and exits non-zero on any difference.
 *
 * Usage:  node scripts/check-bundle-drift.mjs [bundleRoot]
 *         (bundleRoot defaults to C:\ANTON_Agent_Standalone or $ANTON_BUNDLE_ROOT)
 *
 * Excluded from the comparison: node_modules, dist, build, .gradle, test
 * artifacts the vendor step strips, and each app's tsconfig.json (its `exclude`
 * path legitimately differs between repo and bundle).
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundleRoot = process.argv[2] || process.env.ANTON_BUNDLE_ROOT || 'C:\\ANTON_Agent_Standalone';

// [repo-relative, bundle-relative] source-tree pairs to compare.
const PAIRS = [
  ['anton-business/packages/futurechain-sdk/src', 'packages/futurechain-sdk/src'],
  ['apps/anton-agent-pay/src', 'apps/anton-agent-pay/src'],
  ['apps/anton-collaboration/src', 'apps/anton-collaboration/src'],
];

const IGNORE_DIRS = new Set(['node_modules', 'dist', 'build', '.gradle', '.idea', '__tests__']);
const IGNORE_BASENAMES = new Set(['tsconfig.json']); // exclude-path legitimately differs
// The SDK vendor step strips test files from the bundle, so *.test.ts drift is
// expected and not real — compare only shipped source.
const isTestFile = (name) => /\.(test|spec)\.[cm]?tsx?$/.test(name);

function walk(dir, base = dir, out = new Map()) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(entry.name)) continue;
      walk(path.join(dir, entry.name), base, out);
    } else if (entry.isFile()) {
      if (IGNORE_BASENAMES.has(entry.name) || isTestFile(entry.name)) continue;
      const rel = path.relative(base, path.join(dir, entry.name)).replace(/\\/g, '/');
      // Normalize CRLF/LF so line-ending-only differences are not flagged.
      const content = readFileSync(path.join(dir, entry.name), 'utf8').replace(/\r\n/g, '\n');
      out.set(rel, createHash('sha256').update(content).digest('hex'));
    }
  }
  return out;
}

if (!existsSync(bundleRoot)) {
  console.error(`[bundle-drift] bundle not found at ${bundleRoot} — pass its path as an arg or set ANTON_BUNDLE_ROOT. Skipping.`);
  process.exit(0);
}

let drift = 0;
for (const [repoRel, bundleRel] of PAIRS) {
  const a = walk(path.join(repoRoot, repoRel));
  const b = walk(path.join(bundleRoot, bundleRel));
  const all = new Set([...a.keys(), ...b.keys()]);
  for (const f of [...all].sort()) {
    if (!a.has(f)) { console.log(`  [only in bundle] ${bundleRel}/${f}`); drift++; }
    else if (!b.has(f)) { console.log(`  [only in repo]   ${repoRel}/${f}`); drift++; }
    else if (a.get(f) !== b.get(f)) { console.log(`  [differs]        ${repoRel}/${f}`); drift++; }
  }
}

if (drift === 0) {
  console.log(`[bundle-drift] OK — repo and bundle (${bundleRoot}) are in sync.`);
  process.exit(0);
}
console.error(`\n[bundle-drift] ${drift} file(s) drifted. Re-sync the bundle (robocopy the app src + tests; re-run scripts/resync-sdk.ps1 for the SDK) and re-run its tests.`);
process.exit(1);
