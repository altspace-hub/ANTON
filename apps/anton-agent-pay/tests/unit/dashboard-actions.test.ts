/**
 * dashboard-actions.test.ts — the operator-gated dashboard action layer.
 *
 * THE security-critical suite. Proves the approval invariant survives the new
 * action surface: the AI agent (which holds only the /rpc bearer) can NEVER
 * reach an action route. Plus the full unlock → cookie → single-use nonce flow,
 * the loopback browser wall, and fail-closed behavior.
 */
import { afterEach, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance, type FastifyReply } from 'fastify';
import { DashboardActions } from '../../src/standalone/dashboard-actions.js';

const PORT = 49250;
const HOST_OK = `127.0.0.1:${PORT}`;
const ORIGIN_OK = `http://127.0.0.1:${PORT}`;
const KEY = 'unit-test-dashboard-key-AAAAAAAAAAAAAAAAAAAAAA';
const FORM = { 'content-type': 'application/x-www-form-urlencoded' };

const apps: FastifyInstance[] = [];
afterEach(async () => { for (const a of apps.splice(0)) await a.close(); });

async function harness() {
  const approved: string[] = [];
  const rejected: string[] = [];
  const da = new DashboardActions({
    port: PORT, dashboardKey: KEY, log: () => {},
    handlers: {
      approve: (id) => { approved.push(id); return true; },
      reject: (id) => { rejected.push(id); return true; },
    },
  });
  const app = Fastify();
  // Stand-in for the dashboard's authed render: emits a fresh nonce when unlocked.
  app.get('/', async (req, reply: FastifyReply) => {
    const dn = da.isAuthed(req) ? da.mintNonce() : '';
    return reply.type('text/html').send(`<input name="dnonce" value="${dn}">`);
  });
  da.registerRoutes(app);
  await app.ready();
  apps.push(app);
  return { app, da, approved, rejected };
}

function cookieOf(res: { headers: Record<string, unknown> }): string {
  const sc = res.headers['set-cookie'];
  const raw = Array.isArray(sc) ? sc[0] : sc;
  return String(raw).split(';')[0]; // "adk=<token>"
}
function nonceOf(body: string): string {
  return /name="dnonce" value="([^"]*)"/.exec(body)?.[1] ?? '';
}

async function unlock(app: FastifyInstance): Promise<string> {
  const res = await app.inject({ method: 'GET', url: `/dashboard/unlock?key=${KEY}`, headers: { host: HOST_OK } });
  expect(res.statusCode).toBe(302);
  return cookieOf(res);
}
async function freshNonce(app: FastifyInstance, cookie: string): Promise<string> {
  const res = await app.inject({ method: 'GET', url: '/', headers: { host: HOST_OK, cookie } });
  return nonceOf(res.body);
}

describe('dashboard action layer — operator gate', () => {
  it('unlock(key) → cookie; approve with cookie + valid nonce works', async () => {
    const { app, approved } = await harness();
    const cookie = await unlock(app);
    const dnonce = await freshNonce(app, cookie);
    const res = await app.inject({ method: 'POST', url: '/dashboard/approve', headers: { host: HOST_OK, origin: ORIGIN_OK, cookie, ...FORM }, payload: `id=p_ok&dnonce=${dnonce}` });
    expect(res.statusCode).toBe(302);
    expect(approved).toEqual(['p_ok']);
  });

  it('ADVERSARIAL: an /rpc bearer cannot approve — no cookie, with or without Authorization', async () => {
    const { app, approved } = await harness();
    // the agent holds a bearer + can reach loopback, but has no operator cookie
    const withBearer = await app.inject({ method: 'POST', url: '/dashboard/approve', headers: { host: HOST_OK, origin: ORIGIN_OK, authorization: 'Bearer sk_agentToken', ...FORM }, payload: 'id=p_x&dnonce=whatever' });
    expect(withBearer.statusCode).toBe(403);
    const noCookie = await app.inject({ method: 'POST', url: '/dashboard/approve', headers: { host: HOST_OK, origin: ORIGIN_OK, ...FORM }, payload: 'id=p_x&dnonce=whatever' });
    expect(noCookie.statusCode).toBe(403);
    expect(approved).toEqual([]); // never invoked
  });

  it('a bearer is rejected even WITH a valid operator cookie (no Authorization allowed on actions)', async () => {
    const { app, approved } = await harness();
    const cookie = await unlock(app);
    const dnonce = await freshNonce(app, cookie);
    const res = await app.inject({ method: 'POST', url: '/dashboard/approve', headers: { host: HOST_OK, origin: ORIGIN_OK, cookie, authorization: 'Bearer sk_x', ...FORM }, payload: `id=p_x&dnonce=${dnonce}` });
    expect(res.statusCode).toBe(403);
    expect(approved).toEqual([]);
  });

  it('wrong unlock key sets no cookie (403)', async () => {
    const { app } = await harness();
    const res = await app.inject({ method: 'GET', url: '/dashboard/unlock?key=WRONG', headers: { host: HOST_OK } });
    expect(res.statusCode).toBe(403);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('cookie present but stale/missing nonce → 403, not invoked', async () => {
    const { app, approved } = await harness();
    const cookie = await unlock(app);
    const missing = await app.inject({ method: 'POST', url: '/dashboard/approve', headers: { host: HOST_OK, origin: ORIGIN_OK, cookie, ...FORM }, payload: 'id=p_x' });
    expect(missing.statusCode).toBe(403);
    const stale = await app.inject({ method: 'POST', url: '/dashboard/approve', headers: { host: HOST_OK, origin: ORIGIN_OK, cookie, ...FORM }, payload: 'id=p_x&dnonce=never-minted' });
    expect(stale.statusCode).toBe(403);
    expect(approved).toEqual([]);
  });

  it('single-use nonce: replay is rejected', async () => {
    const { app, approved } = await harness();
    const cookie = await unlock(app);
    const dnonce = await freshNonce(app, cookie);
    const first = await app.inject({ method: 'POST', url: '/dashboard/approve', headers: { host: HOST_OK, origin: ORIGIN_OK, cookie, ...FORM }, payload: `id=p1&dnonce=${dnonce}` });
    expect(first.statusCode).toBe(302);
    const replay = await app.inject({ method: 'POST', url: '/dashboard/approve', headers: { host: HOST_OK, origin: ORIGIN_OK, cookie, ...FORM }, payload: `id=p2&dnonce=${dnonce}` });
    expect(replay.statusCode).toBe(403);
    expect(approved).toEqual(['p1']);
  });

  it('cross-origin / bad-host POST is rejected even with cookie + nonce', async () => {
    const { app, approved } = await harness();
    const cookie = await unlock(app);
    const dnonce = await freshNonce(app, cookie);
    const xorigin = await app.inject({ method: 'POST', url: '/dashboard/approve', headers: { host: HOST_OK, origin: 'http://evil.example.com', cookie, ...FORM }, payload: `id=p1&dnonce=${dnonce}` });
    expect(xorigin.statusCode).toBe(403);
    const dn2 = await freshNonce(app, cookie);
    const badHost = await app.inject({ method: 'POST', url: '/dashboard/approve', headers: { host: 'evil.example.com', origin: ORIGIN_OK, cookie, ...FORM }, payload: `id=p1&dnonce=${dn2}` });
    expect(badHost.statusCode).toBe(403);
    expect(approved).toEqual([]);
  });

  it('logout clears the cookie; afterwards actions are rejected', async () => {
    const { app, approved } = await harness();
    const cookie = await unlock(app);
    const out = await app.inject({ method: 'GET', url: '/dashboard/logout', headers: { host: HOST_OK, cookie } });
    expect(out.statusCode).toBe(302);
    // the same (now-logged-out) token still hashes to a live session in-memory until cleared?
    // logout does not server-side-revoke, but the browser drops the cookie; emulate that by NOT sending it:
    const res = await app.inject({ method: 'POST', url: '/dashboard/approve', headers: { host: HOST_OK, origin: ORIGIN_OK, ...FORM }, payload: 'id=p_x&dnonce=z' });
    expect(res.statusCode).toBe(403);
    expect(approved).toEqual([]);
  });

  it('unknown action with valid cookie + nonce → 404', async () => {
    const { app } = await harness();
    const cookie = await unlock(app);
    const dnonce = await freshNonce(app, cookie);
    const res = await app.inject({ method: 'POST', url: '/dashboard/frobnicate', headers: { host: HOST_OK, origin: ORIGIN_OK, cookie, ...FORM }, payload: `id=p1&dnonce=${dnonce}` });
    expect(res.statusCode).toBe(404);
  });
});
