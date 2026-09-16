import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { MODULES, AREAS } from '../../src/lib/constants';

/**
 * Integrity guard over the static module/area registry (src/lib/constants.ts).
 *
 * Catches the class of bug found in the 2026-05-30 portfolio audit: a duplicate
 * id silently making a module (or area) resolve to the wrong definition. These
 * are pure-data invariants — cheap to assert, expensive if violated (a module
 * can end up serving the wrong area's prompt).
 */
describe('module / area id integrity', () => {
  const moduleIds = MODULES.map((m) => m.id);
  const areaIds = AREAS.map((a) => a.id);

  it('every module id is unique', () => {
    const dupes = moduleIds.filter((id, i) => moduleIds.indexOf(id) !== i);
    expect(dupes).toEqual([]);
  });

  it('every area id is unique', () => {
    const dupes = areaIds.filter((id, i) => areaIds.indexOf(id) !== i);
    expect(dupes).toEqual([]);
  });

  it('no id is shared between a module and an area (cross-namespace collision)', () => {
    const moduleIdSet = new Set(moduleIds);
    const collisions = areaIds.filter((id) => moduleIdSet.has(id));
    expect(collisions).toEqual([]);
  });

  it('every area.moduleIds entry resolves to a real module', () => {
    const moduleIdSet = new Set(moduleIds);
    const dangling: string[] = [];
    for (const area of AREAS as Array<{ id: string; moduleIds?: string[] }>) {
      for (const mid of area.moduleIds ?? []) {
        if (!moduleIdSet.has(mid)) dangling.push(`${area.id} -> ${mid}`);
      }
    }
    expect(dangling).toEqual([]);
  });

  it('every module id resolves to a non-empty system prompt on the server', () => {
    // Mirrors the server's prompt resolution order (module-loader.ts):
    //   1. server/areas/<area>/modules/<dir>/system-prompt.md, keyed by module.json id
    //   2. legacy fallback: server/prompts/<id>.md
    // Catches the June-2026 class of bug where an advertised module silently
    // runs as a generic assistant because no prompt exists anywhere
    // (re-investment-analysis, theory-of-change, monitoring-evaluation-framework,
    // donor-reporting, and the talent-ad-generator filename mismatch).
    const repoRoot = path.resolve(__dirname, '..', '..');
    const areasDir = path.join(repoRoot, 'server', 'areas');
    const legacyPromptsDir = path.join(repoRoot, 'server', 'prompts');

    const promptedIds = new Set<string>();
    for (const areaEntry of fs.readdirSync(areasDir, { withFileTypes: true })) {
      if (!areaEntry.isDirectory()) continue;
      const modulesDir = path.join(areasDir, areaEntry.name, 'modules');
      if (!fs.existsSync(modulesDir)) continue;
      for (const modEntry of fs.readdirSync(modulesDir, { withFileTypes: true })) {
        if (!modEntry.isDirectory()) continue;
        const configPath = path.join(modulesDir, modEntry.name, 'module.json');
        const promptPath = path.join(modulesDir, modEntry.name, 'system-prompt.md');
        if (!fs.existsSync(configPath) || !fs.existsSync(promptPath)) continue;
        if (fs.readFileSync(promptPath, 'utf-8').trim().length === 0) continue;
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as { id?: string };
        if (config.id) promptedIds.add(config.id);
      }
    }

    const promptless: string[] = [];
    for (const id of moduleIds) {
      if (promptedIds.has(id)) continue;
      const legacyPath = path.join(legacyPromptsDir, `${id}.md`);
      const hasLegacy = fs.existsSync(legacyPath)
        && fs.readFileSync(legacyPath, 'utf-8').trim().length > 0;
      if (!hasLegacy) promptless.push(id);
    }
    expect(promptless).toEqual([]);
  });

  it('no module.json id appears under two different server areas', () => {
    // 2026-07-17: the server module loader flattens all areas into one Map keyed
    // by module id (module-loader.ts), so a duplicated id makes the
    // alphabetically-later area silently WIN and the other area serve the wrong
    // prompt. Found live four times (financial-analysis, proposal-generator,
    // regulatory-exam-prep, transfer-pricing-documentation) — all renamed to
    // area-distinct ids. This pins the invariant.
    const repoRoot = path.resolve(__dirname, '..', '..');
    const areasDir = path.join(repoRoot, 'server', 'areas');
    const seen = new Map<string, string>(); // id -> first area
    const duplicated: string[] = [];
    for (const areaEntry of fs.readdirSync(areasDir, { withFileTypes: true })) {
      if (!areaEntry.isDirectory()) continue;
      const modulesDir = path.join(areasDir, areaEntry.name, 'modules');
      if (!fs.existsSync(modulesDir)) continue;
      for (const modEntry of fs.readdirSync(modulesDir, { withFileTypes: true })) {
        if (!modEntry.isDirectory()) continue;
        const configPath = path.join(modulesDir, modEntry.name, 'module.json');
        if (!fs.existsSync(configPath)) continue;
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as { id?: string };
        if (!config.id) continue;
        const firstArea = seen.get(config.id);
        if (firstArea && firstArea !== areaEntry.name) {
          duplicated.push(`${config.id} (${firstArea} + ${areaEntry.name})`);
        } else {
          seen.set(config.id, areaEntry.name);
        }
      }
    }
    expect(duplicated).toEqual([]);
  });
});

describe('legacy server/prompts directory', () => {
  // 2026-09-16: 19 files in server/prompts/ shadowed a live
  // server/areas/<area>/modules/<id>/system-prompt.md and had drifted — the
  // legacy sanctions-advisory carried three sections the live copy had lost,
  // while two readers (task-agent capability fallback, companion persona
  // preview) still preferred the legacy file. The live copies were merged and
  // the shadows deleted; both readers now go through getModuleSystemPrompt().
  // These two tests pin that (a) a shadow copy cannot creep back and (b) the
  // "ghost" ids that live ONLY in server/prompts still resolve through the
  // loader's fallback.
  const repoRoot = path.resolve(__dirname, '..', '..');
  const areasDir = path.join(repoRoot, 'server', 'areas');
  const legacyPromptsDir = path.join(repoRoot, 'server', 'prompts');

  function liveModuleIds(): Set<string> {
    const ids = new Set<string>();
    for (const areaEntry of fs.readdirSync(areasDir, { withFileTypes: true })) {
      if (!areaEntry.isDirectory()) continue;
      const modulesDir = path.join(areasDir, areaEntry.name, 'modules');
      if (!fs.existsSync(modulesDir)) continue;
      for (const modEntry of fs.readdirSync(modulesDir, { withFileTypes: true })) {
        if (!modEntry.isDirectory()) continue;
        const configPath = path.join(modulesDir, modEntry.name, 'module.json');
        if (!fs.existsSync(configPath)) continue;
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as { id?: string };
        if (config.id) ids.add(config.id);
      }
    }
    return ids;
  }

  function legacyPromptIds(): string[] {
    return fs.readdirSync(legacyPromptsDir)
      .filter((f) => f.endsWith('.md') && !f.startsWith('_')) // _foundation / _explainability are layers, not modules
      .map((f) => f.slice(0, -'.md'.length));
  }

  it('no server/prompts/<id>.md shadows an id that has a live module dir', () => {
    const live = liveModuleIds();
    const shadowed = legacyPromptIds().filter((id) => live.has(id));
    expect(shadowed).toEqual([]);
  });

  it('every ghost id (server/prompts only) still resolves through getModuleSystemPrompt', async () => {
    // module-loader starts a recursive fs.watch on server/areas outside
    // production; keep that out of the test worker.
    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    let getModuleSystemPrompt: (id: string) => Promise<string | null>;
    try {
      ({ getModuleSystemPrompt } = await import('../../server/services/module-loader'));
    } finally {
      process.env.NODE_ENV = prevEnv;
    }
    const live = liveModuleIds();
    const ghosts = legacyPromptIds().filter((id) => !live.has(id));
    expect(ghosts.length, 'the ghost set went empty — did the fallback dir move?').toBeGreaterThan(0);

    const unresolved: string[] = [];
    for (const id of ghosts) {
      const prompt = await getModuleSystemPrompt(id);
      if (!prompt || prompt.trim().length === 0) unresolved.push(id);
    }
    expect(unresolved).toEqual([]);
  }, 30_000);
});
