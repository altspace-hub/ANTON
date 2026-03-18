/**
 * bridges.ts
 * Channel Bridge Infrastructure — HTTP endpoints that external delivery systems
 * (WhatsApp bots, SMS gateways, Telegram bots) can call to query Claude via ANTON.
 *
 * Architecture:
 *   ANTON = expertise layer (generates secure per-partner HTTP endpoints)
 *   Partners = delivery layer (build bots, call ANTON's bridge endpoint)
 *
 * Storage: existing `connections` table with type = 'channel_bridge'
 *
 * Two export groups:
 *   createBridgePublicRoutes — the public query endpoint (register BEFORE auth middleware)
 *   createBridgeRoutes       — admin CRUD (register AFTER auth middleware)
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import type { DatabaseAdapter } from '../db/database.js';

import crypto from 'crypto';
import type Anthropic from '@anthropic-ai/sdk';
import { requireAdminOrSolo } from '../middleware/auth.js';
import { encryptConfig, decryptConfig } from '../services/credential-vault.js';
import { getClient } from '../services/claude-client.js';
import { callChat, mapModelToProvider } from '../services/provider-router.js';

// ── Types ──────────────────────────────────────────────────

export type ChannelType = 'whatsapp' | 'telegram' | 'sms' | 'voice' | 'generic_http';

export interface BridgeConfig {
  channel_type: ChannelType;
  token: string;
  allowed_modules: string[];
  default_module: string;
  rate_limit_rpm: number;
  max_response_length: number;
  language_hint: string;
  call_count: number;
  last_called_at: string | null;
}

interface RawConnectionRow {
  id: string;
  display_name: string;
  type: string;
  config: string;
  permissions: string;
  created_by: string;
  approved_by: string | null;
  approved_at: string | null;
  status: string;
  last_tested: string | null;
  last_test_result: string | null;
  created_at: string;
  updated_at: string;
}

const VALID_CHANNEL_TYPES: ChannelType[] = ['whatsapp', 'telegram', 'sms', 'voice', 'generic_http'];

function getBaseUrl(): string {
  return process.env.BASE_URL || `http://localhost:${process.env.PORT || 3001}`;
}

function parseBridgeRow(row: RawConnectionRow, showToken = false) {
  const rawConfig = JSON.parse(row.config || '{}') as Record<string, unknown>;
  const config = decryptConfig(rawConfig) as unknown as BridgeConfig;
  return {
    id: row.id,
    display_name: row.display_name,
    type: row.type,
    status: row.status,
    created_by: row.created_by,
    approved_by: row.approved_by ?? undefined,
    approved_at: row.approved_at ?? undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
    endpoint_url: `${getBaseUrl()}/api/bridges/${row.id}/query`,
    config: {
      channel_type: config.channel_type,
      allowed_modules: config.allowed_modules ?? ['*'],
      default_module: config.default_module ?? 'gap-analysis',
      rate_limit_rpm: config.rate_limit_rpm ?? 60,
      max_response_length: config.max_response_length ?? 1500,
      language_hint: config.language_hint ?? 'en',
      call_count: config.call_count ?? 0,
      last_called_at: config.last_called_at ?? null,
      token: showToken ? (config.token ?? '') : '***',
    },
  };
}

// ── Public Routes (before auth middleware) ────────────────

/**
 * Register BEFORE app.use('/api', authMiddleware) in server/index.ts
 */
export async function createBridgePublicRoutes(db: Database, _anthropic?: Anthropic) {
  const router = Router();

  /**
   * POST /api/bridges/:id/query
   * Public endpoint — authenticated via per-bridge Bearer token.
   * Called by partner WhatsApp bots, SMS gateways, etc.
   */
  router.post('/bridges/:id/query', async (req: Request, res: Response) => {
    const bridgeId = String(req.params.id);

    try {
      // 1. Look up the bridge
      const row = await db.get("SELECT * FROM connections WHERE id = ? AND type = 'channel_bridge'", bridgeId) as RawConnectionRow | undefined;

      if (!row) {
        res.status(404).json({ error: 'Bridge not found' });
        return;
      }

      if (row.status !== 'active') {
        res.status(403).json({ error: 'Bridge is not active. Awaiting approval.' });
        return;
      }

      // 2. Validate Bearer token
      const authHeader = req.headers['authorization'] ?? '';
      if (!authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Authorization: Bearer <token> header required' });
        return;
      }
      const submittedToken = authHeader.substring(7).trim();

      const rawConfig = JSON.parse(row.config || '{}') as Record<string, unknown>;
      const bridgeConfig = decryptConfig(rawConfig) as unknown as BridgeConfig;
      const storedToken = bridgeConfig.token;

      if (!storedToken || submittedToken !== storedToken) {
        res.status(403).json({ error: 'Invalid token' });
        return;
      }

      // 3. Rate limiting via SQLite timestamp window
      const rateLimitRpm = Number(bridgeConfig.rate_limit_rpm ?? 60);
      const { count: recentCount } = await db.get(`
        SELECT COUNT(*) as count
        FROM connection_audit_log
        WHERE connection_id = ? AND action = 'query'
          AND executed_at > NOW() - INTERVAL '1 minute'
      `, bridgeId) as { count: number };

      if (recentCount >= rateLimitRpm) {
        res
          .status(429)
          .json({ error: 'Rate limit exceeded', retry_after_seconds: 60, rpm_limit: rateLimitRpm });
        return;
      }

      // 4. Parse and validate request body
      const { message, module_id, language } = req.body as {
        message?: string;
        module_id?: string;
        language?: string;
      };

      if (!message || typeof message !== 'string' || message.trim().length === 0) {
        res.status(400).json({ error: 'message field is required and must be non-empty' });
        return;
      }

      // 5. Check allowed modules
      const allowedModules = bridgeConfig.allowed_modules ?? ['*'];
      const requestedModule = module_id || bridgeConfig.default_module || 'gap-analysis';
      const moduleAllowed =
        allowedModules.includes('*') || allowedModules.includes(requestedModule);

      if (!moduleAllowed) {
        res.status(403).json({
          error: `Module '${requestedModule}' is not allowed for this bridge`,
          allowed_modules: allowedModules,
        });
        return;
      }

      // 6. Build plain-text system prompt (safe for all channels)
      const langHint = language || bridgeConfig.language_hint || 'en';
      const maxLength = Number(bridgeConfig.max_response_length ?? 1500);

      const systemPrompt = [
        `You are an expert AML/CFT and financial crime compliance assistant for openEXPERT.`,
        `You are responding via a messaging channel. Your response MUST be:`,
        `- Plain text only. No markdown formatting, no asterisks, no bullet symbols, no headers.`,
        `- Maximum ${maxLength} characters total.`,
        `- Clear, professional, and directly useful.`,
        `- Focused on financial crime prevention, AML, sanctions, KYC, regulatory compliance.`,
        `- If a question is outside compliance scope, explain briefly what you can help with.`,
        langHint !== 'en' ? `- Respond in language: ${langHint}` : '',
        `Module context: ${requestedModule}`,
      ]
        .filter(Boolean)
        .join('\n');

      // 7. Call AI (non-streaming — bridge clients expect a complete response)
      const startTime = Date.now();
      const result = await callChat({
        model: mapModelToProvider('claude-opus-4-6'),
        system: systemPrompt,
        messages: [{ role: 'user', content: message.trim() }],
        maxTokens: 1024,
      });
      const durationMs = Date.now() - startTime;

      let responseText = result.text;

      // Hard-truncate to max_response_length
      if (responseText.length > maxLength) {
        responseText = responseText.substring(0, maxLength - 3) + '...';
      }

      const tokensUsed =
        (result.inputTokens ?? 0) + (result.outputTokens ?? 0);

      // 8. Increment call count in config (best-effort, non-blocking)
      try {
        const updatedConfig = {
          ...rawConfig,
          call_count: (Number(rawConfig.call_count) || 0) + 1,
          last_called_at: new Date().toISOString(),
        };
        await db.run('UPDATE connections SET config = ?, updated_at = ? WHERE id = ?', 
          JSON.stringify(updatedConfig),
          new Date().toISOString(),
          bridgeId
        );
      } catch {
        // Non-critical — don't fail the request
      }

      // 9. Write audit entry
      await db.run(`
        INSERT INTO connection_audit_log
          (connection_id, execution_id, action, details, result_summary, executed_by)
        VALUES (?, NULL, 'query', ?, ?, 'bridge_client')
      `, 
        bridgeId,
        JSON.stringify({
          module: requestedModule,
          message_length: message.length,
          response_length: responseText.length,
          tokens_used: tokensUsed,
          duration_ms: durationMs,
          channel: bridgeConfig.channel_type,
        }),
        `Query: ${tokensUsed} tokens, ${responseText.length} chars`
      );

      res.json({
        response: responseText,
        module_used: requestedModule,
        tokens_used: tokensUsed,
        bridge_id: bridgeId,
      });
    } catch (err) {
      console.error('[bridges] query error:', err);
      res.status(500).json({ error: 'Failed to process query' });
    }
  });

  return router;
}

// ── Admin Routes (after auth middleware) ──────────────────

/**
 * Register AFTER app.use('/api', authMiddleware) in server/index.ts
 */
export async function createBridgeRoutes(db: Database, _anthropic?: Anthropic) {
  const router = Router();

  // GET /api/bridges — list all channel bridges
  router.get('/bridges', requireAdminOrSolo, async (_req: Request, res: Response) => {
    try {
      const rows = await db.all("SELECT * FROM connections WHERE type = 'channel_bridge' ORDER BY created_at DESC") as RawConnectionRow[];

      res.json(rows.map((row) => parseBridgeRow(row, false)));
    } catch (err) {
      console.error('[bridges] list error:', err);
      res.status(500).json({ error: 'Failed to list bridges' });
    }
  });

  // POST /api/bridges — create new channel bridge
  router.post('/bridges', requireAdminOrSolo, async (req: Request, res: Response) => {
    try {
      const {
        display_name,
        channel_type = 'generic_http',
        allowed_modules = ['*'],
        default_module = 'gap-analysis',
        rate_limit_rpm = 60,
        max_response_length = 1500,
        language_hint = 'en',
      } = req.body as {
        display_name?: string;
        channel_type?: string;
        allowed_modules?: string[];
        default_module?: string;
        rate_limit_rpm?: number;
        max_response_length?: number;
        language_hint?: string;
      };

      if (!display_name || typeof display_name !== 'string') {
        res.status(400).json({ error: 'display_name is required' });
        return;
      }

      if (!VALID_CHANNEL_TYPES.includes(channel_type as ChannelType)) {
        res.status(400).json({
          error: `Invalid channel_type. Must be one of: ${VALID_CHANNEL_TYPES.join(', ')}`,
        });
        return;
      }

      // Generate a cryptographically secure 32-byte token (64 hex chars)
      const plainToken = crypto.randomBytes(32).toString('hex');

      const rawConfig: Record<string, unknown> = {
        channel_type,
        token: plainToken, // encryptConfig will encrypt this field
        allowed_modules: Array.isArray(allowed_modules) ? allowed_modules : ['*'],
        default_module: default_module || 'gap-analysis',
        rate_limit_rpm: Math.min(Math.max(Number(rate_limit_rpm) || 60, 1), 300),
        max_response_length: Math.min(Math.max(Number(max_response_length) || 1500, 100), 3000),
        language_hint: language_hint || 'en',
        call_count: 0,
        last_called_at: null,
      };

      const encryptedConfig = encryptConfig(rawConfig);
      const id = crypto.randomUUID();
      const now = new Date().toISOString();

      await db.run(`
        INSERT INTO connections
          (id, display_name, type, config, permissions, created_by, status, created_at, updated_at)
        VALUES (?, ?, 'channel_bridge', ?, '[]', ?, 'pending', ?, ?)
      `, id, display_name.trim(), JSON.stringify(encryptedConfig), req.user!.id, now, now);

      // Audit log
      await db.run(`
        INSERT INTO connection_audit_log
          (connection_id, execution_id, action, details, result_summary, executed_by)
        VALUES (?, NULL, 'create', ?, 'Channel bridge created', ?)
      `, id, JSON.stringify({ channel_type }), req.user!.id);

      const baseUrl = getBaseUrl();

      // Return plain token exactly once — it cannot be retrieved after this response
      res.status(201).json({
        id,
        display_name: display_name.trim(),
        type: 'channel_bridge',
        status: 'pending',
        created_by: req.user!.id,
        created_at: now,
        updated_at: now,
        endpoint_url: `${baseUrl}/api/bridges/${id}/query`,
        token_plain: plainToken,
        config: { ...rawConfig, token: plainToken },
        _notice:
          'Token shown once only. Copy it before closing this dialog — it cannot be retrieved.',
      });
    } catch (err) {
      console.error('[bridges] create error:', err);
      res.status(500).json({ error: 'Failed to create bridge' });
    }
  });

  // PATCH /api/bridges/:id — update bridge config
  router.patch('/bridges/:id', requireAdminOrSolo, async (req: Request, res: Response) => {
    try {
      const row = await db.get("SELECT * FROM connections WHERE id = ? AND type = 'channel_bridge'", String(req.params.id)) as RawConnectionRow | undefined;

      if (!row) {
        res.status(404).json({ error: 'Bridge not found' });
        return;
      }

      const existing = JSON.parse(row.config || '{}') as Record<string, unknown>;
      const {
        display_name,
        allowed_modules,
        default_module,
        rate_limit_rpm,
        max_response_length,
        language_hint,
      } = req.body as Record<string, unknown>;

      const updatedConfig: Record<string, unknown> = {
        ...existing,
        ...(allowed_modules !== undefined && {
          allowed_modules: Array.isArray(allowed_modules) ? allowed_modules : existing.allowed_modules,
        }),
        ...(default_module !== undefined && { default_module }),
        ...(rate_limit_rpm !== undefined && {
          rate_limit_rpm: Math.min(Math.max(Number(rate_limit_rpm), 1), 300),
        }),
        ...(max_response_length !== undefined && {
          max_response_length: Math.min(Math.max(Number(max_response_length), 100), 3000),
        }),
        ...(language_hint !== undefined && { language_hint }),
      };

      const newDisplayName =
        typeof display_name === 'string' && display_name.trim()
          ? display_name.trim()
          : row.display_name;
      const now = new Date().toISOString();

      await db.run(
        'UPDATE connections SET display_name = ?, config = ?, updated_at = ? WHERE id = ?'
      , newDisplayName, JSON.stringify(updatedConfig), now, String(req.params.id));

      await db.run(`
        INSERT INTO connection_audit_log
          (connection_id, execution_id, action, details, result_summary, executed_by)
        VALUES (?, NULL, 'update', NULL, 'Bridge config updated', ?)
      `, String(req.params.id), req.user!.id);

      const updated = await db.get('SELECT * FROM connections WHERE id = ?', String(req.params.id)) as RawConnectionRow;

      res.json(parseBridgeRow(updated, false));
    } catch (err) {
      console.error('[bridges] update error:', err);
      res.status(500).json({ error: 'Failed to update bridge' });
    }
  });

  // DELETE /api/bridges/:id — soft-delete (disable)
  router.delete('/bridges/:id', requireAdminOrSolo, async (req: Request, res: Response) => {
    try {
      const row = await db.get("SELECT * FROM connections WHERE id = ? AND type = 'channel_bridge'", String(req.params.id)) as RawConnectionRow | undefined;

      if (!row) {
        res.status(404).json({ error: 'Bridge not found' });
        return;
      }

      const now = new Date().toISOString();
      await db.run("UPDATE connections SET status = 'disabled', updated_at = ? WHERE id = ?", 
        now,
        String(req.params.id)
      );

      await db.run(`
        INSERT INTO connection_audit_log
          (connection_id, execution_id, action, details, result_summary, executed_by)
        VALUES (?, NULL, 'delete', NULL, 'Bridge deactivated', ?)
      `, String(req.params.id), req.user!.id);

      res.json({ success: true });
    } catch (err) {
      console.error('[bridges] delete error:', err);
      res.status(500).json({ error: 'Failed to delete bridge' });
    }
  });

  // POST /api/bridges/:id/approve — approve pending bridge
  router.post('/bridges/:id/approve', requireAdminOrSolo, async (req: Request, res: Response) => {
    try {
      const row = await db.get("SELECT * FROM connections WHERE id = ? AND type = 'channel_bridge'", String(req.params.id)) as RawConnectionRow | undefined;

      if (!row) {
        res.status(404).json({ error: 'Bridge not found' });
        return;
      }

      if (row.status !== 'pending') {
        res.status(400).json({ error: `Bridge is already "${row.status}", not pending` });
        return;
      }

      const now = new Date().toISOString();
      await db.run(
        "UPDATE connections SET approved_by = ?, approved_at = ?, status = 'active', updated_at = ? WHERE id = ?"
      , req.user!.id, now, now, String(req.params.id));

      await db.run(`
        INSERT INTO connection_audit_log
          (connection_id, execution_id, action, details, result_summary, executed_by)
        VALUES (?, NULL, 'approve', NULL, 'Bridge approved and activated', ?)
      `, String(req.params.id), req.user!.id);

      const updated = await db.get('SELECT * FROM connections WHERE id = ?', String(req.params.id)) as RawConnectionRow;

      res.json(parseBridgeRow(updated, false));
    } catch (err) {
      console.error('[bridges] approve error:', err);
      res.status(500).json({ error: 'Failed to approve bridge' });
    }
  });

  // GET /api/bridges/:id/audit — audit log for a bridge
  router.get('/bridges/:id/audit', requireAdminOrSolo, async (req: Request, res: Response) => {
    try {
      const row = await db.get("SELECT * FROM connections WHERE id = ? AND type = 'channel_bridge'", String(req.params.id)) as RawConnectionRow | undefined;

      if (!row) {
        res.status(404).json({ error: 'Bridge not found' });
        return;
      }

      const limit = Math.min(parseInt(String(req.query.limit ?? '50'), 10), 200);
      const log = await db.all(
          'SELECT * FROM connection_audit_log WHERE connection_id = ? ORDER BY executed_at DESC LIMIT ?'
        , String(req.params.id), limit);

      res.json(log);
    } catch (err) {
      console.error('[bridges] audit error:', err);
      res.status(500).json({ error: 'Failed to get audit log' });
    }
  });

  return router;
}
