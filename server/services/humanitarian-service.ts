/**
 * humanitarian-service.ts — humanitarian deployment record + capacity-transfer
 * artefact generators with localization (Phase 8).
 *
 * Per spec §13: humanitarian Tier 3 deployments NEVER ship without local-
 * language capacity-transfer artefacts. The 6 required artefacts:
 *
 *   installation-guide        — first-time install procedure
 *   operator-checklist        — daily / weekly / monthly checks
 *   troubleshooting-flowchart — field decision tree, mirrors HKP diagnostic cases
 *   spares-procedure          — spare-part stocking + replacement
 *   escalation                — who to call when, in what order, with what info
 *   decommissioning           — end-of-life + safe disposal
 *
 * Generation strategy: each artefact has a deterministic structural skeleton
 * (sections, ordering, what to cover). The actual prose is produced by Claude
 * in the project's working_language using a focused prompt that forces the
 * model to use the project + HKP context. If the API key is unavailable, we
 * fall back to an English skeleton with explicit [TRANSLATE TO {language}]
 * markers — the user knows immediately that translation is owed.
 *
 * Sign-off model is identical to regulatory artefacts (≥30-char attestation,
 * content-hashed audit trail).
 */

import { createHash } from 'crypto';
import type { DatabaseAdapter } from '../db/database.js';
import { getClient, isApiKeyConfigured } from './claude-client.js';

// ── Vocabulary ────────────────────────────────────────────────────────────────

export type CapacityArtefactKind =
  | 'installation-guide'
  | 'operator-checklist'
  | 'troubleshooting-flowchart'
  | 'spares-procedure'
  | 'escalation'
  | 'decommissioning';

export type CapacityArtefactStatus = 'draft' | 'generated' | 'user-reviewed' | 'signed-off' | 'withdrawn';
export type GeneratorKind = 'claude-localized' | 'english-skeleton-fallback' | 'manual';

export type DeploymentStatus = 'planning' | 'training' | 'pilot' | 'rollout' | 'operating' | 'transferred' | 'decommissioned';
export type InternetPosture = 'none' | 'intermittent' | 'scheduled' | 'always-on';
export type PowerPosture = 'grid' | 'grid+battery' | 'solar' | 'generator' | 'battery';

export const CAPACITY_ARTEFACT_REGISTRY: Array<{ kind: CapacityArtefactKind; title: string; purpose: string; sections: string[] }> = [
  {
    kind: 'installation-guide',
    title: 'Installation Guide',
    purpose: 'Walks the local technician through first-time installation of one device',
    sections: [
      'Tools and materials needed',
      'Site preparation (power, mounting, ambient)',
      'Step-by-step installation procedure (numbered)',
      'First-power-up checks',
      'Verification: how to know the device is working',
      'Common mistakes and how to recover',
    ],
  },
  {
    kind: 'operator-checklist',
    title: 'Operator Checklist (Daily / Weekly / Monthly)',
    purpose: 'Routine checks the local operator runs to keep the device healthy',
    sections: [
      'Daily checks (≤5 minutes)',
      'Weekly checks (≤15 minutes)',
      'Monthly checks (≤30 minutes)',
      'When to escalate (concrete trigger conditions)',
      'How to log and report observations',
    ],
  },
  {
    kind: 'troubleshooting-flowchart',
    title: 'Field Troubleshooting Flowchart',
    purpose: 'A decision tree the local technician follows when something is wrong',
    sections: [
      'Symptom → first observation question (no special tools)',
      'Symptom → measurement (multimeter / serial console)',
      'Symptom → known case from HKP diagnostic layer (cross-reference)',
      'When to swap a known-good replacement vs continue diagnosing',
      'When to escalate beyond the local team',
    ],
  },
  {
    kind: 'spares-procedure',
    title: 'Spares Procedure',
    purpose: 'How to identify, stock, and replace spare parts locally',
    sections: [
      'Required spare parts (with HKP part numbers)',
      'Recommended spare quantities for the fleet size',
      'Where the spares are stored locally',
      'How to identify which part has failed',
      'Step-by-step replacement procedure',
      'How to verify the replacement worked',
      'How to dispose of / return the failed part',
    ],
  },
  {
    kind: 'escalation',
    title: 'Escalation Procedure',
    purpose: 'Who to contact when, with what information',
    sections: [
      'Tier 1 — local technician (always first call)',
      'Tier 2 — implementing partner technical lead',
      'Tier 3 — vendor / ANTON support',
      'What information to gather BEFORE escalating',
      'Maximum response time at each tier',
      'Emergency contacts (if device causes harm)',
    ],
  },
  {
    kind: 'decommissioning',
    title: 'Decommissioning + Safe Disposal',
    purpose: 'How to safely retire a device at end-of-life',
    sections: [
      'When to decommission (triggers)',
      'Data wiping procedure (factory reset, physical key destruction)',
      'Battery removal + safe disposal (if any)',
      'PCB / electronic waste disposal route in the deployment region',
      'How to record the decommissioning in the fleet register',
      'Hand-off back to the implementing partner',
    ],
  },
];

// ── Types ─────────────────────────────────────────────────────────────────────

export interface HumanitarianDeployment {
  id: string;
  project_id: string;
  local_partner_name: string;
  local_partner_contact: string;
  ocha_cluster: string | null;
  cluster_contact: string | null;
  donor_exit_date: string | null;
  post_donor_plan: string | null;
  units_planned: number;
  internet_posture: InternetPosture;
  power_posture: PowerPosture;
  status: DeploymentStatus;
  metadata: Record<string, unknown>;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface CapacityArtefact {
  id: string;
  project_id: string;
  kind: CapacityArtefactKind;
  title: string;
  language: string;
  status: CapacityArtefactStatus;
  content_markdown: string | null;
  generator_version: string | null;
  generator_kind: GeneratorKind;
  generator_inputs: Record<string, unknown> | null;
  signed_off_by: string | null;
  signed_off_at: string | null;
  signoff_attestation: string | null;
  withdrawn_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CapacityArtefactStatusEntry {
  kind: CapacityArtefactKind;
  title: string;
  artefact: CapacityArtefact | null;
}

export interface CapacityPackSummary {
  total: number;
  signed_off: number;
  user_reviewed: number;
  generated: number;
  missing: number;
  ready_to_handover: boolean;
  language: string;
  blockers: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseJson<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== 'string') return value as T;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

function rowToDeployment(r: Record<string, unknown>): HumanitarianDeployment {
  return {
    id: r.id as string,
    project_id: r.project_id as string,
    local_partner_name: r.local_partner_name as string,
    local_partner_contact: r.local_partner_contact as string,
    ocha_cluster: (r.ocha_cluster as string | null) ?? null,
    cluster_contact: (r.cluster_contact as string | null) ?? null,
    donor_exit_date: (r.donor_exit_date as string | null) ?? null,
    post_donor_plan: (r.post_donor_plan as string | null) ?? null,
    units_planned: Number(r.units_planned),
    internet_posture: r.internet_posture as InternetPosture,
    power_posture: r.power_posture as PowerPosture,
    status: r.status as DeploymentStatus,
    metadata: parseJson(r.metadata, {}),
    created_by: r.created_by as string,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
  };
}

function rowToArtefact(r: Record<string, unknown>): CapacityArtefact {
  return {
    id: r.id as string,
    project_id: r.project_id as string,
    kind: r.kind as CapacityArtefactKind,
    title: r.title as string,
    language: r.language as string,
    status: r.status as CapacityArtefactStatus,
    content_markdown: (r.content_markdown as string | null) ?? null,
    generator_version: (r.generator_version as string | null) ?? null,
    generator_kind: r.generator_kind as GeneratorKind,
    generator_inputs: parseJson(r.generator_inputs, null),
    signed_off_by: (r.signed_off_by as string | null) ?? null,
    signed_off_at: (r.signed_off_at as string | null) ?? null,
    signoff_attestation: (r.signoff_attestation as string | null) ?? null,
    withdrawn_at: (r.withdrawn_at as string | null) ?? null,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
  };
}

const GENERATOR_VERSION = '1.0.0';

// ── Localized generation ─────────────────────────────────────────────────────

interface GenerationContext {
  project: {
    id: string;
    title: string;
    family_id: string;
    region: string | null;
    working_language: string;
    safety_critical: boolean;
    medical_adjacent: boolean;
  };
  hkp: {
    manufacturer: string;
    part_number: string;
    revision: string | null;
  } | null;
  deployment: HumanitarianDeployment | null;
  regional_alternatives: Array<{
    alternative_part: string;
    distributor: string | null;
    typical_price_local: number | null;
    typical_price_currency: string | null;
    counterfeit_risk: string | null;
  }>;
  diagnostic_cases: Array<{ case_id: string; title: string; severity: string | null }>;
}

async function loadContext(db: DatabaseAdapter, projectId: string): Promise<GenerationContext> {
  const proj = await db.get(
    `SELECT id, title, family_id, region, working_language, safety_critical, medical_adjacent, hkp_id
     FROM hardware_projects WHERE id = ?`,
    projectId,
  ) as Record<string, unknown> | undefined;
  if (!proj) throw new Error('Project not found');

  let hkp: GenerationContext['hkp'] = null;
  let regional: GenerationContext['regional_alternatives'] = [];
  if (proj.hkp_id) {
    const r = await db.get(
      `SELECT manufacturer, part_number, revision FROM hardware_knowledge_packs WHERE id = ?`,
      proj.hkp_id as string,
    ) as Record<string, unknown> | undefined;
    if (r) {
      hkp = {
        manufacturer: r.manufacturer as string,
        part_number: r.part_number as string,
        revision: (r.revision as string | null) ?? null,
      };
    }
    if (proj.region) {
      const altRows = await db.all(
        `SELECT alternative_part, distributor, typical_price_local,
                typical_price_currency, counterfeit_risk
         FROM hkp_regional_alternatives
         WHERE hkp_id = ? AND region = ?
         ORDER BY counterfeit_risk ASC NULLS LAST, typical_price_local ASC NULLS LAST
         LIMIT 8`,
        proj.hkp_id as string, proj.region as string,
      ) as typeof regional;
      regional = altRows;
    }
  }

  const cases = await db.all(
    `SELECT case_id, title, severity FROM diagnostic_cases
     WHERE family_id = ?
     ORDER BY (severity = 'critical') DESC, (severity = 'high') DESC, last_updated DESC
     LIMIT 10`,
    proj.family_id as string,
  ) as GenerationContext['diagnostic_cases'];

  const deploymentRow = await db.get(
    `SELECT * FROM hw_humanitarian_deployments WHERE project_id = ?`,
    projectId,
  ) as Record<string, unknown> | undefined;

  return {
    project: {
      id: proj.id as string,
      title: proj.title as string,
      family_id: proj.family_id as string,
      region: (proj.region as string | null) ?? null,
      working_language: proj.working_language as string,
      safety_critical: Boolean(proj.safety_critical),
      medical_adjacent: Boolean(proj.medical_adjacent),
    },
    hkp,
    deployment: deploymentRow ? rowToDeployment(deploymentRow) : null,
    regional_alternatives: regional,
    diagnostic_cases: cases,
  };
}

function englishSkeletonFor(kind: CapacityArtefactKind, ctx: GenerationContext): string {
  const def = CAPACITY_ARTEFACT_REGISTRY.find(r => r.kind === kind)!;
  const lang = ctx.project.working_language;
  const lines: string[] = [];

  lines.push(`# ${def.title} — ${ctx.project.title}`);
  lines.push('');
  lines.push(`> **English skeleton — TRANSLATE TO ${lang.toUpperCase()} BEFORE USE.**`);
  lines.push(`> Generated by ANTON ${GENERATOR_VERSION} as a fallback. The Claude-localized generator was unavailable (no API key) at generation time. Re-run when an API key is available, OR translate manually + sign off.`);
  lines.push('');
  lines.push(`## Project context`);
  lines.push('');
  lines.push(`- Project: ${ctx.project.title}`);
  lines.push(`- Hardware: ${ctx.hkp ? `${ctx.hkp.manufacturer} ${ctx.hkp.part_number}` : '[…]'}`);
  lines.push(`- Region: ${ctx.project.region ?? '[…]'}`);
  lines.push(`- Local partner: ${ctx.deployment?.local_partner_name ?? '[…]'}`);
  lines.push(`- Working language: ${lang}`);
  lines.push('');
  for (const section of def.sections) {
    lines.push(`## ${section}`);
    lines.push('');
    lines.push(`[TRANSLATE TO ${lang.toUpperCase()}]`);
    lines.push('[Section body — populated from project context. Replace with concrete text.]');
    lines.push('');
  }
  return lines.join('\n');
}

async function claudeLocalizedFor(kind: CapacityArtefactKind, ctx: GenerationContext): Promise<string> {
  const def = CAPACITY_ARTEFACT_REGISTRY.find(r => r.kind === kind)!;
  const anthropic = getClient();

  const sections = def.sections.map((s, i) => `${i + 1}. ${s}`).join('\n');
  const regional = ctx.regional_alternatives.length
    ? ctx.regional_alternatives.slice(0, 5).map(a =>
        `- ${a.alternative_part} via ${a.distributor ?? 'unknown'} — ${a.typical_price_local ? `${a.typical_price_local} ${a.typical_price_currency ?? ''}` : 'price unknown'} · counterfeit risk: ${a.counterfeit_risk ?? 'unknown'}`,
      ).join('\n')
    : '(no regional sourcing alternatives recorded for this region)';
  const cases = ctx.diagnostic_cases.length
    ? ctx.diagnostic_cases.slice(0, 6).map(c => `- ${c.case_id} (${c.severity ?? '—'}) — ${c.title}`).join('\n')
    : '(no diagnostic cases for this hardware family)';

  const systemPrompt = `You generate operator-facing documentation for humanitarian hardware deployments. Your output is read by a local technician — typically not an electrical engineer, often working in challenging conditions with limited tools.

Output language: ${ctx.project.working_language} (ISO 639-1). Write the entire document in this language. If you do not know the language well enough to be safe in operational contexts, return only an English skeleton with explicit [TRANSLATE TO ${ctx.project.working_language.toUpperCase()}] markers in each section — do not produce broken or partly-translated content.

Format: Markdown. Start with an H1 title. Use H2 for each required section. Use numbered lists for procedures. Use plain language; if you must use a technical term, briefly define it the first time.

Tone: direct, calm, respectful. The reader is competent in their work — give them what they need, not paragraphs of caveats. Avoid passive voice. Prefer "do this" over "this should be done".

Constraints:
- Use ONLY facts from the project context I provide. Do not invent component details, prices, distributor names, or contact information.
- Where a fact is missing, write "[…]" so the operator knows to fill it in. Do not fabricate.
- Reference the project's actual hardware (${ctx.hkp ? `${ctx.hkp.manufacturer} ${ctx.hkp.part_number}` : 'unknown HKP'}) by name when relevant.
- For procedures: numbered, one action per step, expected result after each step where helpful.
- Length: ~300-700 words. Don't pad.`;

  const userPrompt = `## Document to produce

**Title:** ${def.title}
**Purpose:** ${def.purpose}

**Required sections (in this order):**
${sections}

## Project context

- Project: **${ctx.project.title}**
- Hardware: ${ctx.hkp ? `${ctx.hkp.manufacturer} ${ctx.hkp.part_number}${ctx.hkp.revision ? ` rev ${ctx.hkp.revision}` : ''}` : '(no HKP attached)'}
- Hardware family: ${ctx.project.family_id}
- Deployment region: ${ctx.project.region ?? '(unspecified)'}
- Working language: ${ctx.project.working_language}
- Safety-critical: ${ctx.project.safety_critical ? 'YES' : 'no'}
- Medical-adjacent: ${ctx.project.medical_adjacent ? 'YES' : 'no'}

## Local partner + deployment context

${ctx.deployment ? `- Local partner: **${ctx.deployment.local_partner_name}** (${ctx.deployment.local_partner_contact})
- OCHA cluster: ${ctx.deployment.ocha_cluster ?? '(unspecified)'}
- Internet posture: ${ctx.deployment.internet_posture}
- Power posture: ${ctx.deployment.power_posture}
- Units planned: ${ctx.deployment.units_planned}
- Donor exit date: ${ctx.deployment.donor_exit_date ?? '(open)'}` : '- No deployment record yet — use [LOCAL PARTNER] / [REGION] placeholders where the deployment record is missing.'}

## Regional sourcing alternatives (use for spares procedure especially)

${regional}

## Diagnostic cases for this hardware family (cross-reference for troubleshooting)

${cases}

Now produce the document in ${ctx.project.working_language}, following the section list exactly.`;

  const resp = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 3000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  // Extract text content
  const textBlocks = resp.content.filter((b): b is { type: 'text'; text: string } => b.type === 'text');
  return textBlocks.map(b => b.text).join('').trim();
}

async function generateContent(kind: CapacityArtefactKind, ctx: GenerationContext): Promise<{ content: string; generatorKind: GeneratorKind }> {
  if (!isApiKeyConfigured()) {
    return { content: englishSkeletonFor(kind, ctx), generatorKind: 'english-skeleton-fallback' };
  }
  try {
    const content = await claudeLocalizedFor(kind, ctx);
    if (!content || content.length < 200) {
      // Defensive: empty or near-empty model output → fallback
      return { content: englishSkeletonFor(kind, ctx), generatorKind: 'english-skeleton-fallback' };
    }
    return { content, generatorKind: 'claude-localized' };
  } catch (err) {
    console.warn('[humanitarian-service] Claude generation failed, falling back to English skeleton:', err instanceof Error ? err.message : err);
    return { content: englishSkeletonFor(kind, ctx), generatorKind: 'english-skeleton-fallback' };
  }
}

// ── Service ───────────────────────────────────────────────────────────────────

export interface UpsertDeploymentInput {
  project_id: string;
  owner_id: string;
  local_partner_name: string;
  local_partner_contact: string;
  ocha_cluster?: string | null;
  cluster_contact?: string | null;
  donor_exit_date?: string | null;
  post_donor_plan?: string | null;
  units_planned?: number;
  internet_posture?: InternetPosture;
  power_posture?: PowerPosture;
  status?: DeploymentStatus;
  metadata?: Record<string, unknown>;
}

export function createHumanitarianService(db: DatabaseAdapter) {

  async function getDeployment(projectId: string): Promise<HumanitarianDeployment | null> {
    const r = await db.get(
      `SELECT * FROM hw_humanitarian_deployments WHERE project_id = ?`,
      projectId,
    );
    return r ? rowToDeployment(r) : null;
  }

  async function upsertDeployment(input: UpsertDeploymentInput): Promise<HumanitarianDeployment> {
    const existing = await getDeployment(input.project_id);
    if (existing) {
      const sets: string[] = [];
      const params: unknown[] = [];
      const apply = (col: string, v: unknown) => { sets.push(`${col} = ?`); params.push(v); };
      if (input.local_partner_name) apply('local_partner_name', input.local_partner_name);
      if (input.local_partner_contact) apply('local_partner_contact', input.local_partner_contact);
      if (input.ocha_cluster !== undefined) apply('ocha_cluster', input.ocha_cluster ?? null);
      if (input.cluster_contact !== undefined) apply('cluster_contact', input.cluster_contact ?? null);
      if (input.donor_exit_date !== undefined) apply('donor_exit_date', input.donor_exit_date ?? null);
      if (input.post_donor_plan !== undefined) apply('post_donor_plan', input.post_donor_plan ?? null);
      if (input.units_planned !== undefined) apply('units_planned', input.units_planned);
      if (input.internet_posture) apply('internet_posture', input.internet_posture);
      if (input.power_posture) apply('power_posture', input.power_posture);
      if (input.status) apply('status', input.status);
      if (input.metadata !== undefined) apply('metadata', JSON.stringify(input.metadata));
      sets.push('updated_at = NOW()');
      params.push(input.project_id);
      const r = await db.get(
        `UPDATE hw_humanitarian_deployments SET ${sets.join(', ')} WHERE project_id = ? RETURNING *`,
        ...params,
      );
      return rowToDeployment(r as Record<string, unknown>);
    }
    const r = await db.get(
      `INSERT INTO hw_humanitarian_deployments
        (project_id, local_partner_name, local_partner_contact, ocha_cluster, cluster_contact,
         donor_exit_date, post_donor_plan, units_planned, internet_posture, power_posture,
         status, metadata, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
      input.project_id, input.local_partner_name, input.local_partner_contact,
      input.ocha_cluster ?? null, input.cluster_contact ?? null,
      input.donor_exit_date ?? null, input.post_donor_plan ?? null,
      input.units_planned ?? 1, input.internet_posture ?? 'intermittent',
      input.power_posture ?? 'grid+battery',
      input.status ?? 'planning',
      JSON.stringify(input.metadata ?? {}),
      input.owner_id,
    );
    if (!r) throw new Error('Failed to create deployment');
    return rowToDeployment(r);
  }

  async function listArtefacts(projectId: string): Promise<CapacityArtefactStatusEntry[]> {
    const rows = await db.all(
      `SELECT * FROM hw_capacity_transfer_artefacts WHERE project_id = ?`,
      projectId,
    ) as Array<Record<string, unknown>>;
    const byKind = new Map(rows.map(r => [r.kind as CapacityArtefactKind, rowToArtefact(r)]));
    return CAPACITY_ARTEFACT_REGISTRY.map(def => ({
      kind: def.kind, title: def.title, artefact: byKind.get(def.kind) ?? null,
    }));
  }

  async function getArtefact(id: string): Promise<CapacityArtefact | null> {
    const r = await db.get('SELECT * FROM hw_capacity_transfer_artefacts WHERE id = ?', id);
    return r ? rowToArtefact(r) : null;
  }

  async function generateOrRegenerate(input: { project_id: string; kind: CapacityArtefactKind; actor_id: string }): Promise<CapacityArtefact> {
    const ctx = await loadContext(db, input.project_id);
    const def = CAPACITY_ARTEFACT_REGISTRY.find(r => r.kind === input.kind);
    if (!def) throw new Error(`Unknown capacity-transfer artefact kind: ${input.kind}`);

    const { content, generatorKind } = await generateContent(input.kind, ctx);
    const inputsSnapshot = {
      family_id: ctx.project.family_id,
      region: ctx.project.region,
      working_language: ctx.project.working_language,
      safety_critical: ctx.project.safety_critical,
      medical_adjacent: ctx.project.medical_adjacent,
      hkp_part: ctx.hkp?.part_number ?? null,
      regional_alternatives_count: ctx.regional_alternatives.length,
      diagnostic_cases_count: ctx.diagnostic_cases.length,
      generator_kind: generatorKind,
    };

    const existing = await db.get(
      `SELECT id FROM hw_capacity_transfer_artefacts WHERE project_id = ? AND kind = ?`,
      input.project_id, input.kind,
    ) as { id: string } | undefined;

    let row: Record<string, unknown> | undefined;
    if (existing) {
      row = await db.get(
        `UPDATE hw_capacity_transfer_artefacts
         SET content_markdown = ?, language = ?, generator_version = ?, generator_kind = ?,
             generator_inputs = ?,
             status = 'generated',
             signed_off_by = NULL, signed_off_at = NULL, signoff_attestation = NULL,
             updated_at = NOW()
         WHERE id = ? RETURNING *`,
        content, ctx.project.working_language, GENERATOR_VERSION, generatorKind,
        JSON.stringify(inputsSnapshot), existing.id,
      ) as Record<string, unknown> | undefined;
      await db.run(
        `INSERT INTO hw_capacity_transfer_signoffs (artefact_id, action, actor_id, content_hash)
         VALUES (?, 'regenerated', ?, ?)`,
        existing.id, input.actor_id, sha256(content),
      );
    } else {
      row = await db.get(
        `INSERT INTO hw_capacity_transfer_artefacts
          (project_id, kind, title, language, status, content_markdown,
           generator_version, generator_kind, generator_inputs)
         VALUES (?, ?, ?, ?, 'generated', ?, ?, ?, ?) RETURNING *`,
        input.project_id, input.kind, def.title,
        ctx.project.working_language, content,
        GENERATOR_VERSION, generatorKind, JSON.stringify(inputsSnapshot),
      ) as Record<string, unknown> | undefined;
    }
    if (!row) throw new Error('Failed to write capacity-transfer artefact');
    return rowToArtefact(row);
  }

  async function updateContent(input: { artefact_id: string; actor_id: string; content_markdown: string }): Promise<CapacityArtefact | null> {
    const r = await db.get(
      `UPDATE hw_capacity_transfer_artefacts
       SET content_markdown = ?, status = 'user-reviewed',
           signed_off_by = NULL, signed_off_at = NULL, signoff_attestation = NULL,
           updated_at = NOW()
       WHERE id = ? RETURNING *`,
      input.content_markdown, input.artefact_id,
    );
    if (!r) return null;
    await db.run(
      `INSERT INTO hw_capacity_transfer_signoffs (artefact_id, action, actor_id, content_hash)
       VALUES (?, 'edited', ?, ?)`,
      input.artefact_id, input.actor_id, sha256(input.content_markdown),
    );
    return rowToArtefact(r);
  }

  async function signOff(input: { artefact_id: string; actor_id: string; attestation: string }): Promise<CapacityArtefact> {
    const existing = await db.get(
      `SELECT content_markdown, language, generator_kind FROM hw_capacity_transfer_artefacts WHERE id = ?`,
      input.artefact_id,
    ) as { content_markdown: string | null; language: string; generator_kind: GeneratorKind } | undefined;
    if (!existing) throw new Error('Artefact not found');
    if (!existing.content_markdown || existing.content_markdown.trim().length < 100) {
      throw new Error('Cannot sign off an empty or trivial artefact — generate or write content first');
    }
    if (input.attestation.trim().length < 30) {
      throw new Error('Sign-off attestation text is too short — operator must affirm responsibility explicitly');
    }
    if (existing.generator_kind === 'english-skeleton-fallback' && existing.content_markdown.includes('[TRANSLATE TO ')) {
      throw new Error('Cannot sign off an artefact that still contains [TRANSLATE TO …] markers — translate first or regenerate when API key is available');
    }
    const r = await db.get(
      `UPDATE hw_capacity_transfer_artefacts
       SET status = 'signed-off', signed_off_by = ?, signed_off_at = NOW(),
           signoff_attestation = ?, withdrawn_at = NULL, updated_at = NOW()
       WHERE id = ? RETURNING *`,
      input.actor_id, input.attestation.trim(), input.artefact_id,
    );
    if (!r) throw new Error('Failed to sign off');
    await db.run(
      `INSERT INTO hw_capacity_transfer_signoffs (artefact_id, action, actor_id, attestation, content_hash)
       VALUES (?, 'signed-off', ?, ?, ?)`,
      input.artefact_id, input.actor_id, input.attestation.trim(), sha256(existing.content_markdown),
    );
    return rowToArtefact(r);
  }

  async function withdraw(input: { artefact_id: string; actor_id: string; reason?: string }): Promise<CapacityArtefact> {
    const r = await db.get(
      `UPDATE hw_capacity_transfer_artefacts
       SET status = 'withdrawn', withdrawn_at = NOW(), updated_at = NOW()
       WHERE id = ? RETURNING *`,
      input.artefact_id,
    );
    if (!r) throw new Error('Failed to withdraw');
    await db.run(
      `INSERT INTO hw_capacity_transfer_signoffs (artefact_id, action, actor_id, reason)
       VALUES (?, 'withdrawn', ?, ?)`,
      input.artefact_id, input.actor_id, input.reason ?? null,
    );
    return rowToArtefact(r);
  }

  async function listSignoffs(artefactId: string): Promise<Array<{ id: string; action: string; actor_id: string; attestation: string | null; reason: string | null; content_hash: string | null; occurred_at: string }>> {
    const rows = await db.all(
      `SELECT id, action, actor_id, attestation, reason, content_hash, occurred_at
       FROM hw_capacity_transfer_signoffs WHERE artefact_id = ? ORDER BY occurred_at DESC`,
      artefactId,
    );
    return rows as Array<{ id: string; action: string; actor_id: string; attestation: string | null; reason: string | null; content_hash: string | null; occurred_at: string }>;
  }

  async function assessCompleteness(projectId: string): Promise<CapacityPackSummary> {
    const list = await listArtefacts(projectId);
    const proj = await db.get('SELECT working_language FROM hardware_projects WHERE id = ?', projectId) as { working_language: string } | undefined;
    let signed = 0, reviewed = 0, generated = 0, missing = 0;
    const blockers: string[] = [];
    for (const item of list) {
      if (!item.artefact) {
        missing++;
        blockers.push(`Missing: ${item.title}`);
        continue;
      }
      if (item.artefact.generator_kind === 'english-skeleton-fallback' && item.artefact.status !== 'signed-off') {
        blockers.push(`${item.title} is an English fallback skeleton — translate to ${item.artefact.language} or regenerate.`);
      }
      switch (item.artefact.status) {
        case 'signed-off': signed++; break;
        case 'user-reviewed':
          reviewed++;
          blockers.push(`${item.title} reviewed but not signed off.`);
          break;
        case 'generated':
          generated++;
          blockers.push(`${item.title} generated but not yet reviewed by operator.`);
          break;
        case 'withdrawn':
          missing++;
          blockers.push(`${item.title} sign-off was withdrawn — re-generate or re-sign.`);
          break;
        case 'draft':
          generated++;
          blockers.push(`${item.title} is in draft state.`);
          break;
      }
    }
    return {
      total: list.length,
      signed_off: signed,
      user_reviewed: reviewed,
      generated,
      missing,
      ready_to_handover: blockers.length === 0,
      language: proj?.working_language ?? 'en',
      blockers,
    };
  }

  return {
    getDeployment,
    upsertDeployment,
    listArtefacts,
    getArtefact,
    generateOrRegenerate,
    updateContent,
    signOff,
    withdraw,
    listSignoffs,
    assessCompleteness,
    GENERATOR_VERSION,
  };
}

export type HumanitarianService = ReturnType<typeof createHumanitarianService>;
