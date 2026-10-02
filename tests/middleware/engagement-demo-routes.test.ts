/**
 * engagement-demo-routes.test.ts — the Engagement Task routes a demo visitor
 * may reach (server/services/engagement-demo-routes.ts), checked three ways:
 *
 *   1. every call the engagement pages make is matched, and the routes kept
 *      closed — the server-folder RAG directory, project linking, the
 *      web-search benchmark — are not (the negative control: the matcher is
 *      not simply permissive);
 *   2. every entry names a route the engagements router really serves, with
 *      that method — no entry opens something else under the same prefix;
 *   3. once WORK_ROUTES (demo-mode.ts) carries engagement entries, they are
 *      exactly these.
 *
 * The matcher is demo-mode.ts's own (demoRouteAllowed) over rules compiled the
 * way demo-mode compiles WORK_ROUTES: `:x` is one segment, nothing below.
 */
import { describe, it, expect, vi } from 'vitest';
import type { DatabaseAdapter } from '../../server/db/database.js';

vi.mock('../../server/services/provider-router.js', () => ({ callChat: vi.fn(), streamChat: vi.fn(), mapModelToProvider: (m: string) => m }));
vi.mock('../../server/services/utility-model.js', () => ({ getRoutedUtilityModel: async () => 'compat:x:y' }));
vi.mock('../../server/services/default-model-store.js', () => ({ getEffectiveDefaultModel: () => 'compat:x:y' }));
vi.mock('../../server/services/rag/indexer.js', () => ({ indexFolder: vi.fn() }));
vi.mock('../../server/services/rag/retriever.js', () => ({ retrieveChunks: vi.fn(async () => []) }));
vi.mock('../../server/services/engagement-session-bridge.js', () => ({ bridgeIterationToSession: vi.fn() }));

import { ENGAGEMENT_WORK_ROUTES } from '../../server/services/engagement-demo-routes.js';
import { WORK_ROUTES, demoRouteAllowed, type RouteRule } from '../../server/middleware/demo-mode.js';
import { createEngagementsRoutes } from '../../server/routes/engagements.js';

const escapeRegex = (s: string): string => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&');

/** demo-mode.ts compilePath for an exact WORK_ROUTES entry. */
function rule(methods: string, path: string): RouteRule {
  const body = path.split('/').map((seg) => (seg.startsWith(':') ? '[^/]+' : escapeRegex(seg))).join('/');
  return { methods: new Set(methods.split(',').map((m) => m.trim().toUpperCase())), pattern: new RegExp(`^${body}/?$`, 'i') };
}

const RULES = ENGAGEMENT_WORK_ROUTES.map(([m, p]) => rule(m, p));
const allowed = (method: string, path: string) => demoRouteAllowed(method, path, RULES);

describe('the Engagement Task routes a demo visitor may reach', () => {
  it('matches every call the engagement pages make', () => {
    const calls: Array<[string, string]> = [
      ['GET', '/engagements'], ['POST', '/engagements'], ['GET', '/engagements/peer-library'],
      ['GET', '/engagements/e1'], ['PATCH', '/engagements/e1'], ['DELETE', '/engagements/e1'],
      ['POST', '/engagements/e1/documents'], ['POST', '/engagements/e1/documents/d1/extract'],
      ['POST', '/engagements/e1/scope-items'], ['PATCH', '/engagements/e1/scope-items/s1'],
      ['PUT', '/engagements/e1/client-intelligence'], ['POST', '/engagements/e1/intake/turn'],
      ['POST', '/engagements/e1/resources'], ['PATCH', '/engagements/e1/resources/r1'], ['PATCH', '/engagements/e1/resource-categories'],
      ['POST', '/engagements/e1/workstreams'], ['PATCH', '/engagements/e1/workstreams/w1'], ['DELETE', '/engagements/e1/workstreams/w1'],
      ['POST', '/engagements/e1/team'], ['POST', '/engagements/e1/team/extract'], ['DELETE', '/engagements/e1/team/m1'],
      ['POST', '/engagements/e1/execute'], ['GET', '/engagements/e1/execute/stream'],
      ['PATCH', '/engagements/e1/iterations/i1'], ['POST', '/engagements/e1/iterations/i1/gap-analysis'],
      ['POST', '/engagements/e1/peer-benchmarks/from-internal/e2'], ['DELETE', '/engagements/e1/peer-benchmarks/b1'],
      ['POST', '/engagements/e1/quality-gate/run'], ['POST', '/engagements/e1/complete'], ['POST', '/engagements/e1/reopen'],
      ['POST', '/engagements/e1/export'],
    ];
    for (const [method, path] of calls) expect(allowed(method, path), `${method} ${path}`).toBe(true);
  });

  it('keeps the server-folder RAG directory, project linking and the web-search benchmark closed', () => {
    const closed: Array<[string, string]> = [
      ['POST', '/engagements/e1/rag-directory'], ['DELETE', '/engagements/e1/rag-directory'],
      ['POST', '/engagements/e1/rag-directory/reindex'], ['PATCH', '/engagements/e1/project'],
      ['POST', '/engagements/e1/peer-benchmarks/web-search'],
      // Wrong method, nothing below an entry, a dot segment
      ['POST', '/engagements/e1/execute/stream'], ['PUT', '/engagements/e1'], ['GET', '/engagements/e1/documents/d1/extract/x'],
      ['GET', '/engagements/e1/..%2F..%2Fadmin'],
    ];
    for (const [method, path] of closed) expect(allowed(method, path), `${method} ${path}`).toBe(false);
  });

  it('names only routes the engagements router serves, with their methods', async () => {
    const router = await createEngagementsRoutes({} as DatabaseAdapter);
    const served = (router.stack as Array<{ route?: { path: string; methods: Record<string, boolean> } }>)
      .filter((l) => l.route)
      .flatMap((l) => Object.keys(l.route!.methods).map((m) => ({
        method: m.toUpperCase(),
        shape: `/engagements${l.route!.path === '/' ? '' : l.route!.path}`.replace(/:[A-Za-z]+/g, ':x'),
      })));
    for (const [methods, path] of ENGAGEMENT_WORK_ROUTES) {
      for (const method of methods.split(',')) {
        expect(served.some((s) => s.method === method && s.shape === path), `${method} ${path} is not a route`).toBe(true);
      }
    }
  });

  it('once WORK_ROUTES carries engagement entries, they are exactly these', () => {
    const inWork = WORK_ROUTES.filter(([, p]) => p.startsWith('/engagements'));
    if (inWork.length === 0) return; // not integrated yet: demo-mode.ts is edited separately
    const norm = (rows: ReadonlyArray<readonly [string, string]>) => rows.map(([m, p]) => `${m} ${p}`).sort();
    expect(norm(inWork)).toEqual(norm(ENGAGEMENT_WORK_ROUTES));
  });
});
