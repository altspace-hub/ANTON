// @vitest-environment jsdom
/**
 * demo-intel-radar-exchange-pages.test.ts — Orchestration, Intelligence,
 * Horizon Radar and Exchange as a public-demo visitor sees them
 * (DEMO_MODE=true, 2026-10-02), rendered with react-dom in jsdom; fetch is a
 * stub that records every call.
 *
 * A visitor gets read-only pages over what the server opens to them:
 *   - Orchestration: their sessions, insights and profiles; no trigger fetch
 *     or card, and no links to pages closed on the demo;
 *   - Intelligence: no pattern, A/B or memory-injection calls or controls, no
 *     Intelligence Brief, and a plain note that learning is off; the
 *     Institutional Memory tab says so without asking the server;
 *   - Radar: the feed, with no scan, source, settings or triage controls, no
 *     settings call, and no "Analyse in" link to a module kept off the demo;
 *   - Exchange: their own modules only, no Import tab, no signing-identity
 *     call, and the export asks for an unsigned bundle.
 * The Radar's Sources tab now asks for activeOnly=false (it sent active=false,
 * which the server ignored), for everyone.
 *
 * Negative control in every block: the demo's admin keeps every control.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement, type ComponentType } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import RadarPage from '../../src/pages/RadarPage';
import ExchangePage from '../../src/pages/ExchangePage';
import IntelligenceDashboard from '../../src/pages/IntelligenceDashboard';
import OrchestrationDashboard from '../../src/pages/OrchestrationDashboard';
import { useDemoStore } from '../../src/stores/useDemoStore';
import { useAuthStore } from '../../src/stores/useAuthStore';
import { DEMO_OFF } from '../../src/lib/demo-config';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const DEMO_CONFIG = {
  deploymentMode: 'team',
  demoMode: true,
  offeredModels: ['compat:openrouter:z-ai/glm-5.3'],
  defaultModel: 'compat:openrouter:z-ai/glm-5.3',
  enabledPillars: ['work'],
  signupOpen: true,
  signupCodeRequired: true,
  retentionDays: 30,
  privacyPath: '/privacy',
  hiddenAreas: ['healthcare'],
  hiddenModules: ['investigation-support'],
};

type Who = 'visitor' | 'admin';

let container: HTMLDivElement;
let root: Root;
let calls: Array<{ url: string; method: string; body?: string }> = [];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function as(who: Who): void {
  useDemoStore.setState({ config: DEMO_OFF, loaded: false });
  useDemoStore.getState().applyConfig(DEMO_CONFIG);
  useAuthStore.setState({ user: { id: `u-${who}`, username: `user_${who}`, role: who === 'admin' ? 'admin' : 'analyst' }, token: 't', isTeamMode: true, isLoading: false });
}

async function settle(rounds = 12): Promise<void> {
  for (let i = 0; i < rounds; i++) await act(async () => { await Promise.resolve(); });
}

async function render(component: ComponentType<object>): Promise<void> {
  await act(async () => {
    root.render(createElement(MemoryRouter, null, createElement(component)));
  });
  await settle();
}

const text = () => container.textContent ?? '';
const called = (fragment: string) => calls.some((c) => c.url.includes(fragment));
const links = () => [...container.querySelectorAll('a')].map((a) => a.getAttribute('href') ?? '');

function button(label: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll('button')].find(
    (b) => b.textContent?.trim() === label || b.getAttribute('aria-label') === label || b.title === label,
  ) as HTMLButtonElement | undefined;
}

async function click(el: HTMLElement | undefined): Promise<void> {
  if (!el) throw new Error('nothing to click');
  await act(async () => { el.click(); });
  await settle();
}

const RADAR_ITEMS = [
  { id: 'ri_1', source_id: 's1', source_name: 'EBA', source_type: 'rss', title: 'EBA final guidelines on ML/TF risk factors', summary: 's', ai_summary: null, url: null, published_at: null, item_type: 'guideline', status: 'new', relevance_score: 0.8, urgency_score: 0.5, impact_areas: '[]', tags: '[]', category: 'regulatory', subcategory: null },
  { id: 'ri_2', source_id: 's1', source_name: 'EBA', source_type: 'rss', title: 'EBA fines a payment institution', summary: 's', ai_summary: null, url: null, published_at: null, item_type: 'enforcement', status: 'new', relevance_score: 0.6, urgency_score: 0.5, impact_areas: '[]', tags: '[]', category: 'regulatory', subcategory: null },
];

beforeAll(async () => {
  await i18n.use(initReactI18next).init({ lng: 'en', resources: { en: { translation: {} } }, interpolation: { escapeValue: false } });
});

beforeEach(() => {
  calls = [];
  localStorage.clear();
  sessionStorage.clear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  URL.createObjectURL = (() => 'blob:anton') as typeof URL.createObjectURL;
  URL.revokeObjectURL = (() => undefined) as typeof URL.revokeObjectURL;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? 'GET').toUpperCase();
    const body = typeof init?.body === 'string' ? init.body : undefined;
    calls.push({ url, method, body });
    if (url === '/api/csrf-token') return json({ csrfToken: 'csrf' });
    // Radar
    if (url === '/api/radar/summary') return json({ newItems: 2, highRelevance: 1, consultationsOpen: 0, recentHighRelevance: [], categoryCounts: [] });
    if (url.startsWith('/api/radar/items')) return json(RADAR_ITEMS);
    if (url.startsWith('/api/radar/sources')) return json([{ id: 's1', display_name: 'EBA', url: 'https://eba.europa.eu/rss', source_type: 'rss', is_active: 1, areas: '[]', keywords: '[]', category: 'regulatory' }]);
    if (url === '/api/radar/scan-status') return json({ scanInProgress: false, lastScanTime: null, lastScanResult: null });
    if (url === '/api/radar/settings') return json({ autoScanEnabled: false, autoScanIntervalHours: 24 });
    // Exchange
    if (url === '/api/custom-modules' && method === 'GET') return json([{ id: 'm0', name: 'My checker', description: '', config: {}, area: 'my-modules' }]);
    if (url === '/api/exchange/signing-identity') return json({ available: true, signer_name: 'ANTON Showcase' });
    if (url.startsWith('/api/exchange/export/')) return new Response(new Blob(['PK']), { status: 200 });
    // Intelligence
    if (url === '/api/intelligence/summary') return json({ totalAtoms: 0, totalEntities: 0, totalPatterns: 3, criticalPatterns: 1, recentAtoms: [], topEntities: [] });
    if (url.startsWith('/api/intelligence/distribution')) return json({});
    if (url.startsWith('/api/intelligence/top-entities')) return json([]);
    if (url.startsWith('/api/intelligence/temporal/')) return json([]);
    if (url.startsWith('/api/knowledge-graph/entities')) return json([]);
    if (url.startsWith('/api/patterns')) return json({ patterns: [] });
    if (url === '/api/intelligence/atom-ab') return json({ enabled: true, minPerArm: 30, sufficient: false, arms: { injected: { runs: 0, scored: 0, meanQuality: null }, holdout: { runs: 0, scored: 0, meanQuality: null } }, delta: null });
    // Orchestration
    if (url === '/api/org-context') return json({ context: { org_name: 'Acme', org_type: null, jurisdiction: 'SE', regulatory_perimeter: [], current_priorities: [], risk_appetite: null } });
    if (url.startsWith('/api/insights')) return json({ insights: [], count: 0 });
    if (url === '/api/continuity/profiles') return json({ profiles: [] });
    if (url === '/api/triggers/metrics/summary') return json({ summary: [] });
    if (url.startsWith('/api/sessions')) return json([]);
    return json({ error: 'not found' }, 404);
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe('Horizon Radar', () => {
  it('a visitor reads the feed: no scan, source, settings or triage controls, and no link to a hidden module', async () => {
    as('visitor');
    await render(RadarPage);
    expect(text()).toContain('EBA final guidelines on ML/TF risk factors');
    for (const label of ['Scan Now', 'Add Manual Item', 'Add Source', 'Mark Reviewed', 'Action Required', 'Dismiss']) {
      expect(button(label), label).toBeUndefined();
    }
    expect(called('/api/radar/settings')).toBe(false);
    expect(button('Analyse in Gap Analysis →')).toBeDefined();
    expect(button('Analyse in Investigation Support →')).toBeUndefined();
    expect(calls.filter((c) => c.method !== 'GET')).toEqual([]);

    await click(button('Sources (1)'));
    expect(button('Edit source')).toBeUndefined();
    expect(button('Delete source')).toBeUndefined();
  });

  it('the Sources tab asks for the inactive sources too (activeOnly=false)', async () => {
    as('visitor');
    await render(RadarPage);
    expect(called('/api/radar/sources?activeOnly=false')).toBe(true);
    expect(calls.some((c) => /[?&]active=false(&|$)/.test(c.url))).toBe(false);
  });

  it('negative control: the demo\'s admin keeps every control', async () => {
    as('admin');
    await render(RadarPage);
    for (const label of ['Scan Now', 'Add Manual Item', 'Add Source', 'Mark Reviewed', 'Dismiss']) {
      expect(button(label), label).toBeDefined();
    }
    expect(called('/api/radar/settings')).toBe(true);
    expect(button('Analyse in Investigation Support →')).toBeDefined();
  });
});

describe('Exchange', () => {
  it('a visitor downloads their own module, unsigned, and has no Import tab', async () => {
    as('visitor');
    await render(ExchangePage);
    expect(button('Import')).toBeUndefined();
    expect(called('/api/exchange/signing-identity')).toBe(false);
    expect(text()).toContain('Exports from this demo are unsigned');
    expect(text()).not.toContain('Author Name');

    const select = container.querySelector('select') as HTMLSelectElement;
    const values = [...select.options].map((o) => o.value);
    expect(values).toEqual(['', 'custom:m0']);

    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!;
    await act(async () => {
      setter.call(select, 'custom:m0');
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await click(button('Export .anton'));
    const exp = calls.find((c) => c.url.startsWith('/api/exchange/export/'));
    expect(exp?.url).toBe('/api/exchange/export/m0?type=custom');
    expect(JSON.parse(exp?.body ?? '{}')).toEqual({ sign: false });
  });

  it('negative control: the demo\'s admin has Import, built-in modules and the signing toggle', async () => {
    as('admin');
    await render(ExchangePage);
    expect(button('Import')).toBeDefined();
    expect(called('/api/exchange/signing-identity')).toBe(true);
    expect(text()).toContain('Sign this bundle');
    const select = container.querySelector('select') as HTMLSelectElement;
    expect(select.options.length).toBeGreaterThan(2);
  });
});

describe('Intelligence dashboard', () => {
  const OPERATOR_CALLS = ['/api/patterns', '/api/intelligence/atom-ab', '/api/intelligence/coding-atom-ab', '/api/intelligence/atom-injection', '/api/intelligence/temporal/patterns-per-week'];

  it('a visitor sees a note that learning is off, and none of the operator\'s calls or controls', async () => {
    as('visitor');
    await render(IntelligenceDashboard);
    expect(text()).toContain('Learning is switched off on this demo');
    for (const path of OPERATOR_CALLS) expect(called(path), path).toBe(false);
    expect(text()).not.toContain('Active Patterns');
    expect(text()).not.toContain('Intelligence Brief');
    expect(text()).toContain('There are no knowledge atoms to analyse: learning is switched off on this demo.');
    expect(calls.filter((c) => c.method !== 'GET')).toEqual([]);

    await click(button('Institutional Memory'));
    expect(text()).toContain('Institutional memory is empty on this demo.');
    expect(called('/api/memory/')).toBe(false);
  });

  it('negative control: the demo\'s admin gets the patterns, the experiments and the brief', async () => {
    as('admin');
    await render(IntelligenceDashboard);
    for (const path of ['/api/patterns', '/api/intelligence/atom-ab', '/api/intelligence/temporal/patterns-per-week']) {
      expect(called(path), path).toBe(true);
    }
    expect(text()).toContain('Active Patterns');
    expect(text()).toContain('Intelligence Brief');
    expect(text()).not.toContain('Learning is switched off on this demo');
  });
});

describe('Orchestration dashboard', () => {
  const CLOSED = ['/settings/org-context', '/continuity', '/workflows/triggers', '/insights', '/workflows'];

  it('a visitor sees their own work and the org context, with no triggers and no links to closed pages', async () => {
    as('visitor');
    await render(OrchestrationDashboard);
    expect(called('/api/triggers/')).toBe(false);
    expect(text()).not.toContain('Event Triggers');
    expect(text()).toContain('Acme');
    for (const href of CLOSED) expect(links(), href).not.toContain(href);
    expect(links()).toContain('/my-work');
    expect(links()).toContain('/prompt');
  });

  it('negative control: the demo\'s admin gets the triggers and every link', async () => {
    as('admin');
    await render(OrchestrationDashboard);
    expect(called('/api/triggers/metrics/summary')).toBe(true);
    expect(text()).toContain('Event Triggers');
    for (const href of CLOSED) expect(links(), href).toContain(href);
  });
});
