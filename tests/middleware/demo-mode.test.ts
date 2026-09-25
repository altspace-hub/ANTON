/**
 * demo-mode.test.ts — DEMO_MODE (public showcase, 2026-09-25): the switch,
 * the background jobs it forces off, the /api/config fields and the route
 * allowlist a non-admin visitor lives inside.
 *
 * The allowlist is driven through a real Express app: the middleware sits
 * where index.ts mounts it (after the user is known), and every route behind
 * it answers 200, so a 404 can only come from the allowlist. Every refusal
 * has a negative control — the same request outside demo mode, or from an
 * admin, gets through.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  isDemoMode, demoModeStartupProblem, applyDemoModeOverrides, DEMO_FORCED_FLAGS,
  demoPublicConfig, demoEnabledPillars, demoSignupPolicy, demoAccountTtlDays,
  demoRouteAllowed, demoRouteRules, createDemoAllowlistMiddleware, demoModeWarnings,
} from '../../server/middleware/demo-mode.js';

const ENV_KEYS = [
  'DEMO_MODE', 'DEPLOYMENT_MODE', 'DEMO_ENABLED_PILLARS', 'DEMO_EXTRA_ROUTES', 'DEMO_OFFERED_MODELS',
  'DEMO_SIGNUP_CODE', 'DEMO_SIGNUP_OPEN', 'DEMO_ACCOUNT_TTL_DAYS',
];
const saved: Record<string, string | undefined> = {};
for (const k of ENV_KEYS) saved[k] = process.env[k];
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
  }
});

describe('the DEMO_MODE switch', () => {
  it('is on only for DEMO_MODE=true', () => {
    expect(isDemoMode({ DEMO_MODE: 'true' })).toBe(true);
    expect(isDemoMode({ DEMO_MODE: ' TRUE ' })).toBe(true);
    expect(isDemoMode({ DEMO_MODE: 'false' })).toBe(false);
    expect(isDemoMode({ DEMO_MODE: '1' })).toBe(false);
    expect(isDemoMode({})).toBe(false);
  });

  it('refuses to start a demo outside team mode (every solo visitor would be an admin)', () => {
    expect(demoModeStartupProblem({ DEMO_MODE: 'true', DEPLOYMENT_MODE: 'solo' })).toMatch(/requires DEPLOYMENT_MODE=team/);
    expect(demoModeStartupProblem({ DEMO_MODE: 'true' })).toMatch(/requires DEPLOYMENT_MODE=team/);
    expect(demoModeStartupProblem({ DEMO_MODE: 'true', DEPLOYMENT_MODE: 'team' })).toBeNull();
    expect(demoModeStartupProblem({ DEPLOYMENT_MODE: 'solo' })).toBeNull();
  });

  it('refuses to start with a spend cap it cannot read, naming the variable and not its value', () => {
    const team = { DEMO_MODE: 'true', DEPLOYMENT_MODE: 'team' };
    const comma = demoModeStartupProblem({ ...team, LLM_USER_DAILY_SPEND_CAP_USD: '0,25' });
    expect(comma).toMatch(/FATAL: LLM_USER_DAILY_SPEND_CAP_USD/);
    expect(comma).not.toContain('0,25');
    expect(demoModeStartupProblem({ ...team, LLM_DAILY_SPEND_CAP_USD: '$3' })).toMatch(/FATAL: LLM_DAILY_SPEND_CAP_USD/);
    // 0 means "no cap": it starts, with a warning.
    expect(demoModeStartupProblem({ ...team, LLM_DAILY_SPEND_CAP_USD: '0' })).toBeNull();
    expect(demoModeWarnings({ ...team, LLM_DAILY_SPEND_CAP_USD: '0' }).some((w) => w.startsWith('LLM_DAILY_SPEND_CAP_USD'))).toBe(true);
    // Negative control: readable caps start with no cap warning.
    const ok = { ...team, LLM_DAILY_SPEND_CAP_USD: '3', LLM_USER_DAILY_SPEND_CAP_USD: '0.25' };
    expect(demoModeStartupProblem(ok)).toBeNull();
    expect(demoModeWarnings(ok).some((w) => w.includes('SPEND_CAP'))).toBe(false);
  });

  it('forces Markets, the missions runner, the memory sweep and radar automation off, whatever the .env says', () => {
    const env: Record<string, string | undefined> = {
      DEMO_MODE: 'true', DEPLOYMENT_MODE: 'team',
      MARKETS_SCHEDULE_DISABLED: 'false', MISSIONS_RUNNER_DISABLED: 'false', RADAR_AUTOMATION_DISABLED: 'true',
    };
    const changed = applyDemoModeOverrides(env);
    for (const [name, value] of Object.entries(DEMO_FORCED_FLAGS)) expect(env[name]).toBe(value);
    expect(changed.sort()).toEqual(['MARKETS_SCHEDULE_DISABLED', 'MEMORY_SWEEP_DISABLED', 'MISSIONS_RUNNER_DISABLED']);
    expect(Object.keys(DEMO_FORCED_FLAGS).sort()).toEqual(
      ['MARKETS_SCHEDULE_DISABLED', 'MEMORY_SWEEP_DISABLED', 'MISSIONS_RUNNER_DISABLED', 'RADAR_AUTOMATION_DISABLED'],
    );
  });

  it('changes nothing outside demo mode', () => {
    const env: Record<string, string | undefined> = { MARKETS_SCHEDULE_DISABLED: 'false' };
    expect(applyDemoModeOverrides(env)).toEqual([]);
    expect(env).toEqual({ MARKETS_SCHEDULE_DISABLED: 'false' });
  });

  it('index.ts applies the overrides before the first scheduler reads its flag, and refuses a solo demo', () => {
    const src = readFileSync(join(__dirname, '../../server/index.ts'), 'utf8');
    const overrides = src.indexOf('applyDemoModeOverrides()');
    const startup = src.indexOf('demoModeStartupProblem()');
    expect(startup).toBeGreaterThan(0);
    expect(overrides).toBeGreaterThan(0);
    // The radar boot block reads its flag through isRadarAutomationDisabled() (radar-fetcher.ts).
    for (const reader of ['startMemorySweep(db)', "process.env.MISSIONS_RUNNER_DISABLED === 'true'", 'process.env.MARKETS_SCHEDULE_DISABLED', 'if (isRadarAutomationDisabled())']) {
      const at = src.indexOf(reader);
      expect(at, reader).toBeGreaterThan(overrides);
    }
  });

  it('warns about a key or engine that would reach Claude, and about missing spend caps', () => {
    const w = demoModeWarnings({ DEMO_MODE: 'true', ANTHROPIC_API_KEY: 'sk-x', SDK_ENGINE_ENABLED: 'true', DEMO_ENABLED_PILLARS: 'work,bogus' });
    expect(w.join('\n')).toMatch(/ANTHROPIC_API_KEY/);
    expect(w.join('\n')).toMatch(/SDK_ENGINE_ENABLED/);
    expect(w.join('\n')).toMatch(/LLM_DAILY_SPEND_CAP_USD/);
    expect(w.join('\n')).toMatch(/"bogus"/);
    // No value is ever echoed.
    expect(w.join('\n')).not.toContain('sk-x');
    expect(demoModeWarnings({ ANTHROPIC_API_KEY: 'sk-x' })).toEqual([]);
  });
});

describe('/api/config demo fields', () => {
  it('is { demoMode: false } and nothing else outside demo mode', () => {
    expect(demoPublicConfig({ DEPLOYMENT_MODE: 'team', DEMO_OFFERED_MODELS: 'x', DEMO_SIGNUP_CODE: 'c' })).toEqual({ demoMode: false });
  });

  it('carries the offered models, pillars, sign-up state, retention and privacy path in demo mode', () => {
    const cfg = demoPublicConfig({
      DEMO_MODE: 'true', DEPLOYMENT_MODE: 'team',
      DEMO_OFFERED_MODELS: ' compat:openrouter:z-ai/glm-5.3-flash , compat:openrouter:z-ai/glm-5.3-flash,compat:openrouter:inclusionai/ling-3.0-flash-vl',
      DEMO_ENABLED_PILLARS: 'Pathfinder, markets',
      DEMO_SIGNUP_CODE: 'swordfish',
      DEMO_ACCOUNT_TTL_DAYS: '14',
    });
    expect(cfg).toEqual({
      demoMode: true,
      offeredModels: ['compat:openrouter:z-ai/glm-5.3-flash', 'compat:openrouter:inclusionai/ling-3.0-flash-vl'],
      enabledPillars: ['work', 'pathfinder', 'markets'],
      signupOpen: true,
      signupCodeRequired: true,
      retentionDays: 14,
      privacyPath: '/privacy',
    });
    // The code itself is never published.
    expect(JSON.stringify(cfg)).not.toContain('swordfish');
  });

  it('sign-up: a code opens it; no code is closed unless DEMO_SIGNUP_OPEN=true', () => {
    expect(demoSignupPolicy({ DEMO_SIGNUP_CODE: ' abc ' })).toEqual({ open: true, code: 'abc' });
    expect(demoSignupPolicy({})).toEqual({ open: false, code: null });
    expect(demoSignupPolicy({ DEMO_SIGNUP_OPEN: 'true' })).toEqual({ open: true, code: null });
    expect(demoSignupPolicy({ DEMO_SIGNUP_CODE: '   ', DEMO_SIGNUP_OPEN: 'false' })).toEqual({ open: false, code: null });
  });

  it('work is always enabled; unknown pillars are ignored; the TTL is clamped', () => {
    expect(demoEnabledPillars({})).toEqual(['work']);
    expect(demoEnabledPillars({ DEMO_ENABLED_PILLARS: 'nonsense,school' })).toEqual(['work', 'school']);
    expect(demoAccountTtlDays({})).toBe(30);
    expect(demoAccountTtlDays({ DEMO_ACCOUNT_TTL_DAYS: '0' })).toBe(1);
    expect(demoAccountTtlDays({ DEMO_ACCOUNT_TTL_DAYS: 'x' })).toBe(30);
  });
});

describe('the route allowlist (pure)', () => {
  const rules = demoRouteRules({ DEMO_MODE: 'true' });
  const allowed = (m: string, p: string) => demoRouteAllowed(m, p, rules);

  it('lets a visitor run a module and handle its own sessions, uploads and exports', () => {
    for (const [m, p] of [
      ['POST', '/claude/message'], ['GET', '/claude/models'], ['GET', '/modules/aml-gap-analysis'],
      ['GET', '/modules/aml-gap-analysis/prompt'], ['GET', '/sessions'], ['POST', '/sessions'],
      ['GET', '/sessions/abc'], ['PATCH', '/sessions/abc'], ['DELETE', '/sessions/abc'],
      ['POST', '/files/upload'], ['POST', '/export'], ['GET', '/settings/default-model'],
      ['GET', '/csrf-token'], ['GET', '/health'], ['HEAD', '/health'], ['GET', '/run-artifacts/by-parent/message/m1'],
      ['GET', '/sessions/'], ['GET', '/SESSIONS/abc'],
    ] as const) {
      expect(allowed(m, p), `${m} ${p}`).toBe(true);
    }
  });

  it('refuses everything else, including writes to what it may read', () => {
    for (const [m, p] of [
      ['GET', '/agents'], ['POST', '/agents/x/connectors'], ['POST', '/data/import'], ['GET', '/markets/theses'],
      ['POST', '/custom-modules'], ['PATCH', '/custom-modules/x'], ['POST', '/sessions/abc/share'],
      ['POST', '/settings/default-model'], ['POST', '/settings/model-endpoints'], ['GET', '/settings/custom-models'],
      ['PUT', '/profile'], ['GET', '/files/upload/extra'], ['GET', '/pathfinder/threads'], ['POST', '/renderers/run'],
      ['POST', '/rerun'], ['GET', '/admin/users'], ['POST', '/radar/settings'], ['GET', '/sessionsX'],
      ['GET', '//agents'], ['POST', '/claude/deliberate'], ['POST', '/auth/mfa/enable'],
    ] as const) {
      expect(allowed(m, p), `${m} ${p}`).toBe(false);
    }
  });

  it('an enabled pillar adds its API prefix — and only then', () => {
    expect(allowed('GET', '/pathfinder/threads')).toBe(false);
    const withPathfinder = demoRouteRules({ DEMO_MODE: 'true', DEMO_ENABLED_PILLARS: 'pathfinder' });
    expect(demoRouteAllowed('GET', '/pathfinder/threads', withPathfinder)).toBe(true);
    expect(demoRouteAllowed('POST', '/pathfinder/search', withPathfinder)).toBe(true);
    expect(demoRouteAllowed('GET', '/pathfinderx', withPathfinder)).toBe(false);
    expect(demoRouteAllowed('GET', '/markets/theses', withPathfinder)).toBe(false);
  });

  it('DEMO_EXTRA_ROUTES adds prefixes, optionally for one method', () => {
    const extra = demoRouteRules({ DEMO_MODE: 'true', DEMO_EXTRA_ROUTES: '/renderers, POST:/rerun, not-a-path, GET|POST:/quality/' });
    expect(demoRouteAllowed('POST', '/renderers/run', extra)).toBe(true);
    expect(demoRouteAllowed('GET', '/renderers', extra)).toBe(true);
    expect(demoRouteAllowed('POST', '/rerun', extra)).toBe(true);
    expect(demoRouteAllowed('GET', '/rerun/quality/x', extra)).toBe(false);
    expect(demoRouteAllowed('GET', '/quality/leaderboard', extra)).toBe(true);
    expect(demoRouteAllowed('DELETE', '/quality/x', extra)).toBe(false);
    expect(demoRouteAllowed('GET', '/renderersX', extra)).toBe(false);
  });

  it('covers the calls the Work page makes when it loads and runs', () => {
    // The page's own requests, read from src/: if one of these moves, the demo breaks.
    const api = readFileSync(join(__dirname, '../../src/lib/api.ts'), 'utf8');
    expect(api).toContain('`${API_BASE}/claude/message`');
    expect(api).toContain('`${API_BASE}/files/upload`');
    for (const [m, p] of [
      ['POST', '/claude/message'], ['POST', '/files/upload'], ['GET', '/user-module-defaults/aml'],
      ['POST', '/user-module-defaults/aml/used'], ['GET', '/knowledge-library'], ['GET', '/knowledge-packs'],
      ['GET', '/skills'], ['GET', '/custom-modules'], ['GET', '/profile'], ['GET', '/sessions/stats'],
      ['GET', '/intelligence/atom-injection'], ['GET', '/settings/model-endpoints'], ['GET', '/auth/me/budget'],
      ['POST', '/sessions/s1/title/generate'], ['POST', '/quality/feedback'], ['GET', '/templates'],
    ] as const) {
      expect(allowed(m, p), `${m} ${p}`).toBe(true);
    }
  });
});

describe('the allowlist middleware (mounted as in index.ts)', () => {
  let server: Server;
  let base = '';

  beforeAll(async () => {
    const app = express();
    app.use((req: Request, _res: Response, next: NextFunction) => {
      const role = req.header('x-test-role');
      if (role) (req as Request & { user?: { id: string; username: string; role: string } }).user = { id: `u-${role}`, username: role, role };
      next();
    });
    app.use('/api', createDemoAllowlistMiddleware());
    app.all('/api/*', (_req, res) => { res.status(200).json({ reached: true }); });
    await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()); });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => { await new Promise<void>((resolve) => server?.close(() => resolve())); });

  const call = (method: string, path: string, role?: string) =>
    fetch(`${base}/api${path}`, { method, headers: role ? { 'x-test-role': role } : {} });

  it('answers 404 to a visitor outside the Work routes — and lets the same request through outside demo mode', async () => {
    process.env.DEMO_MODE = 'true';
    const refused = await call('POST', '/data/import', 'analyst');
    expect(refused.status).toBe(404);
    expect(await refused.json()).toEqual({ error: 'Not available in this demo' });
    expect((await call('GET', '/agents', 'viewer')).status).toBe(404);

    delete process.env.DEMO_MODE;
    expect((await call('POST', '/data/import', 'analyst')).status).toBe(200);
  });

  it('lets a visitor reach the Work routes', async () => {
    process.env.DEMO_MODE = 'true';
    expect((await call('POST', '/claude/message', 'analyst')).status).toBe(200);
    expect((await call('GET', '/sessions', 'analyst')).status).toBe(200);
  });

  it('never restricts an admin — the owner runs the instance through the same server', async () => {
    process.env.DEMO_MODE = 'true';
    expect((await call('POST', '/data/import', 'admin')).status).toBe(200);
    expect((await call('GET', '/admin/users', 'admin')).status).toBe(200);
  });

  it('refuses a request with no user even on a Work route', async () => {
    process.env.DEMO_MODE = 'true';
    expect((await call('GET', '/sessions')).status).toBe(404);
  });

  it('follows a change of DEMO_ENABLED_PILLARS / DEMO_EXTRA_ROUTES', async () => {
    process.env.DEMO_MODE = 'true';
    expect((await call('GET', '/pathfinder/threads', 'analyst')).status).toBe(404);
    process.env.DEMO_ENABLED_PILLARS = 'pathfinder';
    expect((await call('GET', '/pathfinder/threads', 'analyst')).status).toBe(200);
    delete process.env.DEMO_ENABLED_PILLARS;
    process.env.DEMO_EXTRA_ROUTES = '/rerun';
    expect((await call('POST', '/rerun', 'analyst')).status).toBe(200);
  });

  it('index.ts mounts it after the auth middleware and before every authenticated route', () => {
    const src = readFileSync(join(__dirname, '../../server/index.ts'), 'utf8');
    const auth = src.indexOf("app.use('/api', authMiddleware);");
    const demo = src.indexOf("app.use('/api', createDemoAllowlistMiddleware());");
    expect(auth).toBeGreaterThan(0);
    expect(demo).toBeGreaterThan(auth);
    // No route that answers requests sits between the two (a middleware such
    // as the request context may). Routes are mounted with a create*Routes /
    // create*Router factory, a router variable, or app.get / app.post.
    const between = src.slice(auth + "app.use('/api', authMiddleware);".length, demo);
    expect(between).not.toMatch(/app\.(get|post|put|patch|delete)\(/);
    expect(between).not.toMatch(/create\w*(Routes|Router)\(/);
    expect(demo).toBeLessThan(src.indexOf("app.get('/api/csrf-token'"));
    expect(demo).toBeLessThan(src.indexOf("app.use('/api', claudeRouter);"));
  });
});
