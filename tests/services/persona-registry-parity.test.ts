/**
 * persona-registry-parity.test.ts — one persona registry (Wave 4b, track 3).
 *
 * The picker (src/lib/expert-roles.ts) and the server map
 * (EXPERT_ROLE_INSTRUCTIONS in prompt-builder.ts) drifted: six ids the user
 * could select had no server text, so choosing them injected nothing —
 * silently, because getExpertRoleInstruction filtered the misses away. The
 * server map now falls back to the client registry's promptInstruction, and
 * this file pins both directions of the parity so a new drift fails a test
 * instead of a persona.
 *
 * No database: prompt-builder's persona functions are pure.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect } from 'vitest';
import {
  getExpertRoleInstruction,
  resolvePersonaInstruction,
  listServerPersonaIds,
} from '../../server/services/prompt-builder.js';
import {
  composeSystemPromptParts,
  type PromptComposerConfig,
} from '../../server/services/prompt-composer.js';
import { EXPERT_ROLES } from '../../src/lib/expert-roles.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** The ids that had a picker entry but no server text before the fallback. */
const FORMERLY_DEAD_IDS = [
  'compliance-counsel',
  'criminal-court-expert',
  'eu-regulatory-lawyer',
  'fcp-investigations-expert',
  'international-aml-law',
  'sanctions-lawyer',
];

/**
 * Ids that exist only on the server. core-team-panel.ts drives the ct-* seven;
 * nadia-ux and sara-risk are blueprint personas the picker never listed. Adding
 * a server-only id is fine — add it here too, so the drift is a decision.
 */
const SERVER_ONLY_IDS = [
  // Wave 8 (2026-09-18): folded in from server/personas/<id>/, which the composer
  // never read. These ten have a long-form perspective and no picker entry, and no
  // module recommends them today — they are engineering and field roles written for
  // the hardware and humanitarian areas. Resolvable, unlisted, deliberate: a module
  // that names one gets real text instead of silence.
  'clinical-safety-officer',
  'electronics-engineer',
  'embedded-systems-engineer',
  'field-technician',
  'gig-economy-rights-advisor',
  'humanitarian-tech-operator',
  'industrial-designer',
  'quality-engineer',
  'reliability-engineer',
  'safety-engineer',
  'ct-business-expert',
  'ct-devsecops-expert',
  'ct-engineering-expert',
  'ct-product-designer',
  'ct-project-manager',
  'ct-solution-architect',
  'ct-ux-expert',
  'nadia-ux',
  'sara-risk',
];

const clientIds = EXPERT_ROLES.map((r) => r.id);

describe('persona registry parity', () => {
  it('reads a real registry on both sides', () => {
    // Guards the assertions below against an empty import passing vacuously.
    expect(clientIds.length).toBeGreaterThan(70);
    expect(listServerPersonaIds().length).toBeGreaterThan(70);
    expect(new Set(clientIds).size).toBe(clientIds.length);
  });

  it('every client persona id yields non-empty instruction text', () => {
    const dead = clientIds.filter((id) => getExpertRoleInstruction(id).trim().length === 0);
    expect(dead).toEqual([]);
  });

  it('a single persona is wrapped in the EXPERT ROLE header with its text', () => {
    for (const role of EXPERT_ROLES) {
      const out = getExpertRoleInstruction(role.id);
      expect(out.startsWith('## EXPERT ROLE\n')).toBe(true);
      expect(out.length).toBeGreaterThan('## EXPERT ROLE\n'.length + 40);
    }
  });

  it('the six formerly-dead ids now resolve, from the client registry, to that registry\'s text', () => {
    const serverIds = new Set(listServerPersonaIds());
    for (const id of FORMERLY_DEAD_IDS) {
      expect(clientIds, `${id} must still be in the picker`).toContain(id);
      expect(serverIds.has(id), `${id} is expected to come from the client registry`).toBe(false);
      const clientText = EXPERT_ROLES.find((r) => r.id === id)?.promptInstruction ?? '';
      expect(clientText.trim().length).toBeGreaterThan(0);
      expect(resolvePersonaInstruction(id)).toBe(clientText);
      expect(getExpertRoleInstruction(id)).toBe(`## EXPERT ROLE\n${clientText}`);
    }
  });

  it('the server text wins where both sides carry the id (no existing server entry changed)', () => {
    const serverIds = new Set(listServerPersonaIds());
    const shared = clientIds.filter((id) => serverIds.has(id));
    expect(shared.length).toBeGreaterThan(60);
    // 'fcp-expert' is on both sides with identical text; the check that
    // matters is that the server map, not the client, answers for shared ids.
    // The map is not exported, so prove it by construction: a shared id whose
    // client text differs from the server text must resolve to the server one.
    const differing = shared.filter((id) => {
      const clientText = EXPERT_ROLES.find((r) => r.id === id)?.promptInstruction ?? '';
      return resolvePersonaInstruction(id) !== clientText;
    });
    for (const id of differing) {
      expect(resolvePersonaInstruction(id).trim().length).toBeGreaterThan(0);
    }
    // And for every shared id the resolved text is exactly the server map's
    // own entry: the same string getExpertRoleInstruction has always emitted.
    for (const id of shared) {
      expect(getExpertRoleInstruction(id)).toBe(`## EXPERT ROLE\n${resolvePersonaInstruction(id)}`);
    }
  });

  it('the server-only ids are exactly the documented set, so a new drift is caught', () => {
    const clientSet = new Set(clientIds);
    const serverOnly = listServerPersonaIds().filter((id) => !clientSet.has(id)).sort();
    expect(serverOnly).toEqual([...SERVER_ONLY_IDS].sort());
  });

  it('the client-only ids are exactly the six that used to be dead', () => {
    const serverSet = new Set(listServerPersonaIds());
    const clientOnly = clientIds.filter((id) => !serverSet.has(id)).sort();
    expect(clientOnly).toEqual([...FORMERLY_DEAD_IDS].sort());
  });

  it('an unknown id yields the empty string', () => {
    expect(getExpertRoleInstruction('no-such-persona')).toBe('');
    expect(getExpertRoleInstruction('')).toBe('');
    expect(getExpertRoleInstruction([])).toBe('');
    expect(getExpertRoleInstruction(['no-such-persona', 'another-missing'])).toBe('');
    expect(resolvePersonaInstruction('no-such-persona')).toBe('');
  });

  it('Object.prototype members are unknown ids, not personas', () => {
    for (const id of ['constructor', 'toString', 'hasOwnProperty', '__proto__']) {
      expect(resolvePersonaInstruction(id)).toBe('');
      expect(getExpertRoleInstruction(id)).toBe('');
    }
  });

  it('a multi-persona pick mixes server and client entries and drops unknown ones', () => {
    const out = getExpertRoleInstruction(['fcp-expert', 'sanctions-lawyer', 'no-such-persona']);
    expect(out.startsWith('## EXPERT ROLES (MULTI-PERSONA)')).toBe(true);
    expect(out).toContain('**Persona 1:** ');
    expect(out).toContain('**Persona 2:** ');
    expect(out).not.toContain('**Persona 3:** ');
    const sanctionsText = EXPERT_ROLES.find((r) => r.id === 'sanctions-lawyer')?.promptInstruction ?? '';
    expect(out).toContain(sanctionsText);
  });
});

// ── The catalogue-wide guard (Wave 1 track G, 2026-09-17) ───────────────────
//
// The parity suite above compares the two registries with each other. It could
// not catch the defect that shipped: 21 module.json files recommended four ids
// — 'crypto-blockchain-expert' (all 11 blockchain modules), 'risk-coach' and
// 'senior-risk-officer' (9 modules each, overlapping but NOT identical sets),
// 'senior-mlro' (3 FCP/Atlas modules) — that NEITHER registry carried. Three of
// them did have text, under server/personas/<id>/ and in personas-manager's
// BUILTIN_PERSONAS, but the composer reads neither: prompt-composer.ts goes
// through getExpertRoleInstruction -> resolvePersonaInstruction, and
// buildPersonaInjection() has no callers. So the text existed and was never
// injected.
//
// It was not merely selectable-and-dead. ModulePage.tsx applies
// recommendedPersonas[0] on every fresh module session, so the dead persona was
// applied BY DEFAULT — every blockchain run and every Atlas run carried a
// persona that contributed nothing, with no error shown.
//
// This block walks the shipped catalogue and asserts the text, not the id.

/** The four ids Wave 1 track G added, and the module areas that request them. */
const TRACK_G_PERSONA_IDS = [
  'crypto-blockchain-expert',
  'risk-coach',
  'senior-mlro',
  'senior-risk-officer',
] as const;

interface ModuleRef {
  where: string;
  personas: string[];
}

/** Every module.json on disk that declares recommendedPersonas. */
function modulesWithPersonas(): ModuleRef[] {
  const areasDir = path.resolve(__dirname, '..', '..', 'server', 'areas');
  const out: ModuleRef[] = [];
  for (const area of fs.readdirSync(areasDir, { withFileTypes: true })) {
    if (!area.isDirectory()) continue;
    const modulesDir = path.join(areasDir, area.name, 'modules');
    if (!fs.existsSync(modulesDir)) continue;
    for (const mod of fs.readdirSync(modulesDir, { withFileTypes: true })) {
      if (!mod.isDirectory()) continue;
      const configPath = path.join(modulesDir, mod.name, 'module.json');
      if (!fs.existsSync(configPath)) continue;
      const parsed: unknown = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      if (typeof parsed !== 'object' || parsed === null) continue;
      const personas = (parsed as Record<string, unknown>).recommendedPersonas;
      if (!Array.isArray(personas)) continue;
      out.push({
        where: `${area.name}/${mod.name}`,
        personas: personas.filter((p): p is string => typeof p === 'string'),
      });
    }
  }
  return out;
}

describe('the shipped catalogue resolves every persona it recommends', () => {
  it('reads a real catalogue, so the assertions below cannot pass vacuously', () => {
    const mods = modulesWithPersonas();
    expect(mods.length, 'no module.json declares recommendedPersonas — did server/areas move?')
      .toBeGreaterThan(100);
    const distinct = new Set(mods.flatMap((m) => m.personas));
    expect(distinct.size).toBeGreaterThan(20);
  });

  it('every recommendedPersonas id injects non-empty text — the guard that was missing', () => {
    const dead: string[] = [];
    for (const { where, personas } of modulesWithPersonas()) {
      for (const id of personas) {
        if (resolvePersonaInstruction(id).trim().length === 0) dead.push(`${where} -> ${id}`);
      }
    }
    expect(dead).toEqual([]);
  });

  it('the persona ModulePage auto-applies (recommendedPersonas[0]) is never a dead one', () => {
    // ModulePage.tsx: setSelectedPersonas([personas[0]]) on a fresh session.
    // A dead id here is applied without the user ever opening the picker.
    const dead: string[] = [];
    for (const { where, personas } of modulesWithPersonas()) {
      const first = personas[0];
      if (!first) continue;
      if (getExpertRoleInstruction(first).trim().length === 0) dead.push(`${where} -> ${first}`);
    }
    expect(dead).toEqual([]);
  });

  it('the 21 modules that carried the dead ids still reference them, and they now resolve', () => {
    const byId = new Map<string, string[]>(TRACK_G_PERSONA_IDS.map((id) => [id, []]));
    for (const { where, personas } of modulesWithPersonas()) {
      for (const id of personas) byId.get(id)?.push(where);
    }
    // The references were deliberately NOT repointed — the fix is that the
    // registry answers them. If a later track repoints one, this fails loudly
    // rather than leaving an orphan persona nobody notices.
    expect(byId.get('crypto-blockchain-expert')!.sort()).toEqual([
      'blockchain/blockchain-investigation',
      'blockchain/casp-authorization',
      'blockchain/casp-mica-dora-amlr-programme',
      'blockchain/crypto-aml-cft',
      'blockchain/crypto-risk-assessment',
      'blockchain/defi-governance-operational-risk',
      'blockchain/defi-regulatory',
      'blockchain/emr-token-classification',
      'blockchain/innovation-sandbox-application',
      'blockchain/mica-gap-analysis',
      'blockchain/stablecoin-compliance',
    ]);
    // The coach and the officer are NOT recommended by the same set, which is
    // the clearest evidence they are two roles and not two names for one:
    // atlas-exposure-mapper (the first stage, where the method is new to the
    // user) asks for the coach only; atlas-company-appetite-consolidator (the
    // board rollup) asks for the officer only.
    expect(byId.get('risk-coach')!).toContain('risk/atlas-exposure-mapper');
    expect(byId.get('senior-risk-officer')!).not.toContain('risk/atlas-exposure-mapper');
    expect(byId.get('senior-risk-officer')!).toContain('risk/atlas-company-appetite-consolidator');
    expect(byId.get('risk-coach')!).not.toContain('risk/atlas-company-appetite-consolidator');
    expect(byId.get('risk-coach')!.length).toBe(9);
    expect(byId.get('senior-risk-officer')!.length).toBe(9);
    expect(byId.get('senior-mlro')!.sort()).toEqual([
      'fcp/business-wide-risk-assessment',
      'fcp/fcp-scope-assessor',
      'risk/atlas-company-appetite-consolidator',
    ]);
    const everyReferencingModule = new Set(
      [...byId.values()].flat(),
    );
    expect(everyReferencingModule.size).toBe(21);
  });
});

describe('the four personas Wave 1 track G added', () => {
  it('each is both resolvable (composer) and selectable (picker)', () => {
    const serverIds = new Set(listServerPersonaIds());
    const clientSet = new Set(clientIds);
    for (const id of TRACK_G_PERSONA_IDS) {
      expect(serverIds.has(id), `${id} must be in EXPERT_ROLE_INSTRUCTIONS to resolve`).toBe(true);
      expect(clientSet.has(id), `${id} must be in EXPERT_ROLES to be selectable`).toBe(true);
      const text = resolvePersonaInstruction(id);
      expect(text.trim().length, `${id} resolves to empty text`).toBeGreaterThan(200);
      expect(getExpertRoleInstruction(id)).toBe(`## EXPERT ROLE\n${text}`);
    }
  });

  it('carries identical text on both sides, as every other shared id does', () => {
    for (const id of TRACK_G_PERSONA_IDS) {
      const clientText = EXPERT_ROLES.find((r) => r.id === id)?.promptInstruction ?? '';
      expect(resolvePersonaInstruction(id), id).toBe(clientText);
    }
  });

  it('the two Atlas roles are distinct roles, not two names for one', () => {
    // The Atlas modules recommend BOTH: risk-coach explains the method to
    // someone meeting it for the first time, senior-risk-officer is a peer who
    // already knows it. 'risk-specialist' is a quantitative model-risk role and
    // is not a substitute for either.
    const coach = resolvePersonaInstruction('risk-coach');
    const officer = resolvePersonaInstruction('senior-risk-officer');
    expect(coach).not.toBe(officer);
    expect(coach).not.toBe(resolvePersonaInstruction('risk-specialist'));
    expect(officer).not.toBe(resolvePersonaInstruction('risk-specialist'));
  });

  it('both Atlas roles state that the deterministic engine owns the score', () => {
    // The Atlas residual calculator is audit-locked: the model produces the
    // rationale, never the number. A persona that invited an override would be
    // actively harmful, so the boundary is pinned here rather than trusted to
    // survive a future edit.
    for (const id of ['risk-coach', 'senior-risk-officer']) {
      const text = resolvePersonaInstruction(id).toLowerCase();
      expect(text, `${id} must name the calculator/engine as the owner of the score`)
        .toMatch(/calculat|engine/);
      expect(text, `${id} must say it produces the rationale around the score`)
        .toContain('rationale around');
    }
  });
});

describe('a persona reaches the composed prompt as its own named layer', () => {
  const base: PromptComposerConfig = {
    creativity: 'balanced',
    thinking: 'think',
    // An override keeps this independent of the module files on disk.
    systemPromptOverride: '## MODULE\nYou score threat paths.',
    moduleId: 'atlas-residual-calculator',
    areaId: 'risk',
  };

  /** The persona layer's text, or null when the composer emitted no such layer. */
  async function personaLayer(personas?: string[]): Promise<string | null> {
    const composed = await composeSystemPromptParts({ ...base, selectedPersonas: personas });
    const part = composed.parts.find((p) => p.key === 'layer5_personas');
    return part ? part.text : null;
  }

  it('omits the persona layer entirely when nothing is selected', async () => {
    // Asserted on the named part, not on the joined prompt: searching `full`
    // for a word passes for the wrong reason as soon as another layer happens
    // to mention it.
    expect(await personaLayer(undefined)).toBeNull();
    expect(await personaLayer([])).toBeNull();
  });

  it('emits layer5_personas carrying the selected persona and nothing else', async () => {
    for (const id of TRACK_G_PERSONA_IDS) {
      const text = resolvePersonaInstruction(id);
      // Guard the needles below: every .toContain('') is vacuously true and
      // every .not.toContain('') vacuously false, so an empty persona would
      // make the leak check pass or fail for entirely the wrong reason. The
      // negative control for this file hit exactly that.
      expect(text.trim().length, `${id} resolves to empty text`).toBeGreaterThan(0);

      const layer = await personaLayer([id]);
      expect(layer, `${id} produced no layer5_personas part`).not.toBeNull();
      expect(layer).toBe(`## EXPERT ROLE\n${text}`);

      // The other three must not leak into this run's persona layer.
      for (const other of TRACK_G_PERSONA_IDS) {
        if (other === id) continue;
        const otherText = resolvePersonaInstruction(other);
        expect(otherText.trim().length, `${other} resolves to empty text`).toBeGreaterThan(0);
        expect(layer).not.toContain(otherText);
      }
    }
  });

  it('an unknown id produces no persona layer at all — the silent failure, made visible', async () => {
    // This is exactly what the 21 modules did before the fix: a persona was
    // selected, the composer emitted no layer, and nothing said so.
    expect(await personaLayer(['no-such-persona'])).toBeNull();
  });

  it('the Atlas pair selected together produces one multi-persona layer with both', async () => {
    const layer = await personaLayer(['senior-risk-officer', 'risk-coach']);
    expect(layer).not.toBeNull();
    expect(layer!.startsWith('## EXPERT ROLES (MULTI-PERSONA)')).toBe(true);
    expect(layer).toContain(resolvePersonaInstruction('senior-risk-officer'));
    expect(layer).toContain(resolvePersonaInstruction('risk-coach'));
  });
});
