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
// Shared with the dashboard so the highest-stakes screen in the product looks
// like ANTON, not like a stray admin page. See standalone-theme.ts.
import { esc, shell } from './standalone-theme.js';

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

  /** Secret-free summary of outstanding browser-confirm prompts, for the operator
   *  dashboard. NEVER exposes confirmSecret or the payload — only the count + the
   *  soonest expiry (ms from now). */
  pendingSummary(): { count: number; soonestExpiryMs: number | null } {
    const now = this.now();
    let count = 0; let soonest: number | null = null;
    for (const rec of this.records.values()) {
      if (rec.settled || now >= rec.expiresAtMs) continue;
      count += 1;
      const ms = rec.expiresAtMs - now;
      if (soonest === null || ms < soonest) soonest = ms;
    }
    return { count, soonestExpiryMs: soonest };
  }

  /** Operator-side approve/reject BY proposalId — the dashboard drives this and
   *  NEVER sees confirmSecret. Finds the live pending record (respecting expiry)
   *  and routes it through the SAME settle() sink as the /agreement-confirm POST.
   *  Returns false if there is no live record. Idempotent. */
  operatorApprove(proposalId: string): boolean {
    const rec = this.findLive(proposalId);
    if (!rec) return false;
    this.settle(rec, { kind: 'approve' });
    return true;
  }

  operatorReject(proposalId: string): boolean {
    const rec = this.findLive(proposalId);
    if (!rec) return false;
    this.settle(rec, { kind: 'reject', reason: 'rejected from dashboard' });
    return true;
  }

  private findLive(proposalId: string): PendingConfirm | null {
    const now = this.now();
    for (const rec of this.records.values()) {
      if (rec.settled || now >= rec.expiresAtMs) continue;
      if (rec.proposalId === proposalId) return rec;
    }
    return null;
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
// esc() and shell() are imported from standalone-theme.ts; only the approval
// card's own layout lives here.

/** Confirm-card rules. The hierarchy is deliberate: the AMOUNT is the hero
 *  (it is the number the operator is actually agreeing to), then the terms
 *  rows, then the review banner, and finally two visually SEPARATED decisions —
 *  Approve is the only filled control on the page and Reject sits below a rule,
 *  so a mis-aimed click cannot sign an agreement. */
const CONFIRM_CSS = `
  .card { width: 100%; max-width: 520px; padding: 26px 28px 24px; box-shadow: var(--anton-shadow-lg); }
  .kicker { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600;
    color: var(--anton-gold); margin: 0 0 4px; }
  .amt { font-size: 40px; font-weight: 700; letter-spacing: -.025em; line-height: 1.1;
    color: var(--anton-text); margin: 2px 0 2px; }
  .amt-sub { font-family: var(--anton-mono); font-size: 12px; color: var(--anton-text-muted); margin: 0 0 18px; }
  .row { display: flex; justify-content: space-between; gap: 14px; padding: 9px 0;
    border-top: 1px solid var(--anton-border-soft); font-size: 14px; }
  .row .k { color: var(--anton-text-muted); flex: none; }
  .row .v { text-align: right; word-break: break-word; color: var(--anton-text); }
  .banner { margin: 16px 0 0; }
  .decide { margin-top: 22px; }
  .decide button { width: 100%; font: inherit; font-size: 15px; font-weight: 600;
    border-radius: var(--anton-r2); border: 1px solid transparent; padding: 13px 16px; cursor: pointer; }
  .decide .approve { background: var(--anton-accent); color: var(--anton-accent-fg); box-shadow: var(--anton-shadow); }
  .decide .approve:hover { background: var(--anton-accent-hover); }
  .decide .sep { display: flex; align-items: center; gap: 10px; margin: 14px 0 12px;
    color: var(--anton-text-faint); font-size: 12px; }
  .decide .sep::before, .decide .sep::after {
    content: ""; flex: 1; height: 1px; background: var(--anton-border-soft); }
  .decide .reject { background: var(--anton-surface); color: var(--anton-red); border-color: var(--anton-red-dim); }
  .decide .reject:hover { background: var(--anton-red-soft); }
  .done { text-align: center; padding: 8px 0 4px; }
  .done h1 { font-size: 21px; font-weight: 600; color: var(--anton-text); margin: 0 0 8px; }
  .done p { color: var(--anton-text-muted); margin: 0; }
`;

/** Wraps the card in the shared ANTON shell, vertically centred. */
function htmlShell(title: string, inner: string, chip?: string): string {
  return shell(title, `<div class="card">${inner}</div>`, { bodyClass: 'centered', css: CONFIRM_CSS, chip });
}

function renderConfirmPage(rec: PendingConfirm, secret: string): string {
  const p = rec.payload;
  const action = `/agreement-confirm/${esc(secret)}`;
  const verb = p.kind === 'agreement_propose' ? 'Propose' : p.kind === 'agreement_accept' ? 'Accept' : 'Counter';
  const cp = p.counterpartyLabel ? `${esc(p.counterpartyLabel)} <span class="muted">(${esc(p.counterparty)})</span>` : esc(p.counterparty);
  // The agent note is unverified input, so it is toned gold (caution) rather
  // than neutral — the operator must not read it as something ANTON vouches for.
  const note = p.agentNote
    ? `<div class="banner banner-gold"><b>Agent note</b> (agent-supplied, not verified): ${esc(p.agentNote)}</div>`
    : '';
  // Four-eyes review: red when the second model raised a concern, green when it
  // cleared. Previously both rendered as the same gold "note" box.
  const review = p.review
    ? `<div class="banner ${p.review.raise ? 'banner-red' : 'banner-green'}"><b>${p.review.raise ? '⚠ Independent review raised a concern' : '✓ Independent review: ok'}</b>`
      + ` <span class="muted">(${esc(p.review.reviewModel ?? 'second model')}, severity ${esc(p.review.severity)})</span>`
      + (p.review.concerns && p.review.concerns.length > 0 ? `<br>${p.review.concerns.map((c) => esc(c)).join('<br>')}` : '')
      + `</div>`
    : '';
  const inner = `
    <p class="kicker">⚠ Agreement ${esc(verb.toLowerCase())} — approval required</p>
    <div class="amt">${esc(p.amountFtc)} FTC</div>
    <p class="amt-sub">${esc(p.amountMicroFtc)} µFTC</p>
    <div class="row"><span class="k">Decision</span><span class="v">${esc(p.decision)}</span></div>
    <div class="row"><span class="k">Terms</span><span class="v">${esc(p.terms)}</span></div>
    <div class="row"><span class="k">Counterparty</span><span class="v">${cp}</span></div>
    <div class="row"><span class="k">Agent</span><span class="v">${esc(p.agentName)} <span class="muted">(paired ${esc(p.agentPairedAgo)})</span></span></div>
    ${review}
    ${note}
    <form method="post" action="${action}">
      <input type="hidden" name="pageNonce" value="${esc(rec.pageNonce)}">
      <div class="decide">
        <button class="approve" type="submit" name="decision" value="approve">Approve &amp; sign</button>
        <div class="sep">or</div>
        <button class="reject" type="submit" name="decision" value="reject">Reject — sign nothing</button>
      </div>
    </form>`;
  return htmlShell('Confirm agreement', inner, 'approval');
}

function renderSimplePage(heading: string, message: string): string {
  return htmlShell(heading, `<div class="done"><h1>${esc(heading)}</h1><p>${esc(message)}</p></div>`);
}
