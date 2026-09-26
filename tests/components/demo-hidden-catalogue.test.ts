// @vitest-environment jsdom
/**
 * demo-hidden-catalogue.test.ts — on a public demo (DEMO_MODE=true) a visitor
 * never meets a module or an area the demo keeps off (DEMO_HIDDEN_MODULES,
 * DEMO_HIDDEN_AREAS; privacy review H3, verification 2026-09-26 problem 2).
 * The server sends the effective lists in /api/config (hiddenAreas,
 * hiddenModules); the browser's catalogue comes from src/lib/constants.ts,
 * so every page that lists it filters it (src/lib/demo-catalogue.ts):
 *
 *   - the pure rules: parseDemoConfig, demoModuleHiddenFor, demoCatalogue;
 *   - Home: the catalogue by area, its search and its counts;
 *   - the sidebar: the area tree and the module filter;
 *   - the header breadcrumb, the NGO hub and the Life page;
 *   - a hidden module's address shows "This module is not offered on this
 *     demo." and loads nothing of the module.
 *
 * Every block has negative controls: an admin on the demo and everyone on an
 * ordinary server see the whole catalogue, and a module the demo offers opens
 * as before. Rendered with react-dom in jsdom; fetch is a stub that records
 * every call.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement, type ComponentType } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import HomeV2 from '../../src/pages/HomeV2';
import Sidebar from '../../src/components/layout/Sidebar';
import Header from '../../src/components/layout/Header';
import ModulePage from '../../src/pages/ModulePage';
import NGOHubPage from '../../src/pages/NGOHubPage';
import LifePage from '../../src/pages/LifePage';
import { useDemoStore } from '../../src/stores/useDemoStore';
import { useAuthStore } from '../../src/stores/useAuthStore';
import { DEMO_OFF, parseDemoConfig, demoModuleHiddenFor, demoAreaHiddenFor } from '../../src/lib/demo-config';
import { demoCatalogue } from '../../src/lib/demo-catalogue';
import { MODULES, AREAS } from '../../src/lib/constants';
import { resetPublicModelConfigCache } from '../../src/lib/compat-model-policy';

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
  termsPath: '/terms',
  termsVersion: '2026-09-26',
  answersScored: false,
  hiddenAreas: ['healthcare', 'community-health'],
  hiddenModules: ['cv-writer', 'investigation-support'],
};
const ORDINARY = { deploymentMode: 'team', demoMode: false };

type Who = 'visitor' | 'admin' | 'ordinary';

// ── The rules ────────────────────────────────────────────────────────────

describe('parseDemoConfig: the hidden lists', () => {
  it('reads them lower-cased, each once, and drops what is not an id', () => {
    const cfg = parseDemoConfig({
      demoMode: true,
      hiddenAreas: ['HealthCare', 'healthcare', 7, '', '../x', 'hr'],
      hiddenModules: ['CV-Writer', null, 'credit-risk'],
    });
    expect(cfg.hiddenAreas).toEqual(['healthcare', 'hr']);
    expect(cfg.hiddenModules).toEqual(['cv-writer', 'credit-risk']);
  });

  it('is empty when the server sends none, and on an ordinary server', () => {
    expect(parseDemoConfig({ demoMode: true }).hiddenAreas).toEqual([]);
    expect(parseDemoConfig({ demoMode: true, hiddenModules: 'cv-writer' }).hiddenModules).toEqual([]);
    expect(parseDemoConfig({ demoMode: false, hiddenModules: ['cv-writer'] }).hiddenModules).toEqual([]);
    expect(DEMO_OFF.hiddenAreas).toEqual([]);
    expect(DEMO_OFF.hiddenModules).toEqual([]);
  });
});

describe('demoModuleHiddenFor / demoAreaHiddenFor', () => {
  const cfg = parseDemoConfig(DEMO_CONFIG);

  it('hides a listed module, or one in a listed area, from a visitor', () => {
    expect(demoModuleHiddenFor(cfg, 'analyst', 'cv-writer')).toBe(true);
    expect(demoModuleHiddenFor(cfg, 'viewer', 'CV-Writer')).toBe(true);
    expect(demoModuleHiddenFor(cfg, 'analyst', 'clinical-protocol', 'healthcare')).toBe(true);
    expect(demoModuleHiddenFor(cfg, 'analyst', 'x', ['fcp', 'community-health'])).toBe(true);
    expect(demoAreaHiddenFor(cfg, 'analyst', 'healthcare')).toBe(true);
  });

  it('negative controls: an offered module, an admin, and an ordinary server', () => {
    expect(demoModuleHiddenFor(cfg, 'analyst', 'risk-assessment', 'fcp')).toBe(false);
    expect(demoModuleHiddenFor(cfg, 'admin', 'cv-writer', 'healthcare')).toBe(false);
    expect(demoAreaHiddenFor(cfg, 'admin', 'healthcare')).toBe(false);
    expect(demoModuleHiddenFor(DEMO_OFF, 'analyst', 'cv-writer', 'healthcare')).toBe(false);
  });
});

describe('demoCatalogue', () => {
  const cfg = parseDemoConfig(DEMO_CONFIG);
  const healthcareIds = AREAS.find((a) => a.id === 'healthcare')!.moduleIds as readonly string[];

  it('leaves out the hidden areas, their modules and the hidden modules for a visitor', () => {
    const c = demoCatalogue(cfg, 'analyst');
    const ids = new Set<string>(c.modules.map((m) => m.id));
    expect(healthcareIds.length).toBeGreaterThan(0);
    for (const id of [...healthcareIds, 'symptom-assessment', 'cv-writer', 'investigation-support']) expect(ids.has(id), id).toBe(false);
    expect(ids.has('risk-assessment')).toBe(true);
    expect(c.areas.map((a) => a.id)).not.toContain('healthcare');
    expect(c.areas.map((a) => a.id)).not.toContain('community-health');
    expect(c.areas.map((a) => a.id)).toContain('fcp');
    expect(c.moduleHidden('clinical-protocol')).toBe(true); // found through its catalogue area
    expect(c.moduleHidden('trades-module-the-catalogue-lacks', 'healthcare')).toBe(true); // area from a server answer
    expect(c.moduleHidden('risk-assessment')).toBe(false);
  });

  it('negative controls: an admin and an ordinary server get MODULES and AREAS themselves', () => {
    for (const c of [demoCatalogue(cfg, 'admin'), demoCatalogue(DEMO_OFF, 'analyst'), demoCatalogue(parseDemoConfig({ ...DEMO_CONFIG, hiddenAreas: [], hiddenModules: [] }), 'analyst')]) {
      expect(c.modules).toBe(MODULES);
      expect(c.areas).toBe(AREAS);
      expect(c.moduleHidden('cv-writer')).toBe(false);
    }
  });
});

// ── The pages ────────────────────────────────────────────────────────────

let container: HTMLDivElement;
let root: Root;
let calls: Array<{ url: string; method: string }> = [];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function as(who: Who) {
  useDemoStore.setState({ config: DEMO_OFF, loaded: false });
  useDemoStore.getState().applyConfig(who === 'ordinary' ? ORDINARY : DEMO_CONFIG);
  const role = who === 'admin' ? 'admin' : 'analyst';
  useAuthStore.setState({ user: { id: `u-${who}`, username: `user_${who}`, role }, token: 't', isTeamMode: true, isLoading: false });
}

async function fresh(): Promise<void> {
  await act(async () => root.unmount());
  root = createRoot(container);
  calls = [];
}

async function settle(): Promise<void> {
  for (let i = 0; i < 8; i++) await act(async () => { await Promise.resolve(); });
}

async function render(component: ComponentType<object>, path = '/'): Promise<void> {
  await act(async () => {
    root.render(createElement(MemoryRouter, { initialEntries: [path] }, createElement(component)));
  });
  await settle();
}

async function renderModulePage(moduleId: string): Promise<void> {
  await act(async () => {
    root.render(
      createElement(MemoryRouter, { initialEntries: [`/module/${moduleId}`] },
        createElement(Routes, null, createElement(Route, { path: '/module/:moduleId', element: createElement(ModulePage) }))),
    );
  });
  await settle();
}

async function type(el: HTMLInputElement, value: string): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => {
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await settle();
}

const text = () => container.textContent ?? '';
const moduleLinks = () => [...container.querySelectorAll('a')].map((a) => a.getAttribute('href') ?? '').filter((h) => h.startsWith('/module/'));
const label = (id: string) => MODULES.find((m) => m.id === id)!.label;

beforeAll(async () => {
  await i18n.use(initReactI18next).init({ lng: 'en', resources: { en: { translation: {} } }, interpolation: { escapeValue: false } });
});

beforeEach(() => {
  calls = [];
  resetPublicModelConfigCache();
  localStorage.clear();
  sessionStorage.clear();
  window.matchMedia = ((query: string) => ({
    matches: false, media: query, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  Element.prototype.scrollIntoView = () => {};
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    calls.push({ url, method: (init?.method ?? 'GET').toUpperCase() });
    if (url === '/api/config') return json(DEMO_CONFIG);
    if (url.startsWith('/api/modules/risk-assessment/prompt')) return json({ prompt: 'You assist a compliance officer.' });
    if (url.startsWith('/api/modules/risk-assessment')) return json({ id: 'risk-assessment', areaId: 'fcp', guidedInputs: [] });
    if (url.startsWith('/api/modules/cv-writer/prompt')) return json({ prompt: 'You write CVs.' });
    if (url.startsWith('/api/modules/cv-writer')) return json({ id: 'cv-writer', areaId: 'personal-dev', guidedInputs: [] });
    if (url.startsWith('/api/knowledge-packs')) return json({ packs: [] });
    if (url === '/api/collections') return json([]);
    if (url.includes('/custom-modules')) return json([]);
    if (url.startsWith('/api/sessions/stats')) return json({ totalSessions: 0, totalMessages: 0, totalOutputTokens: 0, thisWeekSessions: 0, thisMonthSessions: 0, recentSessions: [], topModules: [] });
    if (url.startsWith('/api/sessions?')) return json([]);
    return json({ error: 'not found' }, 404);
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

describe('Home: the module catalogue', () => {
  const healthcare = AREAS.find((a) => a.id === 'healthcare')!;

  it('shows a visitor no hidden area and finds no hidden module', async () => {
    as('visitor');
    await render(HomeV2 as ComponentType<object>);
    expect(text()).not.toContain(healthcare.label);
    expect(text()).toContain(AREAS.find((a) => a.id === 'fcp')!.label);
    const visible = demoCatalogue(parseDemoConfig(DEMO_CONFIG), 'analyst');
    expect(text()).toContain(`${visible.modules.length} expert modules across ${visible.areas.length} areas`);
    expect(visible.modules.length).toBeLessThan(MODULES.length);

    const search = container.querySelector('input[placeholder^="Search modules"]') as HTMLInputElement;
    await type(search, 'CV & LinkedIn');
    expect(text()).not.toContain(label('cv-writer'));
    await type(search, 'Investigation Support');
    expect(text()).not.toContain(label('investigation-support'));
    await type(search, 'Clinical Protocol');
    expect(text()).not.toContain(label('clinical-protocol'));
  });

  it('negative controls: an admin on the demo and an ordinary server see the whole catalogue', async () => {
    for (const who of ['admin', 'ordinary'] as const) {
      await fresh();
      as(who);
      await render(HomeV2 as ComponentType<object>);
      expect(text(), who).toContain(healthcare.label);
      expect(text(), who).toContain(`${MODULES.length} expert modules across ${AREAS.length} areas`);
      const search = container.querySelector('input[placeholder^="Search modules"]') as HTMLInputElement;
      await type(search, 'CV & LinkedIn');
      expect(text(), who).toContain(label('cv-writer'));
    }
  });
});

describe('Sidebar: the area tree and the module filter', () => {
  const areaToggle = (id: string) => container.querySelector(`[aria-controls="area-modules-${id}"]`);

  it('shows a visitor no hidden area, and the filter finds no hidden module', async () => {
    as('visitor');
    await render(Sidebar as ComponentType<object>);
    expect(areaToggle('healthcare')).toBeNull();
    expect(areaToggle('community-health')).toBeNull();
    expect(areaToggle('fcp')).not.toBeNull();

    await type(container.querySelector('input[aria-label="Filter modules"]') as HTMLInputElement, 'investigation');
    const hrefs = moduleLinks();
    expect(hrefs).not.toContain('/module/investigation-support');
    expect(hrefs).toContain('/module/alert-investigation'); // an offered match still shows
  });

  it('negative controls: an admin on the demo and an ordinary server keep every area and match', async () => {
    for (const who of ['admin', 'ordinary'] as const) {
      await fresh();
      as(who);
      await render(Sidebar as ComponentType<object>);
      expect(areaToggle('healthcare'), who).not.toBeNull();
      await type(container.querySelector('input[aria-label="Filter modules"]') as HTMLInputElement, 'investigation');
      expect(moduleLinks(), who).toContain('/module/investigation-support');
    }
  });
});

describe('a hidden module\'s address', () => {
  it('shows a visitor a short note and loads nothing of the module', async () => {
    as('visitor');
    await renderModulePage('cv-writer');
    expect(text()).toContain('This module is not offered on this demo.');
    expect(text()).not.toContain(label('cv-writer'));
    expect(calls.filter((c) => c.url.includes('/modules/cv-writer'))).toEqual([]);
    expect(container.querySelector('a[href="/"]')?.textContent).toBe('Back to the modules');
  });

  it('shows the note for a module of a hidden area too', async () => {
    as('visitor');
    await renderModulePage('clinical-protocol');
    expect(text()).toContain('This module is not offered on this demo.');
    expect(calls.filter((c) => c.url.includes('/modules/clinical-protocol'))).toEqual([]);
  });

  it('negative control: a module the demo offers opens for a visitor as before', async () => {
    as('visitor');
    await renderModulePage('risk-assessment');
    expect(text()).not.toContain('not offered on this demo');
    expect(calls.some((c) => c.url.startsWith('/api/modules/risk-assessment'))).toBe(true);
  });

  it('negative controls: an admin on the demo and an ordinary server open the module', async () => {
    for (const who of ['admin', 'ordinary'] as const) {
      await fresh();
      as(who);
      await renderModulePage('cv-writer');
      expect(text(), who).not.toContain('not offered on this demo');
      expect(calls.some((c) => c.url.startsWith('/api/modules/cv-writer')), who).toBe(true);
    }
  });
});

describe('Header: the breadcrumb', () => {
  it('does not name a hidden module to a visitor', async () => {
    as('visitor');
    await render(Header as ComponentType<object>, '/module/cv-writer');
    expect(text()).not.toContain(label('cv-writer'));
  });

  it('negative controls: it names an offered module, and names the hidden one to an admin and on an ordinary server', async () => {
    as('visitor');
    await render(Header as ComponentType<object>, '/module/risk-assessment');
    expect(text()).toContain(label('risk-assessment'));
    for (const who of ['admin', 'ordinary'] as const) {
      await fresh();
      as(who);
      await render(Header as ComponentType<object>, '/module/cv-writer');
      expect(text(), who).toContain(label('cv-writer'));
    }
  });
});

describe('the NGO hub and the Life page', () => {
  it('leave out the cards and links that lead to hidden modules for a visitor', async () => {
    as('visitor');
    await render(NGOHubPage as ComponentType<object>, '/ngo');
    expect(text()).not.toContain('Community Health Response');
    expect(text()).not.toContain('Symptom triage');
    expect(text()).toContain('Smallholder Farming Season');

    await fresh();
    as('visitor');
    await render(LifePage as ComponentType<object>, '/life');
    expect(text()).not.toContain('Career & CV');
    expect(text()).toContain('Budget & Savings');
  });

  it('negative controls: an admin on the demo and an ordinary server see them', async () => {
    for (const who of ['admin', 'ordinary'] as const) {
      await fresh();
      as(who);
      await render(NGOHubPage as ComponentType<object>, '/ngo');
      expect(text(), who).toContain('Community Health Response');
      await fresh();
      as(who);
      await render(LifePage as ComponentType<object>, '/life');
      expect(text(), who).toContain('Career & CV');
    }
  });
});
