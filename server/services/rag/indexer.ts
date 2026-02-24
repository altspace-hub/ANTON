/**
 * RAG Indexer -- indexes a folder's documents into the SQLite RAG tables.
 * Uses text-extractor.ts for file -> text, chunker.ts for chunking,
 * bm25.ts for term frequency computation.
 */

import { randomUUID } from 'crypto';
import path from 'path';
import { readdirSync, statSync, existsSync } from 'fs';
import type Database from 'better-sqlite3';
import { chunkText } from './chunker.js';
import { tokenise, computeTermFrequencies } from './bm25.js';

// Dynamic import of text-extractor to avoid circular deps
async function extractText(filePath: string): Promise<string | null> {
  const { extractTextFromFile } = await import('../text-extractor.js');
  return extractTextFromFile(filePath);
}

const SUPPORTED = ['.pdf', '.docx', '.doc', '.txt', '.md', '.xlsx', '.csv'];

function listFiles(folderPath: string): string[] {
  const files: string[] = [];
  function scan(dir: string) {
    try {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) scan(full);
        else if (SUPPORTED.includes(path.extname(entry.name).toLowerCase())) {
          files.push(full);
        }
      }
    } catch { /* skip unreadable dirs */ }
  }
  scan(folderPath);
  return files;
}

export async function indexFolder(
  db: Database.Database,
  folderPath: string,
): Promise<{ documents: number; chunks: number }> {
  if (!existsSync(folderPath)) throw new Error(`Folder not found: ${folderPath}`);

  // Mark as indexing
  db.prepare(
    `INSERT OR REPLACE INTO indexed_folders (folder_path, status) VALUES (?, 'indexing')`,
  ).run(folderPath);

  // Remove old chunks for this folder (cascade deletes chunk_terms via FK)
  db.prepare(`DELETE FROM document_chunks WHERE folder_path = ?`).run(folderPath);

  const files = listFiles(folderPath);
  let totalChunks = 0;

  const insertChunk = db.prepare(
    `INSERT INTO document_chunks (id, folder_path, document_name, chunk_index, chunk_text, token_count)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const insertTerm = db.prepare(
    `INSERT OR REPLACE INTO chunk_terms (chunk_id, term, freq) VALUES (?, ?, ?)`,
  );

  for (const filePath of files) {
    const docName = path.relative(folderPath, filePath);
    try {
      const text = await extractText(filePath);
      if (!text || !text.trim()) continue;
      const chunks = chunkText(text);

      for (const chunk of chunks) {
        const chunkId = randomUUID();
        insertChunk.run(chunkId, folderPath, docName, chunk.index, chunk.text, chunk.tokenCount);

        const tokens = tokenise(chunk.text);
        const tf = computeTermFrequencies(tokens);
        for (const [term, freq] of Object.entries(tf)) {
          insertTerm.run(chunkId, term, freq);
        }
        totalChunks++;
      }
    } catch (e) {
      console.warn(`RAG: skipping ${filePath}:`, e instanceof Error ? e.message : e);
    }
  }

  db.prepare(
    `INSERT OR REPLACE INTO indexed_folders (folder_path, document_count, chunk_count, last_indexed, status)
     VALUES (?, ?, ?, CURRENT_TIMESTAMP, 'ready')`,
  ).run(folderPath, files.length, totalChunks);

  return { documents: files.length, chunks: totalChunks };
}
