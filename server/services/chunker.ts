/**
 * chunker.ts
 * Smart document chunking for RAG with paragraph preservation and overlap
 */

import { Tiktoken, encoding_for_model } from 'tiktoken';

// Initialize tokenizer (compatible with text-embedding-3-small)
let tokenizer: Tiktoken;
try {
  tokenizer = encoding_for_model('gpt-3.5-turbo');
} catch (error) {
  console.error('[chunker] Failed to initialize tokenizer:', error);
}

export interface Chunk {
  id: string;
  content: string;
  tokenCount: number;
  metadata: {
    chunkIndex: number;
    startChar: number;
    endChar: number;
    [key: string]: any;
  };
}

export interface ChunkingOptions {
  chunkSize: number; // Target tokens per chunk
  overlapSize: number; // Overlap tokens between chunks
  preserveParagraphs: boolean; // Try to avoid splitting mid-paragraph
  documentMetadata?: Record<string, any>; // Base metadata to merge into each chunk
}

const DEFAULT_OPTIONS: ChunkingOptions = {
  chunkSize: 512,
  overlapSize: 64,
  preserveParagraphs: true,
};

/**
 * Chunk a document into smaller pieces for vector embedding
 */
export function chunkDocument(
  text: string,
  documentId: string,
  options: Partial<ChunkingOptions> = {}
): Chunk[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const chunks: Chunk[] = [];

  if (!text || text.trim().length === 0) {
    return chunks;
  }

  // Split into paragraphs first (preserve structure)
  const paragraphs = text.split(/\n\n+/).filter((p) => p.trim().length > 0);

  let currentChunk = '';
  let currentTokens = 0;
  let chunkIndex = 0;
  let charOffset = 0;

  for (const paragraph of paragraphs) {
    const paragraphTokens = countTokens(paragraph);

    // If single paragraph exceeds chunk size, split it by sentences
    if (paragraphTokens > opts.chunkSize) {
      // Flush current chunk if exists
      if (currentChunk) {
        chunks.push(createChunk(currentChunk, documentId, chunkIndex++, charOffset, opts.documentMetadata));
        charOffset += currentChunk.length;
        currentChunk = '';
        currentTokens = 0;
      }

      // Split large paragraph by sentences
      const sentences = paragraph.match(/[^.!?]+[.!?]+/g) || [paragraph];
      for (const sentence of sentences) {
        const sentenceTokens = countTokens(sentence);

        if (currentTokens + sentenceTokens > opts.chunkSize && currentChunk) {
          chunks.push(createChunk(currentChunk, documentId, chunkIndex++, charOffset, opts.documentMetadata));

          // Add overlap from end of previous chunk
          const overlapText = getLastNTokens(currentChunk, opts.overlapSize);
          charOffset += currentChunk.length - overlapText.length;
          currentChunk = overlapText + ' ' + sentence;
          currentTokens = countTokens(currentChunk);
        } else {
          currentChunk += (currentChunk ? ' ' : '') + sentence;
          currentTokens += sentenceTokens;
        }
      }
    } else {
      // Add paragraph to current chunk if it fits
      if (currentTokens + paragraphTokens > opts.chunkSize && currentChunk) {
        chunks.push(createChunk(currentChunk, documentId, chunkIndex++, charOffset, opts.documentMetadata));

        // Add overlap
        const overlapText = getLastNTokens(currentChunk, opts.overlapSize);
        charOffset += currentChunk.length - overlapText.length;
        currentChunk = overlapText + '\n\n' + paragraph;
        currentTokens = countTokens(currentChunk);
      } else {
        currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
        currentTokens += paragraphTokens;
      }
    }
  }

  // Add final chunk
  if (currentChunk) {
    chunks.push(createChunk(currentChunk, documentId, chunkIndex++, charOffset, opts.documentMetadata));
  }

  return chunks;
}

/**
 * Create a chunk object with metadata
 */
function createChunk(
  content: string,
  documentId: string,
  index: number,
  startChar: number,
  baseMetadata?: Record<string, any>
): Chunk {
  return {
    id: `${documentId}-chunk-${index}`,
    content: content.trim(),
    tokenCount: countTokens(content),
    metadata: {
      ...baseMetadata,
      chunkIndex: index,
      startChar,
      endChar: startChar + content.length,
    },
  };
}

/**
 * Count tokens in text using tiktoken
 */
function countTokens(text: string): number {
  if (!tokenizer) {
    // Fallback: estimate 4 chars per token
    return Math.ceil(text.length / 4);
  }

  try {
    return tokenizer.encode(text).length;
  } catch {
    // Fallback on error
    return Math.ceil(text.length / 4);
  }
}

/**
 * Get the last N tokens from text
 */
function getLastNTokens(text: string, n: number): string {
  if (!tokenizer) {
    // Fallback: last n*4 characters
    return text.slice(-n * 4);
  }

  try {
    const tokens = tokenizer.encode(text);
    if (tokens.length <= n) return text;
    const overlapTokens = tokens.slice(-n);
    return new TextDecoder().decode(tokenizer.decode(overlapTokens));
  } catch {
    // Fallback: last n*4 characters
    return text.slice(-n * 4);
  }
}

/**
 * Cleanup tokenizer on exit
 */
process.on('exit', () => {
  if (tokenizer) {
    tokenizer.free();
  }
});
