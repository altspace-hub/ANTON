// ── Renderer: Devil's Advocate Review ────────────────────────────────────
//
// LLM pass that challenges the output's assumptions, conclusions, and
// recommendations. Produces a structured Markdown critique.

import type { RenderFn, RenderResult } from '../../renderer-registry.types.js';
import { callChat } from '../../provider-router.js';
import { saveArtifact, buildFilename } from '../lib/artifact-storage.js';

const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 6_000;
const TIMEOUT_MS = 90_000;

const SYSTEM_PROMPT = `You are a rigorous devil's advocate reviewer. Your job is to challenge — not rewrite.

OUTPUT FORMAT (Markdown, no preamble):
## Devil's advocate review: <original title>

### Assumptions being made
- Bullets: each unstated or weakly-supported assumption, with a short reason why it deserves scrutiny.

### Weaknesses in the reasoning
- Bullets: logical gaps, missing counterfactuals, unstated dependencies, and anywhere the evidence does not actually support the conclusion.

### Alternative interpretations
- Bullets: at least 3 plausible alternative readings of the same evidence that the original did not consider.

### Counter-recommendations
- Bullets: concrete alternative actions that would be worth considering before committing to the original recommendations.

### What would change my mind
- Bullets: specific evidence, data, or conditions that — if true — would resolve each of the concerns above in favour of the original output.

RULES:
- Be direct. "This assumes X without evidence" is better than "It may be worth considering whether X is well-supported".
- Do not write a summary of the original. Assume the reader has read it.
- No hedging like "overall the analysis is sound" — the whole point is to push.
- Stay inside the original document's scope. Do not import outside objections.
- Keep to ≤ 800 words total.`;

export const render: RenderFn = async (_payload, context): Promise<RenderResult> => {
  const markdown = context.markdown ?? '';
  if (!markdown.trim()) throw new Error('No markdown content available for devil\'s advocate review');

  const userPrompt = `Output to critique (title: ${context.session.title}):\n\n---\n\n${markdown.slice(0, 60_000)}`;
  const chat = await Promise.race([
    callChat({ model: MODEL, system: SYSTEM_PROMPT, messages: [{ role: 'user', content: userPrompt }], maxTokens: MAX_TOKENS, temperature: 0.3 }),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`devils-advocate timed out after ${TIMEOUT_MS}ms`)), TIMEOUT_MS)),
  ]);

  const review = chat.text.trim();
  if (!review) throw new Error('Devil\'s advocate review returned empty content');

  const filename = buildFilename('{module_id}-devils-advocate-{timestamp}.{file_type}', {
    module_id: context.session.module_id,
    renderer_id: 'devils-advocate-review',
    file_type: 'md',
  });
  const saved = await saveArtifact({ sessionId: context.session.id, filename, content: review });

  return {
    file_path: saved.rel_path,
    file_type: 'md',
    mime_type: 'text/markdown; charset=utf-8',
    file_size_bytes: saved.size_bytes,
    metadata: { model: MODEL, word_count: review.split(/\s+/).filter(Boolean).length },
    tokens_consumed: (chat.inputTokens ?? 0) + (chat.outputTokens ?? 0),
    validation: { valid: true },
  };
};
