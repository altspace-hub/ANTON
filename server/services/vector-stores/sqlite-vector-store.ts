/**
 * SQLite Vector Store — stores embeddings as JSON in the `embeddings` table.
 * Cosine similarity computed in-process (good for <100k vectors).
 * Default backend for local-first installations.
 */

import { randomUUID } from 'crypto';
import type { DatabaseAdapter } from '../db/database.js';

import { cosineSimilarity, deserializeVector, serializeVector } from '../embedding-adapter.js';

export interface VectorMetadata {
  content_type: string;
  content_id: string;
  [key: string]: unknown;
}

export interface VectorSearchResult {
  id: string;
  content_type: string;
  content_id: string;
  content_text: string;
  similarity: number;
  metadata: Record<string, unknown>;
}

interface EmbeddingRow {
  id: string;
  content_type: string;
  content_id: string;
  content_text: string;
  embedding: string;
  embedding_model: string;
  embedding_dimension: number;
  metadata: string;
}

export class SQLiteVectorStore {
  constructor(private db: DatabaseAdapter) {}

  async store(params: {
    contentType: string;
    contentId: string;
    contentText: string;
    vector: number[];
    model: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const id = randomUUID();
    await this.db.run(`
      INSERT INTO embeddings (id, content_type, content_id, content_text, embedding, embedding_model, embedding_dimension, metadata, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
      ON CONFLICT(content_type, content_id, embedding_model) DO UPDATE SET
        content_text = excluded.content_text,
        embedding = excluded.embedding,
        updated_at = NOW()
    `,
      id,
      params.contentType,
      params.contentId,
      params.contentText,
      serializeVector(params.vector),
      params.model,
      params.vector.length,
      JSON.stringify(params.metadata ?? {}),
    );
  }

  async search(params: {
    queryVector: number[];
    topK?: number;
    contentTypes?: string[];
    model?: string;
    minSimilarity?: number;
  }): Promise<VectorSearchResult[]> {
    const { queryVector, topK = 10, contentTypes, model, minSimilarity = 0.3 } = params;

    let sql = 'SELECT * FROM embeddings WHERE 1=1';
    const args: unknown[] = [];

    if (contentTypes && contentTypes.length > 0) {
      sql += ` AND content_type IN (${contentTypes.map(() => '?').join(',')})`;
      args.push(...contentTypes);
    }
    if (model) {
      sql += ' AND embedding_model = ?';
      args.push(model);
    }

    const rows = await this.db.all(sql, ...args) as EmbeddingRow[];
    const dims = queryVector.length;

    // KG-02: Skip rows with mismatched embedding dimensions (different model or re-embedded with different dim)
    const compatRows = rows.filter(row => row.embedding_dimension === dims);
    if (compatRows.length < rows.length) {
      console.warn(`[vector-store] Skipped ${rows.length - compatRows.length} embedding(s) with dimension mismatch (expected ${dims})`);
    }

    const scored = compatRows
      .map(row => {
        const vec = deserializeVector(row.embedding, dims);
        const sim = cosineSimilarity(queryVector, vec);
        return { row, sim };
      })
      .filter(r => r.sim >= minSimilarity)
      .sort((a, b) => b.sim - a.sim)
      .slice(0, topK);

    return scored.map(({ row, sim }) => ({
      id: row.id,
      content_type: row.content_type,
      content_id: row.content_id,
      content_text: row.content_text,
      similarity: sim,
      metadata: JSON.parse(row.metadata || '{}') as Record<string, unknown>,
    }));
  }

  async delete(contentType: string, contentId: string): Promise<void> {
    await this.db.run('DELETE FROM embeddings WHERE content_type = ? AND content_id = ?', contentType, contentId);
  }

  async getCount(contentType?: string): Promise<number> {
    if (contentType) {
      const row = await this.db.get('SELECT COUNT(*) as c FROM embeddings WHERE content_type = ?', contentType) as { c: number };
      return row.c;
    }
    const row = await this.db.get('SELECT COUNT(*) as c FROM embeddings') as { c: number };
    return row.c;
  }
}
