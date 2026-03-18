import type { DatabaseAdapter } from '../db/database.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function newId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function safeJson(val: unknown): string {
  if (typeof val === 'string') return val;
  return JSON.stringify(val ?? {});
}

interface ImportResult {
  success: boolean;
  bundleType: string;
  imported: Record<string, number>;
  errors?: string[];
}

// ── 1. Import Market Index ───────────────────────────────────────────────────

export async function importMarketIndex(db: DatabaseAdapter, payload: Record<string, unknown>): Promise<ImportResult> {
  const data = payload as Record<string, unknown>;
  const index = data.index as Record<string, unknown> | undefined;
  if (!index) return { success: false, bundleType: 'market-index', imported: {}, errors: ['Missing index data'] };

  const counts = { indexes: 0, holdings: 0, nav_history: 0, rebalances: 0 };

  await db.transaction(async () => {
    const indexId = newId('midx');

    await db.run(`
      INSERT INTO market_indexes (id, name, description, index_type, philosophy, status, universe,
        max_holdings, rebalance_frequency, weighting_method, total_return, current_nav, benchmark_symbol)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, indexId, index.name, index.description, index.index_type ?? 'custom',
       index.philosophy, 'draft', safeJson(index.universe),
       index.max_holdings ?? 20, index.rebalance_frequency ?? 'monthly',
       index.weighting_method ?? 'equal', index.total_return ?? 0,
       index.current_nav ?? 1000, index.benchmark_symbol);
    counts.indexes++;

    const holdings = Array.isArray(data.holdings) ? data.holdings : [];
    for (const h of holdings) {
      await db.run(`
        INSERT INTO market_index_holdings (index_id, symbol, name, weight, shares, entry_price, current_price, unrealized_pnl)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, indexId, h.symbol, h.name, h.weight ?? 0, h.shares ?? 0,
         h.entry_price, h.current_price, h.unrealized_pnl ?? 0);
      counts.holdings++;
    }

    const navHistory = Array.isArray(data.nav_history) ? data.nav_history : [];
    for (const n of navHistory) {
      await db.run(`
        INSERT INTO market_index_nav_history (index_id, nav_date, nav_value, daily_return)
        VALUES (?, ?, ?, ?)
      `, indexId, n.nav_date, n.nav_value, n.daily_return);
      counts.nav_history++;
    }

    const rebalances = Array.isArray(data.rebalances) ? data.rebalances : [];
    for (const r of rebalances) {
      await db.run(`
        INSERT INTO market_index_rebalances (id, index_id, rebalance_type, pre_holdings, post_holdings, trades, reasoning, nav_at_rebalance)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, newId('reb'), indexId, r.rebalance_type ?? 'imported',
         safeJson(r.pre_holdings), safeJson(r.post_holdings),
         safeJson(r.trades), r.reasoning, r.nav_at_rebalance);
      counts.rebalances++;
    }
  });

  return { success: true, bundleType: 'market-index', imported: counts };
}

// ── 2. Import Market Thesis ──────────────────────────────────────────────────

export async function importMarketThesis(db: DatabaseAdapter, payload: Record<string, unknown>): Promise<ImportResult> {
  const thesis = payload.thesis as Record<string, unknown> | undefined;
  if (!thesis) return { success: false, bundleType: 'market-thesis', imported: {}, errors: ['Missing thesis data'] };

  const counts = { theses: 0, atom_links: 0, predictions: 0, why_chains: 0 };

  await db.transaction(async () => {
    const thesisId = newId('mthes');

    await db.run(`
      INSERT INTO market_theses (id, title, description, thesis_type, status, confidence,
        time_horizon, affected_symbols, evidence_atoms)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, thesisId, thesis.title, thesis.hypothesis ?? thesis.description, thesis.thesis_type ?? 'directional',
       'draft', thesis.confidence ?? 0.5, thesis.timeframe ?? thesis.time_horizon,
       safeJson(thesis.affected_symbols), safeJson(thesis.evidence_atoms));
    counts.theses++;

    const atomLinks = Array.isArray(payload.atom_links) ? payload.atom_links : [];
    for (const link of atomLinks) {
      try {
        await db.run(`
          INSERT INTO market_thesis_atoms (thesis_id, atom_id, relevance_score)
          VALUES (?, ?, ?)
        `, thesisId, link.atom_id, link.relevance_score ?? 0.5);
        counts.atom_links++;
      } catch { /* atom may not exist — skip */ }
    }

    const predictions = Array.isArray(payload.predictions) ? payload.predictions : [];
    for (const p of predictions) {
      await db.run(`
        INSERT INTO market_predictions (id, thesis_id, prediction_type, description, predicted_direction,
          predicted_value, confidence, target_date, symbol)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, newId('mpred'), thesisId, p.prediction_type ?? 'directional',
         p.description, p.predicted_direction, p.predicted_value,
         p.confidence ?? 0.5, p.target_date, p.symbol);
      counts.predictions++;
    }

    const whyChains = Array.isArray(payload.why_chains) ? payload.why_chains : [];
    for (const wc of whyChains) {
      const chainId = newId('mwhy');
      await db.run(`
        INSERT INTO market_why_chains (id, root_question, context_type, context_id, status, metadata)
        VALUES (?, ?, 'thesis', ?, 'complete', ?)
      `, chainId, wc.root_question, thesisId, safeJson(wc.metadata));
      counts.why_chains++;

      const levels = Array.isArray(wc.levels) ? wc.levels : [];
      for (const lvl of levels) {
        await db.run(`
          INSERT INTO market_why_chain_levels (id, chain_id, depth, question, answer, confidence, evidence, sub_questions)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, newId('mwlv'), chainId, lvl.depth ?? 0, lvl.question, lvl.answer,
           lvl.confidence ?? 0.5, safeJson(lvl.evidence), safeJson(lvl.sub_questions));
      }
    }
  });

  return { success: true, bundleType: 'market-thesis', imported: counts };
}

// ── 3. Import Market Atom Collection ─────────────────────────────────────────

export async function importMarketAtomCollection(db: DatabaseAdapter, payload: Record<string, unknown>): Promise<ImportResult> {
  const atoms = Array.isArray(payload.atoms) ? payload.atoms : [];
  if (atoms.length === 0) return { success: false, bundleType: 'market-atom-collection', imported: {}, errors: ['No atoms in bundle'] };

  const counts = { atoms: 0, skipped: 0 };

  await db.transaction(async () => {
    for (const a of atoms) {
      // Content-hash dedup: skip if identical content+source already exists
      const existing = await db.get<{ id: string }>(
        'SELECT id FROM market_atoms WHERE content = ? AND source = ? LIMIT 1',
        a.content, a.source
      );
      if (existing) { counts.skipped++; continue; }

      await db.run(`
        INSERT INTO market_atoms (id, atom_type, category, content, source, source_url,
          confidence, sentiment, entities, affected_symbols, metadata, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, newId('matom'), a.atom_type ?? 'fact', a.category, a.content,
         a.source ?? 'import', a.source_url, a.confidence ?? 0.5,
         a.sentiment ?? 'neutral', safeJson(a.entities), safeJson(a.affected_symbols),
         safeJson(a.metadata), 'active');
      counts.atoms++;
    }
  });

  return { success: true, bundleType: 'market-atom-collection', imported: counts };
}

// ── 4. Import Market Strategy Pack ───────────────────────────────────────────

export async function importMarketStrategyPack(db: DatabaseAdapter, payload: Record<string, unknown>): Promise<ImportResult> {
  const counts = { indexes: 0, theses: 0, atoms: 0, signal_weights: 0 };

  await db.transaction(async () => {
    // Import atoms first (theses/indexes may reference them)
    const atoms = Array.isArray(payload.atoms) ? payload.atoms : [];
    for (const a of atoms) {
      const existing = await db.get<{ id: string }>(
        'SELECT id FROM market_atoms WHERE content = ? AND source = ? LIMIT 1',
        a.content, a.source
      );
      if (existing) continue;

      await db.run(`
        INSERT INTO market_atoms (id, atom_type, category, content, source, confidence, sentiment, entities, affected_symbols, metadata, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
      `, newId('matom'), a.atom_type ?? 'fact', a.category, a.content,
         a.source ?? 'import', a.confidence ?? 0.5, a.sentiment ?? 'neutral',
         safeJson(a.entities), safeJson(a.affected_symbols), safeJson(a.metadata));
      counts.atoms++;
    }

    // Import indexes
    const indexes = Array.isArray(payload.indexes) ? payload.indexes : [];
    for (const idx of indexes) {
      const result = await importMarketIndex(db, idx);
      counts.indexes += result.imported.indexes ?? 0;
    }

    // Import theses
    const theses = Array.isArray(payload.theses) ? payload.theses : [];
    for (const th of theses) {
      const result = await importMarketThesis(db, th);
      counts.theses += result.imported.theses ?? 0;
    }

    // Import signal weights
    const signalWeights = Array.isArray(payload.signal_weights) ? payload.signal_weights : [];
    for (const sw of signalWeights) {
      await db.run(`
        INSERT INTO market_signal_weights (signal_type, weight, decay_rate, description)
        VALUES (?, ?, ?, ?)
      `, sw.signal_type, sw.weight ?? 0.5, sw.decay_rate ?? 0.01, sw.description);
      counts.signal_weights++;
    }
  });

  return { success: true, bundleType: 'market-strategy-pack', imported: counts };
}

// ── 5. Import Market Investigation ───────────────────────────────────────────

export async function importMarketInvestigation(db: DatabaseAdapter, payload: Record<string, unknown>): Promise<ImportResult> {
  const investigation = payload.investigation as Record<string, unknown> | undefined;
  if (!investigation) return { success: false, bundleType: 'market-investigation', imported: {}, errors: ['Missing investigation data'] };

  const counts = { investigations: 0, findings: 0, why_chains: 0 };

  await db.transaction(async () => {
    const invId = newId('minv');

    await db.run(`
      INSERT INTO market_investigations (id, title, description, investigation_type, status, hypothesis, methodology, conclusion, confidence)
      VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?)
    `, invId, investigation.title, investigation.description,
       investigation.investigation_type ?? 'general',
       investigation.hypothesis, investigation.methodology,
       investigation.conclusion, investigation.confidence ?? 0.5);
    counts.investigations++;

    const findings = Array.isArray(payload.findings) ? payload.findings : [];
    for (const f of findings) {
      await db.run(`
        INSERT INTO market_investigation_findings (id, investigation_id, finding_type, title, content, confidence, evidence_atoms)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, newId('mfnd'), invId, f.finding_type ?? 'observation',
         f.title, f.content, f.confidence ?? 0.5, safeJson(f.evidence_atoms));
      counts.findings++;
    }

    const whyChains = Array.isArray(payload.why_chains) ? payload.why_chains : [];
    for (const wc of whyChains) {
      const chainId = newId('mwhy');
      await db.run(`
        INSERT INTO market_why_chains (id, root_question, context_type, context_id, status, metadata)
        VALUES (?, ?, 'investigation', ?, 'complete', ?)
      `, chainId, wc.root_question, invId, safeJson(wc.metadata));
      counts.why_chains++;

      const levels = Array.isArray(wc.levels) ? wc.levels : [];
      for (const lvl of levels) {
        await db.run(`
          INSERT INTO market_why_chain_levels (id, chain_id, depth, question, answer, confidence, evidence, sub_questions)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, newId('mwlv'), chainId, lvl.depth ?? 0, lvl.question, lvl.answer,
           lvl.confidence ?? 0.5, safeJson(lvl.evidence), safeJson(lvl.sub_questions));
      }
    }
  });

  return { success: true, bundleType: 'market-investigation', imported: counts };
}

// ── 6. Import Market Data Source Config ───────────────────────────────────────

export async function importMarketDataSourceConfig(db: DatabaseAdapter, payload: Record<string, unknown>): Promise<ImportResult> {
  const sources = Array.isArray(payload.sources) ? payload.sources : [];
  if (sources.length === 0) return { success: false, bundleType: 'market-data-source-config', imported: {}, errors: ['No sources in bundle'] };

  const counts = { sources: 0 };

  await db.transaction(async () => {
    for (const s of sources) {
      // Sanitize: never import API keys
      const config = (typeof s.config === 'object' && s.config) ? { ...s.config } : {};
      delete (config as Record<string, unknown>).api_key;
      delete (config as Record<string, unknown>).apiKey;
      delete (config as Record<string, unknown>).secret;

      await db.run(`
        INSERT INTO market_data_sources (id, name, source_type, config, enabled, fetch_interval_minutes)
        VALUES (?, ?, ?, ?, ?, ?)
      `, newId('mds'), s.name, s.source_type ?? 'api', JSON.stringify(config),
         0, s.fetch_interval_minutes ?? 360);
      counts.sources++;
    }
  });

  return { success: true, bundleType: 'market-data-source-config', imported: counts };
}

// ── 7. Import Market Intelligence Model ──────────────────────────────────────

export async function importMarketIntelligenceModel(db: DatabaseAdapter, payload: Record<string, unknown>): Promise<ImportResult> {
  const counts = { signal_weights: 0, calibration: 0, regime_history: 0 };

  await db.transaction(async () => {
    const signalWeights = Array.isArray(payload.signal_weights) ? payload.signal_weights : [];
    for (const sw of signalWeights) {
      // Upsert: update existing signal type or insert new
      const existing = await db.get<{ id: number }>(
        'SELECT id FROM market_signal_weights WHERE signal_type = ?', sw.signal_type
      );
      if (existing) {
        await db.run(
          'UPDATE market_signal_weights SET weight = ?, decay_rate = ?, description = ? WHERE signal_type = ?',
          sw.weight, sw.decay_rate, sw.description, sw.signal_type
        );
      } else {
        await db.run(
          'INSERT INTO market_signal_weights (signal_type, weight, decay_rate, description) VALUES (?, ?, ?, ?)',
          sw.signal_type, sw.weight ?? 0.5, sw.decay_rate ?? 0.01, sw.description
        );
      }
      counts.signal_weights++;
    }

    const calibration = Array.isArray(payload.calibration) ? payload.calibration : [];
    for (const c of calibration) {
      await db.run(`
        INSERT INTO market_prediction_feedback (prediction_id, feedback_type, predicted_value, actual_value, accuracy_score, explanation)
        VALUES (?, 'calibration_import', ?, ?, ?, ?)
      `, c.prediction_id ?? newId('cal'), c.predicted_value, c.actual_value,
         c.accuracy_score, c.explanation);
      counts.calibration++;
    }

    const regimeHistory = Array.isArray(payload.regime_history) ? payload.regime_history : [];
    for (const r of regimeHistory) {
      await db.run(`
        INSERT INTO market_pattern_detections (id, pattern_type, pattern_name, description, confidence, pattern_data, status)
        VALUES (?, 'regime', ?, ?, ?, ?, 'historical')
      `, newId('mpat'), r.regime_name, r.description, r.confidence ?? 0.5,
         JSON.stringify(r.data ?? {}));
      counts.regime_history++;
    }
  });

  return { success: true, bundleType: 'market-intelligence-model', imported: counts };
}
