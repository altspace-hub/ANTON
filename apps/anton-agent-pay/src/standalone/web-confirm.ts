/**
 * web-confirm.ts — BROWSER confirmation driver for the standalone gateway.
 *
 * The terminal driver (cli-modal.ts) can't read keystrokes in `--mcp-stdio`
 * mode because the MCP transport owns stdin. This driver replaces it: every
 * proposed payment prints a one-time URL to the operator's terminal (stderr);
 * the operator opens it in a browser, sees the payment, and clicks Approve /
 * Reject (typing the wallet passphrase when the wallet is protected).
 *
 * THE SAFETY MODEL (two independent secrets, both fail-closed):
 *   • confirmSecret — a 256-bit value in the URL PATH. It is the capability:
 *     it is minted per-proposal, printed ONLY to stderr (never stdout — MCP owns
 *     stdout — never to any logger), and never returned by any /rpc method. So
 *     the AI agent (which only holds the JSON-RPC bearer) cannot reach a decision,
 *     and neither can another local process that can't read the operator's terminal.
 *   • pageNonce — a second 256-bit value embedded in the served confirm page and
 *     echoed back on POST. It proves the POST came from OUR page (a blind cross-
 *     origin attacker can't read it back out of an opaque response), so the model
 *     survives even if same-origin / DNS-rebinding defenses ever failed.
 *
 * Plus a layered browser wall on the decision POST: Host-header allowlist (anti
 * DNS-rebinding), Origin must be present and loopback, Sec-Fetch-Site same-origin,
 * a locked CSP, no bearer accepted. Single-use (consume-then-resolve), TTL auto-
 * reject bound to payload.expiresAtMs. Any malformed body fails closed to reject
 * via the shared coerceDecision().
 *
 * Loopback (127.0.0.1) is the trust boundary; an attacker who can already read the
 * operator's terminal/TTY defeats this AND the terminal driver alike — that's the
 * same load-bearing assumption, not a regression.
 *
 * Routes are registered on the EXISTING Fastify buildServer app (same 127.0.0.1
 * port as /rpc) via registerRoutes(app), before app.listen().
 */
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { execFile } from 'node:child_process';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ModalDriver } from '../main/modal.js';
import type { ModalDecision, ModalPayload } from '../shared/ipc-types.js';
import { coerceDecision } from '../main/coerce-decision.js';

/** Bound on simultaneously-outstanding confirm URLs. Unlike the OS-window
 *  drivers this driver does NOT serialise (each proposal gets its own URL so
 *  concurrent proposals don't block each other), so this cap stops a runaway
 *  agent from flooding the operator's terminal with confirm URLs. A real
 *  operator never has this many pending approvals at once. Fail-closed: over the
 *  cap, new prompts auto-reject. Total VALUE is already bounded by the spend caps. */
const MAX_OUTSTANDING_CONFIRMS = 32;

export interface WebConfirmOptions {
  /** The port the gateway listens on — baked into the printed confirm URLs and
   *  the Host/Origin allowlists. */
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
  payload: ModalPayload;
  expiresAtMs: number;
  resolve: (d: ModalDecision) => void;
  timer: ReturnType<typeof setTimeout> | null;
  settled: boolean;
}

export class WebConfirmModalDriver implements ModalDriver {
  /** confirmSecret → pending record. One per outstanding proposal; the 256-bit
   *  keys never collide, so concurrent proposals are independent and race-free
   *  (JS is single-threaded — consume-then-resolve is atomic within a handler). */
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

  promptForDecision(payload: ModalPayload): Promise<ModalDecision> {
    return new Promise<ModalDecision>((resolve) => {
      // Fail-closed flood guard — never let a runaway agent open unbounded
      // confirm URLs. (Spend caps already bound value; this bounds noise.)
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
      // Clamp to the 32-bit setTimeout ceiling: a larger delay would silently be
      // treated as 1ms by Node and fire immediately, wrongly expiring a valid
      // proposal. liveRecord()'s lazy now>=expiresAtMs check is the real guarantee;
      // this timer is only an auto-resolve backstop.
      const delay = Math.min(remaining, 2_147_483_647);
      const timer = setTimeout(
        () => this.settle(rec, { kind: 'reject', reason: 'expired' }), delay);
      if (typeof (timer as { unref?: () => void }).unref === 'function') {
        (timer as { unref: () => void }).unref();
      }
      rec.timer = timer;

      const url = `http://${this.host}:${this.port}/confirm/${confirmSecret}`;
      this.printPrompt(payload, url);
      if (this.autoOpen) { try { this.openImpl(url); } catch { /* non-fatal */ } }
    });
  }

  /** Resolve a pending record exactly once and remove it (single-use). */
  private settle(rec: PendingConfirm, decision: ModalDecision): void {
    if (rec.settled) return;
    rec.settled = true;
    if (rec.timer) clearTimeout(rec.timer);
    this.records.delete(rec.confirmSecret);
    rec.resolve(decision);
  }

  /** The live record for a secret, or null (lazily expiring it on hit). */
  private liveRecord(secret: string): PendingConfirm | null {
    const rec = this.records.get(secret);
    if (!rec || rec.settled) return null;
    if (this.now() >= rec.expiresAtMs) {
      this.settle(rec, { kind: 'reject', reason: 'expired' });
      return null;
    }
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
   *  and routes it through the SAME settle() sink as the /confirm POST. Returns
   *  false if there is no live record (already settled / expired / unknown).
   *  Idempotent — a second call is a no-op. */
  operatorApprove(proposalId: string, passphrase?: string): boolean {
    const rec = this.findLive(proposalId);
    if (!rec) return false;
    this.settle(rec, passphrase ? { kind: 'approve', passphrase } : { kind: 'approve' });
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

  private printPrompt(p: ModalPayload, url: string): void {
    this.log('');
    this.log('  ⚠  PAYMENT APPROVAL REQUIRED — an AI agent wants to send FTC');
    this.log(`     Agent:  ${p.agentName}  (paired ${p.agentPairedAgo})`);
    if (p.payingAs) this.log(`     Paying as: ${p.payingAs}${p.uboName ? `  (you: ${p.uboName})` : ''}`);
    this.log(`     To:     ${p.to}`);
    this.log(`     Amount: ${p.amountFtc} FTC  (fee ~${p.feeFtc} FTC)`);
    if (p.remittanceSummary && p.remittanceSummary.length > 0) {
      this.log('     Attached:');
      for (const s of p.remittanceSummary) this.log(`       ${s}`);
    }
    this.log('     → Approve or reject in your browser:');
    this.log(`       ${url}`);
    this.log('');
  }

  registerRoutes(app: FastifyInstance): void {
    // The confirm page posts a plain HTML form (JS-free), so we need a urlencoded
    // body parser. Fastify only ships a JSON parser by default.
    if (!app.hasContentTypeParser('application/x-www-form-urlencoded')) {
      app.addContentTypeParser(
        'application/x-www-form-urlencoded', { parseAs: 'string' },
        (_req, body, done) => {
          try { done(null, Object.fromEntries(new URLSearchParams(body as string))); }
          catch (e) { done(e as Error, undefined); }
        });
    }

    // GET — render the approval page. Side-effect-free (refresh-safe; never consumes).
    app.get('/confirm/:confirmSecret', async (req, reply) => {
      if (!this.hostOk(req)) return this.deny(reply, 403, 'bad host');
      const secret = (req.params as { confirmSecret: string }).confirmSecret;
      const rec = this.liveRecord(secret);
      // Generic 404 (no echo) so a stale/used/wrong-guess link all look identical.
      if (!rec) return this.sendHtml(reply, 404, renderSimplePage('Not found',
        'This approval link is unknown, already used, or expired.'));
      return this.sendHtml(reply, 200, renderConfirmPage(rec, secret));
    });

    // POST — THE decision sink. The ONLY state-changing route.
    app.post('/confirm/:confirmSecret', async (req, reply) => {
      // 1. Browser wall — all fail-closed, record untouched on failure.
      if (!this.hostOk(req)) return this.deny(reply, 403, 'bad host');
      if (req.headers.authorization) return this.deny(reply, 403, 'bearer not accepted here');
      if (!this.originOk(req)) return this.deny(reply, 403, 'origin not allowed');
      if (!this.fetchSiteOk(req)) return this.deny(reply, 403, 'cross-site request blocked');

      const secret = (req.params as { confirmSecret: string }).confirmSecret;
      const rec = this.liveRecord(secret);
      if (!rec) return this.sendHtml(reply, 410, renderSimplePage('Expired',
        'This approval link is already used or expired. Nothing was sent.'));

      // 2. pageNonce must match (proves the POST came from our served page).
      //    Constant-time; a wrong/missing nonce does NOT consume the record so the
      //    legitimate operator can retry.
      const body = (req.body ?? {}) as Record<string, unknown>;
      const nonce = typeof body.pageNonce === 'string' ? body.pageNonce : '';
      if (!ctEqual(nonce, rec.pageNonce)) return this.deny(reply, 403, 'invalid page token');

      // 3. Normalize the decision (fail-closed) and consume atomically.
      const decision = coerceDecision({
        kind: body.decision === 'approve' ? 'approve'
          : body.decision === 'reject' ? 'reject' : undefined,
        passphrase: typeof body.passphrase === 'string' ? body.passphrase : undefined,
        reason: 'rejected in browser',
      });
      this.settle(rec, decision);
      return this.sendHtml(reply, 200, decision.kind === 'approve'
        ? renderSimplePage('Approved', 'Payment approved and submitting. You can close this tab.')
        : renderSimplePage('Rejected', 'Payment rejected. Nothing was sent. You can close this tab.'));
    });
  }

  // ── Browser wall helpers ───────────────────────────────────────────────────

  private hostOk(req: FastifyRequest): boolean {
    const host = String(req.headers.host ?? '');
    return host === `127.0.0.1:${this.port}`
      || host === `localhost:${this.port}`
      || host === `[::1]:${this.port}`;
  }

  private originOk(req: FastifyRequest): boolean {
    const o = req.headers.origin;
    if (typeof o !== 'string' || o.length === 0) return false; // absent/null REJECTED here
    return o === `http://127.0.0.1:${this.port}` || o === `http://localhost:${this.port}`;
  }

  private fetchSiteOk(req: FastifyRequest): boolean {
    const sfs = req.headers['sec-fetch-site'];
    if (sfs === undefined) return true;            // older browsers — Origin+Host already gate
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

// ── Crypto helpers ───────────────────────────────────────────────────────────

/** Constant-time string compare (hash both then timingSafeEqual, so length never
 *  leaks via timing). Mirrors pairing.ts constantTimeEqualStrings. */
function ctEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ah = createHash('sha256').update(a).digest();
  const bh = createHash('sha256').update(b).digest();
  return timingSafeEqual(ah, bh);
}

// ── Browser-open (no shell — fixed argv, per the CLAUDE.md anti-pattern) ───────

function defaultOpenUrl(url: string): void {
  const swallow = (): void => { /* a failed open is non-fatal — the URL is printed */ };
  if (process.platform === 'win32') {
    // rundll32 avoids cmd/start and its metacharacter risk entirely.
    execFile('rundll32', ['url.dll,FileProtocolHandler', url], swallow);
  } else if (process.platform === 'darwin') {
    execFile('open', [url], swallow);
  } else {
    execFile('xdg-open', [url], swallow);
  }
}

// ── HTML rendering (all dynamic values escaped; CSP-locked; JS-free) ───────────

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
  .card { background: #fff; border: 1px solid #dfe6ee; border-radius: 14px; max-width: 460px;
    width: 100%; padding: 28px; box-shadow: 0 8px 30px rgba(16,32,46,.08); }
  .warn { color: #b25e00; font-weight: 700; font-size: 14px; letter-spacing: .02em;
    text-transform: uppercase; margin: 0 0 14px; }
  .amt { font-size: 30px; font-weight: 800; margin: 6px 0 2px; }
  .row { display: flex; justify-content: space-between; gap: 12px; padding: 8px 0;
    border-top: 1px solid #eef2f6; font-size: 15px; }
  .row .k { color: #5b6b7d; } .row .v { text-align: right; word-break: break-all; }
  .note { background: #fff8ec; border: 1px solid #f3e2c0; border-radius: 8px;
    padding: 10px 12px; margin: 14px 0 0; font-size: 14px; }
  .f { display: block; margin: 16px 0 0; font-size: 14px; color: #5b6b7d; }
  .f input { display: block; width: 100%; margin-top: 6px; padding: 10px 12px; font-size: 16px;
    border: 1px solid #cfdae6; border-radius: 8px; }
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
  const action = `/confirm/${esc(secret)}`;
  const label = p.toLabel
    ? ` <span class="k">(${esc(p.toLabel)}${p.toSeenTimes !== undefined ? `, seen ${esc(p.toSeenTimes)}×` : ''})</span>`
    : '';
  const note = p.agentNote
    ? `<div class="note"><b>Agent note</b> (agent-supplied, not verified): ${esc(p.agentNote)}</div>`
    : '';
  const remittance = p.remittanceSummary && p.remittanceSummary.length > 0
    ? `<div class="note"><b>Attached</b>:<br>${p.remittanceSummary.map((s) => esc(s)).join('<br>')}</div>`
    : '';
  const passField = p.walletHasPassphrase
    ? `<label class="f">Wallet passphrase`
      + `<input type="password" name="passphrase" autocomplete="off" autocapitalize="off"`
      + ` autocorrect="off" spellcheck="false"></label>`
    : '';
  const inner = `
    <p class="warn">⚠ Payment approval required</p>
    <div class="amt">${esc(p.amountFtc)} FTC</div>
    <div class="row"><span class="k">Fee (est.)</span><span class="v">~${esc(p.feeFtc)} FTC</span></div>
    <div class="row"><span class="k">To</span><span class="v">${esc(p.to)}${label}</span></div>
    <div class="row"><span class="k">Balance after</span><span class="v">${esc(p.balanceAfterFtc)} FTC</span></div>
    <div class="row"><span class="k">Agent</span><span class="v">${esc(p.agentName)} <span class="k">(paired ${esc(p.agentPairedAgo)})</span></span></div>
    ${p.payingAs ? `<div class="row"><span class="k">Paying as</span><span class="v">${esc(p.payingAs)}${p.uboName ? ` <span class="k">(you: ${esc(p.uboName)})</span>` : ''}</span></div>` : ''}
    ${note}
    ${remittance}
    <form method="post" action="${action}">
      <input type="hidden" name="pageNonce" value="${esc(rec.pageNonce)}">
      ${passField}
      <div class="btns">
        <button class="approve" type="submit" name="decision" value="approve">Approve &amp; send</button>
        <button class="reject" type="submit" name="decision" value="reject">Reject</button>
      </div>
    </form>`;
  return htmlShell('Confirm FTC payment', inner);
}

function renderSimplePage(heading: string, message: string): string {
  return htmlShell(heading,
    `<div class="done"><h1>${esc(heading)}</h1><p>${esc(message)}</p></div>`);
}
