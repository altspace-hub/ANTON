/**
 * about-screen.test.ts — the companion's About screen (AboutScreen), as the
 * desktop About page (src/pages/AboutPage.tsx) sets it out:
 *
 *   - it credits the creator ("Created by Daniel Bardun.") in a paragraph of
 *     its own, under one h1, in a dialog that closes on Esc and on Android
 *     back (the back-stack), before the app's own back logic;
 *   - with an org open on a paired instance it names the models that
 *     instance's /org/:orgId/models answer lists — the org default first,
 *     with its maker — and nothing else; before pairing, without an org, or
 *     when that call fails it speaks generally, as the desktop does for a
 *     server that reports no model;
 *   - it shows the instance it is paired with, and the app's version only
 *     when the installed app reports one (none in a browser);
 *   - its sentences are the desktop page's, word for word (a drift guard
 *     reads src/pages/AboutPage.tsx).
 *
 * Rendered with react-dom in jsdom (no testing library in this repo).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Instance } from '../../services/instances';
import type { ModelList } from '../../services/models';

const state = vi.hoisted(() => ({
  instance: null as unknown,
  native: false,
  info: { name: 'ANTON', id: 'eu.futurechain.anton', version: '1.0.0', build: '1' } as unknown,
  listModels: vi.fn(),
}));

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => state.native, getPlatform: () => 'web' } }));
vi.mock('@capacitor/app', () => ({ App: { getInfo: async () => state.info } }));
vi.mock('../../services/instances', () => ({
  getActiveInstance: () => state.instance,
  getActiveInstanceId: () => (state.instance as Instance | null)?.id ?? null,
  activeAuthHeaders: async () => ({}),
}));
vi.mock('../../services/models', async () => {
  const real = await vi.importActual<typeof import('../../services/models')>('../../services/models');
  return { ...real, listModels: state.listModels };
});

const { default: AboutScreen } = await import('../AboutScreen');
const about = await import('../../services/about');
const { hasBackHandler, popBack } = await import('../../services/back-stack');

const PAIRED: Instance = {
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
};

const MODELS: ModelList = {
  models: [
    { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', provider: 'anthropic', tier: 'fast', description: 'Fastest.' },
    { id: 'claude-sonnet-5', label: 'Claude Sonnet 5', provider: 'anthropic', tier: 'balanced', description: 'Balanced.' },
    { id: 'claude-opus-5-5', label: 'Claude Opus 5.5', provider: 'anthropic', tier: 'top', description: 'Most capable.' },
    { id: 'gpt-4o', label: 'GPT-4o', provider: 'openai', tier: 'balanced', description: 'OpenAI multimodal.' },
  ],
  defaultModel: 'claude-opus-5-5',
};

let container: HTMLDivElement;
let root: Root;
const onClose = vi.fn();

async function settle(): Promise<void> {
  for (let i = 0; i < 6; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}

async function open(orgId: string | null = 'org-1'): Promise<void> {
  await act(async () => { root.render(createElement(AboutScreen, { onClose, orgId })); });
  await settle();
}

const text = () => container.textContent ?? '';

beforeEach(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  state.instance = PAIRED;
  state.native = false;
  state.info = { name: 'ANTON', id: 'eu.futurechain.anton', version: '1.0.0', build: '1' };
  state.listModels.mockResolvedValue(MODELS);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
});

describe('the About screen', () => {
  it('credits the creator in a paragraph of its own, under one h1, in a dialog', async () => {
    await open();
    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog?.getAttribute('aria-label')).toBe('About ANTON');
    const h1s = container.querySelectorAll('h1');
    expect(h1s.length).toBe(1);
    expect(h1s[0].textContent).toBe('About ANTON');
    const credit = [...container.querySelectorAll('p')].find((p) => p.textContent === 'Created by Daniel Bardun.');
    expect(credit, 'the credit is a paragraph of its own').toBeDefined();
    expect(credit!.className).toContain('text-xl');
    expect(text()).toContain(about.ABOUT_WHAT_ANTON_IS);
    expect(container.querySelector('[role="note"]')?.textContent).toBe(
      'Answers are AI-generated and must be checked by a qualified person. They are not legal advice.',
    );
    // No contact details.
    expect(text()).not.toMatch(/@|gmail/i);
  });

  it('names the models the paired instance lists for the open org, its default first, with the maker', async () => {
    await open('org-1');
    expect(state.listModels).toHaveBeenCalledWith('org-1');
    expect(text()).toContain('On Acme ANTON, answers come from these models. You can choose one in the model list before a run.');
    const items = [...container.querySelectorAll('li')].map((li) => li.textContent);
    expect(items).toEqual([
      'Claude Opus 5.5 · defaultMade by Anthropic',
      'Claude Haiku 4.5Made by Anthropic',
      'Claude Sonnet 5Made by Anthropic',
      'GPT-4oMade by OpenAI',
    ]);
    // The general sentence is for an instance that reports no model.
    expect(text()).not.toContain(about.ABOUT_MODELS_GENERAL);
  });

  it('says "this model" for a single one and marks no default the instance did not name', async () => {
    state.listModels.mockResolvedValue({ models: [MODELS.models[3]], defaultModel: 'sdk:claude-opus-5-5' });
    await open('org-1');
    expect(text()).toContain('On Acme ANTON, answers come from this model.');
    expect(text()).not.toContain('You can choose one');
    expect([...container.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['GPT-4oMade by OpenAI']);
  });

  it('shows the instance it is paired with', async () => {
    await open();
    const section = container.querySelector('section[aria-labelledby="about-instance"]');
    expect(section?.textContent).toContain('Paired with');
    expect(section?.textContent).toContain('Acme ANTON');
    expect(section?.textContent).toContain('Acme Advisory · member');
    expect(section?.textContent).toContain('ANTON-AAAA-BBBB-CCCC-DDDD');
  });

  it('before pairing speaks generally, asks nothing and shows no instance', async () => {
    state.instance = null;
    await open(null);
    expect(state.listModels).not.toHaveBeenCalled();
    expect(text()).toContain('Created by Daniel Bardun.');
    expect(text()).toContain(`${about.ABOUT_MODELS_GENERAL} Whoever runs the ANTON you pair with chooses which models it offers`);
    expect(container.querySelector('section[aria-labelledby="about-instance"]')).toBeNull();
    expect(container.querySelectorAll('li').length).toBe(0);
  });

  it('paired but with no org open, it asks nothing and speaks generally', async () => {
    await open(null);
    expect(state.listModels).not.toHaveBeenCalled();
    expect(text()).toContain(`${about.ABOUT_MODELS_GENERAL} Whoever runs this server chooses which models it offers`);
    expect(text()).toContain('Acme ANTON');
  });

  it('when the instance does not answer, it speaks generally rather than naming a model', async () => {
    state.listModels.mockRejectedValue(new Error('HTTP 502'));
    await open('org-1');
    expect(state.listModels).toHaveBeenCalled();
    expect(text()).toContain(about.ABOUT_MODELS_GENERAL);
    expect(container.querySelectorAll('li').length).toBe(0);
    expect(text()).not.toContain('HTTP 502');
  });

  it('shows the version the installed app reports, and none in a browser', async () => {
    state.native = true;
    await open();
    expect(container.querySelector('section[aria-labelledby="about-version"]')?.textContent)
      .toBe('VersionANTON Companion 1.0.0 (build 1)');
    await act(async () => { root.unmount(); });
    root = createRoot(container);

    state.native = false;
    await open();
    expect(container.querySelector('#about-version')).toBeNull();
    expect(text()).not.toMatch(/v?1\.0(\.0)?/);
  });

  it('leaves out a version that is not a version', async () => {
    state.native = true;
    state.info = { version: '<script>', build: '1' };
    await open();
    expect(container.querySelector('#about-version')).toBeNull();
    expect(about.parseAppVersion({ version: '1.0.0', build: '7' })).toEqual({ version: '1.0.0', build: '7' });
    expect(about.parseAppVersion({ version: '1.0.0', build: '<b>' })).toEqual({ version: '1.0.0', build: '' });
    expect(about.parseAppVersion(null)).toBeNull();
  });

  it('closes on Esc and on Android back, and leaves nothing on the back-stack', async () => {
    await open();
    expect(hasBackHandler(), 'open, it sits on the back-stack').toBe(true);
    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(onClose).toHaveBeenCalledTimes(1);
    await act(async () => { popBack(); });
    expect(onClose).toHaveBeenCalledTimes(2);

    await act(async () => { root.unmount(); });
    root = createRoot(container);
    expect(hasBackHandler(), 'closed, it leaves the back-stack').toBe(false);
  });

  it('the header back button closes it', async () => {
    await open();
    const back = container.querySelector<HTMLButtonElement>('button[aria-label="Back"]');
    await act(async () => { back!.click(); });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('the words are the desktop About page’s', () => {
  // JSX source, whitespace collapsed; the desktop writes ’ as &rsquo;.
  const desktop = readFileSync(resolve(__dirname, '../../../pages/AboutPage.tsx'), 'utf8')
    .replace(/\s+/g, ' ')
    .replace(/&rsquo;/g, '’');

  it.each([
    ['the credit', about.ABOUT_CREDIT],
    ['what ANTON is', about.ABOUT_WHAT_ANTON_IS],
    ['the general models sentence', about.ABOUT_MODELS_GENERAL],
    ['the check notice', about.ABOUT_CHECK_NOTICE],
  ])('%s', (_name, sentence) => {
    expect(desktop).toContain(sentence);
  });

  it('and the companion sentence is WelcomePage’s', () => {
    const welcome = readFileSync(resolve(__dirname, '../WelcomePage.tsx'), 'utf8').replace(/\s+/g, ' ');
    expect(welcome).toContain("Connect to your organisation's ANTON instance. Identity stays on this device.");
    expect(about.ABOUT_COMPANION).toContain("to your organisation's ANTON instance. Identity stays on this device.");
  });
});
