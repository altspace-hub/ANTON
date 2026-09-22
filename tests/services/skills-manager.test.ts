/**
 * skills-manager.test.ts — the skill library the prompt composer resolves from.
 *
 * Until 2026-09-16 the composer's synchronous resolveSkills() saw only the 21
 * inline built-ins: the 23 packs under server/skills/ were read by an async path
 * nothing called, so a jurisdiction pack attached to a session was silently not
 * injected. preloadDiskSkills() now indexes them at boot for the sync resolvers.
 *
 * Separately, the client's MODULE_DEFAULT_SKILLS map carried eight ids no skill
 * ever had (fcp-compliance, regulatory-analysis, sanctions-expert, ...); "Apply
 * suggested skills" attached them and the trail printed them as injected. A
 * module now recommends skills through module.json `recommendedSkills`, and the
 * second block here is the guard that every such id resolves.
 *
 * No database and no LLM: the skills routes are mounted with a stub adapter.
 */
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import type { Server } from 'node:http';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import {
  SKILL_CATEGORIES,
  getAllSkills,
  getBuiltInSkills,
  getSkillById,
  invalidateSkillCache,
  isDiskSkillsPreloaded,
  isSkillCategory,
  preloadDiskSkills,
  resolveSkills,
} from '../../server/services/skills-manager.js';
import { validateRecommendedSkills } from '../../server/services/module-loader.js';
import { createSkillsRoutes } from '../../server/routes/skills.js';
import modulesRouter from '../../server/routes/modules.js';
import type { DatabaseAdapter } from '../../server/db/database.js';

const repoRoot = path.resolve(__dirname, '..', '..');
const SKILLS_DIR = path.join(repoRoot, 'server', 'skills');
const AREAS_DIR = path.join(repoRoot, 'server', 'areas');

/** A real disk pack — server/skills/jurisdiction-sg-mas/ — and a phrase its prompt opens with. */
const DISK_ID = 'jurisdiction-sg-mas';
const DISK_PROMPT_PHRASE = 'Monetary Authority of Singapore';
/** A real built-in. */
const BUILTIN_ID = 'board-communication';
/** Ids the retired MODULE_DEFAULT_SKILLS map pointed at; none was ever a skill. */
const DEAD_IDS = ['fcp-compliance', 'regulatory-analysis', 'sanctions-expert', 'document-drafting', 'training-design', 'data-analysis'];

function readDiskPackConfigs(): Array<{ dir: string; id: string; category: unknown }> {
  return fs.readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(SKILLS_DIR, e.name, 'skill.json')))
    .map((e) => {
      const raw = JSON.parse(fs.readFileSync(path.join(SKILLS_DIR, e.name, 'skill.json'), 'utf-8')) as { id: string; category?: unknown };
      return { dir: e.name, id: raw.id, category: raw.category };
    });
}

function readModuleRecommendations(): Array<{ moduleId: string; file: string; ids: string[] }> {
  const out: Array<{ moduleId: string; file: string; ids: string[] }> = [];
  for (const areaEntry of fs.readdirSync(AREAS_DIR, { withFileTypes: true })) {
    if (!areaEntry.isDirectory()) continue;
    const modulesDir = path.join(AREAS_DIR, areaEntry.name, 'modules');
    if (!fs.existsSync(modulesDir)) continue;
    for (const modEntry of fs.readdirSync(modulesDir, { withFileTypes: true })) {
      if (!modEntry.isDirectory()) continue;
      const file = path.join(modulesDir, modEntry.name, 'module.json');
      if (!fs.existsSync(file)) continue;
      const cfg = JSON.parse(fs.readFileSync(file, 'utf-8')) as { id?: string; recommendedSkills?: unknown };
      if (!Array.isArray(cfg.recommendedSkills)) continue;
      out.push({
        moduleId: cfg.id ?? modEntry.name,
        file: path.relative(repoRoot, file),
        ids: cfg.recommendedSkills.map(String),
      });
    }
  }
  return out;
}

describe('skills-manager — disk packs reach the synchronous resolver', () => {
  beforeAll(async () => {
    await preloadDiskSkills();
  });

  it('a disk pack resolves by id after preload, with its prompt, category and source', () => {
    const skill = getSkillById(DISK_ID);
    expect(skill).toBeDefined();
    expect(skill?.source).toBe('disk');
    expect(skill?.category).toBe('jurisdiction');
    expect(skill?.prompt).toContain(DISK_PROMPT_PHRASE);
  });

  it('resolveSkills() — the composer path — injects the disk pack prompt', () => {
    expect(resolveSkills([DISK_ID])).toContain(DISK_PROMPT_PHRASE);

    const builtin = getBuiltInSkills().find((s) => s.id === BUILTIN_ID);
    expect(builtin).toBeDefined();
    const both = resolveSkills([BUILTIN_ID, DISK_ID]);
    expect(both).toContain(builtin!.prompt);
    expect(both).toContain(DISK_PROMPT_PHRASE);
    expect(both).toContain('\n\n---\n\n');
  });

  it('negative control: without the preload the same id does not resolve', async () => {
    invalidateSkillCache();
    expect(isDiskSkillsPreloaded()).toBe(false);
    expect(getSkillById(DISK_ID)).toBeUndefined();
    expect(resolveSkills([DISK_ID])).toBe('');
    // the built-ins never depended on the preload
    expect(getSkillById(BUILTIN_ID)).toBeDefined();

    await preloadDiskSkills();
    expect(getSkillById(DISK_ID)).toBeDefined();
  });

  it('getAllSkills() lists every built-in and every disk pack exactly once', () => {
    const ids = getAllSkills().map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const builtin of getBuiltInSkills()) expect(ids).toContain(builtin.id);
    const packs = readDiskPackConfigs();
    expect(packs.length).toBeGreaterThan(0);
    for (const pack of packs) expect(ids).toContain(pack.id);
  });

  it('every category a disk pack declares is in the Skill category union', () => {
    const outside = readDiskPackConfigs()
      .filter((p) => p.category !== undefined && !isSkillCategory(p.category))
      .map((p) => `${p.dir}: ${String(p.category)}`);
    expect(outside).toEqual([]);
    // the two categories the packs use that the union used to lack
    expect(SKILL_CATEGORIES).toContain('technical');
    expect(SKILL_CATEGORIES).toContain('thematic');
  });
});

describe('module.json recommendedSkills all resolve (guard against dead ids)', () => {
  beforeAll(async () => {
    await preloadDiskSkills();
  });

  it('every recommendedSkills id across server/areas/**/module.json is a real skill', () => {
    const recommendations = readModuleRecommendations();
    expect(recommendations.length).toBeGreaterThan(0);
    const dangling: string[] = [];
    for (const { moduleId, file, ids } of recommendations) {
      for (const id of ids) {
        if (!getSkillById(id)) dangling.push(`${moduleId} (${file}) -> ${id}`);
      }
    }
    expect(dangling).toEqual([]);
  });

  it('the FCP modules that used to point at dead ids now recommend real skills', () => {
    const byModule = new Map(readModuleRecommendations().map((r) => [r.moduleId, r.ids]));
    expect(byModule.get('sanctions-advisory')).toContain('sanctions-compliance-officer');
    expect(byModule.get('gap-analysis')).toContain('control-evidence-scoring');
    expect(byModule.get('investigation-support')).toContain('sar-narrative-writer');
  });

  it('negative control: the retired ids still do not resolve', () => {
    for (const id of DEAD_IDS) expect(getSkillById(id), id).toBeUndefined();
  });

  it('the loader warns once per module for an id no skill has, and not for good ones', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(validateRecommendedSkills('test-module-good', [BUILTIN_ID, DISK_ID])).toEqual([]);
      expect(warn).not.toHaveBeenCalled();

      expect(validateRecommendedSkills('test-module-bad', [BUILTIN_ID, 'fcp-compliance'])).toEqual(['fcp-compliance']);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0][0])).toContain('test-module-bad');
      expect(String(warn.mock.calls[0][0])).toContain('fcp-compliance');

      // the dev watcher reloads modules on every edit — no second warning for the same module
      expect(validateRecommendedSkills('test-module-bad', ['fcp-compliance'])).toEqual(['fcp-compliance']);
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
    }
  });
});

describe('GET /api/skills — the list the SkillAttacher renders', () => {
  let server: Server;
  let base = '';

  beforeAll(async () => {
    await preloadDiskSkills();
    const db = {
      get: async () => undefined,
      all: async () => [],
      run: async () => ({ changes: 0, lastInsertRowid: 0 }),
      exec: async () => {},
    } as unknown as DatabaseAdapter;
    const app = express();
    // same mount order as server/index.ts: modulesRouter (/skills/all) before the skills routes (/skills/:id)
    app.use('/api', modulesRouter);
    app.use('/api', await createSkillsRoutes(db));
    await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()); });
    const addr = server.address();
    if (addr === null || typeof addr === 'string') throw new Error('No server address');
    base = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => { server?.close(() => resolve()); });
  });

  it('includes the disk packs and carries no prompt bodies', async () => {
    const res = await fetch(`${base}/api/skills`);
    expect(res.status).toBe(200);
    const list = await res.json() as Array<Record<string, unknown>>;
    const ids = list.map((s) => s.id);
    expect(ids).toContain(BUILTIN_ID);
    expect(ids).toContain(DISK_ID);
    for (const s of list) expect(s, String(s.id)).not.toHaveProperty('prompt');

    const sg = list.find((s) => s.id === DISK_ID)!;
    expect(sg.category).toBe('jurisdiction');
    expect(sg.source).toBe('disk');
    expect(typeof sg.name).toBe('string');
    expect(typeof sg.description).toBe('string');
    expect(Array.isArray(sg.tags)).toBe(true);
  });

  it('GET /api/skills/:id returns the full prompt for a disk pack', async () => {
    const res = await fetch(`${base}/api/skills/${DISK_ID}`);
    expect(res.status).toBe(200);
    const skill = await res.json() as { id: string; prompt: string };
    expect(skill.id).toBe(DISK_ID);
    expect(skill.prompt).toContain(DISK_PROMPT_PHRASE);

    const missing = await fetch(`${base}/api/skills/fcp-compliance`);
    expect(missing.status).toBe(404);
  });

  it('GET /api/skills/all (modules router) returns the same ids, also without prompts', async () => {
    const [a, b] = await Promise.all([
      fetch(`${base}/api/skills`).then((r) => r.json() as Promise<Array<Record<string, unknown>>>),
      fetch(`${base}/api/skills/all`).then((r) => r.json() as Promise<Array<Record<string, unknown>>>),
    ]);
    expect(b.map((s) => s.id).sort()).toEqual(a.map((s) => s.id).sort());
    for (const s of b) expect(s, String(s.id)).not.toHaveProperty('prompt');
  });
});
