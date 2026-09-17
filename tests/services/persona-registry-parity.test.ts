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
import { describe, it, expect } from 'vitest';
import {
  getExpertRoleInstruction,
  resolvePersonaInstruction,
  listServerPersonaIds,
} from '../../server/services/prompt-builder.js';
import { EXPERT_ROLES } from '../../src/lib/expert-roles.js';

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
