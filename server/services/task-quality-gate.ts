/**
 * task-quality-gate.ts
 * Task Agent quality-gate hardening (Core Experience Review 2026-06, item 1.8).
 *
 * Replaces the old gate that scored only the FIRST 2,000 chars of a deliverable
 * with a single naked number. This gate:
 *   - scores the FULL output (stratified head/middle/tail sampling for very
 *     long outputs, clearly labeled so the judge knows it sees samples)
 *   - uses a 4-dimension rubric returned as strict JSON
 *     {completeness, grounding, structure, actionability, overall, critique}
 *   - exposes the critique so the caller can store it AND feed it into the
 *     retry prompt (previously retries only raised thinking effort)
 *
 * The LLM call itself is injected (llm: prompt → raw text) so the gate's
 * prompt construction and JSON parsing are unit-testable without a provider.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GateDimensions {
  completeness: number;
  grounding: number;
  structure: number;
  actionability: number;
}

export interface GateResult {
  overall: number;
  dimensions: GateDimensions;
  critique: string;
}

/** Chunk size per stratified sample; full output used when ≤ 3 chunks long. */
export const SAMPLE_CHUNK_CHARS = 2000;

// ── Sampling ──────────────────────────────────────────────────────────────────

export interface OutputSample {
  label: string;
  text: string;
}

/**
 * Build judge input covering the FULL output. Short outputs are passed whole;
 * very long outputs are sampled head + middle + tail (3 × SAMPLE_CHUNK_CHARS),
 * each chunk clearly labeled with its position so the judge knows what it sees.
 */
export function buildSamples(output: string, chunkChars: number = SAMPLE_CHUNK_CHARS): OutputSample[] {
  if (output.length <= chunkChars * 3) {
    return [{ label: `FULL OUTPUT (${output.length} chars)`, text: output }];
  }
  const midStart = Math.floor(output.length / 2 - chunkChars / 2);
  return [
    {
      label: `SAMPLE 1/3 — BEGINNING (chars 1–${chunkChars} of ${output.length})`,
      text: output.slice(0, chunkChars),
    },
    {
      label: `SAMPLE 2/3 — MIDDLE (chars ${midStart + 1}–${midStart + chunkChars} of ${output.length})`,
      text: output.slice(midStart, midStart + chunkChars),
    },
    {
      label: `SAMPLE 3/3 — END (chars ${output.length - chunkChars + 1}–${output.length} of ${output.length})`,
      text: output.slice(-chunkChars),
    },
  ];
}

// ── Prompt ────────────────────────────────────────────────────────────────────

export function buildGatePrompt(output: string, taskTitle: string, stepName: string): string {
  const samples = buildSamples(output);
  const sampled = samples.length > 1;
  const sampleBlock = samples
    .map((s) => `--- ${s.label} ---\n${s.text}`)
    .join('\n\n');

  return `You are a strict quality assessor for FCP compliance deliverables.

Task: ${taskTitle}
Step: ${stepName}

Score the deliverable below on FOUR dimensions, each 0-10:
- completeness: covers everything the task and step demand; no missing sections, no abrupt endings
- grounding: claims and regulatory references are specific, plausible, and cited; nothing invented or vague
- structure: clear professional organisation — headings, logical flow, client-ready formatting
- actionability: concrete conclusions, recommendations, owners/next steps the client can act on

Then give an overall score (0-10) where:
- 9-10: Exceptional — board/client ready, comprehensive, fully cited, no gaps
- 8-9: Good — solid, accurate, actionable, minor improvements only
- 6-7: Adequate — covers basics but missing depth, structure, or key requirements
- 4-5: Weak — significant gaps, vague conclusions, not client-ready
- 0-3: Poor — incomplete, off-topic, factually unreliable, or harmful

Be strict. For FCP/AML/sanctions compliance work, an 8 means the output is defensible and actionable. A 7 means you would want revisions before sending to a client.
${sampled ? '\nNOTE: The deliverable is long, so you are shown three labeled samples (beginning, middle, end). Judge the whole document from them — penalise completeness only for problems visible in the samples (e.g. an abrupt ending, missing promised sections).\n' : ''}
${sampleBlock}

Respond with ONLY a strict JSON object — no markdown, no code fences, no prose:
{"completeness": <0-10>, "grounding": <0-10>, "structure": <0-10>, "actionability": <0-10>, "overall": <0-10>, "critique": "<2-4 specific sentences: the most important concrete weaknesses to fix, or what makes it strong>"}`;
}

// ── Parsing ───────────────────────────────────────────────────────────────────

function clampScore(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v) : NaN;
  if (isNaN(n)) return fallback;
  return Math.min(10, Math.max(0, n));
}

/**
 * Parse the judge's response into a GateResult. Tolerates code fences and
 * surrounding prose; returns null when no usable JSON with an overall score
 * can be extracted (callers treat null as "gate unavailable", never block).
 */
export function parseGateResponse(raw: string): GateResult | null {
  if (!raw || !raw.trim()) return null;
  let text = raw.trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();
  // Locate the outermost JSON object if there is surrounding prose
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) return null;
  text = text.slice(first, last + 1);

  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (typeof obj !== 'object' || obj === null) return null;

  const overallRaw = obj.overall;
  const overallNum = typeof overallRaw === 'number' ? overallRaw
    : typeof overallRaw === 'string' ? parseFloat(overallRaw) : NaN;
  if (isNaN(overallNum)) return null;
  const overall = Math.min(10, Math.max(0, overallNum));

  return {
    overall,
    dimensions: {
      completeness: clampScore(obj.completeness, overall),
      grounding: clampScore(obj.grounding, overall),
      structure: clampScore(obj.structure, overall),
      actionability: clampScore(obj.actionability, overall),
    },
    critique: typeof obj.critique === 'string' ? obj.critique.slice(0, 2000) : '',
  };
}

// ── Orchestration ─────────────────────────────────────────────────────────────

/**
 * Score an output through an injected LLM call (prompt → raw response text).
 * Returns null on any failure — the gate must never block delivery.
 */
export async function scoreWithGate(
  llm: (prompt: string) => Promise<string>,
  output: string,
  taskTitle: string,
  stepName: string
): Promise<GateResult | null> {
  try {
    const raw = await llm(buildGatePrompt(output, taskTitle, stepName));
    return parseGateResponse(raw);
  } catch {
    return null;
  }
}

// ── Retry guidance ────────────────────────────────────────────────────────────

/**
 * Build the user-message addition for a retry attempt, feeding the judge's
 * critique (and the weakest rubric dimensions) back into the regeneration.
 */
export function buildRetryGuidance(gate: GateResult): string {
  const dims = gate.dimensions;
  const weak = (Object.entries(dims) as Array<[keyof GateDimensions, number]>)
    .filter(([, v]) => v < 8)
    .sort((a, b) => a[1] - b[1])
    .map(([k, v]) => `${k} (${v.toFixed(1)}/10)`);
  const weakLine = weak.length > 0 ? `\nWeakest dimensions: ${weak.join(', ')}.` : '';
  const critiqueLine = gate.critique ? `\nReviewer critique: "${gate.critique}"` : '';
  return `\n\nIMPORTANT — a quality reviewer scored the previous attempt ${gate.overall.toFixed(1)}/10.${weakLine}${critiqueLine}\nProduce a substantially improved version that directly fixes every weakness above. Do not repeat the previous attempt's mistakes.`;
}
