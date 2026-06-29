/**
 * web-confirm.ts — BROWSER approval driver for the COLLABORATION standalone.
 *
 * The terminal driver (CliModalDriver, main/modal.ts) can't read keystrokes in
 * `--mcp-stdio` mode because the MCP transport owns stdin — so the committing
 * AGREE verbs used to FAIL CLOSED there (-32011). This driver replaces it: every
 * proposed/accepted/countered agreement prints a one-time URL to the operator's
 * terminal (stderr); the operator opens it, sees the agreement, and clicks
 * Approve / Reject.
 *
 * Security model is identical to Agent Pay's payment web-confirm (two independent
 * secrets, both fail-closed):
 *   • confirmSecret — 256-bit value in the URL PATH. The capability: minted
 *     per-proposal, printed ONLY to stderr, never returned by any /rpc method —
 *     so the AI agent (which only holds the JSON-RPC bearer) cannot reach a
 *     decision, and neither can another local process that can't read the
 *     operator's terminal.
 *   • pageNonce — a second 256-bit value embedded in the served page and echoed
 *     back on POST. Proves the POST came from OUR page.
 * Plus the browser wall on POST (loopback Host allowlist, loopback Origin,
 * Sec-Fetch-Site same-origin, locked CSP, no bearer accepted), single-use, TTL
 * auto-reject, and coerceDecision() fail-closed normalization.
 *
 * Mounted on the EXISTING collab Fastify app (same 127.0.0.1 port as /rpc) via
 * registerRoutes(app), before app.listen(). Route root is /agreement-confirm to
 * stay distinct from Agent Pay's /confirm (so both can co-mount if ever sharing
 * a port). There is no wallet unlock here — a collab agreement never holds a
 * passphrase (settlement is gated again, separately, in Agent Pay).
 */
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { execFile } from 'node:child_process';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ModalDriver, CollabModalPayload, ModalDecision } from '../main/modal.js';
import { coerceDecision } from '../main/coerce-decision.js';

/** Bound on simultaneously-outstanding confirm URLs (fail-closed flood guard). */
const MAX_OUTSTANDING_CONFIRMS = 32;

export interface WebConfirmOptions {
  /** The port the gateway listens on — baked into printed URLs + the Host/Origin allowlist. */
  port: number;
  /** Host used in printed URLs (default 127.0.0.1). Loopback only. */
  host?: string;
  /** Injectable clock for deterministic tests. */
  now?: () => number;
  /** Where the URL prompt is written. Default: process.stderr. */
  log?: (line: string) => void;
  /** Best-effort auto-open the browser to the confirm URL (default off). */
  autoOpen?: boolean;
  /** Injectable opener for tests. */
  openImpl?: (url: string) => void;
}

interface PendingConfirm {
  proposalId: string;
  confirmSecret: string;
  pageNonce: string;
  payload: CollabModalPayload;
  expiresAtMs: number;
  resolve: (d: ModalDecision) => void;
  timer: ReturnType<typeof setTimeout> | null;
  settled: boolean;
}

export class CollabWebConfirmModalDriver implements ModalDriver {
  private readonly records = new Map<string, PendingConfirm>();
  private readonly port: number;
  private readonly host: string;
  private readonly now: () => number;
  private readonly log: (line: string) => void;
  private readonly autoOpen: boolean;
  private readonly openImpl: (url: string) => void;

  constructor(opts: WebConfirmOptions) {
    this.port = opts.port;
    this.host = opts.host ?? '127.0.0.1';
    this.now = opts.now ?? Date.now;
    this.log = opts.log ?? ((line) => { process.stderr.write(line + '\n'); });
    this.autoOpen = opts.autoOpen ?? false;
    this.openImpl = opts.openImpl ?? defaultOpenUrl;
  }

  promptForDecision(payload: CollabModalPayload): Promise<ModalDecision> {
    return new Promise<ModalDecision>((resolve) => {
      if (this.records.size >= MAX_OUTSTANDING_CONFIRMS) {
        resolve({ kind: 'reject', reason: 'too many pending confirmations' });
        return;
      }
      const confirmSecret = randomBytes(32).toString('base64url');
      const pageNonce = randomBytes(32).toString('base64url');
      const rec: PendingConfirm = {
        proposalId: payload.proposalId,
        confirmSecret, pageNonce, payload,
        expiresAtMs: payload.expiresAtMs,
        resolve, timer: null, settled: false,
      };
      this.records.set(confirmSecret, rec);

      const remaining = payload.expiresAtMs - this.now();
      if (remaining <= 0) { this.settle(rec, { kind: 'reject', reason: 'expired' }); return; }
      const delay = Math.min(remaining, 2_147_483_647);
      const timer = setTimeout(() => this.settle(rec, { kind: 'reject', reason: 'expired' }), delay);
      if (typeof (timer as { unref?: () => void }).unref === 'function') (timer as { unref: () => void }).unref();
      rec.timer = timer;

      const url = `http://${this.host}:${this.port}/agreement-confirm/${confirmSecret}`;
      this.printPrompt(payload, url);
      if (this.autoOpen) { try { this.openImpl(url); } catch { /* non-fatal */ } }
    });
  }

  private settle(rec: PendingConfirm, decision: ModalDecision): void {
    if (rec.settled) return;
    rec.settled = true;
    if (rec.timer) clearTimeout(rec.timer);
    this.records.delete(rec.confirmSecret);
    rec.resolve(decision);
  }

  private liveRecord(secret: string): PendingConfirm | null {
    const rec = this.records.get(secret);
    if (!rec || rec.settled) return null;
    if (this.now() >= rec.expiresAtMs) { this.settle(rec, { kind: 'reject', reason: 'expired' }); return null; }
    return rec;
  }

  private printPrompt(p: CollabModalPayload, url: string): void {
    const verb = p.kind === 'agreement_propose' ? 'PROPOSE' : p.kind === 'agreement_accept' ? 'ACCEPT' : 'COUNTER';
    this.log('');
    this.log(`  ⚠  AGREEMENT ${verb} — an AI agent wants to SIGN a two-party agreement`);
    this.log(`     Agent:        ${p.agentName}  (paired ${p.agentPairedAgo})`);
    this.log(`     Counterparty: ${p.counterpartyLabel ?? p.counterparty}`);
    this.log(`     Decision:     ${p.decision}`);
    this.log(`     Amount:       ${p.amountFtc} FTC  (${p.amountMicroFtc} µFTC)`);
    if (p.review) this.log(`     Review:       ${p.review.raise ? '⚠ concern raised' : '✓ ok'} (${p.review.reviewModel ?? 'second model'}, severity ${p.review.severity})`);
    this.log('     → Approve or reject in your browser:');
    this.log(`       ${url}`);
    this.log('');
  }

  registerRoutes(app: FastifyInstance): void {
    if (!app.hasContentTypeParser('application/x-www-form-urlencoded')) {
      app.addContentTypeParser(
        'application/x-www-form-urlencoded', { parseAs: 'string' },
        (_req, body, done) => {
          try { done(null, Object.fromEntries(new URLSearchParams(body as string))); }
          catch (e) { done(e as Error, undefined); }
        });
    }

    // GET — render the approval page. Side-effect-free (refresh-safe; never consumes).
    app.get('/agreement-confirm/:confirmSecret', async (req, reply) => {
      if (!this.hostOk(req)) return this.deny(reply, 403, 'bad host');
      const secret = (req.params as { confirmSecret: string }).confirmSecret;
      const rec = this.liveRecord(secret);
      if (!rec) return this.sendHtml(reply, 404, renderSimplePage('Not found',
        'This approval link is unknown, already used, or expired.'));
      return this.sendHtml(reply, 200, renderConfirmPage(rec, secret));
    });

    // POST — THE decision sink. The ONLY state-changing route.
    app.post('/agreement-confirm/:confirmSecret', async (req, reply) => {
      if (!this.hostOk(req)) return this.deny(reply, 403, 'bad host');
      if (req.headers.authorization) return this.deny(reply, 403, 'bearer not accepted here');
      if (!this.originOk(req)) return this.deny(reply, 403, 'origin not allowed');
      if (!this.fetchSiteOk(req)) return this.deny(reply, 403, 'cross-site request blocked');

      const secret = (req.params as { confirmSecret: string }).confirmSecret;
      const rec = this.liveRecord(secret);
      if (!rec) return this.sendHtml(reply, 410, renderSimplePage('Expired',
        'This approval link is already used or expired. Nothing was signed.'));

      const body = (req.body ?? {}) as Record<string, unknown>;
      const nonce = typeof body.pageNonce === 'string' ? body.pageNonce : '';
      if (!ctEqual(nonce, rec.pageNonce)) return this.deny(reply, 403, 'invalid page token');

      const decision = coerceDecision({
        kind: body.decision === 'approve' ? 'approve' : body.decision === 'reject' ? 'reject' : undefined,
        reason: 'rejected in browser',
      });
      this.settle(rec, decision);
      return this.sendHtml(reply, 200, decision.kind === 'approve'
        ? renderSimplePage('Approved', 'Agreement approved and signing. You can close this tab.')
        : renderSimplePage('Rejected', 'Agreement rejected. Nothing was signed. You can close this tab.'));
    });
  }

  // ── Browser wall helpers ───────────────────────────────────────────────────

  private hostOk(req: FastifyRequest): boolean {
    const host = String(req.headers.host ?? '');
    return host === `127.0.0.1:${this.port}` || host === `localhost:${this.port}` || host === `[::1]:${this.port}`;
  }

  private originOk(req: FastifyRequest): boolean {
    const o = req.headers.origin;
    if (typeof o !== 'string' || o.length === 0) return false;
    return o === `http://127.0.0.1:${this.port}` || o === `http://localhost:${this.port}`;
  }

  private fetchSiteOk(req: FastifyRequest): boolean {
    const sfs = req.headers['sec-fetch-site'];
    if (sfs === undefined) return true;
    return sfs === 'same-origin' || sfs === 'none';
  }

  private deny(reply: FastifyReply, status: number, why: string): FastifyReply {
    return this.sendHtml(reply, status, renderSimplePage('Blocked', why));
  }

  private sendHtml(reply: FastifyReply, status: number, html: string): FastifyReply {
    return reply.status(status)
      .header('content-type', 'text/html; charset=utf-8')
      .header('content-security-policy',
        "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'")
      .header('x-frame-options', 'DENY')
      .header('cross-origin-resource-policy', 'same-origin')
      .header('referrer-policy', 'no-referrer')
      .header('cache-control', 'no-store')
      .header('x-content-type-options', 'nosniff')
      .send(html);
  }
}

// ── Crypto helper ──────────────────────────────────────────────────────────────

function ctEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ah = createHash('sha256').update(a).digest();
  const bh = createHash('sha256').update(b).digest();
  return timingSafeEqual(ah, bh);
}

// ── Browser-open (no shell — fixed argv) ─────────────────────────────────────────

function defaultOpenUrl(url: string): void {
  const swallow = (): void => { /* a failed open is non-fatal — the URL is printed */ };
  if (process.platform === 'win32') execFile('rundll32', ['url.dll,FileProtocolHandler', url], swallow);
  else if (process.platform === 'darwin') execFile('open', [url], swallow);
  else execFile('xdg-open', [url], swallow);
}

// ── HTML rendering (all dynamic values escaped; CSP-locked; JS-free) ─────────────

function esc(s: unknown): string {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

const PAGE_CSS = `
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 16px/1.5 -apple-system, system-ui, Segoe UI, Roboto, sans-serif;
    background: #f4f6f8; color: #16202e; display: flex; min-height: 100vh;
    align-items: center; justify-content: center; padding: 24px; }
  .card { background: #fff; border: 1px solid #dfe6ee; border-radius: 14px; max-width: 480px;
    width: 100%; padding: 28px; box-shadow: 0 8px 30px rgba(16,32,46,.08); }
  .warn { color: #b25e00; font-weight: 700; font-size: 14px; letter-spacing: .02em;
    text-transform: uppercase; margin: 0 0 14px; }
  .amt { font-size: 30px; font-weight: 800; margin: 6px 0 2px; }
  .row { display: flex; justify-content: space-between; gap: 12px; padding: 8px 0;
    border-top: 1px solid #eef2f6; font-size: 15px; }
  .row .k { color: #5b6b7d; } .row .v { text-align: right; word-break: break-word; }
  .note { background: #fff8ec; border: 1px solid #f3e2c0; border-radius: 8px;
    padding: 10px 12px; margin: 14px 0 0; font-size: 14px; }
  .note.bad { background: #fdecec; border-color: #f3c0c0; }
  .btns { display: flex; gap: 10px; margin-top: 22px; }
  button { flex: 1; padding: 13px 16px; font-size: 16px; font-weight: 700; border-radius: 10px;
    border: 1px solid transparent; cursor: pointer; }
  .approve { background: #0D7D6C; color: #fff; }
  .reject { background: #fff; color: #16202e; border-color: #cfdae6; }
  .done { text-align: center; }
  .done h1 { font-size: 22px; margin: 0 0 8px; }
  .done p { color: #5b6b7d; margin: 0; }
`;

function htmlShell(title: string, inner: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">`
    + `<meta name="viewport" content="width=device-width,initial-scale=1">`
    + `<title>${esc(title)}</title><style>${PAGE_CSS}</style></head>`
    + `<body><div class="card">${inner}</div></body></html>`;
}

function renderConfirmPage(rec: PendingConfirm, secret: string): string {
  const p = rec.payload;
  const action = `/agreement-confirm/${esc(secret)}`;
  const verb = p.kind === 'agreement_propose' ? 'Propose' : p.kind === 'agreement_accept' ? 'Accept' : 'Counter';
  const cp = p.counterpartyLabel ? `${esc(p.counterpartyLabel)} <span class="k">(${esc(p.counterparty)})</span>` : esc(p.counterparty);
  const note = p.agentNote
    ? `<div class="note"><b>Agent note</b> (agent-supplied, not verified): ${esc(p.agentNote)}</div>`
    : '';
  const review = p.review
    ? `<div class="note${p.review.raise ? ' bad' : ''}"><b>${p.review.raise ? '⚠ Independent review raised a concern' : '✓ Independent review: ok'}</b>`
      + ` <span class="k">(${esc(p.review.reviewModel ?? 'second model')}, severity ${esc(p.review.severity)})</span>`
      + (p.review.concerns && p.review.concerns.length > 0 ? `<br>${p.review.concerns.map((c) => esc(c)).join('<br>')}` : '')
      + `</div>`
    : '';
  const inner = `
    <p class="warn">⚠ Agreement ${esc(verb.toLowerCase())} — approval required</p>
    <div class="amt">${esc(p.amountFtc)} FTC</div>
    <div class="row"><span class="k">Base units</span><span class="v">${esc(p.amountMicroFtc)} µFTC</span></div>
    <div class="row"><span class="k">Decision</span><span class="v">${esc(p.decision)}</span></div>
    <div class="row"><span class="k">Terms</span><span class="v">${esc(p.terms)}</span></div>
    <div class="row"><span class="k">Counterparty</span><span class="v">${cp}</span></div>
    <div class="row"><span class="k">Agent</span><span class="v">${esc(p.agentName)} <span class="k">(paired ${esc(p.agentPairedAgo)})</span></span></div>
    ${review}
    ${note}
    <form method="post" action="${action}">
      <input type="hidden" name="pageNonce" value="${esc(rec.pageNonce)}">
      <div class="btns">
        <button class="approve" type="submit" name="decision" value="approve">Approve &amp; sign</button>
        <button class="reject" type="submit" name="decision" value="reject">Reject</button>
      </div>
    </form>`;
  return htmlShell('Confirm agreement', inner);
}

function renderSimplePage(heading: string, message: string): string {
  return htmlShell(heading, `<div class="done"><h1>${esc(heading)}</h1><p>${esc(message)}</p></div>`);
}
