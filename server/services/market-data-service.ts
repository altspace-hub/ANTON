import type { DatabaseAdapter } from '../db/database.js';
import { dateOffsetLiteral } from '../db/dialect-helpers.js';

// ── Types ────────────────────────────────────────────────────────────────────

interface MarketDataSourceRow {
  id: string;
  name: string;
  source_type: string;
  provider: string;
  config: string;
  fetch_interval_hours: number;
  is_active: number;
  last_fetch_at: string | null;
  last_fetch_status: string | null;
  last_fetch_error: string | null;
  items_fetched_total: number;
  quality_score: number;
  created_at: string;
  updated_at: string;
}

interface MarketDataRawRow {
  id: string;
  source_id: string;
  data_type: string;
  symbol: string | null;
  title: string | null;
  content: string | null;
  published_at: string | null;
  fetched_at: string;
  metadata: string;
  is_processed: number;
}

interface WatchlistRow {
  id: string;
  symbol: string;
  name: string;
  asset_type: string;
  notes: string | null;
  alert_config: string;
  is_active: number;
  created_at: string;
  updated_at: string;
}

// ── Factory ──────────────────────────────────────────────────────────────────

export async function createMarketDataService(db: DatabaseAdapter) {

  // ── FMP Rate Limiter (per-minute sliding window) ──────────────────────────
  const fmpCallTimestamps: number[] = [];
  const FMP_RATE_LIMIT = 280; // Leave margin under 300/min
  const FMP_WINDOW_MS = 60_000;

  async function waitForFmpSlot(): Promise<void> {
    const now = Date.now();
    while (fmpCallTimestamps.length > 0 && fmpCallTimestamps[0]! < now - FMP_WINDOW_MS) {
      fmpCallTimestamps.shift();
    }
    if (fmpCallTimestamps.length >= FMP_RATE_LIMIT) {
      const waitMs = fmpCallTimestamps[0]! + FMP_WINDOW_MS - now + 100;
      await new Promise(r => setTimeout(r, waitMs));
    }
    fmpCallTimestamps.push(Date.now());
  }

  // ── Data Sources CRUD ────────────────────────────────────────────────────

  async function getSources(activeOnly = true) {
    const where = activeOnly ? 'WHERE is_active = 1' : 'WHERE 1=1';
    return await db.all<MarketDataSourceRow>(`SELECT * FROM market_data_sources ${where} ORDER BY name`);
  }

  async function getSource(id: string) {
    return await db.get<MarketDataSourceRow>('SELECT * FROM market_data_sources WHERE id = ?', id);
  }

  async function createSource(params: {
    name: string;
    sourceType?: string;
    provider: string;
    config?: Record<string, unknown>;
    fetchIntervalHours?: number;
  }) {
    const id = `mds_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await db.run(`
      INSERT INTO market_data_sources (id, name, source_type, provider, config, fetch_interval_hours)
      VALUES (?, ?, ?, ?, ?, ?)
    `, id, params.name, params.sourceType ?? 'api', params.provider,
       JSON.stringify(params.config ?? {}), params.fetchIntervalHours ?? 6);
    return id;
  }

  async function updateSource(id: string, updates: {
    name?: string;
    sourceType?: string;
    provider?: string;
    config?: Record<string, unknown>;
    fetchIntervalHours?: number;
    isActive?: boolean;
  }) {
    const fields: string[] = [];
    const args: unknown[] = [];

    if (updates.name !== undefined) { fields.push('name = ?'); args.push(updates.name); }
    if (updates.sourceType !== undefined) { fields.push('source_type = ?'); args.push(updates.sourceType); }
    if (updates.provider !== undefined) { fields.push('provider = ?'); args.push(updates.provider); }
    if (updates.config !== undefined) { fields.push('config = ?'); args.push(JSON.stringify(updates.config)); }
    if (updates.fetchIntervalHours !== undefined) { fields.push('fetch_interval_hours = ?'); args.push(updates.fetchIntervalHours); }
    if (updates.isActive !== undefined) { fields.push('is_active = ?'); args.push(updates.isActive ? 1 : 0); }

    if (fields.length === 0) return;
    fields.push("updated_at = NOW()");
    args.push(id);

    await db.run(`UPDATE market_data_sources SET ${fields.join(', ')} WHERE id = ?`, ...args);
  }

  async function deleteSource(id: string) {
    await db.run('DELETE FROM market_data_sources WHERE id = ?', id);
  }

  // ── Raw Data ─────────────────────────────────────────────────────────────

  async function ingestRawData(params: {
    sourceId: string;
    dataType: string;
    symbol?: string;
    title?: string;
    content: string;
    publishedAt?: string;
    metadata?: Record<string, unknown>;
  }) {
    const id = `mdr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await db.run(`
      INSERT INTO market_data_raw (id, source_id, data_type, symbol, title, content, published_at, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT DO NOTHING
    `, id, params.sourceId, params.dataType,
       params.symbol ?? null, params.title ?? null, params.content,
       params.publishedAt ?? null, JSON.stringify(params.metadata ?? {}));

    // Normalize price data into standard schema
    if (params.dataType === 'price' && params.symbol && params.publishedAt) {
      await normalizePrice(id, params.sourceId, params.symbol, params.publishedAt, params.content);
    }

    return id;
  }

  async function normalizePrice(rawId: string, sourceId: string, symbol: string, priceDate: string, content: string): Promise<void> {
    try {
      const data = JSON.parse(content);
      const open = Number(data.open ?? data['1. open'] ?? data.o ?? null) || null;
      const high = Number(data.high ?? data['2. high'] ?? data.h ?? null) || null;
      const low = Number(data.low ?? data['3. low'] ?? data.l ?? null) || null;
      const close = Number(data.close ?? data['4. close'] ?? data.c ?? null) || null;
      const adjustedClose = Number(data.adjusted_close ?? data['5. adjusted close'] ?? data.adjClose ?? close) || null;
      const volume = parseInt(data.volume ?? data['5. volume'] ?? data.v ?? '0', 10) || null;

      const normId = `mpn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      await db.run(`
        INSERT INTO market_price_normalized (id, symbol, price_date, open, high, low, close, adjusted_close, volume, source_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT DO NOTHING
      `, normId, symbol, priceDate, open, high, low, close, adjustedClose, volume, sourceId);
    } catch {
      // Non-fatal: price normalization is best-effort
    }
  }

  async function getUnprocessedRawData(limit = 50) {
    return await db.all<MarketDataRawRow>(
      'SELECT * FROM market_data_raw WHERE is_processed = 0 ORDER BY fetched_at ASC LIMIT ?', limit
    );
  }

  async function markRawDataProcessed(id: string) {
    await db.run('UPDATE market_data_raw SET is_processed = 1 WHERE id = ?', id);
  }

  async function getRawDataStats() {
    const total = await db.get<{ n: number }>("SELECT COUNT(*) as n FROM market_data_raw");
    const unprocessed = await db.get<{ n: number }>("SELECT COUNT(*) as n FROM market_data_raw WHERE is_processed = 0");
    const byType = await db.all<{ data_type: string; count: number }>(
      "SELECT data_type, COUNT(*) as count FROM market_data_raw GROUP BY data_type"
    );
    return {
      total: total?.n ?? 0,
      unprocessed: unprocessed?.n ?? 0,
      byType,
    };
  }

  // ── Watchlist ────────────────────────────────────────────────────────────

  async function getWatchlist(activeOnly = true) {
    const where = activeOnly ? 'WHERE is_active = 1' : 'WHERE 1=1';
    return await db.all<WatchlistRow>(`SELECT * FROM market_watchlist ${where} ORDER BY symbol`);
  }

  async function addToWatchlist(params: {
    symbol: string;
    name: string;
    assetType?: string;
    notes?: string;
    alertConfig?: Record<string, unknown>;
  }) {
    const id = `mw_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await db.run(`
      INSERT INTO market_watchlist (id, symbol, name, asset_type, notes, alert_config)
      VALUES (?, ?, ?, ?, ?, ?)
    `, id, params.symbol, params.name, params.assetType ?? 'equity',
       params.notes ?? null, JSON.stringify(params.alertConfig ?? {}));
    return id;
  }

  async function removeFromWatchlist(id: string) {
    await db.run('DELETE FROM market_watchlist WHERE id = ?', id);
  }

  async function updateWatchlistItem(id: string, updates: {
    notes?: string;
    alertConfig?: Record<string, unknown>;
    isActive?: boolean;
  }) {
    const fields: string[] = [];
    const args: unknown[] = [];

    if (updates.notes !== undefined) { fields.push('notes = ?'); args.push(updates.notes); }
    if (updates.alertConfig !== undefined) { fields.push('alert_config = ?'); args.push(JSON.stringify(updates.alertConfig)); }
    if (updates.isActive !== undefined) { fields.push('is_active = ?'); args.push(updates.isActive ? 1 : 0); }

    if (fields.length === 0) return;
    fields.push("updated_at = NOW()");
    args.push(id);

    await db.run(`UPDATE market_watchlist SET ${fields.join(', ')} WHERE id = ?`, ...args);
  }

  // ── Watchlist Alerts ────────────────────────────────────────────────────
  // Checks recent atom activity and sentiment shifts for watchlist symbols

  async function checkWatchlistAlerts() {
    const watchlistItems = await getWatchlist(true);
    const alerts: Array<{ symbol: string; alertType: string; message: string; atomCount: number }> = [];

    for (const item of watchlistItems) {
      // Count recent atoms (last 24h) mentioning this symbol in entities or content
      const recent24h = await db.all<{ id: string; sentiment: string }>(
        `SELECT id, sentiment FROM market_atoms
         WHERE is_active = 1
         AND created_at >= ${dateOffsetLiteral(db.dialect, 1, 'days')}
         AND (entities LIKE ? OR content LIKE ?)`,
        `%${item.symbol}%`, `%${item.symbol}%`
      );

      const atomCount = recent24h.length;

      // Activity spike alert: 5+ atoms in 24h
      if (atomCount >= 5) {
        alerts.push({
          symbol: item.symbol,
          alertType: 'activity_spike',
          message: `${atomCount} atoms mentioning ${item.symbol} in last 24h — unusual activity`,
          atomCount,
        });
      }

      // Sentiment shift: compare last 7d vs last 24h
      const recent7d = await db.all<{ sentiment: string }>(
        `SELECT sentiment FROM market_atoms
         WHERE is_active = 1
         AND created_at >= ${dateOffsetLiteral(db.dialect, 7, 'days')}
         AND created_at < ${dateOffsetLiteral(db.dialect, 1, 'days')}
         AND sentiment IS NOT NULL
         AND (entities LIKE ? OR content LIKE ?)`,
        `%${item.symbol}%`, `%${item.symbol}%`
      );

      if (recent7d.length >= 3 && recent24h.length >= 2) {
        const score7d = computeSentimentScore(recent7d.map(r => r.sentiment));
        const score24h = computeSentimentScore(recent24h.filter(r => r.sentiment).map(r => r.sentiment));
        const shift = score24h - score7d;

        if (Math.abs(shift) >= 0.4) {
          const direction = shift > 0 ? 'bullish' : 'bearish';
          alerts.push({
            symbol: item.symbol,
            alertType: 'sentiment_shift',
            message: `Sentiment shifted ${direction} for ${item.symbol}: 7d avg=${score7d.toFixed(2)} → 24h=${score24h.toFixed(2)}`,
            atomCount,
          });
        }
      }
    }

    return alerts;
  }

  function computeSentimentScore(sentiments: string[]): number {
    if (sentiments.length === 0) return 0;
    let score = 0;
    for (const s of sentiments) {
      if (s === 'bullish') score += 1;
      else if (s === 'bearish') score -= 1;
      // neutral/mixed = 0
    }
    return score / sentiments.length;
  }

  // ── Fetch from Provider ──────────────────────────────────────────────────
  // Dispatches to the right provider adapter based on source config

  async function fetchFromSource(sourceId: string): Promise<{ itemsIngested: number; error?: string }> {
    const source = await getSource(sourceId);
    if (!source) return { itemsIngested: 0, error: 'Source not found' };

    let config: Record<string, unknown>;
    try { config = JSON.parse(source.config); } catch { config = {}; }

    let itemsIngested = 0;

    try {
      switch (source.provider) {
        case 'alpha_vantage':
          itemsIngested = await fetchAlphaVantage(sourceId, config);
          break;
        case 'finnhub':
          itemsIngested = await fetchFinnhub(sourceId, config);
          break;
        case 'marketaux':
          itemsIngested = await fetchMarketaux(sourceId, config);
          break;
        case 'fmp':
          itemsIngested = await fetchFMP(sourceId, config);
          break;
        case 'eodhd':
          itemsIngested = await fetchEODHD(sourceId, config);
          break;
        case 'rss':
          itemsIngested = await fetchMarketRSS(sourceId, config);
          break;
        default:
          return { itemsIngested: 0, error: `Unknown provider: ${source.provider}` };
      }

      await db.run(`
        UPDATE market_data_sources
        SET last_fetch_at = NOW(), last_fetch_status = 'success',
            last_fetch_error = NULL, items_fetched_total = items_fetched_total + ?,
            updated_at = NOW()
        WHERE id = ?
      `, itemsIngested, sourceId);

      return { itemsIngested };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await db.run(`
        UPDATE market_data_sources
        SET last_fetch_at = NOW(), last_fetch_status = 'error',
            last_fetch_error = ?, updated_at = NOW()
        WHERE id = ?
      `, message, sourceId);
      return { itemsIngested: 0, error: message };
    }
  }

  // ── Provider Adapters ────────────────────────────────────────────────────

  async function fetchAlphaVantage(sourceId: string, config: Record<string, unknown>): Promise<number> {
    const apiKey = config.api_key_env
      ? process.env[config.api_key_env as string]
      : (config.api_key as string | undefined);
    if (!apiKey) throw new Error('Alpha Vantage API key not configured');

    const symbols = (config.symbols as string[] | undefined) ?? [];
    let ingested = 0;

    for (const symbol of symbols) {
      // Alpha Vantage free tier: 5 calls/min — 250ms delay keeps us under 4/sec
      await new Promise(r => setTimeout(r, 250));
      const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${encodeURIComponent(symbol)}&apikey=${apiKey}&outputsize=compact`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Alpha Vantage HTTP ${response.status}`);
      const data = await response.json();

      if (data['Error Message'] || data['Note']) {
        throw new Error(data['Error Message'] || data['Note']);
      }

      const timeSeries = data['Time Series (Daily)'];
      if (!timeSeries) continue;

      for (const [date, values] of Object.entries(timeSeries).slice(0, 5)) {
        await ingestRawData({
          sourceId,
          dataType: 'price',
          symbol,
          title: `${symbol} daily price ${date}`,
          content: JSON.stringify({ date, ...(values as Record<string, string>) }),
          publishedAt: date,
          metadata: { provider: 'alpha_vantage' },
        });
        ingested++;
      }
    }

    return ingested;
  }

  async function fetchFinnhub(sourceId: string, config: Record<string, unknown>): Promise<number> {
    const apiKey = config.api_key_env
      ? process.env[config.api_key_env as string]
      : (config.api_key as string | undefined);
    if (!apiKey) throw new Error('Finnhub API key not configured');

    const symbols = (config.symbols as string[] | undefined) ?? [];
    let ingested = 0;

    // Fetch market news
    const newsUrl = `https://finnhub.io/api/v1/news?category=general&token=${apiKey}`;
    const newsResponse = await fetch(newsUrl);
    if (newsResponse.ok) {
      const newsItems = await newsResponse.json() as Array<{
        id: number; headline: string; summary: string; source: string;
        url: string; datetime: number; category: string; related: string;
      }>;
      for (const item of newsItems.slice(0, 20)) {
        await ingestRawData({
          sourceId,
          dataType: 'news',
          symbol: item.related || null,
          title: item.headline,
          content: JSON.stringify(item),
          publishedAt: new Date(item.datetime * 1000).toISOString(),
          metadata: { provider: 'finnhub', source: item.source },
        });
        ingested++;
      }
    }

    // Fetch quotes for watchlist symbols
    for (const symbol of symbols) {
      const quoteUrl = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${apiKey}`;
      const quoteResponse = await fetch(quoteUrl);
      if (quoteResponse.ok) {
        const quote = await quoteResponse.json();
        await ingestRawData({
          sourceId,
          dataType: 'price',
          symbol,
          title: `${symbol} quote`,
          content: JSON.stringify(quote),
          publishedAt: new Date().toISOString(),
          metadata: { provider: 'finnhub' },
        });
        ingested++;
      }
    }

    return ingested;
  }

  async function fetchMarketaux(sourceId: string, config: Record<string, unknown>): Promise<number> {
    const apiKey = config.api_key_env
      ? process.env[config.api_key_env as string]
      : (config.api_key as string | undefined);
    if (!apiKey) throw new Error('Marketaux API key not configured');

    const url = `https://api.marketaux.com/v1/news/all?api_token=${apiKey}&limit=20&language=en`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Marketaux HTTP ${response.status}`);
    const data = await response.json() as { data: Array<{
      uuid: string; title: string; description: string; snippet: string;
      url: string; published_at: string; source: string; entities: unknown[];
    }> };

    let ingested = 0;
    for (const item of (data.data ?? [])) {
      await ingestRawData({
        sourceId,
        dataType: 'news',
        title: item.title,
        content: JSON.stringify(item),
        publishedAt: item.published_at,
        metadata: { provider: 'marketaux', source: item.source },
      });
      ingested++;
    }

    return ingested;
  }

  // ── FMP (Financial Modeling Prep) ────────────────────────────────────────

  // Persistent rate limit counter via api_rate_limits table
  async function getFmpDailyCount(): Promise<number> {
    try {
      const today = new Date().toISOString().split('T')[0];
      const row = await db.get<{ daily_calls: number; reset_date: string }>(
        "SELECT daily_calls, reset_date FROM api_rate_limits WHERE provider = 'fmp'"
      );
      if (!row) return 0;
      if (row.reset_date !== today) {
        await db.run("UPDATE api_rate_limits SET daily_calls = 0, reset_date = ?, updated_at = NOW() WHERE provider = 'fmp'", today);
        return 0;
      }
      return row.daily_calls;
    } catch {
      return 0; // Table may not exist yet
    }
  }

  async function incrementFmpCount(): Promise<void> {
    try {
      await db.run("UPDATE api_rate_limits SET daily_calls = daily_calls + 1, updated_at = NOW() WHERE provider = 'fmp'");
    } catch {
      // Non-fatal
    }
  }

  async function fetchFMP(sourceId: string, config: Record<string, unknown>): Promise<number> {
    const apiKey = config.api_key_env
      ? process.env[config.api_key_env as string]
      : (config.api_key as string | undefined);
    if (!apiKey) throw new Error('FMP API key not configured (set FMP_API_KEY in .env)');

    const dataType = (config.data_type as string) || 'price';
    const symbols = (config.symbols as string[]) ?? [];
    let ingested = 0;

    if (dataType === 'price') {
      for (const symbol of symbols) {
        await waitForFmpSlot();
        const url = `https://financialmodelingprep.com/stable/historical-price-eod/full?symbol=${encodeURIComponent(symbol)}&apikey=${apiKey}`;
        const response = await fetch(url);
        await incrementFmpCount();
        if (!response.ok) continue;
        const rawData = await response.json() as Array<{ date: string; open: number; high: number; low: number; close: number; volume: number }> | { historical?: Array<{ date: string; open: number; high: number; low: number; close: number; volume: number }> };
        const historical = Array.isArray(rawData) ? rawData : (rawData.historical ?? []);
        for (const day of historical.slice(0, 30)) {
          await ingestRawData({
            sourceId, dataType: 'price', symbol,
            title: `${symbol} ${day.date}`,
            content: JSON.stringify(day),
            publishedAt: day.date,
            metadata: { provider: 'fmp' },
          });
          ingested++;
        }
      }
    } else if (dataType === 'news') {
      // General market news
      await waitForFmpSlot();
      try {
        const url = `https://financialmodelingprep.com/stable/news/general-latest?page=0&limit=50&apikey=${apiKey}`;
        const response = await fetch(url);
        await incrementFmpCount();
        if (response.ok) {
          const items = await response.json() as Array<{ title: string; text: string; publishedDate: string; site: string; symbol: string | null; url: string }>;
          for (const item of items) {
            await ingestRawData({
              sourceId, dataType: 'news', symbol: item.symbol || null,
              title: item.title,
              content: JSON.stringify(item),
              publishedAt: item.publishedDate,
              metadata: { provider: 'fmp', source: item.site, newsType: 'general' },
            });
            ingested++;
          }
        }
      } catch { /* skip */ }

      // Stock-specific news
      await waitForFmpSlot();
      try {
        const url = `https://financialmodelingprep.com/stable/news/stock-latest?page=0&limit=50&apikey=${apiKey}`;
        const response = await fetch(url);
        await incrementFmpCount();
        if (response.ok) {
          const items = await response.json() as Array<{ title: string; text: string; publishedDate: string; site: string; symbol: string; url: string }>;
          for (const item of items) {
            await ingestRawData({
              sourceId, dataType: 'news', symbol: item.symbol || null,
              title: item.title,
              content: JSON.stringify(item),
              publishedAt: item.publishedDate,
              metadata: { provider: 'fmp', source: item.site, newsType: 'stock' },
            });
            ingested++;
          }
        }
      } catch { /* skip */ }
    } else if (dataType === 'stock_news') {
      for (const symbol of symbols) {
        await waitForFmpSlot();
        try {
          const url = `https://financialmodelingprep.com/stable/news/stock?symbols=${encodeURIComponent(symbol)}&page=0&limit=10&apikey=${apiKey}`;
          const resp = await fetch(url);
          await incrementFmpCount();
          if (resp.ok) {
            const items = await resp.json() as Array<{ title: string; text: string; publishedDate: string; site: string; symbol: string; url: string }>;
            for (const item of items) {
              await ingestRawData({
                sourceId, dataType: 'news', symbol: item.symbol || symbol,
                title: item.title,
                content: JSON.stringify(item),
                publishedAt: item.publishedDate,
                metadata: { provider: 'fmp', source: item.site, newsType: 'stock_specific' },
              });
              ingested++;
            }
          }
        } catch { /* skip */ }
      }
    } else if (dataType === 'event') {
      await waitForFmpSlot();
      const url = `https://financialmodelingprep.com/stable/economic-calendar?apikey=${apiKey}`;
      const response = await fetch(url);
      await incrementFmpCount();
      if (!response.ok) throw new Error(`FMP calendar HTTP ${response.status}`);
      const events = await response.json() as Array<{ event: string; date: string; country: string; actual?: number; estimate?: number; previous?: number }>;
      for (const evt of (events ?? []).slice(0, 30)) {
        await ingestRawData({
          sourceId, dataType: 'event',
          title: `${evt.country}: ${evt.event}`,
          content: JSON.stringify(evt),
          publishedAt: evt.date,
          metadata: { provider: 'fmp', country: evt.country },
        });
        ingested++;
      }
    } else if (dataType === 'fundamental') {
      for (const symbol of symbols) {
        await waitForFmpSlot();
        const url = `https://financialmodelingprep.com/stable/profile?symbol=${encodeURIComponent(symbol)}&apikey=${apiKey}`;
        const response = await fetch(url);
        await incrementFmpCount();
        if (!response.ok) continue;
        const profiles = await response.json() as Array<Record<string, unknown>>;
        for (const profile of profiles) {
          await ingestRawData({
            sourceId, dataType: 'fundamental', symbol,
            title: `${symbol} profile`,
            content: JSON.stringify(profile),
            publishedAt: new Date().toISOString(),
            metadata: { provider: 'fmp' },
          });
          ingested++;
        }
      }
    } else if (dataType === 'fundamental_full') {
      for (const symbol of symbols) {
        await waitForFmpSlot();
        // Income statement
        try {
          const incUrl = `https://financialmodelingprep.com/stable/income-statement?symbol=${encodeURIComponent(symbol)}&period=annual&apikey=${apiKey}`;
          const incResp = await fetch(incUrl);
          await incrementFmpCount();
          if (incResp.ok) {
            const data = await incResp.json();
            await ingestRawData({
              sourceId, dataType: 'income_statement', symbol,
              title: `${symbol} income statement`,
              content: JSON.stringify(data),
              publishedAt: new Date().toISOString(),
              metadata: { provider: 'fmp', period: 'annual' },
            });
            ingested++;
          }
        } catch { /* skip */ }

        await waitForFmpSlot();
        // Financial ratios
        try {
          const ratUrl = `https://financialmodelingprep.com/stable/ratios?symbol=${encodeURIComponent(symbol)}&period=annual&apikey=${apiKey}`;
          const ratResp = await fetch(ratUrl);
          await incrementFmpCount();
          if (ratResp.ok) {
            const data = await ratResp.json();
            await ingestRawData({
              sourceId, dataType: 'ratios', symbol,
              title: `${symbol} financial ratios`,
              content: JSON.stringify(data),
              publishedAt: new Date().toISOString(),
              metadata: { provider: 'fmp', period: 'annual' },
            });
            ingested++;
          }
        } catch { /* skip */ }

        await waitForFmpSlot();
        // Key metrics
        try {
          const metUrl = `https://financialmodelingprep.com/stable/key-metrics?symbol=${encodeURIComponent(symbol)}&period=annual&apikey=${apiKey}`;
          const metResp = await fetch(metUrl);
          await incrementFmpCount();
          if (metResp.ok) {
            const data = await metResp.json();
            await ingestRawData({
              sourceId, dataType: 'key_metrics', symbol,
              title: `${symbol} key metrics`,
              content: JSON.stringify(data),
              publishedAt: new Date().toISOString(),
              metadata: { provider: 'fmp', period: 'annual' },
            });
            ingested++;
          }
        } catch { /* skip */ }
      }
    } else if (dataType === 'analyst_estimates') {
      for (const symbol of symbols) {
        await waitForFmpSlot();
        try {
          const url = `https://financialmodelingprep.com/stable/analyst-estimates?symbol=${encodeURIComponent(symbol)}&period=annual&apikey=${apiKey}`;
          const resp = await fetch(url);
          await incrementFmpCount();
          if (resp.ok) {
            const data = await resp.json();
            await ingestRawData({
              sourceId, dataType: 'analyst_estimates', symbol,
              title: `${symbol} analyst estimates`,
              content: JSON.stringify(data),
              publishedAt: new Date().toISOString(),
              metadata: { provider: 'fmp', period: 'annual' },
            });
            ingested++;
          }
        } catch { /* skip */ }
      }
    }

    return ingested;
  }

  // ── EODHD (End of Day Historical Data) ────────────────────────────────────

  async function fetchEODHD(sourceId: string, config: Record<string, unknown>): Promise<number> {
    const apiKey = config.api_key_env
      ? process.env[config.api_key_env as string]
      : (config.api_key as string | undefined);
    if (!apiKey) throw new Error('EODHD API key not configured (set EODHD_API_KEY in .env)');

    const symbols = (config.symbols as string[]) ?? [];
    const exchange = (config.exchange as string) || 'US';
    let ingested = 0;

    // Calculate date range — last 30 days
    const toDate = new Date();
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 30);
    const from = fromDate.toISOString().split('T')[0];
    const to = toDate.toISOString().split('T')[0];

    for (const symbol of symbols) {
      // EODHD format: SYMBOL.EXCHANGE (e.g., VOLV-B.ST)
      const ticker = symbol.includes('.') ? symbol : `${symbol}.${exchange}`;
      const url = `https://eodhd.com/api/eod/${encodeURIComponent(ticker)}?period=d&from=${from}&to=${to}&api_token=${apiKey}&fmt=json`;

      try {
        const response = await fetch(url);
        if (!response.ok) { console.warn(`[market-data] EODHD ${ticker}: HTTP ${response.status}`); continue; }
        const days = await response.json() as Array<{ date: string; open: number; high: number; low: number; close: number; adjusted_close: number; volume: number }>;

        for (const day of (days ?? []).slice(0, 10)) {
          await ingestRawData({
            sourceId, dataType: 'price', symbol: ticker,
            title: `${ticker} ${day.date}`,
            content: JSON.stringify(day),
            publishedAt: day.date,
            metadata: { provider: 'eodhd', exchange },
          });
          ingested++;
        }
      } catch (err) {
        console.warn(`[market-data] EODHD ${ticker} fetch error:`, err);
      }
    }

    return ingested;
  }

  // ── RSS Feed ──────────────────────────────────────────────────────────────

  async function fetchMarketRSS(sourceId: string, config: Record<string, unknown>): Promise<number> {
    const feedUrl = config.url as string;
    if (!feedUrl) throw new Error('RSS source requires "url" in config');

    // Dynamic import of rss-parser (already a dependency via radar-fetcher)
    const RssParser = (await import('rss-parser')).default;
    const parser = new RssParser({ timeout: 15000 });

    const feed = await parser.parseURL(feedUrl);
    let ingested = 0;

    // Market-specific keyword classification
    const classifyItem = (title: string, content: string): string => {
      const text = `${title} ${content}`.toLowerCase();
      if (/earnings|revenue|profit|eps|quarterly results/.test(text)) return 'earnings';
      if (/fed|ecb|boj|central bank|interest rate|monetary policy/.test(text)) return 'central_bank';
      if (/gdp|inflation|unemployment|cpi|pmi|macro/.test(text)) return 'macro';
      if (/sector|industry|healthcare|tech|energy|financials/.test(text)) return 'sector';
      if (/geopoliti|war|sanction|tariff|trade war/.test(text)) return 'geopolitical';
      return 'general';
    };

    for (const item of (feed.items ?? []).slice(0, 30)) {
      const title = item.title || 'Untitled';
      const content = item.contentSnippet || item.content || '';
      const category = classifyItem(title, content);

      // Dedup: check if we already have this title from this source
      const existing = await db.get<{ id: string }>(
        'SELECT id FROM market_data_raw WHERE source_id = ? AND title = ? LIMIT 1',
        sourceId, title
      );
      if (existing) continue;

      await ingestRawData({
        sourceId, dataType: 'news',
        title,
        content: JSON.stringify({ title, link: item.link, summary: content, pubDate: item.pubDate, categories: item.categories }),
        publishedAt: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
        metadata: { provider: 'rss', category, feedTitle: feed.title },
      });
      ingested++;
    }

    return ingested;
  }

  // ── Fetch Historical Price Range (for backtesting) ─────────────────────

  async function fetchHistoricalRange(symbols: string[], from: string, to: string): Promise<number> {
    const apiKey = process.env.FMP_API_KEY;
    if (!apiKey) throw new Error('FMP_API_KEY not set');
    let ingested = 0;

    for (const symbol of symbols) {
      await waitForFmpSlot();
      try {
        const url = `https://financialmodelingprep.com/stable/historical-price-eod/full?symbol=${encodeURIComponent(symbol)}&from=${from}&to=${to}&apikey=${apiKey}`;
        const resp = await fetch(url);
        await incrementFmpCount();
        if (!resp.ok) continue;
        const data = await resp.json() as Array<{ date: string; open: number; high: number; low: number; close: number; volume: number }>;
        const rows = Array.isArray(data) ? data : [];

        for (const day of rows) {
          await db.run(`
            INSERT INTO market_historical_prices (symbol, price_date, open, high, low, close, volume, source)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'fmp')
            ON CONFLICT (symbol, price_date, source) DO NOTHING
          `, symbol, day.date, day.open, day.high, day.low, day.close, day.volume);
          ingested++;
        }
      } catch (err) {
        console.error(`[market-data] Historical fetch failed for ${symbol}:`, err);
      }
    }

    return ingested;
  }

  // ── Fetch All Active Sources ─────────────────────────────────────────────

  async function fetchAllSources(): Promise<{ results: Array<{ sourceId: string; itemsIngested: number; error?: string }> }> {
    const sources = await getSources(true);
    const results: Array<{ sourceId: string; itemsIngested: number; error?: string }> = [];

    for (const source of sources) {
      console.log(`[market-data] Fetching from ${source.name} (${source.provider})...`);
      const result = await fetchFromSource(source.id);
      results.push({ sourceId: source.id, ...result });
      console.log(`[market-data] ${source.name}: ${result.itemsIngested} items ingested${result.error ? ` (error: ${result.error})` : ''}`);
    }

    return { results };
  }

  // ── Dashboard Stats ──────────────────────────────────────────────────────

  async function getDashboardStats() {
    const totalSources = await db.get<{ n: number }>("SELECT COUNT(*) as n FROM market_data_sources");
    const activeSources = await db.get<{ n: number }>("SELECT COUNT(*) as n FROM market_data_sources WHERE is_active = 1");
    const totalAtoms = await db.get<{ n: number }>("SELECT COUNT(*) as n FROM market_atoms");
    const activeAtoms = await db.get<{ n: number }>("SELECT COUNT(*) as n FROM market_atoms WHERE is_active = 1");
    const watchlistCount = await db.get<{ n: number }>("SELECT COUNT(*) as n FROM market_watchlist WHERE is_active = 1");
    const recentComputations = await db.get<{ n: number }>(
      `SELECT COUNT(*) as n FROM market_computation_log WHERE created_at >= ${dateOffsetLiteral(db.dialect, 7, 'days')}`
    );

    return {
      totalSources: totalSources?.n ?? 0,
      activeSources: activeSources?.n ?? 0,
      totalAtoms: totalAtoms?.n ?? 0,
      activeAtoms: activeAtoms?.n ?? 0,
      watchlistCount: watchlistCount?.n ?? 0,
      recentComputations: recentComputations?.n ?? 0,
    };
  }

  return {
    // Sources
    getSources,
    getSource,
    createSource,
    updateSource,
    deleteSource,
    // Raw data
    ingestRawData,
    getUnprocessedRawData,
    markRawDataProcessed,
    getRawDataStats,
    // Watchlist
    getWatchlist,
    addToWatchlist,
    removeFromWatchlist,
    updateWatchlistItem,
    checkWatchlistAlerts,
    // Fetching
    fetchFromSource,
    fetchAllSources,
    fetchHistoricalRange,
    // Dashboard
    getDashboardStats,
  };
}

export type MarketDataService = Awaited<ReturnType<typeof createMarketDataService>>;
