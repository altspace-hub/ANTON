// ── Renderer: Plain Language (CEFR B1) ───────────────────────────────────
//
// LLM-based simplification: the same content expressed at B1 reading level
// so non-expert stakeholders can understand it. Output is Markdown; the
// user can pipe it through any subsequent export if they want a PDF.

import type { RenderFn, RenderResult } from '../../renderer-registry.types.js';
import { callChat } from '../../provider-router.js';
import { saveArtifact, buildFilename } from '../lib/artifact-storage.js';
import { wrapUntrustedContent, INJECTION_GUARD_SUFFIX } from '../lib/prompt-injection-guard.js';

// Haiku 4.5 — straight rewrite at fixed reading level, no reasoning
// required; right-sized for cost.
const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 8_000;
const TIMEOUT_MS = 90_000;

const SYSTEM_PROMPT = `You rewrite professional documents for non-specialist readers at CEFR B1 reading level.

RULES:
- Output Markdown only, no preamble.
- Same structure as the original (keep headings), but simpler.
- Short sentences. Active voice. One idea per sentence where possible.
- Concrete nouns. Replace jargon with plain equivalents (e.g. "mitigate" → "reduce", "stakeholder" → "person involved").
- Keep numbers, dates, names, regulation references verbatim — accuracy is non-negotiable.
- When a term is technical and MUST be kept (e.g. "GDPR"), define it briefly in parentheses the first time: "GDPR (the EU privacy law)".
- Do not summarise or omit content. Every original section appears in the output.
- Do not add content that was not in the source.
- Do not add warnings, caveats, or "Note:" lines that weren't in the original.`;

export const render: RenderFn = async (payload, context): Promise<RenderResult> => {
  const markdown = context.markdown ?? '';
  if (!markdown.trim()) throw new Error('No markdown content available for plain-language rewrite');

  const userPrompt = `Rewrite the content below for a CEFR B1 reader. Preserve all structure and facts.\n\n${wrapUntrustedContent(markdown, 80_000)}${INJECTION_GUARD_SUFFIX}`;
  const chat = await Promise.race([
    callChat({ model: MODEL, system: SYSTEM_PROMPT, messages: [{ role: 'user', content: userPrompt }], maxTokens: MAX_TOKENS, temperature: 0.15 }),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`plain-language timed out after ${TIMEOUT_MS}ms`)), TIMEOUT_MS)),
  ]);

  const plain = chat.text.trim();
  if (!plain) throw new Error('Plain-language generation returned empty content');

  const filename = buildFilename('{module_id}-plain-{timestamp}.{file_type}', {
    module_id: context.session.module_id,
    renderer_id: 'plain-language',
    file_type: 'md',
  });
  const saved = await saveArtifact({ sessionId: context.session.id, filename, content: plain });

  return {
    file_path: saved.rel_path,
    file_type: 'md',
    mime_type: 'text/markdown; charset=utf-8',
    file_size_bytes: saved.size_bytes,
    metadata: {
      model: MODEL,
      word_count: plain.split(/\s+/).filter(Boolean).length,
      content_type: payload.content_type,
    },
    tokens_consumed: (chat.inputTokens ?? 0) + (chat.outputTokens ?? 0),
    validation: { valid: true },
  };
};
