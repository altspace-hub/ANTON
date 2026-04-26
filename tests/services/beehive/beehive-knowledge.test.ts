/**
 * beehive-knowledge.test.ts — disclosure-policy + atom-selection tests.
 *
 * Verifies that the disclosure-level rules + redaction logic + excluded-
 * client filter work as designed. The internal helpers (extractKeywords,
 * mentionsExcludedClient, redactEntities) aren't exported but are
 * exercised through the selectAtomsForDisclosure surface.
 */

import { describe, it, expect } from 'vitest';
import { createBeehiveKnowledge } from '../../../server/services/beehive/beehive-knowledge.js';
import type { DatabaseAdapter } from '../../../server/db/database.js';
import type { DisclosurePolicy } from '../../../server/services/beehive/types.js';

interface SqlCall { sql: string; args: unknown[]; }

interface AtomRow {
  id: string;
  content: string;
  atom_type: string;
  confidence: number;
  category: string;
  subcategory: string | null;
  tags: string | null;
  entities: string | null;
  created_at: string;
}

function makeMockDb(rows: AtomRow[] = []): DatabaseAdapter & { calls: SqlCall[] } {
  const calls: SqlCall[] = [];
  return {
    all: async (sql: string, ...args: unknown[]) => { calls.push({ sql, args }); return rows; },
    get: async () => undefined,
    run: async () => {},
    exec: async () => {},
    calls,
  } as unknown as DatabaseAdapter & { calls: SqlCall[] };
}

const policy = (over: Partial<DisclosurePolicy> & Pick<DisclosurePolicy, 'level'>): DisclosurePolicy => ({
  level: over.level,
  max_atoms_shared: over.max_atoms_shared ?? 50,
  excluded_tags: over.excluded_tags ?? [],
  excluded_clients: over.excluded_clients ?? [],
  redact_names: over.redact_names ?? false,
  require_human_approval: over.require_human_approval ?? false,
});

describe('selectAtomsForDisclosure — disclosure levels', () => {
  it('reasoning_only returns empty array immediately (no DB hit)', async () => {
    const db = makeMockDb([]);
    const svc = createBeehiveKnowledge(db);
    const r = await svc.selectAtomsForDisclosure({ hiveQuestion: 'q', policy: policy({ level: 'reasoning_only' }) });
    expect(r).toEqual([]);
    expect(db.calls).toHaveLength(0);
  });

  it('atoms_tagged filters on shareable / beehive tags', async () => {
    const db = makeMockDb([]);
    const svc = createBeehiveKnowledge(db);
    await svc.selectAtomsForDisclosure({ hiveQuestion: 'q', policy: policy({ level: 'atoms_tagged' }) });
    expect(db.calls[0].sql).toContain('"shareable"');
    expect(db.calls[0].sql).toContain('"beehive"');
  });

  it('atoms_domain extracts keywords and applies LIKE filters', async () => {
    const db = makeMockDb([]);
    const svc = createBeehiveKnowledge(db);
    await svc.selectAtomsForDisclosure({
      hiveQuestion: 'How should we handle anti money laundering compliance for crypto exchanges?',
      policy: policy({ level: 'atoms_domain' }),
    });
    expect(db.calls[0].sql).toContain('LOWER(content) LIKE');
    // Some keyword should make it into args
    const args = db.calls[0].args as string[];
    expect(args.some(a => /money|laundering|crypto|compliance|exchanges|handle|anti/.test(a))).toBe(true);
  });

  it('atoms_domain skips DB call when question has no keywords', async () => {
    const db = makeMockDb([]);
    const svc = createBeehiveKnowledge(db);
    // Only stopwords + short words
    await svc.selectAtomsForDisclosure({ hiveQuestion: 'a is the of', policy: policy({ level: 'atoms_domain' }) });
    expect(db.calls).toHaveLength(0);
  });

  it('full_context with no scope is unfiltered + ordered by confidence', async () => {
    const db = makeMockDb([]);
    const svc = createBeehiveKnowledge(db);
    await svc.selectAtomsForDisclosure({ hiveQuestion: 'x', policy: policy({ level: 'full_context' }) });
    expect(db.calls[0].sql).toContain('is_active = 1');
    expect(db.calls[0].sql).toContain('ORDER BY confidence DESC');
  });

  it('scopeAreas adds an IN clause', async () => {
    const db = makeMockDb([]);
    const svc = createBeehiveKnowledge(db);
    await svc.selectAtomsForDisclosure({
      hiveQuestion: 'x',
      policy: policy({ level: 'full_context' }),
      scopeAreas: ['fcp', 'cyber'],
    });
    expect(db.calls[0].sql).toContain('source_area_id IN');
  });

  it('limit is capped at 500 atoms maximum (over the wire is the same)', async () => {
    const db = makeMockDb([]);
    const svc = createBeehiveKnowledge(db);
    await svc.selectAtomsForDisclosure({
      hiveQuestion: 'x',
      policy: policy({ level: 'full_context', max_atoms_shared: 999999 }),
    });
    const args = db.calls[0].args as number[];
    // The LIMIT bind position is the last arg; should be capped at 500
    expect(args[args.length - 1]).toBeLessThanOrEqual(500);
  });

  it('max_atoms_shared = 0 short-circuits to empty', async () => {
    const db = makeMockDb([]);
    const svc = createBeehiveKnowledge(db);
    const r = await svc.selectAtomsForDisclosure({
      hiveQuestion: 'x',
      policy: policy({ level: 'full_context', max_atoms_shared: 0 }),
    });
    expect(r).toEqual([]);
    expect(db.calls).toHaveLength(0);
  });
});

describe('selectAtomsForDisclosure — exclusion + redaction', () => {
  function mkAtom(over: Partial<AtomRow>): AtomRow {
    return {
      id: over.id ?? 'a1',
      content: over.content ?? 'Generic content',
      atom_type: 'fact',
      confidence: 0.8,
      category: 'fcp',
      subcategory: null,
      tags: null,
      entities: null,
      created_at: '',
      ...over,
    };
  }

  it('filters atoms mentioning excluded_clients (substring match)', async () => {
    const db = makeMockDb([
      mkAtom({ id: 'a1', content: 'Acme Bank failed an audit' }),
      mkAtom({ id: 'a2', content: 'Generic learning' }),
    ]);
    const svc = createBeehiveKnowledge(db);
    const r = await svc.selectAtomsForDisclosure({
      hiveQuestion: 'x',
      policy: policy({ level: 'full_context', excluded_clients: ['Acme Bank'] }),
    });
    expect(r.find(a => a.atom_id === 'a1')).toBeUndefined();
    expect(r.find(a => a.atom_id === 'a2')).toBeDefined();
  });

  it('redacts entities when redact_names = true', async () => {
    const db = makeMockDb([
      mkAtom({
        id: 'a1',
        content: 'John Smith reviewed the file',
        entities: JSON.stringify([{ entity_type: 'person', entity_name: 'John Smith' }]),
      }),
    ]);
    const svc = createBeehiveKnowledge(db);
    const r = await svc.selectAtomsForDisclosure({
      hiveQuestion: 'x',
      policy: policy({ level: 'full_context', redact_names: true }),
    });
    expect(r[0].content).toContain('[PERSON]');
    expect(r[0].content).not.toContain('John Smith');
  });
});
