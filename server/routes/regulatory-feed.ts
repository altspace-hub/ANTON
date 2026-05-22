/**
 * LONE-07/18: Regulatory Feed — subscribe to key regulatory sources and generate AI digests.
 *
 * Routes:
 *   GET  /api/regulatory-feed/sources          — list all available sources
 *   GET  /api/regulatory-feed/subscriptions    — user's active subscriptions
 *   POST /api/regulatory-feed/subscriptions    — add subscription
 *   DELETE /api/regulatory-feed/subscriptions/:id — remove subscription
 *   POST /api/regulatory-feed/digest           — generate digest via Claude (SSE)
 *   GET  /api/regulatory-feed/digests          — past digest history
 *   GET  /api/regulatory-feed/digests/:id      — single digest
 */

import { Router } from 'express';
import type { DatabaseAdapter } from '../db/database.js';

import type Anthropic from '@anthropic-ai/sdk';
import crypto from 'crypto';
import { streamChat, mapModelToProvider } from '../services/provider-router.js';

// ── Hardcoded source catalogue ──────────────────────────────────────────────

export const REGULATORY_SOURCES = [
  // EU
  { id: 'eba',       name: 'EBA (European Banking Authority)',        url: 'https://www.eba.europa.eu/publications-and-research/news-and-press',  category: 'eu',    description: 'Regulatory standards, guidelines, opinions for EU banks' },
  { id: 'esma',      name: 'ESMA (European Securities Authority)',    url: 'https://www.esma.europa.eu/press-news/esma-news',                    category: 'eu',    description: 'Capital markets regulation, MiFID II, EMIR' },
  { id: 'eiopa',     name: 'EIOPA (Insurance & Pensions)',            url: 'https://www.eiopa.europa.eu/latest-news_en',                         category: 'eu',    description: 'Solvency II, IORP, pension regulation' },
  { id: 'eurlex_aml',name: 'EUR-Lex — AML/CFT Legislation',          url: 'https://eur-lex.europa.eu/search.html?type=advanced&DTS_SUBDOM=EU_REGISTER&DTS_DOM=LEGISLATION&SUBDOM_INIT=LEGISLATION&DTA=2024&DD_YEAR=2024&sortOne=DD&sortOneOrder=desc&INCLUDE_CASELAW_BULLETIN=true', category: 'eu', description: 'AMLR, AMLD6, AMLA regulation texts on EUR-Lex' },
  { id: 'amla',      name: 'AMLA (Anti-Money Laundering Authority)', url: 'https://www.amla.europa.eu/news',                                    category: 'eu',    description: 'Direct supervision, RTS/ITS consultations from new AMLA' },
  { id: 'ecb_sup',   name: 'ECB Banking Supervision',                url: 'https://www.bankingsupervision.europa.eu/press/publications/html/index.en.html', category: 'eu', description: 'SSM supervisory expectations, SREP, governance' },
  { id: 'fsb',       name: 'FSB (Financial Stability Board)',        url: 'https://www.fsb.org/publications/',                                  category: 'global', description: 'G20 financial stability standards, TBTF, crypto' },
  // FATF
  { id: 'fatf',      name: 'FATF (Financial Action Task Force)',     url: 'https://www.fatf-gafi.org/publications.html',                        category: 'fatf',  description: '40 Recommendations, mutual evaluations, guidance' },
  { id: 'fatf_vasp', name: 'FATF — VASP / Crypto Guidance',         url: 'https://www.fatf-gafi.org/recommendations/guidance-notes-for-a-risk-based-approach/guidance-for-a-risk-based-approach-virtual-assets-and-virtual-asset-service-providers.html', category: 'fatf', description: 'Travel Rule, VASP risk-based approach' },
  // Basel / BIS
  { id: 'bcbs',      name: 'BCBS (Basel Committee)',                 url: 'https://www.bis.org/bcbs/',                                          category: 'basel', description: 'Basel IV, pillar 2, operational risk standards' },
  { id: 'bis',       name: 'BIS Working Papers',                    url: 'https://www.bis.org/publications/work.htm',                          category: 'basel', description: 'Research and policy papers from Bank for International Settlements' },
  // Nordic / National
  { id: 'fi_se',     name: 'Finansinspektionen (Sweden)',            url: 'https://www.fi.se/en/our-registers/our-registers/news-releases-and-publications/publications/', category: 'nordic', description: 'Swedish FSA — regulations, supervisory decisions' },
  { id: 'fsa_fi',    name: 'FIN-FSA (Finland)',                     url: 'https://www.finanssivalvonta.fi/en/press-releases/',                  category: 'nordic', description: 'Finnish FSA — regulations and circulars' },
  { id: 'finanstilsynet_no', name: 'Finanstilsynet (Norway)',        url: 'https://www.finanstilsynet.no/en/news/',                             category: 'nordic', description: 'Norwegian FSA — AML circulars and guidance' },
  { id: 'finanstilsynet_dk', name: 'Finanstilsynet (Denmark)',       url: 'https://www.finanstilsynet.dk/Nyheder-og-Presse/Nyheder',            category: 'nordic', description: 'Danish FSA — regulations and enforcement' },
  // UK
  { id: 'fca',       name: 'FCA (UK Financial Conduct Authority)',   url: 'https://www.fca.org.uk/news/publications',                           category: 'uk',    description: 'UK AML, consumer duty, SMCR, crypto registration' },
  { id: 'hmtreasury',name: 'HM Treasury — AML',                     url: 'https://www.gov.uk/government/collections/anti-money-laundering-and-counter-terrorist-financing', category: 'uk', description: 'UK AML regime updates, national risk assessment' },
  // IOSCO
  { id: 'iosco',     name: 'IOSCO',                                  url: 'https://www.iosco.org/news/pubdocs/',                                 category: 'iosco', description: 'Securities regulation, ESG, crypto standards' },
] as const;

// ── Route factory ────────────────────────────────────────────────────────────

export async function createRegulatoryFeedRoutes(db: DatabaseAdapter, anthropic: Anthropic | null | undefined) {
  const router = Router();

  // GET /api/regulatory-feed/sources
  router.get('/regulatory-feed/sources', async (_req, res) => {
    return res.json(REGULATORY_SOURCES);
  });

  // GET /api/regulatory-feed/subscriptions
  router.get('/regulatory-feed/subscriptions', async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorised' });
      const rows = await db.all(
        `SELECT * FROM regulatory_feed_subscriptions WHERE user_id = ? AND active = 1 ORDER BY created_at DESC`
      , userId);
      return res.json(rows);
    } catch (err) {
      console.error('[regulatory-feed/subscriptions GET]', err);
      return res.status(500).json({ error: 'Internal error' });
    }
  });

  // POST /api/regulatory-feed/subscriptions
  router.post('/regulatory-feed/subscriptions', async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorised' });

      const { source_id } = req.body as { source_id?: string };
      if (!source_id) return res.status(400).json({ error: 'source_id required' });

      const source = REGULATORY_SOURCES.find(s => s.id === source_id);
      if (!source) return res.status(400).json({ error: `Unknown source: ${source_id}` });

      const id = crypto.randomUUID();
      await db.run(
        `INSERT INTO regulatory_feed_subscriptions (id, user_id, source_id, source_name, source_url, category)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, source_id) DO UPDATE SET active = 1`
      , id, userId, source.id, source.name, source.url, source.category);

      return res.json({ ok: true, id });
    } catch (err) {
      console.error('[regulatory-feed/subscriptions POST]', err);
      return res.status(500).json({ error: 'Internal error' });
    }
  });

  // DELETE /api/regulatory-feed/subscriptions/:id
  router.delete('/regulatory-feed/subscriptions/:id', async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorised' });
      await db.run(
        `UPDATE regulatory_feed_subscriptions SET active = 0 WHERE id = ? AND user_id = ?`
      , req.params.id, userId);
      return res.json({ ok: true });
    } catch (err) {
      console.error('[regulatory-feed/subscriptions DELETE]', err);
      return res.status(500).json({ error: 'Internal error' });
    }
  });

  // POST /api/regulatory-feed/digest  (SSE streaming)
  // Body: { source_ids?: string[], period?: '7d'|'30d', focus?: string }
  router.post('/regulatory-feed/digest', async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorised' });

      const { source_ids, period = '7d', focus } = req.body as {
        source_ids?: string[];
        period?: '7d' | '30d';
        focus?: string;
      };

      // Resolve sources to include
      let sources: typeof REGULATORY_SOURCES[number][];
      if (source_ids && source_ids.length > 0) {
        sources = REGULATORY_SOURCES.filter(s => source_ids.includes(s.id));
      } else {
        // Use subscribed sources
        const subs = await db.get(`SELECT source_id FROM regulatory_feed_subscriptions WHERE user_id = ? AND active = 1`
        , userId) as { source_id: string }[];
        const subscribedIds = subs.map(s => s.source_id);
        sources = REGULATORY_SOURCES.filter(s => subscribedIds.includes(s.id));
      }

      if (sources.length === 0) {
        return res.status(400).json({ error: 'No sources selected. Subscribe to sources first or pass source_ids.' });
      }

      const periodLabel = period === '30d' ? 'the past 30 days' : 'the past 7 days';
      const sourceList = sources.map(s => `- **${s.name}** (${s.url})\n  ${s.description}`).join('\n');
      const focusSection = focus ? `\n\n## Custom Focus\n${focus}` : '';

      const systemPrompt = `You are a senior regulatory intelligence analyst specialising in financial crime prevention, AML/CFT, and financial regulation across EU, Nordic, UK, and global jurisdictions.

Your task is to produce a **Regulatory Feed Digest** — a structured, actionable briefing for FCP compliance professionals and senior advisors.

## Digest Structure
1. **Executive Summary** (3–5 bullet points — the most critical developments)
2. **Key Developments by Source** — for each source, summarise new publications, consultations, enforcement actions
3. **Implementation Deadlines** — upcoming deadlines and application dates
4. **Action Items** — what compliance teams should do now (prioritised: Critical / Important / Watch)
5. **Horizon Scanning** — expected developments in the next 30–90 days

## Quality Standards
- Cite specific document titles, article numbers, and publication dates when known
- Distinguish between final rules (binding), consultations (draft), and guidance (non-binding)
- Flag where EU requirements have Nordic/UK equivalents or divergences
- Use RAG indicators: 🔴 Critical action required | 🟡 Monitor closely | 🟢 Informational
- Be specific — avoid vague summaries. Compliance professionals need actionable intelligence.`;

      const userPrompt = `Please generate a Regulatory Feed Digest covering **${periodLabel}** for the following sources:

${sourceList}${focusSection}

Use your knowledge of these regulatory bodies and their recent activities. For each source, identify the most significant publications, consultations, supervisory guidance, and enforcement actions from ${periodLabel}.

Structure the digest clearly so a compliance officer can immediately identify what requires action.`;

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const hasProvider = !!(process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY || process.env.GOOGLE_API_KEY || process.env.MISTRAL_API_KEY || process.env.OLLAMA_BASE_URL);
      if (!hasProvider) { res.status(503).json({ error: 'No AI provider configured' }); return; }

      const result = await streamChat({
        model: mapModelToProvider('claude-sonnet-4-6'),
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        maxTokens: 4096,
      }, res);

      const fullText = result.text;
      const inputTokens = result.inputTokens;
      const outputTokens = result.outputTokens;

      // Persist digest
      try {
        const digestId = crypto.randomUUID();
        const now = new Date().toISOString();
        const periodFrom = new Date(Date.now() - (period === '30d' ? 30 : 7) * 86_400_000).toISOString();
        await db.run(`INSERT INTO regulatory_feed_digests (id, user_id, title, content, sources, period_from, period_to, token_count, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        , 
          digestId, userId,
          `Regulatory Feed Digest — ${new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' })}`,
          fullText,
          JSON.stringify(sources.map(s => s.id)),
          periodFrom,
          now,
          inputTokens + outputTokens,
          now
        );
        res.write(`data: ${JSON.stringify({ type: 'done', digestId, tokenCount: inputTokens + outputTokens })}\n\n`);
      } catch (err) {
        res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
      }

      res.end();
    } catch (err) {
      console.error('[regulatory-feed/digest]', err);
      if (!res.headersSent) return res.status(500).json({ error: 'Digest generation failed' });
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'Digest generation failed' })}\n\n`);
      res.end();
    }
  });

  // GET /api/regulatory-feed/digests
  router.get('/regulatory-feed/digests', async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorised' });

      const rows = await db.all(
        `SELECT * FROM regulatory_feed_digests WHERE user_id = ? ORDER BY created_at DESC`
      , userId);
      return res.json(rows.map((r: Record<string, unknown>) => ({
        ...r,
        sources: JSON.parse((r.sources as string) || '[]'),
      })));
    } catch (err) {
      console.error('[regulatory-feed/digests GET]', err);
      return res.status(500).json({ error: 'Internal error' });
    }
  });

  // GET /api/regulatory-feed/digests/:id
  router.get('/regulatory-feed/digests/:id', async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorised' });

      const row = await db.get<Record<string, unknown>>(
        `SELECT * FROM regulatory_feed_digests WHERE id = ? AND user_id = ?`
      , String(req.params.id), userId);
      if (!row) return res.status(404).json({ error: 'Digest not found' });
      return res.json({ ...row, sources: JSON.parse((row.sources as string) || '[]') });
    } catch (err) {
      console.error('[regulatory-feed/digests/:id]', err);
      return res.status(500).json({ error: 'Internal error' });
    }
  });

  return router;
}
