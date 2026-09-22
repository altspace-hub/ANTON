/**
 * prompt-builder-pack-area-gate.test.ts — Wave 2 (2026-09-16): the pack layer
 * is scoped to the run's area and reports what it injected.
 *
 * Before this, every active pack was listed in every run and its entity text
 * injected regardless of area (the area test compared `fcp` against strings
 * like "AML/CFT"); and nothing recorded which pack entries reached the prompt.
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
import { buildKnowledgePackLayer, buildKnowledgePackLayerDetailed } from '../../server/services/prompt-builder.js';

const hybridSearchMock = vi.mocked(hybridSearch);

const AML = { id: 'pack-aml', name: 'amlr-2024', display_name: 'EU AMLR Core', version: '1.2.0', regulatory_area: 'AML/CFT', regulation_ids: '["AMLR","Regulation (EU) 2024/1624"]', entity_count: 134 };
const GDPR = { id: 'pack-gdpr', name: 'gdpr-ai-act', display_name: 'GDPR + AI Act', version: '2.0.0', regulatory_area: 'Data Protection / AI Governance', regulation_ids: '["GDPR","EU AI Act"]', entity_count: 80 };
const DORA = { id: 'pack-dora', name: 'dora-nis2', display_name: 'DORA + NIS2', version: '1.0.0', regulatory_area: 'Digital Resilience / Cybersecurity', regulation_ids: '["DORA","NIS2"]', entity_count: 60 };

function hit(packId: string, refId: string, text: string, score = 0.8): HybridSearchResult {
  return {
    id: `emb-${refId}`,
    content_type: 'knowledge_pack_entity',
    content_id: `${packId}::${refId}`,
    content_text: text,
    score,
    snippet: text.slice(0, 80),
    metadata: { packId, refId },
    source: 'vector',
  };
}

function makeFakeDb(packs: Array<typeof AML>, embeddingsRows: Array<{ content_id: string; content_text: string }> = []): DatabaseAdapter {
  return {
    dialect: 'postgresql' as DatabaseAdapter['dialect'],
    async get<T>(sql: string): Promise<T | undefined> {
      if (sql.includes('COUNT(*) as c FROM knowledge_packs')) return { c: packs.length } as T;
      return undefined;
    },
    async all<T>(sql: string, ...params: unknown[]): Promise<T[]> {
      if (sql.includes('FROM knowledge_packs')) return packs as T[];
      if (sql.includes('FROM embeddings')) {
        const like = String(params[0] ?? '');
        const prefix = like.replace(/%$/, '');
        return embeddingsRows.filter((r) => r.content_id.startsWith(prefix)) as T[];
      }
      return [];
    },
    async run(): Promise<RunResult> { return { changes: 0, lastInsertRowid: 0 } as RunResult; },
  } as unknown as DatabaseAdapter;
}

beforeEach(() => hybridSearchMock.mockReset());

describe('area gate', () => {
  it('an fcp run lists and searches only the AML pack, not the privacy pack', async () => {
    hybridSearchMock.mockResolvedValue([
      hit('pack-aml', 'AMLR-Art-20', 'AMLR Article 20 — customer due diligence measures'),
      hit('pack-gdpr', 'GDPR-Art-6', 'GDPR Article 6 — lawfulness of processing'),
    ]);
    const r = await buildKnowledgePackLayerDetailed(makeFakeDb([AML, GDPR]), { areaId: 'fcp', moduleId: 'gap-analysis', userMessage: 'customer due diligence' });
    expect(r.text).toContain('EU AMLR Core');
    expect(r.text).not.toContain('GDPR + AI Act');
    expect(r.text).toContain('AMLR Article 20');
    expect(r.text).not.toContain('GDPR Article 6');
    expect(r.packs.map((p) => p.id)).toEqual(['pack-aml']);
    expect(r.packs[0]).toMatchObject({ name: 'amlr-2024', displayName: 'EU AMLR Core', version: '1.2.0' });
    expect(r.entries).toHaveLength(1);
    expect(r.entries[0]).toMatchObject({ packId: 'pack-aml', packName: 'EU AMLR Core', refId: 'AMLR-Art-20', tier: 1, similarity: 0.8 });
    expect(r.areaFallback).toBe(false);
  });

  it('a healthcare run with no pack of its own gets relevance-only retrieval, never a dump', async () => {
    hybridSearchMock.mockResolvedValue([]);
    const withMessage = await buildKnowledgePackLayerDetailed(makeFakeDb([AML, DORA], [{ content_id: 'pack-aml::x', content_text: 'dump text' }]), { areaId: 'healthcare', moduleId: 'clinical-protocol', userMessage: 'a protocol for a new clinical trial' });
    expect(withMessage.text).toBe('');
    expect(withMessage.entries).toHaveLength(0);
    expect(withMessage.areaFallback).toBe(true);

    const noMessage = await buildKnowledgePackLayerDetailed(makeFakeDb([AML, DORA]), { areaId: 'healthcare', moduleId: 'clinical-protocol' });
    expect(noMessage.text).toBe('');
    expect(hybridSearchMock).toHaveBeenCalledTimes(1);
  });

  it('a healthcare run still receives a close semantic match from any pack', async () => {
    hybridSearchMock.mockResolvedValue([hit('pack-dora', 'DORA-Art-28', 'DORA Article 28 — ICT third-party risk (hospital systems outsourcing)', 0.9)]);
    const r = await buildKnowledgePackLayerDetailed(makeFakeDb([AML, DORA]), { areaId: 'healthcare', moduleId: 'clinical-protocol', userMessage: 'outsourcing hospital IT systems' });
    expect(r.text).toContain('DORA Article 28');
    expect(r.text).not.toContain('EU AMLR Core');
    expect(r.packs.map((p) => p.id)).toEqual(['pack-dora']);
    expect(r.areaFallback).toBe(true);
  });

  it('no area (open chat / legacy callers) keeps the previous behaviour', async () => {
    // No user message → the semantic tier is never consulted; the
    // deterministic tier lists every active pack, as before.
    hybridSearchMock.mockResolvedValue([]);
    const text = await buildKnowledgePackLayer(makeFakeDb([AML, GDPR], [{ content_id: 'pack-aml::AMLR-Art-7', content_text: 'AMLR Article 7' }]));
    expect(text).toContain('EU AMLR Core');
    expect(text).toContain('GDPR + AI Act');
    expect(text).toContain('AMLR Article 7');
    expect(hybridSearchMock).not.toHaveBeenCalled();
  });

  it('deterministic tiers report their tier on every entry', async () => {
    // Semantic retrieval finds nothing (the embedding-failure path is covered
    // by prompt-builder-pack-layer.test.ts); the deterministic tier answers.
    hybridSearchMock.mockResolvedValue([]);
    const r = await buildKnowledgePackLayerDetailed(makeFakeDb([AML], [{ content_id: 'pack-aml::AMLR-Art-7', content_text: 'AMLR Article 7' }]), { areaId: 'fcp', userMessage: 'controls' });
    expect(r.entries).toHaveLength(1);
    expect(r.entries[0]).toMatchObject({ tier: 2, refId: 'AMLR-Art-7', packId: 'pack-aml' });
    expect(r.entries[0].similarity).toBeUndefined();
  });
});
