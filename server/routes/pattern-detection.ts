import { Router } from 'express';
import Database from 'better-sqlite3';
import { createPatternDetection } from '../services/pattern-detection.js';
import { createPatternScheduler } from '../services/pattern-scheduler.js';

export function createPatternDetectionRoutes(db: Database.Database) {
  const router = Router();
  const patternDetection = createPatternDetection(db);
  const scheduler = createPatternScheduler(db);

  // POST /api/patterns/detect — run all detectors
  router.post('/patterns/detect', async (req, res) => {
    try {
      const result = patternDetection.runAllDetectors();
      res.json({
        success: true,
        ...result,
        detectorState: patternDetection.getDetectorState(),
      });
    } catch (error: any) {
      console.error('[pattern-detection] Error running detectors:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to run pattern detectors',
      });
    }
  });

  // GET /api/patterns — list patterns with optional filters
  router.get('/patterns', (req, res) => {
    try {
      const filters = {
        type: req.query.type as string | undefined,
        severity: req.query.severity as string | undefined,
        status: req.query.status as string | undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
      };

      const patterns = patternDetection.getPatterns(filters);
      const detectorState = patternDetection.getDetectorState();

      res.json({
        success: true,
        patterns,
        detectorState,
        count: patterns.length,
      });
    } catch (error: any) {
      console.error('[pattern-detection] Error fetching patterns:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch patterns',
      });
    }
  });

  // PUT /api/patterns/:id/status — update pattern status
  router.put('/patterns/:id/status', (req, res) => {
    try {
      const { id } = req.params;
      const { status, resolvedBy, notes } = req.body;

      if (!status) {
        return res.status(400).json({
          success: false,
          error: 'Status is required',
        });
      }

      const validStatuses = ['active', 'investigating', 'resolved', 'dismissed'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
        });
      }

      patternDetection.updatePatternStatus(id, status, resolvedBy, notes);

      res.json({
        success: true,
        message: 'Pattern status updated successfully',
      });
    } catch (error: any) {
      console.error('[pattern-detection] Error updating pattern status:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to update pattern status',
      });
    }
  });

  // GET /api/patterns/detector-state — get detector state
  router.get('/patterns/detector-state', (req, res) => {
    try {
      const state = patternDetection.getDetectorState();
      res.json({
        success: true,
        state: state || {
          detector_id: 'all',
          last_run: null,
          next_run: null,
          run_count: 0,
          enabled: 1,
        },
      });
    } catch (error: any) {
      console.error('[pattern-detection] Error fetching detector state:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch detector state',
      });
    }
  });

  // POST /api/patterns/detect/:type — run specific detector
  router.post('/patterns/detect/:type', async (req, res) => {
    try {
      const { type } = req.params;
      let patterns: any[] = [];

      switch (type) {
        case 'temporal_correlation':
          patterns = patternDetection.detectTemporalCorrelation();
          break;
        case 'entity_convergence':
          patterns = patternDetection.detectEntityConvergence();
          break;
        case 'cascade':
          patterns = patternDetection.detectCascade();
          break;
        case 'trend_divergence':
          patterns = patternDetection.detectTrendDivergence();
          break;
        case 'gap':
          patterns = patternDetection.detectGaps();
          break;
        default:
          return res.status(400).json({
            success: false,
            error: `Unknown detector type: ${type}`,
          });
      }

      res.json({
        success: true,
        type,
        patternsDetected: patterns.length,
        patterns,
      });
    } catch (error: any) {
      console.error(`[pattern-detection] Error running ${req.params.type} detector:`, error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to run detector',
      });
    }
  });

  // ===== SCHEDULER ENDPOINTS =====

  // GET /api/patterns/scheduler/status — get scheduler status
  router.get('/patterns/scheduler/status', (req, res) => {
    try {
      const status = scheduler.getStatus();
      res.json({ success: true, ...status });
    } catch (error: any) {
      console.error('[pattern-scheduler] Error getting status:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // POST /api/patterns/scheduler/start — start scheduler
  router.post('/patterns/scheduler/start', (req, res) => {
    try {
      scheduler.start();
      const status = scheduler.getStatus();
      res.json({ success: true, message: 'Scheduler started', ...status });
    } catch (error: any) {
      console.error('[pattern-scheduler] Error starting scheduler:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // POST /api/patterns/scheduler/stop — stop scheduler
  router.post('/patterns/scheduler/stop', (req, res) => {
    try {
      scheduler.stop();
      const status = scheduler.getStatus();
      res.json({ success: true, message: 'Scheduler stopped', ...status });
    } catch (error: any) {
      console.error('[pattern-scheduler] Error stopping scheduler:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // PUT /api/patterns/scheduler/config — update scheduler config
  router.put('/patterns/scheduler/config', (req, res) => {
    try {
      const { enabled, cronExpression, detectorTypes } = req.body;
      scheduler.updateConfig({ enabled, cronExpression, detectorTypes });
      const status = scheduler.getStatus();
      res.json({ success: true, message: 'Scheduler config updated', ...status });
    } catch (error: any) {
      console.error('[pattern-scheduler] Error updating config:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // POST /api/patterns/scheduler/run-now — run detection manually
  router.post('/patterns/scheduler/run-now', async (req, res) => {
    try {
      const result = await scheduler.runManual();
      res.json(result);
    } catch (error: any) {
      console.error('[pattern-scheduler] Error running manual detection:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // GET /api/patterns/scheduler/history — get recent runs
  router.get('/patterns/scheduler/history', (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
      const runs = scheduler.getRecentRuns(limit);
      res.json({ success: true, runs, count: runs.length });
    } catch (error: any) {
      console.error('[pattern-scheduler] Error getting history:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Auto-start scheduler on server startup (if enabled in config)
  scheduler.start();

  return router;
}
