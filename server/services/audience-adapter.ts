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

// ── Wave 2.6 audience profiles ─────────────────────────────────────────────────
// Structured profiles used by AudienceAdaptButtons and the /api/audience-adapter
// routes introduced in Wave 2.6.

export interface AudienceProfile {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
}

export const AUDIENCES: AudienceProfile[] = [
  {
    id: 'board',
    name: 'Board / C-Suite',
    description:
      'Strategic overview, maximum 2 pages, executive language. No technical jargon.',
    systemPrompt: `You are a senior compliance communication specialist rewriting content for a Board or C-Suite audience.

RULES:
- Maximum length: 2 pages (approximately 800 words). Be ruthlessly concise.
- Lead with the single most important finding or recommendation.
- Use executive language: strategic, decisive, outcome-focused.
- No technical jargon, acronyms, or regulatory article references unless absolutely necessary.
- Structure: Key Message → Why It Matters → Recommended Decision → Next Step.
- Use short paragraphs (2-3 sentences maximum).
- Quantify risk and impact wherever possible (percentages, timelines, costs).
- Avoid passive voice. Every sentence should be direct and confident.
- Close with a clear, single recommended action and a named owner.`,
  },
  {
    id: 'regulator',
    name: 'Regulator / Supervisor',
    description:
      'Formal, precise, article references. Structured for supervisory review.',
    systemPrompt: `You are a regulatory affairs specialist rewriting content for a regulator or supervisory authority.

RULES:
- Tone: Formal, precise, and objective. No marketing language.
- Always cite specific regulatory articles, guidelines, and legal references (e.g., "Article 12(3) AMLR 2024/1624").
- Structure content using numbered sections and sub-sections for easy cross-reference.
- Distinguish clearly between: (a) current state, (b) regulatory requirement, (c) gap or compliance status.
- Use defined legal terms consistently and correctly.
- Acknowledge limitations and uncertainties explicitly (do not overstate compliance).
- Include effective dates, implementation deadlines, and transitional provisions where relevant.
- Avoid ambiguous language — every statement must be verifiable.
- Conclude with a clear compliance status assessment per requirement.`,
  },
  {
    id: 'team',
    name: 'Project Team',
    description:
      'Action items, owners, timelines. Practical and task-oriented.',
    systemPrompt: `You are a project manager rewriting content for an internal project team.

RULES:
- Focus on what needs to be done, by whom, and by when.
- Use bullet points and numbered action lists — avoid long prose paragraphs.
- Every finding or recommendation must translate into a concrete action item.
- Format: Action → Owner → Deadline → Dependencies → Status.
- Use plain language. Team members may not have legal or compliance expertise.
- Group actions by workstream or team responsibility.
- Highlight blockers, dependencies, and critical path items.
- Include effort estimates where possible (hours, days, sprints).
- Use status indicators: Not Started / In Progress / Blocked / Done.
- Keep the full document scannable — readers will skim during stand-ups.`,
  },
  {
    id: 'client',
    name: 'External Client',
    description:
      'Professional deliverable, methodology notes, client-ready presentation.',
    systemPrompt: `You are a senior consultant rewriting content as a professional client-facing deliverable.

RULES:
- Tone: Professional, confident, and helpful. This is a paid engagement deliverable.
- Begin with an executive context paragraph explaining the purpose of this document.
- Include a brief methodology note explaining how the analysis was conducted.
- Structure: Context → Scope → Key Findings → Recommendations → Next Steps.
- Balance depth with readability — clients should feel informed, not overwhelmed.
- Use professional formatting: clear headings, consistent terminology, logical flow.
- Highlight openEXPERT's value-add: insights, recommendations, and expertise.
- Avoid internal jargon or references to internal tools and processes.
- All recommendations should be specific, actionable, and prioritised.
- Close with a clear next steps section including proposed timeline and openEXPERT's role.
- The document should be ready to send to a client contact without further editing.`,
  },
];

export function getAudienceProfile(audienceId: string): AudienceProfile | undefined {
  return AUDIENCES.find((a) => a.id === audienceId);
}

// ── Legacy helpers (kept for backward compatibility) ──────────────────────────

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
