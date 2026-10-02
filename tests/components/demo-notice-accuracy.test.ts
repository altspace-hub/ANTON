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
 *      (DEMO_POST_ANSWER_CALLS=conclusion); the Trust Score sentence comes
 *      from the server's setting ([[SCORING_SENTENCE]]: 'scored' or 'all'),
 *      and the operator can add the structured extraction ('all').
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
    expect(s).toContain("With the demo's standard setting, two more requests go to [[DEFAULT_MODEL]], whichever model you chose:");
    expect(s).not.toMatch(/^Two more requests go to the same model:/m);
    // The Trust Score: filled from /api/config (src/lib/demo-model-names.ts scoringSentence).
    expect(s).toContain('**The Trust Score:** [[SCORING_SENTENCE]]');
    expect(s).toMatch(/extracts the structure of each answer longer than 100 characters/);
    expect(s).toContain('(that request carries the whole answer)');
  });

  it('negative control: the title and summary requests are described as before', () => {
    expect(s).toContain('**After your first message:** the message (up to 400 characters)');
    expect(s).toContain('**After each answer of 200 characters or more:** the last 12 messages of the session');
  });
});

describe('notice section 6.4: memory (problem 10)', () => {
  const s = section('6.4');

  it('names the session summary as a stored text added back, instead of "no stored memory"', () => {
    expect(s).not.toContain("No stored memory is added to anyone's prompts.");
    expect(s).toContain('Nothing from other visitors is added to your prompts.');
    expect(s).toContain('the summary of that same session');
    expect(s).toContain('section 6.1');
  });

  it('names what a visitor chooses to add back since 2026-10-02: project documents, a collection, a task or engagement', () => {
    // A session filed under a project reads its documents; a collection picked
    // as a source adds its passages; a task step and an engagement run read
    // their earlier steps and drafts (the routes do; notice section 6.1).
    expect(s).not.toContain('Nothing from your other sessions, or from other visitors, is added to your prompts.');
    expect(s).toContain('the documents of a project you file the session under');
    expect(s).toContain('a collection you pick as a source');
    expect(s).toContain('the earlier steps and drafts of the same task or engagement');
  });

  it("negative control: memory learning is still said to be off, and the only index is the visitor's own keyword index", () => {
    expect(s).toContain("ANTON's memory learning is switched off on this demo.");
    expect(s).toContain('We extract no memory items from your content and build no search index from it, apart from the keyword index of the documents you put in your own Knowledge Base collections, which only you can search.');
  });
});

describe('the features opened to visitors on 2026-10-02', () => {
  const s61 = section('6.1');

  it('section 6.1 says, for each, what goes to the model', () => {
    for (const feature of ['**Engagement Tasks:**', '**The Task Agent:**', '**Discover:**', '**Projects:**',
      '**Knowledge Base:**', '**Intelligence:**', '**Orchestration, Horizon Radar and Exchange**']) {
      expect(s61, feature).toContain(feature);
    }
    // No embedding service: the Knowledge Base is searched by keyword on the server (rag/demo-storage.ts).
    expect(s61).toContain('They are not sent to any embedding or search service.');
    // No web search on the demo's models; the routes refuse or say so.
    expect(s61).toContain('An engagement never looks up your client online');
    expect(s61).toContain('A task never looks anything up on the web.');
  });

  it('section 3 lists what is stored, and the switched-off list matches the routes', () => {
    const entered = tableRow('What you enter');
    for (const feature of ['**Engagement Tasks:**', '**The Task Agent:**', '**Discover:**', '**Projects:**', '**Knowledge Base:**']) {
      expect(entered, feature).toContain(feature);
    }
    const s3 = section('3');
    // The .anton download of a built module is open (unsigned, not kept); sharing is not.
    expect(s3).not.toContain('sharing a module you build with other users, or downloading it as a file');
    expect(s3).toContain("sharing a module you build with other users (you can download it as a file, which we don't keep)");
    expect(s3).toContain('sharing a project with other accounts, and sending project invitations');
    expect(s3).toContain('none of the models on this demo can search the web');
  });

  it('section 9 says how long each is kept, and what deleting one removes', () => {
    const account = PRIVACY_NOTICE_MD.split('\n').find((l) => l.startsWith('| **Your account and everything in it:**')) ?? '';
    for (const kept of ['engagements with their documents', 'tasks and the text of their documents', 'discovery interviews',
      'projects with their files and notes', 'Knowledge Base collections with their documents']) {
      expect(account, kept).toContain(kept);
    }
    expect(tableRow('A task, a discovery interview, a project, a project file, a collection or a document you delete yourself')).toContain('Removed from our live database at once');
    // An engagement's DELETE archives it (routes/engagements.ts): the notice must not promise more.
    expect(tableRow('An engagement you archive')).toContain('does not delete it');
  });

  it('negative control: the AI Council and Build Module sentences are unchanged', () => {
    expect(s61).toContain('- **The AI Council:** one question goes to several models, in many requests.');
    expect(s61).toContain('They are not shared with other visitors.');
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
