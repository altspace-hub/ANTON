import { describe, it, expect } from 'vitest';
import { AREAS, MODULES } from '../../src/lib/constants';
import {
  NGO_AREAS,
  WIZARD_CATEGORIES,
  JOURNEYS,
  CLUSTER_ORDER,
} from '../../src/pages/NGOHubPage';

/**
 * Reachability guard over the NGO & Social Impact hub (src/pages/NGOHubPage.tsx).
 *
 * The hub keeps its own editorial area list rather than deriving one from
 * AREAS — which areas belong on it, how they cluster and which module opens
 * first are judgement calls. The cost is that every drift between the two is
 * invisible in the product: a card points at a module that no longer exists
 * and the user lands on a 404, or a card is defined and never renders.
 *
 * Measured on 2026-09-18 (Wave 6, track B), before this guard existed:
 *   - five base-of-pyramid areas had no card at all (food-business,
 *     artisan-craft, personal-finance-bop, consumer-rights,
 *     government-services) — 40 modules with no door on the one surface
 *     built for the people who need them;
 *   - eight of ten cards under-stated their module count by 1-5 modules;
 *   - the Humanitarian card carried clusterLabel 'Programme Management',
 *     which was NOT in CLUSTER_ORDER, so it rendered nowhere while the hero
 *     stats strip still counted it.
 */
describe('NGO hub — every reference resolves', () => {
  const areaById = new Map(AREAS.map((a) => [a.id as string, a]));
  const moduleIds = new Set<string>(MODULES.map((m) => m.id as string));

  function modulesOf(areaId: string): ReadonlySet<string> {
    return new Set<string>((areaById.get(areaId)?.moduleIds ?? []) as readonly string[]);
  }

  it('every area card points at a real area', () => {
    const dangling = NGO_AREAS.filter((a) => !areaById.has(a.id)).map((a) => a.id);
    expect(dangling).toEqual([]);
  });

  it('no area is carded twice', () => {
    const ids = NGO_AREAS.map((a) => a.id);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
  });

  it("every card's firstModuleId is a real module belonging to that card's area", () => {
    const bad: string[] = [];
    for (const area of NGO_AREAS) {
      if (!moduleIds.has(area.firstModuleId)) bad.push(`${area.id} -> ${area.firstModuleId} (no such module)`);
      else if (!modulesOf(area.id).has(area.firstModuleId)) bad.push(`${area.id} -> ${area.firstModuleId} (not in that area)`);
    }
    expect(bad).toEqual([]);
  });

  it('every card actually renders — its clusterLabel is in CLUSTER_ORDER', () => {
    // The areas grid maps CLUSTER_ORDER, not NGO_AREAS, so a card with an
    // unlisted cluster label is defined, counted in the hero stats, and drawn
    // nowhere. This is the failure that hid the Humanitarian card.
    const orphans = NGO_AREAS
      .filter((a) => !CLUSTER_ORDER.includes(a.clusterLabel))
      .map((a) => `${a.id} (${a.clusterLabel})`);
    expect(orphans).toEqual([]);
  });

  it('every cluster in CLUSTER_ORDER has at least one card', () => {
    const empty = CLUSTER_ORDER.filter((c) => !NGO_AREAS.some((a) => a.clusterLabel === c));
    expect(empty).toEqual([]);
  });

  it('every wizard need routes to a real module in the area it names', () => {
    const bad: string[] = [];
    for (const cat of WIZARD_CATEGORIES) {
      for (const need of cat.needs) {
        if (!areaById.has(need.areaId)) { bad.push(`${cat.id}/"${need.label}" -> area ${need.areaId}`); continue; }
        if (!need.moduleId) continue;
        if (!moduleIds.has(need.moduleId)) bad.push(`${cat.id}/"${need.label}" -> ${need.moduleId} (no such module)`);
        else if (!modulesOf(need.areaId).has(need.moduleId)) bad.push(`${cat.id}/"${need.label}" -> ${need.moduleId} (not in ${need.areaId})`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('every wizard need carries a hint — the hint is the whole point of the wizard', () => {
    const empty: string[] = [];
    for (const cat of WIZARD_CATEGORIES) {
      for (const need of cat.needs) {
        if (need.hint.trim().length < 10) empty.push(`${cat.id}/"${need.label}"`);
      }
    }
    expect(empty).toEqual([]);
  });

  it('every journey routes to a real module in the area it names', () => {
    const bad: string[] = [];
    for (const j of JOURNEYS) {
      if (!areaById.has(j.areaId)) { bad.push(`"${j.title}" -> area ${j.areaId}`); continue; }
      if (!moduleIds.has(j.firstModuleId)) bad.push(`"${j.title}" -> ${j.firstModuleId} (no such module)`);
      else if (!modulesOf(j.areaId).has(j.firstModuleId)) bad.push(`"${j.title}" -> ${j.firstModuleId} (not in ${j.areaId})`);
    }
    expect(bad).toEqual([]);
  });

  it('the base-of-pyramid areas the hub exists for all have a card', () => {
    // 2026-09-18: these five were reachable only by knowing the module id.
    // food-business and personal-finance-bop were judged by the catalogue
    // review to be among the best-written prompts in the repository.
    for (const id of ['food-business', 'artisan-craft', 'personal-finance-bop',
      'consumer-rights', 'government-services']) {
      expect(NGO_AREAS.some((a) => a.id === id), `${id} has no card on the NGO hub`).toBe(true);
    }
  });

  it('subsidy-navigator is reachable from the wizard', () => {
    // How a farmer finds government money. It had a module and no path to it.
    const reachable = WIZARD_CATEGORIES.some((c) => c.needs.some((n) => n.moduleId === 'subsidy-navigator'));
    expect(reachable).toBe(true);
  });
});
