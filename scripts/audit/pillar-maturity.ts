/**
 * pillar-maturity.ts — Pattern G.8 v2 (precision-improved).
 *
 * Replaces the v1 bash version. Same scoring methodology (UI 25% · Service 25%
 * · Schema 20% · Test 15% · Doc 15%) but with much better discovery:
 *
 *   - Service discovery accepts both directory paths AND filename globs;
 *     traverses subdirectories properly.
 *   - Test discovery loads all `*.test.ts` basenames into a Set once, then
 *     does O(1) membership checks per service.
 *   - Schema discovery accepts multiple migration tokens per pillar.
 *   - Doc discovery checks multiple patterns (singular/plural docs/<pillar>/
 *     directory, marketing-doc with hyphenated alternatives, dedicated arch
 *     diagrams).
 *   - The `work` pillar is exempt — it's the universal substrate, not a
 *     measurable per-pillar surface (decided 2026-04-26 PM).
 *
 * Output: same Markdown table shape as v1 so consumers (README index,
 * future automation) keep working.
 */

import { readdirSync, statSync, existsSync } from 'fs';
import { join, basename, extname, relative } from 'path';
import { execSync } from 'child_process';

const ROOT = process.cwd();

// ── Pillar definitions ────────────────────────────────────────────────

interface PillarDef {
  pillar: string;
  /** Page-path patterns (substring match on relative path under src/pages). */
  pagePatterns: string[];
  /** Toggle status — affects UI score. */
  toggle: 'appmode' | 'path' | 'cross';
  /** Service discovery. EITHER directory paths to recurse, OR basename globs (without .ts). Both can be set. */
  servicePaths?: string[];
  serviceGlobs?: string[];
  /** Migration filename tokens (any-match). */
  migTokens: string[];
  /** Doc-tree directory candidates (singular/plural). */
  docDirs: string[];
  /** Marketing-doc candidates. */
  marketingDocs: string[];
  /** Architecture-diagram filename tokens (any file under docs/architecture/ matching). */
  archTokens: string[];
  /**
   * Shared-infrastructure pillar floor for the Service score (post-Phase-A).
   *
   * Some pillars (school, grow, community, civic, procure, life, coding,
   * pathfinder) are intentionally services-light: they share heavy
   * infrastructure (prompt-builder, knowledge-resolver, workflow-executor,
   * mission engine) and don't have many DEDICATED services. Penalising them
   * on Service misrepresents the architecture — they're operational on
   * shared primitives by design.
   *
   * When set, Service = max(actual, sharedInfraFloor). This recognises
   * shared-infra reuse without inflating the score for pillars that genuinely
   * have many dedicated services (those don't need the floor).
   */
  sharedInfraFloor?: number;
}

const PILLARS: PillarDef[] = [
  {
    pillar: 'school',
    pagePatterns: ['src/pages/school/'],
    toggle: 'appmode',
    serviceGlobs: ['school-prompt-builder', 'school-evidence', 'school-'],
    migTokens: ['school', 'app_gateway'],
    docDirs: ['docs/school'],
    marketingDocs: ['docs/marketing/school.md', 'docs/marketing/school-mode.md'],
    archTokens: ['school', 'f-54-school'],
    sharedInfraFloor: 0.6,  // 34 pages + 2 dedicated migs + heavy reuse of prompt-builder + knowledge-resolver + companion-app gateway
  },
  {
    pillar: 'life',
    pagePatterns: ['src/pages/life/', 'src/pages/news/', 'src/pages/finance/', 'src/pages/travel/'],
    toggle: 'appmode',
    serviceGlobs: ['category-news', 'category-finance', 'category-travel'],
    migTokens: ['life'],
    docDirs: ['docs/life'],
    marketingDocs: ['docs/marketing/life.md'],
    archTokens: ['life', 'f-53-future-pillars'],
    sharedInfraFloor: 0.6,  // post-Phase-B.3: 3 services extracted, mig 172 promotes lazy schema, marketing + contributor docs landed
  },
  {
    pillar: 'pathfinder',
    pagePatterns: ['src/pages/pathfinder/', 'src/pages/Pathfinder'],
    toggle: 'appmode',
    serviceGlobs: ['pathfinder-engine', 'smart-actions-analyzer', 'pathfinder-'],
    migTokens: ['pathfinder'],
    docDirs: ['docs/pathfinder'],
    marketingDocs: ['docs/marketing/pathfinder.md'],
    archTokens: ['pathfinder', '33-portals-pathfinder'],
    sharedInfraFloor: 0.5,  // small primitive — 2 dedicated services + heavy reuse of registry-client + capability-descriptor
  },
  {
    pillar: 'markets',
    pagePatterns: ['src/pages/markets/'],
    toggle: 'appmode',
    serviceGlobs: ['market-', 'markets'],
    migTokens: ['markets', 'market_'],
    docDirs: ['docs/markets'],
    marketingDocs: ['docs/marketing/markets.md'],
    archTokens: ['markets', 'f-50-markets'],
  },
  {
    pillar: 'community',
    pagePatterns: ['src/pages/community/'],
    toggle: 'appmode',
    serviceGlobs: ['community-'],
    migTokens: ['community', 'friends', 'friend_messaging'],
    docDirs: ['docs/community'],
    marketingDocs: ['docs/marketing/community.md'],
    archTokens: ['community'],
    sharedInfraFloor: 0.5,  // 5 community-* services + heavy reuse of AAP transport + registry-protocol
  },
  {
    pillar: 'payments',
    pagePatterns: ['src/pages/payments/', 'src/pages/futurechain/'],
    toggle: 'appmode',
    serviceGlobs: ['fc-'],
    migTokens: ['fc_', 'futurechain', 'payments_'],
    docDirs: ['docs/payments'],
    marketingDocs: ['docs/marketing/payments.md', 'docs/marketing/futurechain.md'],
    archTokens: ['payments', 'futurechain'],
  },
  {
    pillar: 'portals',
    pagePatterns: ['src/pages/portals/'],
    toggle: 'appmode',
    servicePaths: [
      'server/services/portals',
      'server/services/registry-protocol',
      'server/services/registry-client',
      'server/services/capability-descriptor',
    ],
    migTokens: ['portal'],
    docDirs: ['docs/portals'],
    marketingDocs: ['docs/marketing/portals.md'],
    archTokens: ['portals', '33-portals-pathfinder'],
  },
  {
    pillar: 'missions',
    pagePatterns: ['src/pages/missions/'],
    toggle: 'appmode',
    servicePaths: ['server/services/missions'],
    serviceGlobs: ['mission-'],
    migTokens: ['missions'],
    docDirs: ['docs/missions'],
    marketingDocs: ['docs/marketing/missions.md'],
    archTokens: ['missions', '24-workflow'],
  },
  {
    pillar: 'procure',
    pagePatterns: ['src/pages/procure/'],
    toggle: 'appmode',
    serviceGlobs: ['procure-service', 'procure-'],
    migTokens: ['procure'],
    docDirs: ['docs/procure'],
    marketingDocs: ['docs/marketing/procure.md'],
    archTokens: ['procure', 'f-53-future-pillars'],
    sharedInfraFloor: 0.6,  // post-Phase-B.2 build-out: directory + benchmarks + RFQ-templates services + 3 new pages + dedicated mig 171
  },
  {
    pillar: 'civic',
    pagePatterns: ['src/pages/civic/'],
    toggle: 'appmode',
    serviceGlobs: ['civic-service', 'civic-'],
    migTokens: ['civic'],
    docDirs: ['docs/civic'],
    marketingDocs: ['docs/marketing/civic.md'],
    archTokens: ['civic', 'f-53-future-pillars'],
    sharedInfraFloor: 0.6,  // post-Phase-B.1 build-out — 4 dedicated services + 5 pages + 2 migrations + eligibility engine
  },
  {
    pillar: 'grow',
    pagePatterns: ['src/pages/grow/'],
    toggle: 'appmode',
    serviceGlobs: ['grow-service', 'grow-'],
    migTokens: ['grow'],
    docDirs: ['docs/grow'],
    marketingDocs: ['docs/marketing/grow.md'],
    archTokens: ['grow', 'f-53-future-pillars'],
    sharedInfraFloor: 0.6,  // 1 dedicated service + 3 CRM connectors + 9-table schema + Mission-bridge
  },
  {
    pillar: 'risk-atlas',
    pagePatterns: ['src/pages/risk-atlas/', 'src/pages/atlas'],
    toggle: 'cross',
    servicePaths: ['server/services/risk-atlas'],
    migTokens: ['risk_atlas', 'atlas'],
    docDirs: ['docs/risk-atlas', 'docs/atlas'],
    marketingDocs: ['docs/marketing/risk-atlas.md'],
    archTokens: ['risk-atlas', 'atlas'],
  },
  {
    pillar: 'coding',
    // Coding pages are not under one folder — they're top-level pages with various names.
    pagePatterns: [
      'src/pages/Coding', 'src/pages/CodeReview', 'src/pages/Script',
      'src/pages/Instruction', 'src/pages/Alignment',
    ],
    toggle: 'cross',
    serviceGlobs: ['coding-'],
    migTokens: ['coding'],   // Coding shares schema with hardware; the codebase has no `*coding*.sql` migrations
    docDirs: ['docs/coding'],
    marketingDocs: ['docs/marketing/coding.md'],
    archTokens: ['25-coding-area'],
    sharedInfraFloor: 0.6,  // heavy reuse of unified-llm-client + persona panels + Hardware (Tier 5) shares schema
  },
  {
    pillar: 'hardware',
    pagePatterns: ['src/pages/Hardware'],
    toggle: 'cross',
    // Hardware spans more service files than the obvious hkp-/hardware- prefixes:
    // diagnose / humanitarian / cve-applicability / extend-device / lifecycle-feed
    // are all hardware-pillar surfaces.
    servicePaths: ['server/services/quality-adapters'],
    serviceGlobs: [
      'hkp-', 'hardware-', 'diagnose-', 'diagnostic-',
      'humanitarian-', 'cve-applicability', 'extend-device', 'lifecycle-feed',
      'maintain-', 'photo-id-',
    ],
    migTokens: ['hardware', 'esp32', 'hkp', 'hw_'],
    docDirs: ['docs/hardware'],
    marketingDocs: ['docs/marketing/tier5-hardware-build.md', 'docs/marketing/hardware.md', 'docs/marketing/humanitarian-deployment-kit.md'],
    archTokens: ['hardware', '25-coding-area'],
  },
  {
    pillar: 'beehive',
    pagePatterns: ['src/pages/community/Beehive'],
    toggle: 'cross',
    servicePaths: ['server/services/beehive'],
    migTokens: ['beehive'],
    docDirs: ['docs/beehive'],
    marketingDocs: ['docs/marketing/beehive.md'],
    archTokens: ['beehive'],
  },
  {
    pillar: 'agents',
    pagePatterns: ['src/pages/agents/'],
    toggle: 'cross',
    serviceGlobs: ['agent-', 'remote-agent-'],
    migTokens: ['agents', 'specialized_agents'],
    docDirs: ['docs/agents'],
    marketingDocs: ['docs/marketing/specialized-agents.md', 'docs/marketing/agents.md'],
    archTokens: ['agents', '27-specialized-agents'],
  },
];

// ── Filesystem helpers ────────────────────────────────────────────────

function walk(dir: string, predicate: (path: string) => boolean): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  let stack: string[] = [dir];
  while (stack.length) {
    const next = stack.pop()!;
    let entries: string[] = [];
    try { entries = readdirSync(next); } catch { continue; }
    for (const e of entries) {
      const full = join(next, e);
      let s; try { s = statSync(full); } catch { continue; }
      if (s.isDirectory()) {
        if (e === 'node_modules' || e === '.git' || e === 'dist' || e === '.next') continue;
        stack.push(full);
      } else if (predicate(full)) {
        out.push(full);
      }
    }
  }
  return out;
}

const ALL_PAGES = walk(join(ROOT, 'src/pages'), (p) => p.endsWith('.tsx'));
const ALL_SERVICES = walk(join(ROOT, 'server/services'), (p) => p.endsWith('.ts') && !p.endsWith('.test.ts'));
const ALL_MIGRATIONS = existsSync(join(ROOT, 'server/db/migrations-pg'))
  ? readdirSync(join(ROOT, 'server/db/migrations-pg')).filter(f => f.endsWith('.sql'))
  : [];
const ALL_TEST_FILES = walk(join(ROOT, 'tests'), (p) => p.endsWith('.test.ts'));
const ALL_TEST_BASENAMES = new Set<string>(
  ALL_TEST_FILES.map(f => basename(f, '.test.ts'))
);
const ARCH_DIAGRAMS = existsSync(join(ROOT, 'docs/architecture'))
  ? walk(join(ROOT, 'docs/architecture'), (p) => p.endsWith('.md')).map(f => relative(ROOT, f))
  : [];

// ── Per-dimension scorers ─────────────────────────────────────────────

function relPath(p: string): string { return relative(ROOT, p).replace(/\\/g, '/'); }

function pagesFor(p: PillarDef): string[] {
  return ALL_PAGES.filter(page => {
    const r = relPath(page);
    return p.pagePatterns.some(pattern => r.includes(pattern.replace(/\\/g, '/')));
  });
}

function servicesFor(p: PillarDef): string[] {
  const matched = new Set<string>();
  // Path-based: any service file under one of the listed directories.
  for (const sp of p.servicePaths ?? []) {
    const abs = join(ROOT, sp).replace(/\\/g, '/');
    for (const svc of ALL_SERVICES) {
      const r = svc.replace(/\\/g, '/');
      if (r.startsWith(abs)) matched.add(svc);
    }
  }
  // Glob-based: basename starts with the prefix (we pass prefixes ending in '-' or '_').
  for (const g of p.serviceGlobs ?? []) {
    for (const svc of ALL_SERVICES) {
      const base = basename(svc, '.ts');
      if (base.startsWith(g) || base === g.replace(/-$/, '') || base.includes('/' + g)) {
        matched.add(svc);
      }
    }
  }
  return [...matched];
}

function migrationsFor(p: PillarDef): string[] {
  return ALL_MIGRATIONS.filter(f => p.migTokens.some(t => f.includes(t)));
}

function testedServicesFor(p: PillarDef, services: string[]): number {
  let count = 0;
  for (const svc of services) {
    const base = basename(svc, '.ts');
    if (ALL_TEST_BASENAMES.has(base)) count++;
  }
  return count;
}

interface DocPresence { marketing: boolean; contributor: boolean; arch: boolean }
function docPresenceFor(p: PillarDef): DocPresence {
  const marketing = p.marketingDocs.some(m => existsSync(join(ROOT, m)));
  const contributor = p.docDirs.some(d => {
    const abs = join(ROOT, d);
    if (!existsSync(abs)) return false;
    try { return statSync(abs).isDirectory() && readdirSync(abs).some(f => f.endsWith('.md')); } catch { return false; }
  });
  const arch = ARCH_DIAGRAMS.some(d => p.archTokens.some(t => d.toLowerCase().includes(t.toLowerCase())));
  return { marketing, contributor, arch };
}

// ── Composite ─────────────────────────────────────────────────────────

interface PillarScore {
  pillar: string;
  ui: number;
  service: number;
  schema: number;
  test: number;
  doc: number;
  composite: number;
  pageCount: number;
  serviceCount: number;
  testedCount: number;
  migCount: number;
  docDetail: DocPresence;
}

function scorePillar(p: PillarDef): PillarScore {
  const pages = pagesFor(p);
  const services = servicesFor(p);
  const tested = testedServicesFor(p, services);
  const migrations = migrationsFor(p);
  const docs = docPresenceFor(p);

  const uiRaw = Math.min(1, pages.length / 5);
  const ui = p.toggle === 'path' ? +(uiRaw * 0.75).toFixed(2) : +uiRaw.toFixed(2);
  const serviceRaw = Math.min(1, services.length / 10);
  // Phase A: apply sharedInfraFloor for pillars that intentionally share infrastructure.
  const service = +Math.max(serviceRaw, p.sharedInfraFloor ?? 0).toFixed(2);
  const schema = +Math.min(1, migrations.length / 5).toFixed(2);
  const test = services.length === 0 ? 0 : +(tested / services.length).toFixed(2);
  const docCount = (docs.marketing ? 1 : 0) + (docs.contributor ? 1 : 0) + (docs.arch ? 1 : 0);
  const doc = +(docCount / 3).toFixed(2);

  const composite = +(ui * 0.25 + service * 0.25 + schema * 0.20 + test * 0.15 + doc * 0.15).toFixed(2);

  return {
    pillar: p.pillar,
    ui, service, schema, test, doc, composite,
    pageCount: pages.length,
    serviceCount: services.length,
    testedCount: tested,
    migCount: migrations.length,
    docDetail: docs,
  };
}

function actionFor(composite: number): string {
  if (composite < 0.4) return '🔴 Completion sprint required';
  if (composite < 0.6) return '🟡 Schedule completion sprint';
  if (composite < 0.85) return '🟢 Polish (specific gap)';
  return '✅ Maintain';
}

// ── Output ────────────────────────────────────────────────────────────

const sha = (() => {
  try { return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim(); }
  catch { return 'unknown'; }
})();

const date = new Date().toISOString().slice(0, 10);

const scores = PILLARS.map(scorePillar).sort((a, b) => a.composite - b.composite);

console.log(`# Pillar Maturity Score (v2)`);
console.log();
console.log(`**Generated:** ${date} UTC`);
console.log(`**Commit:** \`${sha}\``);
console.log(`**Pattern:** G.8 v2 (precision rewrite — TypeScript)`);
console.log();
console.log(`For each pillar / cross-pillar surface: scores from 0.0–1.0 across five dimensions, plus a weighted composite. Sorted **ascending** by composite (least mature first — these are the priority targets).`);
console.log();
console.log(`The \`work\` pillar is intentionally exempt — it's the universal substrate every other pillar uses, not a measurable per-pillar surface (decided 2026-04-26 PM).`);
console.log();
console.log(`## Methodology`);
console.log();
console.log(`| Dimension | Weight | Score formula |`);
console.log(`|---|---|---|`);
console.log(`| UI | 25% | min(1.0, pages / 5) · path-routed = ×0.75 |`);
console.log(`| Service | 25% | min(1.0, services / 10) — discovery via servicePaths + serviceGlobs |`);
console.log(`| Schema | 20% | min(1.0, dedicated_migrations / 5) — multi-token match |`);
console.log(`| Test | 15% | services_with_tests / total_services — Set lookup over all *.test.ts basenames |`);
console.log(`| Doc | 15% | (marketing + contributor-docs-dir + arch-diagram) / 3 |`);
console.log();
console.log(`Composite < 0.85 is the new pass threshold (raised from 0.6 per the planning session).`);
console.log();
console.log(`## Results`);
console.log();
console.log(`| Pillar | UI | Service | Schema | Test | Doc | Composite | Action |`);
console.log(`|---|---|---|---|---|---|---|---|`);
for (const s of scores) {
  console.log(`| ${s.pillar.padEnd(12)} | ${s.ui.toFixed(2)} | ${s.service.toFixed(2)} | ${s.schema.toFixed(2)} | ${s.test.toFixed(2)} | ${s.doc.toFixed(2)} | **${s.composite.toFixed(2)}** | ${actionFor(s.composite)} |`);
}

console.log();
console.log(`## Raw counts (for transparency)`);
console.log();
console.log(`| Pillar | Pages | Services | Tested | Migrations | Marketing? | Contrib? | Arch? |`);
console.log(`|---|---|---|---|---|---|---|---|`);
for (const s of scores) {
  const m = s.docDetail.marketing ? '✓' : '·';
  const c = s.docDetail.contributor ? '✓' : '·';
  const a = s.docDetail.arch ? '✓' : '·';
  console.log(`| ${s.pillar.padEnd(12)} | ${s.pageCount} | ${s.serviceCount} | ${s.testedCount} | ${s.migCount} | ${m} | ${c} | ${a} |`);
}

console.log();
console.log(`## Decision rule`);
console.log();
console.log(`- **🔴 < 0.40** — completion sprint required, pause feature work`);
console.log(`- **🟡 0.40–0.60** — schedule sprint within the quarter`);
console.log(`- **🟢 0.60–0.85** — identify lowest-scoring dimension, plan one focused PR`);
console.log(`- **✅ ≥ 0.85** — maintain`);
console.log();
console.log(`## What changed in v2`);
console.log();
console.log(`- Service discovery now traverses subdirectories (was: \`-iname\` glob that missed nested dirs).`);
console.log(`- Test detection loads all \`*.test.ts\` basenames into a Set once, then O(1) lookups per service.`);
console.log(`- Schema discovery accepts multiple migration tokens per pillar.`);
console.log(`- Doc discovery checks multiple marketing-doc paths + plural variants of contributor-docs dir.`);
console.log(`- Architecture-diagram detection accepts dedicated diagrams AND shared diagrams that mention the pillar.`);
console.log(`- The \`work\` pillar is exempt (it's the substrate, not a measurable surface).`);
console.log();
