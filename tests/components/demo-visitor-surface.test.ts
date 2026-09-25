// @vitest-environment jsdom
/**
 * demo-visitor-surface.test.ts — what a public-demo visitor is offered on
 * Home and on the Work page (DEMO_MODE=true; live browser test 2026-09-25).
 *
 * The server answers 404 to a non-admin outside WORK_ROUTES
 * (server/middleware/demo-mode.ts). The live test found controls a visitor
 * could see that lead only there, or that promise what a demo never does:
 *
 *   - "Collect insights — Responses contribute to knowledge base": a demo
 *     never learns from a visitor's runs;
 *   - knowledge modes a visitor cannot use: Local Folders, Combined, the
 *     Knowledge Collections (RAG) and the Regulatory Knowledge Packs;
 *   - Home's Pathfinder search, 5-Minute Brief and "Add deadline";
 *   - on the Work page: Deliberation mode, the Risk Atlas banner, the
 *     knowledge-library suggestion (it turns on Local Folders), prompt
 *     versions, the Trades "My way" check, Share / quality stars /
 *     Explain-for under the answer, and the toolbar's Citations, Review,
 *     Rerun, Export run, Evidence and Save-as-module.
 *
 * Each is hidden for a visitor; every block has a negative control — an admin
 * on the demo and everyone on an ordinary server keep the old behaviour.
 * Rendered with react-dom in jsdom; fetch is a stub that records every call.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement, type ComponentType } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import SessionTogglesPanel from '../../src/components/shared/SessionTogglesPanel';
import KnowledgeSourcePanel from '../../src/components/shared/KnowledgeSourcePanel';
import ExportBar from '../../src/components/shared/ExportBar';
import OutputToolbar from '../../src/components/shared/OutputToolbar';
import HomeV2 from '../../src/pages/HomeV2';
import ModulePage from '../../src/pages/ModulePage';
import { useDemoStore } from '../../src/stores/useDemoStore';
import { useAuthStore } from '../../src/stores/useAuthStore';
import { DEMO_OFF } from '../../src/lib/demo-config';
import { resetPublicModelConfigCache } from '../../src/lib/compat-model-policy';
import type { KnowledgeSourceConfig, ModelId } from '../../src/lib/types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const GLM = 'compat:openrouter:z-ai/glm-5.3-flash' as ModelId;

const DEMO_CONFIG = {
  deploymentMode: 'team',
  demoMode: true,
  offeredModels: [GLM],
  enabledPillars: ['work'],
  signupOpen: true,
  signupCodeRequired: true,
  retentionDays: 30,
  privacyPath: '/privacy',
  answersScored: false,
};
const ORDINARY = { deploymentMode: 'team', demoMode: false };

type Who = 'visitor' | 'admin' | 'ordinary';

let container: HTMLDivElement;
let root: Root;
let calls: Array<{ url: string; method: string }> = [];
let configAnswer: unknown = DEMO_CONFIG;
/** Extra GET answers for one test, by exact URL. */
let answers: Record<string, unknown> = {};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function as(who: Who) {
  configAnswer = who === 'ordinary' ? ORDINARY : DEMO_CONFIG;
  useDemoStore.setState({ config: DEMO_OFF, loaded: false });
  useDemoStore.getState().applyConfig(configAnswer);
  const role = who === 'admin' ? 'admin' : 'analyst';
  useAuthStore.setState({ user: { id: `u-${who}`, username: `user_${who}`, role }, token: 't', isTeamMode: true, isLoading: false });
}

/** A new root, so the next render mounts afresh (its mount-only effects run again). */
async function fresh(): Promise<void> {
  await act(async () => root.unmount());
  root = createRoot(container);
  calls = [];
}

async function settle(): Promise<void> {
  for (let i = 0; i < 8; i++) await act(async () => { await Promise.resolve(); });
}

async function render(component: ComponentType<object>, props: object = {}): Promise<void> {
  await act(async () => {
    root.render(createElement(MemoryRouter, null, createElement(component, props)));
  });
  await settle();
}

async function renderModulePage(moduleId: string): Promise<void> {
  await act(async () => {
    root.render(
      createElement(MemoryRouter, { initialEntries: [`/module/${moduleId}`] },
        createElement(Routes, null, createElement(Route, { path: '/module/:moduleId', element: createElement(ModulePage) }))),
    );
  });
  await settle();
}

const text = () => container.textContent ?? '';
const called = (fragment: string) => calls.some((c) => c.url.includes(fragment));

function button(label: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll('button')].find(
    (b) => b.textContent?.trim() === label || b.getAttribute('aria-label') === label,
  ) as HTMLButtonElement | undefined;
}

async function click(el: HTMLElement | undefined): Promise<void> {
  if (!el) throw new Error('nothing to click');
  await act(async () => { el.click(); });
  await settle();
}

beforeAll(async () => {
  // ModulePage and ExportBar read react-i18next; with no resources t() returns the key or its default.
  await i18n.use(initReactI18next).init({ lng: 'en', resources: { en: { translation: {} } }, interpolation: { escapeValue: false } });
});

beforeEach(() => {
  calls = [];
  answers = {};
  configAnswer = DEMO_CONFIG;
  resetPublicModelConfigCache();
  localStorage.clear();
  sessionStorage.clear();
  window.matchMedia = ((query: string) => ({
    matches: false, media: query, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  Element.prototype.scrollIntoView = () => {};
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    calls.push({ url, method: (init?.method ?? 'GET').toUpperCase() });
    if (url === '/api/config') return json(configAnswer);
    if (url in answers) return json(answers[url]);
    if (url.startsWith('/api/knowledge-packs')) return json({ packs: [{ id: 'p1', display_name: 'AMLR pack', version: '1', jurisdiction: 'EU', entity_count: 3, relationship_count: 2, status: 'installed' }] });
    if (url === '/api/collections') return json([]);
    if (url === '/api/custom-modules') return json([]);
    if (url.startsWith('/api/sessions/stats')) return json({ totalSessions: 0, totalMessages: 0, totalOutputTokens: 0, thisWeekSessions: 0, thisMonthSessions: 0, recentSessions: [] });
    if (url.startsWith('/api/sessions?')) return json([]);
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

// ── 2. "Collect insights" ────────────────────────────────────────────────

describe('SessionTogglesPanel: Collect insights', () => {
  const props = {
    writingTone: 'professional', emojiEnabled: false, metaCognitiveEnabled: false, transparencyLevel: 0,
    nativeReasoningEnabled: false, atomInjectionEnabled: true, atomCollectionEnabled: true, currentModel: GLM,
    onWritingToneChange: () => {}, onEmojiChange: () => {}, onMetaCognitiveChange: () => {}, onTransparencyChange: () => {},
    onNativeReasoningChange: () => {}, onAtomInjectionChange: () => {}, onAtomCollectionChange: () => {},
  };

  it('is not offered to a visitor: a demo never learns from their runs', async () => {
    as('visitor');
    await render(SessionTogglesPanel as ComponentType<object>, props);
    expect(text()).not.toContain('Collect insights');
    expect(text()).not.toContain('Responses contribute to knowledge base');
    expect(text()).toContain('Use prior insights');
  });

  it('negative controls: an admin on the demo and everyone on an ordinary server keep it', async () => {
    for (const who of ['admin', 'ordinary'] as const) {
      await fresh();
      as(who);
      await render(SessionTogglesPanel as ComponentType<object>, props);
      expect(text(), who).toContain('Collect insights');
      expect(text(), who).toContain('Responses contribute to knowledge base');
    }
  });
});

// ── 3. Knowledge sources ─────────────────────────────────────────────────

describe('KnowledgeSourcePanel: the modes a visitor can use', () => {
  // Every mode switched on, so each card that renders also mounts its content.
  const everyMode: KnowledgeSourceConfig = {
    modes: {
      claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
      onlineReference: { enabled: true, urls: [], fetchDepth: 'full' },
      localFolder: { enabled: true, folderPaths: [], recursive: true },
      combinedMode: { enabled: true, priority: 'merged' },
    },
    ragSearch: { enabled: true, collections: [], topK: 10, rerank: true, showRelevance: true },
  };
  const hiddenFromVisitor = ['Local Folders', 'Combined: Search + Local Documents', 'Indexed Knowledge Base (Folders)', 'Knowledge Collections (RAG)', 'Regulatory Knowledge Packs'];

  it('offers a visitor the model\'s own knowledge and online links only, and calls nothing outside the demo', async () => {
    as('visitor');
    await render(KnowledgeSourcePanel as ComponentType<object>, { config: everyMode, onChange: () => {}, model: GLM });
    expect(text()).toContain("The Model's Own Knowledge");
    expect(text()).toContain('Online Regulation / Document Links');
    for (const title of hiddenFromVisitor) expect(text(), title).not.toContain(title);
    expect(called('/api/collections')).toBe(false);
    expect(called('/api/knowledge-packs')).toBe(false);
  });

  it('negative controls: an admin on the demo and everyone on an ordinary server see every mode', async () => {
    for (const who of ['admin', 'ordinary'] as const) {
      await fresh();
      as(who);
      await render(KnowledgeSourcePanel as ComponentType<object>, { config: everyMode, onChange: () => {}, model: GLM });
      for (const title of hiddenFromVisitor) expect(text(), `${who}: ${title}`).toContain(title);
      expect(called('/api/collections'), who).toBe(true);
      expect(called('/api/knowledge-packs'), who).toBe(true);
    }
  });
});

// ── 4. Home ──────────────────────────────────────────────────────────────

describe('Home (HomeV2)', () => {
  it('gives a visitor the module catalogue — no Pathfinder, 5-Minute Brief, deadline adding or agents', async () => {
    as('visitor');
    await render(HomeV2 as ComponentType<object>);
    expect(text()).not.toContain('Pathfinder · search that thinks');
    expect(container.querySelector('input[placeholder="Search that thinks before it answers…"]')).toBeNull();
    expect(text()).not.toContain('5-Minute Brief');
    expect(text()).not.toContain('Add deadline');
    expect(text()).not.toContain('Agent status');
    expect(text()).not.toContain('ask Pathfinder');
    // What a visitor needs: the modules.
    expect(container.querySelector('input[placeholder^="Search modules"]')).not.toBeNull();
    expect(text()).toContain('expert modules across');
    // Nothing that 404s for a visitor is asked for.
    expect(called('/api/pathfinder')).toBe(false);
    expect(called('/api/workflows')).toBe(false);
    expect(called('/api/system/intelligence-health')).toBe(false);
  });

  it('negative controls: an admin on the demo and everyone on an ordinary server keep all of it', async () => {
    for (const who of ['admin', 'ordinary'] as const) {
      await fresh();
      as(who);
      await render(HomeV2 as ComponentType<object>);
      expect(text(), who).toContain('Pathfinder · search that thinks');
      expect(text(), who).toContain('5-Minute Brief');
      expect(text(), who).toContain('Add deadline');
      expect(text(), who).toContain('Agent status');
      expect(called('/api/pathfinder/searches'), who).toBe(true);
    }
  });
});

// ── 5. The Work page ─────────────────────────────────────────────────────

describe('ExportBar under an answer', () => {
  const props = {
    content: 'An answer.', availableFormats: ['md', 'docx'], onExport: () => {}, isExporting: false,
    sessionId: 's1', onReframe: () => {}, moduleContext: 'Risk assessment', entityId: 's1', moduleId: 'risk-assessment',
  };

  it('offers a visitor the exports, not Share, the quality stars or Explain-for', async () => {
    as('visitor');
    await render(ExportBar as ComponentType<object>, props);
    expect(button('.md')).toBeDefined();
    expect(button('Explain Differently')).toBeDefined(); // a normal run, allowed
    expect(button('export.share')).toBeUndefined();
    expect(text()).not.toContain('Rate output quality');
    expect(button('Rewrite this output for a different audience')).toBeUndefined();
  });

  it('negative controls: an admin and an ordinary server keep Share, the stars and Explain-for', async () => {
    for (const who of ['admin', 'ordinary'] as const) {
      await fresh();
      as(who);
      await render(ExportBar as ComponentType<object>, props);
      expect(button('export.share'), who).toBeDefined();
      expect(text(), who).toContain('Rate output quality');
      expect(button('Rewrite this output for a different audience'), who).toBeDefined();
    }
  });
});

describe('OutputToolbar under an answer', () => {
  const props = {
    outputContent: 'An answer.', model: GLM, sessionId: 's1', isStreaming: false, streamingThinking: '',
    systemPrompt: '', creativity: 'balanced', thinking: 'think', selectedOutputFormats: [],
  };
  const chipLabels = () => [...container.querySelectorAll('button')].map((b) => b.textContent?.trim() ?? '');

  it('gives a visitor the chips whose routes the demo serves; Save becomes the trust certificate only', async () => {
    as('visitor');
    await render(OutputToolbar as ComponentType<object>, props);
    const labels = chipLabels();
    for (const gone of ['Citations', 'Review', 'Rerun with…', 'Export run', 'Evidence', 'Save']) expect(labels, gone).not.toContain(gone);
    for (const kept of ['Trust Score', 'Provenance', 'Thinking', 'History', 'Feedback', 'Certificate']) expect(labels, kept).toContain(kept);
    await click(button('Certificate'));
    expect(text()).toContain('Download Trust Certificate');
    expect(text()).not.toContain('reusable custom module');
    expect(container.querySelector('input[placeholder="Module name"]')).toBeNull();
  });

  it('Trust Score on a demo that makes no score says so instead of waiting for one (admins too)', async () => {
    for (const who of ['visitor', 'admin'] as const) {
      await fresh();
      as(who);
      await render(OutputToolbar as ComponentType<object>, props);
      await click(button('Trust Score'));
      expect(text(), who).toContain('Answers are not scored on this demo.');
      expect(text(), who).not.toContain('Scoring in progress');
      expect(called('/quality/by-session'), who).toBe(false);
    }
  });

  it('negative control: on an ordinary server the Trust Score panel still looks for a score', async () => {
    as('ordinary');
    answers = { '/api/quality/by-session/s1': null };
    await render(OutputToolbar as ComponentType<object>, props);
    await click(button('Trust Score'));
    expect(text()).not.toContain('not scored on this demo');
    expect(called('/quality/by-session/s1')).toBe(true);
  });

  it('negative controls: an admin and an ordinary server keep every chip and Save as module', async () => {
    for (const who of ['admin', 'ordinary'] as const) {
      await fresh();
      as(who);
      await render(OutputToolbar as ComponentType<object>, props);
      const labels = chipLabels();
      for (const kept of ['Citations', 'Review', 'Rerun with…', 'Export run', 'Evidence', 'Save']) expect(labels, `${who}: ${kept}`).toContain(kept);
      expect(labels, who).not.toContain('Certificate');
      await click(button('Save'));
      expect(container.querySelector('input[placeholder="Module name"]'), who).not.toBeNull();
      expect(text(), who).toContain('Download Trust Certificate');
    }
  });
});

describe('ModulePage (the Work page)', () => {
  // An FCP module with the Risk Atlas banner and a knowledge-library suggestion.
  function riskAssessmentAnswers() {
    answers = {
      '/api/modules/risk-assessment': { id: 'risk-assessment', areaId: 'fcp', guidedInputs: [] },
      '/api/modules/risk-assessment/prompt': { prompt: 'You assess financial-crime risk.' },
      '/api/knowledge-library': [{ id: 'k1', label: 'AMLR texts', path: '/data/amlr', category: 'regulation', recursive: true }],
    };
  }

  async function openPromptEditor(): Promise<void> {
    await click(button('module.advancedSettings'));
    await click([...container.querySelectorAll('button')].find((b) => b.textContent?.includes('System Prompt')) as HTMLButtonElement);
  }

  it('offers a visitor none of what the demo does not serve', async () => {
    riskAssessmentAnswers();
    as('visitor');
    await renderModulePage('risk-assessment');
    // The run itself is there.
    expect(button('module.runAnalysis')).toBeDefined();
    expect(text()).toContain("The Model's Own Knowledge");
    // What is gone.
    expect(text()).not.toContain('Deliberation Mode');
    expect(text()).not.toContain('Keep the scores in a Risk Atlas.');
    expect(text()).not.toContain('knowledge corpus entry available');
    expect(text()).not.toContain('Local Folders');
    expect(text()).not.toContain('Collect insights');
    await openPromptEditor();
    expect(text()).toContain('This prompt shapes');
    expect(button('Save Version')).toBeUndefined();
    expect(called('/api/versions/prompt')).toBe(false);
  });

  it('negative controls: an admin on the demo and an ordinary server keep all of it', async () => {
    for (const who of ['admin', 'ordinary'] as const) {
      await fresh();
      riskAssessmentAnswers();
      as(who);
      await renderModulePage('risk-assessment');
      expect(text(), who).toContain('Deliberation Mode');
      expect(text(), who).toContain('Keep the scores in a Risk Atlas.');
      expect(text(), who).toContain('knowledge corpus entry available');
      expect(text(), who).toContain('Local Folders');
      await openPromptEditor();
      expect(button('Save Version'), who).toBeDefined();
    }
  });

  it('does not check a visitor\'s Trades "My way" setup (its routes are outside the demo); an admin\'s it does', async () => {
    answers = {
      '/api/modules/quote-builder-demo': { id: 'quote-builder-demo', label: 'Quotes', areaId: 'trades', guidedInputs: [], myWayProcessType: 'quoting' },
    };
    as('visitor');
    await renderModulePage('quote-builder-demo');
    expect(text()).toContain('Quotes');
    expect(called('/api/trades/setup-status')).toBe(false);

    await fresh();
    as('admin');
    await renderModulePage('quote-builder-demo');
    expect(called('/api/trades/setup-status')).toBe(true);
  });
});
