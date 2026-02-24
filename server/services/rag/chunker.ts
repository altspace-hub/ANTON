/**
 * Document chunker -- splits text into overlapping chunks for BM25 indexing.
 * Chunk size: ~1000 characters. Overlap: ~200 characters.
 * Tries to split at sentence boundaries (. ! ?) or paragraph breaks.
 */

export interface Chunk {
  text: string;
  index: number;
  tokenCount: number;
}

const CHUNK_SIZE = 1000;
const OVERLAP = 200;

export function chunkText(text: string): Chunk[] {
  // Normalise whitespace
  const normalised = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (normalised.length <= CHUNK_SIZE) {
    return [{ text: normalised, index: 0, tokenCount: Math.ceil(normalised.length / 4) }];
  }

  const chunks: Chunk[] = [];
  let start = 0;
  let index = 0;

  while (start < normalised.length) {
    let end = start + CHUNK_SIZE;
    if (end >= normalised.length) {
      // Last chunk
      const lastText = normalised.slice(start);
      if (lastText.trim().length > 50) {
        chunks.push({
          text: lastText,
          index,
          tokenCount: Math.ceil(lastText.length / 4),
        });
      }
      break;
    }

    // Try to find a good break point: paragraph > sentence > space
    let breakPoint = end;
    const paragraphBreak = normalised.lastIndexOf('\n\n', end);
    const sentenceBreak = Math.max(
      normalised.lastIndexOf('. ', end),
      normalised.lastIndexOf('! ', end),
      normalised.lastIndexOf('? ', end),
    );
    const spaceBreak = normalised.lastIndexOf(' ', end);

    if (paragraphBreak > start + CHUNK_SIZE / 2) {
      breakPoint = paragraphBreak + 2;
    } else if (sentenceBreak > start + CHUNK_SIZE / 2) {
      breakPoint = sentenceBreak + 2;
    } else if (spaceBreak > start) {
      breakPoint = spaceBreak + 1;
    }

    const chunkText = normalised.slice(start, breakPoint).trim();
    if (chunkText.length > 50) { // skip tiny fragments
      chunks.push({ text: chunkText, index, tokenCount: Math.ceil(chunkText.length / 4) });
      index++;
    }
    start = breakPoint - OVERLAP; // overlap for continuity
  }

  return chunks;
}
