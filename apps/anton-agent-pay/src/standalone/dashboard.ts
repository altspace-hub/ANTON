/**
 * dashboard.ts — a LOCAL, read-only settings + history view for the Agent Pay
 * standalone, served at GET / on the same loopback port as /rpc. The operator
 * opens http://127.0.0.1:<port>/ to see the wallet, spend caps, pending
 * approvals, the in-flight proposal lifecycle, and the durable transaction
 * ledger.
 *
 * Server-rendered, JS-free, CSP-locked, loopback-Host-walled, and strictly
 * READ-ONLY: it renders snapshots and has NO form that posts anywhere. There is
 * NO send/pay/approve control here — every payment still requires the separate
 * one-time confirm (terminal or /confirm browser URL). Money cannot move from
 * this page. Secrets (confirmSecret, pageNonce, private keys, bearers) are never
 * in scope of the renderer.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { LedgerEntry } from '../main/ledger.js';
import type { PaymentProposal } from '../shared/ipc-types.js';

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
  /** Snapshot of the in-memory proposal store (pending + terminal). */
  proposals?: () => PaymentProposal[];
  /** Secret-free count of outstanding browser-confirm prompts. */
  pendingConfirms?: () => { count: number; soonestExpiryMs: number | null };
  /** FTC sent-or-in-flight in the trailing 24h (the daily-cap basis). */
  committed24hFtc?: () => number;
  /** Wallet pubkeys + passphrase flag (no private key). */
  walletDetail?: () => Promise<WalletDetail | null>;
}

export function registerAgentPayDashboard(app: FastifyInstance, opts: AgentPayDashboardOptions): void {
  const host = opts.host ?? '127.0.0.1';
  const hostOk = (req: FastifyRequest): boolean => {
    const h = String(req.headers.host ?? '');
    return h === `${host}:${opts.port}` || h === `127.0.0.1:${opts.port}` || h === `localhost:${opts.port}` || h === `[::1]:${opts.port}`;
  };
  const send = (reply: FastifyReply, status: number, html: string): FastifyReply =>
    reply.status(status)
      .header('content-type', 'text/html; charset=utf-8')
      .header('content-security-policy', "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'")
      .header('x-frame-options', 'DENY').header('referrer-policy', 'no-referrer')
      .header('cache-control', 'no-store').header('x-content-type-options', 'nosniff')
      .send(html);

  const render = async (reply: FastifyReply): Promise<FastifyReply> => {
    const [status, txs, detail] = await Promise.all([
      opts.walletStatus().catch(() => ({ walletAddress: '—', balanceFtc: NaN, lastSeenBlock: 0 })),
      opts.transactions(100).catch(() => [] as LedgerEntry[]),
      opts.walletDetail ? opts.walletDetail().catch(() => null) : Promise.resolve(null),
    ]);
    const proposals = opts.proposals ? safe(opts.proposals, [] as PaymentProposal[]) : [];
    const pending = opts.pendingConfirms ? safe(opts.pendingConfirms, { count: 0, soonestExpiryMs: null }) : { count: 0, soonestExpiryMs: null };
    const committed24h = opts.committed24hFtc ? safe(opts.committed24hFtc, NaN) : NaN;
    return send(reply, 200, page(opts.config, status, detail, txs, proposals, pending, committed24h));
  };

  app.get('/', async (req, reply) => hostOk(req) ? render(reply) : send(reply, 403, simple('Blocked', 'bad host')));
  app.get('/dashboard', async (req, reply) => hostOk(req) ? render(reply) : send(reply, 403, simple('Blocked', 'bad host')));
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
): string {
  const now = Date.now();
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

  // Pending approvals — proposals awaiting a human decision.
  const pendingRows = proposals.filter((p) => PENDING_STATES.has(p.state)).map((p) => row([
    pill(p.state), `${p.amountFtc.toLocaleString('en-US', { maximumFractionDigits: 6 })} FTC`,
    esc(short(p.to, 14)), p.agentNote ? trunc(p.agentNote, 36) : '—', esc(p.agentName), expiresIn(p.expiresAt, now),
  ]));
  const pendingPanel = section(`Pending approvals (${pendingRows.length})`,
    pendingRows.length ? table(['State', 'Amount', 'To', 'Agent note', 'Agent', 'Expires'], pendingRows)
      : empty(pending.count > 0 ? 'A browser confirm is open — check the gateway terminal for the link.' : 'No payments awaiting approval.'));

  // Durable transaction ledger (sent + received).
  const txRows = txs.map((t) => row([
    `<span class="dir ${t.direction === 'out' ? 'out' : 'in'}">${t.direction === 'out' ? '− out' : '+ in'}</span>`,
    `${t.amount.toLocaleString('en-US', { maximumFractionDigits: 6 })} FTC`,
    esc(short(t.counterparty, 14)), t.reference ? trunc(t.reference, 36) : '—',
    t.feeFtc !== undefined ? `${t.feeFtc} FTC` : '—', t.confirmed ? 'confirmed' : 'pending', when(t.ts),
  ]));
  const txPanel = section(`Transactions (${txs.length})`,
    txs.length ? table(['Dir', 'Amount', 'Counterparty', 'Reference', 'Fee', 'Status', 'When'], txRows) : empty('No transactions yet.'));

  // In-flight proposal lifecycle — terminal outcomes from this session (in-memory).
  const histRows = proposals.filter((p) => !PENDING_STATES.has(p.state)).map((p) => row([
    pill(p.state), `${p.amountFtc.toLocaleString('en-US', { maximumFractionDigits: 6 })} FTC`,
    esc(short(p.to, 14)),
    p.state === 'sent' && p.txId ? short(p.txId, 10) : p.rejectReason ? trunc(p.rejectReason, 36) : '—',
    when(p.createdAt),
  ]));
  const histPanel = histRows.length
    ? section(`Proposal lifecycle (${histRows.length})`, table(['Outcome', 'Amount', 'To', 'Result', 'Proposed'], histRows))
    : '';

  return shell('ANTON Agent Pay — dashboard', `
    <h1>ANTON Agent Pay <span class="tag">read-only</span></h1>
    ${settings}${pendingPanel}${txPanel}${histPanel}
    <p class="foot">Read-only. Every payment requires the separate one-time confirm (terminal or browser); there is no send or approve control on this page.</p>`);
}

// ── HTML helpers (JS-free, CSP-locked) ───────────────────────────────────────

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
function empty(msg: string): string { return `<p class="empty">${esc(msg)}</p>`; }

const CSS = `
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 14px/1.5 -apple-system, system-ui, Segoe UI, Roboto, sans-serif; background: #f4f6f8; color: #16202e; padding: 24px; }
  h1 { font-size: 22px; margin: 0 0 18px; } .tag { font-size: 12px; font-weight: 600; color: #5b6b7d; background: #e9eef3; border-radius: 6px; padding: 2px 8px; vertical-align: middle; }
  section { background: #fff; border: 1px solid #dfe6ee; border-radius: 12px; padding: 16px 18px; margin: 0 0 16px; max-width: 980px; }
  h2 { font-size: 14px; text-transform: uppercase; letter-spacing: .03em; color: #5b6b7d; margin: 0 0 10px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .scroll { overflow-x: auto; }
  th { text-align: left; color: #5b6b7d; font-weight: 600; padding: 6px 10px; border-bottom: 2px solid #eef2f6; white-space: nowrap; }
  td { padding: 7px 10px; border-bottom: 1px solid #f0f3f6; vertical-align: top; word-break: break-word; }
  table.kv td.k { color: #5b6b7d; width: 220px; } table.kv td.v { font-family: ui-monospace, Menlo, Consolas, monospace; }
  .dir { font-weight: 700; } .dir.out { color: #16202e; } .dir.in { color: #15803D; }
  .pill { display: inline-block; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .02em; background: #e9eef3; color: #44566a; border-radius: 999px; padding: 2px 8px; }
  .empty { color: #8a98a6; margin: 0; } .foot { color: #8a98a6; font-size: 12px; max-width: 980px; }
`;
function shell(title: string, inner: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${CSS}</style></head><body>${inner}</body></html>`;
}
function simple(h: string, m: string): string { return shell(h, `<h1>${esc(h)}</h1><p>${esc(m)}</p>`); }
