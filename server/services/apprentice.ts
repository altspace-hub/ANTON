import Database from 'better-sqlite3';

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

export function createApprentice(db: Database.Database) {

  function getProfile(userId: string, moduleId: string) {
    return db.prepare(
      'SELECT * FROM apprentice_profiles WHERE user_id = ? AND module_id = ?'
    ).get(userId, moduleId) as any ?? null;
  }

  function getAllProfiles(userId: string) {
    return db.prepare(
      'SELECT * FROM apprentice_profiles WHERE user_id = ? ORDER BY last_session DESC'
    ).all(userId) as any[];
  }

  function recordSession(params: {
    userId: string;
    moduleId: string;
    areaId?: string;
    qualityScore?: number;
  }) {
    const existing = getProfile(params.userId, params.moduleId);
    const now = new Date().toISOString();

    if (!existing) {
      const id = `ap_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      db.prepare(`
        INSERT INTO apprentice_profiles (id, user_id, module_id, area_id, sessions_completed, quality_avg, last_session)
        VALUES (?, ?, ?, ?, 1, ?, ?)
      `).run(id, params.userId, params.moduleId, params.areaId ?? null, params.qualityScore ?? null, now);
    } else {
      const newSessions = existing.sessions_completed + 1;
      const newQualityAvg = params.qualityScore
        ? ((existing.quality_avg ?? 7) * (existing.sessions_completed) + params.qualityScore) / newSessions
        : existing.quality_avg;
      db.prepare(`
        UPDATE apprentice_profiles
        SET sessions_completed = ?, quality_avg = ?, last_session = ?
        WHERE user_id = ? AND module_id = ?
      `).run(newSessions, newQualityAvg, now, params.userId, params.moduleId);
    }

    return checkAndPromote(params.userId, params.moduleId);
  }

  function checkAndPromote(userId: string, moduleId: string) {
    const profile = getProfile(userId, moduleId);
    if (!profile) return null;

    const currentStage = profile.stage;
    let newStage = currentStage;
    const now = new Date().toISOString();

    if (currentStage === 'observer' && profile.sessions_completed >= STAGE_THRESHOLDS.guided.sessions) {
      newStage = 'guided';
      db.prepare("UPDATE apprentice_profiles SET stage = ?, promoted_to_guided = ? WHERE user_id = ? AND module_id = ?")
        .run(newStage, now, userId, moduleId);
    } else if (currentStage === 'guided' &&
               profile.sessions_completed >= STAGE_THRESHOLDS.supervised.sessions &&
               (profile.quality_avg ?? 0) >= STAGE_THRESHOLDS.supervised.qualityAvg) {
      newStage = 'supervised';
      db.prepare("UPDATE apprentice_profiles SET stage = ?, promoted_to_supervised = ? WHERE user_id = ? AND module_id = ?")
        .run(newStage, now, userId, moduleId);
    } else if (currentStage === 'supervised' &&
               profile.sessions_completed >= STAGE_THRESHOLDS.autonomous.sessions &&
               (profile.quality_avg ?? 0) >= STAGE_THRESHOLDS.autonomous.qualityAvg) {
      newStage = 'autonomous';
      db.prepare("UPDATE apprentice_profiles SET stage = ?, promoted_to_autonomous = ? WHERE user_id = ? AND module_id = ?")
        .run(newStage, now, userId, moduleId);
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

  function getProgressionHistory(userId: string, moduleId: string) {
    const profile = getProfile(userId, moduleId);
    if (!profile) return null;

    const timeline: Array<{ stage: string; promoted_at: string | null }> = [
      { stage: 'observer', promoted_at: profile.created_at ?? null },
    ];
    if (profile.promoted_to_guided) timeline.push({ stage: 'guided', promoted_at: profile.promoted_to_guided });
    if (profile.promoted_to_supervised) timeline.push({ stage: 'supervised', promoted_at: profile.promoted_to_supervised });
    if (profile.promoted_to_autonomous) timeline.push({ stage: 'autonomous', promoted_at: profile.promoted_to_autonomous });

    return { profile, timeline, thresholds: STAGE_THRESHOLDS };
  }

  return { getProfile, getAllProfiles, recordSession, checkAndPromote, getStageSuggestions, getProgressionHistory };
}
