import type { DatabaseAdapter } from '../db/database.js';

export type ApprenticeStage = 'observer' | 'guided' | 'supervised' | 'autonomous';

export interface ApprenticeProfile {
  id: string;
  user_id: string;
  module_id: string;
  area_id: string | null;
  stage: ApprenticeStage;
  sessions_completed: number;
  quality_avg: number | null;
  /** Number of sessions that actually received a quality score (denominator of quality_avg). */
  quality_n: number | null;
  last_session: string;
  promoted_to_guided: string | null;
  promoted_to_supervised: string | null;
  promoted_to_autonomous: string | null;
}

export const STAGE_THRESHOLDS = {
  guided: { sessions: 3, qualityAvg: 0 },       // After 3 sessions: guided
  supervised: { sessions: 8, qualityAvg: 7.0 },  // After 8 sessions + quality 7+: supervised
  autonomous: { sessions: 20, qualityAvg: 8.0 }, // After 20 sessions + quality 8+: autonomous
};

// Stage descriptions for UI
export const STAGE_LABELS = {
  observer: { label: 'Observer', description: 'Learning the ropes — Anton handles everything', icon: 'Eye', color: 'adv-gray' },
  guided: { label: 'Guided', description: 'Anton suggests, you review and confirm', icon: 'GraduationCap', color: 'adv-blue' },
  supervised: { label: 'Supervised', description: 'You lead, Anton checks your work', icon: 'UserCheck', color: 'adv-teal' },
  autonomous: { label: 'Autonomous', description: 'Full expert — Anton is your sounding board', icon: 'Crown', color: 'adv-gold' },
};

export async function createApprentice(db: DatabaseAdapter) {

  async function getProfile(userId: string, moduleId: string): Promise<ApprenticeProfile | null> {
    return (await db.get<ApprenticeProfile>(
      'SELECT * FROM apprentice_profiles WHERE user_id = ? AND module_id = ?',
      userId, moduleId,
    )) ?? null;
  }

  async function getAllProfiles(userId: string): Promise<ApprenticeProfile[]> {
    return await db.all<ApprenticeProfile>(
      'SELECT * FROM apprentice_profiles WHERE user_id = ? ORDER BY last_session DESC',
      userId,
    );
  }

  async function recordSession(params: {
    userId: string;
    moduleId: string;
    areaId?: string;
    qualityScore?: number;
  }) {
    const existing = await getProfile(params.userId, params.moduleId);
    const now = new Date().toISOString();
    // A score of 0 is a valid (terrible) score — test for presence, not truthiness.
    const hasScore = typeof params.qualityScore === 'number' && Number.isFinite(params.qualityScore);

    if (!existing) {
      const id = `ap_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      await db.run(`
        INSERT INTO apprentice_profiles (id, user_id, module_id, area_id, sessions_completed, quality_avg, quality_n, last_session)
        VALUES (?, ?, ?, ?, 1, ?, ?, ?)
      `, id, params.userId, params.moduleId, params.areaId ?? null, hasScore ? params.qualityScore : null, hasScore ? 1 : 0, now);
    } else {
      const newSessions = existing.sessions_completed + 1;
      await db.run(`
        UPDATE apprentice_profiles
        SET sessions_completed = ?, last_session = ?
        WHERE user_id = ? AND module_id = ?
      `, newSessions, now, params.userId, params.moduleId);
      if (hasScore) {
        // Fold the score into the running mean. quality_n counts only the
        // sessions that actually received a score, so unscored sessions never
        // dilute or poison the average.
        await db.run(`
          UPDATE apprentice_profiles
          SET quality_avg = (COALESCE(quality_avg, 0) * COALESCE(quality_n, 0) + ?) / (COALESCE(quality_n, 0) + 1),
              quality_n = COALESCE(quality_n, 0) + 1
          WHERE user_id = ? AND module_id = ?
        `, params.qualityScore, params.userId, params.moduleId);
      }
    }

    return checkAndPromote(params.userId, params.moduleId);
  }

  async function checkAndPromote(userId: string, moduleId: string) {
    const profile = await getProfile(userId, moduleId);
    if (!profile) return null;

    const currentStage = profile.stage;
    let newStage = currentStage;
    const now = new Date().toISOString();

    if (currentStage === 'observer' && profile.sessions_completed >= STAGE_THRESHOLDS.guided.sessions) {
      newStage = 'guided';
      await db.run("UPDATE apprentice_profiles SET stage = ?, promoted_to_guided = ? WHERE user_id = ? AND module_id = ?", newStage, now, userId, moduleId);
    } else if (currentStage === 'guided' &&
               profile.sessions_completed >= STAGE_THRESHOLDS.supervised.sessions &&
               (profile.quality_avg ?? 0) >= STAGE_THRESHOLDS.supervised.qualityAvg) {
      newStage = 'supervised';
      await db.run("UPDATE apprentice_profiles SET stage = ?, promoted_to_supervised = ? WHERE user_id = ? AND module_id = ?", newStage, now, userId, moduleId);
    } else if (currentStage === 'supervised' &&
               profile.sessions_completed >= STAGE_THRESHOLDS.autonomous.sessions &&
               (profile.quality_avg ?? 0) >= STAGE_THRESHOLDS.autonomous.qualityAvg) {
      newStage = 'autonomous';
      await db.run("UPDATE apprentice_profiles SET stage = ?, promoted_to_autonomous = ? WHERE user_id = ? AND module_id = ?", newStage, now, userId, moduleId);
    }

    return { previousStage: currentStage, currentStage: newStage, promoted: newStage !== currentStage };
  }

  function getStageSuggestions(stage: string): string[] {
    const suggestions: Record<string, string[]> = {
      observer: ['Focus on understanding the module outputs', 'Try different thinking levels to see how depth changes', 'Read the system prompt to understand Anton\'s approach'],
      guided: ['Try editing the system prompt for your specific context', 'Experiment with different output formats', 'Use follow-up questions to deepen the analysis'],
      supervised: ['Build custom modules using your own prompts', 'Create workflow sequences combining multiple modules', 'Share your best prompts as community skills'],
      autonomous: ['Create reusable starter packs for your team', 'Build coworker workflows for recurring tasks', 'Mentor colleagues through their observer stage'],
    };
    return suggestions[stage] ?? [];
  }

  async function getProgressionHistory(userId: string, moduleId: string) {
    const profile = await getProfile(userId, moduleId);
    if (!profile) return null;

    // Observer is the implicit starting stage; no schema column tracks when the
    // user entered it (the first INSERT into apprentice_profiles happens after
    // the first session, by which time they're already eligible to advance).
    const timeline: Array<{ stage: string; promoted_at: string | null }> = [
      { stage: 'observer', promoted_at: null },
    ];
    if (profile.promoted_to_guided) timeline.push({ stage: 'guided', promoted_at: profile.promoted_to_guided });
    if (profile.promoted_to_supervised) timeline.push({ stage: 'supervised', promoted_at: profile.promoted_to_supervised });
    if (profile.promoted_to_autonomous) timeline.push({ stage: 'autonomous', promoted_at: profile.promoted_to_autonomous });

    return { profile, timeline, thresholds: STAGE_THRESHOLDS };
  }

  return { getProfile, getAllProfiles, recordSession, checkAndPromote, getStageSuggestions, getProgressionHistory };
}
