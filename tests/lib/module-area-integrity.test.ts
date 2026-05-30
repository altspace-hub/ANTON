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
});
