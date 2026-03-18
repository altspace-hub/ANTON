import type { DatabaseAdapter } from '../db/database.js';
import type { PgNotifyService } from './pg-notify-service.js';
import Anthropic from '@anthropic-ai/sdk';
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
  }) {
    const id = `matom_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    await db.run(`
      INSERT INTO market_atoms (id, content, atom_type, confidence, category, subcategory, sentiment,
                                temporal_type, entities, valid_until, decay_rate)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, id, params.content, params.atomType, params.confidence ?? 0.5,
       params.category ?? 'general', params.subcategory ?? null,
       params.sentiment ?? null, params.temporalType ?? 'point',
       JSON.stringify(params.entities ?? []),
       params.validUntil ?? null, params.decayRate ?? 0.05);

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

  async function extractAtomsFromRawData(rawDataId: string, rawContent: string, dataType: string): Promise<string[]> {
    if (!client) {
      console.warn('[market-atoms] No Anthropic client — skipping AI extraction');
      return [];
    }

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

Return ONLY the JSON array, no other text.`;

      const message = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4096,
        system: EXTRACTION_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
      });

      let responseText = '';
      for (const block of message.content) {
        if (block.type === 'text') responseText += block.text;
      }

      // Parse JSON (strip markdown fences if present)
      const cleaned = responseText.trim().replace(/^```json\s*/i, '').replace(/```\s*$/, '');
      const atoms = JSON.parse(cleaned) as RawAtomExtraction[];

      const createdIds: string[] = [];

      for (const raw of atoms) {
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
          extractionModel: 'claude-haiku-4-5-20251001',
        });
        createdIds.push(id);
      }

      return createdIds;
    } catch (err) {
      console.error('[market-atoms] AI extraction failed:', err);
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
    applyAtomDecay,
    getRecentAtoms,
    getAtomsByCategory,
  };
}

export type MarketAtomService = Awaited<ReturnType<typeof createMarketAtomService>>;
