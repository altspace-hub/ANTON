/**
 * Embeddings Service
 *
 * Generates semantic embeddings for text using OpenAI's text-embedding-3-small model.
 * Used for institutional memory similarity search and decision clustering.
 *
 * Features:
 * - Generate embeddings for checkpoint decisions
 * - Calculate cosine similarity between embeddings
 * - Batch processing for efficiency
 * - Caching to reduce API calls
 */

import OpenAI from 'openai';

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536; // text-embedding-3-small outputs 1536 dimensions

// Initialize OpenAI client (uses OPENAI_API_KEY from env)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
});

// Simple in-memory cache (for dev — in production use Redis or DB)
const embeddingCache = new Map<string, number[]>();

/**
 * Generate embedding for a single text string
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  if (!text || text.trim().length === 0) {
    throw new Error('Cannot generate embedding for empty text');
  }

  // Check cache first
  const cacheKey = text.substring(0, 200); // Use first 200 chars as cache key
  if (embeddingCache.has(cacheKey)) {
    return embeddingCache.get(cacheKey)!;
  }

  try {
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: text,
      encoding_format: 'float',
    });

    const embedding = response.data[0].embedding;

    // Cache result
    embeddingCache.set(cacheKey, embedding);

    return embedding;
  } catch (error: any) {
    console.error('[embeddings] Error generating embedding:', error.message);

    // If OpenAI key is not set, return a zero vector (graceful degradation)
    if (error.message?.includes('API key')) {
      console.warn('[embeddings] OpenAI API key not set — returning zero vector');
      return new Array(EMBEDDING_DIMENSIONS).fill(0);
    }

    throw error;
  }
}

/**
 * Generate embeddings for multiple texts in batch
 */
export async function generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  // Filter out empty strings
  const validTexts = texts.filter(t => t && t.trim().length > 0);
  if (validTexts.length === 0) {
    return texts.map(() => new Array(EMBEDDING_DIMENSIONS).fill(0));
  }

  try {
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: validTexts,
      encoding_format: 'float',
    });

    return response.data.map(item => item.embedding);
  } catch (error: any) {
    console.error('[embeddings] Error generating batch embeddings:', error.message);

    // Graceful degradation: return zero vectors
    if (error.message?.includes('API key')) {
      console.warn('[embeddings] OpenAI API key not set — returning zero vectors');
      return texts.map(() => new Array(EMBEDDING_DIMENSIONS).fill(0));
    }

    throw error;
  }
}

/**
 * Calculate cosine similarity between two embeddings
 * Returns a value between -1 (opposite) and 1 (identical)
 */
export function cosineSimilarity(embedding1: number[], embedding2: number[]): number {
  if (embedding1.length !== embedding2.length) {
    throw new Error('Embeddings must have the same dimensionality');
  }

  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  for (let i = 0; i < embedding1.length; i++) {
    dotProduct += embedding1[i] * embedding2[i];
    norm1 += embedding1[i] * embedding1[i];
    norm2 += embedding2[i] * embedding2[i];
  }

  const magnitude = Math.sqrt(norm1) * Math.sqrt(norm2);

  if (magnitude === 0) return 0;

  return dotProduct / magnitude;
}

/**
 * Find most similar embeddings from a list
 * Returns array of { index, similarity } sorted by similarity (highest first)
 */
export function findMostSimilar(
  queryEmbedding: number[],
  candidateEmbeddings: number[][],
  topK: number = 10
): Array<{ index: number; similarity: number }> {
  const similarities = candidateEmbeddings.map((embedding, index) => ({
    index,
    similarity: cosineSimilarity(queryEmbedding, embedding),
  }));

  // Sort by similarity (descending) and take top K
  return similarities
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);
}

/**
 * Generate embedding for a checkpoint decision
 * Combines decision text, context, and reasoning into a single embedding
 */
export async function generateDecisionEmbedding(params: {
  decisionText: string;
  context?: string;
  reasoning?: string;
}): Promise<number[]> {
  // Combine all text fields into a single document
  const parts = [
    `Decision: ${params.decisionText}`,
    params.context ? `Context: ${params.context}` : '',
    params.reasoning ? `Reasoning: ${params.reasoning}` : '',
  ].filter(Boolean);

  const combinedText = parts.join('\n\n');

  return generateEmbedding(combinedText);
}

/**
 * Serialize embedding to JSON string for SQLite storage
 */
export function serializeEmbedding(embedding: number[]): string {
  return JSON.stringify(embedding);
}

/**
 * Deserialize embedding from JSON string
 */
export function deserializeEmbedding(embeddingJson: string): number[] {
  try {
    return JSON.parse(embeddingJson) as number[];
  } catch (error) {
    console.error('[embeddings] Failed to deserialize embedding:', error);
    return new Array(EMBEDDING_DIMENSIONS).fill(0);
  }
}

/**
 * Clear embedding cache (useful for testing or memory management)
 */
export function clearEmbeddingCache() {
  embeddingCache.clear();
}

export default {
  generateEmbedding,
  generateEmbeddingsBatch,
  generateDecisionEmbedding,
  cosineSimilarity,
  findMostSimilar,
  serializeEmbedding,
  deserializeEmbedding,
  clearEmbeddingCache,
};
