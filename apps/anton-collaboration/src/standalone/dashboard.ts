/**
 * dashboard.ts — a LOCAL operator dashboard for the collaboration standalone,
 * served at GET / on the same loopback port as /rpc. Shows the agent's identity
 * + config, pending agreement approvals, negotiations, and agreement / task /
 * fulfilment / escrow history.
 *
 * Read-only by default (no form, JS-free, CSP-locked, loopback-Host-walled; no
 * secret ever in the HTML). When the OPTIONAL action layer is enabled
 * (ANTON_COLLAB_DASHBOARD_ACTIONS=on → an `actions` DashboardActions is passed)
 * and the operator has unlocked it via the stderr-printed key, pending
 * agreement-approval rows gain Approve / Reject / Cancel, and running
 * negotiations gain Cancel. Approvals route through the driver's operatorApprove
 * BY proposalId — the dashboard never sees confirmSecret, and the action routes
 * reject bearers, so the AI agent can never self-approve.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Agreement } from '../main/agreement-core.js';
import type { TaskSummary } from '../main/task-store.js';
import type { FulfilmentRecord } from '../main/fulfilment-core.js';
import type { EscrowRecord } from '../main/escrow-core.js';
import type { AgreementApproval } from '../main/agreement-proposals.js';
import type { NegotiationJob } from '../main/negotiation-store.js';
import type { DashboardActions } from './dashboard-actions.js';
// The GUI's look lives in ONE module shared with web-confirm.ts and
// dashboard-actions.ts — see standalone-theme.ts for why it must stay inline.
import { esc, pill, shell } from './standalone-theme.js';

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
  /** OPTIONAL operator-gated action layer (approve/reject/cancel). Off when absent. */
  actions?: DashboardActions;
}

interface Auth { mode: 'off' | 'locked' | 'unlocked'; dnonce?: string }
const NEG_ACTIVE = new Set(['pending', 'running']);
const PENDING_STATES = new Set(['pending', 'approved']);

export function registerCollabDashboard(app: FastifyInstance, opts: CollabDashboardOptions): void {
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
    const [agreements, tasks, fulfilments, escrows] = await Promise.all([
      opts.agreements().catch(() => [] as Agreement[]),
      opts.tasks().catch(() => [] as TaskSummary[]),
      opts.fulfilments().catch(() => [] as FulfilmentRecord[]),
      opts.escrows().catch(() => [] as EscrowRecord[]),
    ]);
    const approvals = opts.agreementApprovals ? safe(opts.agreementApprovals, [] as AgreementApproval[]) : [];
    const negotiations = opts.negotiations ? safe(opts.negotiations, [] as NegotiationJob[]) : [];
    const pending = opts.pendingConfirms ? safe(opts.pendingConfirms, { count: 0, soonestExpiryMs: null }) : { count: 0, soonestExpiryMs: null };
    const auth: Auth = !opts.actions ? { mode: 'off' }
      : opts.actions.isAuthed(req) ? { mode: 'unlocked', dnonce: opts.actions.mintNonce() }
      : { mode: 'locked' };
    return send(reply, 200, page(opts.settings, approvals, negotiations, pending, agreements, tasks, fulfilments, escrows, auth));
  };

  app.get('/', async (req, reply) => hostOk(req) ? render(req, reply) : send(reply, 403, simple('Blocked', 'bad host')));
  app.get('/dashboard', async (req, reply) => hostOk(req) ? render(req, reply) : send(reply, 403, simple('Blocked', 'bad host')));
}

function safe<T>(fn: () => T, fallback: T): T { try { return fn(); } catch { return fallback; } }

// ── Rendering ────────────────────────────────────────────────────────────────

function page(
  s: CollabDashboardSettings,
  approvals: AgreementApproval[],
  negotiations: NegotiationJob[],
  pending: { count: number; soonestExpiryMs: number | null },
  agreements: Agreement[], tasks: TaskSummary[], fulfilments: FulfilmentRecord[], escrows: EscrowRecord[],
  auth: Auth,
): string {
  const now = Date.now();
  const acting = auth.mode === 'unlocked' && Boolean(auth.dnonce);
  const dnonce = auth.dnonce as string;
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

  const apHeaders = ['State', 'Kind', 'Target', 'Agent', 'Expires', ...(acting ? ['Actions'] : [])];
  const apRows = approvals.filter((a) => PENDING_STATES.has(a.state)).map((a) => {
    const cells = [pill(a.state), esc(a.action.kind), approvalTarget(a), esc(a.agentName), expiresIn(a.expiresAt, now)];
    if (acting) cells.push(approvalForms(a.id, dnonce));
    return row(cells);
  });
  const approvalsPanel = section(`Pending agreement approvals (${apRows.length})`,
    authBanner(auth) + (apRows.length ? table(apHeaders, apRows)
      : empty(pending.count > 0 ? 'A browser confirm is open — check the gateway terminal for the link.' : 'No agreements awaiting approval.')));

  const negHeaders = ['State', 'Round', 'Seller', 'Outcome', 'Goal', 'Started', ...(acting ? ['Actions'] : [])];
  const negRows = negotiations.map((n) => {
    const cells = [pill(n.state), String(n.round), esc(short(n.sellerAddress, 14)),
      n.outcome ? esc(n.outcome.kind) : '—', trunc(goalText(n), 36), when(n.createdAt)];
    if (acting) cells.push(NEG_ACTIVE.has(n.state) ? formBtn('/dashboard/cancel-negotiation', n.id, dnonce, 'Cancel', 'cancel') : '');
    return row(cells);
  });
  const negPanel = negotiations.length
    ? section(`Negotiations (${negotiations.length})`, table(negHeaders, negRows))
    : '';

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

  // Identity + mode now live in the shared header band, so the page body starts
  // straight at the content. Refresh is an <a>, never a button — the read-only
  // page is pinned as containing no <form/<button/<input.
  const links = auth.mode === 'unlocked'
    ? [{ href: '/', label: 'Refresh' }, { href: '/dashboard/logout', label: 'Lock' }]
    : [{ href: '/', label: 'Refresh' }];
  return shell('ANTON Collaboration — dashboard', `
    ${settings}${approvalsPanel}${negPanel}${agreementsPanel}${tasksPanel}${fulfilmentPanel}${escrowPanel}
    <p class="foot">${auth.mode === 'unlocked'
      ? 'Operator console unlocked — Approve signs the agreement (gated by your key + a single-use form token). The AI agent cannot reach these actions. Money still settles separately in Agent Pay.'
      : 'Read-only. Approvals happen in the one-time confirm link (terminal/browser); this page never signs or sends anything.'}</p>`,
    { subtitle: 'dashboard', chip: auth.mode === 'unlocked' ? 'operator' : 'read-only', links, css: DASHBOARD_CSS });
}

function authBanner(auth: Auth): string {
  if (auth.mode === 'locked') return `<p class="banner banner-gold">🔒 Action console locked. To approve/reject from here, open the unlock link printed in the gateway terminal.</p>`;
  return '';
}
function approvalForms(id: string, dnonce: string): string {
  return `<div class="acts">`
    + `<form method="post" action="/dashboard/approve">${hid(id, dnonce)}<button class="approve">Approve</button></form>`
    + `<form method="post" action="/dashboard/reject">${hid(id, dnonce)}<button class="reject">Reject</button></form>`
    + `<form method="post" action="/dashboard/cancel-agreement-proposal">${hid(id, dnonce)}<button class="cancel">Cancel</button></form>`
    + `</div>`;
}
function formBtn(action: string, id: string, dnonce: string, label: string, cls: string): string {
  return `<div class="acts"><form method="post" action="${action}">${hid(id, dnonce)}<button class="${cls}">${esc(label)}</button></form></div>`;
}
function hid(id: string, dnonce: string): string {
  return `<input type="hidden" name="id" value="${esc(id)}"><input type="hidden" name="dnonce" value="${esc(dnonce)}">`;
}
function approvalTarget(a: AgreementApproval): string {
  const act = a.action;
  if (act.kind === 'propose') return `${esc(short(act.input.counterpartyAddress, 14))} · ${trunc(act.input.decision, 28)}`;
  return `#${esc(short(act.agreementId, 10))}`;
}
function goalText(n: NegotiationJob): string { try { return JSON.stringify(n.goal); } catch { return ''; } }

// ── HTML helpers (CSP-locked) ────────────────────────────────────────────────
// esc() / pill() / shell() come from standalone-theme.ts so the three GUI
// surfaces cannot drift into three different escapers or three pill styles.

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
function kvTable(rows: Array<[string, string]>): string {
  return `<table class="kv">${rows.map(([k, v]) => `<tr><td class="k">${esc(k)}</td><td class="v">${esc(v)}</td></tr>`).join('')}</table>`;
}
function table(headers: string[], rows: string[]): string {
  return `<div class="scroll"><table><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
}
function row(cells: string[]): string { return `<tr>${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`; }
function section(title: string, inner: string): string { return `<section><h2>${esc(title)}</h2>${inner}</section>`; }
function empty(msg2: string): string { return `<p class="empty">${esc(msg2)}</p>`; }

/** Dashboard-only rules. Tokens, the header band, sections, pills and banners
 *  all come from standalone-theme.ts — only the data-table treatment and the
 *  operator action buttons are specific to this page. */
// Exported so the readability-floor test can scan every rule this app ships,
// not just the shared base.
export const DASHBOARD_CSS = `
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  .scroll { overflow-x: auto; }
  th { text-align: left; color: var(--anton-text-muted); font-weight: 600; padding: 6px 10px;
       border-bottom: 1px solid var(--anton-border-strong); white-space: nowrap; }
  td { padding: 8px 10px; border-bottom: 1px solid var(--anton-border-soft); vertical-align: top; word-break: break-word; }
  tbody tr:last-child td { border-bottom: none; }
  tbody tr:hover { background: var(--anton-surface-alt); }
  table.kv td.k { color: var(--anton-text-muted); width: 240px; }
  table.kv td.v { font-family: var(--anton-mono); color: var(--anton-text); }
  .empty { color: var(--anton-text-faint); margin: 0; }
  .foot { color: var(--anton-text-faint); font-size: 14px; max-width: 1040px; margin: 0; }
  .acts { display: flex; gap: 6px; align-items: center; } .acts form { margin: 0; display: inline; }
  .acts button { font: inherit; font-size: 14px; font-weight: 600; border-radius: var(--anton-r1);
                 border: 1px solid transparent; padding: 5px 11px; cursor: pointer; }
  .acts .approve { background: var(--anton-accent); color: var(--anton-accent-fg); }
  .acts .approve:hover { background: var(--anton-accent-hover); }
  .acts .reject { background: var(--anton-surface); color: var(--anton-red); border-color: var(--anton-red-dim); }
  .acts .reject:hover { background: var(--anton-red-soft); }
  .acts .cancel { background: var(--anton-surface); color: var(--anton-text-muted); border-color: var(--anton-border-soft); }
  .acts .cancel:hover { background: var(--anton-surface-muted); }
`;

/** Loopback-wall denial page (bad Host). Same shell as everything else so a
 *  refused request still looks like ANTON rather than a bare error. */
function simple(h: string, m: string): string {
  // css is required: `.empty` is defined in DASHBOARD_CSS, not in the shared base, so
  // omitting it rendered this page's only line of text unstyled.
  return shell(h, `<section><h2>${esc(h)}</h2><p class="empty">${esc(m)}</p></section>`,
    { chip: 'blocked', css: DASHBOARD_CSS });
}
