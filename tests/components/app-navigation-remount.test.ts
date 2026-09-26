// @vitest-environment jsdom
/**
 * app-navigation-remount.test.ts — navigating inside ANTON keeps the layout
 * (Sidebar, Header, DemoBanner) and the current page mounted.
 *
 * Showcase review C13 (2026-09-25): App reads useLocation() for the /privacy
 * page, so it re-renders on every navigation. ProtectedRoute was a function
 * declared inside App, so each render gave the layout route a new element
 * type and React unmounted and remounted <MainLayout/> and the page on every
 * click: the sidebar filter was cleared, the sidebar's mount-only fetches ran
 * again, and a page that keeps its tab in the query string (Settings) was
 * rebuilt on each tab click. That hit every user, solo and team.
 *
 * The real App, MainLayout, Sidebar, Header and DemoBanner are rendered; the
 * two pages are small probes that count their mounts. fetch is a stub.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router-dom';

const probe = vi.hoisted(() => ({
  homeMounts: 0,
  moduleMounts: 0,
  navigate: null as null | ((to: string) => void),
  setQuery: null as null | ((q: string) => void),
}));

// The pages are probes: they count mounts and hand the test a way to navigate
// the way a page does (a link, or setSearchParams for a tab kept in the URL).
vi.mock('../../src/pages/HomeV2', async () => {
  const React = await import('react');
  const { useNavigate, useSearchParams } = await import('react-router-dom');
  function HomeProbe() {
    const navigate = useNavigate();
    const [params, setParams] = useSearchParams();
    probe.navigate = (to: string) => navigate(to);
    probe.setQuery = (q: string) => setParams({ tab: q });
    React.useEffect(() => { probe.homeMounts += 1; }, []);
    // A remount loop must end the test, not hang it.
    if (probe.homeMounts > 25) throw new Error('home page remounted in a loop');
    return React.createElement('div', { 'data-probe': 'home' }, `home tab=${params.get('tab') ?? ''}`);
  }
  return { default: HomeProbe };
});

vi.mock('../../src/pages/ModulePage', async () => {
  const React = await import('react');
  const { useNavigate, useParams } = await import('react-router-dom');
  function ModuleProbe() {
    const navigate = useNavigate();
    const { moduleId } = useParams();
    probe.navigate = (to: string) => navigate(to);
    React.useEffect(() => { probe.moduleMounts += 1; }, []);
    if (probe.moduleMounts > 25) throw new Error('module page remounted in a loop');
    return React.createElement('div', { 'data-probe': 'module' }, `module ${moduleId ?? ''}`);
  }
  return { default: ModuleProbe };
});

import App from '../../src/App';
import { useAuthStore } from '../../src/stores/useAuthStore';
import { useDemoStore } from '../../src/stores/useDemoStore';
import { DEMO_OFF } from '../../src/lib/demo-config';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const DEMO_CONFIG = {
  deploymentMode: 'team',
  demoMode: true,
  offeredModels: ['compat:openrouter:z-ai/glm-5.3-flash'],
  enabledPillars: ['work'],
  signupOpen: true,
  signupCodeRequired: true,
  retentionDays: 30,
  privacyPath: '/privacy',
};

let container: HTMLDivElement;
let root: Root;
let fetchCalls: string[] = [];
let configAnswer: unknown = DEMO_CONFIG;
let meAnswer: { status: number; body: unknown } = { status: 200, body: {} };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

async function settle(): Promise<void> {
  for (let i = 0; i < 10; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}

let locationChanges = 0;
let lastPath = '';

/**
 * Counts location changes beside App. A redirect loop (ProtectedRoute's
 * <Navigate> remounting on every navigation it causes) would otherwise spin
 * the test for good; past a sane count this throws and ends the render.
 */
function LocationWatch() {
  const location = useLocation();
  useEffect(() => {
    locationChanges += 1;
    lastPath = location.pathname;
  }, [location]);
  if (locationChanges > 50) throw new Error('navigation loop: the location keeps changing');
  return null;
}

async function renderApp(path = '/'): Promise<void> {
  await act(async () => {
    root.render(createElement(MemoryRouter, { initialEntries: [path] }, createElement(LocationWatch), createElement(App)));
  });
  await settle();
}

async function go(to: string): Promise<void> {
  await act(async () => { probe.navigate!(to); });
  await settle();
}

const layoutMounts = () => fetchCalls.filter((u) => u === '/api/custom-modules').length;
const filterInput = () => container.querySelector('input[aria-label="Filter modules"]') as HTMLInputElement | null;
const hrefs = () => [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'));
const hasSignOut = () => [...container.querySelectorAll('button')].some((b) => b.textContent?.trim() === 'Sign out');

async function typeInto(el: HTMLInputElement, value: string): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => {
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function signedIn(role: 'analyst' | 'admin') {
  localStorage.setItem('openexpert-token', 'tok-1');
  meAnswer = { status: 200, body: { id: `u-${role}`, username: `visitor_${role}`, role } };
}

beforeEach(() => {
  locationChanges = 0;
  lastPath = '';
  probe.homeMounts = 0;
  probe.moduleMounts = 0;
  probe.navigate = null;
  probe.setQuery = null;
  fetchCalls = [];
  configAnswer = DEMO_CONFIG;
  meAnswer = { status: 401, body: {} };
  localStorage.clear();
  // No onboarding tour over the page.
  localStorage.setItem('openexpert-tour-completed', 'true');
  window.matchMedia = ((query: string) => ({
    matches: false, media: query, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    fetchCalls.push(url);
    // A remount loop feeds on these answers; past a sane count, stop answering.
    if (fetchCalls.length > 400) return new Promise<Response>(() => {});
    if (url === '/api/config') return json(configAnswer);
    if (url === '/api/auth/me') return json(meAnswer.body, meAnswer.status);
    if (url === '/api/custom-modules') return json([]);
    if (url.includes('/sessions/stats')) return json({ topModules: [] });
    return json({}, 404);
  });
  useAuthStore.setState({ user: null, token: null, isLoading: true, isTeamMode: false });
  useDemoStore.setState({ config: DEMO_OFF, loaded: false });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  useAuthStore.setState({ user: null, token: null, isLoading: true, isTeamMode: false });
  useDemoStore.setState({ config: DEMO_OFF, loaded: false });
});

describe('navigation keeps the layout and the page mounted (C13)', () => {
  it('a demo visitor: the layout mounts once over query-only, route and param changes', async () => {
    signedIn('analyst');
    await renderApp('/');
    expect(container.querySelector('[data-probe="home"]')).not.toBeNull();
    expect(layoutMounts()).toBe(1);
    expect(probe.homeMounts).toBe(1);

    // The sidebar filter is layout state a remount would clear.
    await typeInto(filterInput()!, 'gap');
    expect(filterInput()!.value).toBe('gap');

    // A tab kept in the query string (Settings does this): same page, same layout.
    await act(async () => { probe.setQuery!('b'); });
    await settle();
    expect(container.textContent).toContain('home tab=b');
    expect(probe.homeMounts).toBe(1);
    expect(layoutMounts()).toBe(1);

    // To a module, and to another module (a param change on the same route).
    await go('/module/aml-gap-analysis');
    await go('/module/policy-drafting');
    expect(container.textContent).toContain('module policy-drafting');
    expect(probe.moduleMounts).toBe(1);
    expect(layoutMounts()).toBe(1);
    expect(filterInput()!.value).toBe('gap');

    // Control: the counters do see a mount — back home is a new page.
    await go('/');
    expect(probe.homeMounts).toBe(2);
    expect(layoutMounts()).toBe(1);
  });

  it('the demo gating still holds after navigating: banner, no Settings, Sign out', async () => {
    signedIn('analyst');
    await renderApp('/');
    await go('/module/aml-gap-analysis');
    expect(container.querySelector('[aria-label="Demo notice"]')).not.toBeNull();
    expect(hrefs()).not.toContain('/settings');
    expect(hrefs()).toContain('/privacy');
    expect(hasSignOut()).toBe(true);
  });

  it('an admin on the demo keeps Settings and no visitor Sign out (negative control)', async () => {
    signedIn('admin');
    await renderApp('/');
    await go('/module/aml-gap-analysis');
    expect(hrefs()).toContain('/settings');
    expect(hasSignOut()).toBe(false);
    expect(layoutMounts()).toBe(1);
  });

  it('solo mode, no demo: the layout also mounts once and there is no banner', async () => {
    configAnswer = { deploymentMode: 'solo', demoMode: false };
    localStorage.setItem('openexpert-has-entered', 'true');
    await renderApp('/');
    await act(async () => { probe.setQuery!('x'); });
    await settle();
    await go('/module/aml-gap-analysis');
    expect(container.textContent).toContain('module aml-gap-analysis');
    expect(layoutMounts()).toBe(1);
    expect(probe.homeMounts).toBe(1);
    expect(container.querySelector('[aria-label="Demo notice"]')).toBeNull();
    expect(hrefs()).toContain('/settings');
  });

  // With ProtectedRoute declared inside App this froze the tab: each redirect
  // changed the location, App re-rendered, a new <Navigate> mounted and
  // redirected again, for good.
  it('ProtectedRoute still sends a signed-out team user home, once', async () => {
    configAnswer = { deploymentMode: 'team', demoMode: false };
    // Entered once in solo mode; the server is now a team server with no session.
    localStorage.setItem('openexpert-has-entered', 'true');
    await renderApp('/module/aml-gap-analysis');
    expect(container.querySelector('[data-probe="module"]')).toBeNull();
    expect(probe.moduleMounts).toBe(0);
    expect(layoutMounts()).toBe(0);
    // Home, and settled: the start location, the redirect, and React Router's
    // one repeat of it (<Navigate> re-runs once when the pathname changes).
    expect(lastPath).toBe('/');
    expect(locationChanges).toBeLessThanOrEqual(3);
  });
});
