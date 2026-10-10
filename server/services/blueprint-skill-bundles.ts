/**
 * blueprint-skill-bundles.ts — installable .anton bundles for the FCP
 * blueprint skills (server/skills/fcp-bp-*).
 *
 * ANTON installs a skill on another instance through a MODULE bundle that
 * embeds the skill's text (skills/<id>.md, checked against the manifest's
 * sha256); the importer writes it to the `skills` table and it then appears
 * in the skill picker. So each blueprint ships as a small module named after
 * its deliverable, embedding the blueprint skill and the house standards:
 *
 *   • one bundle per blueprint skill — the module runs with the blueprint
 *     skill and the house standards, and with the paired output format when
 *     the blueprint has one;
 *   • one bundle for the house standards alone;
 *   • one "all blueprints" bundle — it installs all fourteen skills, and its
 *     module (a short guide to which blueprint fits which deliverable) runs
 *     with the house standards only, so nothing large is attached unasked.
 *
 * The bundles are written by scripts/build-blueprint-skill-bundles.ts and
 * proven importable by tests/services/blueprint-skill-bundles.test.ts.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundleModuleDefinitionToAnton, type ModuleExportData } from './anton-bundler.js';
import { getSkillByIdAsync, parseSkillBlueprintMeta, type Skill, type SkillBlueprintMeta } from './skills-manager.js';
import type { EmbeddedSkill } from './anton-bundle-embeds.js';

const SKILLS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'skills');

export const BLUEPRINT_SKILL_PREFIX = 'fcp-bp-';
export const HOUSE_STANDARDS_SKILL_ID = 'fcp-bp-house-standards';
export const ALL_BLUEPRINTS_BUNDLE = 'fcp-blueprints-all';

/** Every FCP blueprint skill id on disk, house standards first, then alphabetical. */
export function listBlueprintSkillIds(): string[] {
  const ids = fs.readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name.startsWith(BLUEPRINT_SKILL_PREFIX) && fs.existsSync(path.join(SKILLS_DIR, e.name, 'skill.json')))
    .map((e) => e.name)
    .sort();
  return [HOUSE_STANDARDS_SKILL_ID, ...ids.filter((id) => id !== HOUSE_STANDARDS_SKILL_ID)];
}

/** The `blueprint` block of a skill's skill.json, read straight from disk. */
export function readBlueprintMeta(skillId: string): SkillBlueprintMeta {
  const raw = JSON.parse(fs.readFileSync(path.join(SKILLS_DIR, skillId, 'skill.json'), 'utf8')) as { blueprint?: unknown };
  const meta = parseSkillBlueprintMeta(raw.blueprint);
  if (!meta) throw new Error(`server/skills/${skillId}/skill.json has no valid blueprint block`);
  return meta;
}

async function requireSkill(id: string): Promise<Skill> {
  const skill = await getSkillByIdAsync(id);
  if (!skill) throw new Error(`Skill not found: ${id}`);
  return skill;
}

function toEmbedded(skill: Skill): EmbeddedSkill {
  return {
    id: skill.id,
    name: skill.name,
    description: skill.description,
    version: skill.version,
    author: skill.author,
    category: skill.category,
    tags: skill.tags,
    prompt: skill.prompt,
    source: 'disk',
  };
}

/** The deliverable name a blueprint skill's label carries ("FCP blueprint [DRAFT]: X" → "X"). */
function deliverableName(skill: Skill): string {
  return skill.name.replace(/^FCP blueprint(?: \[DRAFT\])?:\s*/, '');
}

function moduleIdFor(skillId: string): string {
  return skillId.replace(/^fcp-bp-/, 'fcp-blueprint-');
}

function blueprintModulePrompt(skill: Skill, meta: SkillBlueprintMeta): string {
  const draft = meta.status === 'draft'
    ? '\n\nThe blueprint is a draft that still needs the team\'s input. Say so at the start of the deliverable, and treat its section order, scales and calibrations as proposals.'
    : '';
  return `# ${deliverableName(skill)} (FCP blueprint)

You produce this deliverable for a financial crime prevention engagement by following the attached skill "${skill.name}" (\`${skill.id}\`): its method, its deliverable template and its quality checklist. The skill "FCP blueprint: house standards" (\`${HOUSE_STANDARDS_SKILL_ID}\`) sets the shared writing rules and terminology.

Before you write, check the request brief: the task, the issuing firm, the client's legal name, the institution type, the jurisdiction and the output language. If anything required is missing, ask at most five short questions in one message, or proceed with clearly marked assumptions when the user says so.

A blueprint changes wording, the evidence asked for and the report layout; it never changes how a score is computed. Use any rating that ANTON, the module or the user supplies exactly as given. Mark every gap as [DATA NEEDED: …], [TO CONFIRM: …], [ASSUMPTION: …] or [VERIFY REFERENCE].${draft}`;
}

function baseExport(id: string, name: string, description: string, prompt: string, config: Record<string, unknown>, embedded: EmbeddedSkill[], tags: string[]): ModuleExportData {
  const now = new Date().toISOString();
  return {
    id,
    name,
    description,
    icon: '📘',
    color: '#0D7D6C',
    systemPrompt: prompt,
    guidedInputs: [],
    defaultConfig: {
      thinking: 'think_hard',
      creativity: 'balanced',
      writingTone: 'professional',
      ...config,
      author: 'FCP blueprint library',
      tags,
    },
    author: 'FCP blueprint library',
    organization: 'ANTON',
    version: '1.0.0',
    tags,
    category: 'fcp',
    license: 'Proprietary',
    createdAt: now,
    updatedAt: now,
    embeddedSkills: embedded,
    embeddedPersonas: [],
    unresolvedSkills: [],
    unresolvedPersonas: [],
  };
}

/** The bundle for one blueprint skill (or the house standards on their own). */
export async function buildBlueprintSkillBundle(skillId: string): Promise<{ fileName: string; moduleId: string; buffer: Buffer }> {
  const skill = await requireSkill(skillId);
  const meta = readBlueprintMeta(skillId);
  const house = await requireSkill(HOUSE_STANDARDS_SKILL_ID);
  const moduleId = moduleIdFor(skillId);

  if (skillId === HOUSE_STANDARDS_SKILL_ID) {
    const data = baseExport(
      moduleId,
      'FCP house standards (blueprint)',
      'Installs the FCP blueprint house standards skill: quality bar, writing rules, English/Swedish terminology and gap markers. The module reviews or drafts any financial crime prevention text against them.',
      `# FCP house standards (blueprint)

You review or draft financial crime prevention material against the attached skill "FCP blueprint: house standards" (\`${HOUSE_STANDARDS_SKILL_ID}\`): its way of thinking, its writing rules, its finding format and its terminology. When the user supplies a draft, return the issues in order of importance with a suggested rewrite for each. A rating that ANTON, the module or the user supplies is used exactly as given. Mark every gap as [DATA NEEDED: …], [TO CONFIRM: …], [ASSUMPTION: …] or [VERIFY REFERENCE].`,
      { skills: [HOUSE_STANDARDS_SKILL_ID] },
      [toEmbedded(house)],
      ['fcp-blueprint', 'house standards'],
    );
    return { fileName: `${moduleId}.anton`, moduleId, buffer: bundleModuleDefinitionToAnton(data) };
  }

  const name = `${deliverableName(skill)} (FCP blueprint${meta.status === 'draft' ? ', draft' : ''})`;
  const data = baseExport(
    moduleId,
    name,
    `${meta.status === 'draft' ? 'DRAFT – needs team input. ' : ''}Installs the skill "${skill.name}" and the FCP house standards, with a module that runs them together${meta.pairedOutputFormat ? ` in the blueprint's own layout (output format ${meta.pairedOutputFormat})` : ''}.`,
    blueprintModulePrompt(skill, meta),
    {
      skills: [skillId, HOUSE_STANDARDS_SKILL_ID],
      ...(meta.pairedOutputFormat ? { outputFormats: [meta.pairedOutputFormat] } : {}),
    },
    [toEmbedded(skill), toEmbedded(house)],
    ['fcp-blueprint', meta.slug, ...(meta.status === 'draft' ? ['draft'] : [])],
  );
  return { fileName: `${moduleId}.anton`, moduleId, buffer: bundleModuleDefinitionToAnton(data) };
}

/** The "all blueprints" bundle: installs every blueprint skill; its module attaches the house standards only. */
export async function buildAllBlueprintsBundle(): Promise<{ fileName: string; moduleId: string; buffer: Buffer }> {
  const ids = listBlueprintSkillIds();
  const skills = await Promise.all(ids.map((id) => requireSkill(id)));
  const rows = skills.filter((s) => s.id !== HOUSE_STANDARDS_SKILL_ID).map((s) => {
    const meta = readBlueprintMeta(s.id);
    return `- **${deliverableName(s)}** — skill \`${s.id}\`${meta.status === 'draft' ? ' (draft – needs team input)' : ''}${meta.pairedOutputFormat ? `; layout: output format \`${meta.pairedOutputFormat}\`` : ''}`;
  });
  const prompt = `# FCP blueprint library — guide

The FCP blueprint skills are installed on this instance. This module helps the user pick the right one. Given the deliverable the user describes, name the blueprint skill that fits (from the list below), say whether it is a draft, and tell the user to attach that skill in the skill picker — and, where one is listed, to select its output format — before running the module that produces the deliverable. Then list the inputs that blueprint needs to start. Do not draft the deliverable here; this module attaches only the house standards (\`${HOUSE_STANDARDS_SKILL_ID}\`).

${rows.join('\n')}

A blueprint changes wording, the evidence asked for and the report layout; it never changes how a score is computed.`;
  const data = baseExport(
    ALL_BLUEPRINTS_BUNDLE,
    'FCP blueprint library (all blueprints)',
    `Installs all ${skills.length} FCP blueprint skills (the house standards and ${skills.length - 1} deliverable blueprints, four of them drafts) and a guide module that names the blueprint for a deliverable. Attach a blueprint skill in the skill picker of the module that produces the deliverable.`,
    prompt,
    { skills: [HOUSE_STANDARDS_SKILL_ID] },
    skills.map(toEmbedded),
    ['fcp-blueprint', 'library'],
  );
  return { fileName: `${ALL_BLUEPRINTS_BUNDLE}.anton`, moduleId: ALL_BLUEPRINTS_BUNDLE, buffer: bundleModuleDefinitionToAnton(data) };
}
