/**
 * deliberation-engine.ts
 *
 * Multi-Model Deliberation Protocol
 *
 * Fans the same prompt to multiple Claude model tiers simultaneously,
 * scores agreement across responses, and synthesises a confidence-weighted
 * unified output that is more reliable than any single model alone.
 *
 * Architecture: Each panelist model (Opus / Sonnet / Haiku) analyses the
 * question independently with a role instruction but the same system prompt.
 * Opus then synthesises all three responses and produces structured agreement
 * metadata. The entire synthesis streams back to the caller via callbacks.
 *
 * Cost: ~3× single-model (3 panel calls + 1 Opus synthesis).
 * Appropriate for high-stakes queries where confidence matters more than cost.
 */

import { getClient, callSync } from './claude-client.js';

// ── Types ───────────────────────────────────────────────────────

export interface PanelistConfig {
  model: 'claude-opus-4-6' | 'claude-sonnet-4-6' | 'claude-haiku-4-5-20251001';
  role: string;         // Display name shown in UI
  thinking: 'quick' | 'think' | 'think_hard';
  description: string;  // Shown in the deliberation panel tooltip
}

export interface ModelOpinion {
  model: string;
  role: string;
  description: string;
  response: string;
  executionMs: number;
}

export interface DeliberationMeta {
  agreementLevel: 'unanimous' | 'majority' | 'split';
  agreementScore: number;          // 0.0 – 1.0
  disagreements: Array<{
    topic: string;
    positions: Record<string, string>; // role → position
  }>;
  redFlags: string[];              // Safety-critical concerns raised by any panelist
  confidence: 'high' | 'medium' | 'low';
}

// Default panelist configuration: three model tiers, same question, independent analysis
export const DEFAULT_PANELISTS: PanelistConfig[] = [
  {
    model: 'claude-opus-4-6',
    role: 'Deep Analyst',
    thinking: 'think_hard',
    description: 'Opus 4.6 — thorough reasoning, edge cases, complexity',
  },
  {
    model: 'claude-sonnet-4-6',
    role: 'Balanced Analyst',
    thinking: 'think',
    description: 'Sonnet 4.6 — efficient, well-rounded assessment',
  },
  {
    model: 'claude-haiku-4-5-20251001',
    role: 'Quick Assessment',
    thinking: 'quick',
    description: 'Haiku 4.5 — rapid check, immediate concerns',
  },
];

// ── Deliberation Runner ─────────────────────────────────────────

/**
 * Run the deliberation protocol.
 *
 * @param systemPrompt   Full composed system prompt (built by route handler)
 * @param userMessage    The user's question/request
 * @param panelists      Which models to include (default: Opus + Sonnet + Haiku)
 * @param onModelStart   Called immediately when a model's call begins
 * @param onModelComplete Called when a model finishes (use to push SSE event)
 * @param onSynthesisChunk Called for each text chunk from Opus synthesis stream
 * @returns              DeliberationMeta parsed from synthesis output
 */
export async function runDeliberation(
  systemPrompt: string,
  userMessage: string,
  panelists: PanelistConfig[] = DEFAULT_PANELISTS,
  onModelStart: (model: string, role: string) => void,
  onModelComplete: (opinion: ModelOpinion) => void,
  onSynthesisChunk: (text: string) => void,
): Promise<DeliberationMeta> {

  // ── Phase 1: Parallel panel calls ────────────────────────────
  const modelPromises = panelists.map(async (panelist) => {
    onModelStart(panelist.model, panelist.role);
    const t0 = Date.now();

    const roleAddition = `

## DELIBERATION PANEL ROLE
You are the **${panelist.role}** in a multi-model deliberation panel. Analyse this request independently. Do not attempt to guess what other models might conclude. Provide your most complete and accurate assessment.`;

    try {
      const result = await callSync({
        model: panelist.model,
        thinking: panelist.thinking,
        system: systemPrompt + roleAddition,
        messages: [{ role: 'user', content: userMessage }],
      });

      const opinion: ModelOpinion = {
        model: panelist.model,
        role: panelist.role,
        description: panelist.description,
        response: result.text,
        executionMs: Date.now() - t0,
      };
      onModelComplete(opinion);
      return opinion;

    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const opinion: ModelOpinion = {
        model: panelist.model,
        role: panelist.role,
        description: panelist.description,
        response: `[${panelist.role} encountered an error: ${errMsg}]`,
        executionMs: Date.now() - t0,
      };
      onModelComplete(opinion);
      return opinion;
    }
  });

  const opinions = await Promise.all(modelPromises);

  // ── Phase 2: Opus synthesis ────────────────────────────────
  const opinionBlock = opinions
    .map((o) => `### ${o.role} (${o.model})\n\n${o.response}`)
    .join('\n\n---\n\n');

  const synthesisSystem = `${systemPrompt}

## DELIBERATION SYNTHESISER ROLE

You are synthesising independent analyses of the same question from ${panelists.length} model tiers. Each model analysed the question separately. Your job is to produce a unified, confidence-weighted response that is more reliable than any individual model's output.

## INDIVIDUAL PANELIST ANALYSES

${opinionBlock}

## YOUR SYNTHESIS TASK

1. **Identify consensus**: Where all (or most) panelists agree → high confidence; state these conclusions clearly.
2. **Surface disagreements**: Where panelists diverge significantly → lower confidence; present the disagreement transparently and explain the tension.
3. **Flag red flags**: If any panelist raised a safety-critical, urgent, or potentially dangerous concern, surface it prominently regardless of whether others agreed.
4. **Produce a unified response**: Write a comprehensive, structured answer that integrates the best of all perspectives. Do not simply concatenate the panelist outputs.
5. **Add metadata** (see below).

Do not tell the user what each panelist said verbatim — synthesise. The individual responses are available in the expandable panel.

## METADATA (REQUIRED — MUST BE LAST LINE OF RESPONSE)

At the very end of your response, on its own line, output exactly this block (JSON on one line, no line breaks inside):

<!-- DELIBERATION_META: {"agreementLevel":"majority","agreementScore":0.75,"disagreements":[{"topic":"example","positions":{"Deep Analyst":"view","Balanced Analyst":"view","Quick Assessment":"view"}}],"redFlags":["example"],"confidence":"medium"} -->

Field definitions:
- agreementLevel: "unanimous" (all substantially agree), "majority" (2 of 3 agree on main points), "split" (significant disagreement)
- agreementScore: float 0.0–1.0 representing overall agreement level
- disagreements: array of {topic, positions{role:one-sentence-view}} for each substantive disagreement; empty [] if none
- redFlags: array of safety-critical or urgent concerns; empty [] if none
- confidence: "high" (unanimous/strong), "medium" (majority), "low" (significant disagreement or red flags)`;

  // Stream synthesis from Opus
  const anthropic = getClient();
  const synthesisParams = {
    model: 'claude-opus-4-6',
    max_tokens: 128_000,
    system: [{ type: 'text', text: synthesisSystem }],
    messages: [{ role: 'user', content: userMessage }],
    stream: true,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'max' },
  };

  let fullSynthesis = '';

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stream = await anthropic.messages.stream(synthesisParams as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for await (const event of stream as AsyncIterable<any>) {
      if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
        const chunk = event.delta.text as string;
        fullSynthesis += chunk;
        onSynthesisChunk(chunk);
      }
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const fallback = `\n\n[Synthesis error: ${errMsg}]`;
    fullSynthesis += fallback;
    onSynthesisChunk(fallback);
  }

  // ── Phase 3: Parse metadata ───────────────────────────────
  const metaMatch = fullSynthesis.match(/<!--\s*DELIBERATION_META:\s*(\{[\s\S]*?\})\s*-->/);
  const defaultMeta: DeliberationMeta = {
    agreementLevel: 'majority',
    agreementScore: 0.7,
    disagreements: [],
    redFlags: [],
    confidence: 'medium',
  };

  if (!metaMatch) return defaultMeta;

  try {
    const parsed = JSON.parse(metaMatch[1]) as Partial<DeliberationMeta>;
    return {
      agreementLevel: parsed.agreementLevel ?? defaultMeta.agreementLevel,
      agreementScore: typeof parsed.agreementScore === 'number' ? parsed.agreementScore : defaultMeta.agreementScore,
      disagreements: Array.isArray(parsed.disagreements) ? parsed.disagreements : [],
      redFlags: Array.isArray(parsed.redFlags) ? parsed.redFlags : [],
      confidence: parsed.confidence ?? defaultMeta.confidence,
    };
  } catch {
    return defaultMeta;
  }
}

/** Strip the metadata comment from the synthesis text before displaying */
export function stripDeliberationMeta(text: string): string {
  return text.replace(/\s*<!--\s*DELIBERATION_META:[\s\S]*?-->\s*$/m, '').trimEnd();
}
