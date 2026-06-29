/**
 * dashboard-actions.ts — the OPTIONAL operator-gated action layer for the
 * dashboard (approve / reject / cancel from the browser). DEFAULT OFF; enabled
 * only when a dashboard KEY is provided (minted + printed to stderr at boot,
 * never returned by /rpc — exactly like the pair code).
 *
 * Preserves the approval invariant: the AI agent holds only the /rpc bearer.
 * Every /dashboard/* action route REJECTS an Authorization header and requires
 *   1) the operator cookie — obtainable ONLY via GET /dashboard/unlock?key=<KEY>,
 *      and the KEY is printed only to the operator's terminal,
 *   2) a per-render SINGLE-USE form nonce (CSRF / double-submit guard),
 *   3) the loopback browser wall (Host + Origin + Sec-Fetch-Site).
 * The dashboard never sees confirmSecret — it drives approve/reject BY proposalId
 * through the driver's operatorApprove/operatorReject (which own the settle sink).
 */
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

/** A bound action: returns true if it did something, false on no-op. */
export type ActionHandler = (id: string, body: Record<string, string>) => boolean;

export interface DashboardActionsConfig {
  port: number;
  host?: string;
  /** 256-bit operator key (base64url). Printed to stderr; never returned by /rpc. */
  dashboardKey: string;
  /** action segment -> handler, e.g. { approve, reject, 'cancel-proposal' }. */
  handlers: Record<string, ActionHandler>;
  log?: (line: string) => void;
}

const MAX_NONCES = 256;
const MAX_FAILED_UNLOCKS = 10;
const COOKIE = 'adk';

export class DashboardActions {
  private readonly sessions = new Set<string>(); // sha256hex(sessionToken)
  private readonly nonces = new Set<string>();   // valid single-use form nonces
  private failedUnlocks = 0;
  private readonly port: number;
  private readonly host: string;
  private readonly log: (l: string) => void;

  constructor(private readonly cfg: DashboardActionsConfig) {
    this.port = cfg.port;
    this.host = cfg.host ?? '127.0.0.1';
    this.log = cfg.log ?? ((l) => { process.stderr.write(l + '\n'); });
  }

  /** The one-time unlock URL to print to the operator's terminal. */
  unlockUrl(): string { return `http://${this.host}:${this.port}/dashboard/unlock?key=${this.cfg.dashboardKey}`; }

  /** True if the request carries a valid operator session cookie. */
  isAuthed(req: FastifyRequest): boolean {
    const tok = cookie(req, COOKIE);
    return tok ? this.sessions.has(sha(tok)) : false;
  }

  /** Mint a fresh single-use form nonce (bounded set). */
  mintNonce(): string {
    if (this.nonces.size >= MAX_NONCES) this.nonces.clear();
    const n = randomBytes(16).toString('base64url');
    this.nonces.add(n);
    return n;
  }

  registerRoutes(app: FastifyInstance): void {
    if (!app.hasContentTypeParser('application/x-www-form-urlencoded')) {
      app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' },
        (_req, body, done) => { try { done(null, Object.fromEntries(new URLSearchParams(body as string))); } catch (e) { done(e as Error, undefined); } });
    }

    // Operator unlock — validate the stderr-only key, set the session cookie.
    app.get('/dashboard/unlock', async (req, reply) => {
      if (!this.hostOk(req)) return msg(reply, 403, 'Blocked', 'bad host');
      if (this.failedUnlocks >= MAX_FAILED_UNLOCKS) return msg(reply, 429, 'Locked', 'too many attempts — restart the gateway');
      const key = String((req.query as { key?: string }).key ?? '');
      if (!ctEqual(key, this.cfg.dashboardKey)) { this.failedUnlocks += 1; return msg(reply, 403, 'Denied', 'wrong or missing key'); }
      this.failedUnlocks = 0;
      const tok = randomBytes(32).toString('base64url');
      this.sessions.add(sha(tok));
      this.log('[dashboard] operator unlocked the action console');
      return reply.header('set-cookie', `${COOKIE}=${tok}; HttpOnly; SameSite=Lax; Path=/`).redirect('/');
    });

    app.get('/dashboard/logout', async (_req, reply) =>
      reply.header('set-cookie', `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`).redirect('/'));

    // The ONLY state-changing routes. Wall + cookie + single-use nonce, then the handler.
    app.post('/dashboard/:action', async (req, reply) => {
      if (!this.hostOk(req)) return this.deny(reply, 'bad host');
      if (req.headers.authorization) return this.deny(reply, 'bearer not accepted here');
      if (!this.originOk(req)) return this.deny(reply, 'origin not allowed');
      if (!this.fetchSiteOk(req)) return this.deny(reply, 'cross-site blocked');
      if (!this.isAuthed(req)) return this.deny(reply, 'not unlocked — open the unlock link from the gateway terminal');
      const body = (req.body ?? {}) as Record<string, string>;
      const dnonce = typeof body.dnonce === 'string' ? body.dnonce : '';
      if (!this.nonces.has(dnonce)) return this.deny(reply, 'stale form — reload the page');
      this.nonces.delete(dnonce); // single-use
      const action = (req.params as { action: string }).action;
      const handler = this.cfg.handlers[action];
      if (!handler) return msg(reply, 404, 'Not found', 'unknown action');
      const id = typeof body.id === 'string' ? body.id : '';
      let ok = false;
      try { ok = handler(id, body); } catch { ok = false; }
      this.log(`[dashboard] operator ${action} id=${id} -> ${ok ? 'ok' : 'no-op'}`);
      return reply.redirect('/');
    });
  }

  // ── browser wall (same posture as web-confirm) ─────────────────────────────
  private hostOk(req: FastifyRequest): boolean {
    const h = String(req.headers.host ?? '');
    return h === `127.0.0.1:${this.port}` || h === `localhost:${this.port}` || h === `[::1]:${this.port}` || h === `${this.host}:${this.port}`;
  }
  private originOk(req: FastifyRequest): boolean {
    const o = req.headers.origin;
    if (typeof o !== 'string' || o.length === 0) return false;
    return o === `http://127.0.0.1:${this.port}` || o === `http://localhost:${this.port}`;
  }
  private fetchSiteOk(req: FastifyRequest): boolean {
    const s = req.headers['sec-fetch-site'];
    return s === undefined || s === 'same-origin' || s === 'none';
  }
  private deny(reply: FastifyReply, why: string): FastifyReply { return msg(reply, 403, 'Blocked', why); }
}

function sha(s: string): string { return createHash('sha256').update(s).digest('hex'); }
function ctEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  return timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());
}
function cookie(req: FastifyRequest, name: string): string | null {
  const raw = req.headers.cookie;
  if (typeof raw !== 'string') return null;
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}
function msg(reply: FastifyReply, status: number, h: string, m: string): FastifyReply {
  return reply.status(status)
    .header('content-type', 'text/html; charset=utf-8')
    .header('content-security-policy', "default-src 'none'; style-src 'unsafe-inline'")
    .header('cache-control', 'no-store').header('x-content-type-options', 'nosniff')
    .send(`<!doctype html><meta charset="utf-8"><title>${esc(h)}</title><body style="font-family:system-ui;padding:24px"><h1>${esc(h)}</h1><p>${esc(m)}</p><p><a href="/">← dashboard</a></p>`);
}
function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}
