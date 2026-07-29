/**
 * connections-scripts-and-test.test.ts — two dead flagship buttons.
 *
 * 1. THE SCRIPT LIBRARY WAS PERMANENTLY EMPTY, for two stacked reasons:
 *
 *    a. `/connections/:id` was registered BEFORE `/connections/scripts`, and Express
 *       matches in registration order — so the list request hit the by-id handler with
 *       id='scripts' and got {"error":"Connection not found"}. Confirmed against the
 *       running server before the fix.
 *    b. the handler called `res.json(manager.listScripts())` with no await. listScripts
 *       is async, and a Promise serialises to `{}` — so fixing only the route would have
 *       returned an empty object and the UI would have called setScripts({}) on it.
 *
 *    Either bug alone hides the other. That is why the route fix was verified live
 *    rather than assumed: the 200 came back as `{}`, which is what exposed (b).
 *
 * 2. THE WIZARD'S TEST BUTTON COULD NOT FAIL. It slept 600ms and set { ok: true }
 *    unconditionally, with the message "Configuration validated". Someone entering the
 *    wrong database password got a green tick, saved, and found out when a workflow
 *    failed. A test that always passes is worse than no test button: it converts "I
 *    should check this" into false confidence.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n');
const ROUTES = read('server/routes/connections.ts');
const WIZARD = read('src/features/connections/ConnectionWizard.tsx');
const MANAGER = read('server/services/connection-manager.ts');

/** Every route registration in this file, in order. */
function registrations(): Array<{ method: string; path: string; index: number }> {
  return [...ROUTES.matchAll(/router\.(get|post|put|patch|delete)\('([^']+)'/g)].map((m) => ({
    method: m[1],
    path: m[2],
    index: m.index!,
  }));
}

describe('literal routes are registered before the parameterised ones that would shadow them', () => {
  it('no literal path is shadowed by an earlier :param route on the same method', () => {
    // A general guard, not a spot-fix. The specific victim was /connections/scripts, but
    // the mistake is easy to repeat every time a sub-resource is added, and the symptom
    // — a plausible 404 from the wrong handler — never points at route ordering.
    const regs = registrations();
    const shadowed: string[] = [];

    for (const literal of regs) {
      const litSegs = literal.path.split('/').filter(Boolean);
      if (litSegs.some((s) => s.startsWith(':'))) continue;   // only literals can be shadowed

      for (const param of regs) {
        if (param.index >= literal.index) continue;           // must be registered EARLIER
        if (param.method !== literal.method) continue;
        const parSegs = param.path.split('/').filter(Boolean);
        if (parSegs.length !== litSegs.length) continue;      // Express matches segment count

        const matches = parSegs.every((seg, i) => seg.startsWith(':') || seg === litSegs[i]);
        if (matches) shadowed.push(`${literal.method.toUpperCase()} ${literal.path} shadowed by ${param.path}`);
      }
    }

    expect(shadowed).toEqual([]);
  });

  it('specifically, GET /connections/scripts precedes GET /connections/:id', () => {
    const scripts = ROUTES.indexOf(`router.get('/connections/scripts'`);
    const byId = ROUTES.indexOf(`router.get('/connections/:id'`);
    expect(scripts).toBeGreaterThan(-1);
    expect(byId).toBeGreaterThan(-1);
    expect(scripts).toBeLessThan(byId);
  });
});

describe('the scripts handler awaits its async call', () => {
  it('awaits listScripts', () => {
    // res.json(Promise) serialises to {} — a plausible-looking empty result rather than
    // an error, which is why this survived behind the routing bug.
    expect(ROUTES).toMatch(/res\.json\(await manager\.listScripts\(\)\)/);
    expect(ROUTES).not.toMatch(/res\.json\(manager\.listScripts\(\)\)/);
  });

  it('listScripts really is async, so the await is load-bearing', () => {
    // Guards the assertion above from becoming decorative if the method ever changes.
    expect(MANAGER).toMatch(/async listScripts\(\)/);
  });
});

describe('the wizard runs a test that can fail', () => {
  it('calls the pre-save endpoint instead of sleeping', () => {
    expect(WIZARD).toMatch(/fetch\('\/api\/connections\/test'/);
    expect(WIZARD).not.toMatch(/setTimeout\(r, 600\)/);
  });

  it('derives the verdict from the response, not from a literal', () => {
    const fn = WIZARD.slice(WIZARD.indexOf('const handleTest'), WIZARD.indexOf('const handleSave'));
    expect(fn).toMatch(/ok: data\.ok === true/);
    // The specific thing that made the old one useless.
    expect(fn).not.toMatch(/setTestResult\(\{\s*ok:\s*true/);
  });

  it('reports a failed request as a failed test', () => {
    const fn = WIZARD.slice(WIZARD.indexOf('const handleTest'), WIZARD.indexOf('const handleSave'));
    expect(fn).toMatch(/catch \(e\)/);
    expect(fn).toMatch(/ok: false/);
  });
});

describe('the pre-save endpoint is real and safe', () => {
  it('exists and is admin-gated like the other mutating routes', () => {
    expect(ROUTES).toMatch(/router\.post\('\/connections\/test', requireAdminOrSolo/);
  });

  it('is registered before /connections/:id so it is reachable', () => {
    const test = ROUTES.indexOf(`router.post('/connections/test'`);
    const byId = ROUTES.indexOf(`router.get('/connections/:id'`);
    expect(test).toBeLessThan(byId);
  });

  it('validates its input rather than trusting the body', () => {
    const fn = ROUTES.slice(ROUTES.indexOf(`router.post('/connections/test'`));
    expect(fn.slice(0, 900)).toMatch(/status\(400\)/);
  });

  it('persists nothing — the config stays in the request', () => {
    const fn = ROUTES.slice(
      ROUTES.indexOf(`router.post('/connections/test'`),
      ROUTES.indexOf(`router.get('/connections/:id'`),
    );
    expect(fn).not.toMatch(/INSERT INTO|UPDATE connections/);
  });

  it('shares the real test logic rather than reimplementing it', () => {
    // Two copies of "how do I check a database connection" would drift, and the wizard's
    // copy is the one nobody would notice going stale.
    expect(ROUTES).toMatch(/manager\.testConfig\(/);
    expect(MANAGER).toMatch(/async testConfig\(/);
    const test = MANAGER.slice(MANAGER.indexOf('async test(id: string)'));
    expect(test.slice(0, 900)).toMatch(/this\.testConfig\(/);
  });

  it('still persists the result for the saved-connection path', () => {
    // testConfig is pure; test() keeps the last_tested bookkeeping.
    const test = MANAGER.slice(MANAGER.indexOf('async test(id: string)'));
    expect(test.slice(0, 900)).toMatch(/UPDATE connections SET last_tested/);
  });
});
