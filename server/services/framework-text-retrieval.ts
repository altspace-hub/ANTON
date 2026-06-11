/**
 * framework-text-retrieval.ts
 * Shared grounding-text retrieval (Core Experience Review 2026-06, item 1.3).
 *
 * Replaces the old "pack names + entity counts" pseudo-grounding: given a free-text
 * query (user question / task description), this service selects the actually
 * relevant framework ARTICLES from data/frameworks/*.json (plus knowledge-pack
 * entity text when a DB adapter is provided), under a token budget, with source
 * attribution lines.
 *
 * Honesty contract: returns null when nothing relevant matches — callers must
 * then DROP the grounding layer entirely (no fake grounding claims).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { DatabaseAdapter } from '../db/database.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_FRAMEWORKS_DIR = path.join(__dirname, '..', '..', 'data', 'frameworks');

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FrameworkArticle {
  id: string;
  title: string;
  chapter?: string;
  section?: string | null;
  theme?: string;
  requirement: string;
}

export interface FrameworkDoc {
  id: string;
  name: string;
  shortName: string;
  reference?: string;
  eurLex?: string;
  articleCount?: number;
  articles: FrameworkArticle[];
}

export interface GroundingSource {
  frameworkId: string;
  frameworkName: string;
  reference?: string;
  articleId?: string;
  title?: string;
}

export interface GroundingResult {
  /** Markdown section ready to inject into a system prompt. */
  text: string;
  sources: GroundingSource[];
  approxTokens: number;
}

export interface RetrieveOptions {
  /** Free text to match against (user question, task description, …). */
  query: string;
  /** Knowledge pack ids or display names active for the session/task (soft scope). */
  packIds?: string[];
  /** DB adapter — enables knowledge-pack entity text retrieval. Optional. */
  db?: DatabaseAdapter;
  /** Approximate token budget for the whole grounding section. Default 3000. */
  tokenBudget?: number;
  /** Override the frameworks directory (tests). */
  frameworksDir?: string;
}

// ── Framework index (cached per directory) ───────────────────────────────────

const indexCache = new Map<string, FrameworkDoc[]>();

export function loadFrameworkIndex(dir: string = DEFAULT_FRAMEWORKS_DIR): FrameworkDoc[] {
  const cached = indexCache.get(dir);
  if (cached) return cached;
  const docs: FrameworkDoc[] = [];
  let files: string[] = [];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  } catch {
    indexCache.set(dir, docs);
    return docs;
  }
  for (const file of files) {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8')) as Record<string, unknown>;
      if (!raw || typeof raw !== 'object' || !Array.isArray(raw.articles)) continue;
      docs.push({
        id: String(raw.id ?? file.replace(/\.json$/, '')),
        name: String(raw.name ?? raw.id ?? file),
        shortName: String(raw.shortName ?? raw.id ?? ''),
        reference: typeof raw.reference === 'string' ? raw.reference : undefined,
        eurLex: typeof raw.eurLex === 'string' ? raw.eurLex : undefined,
        articleCount: typeof raw.articleCount === 'number' ? raw.articleCount : undefined,
        articles: (raw.articles as FrameworkArticle[]).filter(
          (a) => a && typeof a.id === 'string' && typeof a.requirement === 'string'
        ),
      });
    } catch { /* skip malformed framework file */ }
  }
  indexCache.set(dir, docs);
  return docs;
}

export function resetFrameworkIndexForTests(): void {
  indexCache.clear();
}

// ── Query tokenization ────────────────────────────────────────────────────────

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'what', 'are', 'is', 'was',
  'of', 'to', 'in', 'on', 'a', 'an', 'as', 'at', 'by', 'be', 'or', 'it', 'its',
  'under', 'how', 'does', 'do', 'can', 'will', 'shall', 'must', 'should', 'would',
  'about', 'which', 'when', 'where', 'who', 'why', 'their', 'there', 'these',
  'those', 'have', 'has', 'had', 'not', 'all', 'any', 'our', 'your', 'they',
  'requirement', 'requirements', 'article', 'articles', 'art', 'regulation',
  'directive', 'please', 'explain', 'analyse', 'analyze', 'apply', 'applies',
  'new', 'into', 'than', 'then', 'also', 'such', 'per', 'between', 'within',
]);

function tokenize(text: string): string[] {
  return [...new Set(
    text.toLowerCase()
      .split(/[^a-z0-9-]+/)
      .filter((t) => t.length >= 3 && !STOPWORDS.has(t))
  )];
}

/** Extract explicit article numbers from the query: "Art.12", "Article 12(3)". */
function extractArticleNumbers(query: string): Set<string> {
  const nums = new Set<string>();
  const re = /\bart(?:icle)?\.?\s*(\d+[a-z]?)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(query)) !== null) nums.add(m[1].toLowerCase());
  return nums;
}

/** Extract "YYYY/NNNN" style reference numbers from text. */
function extractRefNumbers(text: string): Set<string> {
  const refs = new Set<string>();
  const re = /\b(\d{2,4})\/(\d{1,4})\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) refs.add(`${m[1]}/${m[2]}`);
  return refs;
}

// ── Framework matching ────────────────────────────────────────────────────────

/** Tokens of a shortName that are distinctive enough to identify the framework alone. */
const GENERIC_NAME_TOKENS = new Set([
  'act', 'law', 'code', 'rule', 'rules', 'reg', 'part', 'framework', 'manual',
  'notice', 'guidance', 'duty', 'ordinance', 'eu', 'un', 'us', 'uk', 'hk', 'sg',
  'lu', 'ch', 'se', 'ny', 'consumer', 'program', 'sanctions', 'guidelines',
]);

function shortNameTokens(shortName: string): string[] {
  return shortName.toLowerCase().split(/[^a-z0-9]+/).filter(
    (t) => t.length >= 3 && !GENERIC_NAME_TOKENS.has(t) && !/^\d+$/.test(t)
  );
}

interface FrameworkCandidate {
  doc: FrameworkDoc;
  /** 'strong' = named/referenced in the query; 'weak' = only in active pack scope. */
  strength: 'strong' | 'weak';
}

function matchFrameworks(
  docs: FrameworkDoc[],
  query: string,
  packIds: string[]
): FrameworkCandidate[] {
  const q = query.toLowerCase();
  const qRefs = extractRefNumbers(query);
  const packSet = new Set(packIds.map((p) => p.toLowerCase()));
  const out: FrameworkCandidate[] = [];

  for (const doc of docs) {
    let strong = false;
    const shortLower = doc.shortName.toLowerCase();
    // Full shortName substring (handles multi-word names like "EU AI Act")
    if (shortLower.length >= 3 && q.includes(shortLower)) strong = true;
    // Distinctive acronym token present as a word in the query (AMLR, DORA, GDPR…)
    if (!strong) {
      for (const tok of shortNameTokens(doc.shortName)) {
        if (new RegExp(`\\b${tok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(query)) {
          strong = true;
          break;
        }
      }
    }
    // Reference number match ("2024/1624" mentioned in the query)
    if (!strong && doc.reference) {
      for (const ref of extractRefNumbers(doc.reference)) {
        if (qRefs.has(ref)) { strong = true; break; }
      }
    }
    if (strong) {
      out.push({ doc, strength: 'strong' });
      continue;
    }
    // Active-pack scope: framework id matches an active pack id (e.g. 'amlr-2024')
    if (packSet.has(doc.id.toLowerCase())) {
      out.push({ doc, strength: 'weak' });
    }
  }
  return out;
}

// ── Article scoring ───────────────────────────────────────────────────────────

interface ScoredArticle {
  doc: FrameworkDoc;
  article: FrameworkArticle;
  score: number;
}

function scoreArticles(
  candidates: FrameworkCandidate[],
  query: string,
  terms: string[]
): ScoredArticle[] {
  const explicitArts = extractArticleNumbers(query);
  const scored: ScoredArticle[] = [];

  for (const { doc, strength } of candidates) {
    for (const article of doc.articles) {
      let score = 0;
      // Exact article reference for a strongly matched framework wins outright
      const artNum = article.id.replace(/^[^0-9]*/, '').toLowerCase();
      if (strength === 'strong' && artNum && explicitArts.has(artNum)) {
        score += 1000;
      }
      const haystackTitle = article.title.toLowerCase();
      const haystackBody = `${article.requirement} ${article.theme ?? ''} ${article.section ?? ''}`.toLowerCase();
      let overlap = 0;
      let titleHit = false;
      for (const term of terms) {
        if (haystackTitle.includes(term)) { overlap++; titleHit = true; }
        else if (haystackBody.includes(term)) overlap++;
      }
      if (strength === 'strong') {
        if (overlap >= 2 || (overlap >= 1 && titleHit)) score += 10 * overlap + (titleHit ? 5 : 0);
      } else {
        // Pack-scope only: demand stronger evidence of relevance
        if (overlap >= 2) score += 5 * overlap + (titleHit ? 3 : 0);
      }
      if (score > 0) scored.push({ doc, article, score });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  return scored;
}

// ── Pack entity text ──────────────────────────────────────────────────────────

interface EntityLine {
  packName: string;
  name: string;
  description: string;
}

async function retrievePackEntities(
  db: DatabaseAdapter,
  packIds: string[],
  terms: string[]
): Promise<EntityLine[]> {
  if (packIds.length === 0 || terms.length === 0) return [];
  try {
    const placeholders = packIds.map(() => '?').join(',');
    const packs = await db.all(
      `SELECT id, display_name FROM knowledge_packs
       WHERE (id IN (${placeholders}) OR display_name IN (${placeholders})) AND status='active'`,
      ...packIds, ...packIds
    ) as Array<{ id: string; display_name: string }>;
    if (packs.length === 0) return [];
    const packNameById = new Map(packs.map((p) => [p.id, p.display_name]));
    const entPlaceholders = packs.map(() => '?').join(',');
    const entities = await db.all(
      `SELECT canonical_name, metadata, pack_id FROM entity_nodes
       WHERE pack_id IN (${entPlaceholders}) LIMIT 2000`,
      ...packs.map((p) => p.id)
    ) as Array<{ canonical_name: string; metadata: string | null; pack_id: string | null }>;

    const lines: EntityLine[] = [];
    for (const e of entities) {
      const nameLower = e.canonical_name.toLowerCase();
      let description = '';
      try {
        const meta = e.metadata ? JSON.parse(e.metadata) as Record<string, unknown> : {};
        if (typeof meta.description === 'string') description = meta.description;
      } catch { /* ignore malformed metadata */ }
      const haystack = `${nameLower} ${description.toLowerCase()}`;
      const overlap = terms.filter((t) => haystack.includes(t)).length;
      const nameHit = terms.some((t) => nameLower.includes(t));
      if (overlap >= 2 || nameHit) {
        lines.push({
          packName: packNameById.get(e.pack_id ?? '') ?? 'Knowledge pack',
          name: e.canonical_name,
          description,
        });
      }
      if (lines.length >= 40) break;
    }
    return lines;
  } catch {
    return []; // entity tables may not exist — grounding still works framework-only
  }
}

// ── Main entry point ──────────────────────────────────────────────────────────

const MAX_ARTICLES = 20;
const CHARS_PER_TOKEN = 4;

/**
 * Retrieve budgeted, relevance-filtered framework text (+ pack entity text)
 * for a query. Returns null when nothing relevant matches — callers must drop
 * the grounding layer in that case.
 */
export async function retrieveGroundingText(opts: RetrieveOptions): Promise<GroundingResult | null> {
  const { query, packIds = [], db, tokenBudget = 3000, frameworksDir } = opts;
  if (!query || !query.trim()) return null;

  const docs = loadFrameworkIndex(frameworksDir);
  const terms = tokenize(query);
  const candidates = matchFrameworks(docs, query, packIds);
  const scored = candidates.length > 0 ? scoreArticles(candidates, query, terms) : [];

  const budgetChars = Math.max(400, tokenBudget * CHARS_PER_TOKEN);
  // Reserve ~25% of the budget for pack entity text when a DB is available.
  const frameworkBudget = db && packIds.length > 0 ? Math.floor(budgetChars * 0.75) : budgetChars;

  const sources: GroundingSource[] = [];
  const sections = new Map<string, string[]>(); // frameworkId → article lines
  const headers = new Map<string, string>();
  let usedChars = 0;

  for (const { doc, article } of scored.slice(0, MAX_ARTICLES * 3)) {
    if (sources.length >= MAX_ARTICLES) break;
    if (!headers.has(doc.id)) {
      const refPart = doc.reference ? ` (${doc.reference})` : '';
      const celexPart = doc.eurLex ? ` [${doc.eurLex}]` : '';
      headers.set(doc.id, `### ${doc.name}${refPart}${celexPart}`);
    }
    const req = article.requirement.length > 600 ? `${article.requirement.slice(0, 600)}…` : article.requirement;
    const line = `- ${article.id} — ${article.title}: ${req}`;
    const headerCost = sections.has(doc.id) ? 0 : (headers.get(doc.id) ?? '').length + 2;
    if (usedChars + headerCost + line.length + 1 > frameworkBudget) continue;
    usedChars += headerCost + line.length + 1;
    const arr = sections.get(doc.id) ?? [];
    arr.push(line);
    sections.set(doc.id, arr);
    sources.push({
      frameworkId: doc.id,
      frameworkName: doc.name,
      reference: doc.reference,
      articleId: article.id,
      title: article.title,
    });
  }

  // Pack entity text (remaining budget)
  let entityBlock = '';
  if (db && packIds.length > 0) {
    const entityLines = await retrievePackEntities(db, packIds, terms);
    if (entityLines.length > 0) {
      const remaining = budgetChars - usedChars;
      const grouped = new Map<string, string[]>();
      let entChars = 0;
      for (const e of entityLines) {
        const line = e.description ? `- ${e.name}: ${e.description.slice(0, 400)}` : `- ${e.name}`;
        if (entChars + line.length + 1 > remaining) break;
        entChars += line.length + 1;
        const arr = grouped.get(e.packName) ?? [];
        arr.push(line);
        grouped.set(e.packName, arr);
      }
      if (grouped.size > 0) {
        const parts: string[] = [];
        for (const [packName, lines] of grouped) {
          parts.push(`### Knowledge pack: ${packName}\n${lines.join('\n')}`);
          sources.push({ frameworkId: `pack:${packName}`, frameworkName: packName });
        }
        entityBlock = parts.join('\n\n');
        usedChars += entChars;
      }
    }
  }

  if (sections.size === 0 && !entityBlock) return null;

  const frameworkBlocks = [...sections.entries()].map(
    ([fid, lines]) => `${headers.get(fid)}\n${lines.join('\n')}\nSource: local framework dataset '${fid}' (data/frameworks)`
  );

  const text = [
    '## GROUNDED REGULATORY TEXT (LOCAL SOURCES)',
    'The following requirement texts come verbatim from locally installed framework data and knowledge packs. Ground your analysis in these texts and cite them precisely. Do not attribute to these sources anything not shown below.',
    ...frameworkBlocks,
    ...(entityBlock ? [entityBlock] : []),
  ].join('\n\n');

  return {
    text,
    sources,
    approxTokens: Math.ceil(text.length / CHARS_PER_TOKEN),
  };
}
