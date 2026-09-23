/**
 * ollama-embedding-dimensions.test.ts — the declared width is the model's own.
 *
 * Every Ollama embedder but mxbai-embed-large used to be declared 768-d, so
 * choosing bge-m3 (1024) or qwen3-embedding (up to 4096) pinned a width the
 * vectors do not have — and the pin decides which stored vectors are compared.
 */
import { describe, it, expect } from 'vitest';
import { ollamaEmbeddingDimensions } from '../../server/services/embedding-adapter.js';

describe('ollamaEmbeddingDimensions', () => {
  it('knows the recommended models, with or without a tag', () => {
    expect(ollamaEmbeddingDimensions('nomic-embed-text')).toBe(768);
    expect(ollamaEmbeddingDimensions('nomic-embed-text:latest')).toBe(768);
    expect(ollamaEmbeddingDimensions('bge-m3')).toBe(1024);
    expect(ollamaEmbeddingDimensions('embeddinggemma:300m')).toBe(768);
    expect(ollamaEmbeddingDimensions('qwen3-embedding:0.6b')).toBe(1024);
    expect(ollamaEmbeddingDimensions('qwen3-embedding:8b')).toBe(4096);
  });

  it('an explicit OLLAMA_EMBEDDING_DIMENSIONS wins; junk is ignored', () => {
    expect(ollamaEmbeddingDimensions('bge-m3', '512')).toBe(512);
    expect(ollamaEmbeddingDimensions('bge-m3', 'wide')).toBe(1024);
    expect(ollamaEmbeddingDimensions('bge-m3', '0')).toBe(1024);
  });

  it('negative control — an unknown model keeps the old 768 default', () => {
    expect(ollamaEmbeddingDimensions('some-new-embedder')).toBe(768);
  });
});
