// @vitest-environment jsdom
/**
 * projects-scaffold-catalogue.test.ts — the Projects page's AI Scaffold on a
 * public demo (2026-10-02).
 *
 * The page sent every catalogue id (MODULES) as the modules the scaffold may
 * recommend, the ones the demo keeps off a visitor included, and showed
 * whatever came back. It now sends the catalogue as this person may see it
 * (useDemoCatalogue) and never shows a hidden module, even if a server
 * answered with one. The server chooses and filters too
 * (tests/routes/project-scaffold-demo.test.ts).
 *
 * Negative control: an admin on the demo sends, and is shown, the whole
 * catalogue. Rendered with react-dom in jsdom; fetch is a stub that records
 * every call.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ProjectsPage from '../../src/pages/ProjectsPage';
import { MODULES } from '../../src/lib/constants';
import { useDemoStore } from '../../src/stores/useDemoStore';
import { useAuthStore } from '../../src/stores/useAuthStore';
import { DEMO_OFF } from '../../src/lib/demo-config';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const HIDDEN = 'credit-risk';
const OPEN = MODULES.find((m) => m.id === 'model-risk-audit-framework') ?? MODULES.find((m) => m.id !== HIDDEN)!;
const HIDDEN_LABEL = MODULES.find((m) => m.id === HIDDEN)?.shortLabel ?? HIDDEN;

const DEMO_CONFIG = {
  deploymentMode: 'team',
  demoMode: true,
  offeredModels: ['compat:openrouter:z-ai/glm-5.3'],
  enabledPillars: ['work'],
  signupOpen: true,
  signupCodeRequired: true,
  retentionDays: 30,
  privacyPath: '/privacy',
  answersScored: false,
  hiddenAreas: ['healthcare'],
  hiddenModules: [HIDDEN],
};

let container: HTMLDivElement;
let root: Root;
let scaffoldBodies: Array<{ availableModuleIds?: string[] }> = [];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function as(who: 'visitor' | 'admin') {
  useDemoStore.setState({ config: DEMO_OFF, loaded: false });
  useDemoStore.getState().applyConfig(DEMO_CONFIG);
  useAuthStore.setState({ user: { id: `u-${who}`, username: who, role: who === 'admin' ? 'admin' : 'analyst' }, token: 't', isTeamMode: true, isLoading: false });
}

async function settle(): Promise<void> {
  for (let i = 0; i < 10; i++) await act(async () => { await Promise.resolve(); });
}

function button(label: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === label) as HTMLButtonElement | undefined;
}

async function click(el: HTMLElement | undefined): Promise<void> {
  if (!el) throw new Error('nothing to click');
  await act(async () => { el.click(); });
  await settle();
}

async function scaffold(): Promise<void> {
  await act(async () => {
    root.render(createElement(MemoryRouter, null, createElement(ProjectsPage)));
  });
  await settle();
  await click(button('New Project'));
  const name = container.querySelector('input[placeholder="Project name"]') as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => {
    setter.call(name, 'Credit risk review');
    name.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await click(button('AI Scaffold'));
}

beforeAll(async () => {
  await i18n.use(initReactI18next).init({ lng: 'en', resources: { en: { translation: {} } }, interpolation: { escapeValue: false } });
});

beforeEach(() => {
  scaffoldBodies = [];
  localStorage.clear();
  window.matchMedia = ((query: string) => ({
    matches: false, media: query, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url === '/api/config') return json(DEMO_CONFIG);
    if (url === '/api/projects') return json([]);
    if (url === '/api/ai-assist/project-scaffold') {
      scaffoldBodies.push(JSON.parse(String(init?.body ?? '{}')) as { availableModuleIds?: string[] });
      // A server that answered with a hidden module (an older one, or a bug).
      return json({
        description: 'A review.',
        recommendedModules: [{ id: HIDDEN, reason: 'Credit.' }, { id: OPEN.id, reason: 'Open.' }],
        suggestedDeadlines: [], phases: [], successCriteria: [],
      });
    }
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

describe('Projects › AI Scaffold on a public demo', () => {
  it('a visitor\'s page sends the demo catalogue and never shows a hidden module', async () => {
    as('visitor');
    await scaffold();
    expect(scaffoldBodies).toHaveLength(1);
    const sent = scaffoldBodies[0].availableModuleIds ?? [];
    expect(sent).not.toContain(HIDDEN);
    expect(sent).toContain(OPEN.id);
    expect(container.textContent).toContain('Recommended modules');
    expect(container.textContent).toContain(OPEN.shortLabel);
    expect([...container.querySelectorAll('span[title]')].map((s) => s.textContent)).not.toContain(HIDDEN_LABEL);
  });

  it('negative control: an admin sends and sees the whole catalogue', async () => {
    as('admin');
    await scaffold();
    const sent = scaffoldBodies[0].availableModuleIds ?? [];
    expect(sent).toHaveLength(MODULES.length);
    expect(sent).toContain(HIDDEN);
    expect([...container.querySelectorAll('span[title]')].map((s) => s.textContent)).toContain(HIDDEN_LABEL);
  });
});
