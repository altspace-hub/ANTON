import { Router } from 'express';
import type Database from 'better-sqlite3';
import Anthropic from '@anthropic-ai/sdk';

export function createNewsRoutes(db: Database.Database, anthropic?: Anthropic) {
  const router = Router();

  // DB migrations — non-fatal ALTER TABLE pattern
  const newsTables = [
    `CREATE TABLE IF NOT EXISTS news_sources (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      rss_url TEXT,
      country TEXT DEFAULT 'global',
      language TEXT DEFAULT 'en',
      bias_rating TEXT DEFAULT 'center',
      factuality_score INTEGER DEFAULT 70,
      ownership TEXT,
      category TEXT DEFAULT 'general',
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS news_stories (
      id TEXT PRIMARY KEY,
      headline TEXT NOT NULL,
      summary TEXT,
      cluster_id TEXT,
      first_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
      topic_tags TEXT DEFAULT '[]',
      entities TEXT DEFAULT '[]',
      article_count INTEGER DEFAULT 0,
      source_diversity_score INTEGER DEFAULT 0,
      truth_check_id TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS news_articles (
      id TEXT PRIMARY KEY,
      story_id TEXT,
      source_id TEXT NOT NULL,
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      published_at DATETIME,
      author TEXT,
      content_snippet TEXT,
      bias_angle TEXT,
      sentiment REAL DEFAULT 0.0,
      fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (source_id) REFERENCES news_sources(id)
    )`,
    `CREATE TABLE IF NOT EXISTS truth_checks (
      id TEXT PRIMARY KEY,
      story_id TEXT,
      claim TEXT NOT NULL,
      verdict TEXT CHECK(verdict IN ('true','mostly_true','mixed','mostly_false','false','unverifiable')),
      confidence INTEGER DEFAULT 50,
      explanation TEXT,
      sources_checked TEXT DEFAULT '[]',
      checked_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS news_user_preferences (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT 'default',
      preferred_topics TEXT DEFAULT '[]',
      preferred_sources TEXT DEFAULT '[]',
      blocked_sources TEXT DEFAULT '[]',
      language_filter TEXT DEFAULT 'all',
      bias_range TEXT DEFAULT '{"min":"far_left","max":"far_right"}',
      reading_history TEXT DEFAULT '[]',
      bias_profile TEXT DEFAULT '{}',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id)
    )`,
  ];

  for (const sql of newsTables) {
    try { db.exec(sql); } catch (e) { console.warn('[news] table migration warning:', e); }
  }

  // Seed default news sources if empty
  const sourceCount = (db.prepare('SELECT COUNT(*) as cnt FROM news_sources').get() as { cnt: number }).cnt;
  if (sourceCount === 0) {
    const insertSource = db.prepare(
      `INSERT OR IGNORE INTO news_sources (id, name, url, rss_url, country, language, bias_rating, factuality_score, category) VALUES (?,?,?,?,?,?,?,?,?)`
    );
    const defaultSources: [string, string, string, string, string, string, string, number, string][] = [
      ['reuters',     'Reuters',            'https://reuters.com',    'https://feeds.reuters.com/reuters/topNews',    'global', 'en', 'center',       90, 'general'],
      ['bbc-news',    'BBC News',           'https://bbc.com/news',   'http://feeds.bbci.co.uk/news/rss.xml',         'gb',     'en', 'center_left',  85, 'general'],
      ['svt-nyheter', 'SVT Nyheter',        'https://svt.se/nyheter', 'https://www.svt.se/nyheter/rss.xml',           'se',     'sv', 'center_left',  88, 'general'],
      ['dn',          'Dagens Nyheter',     'https://dn.se',          'https://www.dn.se/rss/',                       'se',     'sv', 'center_left',  80, 'general'],
      ['svd',         'Svenska Dagbladet',  'https://svd.se',         'https://www.svd.se/rss.xml',                   'se',     'sv', 'center_right', 78, 'general'],
      ['nrk',         'NRK',               'https://nrk.no',          'https://www.nrk.no/toppsaker.rss',             'no',     'no', 'center_left',  87, 'general'],
      ['guardian',    'The Guardian',       'https://guardian.com',   'https://www.theguardian.com/world/rss',         'gb',     'en', 'left',         80, 'general'],
      ['ap',          'Associated Press',   'https://apnews.com',     'https://rsshub.app/apnews/topics/apf-topnews', 'global', 'en', 'center',       92, 'general'],
      ['economist',   'The Economist',      'https://economist.com',  '',                                              'global', 'en', 'center_right', 88, 'general'],
      ['ft',          'Financial Times',    'https://ft.com',         '',                                              'global', 'en', 'center_right', 85, 'business'],
      ['bloomberg',   'Bloomberg',          'https://bloomberg.com',  '',                                              'global', 'en', 'center',       82, 'business'],
      ['techcrunch',  'TechCrunch',         'https://techcrunch.com', 'https://techcrunch.com/feed/',                  'us',     'en', 'center_left',  72, 'technology'],
      ['wired',       'Wired',             'https://wired.com',       'https://www.wired.com/feed/rss',               'us',     'en', 'center_left',  78, 'technology'],
      ['nature',      'Nature',            'https://nature.com',      'https://www.nature.com/nature.rss',            'global', 'en', 'center',       95, 'science'],
    ];
    for (const s of defaultSources) {
      try { insertSource.run(...s); } catch { /* ignore duplicate seeds */ }
    }
  }

  // GET /api/news/sources — list all sources with optional filters
  router.get('/news/sources', (req, res) => {
    try {
      const { country, bias, category } = req.query;
      let query = 'SELECT * FROM news_sources WHERE is_active = 1';
      const params: unknown[] = [];
      if (country)   { query += ' AND country = ?';      params.push(country); }
      if (bias)      { query += ' AND bias_rating = ?';  params.push(bias); }
      if (category)  { query += ' AND category = ?';     params.push(category); }
      query += ' ORDER BY factuality_score DESC';
      res.json(db.prepare(query).all(...params));
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  // GET /api/news/stories — list clustered stories
  router.get('/news/stories', (req, res) => {
    try {
      const { limit = '20', topic } = req.query;
      let query = 'SELECT * FROM news_stories';
      const params: unknown[] = [];
      if (topic) { query += ' WHERE topic_tags LIKE ?'; params.push(`%${topic}%`); }
      query += ' ORDER BY last_updated DESC LIMIT ?';
      params.push(Number(limit));
      res.json(db.prepare(query).all(...params));
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  // GET /api/news/stories/:id — single story with articles
  router.get('/news/stories/:id', (req, res) => {
    try {
      const story = db.prepare('SELECT * FROM news_stories WHERE id = ?').get(req.params.id);
      if (!story) return res.status(404).json({ error: 'Story not found' });
      const articles = db.prepare(`
        SELECT a.*, s.name as source_name, s.bias_rating, s.country
        FROM news_articles a
        LEFT JOIN news_sources s ON a.source_id = s.id
        WHERE a.story_id = ?
        ORDER BY a.published_at DESC
      `).all(req.params.id);
      return res.json({ story, articles });
    } catch (e) { return res.status(500).json({ error: String(e) }); }
  });

  // GET /api/news/articles — latest articles
  router.get('/news/articles', (req, res) => {
    try {
      const { limit = '50', source_id } = req.query;
      let query = `SELECT a.*, s.name as source_name, s.bias_rating, s.country, s.factuality_score
        FROM news_articles a LEFT JOIN news_sources s ON a.source_id = s.id`;
      const params: unknown[] = [];
      if (source_id) { query += ' WHERE a.source_id = ?'; params.push(source_id); }
      query += ' ORDER BY a.published_at DESC LIMIT ?';
      params.push(Number(limit));
      res.json(db.prepare(query).all(...params));
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  // POST /api/news/truth-check — AI truth verification
  router.post('/news/truth-check', async (req, res) => {
    try {
      if (!anthropic) return res.status(503).json({ error: 'Anthropic client not available' });
      const { claim, story_id } = req.body as { claim: string; story_id?: string };
      if (!claim) return res.status(400).json({ error: 'claim required' });

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: `Analyze this claim and provide a fact-check verdict. Respond in JSON only.

Claim: "${claim}"

Respond with:
{
  "verdict": "true|mostly_true|mixed|mostly_false|false|unverifiable",
  "confidence": 0-100,
  "explanation": "brief explanation",
  "red_flags": ["list of concerns"],
  "corroborating_factors": ["supporting points"]
}`,
        }],
      });

      const text = response.content[0].type === 'text' ? response.content[0].text : '{}';
      let parsed: Record<string, unknown> = {};
      try { parsed = JSON.parse(text.replace(/```json\n?|\n?```/g, '')); } catch { /* keep empty */ }

      const id = `tc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      db.prepare(
        `INSERT OR REPLACE INTO truth_checks (id, story_id, claim, verdict, confidence, explanation, sources_checked) VALUES (?,?,?,?,?,?,?)`
      ).run(
        id, story_id ?? null, claim,
        (parsed.verdict as string) || 'unverifiable',
        Number(parsed.confidence) || 50,
        (parsed.explanation as string) || '',
        JSON.stringify(parsed.red_flags || [])
      );
      return res.json({ id, ...parsed });
    } catch (e) { return res.status(500).json({ error: String(e) }); }
  });

  // GET /api/news/preferences — user news preferences
  router.get('/news/preferences', (req, res) => {
    try {
      const prefs = db.prepare("SELECT * FROM news_user_preferences WHERE user_id = 'default'").get() as Record<string, unknown> | undefined;
      if (!prefs) {
        return res.json({
          preferred_topics: [],
          preferred_sources: [],
          blocked_sources: [],
          language_filter: 'all',
          bias_profile: {},
        });
      }
      return res.json({
        ...prefs,
        preferred_topics: JSON.parse((prefs.preferred_topics as string) || '[]'),
        preferred_sources: JSON.parse((prefs.preferred_sources as string) || '[]'),
        blocked_sources:   JSON.parse((prefs.blocked_sources   as string) || '[]'),
        reading_history:   JSON.parse((prefs.reading_history   as string) || '[]'),
        bias_profile:      JSON.parse((prefs.bias_profile      as string) || '{}'),
      });
    } catch (e) { return res.status(500).json({ error: String(e) }); }
  });

  // PATCH /api/news/preferences — update user preferences
  router.patch('/news/preferences', (req, res) => {
    try {
      const existing = db.prepare("SELECT * FROM news_user_preferences WHERE user_id = 'default'").get() as Record<string, unknown> | undefined;
      const body = req.body as Record<string, unknown>;
      const id = existing ? (existing.id as string) : `np_${Date.now()}`;
      db.prepare(
        `INSERT OR REPLACE INTO news_user_preferences (id, user_id, preferred_topics, preferred_sources, blocked_sources, language_filter, bias_range, bias_profile) VALUES (?,?,?,?,?,?,?,?)`
      ).run(
        id, 'default',
        JSON.stringify(body.preferred_topics || (existing ? JSON.parse((existing.preferred_topics as string) || '[]') : [])),
        JSON.stringify(body.preferred_sources || (existing ? JSON.parse((existing.preferred_sources as string) || '[]') : [])),
        JSON.stringify(body.blocked_sources   || (existing ? JSON.parse((existing.blocked_sources   as string) || '[]') : [])),
        body.language_filter ?? existing?.language_filter ?? 'all',
        JSON.stringify(body.bias_range || { min: 'far_left', max: 'far_right' }),
        JSON.stringify(body.bias_profile || (existing ? JSON.parse((existing.bias_profile as string) || '{}') : {}))
      );
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  // POST /api/news/generate-explainer — AI story explainer (streaming)
  router.post('/news/generate-explainer', async (req, res) => {
    try {
      if (!anthropic) return res.status(503).json({ error: 'Anthropic client not available' });
      const { headline, articles } = req.body as {
        headline: string;
        articles: Array<{ title: string; source_name: string; bias_rating: string; content_snippet?: string }>;
      };

      const articleSummaries = (articles || []).slice(0, 6).map(a =>
        `- ${a.source_name} (${a.bias_rating}): ${a.title}${a.content_snippet ? '\n  ' + a.content_snippet.slice(0, 200) : ''}`
      ).join('\n');

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const stream = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        stream: true,
        messages: [{
          role: 'user',
          content: `Explain this news story in a balanced, factual way. Point out different angles from different sources.

Headline: ${headline}

Coverage from different sources:
${articleSummaries}

Write a 3-4 paragraph neutral explainer that:
1. Summarizes what happened
2. Notes key perspectives from different sources
3. Provides useful context
4. Flags any notable framing differences between outlets`,
        }],
      });

      for await (const chunk of stream) {
        if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
          res.write(`data: ${JSON.stringify({ type: 'text_delta', content: chunk.delta.text })}\n\n`);
        }
      }
      res.write('data: [DONE]\n\n');
      return res.end();
    } catch (e) { return res.status(500).json({ error: String(e) }); }
  });

  // POST /api/news/analyze-bias — analyze reading bias pattern
  router.post('/news/analyze-bias', async (req, res) => {
    try {
      if (!anthropic) return res.status(503).json({ error: 'Anthropic client not available' });
      const { reading_history } = req.body as {
        reading_history: Array<{ source: string; bias_rating: string; topic: string }>;
      };

      const biasCount: Record<string, number> = {};
      for (const item of reading_history || []) {
        biasCount[item.bias_rating] = (biasCount[item.bias_rating] || 0) + 1;
      }

      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        messages: [{
          role: 'user',
          content: `Analyze this news reading pattern and provide a bias profile. Reading distribution: ${JSON.stringify(biasCount)}. Respond in JSON: {"dominant_bias":"center|left|right|etc","diversity_score":0-100,"blind_spots":["list"],"recommendation":"brief tip"}`,
        }],
      });

      const text = response.content[0].type === 'text' ? response.content[0].text : '{}';
      let parsed: Record<string, unknown> = {};
      try { parsed = JSON.parse(text.replace(/```json\n?|\n?```/g, '')); } catch { /* keep empty */ }
      res.json({ bias_distribution: biasCount, ...parsed });
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  return router;
}
