// ── Renderer: Regulator's-Eye Review ─────────────────────────────────────
//
// LLM pass with a compliance-officer persona. Flags regulatory gaps,
// ambiguities, missing evidence, and what a regulator would challenge
// in a supervisory review. Structurally mirrors devils-advocate but
// with a different lens.

import type { RenderFn, RenderResult } from '../../renderer-registry.types.js';
import { callChat } from '../../provider-router.js';
import { saveArtifact, buildFilename } from '../lib/artifact-storage.js';

const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 6_000;
const TIMEOUT_MS = 90_000;

const SYSTEM_PROMPT = `You are a senior compliance officer reviewing a document as if you were the regulator who will read it in the next supervisory inspection. Your job is to flag — not rewrite.

OUTPUT FORMAT (Markdown, no preamble):
## Regulator's-eye review: <original title>

### What a regulator would focus on
- Bullets: the specific claims, controls, or decisions that would attract supervisory attention.

### Gaps in evidence
- Bullets: assertions that lack documentary support, named owners, dates, or independent verification. Be specific about what would close the gap.

### Ambiguities or inconsistencies
- Bullets: places where the text is vague, conflicts with itself, or conflicts with an underlying regulation. Cite the source regulation or principle when flagging.

### Audit trail concerns
- Bullets: where could an auditor lose the thread? Missing version history, missing decision logs, undocumented approvals, no linkage between policy and implementation.

### Likely supervisor questions
- Bullets: 5-8 actual questions a supervisor would ask in a meeting about this document, phrased in their voice.

RULES:
- Reference specific regulatory frameworks by name when relevant (e.g., "GDPR Art. 32(1)(d) requires regular testing — this document asserts testing but does not define frequency").
- Do not summarise the original. Do not add unrelated regulations the document doesn't touch.
- Be direct, specific, and evidentiary. "Section 3 claims X but cites no source" is better than "Section 3 could be better supported".
- Keep to ≤ 900 words total.`;

export const render: RenderFn = async (_payload, context): Promise<RenderResult> => {
  const markdown = context.markdown ?? '';
  if (!markdown.trim()) throw new Error('No markdown content available for regulator\'s-eye review');

  const userPrompt = `Document under review (title: ${context.session.title}):\n\n---\n\n${markdown.slice(0, 60_000)}`;
  const chat = await Promise.race([
    callChat({ model: MODEL, system: SYSTEM_PROMPT, messages: [{ role: 'user', content: userPrompt }], maxTokens: MAX_TOKENS, temperature: 0.2 }),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`regulators-eye timed out after ${TIMEOUT_MS}ms`)), TIMEOUT_MS)),
  ]);

  const review = chat.text.trim();
  if (!review) throw new Error('Regulator\'s-eye review returned empty content');

  const filename = buildFilename('{module_id}-regulators-eye-{timestamp}.{file_type}', {
    module_id: context.session.module_id,
    renderer_id: 'regulators-eye-review',
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
