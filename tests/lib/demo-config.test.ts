/**
 * demo-config.test.ts — the web client's reading of a public demo server's
 * /api/config (DEMO_MODE=true), and the sign-up form's rules.
 *
 * Every helper that hides something has its negative control: an ordinary
 * server, and an admin on a demo, see everything.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  parseDemoConfig, DEMO_OFF, PILLARS, demoRestricted, pillarVisible, demoHiddenNavItems,
  demoSignupProblem, demoSignupErrorMessage,
} from '../../src/lib/demo-config';
import { ALL_NAV_ITEMS } from '../../src/components/layout/NavItemConfig';

const DEMO = {
  deploymentMode: 'team',
  demoMode: true,
  offeredModels: ['compat:openrouter:z-ai/glm-5.3-flash', 7, ''],
  enabledPillars: ['work', 'pathfinder', 'nonsense'],
  signupOpen: true,
  signupCodeRequired: true,
  retentionDays: 30,
  privacyPath: '/privacy',
};
const ALL_IDS = ALL_NAV_ITEMS.map((i) => i.id);

describe('parseDemoConfig', () => {
  it('reads a demo answer and drops what is malformed', () => {
    expect(parseDemoConfig(DEMO)).toEqual({
      demoMode: true,
      offeredModels: ['compat:openrouter:z-ai/glm-5.3-flash'],
      enabledPillars: ['work', 'pathfinder'],
      signupOpen: true,
      signupCodeRequired: true,
      retentionDays: 30,
      privacyPath: '/privacy',
      termsPath: '/terms',
      termsVersion: '',
      operatorName: '',
      answersScored: true,
      hiddenAreas: [],
      hiddenModules: [],
    });
  });

  it('answersScored: only an explicit false says a demo makes no quality score', () => {
    expect(parseDemoConfig({ ...DEMO, answersScored: false }).answersScored).toBe(false);
    expect(parseDemoConfig({ ...DEMO, answersScored: true }).answersScored).toBe(true);
    expect(DEMO_OFF.answersScored).toBe(true);
  });

  it('treats anything but demoMode === true as an ordinary server', () => {
    expect(parseDemoConfig({ demoMode: false, signupOpen: true })).toEqual(DEMO_OFF);
    expect(parseDemoConfig({ deploymentMode: 'team' })).toEqual(DEMO_OFF);
    expect(parseDemoConfig(null)).toEqual(DEMO_OFF);
    expect(parseDemoConfig('demoMode')).toEqual(DEMO_OFF);
    expect(DEMO_OFF.enabledPillars).toEqual([...PILLARS]);
  });

  it('always keeps Work, and never links the privacy notice off-site', () => {
    expect(parseDemoConfig({ demoMode: true, enabledPillars: ['markets'] }).enabledPillars).toEqual(['work', 'markets']);
    expect(parseDemoConfig({ demoMode: true, privacyPath: 'https://evil.example/privacy' }).privacyPath).toBe('/privacy');
    expect(parseDemoConfig({ demoMode: true, privacyPath: '//evil.example' }).privacyPath).toBe('/privacy');
    expect(parseDemoConfig({ demoMode: true, retentionDays: 'x' }).retentionDays).toBe(30);
  });
});

describe('who is held to the demo surface', () => {
  const cfg = parseDemoConfig(DEMO);

  it('a visitor on a demo is; an admin on a demo and anyone on an ordinary server are not', () => {
    expect(demoRestricted(cfg, 'analyst')).toBe(true);
    expect(demoRestricted(cfg, 'viewer')).toBe(true);
    expect(demoRestricted(cfg, undefined)).toBe(true);
    expect(demoRestricted(cfg, 'admin')).toBe(false);
    expect(demoRestricted(DEMO_OFF, 'analyst')).toBe(false);
  });

  it('shows a visitor Work and the enabled pillars only', () => {
    expect(PILLARS.filter((p) => pillarVisible(cfg, 'analyst', p))).toEqual(['work', 'pathfinder']);
    expect(PILLARS.filter((p) => pillarVisible(cfg, 'admin', p))).toEqual([...PILLARS]);
    expect(PILLARS.filter((p) => pillarVisible(DEMO_OFF, 'analyst', p))).toEqual([...PILLARS]);
  });

  it('hides every sidebar entry but home and the enabled pillars\' entries from a visitor', () => {
    const hidden = demoHiddenNavItems(cfg, 'analyst', ALL_IDS);
    expect(hidden.has('home')).toBe(false);
    expect(hidden.has('pathfinder')).toBe(false);
    expect(hidden.has('pathfinder-history')).toBe(false);
    for (const id of ['agents', 'markets', 'coding', 'workflows', 'prompt', 'council', 'school', 'task-agent', 'my-work']) {
      expect(hidden.has(id), id).toBe(true);
    }
    expect(hidden.size).toBe(ALL_IDS.filter((id) => id !== 'pathfinder' && id !== 'pathfinder-history').length);
  });

  it('hides nothing for an admin or on an ordinary server', () => {
    expect(demoHiddenNavItems(cfg, 'admin', ALL_IDS).size).toBe(0);
    expect(demoHiddenNavItems(DEMO_OFF, 'analyst', ALL_IDS).size).toBe(0);
  });
});

describe('the sign-up form', () => {
  const ok = { username: 'visitor_1', password: 'twelve-chars', code: 'abc', agreed: true };

  it('accepts what the server accepts', () => {
    expect(demoSignupProblem(ok, true)).toBeNull();
    expect(demoSignupProblem({ ...ok, code: '' }, false)).toBeNull();
  });

  it('says what is wrong before sending', () => {
    expect(demoSignupProblem({ ...ok, username: 'ab' }, true)).toMatch(/username/);
    expect(demoSignupProblem({ ...ok, username: 'has space' }, true)).toMatch(/username/);
    expect(demoSignupProblem({ ...ok, password: 'elevenchars' }, true)).toMatch(/12 characters/);
    expect(demoSignupProblem({ ...ok, code: '  ' }, true)).toMatch(/invite code/);
    expect(demoSignupProblem({ ...ok, agreed: false }, true)).toMatch(/confirm/);
  });

  it('turns the server\'s refusals into readable messages', () => {
    expect(demoSignupErrorMessage(409, { error: 'That username is taken. Choose another.' })).toBe('That username is taken. Choose another.');
    expect(demoSignupErrorMessage(403, { error: 'That invite code is not valid.' })).toBe('That invite code is not valid.');
    expect(demoSignupErrorMessage(429, { error: 'Too many sign-up attempts from this address. Try again in an hour.' })).toMatch(/Too many/);
    expect(demoSignupErrorMessage(400, { error: 'Invalid request body', details: { password: ['too short'] } })).toMatch(/12 characters/);
    expect(demoSignupErrorMessage(404, {})).toMatch(/not available/);
    expect(demoSignupErrorMessage(500, { error: 'stack trace here' })).toBe('Sign-up could not be completed. Please try again.');
  });
});

describe('useDemoStore', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

  it('fetches /api/config once, and not at all when App already handed the answer in', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(DEMO), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { useDemoStore } = await import('../../src/stores/useDemoStore');
    await Promise.all([useDemoStore.getState().load(), useDemoStore.getState().load()]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(useDemoStore.getState().config.demoMode).toBe(true);
    await useDemoStore.getState().load();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.resetModules();
    const fresh = (await import('../../src/stores/useDemoStore')).useDemoStore;
    fresh.getState().applyConfig({ demoMode: false });
    await fresh.getState().load();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fresh.getState().config.demoMode).toBe(false);
  });

  it('a failed fetch leaves an ordinary server and never throws', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    const { useDemoStore } = await import('../../src/stores/useDemoStore');
    await expect(useDemoStore.getState().load()).resolves.toBeUndefined();
    expect(useDemoStore.getState().config).toEqual(DEMO_OFF);
    expect(useDemoStore.getState().loaded).toBe(true);
  });
});
