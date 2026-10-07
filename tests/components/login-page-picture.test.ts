// @vitest-environment jsdom
/**
 * login-page-picture.test.ts — the sign-in page's picture of Anton (owner's
 * ask, 2026-10-07: pictures 3 and up of the character on the left, chosen at
 * random, the sign-in form on the right).
 *
 *   - the picture shown is one of the shipped set, in both widths, with the
 *     alt text "Anton, the AI expert assistant", and every file is shipped;
 *   - the choice follows Math.random across the whole set (first and last);
 *   - the form comes before the picture in the document, so it is first in
 *     reading and tab order;
 *   - the sign-in form still signs in, and still shows a refusal;
 *   - the page keeps its brand, captions and links.
 *
 * Rendered with react-dom in jsdom (no testing library in this repo); fetch is
 * a stub.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement, type ComponentType } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import LoginPage from '../../src/pages/LoginPage';
import { SIGNIN_PICTURES, SIGNIN_PICTURE_ALT, pickSigninPicture } from '../../src/lib/signin-pictures';
import { useDemoStore } from '../../src/stores/useDemoStore';
import { useAuthStore } from '../../src/stores/useAuthStore';
import { DEMO_OFF } from '../../src/lib/demo-config';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const PUBLIC_DIR = path.resolve(__dirname, '../../public');

let container: HTMLDivElement;
let root: Root;
let fetchCalls: Array<{ url: string; method: string; body?: string }> = [];
let loginAnswer: { status: number; body: unknown } = { status: 200, body: {} };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

async function render(): Promise<void> {
  await act(async () => {
    root.render(createElement(MemoryRouter, { initialEntries: ['/'] }, createElement(LoginPage as ComponentType<object>)));
  });
  for (let i = 0; i < 5; i++) await act(async () => { await Promise.resolve(); });
}

/** Sets a React-controlled input's value the way a person typing does. */
async function type(el: HTMLInputElement, value: string): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => {
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function picture(): HTMLImageElement {
  const img = container.querySelector(`img[alt="${SIGNIN_PICTURE_ALT}"]`) as HTMLImageElement | null;
  expect(img).not.toBeNull();
  return img!;
}

beforeEach(() => {
  fetchCalls = [];
  loginAnswer = { status: 200, body: { user: { id: 'u1', username: 'analyst_1', role: 'analyst' }, token: 'tok-1' } };
  localStorage.clear();
  useDemoStore.setState({ config: DEMO_OFF, loaded: false });
  useAuthStore.setState({ user: null, token: null, isTeamMode: true, isLoading: false });
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? 'GET').toUpperCase();
    fetchCalls.push({ url, method, body: typeof init?.body === 'string' ? init.body : undefined });
    if (url === '/api/config') return json({ deploymentMode: 'team', demoMode: false });
    if (url === '/api/auth/login') return json(loginAnswer.body, loginAnswer.status);
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

describe('the shipped set', () => {
  it('is pictures 3 and up of Anton, each in two widths, every file on disk', () => {
    expect(SIGNIN_PICTURES.length).toBeGreaterThanOrEqual(1);
    for (const p of SIGNIN_PICTURES) {
      expect(p.src).toMatch(/^\/characters\/anton\/anton_([3-9]|\d{2,})-1100w\.webp$/);
      expect(p.srcSmall).toBe(p.src.replace('-1100w', '-640w'));
      expect(existsSync(path.join(PUBLIC_DIR, p.src))).toBe(true);
      expect(existsSync(path.join(PUBLIC_DIR, p.srcSmall))).toBe(true);
    }
    // Every shipped file is in the set: none left over, none forgotten.
    const onDisk = readdirSync(path.join(PUBLIC_DIR, 'characters/anton'))
      .filter((f) => /^anton_\d+-(1100|640)w\.webp$/.test(f) && Number(/_(\d+)-/.exec(f)![1]) >= 3)
      .map((f) => `/characters/anton/${f}`)
      .sort();
    const listed = SIGNIN_PICTURES.flatMap((p) => [p.src, p.srcSmall]).sort();
    expect(onDisk).toEqual(listed);
  });

  it('picks across the whole set and never outside it', () => {
    expect(pickSigninPicture(() => 0)).toBe(0);
    expect(pickSigninPicture(() => 0.999999)).toBe(SIGNIN_PICTURES.length - 1);
    expect(pickSigninPicture(() => 1)).toBe(SIGNIN_PICTURES.length - 1);
    for (let i = 0; i < 50; i++) {
      const n = pickSigninPicture();
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(SIGNIN_PICTURES.length);
    }
  });
});

describe('LoginPage picture', () => {
  it('shows one of the shipped pictures, with its narrow width and the alt text', async () => {
    await render();
    const img = picture();
    const shown = SIGNIN_PICTURES.find((p) => img.getAttribute('src') === p.src);
    expect(shown).toBeDefined();
    expect(img.getAttribute('srcset')).toBe(`${shown!.srcSmall} 640w, ${shown!.src} 1100w`);
    expect(img.getAttribute('style')).toBeNull();
  });

  it('follows the random choice: the first and the last picture', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    await render();
    expect(picture().getAttribute('src')).toBe(SIGNIN_PICTURES[0].src);
    await act(async () => root.unmount());

    root = createRoot(container);
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    await render();
    expect(picture().getAttribute('src')).toBe(SIGNIN_PICTURES[SIGNIN_PICTURES.length - 1].src);
  });

  it('puts the form before the picture in the document (reading and tab order)', async () => {
    await render();
    const username = container.querySelector('#username') as HTMLInputElement;
    expect(username).not.toBeNull();
    expect(username.compareDocumentPosition(picture()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Nothing on the picture side can take focus.
    const side = picture().parentElement!;
    expect(side.querySelector('a, button, input, select, textarea, [tabindex]')).toBeNull();
  });

  it('keeps the brand, a caption and the links', async () => {
    await render();
    const text = container.textContent ?? '';
    expect(text).toContain('openEXPERT');
    expect(text).toContain('by openEXPERT');
    expect(text).toContain('AI-powered experts helping the world become a better place.');
    expect(text).toContain('Forgot password?');
    expect(text).toContain('Created by Daniel Bardun');
    expect(container.querySelector('a[href="/about"]')).not.toBeNull();
  });
});

describe('LoginPage sign-in form, unchanged', () => {
  async function signIn() {
    await render();
    await type(container.querySelector('#username') as HTMLInputElement, 'analyst_1');
    await type(container.querySelector('#password') as HTMLInputElement, 'the-password');
    const form = (container.querySelector('#username') as HTMLInputElement).form!;
    await act(async () => { form.requestSubmit(); });
    for (let i = 0; i < 5; i++) await act(async () => { await Promise.resolve(); });
  }

  it('sends the name and password and signs the person in', async () => {
    await signIn();
    const call = fetchCalls.find((c) => c.url === '/api/auth/login');
    expect(call?.method).toBe('POST');
    expect(JSON.parse(call!.body!)).toEqual({ username: 'analyst_1', password: 'the-password' });
    expect(useAuthStore.getState().user?.username).toBe('analyst_1');
  });

  it('shows the server\'s refusal and signs nobody in', async () => {
    loginAnswer = { status: 401, body: { error: 'Invalid username or password' } };
    await signIn();
    expect(container.textContent).toContain('Invalid username or password');
    expect(useAuthStore.getState().user).toBeNull();
  });
});
