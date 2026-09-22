/**
 * anton-bundle-skills-personas.test.ts — Wave 6, track G: a module's skills
 * and personas travel WITH their text.
 *
 * Before: default-config.json carried skill / persona ids only. The skills
 * table was empty and persona text lived in static maps, so on another ANTON
 * an unknown id was silently ignored and the module ran without it.
 *
 * Now:
 *   EXPORT  skills/<id>.md and personas/<id>.md for every id the module
 *           references (resolved from built-ins, disk packs, the skills /
 *           personas tables and the server persona helper), each listed in
 *           manifest.embedded with its sha256; ids nothing resolves are listed
 *           in manifest.unresolved.
 *   IMPORT  same text already here → reuse the id; unknown id → install it;
 *           same id, different text → install as bundle:<moduleId>:<id> and
 *           point the module at that. A referenced id with no text anywhere →
 *           a listed warning. An embedded file that does not match its
 *           manifest hash → the import is refused.
 */
import { describe, it, expect, afterEach } from 'vitest';
import AdmZip from 'adm-zip';
import crypto from 'crypto';
import { bundleModuleToAnton, bundleBuiltinModuleToAnton } from '../../server/services/anton-bundler.js';
import { importAntonFile } from '../../server/services/anton-importer.js';
import { parseEmbeddedMarkdown } from '../../server/services/anton-module-config.js';
import { getSkillById, unregisterInstalledSkill } from '../../server/services/skills-manager.js';
import { resolvePersonaInstruction, resetInstalledPersonasForTests } from '../../server/services/prompt-builder.js';
import { makeFakeBundleDb, customModuleRow } from '../helpers/anton-bundle-fake-db.js';

const MODULE_ID = 'custom-ab12cd34';
const HOUSE_STYLE = 'Write in the Acme house style: short sentences, active voice, every claim tied to a source.';
const ACME_REVIEWER = 'You are the Acme second-line reviewer. You challenge every risk rating that lacks evidence.';

afterEach(() => {
  for (const id of [
    'acme-house-style',
    `bundle:${MODULE_ID}:acme-house-style`,
    `bundle:${MODULE_ID}:board-communication`,
  ]) unregisterInstalledSkill(id);
  // the @sha8 variant from the second-level clash test
  const hashed = `bundle:${MODULE_ID}:acme-house-style@${sha256(HOUSE_STYLE).slice(0, 8)}`;
  unregisterInstalledSkill(hashed);
  // Installed personas are mirrored into a process-wide index (prompt-builder);
  // each test's fake database starts empty, so the index must too.
  resetInstalledPersonasForTests();
});

function sha256(data: string | Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function manifestOf(buffer: Buffer): Record<string, any> {
  return JSON.parse(new AdmZip(buffer).getEntry('manifest.json')!.getData().toString('utf-8'));
}

/** A module referencing one built-in skill, one installed skill, one built-in persona, one installed persona. */
function exporterDb(extraConfig: Record<string, unknown> = {}) {
  return makeFakeBundleDb({
    modules: [customModuleRow({
      skills: ['board-communication', 'acme-house-style'],
      personas: ['fcp-expert', 'acme-reviewer'],
      ...extraConfig,
    })],
    skills: [{ id: 'acme-house-style', name: 'Acme House Style', description: 'How Acme writes', version: '2.1.0', prompt: HOUSE_STYLE }],
    personas: [{ id: 'acme-reviewer', name: 'Acme Reviewer', description: 'Second line', category: 'named', prompt: ACME_REVIEWER }],
  });
}

/** Replace one embedded file's text and re-hash it in the manifest (an honest re-export by someone else). */
function withEmbeddedText(buffer: Buffer, file: string, newPrompt: string, rehash = true): Buffer {
  const zip = new AdmZip(buffer);
  const entry = zip.getEntry(file)!;
  const { header } = parseEmbeddedMarkdown(entry.getData().toString('utf-8'));
  const lines = ['---', ...Object.entries(header).map(([k, v]) => `${k}: ${JSON.stringify(v)}`), '---', ''];
  const bytes = Buffer.from(`${lines.join('\n')}${newPrompt}`, 'utf-8');
  zip.updateFile(entry, bytes);
  if (rehash) {
    const manifestEntry = zip.getEntry('manifest.json')!;
    const manifest = JSON.parse(manifestEntry.getData().toString('utf-8'));
    for (const kind of ['skills', 'personas']) {
      for (const e of manifest.embedded[kind]) if (e.file === file) e.sha256 = sha256(bytes);
    }
    zip.updateFile(manifestEntry, Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8'));
  }
  return zip.toBuffer();
}

// ── Export ───────────────────────────────────────────────────────────────────

describe('export embeds skill and persona text with hashes', () => {
  it('writes skills/<id>.md and personas/<id>.md for every referenced id, each hashed in the manifest', async () => {
    const { db } = exporterDb();
    const buffer = await bundleModuleToAnton(db, MODULE_ID);
    const zip = new AdmZip(buffer);
    const manifest = manifestOf(buffer);

    expect(manifest.embedded.skills.map((s: { id: string }) => s.id)).toEqual(['board-communication', 'acme-house-style']);
    expect(manifest.embedded.personas.map((p: { id: string }) => p.id)).toEqual(['fcp-expert', 'acme-reviewer']);
    expect(manifest.contents.skills).toBe(2);
    expect(manifest.contents.personas).toBe(2);
    expect(manifest.unresolved).toBeUndefined();

    for (const e of [...manifest.embedded.skills, ...manifest.embedded.personas]) {
      const bytes = zip.getEntry(e.file)!.getData();
      expect(e.sha256).toBe(sha256(bytes));
    }

    // The built-in skill travels with its real text + metadata
    const builtin = getSkillById('board-communication')!;
    const skillFile = parseEmbeddedMarkdown(zip.getEntry('skills/board-communication.md')!.getData().toString('utf-8'));
    expect(skillFile.prompt).toBe(builtin.prompt);
    expect(skillFile.header).toMatchObject({ id: 'board-communication', name: builtin.name, version: builtin.version, description: builtin.description });

    // The installed skill (skills table) travels too
    const installed = parseEmbeddedMarkdown(zip.getEntry('skills/acme-house-style.md')!.getData().toString('utf-8'));
    expect(installed.prompt).toBe(HOUSE_STYLE);
    expect(installed.header).toMatchObject({ name: 'Acme House Style', version: '2.1.0', description: 'How Acme writes' });

    // Persona text is exactly what the prompt builder injects
    const persona = parseEmbeddedMarkdown(zip.getEntry('personas/fcp-expert.md')!.getData().toString('utf-8'));
    expect(persona.prompt).toBe(resolvePersonaInstruction('fcp-expert'));
    expect(parseEmbeddedMarkdown(zip.getEntry('personas/acme-reviewer.md')!.getData().toString('utf-8')).prompt).toBe(ACME_REVIEWER);
  });

  it('a built-in module exports its recommended personas with text', async () => {
    const buffer = await bundleBuiltinModuleToAnton('gap-analysis');
    const manifest = manifestOf(buffer);
    const config = JSON.parse(new AdmZip(buffer).getEntry('default-config.json')!.getData().toString('utf-8'));

    const referenced: string[] = config.personas ?? [];
    expect(referenced.length).toBeGreaterThan(0);
    const embedded = manifest.embedded.personas.map((p: { id: string }) => p.id);
    const unresolved = manifest.unresolved?.personas ?? [];
    // Every referenced persona is either embedded with text or listed as unresolved — never silently dropped.
    expect([...embedded, ...unresolved].sort()).toEqual([...new Set(referenced)].sort());
  });
});

// ── Import ───────────────────────────────────────────────────────────────────

describe('import installs embedded skills and personas', () => {
  it('reuses what is already here with the same text and installs what is not', async () => {
    const buffer = await bundleModuleToAnton(exporterDb().db, MODULE_ID);
    const target = makeFakeBundleDb();

    const result = await importAntonFile(buffer, target.db, 'user-7');

    expect(result.success).toBe(true);
    expect(result.installedSkills).toEqual([
      { bundleId: 'board-communication', installedId: 'board-communication', action: 'reused' },
      { bundleId: 'acme-house-style', installedId: 'acme-house-style', action: 'installed' },
    ]);
    expect(result.installedPersonas).toEqual([
      { bundleId: 'fcp-expert', installedId: 'fcp-expert', action: 'reused' },
      { bundleId: 'acme-reviewer', installedId: 'acme-reviewer', action: 'installed' },
    ]);

    // Rows written
    expect(target.skills.get('acme-house-style')).toMatchObject({ prompt: HOUSE_STYLE, name: 'Acme House Style', version: '2.1.0', user_id: 'user-7' });
    expect(target.skills.has('board-communication')).toBe(false); // built-in: nothing written
    expect(target.personas.get('acme-reviewer')).toMatchObject({ prompt: ACME_REVIEWER, source: 'import', name: 'Acme Reviewer' });
    expect(target.personas.has('fcp-expert')).toBe(false);

    // The module references the installed ids
    const config = target.configOf(result.moduleId!);
    expect(config.skills).toEqual(['board-communication', 'acme-house-style']);
    expect(config.personas).toEqual(['fcp-expert', 'acme-reviewer']);
    expect(result.importWarnings).toEqual([]);

    // …and the composer's synchronous resolver sees the installed skill right away
    expect(getSkillById('acme-house-style')?.prompt).toBe(HOUSE_STYLE);
    expect(getSkillById('acme-house-style')?.source).toBe('installed');
  });

  it('importing the same bundle twice reuses what the first import installed', async () => {
    const buffer = await bundleModuleToAnton(exporterDb().db, MODULE_ID);
    const target = makeFakeBundleDb();

    await importAntonFile(buffer, target.db);
    const skillWrites = target.writes.filter((w) => w.sql.includes('INSERT INTO skills')).length;
    const second = await importAntonFile(buffer, target.db);

    expect(second.success).toBe(true);
    expect(second.installedSkills?.find((s) => s.bundleId === 'acme-house-style')?.action).toBe('reused');
    expect(second.installedPersonas?.find((p) => p.bundleId === 'acme-reviewer')?.action).toBe('reused');
    expect(target.writes.filter((w) => w.sql.includes('INSERT INTO skills')).length).toBe(skillWrites);
  });
});

describe('id clash → namespaced install, local text untouched', () => {
  it('a skill and a persona whose ids exist here with different text install as bundle:<moduleId>:<id>', async () => {
    const buffer = await bundleModuleToAnton(exporterDb().db, MODULE_ID);
    const target = makeFakeBundleDb({
      skills: [{ id: 'acme-house-style', name: 'Local style', prompt: 'Our own, different house style.' }],
      personas: [{ id: 'acme-reviewer', name: 'Local reviewer', prompt: 'A different local reviewer persona.' }],
    });

    const result = await importAntonFile(buffer, target.db);

    const nsSkill = `bundle:${MODULE_ID}:acme-house-style`;
    const nsPersona = `bundle:${MODULE_ID}:acme-reviewer`;
    expect(result.success).toBe(true);
    expect(result.installedSkills?.find((s) => s.bundleId === 'acme-house-style')).toMatchObject({ installedId: nsSkill, action: 'namespaced' });
    expect(result.installedPersonas?.find((p) => p.bundleId === 'acme-reviewer')).toMatchObject({ installedId: nsPersona, action: 'namespaced' });

    // Local rows untouched, bundle text under the namespaced ids
    expect(target.skills.get('acme-house-style')?.prompt).toBe('Our own, different house style.');
    expect(target.skills.get(nsSkill)?.prompt).toBe(HOUSE_STYLE);
    expect(target.personas.get('acme-reviewer')?.prompt).toBe('A different local reviewer persona.');
    expect(target.personas.get(nsPersona)?.prompt).toBe(ACME_REVIEWER);

    // The module points at the bundle's versions
    const config = target.configOf(result.moduleId!);
    expect(config.skills).toEqual(['board-communication', nsSkill]);
    expect(config.personas).toEqual(['fcp-expert', nsPersona]);
    // No UPDATE ever touched a local row
    expect(target.writes.some((w) => /^\s*UPDATE/i.test(w.sql))).toBe(false);
  });

  it('a bundle that changed a BUILT-IN skill text installs its version under the namespace; the built-in is unchanged', async () => {
    const original = await bundleModuleToAnton(exporterDb().db, MODULE_ID);
    const builtinText = getSkillById('board-communication')!.prompt;
    const buffer = withEmbeddedText(original, 'skills/board-communication.md', 'A board-communication skill somebody rewrote.');
    const target = makeFakeBundleDb();

    const result = await importAntonFile(buffer, target.db);

    const ns = `bundle:${MODULE_ID}:board-communication`;
    expect(result.success).toBe(true);
    expect(result.installedSkills?.[0]).toMatchObject({ bundleId: 'board-communication', installedId: ns, action: 'namespaced' });
    expect(target.skills.get(ns)?.prompt).toBe('A board-communication skill somebody rewrote.');
    expect(getSkillById('board-communication')?.prompt).toBe(builtinText);
    expect(target.configOf(result.moduleId!).skills).toEqual([ns, 'acme-house-style']);
  });

  it('when the namespaced id already holds a third text, the new version gets an @sha8 suffix instead of overwriting', async () => {
    const buffer = await bundleModuleToAnton(exporterDb().db, MODULE_ID);
    const ns = `bundle:${MODULE_ID}:acme-house-style`;
    const target = makeFakeBundleDb({
      skills: [
        { id: 'acme-house-style', prompt: 'Local text.' },
        { id: ns, prompt: 'An older version of the bundle skill.' },
      ],
    });

    const result = await importAntonFile(buffer, target.db);

    const hashed = `${ns}@${sha256(HOUSE_STYLE).slice(0, 8)}`;
    expect(result.installedSkills?.find((s) => s.bundleId === 'acme-house-style')).toMatchObject({ installedId: hashed, action: 'namespaced' });
    expect(target.skills.get(ns)?.prompt).toBe('An older version of the bundle skill.');
    expect(target.skills.get(hashed)?.prompt).toBe(HOUSE_STYLE);
  });
});

describe('missing text → a listed warning, never silence', () => {
  it('an id the exporter could not resolve is listed in manifest.unresolved and warned about on import', async () => {
    const exporter = makeFakeBundleDb({
      modules: [customModuleRow({ skills: ['ghost-skill'], personas: ['ghost-persona'] })],
    });
    const buffer = await bundleModuleToAnton(exporter.db, MODULE_ID);
    expect(manifestOf(buffer).unresolved).toEqual({ skills: ['ghost-skill'], personas: ['ghost-persona'] });

    const result = await importAntonFile(buffer, makeFakeBundleDb().db);

    expect(result.success).toBe(true);
    expect(result.installedSkills).toEqual([{ bundleId: 'ghost-skill', installedId: 'ghost-skill', action: 'missing' }]);
    expect(result.installedPersonas).toEqual([{ bundleId: 'ghost-persona', installedId: 'ghost-persona', action: 'missing' }]);
    expect(result.importWarnings).toEqual(expect.arrayContaining([
      expect.stringContaining('Skill "ghost-skill"'),
      expect.stringContaining('Persona "ghost-persona"'),
    ]));
  });

  it('an id with no embedded text that DOES exist on the importing instance is reused, not warned about', async () => {
    const exporter = makeFakeBundleDb({ modules: [customModuleRow({ skills: ['local-only-skill'] })] });
    const buffer = await bundleModuleToAnton(exporter.db, MODULE_ID);
    const target = makeFakeBundleDb({ skills: [{ id: 'local-only-skill', prompt: 'Present on the importer only.' }] });

    const result = await importAntonFile(buffer, target.db);

    expect(result.installedSkills).toEqual([
      { bundleId: 'local-only-skill', installedId: 'local-only-skill', action: 'reused', note: 'not embedded in the bundle; the local copy is used' },
    ]);
    expect(result.importWarnings).toEqual([]);
  });
});

describe('embedded file integrity', () => {
  it('an embedded file changed after export (hash mismatch) refuses the import and writes nothing', async () => {
    const original = await bundleModuleToAnton(exporterDb().db, MODULE_ID);
    const tampered = withEmbeddedText(original, 'skills/acme-house-style.md', 'Tampered text.', false);
    const target = makeFakeBundleDb();

    const result = await importAntonFile(tampered, target.db);

    expect(result.success).toBe(false);
    expect(result.validation.errors.some((e) => e.message === 'Embedded file checksum mismatch: skills/acme-house-style.md')).toBe(true);
    expect(target.writes).toEqual([]);
  });

  it('an unlisted file under skills/ is ignored with a warning', async () => {
    const zip = new AdmZip(await bundleModuleToAnton(exporterDb().db, MODULE_ID));
    zip.addFile('skills/smuggled.md', Buffer.from('---\nid: "smuggled"\n---\n\nSmuggled text.', 'utf-8'));
    const target = makeFakeBundleDb();

    const result = await importAntonFile(zip.toBuffer(), target.db);

    expect(result.success).toBe(true);
    expect(target.skills.has('smuggled')).toBe(false);
    expect(result.importWarnings?.some((w) => w.includes('skills/smuggled.md'))).toBe(true);
  });
});
