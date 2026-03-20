/**
 * Pattern Detection Scheduler
 *
 * Automatically runs pattern detection algorithms on a schedule
 * using node-cron. Supports configurable schedules and detector selection.
 */

import cron, { ScheduledTask } from 'node-cron';
import type { DatabaseAdapter } from '../db/database.js';
import { createPatternDetection } from './pattern-detection.js';

export interface ScheduleConfig {
  enabled: boolean;
  cronExpression: string; // e.g., '0 */4 * * *' (every 4 hours)
  detectorTypes?: string[]; // If specified, only run these detectors
}

export async function createPatternScheduler(db: DatabaseAdapter) {
  const patternDetection = await createPatternDetection(db);
  let scheduledTask: ScheduledTask | null = null;
  let config: ScheduleConfig = {
    enabled: true,
    cronExpression: '0 */6 * * *', // Default: every 6 hours
  };

  /**
   * Start the scheduler with given configuration
   */
  function start(userConfig?: Partial<ScheduleConfig>) {
    if (userConfig) {
      config = { ...config, ...userConfig };
    }

    // Stop existing task if any
    if (scheduledTask) {
      scheduledTask.stop();
      scheduledTask = null;
    }

    if (!config.enabled) {
      console.log('[pattern-scheduler] Scheduler is disabled');
      return;
    }

    // Validate cron expression
    if (!cron.validate(config.cronExpression)) {
      console.error(`[pattern-scheduler] Invalid cron expression: ${config.cronExpression}`);
      return;
    }

    // Schedule the task
    scheduledTask = cron.schedule(config.cronExpression, async () => {
      console.log('[pattern-scheduler] Running scheduled pattern detection...');
      try {
        const startTime = Date.now();
        const result = patternDetection.runAllDetectors();
        const duration = Date.now() - startTime;

        console.log(`[pattern-scheduler] Completed in ${duration}ms. Patterns detected: ${result.patternsDetected}`);

        // Log to detection history
        logDetectionRun({
          run_time: new Date().toISOString(),
          patterns_detected: result.patternsDetected ?? 0,
          duration_ms: duration,
          status: 'success',
        });
      } catch (error) {
        console.error('[pattern-scheduler] Error during scheduled detection:', error);

        logDetectionRun({
          run_time: new Date().toISOString(),
          patterns_detected: 0,
          duration_ms: 0,
          status: 'error',
          error_message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    console.log(`[pattern-scheduler] Scheduler started with cron: ${config.cronExpression}`);
  }

  /**
   * Stop the scheduler
   */
  function stop() {
    if (scheduledTask) {
      scheduledTask.stop();
      scheduledTask = null;
      console.log('[pattern-scheduler] Scheduler stopped');
    }
  }

  /**
   * Get current scheduler status
   */
  function getStatus() {
    return {
      enabled: config.enabled,
      cronExpression: config.cronExpression,
      isRunning: scheduledTask !== null,
      lastRun: getLastRunInfo(),
      recentRuns: getRecentRuns(10),
    };
  }

  /**
   * Update scheduler configuration
   */
  function updateConfig(newConfig: Partial<ScheduleConfig>) {
    const wasRunning = scheduledTask !== null;
    stop();

    config = { ...config, ...newConfig };

    // Save to database for persistence
    saveConfig(config);

    if (wasRunning && config.enabled) {
      start();
    }
  }

  /**
   * Run detectors manually (outside schedule)
   */
  async function runManual() {
    console.log('[pattern-scheduler] Running manual detection...');
    const startTime = Date.now();

    try {
      const result = patternDetection.runAllDetectors();
      const duration = Date.now() - startTime;

      logDetectionRun({
        run_time: new Date().toISOString(),
        patterns_detected: result.patternsDetected,
        duration_ms: duration,
        status: 'success',
        is_manual: true,
      });

      return { success: true, ...result, duration_ms: duration };
    } catch (error) {
      const duration = Date.now() - startTime;

      logDetectionRun({
        run_time: new Date().toISOString(),
        patterns_detected: 0,
        duration_ms: duration,
        status: 'error',
        error_message: error instanceof Error ? error.message : 'Unknown error',
        is_manual: true,
      });

      throw error;
    }
  }

  /**
   * Log detection run to database
   */
  async function logDetectionRun(data: {
    run_time: string;
    patterns_detected: number;
    duration_ms: number;
    status: 'success' | 'error';
    error_message?: string;
    is_manual?: boolean;
  }) {
    try {
      await db.run(`
        INSERT INTO pattern_detection_runs (run_time, patterns_detected, duration_ms, status, error_message, is_manual)
        VALUES (?, ?, ?, ?, ?, ?)
      `, data.run_time,
        data.patterns_detected,
        data.duration_ms,
        data.status,
        data.error_message || null,
        data.is_manual ? 1 : 0);
    } catch (error) {
      console.error('[pattern-scheduler] Failed to log detection run:', error);
    }
  }

  /**
   * Get last run information
   */
  async function getLastRunInfo() {
    try {
      return await db.all(`
        SELECT * FROM pattern_detection_runs
        ORDER BY run_time DESC
        LIMIT 1
      `) as any;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get recent runs
   */
  async function getRecentRuns(limit = 10) {
    try {
      return await db.get(`
        SELECT * FROM pattern_detection_runs
        ORDER BY run_time DESC
        LIMIT ?
      `, limit) as any[];
    } catch (error) {
      return [];
    }
  }

  /**
   * Save configuration to database
   */
  async function saveConfig(config: ScheduleConfig) {
    try {
      await db.run(`
        INSERT INTO pattern_scheduler_config (id, enabled, cron_expression, detector_types, updated_at)
        VALUES (1, ?, ?, ?, ?)
        ON CONFLICT (id) DO UPDATE SET
          enabled = EXCLUDED.enabled,
          cron_expression = EXCLUDED.cron_expression,
          detector_types = EXCLUDED.detector_types,
          updated_at = EXCLUDED.updated_at
      `,
        config.enabled ? 1 : 0,
        config.cronExpression,
        config.detectorTypes ? JSON.stringify(config.detectorTypes) : null,
        new Date().toISOString()
      );
    } catch (error) {
      console.error('[pattern-scheduler] Failed to save config:', error);
    }
  }

  /**
   * Load configuration from database
   */
  function loadConfig(): ScheduleConfig {
    try {

      if (row) {
        return {
          enabled: row.enabled === 1,
          cronExpression: row.cron_expression,
          detectorTypes: row.detector_types ? JSON.parse(row.detector_types) : undefined,
        };
      }
    } catch (error) {
      console.log('[pattern-scheduler] No saved config found, using defaults');
    }

    return config;
  }

  // Load saved config on initialization
  const savedConfig = loadConfig();
  if (savedConfig) {
    config = savedConfig;
  }

  return {
    start,
    stop,
    getStatus,
    updateConfig,
    runManual,
    getRecentRuns,
  };
}

export type PatternScheduler = ReturnType<typeof createPatternScheduler>;
