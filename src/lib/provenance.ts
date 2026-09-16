/**
 * provenance.ts — pure helpers behind the Provenance panel (Wave 1, the
 * explainability contract). No React, no fetch: everything here is unit-
 * testable in node, and the panel only renders what these return.
 *
 *  - layer label map for run_artifacts.layer_summary keys (unknown keys pass
 *    through untouched, so new layers the server adds render without a UI change)
 *  - engine / cost labels for the config snapshot's Wave-0 ledger fields
 *  - the caveat-section parser: pulls the model's own "Sources, assumptions and
 *    what was not checked" style sections out of the answer markdown
 *  - depth-by-transparency-level defaults: the level sets what opens by
 *    default, never a ceiling on what the user may open
 */

// ── Layers ────────────────────────────────────────────────────

/** Friendly names for run_artifacts.layer_summary keys — current assembly names first, pre-2026-09-16 names kept so old records still read. */
export const LAYER_LABELS: Record<string, string> = {
  // Whole-prompt pins
  composed_full: 'Composed prompt (whole string the engine received)',
  composed_static_cached: 'Static block (cached on caching API models)',
  composed_dynamic: 'Dynamic block (per-run)',
  // Current assembly order (routes/claude.ts, 2026-09-16)
  layer2_foundation: 'Layer 2 · Foundation',
  layer2a_org_context: 'Layer 2a · Organisation context',
  layer2b_knowledge_pack: 'Layer 2b · Knowledge pack grounding',
  layer2c_roaring: 'Layer 2c · Roaring entity data',
  layer2d_dowjones: 'Layer 2d · Dow Jones screening',
  layer2e_atoms: 'Layer 2e · Institutional memory (atoms)',
  layer3_area_context: 'Layer 3 · Area context',
  layer4_module_prompt: 'Layer 4 · Module prompt',
  layer4c_guardrail: 'Layer 4c · Guardrail',
  layer4a_resume_context: 'Layer 4a · Resumed session context',
  layer4b_project_context: 'Layer 4b · Project context',
  layer4_5_goals_values: 'Layer 4.5 · Goals & values',
  layer0_profile: 'Layer 0 · User profile',
  layer1_creativity: 'Layer 1 · Creativity',
  layer1_tone: 'Layer 1 · Tone',
  layer1_emoji: 'Layer 1 · Emoji policy',
  layer1_communications: 'Layer 1 · Communications (audience / channel)',
  layer1_output_language: 'Layer 1 · Output language',
  layer5_personas: 'Layer 5 · Personas',
  layer6_skills: 'Layer 6 · Skills',
  layer6b_output_format: 'Layer 6b · Output format',
  layer7_provenance_contract: 'Layer 7 · Provenance contract',
  layer7a_multi_perspective: 'Layer 7a · Multi-perspective',
  layer7b_structured_reasoning: 'Layer 7b · Structured reasoning',
  layer7c_structure_reference: 'Layer 7c · Structure reference',
  layer7e_reference_output: 'Layer 7e · Reference output',
  layer7d_transparency: 'Layer 7d · Transparency instruction',
  layer7_plan_first: 'Layer 7 · Plan first',
  layer7_5_business_context: 'Layer 7.5 · Business context',
  layer8_knowledge_additions: 'Layer 8 · Knowledge sources',
  layer9_reference_documents: 'Layer 9 · Reference documents',
  // Names written before 2026-09-16 (older run records still carry them)
  composed_static_layers_1_3_cached: 'Static layers 1–3 (cached block)',
  layer1_foundation: 'Layer 1 · Foundation',
  layer1_style: 'Layer 1 · Style',
  layer3_module_prompt: 'Layer 3 · Module prompt',
  layer4_personas: 'Layer 4 · Personas',
  layer5_skills: 'Layer 5 · Skills',
  layer6_atoms: 'Layer 6 · Institutional memory (atoms)',
  layer6_knowledge_system_additions: 'Layer 6 · Knowledge sources',
  layer6_reference_documents: 'Layer 6 · Reference documents',
  layer7_output_format: 'Layer 7 · Output format',
  layer7_transparency: 'Layer 7 · Transparency instruction',
  goals_values: 'Goals & values',
  business_context: 'Business context',
};

export const ATOM_AB_ARM_PREFIX = 'atom_ab_arm_';

/** The A/B arm tag rides in the layer name (`atom_ab_arm_<arm>`); null for ordinary layers. */
export function atomArmFromLayerKey(key: string): string | null {
  return key.startsWith(ATOM_AB_ARM_PREFIX) ? key.slice(ATOM_AB_ARM_PREFIX.length) : null;
}

/** Friendly label for a layer key; unknown keys come back as-is so nothing is hidden. */
export function layerLabel(key: string): string {
  const arm = atomArmFromLayerKey(key);
  if (arm !== null) return `Memory A/B arm · ${arm}`;
  return LAYER_LABELS[key] ?? key;
}

// ── Engine & cost ─────────────────────────────────────────────

export function engineLabel(engine: string | null | undefined): string {
  switch (engine) {
    case 'anthropic_sdk': return 'Claude subscription';
    case 'openai_codex': return 'Codex subscription';
    case 'anthropic': return 'Anthropic API';
    case undefined:
    case null:
    case '': return 'Not recorded';
    default: return engine;
  }
}

export type CostBasis = 'list' | 'free' | 'plan' | 'unknown';

export function normalizeCostBasis(v: unknown): CostBasis | null {
  return v === 'list' || v === 'free' || v === 'plan' || v === 'unknown' ? v : null;
}

/**
 * The cost line. A NULL cost must never read as "free": plan usage and unknown
 * pricing are named as such (Wave 0 ledger rule).
 */
export function costLabel(costBasis: CostBasis | null, usd: number | null | undefined): string {
  switch (costBasis) {
    case 'plan': return 'Plan usage (subscription — no per-token charge recorded)';
    case 'free': return 'Free (local model)';
    case 'unknown': return 'Unknown pricing';
    case 'list':
      return typeof usd === 'number' && Number.isFinite(usd) ? `$${usd.toFixed(4)} (list price)` : 'List price (amount not recorded)';
    default:
      return typeof usd === 'number' && Number.isFinite(usd) && usd > 0 ? `$${usd.toFixed(4)}` : 'Not recorded';
  }
}

export function shortHash(hash: string | null | undefined, keep = 12): string {
  if (!hash) return '—';
  return hash.length > keep ? `${hash.slice(0, keep)}…` : hash;
}

export function normalizeTransparencyLevel(v: unknown): 0 | 1 | 2 {
  return v === 1 || v === 2 ? v : 0;
}

// ── Caveats the model wrote about itself ──────────────────────

export interface CaveatSection {
  /** The heading text as written (trimmed, without the #s). */
  heading: string;
  /** The markdown under that heading up to the next heading of the same or a higher level. */
  body: string;
}

/**
 * Headings that count as the model's own caveats. Matched case-insensitively
 * against the heading text; `&` and `and` are interchangeable.
 */
export const CAVEAT_HEADINGS: ReadonlyArray<RegExp> = [
  /^sources,?\s+assumptions,?\s+(and|&)\s+what\s+was\s+not\s+checked\b/i,
  /^assumption\s+register\b/i,
  /^assumptions?\s*(and|&)\s*caveats?\b/i,
  /^uncertainty\s*(and|&)\s*caveats?\b/i,
  /^uncertaint(y|ies)\b/i,
  /^caveats?\b/i,
  /^(what\s+was\s+)?not\s+checked\b/i,
  /^sources\s+used\b/i,
  /^limitations\b/i,
];

export function isCaveatHeading(text: string): boolean {
  const t = text.trim().replace(/[:.]+$/, '');
  return CAVEAT_HEADINGS.some((re) => re.test(t));
}

/**
 * Pull the caveat sections out of an answer's markdown. Recognises ATX
 * headings (`#` … `######`) and standalone bold lines (`**Assumption Register**`).
 * A section runs to the next heading of the same or a higher level; a caveat
 * heading nested inside an already-captured section is not reported twice.
 */
export function parseCaveatSections(markdown: string): CaveatSection[] {
  if (!markdown) return [];
  const lines = markdown.split(/\r?\n/);
  interface Heading { index: number; level: number; text: string }
  const headings: Heading[] = [];
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*(```|~~~)/.test(line)) { inFence = !inFence; continue; }
    if (inFence) continue;
    const atx = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (atx) { headings.push({ index: i, level: atx[1].length, text: atx[2].trim() }); continue; }
    // A whole-line bold label ("**Assumption Register**" or "**Not checked:**") is a level-7 pseudo heading:
    // it never closes an ATX section but is closed by any ATX heading or the next bold label.
    const bold = /^\s*\*\*([^*]+?)\*\*\s*:?\s*$/.exec(line);
    if (bold) headings.push({ index: i, level: 7, text: bold[1].trim() });
  }

  const sections: CaveatSection[] = [];
  let captureEnd = -1;
  for (let h = 0; h < headings.length; h++) {
    const head = headings[h];
    if (head.index < captureEnd) continue; // nested inside a section already captured
    if (!isCaveatHeading(head.text)) continue;
    let end = lines.length;
    for (let k = h + 1; k < headings.length; k++) {
      if (headings[k].level <= head.level) { end = headings[k].index; break; }
    }
    const body = lines.slice(head.index + 1, end).join('\n').trim();
    sections.push({ heading: head.text.replace(/[:.]+$/, ''), body });
    captureEnd = end;
  }
  return sections;
}

// ── Depth by transparency level ───────────────────────────────

export type ProvenanceSectionId = 'engine' | 'sources' | 'layers' | 'memory' | 'caveats' | 'prompt';

export const PROVENANCE_SECTION_ORDER: ReadonlyArray<ProvenanceSectionId> = [
  'engine', 'sources', 'layers', 'memory', 'caveats', 'prompt',
];

/**
 * What opens by default at each transparency level. The level sets the
 * default, never a ceiling: the panel lets the user open anything.
 *   0 → summary line only, every section collapsed
 *   1 → Engine, Sources, Memory and the model's caveats open
 *   2 → everything, Layers and the Exact-prompt control included
 */
export function defaultExpansion(level: 0 | 1 | 2): Record<ProvenanceSectionId, boolean> {
  const l = normalizeTransparencyLevel(level);
  return {
    engine: l >= 1,
    sources: l >= 1,
    memory: l >= 1,
    caveats: l >= 1,
    layers: l >= 2,
    prompt: l >= 2,
  };
}

/** The one-line summary shown at every level, e.g. "Claude subscription · 3 sources · 9 layers". */
export function summaryLine(input: {
  engine: string | null | undefined;
  sourceCount: number | null;
  layerCount: number | null;
}): string {
  const parts = [engineLabel(input.engine)];
  if (input.sourceCount !== null) parts.push(`${input.sourceCount} source${input.sourceCount === 1 ? '' : 's'}`);
  if (input.layerCount !== null) parts.push(`${input.layerCount} layer${input.layerCount === 1 ? '' : 's'}`);
  return parts.join(' · ');
}
