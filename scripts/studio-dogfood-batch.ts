#!/usr/bin/env tsx
/**
 * studio-dogfood-batch.ts — run a BATCH of small, varied ANTON Studio projects to
 * push the project-scoped coding-atoms A/B toward a real verdict.
 *
 * Each project = one single-file CommonJS function + a FIXED node:assert test
 * (no deps, no install, no shell). The specs are deliberately a bit tricky
 * (roman numerals, balanced brackets, query-string parsing…) so Devstral
 * sometimes needs revise rounds — that is the only thing that gives the A/B
 * (mean revise-rounds injected vs holdout) any signal. Trivial tasks that pass
 * first-try contribute a legitimate 0 to both arms.
 *
 * Resilient: each project runs in its own try/catch (one failure never stops the
 * batch), its own isolated workspace repo OUTSIDE the ANTON repo, and is
 * independently re-verified. Prints the cumulative A/B verdict at the end.
 *
 * Usage:  npx tsx scripts/studio-dogfood-batch.ts [rounds=2]
 */

import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { initDatabaseAdapter } from '../server/db/init-database.js';
import { createStudioOrchestrator } from '../server/services/coding-studio-orchestrator.js';
import { getCodingAtomAbReport } from '../server/services/coding-atom-ab-report.js';
import {
  setCodingModelStrategy,
  resolveCodingModel,
  providerForCodingModel,
  type CodingRole,
} from '../server/services/coding-model-resolver.js';

interface Spec {
  slug: string;        // dir + file base
  fnFile: string;      // e.g. 'romanToInt.cjs'
  fnName: string;
  title: string;
  behavior: string;
  cases: Array<[unknown[], unknown]>; // [args, expected]
}

const SPECS: Spec[] = [
  {
    slug: 'slugify', fnFile: 'slugify.cjs', fnName: 'slugify', title: 'slugify utility',
    behavior: `slugify(input): String(input), lowercase, replace every run of NON-[a-z0-9] with a single '-', strip leading/trailing '-'. '' -> ''.`,
    cases: [[['Hello World'], 'hello-world'], [['  Trim  Me  '], 'trim-me'], [['Special@#$Chars!'], 'special-chars'], [['Multiple---Hyphens'], 'multiple-hyphens'], [['UPPER and lower'], 'upper-and-lower'], [[''], '']],
  },
  {
    slug: 'roman-to-int', fnFile: 'romanToInt.cjs', fnName: 'romanToInt', title: 'Roman numeral to integer',
    behavior: `romanToInt(s): convert a valid uppercase Roman numeral string to its integer value, honoring subtractive pairs (IV=4, IX=9, XL=40, XC=90, CD=400, CM=900).`,
    cases: [[['III'], 3], [['IV'], 4], [['IX'], 9], [['LVIII'], 58], [['XL'], 40], [['CD'], 400], [['MCMXCIV'], 1994], [['MMXXIV'], 2024]],
  },
  {
    slug: 'is-balanced', fnFile: 'isBalanced.cjs', fnName: 'isBalanced', title: 'balanced brackets checker',
    behavior: `isBalanced(s): return true iff the brackets ()[]{} in s are correctly matched and nested. Non-bracket characters are ignored. '' -> true.`,
    cases: [[['()'], true], [['()[]{}'], true], [['(]'], false], [['([)]'], false], [['{[]}'], true], [['' ], true], [['('], false], [['a(b)c'], true]],
  },
  {
    slug: 'title-case', fnFile: 'titleCase.cjs', fnName: 'titleCase', title: 'title-case words',
    behavior: `titleCase(s): split on a single space; for each word, uppercase the first char and lowercase the rest; join back with single spaces. Empty words (from repeated spaces) stay empty so spacing is preserved.`,
    cases: [[['hello world'], 'Hello World'], [['the QUICK brown'], 'The Quick Brown'], [[''], ''], [['a'], 'A'], [['multiple   spaces'], 'Multiple   Spaces']],
  },
  {
    slug: 'chunk', fnFile: 'chunk.cjs', fnName: 'chunk', title: 'array chunk',
    behavior: `chunk(arr, size): split arr into consecutive sub-arrays of length size (the last may be shorter). size>=1. An empty array -> [].`,
    cases: [[[[1, 2, 3, 4, 5], 2], [[1, 2], [3, 4], [5]]], [[[1, 2, 3, 4], 2], [[1, 2], [3, 4]]], [[[], 3], []], [[[1], 5], [[1]]], [[[1, 2, 3], 1], [[1], [2], [3]]]],
  },
  {
    slug: 'parse-qs', fnFile: 'parseQs.cjs', fnName: 'parseQs', title: 'query-string parser',
    behavior: `parseQs(s): parse "k1=v1&k2=v2" into a plain object {k1:'v1',k2:'v2'} (string values, no URL decoding). '' -> {}. A bare "k=" -> {k:''}. On duplicate keys the LAST value wins.`,
    cases: [[['a=1&b=2'], { a: '1', b: '2' }], [[''], {}], [['x=hello'], { x: 'hello' }], [['k='], { k: '' }], [['a=1&a=2'], { a: '2' }]],
  },
];

function charterFor(s: Spec): string {
  return `# Project: ${s.title} (single file, dependency-free)

## Problem / business case
ANTON needs a small, audited, in-house ${s.title}. We deliberately AVOID an npm
dependency for a pure ~10-line function (supply-chain surface, license review,
bundle weight) we fully own and test, reused across ANTON apps. Owner: the studio;
timeline: a single-session MVP.

## Behavior (exact)
${s.behavior}

## Acceptance criteria (these ARE the tests)
Running \`node test.cjs\` exits 0 with all cases passing. The fixed test file is the
authoritative acceptance suite — do NOT edit or create test files.

## Edge cases / validation (DevSecOps + Engineering)
Handle the empty input shown above; coerce inputs defensively; no external input
is executed. The fixed test covers the required edge cases.

## Deliverable
A single file '${s.fnFile}' exporting via CommonJS:  module.exports = ${s.fnName};
so the existing test (run with \`node test.cjs\`) passes. No dependencies, no build step.

## Scope
ONE task — implement ${s.fnFile} only. Do not add a CLI, package.json, types, or extra files.`;
}

function testFor(s: Spec): string {
  return `// Fixed acceptance test — ANTON Studio must make this pass by writing ${s.fnFile}.
const assert = require('node:assert');
const ${s.fnName} = require('./${s.fnFile}');
const cases = ${JSON.stringify(s.cases)};
for (const [args, expected] of cases) {
  const got = ${s.fnName}(...args);
  assert.deepStrictEqual(got, expected, ${s.fnName} + '(' + JSON.stringify(args) + ') = ' + JSON.stringify(got) + ', expected ' + JSON.stringify(expected));
}
console.log('All', cases.length, '${s.fnName} cases passed.');
`;
}

interface Outcome { slug: string; status: string; reviseRounds: number; testPass: boolean | null; error?: string }

async function runOne(db: Awaited<ReturnType<typeof initDatabaseAdapter>>, root: string, spec: Spec, round: number): Promise<Outcome> {
  const dir = path.join(root, `${spec.slug}-r${round}`);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'test.cjs'), testFor(spec), 'utf8');

  const projectId = randomUUID();
  const codingId = randomUUID();
  await db.run(
    `INSERT INTO projects (id, name, description, status, created_at, updated_at) VALUES (?, ?, ?, 'active', NOW(), NOW())`,
    projectId, spec.title, 'ANTON Studio dogfood batch',
  );
  await db.run(
    `INSERT INTO coding_projects (id, project_id, name, description, tier, status, directory_path, studio_language, test_command, discovery_summary, created_by)
     VALUES (?, ?, ?, ?, 'large', 'implementation', ?, 'node', ?, ?, 'studio-dogfood-batch')`,
    codingId, projectId, spec.title, 'ANTON Studio dogfood batch',
    dir, JSON.stringify(['node', 'test.cjs']), charterFor(spec),
  );

  const orch = createStudioOrchestrator(db, {});
  await orch.startOrResume({ codingProjectId: codingId, autonomy: 'more', reviseCap: 3, createdBy: 'studio-dogfood-batch' });
  let run = await orch.advance(codingId);
  if (run.status === 'awaiting_plan') run = await orch.approvePlan(codingId);

  const reviseRounds = (run.plan?.tasks ?? []).reduce((a, t) => a + (t.reviseRounds || 0), 0);

  let testPass: boolean | null = null;
  try {
    execFileSync(process.execPath, ['test.cjs'], { cwd: dir, encoding: 'utf8' });
    testPass = true;
  } catch { testPass = false; }

  fs.rmSync(dir, { recursive: true, force: true }); // tidy disk
  return { slug: `${spec.slug}-r${round}`, status: run.status, reviseRounds, testPass };
}

async function main(): Promise<void> {
  // args: [rounds=2] [startRound=1]. startRound lets a second batch use
  // non-colliding round numbers (and workspace dirs) when run concurrently.
  const rounds = Math.max(1, Number(process.argv[2]) || 2);
  const startRound = Math.max(1, Number(process.argv[3]) || 1);
  const root = process.env.CODING_STUDIO_ROOT;
  if (!root) throw new Error('CODING_STUDIO_ROOT is not set in .env');
  fs.mkdirSync(root, { recursive: true });

  const db = await initDatabaseAdapter();
  await setCodingModelStrategy(db, {
    orchestrator: 'mistral-large-latest', expert: 'mistral-medium-latest',
    codegen: 'devstral-medium-latest', utility: 'mistral-small-latest',
  });

  console.log('=== model routing pre-flight ===');
  for (const role of ['orchestrator', 'expert', 'codegen', 'utility'] as CodingRole[]) {
    const m = resolveCodingModel(role);
    const prov = providerForCodingModel(m);
    if (prov !== 'mistral') throw new Error(`role ${role} -> ${prov}, expected mistral`);
    console.log(`  ${role.padEnd(12)} -> ${m} (${prov})`);
  }
  console.log(`\nBatch: ${SPECS.length} specs x ${rounds} round(s) (rounds ${startRound}..${startRound + rounds - 1}) = ${SPECS.length * rounds} projects\n`);

  const outcomes: Outcome[] = [];
  for (let r = startRound; r < startRound + rounds; r++) {
    for (const spec of SPECS) {
      try {
        const o = await runOne(db, root, spec, r);
        outcomes.push(o);
        console.log(`  [${o.slug.padEnd(16)}] status=${o.status.padEnd(13)} revises=${o.reviseRounds} test=${o.testPass ? 'PASS' : 'fail'}`);
      } catch (err) {
        outcomes.push({ slug: `${spec.slug}-r${r}`, status: 'ERROR', reviseRounds: 0, testPass: null, error: err instanceof Error ? err.message : String(err) });
        console.log(`  [${spec.slug}-r${r}] ERROR: ${err instanceof Error ? err.message.split('\n')[0] : err}`);
      }
    }
  }

  const done = outcomes.filter((o) => o.status === 'done').length;
  const passed = outcomes.filter((o) => o.testPass === true).length;
  console.log(`\n=== batch summary: ${outcomes.length} projects · ${done} done · ${passed} test-pass ===`);

  const report = await getCodingAtomAbReport(db);
  console.log(`\n=== A/B reporter (cumulative) ===`);
  console.log(`verdict=${report.verdict}`);
  console.log(`injected: n=${report.injected.n} mean=${report.injected.mean ?? '—'} | holdout: n=${report.holdout.n} mean=${report.holdout.mean ?? '—'}`);
  console.log(report.headline);
  process.exit(0);
}

main().catch((err) => { console.error('BATCH ERROR:', err instanceof Error ? err.stack : err); process.exit(1); });
