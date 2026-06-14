#!/usr/bin/env tsx
/**
 * studio-dogfood.ts — the FIRST real ANTON Studio run (Mistral), bounded + observed.
 *
 * A SWE-bench-shaped minimal proof: a FIXED acceptance test (test.js, plain
 * node:assert — no deps, no install, no shell) for a `slugify()` utility. The
 * studio must plan → 7-expert START gate → Devstral writes slugify.js → run
 * `node test.js` → revise-to-green (cap 3) → BUILD/TESTING/FINISH gates. All on
 * the locked Mistral role mapping (Large planner, Medium experts, Devstral code).
 *
 * Drives the orchestrator DIRECTLY (no HTTP, no auth) so it reads CODING_STUDIO_ROOT
 * fresh and we get full observability + a hard revise cap. Spends a little Mistral
 * money (well under $1). Run: npx tsx scripts/studio-dogfood.ts
 */

import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { initDatabaseAdapter } from '../server/db/init-database.js';
import { createStudioOrchestrator, type StudioRun } from '../server/services/coding-studio-orchestrator.js';
import { getCodingAtomAbReport } from '../server/services/coding-atom-ab-report.js';
import {
  setCodingModelStrategy,
  resolveCodingModel,
  providerForCodingModel,
  type CodingRole,
} from '../server/services/coding-model-resolver.js';

// The FIXED acceptance test the studio must satisfy (it may NOT edit this).
// .cjs so `require` works regardless of the repo's package.json "type":"module".
const TEST_CJS = `// Fixed acceptance test — ANTON Studio must make this pass by writing slugify.cjs.
const assert = require('node:assert');
const slugify = require('./slugify.cjs');

const cases = [
  ['Hello World', 'hello-world'],
  ['  Trim  Me  ', 'trim-me'],
  ['Special@#$Chars!', 'special-chars'],
  ['already-a-slug', 'already-a-slug'],
  ['Multiple---Hyphens', 'multiple-hyphens'],
  ['UPPER and lower', 'upper-and-lower'],
  ['', ''],
];
for (const [input, expected] of cases) {
  const got = slugify(input);
  assert.strictEqual(got, expected, \`slugify(\${JSON.stringify(input)}) = \${JSON.stringify(got)}, expected \${JSON.stringify(expected)}\`);
}
console.log('All', cases.length, 'slugify cases passed.');
`;

const CHARTER = `# Project: slugify utility (single file, dependency-free)

## Problem
ANTON's apps repeatedly need to turn a title string into a URL-safe slug. We need a
small, audited, in-house \`slugify(input)\` helper.

## Business case (why build vs. use an npm package)
We deliberately AVOID adding a third-party dependency for a ~10-line pure transform:
it removes a supply-chain surface (no transitive deps, no license review, no bundle
weight) for code we fully own and test, and it is reused across multiple ANTON apps.
It is also ANTON Studio's first end-to-end dogfood. Owner: the studio; timeline:
a single-session MVP.

## Exact specification (a FIXED test.cjs already exists in the workspace and MUST pass — do NOT modify or create test files)
slugify(input):
  1. Coerce input with String(input) so non-string input never throws.
  2. Lowercase it.
  3. Replace every run of one-or-more characters that are NOT [a-z0-9] with a single hyphen '-'.
  4. Strip any leading or trailing hyphens.
  5. The empty string maps to the empty string.

Examples:
  'Hello World'        -> 'hello-world'
  '  Trim  Me  '       -> 'trim-me'
  'Special@#$Chars!'   -> 'special-chars'
  'already-a-slug'     -> 'already-a-slug'
  'Multiple---Hyphens' -> 'multiple-hyphens'
  'UPPER and lower'    -> 'upper-and-lower'
  ''                   -> ''

## Acceptance criteria (these ARE the tests)
Running \`node test.cjs\` exits 0 with all cases passing. The fixed test file is the
authoritative acceptance suite — do not edit it.

## Edge cases / validation (DevSecOps + Engineering)
Non-string input is coerced via String(input) (never throws on null/undefined/number).
Characters outside [a-z0-9] (including unicode letters and punctuation) are intentionally
collapsed to hyphens — this is an ASCII-slug by design. No external input is executed.

## Deliverable
A single CommonJS file \`slugify.cjs\` at the workspace root that exports the function:
  module.exports = slugify;
so the existing test (run with \`node test.cjs\`) passes. No dependencies, no build step.

## Scope
ONE task. Do not add a CLI, a package.json, types, or extra files — just slugify.cjs.`;

function printRun(label: string, run: StudioRun): void {
  console.log(`\n=== ${label} :: status=${run.status} ===`);
  if (run.plan) {
    console.log(`plan: ${run.plan.releaseName} — ${run.plan.tasks.length} task(s)`);
    run.plan.tasks.forEach((t, i) => console.log(`  ${i + 1}. [${t.status}] ${t.title}${t.reviseRounds ? ` (${t.reviseRounds} revise)` : ''}`));
  }
  if (run.lastError) console.log(`lastError: ${run.lastError}`);
  const log = run.stepLog ?? [];
  console.log(`step log (last ${Math.min(20, log.length)} of ${log.length}):`);
  for (const s of log.slice(-20)) console.log(`  [${s.kind}]${s.gate ? `(${s.gate})` : ''} ${s.message}`);
}

async function main(): Promise<void> {
  const root = process.env.CODING_STUDIO_ROOT;
  if (!root) throw new Error('CODING_STUDIO_ROOT is not set in .env');

  const dir = path.join(root, 'slugify-demo');
  fs.rmSync(dir, { recursive: true, force: true }); // pristine each run
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'test.cjs'), TEST_CJS, 'utf8');
  console.log('workspace:', dir, '(seeded test.cjs)');

  const db = await initDatabaseAdapter();

  // Warm the coding-model strategy cache (the server does this at boot via
  // initCodingModelStrategy; this driver skipped boot). Persists the SAME locked
  // Mistral mapping that init-postgresql already seeds — process-local cache
  // warm, idempotent DB write, the running server is unaffected. Without this
  // the resolver falls through to the configured provider (Anthropic) and the
  // run would hit Claude (which is what failed the first attempt).
  await setCodingModelStrategy(db, {
    orchestrator: 'mistral-large-latest',
    expert: 'mistral-medium-latest',
    codegen: 'devstral-medium-latest',
    utility: 'mistral-small-latest',
  });

  // Pre-flight: confirm every role resolves to MISTRAL before we spend a cent.
  console.log('\n=== model routing pre-flight ===');
  let allMistral = true;
  for (const role of ['orchestrator', 'expert', 'codegen', 'utility'] as CodingRole[]) {
    const m = resolveCodingModel(role);
    const prov = providerForCodingModel(m);
    if (prov !== 'mistral') allMistral = false;
    console.log(`  ${role.padEnd(12)} → ${m} (${prov})`);
  }
  if (!allMistral) throw new Error('A coding role did not resolve to Mistral — aborting before spend.');

  // Fresh project each run (so the A/B holdout/injected arms accumulate).
  const projectId = randomUUID();
  const codingId = randomUUID();
  await db.run(
    `INSERT INTO projects (id, name, description, status, created_at, updated_at)
     VALUES (?, ?, ?, 'active', NOW(), NOW())`,
    projectId, 'Slugify demo', 'ANTON Studio dogfood',
  );
  await db.run(
    `INSERT INTO coding_projects
       (id, project_id, name, description, tier, status, directory_path, studio_language, test_command, discovery_summary, created_by)
     VALUES (?, ?, ?, ?, 'large', 'implementation', ?, 'node', ?, ?, 'studio-dogfood')`,
    codingId, projectId, 'Slugify demo', 'ANTON Studio dogfood',
    dir, JSON.stringify(['node', 'test.cjs']), CHARTER,
  );
  console.log('coding_project:', codingId);

  const orch = createStudioOrchestrator(db, {});

  console.log('\n>>> startOrResume (autonomy=more, reviseCap=3) — Mistral Large will plan…');
  await orch.startOrResume({ codingProjectId: codingId, autonomy: 'more', reviseCap: 3, createdBy: 'studio-dogfood' });
  let run = await orch.advance(codingId);
  printRun('after plan', run);

  if (run.status === 'awaiting_plan') {
    console.log('\n>>> approvePlan — drives the build loop (panels + Devstral codegen + node test.js)…');
    run = await orch.approvePlan(codingId);
    printRun('after build loop', run);
  } else {
    console.log(`\n(not awaiting_plan — status=${run.status}; not approving)`);
  }

  // Inspect what the studio actually produced.
  console.log('\n=== workspace files ===');
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) { console.log(`\n--- ${f}/ (directory, skipped) ---`); continue; }
    const body = fs.readFileSync(full, 'utf8');
    console.log(`\n--- ${f} (${body.length} chars) ---\n${body.slice(0, 1500)}`);
  }

  // Did it actually pass the FIXED test (run it ourselves, independently)?
  console.log('\n=== independent re-run of the fixed test ===');
  try {
    const { execFileSync } = await import('node:child_process');
    const out = execFileSync(process.execPath, ['test.cjs'], { cwd: dir, encoding: 'utf8' });
    console.log('TEST PASSED:', out.trim());
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    console.log('TEST FAILED:', (e.stderr || e.stdout || e.message || '').toString().split('\n').slice(0, 6).join('\n'));
  }

  // The A/B reporter now has real data from this run.
  const report = await getCodingAtomAbReport(db);
  console.log('\n=== A/B reporter (cumulative across studio runs) ===');
  console.log(`verdict=${report.verdict} | injected n=${report.injected.n} holdout n=${report.holdout.n} | ${report.headline}`);

  await db.run('UPDATE coding_studio_runs SET updated_at = NOW() WHERE coding_project_id = ?', codingId).catch(() => {});
  process.exit(0);
}

main().catch((err) => {
  console.error('\nDOGFOOD RUN ERROR:', err instanceof Error ? err.stack : err);
  process.exit(1);
});
