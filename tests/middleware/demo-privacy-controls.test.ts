/**
 * demo-privacy-controls.test.ts — what the public demo's privacy review
 * (2026-09-26) added to server/middleware/demo-mode.ts:
 *
 *   - /api/config carries the demo terms page and version, and who operates
 *     the demo (G7 / G1); the web client's reading keeps every field;
 *   - a visitor may read sign-offs but not make one: the sign-off form asks
 *     for a reviewer's name, and visitors are told never to give a real one
 *     (H1). An admin, and any user outside demo mode, still can;
 *   - DEMO_HIDDEN_AREAS / DEMO_HIDDEN_MODULES and demoModuleHidden(), which
 *     the run route and the module listing use to keep sensitive modules off
 *     the demo (H3). Nothing is hidden outside demo mode.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  DEMO_TERMS_VERSION, demoPublicConfig, demoOperatorName, demoRouteAllowed, demoRouteRules,
  createDemoAllowlistMiddleware, demoHiddenAreas, demoHiddenModules, demoModuleHidden,
} from '../../server/middleware/demo-mode.js';
import { parseDemoConfig } from '../../src/lib/demo-config';

const DEMO = { DEMO_MODE: 'true', DEPLOYMENT_MODE: 'team' };

const saved = process.env.DEMO_MODE;
afterEach(() => {
  if (saved === undefined) delete process.env.DEMO_MODE; else process.env.DEMO_MODE = saved;
});

describe('the demo terms and the operator in /api/config', () => {
  it('names the terms page, the current terms version and the operator', () => {
    const cfg = demoPublicConfig({ ...DEMO, DEMO_OPERATOR_NAME: '  Example Demo AB  ' });
    expect(cfg).toMatchObject({ demoMode: true, termsPath: '/terms', termsVersion: DEMO_TERMS_VERSION, operatorName: 'Example Demo AB' });
  });

  it('gives an empty operator name when DEMO_OPERATOR_NAME is unset, and caps a long one', () => {
    expect(demoOperatorName({})).toBe('');
    expect(demoOperatorName({ DEMO_OPERATOR_NAME: '   ' })).toBe('');
    expect(demoOperatorName({ DEMO_OPERATOR_NAME: 'x'.repeat(500) })).toHaveLength(200);
    expect(demoPublicConfig(DEMO)).toMatchObject({ operatorName: '' });
  });

  it('publishes none of it outside demo mode', () => {
    expect(demoPublicConfig({ DEPLOYMENT_MODE: 'team', DEMO_OPERATOR_NAME: 'Example Demo AB' })).toEqual({ demoMode: false });
  });

  it('the terms version is one the sign-up schema and the web client accept', () => {
    expect(DEMO_TERMS_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(DEMO_TERMS_VERSION.length).toBeLessThanOrEqual(40);
    // What the server sends, the client reads back unchanged — the version is
    // what sign-up returns, so a mismatch here would refuse every visitor.
    const server = demoPublicConfig({ ...DEMO, DEMO_OPERATOR_NAME: 'Example Demo AB', DEMO_SIGNUP_CODE: 'c' });
    const client = parseDemoConfig(JSON.parse(JSON.stringify(server)));
    expect(client.termsVersion).toBe(DEMO_TERMS_VERSION);
    expect(client.termsPath).toBe('/terms');
    expect(client.operatorName).toBe('Example Demo AB');
  });
});

describe('sign-offs are read-only for a visitor (H1)', () => {
  it('the allowlist lets a visitor read /oversight/reviews but not post one', () => {
    const rules = demoRouteRules({ DEMO_MODE: 'true' });
    expect(demoRouteAllowed('GET', '/oversight/reviews', rules)).toBe(true);
    expect(demoRouteAllowed('POST', '/oversight/reviews', rules)).toBe(false);
    // The rest of the sign-off read path is unchanged.
    expect(demoRouteAllowed('GET', '/oversight/modules', rules)).toBe(true);
    expect(demoRouteAllowed('GET', '/oversight/sessions/s1/review', rules)).toBe(true);
  });

  describe('through the middleware, mounted as in index.ts', () => {
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

    const call = (method: string, role: string) =>
      fetch(`${base}/api/oversight/reviews`, { method, headers: { 'x-test-role': role, 'content-type': 'application/json' }, body: method === 'GET' ? undefined : '{}' });

    it('answers 404 to a visitor\'s sign-off and lets the visitor read', async () => {
      process.env.DEMO_MODE = 'true';
      expect((await call('POST', 'analyst')).status).toBe(404);
      expect((await call('GET', 'analyst')).status).toBe(200);
    });

    it('lets an admin sign off on a demo, and anyone outside demo mode (negative controls)', async () => {
      process.env.DEMO_MODE = 'true';
      expect((await call('POST', 'admin')).status).toBe(200);
      delete process.env.DEMO_MODE;
      expect((await call('POST', 'analyst')).status).toBe(200);
    });
  });
});

describe('modules kept off the demo (H3)', () => {
  const env = {
    ...DEMO,
    DEMO_HIDDEN_AREAS: ' healthcare, HR ,workers-rights,healthcare',
    DEMO_HIDDEN_MODULES: 'credit-risk, CV-Writer',
  };

  it('reads both lists, trimmed, lower-cased and without repeats', () => {
    expect(demoHiddenAreas(env)).toEqual(['healthcare', 'hr', 'workers-rights']);
    expect(demoHiddenModules(env)).toEqual(['credit-risk', 'cv-writer']);
    expect(demoHiddenAreas({})).toEqual([]);
    expect(demoHiddenModules({})).toEqual([]);
  });

  it('hides a listed module, and every module of a listed area, whatever the case', () => {
    expect(demoModuleHidden('credit-risk', 'banking', env)).toBe(true);
    expect(demoModuleHidden('cv-writer', null, env)).toBe(true);
    expect(demoModuleHidden('Cv-Writer', undefined, env)).toBe(true);
    expect(demoModuleHidden('some-clinical-module', 'healthcare', env)).toBe(true);
    expect(demoModuleHidden(null, 'hr', env)).toBe(true);
    expect(demoModuleHidden('anything', ' HR ', env)).toBe(true);
  });

  it('leaves every other module visible', () => {
    expect(demoModuleHidden('aml-gap-analysis', 'fcp', env)).toBe(false);
    expect(demoModuleHidden('credit-risk-extra', 'banking', env)).toBe(false);
    expect(demoModuleHidden('', '', env)).toBe(false);
    expect(demoModuleHidden(null, null, env)).toBe(false);
  });

  it('hides nothing outside demo mode, whatever the lists say (negative control)', () => {
    const off = { DEPLOYMENT_MODE: 'team', DEMO_HIDDEN_AREAS: 'healthcare', DEMO_HIDDEN_MODULES: 'credit-risk' };
    expect(demoModuleHidden('credit-risk', 'banking', off)).toBe(false);
    expect(demoModuleHidden('x', 'healthcare', off)).toBe(false);
  });

  it('reads process.env when no env is passed', () => {
    const keys = ['DEMO_HIDDEN_MODULES'] as const;
    const before = keys.map((k) => process.env[k]);
    try {
      process.env.DEMO_MODE = 'true';
      process.env.DEMO_HIDDEN_MODULES = 'cv-writer';
      expect(demoModuleHidden('cv-writer', 'hr')).toBe(true);
      delete process.env.DEMO_MODE;
      expect(demoModuleHidden('cv-writer', 'hr')).toBe(false);
    } finally {
      keys.forEach((k, i) => { if (before[i] === undefined) delete process.env[k]; else process.env[k] = before[i]; });
    }
  });
});
