/**
 * extend-device-service.ts — minimum-viable-change proposal generator (Phase 9).
 *
 * Use case: a user has a deployed (or in-progress) project. They want to add
 * a feature ("add a humidity sensor", "add LoRaWAN", "switch from Wi-Fi to
 * BLE-only") without redesigning. This service produces a structured proposal
 * with: pin assignment delta, BoM delta, posture delta, risk delta, and
 * (when the project is already deployed) a recommended Maintain plan shape.
 *
 * Proposal generation is real Claude (sonnet 4.6 by default) with a focused
 * prompt that grounds the model in the actual project + HKP context. Output
 * is parsed as structured JSON with defensive fallbacks if parsing fails.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { DatabaseAdapter } from '../db/database.js';
import { getClient, isApiKeyConfigured } from './claude-client.js';
import { parseJson } from '../lib/hardware-helpers.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ExtendDeviceInput {
  project_id: string;
  /** Free-text user description of what they want to add. */
  desired_change: string;
  /** Default 'claude-sonnet-4-6'; opus 4.7 selectable for harder cases. */
  model?: 'claude-opus-4-8' | 'claude-sonnet-4-6' | 'claude-haiku-4-5-20251001';
}

export interface PinDelta {
  function: string;
  pin: string;
  rationale: string;
  warnings: string[];
}

export interface BomDelta {
  part: string;
  quantity: number;
  estimated_cost_usd: number | null;
  source_recommendation: string;
}

export interface PostureDelta {
  enabled_components_added: string[];
  enabled_components_removed: string[];
  exposed_surfaces_added: string[];
  exposed_surfaces_removed: string[];
  cve_re_assessment_required: boolean;
}

export interface RiskDelta {
  risk: string;
  severity: 'low' | 'moderate' | 'high' | 'critical';
  mitigation: string;
}

export interface ExtendDeviceProposal {
  project_id: string;
  desired_change: string;
  feasibility: 'straightforward' | 'moderate' | 'requires-redesign';
  summary: string;
  pin_assignment_delta: PinDelta[];
  bom_delta: BomDelta[];
  posture_delta: PostureDelta;
  firmware_change_summary: string;
  risk_delta: RiskDelta[];
  recommended_maintain_plan: {
    needed: boolean;
    rationale: string;
    suggested_change_kind?: string;
    suggested_acceptance_rules?: Array<{ metric: string; operator: string; threshold: number | string }>;
  };
  open_questions: string[];
  raw_model_output?: string;
  parse_error?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function arrayOf<T>(v: unknown, mapper: (x: unknown) => T | null): T[] {
  if (!Array.isArray(v)) return [];
  return v.map(mapper).filter((x): x is T => x !== null);
}

function clampSeverity(v: unknown): RiskDelta['severity'] {
  if (v === 'critical' || v === 'high' || v === 'moderate' || v === 'low') return v;
  return 'moderate';
}

function clampFeasibility(v: unknown): ExtendDeviceProposal['feasibility'] {
  if (v === 'straightforward' || v === 'moderate' || v === 'requires-redesign') return v;
  return 'moderate';
}

// ── Context loader ───────────────────────────────────────────────────────────

interface ProjectContext {
  project: {
    id: string; title: string; family_id: string; tier: number;
    region: string | null; working_language: string;
    safety_critical: boolean; medical_adjacent: boolean;
    metadata: Record<string, unknown>;
    status: string;
  };
  hkp: {
    manufacturer: string; part_number: string; revision: string | null;
    pinClusters: string;     // brief textual summary for the model
    keyClaims: string;       // brief textual summary
  } | null;
  has_deployed_fleet: boolean;
}

async function loadContext(db: DatabaseAdapter, projectId: string): Promise<ProjectContext> {
  const proj = await db.get(
    `SELECT id, title, family_id, tier, region, working_language,
            safety_critical, medical_adjacent, metadata, hkp_id, status
     FROM hardware_projects WHERE id = ?`,
    projectId,
  ) as Record<string, unknown> | undefined;
  if (!proj) throw new Error('Project not found');

  let hkp: ProjectContext['hkp'] = null;
  if (proj.hkp_id) {
    const r = await db.get(
      `SELECT manufacturer, part_number, revision FROM hardware_knowledge_packs WHERE id = ?`,
      proj.hkp_id as string,
    ) as Record<string, unknown> | undefined;
    if (r) {
      const claims = await db.all(
        `SELECT claim_path, claim_value FROM hkp_claims WHERE hkp_id = ?
         AND claim_path IN ('gpio.usable_count','gpio.input_only_pins','gpio.flash_reserved_pins',
                            'gpio.strapping_pins','adc1.gpio_pins','adc2.gpio_pins',
                            'i2c.count','spi.count','uart.count','dac.channel_count',
                            'wifi.standards','bluetooth.versions','psram')
         ORDER BY claim_path`,
        proj.hkp_id as string,
      ) as Array<{ claim_path: string; claim_value: string }>;
      const components = await db.all(
        `SELECT component_type, name FROM hkp_components WHERE hkp_id = ? ORDER BY component_type, name`,
        proj.hkp_id as string,
      ) as Array<{ component_type: string; name: string }>;
      hkp = {
        manufacturer: r.manufacturer as string,
        part_number: r.part_number as string,
        revision: (r.revision as string | null) ?? null,
        pinClusters: components.filter(c => c.component_type === 'pin-cluster').map(c => `- ${c.name}`).join('\n') || '(none)',
        keyClaims: claims.map(c => `${c.claim_path} = ${c.claim_value}`).join('\n'),
      };
    }
  }

  // Fleet check — for deployed projects we recommend a maintain plan
  const fleetRow = await db.get(
    `SELECT COUNT(*) AS n FROM hw_fleet_devices WHERE project_id = ? AND status = 'active'`,
    projectId,
  ) as { n: string | number } | undefined;
  const has_deployed_fleet = Number(fleetRow?.n ?? 0) > 0 || (proj.status === 'shipped' || proj.status === 'operating');

  return {
    project: {
      id: proj.id as string,
      title: proj.title as string,
      family_id: proj.family_id as string,
      tier: Number(proj.tier),
      region: (proj.region as string | null) ?? null,
      working_language: proj.working_language as string,
      safety_critical: Boolean(proj.safety_critical),
      medical_adjacent: Boolean(proj.medical_adjacent),
      metadata: parseJson(proj.metadata, {}),
      status: proj.status as string,
    },
    hkp,
    has_deployed_fleet,
  };
}

// ── Service ───────────────────────────────────────────────────────────────────

export function createExtendDeviceService(db: DatabaseAdapter) {

  async function generateProposal(input: ExtendDeviceInput): Promise<ExtendDeviceProposal> {
    if (!input.desired_change || input.desired_change.trim().length < 10) {
      throw new Error('Desired change description must be at least 10 characters');
    }
    const ctx = await loadContext(db, input.project_id);
    const model = input.model ?? 'claude-sonnet-4-6';

    if (!isApiKeyConfigured()) {
      // Honest fallback: produce a structured "we don't know yet" proposal.
      return fallbackProposal(ctx, input.desired_change, 'Anthropic API key not configured — proposal generator unavailable.');
    }

    const systemPrompt = `You produce structured "minimum-viable-change" proposals for embedded hardware projects. The user already has a working (or in-progress) project; they want to add or change ONE thing. Your job is to propose the smallest, safest change — not redesign the project.

Output format: a SINGLE JSON object with EXACTLY these fields, no surrounding prose, no markdown fences:

{
  "feasibility": "straightforward" | "moderate" | "requires-redesign",
  "summary": "1-3 sentence description of the proposed change",
  "pin_assignment_delta": [{"function": string, "pin": string, "rationale": string, "warnings": string[]}],
  "bom_delta": [{"part": string, "quantity": number, "estimated_cost_usd": number | null, "source_recommendation": string}],
  "posture_delta": {
    "enabled_components_added": string[],
    "enabled_components_removed": string[],
    "exposed_surfaces_added": string[],
    "exposed_surfaces_removed": string[],
    "cve_re_assessment_required": boolean
  },
  "firmware_change_summary": "what code changes; 2-5 sentences max",
  "risk_delta": [{"risk": string, "severity": "low"|"moderate"|"high"|"critical", "mitigation": string}],
  "recommended_maintain_plan": {
    "needed": boolean,
    "rationale": string,
    "suggested_change_kind": "firmware-update" | "config-change" | "calibration" | "partition-table" | "secure-boot-burn" | "recall" | undefined,
    "suggested_acceptance_rules": [{"metric": string, "operator": string, "threshold": number | string}]
  },
  "open_questions": [string, ...]
}

Rules:
- Use ONLY facts from the project context I provide. Do not invent component datasheet values, prices, or pin capabilities.
- Respect the HKP's pin-cluster constraints: never assign GPIO 6-11 (flash-reserved); never expect output capability on input-only pins (typically 34-39 on classic ESP32); flag warnings when assigning strapping pins.
- ADC awareness: if Wi-Fi is enabled (in the posture), don't assign ADC2 channels for any reading required during Wi-Fi.
- If the change needs an external IC (sensor, transceiver, level shifter), include it in bom_delta.
- recommended_maintain_plan.needed=true ONLY if the project is already deployed (has fleet devices or status indicates shipped/operating).
- For Tier 3 changes, include a risk entry about regulatory re-assessment (CRA / RED / MDR scope changes).
- If the change cannot be safely made without redesign, set feasibility="requires-redesign" and explain in summary; bom/pin deltas may be empty in that case.`;

    const userPrompt = `## Existing project

- Title: **${ctx.project.title}**
- Hardware family: ${ctx.project.family_id}
- Hardware reference: ${ctx.hkp ? `${ctx.hkp.manufacturer} ${ctx.hkp.part_number}${ctx.hkp.revision ? ` rev ${ctx.hkp.revision}` : ''}` : '(no HKP attached)'}
- Tier: ${ctx.project.tier}
- Region: ${ctx.project.region ?? '(unspecified)'}
- Safety-critical: ${ctx.project.safety_critical}
- Medical-adjacent: ${ctx.project.medical_adjacent}
- Status: ${ctx.project.status}
- Has deployed fleet: ${ctx.has_deployed_fleet}

## Project posture (from project.metadata.posture)

\`\`\`json
${JSON.stringify(ctx.project.metadata?.posture ?? {}, null, 2)}
\`\`\`

${ctx.hkp ? `## HKP key facts

${ctx.hkp.keyClaims}

## HKP pin clusters (must respect)

${ctx.hkp.pinClusters}` : ''}

## Desired change

${input.desired_change.trim()}

Now produce the JSON proposal following the schema in the system prompt exactly.`;

    const anthropic = getClient();
    const resp = await anthropic.messages.create({
      model,
      max_tokens: 2500,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });
    const textBlocks = resp.content.filter((b): b is Anthropic.TextBlock => b.type === 'text');
    const raw = textBlocks.map(b => b.text).join('').trim();

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return fallbackProposal(ctx, input.desired_change, 'Model returned no JSON block', raw);
    }
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    } catch (e) {
      return fallbackProposal(ctx, input.desired_change, `JSON parse failed: ${(e as Error).message}`, raw);
    }

    const postureDelta = parsed.posture_delta as Record<string, unknown> | undefined;
    const maintainPlan = parsed.recommended_maintain_plan as Record<string, unknown> | undefined;

    return {
      project_id: ctx.project.id,
      desired_change: input.desired_change.trim(),
      feasibility: clampFeasibility(parsed.feasibility),
      summary: typeof parsed.summary === 'string' ? parsed.summary : 'Proposal summary missing.',
      pin_assignment_delta: arrayOf(parsed.pin_assignment_delta, x => {
        const o = x as Record<string, unknown>;
        if (typeof o?.function !== 'string' || typeof o?.pin !== 'string') return null;
        return {
          function: o.function,
          pin: o.pin,
          rationale: typeof o.rationale === 'string' ? o.rationale : '',
          warnings: Array.isArray(o.warnings) ? o.warnings.filter((w: unknown) => typeof w === 'string') as string[] : [],
        };
      }),
      bom_delta: arrayOf(parsed.bom_delta, x => {
        const o = x as Record<string, unknown>;
        if (typeof o?.part !== 'string') return null;
        return {
          part: o.part,
          quantity: typeof o.quantity === 'number' ? o.quantity : 1,
          estimated_cost_usd: typeof o.estimated_cost_usd === 'number' ? o.estimated_cost_usd : null,
          source_recommendation: typeof o.source_recommendation === 'string' ? o.source_recommendation : '',
        };
      }),
      posture_delta: {
        enabled_components_added: arrayOf(postureDelta?.enabled_components_added, x => typeof x === 'string' ? x : null),
        enabled_components_removed: arrayOf(postureDelta?.enabled_components_removed, x => typeof x === 'string' ? x : null),
        exposed_surfaces_added: arrayOf(postureDelta?.exposed_surfaces_added, x => typeof x === 'string' ? x : null),
        exposed_surfaces_removed: arrayOf(postureDelta?.exposed_surfaces_removed, x => typeof x === 'string' ? x : null),
        cve_re_assessment_required: Boolean(postureDelta?.cve_re_assessment_required),
      },
      firmware_change_summary: typeof parsed.firmware_change_summary === 'string' ? parsed.firmware_change_summary : '',
      risk_delta: arrayOf(parsed.risk_delta, x => {
        const o = x as Record<string, unknown>;
        if (typeof o?.risk !== 'string') return null;
        return {
          risk: o.risk,
          severity: clampSeverity(o.severity),
          mitigation: typeof o.mitigation === 'string' ? o.mitigation : '',
        };
      }),
      recommended_maintain_plan: {
        needed: Boolean(maintainPlan?.needed),
        rationale: typeof maintainPlan?.rationale === 'string' ? maintainPlan.rationale : '',
        suggested_change_kind: typeof maintainPlan?.suggested_change_kind === 'string' ? maintainPlan.suggested_change_kind : undefined,
        suggested_acceptance_rules: arrayOf(maintainPlan?.suggested_acceptance_rules, x => {
          const o = x as Record<string, unknown>;
          if (typeof o?.metric !== 'string') return null;
          return {
            metric: o.metric,
            operator: typeof o.operator === 'string' ? o.operator : '>=',
            threshold: (typeof o.threshold === 'number' || typeof o.threshold === 'string') ? o.threshold : 0,
          };
        }),
      },
      open_questions: arrayOf(parsed.open_questions, x => typeof x === 'string' ? x : null),
    };
  }

  function fallbackProposal(ctx: ProjectContext, desiredChange: string, reason: string, raw?: string): ExtendDeviceProposal {
    return {
      project_id: ctx.project.id,
      desired_change: desiredChange,
      feasibility: 'moderate',
      summary: 'Automatic proposal could not be generated. Use the architecture / pin-mapper modules manually.',
      pin_assignment_delta: [],
      bom_delta: [],
      posture_delta: {
        enabled_components_added: [],
        enabled_components_removed: [],
        exposed_surfaces_added: [],
        exposed_surfaces_removed: [],
        cve_re_assessment_required: false,
      },
      firmware_change_summary: '(unavailable)',
      risk_delta: [],
      recommended_maintain_plan: {
        needed: ctx.has_deployed_fleet,
        rationale: ctx.has_deployed_fleet
          ? 'Project has a deployed fleet — any change should ship via a Maintain plan with rollback.'
          : 'Project has no deployed fleet yet — change can be made in-place.',
      },
      open_questions: ['Re-run when an Anthropic API key is configured to get a structured proposal.'],
      parse_error: reason,
      raw_model_output: raw?.slice(0, 4000),
    };
  }

  return { generateProposal };
}

export type ExtendDeviceService = ReturnType<typeof createExtendDeviceService>;
