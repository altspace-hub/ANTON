import { Router } from 'express';
import type { DatabaseAdapter } from '../db/database.js';
import { randomUUID } from 'crypto';
import { createCodingEngine } from '../services/coding-engine.js';
import { ownerFilter } from '../middleware/ownership.js';

export async function createCodingScriptsRoutes(db: DatabaseAdapter): Promise<Router> {
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
        INSERT INTO sessions (id, module_id, title, config, user_id, created_at)
        VALUES (?, ?, ?, ?, ?, NOW())
      `, sessionId, 'script-lite', title, JSON.stringify(config), req.user?.id ?? null);

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

  // POST /api/coding/script-lite/preview — REAL sandbox execution (Wave 4.11).
  // Executes the generated script in a throwaway temp dir via execFile
  // (args array, minimal env, 10 s timeout, output cap, dir deleted after).
  // On failure: ONE auto-fix round through the configured utility model,
  // then one re-run. Both attempts come back honestly; `badge` drives the
  // "ran against sample data ✓ / failed ✗" UI. See SANDBOX_LIMITS in the
  // response for the documented limits (network is NOT blocked — local
  // process, not a container).
  router.post('/coding/script-lite/preview', async (req, res) => {
    try {
      const { script, data_sample, language } = req.body as { script?: string; data_sample?: string; language?: string };
      if (!script || typeof script !== 'string') return res.status(400).json({ error: 'script is required' });
      if (script.length > 200_000) return res.status(400).json({ error: 'script too large for preview (200 KB cap)' });

      const { runPreviewWithAutofix, extractCodeBlock } = await import('../services/script-sandbox.js');

      // One auto-fix round via the configured utility model (same model that
      // powers other background fixes). Fixer failures degrade to an honest
      // "failed, no usable correction" — never a fake pass.
      const fixScript = async (failingScript: string, errorOutput: string): Promise<string | null> => {
        const { callChat } = await import('../services/provider-router.js');
        const { getRoutedUtilityModel } = await import('../services/utility-model.js');
        const model = await getRoutedUtilityModel(db);
        const chat = await callChat({
          model,
          system:
            'You fix broken data-analysis scripts. You receive a script and the error it produced when run. ' +
            'Return ONLY the corrected, complete script in a single fenced code block — no prose. ' +
            'Do not add network calls or new dependencies; keep the script\'s intent unchanged.',
          messages: [{
            role: 'user',
            content: `The following script failed.\n\nSCRIPT:\n\`\`\`\n${failingScript.slice(0, 30_000)}\n\`\`\`\n\nERROR OUTPUT:\n\`\`\`\n${errorOutput}\n\`\`\`\n\nReturn the corrected script.`,
          }],
          maxTokens: 8_000,
          temperature: 0,
          db,
        });
        return extractCodeBlock(chat.text ?? '');
      };

      const result = await runPreviewWithAutofix({
        script,
        dataSample: typeof data_sample === 'string' ? data_sample : undefined,
        languageHint: typeof language === 'string' ? language : undefined,
        fixScript,
      });
      res.json(result);
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

      const scope = ownerFilter(req, 'user_id');
      const session = await db.get(
        `SELECT id, config FROM sessions WHERE id = ? AND module_id = ?${scope.sql}`
      , id, 'script-lite', ...scope.params) as { id: string; config: string } | undefined;

      if (!session) return res.status(404).json({ error: 'Script session not found' });

      const config = JSON.parse(session.config || '{}');
      config.generated = {
        script: script || null,
        explanation: explanation || null,
        dependencies: dependencies || null,
        saved_at: new Date().toISOString(),
      };

      await db.run(`
        UPDATE sessions SET config = ?, updated_at = NOW()
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
      const scope = ownerFilter(req, 's.user_id');
      const sessions = await db.all(`
        SELECT s.* FROM sessions s
        WHERE s.module_id = 'script-lite'${scope.sql}
        ORDER BY s.created_at DESC
        LIMIT ?
      `, ...scope.params, limit);
      res.json(sessions);
    } catch (error) {
      console.error('[coding-scripts] History error:', error);
      res.status(500).json({ error: 'Failed to load history' });
    }
  });

  // GET /api/coding/script-lite/:id — Get specific script
  router.get('/coding/script-lite/:id', async (req, res) => {
    try {
      const scope = ownerFilter(req, 'user_id');
      const session = await db.get(
        `SELECT * FROM sessions WHERE id = ? AND module_id = ?${scope.sql}`
      , req.params.id, 'script-lite', ...scope.params);
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
        INSERT INTO sessions (id, module_id, title, config, user_id, created_at)
        VALUES (?, ?, ?, ?, ?, NOW())
      `, sessionId, 'script-medium', title, JSON.stringify(config), req.user?.id ?? null);

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

      // Verify the session exists AND belongs to the caller
      const scope = ownerFilter(req, 'user_id');
      const session = await db.get(
        `SELECT id FROM sessions WHERE id = ? AND module_id = ?${scope.sql}`
      , session_id, 'script-medium', ...scope.params) as { id: string } | undefined;

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

      // Verify the session exists AND belongs to the caller
      const scope = ownerFilter(req, 'user_id');
      const session = await db.get(
        `SELECT id FROM sessions WHERE id = ? AND module_id = ?${scope.sql}`
      , session_id, 'script-medium', ...scope.params) as { id: string } | undefined;

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

      const scope = ownerFilter(req, 'user_id');
      const session = await db.get(
        `SELECT id, config FROM sessions WHERE id = ? AND module_id = ?${scope.sql}`
      , id, 'script-medium', ...scope.params) as { id: string; config: string } | undefined;

      if (!session) return res.status(404).json({ error: 'Application session not found' });

      const config = JSON.parse(session.config || '{}');
      config.generated_files = files.map((f: { path: string; content: string; language?: string }) => ({
        path: f.path,
        content: f.content,
        language: f.language || null,
      }));
      config.saved_at = new Date().toISOString();

      await db.run(`
        UPDATE sessions SET config = ?, updated_at = NOW()
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
      const scope = ownerFilter(req, 'user_id');
      const session = await db.get(
        `SELECT * FROM sessions WHERE id = ? AND module_id = ?${scope.sql}`
      , req.params.id, 'script-medium', ...scope.params);
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
      const scope = ownerFilter(req, 'user_id');
      const session = await db.get(`SELECT config FROM sessions WHERE id = ? AND module_id = ?${scope.sql}`, req.params.id, 'script-medium', ...scope.params) as { config: string } | undefined;
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
