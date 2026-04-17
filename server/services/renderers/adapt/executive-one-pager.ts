// ── Renderer: Executive One-Pager ────────────────────────────────────────
//
// LLM-based audience adaptation. Takes the Markdown output and produces a
// single-page executive summary optimised for a C-suite reader, then pipes
// the result through the existing export-pdf service so we get a branded,
// printable PDF.
//
// Works on any content type — prose input, no structured schema required.

import type { RenderFn, RenderResult } from '../../renderer-registry.types.js';
import { callChat } from '../../provider-router.js';
import { generatePdf } from '../../export-pdf.js';
import { saveArtifact, buildFilename } from '../lib/artifact-storage.js';
import { wrapUntrustedContent, INJECTION_GUARD_SUFFIX } from '../lib/prompt-injection-guard.js';

// Haiku 4.5 — distillation task, no chain-of-thought needed; right-sized
// for the constraint (≤450 words, fixed structure).
const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 3_000;
const TIMEOUT_MS = 60_000;

const SYSTEM_PROMPT = `You produce one-page executive summaries for C-suite readers.

RULES:
- Output Markdown, no preamble.
- Maximum 450 words — tight enough to fit on one printed A4 page.
- Structure MUST be exactly:
  ## Executive one-pager: <title>
  **Bottom line.** (1-2 sentences — what a CEO needs to know if they read nothing else.)
  **Context.** (2-3 sentences — why this matters now.)
  **Key findings.** (3-5 crisp bullets, each ≤ 20 words.)
  **Recommended actions.** (3-5 actionable bullets with clear owners where you can infer them.)
  **Risks if we don't act.** (2-3 bullets.)
  **Next decision.** (1 sentence — the next thing the executive is being asked to decide.)
- Numbers, dates, regulation references from the input are preserved verbatim. Do NOT invent specifics.
- No hedging, no "it is recommended that". Direct, declarative voice.
- No tables, no images — plain prose + bullet points only.`;

export const render: RenderFn = async (payload, context): Promise<RenderResult> => {
  const markdown = context.markdown ?? '';
  if (!markdown.trim()) throw new Error('No markdown content available for executive one-pager');

  const userPrompt = `Original output title: ${context.session.title}\n\n${wrapUntrustedContent(markdown)}${INJECTION_GUARD_SUFFIX}`;
  const chat = await Promise.race([
    callChat({ model: MODEL, system: SYSTEM_PROMPT, messages: [{ role: 'user', content: userPrompt }], maxTokens: MAX_TOKENS, temperature: 0.2 }),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`one-pager timed out after ${TIMEOUT_MS}ms`)), TIMEOUT_MS)),
  ]);

  const onePagerMd = chat.text.trim();
  if (!onePagerMd) throw new Error('Executive one-pager generation returned empty content');

  // Pipe through export-pdf for a branded PDF
  const brandConfig = context.brand_template
    ? {
        primaryColor: context.brand_template.primary_color,
        accentColor: context.brand_template.accent_color,
        fontFamily: context.brand_template.font_family,
        logoPath: context.brand_template.logo_path,
        ...(context.brand_template.extra ?? {}),
      } as never
    : undefined;
  const buf = await generatePdf(onePagerMd, {
    title: `Executive one-pager — ${context.session.title}`,
    moduleId: context.session.module_id,
    sessionId: context.session.id,
    model: MODEL,
  }, brandConfig);

  const filename = buildFilename('{module_id}-one-pager-{timestamp}.{file_type}', {
    module_id: context.session.module_id,
    renderer_id: 'executive-one-pager',
    file_type: 'pdf',
  });
  const saved = await saveArtifact({ sessionId: context.session.id, filename, content: buf });

  return {
    file_path: saved.rel_path,
    file_type: 'pdf',
    mime_type: 'application/pdf',
    file_size_bytes: saved.size_bytes,
    metadata: {
      one_pager_markdown: onePagerMd,
      model: MODEL,
      word_count: onePagerMd.split(/\s+/).filter(Boolean).length,
    },
    tokens_consumed: (chat.inputTokens ?? 0) + (chat.outputTokens ?? 0),
    validation: { valid: true },
  };
};
