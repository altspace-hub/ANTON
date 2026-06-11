/**
 * chroma-embedding-adapter.test.ts — Wave 4.12: Chroma RAG through the local
 * embedding adapter (no OPENAI_API_KEY requirement).
 *
 *   • createAdapterEmbeddingFunction delegates to the adapter's embedBatch
 *     (mock adapter — no network)
 *   • assertCollectionCompatible: same model OK; legacy (no metadata) OK;
 *     different model → CollectionEmbeddingMismatchError naming both models
 *     and pointing at POST /api/knowledge/reembed
 */
import { describe, it, expect } from 'vitest';
import {
  createAdapterEmbeddingFunction,
  assertCollectionCompatible,
  CollectionEmbeddingMismatchError,
} from '../../server/services/chroma-client.js';
import type { EmbeddingAdapter } from '../../server/services/embedding-adapter.js';

function mockAdapter(model = 'nomic-embed-text', dims = 4): EmbeddingAdapter & { batches: string[][] } {
  const batches: string[][] = [];
  return {
    provider: 'ollama',
    model,
    dimensions: dims,
    batches,
    async embed(text: string): Promise<number[]> {
      return new Array(dims).fill(text.length);
    },
    async embedBatch(texts: string[]): Promise<number[][]> {
      batches.push(texts);
      return texts.map(t => new Array(dims).fill(t.length));
    },
  };
}

describe('createAdapterEmbeddingFunction (Wave 4.12)', () => {
  it('generate() delegates to the adapter embedBatch — one call, ordered vectors', async () => {
    const adapter = mockAdapter();
    const fn = createAdapterEmbeddingFunction(adapter);
    const vectors = await fn.generate(['ab', 'abcd']);
    expect(adapter.batches).toEqual([['ab', 'abcd']]);
    expect(vectors).toEqual([[2, 2, 2, 2], [4, 4, 4, 4]]);
  });
});

describe('assertCollectionCompatible — honest model-mismatch detection', () => {
  it('matching model passes', () => {
    expect(() => assertCollectionCompatible('col1', { embedding_model: 'nomic-embed-text' }, mockAdapter())).not.toThrow();
  });

  it('legacy collection without recorded model passes (compatibility unknown)', () => {
    expect(() => assertCollectionCompatible('col1', undefined, mockAdapter())).not.toThrow();
    expect(() => assertCollectionCompatible('col1', { 'hnsw:space': 'cosine' }, mockAdapter())).not.toThrow();
  });

  it('different model throws CollectionEmbeddingMismatchError pointing at re-embed', () => {
    const adapter = mockAdapter('nomic-embed-text');
    let caught: unknown;
    try {
      assertCollectionCompatible('reg-pack', { embedding_model: 'text-embedding-3-small' }, adapter);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(CollectionEmbeddingMismatchError);
    const err = caught as CollectionEmbeddingMismatchError;
    expect(err.collectionName).toBe('reg-pack');
    expect(err.collectionModel).toBe('text-embedding-3-small');
    expect(err.adapterModel).toBe('nomic-embed-text');
    expect(err.message).toContain('needs re-embedding');
    expect(err.message).toContain('/api/knowledge/reembed');
  });
});
