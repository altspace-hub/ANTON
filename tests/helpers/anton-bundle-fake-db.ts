/**
 * anton-bundle-fake-db.ts — an in-memory DatabaseAdapter for the .anton module
 * bundle tests (Wave 6, track G). No Postgres: it answers exactly the SQL the
 * bundler, validator, importer, signer and fingerprint route send, and keeps
 * the rows they write so a test can assert what was installed.
 *
 * Tables modelled: custom_modules, skills, personas, instance_identity,
 * bundle_signers. Anything else reads as "no row".
 */
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';

export interface CustomModuleRow {
  id: string;
  name: string;
  short_name: string;
  description: string;
  icon: string;
  area: string;
  system_prompt: string;
  config: string;
  created_at: string;
  updated_at: string;
}

export interface SkillRow {
  id: string;
  name: string;
  description: string | null;
  version: string | null;
  author: string | null;
  category: string | null;
  prompt: string;
  tags: string | null;
  user_id: string;
  org_id: string;
  is_archived: number;
}

export interface PersonaRow {
  id: string;
  name: string;
  description: string | null;
  prompt: string;
  category: string | null;
  source: string;
  user_id: string | null;
  org_id: string | null;
  is_archived: number;
}

interface IdentityRow {
  pubkey: string;
  privkey: string | null;
  privkey_encrypted: Buffer | null;
  privkey_iv: Buffer | null;
  display_name: string | null;
}

export interface FakeBundleDb {
  db: DatabaseAdapter;
  modules: Map<string, CustomModuleRow>;
  skills: Map<string, SkillRow>;
  personas: Map<string, PersonaRow>;
  /** Every INSERT / UPDATE statement, in order. */
  writes: Array<{ sql: string; params: unknown[] }>;
  /** The config blob of an installed module, parsed. */
  configOf: (moduleId: string) => Record<string, unknown>;
}

export interface FakeBundleDbSeed {
  modules?: CustomModuleRow[];
  skills?: Array<Partial<SkillRow> & { id: string; prompt: string }>;
  personas?: Array<Partial<PersonaRow> & { id: string; prompt: string }>;
  /** Signing identity display name (the signer creates the key lazily). */
  instanceName?: string;
}

export function makeFakeBundleDb(seed: FakeBundleDbSeed = {}): FakeBundleDb {
  const modules = new Map<string, CustomModuleRow>();
  const skills = new Map<string, SkillRow>();
  const personas = new Map<string, PersonaRow>();
  const signers = new Map<string, { signer_name: string | null }>();
  const writes: Array<{ sql: string; params: unknown[] }> = [];
  let identity: IdentityRow | null = null;

  for (const m of seed.modules ?? []) modules.set(m.id, m);
  for (const s of seed.skills ?? []) {
    skills.set(s.id, {
      name: s.id, description: '', version: '1.0.0', author: 'seed', category: 'domain', tags: '[]',
      user_id: 'default', org_id: 'default', is_archived: 0, ...s,
    });
  }
  for (const p of seed.personas ?? []) {
    personas.set(p.id, {
      name: p.id, description: '', category: null, source: 'seed', user_id: null, org_id: null, is_archived: 0, ...p,
    });
  }

  const activeOnly = (sql: string) => /is_archived\s*=\s*0/.test(sql);

  const db: DatabaseAdapter = {
    dialect: 'postgresql',
    async get<T>(sql: string, ...params: unknown[]): Promise<T | undefined> {
      if (sql.includes('FROM custom_modules')) {
        return modules.get(params[0] as string) as T | undefined;
      }
      if (sql.includes('FROM skills')) {
        const row = skills.get(params[0] as string);
        if (!row || (activeOnly(sql) && row.is_archived !== 0)) return undefined;
        return row as T;
      }
      if (sql.includes('FROM personas')) {
        const row = personas.get(params[0] as string);
        if (!row || (activeOnly(sql) && row.is_archived !== 0)) return undefined;
        return row as T;
      }
      if (sql.includes('FROM instance_identity')) {
        return (identity ?? undefined) as T | undefined;
      }
      if (sql.includes('FROM bundle_signers')) {
        return signers.get(params[0] as string) as T | undefined;
      }
      return undefined;
    },
    async all<T>(sql: string): Promise<T[]> {
      if (sql.includes('FROM skills')) {
        return [...skills.values()].filter((s) => !activeOnly(sql) || s.is_archived === 0) as T[];
      }
      return [];
    },
    async run(sql: string, ...params: unknown[]): Promise<RunResult> {
      if (/^\s*(INSERT|UPDATE)/i.test(sql)) writes.push({ sql, params });
      if (sql.includes('INSERT INTO custom_modules')) {
        const [id, name, short_name, description, icon, area, system_prompt, config, created_at, updated_at] = params as string[];
        modules.set(id, { id, name, short_name, description, icon, area, system_prompt, config, created_at, updated_at });
      } else if (sql.includes('INSERT INTO skills')) {
        const [id, name, description, version, author, category, prompt, tags, user_id, org_id] = params as string[];
        const existing = skills.get(id);
        // ON CONFLICT (id) DO UPDATE … WHERE skills.is_archived <> 0
        if (!existing || existing.is_archived !== 0) {
          skills.set(id, { id, name, description, version, author, category, prompt, tags, user_id, org_id, is_archived: 0 });
        }
      } else if (sql.includes('INSERT INTO personas')) {
        const [id, name, description, prompt, category, user_id, org_id] = params as Array<string | null>;
        const existing = personas.get(id as string);
        if (!existing || existing.is_archived !== 0) {
          personas.set(id as string, {
            id: id as string, name: name as string, description, prompt: prompt as string, category,
            source: 'import', user_id, org_id, is_archived: 0,
          });
        }
      } else if (sql.includes('INSERT INTO instance_identity')) {
        identity = {
          pubkey: params[0] as string,
          privkey: params[1] as string | null,
          privkey_encrypted: params[2] as Buffer | null,
          privkey_iv: params[3] as Buffer | null,
          display_name: seed.instanceName ?? (params[4] as string | null),
        };
      } else if (sql.includes('INSERT INTO bundle_signers')) {
        const pubkey = params[0] as string;
        if (!signers.has(pubkey)) signers.set(pubkey, { signer_name: params[1] as string | null });
      }
      return { changes: 1, lastInsertRowid: 0 } as RunResult;
    },
    async exec() { /* noop */ },
    async transaction<T>(fn: (txDb: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(db); },
    async close() { /* noop */ },
  };

  return {
    db,
    modules,
    skills,
    personas,
    writes,
    configOf: (moduleId: string) => {
      const row = modules.get(moduleId);
      if (!row) throw new Error(`module ${moduleId} was not installed`);
      return JSON.parse(row.config) as Record<string, unknown>;
    },
  };
}

/** A custom_modules row with sensible defaults. */
export function customModuleRow(config: Record<string, unknown>, overrides: Partial<CustomModuleRow> = {}): CustomModuleRow {
  return {
    id: 'custom-ab12cd34',
    name: 'Shared Module Fixture',
    short_name: 'shared-module-fixture',
    description: 'Wave 6 bundle fixture',
    icon: '🦊',
    area: 'custom',
    system_prompt: 'You are a careful compliance reviewer. Cite the article for every finding.',
    config: JSON.stringify(config),
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-02T00:00:00.000Z',
    ...overrides,
  };
}
