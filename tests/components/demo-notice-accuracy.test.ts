// @vitest-environment jsdom
/**
 * demo-notice-accuracy.test.ts — sentences of the public demo's privacy
 * notice (/privacy) and sign-up box that the privacy verification of
 * 2026-09-26 found out of step with the code, held to what the code does:
 *
 *   6. A session a visitor deletes: on the demo, deleteSessionRows (with
 *      allSessionRows) removes its output-store copy, ratings, scores and
 *      feedback at once — they do not wait for the account to go.
 *   7. Sign-in and sign-up records (routes/auth.ts): a failed sign-up records
 *      no username; a failed sign-in for a name no account has stores a keyed
 *      tag of it in the security event, not the name.
 *      (tests/routes/demo-notice-signin-records.db.test.ts checks the code.)
 *   9. "Two more requests" holds for the demo's standard setting
 *      (DEMO_POST_ANSWER_CALLS=conclusion); the operator's setting can add the
 *      quality score and the structured extraction.
 *  10. The session summary that comes back when a visitor returns to a
 *      session is the one stored text added to their prompts; the memory
 *      sentence no longer says "no stored memory" without it.
 *  12. The right to object on the sign-up form names every purpose that
 *      rests on legitimate interests (notice section 5), purpose 7 included.
 *
 * Every other sentence is left as it was; a negative control keeps the
 * texts that were right.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import LoginPage from '../../src/pages/LoginPage';
import { PRIVACY_NOTICE_MD } from '../../src/pages/PrivacyNoticePage';
import { useDemoStore } from '../../src/stores/useDemoStore';
import { useAuthStore } from '../../src/stores/useAuthStore';
import { DEMO_OFF } from '../../src/lib/demo-config';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** One row of a Markdown table, found by its first cell. */
function tableRow(firstCell: string): string {
  const row = PRIVACY_NOTICE_MD.split('\n').find((l) => l.startsWith(`| ${firstCell} |`));
  if (!row) throw new Error(`no row "${firstCell}"`);
  return row;
}

/** A numbered section (## N. … or ### N.N …, also inside a quote box) up to the next heading. */
function section(n: string): string {
  const start = PRIVACY_NOTICE_MD.search(new RegExp(`^(?:> )?#{2,3} ${n.replace('.', '\\.')}[. ]`, 'm'));
  if (start < 0) throw new Error(`no section ${n}`);
  const bodyStart = PRIVACY_NOTICE_MD.indexOf('\n', start) + 1;
  const rest = PRIVACY_NOTICE_MD.slice(bodyStart);
  const next = rest.search(/^(?:> )?#{2,3} \d/m);
  return next < 0 ? rest : rest.slice(0, next);
}

describe('notice section 9: a session the visitor deletes (problem 6)', () => {
  const row = tableRow('A session you delete yourself');
  const [atOnce, staying] = row.split('These stay until your account is deleted:');

  it('removes the output-store copy, ratings, scores and feedback at once', () => {
    expect(staying, 'the row names what stays').toBeDefined();
    expect(atOnce).toContain('removed from our live database at once');
    expect(atOnce).toContain('the copy of its answers in our output store');
    expect(atOnce).toContain('its ratings');
    expect(atOnce).toContain('quality scores and feedback');
  });

  it('keeps only what has no link to the session until the account goes', () => {
    expect(staying).not.toContain('ratings');
    expect(staying).not.toContain('output store');
    expect(staying).toContain('the files you uploaded');
  });

  it('negative control: what was already right is still said', () => {
    for (const kept of ['its messages', 'answers', 'the version copies of its answers', 'its run records', 'its summary']) {
      expect(atOnce).toContain(kept);
    }
  });
});

describe('notice section 3: sign-in and sign-up records (problem 7)', () => {
  const row = tableRow('Security and technical data');

  it('says a failed sign-up records no username, and what a failed sign-in keeps', () => {
    expect(row).toContain('A failed sign-up records no username.');
    expect(row).toContain('If the invite code was wrong, a security event records the IP address and the time.');
    expect(row).toContain('the username typed, the IP address, the time and whether it succeeded');
    expect(row).toMatch(/If it belongs to no account, the event holds a short keyed code \(an HMAC\) made from the typed name, not the name itself\./);
  });

  it('no longer says a failed attempt copies the same details into a security event', () => {
    expect(row).not.toContain('with the same details');
    expect(row).not.toContain('Sign-in and sign-up attempts:');
  });

  it('negative control: the web server log and the change log are described as before', () => {
    expect(row).toContain('**Web server log:** for every request, your IP address');
    expect(row).toContain('**Log of changes made through the site:**');
    expect(row).toContain('None of these logs holds the content of your requests.');
  });
});

describe('notice section 6.1: the requests after an answer (problem 9)', () => {
  const s = section('6.1');

  it('ties the two further requests to the standard setting, and names what the operator can add', () => {
    expect(s).toContain("With the demo's standard setting, two more requests go to the same model:");
    expect(s).not.toMatch(/^Two more requests go to the same model:/m);
    expect(s).toMatch(/the quality of each answer/);
    expect(s).toMatch(/structure/);
    expect(s).toContain('first 3,000 characters');
  });

  it('negative control: the title and summary requests are described as before', () => {
    expect(s).toContain('**After your first message:** the message (up to 400 characters)');
    expect(s).toContain('**After each answer of 200 characters or more:** the last 12 messages of the session');
  });
});

describe('notice section 6.4: memory (problem 10)', () => {
  const s = section('6.4');

  it('names the session summary as the one stored text added back, instead of "no stored memory"', () => {
    expect(s).not.toContain("No stored memory is added to anyone's prompts.");
    expect(s).toContain('Nothing from your other sessions, or from other visitors, is added to your prompts.');
    expect(s).toContain('the summary of that same session');
    expect(s).toContain('section 6.1');
  });

  it('negative control: memory learning is still said to be off', () => {
    expect(s).toContain("ANTON's memory learning is switched off on this demo.");
    expect(s).toContain('We extract no memory items from your content and build no search index from it.');
  });
});

// ── The sign-up form's right to object ─────────────────────────────────

let container: HTMLDivElement;
let root: Root;

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
};

beforeEach(() => {
  window.matchMedia = ((query: string) => ({
    matches: false, media: query, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const body = url === '/api/config' ? DEMO_CONFIG : {};
    return new Response(JSON.stringify(body), { status: url === '/api/config' ? 200 : 404, headers: { 'Content-Type': 'application/json' } });
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

describe('the sign-up form: the right to object (problem 12)', () => {
  async function objectionBox(): Promise<string> {
    useDemoStore.setState({ config: DEMO_OFF, loaded: false });
    useDemoStore.getState().applyConfig(DEMO_CONFIG);
    useAuthStore.setState({ user: null, token: null, isTeamMode: true, isLoading: false });
    await act(async () => { root.render(createElement(MemoryRouter, null, createElement(LoginPage))); });
    for (let i = 0; i < 6; i++) await act(async () => { await Promise.resolve(); });
    const tab = [...container.querySelectorAll('[role="tab"]')].find((t) => t.textContent === 'Create a demo account') as HTMLButtonElement;
    await act(async () => { tab.click(); });
    const box = [...container.querySelectorAll('p')].find((p) => p.textContent?.startsWith('Your right to object:'));
    if (!box) throw new Error('no right-to-object box');
    return box.textContent ?? '';
  }

  it('names purpose 7, information about other people, as notice section 5 does', async () => {
    // Section 5 of the notice lists 7 among the purposes one may object to.
    expect(section('5')).toContain('purposes 2, 3, 4, 5, 7 and 8');
    const box = await objectionBox();
    expect(box).toContain('information about other people that you enter');
  });

  it('negative control: the other purposes are still named', async () => {
    const box = await objectionBox();
    for (const purpose of ['security', 'cost control', 'statistics', 'backups', 'the checks OpenRouter runs']) {
      expect(box, purpose).toContain(purpose);
    }
    expect(box).toContain('privacy notice, section 5');
  });
});
