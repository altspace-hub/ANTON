/**
 * atom-extractor-entities.test.ts — what extraction writes (Wave 4).
 *
 * Live findings 2026-09-16: knowledge_entity_refs had 0 rows because the
 * prompt never asked for entities; 143 of 2,959 atoms were exact duplicates;
 * no atom had an owner; `status.*` boilerplate ("Claude is ready to provide
 * analytical assistance…") was learned and later injected as evidence.
 *
 * Against a fake adapter answering ATOM_EXTRACTOR_SQL by identity, with the
 * LLM (provider-router.callChat) and the embedder (hybrid-search.embedAndStore)
 * mocked:
 *   - entities the model returns are stored as refs with a slug id and the
 *     original name, and the prompt asks for them;
 *   - status.* atoms and assistant chatter are dropped, never inserted;
 *   - an atom whose content hash matches an active atom is refused;
 *   - owner_user_id and content_hash are written with the atom;
 *   - the embedding metadata carries the owner;
 *   - an LLM failure is thrown with its message intact.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';

const callChatMock = vi.fn();
const embedAndStoreMock = vi.fn();

vi.mock('../../server/services/provider-router.js', () => ({
  callChat: (...args: unknown[]) => callChatMock(...args),
  mapModelToProvider: (m: string) => m,
}));
vi.mock('../../server/services/utility-model.js', () => ({
  getRoutedUtilityModel: async () => 'fake-utility-model',
}));
vi.mock('../../server/services/hybrid-search.js', () => ({
  embedAndStore: (...args: unknown[]) => embedAndStoreMock(...args),
}));
vi.mock('../../server/services/parse-telemetry.js', () => ({
  recordParseOutcome: async () => undefined,
}));

import {
  ATOM_EXTRACTOR_SQL,
  ATOM_TYPE_TAXONOMY,
  ENTITY_TYPES,
  createAtomExtractor,
  contentHashOf,
  entitySlug,
  isAssistantChatter,
  isDroppedAtomType,
  normaliseEntities,
} from '../../server/services/atom-extractor.js';

const OUTPUT_ID = 'out-1';
const OUTPUT = {
  id: OUTPUT_ID, execution_id: 'exec-1', workflow_id: 'wf-1', step_index: 0, step_type: 'text',
  area_id: 'fcp', module_id: 'gap-analysis', output_data: JSON.stringify('Nordea Bank must complete its BWRA under AMLR Article 16.'),
  workflow_name: 'Gap analysis', step_name: 'assess', created_by: 'user-42',
};

interface InsertedAtom { id: string; params: unknown[] }
interface FakeState {
  atoms: InsertedAtom[];
  entityRefs: unknown[][];
  /** content hashes the table already holds on an ACTIVE atom. */
  activeHashes: Set<string>;
  duplicateChecks: string[];
}

/** Positions in ATOM_EXTRACTOR_SQL.insertAtom's parameter list. */
const P = { id: 0, sourceOutput: 1, content: 6, atomType: 7, category: 9, entities: 13, contentHash: 16, owner: 17 } as const;

function makeFakeDb(): { db: DatabaseAdapter; state: FakeState } {
  const state: FakeState = { atoms: [], entityRefs: [], activeHashes: new Set(), duplicateChecks: [] };
  const rowFor = (a: InsertedAtom): Record<string, unknown> => ({
    id: a.id, source_output_id: a.params[P.sourceOutput], source_workflow_id: 'wf-1', source_execution_id: 'exec-1',
    source_area_id: 'fcp', source_module_id: 'gap-analysis', content: a.params[P.content], atom_type: a.params[P.atomType],
    confidence: 0.8, category: a.params[P.category], subcategory: null, sentiment: null, temporal_type: null,
    entities: a.params[P.entities], tags: null, valid_from: null, valid_until: null, created_at: '2026-09-17T09:00:00Z',
    superseded_by: null, is_active: 1, owner_user_id: a.params[P.owner], content_hash: a.params[P.contentHash],
  });
  const db = {
    dialect: 'postgresql',
    async get<T>(sql: string, ...params: unknown[]): Promise<T | undefined> {
      if (sql === ATOM_EXTRACTOR_SQL.output) return params[0] === OUTPUT_ID ? (OUTPUT as T) : undefined;
      if (sql === ATOM_EXTRACTOR_SQL.activeDuplicate) {
        const hash = String(params[0]);
        state.duplicateChecks.push(hash);
        return state.activeHashes.has(hash) ? ({ id: 'atom-existing' } as T) : undefined;
      }
      if (sql === 'SELECT * FROM knowledge_atoms WHERE id = ?') {
        const a = state.atoms.find((x) => x.id === params[0]);
        return a ? (rowFor(a) as T) : undefined;
      }
      throw new Error(`fake db: unexpected get(): ${sql.slice(0, 80)}`);
    },
    async all<T>(sql: string): Promise<T[]> {
      // Relationship detection lists recent atoms — none, so it exits before any LLM call.
      if (/FROM knowledge_atoms a/.test(sql)) return [];
      throw new Error(`fake db: unexpected all(): ${sql.slice(0, 80)}`);
    },
    async run(sql: string, ...params: unknown[]): Promise<RunResult> {
      if (sql === ATOM_EXTRACTOR_SQL.insertAtom) {
        state.atoms.push({ id: String(params[P.id]), params });
        return { changes: 1, lastInsertRowid: 0 };
      }
      if (sql === ATOM_EXTRACTOR_SQL.insertEntityRef) {
        state.entityRefs.push(params);
        return { changes: 1, lastInsertRowid: 0 };
      }
      throw new Error(`fake db: unexpected run(): ${sql.slice(0, 80)}`);
    },
    async exec() { /* noop */ },
    async transaction<T>(fn: (d: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(db); },
    async close() { /* noop */ },
  } as unknown as DatabaseAdapter;
  return { db, state };
}

const llmReturns = (atoms: unknown[]): void => { callChatMock.mockResolvedValue({ text: JSON.stringify(atoms) }); };
const settle = (): Promise<void> => new Promise((r) => setImmediate(r));

const FINDING = {
  content: 'Nordea Bank must complete its BWRA under AMLR Article 16 before December.',
  atom_type: 'observation.finding',
  category: 'observation',
  entities: [
    { type: 'organisation', name: 'Nordea Bank' },
    { type: 'regulation', name: 'AMLR Article 16' },
    { type: 'person', name: 'Anna Lindqvist' },
  ],
};

beforeEach(() => {
  callChatMock.mockReset();
  embedAndStoreMock.mockReset();
  embedAndStoreMock.mockResolvedValue(undefined);
});

describe('the pure helpers', () => {
  it('contentHashOf is case- and whitespace-insensitive (migration 275 normalisation)', () => {
    expect(contentHashOf('  The Client Is Nordea.  ')).toBe(contentHashOf('the client is nordea.'));
    expect(contentHashOf('a')).not.toBe(contentHashOf('b'));
    expect(contentHashOf('x')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('entitySlug lower-cases and hyphenates, keeping non-Latin letters', () => {
    expect(entitySlug('Nordea Bank')).toBe('nordea-bank');
    expect(entitySlug('  AMLR — Article 16 ')).toBe('amlr-article-16');
    expect(entitySlug('Städtische Sparkasse')).toBe('städtische-sparkasse');
    expect(entitySlug('***')).toBe('');
  });

  it('isDroppedAtomType drops the whole status.* family', () => {
    expect(isDroppedAtomType('status.system_health')).toBe(true);
    expect(isDroppedAtomType('Status.project_progress')).toBe(true);
    expect(isDroppedAtomType('observation.finding')).toBe(false);
  });

  it('isAssistantChatter matches the assistant talking about itself and not the user\'s world', () => {
    expect(isAssistantChatter('Claude is ready to provide analytical assistance on your compliance questions.')).toBe(true);
    expect(isAssistantChatter("I'm here to help with the assessment.")).toBe(true);
    expect(isAssistantChatter('The assistant will now summarise.')).toBe(true);
    expect(isAssistantChatter('The MLRO escalated the sanctions gap to the risk committee.')).toBe(false);
  });

  it('normaliseEntities slugs, types, de-duplicates and drops nameless entries', () => {
    expect(normaliseEntities([
      { type: 'organisation', name: 'Nordea Bank' },
      { type: 'ORGANISATION', name: 'nordea bank' },      // same entity, different casing
      { type: 'company', name: 'Swedbank' },              // unknown type → other
      { type: 'person' },                                  // nameless → dropped
      { type: 'system', id: 'core-banking' },              // legacy id-only shape
      'not an object',
    ])).toEqual([
      { type: 'organisation', id: 'nordea-bank', name: 'Nordea Bank' },
      { type: 'other', id: 'swedbank', name: 'Swedbank' },
      { type: 'system', id: 'core-banking', name: 'core-banking' },
    ]);
    expect(normaliseEntities(undefined)).toEqual([]);
  });

  it('the taxonomy offered to the model has no status.* type', () => {
    expect(ATOM_TYPE_TAXONOMY).not.toMatch(/status\./);
    expect(ATOM_TYPE_TAXONOMY).toMatch(/observation\.finding/);
    expect([...ENTITY_TYPES]).toEqual(['organisation', 'person', 'regulation', 'product', 'jurisdiction', 'system', 'other']);
  });
});

describe('extractAtoms', () => {
  it('asks the model for entities and no longer offers the status family or category', async () => {
    llmReturns([]);
    const { db } = makeFakeDb();
    await (await createAtomExtractor(db)).extractAtoms(OUTPUT_ID);
    const cfg = callChatMock.mock.calls[0][0] as { system: string; background: boolean; jsonMode: boolean; model: string };
    expect(cfg.system).toMatch(/entities: array of \{ "type": organisation \| person \| regulation \| product \| jurisdiction \| system \| other, "name"/);
    expect(cfg.system).not.toMatch(/status\./);
    expect(cfg.system).toMatch(/category: observation \| decision \| action \| risk \| recommendation \(required\)/);
    expect(cfg.background).toBe(true);
    expect(cfg.jsonMode).toBe(true);
    expect(cfg.model).toBe('fake-utility-model');
  });

  it('stores the returned entities as refs — slug id, original name — and reports them', async () => {
    llmReturns([FINDING]);
    const { db, state } = makeFakeDb();
    const result = await (await createAtomExtractor(db)).extractAtoms(OUTPUT_ID);

    expect(result).toEqual({ inserted: 1, duplicates: 0, dropped: 0, entities: 3 });
    expect(state.atoms).toHaveLength(1);
    const atomId = state.atoms[0].id;
    expect(state.entityRefs).toEqual([
      [atomId, 'organisation', 'nordea-bank', 'Nordea Bank', null],
      [atomId, 'regulation', 'amlr-article-16', 'AMLR Article 16', null],
      [atomId, 'person', 'anna-lindqvist', 'Anna Lindqvist', null],
    ]);
    // The atom's own entities column holds the normalised list.
    expect(JSON.parse(String(state.atoms[0].params[P.entities]))).toEqual([
      { type: 'organisation', id: 'nordea-bank', name: 'Nordea Bank' },
      { type: 'regulation', id: 'amlr-article-16', name: 'AMLR Article 16' },
      { type: 'person', id: 'anna-lindqvist', name: 'Anna Lindqvist' },
    ]);
    expect(ATOM_EXTRACTOR_SQL.insertEntityRef).toMatch(/ON CONFLICT DO NOTHING/);
  });

  it('writes owner_user_id from workflow_outputs.created_by and the content hash', async () => {
    llmReturns([FINDING]);
    const { db, state } = makeFakeDb();
    await (await createAtomExtractor(db)).extractAtoms(OUTPUT_ID);
    const params = state.atoms[0].params;
    expect(params[P.owner]).toBe('user-42');
    expect(params[P.contentHash]).toBe(contentHashOf(FINDING.content));
    expect(params[P.sourceOutput]).toBe(OUTPUT_ID);
    expect(ATOM_EXTRACTOR_SQL.insertAtom).toMatch(/content_hash, owner_user_id, created_at\)/);
    // parameterised: the values never enter the SQL text
    expect(ATOM_EXTRACTOR_SQL.insertAtom).not.toContain('user-42');
  });

  it('drops status.* atoms and assistant chatter — never inserted, counted as dropped', async () => {
    llmReturns([
      { content: 'System health is nominal.', atom_type: 'status.system_health', category: 'status' },
      { content: 'Claude is ready to provide analytical assistance on your compliance questions.', atom_type: 'observation.finding', category: 'observation' },
      { content: "I'm here to help with the assessment.", atom_type: 'recommendation.ai_suggestion', category: 'recommendation' },
      { content: 'The MLRO escalated the open sanctions gap to the risk committee.', atom_type: 'decision.escalation', category: 'decision', entities: [] },
      { atom_type: 'observation.finding', category: 'observation' },   // malformed: no content
    ]);
    const { db, state } = makeFakeDb();
    const result = await (await createAtomExtractor(db)).extractAtoms(OUTPUT_ID);
    expect(result).toEqual({ inserted: 1, duplicates: 0, dropped: 4, entities: 0 });
    expect(state.atoms.map((a) => a.params[P.content])).toEqual(['The MLRO escalated the open sanctions gap to the risk committee.']);
    // dropped atoms never reach the duplicate check either
    expect(state.duplicateChecks).toHaveLength(1);
  });

  it('refuses an atom whose content hash matches an active atom anywhere in the table', async () => {
    llmReturns([
      { ...FINDING, content: '  NORDEA BANK must complete its BWRA under AMLR Article 16 before December. ' },
      { content: 'The Q3 audit left the sanctions screening gap open.', atom_type: 'risk.identified', category: 'risk' },
    ]);
    const { db, state } = makeFakeDb();
    state.activeHashes.add(contentHashOf(FINDING.content));
    const result = await (await createAtomExtractor(db)).extractAtoms(OUTPUT_ID);
    expect(result).toEqual({ inserted: 1, duplicates: 1, dropped: 0, entities: 0 });
    expect(state.atoms.map((a) => a.params[P.content])).toEqual(['The Q3 audit left the sanctions screening gap open.']);
    expect(state.entityRefs).toEqual([]);   // the duplicate's entities are not written either
    expect(ATOM_EXTRACTOR_SQL.activeDuplicate).toMatch(/is_active = 1/);
  });

  it('negative control: the same atom with no matching active hash is inserted', async () => {
    llmReturns([FINDING]);
    const { db, state } = makeFakeDb();
    expect((await (await createAtomExtractor(db)).extractAtoms(OUTPUT_ID)).inserted).toBe(1);
    expect(state.atoms).toHaveLength(1);
  });

  it('the embedding metadata carries owner_user_id', async () => {
    llmReturns([FINDING]);
    const { db } = makeFakeDb();
    await (await createAtomExtractor(db)).extractAtoms(OUTPUT_ID);
    await settle();
    expect(embedAndStoreMock).toHaveBeenCalledTimes(1);
    const [, params] = embedAndStoreMock.mock.calls[0] as [unknown, { contentType: string; contentText: string; metadata: Record<string, unknown> }];
    expect(params.contentType).toBe('knowledge_atom');
    expect(params.contentText).toBe(FINDING.content);
    expect(params.metadata.owner_user_id).toBe('user-42');
    expect(params.metadata.source_module_id).toBe('gap-analysis');
  });

  it('an LLM failure is thrown with its message intact, so the ledger and the sweep can read it', async () => {
    const busy = 'SDK engine busy — background work is capped at 1 of 2 concurrent runs so interactive requests always keep a slot. It will retry on the next pass.';
    callChatMock.mockRejectedValue(new Error(busy));
    const { db, state } = makeFakeDb();
    await expect((await createAtomExtractor(db)).extractAtoms(OUTPUT_ID)).rejects.toThrow(busy);
    expect(state.atoms).toEqual([]);
  });

  it('an unparseable answer is not a failure: zeros, nothing inserted', async () => {
    callChatMock.mockResolvedValue({ text: 'Sorry, I cannot do that.' });
    const { db, state } = makeFakeDb();
    expect(await (await createAtomExtractor(db)).extractAtoms(OUTPUT_ID)).toEqual({ inserted: 0, duplicates: 0, dropped: 0, entities: 0 });
    expect(state.atoms).toEqual([]);
  });

  it('a missing output returns zeros without calling the model', async () => {
    const { db } = makeFakeDb();
    expect(await (await createAtomExtractor(db)).extractAtoms('nope')).toEqual({ inserted: 0, duplicates: 0, dropped: 0, entities: 0 });
    expect(callChatMock).not.toHaveBeenCalled();
  });
});
