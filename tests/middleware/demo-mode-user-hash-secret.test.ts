/**
 * demo-mode-user-hash-secret.test.ts — the key of the pseudonymous `user` id
 * sent to OpenRouter (privacy review M3 / D11, 2026-09-26), and the demo
 * warnings for the operator name and the hidden modules.
 *
 * The id is an HMAC of the visitor's account id. It used to be keyed with
 * JWT_SECRET, which also signs every session. A demo now refuses to start
 * unless LLM_USER_HASH_SECRET is set, differs from JWT_SECRET and is not
 * short; an ordinary install keeps the fallback it had.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createHmac } from 'node:crypto';
import { demoModeStartupProblem, demoModeWarnings } from '../../server/middleware/demo-mode.js';
import { compatEndUserId } from '../../server/services/adapters/openaiCompatibleAdapter.js';

const JWT = 'j'.repeat(64);
const HASH = 'h'.repeat(64);
const TEAM_DEMO = { DEMO_MODE: 'true', DEPLOYMENT_MODE: 'team', JWT_SECRET: JWT };

describe('LLM_USER_HASH_SECRET on a demo', () => {
  it('refuses to start without it, naming the variable', () => {
    expect(demoModeStartupProblem(TEAM_DEMO)).toMatch(/FATAL: LLM_USER_HASH_SECRET is not set/);
    expect(demoModeStartupProblem({ ...TEAM_DEMO, LLM_USER_HASH_SECRET: '   ' })).toMatch(/LLM_USER_HASH_SECRET is not set/);
  });

  it('refuses to start when it is JWT_SECRET, without echoing either value', () => {
    const problem = demoModeStartupProblem({ ...TEAM_DEMO, LLM_USER_HASH_SECRET: JWT });
    expect(problem).toMatch(/FATAL: LLM_USER_HASH_SECRET is the same as JWT_SECRET/);
    expect(problem).not.toContain(JWT);
    expect(demoModeStartupProblem({ ...TEAM_DEMO, LLM_USER_HASH_SECRET: ` ${JWT} ` })).toMatch(/same as JWT_SECRET/);
  });

  it('refuses to start with a short one', () => {
    const problem = demoModeStartupProblem({ ...TEAM_DEMO, LLM_USER_HASH_SECRET: 'short-secret' });
    expect(problem).toMatch(/shorter than 32 characters/);
    expect(problem).not.toContain('short-secret');
  });

  it('refuses to start with a <...> placeholder left in, however long', () => {
    const placeholder = '<32 random bytes, hex — must differ from JWT_SECRET and be long>';
    expect(demoModeStartupProblem({ ...TEAM_DEMO, LLM_USER_HASH_SECRET: placeholder })).toMatch(/still the <\.\.\.> placeholder/);
    expect(demoModeStartupProblem({ ...TEAM_DEMO, LLM_USER_HASH_SECRET: '<openssl rand -hex 32>' })).toMatch(/FATAL: LLM_USER_HASH_SECRET/);
  });

  it('starts with its own secret (negative control)', () => {
    expect(demoModeStartupProblem({ ...TEAM_DEMO, LLM_USER_HASH_SECRET: HASH })).toBeNull();
  });

  it('is not asked for outside demo mode (negative control)', () => {
    expect(demoModeStartupProblem({ DEPLOYMENT_MODE: 'team', JWT_SECRET: JWT })).toBeNull();
    expect(demoModeStartupProblem({ DEMO_MODE: 'false', DEPLOYMENT_MODE: 'team', JWT_SECRET: JWT })).toBeNull();
  });

  it('keeps the earlier checks first: solo mode and an unreadable spend cap are still named', () => {
    expect(demoModeStartupProblem({ DEMO_MODE: 'true', DEPLOYMENT_MODE: 'solo' })).toMatch(/requires DEPLOYMENT_MODE=team/);
    expect(demoModeStartupProblem({ ...TEAM_DEMO, LLM_DAILY_SPEND_CAP_USD: '$3' })).toMatch(/FATAL: LLM_DAILY_SPEND_CAP_USD/);
  });
});

describe('the HMAC key outside demo mode (today\'s behaviour)', () => {
  const saved = { hash: process.env.LLM_USER_HASH_SECRET, jwt: process.env.JWT_SECRET };
  afterEach(() => {
    if (saved.hash === undefined) delete process.env.LLM_USER_HASH_SECRET; else process.env.LLM_USER_HASH_SECRET = saved.hash;
    if (saved.jwt === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = saved.jwt;
  });
  const expected = (key: string, id: string) => `anton-${createHmac('sha256', key).update(id).digest('hex').slice(0, 32)}`;

  it('uses LLM_USER_HASH_SECRET when it is set', () => {
    process.env.JWT_SECRET = JWT;
    process.env.LLM_USER_HASH_SECRET = HASH;
    expect(compatEndUserId('user-1')).toBe(expected(HASH, 'user-1'));
    expect(compatEndUserId('user-1')).not.toBe(expected(JWT, 'user-1'));
  });

  it('falls back on JWT_SECRET when it is not', () => {
    process.env.JWT_SECRET = JWT;
    delete process.env.LLM_USER_HASH_SECRET;
    expect(compatEndUserId('user-1')).toBe(expected(JWT, 'user-1'));
  });
});

describe('demo warnings for the privacy review settings', () => {
  const ok = { ...TEAM_DEMO, LLM_USER_HASH_SECRET: HASH };

  it('warns when no operator is named, and not once one is', () => {
    expect(demoModeWarnings(ok).some((w) => w.startsWith('DEMO_OPERATOR_NAME is not set'))).toBe(true);
    expect(demoModeWarnings({ ...ok, DEMO_OPERATOR_NAME: 'Example AB' }).some((w) => w.includes('DEMO_OPERATOR_NAME'))).toBe(false);
  });

  it('warns when no module is hidden (both lists "none"), and not while either list hides one', () => {
    const hiddenWarning = (w: string[]) => w.some((x) => x.startsWith('DEMO_HIDDEN_AREAS and DEMO_HIDDEN_MODULES are both "none"'));
    const none = { ...ok, DEMO_HIDDEN_AREAS: 'none', DEMO_HIDDEN_MODULES: 'none' };
    expect(hiddenWarning(demoModeWarnings(none))).toBe(true);
    // Unset lists are the built-in ones (demo-hidden-defaults.test.ts).
    expect(hiddenWarning(demoModeWarnings(ok))).toBe(false);
    expect(hiddenWarning(demoModeWarnings({ ...none, DEMO_HIDDEN_AREAS: 'healthcare' }))).toBe(false);
    expect(hiddenWarning(demoModeWarnings({ ...none, DEMO_HIDDEN_MODULES: 'cv-writer' }))).toBe(false);
  });

  it('says nothing outside demo mode (negative control)', () => {
    expect(demoModeWarnings({ DEPLOYMENT_MODE: 'team' })).toEqual([]);
  });
});
