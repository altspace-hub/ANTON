/**
 * web-confirm.test.ts — the collaboration standalone's BROWSER agreement-approval
 * boundary. Exercises the two-secret model (confirmSecret in the URL + pageNonce
 * from the served page), the layered browser wall (Host / Origin / Sec-Fetch /
 * no-bearer), single-use + TTL, fail-closed decoding, the four-eyes review block,
 * the absence of any passphrase field, and the flood guard. Bare Fastify + inject;
 * no real listener / browser.
 */
import { afterEach, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { CollabWebConfirmModalDriver } from '../../src/standalone/web-confirm.js';
import type { CollabModalPayload } from '../../src/main/modal.js';

const PORT = 49260;
const HOST_OK = `127.0.0.1:${PORT}`;
const ORIGIN_OK = `http://127.0.0.1:${PORT}`;

function payload(over: Partial<CollabModalPayload> = {}): CollabModalPayload {
  return {
    proposalId: 'p_test',
    kind: 'agreement_propose',
    agentName: 'claude-desktop',
    agentPairedAgo: 'just now',
    counterparty: 'kicks.sthlm.portal',
    decision: 'Buy 1x running shoes',
    terms: 'Deliver within 5 days; refund if not as described',
    amountFtc: 13.99,
    amountMicroFtc: '13990000',
    expiresAtMs: 60_000,
    ...over,
  };
}

interface Harness {
  app: FastifyInstance;
  driver: CollabWebConfirmModalDriver;
  logs: string[];
  setNow: (n: number) => void;
}

const apps: FastifyInstance[] = [];
afterEach(async () => { for (const a of apps.splice(0)) await a.close(); });

async function makeHarness(): Promise<Harness> {
  let clock = 1_000;
  const logs: string[] = [];
  const driver = new CollabWebConfirmModalDriver({ port: PORT, now: () => clock, log: (l) => logs.push(l), autoOpen: false });
  const app = Fastify();
  driver.registerRoutes(app);
  await app.ready();
  apps.push(app);
  return { app, driver, logs, setNow: (n) => { clock = n; } };
}

function secretFromLogs(logs: string[]): string {
  const line = logs.find((l) => l.includes('/agreement-confirm/'));
  if (!line) throw new Error('no confirm URL printed');
  return line.trim().split('/agreement-confirm/')[1];
}
function nonceFromHtml(html: string): string {
  const m = /name="pageNonce" value="([^"]+)"/.exec(html);
  if (!m) throw new Error('no pageNonce in page');
  return m[1];
}
function postBody(nonce: string, decision: string): string {
  return `pageNonce=${encodeURIComponent(nonce)}&decision=${decision}`;
}
const FORM = { 'content-type': 'application/x-www-form-urlencoded' };

describe('collab web-confirm — browser agreement approval', () => {
  it('renders the agreement + four-eyes review block; approve resolves {kind:approve} (no passphrase)', async () => {
    const h = await makeHarness();
    const decisionP = h.driver.promptForDecision(payload({
      review: { raise: true, severity: 'high', concerns: ['Refund clause is vague'], reviewModel: 'mistral-large-latest' },
    }));
    const secret = secretFromLogs(h.logs);

    const get = await h.app.inject({ method: 'GET', url: `/agreement-confirm/${secret}`, headers: { host: HOST_OK } });
    expect(get.statusCode).toBe(200);
    expect(get.body).toContain('Buy 1x running shoes');
    expect(get.body).toContain('13.99 FTC');
    expect(get.body).toContain('13990000 µFTC');
    expect(get.body).toContain('kicks.sthlm.portal');
    expect(get.body).toContain('Independent review raised a concern');
    expect(get.body).toContain('Refund clause is vague');
    expect(get.body).not.toContain('passphrase'); // collab never unlocks a wallet
    expect(get.body).not.toContain('type="password"');

    const nonce = nonceFromHtml(get.body);
    const post = await h.app.inject({ method: 'POST', url: `/agreement-confirm/${secret}`, headers: { host: HOST_OK, origin: ORIGIN_OK, ...FORM }, payload: postBody(nonce, 'approve') });
    expect(post.statusCode).toBe(200);
    expect(post.body).toContain('Approved');
    await expect(decisionP).resolves.toEqual({ kind: 'approve' });
  });

  it('reject resolves {kind:reject}', async () => {
    const h = await makeHarness();
    const decisionP = h.driver.promptForDecision(payload());
    const secret = secretFromLogs(h.logs);
    const nonce = nonceFromHtml((await h.app.inject({ method: 'GET', url: `/agreement-confirm/${secret}`, headers: { host: HOST_OK } })).body);
    await h.app.inject({ method: 'POST', url: `/agreement-confirm/${secret}`, headers: { host: HOST_OK, origin: ORIGIN_OK, ...FORM }, payload: postBody(nonce, 'reject') });
    await expect(decisionP).resolves.toEqual({ kind: 'reject', reason: 'rejected in browser' });
  });

  it('the browser wall fails closed (bad host / bad origin / bearer / cross-site) without consuming the record', async () => {
    const h = await makeHarness();
    const decisionP = h.driver.promptForDecision(payload());
    const secret = secretFromLogs(h.logs);
    const nonce = nonceFromHtml((await h.app.inject({ method: 'GET', url: `/agreement-confirm/${secret}`, headers: { host: HOST_OK } })).body);
    const url = `/agreement-confirm/${secret}`;

    const badHost = await h.app.inject({ method: 'POST', url, headers: { host: 'evil.com', origin: ORIGIN_OK, ...FORM }, payload: postBody(nonce, 'approve') });
    expect(badHost.statusCode).toBe(403);
    const noOrigin = await h.app.inject({ method: 'POST', url, headers: { host: HOST_OK, ...FORM }, payload: postBody(nonce, 'approve') });
    expect(noOrigin.statusCode).toBe(403);
    const bearer = await h.app.inject({ method: 'POST', url, headers: { host: HOST_OK, origin: ORIGIN_OK, authorization: 'Bearer x', ...FORM }, payload: postBody(nonce, 'approve') });
    expect(bearer.statusCode).toBe(403);
    const crossSite = await h.app.inject({ method: 'POST', url, headers: { host: HOST_OK, origin: ORIGIN_OK, 'sec-fetch-site': 'cross-site', ...FORM }, payload: postBody(nonce, 'approve') });
    expect(crossSite.statusCode).toBe(403);

    // record untouched — a legitimate approve still works afterwards
    const ok = await h.app.inject({ method: 'POST', url, headers: { host: HOST_OK, origin: ORIGIN_OK, ...FORM }, payload: postBody(nonce, 'approve') });
    expect(ok.statusCode).toBe(200);
    await expect(decisionP).resolves.toEqual({ kind: 'approve' });
  });

  it('a wrong/missing pageNonce is rejected (403) and does not consume the record', async () => {
    const h = await makeHarness();
    const decisionP = h.driver.promptForDecision(payload());
    const secret = secretFromLogs(h.logs);
    const url = `/agreement-confirm/${secret}`;
    const bad = await h.app.inject({ method: 'POST', url, headers: { host: HOST_OK, origin: ORIGIN_OK, ...FORM }, payload: postBody('wrong-nonce', 'approve') });
    expect(bad.statusCode).toBe(403);
    const nonce = nonceFromHtml((await h.app.inject({ method: 'GET', url, headers: { host: HOST_OK } })).body);
    const ok = await h.app.inject({ method: 'POST', url, headers: { host: HOST_OK, origin: ORIGIN_OK, ...FORM }, payload: postBody(nonce, 'approve') });
    expect(ok.statusCode).toBe(200);
    await expect(decisionP).resolves.toEqual({ kind: 'approve' });
  });

  it('a malformed decision body fails closed to reject', async () => {
    const h = await makeHarness();
    const decisionP = h.driver.promptForDecision(payload());
    const secret = secretFromLogs(h.logs);
    const url = `/agreement-confirm/${secret}`;
    const nonce = nonceFromHtml((await h.app.inject({ method: 'GET', url, headers: { host: HOST_OK } })).body);
    await h.app.inject({ method: 'POST', url, headers: { host: HOST_OK, origin: ORIGIN_OK, ...FORM }, payload: postBody(nonce, 'banana') });
    await expect(decisionP).resolves.toEqual({ kind: 'reject', reason: 'malformed response' });
  });

  it('single-use: a second POST gets 410', async () => {
    const h = await makeHarness();
    const decisionP = h.driver.promptForDecision(payload());
    const secret = secretFromLogs(h.logs);
    const url = `/agreement-confirm/${secret}`;
    const nonce = nonceFromHtml((await h.app.inject({ method: 'GET', url, headers: { host: HOST_OK } })).body);
    await h.app.inject({ method: 'POST', url, headers: { host: HOST_OK, origin: ORIGIN_OK, ...FORM }, payload: postBody(nonce, 'approve') });
    await decisionP;
    const second = await h.app.inject({ method: 'POST', url, headers: { host: HOST_OK, origin: ORIGIN_OK, ...FORM }, payload: postBody(nonce, 'approve') });
    expect(second.statusCode).toBe(410);
  });

  it('expired proposal: GET 404 + decision rejects expired', async () => {
    const h = await makeHarness();
    const decisionP = h.driver.promptForDecision(payload({ expiresAtMs: 2_000 }));
    const secret = secretFromLogs(h.logs);
    h.setNow(5_000); // past expiry
    const get = await h.app.inject({ method: 'GET', url: `/agreement-confirm/${secret}`, headers: { host: HOST_OK } });
    expect(get.statusCode).toBe(404);
    await expect(decisionP).resolves.toEqual({ kind: 'reject', reason: 'expired' });
  });

  it('flood guard: the 33rd concurrent confirm auto-rejects', async () => {
    const h = await makeHarness();
    const pending = [];
    for (let i = 0; i < 32; i++) pending.push(h.driver.promptForDecision(payload({ proposalId: `p_${i}`, expiresAtMs: 9_000_000 })));
    await expect(h.driver.promptForDecision(payload({ proposalId: 'p_over' }))).resolves.toEqual({ kind: 'reject', reason: 'too many pending confirmations' });
    void pending; // leave the 32 pending; afterEach closes the app
  });

  it('operatorApprove/operatorReject drive the prompt by proposalId (dashboard bridge)', async () => {
    const h = await makeHarness();
    const p = h.driver.promptForDecision(payload({ proposalId: 'p_op' }));
    expect(h.driver.operatorApprove('p_op')).toBe(true);
    await expect(p).resolves.toEqual({ kind: 'approve' });
    expect(h.driver.operatorApprove('p_op')).toBe(false); // already settled — idempotent
    const p2 = h.driver.promptForDecision(payload({ proposalId: 'p_rej' }));
    expect(h.driver.operatorReject('p_rej')).toBe(true);
    await expect(p2).resolves.toEqual({ kind: 'reject', reason: 'rejected from dashboard' });
    expect(h.driver.operatorReject('unknown')).toBe(false); // unknown id
  });
});
