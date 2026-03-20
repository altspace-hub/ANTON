import { Router } from 'express';
import type { DatabaseAdapter } from '../db/database.js';

export async function createFCSettingsRoutes(db: DatabaseAdapter): Promise<Router> {
  const router = Router();
  const { createFCConnectionService } = await import('../services/fc-connection-service.js');
  const svc = await createFCConnectionService(db);

  router.get('/futurechain/config', async (_req, res) => {
    try {
      const config = await svc.getConfig();
      res.json(config);
    } catch (err) { res.status(500).json({ error: 'Failed to get FutureChain config' }); }
  });

  router.put('/futurechain/config', async (req, res) => {
    try {
      const config = await svc.updateConfig(req.body);
      res.json(config);
    } catch (err) { res.status(500).json({ error: 'Failed to update FutureChain config' }); }
  });

  router.post('/futurechain/health-check', async (_req, res) => {
    try {
      const result = await svc.healthCheck();
      res.json(result);
    } catch (err) { res.status(500).json({ error: 'Failed to run health check' }); }
  });

  router.get('/futurechain/status', async (_req, res) => {
    try {
      const config = await svc.getConfig();
      const c = config as Record<string, unknown> | undefined;
      res.json({
        connected: c?.connected ?? false,
        stubMode: c?.stub_mode ?? true,
        nodeVersion: c?.node_version ?? null,
        pacs008Support: c?.pacs008_support ?? false,
        twoTierStorage: c?.two_tier_storage ?? false,
        lastHealthCheck: c?.last_health_check ?? null,
      });
    } catch (err) { res.status(500).json({ error: 'Failed to get FutureChain status' }); }
  });

  // ── KYC Profile ──────────────────────────────────────────────
  router.get('/futurechain/kyc', async (_req, res) => {
    try {
      const profile = await db.get('SELECT * FROM fc_kyc_profiles WHERE id = $1', 'default');
      res.json(profile ?? {});
    } catch (err) { res.status(500).json({ error: 'Failed to load KYC profile' }); }
  });

  router.put('/futurechain/kyc', async (req, res) => {
    try {
      const fields = req.body as Record<string, unknown>;
      const allowedCols = [
        'full_legal_name_enc', 'country', 'street_address_enc', 'city_enc',
        'postal_code_enc', 'address_country', 'id_document_number_enc',
        'id_document_type', 'id_issuing_country', 'date_of_birth_enc',
        'nationality', 'tax_id_number_enc', 'bic_or_lei_enc',
      ];
      const existing = await db.get('SELECT id FROM fc_kyc_profiles WHERE id = $1', 'default');
      if (existing) {
        const entries = Object.entries(fields).filter(([k]) => allowedCols.includes(k));
        if (entries.length > 0) {
          const sets = entries.map(([k], i) => `${k} = $${i + 1}`);
          const vals: unknown[] = entries.map(([, v]) => v);
          sets.push(`updated_at = NOW()`);
          vals.push('default');
          await db.run(
            `UPDATE fc_kyc_profiles SET ${sets.join(', ')} WHERE id = $${vals.length}`,
            ...vals
          );
        }
      } else {
        await db.run(
          `INSERT INTO fc_kyc_profiles (id, full_legal_name_enc, country) VALUES ($1, $2, $3)`,
          'default',
          (fields.full_legal_name_enc as string) ?? '',
          (fields.country as string) ?? ''
        );
        // Now update remaining fields if any
        const entries = Object.entries(fields).filter(
          ([k]) => allowedCols.includes(k) && k !== 'full_legal_name_enc' && k !== 'country'
        );
        if (entries.length > 0) {
          const sets = entries.map(([k], i) => `${k} = $${i + 1}`);
          const vals: unknown[] = entries.map(([, v]) => v);
          sets.push(`updated_at = NOW()`);
          vals.push('default');
          await db.run(
            `UPDATE fc_kyc_profiles SET ${sets.join(', ')} WHERE id = $${vals.length}`,
            ...vals
          );
        }
      }
      const profile = await db.get('SELECT * FROM fc_kyc_profiles WHERE id = $1', 'default');
      res.json(profile);
    } catch (err) {
      console.error('[fc-kyc] PUT error', err);
      res.status(500).json({ error: 'Failed to save KYC profile' });
    }
  });

  return router;
}
