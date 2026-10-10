/**
 * no-skill-prompt-baseline.test.ts — owner rule (2026-10-10, FCP blueprint
 * skills): running a module with no skill selected must produce exactly
 * today's prompt.
 *
 * The blueprint skills add disk skills, `recommendedSkills` entries, output
 * formats and an auto-attach rule for those formats. None of that may reach a
 * run that did not choose it. This test composes the system prompt of EVERY
 * built-in module the way a default Work run does — the module's own default
 * output formats (and the skills those formats already auto-attach), its
 * recommended personas, no user-selected skill — and compares the SHA-256 of
 * each prompt with the baseline recorded on the tree BEFORE the blueprint
 * skills were added (tests/fixtures/no-skill-prompt-baseline.json, written by
 * running this file once with UPDATE_PROMPT_BASELINE=1 on origin/main 692e7f2b).
 *
 * The date layer is pinned (config.now) and no profile, project, pack or
 * document layer is passed, so the only inputs are the files in the repo.
 * A change to any module prompt, format text or auto-attached skill text
 * shows here as a changed hash — re-record the baseline only for a change
 * that is meant to alter default prompts, and say so in the commit.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { describe, it, expect, beforeAll } from 'vitest';
import { composeSystemPrompt } from '../../server/services/prompt-composer.js';
import { getAllModules } from '../../server/services/module-loader.js';
import { getAutoAttachSkillIds, preloadDiskSkills } from '../../server/services/skills-manager.js';
import { buildOutputInstruction } from '../../src/lib/output-format-definitions.js';

const FIXTURE = path.resolve(__dirname, '..', 'fixtures', 'no-skill-prompt-baseline.json');
const NOW = new Date('2026-10-10T09:00:00Z');

type Creativity = 'strict' | 'balanced' | 'creative';

async function defaultRunPromptHashes(): Promise<Record<string, string>> {
  const modules = await getAllModules();
  const out: Record<string, string> = {};
  for (const mod of [...modules].sort((a, b) => a.id.localeCompare(b.id))) {
    const defaults = (mod.defaults ?? {}) as { outputFormats?: unknown; thinking?: unknown; creativity?: unknown };
    const formats = Array.isArray(defaults.outputFormats) ? defaults.outputFormats.filter((f): f is string => typeof f === 'string') : [];
    // The Work route: no user-selected skill, plus whatever the selected formats auto-attach.
    const autoAttach = getAutoAttachSkillIds(formats);
    const creativity: Creativity = defaults.creativity === 'strict' || defaults.creativity === 'creative' ? defaults.creativity : 'balanced';
    const prompt = await composeSystemPrompt({
      moduleId: mod.id,
      areaId: mod.areaId,
      creativity,
      thinking: typeof defaults.thinking === 'string' ? defaults.thinking : 'think',
      outputInstruction: buildOutputInstruction(formats),
      selectedPersonas: Array.isArray(mod.recommendedPersonas) ? mod.recommendedPersonas : undefined,
      selectedSkills: autoAttach.length > 0 ? autoAttach : undefined,
      now: NOW,
    });
    out[mod.id] = crypto.createHash('sha256').update(prompt, 'utf8').digest('hex');
  }
  return out;
}

describe('a module run with no skill selected gives exactly the baseline prompt', () => {
  let actual: Record<string, string> = {};

  beforeAll(async () => {
    await preloadDiskSkills();
    actual = await defaultRunPromptHashes();
    if (process.env.UPDATE_PROMPT_BASELINE === '1') {
      fs.mkdirSync(path.dirname(FIXTURE), { recursive: true });
      fs.writeFileSync(FIXTURE, `${JSON.stringify(actual, null, 1)}\n`, 'utf8');
    }
  }, 120_000);

  it('composes a prompt for every built-in module (a broken walker would compare nothing)', () => {
    expect(Object.keys(actual).length).toBeGreaterThan(500);
  });

  it('every module present at baseline still composes the identical prompt', () => {
    const baseline = JSON.parse(fs.readFileSync(FIXTURE, 'utf8')) as Record<string, string>;
    expect(Object.keys(baseline).length).toBeGreaterThan(500);
    const changed = Object.keys(baseline).filter((id) => actual[id] !== baseline[id]);
    expect(changed).toEqual([]);
  });
});
