/**
 * dashboard.ts — a LOCAL, read-only settings + history view for the Agent Pay
 * standalone, served at GET / on the same loopback port as /rpc. The operator
 * opens http://127.0.0.1:<port>/ to see the wallet, spend caps, and the durable
 * transaction ledger.
 *
 * Server-rendered, JS-free, CSP-locked, loopback-Host-walled, and strictly
 * READ-ONLY: it renders snapshots and has NO form that posts anywhere. There is
 * NO send/pay control here — every payment still requires the separate one-time
 * confirm (terminal or /confirm browser URL). Money cannot move from this page.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { LedgerEntry } from '../main/ledger.js';

export interface AgentPayDashboardConfig {
  walletReady: boolean;
  perPaymentCap?: number;
  dailyCap?: number;
  uboName?: string;
  uboCountry?: string;
  approvalMode: string;
  rpcEndpoint: string;
}

export interface AgentPayDashboardOptions {
  port: number;
  host?: string;
  config: AgentPayDashboardConfig;
  walletStatus: () => Promise<{ walletAddress: string; balanceFtc: number; lastSeenBlock: number }>;
  transactions: (limit: number) => Promise<LedgerEntry[]>;
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
    const [status, txs] = await Promise.all([
      opts.walletStatus().catch(() => ({ walletAddress: '—', balanceFtc: NaN, lastSeenBlock: 0 })),
      opts.transactions(100).catch(() => [] as LedgerEntry[]),
    ]);
    return send(reply, 200, page(opts.config, status, txs));
  };

  app.get('/', async (req, reply) => hostOk(req) ? render(reply) : send(reply, 403, simple('Blocked', 'bad host')));
  app.get('/dashboard', async (req, reply) => hostOk(req) ? render(reply) : send(reply, 403, simple('Blocked', 'bad host')));
}

// ── Rendering ────────────────────────────────────────────────────────────────

function page(c: AgentPayDashboardConfig, status: { walletAddress: string; balanceFtc: number; lastSeenBlock: number }, txs: LedgerEntry[]): string {
  const bal = Number.isFinite(status.balanceFtc) ? `${status.balanceFtc.toLocaleString('en-US', { maximumFractionDigits: 6 })} FTC` : '—';
  const settings = section('Wallet & settings', kvTable([
    ['Wallet address', status.walletAddress],
    ['Balance', bal],
    ['Last-seen block', status.lastSeenBlock ? String(status.lastSeenBlock) : '—'],
    ['Wallet', c.walletReady ? 'ready' : 'none (read-only — set AGENT_PAY_MNEMONIC to send)'],
    ['Per-payment cap', c.perPaymentCap !== undefined ? `${c.perPaymentCap} FTC` : '∞'],
    ['24h cap', c.dailyCap !== undefined ? `${c.dailyCap} FTC` : '∞'],
    ['Ultimate debtor (UBO)', c.uboName ? `${c.uboName}${c.uboCountry ? ` (${c.uboCountry})` : ''}` : 'not set'],
    ['Approval', c.approvalMode === 'web' ? 'browser confirm' : 'terminal y/N'],
    ['FutureChain RPC', c.rpcEndpoint],
  ]));

  const txRows = txs.map((t) => row([
    `<span class="dir ${t.direction === 'out' ? 'out' : 'in'}">${t.direction === 'out' ? '− out' : '+ in'}</span>`,
    `${t.amount.toLocaleString('en-US', { maximumFractionDigits: 6 })} FTC`,
    esc(short(t.counterparty, 14)),
    t.reference ? trunc(t.reference, 40) : '—',
    t.feeFtc !== undefined ? `${t.feeFtc} FTC` : '—',
    t.confirmed ? 'confirmed' : 'pending',
    when(t.ts),
  ]));
  const history = section(`Transactions (${txs.length})`,
    txs.length ? table(['Dir', 'Amount', 'Counterparty', 'Reference', 'Fee', 'Status', 'When'], txRows) : empty('No transactions yet.'));

  return shell('ANTON Agent Pay — dashboard', `
    <h1>ANTON Agent Pay <span class="tag">read-only</span></h1>
    ${settings}${history}
    <p class="foot">Read-only. Every payment requires the separate one-time confirm (terminal or browser); there is no send control on this page.</p>`);
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
  .empty { color: #8a98a6; margin: 0; } .foot { color: #8a98a6; font-size: 12px; max-width: 980px; }
`;
function shell(title: string, inner: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${CSS}</style></head><body>${inner}</body></html>`;
}
function simple(h: string, m: string): string { return shell(h, `<h1>${esc(h)}</h1><p>${esc(m)}</p>`); }
