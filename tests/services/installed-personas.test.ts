/**
 * installed-personas.test.ts — a persona installed from a module bundle
 * reaches the prompt (Wave 6).
 *
 * The importer writes embedded personas to the `personas` table, but the
 * composer resolves personas synchronously from the server map and the
 * client registry, so an imported persona with a new id was stored and never
 * injected. The installed-persona index closes that: filled at boot from the
 * table and on every install.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import type { DatabaseAdapter } from '../../server/db/database.js';
import {
  getExpertRoleInstruction,
  listServerPersonaIds,
  preloadInstalledPersonas,
  registerInstalledPersona,
  resetInstalledPersonasForTests,
  resolvePersonaInstruction,
} from '../../server/services/prompt-builder.js';

function fakeDb(rows: Array<{ id: string; prompt: string }> | Error): DatabaseAdapter {
  return {
    dialect: 'postgresql',
    async all<T>(sql: string): Promise<T[]> {
      if (rows instanceof Error) throw rows;
      expect(sql).toMatch(/FROM personas WHERE is_archived = 0/);
      return rows as unknown as T[];
    },
  } as unknown as DatabaseAdapter;
}

describe('installed personas', () => {
  beforeEach(() => resetInstalledPersonasForTests());

  it('an unknown id resolves to nothing until it is installed', () => {
    expect(resolvePersonaInstruction('bundle:acme:tax-reviewer')).toBe('');
    registerInstalledPersona('bundle:acme:tax-reviewer', 'You are a meticulous tax reviewer.');
    expect(resolvePersonaInstruction('bundle:acme:tax-reviewer')).toBe('You are a meticulous tax reviewer.');
  });

  it('reaches the persona layer text the composer injects', () => {
    registerInstalledPersona('imported-auditor', 'You are an external auditor reading for evidence.');
    expect(getExpertRoleInstruction(['imported-auditor'])).toContain('external auditor reading for evidence');
  });

  it('never shadows a server persona with the same id', () => {
    const serverId = listServerPersonaIds()[0];
    const serverText = resolvePersonaInstruction(serverId);
    registerInstalledPersona(serverId, 'IMPOSTOR TEXT');
    expect(resolvePersonaInstruction(serverId)).toBe(serverText);
  });

  it('ignores blank prompts', () => {
    registerInstalledPersona('blank', '   ');
    expect(resolvePersonaInstruction('blank')).toBe('');
  });

  it('preloads the table at boot and replaces the previous index', async () => {
    registerInstalledPersona('stale', 'old text');
    const n = await preloadInstalledPersonas(fakeDb([
      { id: 'p1', prompt: 'First imported persona.' },
      { id: 'p2', prompt: 'Second imported persona.' },
    ]));
    expect(n).toBe(2);
    expect(resolvePersonaInstruction('p2')).toBe('Second imported persona.');
    expect(resolvePersonaInstruction('stale')).toBe('');
  });

  it('a missing table reads as zero rows and never throws', async () => {
    await expect(preloadInstalledPersonas(fakeDb(new Error('relation "personas" does not exist')))).resolves.toBe(0);
  });
});
