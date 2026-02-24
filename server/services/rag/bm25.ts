/**
 * BM25 scoring for document retrieval.
 * BM25 is the industry-standard keyword ranking function (used by Elasticsearch, Lucene, etc.)
 * Parameters: k1=1.5, b=0.75 (standard values)
 */

const K1 = 1.5;
const B = 0.75;

export function tokenise(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\u00c0-\u024f\s]/g, ' ')  // keep accented chars for Nordic languages
    .split(/\s+/)
    .filter((t) => t.length > 2);  // skip very short tokens
}

export function computeTermFrequencies(tokens: string[]): Record<string, number> {
  const freq: Record<string, number> = {};
  for (const token of tokens) {
    freq[token] = (freq[token] || 0) + 1;
  }
  // Normalise to relative frequency
  const total = tokens.length;
  if (total === 0) return freq;
  for (const k in freq) freq[k] /= total;
  return freq;
}

export interface BM25Corpus {
  avgDocLength: number;
  docCount: number;
  docFrequency: Record<string, number>; // term -> number of docs containing it
}

export function buildCorpusStats(allTermFreqs: Record<string, number>[]): BM25Corpus {
  const docFrequency: Record<string, number> = {};
  let totalLength = 0;
  for (const tf of allTermFreqs) {
    totalLength += Object.keys(tf).length;
    for (const term of Object.keys(tf)) {
      docFrequency[term] = (docFrequency[term] || 0) + 1;
    }
  }
  return {
    avgDocLength: allTermFreqs.length > 0 ? totalLength / allTermFreqs.length : 0,
    docCount: allTermFreqs.length,
    docFrequency,
  };
}

export function bm25Score(
  query: string,
  docTermFreqs: Record<string, number>,
  docLength: number,
  corpus: BM25Corpus,
): number {
  const queryTokens = tokenise(query);
  let score = 0;

  for (const qTerm of queryTokens) {
    const tf = docTermFreqs[qTerm] || 0;
    if (tf === 0) continue;

    const df = corpus.docFrequency[qTerm] || 0;
    const idf = Math.log((corpus.docCount - df + 0.5) / (df + 0.5) + 1);
    const tfNorm = (tf * (K1 + 1)) / (tf + K1 * (1 - B + B * (docLength / corpus.avgDocLength)));
    score += idf * tfNorm;
  }

  return score;
}
