/**
 * blueprint-skill-bundles-fresh.test.ts — the FCP blueprint bundles on an
 * ANTON that does NOT ship the skills (an instance on an older version).
 *
 * The bundles are built while the disk skills are visible; then the static
 * resolver is told to hide every fcp-bp-* id, as on an instance without
 * server/skills/fcp-bp-*. Importing must INSTALL each embedded skill into the
 * `skills` table with exactly the shipped text — and still pass the validator
 * and the injection gate without an opt-in.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';

const hide = vi.hoisted(() => ({ blueprints: false }));

vi.mock('../../server/services/skills-manager.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../server/services/skills-manager.js')>();
  return {
    ...actual,
    getSkillByIdAsync: async (id: string) => (hide.blueprints && id.startsWith('fcp-bp-') ? undefined : actual.getSkillByIdAsync(id)),
  };
});

import { importAntonFile } from '../../server/services/anton-importer.js';
import { buildAllBlueprintsBundle, buildBlueprintSkillBundle, listBlueprintSkillIds } from '../../server/services/blueprint-skill-bundles.js';
import { getSkillByIdAsync, preloadDiskSkills } from '../../server/services/skills-manager.js';
import { makeFakeBundleDb } from '../helpers/anton-bundle-fake-db.js';

const shipped = new Map<string, string>();
let one: Buffer;
let all: Buffer;

beforeAll(async () => {
  await preloadDiskSkills();
  for (const id of listBlueprintSkillIds()) shipped.set(id, (await getSkillByIdAsync(id))!.prompt);
  one = (await buildBlueprintSkillBundle('fcp-bp-model-validation-report')).buffer;
  all = (await buildAllBlueprintsBundle()).buffer;
  hide.blueprints = true;
}, 60_000);

describe('on an instance without the blueprint skills', () => {
  it('the resolver no longer sees them (the premise of this file)', async () => {
    expect(await getSkillByIdAsync('fcp-bp-model-validation-report')).toBeUndefined();
  });

  it('a per-skill bundle installs both skills with the shipped text, no opt-in needed', async () => {
    const target = makeFakeBundleDb();
    const result = await importAntonFile(one, target.db, 'tester');
    expect(result.success).toBe(true);
    expect(result.injectionFindings).toEqual([]);
    expect(result.installedSkills?.map((s) => [s.bundleId, s.action]).sort()).toEqual([
      ['fcp-bp-house-standards', 'installed'],
      ['fcp-bp-model-validation-report', 'installed'],
    ]);
    for (const id of ['fcp-bp-model-validation-report', 'fcp-bp-house-standards']) {
      expect(target.skills.get(id)?.prompt.trim(), id).toBe(shipped.get(id)!.trim());
    }
    expect(target.skills.get('fcp-bp-model-validation-report')?.category).toBe('methodology');
  });

  it('the all-blueprints bundle installs all fourteen', async () => {
    const target = makeFakeBundleDb();
    const result = await importAntonFile(all, target.db, 'tester');
    expect(result.success).toBe(true);
    expect(result.injectionFindings).toEqual([]);
    expect(target.skills.size).toBe(14);
    for (const [id, text] of shipped) expect(target.skills.get(id)?.prompt.trim(), id).toBe(text.trim());
    const drafts = [...target.skills.values()].filter((s) => s.name.startsWith('FCP blueprint [DRAFT]')).map((s) => s.id).sort();
    expect(drafts).toEqual(['fcp-bp-abc-risk-assessment', 'fcp-bp-compliance-review-report', 'fcp-bp-fraud-risk-assessment', 'fcp-bp-sanctions-risk-assessment']);
  });
});
