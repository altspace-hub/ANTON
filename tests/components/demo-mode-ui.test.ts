// @vitest-environment jsdom
/**
 * demo-mode-ui.test.ts — the web client on a public demo server
 * (DEMO_MODE=true; public showcase, 2026-09-25), rendered.
 *
 *   - the banner: "do not enter personal or client data", the retention
 *     period and the privacy link — and nothing on an ordinary server;
 *   - the pillar switch shows a visitor only the enabled pillars, and
 *     disappears when Work is the only one; an admin sees them all;
 *   - the sidebar drops Tools & Features (Missions, Portals, Risk Atlas, …)
 *     for a visitor and offers Sign out and the privacy notice instead;
 *   - the login page lets a visitor create an account (the invite code, the
 *     acknowledgement) and signs them straight in; on an ordinary server there
 *     is no sign-up;
 *   - the privacy notice is marked DRAFT and states the retention period.
 *
 * Rendered with react-dom in jsdom (no testing library in this repo); fetch is
 * a stub.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement, type ComponentType } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import DemoBanner from '../../src/components/shared/DemoBanner';
import ModeToggle from '../../src/components/school/ModeToggle';
import Sidebar from '../../src/components/layout/Sidebar';
import LoginPage from '../../src/pages/LoginPage';
import PrivacyNoticePage from '../../src/pages/PrivacyNoticePage';
import { useDemoStore } from '../../src/stores/useDemoStore';
import { useAuthStore } from '../../src/stores/useAuthStore';
import { DEMO_OFF } from '../../src/lib/demo-config';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const DEMO_CONFIG = {
  deploymentMode: 'team',
  demoMode: true,
  offeredModels: ['compat:openrouter:z-ai/glm-5.3-flash'],
  enabledPillars: ['work'],
  signupOpen: true,
  signupCodeRequired: true,
  retentionDays: 21,
  privacyPath: '/privacy',
};

let container: HTMLDivElement;
let root: Root;
let fetchCalls: Array<{ url: string; method: string; body?: string }> = [];
let signupAnswer: { status: number; body: unknown } = { status: 201, body: {} };
let configAnswer: unknown = DEMO_CONFIG;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

async function render(component: ComponentType<object>, props: object = {}, path = '/'): Promise<void> {
  await act(async () => {
    root.render(createElement(MemoryRouter, { initialEntries: [path] }, createElement(component, props)));
  });
  for (let i = 0; i < 5; i++) await act(async () => { await Promise.resolve(); });
}

function buttonByText(text: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === text || b.title === text);
}

/** Sets a React-controlled input's value the way a person typing does. */
async function type(el: HTMLInputElement, value: string): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => {
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function setDemo(config: unknown, role: 'analyst' | 'admin' | null = 'analyst') {
  useDemoStore.setState({ config: DEMO_OFF, loaded: false });
  useDemoStore.getState().applyConfig(config);
  useAuthStore.setState({
    user: role ? { id: `u-${role}`, username: `visitor_${role}`, role } : null,
    token: role ? 't' : null,
    isTeamMode: true,
    isLoading: false,
  });
}

beforeEach(() => {
  fetchCalls = [];
  configAnswer = DEMO_CONFIG;
  signupAnswer = { status: 201, body: {} };
  localStorage.clear();
  // jsdom has no matchMedia; the sidebar asks it for the tablet breakpoint.
  window.matchMedia = ((query: string) => ({
    matches: false, media: query, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? 'GET').toUpperCase();
    fetchCalls.push({ url, method, body: typeof init?.body === 'string' ? init.body : undefined });
    if (url === '/api/config') return json(configAnswer);
    if (url === '/api/auth/demo-signup') return json(signupAnswer.body, signupAnswer.status);
    if (url.includes('/custom-modules')) return json([]);
    if (url.includes('/sessions/stats')) return json({ topModules: [] });
    return json({}, 404);
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  useAuthStore.setState({ user: null, token: null });
  useDemoStore.setState({ config: DEMO_OFF, loaded: false });
});

describe('DemoBanner', () => {
  it('warns a visitor, states the retention period and links the privacy notice', async () => {
    setDemo(DEMO_CONFIG);
    await render(DemoBanner as ComponentType<object>);
    expect(container.textContent).toContain('Demo — do not enter personal or client data.');
    expect(container.textContent).toContain('21 days');
    expect(container.querySelector('a[href="/privacy"]')).not.toBeNull();
  });

  it('renders nothing on an ordinary server (negative control)', async () => {
    configAnswer = { deploymentMode: 'team', demoMode: false };
    setDemo({ demoMode: false });
    await render(DemoBanner as ComponentType<object>);
    expect(container.textContent).toBe('');
  });
});

describe('ModeToggle (the pillar switch)', () => {
  it('disappears for a visitor when Work is the only pillar', async () => {
    setDemo(DEMO_CONFIG);
    await render(ModeToggle as ComponentType<object>);
    expect(container.querySelector('[aria-label="Switch mode"]')).toBeNull();
  });

  it('shows a visitor Work and the enabled pillars only', async () => {
    setDemo({ ...DEMO_CONFIG, enabledPillars: ['work', 'pathfinder'] });
    await render(ModeToggle as ComponentType<object>);
    const titles = [...container.querySelectorAll('[aria-label="Switch mode"] button')].map((b) => (b as HTMLButtonElement).title);
    expect(titles).toEqual(['Work', 'Pathfinder']);
  });

  it('shows an admin every pillar, and everyone on an ordinary server (negative controls)', async () => {
    setDemo(DEMO_CONFIG, 'admin');
    await render(ModeToggle as ComponentType<object>);
    const adminTitles = [...container.querySelectorAll('[aria-label="Switch mode"] button')].length;
    expect(adminTitles).toBe(9);

    setDemo({ demoMode: false });
    await render(ModeToggle as ComponentType<object>);
    expect([...container.querySelectorAll('[aria-label="Switch mode"] button')].length).toBe(9);
  });
});

describe('Sidebar', () => {
  const links = () => [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'));

  it('gives a visitor the Work home and the modules, a privacy link and Sign out — not the tools', async () => {
    setDemo(DEMO_CONFIG);
    await render(Sidebar as ComponentType<object>);
    const hrefs = links();
    for (const gone of ['/missions', '/portals', '/atlas', '/workflows', '/agents', '/task-agent', '/prompt', '/markets', '/coding']) {
      expect(hrefs, gone).not.toContain(gone);
    }
    expect(hrefs).toContain('/');
    expect(hrefs.some((h) => h?.startsWith('/module/'))).toBe(true);
    expect(hrefs).toContain('/privacy');
    expect(buttonByText('Sign out')).toBeDefined();
    expect(container.querySelector('[aria-controls="nav-section-tools"]')).toBeNull();
  });

  it('keeps everything for an admin on a demo and on an ordinary server (negative controls)', async () => {
    setDemo(DEMO_CONFIG, 'admin');
    await render(Sidebar as ComponentType<object>);
    expect(buttonByText('Sign out')).toBeUndefined();
    expect(container.querySelector('[aria-controls="nav-section-tools"]')).not.toBeNull();

    setDemo({ demoMode: false });
    await render(Sidebar as ComponentType<object>);
    expect(container.querySelector('[aria-controls="nav-section-tools"]')).not.toBeNull();
    expect(links()).not.toContain('/privacy');
  });

  it('Sign out ends the visitor\'s session', async () => {
    setDemo(DEMO_CONFIG);
    await render(Sidebar as ComponentType<object>);
    await act(async () => { buttonByText('Sign out')!.click(); });
    for (let i = 0; i < 3; i++) await act(async () => { await Promise.resolve(); });
    expect(useAuthStore.getState().user).toBeNull();
    expect(fetchCalls.some((c) => c.url === '/api/auth/logout' && c.method === 'POST')).toBe(true);
  });
});

describe('LoginPage on a demo', () => {
  async function openSignup() {
    setDemo(DEMO_CONFIG, null);
    await render(LoginPage as ComponentType<object>);
    const tab = [...container.querySelectorAll('[role="tab"]')].find((t) => t.textContent === 'Create a demo account') as HTMLButtonElement;
    expect(tab).toBeDefined();
    await act(async () => { tab.click(); });
  }

  async function fillAndSubmit(code = 'the-code') {
    await type(container.querySelector('#su-username') as HTMLInputElement, 'visitor_7');
    await type(container.querySelector('#su-password') as HTMLInputElement, 'a-long-enough-pass');
    await type(container.querySelector('#su-code') as HTMLInputElement, code);
    const box = container.querySelector('form[aria-label="Create a demo account"] input[type="checkbox"]') as HTMLInputElement;
    await act(async () => { box.click(); });
    const form = container.querySelector('form[aria-label="Create a demo account"]') as HTMLFormElement;
    await act(async () => { form.requestSubmit(); });
    for (let i = 0; i < 5; i++) await act(async () => { await Promise.resolve(); });
  }

  it('creates the account with the invite code and signs the visitor in', async () => {
    signupAnswer = { status: 201, body: { user: { id: 'u1', username: 'visitor_7', role: 'analyst' }, token: 'tok-1', expiresAt: '2026-10-16T00:00:00Z' } };
    await openSignup();
    expect(container.textContent).toContain('21 days');
    expect(container.textContent).not.toContain('Forgot password?');
    await fillAndSubmit();

    const call = fetchCalls.find((c) => c.url === '/api/auth/demo-signup');
    expect(call?.method).toBe('POST');
    expect(JSON.parse(call!.body!)).toEqual({ username: 'visitor_7', password: 'a-long-enough-pass', code: 'the-code' });
    expect(useAuthStore.getState().user?.username).toBe('visitor_7');
    expect(localStorage.getItem('openexpert-token')).toBe('tok-1');
  });

  it('shows the server\'s refusal and signs nobody in', async () => {
    signupAnswer = { status: 403, body: { error: 'That invite code is not valid.' } };
    await openSignup();
    await fillAndSubmit('wrong');
    expect(container.textContent).toContain('That invite code is not valid.');
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('offers no sign-up on an ordinary team server (negative control)', async () => {
    configAnswer = { deploymentMode: 'team', demoMode: false };
    setDemo({ demoMode: false }, null);
    await render(LoginPage as ComponentType<object>);
    expect(container.querySelector('[role="tab"]')).toBeNull();
    expect(container.textContent).toContain('Forgot password?');
    expect(container.textContent).not.toContain('do not enter personal');
  });
});

describe('PrivacyNoticePage', () => {
  it('is marked DRAFT, has placeholders for the controller, and states the retention period', async () => {
    setDemo(DEMO_CONFIG, null);
    await render(PrivacyNoticePage as ComponentType<object>, {}, '/privacy');
    expect(container.textContent).toContain('DRAFT — not yet reviewed by a lawyer.');
    expect(container.textContent).toContain("[controller's legal name]");
    expect(container.textContent).toContain('21 days');
    expect(container.textContent).toContain('OpenRouter');
  });
});
