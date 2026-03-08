import { getClient } from './claude-client.js';

// ── Types ───────────────────────────────────────────────────

export interface CitationResult {
  citation: string;
  verified: boolean;
  comment: string;
  // ATTR-04: which source grounded this citation
  sourceMatch?: 'loaded_source' | 'ai_knowledge' | 'uncertain';
}

// ── Regex patterns for regulatory citations ─────────────────
// Covers common formats: Article X, Regulation (EU) YYYY/NNNN, Directive YYYY/NN/EU,
// Recital N, Section N.N, Paragraph N, AMLD, AMLR, MiCA, etc.
const CITATION_PATTERNS = [
  // Article X / Articles X-Y / Article X(N)
  /\bArticles?\s+\d+(?:[a-z])?(?:\(\d+\))?(?:\s*(?:to|-)\s*\d+(?:[a-z])?)?/gi,
  // Regulation (EU) YYYY/NNNN or Regulation NNNN/YYYY
  /\bRegulation\s+(?:\(EU\)\s*)?\d{4}\/\d+/gi,
  // Directive YYYY/NN/EU or Directive NN/YYYY/EU
  /\bDirective\s+(?:\(EU\)\s*)?\d{4}\/\d+(?:\/\w+)?/gi,
  // Named regulations: AMLR, AMLD, MiCA, DORA, GDPR, MiFID, PSD, SFDR, etc.
  /\b(?:AMLR|AMLD[1-9]?|MiCA|DORA|GDPR|MiFID\s*(?:I{1,3}|[12])?|PSD[23]?|SFDR|MAR|CRR|CRD\s*(?:IV|V|[45])?|IFR|IFD|EMIR|CSDR|BRRD|SRMR|EBA\s+Guidelines?|ESMA\s+Guidelines?)\b/gi,
  // Recital N
  /\bRecital\s+\d+/gi,
  // Section N or N.N
  /\bSection\s+\d+(?:\.\d+)*/gi,
  // Paragraph N or (N)
  /\bParagraph\s+\d+/gi,
  // RTS/ITS references: RTS YYYY/NNN or Commission Delegated Regulation
  /\b(?:RTS|ITS)\s+\d{4}\/\d+/gi,
  /\bCommission\s+Delegated\s+Regulation\s+(?:\(EU\)\s*)?\d{4}\/\d+/gi,
  // EBA/ESMA/EIOPA Guidelines on ...
  /\b(?:EBA|ESMA|EIOPA)\s+Guidelines?\s+on\s+[\w\s]+?(?=\.|\,|$|\n)/gi,
];

function extractCitations(text: string): string[] {
  const found = new Set<string>();
  for (const pattern of CITATION_PATTERNS) {
    const matches = text.match(pattern);
    if (matches) {
      for (const m of matches) {
        const normalised = m.trim().replace(/\s+/g, ' ');
        if (normalised.length > 3) {
          found.add(normalised);
        }
      }
    }
  }
  return [...found];
}

// ── Main verification function ──────────────────────────────

// ATTR-04: Check which citations are grounded in the loaded source manifest
function matchCitationToSources(citation: string, sourceManifest: string[]): 'loaded_source' | 'uncertain' {
  const citLower = citation.toLowerCase();
  for (const src of sourceManifest) {
    const srcLower = src.toLowerCase();
    // Match common regulation names
    if (
      (citLower.includes('amlr') && (srcLower.includes('amlr') || srcLower.includes('2024/1624'))) ||
      (citLower.includes('dora') && srcLower.includes('dora')) ||
      (citLower.includes('gdpr') && srcLower.includes('gdpr')) ||
      (citLower.includes('mica') && srcLower.includes('mica')) ||
      // Match local file/folder references
      (srcLower.includes('local') || srcLower.includes('folder') || srcLower.includes('file'))
    ) {
      return 'loaded_source';
    }
    // Generic: if a significant word from the citation appears in the source label
    const words = citLower.split(/\W+/).filter(w => w.length > 4);
    if (words.some(w => srcLower.includes(w))) return 'loaded_source';
  }
  return 'uncertain';
}

export async function verifyCitations(text: string, sourceManifest?: string[]): Promise<CitationResult[]> {
  const citations = extractCitations(text);

  if (citations.length === 0) {
    return [];
  }

  const client = getClient();

  const citationList = citations.map((c, i) => `${i + 1}. ${c}`).join('\n');

  // ATTR-04: Include source manifest context in the prompt if available
  const sourcesContext = sourceManifest && sourceManifest.length > 0
    ? `\n\nLoaded knowledge sources for this session:\n${sourceManifest.map(s => `- ${s}`).join('\n')}\n\nFor each citation, also determine whether it is grounded in one of the loaded sources above, or relies on AI general knowledge.`
    : '';

  const systemPrompt = `You are a regulatory citation verifier specialising in EU financial regulation (AML, banking, capital markets).
You verify whether regulatory citations are real, accurately named, and exist in the actual body of law.
You must respond ONLY with valid JSON — no prose, no markdown, no explanation outside the JSON.`;

  const userMessage = `Verify each of the following regulatory citations extracted from a compliance document.
For each citation, determine:
1. Does it exist as a real regulatory reference?
2. Is it correctly named/numbered (to the best of your knowledge)?
3. Is it grounded in the loaded sources, or based on general AI knowledge?${sourcesContext}

Citations to verify:
${citationList}

Respond with a JSON array. Each element must have exactly these fields:
- "citation": the exact citation string as given
- "verified": true if the citation appears to be real and correctly referenced, false if it seems invented, incorrectly numbered, or cannot be confirmed
- "comment": brief explanation (1 sentence max). For verified citations: confirm what it is. For unverified: explain the issue.
- "sourceMatch": "loaded_source" if this citation is clearly covered by a loaded knowledge source, "ai_knowledge" if it relies on general AI knowledge, "uncertain" if unclear.

Example format:
[
  {"citation": "Article 3 of Directive 2015/849/EU", "verified": true, "comment": "Article 3 of the 4th AML Directive defines obliged entities.", "sourceMatch": "ai_knowledge"},
  {"citation": "Article 999 AMLR", "verified": false, "comment": "AMLR (Regulation 2024/1624) does not contain an Article 999.", "sourceMatch": "uncertain"}
]`;

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });

  // Extract text content from the response
  const rawText = response.content
    .filter((block) => block.type === 'text')
    .map((block) => (block as { type: 'text'; text: string }).text)
    .join('');

  // Parse JSON — strip any accidental markdown code fences
  const jsonText = rawText
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();

  let results: CitationResult[];
  try {
    const parsed = JSON.parse(jsonText) as unknown[];
    results = parsed.map((item) => {
      const obj = item as Record<string, unknown>;
      const citation = String(obj.citation ?? '');
      // ATTR-04: Use Claude's sourceMatch, then fall back to local heuristic cross-check
      let sourceMatch = (obj.sourceMatch as CitationResult['sourceMatch']) ?? 'uncertain';
      if (sourceManifest && sourceManifest.length > 0 && sourceMatch !== 'loaded_source') {
        const heuristic = matchCitationToSources(citation, sourceManifest);
        if (heuristic === 'loaded_source') sourceMatch = 'loaded_source';
      }
      return {
        citation,
        verified: Boolean(obj.verified),
        comment: String(obj.comment ?? ''),
        sourceMatch,
      };
    });
  } catch {
    // If JSON parsing fails, return all citations as unverified with an error note
    results = citations.map((c) => ({
      citation: c,
      verified: false,
      comment: 'Verification service returned an unexpected response.',
      sourceMatch: 'uncertain' as const,
    }));
  }

  return results;
}
