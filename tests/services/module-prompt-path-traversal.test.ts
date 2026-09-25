/**
 * module-prompt-path-traversal.test.ts — a module id is not a path (public
 * showcase review, 2026-09-25, finding C4).
 *
 * getModuleSystemPrompt() fell back to server/prompts/<id>.md with a plain
 * path.join, and the id comes from the client: GET /api/modules/:id/prompt,
 * POST /claude/preview-prompt and POST /claude/message all reach it. Express
 * decodes '..%2F..%2FCLAUDE' in a path segment to '../../CLAUDE', and the demo
 * allowlist tested the still-encoded path, so any visitor could read any .md
 * file the server could — the repo's CLAUDE.md for a start — or have it
 * injected into a model prompt.
 *
 * Fixed twice: the loader accepts only the module id alphabet and a path that
 * stays in server/prompts (for everyone, demo or not), and the demo allowlist
 * refuses an encoded separator or a dot segment before any rule is tried.
 *
 * Negative controls: every legacy prompt id and a live module id still
 * resolve, the same routes answer a real module, and ordinary Work paths
 * still pass the allowlist.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { getModuleSystemPrompt, legacyPromptPath } from '../../server/services/module-loader.js';
import { composeSystemPrompt } from '../../server/services/prompt-composer.js';
import modulesRouter from '../../server/routes/modules.js';
import {
  createDemoAllowlistMiddleware, demoRouteAllowed, demoRouteRules, hasEncodedSeparatorOrDotSegment,
} from '../../server/middleware/demo-mode.js';

const repoRoot = path.resolve(__dirname, '..', '..');
const promptsDir = path.join(repoRoot, 'server', 'prompts');
/** A line only CLAUDE.md has: if it shows up in an answer, the file was read. */
const CLAUDE_MD_MARK = '# CLAUDE.md — ANTON by openEXPERT';

const savedDemo = process.env.DEMO_MODE;
afterEach(() => {
  if (savedDemo === undefined) delete process.env.DEMO_MODE; else process.env.DEMO_MODE = savedDemo;
});

describe('the fixture', () => {
  it('../../CLAUDE from server/prompts really is the repo\'s CLAUDE.md (the attack would read it)', () => {
    const target = path.join(promptsDir, '../../CLAUDE.md');
    expect(fs.existsSync(target)).toBe(true);
    expect(fs.readFileSync(target, 'utf8')).toContain(CLAUDE_MD_MARK);
  });
});

describe('getModuleSystemPrompt: the id stays a module id', () => {
  it('refuses ids that climb out of server/prompts', async () => {
    for (const id of ['../../CLAUDE', '..\\..\\CLAUDE', '../prompts/../../CLAUDE', `${repoRoot}/CLAUDE`, '/etc/passwd', '..', '.', '']) {
      // Compared as a boolean, so a failure does not print the whole file.
      expect((await getModuleSystemPrompt(id)) === null, JSON.stringify(id)).toBe(true);
      expect(legacyPromptPath(id), JSON.stringify(id)).toBeNull();
    }
  });

  it('negative control: every legacy prompt id still resolves, _foundation included', async () => {
    const ids = fs.readdirSync(promptsDir).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3));
    expect(ids).toContain('_foundation');
    expect(ids).toContain('civic-gap');
    for (const id of ids) {
      expect(legacyPromptPath(id), id).toBe(path.join(promptsDir, `${id}.md`));
    }
    expect(await getModuleSystemPrompt('civic-gap')).toMatch(/^# Civic — Gap Analysis/);
    expect(await getModuleSystemPrompt('_foundation')).toBeTruthy();
  });

  it('negative control: a live module (server/areas) resolves as before', async () => {
    expect((await getModuleSystemPrompt('gap-analysis')) ?? '').toContain('# AMLR Gap Analysis');
  });

  it('the composed prompt (preview-prompt, /claude/message) never carries the file', async () => {
    const composed = await composeSystemPrompt({ creativity: 'balanced', thinking: 'think', moduleId: '../../CLAUDE' });
    expect(composed.includes(CLAUDE_MD_MARK)).toBe(false);
    const real = await composeSystemPrompt({ creativity: 'balanced', thinking: 'think', moduleId: 'civic-gap' });
    expect(real).toContain('# Civic — Gap Analysis');
  });
});

describe('the demo allowlist refuses encoded separators and dot segments', () => {
  const rules = demoRouteRules({ DEMO_MODE: 'true' });

  it('refuses them on a route it would otherwise allow', () => {
    for (const p of [
      '/modules/..%2F..%2FCLAUDE/prompt', '/modules/..%2f..%2fCLAUDE/prompt', '/modules/..%5C..%5CCLAUDE/prompt',
      '/modules/%2e%2e/prompt', '/sessions/x%2F..%2F..%2Fadmin%2Fusers', '/areas/../admin', '/areas/./x',
      '/modules/a\\b/prompt',
    ]) {
      expect(hasEncodedSeparatorOrDotSegment(p), p).toBe(true);
      expect(demoRouteAllowed('GET', p, rules), p).toBe(false);
    }
  });

  it('negative control: ordinary ids pass, dots inside a segment included', () => {
    for (const p of ['/modules/aml-gap-analysis/prompt', '/sessions/abc', '/files/1b2c-notes.v2.pdf', '/areas/fcp', '/modules/x%20y']) {
      expect(hasEncodedSeparatorOrDotSegment(p), p).toBe(false);
    }
    expect(demoRouteAllowed('GET', '/modules/aml-gap-analysis/prompt', rules)).toBe(true);
    expect(demoRouteAllowed('GET', '/files/1b2c-notes.v2.pdf', rules)).toBe(true);
  });
});

describe('GET /api/modules/:id/prompt, mounted as in index.ts', () => {
  let server: Server;
  let base = '';

  beforeAll(async () => {
    const app = express();
    app.use((req: Request, _res: Response, next: NextFunction) => {
      const role = req.header('x-test-role');
      if (role) req.user = { id: `u-${role}`, username: role, role: role as 'admin' | 'analyst' | 'viewer' };
      next();
    });
    app.use('/api', createDemoAllowlistMiddleware());
    app.use('/api', modulesRouter);
    await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()); });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => { await new Promise<void>((resolve) => server?.close(() => resolve())); });

  const get = (p: string, role = 'analyst') => fetch(`${base}/api${p}`, { headers: { 'x-test-role': role } });

  it('a demo visitor cannot read CLAUDE.md through an encoded id', async () => {
    process.env.DEMO_MODE = 'true';
    for (const p of ['/modules/..%2F..%2FCLAUDE/prompt', '/modules/..%5C..%5CCLAUDE/prompt']) {
      const r = await get(p);
      expect(r.status, p).toBe(404);
      expect((await r.text()).includes(CLAUDE_MD_MARK)).toBe(false);
    }
  });

  it('nor can anyone else, demo or not: the loader refuses the id itself', async () => {
    delete process.env.DEMO_MODE;
    for (const role of ['analyst', 'admin']) {
      const r = await get('/modules/..%2F..%2FCLAUDE/prompt', role);
      expect(r.status, role).toBe(404);
      expect((await r.text()).includes(CLAUDE_MD_MARK)).toBe(false);
    }
  });

  it('negative control: a real module prompt is served, in demo mode and out of it', async () => {
    process.env.DEMO_MODE = 'true';
    const demo = await get('/modules/civic-gap/prompt');
    expect(demo.status).toBe(200);
    expect(((await demo.json()) as { prompt: string }).prompt).toMatch(/^# Civic — Gap Analysis/);
    delete process.env.DEMO_MODE;
    expect((await get('/modules/gap-analysis/prompt')).status).toBe(200);
  });
});
