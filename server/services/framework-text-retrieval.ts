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
import { createHash } from 'crypto';
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
  /**
   * Wave 1H — optional, retrieval-only. The words a practitioner would TYPE when
   * they want this article, which the one-sentence summary in `requirement` does
   * not happen to contain.
   *
   * This is a corpus fix for a corpus defect. AI Act Art.50 is the transparency
   * obligation that binds a marketer, and its stored sentence reads "…intended
   * to interact with persons, generate synthetic content (deepfakes), or perform
   * emotion recognition…" — no "marketing", no "chatbot", no "label", no
   * "disclosure". No amount of re-weighting can select an article with zero term
   * overlap, and the alternative (stemming `generated`→`generate`) also maps
   * `marketing`→`market` and would resurrect the "placing on the market" false
   * positives that Wave 1F removed.
   *
   * The discipline that keeps this safe: an alias is a term the article SHOULD BE
   * FOUND BY, not a term it mentions. Alias terms are rare by construction and so
   * carry near-maximum IDF weight — a generous list reintroduces the noise
   * through the front door and the weighted-mass gate will not catch it.
   *
   * Aliases never appear in the injected text; they only decide selection, and
   * they score exactly like a body hit (no title bonus) and are counted in the
   * framework's document frequencies like any other term.
   */
  aliases?: string[];
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
  /** Wave 2: sha256 of the article line as injected, so the run artifact can pin it. */
  sha256?: string;
  /** Wave 2: characters of the injected line. */
  chars?: number;
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
  /**
   * Wave 2: framework ids that may ground the query even when it does not
   * name them ("weak scope"), e.g. the area's frameworks from
   * area-frameworks.ts. Articles from these still need term overlap to appear.
   */
  frameworkIds?: string[];
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
        articles: (raw.articles as FrameworkArticle[])
          .filter((a) => a && typeof a.id === 'string' && typeof a.requirement === 'string')
          // Wave 1H: `aliases` is hand-authored data in 60 files that also ship
          // to the Gap Assessor, so it is normalised here rather than trusted —
          // a string instead of an array, or a number inside one, must not reach
          // the tokenizer. Absent stays absent (the field is optional).
          .map((a) => {
            if (a.aliases === undefined) return a;
            const aliases = Array.isArray(a.aliases)
              ? a.aliases.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
              : [];
            return { ...a, aliases };
          }),
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

/**
 * Wave 1F: fold the regular English plural so a query term and the article text
 * meet on one key ("logs"/"log", "providers"/"provider", "policies"/"policy").
 *
 * Deliberately conservative — only the -s / -es / -ies endings, and never on a
 * word that ends in `ss`, `us` or `is` ("business", "status", "analysis").
 * This replaces the recall that the old substring match provided in one
 * direction only (a short query term found a longer word in the text, never the
 * reverse) without its false positives ("log" ⊂ "catalogue", "art" ⊂ "part").
 */
export function foldPlural(word: string): string {
  if (word.length < 4 || !word.endsWith('s')) return word;
  // Singulars that already end in -s: "business", "status", "analysis", "bias".
  if (/(?:ss|us|is|ias)$/.test(word)) return word;
  if (word.length >= 5 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  // -es is only the plural marker after a sibilant; elsewhere it is -e plus -s
  // ("breaches" → "breach", but "cases" → "case", not "cas").
  if (word.length >= 5 && /(?:ch|sh|x|z|ss|ias)es$/.test(word)) return word.slice(0, -2);
  return word.slice(0, -1);
}

/**
 * Words of a text, normalised for matching: lowercased, ≥3 characters, plural
 * folded. A hyphenated compound contributes both the compound and its parts, so
 * "high-risk" is still the distinctive term it is while a query saying "risk"
 * reaches it.
 */
function words(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.toLowerCase().split(/[^a-z0-9-]+/)) {
    if (raw.length < 3) continue;
    out.push(foldPlural(raw));
    if (raw.includes('-')) {
      for (const part of raw.split('-')) if (part.length >= 3) out.push(foldPlural(part));
    }
  }
  return out;
}

function tokenize(text: string): string[] {
  return [...new Set(words(text).filter((t) => !STOPWORDS.has(t)))];
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
  packIds: string[],
  frameworkIds: string[] = []
): FrameworkCandidate[] {
  const q = query.toLowerCase();
  const qRefs = extractRefNumbers(query);
  const packSet = new Set([...packIds, ...frameworkIds].map((p) => p.toLowerCase()));
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

// ── Per-framework term statistics (IDF) ───────────────────────────────────────

/**
 * Wave 1F. Before this, every query term counted 1. Generic regulatory
 * vocabulary — "system", "provider", "market", "risk", "compliance" — sits in a
 * large share of the articles of any framework and so carries no discriminative
 * power, yet it scored exactly like a distinctive term. On a short query the
 * generic terms are most of the signal, which is how a copywriting brief in
 * `branding` pulled AI Act Art.47 (EU declaration of conformity) and Art.22
 * (authorised representatives) purely on "market" and "system".
 *
 * A term's weight is now its inverse document frequency inside the framework it
 * is being matched against, normalised by log(N) so the weight of a term that
 * appears in exactly one article is 1.0 in a 4-article framework and in a
 * 106-article one alike. Without that normalisation a large framework would
 * out-score a small one on every query, because its raw log(N/df) ceiling is
 * higher — and the ranking here is across frameworks.
 */
interface ArticleTerms {
  title: ReadonlySet<string>;
  body: ReadonlySet<string>;
  /**
   * Wave 1H. Kept apart from `body` so the alias contribution stays visible and
   * removable — a term here scores exactly like a body hit (no title bonus) and
   * is counted in the document frequencies like any other term, so an alias
   * repeated across many articles loses weight the same way "processing" does.
   */
  alias: ReadonlySet<string>;
}

interface DocTermStats {
  articleCount: number;
  /** term → number of articles (title or body) containing it. */
  documentFrequency: ReadonlyMap<string, number>;
  /** Parallel to doc.articles. */
  articles: ArticleTerms[];
  /** log(articleCount); 0 when the framework is too small for IDF to mean anything. */
  logN: number;
}

/**
 * Keyed on the FrameworkDoc object itself, which loadFrameworkIndex() caches and
 * reuses for the life of the process — so the statistics are built once per
 * framework file, not once per request. resetFrameworkIndexForTests() drops the
 * docs and the entries here become garbage with them.
 */
const statsCache = new WeakMap<FrameworkDoc, DocTermStats>();

/** Below this many articles, document frequency is noise — every term weighs 1. */
const MIN_ARTICLES_FOR_IDF = 5;

function documentStats(doc: FrameworkDoc): DocTermStats {
  const cached = statsCache.get(doc);
  if (cached) return cached;
  const df = new Map<string, number>();
  const articles: ArticleTerms[] = [];
  for (const article of doc.articles) {
    const title = new Set(words(article.title));
    const body = new Set(words(`${article.requirement} ${article.theme ?? ''} ${article.section ?? ''}`));
    const alias = new Set(article.aliases?.length ? words(article.aliases.join(' ')) : []);
    articles.push({ title, body, alias });
    for (const t of new Set([...title, ...body, ...alias])) df.set(t, (df.get(t) ?? 0) + 1);
  }
  const stats: DocTermStats = {
    articleCount: doc.articles.length,
    documentFrequency: df,
    articles,
    logN: doc.articles.length >= MIN_ARTICLES_FOR_IDF ? Math.log(doc.articles.length) : 0,
  };
  statsCache.set(doc, stats);
  return stats;
}

/**
 * Acronyms that identify the framework itself ("GDPR", "AMLR", "DORA").
 *
 * A query that names the regulation already made the whole document a strong
 * candidate; letting the same word *also* pick articles is double counting, and
 * under weighting it is actively harmful — the acronym appears in one or two
 * article bodies by coincidence, so it earns near-maximum weight there. That is
 * how "…against AMLR" surfaced AMLR Art.4 (gambling-service exemptions) and how
 * "Healthcare GDPR compliance" surfaced GDPR Art.27 (representatives of
 * controllers) and Art.82 (right to compensation).
 *
 * Only the upper-case runs of the shortName count, so "UK Online Safety Act"
 * keeps "online" and "safety" as ordinary searchable terms.
 */
function identityTerms(shortName: string): Set<string> {
  const out = new Set<string>();
  for (const run of shortName.match(/\b[A-Z][A-Z0-9]{2,}\b/g) ?? []) out.add(run.toLowerCase());
  return out;
}

/**
 * Discriminative weight of `term` inside `doc`, in [0, 1]:
 * a term in one article → 1.0, a term in every article → 0.
 */
function termWeight(term: string, stats: DocTermStats): number {
  const df = stats.documentFrequency.get(term) ?? 0;
  if (df === 0) return 0;
  if (stats.logN <= 0) return 1; // too few articles to distinguish — fall back to flat
  return Math.max(0, Math.log(stats.articleCount / df) / stats.logN);
}

// ── Article scoring ───────────────────────────────────────────────────────────

/**
 * Minimum weighted mass an article must carry before it is allowed to ground
 * anything. 0.8 is roughly "one term that appears in at most two articles of
 * this framework", or "two terms that each appear in a quarter of them".
 *
 * What changed and why:
 *   - The old gate was a raw count — `overlap >= 2`, or `>= 1` with a title hit
 *     for a named framework. A short query satisfies a count gate with two
 *     ubiquitous words ("system", "market"), which is how a copywriting brief
 *     reached the AI Act's conformity-assessment chapter.
 *   - The count is still the right shape for a WEAK candidate: nothing in the
 *     query said the user wanted that framework, so one coincidental word —
 *     however rare — is not enough. `overlap >= 2` is therefore kept as a floor
 *     on weak candidates and the mass threshold added on top of it. (Dropping
 *     the count and gating weak candidates on mass alone let AI Act Art.19
 *     "Automatically generated logs" ground a social-media brief on the single
 *     word "generated"; keeping it blocks that and still admits UN 1267 "asset
 *     freeze" for a sanctions-screening question.)
 *   - For a STRONG candidate the count floor is dropped: the user named the
 *     regulation, so one genuinely distinctive term is evidence enough, and the
 *     mass threshold is what stops a ubiquitous one.
 */
const MIN_MASS = 0.8;
const MIN_OVERLAP_WEAK = 2;

interface ScoredArticle {
  doc: FrameworkDoc;
  article: FrameworkArticle;
  score: number;
  /** 1 = the query named this framework, 0 = only the area/pack scope offered it. */
  tier: 0 | 1;
}

function scoreArticles(
  candidates: FrameworkCandidate[],
  query: string,
  terms: string[]
): ScoredArticle[] {
  const explicitArts = extractArticleNumbers(query);
  const scored: ScoredArticle[] = [];

  for (const { doc, strength } of candidates) {
    const stats = documentStats(doc);
    // Term weights are per framework — "risk" is generic inside the AI Act and
    // distinctive inside a data-protection act — so they are resolved once per
    // (framework, query) pair rather than once per article.
    const identity = identityTerms(doc.shortName);
    const weights = new Map<string, number>();
    for (const term of terms) weights.set(term, identity.has(term) ? 0 : termWeight(term, stats));

    for (let i = 0; i < doc.articles.length; i++) {
      const article = doc.articles[i];
      const articleTerms = stats.articles[i];
      let score = 0;
      // Exact article reference for a strongly matched framework wins outright
      const artNum = article.id.replace(/^[^0-9]*/, '').toLowerCase();
      if (strength === 'strong' && artNum && explicitArts.has(artNum)) {
        score += 1000;
      }
      let mass = 0;
      let overlap = 0;
      let titleHit = false;
      for (const term of terms) {
        const w = weights.get(term) ?? 0;
        if (articleTerms.title.has(term)) { overlap++; titleHit = true; mass += w; }
        // Wave 1H: an alias hit is a body hit. It adds weight and corroboration
        // (so it can satisfy MIN_OVERLAP_WEAK) but never the title bonus, and it
        // never bypasses MIN_MASS.
        else if (articleTerms.body.has(term) || articleTerms.alias.has(term)) { overlap++; mass += w; }
      }
      if (strength === 'strong') {
        if (mass >= MIN_MASS) score += 10 * mass + (titleHit ? 5 : 0);
      } else {
        // Pack/area scope only: demand corroboration as well as weight
        if (overlap >= MIN_OVERLAP_WEAK && mass >= MIN_MASS) score += 5 * mass + (titleHit ? 3 : 0);
      }
      if (score > 0) scored.push({ doc, article, score, tier: strength === 'strong' ? 1 : 0 });
    }
  }
  /**
   * Wave 1F: a framework the user NAMED outranks one the area map merely
   * offered, whatever the arithmetic says. Weighting made scores comparable
   * across frameworks for the first time, and that exposed a latent unfairness:
   * a 14-article questionnaire in which every query term is rare accumulates
   * more weighted mass than the 90-article regulation the user actually asked
   * about, where the same concepts are spread over thirty articles. Sorting on
   * the tier first keeps "AMLR gap analysis" grounded in AMLR. The +1000 exact
   * article-number override can only occur on a strong candidate, so it still
   * sorts to the very top.
   */
  scored.sort((a, b) => (b.tier - a.tier) || (b.score - a.score));
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
    // Counsel's Desk (and the seeded defaults) address packs by their slug —
    // knowledge_packs.name ('amlr-2024', 'amla-amld6') — while ids are UUIDs and
    // display names are long titles. Without the name match no pack the page
    // showed as active ever grounded anything.
    const packs = await db.all(
      `SELECT id, display_name FROM knowledge_packs
       WHERE (id IN (${placeholders}) OR name IN (${placeholders}) OR display_name IN (${placeholders})) AND status='active'`,
      ...packIds, ...packIds, ...packIds
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
  const { query, packIds = [], frameworkIds = [], db, tokenBudget = 3000, frameworksDir } = opts;
  if (!query || !query.trim()) return null;

  const docs = loadFrameworkIndex(frameworksDir);
  const terms = tokenize(query);
  const candidates = matchFrameworks(docs, query, packIds, frameworkIds);
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
      sha256: createHash('sha256').update(line, 'utf8').digest('hex'),
      chars: line.length,
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
