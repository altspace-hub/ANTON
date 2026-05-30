/**
 * photo-id-service.ts — Claude-vision-backed module identification.
 *
 * Implements the hw-diagnose-photo-id module surface: takes one or more
 * photos of the user's hardware module and produces a confidence-rated
 * identification + a counterfeit risk score, grounded in the active HKP's
 * reference markings (FCC ID, IC ID, package, antenna style, etc.).
 *
 * The vision call is real (Claude sonnet 4.6 is the default for cost +
 * quality balance on this task; opus 4.7 available via opts.model). The
 * scoring is deterministic: the model returns a structured JSON record
 * which we parse and clamp. If the model returns malformed JSON, we surface
 * the raw text and a low-confidence verdict rather than fabricating values.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { DatabaseAdapter } from '../db/database.js';
import { getClient, isApiKeyConfigured } from './claude-client.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export type CounterfeitRisk = 'low' | 'moderate' | 'high' | 'critical';

export interface PhotoInput {
  /** Image bytes — the route reads multipart upload into a Buffer */
  bytes: Buffer;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
}

export interface PhotoIdInput {
  family_id: string;
  hkp_id?: string | null;
  /** Free-text user context: where they sourced the module, etc. */
  context?: string | null;
  photos: PhotoInput[];
  model?: 'claude-opus-4-8' | 'claude-sonnet-4-6' | 'claude-haiku-4-5-20251001';
}

export interface PhotoIdResult {
  best_match_part_number: string | null;
  confidence: 'high' | 'moderate' | 'low' | 'unknown';
  read_markings: string[];
  matched_against_hkp_id: string | null;
  counterfeit_risk: CounterfeitRisk;
  counterfeit_indicators_present: string[];
  counterfeit_indicators_absent: string[];
  recommendation: string;
  rationale: string;
  raw_model_output?: string;
  parse_error?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const RISK_VALUES: ReadonlySet<CounterfeitRisk> = new Set(['low', 'moderate', 'high', 'critical']);

function clampRisk(v: unknown): CounterfeitRisk {
  if (typeof v === 'string' && RISK_VALUES.has(v as CounterfeitRisk)) return v as CounterfeitRisk;
  return 'moderate';
}

function clampConfidence(v: unknown): PhotoIdResult['confidence'] {
  if (v === 'high' || v === 'moderate' || v === 'low') return v;
  return 'unknown';
}

function arrayOfStrings(v: unknown, fallback: string[] = []): string[] {
  if (!Array.isArray(v)) return fallback;
  return v.filter(x => typeof x === 'string' && x.trim().length > 0).map(x => String(x));
}

// ── HKP context loader ───────────────────────────────────────────────────────

async function loadHkpContext(db: DatabaseAdapter, hkpId: string | null | undefined, familyId: string): Promise<{
  hkp_id: string | null;
  manufacturer: string;
  part_number: string;
  expected_fcc_id: string | null;
  expected_ic_id: string | null;
  package: string | null;
  antenna: string | null;
  reference_url: string | null;
}> {
  if (!hkpId) {
    // Pick the most-recent HKP for the family as a fallback reference.
    const r = await db.get(
      `SELECT id, manufacturer, part_number, metadata
       FROM hardware_knowledge_packs
       WHERE family_id = ? ORDER BY created_at DESC LIMIT 1`,
      familyId,
    ) as { id: string; manufacturer: string; part_number: string; metadata: string | object } | undefined;
    if (!r) {
      return {
        hkp_id: null,
        manufacturer: '(unknown)',
        part_number: `(unknown ${familyId})`,
        expected_fcc_id: null, expected_ic_id: null,
        package: null, antenna: null, reference_url: null,
      };
    }
    const meta = typeof r.metadata === 'string' ? (() => { try { return JSON.parse(r.metadata); } catch { return {}; } })() : (r.metadata as Record<string, unknown>);
    return {
      hkp_id: r.id,
      manufacturer: r.manufacturer,
      part_number: r.part_number,
      expected_fcc_id: (meta.fcc_id as string | undefined) ?? null,
      expected_ic_id: (meta.ic_id as string | undefined) ?? null,
      package: (meta.package as string | undefined) ?? null,
      antenna: (meta.antenna as string | undefined) ?? null,
      reference_url: (meta.datasheet_url as string | undefined) ?? null,
    };
  }
  const r = await db.get(
    `SELECT id, manufacturer, part_number, metadata
     FROM hardware_knowledge_packs WHERE id = ?`,
    hkpId,
  ) as { id: string; manufacturer: string; part_number: string; metadata: string | object } | undefined;
  if (!r) throw new Error(`HKP ${hkpId} not found`);
  const meta = typeof r.metadata === 'string' ? (() => { try { return JSON.parse(r.metadata); } catch { return {}; } })() : (r.metadata as Record<string, unknown>);
  return {
    hkp_id: r.id,
    manufacturer: r.manufacturer,
    part_number: r.part_number,
    expected_fcc_id: (meta.fcc_id as string | undefined) ?? null,
    expected_ic_id: (meta.ic_id as string | undefined) ?? null,
    package: (meta.package as string | undefined) ?? null,
    antenna: (meta.antenna as string | undefined) ?? null,
    reference_url: (meta.datasheet_url as string | undefined) ?? null,
  };
}

// ── Service ───────────────────────────────────────────────────────────────────

export function createPhotoIdService(db: DatabaseAdapter) {

  async function identify(input: PhotoIdInput): Promise<PhotoIdResult> {
    if (!isApiKeyConfigured()) {
      throw new Error('Anthropic API key not configured — cannot run photo identification');
    }
    if (input.photos.length === 0) {
      throw new Error('At least one photo is required');
    }
    if (input.photos.length > 4) {
      throw new Error('Maximum 4 photos per identification');
    }

    const ref = await loadHkpContext(db, input.hkp_id, input.family_id);
    const model = input.model ?? 'claude-sonnet-4-6';

    const systemPrompt = `You are the hardware photo identifier for ANTON's Hardware Build pillar. You receive one or more photos of a hardware module and must:

1. Read every visible marking — vendor logo, part number etching, FCC ID, IC ID, CE/RoHS marks, date code, PCB silkscreen.
2. Compare against the HKP reference set provided in the user message.
3. Compute a counterfeit risk score using the indicators specified in the hw-diagnose-photo-id module.

Return a SINGLE JSON object with EXACTLY these fields and no surrounding prose:

{
  "best_match_part_number": string | null,
  "confidence": "high" | "moderate" | "low",
  "read_markings": string[],          // verbatim, line by line
  "counterfeit_risk": "low" | "moderate" | "high" | "critical",
  "counterfeit_indicators_present": string[],
  "counterfeit_indicators_absent": string[],
  "recommendation": string,           // one sentence: accept | source-verify | reject (with reason)
  "rationale": string                 // 2-3 sentences explaining the score
}

Counterfeit indicator scoring (sum points, then map):
  +1 missing or off-centre vendor logo
  +2 missing FCC ID etching when one is required
  +1 inconsistent date code format
  +2 visible solder rework on the metal can
  +1 poor tinning quality on castellated edges
  Map: 0-1 = low, 2-3 = moderate, 4-5 = high, 6+ = critical.

Never claim certainty above what the photos support. If markings are unreadable, set confidence="low" and request a clearer photo in the rationale. If you cannot match the part to the reference HKP, return best_match_part_number=null with confidence="low".`;

    const userText = `Family: ${input.family_id}
Reference HKP: ${ref.hkp_id ?? '(no HKP, family fallback)'}
Reference part: ${ref.manufacturer} ${ref.part_number}
Expected FCC ID: ${ref.expected_fcc_id ?? '(unknown)'}
Expected IC ID: ${ref.expected_ic_id ?? '(unknown)'}
Expected package: ${ref.package ?? '(unknown)'}
Expected antenna: ${ref.antenna ?? '(unknown)'}
${input.context ? `\nUser context: ${input.context}` : ''}

Photos follow.`;

    const content: Anthropic.MessageParam['content'] = [
      { type: 'text', text: userText },
      ...input.photos.map(p => ({
        type: 'image' as const,
        source: {
          type: 'base64' as const,
          media_type: p.mimeType,
          data: p.bytes.toString('base64'),
        },
      })),
    ];

    const anthropic = getClient();
    const resp = await anthropic.messages.create({
      model,
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{ role: 'user', content }],
    });

    // Extract text content from the response
    const textBlocks = resp.content.filter((b): b is Anthropic.TextBlock => b.type === 'text');
    const raw = textBlocks.map(b => b.text).join('').trim();

    // Try to parse JSON. The model occasionally wraps in ```json ... ``` fences.
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return failResult({ matchedHkpId: ref.hkp_id, reason: 'Model returned no JSON block', raw });
    }
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    } catch (e) {
      return failResult({ matchedHkpId: ref.hkp_id, reason: `JSON parse failed: ${(e as Error).message}`, raw });
    }

    return {
      best_match_part_number: typeof parsed.best_match_part_number === 'string' ? parsed.best_match_part_number : null,
      confidence: clampConfidence(parsed.confidence),
      read_markings: arrayOfStrings(parsed.read_markings),
      matched_against_hkp_id: ref.hkp_id,
      counterfeit_risk: clampRisk(parsed.counterfeit_risk),
      counterfeit_indicators_present: arrayOfStrings(parsed.counterfeit_indicators_present),
      counterfeit_indicators_absent: arrayOfStrings(parsed.counterfeit_indicators_absent),
      recommendation: typeof parsed.recommendation === 'string' ? parsed.recommendation : 'no recommendation produced',
      rationale: typeof parsed.rationale === 'string' ? parsed.rationale : 'no rationale produced',
    };
  }

  function failResult(opts: { matchedHkpId: string | null; reason: string; raw: string }): PhotoIdResult {
    return {
      best_match_part_number: null,
      confidence: 'unknown',
      read_markings: [],
      matched_against_hkp_id: opts.matchedHkpId,
      counterfeit_risk: 'moderate',
      counterfeit_indicators_present: [],
      counterfeit_indicators_absent: [],
      recommendation: 'source-verify (model output unparseable; treat as moderate counterfeit risk until re-run with clearer photo)',
      rationale: 'Identification failed because the model output could not be parsed into the expected JSON schema. Re-run with a clearer top-of-can photo.',
      parse_error: opts.reason,
      raw_model_output: opts.raw.slice(0, 4000),
    };
  }

  return { identify };
}

export type PhotoIdService = ReturnType<typeof createPhotoIdService>;
