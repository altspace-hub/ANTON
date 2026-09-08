/**
 * prompt-builder-scoped-layers.test.ts — the knowledge layers stay on task.
 *
 * run_artifacts on this instance holds an open-chat prompt for "Draft a
 * project kickoff agenda" in which 25,307 of 31,554 characters were retrieved
 * context that had nothing to do with the question: an AML knowledge pack
 * listed as "active for this session", 25 Coding Studio review flags offered
 * as "supporting evidence", and Markets ESG constraints marked HARD. The model
 * visibly rewrote the task into an AMLR readiness project.
 *
 * Rules locked here:
 *   - a run with neither area nor module gets pack content only on a strong
 *     semantic match, and no pack listing at all otherwise;
 *   - a Coding Studio project's atoms never leave that project's runs;
 *   - with no area the atom fallback (the 15 most confident atoms from
 *     anywhere) is not used.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';
import type { HybridSearchResult } from '../../server/services/hybrid-search.js';

vi.mock('../../server/services/hybrid-search.js', () => ({
  hybridSearch: vi.fn(),
  embedAndStore: vi.fn(),
  findSimilar: vi.fn(),
  INSTANCE_WIDE_SEARCH: { kind: 'instance' },
  NO_OWNED_CONTENT: { kind: 'none' },
  searchScopeForRequest: vi.fn(() => ({ kind: 'instance' })),
}));

import { hybridSearch } from '../../server/services/hybrid-search.js';
import { buildKnowledgePackLayer, buildAtomLayer } from '../../server/services/prompt-builder.js';

const hybridSearchMock = vi.mocked(hybridSearch);

const PACK_ID = 'pack-amlr-1';
const PACK_ROW = { id: PACK_ID, display_name: 'EU AMLR Core', regulatory_area: 'AML/CFT', regulation_ids: '["AMLR-2024"]', entity_count: 275 };
const ENTITY_TEXT = 'AMLR Article 16 — Obliged entities shall identify and assess the risks of money laundering';

function packHit(): HybridSearchResult {
  return {
    id: 'emb-1', content_type: 'knowledge_pack_entity', content_id: `${PACK_ID}::AMLR-Art-16`,
    content_text: ENTITY_TEXT, score: 0.9, snippet: ENTITY_TEXT.slice(0, 60),
    metadata: { packId: PACK_ID, refId: 'AMLR-Art-16', packName: 'EU AMLR Core' }, source: 'vector',
  };
}

/** Fake adapter for the pack layer: one active pack, embeddings rows for the deterministic tier. */
function packDb(): DatabaseAdapter {
  return {
    dialect: 'postgresql',
    async get(sql: string) { if (/COUNT\(\*\)/.test(sql)) return { c: 1 }; return undefined; },
    async all<T>(sql: string): Promise<T[]> {
      if (/FROM knowledge_packs/.test(sql)) return [PACK_ROW as T];
      if (/FROM embeddings/.test(sql)) return [{ content_id: `${PACK_ID}::AMLR-Art-1`, content_text: 'AMLR Article 1 — Subject matter' } as T];
      return [];
    },
    async run(): Promise<RunResult> { return { changes: 0, lastInsertRowid: 0 } as RunResult; },
    async exec() { /* noop */ },
    async transaction<T>(fn: (db: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(this as unknown as DatabaseAdapter); },
    async close() { /* noop */ },
  } as DatabaseAdapter;
}

beforeEach(() => { hybridSearchMock.mockReset(); });

describe('buildKnowledgePackLayer — a run with no area and no module (open chat)', () => {
  it('returns nothing — not even the pack listing — when semantic retrieval finds no strong match', async () => {
    hybridSearchMock.mockResolvedValue([]);
    const layer = await buildKnowledgePackLayer(packDb(), { userMessage: 'Draft a project kickoff agenda for the Q4 review' });
    expect(layer).toBe('');
    // and the deterministic dump (tier 2: embeddings by pack prefix) was never the answer
    expect(hybridSearchMock).toHaveBeenCalledTimes(1);
  });

  it('demands a stronger similarity than an area-scoped run', async () => {
    hybridSearchMock.mockResolvedValue([]);
    await buildKnowledgePackLayer(packDb(), { userMessage: 'Draft a project kickoff agenda' });
    const strictFloor = (hybridSearchMock.mock.calls[0][1] as { minSimilarity?: number }).minSimilarity;
    hybridSearchMock.mockResolvedValue([]);
    await buildKnowledgePackLayer(packDb(), { areaId: 'fcp', userMessage: 'Draft a project kickoff agenda' });
    const areaFloor = (hybridSearchMock.mock.calls[1][1] as { minSimilarity?: number }).minSimilarity;
    expect(strictFloor).toBeGreaterThan(areaFloor ?? 0);
  });

  it('still injects pack text when the question genuinely matches', async () => {
    hybridSearchMock.mockResolvedValue([packHit()]);
    const layer = await buildKnowledgePackLayer(packDb(), { userMessage: 'What does AMLR Article 16 require of obliged entities?' });
    expect(layer).toContain('EU AMLR Core');
    expect(layer).toContain('Article 16');
  });

  it('an area-scoped run keeps the deterministic fallback (the module asked for the packs)', async () => {
    hybridSearchMock.mockResolvedValue([]);
    const layer = await buildKnowledgePackLayer(packDb(), { areaId: 'fcp', moduleId: 'sanctions-advisory', userMessage: 'screen this counterparty' });
    expect(layer).toContain('EU AMLR Core');
    expect(layer).toContain('Article 1');
  });
});

/** Fake adapter for the atom layer: two atoms, one of them a Coding Studio project's review flag. */
function atomDb() {
  const seen: string[] = [];
  const atoms = [
    { id: 'atom-general', content: 'Kickoff agendas should open with decisions needed, not status.', atom_type: 'insight', category: 'process', confidence: 0.9, source_area_id: null, source_module_id: null, created_at: '2026-09-01', superseded_by: null, coding_project_id: null },
    { id: 'atom-studio', content: 'Project Manager flag: slugify() ignores unicode dashes', atom_type: 'review.flag', category: 'code', confidence: 0.95, source_area_id: 'coding', source_module_id: null, created_at: '2026-09-02', superseded_by: null, coding_project_id: 'proj-slugify' },
  ];
  const db = {
    dialect: 'postgresql',
    async get() { return undefined; },
    async all<T>(sql: string): Promise<T[]> {
      seen.push(sql);
      if (/FROM knowledge_atoms ka/.test(sql)) return [];            // the no-area fallback query — must not be reached
      if (/FROM knowledge_atoms WHERE id IN/.test(sql)) return atoms as T[];
      return [];
    },
    async run(): Promise<RunResult> { return { changes: 0, lastInsertRowid: 0 } as RunResult; },
    async exec() { /* noop */ },
    async transaction<T>(fn: (db: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(this as unknown as DatabaseAdapter); },
    async close() { /* noop */ },
  } as DatabaseAdapter;
  return { db, seen };
}

const atomHit = (id: string, text: string): HybridSearchResult => ({
  id: `emb-${id}`, content_type: 'knowledge_atom', content_id: id, content_text: text, score: 0.8, snippet: text, metadata: {}, source: 'vector',
});

describe('buildAtomLayer — scope', () => {
  it('never hands a Coding Studio project\'s atoms to a run outside that project', async () => {
    hybridSearchMock.mockResolvedValue([
      atomHit('atom-general', 'Kickoff agendas should open with decisions needed, not status.'),
      atomHit('atom-studio', 'Project Manager flag: slugify() ignores unicode dashes'),
    ]);
    const { db } = atomDb();
    const layer = await buildAtomLayer(db, 'fcp', null, 'Draft a project kickoff agenda', null);
    expect(layer).toContain('Kickoff agendas');
    expect(layer).not.toContain('slugify');
  });

  it('does not fall back to the unscoped 30-day dump when the run has no area', async () => {
    hybridSearchMock.mockResolvedValue([]);
    const { db, seen } = atomDb();
    const layer = await buildAtomLayer(db, '', null, 'Draft a project kickoff agenda', null);
    expect(layer).toBe('');
    expect(seen.some((sql) => /FROM knowledge_atoms ka/.test(sql))).toBe(false);
  });
});

// ── Wave 3 (2026-09-08): open chat's pack slice is small ─────────────────────
// The "context used" line showed ~18k characters of pack text riding on a
// question about an engagement letter. Strict mode now asks for a dozen close
// matches and keeps a quarter of the module budget.
describe('buildKnowledgePackLayer — strict mode budget', () => {
  function manyHits(n: number): HybridSearchResult[] {
    return Array.from({ length: n }, (_, i) => ({
      ...packHit(),
      id: `emb-${i}`,
      content_id: `${PACK_ID}::AMLR-Art-${i}`,
      content_text: `AMLR Article ${i} — ${'obliged entities shall keep records of the measures taken '.repeat(8)}`,
      score: 0.9 - i * 0.01,
      metadata: { packId: PACK_ID, refId: `AMLR-Art-${i}`, packName: 'EU AMLR Core' },
    }));
  }

  it('asks for far fewer, closer matches than a module run and keeps a fraction of the text', async () => {
    hybridSearchMock.mockResolvedValue(manyHits(30));
    const strictLayer = await buildKnowledgePackLayer(packDb(), { userMessage: 'What does the engagement letter say about the client?' });
    const strictOpts = hybridSearchMock.mock.calls[0][1] as { topK?: number; minSimilarity?: number };

    hybridSearchMock.mockResolvedValue(manyHits(30));
    const moduleLayer = await buildKnowledgePackLayer(packDb(), { areaId: 'fcp', moduleId: 'amlr-readiness', userMessage: 'What does the engagement letter say about the client?' });
    const moduleOpts = hybridSearchMock.mock.calls[1][1] as { topK?: number; minSimilarity?: number };

    expect(strictOpts.topK).toBeLessThanOrEqual(12);
    expect(moduleOpts.topK).toBeGreaterThan(strictOpts.topK ?? 0);
    expect(strictOpts.minSimilarity).toBeGreaterThan(moduleOpts.minSimilarity ?? 0);
    expect(strictLayer.length).toBeLessThan(5_000);
    expect(strictLayer.length).toBeLessThan(moduleLayer.length / 2);
  });
});
