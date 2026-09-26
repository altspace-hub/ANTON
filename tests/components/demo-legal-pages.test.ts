// @vitest-environment jsdom
/**
 * demo-legal-pages.test.ts — the public demo's privacy notice, demo terms,
 * banner and sign-up, as a visitor sees them (DEMO_MODE=true; privacy review
 * G7, G10, D1):
 *
 *   - /terms is a public page like /privacy: it renders before the sign-in
 *     check, and states its version;
 *   - both texts show the retention period from the server, the controller's
 *     name from DEMO_OPERATOR_NAME, the owner's missing facts as highlighted
 *     [[NAME]], and a DRAFT box that names what is left;
 *   - the notice keeps its summary box and its right-to-object box apart,
 *     and every section can be linked to (#section-5);
 *   - the banner discloses the AI and where the text goes, and links both;
 *   - sign-up tells the visitor what happens before they give anything, and
 *     needs both ticks (18 or over; terms and notice), links both texts, and
 *     shows the server's own sentence when it refuses a tick or an old terms
 *     version;
 *   - the footer of a demo names its operator, not the software's authors.
 *
 * Negative controls: an ordinary server shows no banner, no sign-up and its
 * usual footer; a signed-out visitor at / still gets the login page.
 * Rendered with react-dom in jsdom; fetch is a stub.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement, type ComponentType } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import App from '../../src/App';
import DemoBanner from '../../src/components/shared/DemoBanner';
import LoginPage from '../../src/pages/LoginPage';
import PrivacyNoticePage from '../../src/pages/PrivacyNoticePage';
import DemoTermsPage from '../../src/pages/DemoTermsPage';
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
  termsPath: '/terms',
  termsVersion: '2026-09-26',
  operatorName: '',
};
const ORDINARY = { deploymentMode: 'team', demoMode: false };

let container: HTMLDivElement;
let root: Root;
let fetchCalls: Array<{ url: string; method: string; body?: string }> = [];
let signupAnswer: { status: number; body: unknown } = { status: 201, body: {} };
let configAnswer: unknown = DEMO_CONFIG;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

async function settle(): Promise<void> {
  for (let i = 0; i < 10; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}

async function render(component: ComponentType<object>, path = '/'): Promise<void> {
  await act(async () => {
    root.render(createElement(MemoryRouter, { initialEntries: [path] }, createElement(component)));
  });
  await settle();
}

function setDemo(config: unknown) {
  configAnswer = config;
  useDemoStore.setState({ config: DEMO_OFF, loaded: false });
  useDemoStore.getState().applyConfig(config);
  useAuthStore.setState({ user: null, token: null, isTeamMode: true, isLoading: false });
}

const text = () => container.textContent ?? '';
const hrefs = () => [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'));

async function type(el: HTMLInputElement, value: string): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => {
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

beforeEach(() => {
  fetchCalls = [];
  configAnswer = DEMO_CONFIG;
  signupAnswer = { status: 201, body: {} };
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem('openexpert-tour-completed', 'true');
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
    if (url === '/api/auth/me') return json({}, 401);
    if (url === '/api/auth/demo-signup') return json(signupAnswer.body, signupAnswer.status);
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

// ── /terms and /privacy ─────────────────────────────────────────────────

describe('the demo terms page', () => {
  it('renders the terms with their version, the retention period and a DRAFT box', async () => {
    setDemo(DEMO_CONFIG);
    await render(DemoTermsPage as ComponentType<object>, '/terms');
    expect(container.querySelector('h1')?.textContent).toBe('Demo terms: ANTON public demo');
    expect(text()).toContain('Version: 2026-09-26');
    expect(text()).toContain('You must be 18 or over.');
    expect(text()).toContain('Your account stops working 21 days after you sign up.');
    expect(text()).toContain('DRAFT: these demo terms are not yet in force.');
    expect(text()).toContain('Have counsel review and sign off these demo terms.');
    expect(hrefs()).toContain('/privacy');
  });

  it('is reachable at /terms without signing in, as /privacy is', async () => {
    setDemo(DEMO_CONFIG);
    useAuthStore.setState({ isLoading: true });
    await render(App as ComponentType<object>, '/terms');
    expect(container.querySelector('h1')?.textContent).toBe('Demo terms: ANTON public demo');
    expect(container.querySelector('#su-username, #username')).toBeNull();
  });

  it('negative control: a signed-out visitor at / gets the login page, not the terms', async () => {
    setDemo(DEMO_CONFIG);
    useAuthStore.setState({ isLoading: true });
    await render(App as ComponentType<object>, '/');
    expect(container.querySelector('#username')).not.toBeNull();
    expect(text()).not.toContain('Demo terms: ANTON public demo');
  });
});

describe('the privacy notice page', () => {
  it('puts the summary first, keeps the right to object in its own box, and links each section', async () => {
    setDemo(DEMO_CONFIG);
    await render(PrivacyNoticePage as ComponentType<object>, '/privacy');
    const h1 = container.querySelector('h1');
    expect(h1?.textContent).toBe('Privacy notice: ANTON public demo');
    // The summary box comes before section 1.
    const summary = [...container.querySelectorAll('h3')].find((h) => h.textContent === 'The short version');
    const section1 = container.querySelector('#section-1');
    expect(summary).toBeDefined();
    expect(summary!.compareDocumentPosition(section1!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Sections 1–19 can be linked to; section 5 sits in a box of its own.
    for (let n = 1; n <= 19; n++) expect(container.querySelector(`#section-${n}`), `section ${n}`).not.toBeNull();
    expect(container.querySelector('#section-6-2')?.textContent).toContain('What OpenRouter and Inceptron promise');
    const objectBox = container.querySelector('#section-5')!.parentElement!;
    expect(objectBox.className).toContain('border-2');
    expect(objectBox.textContent).toContain('you may object at any time');
    expect(objectBox.contains(section1)).toBe(false);
  });

  it('fills the retention period, marks the owner\'s missing facts and names them in the DRAFT box', async () => {
    setDemo(DEMO_CONFIG);
    await render(PrivacyNoticePage as ComponentType<object>, '/privacy');
    expect(text()).toContain('your account stops working 21 days after sign-up');
    expect(text()).not.toContain('[[ACCOUNT_TTL_DAYS]]');
    const marks = [...container.querySelectorAll('main mark')].map((m) => m.textContent);
    expect(marks).toContain('[[CONTROLLER_NAME]]');
    expect(marks).toContain('[[PRIVACY_EMAIL]]');
    const draft = container.querySelector('[role="alert"]')!;
    expect(draft.textContent).toContain('DRAFT: this privacy notice is not yet in force.');
    expect(draft.textContent).toContain('CONTROLLER_NAME');
    expect(draft.textContent).toContain('NGINX_LOG_SENTENCE');
    expect(draft.textContent).not.toContain('ACCOUNT_TTL_DAYS');
    // The old draft's statements the code contradicts are gone.
    expect(text()).not.toContain('cross-site request forgery');
  });

  it('takes the controller\'s name from DEMO_OPERATOR_NAME', async () => {
    setDemo({ ...DEMO_CONFIG, operatorName: 'Example Consulting AB' });
    await render(PrivacyNoticePage as ComponentType<object>, '/privacy');
    expect(text()).toContain('Example Consulting AB runs this demo.');
    expect(text()).not.toContain('[[CONTROLLER_NAME]]');
    expect(container.querySelector('[role="alert"]')!.textContent).not.toContain('CONTROLLER_NAME');
  });

  it('opens other sites\' links in a new tab and hides the empty header of the controller table', async () => {
    setDemo(DEMO_CONFIG);
    await render(PrivacyNoticePage as ComponentType<object>, '/privacy');
    const openrouter = [...container.querySelectorAll('a')].find((a) => a.getAttribute('href') === 'https://openrouter.ai/privacy');
    expect(openrouter?.getAttribute('target')).toBe('_blank');
    expect(openrouter?.getAttribute('rel')).toBe('noopener noreferrer');
    const controllerTable = container.querySelector('#section-1')!.nextElementSibling!.nextElementSibling!;
    expect(controllerTable.textContent).toContain('Organisation number');
    expect(controllerTable.querySelector('thead')).toBeNull();
  });
});

// ── The banner ──────────────────────────────────────────────────────────

describe('DemoBanner', () => {
  it('discloses the AI and where the text goes, and links the notice and the terms', async () => {
    setDemo(DEMO_CONFIG);
    await render(DemoBanner as ComponentType<object>);
    expect(text()).toBe(
      "Demo: answers are generated by AI (GLM 5.3 Flash, via OpenRouter, USA) and can be wrong. Don't enter personal or client data. "
      + 'Accounts expire after 21 days and are then deleted. Privacy notice · Terms',
    );
    expect(hrefs()).toEqual(['/privacy', '/terms']);
    expect(container.querySelector('button')).toBeNull(); // nothing to dismiss it with
  });
});

// ── Sign-up ─────────────────────────────────────────────────────────────

describe('LoginPage sign-up on a demo', () => {
  async function openSignup(config: unknown = DEMO_CONFIG) {
    setDemo(config);
    await render(LoginPage as ComponentType<object>);
    const tab = [...container.querySelectorAll('[role="tab"]')].find((t) => t.textContent === 'Create a demo account') as HTMLButtonElement;
    await act(async () => { tab.click(); });
  }

  async function fill() {
    await type(container.querySelector('#su-username') as HTMLInputElement, 'visitor_7');
    await type(container.querySelector('#su-password') as HTMLInputElement, 'a-long-enough-pass');
    await type(container.querySelector('#su-code') as HTMLInputElement, 'the-code');
  }

  async function tick(id: string) {
    await act(async () => { (container.querySelector(id) as HTMLInputElement).click(); });
  }

  async function submit() {
    const form = container.querySelector('form[aria-label="Create a demo account"]') as HTMLFormElement;
    await act(async () => { form.requestSubmit(); });
    await settle();
  }

  const submitButton = () => [...container.querySelectorAll('button[type="submit"]')].find((b) => b.textContent?.includes('Create account')) as HTMLButtonElement;
  const signupPosts = () => fetchCalls.filter((c) => c.url === '/api/auth/demo-signup');

  it('tells the visitor what happens before they give anything', async () => {
    await openSignup();
    const form = container.querySelector('form[aria-label="Create a demo account"]')!;
    const intro = form.textContent ?? '';
    expect(intro).toContain('Before you start, please read this:');
    expect(intro).toContain('You need only an invite code, a username and a password.');
    expect(intro).toContain('no personal identity numbers (personnummer)');
    expect(intro).toContain('sent to OpenRouter, Inc. (USA). It is answered by the AI model GLM 5.3 Flash, which Inceptron AB runs in the EU/EEA.');
    expect(intro).toContain('Your account stops working 21 days after you sign up.');
    expect(intro).toContain('Your right to object:');
    expect([...form.querySelectorAll('a')].map((a) => a.getAttribute('href'))).toContain('/privacy#section-5');
    // The intro comes before the first field.
    const firstField = form.querySelector('#su-username')!;
    expect(form.firstElementChild!.compareDocumentPosition(firstField) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('needs both ticks, and links the terms and the notice in a new tab', async () => {
    await openSignup();
    await fill();
    expect(submitButton().disabled).toBe(true);

    const termsLabel = container.querySelector('#su-accept-terms')!.closest('label')!;
    expect(termsLabel.textContent).toBe('I accept the demo terms and have read the privacy notice.');
    const links = [...termsLabel.querySelectorAll('a')];
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/terms', '/privacy']);
    for (const a of links) expect(a.getAttribute('target')).toBe('_blank');
    expect(container.querySelector('#su-over18')!.closest('label')!.textContent).toBe('I am 18 or over.');

    // Only the terms ticked: refused before anything is sent.
    await tick('#su-accept-terms');
    expect(submitButton().disabled).toBe(true);
    await submit();
    expect(text()).toContain('Please confirm that you are 18 or over.');
    expect(signupPosts()).toHaveLength(0);

    // Only 18+ ticked.
    await tick('#su-accept-terms');
    await tick('#su-over18');
    await submit();
    expect(text()).toContain('Please accept the demo terms and confirm that you have read the privacy notice.');
    expect(signupPosts()).toHaveLength(0);

    // Both: sent with the version of the terms this page shows.
    await tick('#su-accept-terms');
    expect(submitButton().disabled).toBe(false);
    await submit();
    expect(signupPosts()).toHaveLength(1);
    const body = JSON.parse(signupPosts()[0].body!) as Record<string, unknown>;
    expect(body).toMatchObject({ over18: true, acceptTerms: true, termsVersion: '2026-09-26' });
  });

  it('shows the server\'s own sentence when it refuses the terms version', async () => {
    signupAnswer = {
      status: 400,
      body: { error: 'The demo terms have changed since this page was loaded. Please reload the page, read the terms and try again.' },
    };
    await openSignup();
    await fill();
    await tick('#su-over18');
    await tick('#su-accept-terms');
    await submit();
    expect(text()).toContain('The demo terms have changed since this page was loaded.');
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('negative control: a 400 with a field list still reads as before', async () => {
    signupAnswer = { status: 400, body: { error: 'Invalid request body', details: { password: ['too short'] } } };
    await openSignup();
    await fill();
    await tick('#su-over18');
    await tick('#su-accept-terms');
    await submit();
    expect(text()).toContain('Use a password of at least 12 characters.');
    expect(text()).not.toContain('Invalid request body');
  });
});

// ── The footer ──────────────────────────────────────────────────────────

describe('LoginPage footer', () => {
  it('on a demo names the operator and links the notice and the terms, not the software\'s authors', async () => {
    setDemo({ ...DEMO_CONFIG, operatorName: 'Example Consulting AB' });
    await render(LoginPage as ComponentType<object>);
    expect(text()).toContain('Operated by Example Consulting AB · Privacy notice · Demo terms');
    expect(text()).not.toContain('Created by Daniel Bardun');
    expect(text()).not.toContain('FutureChain');
    expect(hrefs()).toContain('/terms');
  });

  it('on a demo without DEMO_OPERATOR_NAME shows no "Operated by" line', async () => {
    setDemo(DEMO_CONFIG);
    await render(LoginPage as ComponentType<object>);
    expect(text()).not.toContain('Operated by');
    expect(text()).not.toContain('Created by Daniel Bardun');
    expect(text()).toContain('Privacy notice · Demo terms');
  });

  it('negative control: an ordinary server keeps its footer, with no demo links or banner', async () => {
    setDemo(ORDINARY);
    await render(LoginPage as ComponentType<object>);
    expect(text()).toContain('Created by Daniel Bardun & FutureChain');
    expect(text()).not.toContain('Demo terms');
    expect(text()).not.toContain('answers are generated by AI');
    expect(container.querySelector('[role="tab"]')).toBeNull();
  });
});
