import type { DatabaseAdapter } from '../db/database.js';

interface CapabilityCard {
  formatVersion: string;
  instanceHash: string;
  displayName: string;
  generatedAt: string;
  modules: Array<{
    moduleId: string;
    area: string;
    executionCount: number;
    avgQualityScore: number | null;
  }>;
  areas: string[];
  stats: {
    totalSessions: number;
    totalModulesUsed: number;
    avgOverallQuality: number | null;
    activeSince: string | null;
  };
  professionalContext?: {
    roleTitle?: string;
    organisation?: string;
    expertise?: string;
    focusAreas?: string[];
  };
}

export async function createCapabilityCardGenerator(db: DatabaseAdapter) {

  async function generateCapabilityCard(): Promise<CapabilityCard> {
    // Get identity
    const identity = await db.get<{ contact_hash: string; display_name: string }>(
      'SELECT contact_hash, display_name FROM community_identity LIMIT 1'
    );

    // Get module usage stats
    const moduleStats = await db.all<{ module_id: string; area_id: string | null; count: number }>(
      "SELECT module_id, NULL as area_id, COUNT(*) as count FROM sessions WHERE module_id IS NOT NULL GROUP BY module_id ORDER BY count DESC"
    );

    // Get quality scores
    const qualityStats = await db.all<{ module_id: string; avg_score: number; scored_count: number }>(
      "SELECT module_id, ROUND(AVG(score_overall)::numeric, 2) as avg_score, COUNT(*) as scored_count FROM quality_scores GROUP BY module_id"
    );
    const qualityMap = new Map(qualityStats.map(q => [q.module_id, Number(q.avg_score)]));

    // Get profile (may not exist or have different columns)
    let profile: { role_title?: string; organisation?: string; expertise?: string; focus_areas?: string } | null = null;
    try {
      profile = (await db.get<{ role_title?: string; organisation?: string; expertise?: string; focus_areas?: string }>(
        'SELECT role_title, organisation, expertise, focus_areas FROM user_profiles LIMIT 1'
      )) ?? null;
    } catch { /* table or columns may not exist */ }

    // Get earliest session
    const earliest = await db.get<{ earliest: string }>(
      'SELECT MIN(created_at) as earliest FROM sessions'
    );

    // Overall quality
    const overallQuality = await db.get<{ avg: number }>(
      'SELECT ROUND(AVG(score_overall)::numeric, 2) as avg FROM quality_scores'
    );

    const modules = moduleStats.map(m => ({
      moduleId: m.module_id,
      area: m.area_id ?? 'unknown',
      executionCount: Number(m.count),
      avgQualityScore: qualityMap.get(m.module_id) ?? null,
    }));

    const areas = Array.from(new Set(moduleStats.map(m => m.area_id).filter((a): a is string => a !== null)));

    const card: CapabilityCard = {
      formatVersion: '1.0.0',
      instanceHash: identity?.contact_hash ?? 'unknown',
      displayName: identity?.display_name ?? 'ANTON Instance',
      generatedAt: new Date().toISOString(),
      modules: modules.slice(0, 50),
      areas,
      stats: {
        totalSessions: moduleStats.reduce((s, m) => s + Number(m.count), 0),
        totalModulesUsed: modules.length,
        avgOverallQuality: overallQuality?.avg ? Number(overallQuality.avg) : null,
        activeSince: earliest?.earliest ?? null,
      },
    };

    if (profile?.role_title || profile?.organisation) {
      card.professionalContext = {
        roleTitle: profile.role_title || undefined,
        organisation: profile.organisation || undefined,
        expertise: profile.expertise || undefined,
        focusAreas: profile.focus_areas ? JSON.parse(profile.focus_areas) : undefined,
      };
    }

    // Cache the card
    const id = `cc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await db.run('UPDATE capability_cards SET is_current = 0 WHERE is_current = 1');
    await db.run(
      'INSERT INTO capability_cards (id, card_data, is_current) VALUES (?, ?, 1)',
      id, JSON.stringify(card)
    );

    return card;
  }

  async function getCurrentCard(): Promise<CapabilityCard | null> {
    const row = await db.get<{ card_data: string; generated_at: string }>(
      'SELECT card_data, generated_at FROM capability_cards WHERE is_current = 1 LIMIT 1'
    );
    if (!row) return null;
    return typeof row.card_data === 'string' ? JSON.parse(row.card_data) : row.card_data;
  }

  async function getOrRefreshCard(maxAgeMs = 3600000): Promise<CapabilityCard> {
    const row = await db.get<{ card_data: string; generated_at: string }>(
      'SELECT card_data, generated_at FROM capability_cards WHERE is_current = 1 LIMIT 1'
    );
    if (row) {
      const age = Date.now() - new Date(row.generated_at).getTime();
      if (age < maxAgeMs) {
        return typeof row.card_data === 'string' ? JSON.parse(row.card_data) : row.card_data;
      }
    }
    return await generateCapabilityCard();
  }

  return { generateCapabilityCard, getCurrentCard, getOrRefreshCard };
}

export type CapabilityCardGenerator = Awaited<ReturnType<typeof createCapabilityCardGenerator>>;
