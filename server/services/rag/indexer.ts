/**
 * RAG Indexer -- indexes a folder's documents into the SQLite RAG tables.
 * Uses text-extractor.ts for file -> text, chunker.ts for chunking,
 * bm25.ts for term frequency computation.
 */

import { randomUUID } from 'crypto';
import path from 'path';
import { readdirSync, statSync, existsSync } from 'fs';
import type { DatabaseAdapter } from '../../db/database.js';
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
  db: DatabaseAdapter,
  folderPath: string,
): Promise<{ documents: number; chunks: number }> {
  if (!existsSync(folderPath)) throw new Error(`Folder not found: ${folderPath}`);

  // Mark as indexing
  await db.run(
    `INSERT INTO indexed_folders (folder_path, status) VALUES (?, 'indexing')
     ON CONFLICT (folder_path) DO UPDATE SET status = EXCLUDED.status`,
    folderPath
  );

  // Remove old chunks for this folder (cascade deletes chunk_terms via FK)
  await db.run(`DELETE FROM document_chunks WHERE folder_path = ?`, folderPath);

  const files = listFiles(folderPath);
  let totalChunks = 0;

  for (const filePath of files) {
    const docName = path.relative(folderPath, filePath);
    try {
      const text = await extractText(filePath);
      if (!text || !text.trim()) continue;
      const chunks = chunkText(text);

      for (const chunk of chunks) {
        const chunkId = randomUUID();
        await db.run(
          `INSERT INTO document_chunks (id, folder_path, document_name, chunk_index, chunk_text, token_count)
           VALUES (?, ?, ?, ?, ?, ?)`,
          chunkId, folderPath, docName, chunk.index, chunk.text, chunk.tokenCount
        );

        const tokens = tokenise(chunk.text);
        const tf = computeTermFrequencies(tokens);
        for (const [term, freq] of Object.entries(tf)) {
          await db.run(
            `INSERT INTO chunk_terms (chunk_id, term, freq) VALUES (?, ?, ?)
             ON CONFLICT (chunk_id, term) DO UPDATE SET freq = EXCLUDED.freq`,
            chunkId, term, freq
          );
        }
        totalChunks++;
      }
    } catch (e) {
      console.warn(`RAG: skipping ${filePath}:`, e instanceof Error ? e.message : e);
    }
  }

  await db.run(
    `INSERT INTO indexed_folders (folder_path, document_count, chunk_count, last_indexed, status)
     VALUES (?, ?, ?, NOW(), 'ready')
     ON CONFLICT (folder_path) DO UPDATE SET
       document_count = EXCLUDED.document_count,
       chunk_count = EXCLUDED.chunk_count,
       last_indexed = EXCLUDED.last_indexed,
       status = EXCLUDED.status`,
    folderPath, files.length, totalChunks
  );

  return { documents: files.length, chunks: totalChunks };
}
