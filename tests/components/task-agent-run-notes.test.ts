// @vitest-environment jsdom
/**
 * task-agent-run-notes.test.ts — the Task Agent shows what a run says about
 * itself (2026-10-02).
 *
 * The server streams { type: 'warning', code: 'output_truncated', message }
 * when a reply or a step's deliverable was cut off at the length limit
 * (provider-router.ts / unified-llm-client.ts), and the agentic engine writes
 * { type: 'warning', message } for its own warnings. Both stream readers of
 * AntonTaskAgentPage dropped those frames, so a truncated deliverable looked
 * complete — on the GLM showcase, where answers are capped, that is the
 * common case.
 *
 * Now the chat shows the note under the reply, and a step run shows it beside
 * the step, as EngagementExecution.tsx does with its run notes. The negative
 * control is the same stream without the warning frame: no note appears.
 * Rendered with react-dom in jsdom; fetch is a stub that records every call.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import AntonTaskAgentPage from '../../src/pages/AntonTaskAgentPage';
import { useDemoStore } from '../../src/stores/useDemoStore';
import { useAuthStore } from '../../src/stores/useAuthStore';
import { DEMO_OFF } from '../../src/lib/demo-config';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const GLM = 'compat:openrouter:z-ai/glm-5.3';
const DEMO_CONFIG = {
  deploymentMode: 'team',
  demoMode: true,
  offeredModels: [GLM],
  defaultModel: GLM,
  enabledPillars: ['work'],
  signupOpen: true,
  signupCodeRequired: true,
  retentionDays: 30,
  privacyPath: '/privacy',
  answersScored: false,
};

const NOTE = 'The answer was cut off at the length limit: it is incomplete.';
const STEP = { step: 1, name: 'Draft the memo', description: 'Write the first draft.' };

let container: HTMLDivElement;
let root: Root;
let calls: Array<{ url: string; method: string }> = [];
/** The task GET /api/task-agent/tasks/t1 answers. */
let task: Record<string, unknown> = {};
/** What a POST to …/message or …/execute-step streams back. */
let streamFrames: unknown[] = [];
/** The task after a stream's `done` (what the server stored). */
let taskAfter: Record<string, unknown> | null = null;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function sse(frames: unknown[]): Response {
  const body = frames.map((f) => `data: ${JSON.stringify(f)}\n\n`).join('');
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

function baseTask(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 't1', title: 'AMLR memo', description: 'Write a memo.', status: 'clarifying', source: 'manual', priority: 'normal',
    tags: [], created_at: '2026-10-02T08:00:00Z', updated_at: '2026-10-02T08:00:00Z', chosen_approach_id: 'a1',
    conversation: [{ role: 'user', content: 'Write a memo.' }, { role: 'assistant', content: 'What is the audience?' }],
    proposals: [], clarifying_questions: [], clarifying_answers: [], execution_run_ids: [], intake_answers: {},
    execution_results: [], current_step: 0, intake_ready: 0, task_files: [], active_knowledge_packs: [],
    execution_steps: [STEP], linked_mission_id: null, linked_mission: null, step_run: null,
    ...overrides,
  };
}

async function settle(rounds = 15): Promise<void> {
  for (let i = 0; i < rounds; i++) await act(async () => { await Promise.resolve(); });
}

async function render(): Promise<void> {
  await act(async () => {
    root.render(createElement(MemoryRouter, { initialEntries: ['/task-agent?task=t1'] }, createElement(AntonTaskAgentPage)));
  });
  await settle();
}

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

async function typeInto(el: HTMLTextAreaElement, value: string): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
  await act(async () => {
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

/** The status boxes that carry `note`. */
const notesShown = (note: string) => [...container.querySelectorAll('[role="status"]')].filter((el) => el.textContent?.includes(note));

beforeAll(async () => {
  await i18n.use(initReactI18next).init({ lng: 'en', resources: { en: { translation: {} } }, interpolation: { escapeValue: false } });
});

beforeEach(() => {
  calls = [];
  streamFrames = [];
  taskAfter = null;
  localStorage.clear();
  sessionStorage.clear();
  Element.prototype.scrollIntoView = () => {};
  Element.prototype.scrollTo = () => {};
  window.matchMedia = ((query: string) => ({
    matches: false, media: query, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  useDemoStore.setState({ config: DEMO_OFF, loaded: false });
  useDemoStore.getState().applyConfig(DEMO_CONFIG);
  useAuthStore.setState({ user: { id: 'u-visitor', username: 'visitor', role: 'analyst' }, token: 't', isTeamMode: true, isLoading: false });
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? 'GET').toUpperCase();
    calls.push({ url, method });
    if (url === '/api/config') return json(DEMO_CONFIG);
    if (url === '/api/csrf-token') return json({ csrfToken: 'csrf' });
    if (url.startsWith('/api/task-agent/tasks?')) return json({ tasks: [task] });
    if (url === '/api/task-agent/stats') return json({ total: 1, open: 1, byStatus: [{ status: 'clarifying', count: 1 }], recent: [] });
    if (url === '/api/task-agent/capabilities') return json({ capabilities: [] });
    if (url === '/api/task-agent/tasks/t1' && method === 'GET') return json(task);
    if ((url === '/api/task-agent/tasks/t1/message' || url === '/api/task-agent/tasks/t1/execute-step') && method === 'POST') {
      if (taskAfter) task = taskAfter;
      return sse(streamFrames);
    }
    if (url === '/api/knowledge-packs') return json({ packs: [] });
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

async function sendChat(): Promise<void> {
  const box = container.querySelector('textarea') as HTMLTextAreaElement;
  expect(box).not.toBeNull();
  await typeInto(box, 'The board.');
  await click(button('Send (Enter)'));
}

describe('Task Agent chat: a cut-off reply', () => {
  const reply = (withWarning: boolean) => [
    { type: 'text_delta', content: 'Here is the first part of the' },
    ...(withWarning ? [{ type: 'warning', code: 'output_truncated', message: NOTE }] : []),
    { type: 'done' },
  ];

  it('shows the warning frame under the reply', async () => {
    task = baseTask({});
    taskAfter = baseTask({
      conversation: [...(task.conversation as unknown[]), { role: 'user', content: 'The board.' }, { role: 'assistant', content: 'Here is the first part of the' }],
    });
    streamFrames = reply(true);
    await render();
    await sendChat();
    expect(calls.some((c) => c.url === '/api/task-agent/tasks/t1/message' && c.method === 'POST')).toBe(true);
    expect(notesShown(NOTE)).toHaveLength(1);
  });

  it('negative control: the same reply without the frame shows no note', async () => {
    task = baseTask({});
    streamFrames = reply(false);
    await render();
    await sendChat();
    expect(calls.some((c) => c.url === '/api/task-agent/tasks/t1/message' && c.method === 'POST')).toBe(true);
    expect(container.textContent).not.toContain(NOTE);
  });
});

describe('Task Agent step run: a cut-off deliverable', () => {
  const run = (withWarning: boolean) => [
    { type: 'text_delta', content: 'Memo, first half' },
    ...(withWarning ? [{ type: 'warning', code: 'output_truncated', message: NOTE }] : []),
    { type: 'done', hasMoreSteps: false },
  ];
  const ready = () => baseTask({ intake_ready: 1 });
  const afterRun = () => baseTask({
    intake_ready: 1,
    current_step: 1,
    execution_results: [{ step: 0, name: STEP.name, output: 'Memo, first half', at: '2026-10-02T09:00:00Z' }],
  });

  it('shows the warning beside the step it belongs to', async () => {
    task = ready();
    taskAfter = afterRun();
    streamFrames = run(true);
    await render();
    await click(button('Run Step 1'));
    expect(calls.some((c) => c.url === '/api/task-agent/tasks/t1/execute-step' && c.method === 'POST')).toBe(true);
    const shown = notesShown(NOTE);
    expect(shown).toHaveLength(1);
    // Inside the step's card, next to its title.
    expect(shown[0].parentElement?.textContent).toContain(`Step 1: ${STEP.name}`);
  });

  it('negative control: the same run without the frame shows no note', async () => {
    task = ready();
    taskAfter = afterRun();
    streamFrames = run(false);
    await render();
    await click(button('Run Step 1'));
    expect(container.textContent).toContain(`Step 1: ${STEP.name}`);
    expect(container.textContent).not.toContain(NOTE);
  });
});
