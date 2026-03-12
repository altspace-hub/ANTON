import { Router } from 'express';
import Database from 'better-sqlite3';
import { createApprentice, STAGE_LABELS, STAGE_THRESHOLDS } from '../services/apprentice.js';

function getNextStageRequirements(profile: any) {
  if (!profile || profile.stage === 'observer') {
    return { sessionsNeeded: 3 - (profile?.sessions_completed ?? 0), qualityNeeded: null };
  }
  if (profile.stage === 'guided') {
    return { sessionsNeeded: Math.max(0, 8 - profile.sessions_completed), qualityNeeded: 7.0 };
  }
  if (profile.stage === 'supervised') {
    return { sessionsNeeded: Math.max(0, 20 - profile.sessions_completed), qualityNeeded: 8.0 };
  }
  return null; // autonomous — no further stages
}

export function createApprenticeRoutes(db: Database.Database) {
  const router = Router();
  const apprentice = createApprentice(db);
  const DEFAULT_USER = 'default';

  router.get('/apprentice/profiles', (req, res) => {
    try {
      res.json(apprentice.getAllProfiles(DEFAULT_USER));
    } catch (error) {
      console.error('Apprentice profiles error:', error);
      res.status(500).json({ error: 'Failed to fetch apprentice profiles' });
    }
  });

  router.get('/apprentice/modules/:moduleId', (req, res) => {
    try {
      const profile = apprentice.getProfile(DEFAULT_USER, req.params.moduleId);
      const stage = profile?.stage ?? 'observer';
      res.json({
        profile,
        stageLabel: STAGE_LABELS[stage as keyof typeof STAGE_LABELS],
        suggestions: apprentice.getStageSuggestions(stage),
        nextStageRequirements: getNextStageRequirements(profile),
      });
    } catch (error) {
      console.error('Apprentice module info error:', error);
      res.status(500).json({ error: 'Failed to fetch apprentice module info' });
    }
  });

  // ── GET /apprentice/progression/:moduleId — Why this stage? ──────────
  router.get('/apprentice/progression/:moduleId', (req, res) => {
    try {
      const result = apprentice.getProgressionHistory(DEFAULT_USER, req.params.moduleId);
      if (!result) {
        return res.json({
          profile: null,
          timeline: [],
          thresholds: STAGE_THRESHOLDS,
          nextStageRequirements: getNextStageRequirements(null),
        });
      }
      const { profile, timeline, thresholds } = result;
      res.json({
        profile,
        timeline,
        thresholds,
        nextStageRequirements: getNextStageRequirements(profile),
      });
    } catch (error) {
      console.error('Apprentice progression error:', error);
      res.status(500).json({ error: 'Failed to fetch progression history' });
    }
  });

  router.post('/apprentice/modules/:moduleId/session', (req, res) => {
    try {
      const result = apprentice.recordSession({
        userId: DEFAULT_USER,
        moduleId: req.params.moduleId,
        areaId: req.body.areaId,
        qualityScore: req.body.qualityScore,
      });
      res.json(result);
    } catch (error) {
      console.error('Apprentice session record error:', error);
      res.status(500).json({ error: 'Failed to record apprentice session' });
    }
  });

  return router;
}
