import { Router } from 'express';
import type { DatabaseAdapter } from '../db/database.js';
import { randomUUID } from 'crypto';
import { createCodingEngine } from '../services/coding-engine.js';

export async function createCodingScriptsRoutes(db: DatabaseAdapter): Router {
  const router = Router();
  const codingEngine = await createCodingEngine(db);

  // ── Tier 2: Script Lite ──────────────────────────────────────────────────

  // POST /api/coding/script-lite/clarify — Get clarifying questions via Claude
  router.post('/coding/script-lite/clarify', async (req, res) => {
    try {
      const { description, data_sample } = req.body;
      if (!description) return res.status(400).json({ error: 'description is required' });

      const { systemPrompt, userMessage } = codingEngine.buildClarifyPrompt(
        description,
        data_sample,
        'lite',
      );

      res.json({
        systemPrompt,
        userMessage,
        moduleId: 'script-lite',
        areaId: 'coding',
      });
    } catch (error) {
      console.error('[coding-scripts] Clarify error:', error);
      res.status(500).json({ error: 'Failed to generate clarification prompt' });
    }
  });

  // POST /api/coding/script-lite — Generate script
  router.post('/coding/script-lite', async (req, res) => {
    try {
      const { description, data_sample, constraints, clarification_answers } = req.body;
      if (!description) return res.status(400).json({ error: 'description is required' });

      // Build a structured brief from description + clarification answers
      const brief = codingEngine.assembleBrief(
        description,
        clarification_answers || {},
        data_sample,
      );

      // Build the generation prompt for the frontend to send through /api/claude/message
      const { systemPrompt, userMessage } = codingEngine.buildScriptLitePrompt(brief, constraints);

      // Create a session to track this generation
      const sessionId = randomUUID();
      const title = `Script: ${description.slice(0, 80)}${description.length > 80 ? '...' : ''}`;
      const config = {
        tier: 'lite',
        description,
        data_sample: data_sample || null,
        constraints: constraints || null,
        clarification_answers: clarification_answers || null,
        brief,
      };

      await db.run(`
        INSERT INTO sessions (id, module_id, title, config, created_at)
        VALUES (?, ?, ?, ?, datetime('now'))
      `, sessionId, 'script-lite', title, JSON.stringify(config));

      res.json({
        id: sessionId,
        scriptPrompt: userMessage,
        systemPromptOverride: systemPrompt,
        moduleId: 'script-lite',
        areaId: 'coding',
      });
    } catch (error) {
      console.error('[coding-scripts] Script Lite error:', error);
      res.status(500).json({ error: 'Failed to generate script prompt' });
    }
  });

  // POST /api/coding/script-lite/preview — Run preview in sandbox
  // TODO: Implement sandbox execution using connection-manager.ts when available.
  //       Should accept { script, data_sample }, execute in a sandboxed environment,
  //       and return { stdout, stderr, exitCode, executionTime }.
  router.post('/coding/script-lite/preview', async (req, res) => {
    try {
      const { script, data_sample } = req.body;
      if (!script) return res.status(400).json({ error: 'script is required' });

      // Sandbox execution not yet implemented
      res.json({ status: 'preview_not_configured', message: 'Script preview requires sandbox configuration' });
    } catch (error) {
      console.error('[coding-scripts] Preview error:', error);
      res.status(500).json({ error: 'Failed to preview script' });
    }
  });

  // POST /api/coding/script-lite/:id/save — Save generated script output
  router.post('/coding/script-lite/:id/save', async (req, res) => {
    try {
      const { id } = req.params;
      const { script, explanation, dependencies } = req.body;

      const session = await db.get(
        'SELECT id, config FROM sessions WHERE id = ? AND module_id = ?'
      , id, 'script-lite') as { id: string; config: string } | undefined;

      if (!session) return res.status(404).json({ error: 'Script session not found' });

      const config = JSON.parse(session.config || '{}');
      config.generated = {
        script: script || null,
        explanation: explanation || null,
        dependencies: dependencies || null,
        saved_at: new Date().toISOString(),
      };

      await db.run(`
        UPDATE sessions SET config = ?, updated_at = datetime('now')
        WHERE id = ?
      `, JSON.stringify(config), id);

      res.json({ id, status: 'saved' });
    } catch (error) {
      console.error('[coding-scripts] Save error:', error);
      res.status(500).json({ error: 'Failed to save script' });
    }
  });

  // GET /api/coding/script-lite/history — List previous generations
  router.get('/coding/script-lite/history', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const sessions = await db.all(`
        SELECT s.* FROM sessions s
        WHERE s.module_id = 'script-lite'
        ORDER BY s.created_at DESC
        LIMIT ?
      `, limit);
      res.json(sessions);
    } catch (error) {
      console.error('[coding-scripts] History error:', error);
      res.status(500).json({ error: 'Failed to load history' });
    }
  });

  // GET /api/coding/script-lite/:id — Get specific script
  router.get('/coding/script-lite/:id', async (req, res) => {
    try {
      const session = await db.get(
        'SELECT * FROM sessions WHERE id = ? AND module_id = ?'
      , req.params.id, 'script-lite');
      if (!session) return res.status(404).json({ error: 'Script not found' });
      res.json(session);
    } catch (error) {
      console.error('[coding-scripts] Get error:', error);
      res.status(500).json({ error: 'Failed to get script' });
    }
  });

  // ── Tier 3: Script Medium ────────────────────────────────────────────────

  // POST /api/coding/script-medium/clarify — Get clarifying questions via Claude
  router.post('/coding/script-medium/clarify', async (req, res) => {
    try {
      const { description, app_type } = req.body;
      if (!description) return res.status(400).json({ error: 'description is required' });

      const { systemPrompt, userMessage } = codingEngine.buildClarifyPrompt(
        description,
        undefined,
        'medium',
      );

      res.json({
        systemPrompt,
        userMessage,
        moduleId: 'script-medium',
        areaId: 'coding',
      });
    } catch (error) {
      console.error('[coding-scripts] Clarify error:', error);
      res.status(500).json({ error: 'Failed to generate clarification prompt' });
    }
  });

  // POST /api/coding/script-medium — Generate application (or live preview)
  router.post('/coding/script-medium', async (req, res) => {
    try {
      const { description, app_type, constraints, clarification_answers, preview_mode } = req.body;
      if (!description || !app_type) {
        return res.status(400).json({ error: 'description and app_type are required' });
      }

      // Build a structured brief from description + clarification answers
      const brief = codingEngine.assembleBrief(
        description,
        clarification_answers || {},
      );

      // Use preview mode prompt when preview_mode is toggled ON
      const { systemPrompt, userMessage } = preview_mode
        ? codingEngine.buildPreviewModePrompt(brief, app_type, constraints)
        : codingEngine.buildScriptMediumPrompt(brief, app_type, constraints);

      // Create a session to track this generation
      const sessionId = randomUUID();
      const title = `${preview_mode ? 'Preview' : 'App'}: ${description.slice(0, 80)}${description.length > 80 ? '...' : ''}`;
      const config = {
        tier: 'medium',
        description,
        app_type,
        constraints: constraints || null,
        clarification_answers: clarification_answers || null,
        brief,
        preview_mode: preview_mode || false,
      };

      await db.run(`
        INSERT INTO sessions (id, module_id, title, config, created_at)
        VALUES (?, ?, ?, ?, datetime('now'))
      `, sessionId, 'script-medium', title, JSON.stringify(config));

      res.json({
        id: sessionId,
        appPrompt: userMessage,
        systemPromptOverride: systemPrompt,
        moduleId: 'script-medium',
        areaId: 'coding',
        app_type,
        preview_mode: preview_mode || false,
      });
    } catch (error) {
      console.error('[coding-scripts] Script Medium error:', error);
      res.status(500).json({ error: 'Failed to generate application prompt' });
    }
  });

  // POST /api/coding/script-medium/preview — Launch preview
  // TODO: Implement sandbox execution for multi-file apps.
  //       Should spin up an isolated environment, install dependencies,
  //       and return a preview URL or execution output.
  router.post('/coding/script-medium/preview', async (req, res) => {
    try {
      const { project_id, app_type } = req.body;
      res.json({ status: 'preview_not_configured', message: 'Application preview requires sandbox configuration' });
    } catch (error) {
      console.error('[coding-scripts] Preview error:', error);
      res.status(500).json({ error: 'Failed to launch preview' });
    }
  });

  // POST /api/coding/script-medium/iterate — Submit iteration feedback
  router.post('/coding/script-medium/iterate', async (req, res) => {
    try {
      const { session_id, feedback, previous_output, app_type } = req.body;
      if (!session_id || !feedback) {
        return res.status(400).json({ error: 'session_id and feedback are required' });
      }

      // Verify the session exists
      const session = await db.get(
        'SELECT id FROM sessions WHERE id = ? AND module_id = ?'
      , session_id, 'script-medium') as { id: string } | undefined;

      if (!session) return res.status(404).json({ error: 'Session not found' });

      const { systemPrompt, userMessage } = codingEngine.buildIterationPrompt(
        previous_output || '',
        feedback,
        app_type || 'web-app',
      );

      res.json({
        iterationPrompt: userMessage,
        systemPromptOverride: systemPrompt,
        moduleId: 'script-medium',
        areaId: 'coding',
      });
    } catch (error) {
      console.error('[coding-scripts] Iterate error:', error);
      res.status(500).json({ error: 'Failed to build iteration prompt' });
    }
  });

  // POST /api/coding/script-medium/convert — Convert preview HTML to production multi-file app
  router.post('/coding/script-medium/convert', async (req, res) => {
    try {
      const { session_id, preview_html, app_type, constraints } = req.body;
      if (!session_id || !preview_html || !app_type) {
        return res.status(400).json({ error: 'session_id, preview_html, and app_type are required' });
      }

      // Verify the session exists
      const session = await db.get(
        'SELECT id FROM sessions WHERE id = ? AND module_id = ?'
      , session_id, 'script-medium') as { id: string } | undefined;

      if (!session) return res.status(404).json({ error: 'Session not found' });

      const { systemPrompt, userMessage } = codingEngine.buildConvertToProductionPrompt(
        preview_html,
        app_type,
        constraints,
      );

      res.json({
        convertPrompt: userMessage,
        systemPromptOverride: systemPrompt,
        moduleId: 'script-medium',
        areaId: 'coding',
      });
    } catch (error) {
      console.error('[coding-scripts] Convert error:', error);
      res.status(500).json({ error: 'Failed to build conversion prompt' });
    }
  });

  // POST /api/coding/script-medium/:id/save — Save generated application files
  router.post('/coding/script-medium/:id/save', async (req, res) => {
    try {
      const { id } = req.params;
      const { files } = req.body;

      if (!files || !Array.isArray(files)) {
        return res.status(400).json({ error: 'files array is required' });
      }

      const session = await db.get(
        'SELECT id, config FROM sessions WHERE id = ? AND module_id = ?'
      , id, 'script-medium') as { id: string; config: string } | undefined;

      if (!session) return res.status(404).json({ error: 'Application session not found' });

      const config = JSON.parse(session.config || '{}');
      config.generated_files = files.map((f: { path: string; content: string; language?: string }) => ({
        path: f.path,
        content: f.content,
        language: f.language || null,
      }));
      config.saved_at = new Date().toISOString();

      await db.run(`
        UPDATE sessions SET config = ?, updated_at = datetime('now')
        WHERE id = ?
      `, JSON.stringify(config), id);

      res.json({ id, status: 'saved' });
    } catch (error) {
      console.error('[coding-scripts] Save error:', error);
      res.status(500).json({ error: 'Failed to save application files' });
    }
  });

  // GET /api/coding/script-medium/:id — Get specific generation
  router.get('/coding/script-medium/:id', async (req, res) => {
    try {
      const session = await db.get(
        'SELECT * FROM sessions WHERE id = ? AND module_id = ?'
      , req.params.id, 'script-medium');
      if (!session) return res.status(404).json({ error: 'Application not found' });
      res.json(session);
    } catch (error) {
      console.error('[coding-scripts] Get error:', error);
      res.status(500).json({ error: 'Failed to get application' });
    }
  });

  // GET /api/coding/script-medium/:id/files — List generated files
  router.get('/coding/script-medium/:id/files', async (req, res) => {
    try {
      const session = await db.get('SELECT config FROM sessions WHERE id = ? AND module_id = ?', req.params.id, 'script-medium') as { config: string } | undefined;
      if (!session) return res.status(404).json({ error: 'Application not found' });

      const config = JSON.parse(session.config || '{}');
      const files = config.generated_files || [];

      res.json({
        files: files.map((f: { path: string; content: string; language?: string }) => ({
          path: f.path,
          language: f.language || null,
          size: f.content ? f.content.length : 0,
        })),
        message: files.length > 0
          ? `${files.length} file(s) saved`
          : 'No files generated yet — run the generation first',
      });
    } catch (error) {
      console.error('[coding-scripts] Files error:', error);
      res.status(500).json({ error: 'Failed to list files' });
    }
  });

  return router;
}
