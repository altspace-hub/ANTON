/**
 * category-news.ts — Life pillar / News area read-side service.
 *
 * Phase B.3 build-out. Extracts query logic that previously lived inline in
 * server/routes/news.ts so the route file stays a thin HTTP layer and the
 * domain logic is testable without spinning up Express.
 *
 * Mutation endpoints (truth-check pipeline, RSS ingest) are still in the
 * route file because they wrap LLM calls; this service handles list/get
 * queries and source curation that don't need the LLM.
 */

import type { DatabaseAdapter } from '../db/database.js';

export interface NewsSource {
  id: string;
  name: string;
  url: string;
  rss_url: string | null;
  country: string;
  language: string;
  bias_rating: string;
  factuality_score: number;
  category: string;
  is_active: number;
}

export interface NewsStory {
  id: string;
  headline: string;
  summary: string | null;
  cluster_id: string | null;
  topic_tags: string;
  entities: string;
  article_count: number;
  source_diversity_score: number;
  truth_check_id: string | null;
  first_seen: string;
  last_updated: string;
}

export interface NewsArticle {
  id: string;
  story_id: string | null;
  source_id: string;
  title: string;
  url: string;
  published_at: string | null;
  author: string | null;
  content_snippet: string | null;
  bias_angle: string | null;
  sentiment: number;
  fetched_at: string;
}

export interface SourceFilter {
  country?: string;
  bias?: string;
  category?: string;
  language?: string;
  /** Minimum factuality score (0-100). */
  minFactuality?: number;
}

export interface StoryFilter {
  topic?: string;
  /** Default 20, max 200. */
  limit?: number;
  /** Order by: 'recency' (default) or 'diversity'. */
  order?: 'recency' | 'diversity';
}

/**
 * Compute a diversity score for a clustered story based on the bias-rating
 * spread of its constituent articles. Returns 0 (echo chamber) → 100
 * (full spectrum). Pure function — easy to unit test.
 */
export function computeSourceDiversity(articleBiasRatings: string[]): number {
  if (articleBiasRatings.length === 0) return 0;
  const buckets = new Set(articleBiasRatings.filter(Boolean));
  // 7 standard bias buckets: far_left, left, center_left, center, center_right, right, far_right
  const maxBuckets = 7;
  return Math.round((Math.min(buckets.size, maxBuckets) / maxBuckets) * 100);
}

export function createNewsCategoryService(db: DatabaseAdapter) {

  async function listSources(filter?: SourceFilter): Promise<NewsSource[]> {
    const conds: string[] = ['is_active = 1'];
    const args: unknown[] = [];
    if (filter?.country)        { conds.push('country = ?');              args.push(filter.country); }
    if (filter?.bias)           { conds.push('bias_rating = ?');          args.push(filter.bias); }
    if (filter?.category)       { conds.push('category = ?');             args.push(filter.category); }
    if (filter?.language)       { conds.push('language = ?');             args.push(filter.language); }
    if (filter?.minFactuality)  { conds.push('factuality_score >= ?');    args.push(filter.minFactuality); }
    return await db.all<NewsSource>(
      `SELECT * FROM news_sources WHERE ${conds.join(' AND ')} ORDER BY factuality_score DESC`,
      ...args,
    );
  }

  async function listStories(filter?: StoryFilter): Promise<NewsStory[]> {
    const limit = Math.min(filter?.limit ?? 20, 200);
    const orderClause = filter?.order === 'diversity'
      ? 'ORDER BY source_diversity_score DESC, last_updated DESC'
      : 'ORDER BY last_updated DESC';
    if (filter?.topic) {
      return await db.all<NewsStory>(
        `SELECT * FROM news_stories WHERE topic_tags LIKE ? ${orderClause} LIMIT ?`,
        `%${filter.topic}%`, limit,
      );
    }
    return await db.all<NewsStory>(
      `SELECT * FROM news_stories ${orderClause} LIMIT ?`,
      limit,
    );
  }

  async function getStoryWithArticles(id: string): Promise<{ story: NewsStory; articles: NewsArticle[] } | null> {
    const story = await db.get<NewsStory>('SELECT * FROM news_stories WHERE id = ?', id);
    if (!story) return null;
    const articles = await db.all<NewsArticle>(
      `SELECT a.*, s.name AS source_name, s.bias_rating, s.country
         FROM news_articles a
         LEFT JOIN news_sources s ON a.source_id = s.id
        WHERE a.story_id = ?
        ORDER BY a.published_at DESC`,
      id,
    );
    return { story, articles };
  }

  async function listArticlesBySource(sourceId: string, limit = 50): Promise<NewsArticle[]> {
    return await db.all<NewsArticle>(
      `SELECT a.*, s.name AS source_name, s.bias_rating, s.country, s.factuality_score
         FROM news_articles a LEFT JOIN news_sources s ON a.source_id = s.id
        WHERE a.source_id = ?
        ORDER BY a.published_at DESC
        LIMIT ?`,
      sourceId, Math.min(limit, 500),
    );
  }

  /**
   * Recompute and persist source_diversity_score for a story.
   * Run this after a new article is linked to the story.
   */
  async function refreshDiversityScore(storyId: string): Promise<number> {
    const rows = await db.all<{ bias_rating: string }>(
      `SELECT s.bias_rating
         FROM news_articles a JOIN news_sources s ON a.source_id = s.id
        WHERE a.story_id = ?`,
      storyId,
    );
    const score = computeSourceDiversity(rows.map(r => r.bias_rating));
    await db.run(
      'UPDATE news_stories SET source_diversity_score = ?, last_updated = CURRENT_TIMESTAMP WHERE id = ?',
      score, storyId,
    );
    return score;
  }

  return {
    listSources,
    listStories,
    getStoryWithArticles,
    listArticlesBySource,
    refreshDiversityScore,
  };
}

export type NewsCategoryService = ReturnType<typeof createNewsCategoryService>;
