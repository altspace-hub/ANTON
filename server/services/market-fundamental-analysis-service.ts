import type { DatabaseAdapter } from '../db/database.js';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function createMarketFundamentalAnalysisService(db: DatabaseAdapter) {

  function readPrompt(name: string): string {
    try { return readFileSync(path.join(__dirname, '..', 'prompts', `${name}.md`), 'utf-8'); }
    catch { return 'You are a senior equity research analyst. Analyze the financial data and return JSON.'; }
  }

  async function analyzeCompany(symbol: string): Promise<{ noteId: string; headline: string; rating: number; atomsCreated: number } | null> {
    // Gather all fundamental data for this symbol
    const income = await db.get<{ content: string }>(
      "SELECT content FROM market_data_raw WHERE symbol = ? AND data_type = 'income_statement' ORDER BY fetched_at DESC LIMIT 1", symbol
    );
    const ratios = await db.get<{ content: string }>(
      "SELECT content FROM market_data_raw WHERE symbol = ? AND data_type = 'ratios' ORDER BY fetched_at DESC LIMIT 1", symbol
    );
    const metrics = await db.get<{ content: string }>(
      "SELECT content FROM market_data_raw WHERE symbol = ? AND data_type = 'key_metrics' ORDER BY fetched_at DESC LIMIT 1", symbol
    );
    const estimates = await db.get<{ content: string }>(
      "SELECT content FROM market_data_raw WHERE symbol = ? AND data_type = 'analyst_estimates' ORDER BY fetched_at DESC LIMIT 1", symbol
    );

    if (!income && !ratios) return null;

    // Build context for Claude
    let context = `## ${symbol} Financial Data\n\n`;
    if (income) context += `### Income Statement\n${income.content.slice(0, 4000)}\n\n`;
    if (ratios) context += `### Financial Ratios\n${ratios.content.slice(0, 3000)}\n\n`;
    if (metrics) context += `### Key Metrics\n${metrics.content.slice(0, 3000)}\n\n`;
    if (estimates) context += `### Analyst Estimates\n${estimates.content.slice(0, 2000)}\n\n`;

    // Deep analysis on the configured markets model (Settings → "Markets AI
    // model", falls back to the utility model).
    const prompt = readPrompt('market-fundamental-analyst');
    const { callChat } = await import('./provider-router.js');
    const { getMarketsModel } = await import('./markets-model-store.js');
    const result = await callChat({
      model: await getMarketsModel(db),
      system: prompt,
      messages: [{ role: 'user', content: `Analyze ${symbol}:\n\n${context}` }],
      maxTokens: 4096,
      // Runs as a scheduled batch (up to 8 symbols per pass), so it yields a
      // subscription slot rather than competing with whoever is at the keyboard.
      background: true,
    });

    // Parse the response
    const cleaned = result.text.trim().replace(/^```json\s*/i, '').replace(/```\s*$/, '');
    let analysis: {
      headline: string; analystRating: number; ratingRationale: string;
      trendAssessment: string; valuationContext: string;
      positives: string[]; concerns: string[]; keyMonitorPoints: string[];
      red_flags?: string[];
      atoms?: Array<{ content: string; atom_type: string; confidence: number; sentiment: string; importance_score: number }>;
    };

    try {
      analysis = JSON.parse(cleaned);
    } catch {
      console.error(`[fundamental-analysis] Failed to parse analysis for ${symbol}`);
      return null;
    }

    // Determine report period from income data
    let reportPeriod = 'Latest';
    try {
      const incData = JSON.parse(income?.content ?? '[]');
      const latest = Array.isArray(incData) ? incData[0] : incData;
      if (latest?.calendarYear && latest?.period) reportPeriod = `${latest.period} ${latest.calendarYear}`;
    } catch {}

    // Store analyst note
    const noteId = `an_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await db.run(`
      INSERT INTO market_analyst_notes (id, symbol, report_period, headline, full_analysis, analyst_rating, red_flags)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, noteId, symbol, reportPeriod, analysis.headline ?? `${symbol} analysis`,
       JSON.stringify(analysis), analysis.analystRating ?? 3, JSON.stringify(analysis.red_flags ?? []));

    // Create atoms from the analysis
    let atomsCreated = 0;
    const { createMarketAtomService } = await import('./market-atom-service.js');
    const atomSvc = await createMarketAtomService(db);

    // Create atoms from the analysis.atoms array
    if (analysis.atoms) {
      for (const a of analysis.atoms.slice(0, 6)) {
        try {
          await atomSvc.createAtom({
            content: a.content,
            atomType: a.atom_type ?? 'fact',
            confidence: a.confidence ?? 0.85,
            category: 'equity',
            subcategory: 'fundamental',
            sentiment: a.sentiment ?? 'neutral',
            importanceScore: a.importance_score ?? 55,
            horizon: 'this_year',
            decayRate: 0.01,
            entities: [{ type: 'company', id: symbol, name: symbol }],
            tags: ['fundamental', 'analyst_note'],
          });
          atomsCreated++;
        } catch {}
      }
    }

    // Create headline atom
    await atomSvc.createAtom({
      content: `${symbol} ${reportPeriod}: ${analysis.headline}`,
      atomType: 'insight',
      confidence: 0.85,
      category: 'equity',
      subcategory: 'fundamental',
      sentiment: (analysis.analystRating ?? 3) >= 4 ? 'bullish' : (analysis.analystRating ?? 3) <= 2 ? 'bearish' : 'neutral',
      importanceScore: 70,
      horizon: 'this_year',
      decayRate: 0.01,
      entities: [{ type: 'company', id: symbol, name: symbol }],
      tags: ['fundamental', 'headline'],
    });
    atomsCreated++;

    return { noteId, headline: analysis.headline, rating: analysis.analystRating ?? 3, atomsCreated };
  }

  async function getAnalystNotes(symbol?: string, limit = 20) {
    if (symbol) {
      return await db.all('SELECT * FROM market_analyst_notes WHERE symbol = ? ORDER BY created_at DESC LIMIT ?', symbol, limit);
    }
    return await db.all('SELECT * FROM market_analyst_notes ORDER BY created_at DESC LIMIT ?', limit);
  }

  async function getSymbolsWithNewData(): Promise<string[]> {
    const rows = await db.all<{ symbol: string }>(
      "SELECT DISTINCT symbol FROM market_data_raw WHERE is_processed = 0 AND data_type IN ('income_statement', 'ratios', 'key_metrics') AND symbol IS NOT NULL"
    );
    return rows.map(r => r.symbol);
  }

  async function runBatchAnalysis(maxSymbols = 5): Promise<{ analyzed: number; atomsCreated: number }> {
    const symbols = await getSymbolsWithNewData();
    let totalAtoms = 0;
    let analyzed = 0;
    for (const symbol of symbols.slice(0, maxSymbols)) {
      const result = await analyzeCompany(symbol);
      if (result) {
        totalAtoms += result.atomsCreated;
        analyzed++;
      }
    }
    return { analyzed, atomsCreated: totalAtoms };
  }

  return { analyzeCompany, getAnalystNotes, getSymbolsWithNewData, runBatchAnalysis };
}

export type MarketFundamentalAnalysisService = Awaited<ReturnType<typeof createMarketFundamentalAnalysisService>>;
