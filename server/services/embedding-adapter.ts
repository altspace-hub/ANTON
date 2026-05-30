/**
 * Embedding Adapter — multi-provider embedding generation.
 *
 * Supports: OpenAI (text-embedding-3-small), Ollama (nomic-embed-text), Voyage AI (voyage-3-lite).
 * Provider selected via EMBEDDING_PROVIDER env var, or auto-detected from available API keys.
 *
 * Usage:
 *   const adapter = getEmbeddingAdapter();
 *   const vec = await adapter.embed("some text");
 *   const vecs = await adapter.embedBatch(["text1", "text2"]);
 */

import OpenAI from 'openai';

// ── Types ──────────────────────────────────────────────────────────────────

export type EmbeddingProvider = 'openai' | 'ollama' | 'voyage';

export interface EmbeddingAdapter {
  readonly provider: EmbeddingProvider;
  readonly model: string;
  readonly dimensions: number;
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}

// ── OpenAI adapter ─────────────────────────────────────────────────────────

class OpenAIEmbedder implements EmbeddingAdapter {
  readonly provider: EmbeddingProvider = 'openai';
  readonly model = 'text-embedding-3-small';
  readonly dimensions = 1536;

  private client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });
  private cache = new Map<string, number[]>();

  async embed(text: string): Promise<number[]> {
    if (!text?.trim()) return new Array(this.dimensions).fill(0);
    const key = text.slice(0, 200);
    if (this.cache.has(key)) return this.cache.get(key)!;
    try {
      const res = await this.client.embeddings.create({
        model: this.model,
        input: text,
        encoding_format: 'float',
      });
      const vec = res.data[0].embedding;
      this.cache.set(key, vec);
      return vec;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[embedding-adapter] OpenAI embed failed: ${msg}`);
      return new Array(this.dimensions).fill(0);
    }
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const valid = texts.filter(t => t?.trim());
    if (valid.length === 0) return texts.map(() => new Array(this.dimensions).fill(0));
    try {
      const res = await this.client.embeddings.create({
        model: this.model,
        input: valid,
        encoding_format: 'float',
      });
      return res.data.map(d => d.embedding);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[embedding-adapter] OpenAI batch embed failed: ${msg}`);
      return texts.map(() => new Array(this.dimensions).fill(0));
    }
  }
}

// ── Ollama adapter ─────────────────────────────────────────────────────────

class OllamaEmbedder implements EmbeddingAdapter {
  readonly provider: EmbeddingProvider = 'ollama';
  readonly model: string;
  readonly dimensions: number;

  private baseUrl: string;

  constructor() {
    this.baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    this.model = process.env.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text';
    // nomic-embed-text = 768 dims; mxbai-embed-large = 1024 dims
    this.dimensions = this.model === 'mxbai-embed-large' ? 1024 : 768;
  }

  async embed(text: string): Promise<number[]> {
    if (!text?.trim()) return new Array(this.dimensions).fill(0);
    try {
      const res = await fetch(`${this.baseUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.model, prompt: text }),
      });
      if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
      const json = await res.json() as { embedding: number[] };
      return json.embedding;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[embedding-adapter] Ollama embed failed: ${msg}`);
      return new Array(this.dimensions).fill(0);
    }
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    // Ollama doesn't support batch — run sequentially
    return Promise.all(texts.map(t => this.embed(t)));
  }
}

// ── Voyage adapter ─────────────────────────────────────────────────────────

class VoyageEmbedder implements EmbeddingAdapter {
  readonly provider: EmbeddingProvider = 'voyage';
  readonly model = 'voyage-3-lite';
  readonly dimensions = 512;

  private apiKey = process.env.VOYAGE_API_KEY || '';

  async embed(text: string): Promise<number[]> {
    if (!text?.trim()) return new Array(this.dimensions).fill(0);
    try {
      const res = await fetch('https://api.voyageai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ model: this.model, input: [text] }),
      });
      if (!res.ok) throw new Error(`Voyage HTTP ${res.status}`);
      const json = await res.json() as { data: Array<{ embedding: number[] }> };
      return json.data[0].embedding;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[embedding-adapter] Voyage embed failed: ${msg}`);
      return new Array(this.dimensions).fill(0);
    }
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const valid = texts.filter(t => t?.trim());
    if (valid.length === 0) return texts.map(() => new Array(this.dimensions).fill(0));
    try {
      // Voyage supports batches up to 128 inputs
      const BATCH_SIZE = 128;
      const results: number[][] = [];
      for (let i = 0; i < valid.length; i += BATCH_SIZE) {
        const batch = valid.slice(i, i + BATCH_SIZE);
        const res = await fetch('https://api.voyageai.com/v1/embeddings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({ model: this.model, input: batch }),
        });
        if (!res.ok) throw new Error(`Voyage HTTP ${res.status}`);
        const json = await res.json() as { data: Array<{ embedding: number[] }> };
        results.push(...json.data.map(d => d.embedding));
      }
      return results;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[embedding-adapter] Voyage batch embed failed: ${msg}`);
      return texts.map(() => new Array(this.dimensions).fill(0));
    }
  }
}

// ── Factory ────────────────────────────────────────────────────────────────

let _instance: EmbeddingAdapter | null = null;

/**
 * Get the configured embedding adapter (singleton).
 * Provider priority:
 *   1. EMBEDDING_PROVIDER env var (explicit override)
 *   2. VOYAGE_API_KEY present → voyage
 *   3. OPENAI_API_KEY present → openai
 *   4. OLLAMA_BASE_URL present or OLLAMA_EMBEDDING_MODEL set → ollama
 *   5. Default: openai (with graceful degradation to zero vectors)
 */
export function getEmbeddingAdapter(): EmbeddingAdapter {
  if (_instance) return _instance;

  const explicit = process.env.EMBEDDING_PROVIDER as EmbeddingProvider | undefined;
  let provider: EmbeddingProvider;

  if (explicit && ['openai', 'ollama', 'voyage'].includes(explicit)) {
    provider = explicit;
  } else if (process.env.VOYAGE_API_KEY) {
    provider = 'voyage';
  } else if (process.env.OPENAI_API_KEY) {
    provider = 'openai';
  } else if (process.env.OLLAMA_BASE_URL || process.env.OLLAMA_EMBEDDING_MODEL) {
    provider = 'ollama';
  } else {
    provider = 'openai'; // graceful degradation — returns zero vectors without key
  }

  switch (provider) {
    case 'ollama':
      _instance = new OllamaEmbedder();
      break;
    case 'voyage':
      _instance = new VoyageEmbedder();
      break;
    default:
      _instance = new OpenAIEmbedder();
  }

  console.log(`[embedding-adapter] Provider: ${_instance.provider}, model: ${_instance.model}, dims: ${_instance.dimensions}`);
  return _instance;
}

/** Reset the cached adapter (useful after settings change). */
export function resetEmbeddingAdapter(): void {
  _instance = null;
}

// ── Cosine similarity utility (shared across the codebase) ────────────────

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const mag = Math.sqrt(normA) * Math.sqrt(normB);
  return mag === 0 ? 0 : dot / mag;
}

/**
 * True if the vector is all-zeros (or empty) — the sentinel every embedder
 * returns on failure / empty input. In the JS cosine store such a row scores 0
 * and is harmlessly dropped; under pgvector the cosine distance of a zero vector
 * is NaN and would corrupt ORDER BY ranking, so callers must guard on this.
 */
export function isZeroVector(vec: number[]): boolean {
  if (vec.length === 0) return true;
  for (let i = 0; i < vec.length; i++) {
    if (vec[i] !== 0) return false;
  }
  return true;
}

export function serializeVector(vec: number[]): string {
  return JSON.stringify(vec);
}

export function deserializeVector(s: string, dims: number): number[] {
  try {
    const v = JSON.parse(s) as number[];
    return Array.isArray(v) ? v : new Array(dims).fill(0);
  } catch {
    return new Array(dims).fill(0);
  }
}
