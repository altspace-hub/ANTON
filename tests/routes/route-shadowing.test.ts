/**
 * route-shadowing.test.ts — repo-wide guard against Express route shadowing.
 *
 * Express matches routes in REGISTRATION order. A parameterised route registered before
 * a literal one on the same method and segment count swallows it: `/connections/:id`
 * declared first means `/connections/scripts` is never reached, and the caller gets that
 * handler's "not found" instead.
 *
 * This is a nasty bug class for three reasons:
 *
 *   - the symptom is a plausible 404 from the WRONG handler, so the error message points
 *     at the wrong thing entirely ("Atlas not found" for a request that never mentioned
 *     an atlas id);
 *   - the page looks like a feature that simply has no data yet;
 *   - nothing fails loudly, so it survives indefinitely.
 *
 * Found live on six endpoints. Every one had been dead since it was written:
 *
 *   GET /api/connections/scripts            -> {"error":"Connection not found"}
 *   GET /api/atlas/packs                    -> {"error":"Atlas not found or access denied"}
 *   GET /api/coding/review/sessions         -> {"error":"Review session not found"}
 *   GET /api/jobs/saved-searches            -> {"error":"Job not found"}
 *   GET /api/jobs/profile                   -> {"error":"Job not found"}
 *   GET /api/markets/predictions/track-record -> {"error":"Prediction not found"}
 *
 * `/atlas/packs` is the Risk Atlas industry-pack list — a documented headline feature
 * (CLAUDE.md, 33 packs) that has never returned a pack.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const ROUTES_DIR = join(process.cwd(), 'server', 'routes');

interface Registration { file: string; method: string; path: string; index: number }

function allRegistrations(): Registration[] {
  const out: Registration[] = [];
  for (const file of readdirSync(ROUTES_DIR).filter((f) => f.endsWith('.ts'))) {
    const src = readFileSync(join(ROUTES_DIR, file), 'utf8');
    for (const m of src.matchAll(/router\.(get|post|put|patch|delete)\(\s*'([^']+)'/g)) {
      out.push({ file, method: m[1], path: m[2], index: m.index! });
    }
  }
  return out;
}

/** Does `pattern` (which may contain :params) match the literal `path`? */
function patternMatches(pattern: string, path: string): boolean {
  const p = pattern.split('/').filter(Boolean);
  const l = path.split('/').filter(Boolean);
  // Express matches on segment count unless the pattern is a wildcard, which this
  // codebase does not use in router registrations.
  if (p.length !== l.length) return false;
  return p.every((seg, i) => seg.startsWith(':') || seg === l[i]);
}

describe('no literal route is shadowed by an earlier parameterised one', () => {
  it('finds a substantial number of registrations', () => {
    // Guards the regex: if it silently stopped matching, every assertion below would
    // pass vacuously over an empty set — which is exactly the failure mode this whole
    // file exists to catch, in a different guise.
    expect(allRegistrations().length).toBeGreaterThan(500);
  });

  it('scans every route file', () => {
    const files = new Set(allRegistrations().map((r) => r.file));
    expect(files.size).toBeGreaterThan(50);
  });

  it('reports zero shadowed literals', () => {
    const regs = allRegistrations();
    const shadowed: string[] = [];

    for (const lit of regs) {
      if (lit.path.split('/').some((s) => s.startsWith(':'))) continue;   // only literals
      for (const par of regs) {
        if (par.file !== lit.file) continue;          // registration order is per-router
        if (par.index >= lit.index) continue;         // must come FIRST to shadow
        if (par.method !== lit.method) continue;
        if (par.path === lit.path) continue;          // exact dupes: separate test below
        if (!par.path.includes(':')) continue;        // literal-vs-literal is a dupe
        if (patternMatches(par.path, lit.path)) {
          shadowed.push(`${lit.file}: ${lit.method.toUpperCase()} ${lit.path} is swallowed by earlier ${par.path}`);
        }
      }
    }

    expect(shadowed, `move the literal route ABOVE the parameterised one:\n  ${shadowed.join('\n  ')}`)
      .toEqual([]);
  });
});

describe('no route is registered twice in the same file', () => {
  /**
   * Reported separately because the fix is different. A shadowed literal just needs
   * moving; a duplicate means two handlers exist for one path and somebody has to decide
   * which is correct — Express silently takes the first and the second is dead code.
   */
  /**
   * KNOWN, UNRESOLVED — needs a product decision, not a code change.
   *
   * school.ts registers three lesson routes twice, over two DIFFERENT tables, and two
   * separate page-families in the frontend call the same paths expecting different
   * backends:
   *
   *   LessonBuilderPage / LessonLibraryPage           -> teacher_lessons (first, wins)
   *   SchoolCurriculumPage / SchoolLessonBuilderPage  -> school_lessons  (dead)
   *
   * The school_lessons cluster is dead at BOTH ends: its list/get/create are swallowed
   * here, and App.tsx separately registers /school/curriculum twice so
   * CurriculumRegistryPage wins over SchoolCurriculumPage. Its PATCH/DELETE/progress
   * routes ARE reachable (unique paths), so the layer is half-alive — which is worse
   * than either whole answer.
   *
   * Deciding which lesson model is canonical means deleting roughly 1,180 lines of one
   * of them. That is an owner's call. Listed here rather than silently deleted, and
   * rather than deleting the assertion — an allow-list entry is documentation that
   * survives; a removed test is not.
   */
  const KNOWN_DUPLICATES = [
    'school.ts GET /school/lessons',
    'school.ts GET /school/lessons/:id',
    'school.ts POST /school/lessons',
  ];

  it('reports zero NEW exact duplicates', () => {
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const r of allRegistrations()) {
      const key = `${r.file} ${r.method} ${r.path}`;
      const label = `${r.file} ${r.method.toUpperCase()} ${r.path}`;
      if (seen.has(key) && !KNOWN_DUPLICATES.includes(label)) {
        dupes.push(`${label} registered twice — the second is unreachable`);
      }
      seen.add(key);
    }
    expect(dupes, dupes.join('\n  ')).toEqual([]);
  });

  it('the known duplicates still exist, so the allow-list cannot rot', () => {
    // If someone resolves them, this fails and the entry gets deleted. An allow-list
    // that outlives its subject is how a guard quietly stops guarding.
    const seen = new Set<string>();
    const found: string[] = [];
    for (const r of allRegistrations()) {
      const key = `${r.file} ${r.method} ${r.path}`;
      const label = `${r.file} ${r.method.toUpperCase()} ${r.path}`;
      if (seen.has(key) && KNOWN_DUPLICATES.includes(label)) found.push(label);
      seen.add(key);
    }
    expect(found.sort()).toEqual([...KNOWN_DUPLICATES].sort());
  });
});

describe('the specific routes that were dead stay ordered', () => {
  // Belt and braces: the general check above would catch a regression, but naming them
  // means a failure says WHICH feature broke rather than just "shadowing detected".
  it.each([
    ['connections.ts', 'get', '/connections/scripts', '/connections/:id'],
    ['atlas.ts', 'get', '/atlas/packs', '/atlas/:id'],
    ['coding-review.ts', 'get', '/coding/review/sessions', '/coding/review/:id'],
    ['jobs.ts', 'get', '/jobs/saved-searches', '/jobs/:id'],
    ['jobs.ts', 'get', '/jobs/profile', '/jobs/:id'],
    ['market-theses.ts', 'get', '/markets/predictions/track-record', '/markets/predictions/:id'],
  ])('%s: %s %s precedes %s', (file, method, literal, param) => {
    const src = readFileSync(join(ROUTES_DIR, file), 'utf8');
    const lit = src.indexOf(`router.${method}('${literal}'`);
    const par = src.indexOf(`router.${method}('${param}'`);
    expect(lit, `${literal} not found in ${file}`).toBeGreaterThan(-1);
    expect(par, `${param} not found in ${file}`).toBeGreaterThan(-1);
    expect(lit).toBeLessThan(par);
  });
});
