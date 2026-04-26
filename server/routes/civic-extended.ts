/**
 * routes/civic-extended.ts — Phase B.1 Civic build-out REST surface.
 *
 * Mounts at /api/civic. Adds:
 *   - GET  /civic/process-packs              list packs (filter by jurisdiction/domain)
 *   - POST /civic/process-packs              import a new pack
 *   - POST /civic/eligibility/evaluate-pack  run eligibility evaluation against an applicant context
 *   - GET  /civic/submissions                cross-engagement submission view
 */

import { Router } from 'express';
import type { DatabaseAdapter } from '../db/database.js';
import { createCivicEligibility } from '../services/civic-eligibility.js';
import { createCivicProcessLibrary } from '../services/civic-process-library.js';
import { safeError } from '../lib/error-response.js';

export function createCivicExtendedRoutes(db: DatabaseAdapter): Router {
  const router = Router();

  router.get('/process-packs', async (req, res) => {
    try {
      const lib = await createCivicProcessLibrary(db);
      const jurisdiction = typeof req.query.jurisdiction === 'string' ? req.query.jurisdiction : undefined;
      const domain       = typeof req.query.domain       === 'string' ? req.query.domain       : undefined;
      const packs = await lib.listPacks({ jurisdiction, domain });
      res.json({ packs });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.post('/process-packs', async (req, res) => {
    try {
      const lib = await createCivicProcessLibrary(db);
      const b = req.body ?? {};
      const required = ['id', 'name', 'jurisdiction', 'version'];
      const missing = required.filter(k => !b[k]);
      if (missing.length) {
        res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });
        return;
      }
      await lib.importPack(b);
      res.json({ ok: true, id: b.id });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.post('/eligibility/evaluate-pack', async (req, res) => {
    try {
      const b = req.body ?? {};
      const packId = String(b.packId ?? '').trim();
      const ctx = b.applicantContext ?? {};
      if (!packId) {
        res.status(400).json({ error: 'packId required' });
        return;
      }
      const elig = await createCivicEligibility(db);
      // Find all rules in the pack and evaluate each in turn (no dedicated process_id binding here)
      const rules = await db.all<{ id: string; rule_code: string; rule_label: string; condition_kind: string; condition_value: Record<string, unknown>; severity: 'mandatory' | 'recommended' | 'informational' }>(
        `SELECT id, rule_code, rule_label, condition_kind, condition_value, severity
           FROM civic_eligibility_rules
           WHERE pack_id = ? AND is_active = TRUE`,
        packId,
      );
      const results = rules.map(r => elig.evaluateRule(r, ctx));
      const summary = {
        eligible:           results.filter(r => r.outcome === 'eligible').length,
        ineligible:         results.filter(r => r.outcome === 'ineligible').length,
        indeterminate:      results.filter(r => r.outcome === 'indeterminate').length,
        requires_evidence:  results.filter(r => r.outcome === 'requires_evidence').length,
        total: results.length,
      };
      const mandatoryIneligible = results.filter(r =>
        r.outcome === 'ineligible' &&
        rules.find(rl => rl.id === r.ruleId)?.severity === 'mandatory'
      );
      const verdict =
        rules.length === 0       ? 'indeterminate' :
        mandatoryIneligible.length > 0 ? 'ineligible' :
        summary.requires_evidence > 0 ? 'requires_evidence' :
        summary.indeterminate > 0 ? 'indeterminate' :
        'eligible';
      res.json({ verdict, summary, results });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.get('/submissions', async (_req, res) => {
    try {
      const submissions = await db.all(
        `SELECT s.id, s.engagement_id, s.process_id, p.name AS process_name, p.authority, p.jurisdiction,
                s.submitted_at, s.channel, s.status, s.reference
           FROM civic_submissions s
           LEFT JOIN civic_processes p ON p.id = s.process_id
           ORDER BY s.submitted_at DESC
           LIMIT 200`
      );
      res.json({ submissions });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  return router;
}
