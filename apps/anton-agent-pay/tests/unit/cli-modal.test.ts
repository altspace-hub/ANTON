/**
 * cli-modal.test.ts — the standalone gateway's TERMINAL approval boundary.
 * Drives the full approve / reject / expiry / passphrase paths with injected
 * streams (no real TTY), and proves there is no auto-approve.
 */
import { describe, expect, it } from 'vitest';
import { PassThrough } from 'node:stream';
import { CliModalDriver, readLine } from '../../src/standalone/cli-modal.js';
import type { ModalPayload } from '../../src/shared/ipc-types.js';

function payload(over: Partial<ModalPayload> = {}): ModalPayload {
  return {
    proposalId: 'p_test',
    agentName: 'claude-desktop',
    agentPairedAgo: 'just now',
    to: 'fc_VEH4mJb5P9hKEaWkiuXRG6e6jooCnQZqKs',
    amountFtc: 12.5,
    feeFtc: 0.001,
    balanceAfterFtc: 87.5,
    walletHasPassphrase: false,
    expiresAtMs: 60_000,
    ...over,
  };
}

function driverWith(over: Partial<ModalPayload> = {}): { driver: CliModalDriver; input: PassThrough; out: () => string; p: ModalPayload } {
  const input = new PassThrough();
  const output = new PassThrough();
  let collected = '';
  output.on('data', (c) => { collected += c.toString('utf8'); });
  const driver = new CliModalDriver({ input, output, now: () => 0 });
  return { driver, input, out: () => collected, p: payload(over) };
}

describe('readLine', () => {
  it('resolves the first line (newline-stripped)', async () => {
    const s = new PassThrough();
    const got = readLine(s, 1000);
    s.write('hello\nworld\n');
    expect(await got).toBe('hello');
  });
  it('resolves null on timeout', async () => {
    const s = new PassThrough();
    expect(await readLine(s, 20)).toBeNull();
  });
});

describe('CliModalDriver', () => {
  it('APPROVES on "y"', async () => {
    const { driver, input, p, out } = driverWith();
    const d = driver.promptForDecision(p);
    input.write('y\n');
    expect((await d).kind).toBe('approve');
    expect(out()).toContain('12.5 FTC');           // the amount was shown
    expect(out()).toContain('claude-desktop');      // and which agent asked
  });

  it('REJECTS on "n"', async () => {
    const { driver, input, p } = driverWith();
    const d = driver.promptForDecision(p);
    input.write('n\n');
    const decision = await d;
    expect(decision.kind).toBe('reject');
  });

  it('REJECTS any non-yes input (no accidental approve)', async () => {
    const { driver, input, p } = driverWith();
    const d = driver.promptForDecision(p);
    input.write('send it\n');
    expect((await d).kind).toBe('reject');
  });

  it('REJECTS (expired) when no input arrives before the TTL', async () => {
    const { driver, p } = driverWith({ expiresAtMs: 25 }); // 25ms window, no input
    const decision = await driver.promptForDecision(p);
    expect(decision).toEqual({ kind: 'reject', reason: 'expired' });
  });

  it('REJECTS immediately when the proposal is already expired', async () => {
    const { driver, p } = driverWith({ expiresAtMs: -1 });
    expect((await driver.promptForDecision(p)).kind).toBe('reject');
  });

  it('collects the passphrase on approve when the wallet is protected', async () => {
    const { driver, input, p } = driverWith({ walletHasPassphrase: true });
    const d = driver.promptForDecision(p);
    input.write('y\nhunter2\n');
    const decision = await d;
    expect(decision).toEqual({ kind: 'approve', passphrase: 'hunter2' });
  });

  it('serialises concurrent prompts (one decision at a time, FIFO)', async () => {
    const { driver, input, p } = driverWith();
    const d1 = driver.promptForDecision(p);
    const d2 = driver.promptForDecision(payload({ proposalId: 'p_2' }));
    input.write('y\n');   // first prompt
    input.write('n\n');   // second prompt
    expect((await d1).kind).toBe('approve');
    expect((await d2).kind).toBe('reject');
  });
});
