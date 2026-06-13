/**
 * talent-assessment-and-career-profile.test.ts
 *
 * Locks two contracts behind plan item #7 (HR/Talent UI wire + signature enforce):
 *
 * PART A — the assessment row shape the recruiter UI (TalentCampaignPage
 * Assessments tab) consumes. The UI reads `GET /talent/candidates/:id` →
 * `{ assessments }`, branching on `assessor_type` ('primary' | 'bias_auditor')
 * and reading dimension_scores / composite_percentage / reasoning / confidence /
 * wild_card_flag / uncertainties / bias_findings / framework_drift_check /
 * assessed_at. We round-trip createAssessment → getAssessments through the real
 * talent-service against an in-memory adapter and assert those fields survive.
 *
 * PART B — career-profile signature enforcement. parseCareerProfile must REJECT
 * unsigned / tampered / wrong-key bundles and ACCEPT a correctly self-signed
 * one. Mirrors the spec ("Signing: REQUIRED") and the jobs.ts /profile/import
 * trust boundary.
 *
 * In-memory fake DatabaseAdapter — no Postgres needed.
 */
import { describe, it, expect } from 'vitest';
import { sign, generateKeyPairSync } from 'crypto';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';
import { createTalentService } from '../../server/services/talent-service.js';
import {
  parseCareerProfile,
  verifyCareerProfileSignature,
  type CareerProfileBundle,
} from '../../server/services/portals/career-profile.js';
import { signCanonical } from '../../server/lib/portal-crypto.js';
import { deriveContactHashFromPublicKey } from '../../server/services/identity.js';

// ── Minimal in-memory adapter that understands the talent_assessments I/O ────

interface StoredAssessment extends Record<string, unknown> {
  id: string;
  candidate_id: string;
  campaign_id: string;
  assessor_type: string;
  model_used: string | null;
  dimension_scores: string;
  composite_score: number | null;
  composite_percentage: number | null;
  reasoning: string | null;
  thinking_trace: string | null;
  confidence: number | null;
  wild_card_flag: boolean;
  wild_card_reasoning: string | null;
  wild_card_discovery_link: string | null;
  uncertainties: string;
  bias_findings: string;
  framework_drift_check: string | null;
  assessment_phase: string;
  transparency_level: number;
  assessed_at: string;
}

function makeFakeDb(): DatabaseAdapter {
  const assessments: StoredAssessment[] = [];

  const db: DatabaseAdapter = {
    dialect: 'postgresql',
    async get<T = Record<string, unknown>>(): Promise<T | undefined> {
      return undefined;
    },
    async all<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T[]> {
      if (/FROM talent_assessments/i.test(sql) && /WHERE candidate_id/i.test(sql)) {
        const candidateId = params[0];
        return assessments
          .filter(a => a.candidate_id === candidateId)
          .sort((a, b) => b.assessed_at.localeCompare(a.assessed_at)) as unknown as T[];
      }
      return [];
    },
    async run(sql: string, ...params: unknown[]): Promise<RunResult> {
      if (/INSERT INTO talent_assessments/i.test(sql)) {
        // Column order mirrors talent-service.createAssessment.
        const [
          id, candidate_id, campaign_id, assessor_type, model_used,
          dimension_scores, composite_score, composite_percentage,
          reasoning, thinking_trace, confidence, wild_card_flag,
          wild_card_reasoning, wild_card_discovery_link, uncertainties,
          bias_findings, framework_drift_check, assessment_phase, transparency_level,
        ] = params;
        assessments.push({
          id: id as string,
          candidate_id: candidate_id as string,
          campaign_id: campaign_id as string,
          assessor_type: assessor_type as string,
          model_used: (model_used ?? null) as string | null,
          dimension_scores: dimension_scores as string,
          composite_score: (composite_score ?? null) as number | null,
          composite_percentage: (composite_percentage ?? null) as number | null,
          reasoning: (reasoning ?? null) as string | null,
          thinking_trace: (thinking_trace ?? null) as string | null,
          confidence: (confidence ?? null) as number | null,
          wild_card_flag: Boolean(wild_card_flag),
          wild_card_reasoning: (wild_card_reasoning ?? null) as string | null,
          wild_card_discovery_link: (wild_card_discovery_link ?? null) as string | null,
          uncertainties: uncertainties as string,
          bias_findings: bias_findings as string,
          framework_drift_check: (framework_drift_check ?? null) as string | null,
          assessment_phase: assessment_phase as string,
          transparency_level: transparency_level as number,
          assessed_at: new Date(Date.now() + assessments.length).toISOString(),
        });
      }
      return { changes: 1, lastInsertRowid: 0 };
    },
    async exec(): Promise<void> { /* no-op */ },
    async transaction<T>(fn: (d: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(db); },
    async close(): Promise<void> { /* no-op */ },
  };
  return db;
}

// ── PART A: assessment row shape the UI consumes ────────────────────────────

describe('Talent assessment row shape (UI contract)', () => {
  it('round-trips a primary + bias_auditor assessment with every field the UI reads', async () => {
    const db = makeFakeDb();
    const service = await createTalentService(db);

    await service.createAssessment({
      candidateId: 'cand_1',
      campaignId: 'camp_1',
      assessorType: 'primary',
      modelUsed: 'provider-router-default',
      dimensionScores: [
        { dimension: 'Technical', score: 4, reasoning: 'Strong portfolio', confidence: 0.8 },
        { dimension: 'Experience', score: 3, reasoning: 'Adjacent domain' },
      ],
      compositeScore: 3.7,
      compositePercentage: 74,
      reasoning: 'Solid candidate with a complementary skill set.',
      confidence: 0.78,
      wildCardFlag: true,
      wildCardReasoning: 'Non-linear career path worth a closer look.',
      uncertainties: [
        { dimension: 'Leadership', description: 'No direct reports evidenced', followupRecommended: true },
      ],
      assessmentPhase: 'initial',
    });

    await service.createAssessment({
      candidateId: 'cand_1',
      campaignId: 'camp_1',
      assessorType: 'bias_auditor',
      modelUsed: 'provider-router-default',
      biasFindings: [
        { type: 'language', description: 'Non-native phrasing not penalised — good.', severity: 'low' },
      ],
      frameworkDriftCheck: { aligned: true, deviations: [] },
      assessmentPhase: 'initial',
    });

    const rows = await service.getAssessments('cand_1');
    expect(rows).toHaveLength(2);

    const primary = rows.find(r => r.assessor_type === 'primary')!;
    const bias = rows.find(r => r.assessor_type === 'bias_auditor')!;
    expect(primary).toBeTruthy();
    expect(bias).toBeTruthy();

    // Primary: fields the panel renders.
    expect(primary.composite_percentage).toBe(74);
    expect(primary.reasoning).toContain('complementary');
    expect(primary.confidence).toBeCloseTo(0.78);
    expect(primary.wild_card_flag).toBe(true);
    expect(primary.wild_card_reasoning).toBeTruthy();

    const dimScores = JSON.parse(primary.dimension_scores as unknown as string) as Array<{ dimension: string; score: number }>;
    expect(dimScores).toHaveLength(2);
    expect(dimScores[0]).toMatchObject({ dimension: 'Technical', score: 4 });

    const uncertainties = JSON.parse((primary as unknown as { uncertainties: string }).uncertainties) as unknown[];
    expect(uncertainties).toHaveLength(1);

    // Bias auditor: independent verdict the panel renders.
    const biasFindings = JSON.parse(bias.bias_findings as unknown as string) as Array<{ type: string; severity: string }>;
    expect(biasFindings[0]).toMatchObject({ type: 'language', severity: 'low' });
    const drift = JSON.parse((bias as unknown as { framework_drift_check: string }).framework_drift_check) as { aligned: boolean };
    expect(drift.aligned).toBe(true);

    // assessed_at present for the "Last assessed" line + ordering.
    expect(typeof primary.assessed_at).toBe('string');
  });
});

// ── PART B: career-profile signature enforcement ────────────────────────────

function buildSignedProfile(): { bundle: CareerProfileBundle; publicKeyHex: string; privateKeyPem: string } {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const publicKeyHex = publicKey.export({ type: 'spki', format: 'der' }).toString('hex');
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
  const contactHash = deriveContactHashFromPublicKey(publicKeyHex);

  const base: Omit<CareerProfileBundle, 'signature'> = {
    bundle_type: 'career-profile',
    spec_version: '1.0',
    profile_id: '11111111-1111-4111-8111-111111111111',
    candidate_contact_hash: contactHash,
    candidate_display_name: 'Test Candidate',
    career_path: [
      { title: 'Engineer', organisation: 'Acme', start_date: '2020-01-01', end_date: null },
    ],
    growth_map: {
      current_strengths: ['TypeScript'],
      growth_areas: ['Leadership'],
      learning_goals_next_12_months: ['Ship a portal'],
    },
    aspirations: { opt_in: false },
    signed_by: publicKeyHex,
    created_at: '2026-06-13T00:00:00.000Z',
    updated_at: '2026-06-13T00:00:00.000Z',
  };

  const signature = signCanonical(base, privateKeyPem);
  return { bundle: { ...base, signature }, publicKeyHex, privateKeyPem };
}

describe('Career profile signature enforcement', () => {
  it('ACCEPTS a correctly self-signed bundle', () => {
    const { bundle } = buildSignedProfile();
    const verified = verifyCareerProfileSignature(bundle);
    expect(verified.ok).toBe(true);

    const parsed = parseCareerProfile(bundle);
    expect(parsed.ok).toBe(true);
  });

  it('REJECTS an unsigned bundle (no signature / signed_by)', () => {
    const { bundle } = buildSignedProfile();
    const unsigned = { ...bundle };
    delete (unsigned as Record<string, unknown>).signature;
    delete (unsigned as Record<string, unknown>).signed_by;

    const parsed = parseCareerProfile(unsigned);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.reason).toMatch(/unsigned|REQUIRED/i);
  });

  it('REJECTS a tampered bundle (display name changed after signing)', () => {
    const { bundle } = buildSignedProfile();
    const tampered = { ...bundle, candidate_display_name: 'Someone Else' };
    const parsed = parseCareerProfile(tampered);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.reason).toMatch(/Signature verification failed/i);
  });

  it('REJECTS a valid signature from a key that is not the claimed candidate', () => {
    // Sign with an unrelated key but keep the original candidate_contact_hash.
    const { bundle } = buildSignedProfile();
    const { publicKey: otherPub, privateKey: otherPriv } = generateKeyPairSync('ed25519');
    const otherPubHex = otherPub.export({ type: 'spki', format: 'der' }).toString('hex');
    const otherPrivPem = otherPriv.export({ type: 'pkcs8', format: 'pem' }) as string;

    const base = { ...bundle, signed_by: otherPubHex };
    delete (base as Record<string, unknown>).signature;
    const signature = signCanonical(base, otherPrivPem);
    const impersonating = { ...base, signature } as CareerProfileBundle;

    const parsed = parseCareerProfile(impersonating);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.reason).toMatch(/contact hash/i);
  });

  it('still ACCEPTS unsigned bundles when requireSignature is explicitly false (internal round-trip)', () => {
    const { bundle } = buildSignedProfile();
    const unsigned = { ...bundle };
    delete (unsigned as Record<string, unknown>).signature;
    delete (unsigned as Record<string, unknown>).signed_by;

    const parsed = parseCareerProfile(unsigned, { requireSignature: false });
    expect(parsed.ok).toBe(true);
  });
});
