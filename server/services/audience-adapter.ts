/**
 * audience-adapter.ts
 * Defines per-audience rewrite prompt templates for the Explain-It-Different feature.
 * Each template tells Claude how to reframe existing output for a specific audience type.
 */

export const KNOWN_AUDIENCES = [
  'board',
  'regulator',
  'technical',
  'business',
  'non-expert',
  'external-client',
  'media',
  'legal',
] as const;

export type AudienceId = typeof KNOWN_AUDIENCES[number];

export function isKnownAudience(value: string): value is AudienceId {
  return (KNOWN_AUDIENCES as readonly string[]).includes(value);
}

export const AUDIENCE_LABELS: Record<AudienceId, string> = {
  board: 'Board / C-suite',
  regulator: 'Regulator / Examiner',
  technical: 'Technical Team',
  business: 'Business Stakeholders',
  'non-expert': 'Non-expert / New Hire',
  'external-client': 'External Client',
  media: 'Media / Public',
  legal: 'Legal Counsel',
};

const AUDIENCE_TEMPLATES: Record<AudienceId, string> = {
  board: `Rewrite for a Board of Directors / C-suite audience:
- Maximum 1 page (600 words)
- Lead with business risk and strategic implication
- Frame findings as decisions required, not technical details
- Use: "The organization faces...", "Management should consider..."
- Remove all technical jargon — replace with business impact
- End with: clear recommendation + timeline`,

  regulator: `Rewrite for a Regulator or External Examiner:
- Formal, precise regulatory language
- Cite specific articles, guidelines, and requirements by name
- Every claim must be evidence-based
- Use defined regulatory terms (CDD, EDD, CIP, etc.)
- Structure: Regulatory basis → Findings → Evidence → Conclusion`,

  technical: `Rewrite for a Technical team (IT, Data, Engineering):
- Include system requirements, data specifications, API impacts
- Quantify: data volumes, processing requirements, integration points
- Use technical terms freely — the audience understands them
- Include implementation-relevant details omitted from business versions
- Structure: Technical impact → Requirements → Dependencies → Timeline`,

  business: `Rewrite for Business stakeholders (Department heads, Operations managers):
- Focus on operational and customer impact
- Business cost and benefit framing
- Practical timelines and resource implications
- Avoid legal and technical jargon
- What does this mean for day-to-day operations?`,

  'non-expert': `Rewrite for a non-expert or new hire:
- Plain language, no acronyms without explanation
- Use analogies and real-world examples
- "What is X?" → explain before using it
- Short paragraphs, simple sentences
- Conversational but professional tone`,

  'external-client': `Rewrite for an External Client:
- Professional, balanced tone
- Focus on actionable recommendations
- Explain your reasoning so the client can make informed decisions
- Caveat appropriately — distinguish fact from opinion
- Do not reveal internal methodology in detail`,

  media: `Rewrite for Media / Public communication:
- Simple, clear, no jargon
- Lead with the most newsworthy / important point
- Use narrative structure: what happened → why it matters → what's next
- Short sentences, active voice
- Suitable for press release or public announcement`,

  legal: `Rewrite for Legal counsel:
- Obligation and liability framing
- Reference legal instruments, statutes, case law where relevant
- Distinguish: obligations vs. best practices vs. policy choices
- Flag legal risks explicitly
- Formal legal language and structure`,
};

/**
 * Builds the full user prompt to send to Claude for an audience rewrite.
 * The template instructions become the user message; we keep no separate system prompt
 * so the endpoint stays lightweight and fast (uses Sonnet by default).
 */
export function getAudiencePrompt(
  audience: AudienceId,
  content: string,
  moduleContext?: string
): string {
  const template = AUDIENCE_TEMPLATES[audience];
  const audienceLabel = AUDIENCE_LABELS[audience];

  return `You are an expert communication specialist. Rewrite the following content for a specific audience without changing the underlying facts.

## TARGET AUDIENCE: ${audienceLabel.toUpperCase()}

${template}

${moduleContext ? `## CONTEXT\nThis content is from a "${moduleContext}" analysis session.\n\n` : ''}## ORIGINAL CONTENT TO REWRITE
---
${content}
---

Produce the rewritten version now. Maintain factual accuracy — only change framing, language, structure, and emphasis to suit the target audience.`;
}
