import { getMarketsModel } from './markets-model-store.js';
import { callChat } from './provider-router.js';
import type { DatabaseAdapter } from '../db/database.js';
import type { PgNotifyService } from './pg-notify-service.js';
import type Anthropic from '@anthropic-ai/sdk';
import { dateOffsetLiteral, ilike } from '../db/dialect-helpers.js';

// Optional PG notify service — set via setNotifyService() from server/index.ts
let _pgNotify: PgNotifyService | null = null;
export function setAtomNotifyService(svc: PgNotifyService): void { _pgNotify = svc; }

// ── Types ────────────────────────────────────────────────────────────────────

interface MarketAtomRow {
  id: string;
  content: string;
  atom_type: string;
  confidence: number;
  category: string;
  subcategory: string | null;
  sentiment: string | null;
  temporal_type: string;
  entities: string;
  valid_from: string;
  valid_until: string | null;
  decay_rate: number;
  is_active: number;
  superseded_by: string | null;
  created_at: string;
  updated_at: string;
}

interface RawAtomExtraction {
  content: string;
  atom_type: string;
  confidence: number;
  category: string;
  subcategory?: string;
  sentiment?: string;
  temporal_type?: string;
  entities?: Array<{ type: string; id: string; name?: string }>;
  valid_until?: string | null;
  decay_rate?: number;
  tags?: string[];
  importance_score?: number;
}

// ── Market Atom Taxonomy ────────────────────────────────────────────────────

const MARKET_ATOM_TAXONOMY = `
  fact — Verified market data point (price, volume, earnings, economic indicator)
  signal — Pattern or indicator suggesting directional movement (breakout, divergence, volume spike)
  insight — AI-derived interpretation of facts/signals (sector rotation thesis, correlation discovery)
  event — Discrete market event (earnings release, central bank decision, M&A, IPO, regulatory action)
  prediction — Forward-looking claim with measurable outcome and timeframe
  outcome — Verified result of a prior prediction (confirmed, partially_confirmed, refuted)
`.trim();

const EXTRACTION_SYSTEM_PROMPT = `You are a financial market intelligence analyst. Extract structured knowledge atoms from market data.

ATOM TYPES:
${MARKET_ATOM_TAXONOMY}

CATEGORIES: equity, macro, sector, commodity, fx, crypto, general
SENTIMENT: bullish, bearish, neutral, mixed

Rules:
- Each atom must be a single, atomic fact or observation
- State confidence (0.0–1.0) based on source quality and corroboration
- Include relevant entities (companies, indices, sectors, currencies)
- Set valid_until for time-sensitive atoms (e.g., quarterly earnings are valid ~3 months)
- Set higher decay_rate (0.1+) for news/sentiment atoms, lower (0.01) for fundamental facts
- Never fabricate data — only extract what is present in the source

Return JSON array of atoms.`;

// ── Factory ──────────────────────────────────────────────────────────────────

export async function createMarketAtomService(db: DatabaseAdapter, client?: Anthropic) {

  // ── Importance Scoring ──────────────────────────────────────────────────

  function computeImportancePreWeight(
    content: string, atomType: string, category: string,
    subcategory?: string | null, sentiment?: string | null,
    entities?: Array<{ type: string; id: string; name?: string }>
  ): number {
    // Base importance from category + type
    let base = 50;
    if (category === 'macro') {
      if (atomType === 'event') base = 70;
      else if (atomType === 'signal' || atomType === 'insight') base = 65;
      else base = 60;
    } else if (category === 'equity') {
      if (atomType === 'event') base = 55;
      else if (atomType === 'signal') base = 55;
      else base = 40;
    } else if (category === 'sector') {
      if (atomType === 'event') base = 70;
      else base = 60;
    } else if (category === 'commodity') {
      base = atomType === 'event' ? 65 : 55;
    }

    // Keyword boosters
    const cl = content.toLowerCase();
    let boost = 0;
    if (/\b(war|conflict|military|invasion|missile|nuclear|escalat|attack|strike)/i.test(cl)) boost += 25;
    if (/\b(fed|ecb|boj|fomc|rate decision|monetary policy|central bank)\b/i.test(cl)) boost += 20;
    if (/\b(rate (hike|cut)|basis points|bp (cut|hike)|interest rate (change|decision))\b/i.test(cl)) boost += 20;
    if (/\b(miss|beat|surprise).{0,20}(earning|eps|revenue)/i.test(cl) || /\b(earning|eps|revenue).{0,20}(miss|beat|surprise)/i.test(cl)) boost += 15;
    if (/\b(tariff|trade war|sanction|embargo)\b/i.test(cl)) boost += 12;
    if (/\b(recession|depression|crisis|crash|panic|collapse)\b/i.test(cl)) boost += 15;
    if (/\b(ipo|merger|acquisition|takeover|buyout)\b/i.test(cl)) boost += 10;

    // Entity count: broader impact = higher importance
    const entityCount = entities?.length ?? 0;
    if (entityCount >= 5) boost += 8;
    else if (entityCount >= 3) boost += 4;

    // Prediction type atoms are inherently important
    if (atomType === 'prediction') boost += 10;
    if (atomType === 'outcome') boost += 15;

    return Math.max(0, Math.min(100, base + boost));
  }

  // ── Entity Graph Auto-Population ──────────────────────────────────────

  async function linkAtomToEntities(
    atomId: string, entities: Array<{ type: string; id: string; name?: string }>
  ): Promise<void> {
    if (!entities || entities.length === 0) return;

    for (const ent of entities) {
      // Find or create entity in market_entities
      let entityRow = await db.get<{ id: string }>(
        "SELECT id FROM market_entities WHERE symbol = ? OR name = ? LIMIT 1",
        ent.id, ent.name ?? ent.id
      );

      if (!entityRow) {
        const newId = `ment_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        try {
          await db.run(
            "INSERT INTO market_entities (id, name, entity_type, symbol, atom_count) VALUES (?, ?, ?, ?, 1)",
            newId, ent.name ?? ent.id, ent.type ?? 'company', ent.id
          );
          entityRow = { id: newId };
        } catch {
          // Entity might have been created by concurrent atom, retry lookup
          entityRow = await db.get<{ id: string }>(
            "SELECT id FROM market_entities WHERE symbol = ? OR name = ? LIMIT 1",
            ent.id, ent.name ?? ent.id
          );
          if (!entityRow) continue;
        }
      } else {
        await db.run("UPDATE market_entities SET atom_count = COALESCE(atom_count, 0) + 1, updated_at = NOW() WHERE id = ?", entityRow.id);
      }

      // Link atom to entity
      try {
        await db.run(
          "INSERT INTO market_atom_entity_links (atom_id, entity_id) VALUES (?, ?) ON CONFLICT (atom_id, entity_id) DO NOTHING",
          atomId, entityRow.id
        );
      } catch { /* ignore dups */ }
    }
  }

  // ── Atom CRUD ────────────────────────────────────────────────────────────

  async function createAtom(params: {
    content: string;
    atomType: string;
    confidence?: number;
    category?: string;
    subcategory?: string;
    sentiment?: string;
    temporalType?: string;
    entities?: Array<{ type: string; id: string; name?: string }>;
    validUntil?: string;
    decayRate?: number;
    tags?: string[];
    rawDataId?: string;
    extractionMethod?: string;
    extractionModel?: string;
    importanceScore?: number;
    horizon?: string;
  }) {
    const id = `matom_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Compute importance score
    const importance = params.importanceScore ?? computeImportancePreWeight(
      params.content, params.atomType, params.category ?? 'general',
      params.subcategory, params.sentiment, params.entities
    );
    const importanceSource = params.importanceScore ? 'manual' : 'rule';

    await db.run(`
      INSERT INTO market_atoms (id, content, atom_type, confidence, category, subcategory, sentiment,
                                temporal_type, entities, valid_until, decay_rate,
                                importance_score, importance_source, horizon)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, id, params.content, params.atomType, params.confidence ?? 0.5,
       params.category ?? 'general', params.subcategory ?? null,
       params.sentiment ?? null, params.temporalType ?? 'point',
       JSON.stringify(params.entities ?? []),
       params.validUntil ?? null, params.decayRate ?? 0.05,
       importance, importanceSource, params.horizon ?? null);

    // Link to raw data source
    if (params.rawDataId) {
      await db.run(`
        INSERT INTO market_atom_sources (atom_id, raw_data_id, extraction_method, extraction_model)
        VALUES (?, ?, ?, ?)
      `, id, params.rawDataId, params.extractionMethod ?? 'manual', params.extractionModel ?? null);
    }

    // Add tags
    if (params.tags?.length) {
      for (const tag of params.tags) {
        await db.run('INSERT INTO market_atom_tags (atom_id, tag) VALUES (?, ?)', id, tag);
      }
    }

    // Auto-populate entity graph
    await linkAtomToEntities(id, params.entities ?? []);

    // Notify (PG LISTEN/NOTIFY — no-op on SQLite)
    if (_pgNotify) {
      _pgNotify.notify('market_atom_created', { atomId: id, atomType: params.atomType, category: params.category }).catch(() => {});
    }

    return id;
  }

  async function getAtom(id: string) {
    const atom = await db.get<MarketAtomRow>('SELECT * FROM market_atoms WHERE id = ?', id);
    if (!atom) return null;

    const tags = await db.all<{ tag: string }>('SELECT tag FROM market_atom_tags WHERE atom_id = ?', id);
    const sources = await db.all<{ raw_data_id: string; extraction_method: string }>(
      'SELECT raw_data_id, extraction_method FROM market_atom_sources WHERE atom_id = ?', id
    );

    return { ...atom, tags: tags.map(t => t.tag), sources };
  }

  async function searchAtoms(params: {
    query?: string;
    atomType?: string;
    category?: string;
    sentiment?: string;
    minConfidence?: number;
    activeOnly?: boolean;
    limit?: number;
    offset?: number;
  }) {
    let where = 'WHERE 1=1';
    const args: unknown[] = [];

    if (params.activeOnly !== false) { where += ' AND is_active = 1'; }
    if (params.atomType) { where += ' AND atom_type = ?'; args.push(params.atomType); }
    if (params.category) { where += ' AND category = ?'; args.push(params.category); }
    if (params.sentiment) { where += ' AND sentiment = ?'; args.push(params.sentiment); }
    if (params.minConfidence) { where += ' AND confidence >= ?'; args.push(params.minConfidence); }
    if (params.query) {
      where += ` AND ${ilike(db.dialect, 'content')}`;
      args.push(`%${params.query}%`);
    }

    args.push(params.limit ?? 50, params.offset ?? 0);

    return await db.all<MarketAtomRow>(
      `SELECT * FROM market_atoms ${where} ORDER BY confidence DESC, created_at DESC LIMIT ? OFFSET ?`,
      ...args
    );
  }

  async function getAtomCount() {
    const row = await db.get<{ n: number }>("SELECT COUNT(*) as n FROM market_atoms WHERE is_active = 1");
    return row?.n ?? 0;
  }

  async function deactivateAtom(id: string) {
    await db.run("UPDATE market_atoms SET is_active = 0, updated_at = NOW() WHERE id = ?", id);
  }

  // ── Atom Relationships ───────────────────────────────────────────────────

  async function addRelationship(sourceAtomId: string, targetAtomId: string, type: string, strength = 0.5) {
    await db.run(`
      INSERT INTO market_atom_relationships (source_atom_id, target_atom_id, relationship_type, strength)
      VALUES (?, ?, ?, ?)
    `, sourceAtomId, targetAtomId, type, strength);
  }

  async function getRelationships(atomId: string) {
    const outgoing = await db.all<{ target_atom_id: string; relationship_type: string; strength: number }>(
      'SELECT target_atom_id, relationship_type, strength FROM market_atom_relationships WHERE source_atom_id = ?', atomId
    );
    const incoming = await db.all<{ source_atom_id: string; relationship_type: string; strength: number }>(
      'SELECT source_atom_id, relationship_type, strength FROM market_atom_relationships WHERE target_atom_id = ?', atomId
    );
    return { outgoing, incoming };
  }

  // ── AI Extraction ────────────────────────────────────────────────────────

  // Extraction goes through callChat (provider-router), which dispatches on
  // the configured markets model — API providers, ollama:, compat:, and the
  // sdk:/codex: subscription engines all work. No Anthropic client needed
  // (the old no-client early-return silently consumed raw rows with zero
  // atoms whenever the service was built without a client).
  async function extractAtomsFromRawData(rawDataId: string, rawContent: string, dataType: string): Promise<string[]> {
    try {
      const userPrompt = `Extract market knowledge atoms from this ${dataType} data:\n\n${rawContent.slice(0, 8000)}

Return a JSON array of atoms with these fields:
- content (string): the atomic fact/signal/insight
- atom_type (string): fact, signal, insight, event, prediction, or outcome
- confidence (number 0-1): how reliable this is
- category (string): equity, macro, sector, commodity, fx, crypto, or general
- subcategory (string, optional): more specific categorization
- sentiment (string): bullish, bearish, neutral, or mixed
- temporal_type (string): point, range, ongoing, or recurring
- entities (array): [{type: "company"|"sector"|"index"|"currency"|"commodity", id: string, name: string}]
- valid_until (string or null): ISO date when this becomes stale
- decay_rate (number): daily confidence decay (0.01-0.2)
- tags (string array): relevant tags
- importance_score (integer 0-100): market impact importance. 90-100: war/nuclear/systemic. 80-90: central bank rate decisions. 70-80: major earnings surprises, trade war. 60-70: sector events. 50-60: company events. 40-50: routine data. 30-40: commentary. 20-30: minor announcements.

Return ONLY the JSON array, no other text.`;

      const extractionModel = await getMarketsModel(db);
      const result = await callChat({
        model: extractionModel,
        system: EXTRACTION_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
        maxTokens: 8192,
        jsonMode: true,
        // Backlog extraction is a four-figure queue of one-call-per-item work.
        // Left at interactive priority it held every subscription slot for
        // minutes at a time and a person pressing Run in a module was told the
        // engine had aborted.
        background: true,
      });
      const responseText = result.text;

      // Parse JSON (strip markdown fences, handle truncated responses)
      let cleaned = responseText.trim().replace(/^```json\s*/i, '').replace(/```\s*$/, '');
      // If JSON was truncated mid-array, try to close it
      if (cleaned.startsWith('[') && !cleaned.endsWith(']')) {
        // Find the last complete object (ends with })
        const lastBrace = cleaned.lastIndexOf('}');
        if (lastBrace > 0) {
          cleaned = cleaned.slice(0, lastBrace + 1) + ']';
        }
      }
      const atoms = JSON.parse(cleaned) as RawAtomExtraction[];

      const createdIds: string[] = [];

      for (const raw of atoms) {
        if (!raw.content) continue; // Skip atoms with null/empty content
        const id = await createAtom({
          content: raw.content,
          atomType: raw.atom_type,
          confidence: raw.confidence,
          category: raw.category,
          subcategory: raw.subcategory,
          sentiment: raw.sentiment,
          temporalType: raw.temporal_type,
          entities: raw.entities,
          validUntil: raw.valid_until ?? undefined,
          decayRate: raw.decay_rate,
          tags: raw.tags,
          rawDataId,
          extractionMethod: 'ai',
          extractionModel,
          importanceScore: raw.importance_score,
        });
        createdIds.push(id);
      }

      return createdIds;
    } catch (err) {
      console.error('[market-atoms] AI extraction failed:', err);
      return [];
    }
  }

  // ── Fundamental Data → Atoms Pipeline ───────────────────────────────────

  /**
   * Extract atoms from fundamental data (income statements, ratios, metrics).
   * Fundamental atoms have slower decay rates than news-derived atoms.
   */
  async function extractAtomsFromFundamentals(symbol: string, dataType: string, data: unknown): Promise<string[]> {
    const prompt = `Extract market knowledge atoms from this ${dataType} data for ${symbol}.

Focus on:
- Revenue/earnings trends (growth/decline)
- Margin changes (expanding/contracting)
- Valuation ratios vs historical (cheap/expensive)
- Balance sheet health (debt levels, cash position)
- Key ratio changes that signal improving/deteriorating fundamentals

Each atom should be a durable fundamental fact, not a short-term signal.
Set decay_rate very low (0.01-0.05) since fundamental data is long-lasting.
Set temporal_type to "range" or "ongoing" for most items.

Data:
${JSON.stringify(data).slice(0, 6000)}

Return a JSON array of atoms with: content, atom_type, confidence, category, subcategory, sentiment, temporal_type, entities, valid_until, decay_rate, tags

Return ONLY the JSON array.`;

    try {
      const extractionModel = await getMarketsModel(db);
      const result = await callChat({
        model: extractionModel,
        system: 'You are an expert financial analyst extracting fundamental insights into structured market atoms. Output only valid JSON.',
        messages: [{ role: 'user', content: prompt }],
        maxTokens: 8192,
        jsonMode: true,
      });

      let cleaned = result.text.trim().replace(/^```json\s*/i, '').replace(/```\s*$/, '');
      // Handle truncated JSON arrays
      if (cleaned.startsWith('[') && !cleaned.endsWith(']')) {
        const lastBrace = cleaned.lastIndexOf('}');
        if (lastBrace > 0) cleaned = cleaned.slice(0, lastBrace + 1) + ']';
      }
      const atoms = JSON.parse(cleaned) as RawAtomExtraction[];
      const createdIds: string[] = [];

      for (const raw of atoms) {
        if (!raw.content) continue; // Skip atoms with null/empty content
        const id = await createAtom({
          content: raw.content,
          atomType: raw.atom_type,
          confidence: raw.confidence,
          category: raw.category || 'equity',
          subcategory: raw.subcategory,
          sentiment: raw.sentiment,
          temporalType: raw.temporal_type || 'range',
          entities: raw.entities || [{ type: 'company', id: symbol, name: symbol }],
          validUntil: raw.valid_until ?? undefined,
          decayRate: raw.decay_rate ?? 0.02,
          tags: raw.tags || ['fundamental'],
          extractionMethod: 'ai',
          extractionModel,
          importanceScore: raw.importance_score,
        });
        createdIds.push(id);
      }

      return createdIds;
    } catch (err) {
      console.error(`[market-atoms] Fundamental extraction failed for ${symbol}:`, err);
      return [];
    }
  }

  // ── Atom Decay ───────────────────────────────────────────────────────────
  // Reduces confidence of active atoms using per-type half-life formula.
  // Formula: new_confidence = confidence * 0.5^(age_days / half_life)
  // Atoms below 0.05 threshold are deactivated.

  const HALF_LIVES: Record<string, number> = {
    fact: 90,
    signal: 14,
    insight: 30,
    event: 7,
    outcome: 180,
    prediction: 30, // default fallback
  };
  const DECAY_THRESHOLD = 0.05;

  async function applyAtomDecay() {
    // Deactivate atoms past their valid_until date
    const expired = await db.run(`
      UPDATE market_atoms SET is_active = 0, updated_at = NOW()
      WHERE is_active = 1 AND valid_until IS NOT NULL AND valid_until < NOW()
    `);

    // Apply per-type half-life decay to remaining active atoms
    const activeAtoms = await db.all<{
      id: string; atom_type: string; confidence: number; created_at: string;
    }>(
      "SELECT id, atom_type, confidence, created_at FROM market_atoms WHERE is_active = 1 AND confidence > 0"
    );

    let decayedCount = 0;
    let deactivatedCount = 0;

    for (const atom of activeAtoms) {
      const halfLife = HALF_LIVES[atom.atom_type] ?? 30;
      const ageMs = Date.now() - new Date(atom.created_at).getTime();
      const ageDays = ageMs / (1000 * 60 * 60 * 24);
      const newConfidence = atom.confidence * Math.pow(0.5, ageDays / halfLife);

      if (newConfidence < DECAY_THRESHOLD) {
        await db.run(
          "UPDATE market_atoms SET is_active = 0, confidence = ?, updated_at = NOW() WHERE id = ?",
          newConfidence, atom.id
        );
        deactivatedCount++;
      } else if (Math.abs(newConfidence - atom.confidence) > 0.001) {
        await db.run(
          "UPDATE market_atoms SET confidence = ?, updated_at = NOW() WHERE id = ?",
          newConfidence, atom.id
        );
        decayedCount++;
      }
    }

    console.log(`[market-atoms] Decay applied: ${expired.changes ?? 0} expired, ${decayedCount} decayed, ${deactivatedCount} deactivated below threshold`);

    return {
      expired: expired.changes ?? 0,
      decayed: decayedCount,
      deactivated: deactivatedCount,
    };
  }

  // ── Recent atoms for dashboard ───────────────────────────────────────────

  async function getRecentAtoms(limit = 10) {
    return await db.all<MarketAtomRow>(
      'SELECT * FROM market_atoms WHERE is_active = 1 ORDER BY created_at DESC LIMIT ?', limit
    );
  }

  async function getAtomsByCategory() {
    return await db.all<{ category: string; count: number }>(
      "SELECT category, COUNT(*) as count FROM market_atoms WHERE is_active = 1 GROUP BY category ORDER BY count DESC"
    );
  }

  return {
    createAtom,
    getAtom,
    searchAtoms,
    getAtomCount,
    deactivateAtom,
    addRelationship,
    getRelationships,
    extractAtomsFromRawData,
    extractAtomsFromFundamentals,
    applyAtomDecay,
    getRecentAtoms,
    getAtomsByCategory,
  };
}

export type MarketAtomService = Awaited<ReturnType<typeof createMarketAtomService>>;
