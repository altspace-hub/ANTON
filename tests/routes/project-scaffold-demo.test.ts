/**
 * project-scaffold-demo.test.ts — AI Scaffold on the Projects page
 * (POST /api/ai-assist/project-scaffold) and the modules a public-demo
 * visitor is kept from (DEMO_HIDDEN_MODULES / DEMO_HIDDEN_AREAS, privacy
 * review H3).
 *
 * Before: the page sent every catalogue id and the route kept the first 30 in
 * catalogue order, so the model chose from 30 mostly unrelated modules, and a
 * visitor could be recommended a module the demo keeps off (credit scoring,
 * HR): the route only checked that an id was one the page had sent.
 *
 * Now the server chooses the candidates: the catalogue ranked against the
 * project's name and goal, limited to the page's own list when it sends one,
 * and for a visitor never a hidden module, whatever the page sent. The model
 * is shown only those, and only those come back.
 *
 * Negative controls: an admin on the demo, and anyone off the demo, can still
 * be recommended the same module.
 */
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

const model = vi.hoisted(() => ({
  prompts: [] as string[],
  reply: '{}',
}));

vi.mock('../../server/services/provider-router.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../server/services/provider-router.js')>()),
  callChat: async (opts: { messages: Array<{ content: string }> }) => {
    model.prompts.push(opts.messages.map((m) => m.content).join('\n'));
    return { text: model.reply, thinking: '', inputTokens: 10, outputTokens: 10, model: 'fake' };
  },
}));

/** Kept off the demo by DEFAULT_DEMO_HIDDEN_MODULES. */
const HIDDEN_MODULE = 'credit-risk';
/** In the hr area, kept off the demo by DEFAULT_DEMO_HIDDEN_AREAS. */
const HIDDEN_AREA_MODULE = 'performance-review-summarizer';
/** Offered on the demo, and relevant to the project below. */
const OPEN_MODULE = 'model-risk-audit-framework';

const PROJECT = {
  name: 'Credit risk review',
  goal: 'Review our credit risk scoring model and the performance review of the analysts who run it.',
};

describe('AI Scaffold: the modules it may recommend', () => {
  let app: Server;
  let base = '';
  let role = 'analyst';
  const ENV = ['DEMO_MODE', 'DEPLOYMENT_MODE', 'DEMO_HIDDEN_MODULES', 'DEMO_HIDDEN_AREAS'] as const;
  const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]])) as Record<(typeof ENV)[number], string | undefined>;

  beforeAll(async () => {
    const { createAiAssistRoutes } = await import('../../server/routes/ai-assist.js');
    const e = express();
    e.use(express.json({ limit: '1mb' }));
    e.use((req: Request, _res: Response, next: NextFunction) => {
      req.user = { id: `u-${role}`, username: `u-${role}`, role: role as 'admin' | 'analyst' | 'viewer' };
      next();
    });
    e.use('/api', await createAiAssistRoutes());
    await new Promise<void>((resolve) => { app = e.listen(0, '127.0.0.1', () => resolve()); });
    base = `http://127.0.0.1:${(app.address() as AddressInfo).port}`;
  });

  afterEach(() => {
    for (const k of ENV) if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
    model.prompts.length = 0;
    role = 'analyst';
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => { app?.close(() => resolve()); });
  });

  function demo(): void {
    process.env.DEMO_MODE = 'true';
    process.env.DEPLOYMENT_MODE = 'team';
    // The defaults: credit-risk is a hidden module, hr a hidden area.
    delete process.env.DEMO_HIDDEN_MODULES;
    delete process.env.DEMO_HIDDEN_AREAS;
  }

  /** The model recommends the hidden modules first, then the open one. */
  function modelRecommendsAll(): void {
    model.reply = JSON.stringify({
      description: 'A review of the credit model.',
      recommendedModules: [
        { id: HIDDEN_MODULE, reason: 'Credit risk.' },
        { id: HIDDEN_AREA_MODULE, reason: 'Performance reviews.' },
        { id: OPEN_MODULE, reason: 'Model risk.' },
      ],
      suggestedDeadlines: [{ title: 'Kick-off', dayOffset: 7 }],
      phases: [],
      successCriteria: [],
    });
  }

  /** What the page used to send: every catalogue id, the hidden ones first. */
  const OLD_PAGE_LIST = [HIDDEN_MODULE, HIDDEN_AREA_MODULE, OPEN_MODULE];

  async function scaffold(availableModuleIds?: string[]): Promise<{ ids: string[]; prompt: string }> {
    const res = await fetch(`${base}/api/ai-assist/project-scaffold`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...PROJECT, ...(availableModuleIds ? { availableModuleIds } : {}) }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { recommendedModules: Array<{ id: string }> };
    return { ids: body.recommendedModules.map((m) => m.id), prompt: model.prompts.join('\n') };
  }

  it('a visitor is never recommended a hidden module, even when the page sends its id', async () => {
    demo();
    modelRecommendsAll();
    for (const list of [OLD_PAGE_LIST, undefined]) {
      model.prompts.length = 0;
      const { ids, prompt } = await scaffold(list);
      expect(ids, String(list)).toEqual([OPEN_MODULE]);
      // The model is not even shown them.
      expect(prompt).not.toContain(`- ${HIDDEN_MODULE}:`);
      expect(prompt).not.toContain(`- ${HIDDEN_AREA_MODULE}:`);
      expect(prompt).toContain(`- ${OPEN_MODULE}:`);
    }
  });

  it('the candidates are the modules that match the project, at most 30, not the first 30 of the catalogue', async () => {
    demo();
    modelRecommendsAll();
    const { prompt } = await scaffold();
    const lines = prompt.split('\n').filter((l) => /^- [a-z0-9][a-z0-9._-]*: /i.test(l));
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.length).toBeLessThanOrEqual(30);
    expect(prompt).toContain('- ai-model-risk-assessment:');
  });

  it('only the modules the page offers are candidates when it sends its list', async () => {
    demo();
    model.reply = JSON.stringify({ recommendedModules: [{ id: 'ai-model-risk-assessment', reason: 'x' }, { id: OPEN_MODULE, reason: 'y' }] });
    const { ids, prompt } = await scaffold([OPEN_MODULE]);
    expect(ids).toEqual([OPEN_MODULE]);
    expect(prompt).not.toContain('- ai-model-risk-assessment:');
  });

  it('with nothing to choose from, nothing is recommended', async () => {
    demo();
    model.reply = JSON.stringify({ recommendedModules: [{ id: HIDDEN_MODULE, reason: 'x' }] });
    const { ids } = await scaffold([HIDDEN_MODULE]);
    expect(ids).toEqual([]);
  });

  it('negative controls: an admin on the demo, and an analyst off the demo, can be recommended the same modules', async () => {
    demo();
    role = 'admin';
    modelRecommendsAll();
    let result = await scaffold(OLD_PAGE_LIST);
    expect(result.ids).toEqual([HIDDEN_MODULE, HIDDEN_AREA_MODULE, OPEN_MODULE]);
    expect(result.prompt).toContain(`- ${HIDDEN_MODULE}:`);

    delete process.env.DEMO_MODE;
    role = 'analyst';
    model.prompts.length = 0;
    result = await scaffold(OLD_PAGE_LIST);
    expect(result.ids).toEqual([HIDDEN_MODULE, HIDDEN_AREA_MODULE, OPEN_MODULE]);
  });
});
