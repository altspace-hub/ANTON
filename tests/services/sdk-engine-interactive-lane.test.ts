/**
 * sdk-engine-interactive-lane.test.ts
 *
 * 2026-08-20: a user ran FCP Model Validation and got
 *   "SDK engine error: Operation aborted. The Claude Code runtime must be
 *    installed and logged in on this machine."
 * The runtime was installed and signed in. What had actually happened is
 * visible in the server log either side of that line: the markets startup
 * catch-up was working a 1,175-item extraction backlog, one subscription run
 * per item, back to back. Both of the engine's two slots were occupied
 * continuously, the weekly pulse had already failed with "SDK engine busy",
 * and the interactive request was squeezed out.
 *
 * Two defects, and the second is what made the first hard to diagnose:
 *   1. Background batch work competed with interactive work for a scarce
 *      resource, on equal terms.
 *   2. Every failure was reported as an installation problem, so the message
 *      sent the user to fix something that was not broken.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const sdk = readFileSync(resolve(here, '../../server/services/claude-sdk-client.ts'), 'utf8');
const router = readFileSync(resolve(here, '../../server/services/provider-router.ts'), 'utf8');
const atoms = readFileSync(resolve(here, '../../server/services/market-atom-service.ts'), 'utf8');

describe('interactive lane', () => {
  it('reserves a slot that background work cannot take', () => {
    expect(sdk).toMatch(/MAX_BACKGROUND_SDK_RUNS = MAX_CONCURRENT_SDK_RUNS - 1/);
  });

  it('picks the cap from the caller kind rather than always using the max', () => {
    expect(sdk).toMatch(/const slotCap = opts\?\.background \? MAX_BACKGROUND_SDK_RUNS : MAX_CONCURRENT_SDK_RUNS/);
    expect(sdk).toMatch(/if \(activeRuns >= slotCap\)/);
    // The old unconditional gate must be gone, or background work still competes.
    expect(sdk).not.toMatch(/if \(activeRuns >= MAX_CONCURRENT_SDK_RUNS\)/);
  });

  it('defaults to interactive so a new caller cannot silently starve the user', () => {
    // opts?.background is undefined unless set — opt IN to deprioritisation.
    expect(sdk).toMatch(/background\?: boolean/);
    expect(sdk).not.toMatch(/background = true/);
  });

  it('threads the hint from callChat down to the engine', () => {
    expect(router).toMatch(/background\?: boolean/);
    expect(router).toMatch(/\{ background: config\.background === true \}/);
  });

  it('marks the backlog extraction that caused the incident', () => {
    const start = atoms.indexOf('EXTRACTION_SYSTEM_PROMPT,');
    const call = atoms.slice(start, start + 500);
    expect(call).toMatch(/background: true/);
  });
});

describe('failure messages', () => {
  /** Mirrors explainSdkFailure so each branch is asserted against real text. */
  function explain(msg: string): string {
    const m = msg.toLowerCase();
    if (m.includes('abort')) return 'abort';
    if (m.includes('529') || m.includes('overloaded')) return 'overloaded';
    if (m.includes('rate limit') || m.includes('429')) return 'ratelimit';
    if (m.includes('enoent') || m.includes('spawn')) return 'runtime';
    if (m.includes('login') || m.includes('auth') || m.includes('unauthor') || m.includes('credential')) return 'login';
    return 'generic';
  }

  it('no longer blames the installation for every failure', () => {
    // The exact sentence the user was shown for a transient saturation.
    expect(sdk).not.toMatch(/SDK engine error: \$\{msg\}\. The Claude Code runtime must be installed and logged in/);
  });

  it('routes each failure kind to its own explanation', () => {
    expect(explain('Operation aborted')).toBe('abort');
    expect(explain('API Error: 529 Overloaded')).toBe('overloaded');
    expect(explain('429 rate limit exceeded')).toBe('ratelimit');
    expect(explain('spawn claude ENOENT')).toBe('runtime');
    expect(explain('not authorized — please login')).toBe('login');
    expect(explain('something unexpected')).toBe('generic');
  });

  it('tells an aborted run what to actually do', () => {
    const fn = sdk.slice(sdk.indexOf('function explainSdkFailure'), sdk.indexOf('function explainSdkFailure') + 1400);
    expect(fn).toMatch(/saturated by background work/);
    expect(fn).toMatch(/pick an API model/);
    // Install/login advice must be reserved for install/login failures.
    const abortBranch = fn.slice(fn.indexOf("includes('abort')"), fn.indexOf("includes('529')"));
    expect(abortBranch).not.toMatch(/installed/);
    expect(abortBranch).not.toMatch(/signed in/);
  });
});
