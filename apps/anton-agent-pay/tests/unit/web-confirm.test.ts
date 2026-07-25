/**
 * web-confirm.test.ts — the standalone gateway's BROWSER approval boundary.
 *
 * Exercises the two-secret model (confirmSecret in the URL + pageNonce from the
 * served page), the layered browser wall (Host / Origin / Sec-Fetch / no-bearer),
 * single-use + TTL, fail-closed decoding, passphrase non-leakage, concurrency,
 * and the full /rpc propose → approve → sent path. No real listener / browser.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer, type ServerDeps } from '../../src/main/server.js';
import { ProposalStore } from '../../src/main/proposals.js';
import { PairingStore } from '../../src/main/pairing.js';
import { WebConfirmModalDriver } from '../../src/standalone/web-confirm.js';
import type { ModalPayload, ModalDecision } from '../../src/shared/ipc-types.js';

const PORT = 49250;
const HOST_OK = `127.0.0.1:${PORT}`;
const ORIGIN_OK = `http://127.0.0.1:${PORT}`;
const TO = 'fc_VEH4mJb5P9hKEaWkiuXRG6e6jooCnQZqKs';

function payload(over: Partial<ModalPayload> = {}): ModalPayload {
  return {
    proposalId: 'p_test',
    agentName: 'claude-desktop',
    agentPairedAgo: 'just now',
    to: TO,
    amountFtc: 12.5,
    feeFtc: 0.001,
    balanceAfterFtc: 87.5,
    walletHasPassphrase: false,
    expiresAtMs: 60_000,
    ...over,
  };
}

interface Harness {
  app: FastifyInstance;
  driver: WebConfirmModalDriver;
  logs: string[];
  setNow: (n: number) => void;
  submitCalls: Array<{ to: string; amountFtc: number; passphrase?: string }>;
  pairings: PairingStore;
  proposals: ProposalStore;
  openCalls: string[];
}

function makeHarness(opts: {
  walletHasPassphrase?: boolean; autoOpen?: boolean; openThrows?: boolean;
  /** Default TRUE: most cases here exercise the operator-terminal path, where the
   *  confirm URL is printed and lastSecret() can read it back. The withholding
   *  behaviour when this is false has its own describe block below. Note the
   *  production default is isTrustedTerminal(), which is FALSE under vitest — so
   *  this must stay explicit rather than relying on the constructor default. */
  capabilityChannelTrusted?: boolean;
} = {}): Harness {
  let clock = 1_000;
  const logs: string[] = [];
  const openCalls: string[] = [];
  const trusted = opts.capabilityChannelTrusted ?? true;
  const driver = new WebConfirmModalDriver({
    port: PORT,
    now: () => clock,
    log: (line) => { logs.push(line); },
    capabilityChannelTrusted: trusted,
    // Mirror the driver's own default (off on a terminal, on when untrusted)
    // rather than hardcoding false, so the harness can't mask a regression in it.
    autoOpen: opts.autoOpen ?? !trusted,
    openImpl: (url) => { openCalls.push(url); if (opts.openThrows) throw new Error('no browser'); },
  });
  // All stores share the driver's injected clock so the e2e path's
  // proposal.expiresAt and the driver's now() stay consistent.
  const pairings = new PairingStore(() => clock);
  const proposals = new ProposalStore(() => clock);
  const submitCalls: Harness['submitCalls'] = [];
  const deps: ServerDeps = {
    pairings, proposals, modal: driver, now: () => clock,
    walletStatus: async () => ({ walletAddress: 'fc_TESTWALLET', balanceFtc: 100, lastSeenBlock: 1 }),
    submitPayment: async (req) => {
      submitCalls.push({ to: req.to, amountFtc: req.amountFtc, ...(req.passphrase !== undefined ? { passphrase: req.passphrase } : {}) });
      return { txId: 'tx-1', feeFtc: 0.001 };
    },
    recentTransactions: async () => [],
    counterpartyHint: async () => null,
    walletHasPassphrase: async () => opts.walletHasPassphrase ?? false,
  };
  const app = buildServer(deps, { bypassOriginCheck: true });
  driver.registerRoutes(app);
  return { app, driver, logs, setNow: (n) => { clock = n; }, submitCalls, pairings, proposals, openCalls };
}

/** Pull the confirmSecret out of the most recent printed confirm URL. */
function lastSecret(logs: string[]): string {
  for (let i = logs.length - 1; i >= 0; i--) {
    const m = logs[i]!.match(/\/confirm\/([A-Za-z0-9_-]+)/);
    if (m) return m[1]!;
  }
  throw new Error('no confirm URL logged');
}

function nonceFrom(html: string): string {
  const m = html.match(/name="pageNonce" value="([^"]+)"/);
  if (!m) throw new Error('no pageNonce in page');
  return m[1]!;
}

function getPage(app: FastifyInstance, secret: string, host = HOST_OK) {
  return app.inject({ method: 'GET', url: `/confirm/${secret}`, headers: { host } });
}

function postDecide(
  app: FastifyInstance, secret: string,
  fields: { decision?: string; pageNonce?: string; passphrase?: string },
  headers: Record<string, string> = {},
) {
  const body = Object.entries(fields)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');
  return app.inject({
    method: 'POST', url: `/confirm/${secret}`,
    headers: {
      host: HOST_OK, origin: ORIGIN_OK, 'sec-fetch-site': 'same-origin',
      'content-type': 'application/x-www-form-urlencoded', ...headers,
    },
    payload: body,
  });
}

describe('WebConfirmModalDriver — happy paths', () => {
  let h: Harness;
  beforeEach(() => { h = makeHarness(); });

  it('mints a URL, renders the page, and APPROVES on a valid POST', async () => {
    const decision = h.driver.promptForDecision(payload());
    const secret = lastSecret(h.logs);

    const page = await getPage(h.app, secret);
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain('12.5 FTC');           // amount shown
    expect(page.body).toContain(TO);                   // recipient shown
    expect(page.headers['content-security-policy']).toContain("default-src 'none'");
    expect(page.headers['x-frame-options']).toBe('DENY');

    const nonce = nonceFrom(page.body);
    const post = await postDecide(h.app, secret, { decision: 'approve', pageNonce: nonce });
    expect(post.statusCode).toBe(200);
    expect(await decision).toEqual({ kind: 'approve' });
  });

  it('REJECTS on decision=reject', async () => {
    const decision = h.driver.promptForDecision(payload());
    const secret = lastSecret(h.logs);
    const nonce = nonceFrom((await getPage(h.app, secret)).body);
    await postDecide(h.app, secret, { decision: 'reject', pageNonce: nonce });
    expect((await decision).kind).toBe('reject');
  });

  it('fails CLOSED: a garbage decision with a valid nonce resolves to reject', async () => {
    const decision = h.driver.promptForDecision(payload());
    const secret = lastSecret(h.logs);
    const nonce = nonceFrom((await getPage(h.app, secret)).body);
    await postDecide(h.app, secret, { decision: 'pay-everything', pageNonce: nonce });
    expect((await decision).kind).toBe('reject');
  });

  it('carries the passphrase through to submitPayment and never logs it', async () => {
    h = makeHarness({ walletHasPassphrase: true });
    const SECRETPASS = 'correct-horse-battery-staple-9981';
    const decision = h.driver.promptForDecision(payload({ walletHasPassphrase: true }));
    const secret = lastSecret(h.logs);
    const page = await getPage(h.app, secret);
    expect(page.body).toContain('type="password"');     // passphrase field rendered
    const nonce = nonceFrom(page.body);
    const post = await postDecide(h.app, secret, { decision: 'approve', pageNonce: nonce, passphrase: SECRETPASS });
    const d = await decision as Extract<ModalDecision, { kind: 'approve' }>;
    expect(d).toEqual({ kind: 'approve', passphrase: SECRETPASS });
    // never echoed in any response or logged anywhere
    expect(page.body).not.toContain(SECRETPASS);
    expect(post.body).not.toContain(SECRETPASS);
    expect(h.logs.join('\n')).not.toContain(SECRETPASS);
  });
});

describe('WebConfirmModalDriver — the browser wall', () => {
  let h: Harness;
  beforeEach(() => { h = makeHarness(); });

  async function freshSecretAndNonce(): Promise<{ secret: string; nonce: string; decision: Promise<ModalDecision> }> {
    const decision = h.driver.promptForDecision(payload());
    const secret = lastSecret(h.logs);
    const nonce = nonceFrom((await getPage(h.app, secret)).body);
    return { secret, nonce, decision };
  }

  it('rejects an unknown secret (GET 404, POST 410), no record touched', async () => {
    const get = await getPage(h.app, 'totally-made-up-secret');
    expect(get.statusCode).toBe(404);
    const post = await postDecide(h.app, 'totally-made-up-secret', { decision: 'approve', pageNonce: 'x' });
    expect(post.statusCode).toBe(410);
  });

  it('rejects a WRONG pageNonce without consuming the record', async () => {
    const { secret, decision } = await freshSecretAndNonce();
    const bad = await postDecide(h.app, secret, { decision: 'approve', pageNonce: 'wrong-nonce' });
    expect(bad.statusCode).toBe(403);
    // record still live — page still served, and a correct POST still works
    const nonce2 = nonceFrom((await getPage(h.app, secret)).body);
    const ok = await postDecide(h.app, secret, { decision: 'approve', pageNonce: nonce2 });
    expect(ok.statusCode).toBe(200);
    expect((await decision).kind).toBe('approve');
  });

  it('is single-use: a replayed approve POST is 410 and does not re-resolve', async () => {
    const { secret, nonce, decision } = await freshSecretAndNonce();
    const first = await postDecide(h.app, secret, { decision: 'approve', pageNonce: nonce });
    expect(first.statusCode).toBe(200);
    expect((await decision).kind).toBe('approve');
    const replay = await postDecide(h.app, secret, { decision: 'approve', pageNonce: nonce });
    expect(replay.statusCode).toBe(410);
  });

  it('blocks DNS-rebinding via the Host allowlist', async () => {
    const { secret, nonce } = await freshSecretAndNonce();
    const bad = await postDecide(h.app, secret, { decision: 'approve', pageNonce: nonce }, { host: 'evil.example.com' });
    expect(bad.statusCode).toBe(403);
  });

  it('blocks cross-origin and origin-absent POSTs (CSRF)', async () => {
    const { secret, nonce } = await freshSecretAndNonce();
    const xorigin = await postDecide(h.app, secret, { decision: 'approve', pageNonce: nonce }, { origin: 'http://evil.example.com' });
    expect(xorigin.statusCode).toBe(403);
    const noorigin = await h.app.inject({
      method: 'POST', url: `/confirm/${secret}`,
      headers: { host: HOST_OK, 'sec-fetch-site': 'same-origin', 'content-type': 'application/x-www-form-urlencoded' },
      payload: `decision=approve&pageNonce=${encodeURIComponent(nonce)}`,
    });
    expect(noorigin.statusCode).toBe(403);
  });

  it('rejects when an Authorization (bearer) header is present', async () => {
    const { secret, nonce } = await freshSecretAndNonce();
    const withBearer = await postDecide(h.app, secret, { decision: 'approve', pageNonce: nonce }, { authorization: 'Bearer sk_anything' });
    expect(withBearer.statusCode).toBe(403);
  });

  it('tolerates an absent Sec-Fetch-Site (old browsers) but blocks cross-site', async () => {
    // absent → accepted
    const a = await freshSecretAndNonce();
    const noSfs = await h.app.inject({
      method: 'POST', url: `/confirm/${a.secret}`,
      headers: { host: HOST_OK, origin: ORIGIN_OK, 'content-type': 'application/x-www-form-urlencoded' },
      payload: `decision=approve&pageNonce=${encodeURIComponent(a.nonce)}`,
    });
    expect(noSfs.statusCode).toBe(200);
    // cross-site → blocked
    const b = await freshSecretAndNonce();
    const xsite = await postDecide(h.app, b.secret, { decision: 'approve', pageNonce: b.nonce }, { 'sec-fetch-site': 'cross-site' });
    expect(xsite.statusCode).toBe(403);
  });
});

describe('WebConfirmModalDriver — TTL, concurrency, auto-open', () => {
  it('auto-rejects on TTL (lazy expiry on hit)', async () => {
    const h = makeHarness();
    h.setNow(1_000);
    const decision = h.driver.promptForDecision(payload({ expiresAtMs: 2_000 }));
    const secret = lastSecret(h.logs);
    // jump past expiry, then a GET trips lazy expiry
    h.setNow(3_000);
    const get = await getPage(h.app, secret);
    expect(get.statusCode).toBe(404);
    expect(await decision).toEqual({ kind: 'reject', reason: 'expired' });
  });

  it('rejects immediately when the proposal is already expired at prompt time', async () => {
    const h = makeHarness();
    h.setNow(5_000);
    const decision = h.driver.promptForDecision(payload({ expiresAtMs: 4_000 }));
    expect(await decision).toEqual({ kind: 'reject', reason: 'expired' });
  });

  it('handles concurrent proposals independently (distinct secrets, no blocking)', async () => {
    const h = makeHarness();
    const dA = h.driver.promptForDecision(payload({ proposalId: 'p_A', amountFtc: 1 }));
    const secretA = lastSecret(h.logs);
    const dB = h.driver.promptForDecision(payload({ proposalId: 'p_B', amountFtc: 2 }));
    const secretB = lastSecret(h.logs);
    expect(secretA).not.toBe(secretB);
    // approve B first, then reject A — order-independent
    const nonceB = nonceFrom((await getPage(h.app, secretB)).body);
    await postDecide(h.app, secretB, { decision: 'approve', pageNonce: nonceB });
    const nonceA = nonceFrom((await getPage(h.app, secretA)).body);
    await postDecide(h.app, secretA, { decision: 'reject', pageNonce: nonceA });
    expect((await dB).kind).toBe('approve');
    expect((await dA).kind).toBe('reject');
  });

  it('does not auto-open by default; opens once when enabled; swallows a failed open', async () => {
    const off = makeHarness({ autoOpen: false });
    off.driver.promptForDecision(payload());
    expect(off.openCalls).toHaveLength(0);

    const on = makeHarness({ autoOpen: true });
    on.driver.promptForDecision(payload());
    expect(on.openCalls).toHaveLength(1);
    expect(on.openCalls[0]).toContain('/confirm/');

    const throwing = makeHarness({ autoOpen: true, openThrows: true });
    expect(() => throwing.driver.promptForDecision(payload())).not.toThrow(); // non-fatal
  });

  it('operatorApprove/operatorReject drive the prompt by proposalId (dashboard bridge)', async () => {
    const { driver } = makeHarness();
    const p = driver.promptForDecision(payload({ proposalId: 'p_op' }));
    expect(driver.operatorApprove('p_op')).toBe(true);
    await expect(p).resolves.toEqual({ kind: 'approve' });
    expect(driver.operatorApprove('p_op')).toBe(false); // already settled — idempotent
    const p2 = driver.promptForDecision(payload({ proposalId: 'p_rej' }));
    expect(driver.operatorReject('p_rej')).toBe(true);
    await expect(p2).resolves.toEqual({ kind: 'reject', reason: 'rejected from dashboard' });
    expect(driver.operatorReject('unknown')).toBe(false); // unknown id
  });
});

describe('WebConfirmModalDriver — full /rpc propose → browser approve → sent', () => {
  it('drives the whole pipeline end to end', async () => {
    const h = makeHarness();
    const code = h.pairings.newCode();
    const { sessionToken } = h.pairings.redeemCode({ name: 'e2e-agent', code });

    // propose (fire-and-forget) — the web driver logs a confirm URL
    const propose = await h.app.inject({
      method: 'POST', url: '/rpc',
      headers: { authorization: `Bearer ${sessionToken}`, 'content-type': 'application/json' },
      payload: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'proposePayment', params: { to: TO, amountFtc: 3 } }),
    });
    const proposalId = JSON.parse(propose.body).result.proposalId as string;
    expect(proposalId).toMatch(/^p_/);

    // let the fire-and-forget modal flow open + log the URL
    for (let i = 0; i < 10 && h.logs.length === 0; i++) await new Promise((r) => setImmediate(r));
    const secret = lastSecret(h.logs);

    // operator approves in the browser
    const nonce = nonceFrom((await getPage(h.app, secret)).body);
    await postDecide(h.app, secret, { decision: 'approve', pageNonce: nonce });

    // poll getProposal until sent
    let state = 'pending';
    for (let i = 0; i < 200 && state === 'pending'; i++) {
      const got = await h.app.inject({
        method: 'POST', url: '/rpc',
        headers: { authorization: `Bearer ${sessionToken}`, 'content-type': 'application/json' },
        payload: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'getProposal', params: { proposalId } }),
      });
      state = JSON.parse(got.body).result.state;
      if (state === 'pending') await new Promise((r) => setImmediate(r));
    }
    expect(state).toBe('sent');
    expect(h.submitCalls).toEqual([{ to: TO, amountFtc: 3 }]);

    // the agent's getProposal response never leaks the confirm secret / nonce
    const got = await h.app.inject({
      method: 'POST', url: '/rpc',
      headers: { authorization: `Bearer ${sessionToken}`, 'content-type': 'application/json' },
      payload: JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'getProposal', params: { proposalId } }),
    });
    expect(got.body).not.toContain(secret);
    expect(got.body).not.toContain(nonce);
  });
});

describe('WebConfirmModalDriver — the capability channel', () => {
  // The confirm URL IS the approval capability. The original model said it was
  // "printed ONLY to stderr", which is safe on a terminal but not under
  // --mcp-stdio, where the MCP host captures stderr into a log file the agent's
  // own host writes. These tests pin the rule: never print a capability to a
  // stream that is not a terminal.

  it('prints the confirm URL when stderr IS the operator terminal', () => {
    const h = makeHarness({ capabilityChannelTrusted: true });
    void h.driver.promptForDecision(payload());
    expect(h.logs.join('\n')).toMatch(/\/confirm\/[A-Za-z0-9_-]+/);
  });

  it('WITHHOLDS the confirm URL when the log channel is not a terminal', () => {
    const h = makeHarness({ capabilityChannelTrusted: false });
    void h.driver.promptForDecision(payload());
    const out = h.logs.join('\n');
    expect(out).not.toMatch(/\/confirm\//);   // the capability never hits the log
    expect(out).not.toContain('127.0.0.1');
    // ...but the operator is still told a payment is waiting, and why.
    expect(out).toContain('PAYMENT APPROVAL REQUIRED');
    expect(out).toMatch(/not printed here|not a terminal/i);
  });

  it('still shows the payment FACTS when withholding — only the secret is hidden', () => {
    const h = makeHarness({ capabilityChannelTrusted: false });
    void h.driver.promptForDecision(payload({ amountFtc: 12.5, to: TO }));
    const out = h.logs.join('\n');
    expect(out).toContain('12.5');
    expect(out).toContain(TO);
  });

  it('auto-opens by DEFAULT when the channel is untrusted (the only delivery path)', () => {
    const h = makeHarness({ capabilityChannelTrusted: false, autoOpen: undefined });
    void h.driver.promptForDecision(payload());
    expect(h.openCalls).toHaveLength(1);
    expect(h.openCalls[0]).toMatch(/\/confirm\/[A-Za-z0-9_-]+/);
  });

  it('does NOT auto-open by default on a real terminal (URL is already visible)', () => {
    const h = makeHarness({ capabilityChannelTrusted: true, autoOpen: undefined });
    void h.driver.promptForDecision(payload());
    expect(h.openCalls).toHaveLength(0);
  });

  it('warns that approval is impossible when untrusted AND auto-open is off', () => {
    const h = makeHarness({ capabilityChannelTrusted: false, autoOpen: false });
    void h.driver.promptForDecision(payload());
    const out = h.logs.join('\n');
    expect(out).not.toMatch(/\/confirm\//);      // still withheld — fail closed, not open
    expect(out).toMatch(/AUTO-OPEN IS OFF|cannot approve/i);
  });

  it('the withheld secret still works — the URL is delivered, not revoked', async () => {
    const h = makeHarness({ capabilityChannelTrusted: false });
    const decision = h.driver.promptForDecision(payload());
    const url = h.openCalls[0]!;
    const secret = url.match(/\/confirm\/([A-Za-z0-9_-]+)/)![1]!;
    const page = await getPage(h.app, secret);
    expect(page.statusCode).toBe(200);
    const res = await postDecide(h.app, secret, { decision: 'approve', pageNonce: nonceFrom(page.body) });
    expect(res.statusCode).toBe(200);
    await expect(decision).resolves.toMatchObject({ kind: 'approve' });
  });

  it('sanitises agent-supplied text before it reaches the terminal', () => {
    const ESC = String.fromCharCode(0x1b);
    const h = makeHarness({ capabilityChannelTrusted: true });
    void h.driver.promptForDecision(payload({
      agentName: 'evil' + ESC + '[2A' + ESC + '[2K   Amount: 9999 FTC',
      to: 'fc_abc' + String.fromCharCode(0x202e) + 'def',
      remittanceSummary: ['note' + ESC + '[1;31m'],
    }));
    const out = h.logs.join('\n');
    expect(out).not.toContain(ESC);
    expect(out).not.toContain(String.fromCharCode(0x202e));
  });
});
