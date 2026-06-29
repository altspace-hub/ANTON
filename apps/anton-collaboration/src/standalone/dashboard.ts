/**
 * dashboard.ts — a LOCAL, read-only settings + history view for the collaboration
 * standalone, served at GET / on the same loopback port as /rpc. The operator
 * opens http://127.0.0.1:<port>/ to see the agent's identity + config, the
 * pending agreement approvals, negotiations, and the agreement / task /
 * fulfilment / escrow history.
 *
 * Server-rendered, JS-free, CSP-locked, loopback-Host-walled, and strictly
 * READ-ONLY: it renders snapshots and has NO form that posts anywhere. Approvals
 * stay in the separate /agreement-confirm flow; money moves only in Agent Pay.
 * Secrets (confirmSecret, pageNonce, private keys, bearers) are never in scope.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Agreement } from '../main/agreement-core.js';
import type { TaskSummary } from '../main/task-store.js';
import type { FulfilmentRecord } from '../main/fulfilment-core.js';
import type { EscrowRecord } from '../main/escrow-core.js';
import type { AgreementApproval } from '../main/agreement-proposals.js';
import type { NegotiationJob } from '../main/negotiation-store.js';

export interface CollabDashboardSettings {
  signingPubkey: string;
  contactHash: string;
  relayBase: string;
  registryBase: string;
  approvalMode: string;
  reviewModel?: string;
  reviewStrict?: boolean;
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
  agreementApprovals?: () => AgreementApproval[];
  negotiations?: () => NegotiationJob[];
  pendingConfirms?: () => { count: number; soonestExpiryMs: number | null };
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
    const approvals = opts.agreementApprovals ? safe(opts.agreementApprovals, [] as AgreementApproval[]) : [];
    const negotiations = opts.negotiations ? safe(opts.negotiations, [] as NegotiationJob[]) : [];
    const pending = opts.pendingConfirms ? safe(opts.pendingConfirms, { count: 0, soonestExpiryMs: null }) : { count: 0, soonestExpiryMs: null };
    return send(reply, 200, page(opts.settings, approvals, negotiations, pending, agreements, tasks, fulfilments, escrows));
  };

  app.get('/', async (req, reply) => hostOk(req) ? render(reply) : send(reply, 403, simple('Blocked', 'bad host')));
  app.get('/dashboard', async (req, reply) => hostOk(req) ? render(reply) : send(reply, 403, simple('Blocked', 'bad host')));
}

function safe<T>(fn: () => T, fallback: T): T { try { return fn(); } catch { return fallback; } }

// ── Rendering ────────────────────────────────────────────────────────────────

const PENDING_STATES = new Set(['pending', 'approved']);

function page(
  s: CollabDashboardSettings,
  approvals: AgreementApproval[],
  negotiations: NegotiationJob[],
  pending: { count: number; soonestExpiryMs: number | null },
  agreements: Agreement[], tasks: TaskSummary[], fulfilments: FulfilmentRecord[], escrows: EscrowRecord[],
): string {
  const now = Date.now();
  const reviewIndependence = s.reviewModel && /^claude/i.test(s.reviewModel) ? ' ⚠ shares the brain provider' : '';
  const settings = section('Settings', kvTable([
    ['Agent address (relay)', s.contactHash],
    ['Agreement signing key', short(s.signingPubkey, 16)],
    ['Relay', s.relayBase],
    ['Registry', s.registryBase],
    ['Approval', s.approvalMode === 'web' ? 'browser confirm' : 'terminal y/N'],
    ['Awaiting approval', pending.count > 0 ? `${pending.count} (soonest expires in ${ms(pending.soonestExpiryMs)})` : 'none'],
    ['Four-eyes review', (s.reviewModel ?? 'off') + reviewIndependence],
    ['Review strict (auto-reject on raise)', s.reviewStrict ? 'on' : 'off'],
    ['Phone channel', s.phoneChannel ? 'on' : 'off'],
    ['Wallet view (over relay)', s.walletView ? 'on' : 'off'],
    ['Store', s.storeDir],
  ]));

  // Pending agreement approvals — committing AGREE actions awaiting a decision.
  const apRows = approvals.filter((a) => PENDING_STATES.has(a.state)).map((a) => row([
    pill(a.state), esc(a.action.kind), approvalTarget(a), esc(a.agentName), expiresIn(a.expiresAt, now),
  ]));
  const approvalsPanel = section(`Pending agreement approvals (${apRows.length})`,
    apRows.length ? table(['State', 'Kind', 'Target', 'Agent', 'Expires'], apRows)
      : empty(pending.count > 0 ? 'A browser confirm is open — check the gateway terminal for the link.' : 'No agreements awaiting approval.'));

  // Negotiations (the autonomous buyer LLM loop).
  const negRows = negotiations.map((n) => row([
    pill(n.state), String(n.round), esc(short(n.sellerAddress, 14)),
    n.outcome ? esc(n.outcome.kind) : '—', trunc(goalText(n), 36), when(n.createdAt),
  ]));
  const negPanel = negotiations.length
    ? section(`Negotiations (${negotiations.length})`, table(['State', 'Round', 'Seller', 'Outcome', 'Goal', 'Started'], negRows))
    : '';

  // Agreements (durable) — now with terms + trust tier.
  const agRows = agreements.map((a) => row([
    pill(a.status), a.role, esc(short(a.counterpartyAddress, 14)), trunc(a.decision, 40),
    trunc(a.terms, 32), esc(String(a.trustTier)), `${ftc(a.amountMicroFtc)} FTC`,
    a.linkedTxHash ? short(a.linkedTxHash, 10) : '—', when(a.createdAt),
  ]));
  const agreementsPanel = section(`Agreements (${agreements.length})`,
    agreements.length ? table(['Status', 'Role', 'Counterparty', 'Decision', 'Terms', 'Tier', 'Amount', 'Settle tx', 'Created'], agRows)
      : empty('No agreements yet.'));

  const taskRows = tasks.map((t) => row([pill(t.status), trunc(t.title, 56), String(t.messageCount), t.lastText ? trunc(t.lastText, 44) : '—', when(t.updatedAt)]));
  const tasksPanel = section(`Tasks (${tasks.length})`,
    tasks.length ? table(['Status', 'Title', 'Msgs', 'Last', 'Updated'], taskRows) : empty('No tasks yet.'));

  const fRows = fulfilments.map((f) => row([
    pill(f.status), short(f.agreementId, 10), f.carrier ? esc(f.carrier) : '—', f.tracking ? esc(f.tracking) : '—',
    f.shipperSig ? 'signed' : '—', f.confirmerSig ? 'signed' : '—', f.shippedAt ? when(f.shippedAt) : '—',
  ]));
  const fulfilmentPanel = fulfilments.length ? section(`Fulfilment (${fulfilments.length})`, table(['Status', 'Agreement', 'Carrier', 'Tracking', 'Shipped-sig', 'Delivered-sig', 'Shipped'], fRows)) : '';

  const eRows = escrows.map((e) => row([
    pill(e.status), short(e.agreementId, 10), `${ftc(e.amountMicroFtc)} FTC`, esc(short(e.escrowAddress, 12)),
    esc(short(e.releaseTo, 10)), esc(short(e.refundTo, 10)), e.disputeReason ? trunc(e.disputeReason, 24) : '—', e.fundTxHash ? short(e.fundTxHash, 8) : '—',
  ]));
  const escrowPanel = escrows.length ? section(`Escrow (${escrows.length})`, table(['Status', 'Agreement', 'Amount', 'Escrow', 'Release-to', 'Refund-to', 'Dispute', 'Fund tx'], eRows)) : '';

  return shell('ANTON Collaboration — dashboard', `
    <h1>ANTON Collaboration <span class="tag">read-only</span></h1>
    ${settings}${approvalsPanel}${negPanel}${agreementsPanel}${tasksPanel}${fulfilmentPanel}${escrowPanel}
    <p class="foot">Read-only. Approvals happen in the one-time confirm link (terminal/browser); this page never signs or sends anything.</p>`);
}

function approvalTarget(a: AgreementApproval): string {
  const act = a.action;
  if (act.kind === 'propose') return `${esc(short(act.input.counterpartyAddress, 14))} · ${trunc(act.input.decision, 28)}`;
  return `#${esc(short(act.agreementId, 10))}`;
}
function goalText(n: NegotiationJob): string {
  try { return JSON.stringify(n.goal); } catch { return ''; }
}

// ── HTML helpers (JS-free, CSP-locked) ───────────────────────────────────────

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
  section { background: #fff; border: 1px solid #dfe6ee; border-radius: 12px; padding: 16px 18px; margin: 0 0 16px; max-width: 1040px; }
  h2 { font-size: 14px; text-transform: uppercase; letter-spacing: .03em; color: #5b6b7d; margin: 0 0 10px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .scroll { overflow-x: auto; }
  th { text-align: left; color: #5b6b7d; font-weight: 600; padding: 6px 10px; border-bottom: 2px solid #eef2f6; white-space: nowrap; }
  td { padding: 7px 10px; border-bottom: 1px solid #f0f3f6; vertical-align: top; word-break: break-word; }
  table.kv td.k { color: #5b6b7d; width: 240px; } table.kv td.v { font-family: ui-monospace, Menlo, Consolas, monospace; }
  .pill { display: inline-block; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .02em; background: #e9eef3; color: #44566a; border-radius: 999px; padding: 2px 8px; }
  .empty { color: #8a98a6; margin: 0; } .foot { color: #8a98a6; font-size: 12px; max-width: 1040px; }
`;
function shell(title: string, inner: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${CSS}</style></head><body>${inner}</body></html>`;
}
function simple(h: string, m: string): string { return shell(h, `<div><h1>${esc(h)}</h1><p>${esc(m)}</p></div>`); }
