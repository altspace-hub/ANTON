/**
 * dashboard.ts — a LOCAL, read-only settings + history view for the collaboration
 * standalone, served at GET / on the same loopback port as /rpc. The operator
 * opens http://127.0.0.1:<port>/ in a browser to see the agent's identity + config
 * and its agreement / task / fulfilment / escrow history.
 *
 * Server-rendered, JS-free, CSP-locked, loopback-Host-walled — and strictly
 * READ-ONLY: it renders snapshots of the durable stores and has NO form that posts
 * anywhere. Approvals stay in the separate /agreement-confirm flow (web-confirm.ts);
 * money moves only in Agent Pay. There is nothing actionable on this page.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Agreement } from '../main/agreement-core.js';
import type { TaskSummary } from '../main/task-store.js';
import type { FulfilmentRecord } from '../main/fulfilment-core.js';
import type { EscrowRecord } from '../main/escrow-core.js';

export interface CollabDashboardSettings {
  signingPubkey: string;
  contactHash: string;
  relayBase: string;
  registryBase: string;
  approvalMode: string;
  reviewModel?: string;
  phoneChannel: boolean;
  walletView: boolean;
  storeDir: string;
}

export interface CollabDashboardOptions {
  port: number;
  host?: string;
  settings: CollabDashboardSettings;
  agreements: () => Promise<Agreement[]>;
  tasks: () => Promise<TaskSummary[]>;
  fulfilments: () => Promise<FulfilmentRecord[]>;
  escrows: () => Promise<EscrowRecord[]>;
}

export function registerCollabDashboard(app: FastifyInstance, opts: CollabDashboardOptions): void {
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
    const [agreements, tasks, fulfilments, escrows] = await Promise.all([
      opts.agreements().catch(() => [] as Agreement[]),
      opts.tasks().catch(() => [] as TaskSummary[]),
      opts.fulfilments().catch(() => [] as FulfilmentRecord[]),
      opts.escrows().catch(() => [] as EscrowRecord[]),
    ]);
    return send(reply, 200, page(opts.settings, agreements, tasks, fulfilments, escrows));
  };

  app.get('/', async (req, reply) => hostOk(req) ? render(reply) : send(reply, 403, simple('Blocked', 'bad host')));
  app.get('/dashboard', async (req, reply) => hostOk(req) ? render(reply) : send(reply, 403, simple('Blocked', 'bad host')));
}

// ── Rendering ────────────────────────────────────────────────────────────────

function page(s: CollabDashboardSettings, agreements: Agreement[], tasks: TaskSummary[], fulfilments: FulfilmentRecord[], escrows: EscrowRecord[]): string {
  const settings = section('Settings', kvTable([
    ['Agent address (relay)', s.contactHash],
    ['Agreement signing key', short(s.signingPubkey, 16)],
    ['Relay', s.relayBase],
    ['Registry', s.registryBase],
    ['Approval', s.approvalMode === 'web' ? 'browser confirm' : 'terminal y/N'],
    ['Four-eyes review', s.reviewModel ?? 'off'],
    ['Phone channel', s.phoneChannel ? 'on' : 'off'],
    ['Wallet view (over relay)', s.walletView ? 'on' : 'off'],
    ['Store', s.storeDir],
  ]));

  const agRows = agreements.map((a) => row([
    pill(a.status), a.role, esc(a.counterpartyAddress), trunc(a.decision, 60),
    `${ftc(a.amountMicroFtc)} FTC`, a.linkedTxHash ? short(a.linkedTxHash, 10) : '—', when(a.createdAt),
  ]));
  const agreementsPanel = section(`Agreements (${agreements.length})`,
    agreements.length ? table(['Status', 'Role', 'Counterparty', 'Decision', 'Amount', 'Settle tx', 'Created'], agRows)
      : empty('No agreements yet.'));

  const taskRows = tasks.map((t) => row([pill(t.status), trunc(t.title, 60), String(t.messageCount), t.lastText ? trunc(t.lastText, 50) : '—', when(t.updatedAt)]));
  const tasksPanel = section(`Tasks (${tasks.length})`,
    tasks.length ? table(['Status', 'Title', 'Msgs', 'Last', 'Updated'], taskRows) : empty('No tasks yet.'));

  const fRows = fulfilments.map((f) => row([pill(f.status), short(f.agreementId, 10), f.carrier ? esc(f.carrier) : '—', f.tracking ? esc(f.tracking) : '—', f.shippedAt ? when(f.shippedAt) : '—', f.confirmedAt ? when(f.confirmedAt) : '—']));
  const fulfilmentPanel = fulfilments.length ? section(`Fulfilment (${fulfilments.length})`, table(['Status', 'Agreement', 'Carrier', 'Tracking', 'Shipped', 'Delivered'], fRows)) : '';

  const eRows = escrows.map((e) => row([pill(e.status), short(e.agreementId, 10), `${ftc(e.amountMicroFtc)} FTC`, esc(e.escrowAddress), e.fundTxHash ? short(e.fundTxHash, 8) : '—']));
  const escrowPanel = escrows.length ? section(`Escrow (${escrows.length})`, table(['Status', 'Agreement', 'Amount', 'Escrow address', 'Fund tx'], eRows)) : '';

  return shell('ANTON Collaboration — dashboard', `
    <h1>ANTON Collaboration <span class="tag">read-only</span></h1>
    ${settings}${agreementsPanel}${tasksPanel}${fulfilmentPanel}${escrowPanel}
    <p class="foot">Read-only. Approvals happen in the one-time confirm link (terminal/browser); this page never signs or sends anything.</p>`);
}

// ── HTML helpers (shared shape with web-confirm; JS-free, CSP-locked) ─────────

function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}
function short(s: string, n: number): string { return s && s.length > n + 4 ? `${esc(s.slice(0, n))}…` : esc(s); }
function trunc(s: string, n: number): string { return s && s.length > n ? `${esc(s.slice(0, n))}…` : esc(s); }
function ftc(microFtc: string): string { const n = Number(microFtc); return Number.isFinite(n) ? (n / 1e6).toLocaleString('en-US', { maximumFractionDigits: 6 }) : esc(microFtc); }
function when(ts: number): string {
  if (!ts) return '—';
  const d = new Date(ts);
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
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
  .pill { display: inline-block; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .02em; background: #e9eef3; color: #44566a; border-radius: 999px; padding: 2px 8px; }
  .empty { color: #8a98a6; margin: 0; } .foot { color: #8a98a6; font-size: 12px; max-width: 980px; }
`;
function shell(title: string, inner: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${CSS}</style></head><body>${inner}</body></html>`;
}
function simple(h: string, m: string): string { return shell(h, `<h1>${esc(h)}</h1><p>${esc(m)}</p>`); }
