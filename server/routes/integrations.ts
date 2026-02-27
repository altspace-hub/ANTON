/**
 * Integrations Routes — /api/integrations/*
 *
 * Handles:
 *   - Slack/Teams outbound webhook test + send
 *   - Inbound Slack slash commands (HMAC-verified)
 */

import { Router, type Request, type Response } from 'express';
import type Database from 'better-sqlite3';
import { sendSlackMessage, testSlackWebhook } from '../services/integrations/slack-webhook.js';
import { sendTeamsMessage, testTeamsWebhook } from '../services/integrations/teams-webhook.js';
import { substituteVariables, type MessagePayload } from '../services/integrations/message-formatter.js';
import { decryptConfig } from '../services/credential-vault.js';
import { verifySlackSignature, handleSlackCommand, type SlackCommandPayload } from '../services/integrations/slack-commands.js';

export function createIntegrationsRoutes(db: Database.Database) {
  const router = Router();

  // ── Test a messaging connection ────────────────────────────────────────────

  /**
   * POST /api/integrations/test
   * Test a saved messaging connection by sending a test message.
   * Body: { connectionId: string }
   */
  router.post('/integrations/test', async (req, res) => {
    const { connectionId } = req.body as { connectionId: string };
    if (!connectionId) return res.status(400).json({ error: 'connectionId required' });

    const conn = db.prepare("SELECT * FROM connections WHERE id = ? AND type = 'messaging'").get(connectionId) as {
      id: string; config: string; display_name: string;
    } | undefined;

    if (!conn) return res.status(404).json({ error: 'Messaging connection not found' });

    const cfg = decryptConfig(JSON.parse(conn.config) as Record<string, unknown>) as Record<string, unknown>;
    const platform = cfg.platform as string;
    const webhookUrl = cfg.webhook_url as string;

    try {
      if (platform === 'slack') {
        const result = await testSlackWebhook(webhookUrl);
        res.json(result);
      } else if (platform === 'teams') {
        const result = await testTeamsWebhook(webhookUrl);
        res.json(result);
      } else {
        res.status(400).json({ error: `Unknown platform: ${platform}` });
      }
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

  // ── Send a direct message via a connection ─────────────────────────────────

  /**
   * POST /api/integrations/send
   * Send a message via a saved messaging connection.
   * Body: {
   *   connectionId: string;
   *   title: string;
   *   body: string;
   *   url?: string;
   *   level?: 'info' | 'success' | 'warning' | 'error';
   *   fields?: Array<{ label: string; value: string }>;
   *   variables?: Record<string, string>;   // For template substitution
   * }
   */
  router.post('/integrations/send', async (req, res) => {
    const { connectionId, variables, ...msgRaw } = req.body as {
      connectionId: string;
      variables?: Record<string, string>;
      title: string;
      body: string;
      url?: string;
      level?: MessagePayload['level'];
      fields?: MessagePayload['fields'];
    };

    if (!connectionId) return res.status(400).json({ error: 'connectionId required' });
    if (!msgRaw.title || !msgRaw.body) return res.status(400).json({ error: 'title and body required' });

    const conn = db.prepare("SELECT * FROM connections WHERE id = ? AND type = 'messaging' AND status = 'active'").get(connectionId) as {
      id: string; config: string;
    } | undefined;

    if (!conn) return res.status(404).json({ error: 'Active messaging connection not found' });

    const cfg = decryptConfig(JSON.parse(conn.config) as Record<string, unknown>) as Record<string, unknown>;
    const platform = cfg.platform as string;
    const webhookUrl = cfg.webhook_url as string;

    // Apply variable substitution if provided
    const msg: MessagePayload = {
      ...msgRaw,
      title: variables ? substituteVariables(msgRaw.title, variables) : msgRaw.title,
      body: variables ? substituteVariables(msgRaw.body, variables) : msgRaw.body,
    };

    try {
      if (platform === 'slack') {
        const result = await sendSlackMessage({ webhookUrl }, msg);
        // Audit log
        db.prepare(
          `INSERT INTO connection_audit_log (connection_id, action, details, result_summary, executed_by)
           VALUES (?, 'send_message', ?, ?, ?)`
        ).run(connectionId, JSON.stringify({ title: msg.title }), result.ok ? 'success' : result.error, 'system');
        res.json(result);
      } else if (platform === 'teams') {
        const result = await sendTeamsMessage({ webhookUrl }, msg);
        db.prepare(
          `INSERT INTO connection_audit_log (connection_id, action, details, result_summary, executed_by)
           VALUES (?, 'send_message', ?, ?, ?)`
        ).run(connectionId, JSON.stringify({ title: msg.title }), result.ok ? 'success' : result.error, 'system');
        res.json(result);
      } else {
        res.status(400).json({ error: `Unknown platform: ${platform}` });
      }
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

  // ── Inbound Slack slash commands ──────────────────────────────────────────

  /**
   * POST /api/integrations/slack/commands
   * Receives Slack slash command payloads (e.g. /anton brief What is AMLR?).
   *
   * Setup in Slack app:
   *   - Slash Commands → Request URL: https://<your-server>/api/integrations/slack/commands
   *   - Env: SLACK_SIGNING_SECRET (from Slack app Basic Information → Signing Secret)
   */
  router.post('/integrations/slack/commands', async (req: Request, res: Response) => {
    const signingSecret = process.env.SLACK_SIGNING_SECRET;
    if (!signingSecret) {
      // If no signing secret set, reject all inbound commands
      return res.status(503).json({ error: 'Slack slash commands not configured (SLACK_SIGNING_SECRET not set)' });
    }

    // Verify signature (requires raw body — set up via express.urlencoded middleware)
    const timestamp = req.headers['x-slack-request-timestamp'] as string;
    const signature = req.headers['x-slack-signature'] as string;
    const rawBody = (req as Request & { rawBody?: string }).rawBody
      || new URLSearchParams(req.body as Record<string, string>).toString();

    if (!timestamp || !signature) {
      return res.status(401).json({ error: 'Missing Slack signature headers' });
    }

    const valid = verifySlackSignature({ signingSecret, rawBody, timestamp, signature });
    if (!valid) {
      return res.status(401).json({ error: 'Invalid Slack signature' });
    }

    // Parse the URL-encoded body (Slack sends application/x-www-form-urlencoded)
    const payload = req.body as SlackCommandPayload;

    // Slack requires a response within 3 seconds — return immediately
    res.status(200).json({ response_type: 'ephemeral', text: '⏳ ANTON is thinking...' });

    // Process command asynchronously and post result to response_url
    (async () => {
      try {
        const result = await handleSlackCommand(payload, db);

        // Post result to Slack's response_url
        await fetch(payload.response_url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(result),
        });
      } catch (err) {
        console.error('[integrations] Slack command processing error:', err);
        // Try to post error to response_url
        await fetch(payload.response_url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ response_type: 'ephemeral', text: '❌ ANTON encountered an error processing your command.' }),
        }).catch(() => {});
      }
    })();
  });

  // ── List messaging connections ─────────────────────────────────────────────

  /**
   * GET /api/integrations/connections
   * List all messaging connections (active only for non-admins).
   */
  router.get('/integrations/connections', (req, res) => {
    try {
      const isAdmin = (req as unknown as { user?: { role?: string } }).user?.role === 'admin';
      const rows = db.prepare(
        `SELECT id, display_name, status, created_at, last_tested, last_test_result
         FROM connections WHERE type = 'messaging' ${isAdmin ? '' : "AND status = 'active'"}
         ORDER BY created_at DESC`
      ).all() as Array<{ id: string; display_name: string; status: string; created_at: string; last_tested: string; last_test_result: string }>;

      // Return connections without decrypting config (webhook URLs are sensitive)
      const safe = rows.map(r => ({
        id: r.id,
        displayName: r.display_name,
        status: r.status,
        createdAt: r.created_at,
        lastTested: r.last_tested,
        lastTestResult: r.last_test_result,
      }));

      res.json({ connections: safe });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  return router;
}
