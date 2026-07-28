/**
 * standalone-theme.test.ts — the operator GUI's LOOK, pinned.
 *
 * Three surfaces render HTML in this app (read-only dashboard, agreement
 * confirm card, action-layer message page). Before standalone-theme.ts they
 * each carried their own private CSS and had drifted into three different
 * looks, and every status — pending, settled, declined — rendered as the same
 * grey pill. This suite pins the fixes AND, more importantly, pins the
 * constraints that make the fixes safe:
 *
 *   • the CSP is identical and complete on all three surfaces (it is what makes
 *     inline-only styling mandatory in the first place, and the message page
 *     used to be missing frame-ancestors);
 *   • nothing in the styling fetches anything (no <link>, webfont, <img> or
 *     <script> — all of them are blocked by that CSP, so a "harmless" one would
 *     ship a silently broken page);
 *   • the read-only dashboard still contains no <form/<button/<input, including
 *     the newly-added nav control, which must therefore be an <a>.
 */
import { afterEach, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerCollabDashboard, type CollabDashboardOptions } from '../../src/standalone/dashboard.js';
import { DashboardActions } from '../../src/standalone/dashboard-actions.js';
import { CollabWebConfirmModalDriver } from '../../src/standalone/web-confirm.js';
import { pillTone, pill, shell } from '../../src/standalone/standalone-theme.js';
import { DASHBOARD_CSS } from '../../src/standalone/dashboard.js';
import type { AgreementApproval } from '../../src/main/agreement-proposals.js';
import type { NegotiationJob } from '../../src/main/negotiation-store.js';
import type { Agreement } from '../../src/main/agreement-core.js';
import type { TaskSummary } from '../../src/main/task-store.js';
import type { CollabModalPayload } from '../../src/main/modal.js';

const PORT = 49260;
const HOST_OK = `127.0.0.1:${PORT}`;

/** The five directives every standalone HTML response must carry. */
const CSP_DIRECTIVES = [
  "default-src 'none'",
  "style-src 'unsafe-inline'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
];

const apps: FastifyInstance[] = [];
afterEach(async () => { for (const a of apps.splice(0)) await a.close(); });

/** Markup only. Every tone class also appears as a CSS rule inside <style>, so a
 *  naive `not.toContain('banner-green')` over the whole document is always false. */
function markupOf(html: string): string { return html.slice(html.indexOf('</style>')); }

// ── Fixtures ──────────────────────────────────────────────────────────────────

function agreement(status: string, id: string): Agreement {
  return {
    id, schemaV: 1, role: 'proposer', trustTier: 'signed_descriptor',
    counterpartyAddress: 'kicks.sthlm.portal', decision: 'Buy 1x shoes',
    terms: 'deliver 5d', amountMicroFtc: '13990000', status, seq: 1,
    proposalHash: 'ph', proposerPubkey: 'pk', proposerSig: 'sig',
    createdAt: 1, nonce: 'n',
  } as unknown as Agreement;
}

const approvals = [
  { id: 'ap1', action: { kind: 'propose', input: { decision: 'Buy 1x shoes', terms: 'deliver 5d', amountMicroFtc: '13990000', counterpartyAddress: 'kicks.sthlm.portal' } }, agentName: 'claude', createdAt: 1, expiresAt: 9e12, state: 'pending' },
  { id: 'ap2', action: { kind: 'accept', agreementId: 'ag_77' }, agentName: 'claude', createdAt: 1, expiresAt: 9e12, state: 'approved' },
] as unknown as AgreementApproval[];

const negotiations = [
  { id: 'n1', agentName: 'claude', goal: { objective: 'shoes' }, sellerAddress: 'kicks.sthlm.portal', state: 'running', createdAt: 1, expiresAt: 9e12, round: 2, transcript: [] },
  { id: 'n2', agentName: 'claude', goal: { objective: 'bike' }, sellerAddress: 'velo.gbg.portal', state: 'cancelled', createdAt: 1, expiresAt: 0, round: 1, transcript: [] },
] as unknown as NegotiationJob[];

const tasks = [
  { id: 't1', title: 'Find shoes', status: 'open', createdAt: 1, updatedAt: 1, messageCount: 1, lastRole: 'human', lastText: 'size 43' },
  { id: 't2', title: 'Book a table', status: 'working', createdAt: 1, updatedAt: 1, messageCount: 3, lastRole: 'agent', lastText: 'looking' },
] as unknown as TaskSummary[];

async function dashboard(over: Partial<CollabDashboardOptions> = {}): Promise<FastifyInstance> {
  const app = Fastify();
  registerCollabDashboard(app, {
    port: PORT,
    settings: { signingPubkey: 'abcd'.repeat(8), contactHash: 'ANTON-AAAA-BBBB', relayBase: 'r', registryBase: 'reg', approvalMode: 'web', reviewModel: 'mistral-large-latest', reviewStrict: true, phoneChannel: false, walletView: false, storeDir: '/tmp/store' },
    agreements: async () => [agreement('settled', 'ag_1'), agreement('declined', 'ag_2'), agreement('expired', 'ag_3')],
    tasks: async () => tasks,
    fulfilments: async () => [],
    escrows: async () => [],
    agreementApprovals: () => approvals,
    negotiations: () => negotiations,
    pendingConfirms: () => ({ count: 1, soonestExpiryMs: 30_000 }),
    ...over,
  });
  await app.ready(); apps.push(app); return app;
}

function payload(over: Partial<CollabModalPayload> = {}): CollabModalPayload {
  return {
    proposalId: 'p_test', kind: 'agreement_propose', agentName: 'claude-desktop',
    agentPairedAgo: 'just now', counterparty: 'kicks.sthlm.portal',
    decision: 'Buy 1x running shoes', terms: 'Deliver within 5 days',
    amountFtc: 13.99, amountMicroFtc: '13990000', expiresAtMs: 600_000,
    ...over,
  };
}

/** Renders the browser confirm page (the GET, which never consumes the record). */
async function confirmPage(over: Partial<CollabModalPayload> = {}): Promise<{ status: number; body: string; csp: string }> {
  const logs: string[] = [];
  const driver = new CollabWebConfirmModalDriver({ port: PORT, now: () => 1_000, log: (l) => logs.push(l), autoOpen: false });
  const app = Fastify();
  driver.registerRoutes(app);
  await app.ready(); apps.push(app);
  void driver.promptForDecision(payload(over));
  const secret = logs.find((l) => l.includes('/agreement-confirm/'))!.trim().split('/agreement-confirm/')[1];
  const r = await app.inject({ method: 'GET', url: `/agreement-confirm/${secret}`, headers: { host: HOST_OK } });
  return { status: r.statusCode, body: r.body, csp: String(r.headers['content-security-policy']) };
}

/** Renders the action layer's message page (a denial — the common case). */
async function messagePage(): Promise<{ status: number; body: string; headers: Record<string, unknown> }> {
  const app = Fastify();
  new DashboardActions({ port: PORT, dashboardKey: 'k'.repeat(40), log: () => {}, handlers: {} }).registerRoutes(app);
  await app.ready(); apps.push(app);
  const r = await app.inject({ method: 'GET', url: '/dashboard/unlock?key=WRONG', headers: { host: HOST_OK } });
  return { status: r.statusCode, body: r.body, headers: r.headers as Record<string, unknown> };
}

// ── The shared shell ──────────────────────────────────────────────────────────

describe('standalone GUI — one ANTON shell across all three surfaces', () => {
  it('dashboard, confirm card and message page all render the shared header band + tokens', async () => {
    const dash = (await (await dashboard()).inject({ method: 'GET', url: '/', headers: { host: HOST_OK } })).body;
    const confirm = (await confirmPage()).body;
    const message = (await messagePage()).body;

    for (const [name, html] of [['dashboard', dash], ['confirm', confirm], ['message', message]] as const) {
      // The header band is emitted ONLY by standalone-theme.shell() — its
      // presence is what proves the surface goes through the shared shell.
      expect(html, `${name}: header band`).toContain('<header class="topbar">');
      expect(html, `${name}: ANTON mark`).toContain('aria-label="ANTON"');
      expect(html, `${name}: product name`).toContain('ANTON Collaboration');
      // The token block — the copied ANTON Local palette.
      expect(html, `${name}: brand teal token`).toContain('--anton-accent: #0D7D6C');
      expect(html, `${name}: linen page bg token`).toContain('--anton-bg: #F5F3EF');
      expect(html, `${name}: dark scheme block`).toContain('@media (prefers-color-scheme: dark)');
    }
  });

  it('the dark block actually re-points the surface tokens (not just an empty media query)', () => {
    const html = shell('t', '<p>x</p>');
    const dark = html.slice(html.indexOf('@media (prefers-color-scheme: dark)'));
    for (const token of ['--anton-bg: #121316', '--anton-surface: #1A1B1F', '--anton-text: #F5F5F4', '--anton-accent: #2DD4A8']) {
      expect(dark).toContain(token);
    }
  });

  it('operator mode swaps the chip and adds a Lock anchor; the action buttons still render', async () => {
    const key = 'unit-test-dashboard-key-AAAAAAAAAAAAAAAAAAAAAA';
    const actions = new DashboardActions({ port: PORT, dashboardKey: key, log: () => {}, handlers: { approve: () => true } });
    const app = await dashboard({ actions });
    const unlocked = await app.inject({ method: 'GET', url: `/dashboard/unlock?key=${key}`, headers: { host: HOST_OK } });
    const cookie = String(unlocked.headers['set-cookie']).split(';')[0];
    const html = (await app.inject({ method: 'GET', url: '/', headers: { host: HOST_OK, cookie } })).body;
    expect(html).toContain('<span class="chip">operator</span>');
    expect(html).toContain('<a href="/dashboard/logout">Lock</a>');
    // The action layer is unaffected by the restyle — these ARE buttons, and
    // they are legal here precisely because this is no longer the read-only render.
    expect(html).toContain('<button class="approve">Approve</button>');
    expect(html).toContain('<button class="reject">Reject</button>');
  });

  it('the copied token values still match ANTON Local src/index.css (drift guard)', async () => {
    // Self-disabling: if the collaboration app is ever extracted from the
    // monorepo this simply stops running rather than failing forever.
    const cssPath = new URL('../../../../src/index.css', import.meta.url);
    const { readFileSync, existsSync } = await import('node:fs');
    if (!existsSync(cssPath)) return;
    const antonLocal = readFileSync(cssPath, 'utf8');

    // The upstream check is scoped to the html.light BLOCK and asserts the value is
    // bound to its SPECIFIC token. An earlier version searched the whole file for the
    // bare hex, which cannot detect drift: if upstream retunes --color-bg, the old hex
    // very likely still appears somewhere (another theme, an accent palette, a comment),
    // so the guard passes while the two have in fact diverged — the exact thing it
    // exists to catch. Verified by editing the upstream value and watching the old
    // assertion stay green.
    const lightBlock = /html\.light\s*\{([\s\S]*?)^\}/m.exec(antonLocal)?.[1];
    expect(lightBlock, 'html.light block found in src/index.css').toBeTruthy();

    const shellCss = shell('t', '');
    // local token -> [upstream token, shared value]
    for (const [token, upstream, value] of [
      ['--anton-bg',          '--color-bg',          '#F5F3EF'],
      ['--anton-surface',     '--color-surface',     '#FFFFFF'],
      ['--anton-text',        '--color-text',        '#1A1B2E'],
      ['--anton-border-soft', '--color-border-soft', '#EAE7E0'],
      ['--anton-gold',        '--color-gold',        '#C8842B'],
      ['--anton-red',         '--color-red',         '#C7361F'],
      ['--anton-green',       '--color-green',       '#1F8A5C'],
      ['--anton-blue',        '--color-blue',        '#3070C7'],
    ] as const) {
      expect(shellCss, `${token} present locally`).toContain(`${token}: ${value}`);
      expect(lightBlock!, `${upstream} still ${value} upstream`)
        .toMatch(new RegExp(`${upstream}:\\s*${value}\\b`, 'i'));
    }
  });

  it('section headings are normal-case semibold, not uppercase micro-caps', async () => {
    const html = (await (await dashboard()).inject({ method: 'GET', url: '/', headers: { host: HOST_OK } })).body;
    const h2Rule = /h2 \{[^}]*\}/.exec(html)?.[0] ?? '';
    expect(h2Rule).not.toBe('');
    expect(h2Rule).toContain('font-weight: 600');
    expect(h2Rule).not.toContain('text-transform: uppercase');
    // …and the titles themselves are still rendered verbatim (no CSS-only casing).
    expect(html).toContain('<h2>Pending agreement approvals (2)</h2>');
  });
});

// ── Status pills ──────────────────────────────────────────────────────────────

describe('standalone GUI — status pills are colour-coded per state', () => {
  it('pillTone maps every state vocabulary the dashboard renders', () => {
    // ApprovalState / NegotiationState
    expect(pillTone('pending')).toBe('gold');
    expect(pillTone('running')).toBe('blue');
    expect(pillTone('approved')).toBe('blue');
    expect(pillTone('done')).toBe('green');
    expect(pillTone('rejected')).toBe('red');
    expect(pillTone('cancelled')).toBe('red');
    // AgreementStatus
    expect(pillTone('proposed')).toBe('gold');
    expect(pillTone('countered')).toBe('gold');
    expect(pillTone('agreed')).toBe('green');
    expect(pillTone('settled')).toBe('green');
    expect(pillTone('declined')).toBe('red');
    expect(pillTone('withdrawn')).toBe('muted');
    expect(pillTone('expired')).toBe('muted');
    // TaskStatus / FulfilmentStatus / EscrowStatus
    expect(pillTone('open')).toBe('gold');
    expect(pillTone('working')).toBe('blue');
    expect(pillTone('awaiting')).toBe('gold');
    expect(pillTone('shipped')).toBe('blue');
    expect(pillTone('delivered')).toBe('green');
    expect(pillTone('requested')).toBe('gold');
    expect(pillTone('funded')).toBe('blue');
    expect(pillTone('released')).toBe('green');
    expect(pillTone('refunded')).toBe('green');
    expect(pillTone('disputed')).toBe('red');
    // Unknown degrades quietly rather than mis-signalling.
    expect(pillTone('frobnicated')).toBe('muted');
  });

  it('pill() emits the tone class alongside the raw state label', () => {
    expect(pill('settled')).toBe('<span class="pill pill-green">settled</span>');
    expect(pill('pending')).toBe('<span class="pill pill-gold">pending</span>');
    // The label is still escaped — pills render untrusted-ish state strings.
    expect(pill('<b>x</b>')).toContain('&lt;b&gt;');
  });

  it('a rendered dashboard shows FOUR different tones, not one grey pill for everything', async () => {
    const html = (await (await dashboard()).inject({ method: 'GET', url: '/', headers: { host: HOST_OK } })).body;
    const classes = (html.match(/class="pill pill-([a-z]+)"/g) ?? []).map((m) => /pill-([a-z]+)/.exec(m)![1]);
    expect(classes.length).toBeGreaterThan(5);
    expect(new Set(classes).size).toBeGreaterThanOrEqual(4);
    // Specific rows, so the assertion cannot be satisfied by tone soup.
    expect(html).toContain('<span class="pill pill-gold">pending</span>');
    expect(html).toContain('<span class="pill pill-blue">running</span>');
    expect(html).toContain('<span class="pill pill-green">settled</span>');
    expect(html).toContain('<span class="pill pill-red">declined</span>');
    // Two states that used to look identical must now differ.
    expect(html).toContain('<span class="pill pill-muted">expired</span>');
    // …and each tone has an actual rule behind it.
    for (const tone of ['gold', 'blue', 'green', 'red', 'muted']) {
      expect(html).toContain(`.pill-${tone}`);
    }
  });
});

// ── The confirm card (highest-stakes screen) ─────────────────────────────────

describe('standalone GUI — agreement confirm card', () => {
  it('leads with the amount and separates Approve from Reject', async () => {
    const { body } = await confirmPage();
    expect(body).toContain('<div class="amt">13.99 FTC</div>');   // hero
    expect(body).toContain('13990000 µFTC');                       // base units, demoted
    expect(body).toContain('<div class="card">');                  // ANTON card treatment
    // The two decisions are not two equal side-by-side buttons any more.
    const decide = body.slice(body.indexOf('<div class="decide">'));
    expect(decide).toContain('<div class="sep">');
    expect(decide.indexOf('class="approve"')).toBeLessThan(decide.indexOf('class="sep"'));
    expect(decide.indexOf('class="sep"')).toBeLessThan(decide.indexOf('class="reject"'));
  });

  it('the review banner is coloured by outcome — a raise and a clear no longer look alike', async () => {
    const raised = markupOf((await confirmPage({ review: { raise: true, severity: 'high', concerns: ['Refund clause is vague'], reviewModel: 'mistral-large-latest' } })).body);
    expect(raised).toContain('banner-red');
    expect(raised).toContain('Independent review raised a concern');
    expect(raised).toContain('Refund clause is vague');
    expect(raised).not.toContain('banner-green');

    const cleared = markupOf((await confirmPage({ review: { raise: false, severity: 'low', concerns: [], reviewModel: 'mistral-large-latest' } })).body);
    expect(cleared).toContain('banner-green');
    expect(cleared).not.toContain('banner-red');

    // An unverified agent note is toned as caution, distinct from both.
    const noted = markupOf((await confirmPage({ agentNote: 'Best price across 3 sellers' })).body);
    expect(noted).toContain('banner-gold');
    expect(noted).toContain('not verified');
  });
});

// ── Security posture (the reason the styling must stay inline) ────────────────

describe('standalone GUI — CSP + read-only posture survive the restyle', () => {
  it('all three surfaces carry all five CSP directives', async () => {
    const dash = await (await dashboard()).inject({ method: 'GET', url: '/', headers: { host: HOST_OK } });
    const confirm = await confirmPage();
    const message = await messagePage();
    const csps: Array<[string, string]> = [
      ['dashboard', String(dash.headers['content-security-policy'])],
      ['confirm', confirm.csp],
      ['message', String(message.headers['content-security-policy'])],
    ];
    for (const [name, csp] of csps) {
      for (const directive of CSP_DIRECTIVES) expect(csp, `${name} CSP`).toContain(directive);
      // style-src must stay inline-ONLY: no host, no 'self'. Widening it is the
      // easy way to "fix" styling and would defeat the whole posture.
      const styleSrc = /style-src ([^;]*)/.exec(csp)?.[1] ?? '';
      expect(styleSrc.trim(), `${name} style-src`).toBe("'unsafe-inline'");
    }
  });

  it('the message page can no longer be framed (it was the one surface that could)', async () => {
    const message = await messagePage();
    expect(String(message.headers['content-security-policy'])).toContain("frame-ancestors 'none'");
    expect(String(message.headers['x-frame-options'])).toBe('DENY');
  });

  it('no surface fetches a subresource — the CSP would block it and the page would ship broken', async () => {
    const dash = (await (await dashboard()).inject({ method: 'GET', url: '/', headers: { host: HOST_OK } })).body;
    const bodies: Array<[string, string]> = [
      ['dashboard', dash], ['confirm', (await confirmPage()).body], ['message', (await messagePage()).body],
    ];
    for (const [name, html] of bodies) {
      for (const forbidden of ['<link', '<script', '<img', '@font-face', 'url(']) {
        expect(html.toLowerCase(), `${name}: ${forbidden}`).not.toContain(forbidden);
      }
      // Positive control for the assertions above: the pages DO carry imagery —
      // it is inline <svg> markup, which is legal because it is not a fetch.
      expect(html, `${name}: inline svg mark`).toContain('<svg class="mark"');
    }
  });

  it('the read-only dashboard has a nav control AND still contains no form/button/input', async () => {
    const html = (await (await dashboard()).inject({ method: 'GET', url: '/', headers: { host: HOST_OK } })).body;
    expect(html).toContain('<a href="/">Refresh</a>');  // the control exists…
    expect(html).not.toMatch(/<form|<button|<input/i);  // …and it is an anchor
  });

  it('the restyle leaks no secret-shaped token into any surface', async () => {
    const dash = (await (await dashboard()).inject({ method: 'GET', url: '/', headers: { host: HOST_OK } })).body;
    const message = (await messagePage()).body;
    for (const bad of ['confirmSecret', 'Bearer ', 'sk_', 'privHex', 'privateKey', 'kkkkkkkk']) {
      expect(dash, `dashboard: ${bad}`).not.toContain(bad);
      expect(message, `message: ${bad}`).not.toContain(bad);
    }
  });
});

/**
 * ── Found by adversarial review of the first version of this port ──
 */
describe('readability floor and pill safety', () => {
  it('carries no content text below 14px', async () => {
    // CLAUDE.md's design system sets "14px+ minimum font" for ANTON's 35-65 audience.
    // The first port left the agreement-approval card — the highest-stakes screen in the
    // product — at 12-13px, and status pills at 11px. Two supplementary labels stay at
    // 12px on purpose; both duplicate adjacent full-size text and are listed here so the
    // exception is deliberate rather than drift.
    const ALLOWED_SMALL = ['.chip', '.decide .sep'];
    const css = shell('t', '') + DASHBOARD_CSS;
    const offenders: string[] = [];
    for (const m of css.matchAll(/([^{}]+)\{([^}]*font-size:\s*(\d+)px[^}]*)\}/g)) {
      const size = Number(m[3]);
      const selector = m[1].trim().split('\n').pop()!.trim();
      if (size < 14 && !ALLOWED_SMALL.some(a => selector.includes(a))) {
        offenders.push(`${selector} -> ${size}px`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('pillTone cannot be tricked into emitting a prototype member', () => {
    // A bare index lookup resolves 'constructor'/'toString' through the prototype to a
    // FUNCTION, which is truthy — so `?? 'muted'` never fires and that value lands in a
    // class attribute.
    for (const hostile of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      expect(pillTone(hostile)).toBe('muted');
    }
  });

  it('still maps real states to distinct tones', () => {
    expect(pillTone('pending')).not.toBe(pillTone('rejected'));
    expect(pillTone('agreed')).not.toBe(pillTone('pending'));
  });
});
