import { Router } from 'express';
import https from 'https';

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

export function createEurLexRoutes() {
  const router = Router();

  // GET /api/eurlex/lookup?q=AMLR — find a regulation by shorthand
  router.get('/eurlex/lookup', (req, res) => {
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
  router.get('/eurlex/list', (_req, res) => {
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

  return router;
}
