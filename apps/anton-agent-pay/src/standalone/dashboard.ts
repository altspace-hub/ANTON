/**
 * dashboard.ts — a LOCAL operator dashboard for the Agent Pay standalone, served
 * at GET / on the same loopback port as /rpc. Shows the wallet, spend caps,
 * pending approvals, the in-flight proposal lifecycle, and the durable ledger.
 *
 * Read-only by default (no form, JS-free, CSP-locked, loopback-Host-walled; no
 * secret ever in the HTML). When the OPTIONAL action layer is enabled
 * (AGENT_PAY_DASHBOARD_ACTIONS=on → an `actions` DashboardActions is passed),
 * and the operator has unlocked it via the stderr-printed key, pending rows gain
 * Approve / Reject / Cancel forms. Approvals route through the driver's
 * operatorApprove BY proposalId — the dashboard never sees confirmSecret, and the
 * action routes reject bearers, so the AI agent can never self-approve.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { LedgerEntry } from '../main/ledger.js';
import type { PaymentProposal } from '../shared/ipc-types.js';
import type { DashboardActions } from './dashboard-actions.js';

export interface AgentPayDashboardConfig {
  walletReady: boolean;
  perPaymentCap?: number;
  dailyCap?: number;
  uboName?: string;
  uboCountry?: string;
  approvalMode: string;
  rpcEndpoint: string;
  attested?: boolean;
  mcpStdio?: boolean;
}

export interface WalletDetail {
  pubHex: string;
  falconPubHex: string;
  hasPassphrase: boolean;
}

export interface AgentPayDashboardOptions {
  port: number;
  host?: string;
  config: AgentPayDashboardConfig;
  walletStatus: () => Promise<{ walletAddress: string; balanceFtc: number; lastSeenBlock: number }>;
  transactions: (limit: number) => Promise<LedgerEntry[]>;
  proposals?: () => PaymentProposal[];
  pendingConfirms?: () => { count: number; soonestExpiryMs: number | null };
  committed24hFtc?: () => number;
  walletDetail?: () => Promise<WalletDetail | null>;
  /** OPTIONAL operator-gated action layer (approve/reject/cancel). Off when absent. */
  actions?: DashboardActions;
}

interface Auth { mode: 'off' | 'locked' | 'unlocked'; dnonce?: string }

export function registerAgentPayDashboard(app: FastifyInstance, opts: AgentPayDashboardOptions): void {
  const host = opts.host ?? '127.0.0.1';
  const hostOk = (req: FastifyRequest): boolean => {
    const h = String(req.headers.host ?? '');
    return h === `${host}:${opts.port}` || h === `127.0.0.1:${opts.port}` || h === `localhost:${opts.port}` || h === `[::1]:${opts.port}`;
  };
  const send = (reply: FastifyReply, status: number, html: string): FastifyReply =>
    reply.status(status)
      .header('content-type', 'text/html; charset=utf-8')
      .header('content-security-policy', "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'")
      .header('x-frame-options', 'DENY').header('referrer-policy', 'no-referrer')
      .header('cache-control', 'no-store').header('x-content-type-options', 'nosniff')
      .send(html);

  if (opts.actions) opts.actions.registerRoutes(app);

  const render = async (req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    const [status, txs, detail] = await Promise.all([
      opts.walletStatus().catch(() => ({ walletAddress: '—', balanceFtc: NaN, lastSeenBlock: 0 })),
      opts.transactions(100).catch(() => [] as LedgerEntry[]),
      opts.walletDetail ? opts.walletDetail().catch(() => null) : Promise.resolve(null),
    ]);
    const proposals = opts.proposals ? safe(opts.proposals, [] as PaymentProposal[]) : [];
    const pending = opts.pendingConfirms ? safe(opts.pendingConfirms, { count: 0, soonestExpiryMs: null }) : { count: 0, soonestExpiryMs: null };
    const committed24h = opts.committed24hFtc ? safe(opts.committed24hFtc, NaN) : NaN;
    const auth: Auth = !opts.actions ? { mode: 'off' }
      : opts.actions.isAuthed(req) ? { mode: 'unlocked', dnonce: opts.actions.mintNonce() }
      : { mode: 'locked' };
    return send(reply, 200, page(opts.config, status, detail, txs, proposals, pending, committed24h, auth));
  };

  app.get('/', async (req, reply) => hostOk(req) ? render(req, reply) : send(reply, 403, simple('Blocked', 'bad host')));
  app.get('/dashboard', async (req, reply) => hostOk(req) ? render(req, reply) : send(reply, 403, simple('Blocked', 'bad host')));
}

function safe<T>(fn: () => T, fallback: T): T { try { return fn(); } catch { return fallback; } }

// ── Rendering ────────────────────────────────────────────────────────────────

const PENDING_STATES = new Set(['pending', 'approved']);

function page(
  c: AgentPayDashboardConfig,
  status: { walletAddress: string; balanceFtc: number; lastSeenBlock: number },
  detail: WalletDetail | null,
  txs: LedgerEntry[],
  proposals: PaymentProposal[],
  pending: { count: number; soonestExpiryMs: number | null },
  committed24h: number,
  auth: Auth,
): string {
  const now = Date.now();
  const acting = auth.mode === 'unlocked' && Boolean(auth.dnonce);
  const needsPass = Boolean(detail?.hasPassphrase);
  const bal = Number.isFinite(status.balanceFtc) ? `${status.balanceFtc.toLocaleString('en-US', { maximumFractionDigits: 6 })} FTC` : '—';
  const usage = Number.isFinite(committed24h)
    ? `${committed24h.toLocaleString('en-US', { maximumFractionDigits: 4 })}${c.dailyCap !== undefined ? ` / ${c.dailyCap}` : ''} FTC (sent + in-flight)`
    : '—';

  const settings = section('Wallet & settings', kvTable([
    ['Wallet address', status.walletAddress],
    ['Balance', bal],
    ['Last-seen block', status.lastSeenBlock ? String(status.lastSeenBlock) : '—'],
    ['Wallet', c.walletReady ? 'ready' : 'none (read-only — set AGENT_PAY_MNEMONIC to send)'],
    ['Ed25519 key', detail ? short(detail.pubHex, 20) : '—'],
    ['FALCON-512 key', detail ? short(detail.falconPubHex, 20) : '—'],
    ['Passphrase lock', detail ? (detail.hasPassphrase ? 'on' : 'off') : '—'],
    ['Per-payment cap', c.perPaymentCap !== undefined ? `${c.perPaymentCap} FTC` : '∞'],
    ['24h cap', c.dailyCap !== undefined ? `${c.dailyCap} FTC` : '∞'],
    ['24h usage', usage],
    ['Ultimate debtor (UBO)', c.uboName ? `${c.uboName}${c.uboCountry ? ` (${c.uboCountry})` : ''}` : 'not set'],
    ['Approval', c.approvalMode === 'web' ? 'browser confirm' : 'terminal y/N'],
    ['Awaiting approval', pending.count > 0 ? `${pending.count} (soonest expires in ${ms(pending.soonestExpiryMs)})` : 'none'],
    ['Attested submits', c.attested ? 'on' : 'off'],
    ['MCP stdio', c.mcpStdio ? 'on' : 'off'],
    ['FutureChain RPC', c.rpcEndpoint],
  ]));

  // Pending approvals — proposals awaiting a human decision; action forms when unlocked.
  const headers = ['State', 'Amount', 'To', 'Agent note', 'Agent', 'Expires', ...(acting ? ['Actions'] : [])];
  const pendingRows = proposals.filter((p) => PENDING_STATES.has(p.state)).map((p) => {
    const cells = [pill(p.state), `${p.amountFtc.toLocaleString('en-US', { maximumFractionDigits: 6 })} FTC`,
      esc(short(p.to, 14)), p.agentNote ? trunc(p.agentNote, 36) : '—', esc(p.agentName), expiresIn(p.expiresAt, now)];
    if (acting) cells.push(actionForms(p.id, auth.dnonce as string, needsPass));
    return row(cells);
  });
  const pendingPanel = section(`Pending approvals (${pendingRows.length})`,
    authBanner(auth) + (pendingRows.length ? table(headers, pendingRows)
      : empty(pending.count > 0 ? 'A browser confirm is open — check the gateway terminal for the link.' : 'No payments awaiting approval.')));

  const txRows = txs.map((t) => row([
    `<span class="dir ${t.direction === 'out' ? 'out' : 'in'}">${t.direction === 'out' ? '− out' : '+ in'}</span>`,
    `${t.amount.toLocaleString('en-US', { maximumFractionDigits: 6 })} FTC`,
    esc(short(t.counterparty, 14)), t.reference ? trunc(t.reference, 36) : '—',
    t.feeFtc !== undefined ? `${t.feeFtc} FTC` : '—', t.confirmed ? 'confirmed' : 'pending', when(t.ts),
  ]));
  const txPanel = section(`Transactions (${txs.length})`,
    txs.length ? table(['Dir', 'Amount', 'Counterparty', 'Reference', 'Fee', 'Status', 'When'], txRows) : empty('No transactions yet.'));

  const histRows = proposals.filter((p) => !PENDING_STATES.has(p.state)).map((p) => row([
    pill(p.state), `${p.amountFtc.toLocaleString('en-US', { maximumFractionDigits: 6 })} FTC`, esc(short(p.to, 14)),
    p.state === 'sent' && p.txId ? short(p.txId, 10) : p.rejectReason ? trunc(p.rejectReason, 36) : '—', when(p.createdAt),
  ]));
  const histPanel = histRows.length
    ? section(`Proposal lifecycle (${histRows.length})`, table(['Outcome', 'Amount', 'To', 'Result', 'Proposed'], histRows))
    : '';

  return shell('ANTON Agent Pay — dashboard', `
    <h1>ANTON Agent Pay <span class="tag">${auth.mode === 'unlocked' ? 'operator' : 'read-only'}</span>${auth.mode === 'unlocked' ? ' <a class="lock" href="/dashboard/logout">Lock</a>' : ''}</h1>
    ${settings}${pendingPanel}${txPanel}${histPanel}
    <p class="foot">${auth.mode === 'unlocked'
      ? 'Operator console unlocked — Approve sends the real payment (gated by your key + a single-use form token). The AI agent cannot reach these actions.'
      : 'Read-only. Every payment requires a one-time confirm (terminal/browser); there is no send control on this page.'}</p>`);
}

function authBanner(auth: Auth): string {
  if (auth.mode === 'locked') return `<p class="locked">🔒 Action console locked. To approve/reject from here, open the unlock link printed in the gateway terminal.</p>`;
  return '';
}
function actionForms(id: string, dnonce: string, needsPass: boolean): string {
  const pass = needsPass ? `<input class="pp" type="password" name="passphrase" placeholder="passphrase" autocomplete="off">` : '';
  return `<div class="acts">`
    + `<form method="post" action="/dashboard/approve">${hid(id, dnonce)}${pass}<button class="approve">Approve</button></form>`
    + `<form method="post" action="/dashboard/reject">${hid(id, dnonce)}<button class="reject">Reject</button></form>`
    + `<form method="post" action="/dashboard/cancel-proposal">${hid(id, dnonce)}<button class="cancel">Cancel</button></form>`
    + `</div>`;
}
function hid(id: string, dnonce: string): string {
  return `<input type="hidden" name="id" value="${esc(id)}"><input type="hidden" name="dnonce" value="${esc(dnonce)}">`;
}

// ── HTML helpers (CSP-locked) ────────────────────────────────────────────────

function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] as string));
}
function short(s: string, n: number): string { return s && s.length > n + 4 ? `${s.slice(0, n)}…` : s; }
function trunc(s: string, n: number): string { return s && s.length > n ? `${esc(s.slice(0, n))}…` : esc(s); }
function when(ts: number): string {
  if (!ts) return '—';
  const d = new Date(ts);
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
}
function expiresIn(expiresAt: number, now: number): string {
  const s = Math.floor((expiresAt - now) / 1000);
  if (s <= 0) return 'expired';
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}
function ms(v: number | null): string {
  if (v === null) return '—';
  const s = Math.max(0, Math.floor(v / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m`;
}
function pill(s: string): string { return `<span class="pill">${esc(s)}</span>`; }
function kvTable(rows: Array<[string, string]>): string {
  return `<table class="kv">${rows.map(([k, v]) => `<tr><td class="k">${esc(k)}</td><td class="v">${esc(v)}</td></tr>`).join('')}</table>`;
}
function table(headers: string[], rows: string[]): string {
  return `<div class="scroll"><table><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
}
function row(cells: string[]): string { return `<tr>${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`; }
function section(title: string, inner: string): string { return `<section><h2>${esc(title)}</h2>${inner}</section>`; }
function empty(msg2: string): string { return `<p class="empty">${esc(msg2)}</p>`; }

const CSS = `
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 14px/1.5 -apple-system, system-ui, Segoe UI, Roboto, sans-serif; background: #f4f6f8; color: #16202e; padding: 24px; }
  h1 { font-size: 22px; margin: 0 0 18px; } .tag { font-size: 12px; font-weight: 600; color: #5b6b7d; background: #e9eef3; border-radius: 6px; padding: 2px 8px; vertical-align: middle; }
  a.lock { font-size: 12px; font-weight: 600; color: #b25e00; margin-left: 8px; }
  section { background: #fff; border: 1px solid #dfe6ee; border-radius: 12px; padding: 16px 18px; margin: 0 0 16px; max-width: 1040px; }
  h2 { font-size: 14px; text-transform: uppercase; letter-spacing: .03em; color: #5b6b7d; margin: 0 0 10px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .scroll { overflow-x: auto; }
  th { text-align: left; color: #5b6b7d; font-weight: 600; padding: 6px 10px; border-bottom: 2px solid #eef2f6; white-space: nowrap; }
  td { padding: 7px 10px; border-bottom: 1px solid #f0f3f6; vertical-align: top; word-break: break-word; }
  table.kv td.k { color: #5b6b7d; width: 220px; } table.kv td.v { font-family: ui-monospace, Menlo, Consolas, monospace; }
  .dir { font-weight: 700; } .dir.out { color: #16202e; } .dir.in { color: #15803D; }
  .pill { display: inline-block; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .02em; background: #e9eef3; color: #44566a; border-radius: 999px; padding: 2px 8px; }
  .empty { color: #8a98a6; margin: 0; } .foot { color: #8a98a6; font-size: 12px; max-width: 1040px; }
  .locked { background: #fff8ec; border: 1px solid #f3e2c0; border-radius: 8px; padding: 10px 12px; margin: 0 0 10px; font-size: 13px; }
  .acts { display: flex; gap: 6px; align-items: center; } .acts form { margin: 0; display: inline; }
  .acts button { font-size: 12px; font-weight: 700; border-radius: 7px; border: 1px solid transparent; padding: 5px 10px; cursor: pointer; }
  .acts .approve { background: #0D7D6C; color: #fff; } .acts .reject { background: #fff; color: #16202e; border-color: #cfdae6; } .acts .cancel { background: #fff; color: #8a98a6; border-color: #e3e9ef; }
  .acts .pp { width: 96px; padding: 4px 6px; border: 1px solid #cfdae6; border-radius: 6px; font-size: 12px; }
`;
function shell(title: string, inner: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${CSS}</style></head><body>${inner}</body></html>`;
}
function simple(h: string, m: string): string { return shell(h, `<h1>${esc(h)}</h1><p>${esc(m)}</p>`); }
