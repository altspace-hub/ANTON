import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { MODULES, AREAS } from '../../src/lib/constants';
import { OUTPUT_FORMATS } from '../../src/lib/output-format-definitions';

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

describe('module.json defaults.outputFormats', () => {
  // 2026-09-16 (Wave 3): nine module.json files pointed their default output
  // format at ids that did not exist — 'risk-register' (business-wide-risk-
  // assessment, hw-maintain-cve-applicability, six atlas-* modules) and
  // 'entity-register' (atlas-exposure-mapper). buildOutputInstruction()
  // silently drops an unknown id, so those modules ran with NO format
  // instruction while advertising a default. Both formats exist now; this
  // pins that every declared default resolves to a real OUTPUT_FORMATS entry.
  const repoRoot = path.resolve(__dirname, '..', '..');
  const areasDir = path.join(repoRoot, 'server', 'areas');

  function declaredDefaults(): Array<{ area: string; dir: string; id: string; formats: string[] }> {
    const out: Array<{ area: string; dir: string; id: string; formats: string[] }> = [];
    for (const areaEntry of fs.readdirSync(areasDir, { withFileTypes: true })) {
      if (!areaEntry.isDirectory()) continue;
      const modulesDir = path.join(areasDir, areaEntry.name, 'modules');
      if (!fs.existsSync(modulesDir)) continue;
      for (const modEntry of fs.readdirSync(modulesDir, { withFileTypes: true })) {
        if (!modEntry.isDirectory()) continue;
        const configPath = path.join(modulesDir, modEntry.name, 'module.json');
        if (!fs.existsSync(configPath)) continue;
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as { id?: string; defaults?: { outputFormats?: unknown } };
        const formats = config.defaults?.outputFormats;
        if (!Array.isArray(formats)) continue;
        out.push({ area: areaEntry.name, dir: modEntry.name, id: config.id ?? modEntry.name, formats: formats.map(String) });
      }
    }
    return out;
  }

  it('every defaults.outputFormats id resolves to an OUTPUT_FORMATS entry', () => {
    const known = new Set(OUTPUT_FORMATS.map((f) => f.id));
    const declared = declaredDefaults();
    expect(declared.length, 'module.json defaults went missing — did the loader change?').toBeGreaterThan(500);
    const dangling: string[] = [];
    for (const m of declared) {
      for (const id of m.formats) {
        if (!known.has(id)) dangling.push(`${m.area}/${m.dir} -> ${id}`);
      }
    }
    expect(dangling).toEqual([]);
  });

  it('the nine modules that pointed at the missing register formats now resolve', () => {
    const known = new Set(OUTPUT_FORMATS.map((f) => f.id));
    expect(known.has('risk-register')).toBe(true);
    expect(known.has('entity-register')).toBe(true);
    const byId = new Map(declaredDefaults().map((m) => [m.id, m.formats]));
    const expectRiskRegister = [
      'business-wide-risk-assessment', 'hw-maintain-cve-applicability', 'atlas-appetite-manager',
      'atlas-control-mapper', 'atlas-inherent-scorer', 'atlas-residual-calculator',
      'atlas-threat-cataloguer', 'atlas-vulnerability-assessor',
    ];
    for (const id of expectRiskRegister) {
      expect(byId.get(id), id).toContain('risk-register');
    }
    expect(byId.get('atlas-exposure-mapper')).toContain('entity-register');
  });
});

describe('module.json defaults vs the client catalogue', () => {
  // 2026-09-18 (Wave 4, track C): for any module the client catalogue knows,
  // HALF of its module.json is inert. ModulePage.tsx's fresh-module-init branch
  // ("Hardcoded module — use constants defaults directly") applies thinking,
  // creativity, outputFormats and knowledgeSources FROM src/lib/constants.ts,
  // and then asks the server only for areaId, guidedInputs, recommendedSkills,
  // transparencyLevel, exampleInput and recommendedPersonas. Only a module the
  // API discovers that is NOT in MODULES takes its defaults from disk.
  //
  // So a `defaults` block on disk that disagrees with the catalogue reads like
  // intent and does nothing. Measured on 2026-09-18: 50 of the 550 matched
  // modules disagreed — outputFormats 36, webSearch 13, creativity 11,
  // thinking 9. Twelve modules declared webSearchEnabled: true and ran with it
  // off (healthcare-gdpr, which carries a live EHDS phase-in timetable, and
  // tax-rot-rut-guide, whose whole answer is a Skatteverket figure, among
  // them); one (double-materiality) went the other way. Each was reconciled on
  // merit — some by correcting the catalogue, some by correcting the disk file
  // — and this pins the result at zero. There is deliberately no allowlist.
  const repoRoot = path.resolve(__dirname, '..', '..');
  const areasDir = path.join(repoRoot, 'server', 'areas');

  type DiskDefaults = {
    thinking?: unknown;
    creativity?: unknown;
    outputFormats?: unknown;
    knowledgeSources?: Record<string, { enabled?: unknown; webSearchEnabled?: unknown } | undefined>;
  };

  function diskModules(): Array<{ area: string; dir: string; id: string; defaults: DiskDefaults }> {
    const out: Array<{ area: string; dir: string; id: string; defaults: DiskDefaults }> = [];
    for (const areaEntry of fs.readdirSync(areasDir, { withFileTypes: true })) {
      if (!areaEntry.isDirectory()) continue;
      const modulesDir = path.join(areasDir, areaEntry.name, 'modules');
      if (!fs.existsSync(modulesDir)) continue;
      for (const modEntry of fs.readdirSync(modulesDir, { withFileTypes: true })) {
        if (!modEntry.isDirectory()) continue;
        const configPath = path.join(modulesDir, modEntry.name, 'module.json');
        if (!fs.existsSync(configPath)) continue;
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as { id?: string; defaults?: DiskDefaults };
        out.push({
          area: areaEntry.name,
          dir: modEntry.name,
          id: config.id ?? modEntry.name,
          defaults: config.defaults ?? {},
        });
      }
    }
    return out;
  }

  /**
   * What the four knowledge-source modes are actually set to for a catalogue
   * module — the hard defaults in ModulePage's `defaultKS`, with each mode the
   * catalogue declares Object.assign'ed over the top. A mode the catalogue
   * omits keeps the hard default, which is why a module.json can say
   * `localFolder: { enabled: true }` and still run with local folders off.
   */
  function effectiveModes(m: (typeof MODULES)[number]): Record<string, { enabled: boolean; webSearchEnabled?: boolean }> {
    const modes: Record<string, { enabled: boolean; webSearchEnabled?: boolean }> = {
      claudeKnowledge: { enabled: true, webSearchEnabled: false },
      onlineReference: { enabled: false },
      localFolder: { enabled: false },
      combinedMode: { enabled: false },
    };
    const declared = (m.defaults.knowledgeSources ?? {}) as Record<string, { enabled?: boolean; webSearchEnabled?: boolean } | undefined>;
    for (const name of ['claudeKnowledge', 'onlineReference', 'localFolder'] as const) {
      const d = declared[name];
      if (d) Object.assign(modes[name], d);
    }
    return modes;
  }

  it('no catalogue module\'s module.json defaults contradict the catalogue', () => {
    const catalogue = new Map(MODULES.map((m) => [m.id, m]));
    const conflicts: string[] = [];
    let compared = 0;

    for (const disk of diskModules()) {
      const m = catalogue.get(disk.id);
      if (!m) continue; // API-discovered only — its module.json IS authoritative
      compared++;
      const where = `${disk.area}/${disk.dir}`;
      const d = disk.defaults;

      if (typeof d.thinking === 'string' && d.thinking !== m.defaults.thinking) {
        conflicts.push(`${where} thinking: disk=${d.thinking} catalogue=${m.defaults.thinking}`);
      }
      if (typeof d.creativity === 'string' && d.creativity !== m.defaults.creativity) {
        conflicts.push(`${where} creativity: disk=${d.creativity} catalogue=${m.defaults.creativity}`);
      }
      if (Array.isArray(d.outputFormats)) {
        const onDisk = d.outputFormats.map(String).join(',');
        const inCatalogue = (m.defaults.outputFormats ?? []).join(',');
        if (onDisk !== inCatalogue) {
          conflicts.push(`${where} outputFormats: disk=[${onDisk}] catalogue=[${inCatalogue}]`);
        }
      }

      const effective = effectiveModes(m);
      for (const [name, mode] of Object.entries(d.knowledgeSources ?? {})) {
        const want = effective[name];
        if (!mode || !want) continue;
        if (typeof mode.enabled === 'boolean' && mode.enabled !== want.enabled) {
          conflicts.push(`${where} ${name}.enabled: disk=${mode.enabled} effective=${want.enabled}`);
        }
        if (name === 'claudeKnowledge'
          && typeof mode.webSearchEnabled === 'boolean'
          && mode.webSearchEnabled !== want.webSearchEnabled) {
          conflicts.push(`${where} webSearchEnabled: disk=${mode.webSearchEnabled} effective=${want.webSearchEnabled}`);
        }
      }
    }

    expect(compared, 'no module.json matched a catalogue id — did the walker break?').toBeGreaterThan(500);
    expect(conflicts).toEqual([]);
  });

  it('ModulePage still takes a catalogue module\'s defaults from the catalogue', () => {
    // The premise the guard rests on. If this branch is ever changed so that a
    // catalogue module reads its defaults from the server instead, the guard
    // above is pointing the wrong way and must be revisited rather than
    // silently kept green.
    const page = fs.readFileSync(path.join(repoRoot, 'src', 'pages', 'ModulePage.tsx'), 'utf-8');
    const branch = page.slice(page.indexOf('Hardcoded module'), page.indexOf('} else if (dynamicCfg)'));
    expect(branch.length, 'the fresh-module-init branch moved or was renamed').toBeGreaterThan(0);
    for (const line of [
      'setThinking(module.defaults.thinking)',
      'setCreativity(module.defaults.creativity)',
      'setSelectedOutputFormats(module.defaults.outputFormats)',
      'module.defaults.knowledgeSources.claudeKnowledge',
    ]) {
      expect(branch, `ModulePage no longer applies ${line} from the catalogue`).toContain(line);
    }
  });
});

describe('module.json recommendedSkills', () => {
  // 2026-09-17 (Wave 1, track E): `recommendedSkills` drives ModulePage's
  // suggestion banner, and "Apply" attaches EVERY id in the array at once.
  // Two failure modes are worth pinning:
  //   (a) an id no skill has — module-loader.validateRecommendedSkills() only
  //       warns on the server console, and the banner silently drops it, so a
  //       typo is invisible in the product (the class of bug the retired
  //       client-side MODULE_DEFAULT_SKILLS map carried with eight dead ids);
  //   (b) a long list — the banner is one line of skill names and one Apply
  //       button, so six plausible suggestions are worse than two right ones.
  //       Four is the agreed ceiling.
  const MAX_RECOMMENDED_SKILLS = 4;
  const repoRoot = path.resolve(__dirname, '..', '..');
  const areasDir = path.join(repoRoot, 'server', 'areas');

  function declaredRecommendations(): Array<{ area: string; dir: string; id: string; skills: string[] }> {
    const out: Array<{ area: string; dir: string; id: string; skills: string[] }> = [];
    for (const areaEntry of fs.readdirSync(areasDir, { withFileTypes: true })) {
      if (!areaEntry.isDirectory()) continue;
      const modulesDir = path.join(areasDir, areaEntry.name, 'modules');
      if (!fs.existsSync(modulesDir)) continue;
      for (const modEntry of fs.readdirSync(modulesDir, { withFileTypes: true })) {
        if (!modEntry.isDirectory()) continue;
        const configPath = path.join(modulesDir, modEntry.name, 'module.json');
        if (!fs.existsSync(configPath)) continue;
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as { id?: string; recommendedSkills?: unknown };
        const skills = config.recommendedSkills;
        if (!Array.isArray(skills)) continue;
        out.push({ area: areaEntry.name, dir: modEntry.name, id: config.id ?? modEntry.name, skills: skills.map(String) });
      }
    }
    return out;
  }

  /** The ids the server's own resolver can see: built-ins + the server/skills/ disk packs. */
  async function resolvableSkillIds(): Promise<Set<string>> {
    const { getAllSkillsAsync } = await import('../../server/services/skills-manager');
    return new Set((await getAllSkillsAsync()).map((s) => s.id));
  }

  it('every recommendedSkills id resolves to a real skill', async () => {
    const known = await resolvableSkillIds();
    const declared = declaredRecommendations();
    expect(declared.length, 'no module declares recommendedSkills — did the walker break?').toBeGreaterThan(50);
    const dangling: string[] = [];
    for (const m of declared) {
      for (const id of m.skills) {
        if (!known.has(id)) dangling.push(`${m.area}/${m.dir} -> ${id}`);
      }
    }
    expect(dangling).toEqual([]);
  });

  it(`no module recommends more than ${MAX_RECOMMENDED_SKILLS} skills`, () => {
    const over = declaredRecommendations()
      .filter((m) => m.skills.length > MAX_RECOMMENDED_SKILLS)
      .map((m) => `${m.area}/${m.dir} (${m.skills.length})`);
    expect(over).toEqual([]);
  });

  it('no module lists the same skill twice', () => {
    const dupes: string[] = [];
    for (const m of declaredRecommendations()) {
      const seen = new Set<string>();
      for (const id of m.skills) {
        if (seen.has(id)) dupes.push(`${m.area}/${m.dir} -> ${id}`);
        seen.add(id);
      }
    }
    expect(dupes).toEqual([]);
  });
});
