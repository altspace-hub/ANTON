/**
 * fc-checkout.ts — "Pay with FutureChain" web-checkout gateway routes
 * (plan #11, docs/INVESTIGATION_AND_PLAN_2026-06-13.md Area 7; MVP).
 *
 * Mounted at /api/checkout. Two surfaces:
 *   - POST /v1/requests                — authenticated (Bearer merchant apiKey,
 *                                        validated via the existing
 *                                        fc-gateway-service `validateApiKey`).
 *                                        AMOUNT IS SEALED SERVER-SIDE. Returns
 *                                        { id, qrUri, needsAnimated, exp } —
 *                                        NEVER the apiKey or the webhook secret.
 *   - GET  /v1/requests/:id/status     — PUBLIC by id (the widget long-polls).
 *                                        Drives one poll on each hit (no busy
 *                                        background loop required) and returns
 *                                        the lifecycle state.
 *   - GET  /v1/requests/:id/qr.svg     — PUBLIC: server-rendered static QR so
 *                                        the widget stays dependency-free.
 *   - GET  /v1/requests/:id/frames     — PUBLIC: the animated UR frame strings
 *                                        for big (order-envelope) QRs.
 *
 * Security: no key on the merchant site beyond the gateway apiKey (used
 * server-side only); the widget holds just the public `id`. The customer's Pay
 * app is the only key-holder. See docs/WEB_CHECKOUT.md.
 */
import { Router } from 'express';
import QRCode from 'qrcode';
import type { DatabaseAdapter } from '../db/database.js';
import { safeError } from '../lib/error-response.js';
import type { CheckoutServiceOpts } from '../services/checkout-service.js';
import type { AntonRemittance } from '@futurechain/sdk/pacs008';

export async function createFCCheckoutRoutes(db: DatabaseAdapter, opts: CheckoutServiceOpts = {}) {
  const router = Router();
  const { createCheckoutService } = await import('../services/checkout-service.js');
  const { createFCGatewayService } = await import('../services/fc-gateway-service.js');
  const checkout = await createCheckoutService(db, opts);
  const gateway = await createFCGatewayService(db);

  // ── Bearer-apiKey auth for the create endpoint (reuses gateway validateApiKey) ─
  async function requireMerchant(req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) {
    const auth = String(req.headers['authorization'] ?? '');
    const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    const key = bearer || String(req.headers['x-gateway-key'] ?? '');
    if (!key) return res.status(401).json({ error: 'Missing merchant API key (Authorization: Bearer …)' });
    const { valid, config } = await gateway.validateApiKey(key);
    if (!valid) return res.status(401).json({ error: 'Invalid API key' });
    if (!config?.enabled) return res.status(403).json({ error: 'Gateway is disabled' });
    (req as unknown as Record<string, unknown>).merchantConfig = config;
    next();
  }

  // POST /api/checkout/v1/requests — create a sealed request + build the QR.
  router.post('/v1/requests', requireMerchant, async (req, res) => {
    try {
      const b = (req.body ?? {}) as Record<string, unknown>;
      const receivingAddress = String(b.receivingAddress ?? b.toAddress ?? '');
      const merchantId = String(b.merchantId ?? '');
      if (!receivingAddress) return res.status(400).json({ error: 'receivingAddress is required' });
      if (!merchantId) return res.status(400).json({ error: 'merchantId is required' });

      const result = await checkout.createRequest({
        receivingAddress,
        merchantId,
        amountMicroFtc: b.amountMicroFtc as string | undefined,
        fiatAmount: typeof b.fiatAmount === 'number' ? b.fiatAmount : (typeof b.amount === 'number' ? b.amount : undefined),
        fiatCurrency: typeof b.fiatCurrency === 'string' ? b.fiatCurrency
          : (typeof b.currency === 'string' && b.currency !== 'FTC' ? b.currency : undefined),
        fiatRate: typeof b.fiatRate === 'number' ? b.fiatRate : undefined,
        purpose: b.purpose as never,
        orderEnvelope: b.orderEnvelope as AntonRemittance | undefined,
        orderId: typeof b.orderId === 'string' ? b.orderId : undefined,
        expirySeconds: typeof b.expirySeconds === 'number' ? b.expirySeconds : undefined,
        webhookUrl: typeof b.webhookUrl === 'string' ? b.webhookUrl : undefined,
        metadata: (b.metadata && typeof b.metadata === 'object') ? b.metadata as Record<string, unknown> : undefined,
      });
      // NEVER echo the apiKey / webhook secret.
      res.json(result);
    } catch (err) {
      const message = safeError(err);
      // Validation-style errors are client faults → 400, not 500.
      const code = /required|must|already used|positive|supply|overflow/i.test(message) ? 400 : 500;
      res.status(code).json({ error: message });
    }
  });

  // GET /api/checkout/v1/requests/:id/status — public; the widget polls this.
  router.get('/v1/requests/:id/status', async (req, res) => {
    try {
      // Drive one poll so the state advances without a hot background loop.
      await checkout.pollRequest(req.params.id).catch(() => {});
      const status = await checkout.getPublicStatus(req.params.id);
      if (!status) return res.status(404).json({ error: 'Unknown request' });
      // Cache-bust: status is volatile.
      res.set('Cache-Control', 'no-store');
      res.json(status);
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // GET /api/checkout/v1/requests/:id/qr.svg — server-rendered static QR.
  router.get('/v1/requests/:id/qr.svg', async (req, res) => {
    try {
      const status = await checkout.getPublicStatus(req.params.id);
      if (!status) return res.status(404).json({ error: 'Unknown request' });
      const svg = await QRCode.toString(status.qrUri, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
      res.set('Content-Type', 'image/svg+xml');
      res.set('Cache-Control', 'public, max-age=60');
      res.send(svg);
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // GET /api/checkout/v1/requests/:id/frames — animated UR frames for big QRs.
  // Pre-renders a finite fountain stream the widget cycles. Each frame is also a
  // QR-encodable string. We hand back enough frames to comfortably decode.
  router.get('/v1/requests/:id/frames', async (req, res) => {
    try {
      const status = await checkout.getPublicStatus(req.params.id);
      if (!status) return res.status(404).json({ error: 'Unknown request' });
      // Lazy import — only the animated path pulls the encoder in.
      const { createUriEncoder } = await import('../services/checkout-qr-encoder.js');
      const enc = createUriEncoder(status.qrUri);
      const frameCount = Math.max(enc.fragmentsLength * 3, 12);
      // Server-render each UR frame as a QR SVG so the widget stays
      // dependency-free (no client-side QR lib). The widget cycles these.
      const frames: string[] = [];
      for (let i = 0; i < frameCount; i++) {
        const part = enc.next();
        frames.push(await QRCode.toString(part, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }));
      }
      res.set('Cache-Control', 'public, max-age=60');
      res.json({ frames, fragments: enc.fragmentsLength });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  return router;
}
