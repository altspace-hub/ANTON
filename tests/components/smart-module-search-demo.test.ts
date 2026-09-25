// @vitest-environment jsdom
/**
 * smart-module-search-demo.test.ts — Home's AI module finder on a public demo.
 *
 * Showcase review L14 (2026-09-25): on a demo server (DEMO_MODE=true) a
 * visitor lands on Home, whose "Find the right module" box posts to
 * /api/modules/smart-search. That route is not in the demo allowlist
 * (server/middleware/demo-mode.ts WORK_ROUTES), so every search was answered
 * 404 and the visitor was told to "check Settings → Execution engines" —
 * Settings they cannot open. A visitor is not offered the box; the module
 * catalogue in the sidebar is theirs. Admins, and everyone on an ordinary
 * server, keep it.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import SmartModuleSearch from '../../src/components/shared/SmartModuleSearch';
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
  retentionDays: 30,
  privacyPath: '/privacy',
};

let container: HTMLDivElement;
let root: Root;
let searchAnswer: { status: number; body: unknown } = { status: 200, body: [] };
let searchCalls = 0;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function setServer(config: unknown, role: 'analyst' | 'admin', teamMode = true) {
  useDemoStore.setState({ config: DEMO_OFF, loaded: false });
  useDemoStore.getState().applyConfig(config);
  useAuthStore.setState({
    user: { id: `u-${role}`, username: `user_${role}`, role },
    token: 't',
    isTeamMode: teamMode,
    isLoading: false,
  });
}

async function render(): Promise<void> {
  await act(async () => {
    root.render(createElement(MemoryRouter, null, createElement(SmartModuleSearch)));
  });
}

async function search(text: string): Promise<void> {
  const box = container.querySelector('textarea') as HTMLTextAreaElement;
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
  await act(async () => {
    setter.call(box, text);
    box.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => {
    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });
  for (let i = 0; i < 5; i++) await act(async () => { await Promise.resolve(); });
}

beforeEach(() => {
  searchCalls = 0;
  searchAnswer = { status: 200, body: [] };
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url === '/api/modules/smart-search') {
      searchCalls += 1;
      return json(searchAnswer.body, searchAnswer.status);
    }
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

describe('SmartModuleSearch on a public demo (L14)', () => {
  it('is not offered to a visitor, so no search is sent and no Settings advice shown', async () => {
    setServer(DEMO_CONFIG, 'analyst');
    await render();
    expect(container.textContent).not.toContain('Find the right module');
    expect(container.querySelector('textarea')).toBeNull();
    expect(container.textContent).not.toContain('Settings');
    expect(searchCalls).toBe(0);
  });

  it('stays for an admin on the demo, whom the server does not restrict (negative control)', async () => {
    setServer(DEMO_CONFIG, 'admin');
    searchAnswer = { status: 200, body: [{ moduleId: 'aml-gap-analysis', label: 'AML gap analysis', reason: 'It fits.' }] };
    await render();
    expect(container.textContent).toContain('Find the right module');
    await search('gaps in our AML policy');
    expect(searchCalls).toBe(1);
    expect(container.textContent).toContain('It fits.');
  });

  it('stays for everyone on an ordinary server, with the Settings advice on a failure (negative control)', async () => {
    setServer({ deploymentMode: 'team', demoMode: false }, 'analyst');
    searchAnswer = { status: 503, body: { error: 'no engine' } };
    await render();
    expect(container.textContent).toContain('Find the right module');
    await search('gaps in our AML policy');
    expect(searchCalls).toBe(1);
    expect(container.textContent).toContain('check Settings → Execution engines');
  });
});
