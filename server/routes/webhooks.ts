/**
 * webhooks.ts
 * Public-facing inbound webhook endpoint.
 * POST /webhooks/inbound/:trigger_id  (mounted at root, outside the /api auth+CSRF stack)
 *
 * This endpoint does NOT require ANTON session auth — it uses trigger-specific
 * authentication (HMAC, Slack signing secret, Bearer token).
 *
 * Security:
 * - Global rate limit handled by infrastructure layer
 * - Payload size limit: 1MB
 * - Trigger-specific authentication in webhook-listener.ts
 * - Secrets never exposed in responses
 */

import { Router, Request, Response } from 'express';
import type { DatabaseAdapter } from '../db/database.js';

import { createWebhookListener } from '../services/webhook-listener.js';

export async function createWebhooksPublicRoutes(db: DatabaseAdapter): Promise<Router> {
  const router = Router();
  const listener = await createWebhookListener(db);

  // Increase body limit for webhook payloads (max 1MB)
  router.use((req, _res, next) => {
    req.setEncoding('utf8');
    next();
  });

  /**
   * POST /webhooks/inbound/:trigger_id
   * Public webhook receiver. Authenticated per trigger configuration.
   */
  router.post('/webhooks/inbound/:trigger_id', async (req: Request, res: Response) => {
    const trigger_id = String(req.params.trigger_id);

    try {
      // Validate content length (1MB limit)
      const contentLengthHeader = Array.isArray(req.headers['content-length']) ? req.headers['content-length'][0] : req.headers['content-length'];
      const contentLength = parseInt(String(contentLengthHeader || '0'), 10);
      if (contentLength > 1024 * 1024) {
        return res.status(413).json({ error: 'Payload too large (max 1MB)' });
      }

      // Get raw body for HMAC signature verification.
      // Prefer req.rawBody (set by the express.json verify option) which contains the
      // exact original bytes — necessary for correct HMAC-SHA256 matching against
      // GitHub/GitLab/Slack signatures. Fall back to re-serialised JSON if not available.
      const rawBodyExt = req as Request & { rawBody?: Buffer };
      const rawBody = rawBodyExt.rawBody
        ? rawBodyExt.rawBody.toString('utf8')
        : typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {});
      const parsedPayload = typeof req.body === 'object' && req.body !== null ? req.body as Record<string, unknown> : {};

      // Build headers map for auth
      const headers: Record<string, string | string[] | undefined> = {};
      for (const [k, v] of Object.entries(req.headers)) {
        headers[k.toLowerCase()] = v;
      }

      // Process through the pipeline
      const result = await listener.processWebhookRequest(
        trigger_id,
        rawBody,
        parsedPayload,
        headers,
        'webhook',
      );

      // Map internal status to HTTP status
      // Always return 200/202 for valid payloads (even filtered/deduped) — webhook providers
      // expect 2xx to avoid retries
      switch (result.status) {
        case 'triggered':
          return res.status(200).json({ status: 'triggered', workflow_run_id: result.workflow_run_id, event_id: result.event_id });
        case 'filtered_out':
          return res.status(200).json({ status: 'acknowledged', event_id: result.event_id });
        case 'deduplicated':
          return res.status(200).json({ status: 'acknowledged', reason: 'duplicate', event_id: result.event_id });
        case 'rate_limited':
          return res.status(429).json({ status: 'rate_limited', event_id: result.event_id });
        case 'failed':
          // Log server-side, return generic error to caller (no internal detail exposure)
          console.error(`[webhooks] trigger ${trigger_id} failed: ${result.error}`);
          return res.status(401).json({ error: 'Authentication failed' });
        default:
          return res.status(200).json({ status: 'received', event_id: result.event_id });
      }
    } catch (err) {
      // Never expose internal error details
      console.error('[webhooks] inbound processing error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
