import { Router } from 'express';
import { z } from 'zod';
import type { DatabaseAdapter } from '../db/database.js';
import { createMarketThesisService } from '../services/market-thesis-service.js';
import { createMarketValidationService } from '../services/market-validation-service.js';
import Anthropic from '@anthropic-ai/sdk';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Normalise a string | string[] | undefined value into a string[] (or undefined). */
function toStringArray(value: string | string[] | undefined): string[] | undefined {
  if (value === undefined) return undefined;
  return Array.isArray(value) ? value : [value];
}

// ── Zod Schemas ───────────────────────────────────────────────────────────────

const createThesisSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().min(1),
  thesisType: z.string().max(100).optional(),
  confidence: z.number().min(0).max(1).optional(),
  timeHorizon: z.string().max(100).optional(),
  successCriteria: z.string().optional(),
  keyAssumptions: z.union([z.string(), z.array(z.string())]).optional(),
  riskFactors: z.union([z.string(), z.array(z.string())]).optional(),
  targetEntities: z.array(z.string()).optional(),
});

const updateThesisSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().min(1).optional(),
  thesisType: z.string().max(100).optional(),
  confidence: z.number().min(0).max(1).optional(),
  timeHorizon: z.string().max(100).optional(),
  successCriteria: z.string().optional(),
  status: z.string().max(50).optional(),
  keyAssumptions: z.union([z.string(), z.array(z.string())]).optional(),
  riskFactors: z.union([z.string(), z.array(z.string())]).optional(),
  targetEntities: z.array(z.string()).optional(),
}).refine(obj => Object.keys(obj).length > 0, { message: 'At least one field must be provided' });

const linkAtomSchema = z.object({
  atomId: z.string().min(1),
  role: z.string().max(100).optional(),
  weight: z.number().min(0).max(1).optional(),
});

const createPredictionSchema = z.object({
  thesisId: z.string().optional(),
  title: z.string().min(1).max(500),
  description: z.string().min(1),
  predictionType: z.string().max(100).optional(),
  targetEntity: z.string().max(200).optional(),
  targetSymbol: z.string().max(50).optional(),
  predictedOutcome: z.string().min(1),
  predictedValue: z.number().optional(),
  predictedDirection: z.string().max(50).optional(),
  confidence: z.number().min(0).max(1).optional(),
  timeHorizonDays: z.number().int().positive().optional(),
  deadline: z.string().optional(),
  keyAssumptions: z.union([z.string(), z.array(z.string())]).optional(),
});

const validatePredictionSchema = z.object({
  actualOutcome: z.string().min(1),
  actualValue: z.number().optional(),
  wasCorrect: z.boolean(),
  explanation: z.string().optional(),
  lessonsLearned: z.string().optional(),
});

export async function createMarketThesesRoutes(db: DatabaseAdapter, anthropic?: Anthropic) {
  const router = Router();
  const thesisService = await createMarketThesisService(db, anthropic);
  const validationService = await createMarketValidationService(db);

  // ── Theses CRUD ────────────────────────────────────────────────────────

  router.get('/markets/theses', async (req, res) => {
    try {
      const theses = await thesisService.listTheses({
        status: req.query.status as string | undefined,
        thesisType: req.query.type as string | undefined,
        query: req.query.q as string | undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 50,
        offset: req.query.offset ? parseInt(req.query.offset as string, 10) : 0,
      });
      res.json(theses);
    } catch (err) {
      console.error('[market-theses] List error:', err);
      res.status(500).json({ error: 'Failed to list theses' });
    }
  });

  router.get('/markets/theses/:id', async (req, res) => {
    try {
      const thesis = await thesisService.getThesis(req.params.id);
      if (!thesis) return res.status(404).json({ error: 'Thesis not found' });
      res.json(thesis);
    } catch (err) {
      console.error('[market-theses] Get error:', err);
      res.status(500).json({ error: 'Failed to get thesis' });
    }
  });

  router.post('/markets/theses', async (req, res) => {
    try {
      const parsed = createThesisSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
      }
      const { title, description, thesisType, confidence, timeHorizon, successCriteria, keyAssumptions, riskFactors, targetEntities } = parsed.data;
      const id = await thesisService.createThesis({
        title, description, thesisType, confidence, timeHorizon, targetEntities,
        successCriteria: toStringArray(successCriteria),
        keyAssumptions: toStringArray(keyAssumptions),
        riskFactors: toStringArray(riskFactors),
      });
      res.status(201).json({ id });
    } catch (err) {
      console.error('[market-theses] Create error:', err);
      res.status(500).json({ error: 'Failed to create thesis' });
    }
  });

  router.put('/markets/theses/:id', async (req, res) => {
    try {
      const parsed = updateThesisSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
      }
      const { successCriteria, keyAssumptions, riskFactors, targetEntities: _targetEntities, ...rest } = parsed.data;
      await thesisService.updateThesis(req.params.id, {
        ...rest,
        ...(successCriteria !== undefined ? { successCriteria: toStringArray(successCriteria) } : {}),
        ...(keyAssumptions !== undefined ? { keyAssumptions: toStringArray(keyAssumptions) } : {}),
        ...(riskFactors !== undefined ? { riskFactors: toStringArray(riskFactors) } : {}),
      });
      res.json({ ok: true });
    } catch (err) {
      console.error('[market-theses] Update error:', err);
      res.status(500).json({ error: 'Failed to update thesis' });
    }
  });

  router.delete('/markets/theses/:id', async (req, res) => {
    try {
      await thesisService.deleteThesis(req.params.id);
      res.json({ ok: true });
    } catch (err) {
      console.error('[market-theses] Delete error:', err);
      res.status(500).json({ error: 'Failed to delete thesis' });
    }
  });

  // ── Thesis-Atom Links ──────────────────────────────────────────────────

  router.post('/markets/theses/:id/atoms', async (req, res) => {
    try {
      const parsed = linkAtomSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
      }
      const { atomId, role, weight } = parsed.data;
      await thesisService.linkAtom(req.params.id, atomId, role, weight);
      res.status(201).json({ ok: true });
    } catch (err) {
      console.error('[market-theses] Link atom error:', err);
      res.status(500).json({ error: 'Failed to link atom' });
    }
  });

  router.delete('/markets/theses/:id/atoms/:atomId', async (req, res) => {
    try {
      await thesisService.unlinkAtom(req.params.id, req.params.atomId);
      res.json({ ok: true });
    } catch (err) {
      console.error('[market-theses] Unlink atom error:', err);
      res.status(500).json({ error: 'Failed to unlink atom' });
    }
  });

  // ── AI Scoring ─────────────────────────────────────────────────────────

  router.post('/markets/theses/:id/score', async (req, res) => {
    try {
      const result = await thesisService.scoreThesisWithAI(req.params.id);
      if (!result) return res.status(503).json({ error: 'AI scoring unavailable' });
      res.json(result);
    } catch (err) {
      console.error('[market-theses] Score error:', err);
      res.status(500).json({ error: 'Failed to score thesis' });
    }
  });

  // ── Predictions CRUD ───────────────────────────────────────────────────

  router.get('/markets/predictions', async (req, res) => {
    try {
      const predictions = await thesisService.listPredictions({
        thesisId: req.query.thesisId as string | undefined,
        status: req.query.status as string | undefined,
        targetSymbol: req.query.symbol as string | undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 50,
        offset: req.query.offset ? parseInt(req.query.offset as string, 10) : 0,
      });
      res.json(predictions);
    } catch (err) {
      console.error('[market-predictions] List error:', err);
      res.status(500).json({ error: 'Failed to list predictions' });
    }
  });

  // Expired predictions — must be before /:id to avoid matching "expired" as an ID
  router.get('/markets/predictions/expired', async (_req, res) => {
    try {
      const predictions = await validationService.findExpiredPredictions();
      res.json(predictions);
    } catch (err) {
      console.error('[market-predictions] Expired error:', err);
      res.status(500).json({ error: 'Failed to get expired predictions' });
    }
  });

  // Recent validations — must be before /:id to avoid matching as an ID
  router.get('/markets/predictions/recent-validations', async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;
      const validations = await validationService.getRecentValidations(limit);
      res.json(validations);
    } catch (err) {
      console.error('[market-predictions] Recent validations error:', err);
      res.status(500).json({ error: 'Failed to get recent validations' });
    }
  });

  // Registered BEFORE '/markets/predictions/:id': Express matches in registration order, so the
  // parameterised route would otherwise swallow this one (id='track-record') and
  // return its "not found" error — which is what it did. See
  // tests/routes/route-shadowing.test.ts.
  router.get('/markets/predictions/track-record', async (_req, res) => {
    try {
      const trackRecord = await thesisService.getTrackRecord();
      const calibration = await validationService.getCalibrationData();
      const brierScore = await validationService.getOverallBrierScore();
      const byHorizon = await validationService.getAccuracyByHorizon();
      const byTemporalHorizon = await validationService.getAccuracyByTemporalHorizon();
      const bySymbol = await validationService.getAccuracyBySymbol();
      res.json({ trackRecord, calibration, brierScore, byHorizon, byTemporalHorizon, bySymbol });
    } catch (err) {
      console.error('[market-predictions] Track record error:', err);
      res.status(500).json({ error: 'Failed to get track record' });
    }
  });

  router.get('/markets/predictions/:id', async (req, res) => {
    try {
      const prediction = await thesisService.getPrediction(req.params.id);
      if (!prediction) return res.status(404).json({ error: 'Prediction not found' });
      res.json(prediction);
    } catch (err) {
      console.error('[market-predictions] Get error:', err);
      res.status(500).json({ error: 'Failed to get prediction' });
    }
  });

  router.post('/markets/predictions', async (req, res) => {
    try {
      const parsed = createPredictionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
      }
      const { thesisId, title, description, predictionType, targetEntity, targetSymbol, predictedOutcome, predictedValue, predictedDirection, confidence, timeHorizonDays, deadline, keyAssumptions } = parsed.data;
      const id = await thesisService.createPrediction({ thesisId, title, description, predictionType, targetEntity, targetSymbol, predictedOutcome, predictedValue, predictedDirection, confidence, timeHorizonDays, deadline, keyAssumptions: toStringArray(keyAssumptions) });
      res.status(201).json({ id });
    } catch (err) {
      console.error('[market-predictions] Create error:', err);
      res.status(500).json({ error: 'Failed to create prediction' });
    }
  });

  // ── Prediction Validation ──────────────────────────────────────────────

  router.post('/markets/predictions/:id/validate', async (req, res) => {
    try {
      const parsed = validatePredictionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
      }
      const { actualOutcome, actualValue, wasCorrect, explanation, lessonsLearned } = parsed.data;
      await thesisService.validatePrediction(req.params.id, { actualOutcome, actualValue, wasCorrect, explanation, lessonsLearned });
      res.json({ ok: true });
    } catch (err) {
      console.error('[market-predictions] Validate error:', err);
      res.status(500).json({ error: 'Failed to validate prediction' });
    }
  });

  // ── Track Record ───────────────────────────────────────────────────────


  // ── Signal Weight Update ───────────────────────────────────────────────

  router.post('/markets/predictions/update-signal-weights', async (_req, res) => {
    try {
      const result = await validationService.updateSignalWeights();
      res.json(result);
    } catch (err) {
      console.error('[market-predictions] Update weights error:', err);
      res.status(500).json({ error: 'Failed to update signal weights' });
    }
  });

  return router;
}
