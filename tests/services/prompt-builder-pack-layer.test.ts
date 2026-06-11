/**
 * prompt-builder-pack-layer.test.ts — Wave 1 item 1.3 (Core Experience Review
 * 2026-06): buildKnowledgePackLayer must inject ACTUAL pack entity text
 * (budgeted, with per-entity pack + ref attribution), not just pack names +
 * entity counts (the previous "grounding placebo").
 *
 * hybridSearch is mocked (no embeddings/OpenAI needed); the DB is an in-memory
 * fake adapter emulating the exact queries the layer issues.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';
import type { HybridSearchResult } from '../../server/services/hybrid-search.js';

vi.mock('../../server/services/hybrid-search.js', () => ({
  hybridSearch: vi.fn(),
  embedAndStore: vi.fn(),
  findSimilar: vi.fn(),
}));

import { hybridSearch } from '../../server/services/hybrid-search.js';
import { buildKnowledgePackLayer } from '../../server/services/prompt-builder.js';

const hybridSearchMock = vi.mocked(hybridSearch);

// ── Fixtures ────────────────────────────────────────────────────────────────

const PACK_ID = 'pack-amlr-1';
const PACK_ROW = {
  id: PACK_ID,
  display_name: 'EU AMLR Core',
  regulatory_area: 'AML/CFT',
  regulation_ids: '["AMLR-2024"]',
  entity_count: 275,
};

const ENTITY_TEXT =
  'AMLR Article 16 — Obliged entities shall take appropriate measures to identify and assess the risks of money laundering';

function hybridResult(overrides: Partial<HybridSearchResult> = {}): HybridSearchResult {
  return {
    id: 'emb-1',
    content_type: 'knowledge_pack_entity',
    content_id: `${PACK_ID}::AMLR-Art-16`,
    content_text: ENTITY_TEXT,
    score: 0.9,
    snippet: ENTITY_TEXT.slice(0, 100),
    metadata: { packId: PACK_ID, refId: 'AMLR-Art-16', packName: 'EU AMLR Core' },
    source: 'vector',
    ...overrides,
  };
}

// ── In-memory fake adapter ──────────────────────────────────────────────────

interface FakeDbState {
  activeCount: number;
  packs: Array<typeof PACK_ROW>;
  embeddingsRows: Array<{ content_id: string; content_text: string }>;
  entityNodes: Array<{ entity_type: string; entity_id: string; canonical_name: string; metadata: string | null }>;
}

function makeFakeDb(state: FakeDbState): DatabaseAdapter {
  return {
    dialect: 'postgresql' as DatabaseAdapter['dialect'],
    async get<T>(sql: string): Promise<T | undefined> {
      if (sql.includes("COUNT(*) as c FROM knowledge_packs")) {
        return { c: state.activeCount } as T;
      }
      return undefined;
    },
    async all<T>(sql: string): Promise<T[]> {
      if (sql.includes('FROM knowledge_packs')) return state.packs as T[];
      if (sql.includes('FROM embeddings')) return state.embeddingsRows as T[];
      if (sql.includes('FROM entity_nodes')) return state.entityNodes as T[];
      return [];
    },
    async run(): Promise<RunResult> {
      return { changes: 0, lastInsertRowid: 0 } as RunResult;
    },
  } as unknown as DatabaseAdapter;
}

beforeEach(() => {
  hybridSearchMock.mockReset();
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('buildKnowledgePackLayer — injects real entity text (1.3)', () => {
  it('returns empty string when no packs are active', async () => {
    const db = makeFakeDb({ activeCount: 0, packs: [], embeddingsRows: [], entityNodes: [] });
    expect(await buildKnowledgePackLayer(db)).toBe('');
    expect(hybridSearchMock).not.toHaveBeenCalled();
  });

  it('semantic path: includes entity TEXT with pack + ref attribution', async () => {
    hybridSearchMock.mockResolvedValue([hybridResult()]);
    const db = makeFakeDb({ activeCount: 1, packs: [PACK_ROW], embeddingsRows: [], entityNodes: [] });

    const layer = await buildKnowledgePackLayer(db, {
      areaId: 'fcp',
      moduleId: 'business-wide-risk-assessment',
      userMessage: 'What does AMLR require for a business-wide risk assessment?',
    });

    // Header (pack summary) still present
    expect(layer).toContain('## ACTIVE REGULATORY KNOWLEDGE PACKS');
    expect(layer).toContain('EU AMLR Core');
    // The actual entity text — not just the name/count placebo
    expect(layer).toContain('### Relevant pack content');
    expect(layer).toContain(ENTITY_TEXT);
    // Per-entity attribution: pack name + entity ref
    expect(layer).toContain('[EU AMLR Core · AMLR-Art-16]');
    // Only the knowledge_pack_entity content type was searched
    expect(hybridSearchMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ contentTypes: ['knowledge_pack_entity'] })
    );
  });

  it('filters out results from non-active packs', async () => {
    hybridSearchMock.mockResolvedValue([
      hybridResult({ content_id: 'other-pack::Foreign-Ref', content_text: 'foreign pack text', metadata: {} }),
    ]);
    const db = makeFakeDb({ activeCount: 1, packs: [PACK_ROW], embeddingsRows: [], entityNodes: [] });

    const layer = await buildKnowledgePackLayer(db, { userMessage: 'risk assessment question' });
    expect(layer).not.toContain('foreign pack text');
  });

  it('deterministic fallback: uses embedding content_text rows when semantic search fails', async () => {
    hybridSearchMock.mockRejectedValue(new Error('no embedding adapter'));
    const db = makeFakeDb({
      activeCount: 1,
      packs: [PACK_ROW],
      embeddingsRows: [
        { content_id: `${PACK_ID}::AMLR-Art-7`, content_text: 'AMLR Article 7 — internal policies, controls and procedures' },
      ],
      entityNodes: [],
    });

    const layer = await buildKnowledgePackLayer(db, { areaId: 'fcp', userMessage: 'controls question' });
    expect(layer).toContain('AMLR Article 7 — internal policies, controls and procedures');
    expect(layer).toContain('[EU AMLR Core · AMLR-Art-7]');
  });

  it('last-resort fallback: entity_nodes names + metadata when no embeddings exist', async () => {
    hybridSearchMock.mockRejectedValue(new Error('no embedding adapter'));
    const db = makeFakeDb({
      activeCount: 1,
      packs: [PACK_ROW],
      embeddingsRows: [],
      entityNodes: [
        { entity_type: 'obligation', entity_id: 'AMLR-Art-16', canonical_name: 'Business-wide risk assessment', metadata: '{"article":"16","deadline":"2027-07-10"}' },
      ],
    });

    const layer = await buildKnowledgePackLayer(db); // no context — deterministic path
    expect(layer).toContain('Business-wide risk assessment [obligation]');
    expect(layer).toContain('article: 16');
    expect(layer).toContain('[EU AMLR Core · AMLR-Art-16]');
  });

  it('respects the token budget — caps injected entity text', async () => {
    // 30 results of ~2000 chars (~500 tokens each) — only ~7 fit in 3,500 tokens
    const many = Array.from({ length: 30 }, (_, i) =>
      hybridResult({
        content_id: `${PACK_ID}::ref-${i}`,
        content_text: `Entity ${i} — ${'x'.repeat(2000)}`,
        metadata: { packId: PACK_ID, refId: `ref-${i}`, packName: 'EU AMLR Core' },
      })
    );
    hybridSearchMock.mockResolvedValue(many);
    const db = makeFakeDb({ activeCount: 1, packs: [PACK_ROW], embeddingsRows: [], entityNodes: [] });

    const layer = await buildKnowledgePackLayer(db, { userMessage: 'budget test question' });
    const injected = many.filter((r) => layer.includes(`· ${(r.metadata as Record<string, unknown>).refId as string}]`));
    expect(injected.length).toBeGreaterThan(0);
    expect(injected.length).toBeLessThan(30);
    // Whole layer stays in the same ballpark as the 3.5k-token budget (~4 chars/token)
    expect(layer.length).toBeLessThan(3500 * 4 + 2000);
  });
});
