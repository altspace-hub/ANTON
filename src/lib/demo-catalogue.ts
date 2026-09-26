/**
 * demo-catalogue.ts — the module catalogue (src/lib/constants.ts) as this
 * person may see it. On a public demo (DEMO_MODE=true) a visitor is not shown
 * the modules and areas the server keeps off the demo (DEMO_HIDDEN_MODULES,
 * DEMO_HIDDEN_AREAS; privacy review H3): they invite health, employment,
 * credit or criminal-offence data, and the server refuses to run them for a
 * visitor anyway. Every page that lists modules or areas reads the lists from
 * here (useDemoCatalogue), so none of them offers one.
 *
 * Admins, and everyone on an ordinary server, get MODULES and AREAS
 * themselves: nothing changes for them.
 *
 * Kept apart from demo-config.ts, which the sign-in page loads: this file
 * pulls in the whole catalogue.
 */
import { MODULES, AREAS } from '@/lib/constants';
import { demoRestricted, demoModuleHiddenFor, demoAreaHiddenFor, type DemoConfig } from '@/lib/demo-config';

export type CatalogueModule = (typeof MODULES)[number];
export type CatalogueArea = (typeof AREAS)[number];

export interface DemoCatalogue {
  /** Whether anything is hidden from this person. */
  filtered: boolean;
  /** The modules this person is offered, in catalogue order. */
  modules: CatalogueModule[];
  /** The areas this person is offered: not hidden, and with a module left if they had any. */
  areas: readonly CatalogueArea[];
  /**
   * Whether a module is kept from this person. Its areas are the one given
   * (a server answer can name it) and every area of the catalogue that lists it.
   */
  moduleHidden: (moduleId: string | null | undefined, areaId?: string | null) => boolean;
  /** Whether an area is kept from this person. */
  areaHidden: (areaId: string | null | undefined) => boolean;
}

/** Module id → the ids of the catalogue areas that list it; built once. */
let areasByModule: Map<string, string[]> | null = null;

/** The ids of the catalogue areas that list this module. */
export function catalogueAreaIdsOf(moduleId: string): string[] {
  if (!areasByModule) {
    areasByModule = new Map();
    for (const area of AREAS) {
      for (const id of area.moduleIds as readonly string[]) {
        const list = areasByModule.get(id);
        if (list) list.push(area.id);
        else areasByModule.set(id, [area.id]);
      }
    }
  }
  return areasByModule.get(moduleId) ?? [];
}

const EVERYTHING: DemoCatalogue = {
  filtered: false,
  modules: MODULES,
  areas: AREAS,
  moduleHidden: () => false,
  areaHidden: () => false,
};

/** The catalogue for this person (see the file comment). */
export function demoCatalogue(cfg: DemoConfig, role: string | undefined): DemoCatalogue {
  if (!demoRestricted(cfg, role) || (cfg.hiddenAreas.length === 0 && cfg.hiddenModules.length === 0)) return EVERYTHING;

  const moduleHidden = (moduleId: string | null | undefined, areaId?: string | null): boolean => {
    if (!moduleId) return false;
    return demoModuleHiddenFor(cfg, role, moduleId, [areaId, ...catalogueAreaIdsOf(moduleId)]);
  };
  const areaHidden = (areaId: string | null | undefined): boolean => demoAreaHiddenFor(cfg, role, areaId);

  const modules = MODULES.filter((m) => !moduleHidden(m.id));
  const areas = AREAS.filter((a) => {
    if (areaHidden(a.id)) return false;
    const ids = a.moduleIds as readonly string[];
    // An area whose every module is hidden is hidden too.
    return ids.length === 0 || ids.some((id) => !moduleHidden(id));
  });
  return { filtered: true, modules, areas, moduleHidden, areaHidden };
}
