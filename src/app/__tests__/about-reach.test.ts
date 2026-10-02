/**
 * about-reach.test.ts — where the About screen opens from, driving the real
 * App through react-dom (the defect a test of AboutScreen alone would miss is
 * the wiring):
 *
 *   - Pro workspace: More menu → "About" tile, and Settings → "About ANTON";
 *     closing it returns to the screen underneath, and the About screen names
 *     the models of the org that is open;
 *   - Standard mode: the "You" tab → "About ANTON";
 *   - before the workspace: the "About ANTON" link on the Welcome and Join
 *     screens, which keep what the person typed underneath, and on the
 *     Connections screen — none of them asks the instance for models.
 *
 * Negative control: the workspace without a tap on About shows no credit.
 * Only the network edge is stubbed (session, connections, models, push,
 * approvals, fetch); the screens, menus and navigation are the real ones.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Instance } from '../services/instances';

const state = vi.hoisted(() => ({
  paired: true,
  listModels: vi.fn(),
}));

const INSTANCE = {
  id: 'inst-1',
  display_name: 'Acme ANTON',
  contact_hash: 'ANTON-AAAA-BBBB-CCCC-DDDD',
  server_base: 'https://anton.acme.test',
  endpoints: {},
  device_id: 'dev-1',
  pubkey_pinned: 'ab',
  cert_fp_pinned: null,
  org: { id: 'org-1', name: 'Acme Advisory', role: 'member' },
  paired_at: '2026-10-01T00:00:00.000Z',
  last_sync_at: null,
  last_status: 'online',
  last_transport: 'wan',
  notification_categories: ['approval'],
  default_voice_language: null,
} satisfies Instance;

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false, getPlatform: () => 'web' } }));
vi.mock('../services/identity', async () => {
  const real = await vi.importActual<typeof import('../services/identity')>('../services/identity');
  return {
    ...real,
    getIdentity: () => (state.paired
      ? { publicKeyHex: '', privateKeyHex: '', contactHash: 'ANTON-1111-2222-3333-4444', displayName: 'Dana', preferredLanguage: 'en' }
      : null),
  };
});
vi.mock('../services/api', async () => {
  const real = await vi.importActual<typeof import('../services/api')>('../services/api');
  return {
    ...real,
    ensureSession: async () => {},
    getSessionToken: () => (state.paired ? 'tok' : null),
    getConnections: async () => [{
      id: 'org-1', name: 'Acme Advisory', org_type: 'consulting', description: null,
      welcome_message: null, role: 'member', joined_at: '2026-10-01T00:00:00.000Z',
    }],
    getLanguages: async () => ({ en: 'English' }),
  };
});
vi.mock('../services/instances', async () => {
  const real = await vi.importActual<typeof import('../services/instances')>('../services/instances');
  return {
    ...real,
    getActiveInstance: () => (state.paired ? INSTANCE : null),
    getActiveInstanceId: () => (state.paired ? INSTANCE.id : null),
    listInstances: () => (state.paired ? [INSTANCE] : []),
    refreshInstanceInfo: async () => ({ updated: false, relays_changed: false }),
    onActiveInstanceChange: () => () => {},
    markSeen: () => {},
    getInstanceSessionToken: async () => 'tok',
    activeAuthHeaders: async () => ({}),
  };
});
vi.mock('../services/models', async () => {
  const real = await vi.importActual<typeof import('../services/models')>('../services/models');
  return { ...real, listModels: state.listModels };
});
vi.mock('../services/push', () => ({
  requestPushPermission: async () => 'unsupported',
  registerPush: async () => ({ ok: false }),
  setNotificationRouter: () => {},
  startNativeNotificationListener: async () => () => {},
}));
vi.mock('../services/checkpoints', async () => {
  const real = await vi.importActual<typeof import('../services/checkpoints')>('../services/checkpoints');
  return { ...real, listPendingCheckpoints: async () => [] };
});

const { default: App } = await import('../App');
const { PersonalizationProvider } = await import('../components/ui/PersonalizationContext');

let container: HTMLDivElement;
let root: Root;

async function settle(): Promise<void> {
  for (let i = 0; i < 10; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}

async function boot(): Promise<void> {
  await act(async () => {
    root.render(createElement(PersonalizationProvider, null, createElement(App)));
  });
  await settle();
}

async function click(el: Element | null | undefined, what: string): Promise<void> {
  expect(el, `${what} is on screen`).toBeTruthy();
  await act(async () => { (el as HTMLElement).click(); });
  await settle();
}

const text = () => container.textContent ?? '';
const buttonSaying = (label: string, scope: ParentNode = container): HTMLButtonElement | undefined =>
  [...scope.querySelectorAll('button')].find((b) => (b.textContent ?? '').trim() === label);
const aboutDialog = () => container.querySelector('[role="dialog"][aria-label="About ANTON"]');

/** From boot to the org workspace: Connections → the org. */
async function openWorkspace(): Promise<void> {
  await boot();
  await click([...container.querySelectorAll('button')].find((b) => b.textContent?.includes('Acme Advisory')), 'the org');
  expect(container.querySelector('nav[aria-label="Primary"]'), 'the workspace tab bar').not.toBeNull();
}

beforeEach(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  state.paired = true;
  state.listModels.mockReset();
  state.listModels.mockResolvedValue({
    models: [{ id: 'claude-opus-5-5', label: 'Claude Opus 5.5', provider: 'anthropic', tier: 'top', description: 'Most capable.' }],
    defaultModel: 'claude-opus-5-5',
  });
  localStorage.clear();
  localStorage.setItem('anton-companion-mode', 'pro');
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
    new Response('{}', { status: 404, headers: { 'Content-Type': 'application/json' } }));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
  vi.restoreAllMocks();
});

describe('the About screen opens from', () => {
  it('the More menu, names the open org’s models, and closes back to the workspace', async () => {
    await openWorkspace();
    // Negative control: nothing credits the creator until About is opened.
    expect(text()).not.toContain('Created by Daniel Bardun.');

    await click(container.querySelector('button[aria-label="More"]'), 'the More tab');
    const sheet = container.querySelector('[role="dialog"]');
    await click(buttonSaying('About', sheet ?? container), 'the More menu’s About tile');

    expect(aboutDialog(), 'the About screen').not.toBeNull();
    expect(text()).toContain('Created by Daniel Bardun.');
    expect(state.listModels).toHaveBeenCalledWith('org-1');
    expect(aboutDialog()?.textContent).toContain('On Acme ANTON, answers come from this model.');
    expect(aboutDialog()?.textContent).toContain('Claude Opus 5.5 · default');
    // The More sheet closed as About opened.
    expect(buttonSaying('Switch Org')).toBeUndefined();

    await click(aboutDialog()?.querySelector('button[aria-label="Back"]'), 'About’s back button');
    expect(aboutDialog()).toBeNull();
    expect(container.querySelector('nav[aria-label="Primary"]'), 'back in the workspace').not.toBeNull();
  });

  it('Settings, and closes back to Settings', async () => {
    await openWorkspace();
    await click(container.querySelector('button[aria-label="More"]'), 'the More tab');
    await click(buttonSaying('Settings', container.querySelector('[role="dialog"]') ?? container), 'the Settings tile');
    expect(container.querySelector('h1')?.textContent).toBe('Settings');

    await click(container.querySelector('button[aria-label="About ANTON"]'), 'Settings’ About entry');
    expect(aboutDialog()).not.toBeNull();
    expect(text()).toContain('Created by Daniel Bardun.');

    await click(aboutDialog()?.querySelector('button[aria-label="Back"]'), 'About’s back button');
    expect(aboutDialog()).toBeNull();
    expect(container.querySelector('h1')?.textContent).toBe('Settings');
  });

  it('the Standard-mode “You” tab', async () => {
    localStorage.setItem('anton-companion-mode', 'standard');
    await openWorkspace();
    await click(container.querySelector('button[aria-label="You"]'), 'the You tab');
    await click(buttonSaying('About ANTONCreated by Daniel Bardun'), 'the You tab’s About row');
    expect(aboutDialog()).not.toBeNull();
    expect(aboutDialog()?.querySelector('h1')?.textContent).toBe('About ANTON');
  });

  it('the Welcome screen before pairing, keeping what was typed underneath', async () => {
    state.paired = false;
    await boot();
    const name = container.querySelector<HTMLInputElement>('input[placeholder="Enter your name"]');
    expect(name, 'the Welcome screen').not.toBeNull();
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(name, 'Dana');
      name!.dispatchEvent(new Event('input', { bubbles: true }));
    });

    await click(buttonSaying('About ANTON'), 'the Welcome screen’s About link');
    expect(aboutDialog()).not.toBeNull();
    expect(text()).toContain('Created by Daniel Bardun.');
    // Not paired: no instance to name, no model asked for.
    expect(aboutDialog()?.textContent).toContain('Whoever runs the ANTON you pair with');
    expect(state.listModels).not.toHaveBeenCalled();

    await click(aboutDialog()?.querySelector('button[aria-label="Back"]'), 'About’s back button');
    expect(aboutDialog()).toBeNull();
    expect(container.querySelector<HTMLInputElement>('input[placeholder="Enter your name"]')?.value).toBe('Dana');
  });

  it('the Join (pairing) screen, keeping a half-typed server address underneath', async () => {
    await boot();
    await click(buttonSaying('Join'), 'the Connections screen’s Join button');
    await click(buttonSaying('Enter manually'), 'the Join screen’s manual entry');
    const server = container.querySelector<HTMLInputElement>('input[placeholder="https://anton.example.com"]');
    expect(server, 'the Join screen').not.toBeNull();
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(server, 'https://anton.acme.test');
      server!.dispatchEvent(new Event('input', { bubbles: true }));
    });

    await click(buttonSaying('About ANTON'), 'the Join screen’s About link');
    expect(aboutDialog()).not.toBeNull();
    expect(text()).toContain('Created by Daniel Bardun.');

    await click(aboutDialog()?.querySelector('button[aria-label="Back"]'), 'About’s back button');
    expect(aboutDialog()).toBeNull();
    expect(container.querySelector<HTMLInputElement>('input[placeholder="https://anton.example.com"]')?.value)
      .toBe('https://anton.acme.test');
  });

  it('the Connections screen, before an org is open, without asking for models', async () => {
    await boot();
    expect(text()).toContain('Your organisations');
    await click(buttonSaying('About ANTON'), 'the Connections screen’s About link');
    expect(aboutDialog()).not.toBeNull();
    expect(aboutDialog()?.textContent).toContain('Acme ANTON');
    expect(state.listModels).not.toHaveBeenCalled();
  });
});
