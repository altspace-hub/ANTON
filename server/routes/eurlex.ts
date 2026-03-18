import { Router } from 'express';
import https from 'https';
import type { DatabaseAdapter } from '../db/database.js';

import Anthropic from '@anthropic-ai/sdk';
import { streamChat, mapModelToProvider } from '../services/provider-router.js';

// Known regulation shortcuts
const REGULATION_LOOKUP: Record<string, { title: string; celexNumber: string }> = {
  'AMLR': { title: 'Anti-Money Laundering Regulation 2024/1624', celexNumber: '32024R1624' },
  'AMLR 2024': { title: 'Anti-Money Laundering Regulation 2024/1624', celexNumber: '32024R1624' },
  'DORA': { title: 'Digital Operational Resilience Act 2022/2554', celexNumber: '32022R2554' },
  '6AMLD': { title: 'Sixth Anti-Money Laundering Directive 2018/1673', celexNumber: '32018L1673' },
  'MiCA': { title: 'Markets in Crypto-Assets Regulation 2023/1114', celexNumber: '32023R1114' },
  'GDPR': { title: 'General Data Protection Regulation 2016/679', celexNumber: '32016R0679' },
  'PSD2': { title: 'Payment Services Directive 2015/2366', celexNumber: '32015L2366' },
  'NIS2': { title: 'Network and Information Security Directive 2022/2555', celexNumber: '32022L2555' },
  'AMLA': { title: 'Anti-Money Laundering Authority Regulation 2024/1620', celexNumber: '32024R1620' },
  'CRR': { title: 'Capital Requirements Regulation 575/2013', celexNumber: '32013R0575' },
  'CRD': { title: 'Capital Requirements Directive 2013/36', celexNumber: '32013L0036' },
  'MLD4': { title: 'Fourth Anti-Money Laundering Directive 2015/849', celexNumber: '32015L0849' },
  'MLD5': { title: 'Fifth Anti-Money Laundering Directive 2018/843', celexNumber: '32018L0843' },
};

function buildEurLexUrl(celexNumber: string): string {
  return `https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:${celexNumber}`;
}

async function fetchEurLexText(celexNumber: string): Promise<string> {
  const url = buildEurLexUrl(celexNumber);
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': 'openEXPERT/1.0 (research tool)' } }, (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => (data += chunk));
        res.on('end', () => {
          // Strip HTML tags for plain text
          const text = data
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s{2,}/g, ' ')
            .trim()
            .slice(0, 50000); // limit to 50k chars
          resolve(text);
        });
        res.on('error', reject);
      })
      .on('error', reject);
  });
}

export async function createEurLexRoutes(db?: DatabaseAdapter, anthropic?: Anthropic) {
  const router = Router();

  // GET /api/eurlex/lookup?q=AMLR — find a regulation by shorthand
  router.get('/eurlex/lookup', async (req, res) => {
    const q = String(req.query.q || '')
      .toUpperCase()
      .trim();
    const matches = Object.entries(REGULATION_LOOKUP)
      .filter(([key]) => key.includes(q) || q.includes(key))
      .map(([key, val]) => ({
        shorthand: key,
        title: val.title,
        celexNumber: val.celexNumber,
        url: buildEurLexUrl(val.celexNumber),
      }));
    res.json(matches);
  });

  // GET /api/eurlex/list — list all known regulations
  router.get('/eurlex/list', async (_req, res) => {
    const list = Object.entries(REGULATION_LOOKUP).map(([shorthand, val]) => ({
      shorthand,
      title: val.title,
      celexNumber: val.celexNumber,
      url: buildEurLexUrl(val.celexNumber),
    }));
    res.json(list);
  });

  // POST /api/eurlex/fetch — fetch full text of a regulation by CELEX number
  router.post('/eurlex/fetch', async (req, res) => {
    const { celexNumber } = req.body as { celexNumber: string };
    if (!celexNumber || !/^\d{5}[A-Z]\d{4}/.test(celexNumber)) {
      res.status(400).json({ error: 'Valid CELEX number required (e.g. 32024R1624)' });
      return;
    }
    try {
      const text = await fetchEurLexText(celexNumber);
      const url = buildEurLexUrl(celexNumber);
      res.json({ celexNumber, url, text, chars: text.length });
    } catch {
      res.status(502).json({ error: 'Failed to fetch from EUR-Lex. Check your internet connection.' });
    }
  });

  /**
   * POST /api/eurlex/validate-pack — DATA-08
   * Fetches EUR-Lex official text and uses Claude to systematically validate
   * the entities in an active knowledge pack against the official regulatory text.
   *
   * Body: { packId: string, celexNumber?: string }
   * Streams SSE: { type: 'progress'|'finding'|'summary'|'done', ... }
   */
  router.post('/eurlex/validate-pack', async (req, res) => {
    if (!db || !anthropic) {
      res.status(503).json({ error: 'Database and AI service required for validation' });
      return;
    }

    const { packId, celexNumber } = req.body as { packId?: string; celexNumber?: string };
    if (!packId) {
      res.status(400).json({ error: 'packId is required' });
      return;
    }

    // Load pack metadata
    const pack = await db.get('SELECT * FROM knowledge_packs WHERE id = ?', packId) as Record<string, unknown> | undefined;
    if (!pack) {
      res.status(404).json({ error: 'Knowledge pack not found' });
      return;
    }

    // Resolve CELEX number: from request or from pack regulation_ids
    let celex = celexNumber;
    if (!celex) {
      const regIds = JSON.parse((pack.regulation_ids as string) || '[]') as string[];
      const firstReg = regIds[0] || '';
      const match = Object.values(REGULATION_LOOKUP).find(r =>
        regIds.some(id => r.title.toLowerCase().includes(id.toLowerCase()) || id.includes(r.celexNumber))
      );
      if (!match && !firstReg) {
        res.status(400).json({ error: 'Could not determine CELEX number for this pack. Provide celexNumber explicitly.' });
        return;
      }
      celex = match?.celexNumber ?? '';
    }

    if (celex && !/^\d{5}[A-Z]\d{4}/.test(celex)) {
      res.status(400).json({ error: 'Invalid CELEX number format' });
      return;
    }

    // Set up SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const send = (data: unknown) => {
      if (!res.destroyed) res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
      // Step 1: Fetch EUR-Lex text
      send({ type: 'progress', message: `Fetching EUR-Lex text for CELEX ${celex}…` });
      let eurLexText = '';
      if (celex) {
        try {
          eurLexText = await fetchEurLexText(celex);
          send({ type: 'progress', message: `Fetched ${eurLexText.length.toLocaleString()} characters from EUR-Lex` });
        } catch {
          send({ type: 'progress', message: 'EUR-Lex fetch failed — validation will use Claude knowledge only' });
        }
      }

      // Step 2: Load pack entities
      const entities = await db.all(
        `SELECT entity_type, entity_id, canonical_name, metadata
         FROM entity_nodes WHERE pack_id = ? ORDER BY entity_type, canonical_name LIMIT 200`
      , packId) as Array<{ entity_type: string; entity_id: string; canonical_name: string; metadata: string }>;

      send({ type: 'progress', message: `Validating ${entities.length} entities from pack "${pack.display_name}"…` });

      // Step 3: Stream validation via Claude
      const entitySummary = entities.slice(0, 100).map(e => {
        const meta = (() => { try { return JSON.parse(e.metadata || '{}'); } catch { return {}; } })();
        return `- ${e.entity_id} (${e.entity_type}): "${e.canonical_name}" — ${meta.description?.slice(0, 150) || 'no description'}`;
      }).join('\n');

      const systemPrompt = `You are a senior EU regulatory expert validating a structured knowledge graph against the official EUR-Lex regulatory text.

Your task:
1. For each entity in the knowledge pack, verify that:
   - The entity ID correctly corresponds to the article/concept in the official text
   - The canonical_name accurately represents the article or concept
   - Any description metadata is factually correct
2. Flag discrepancies as CRITICAL (wrong article number/content), MODERATE (misleading label), or MINOR (style/wording)
3. Note missing important articles or concepts
4. Confirm correct entries as VALID

Format each finding as:
**[ENTITY_ID]** — [VALID|CRITICAL|MODERATE|MINOR]: [explanation]

After all findings, provide a SUMMARY section with:
- Total entities validated
- Count by status
- Top 3 most important corrections needed`;

      const userMessage = `Validate this knowledge pack against the regulatory text.

PACK: ${pack.display_name}
CELEX: ${celex || 'not available — use your knowledge'}

ENTITIES TO VALIDATE:
${entitySummary}

${eurLexText ? `OFFICIAL EUR-LEX TEXT (first 40,000 chars):\n${eurLexText.slice(0, 40000)}` : 'No EUR-Lex text available — validate using your knowledge of the regulation.'}`;

      const result = await streamChat({
        model: mapModelToProvider('claude-sonnet-4-5-20250929'),
        maxTokens: 8192,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }, res);

      const fullText = result.text;

      // Parse findings summary
      const criticalCount = (fullText.match(/CRITICAL:/g) || []).length;
      const moderateCount = (fullText.match(/MODERATE:/g) || []).length;
      const minorCount = (fullText.match(/MINOR:/g) || []).length;
      const validCount = (fullText.match(/VALID:/g) || []).length;

      // Store validation record
      try {
        await db.run(`
          UPDATE knowledge_packs
          SET description = description || ' [Validated vs EUR-Lex ' || CURRENT_DATE::TEXT || ']'
          WHERE id = ?
        `, packId);
      } catch { /* non-critical */ }

      send({
        type: 'summary',
        packId,
        entitiesChecked: entities.length,
        critical: criticalCount,
        moderate: moderateCount,
        minor: minorCount,
        valid: validCount,
        validatedAt: new Date().toISOString(),
      });
      send({ type: 'done' });
    } catch (error: unknown) {
      send({ type: 'error', message: error instanceof Error ? error.message : 'Validation failed' });
    } finally {
      res.end();
    }
  });

  return router;
}
