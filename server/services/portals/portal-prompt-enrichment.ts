/**
 * portal-prompt-enrichment.ts — per-phase user-message builders.
 *
 * `generatePhasePrompt()` already builds the per-phase SYSTEM prompt
 * (template label, depth, accumulated state recap, JSON-output instruction).
 * This module builds the USER message that goes alongside it — phase-specific
 * data the LLM needs to write a *good* draft, not just a *valid* one.
 *
 * Each builder takes the session and returns a single user-message string.
 * They are deliberately small and testable in isolation.
 */

import type { SessionState, PhaseId } from './portal-walkthrough-engine.js';
import { CAPABILITY_VERBS } from '../capability-descriptor/schema.js';
import { VERB_BASELINES } from '../capability-descriptor/verbs/index.js';

// ── Public dispatcher ──────────────────────────────────────────────────────

export function buildPhaseUserMessage(session: SessionState, phase: PhaseId): string {
  switch (phase) {
    case 'intent': return intentMessage(session);
    case 'identity': return identityMessage(session);
    case 'content_structure': return contentStructureMessage(session);
    case 'content_generation': return contentGenerationMessage(session);
    case 'capabilities': return capabilitiesMessage(session);
    case 'aesthetics': return aestheticsMessage(session);
    case 'review': return reviewMessage(session);
    case 'publish': return publishMessage(session);
    default: {
      const _exhaustive: never = phase;
      throw new Error(`Unknown phase: ${_exhaustive as string}`);
    }
  }
}

// ── Phase 1: intent ────────────────────────────────────────────────────────

function intentMessage(session: SessionState): string {
  const t = session.template;
  return [
    `Template: ${t.label} — ${t.description}`,
    `Recommended category: ${t.recommendedCategory}`,
    '',
    'Suggest a credible draft for the `intent` phase. Be specific about WHO this',
    'portal is for (audience), WHAT problem it solves, and WHAT visitors should',
    'be able to do (visitor_actions). Three-to-five visitor_actions is plenty.',
  ].join('\n');
}

// ── Phase 2: identity ──────────────────────────────────────────────────────

function identityMessage(session: SessionState): string {
  const intent = (session.accumulatedState.intent ?? {}) as { audience?: string; problem_solved?: string; visitor_actions?: string[] };
  return [
    `Resolved intent:`,
    `- audience: ${intent.audience ?? '(not yet set)'}`,
    `- problem_solved: ${intent.problem_solved ?? '(not yet set)'}`,
    `- visitor_actions: ${(intent.visitor_actions ?? []).join('; ') || '(none)'}`,
    '',
    'Suggest the portal `identity`. The `name` should be a lowercase slug',
    '(letters, digits, dots, dashes — no spaces) derived from the audience or',
    'problem. Default `namespace` to "futurechain". Pick `category` from:',
    '  personal · business · community · commerce · team · creator · bulletin',
    '  · classroom · teacher · organisation · other.',
    'Pick one that matches the template and the intent. Display title is the',
    'human-readable name visitors see; tagline/description are short.',
  ].join('\n');
}

// ── Phase 3: content_structure ─────────────────────────────────────────────

function contentStructureMessage(session: SessionState): string {
  const t = session.template;
  const seedHints = t.seedPages.map(p => `  - ${p.path} (${p.title}, sort_order ${p.sortOrder})`).join('\n');
  const identity = (session.accumulatedState.identity ?? {}) as { display_title?: string; category?: string };
  return [
    `Portal: ${identity.display_title ?? '(untitled)'} (${identity.category ?? 'unknown'})`,
    '',
    `Template's seed pages:`,
    seedHints || '  (none)',
    '',
    'Suggest a `pages` array for `content_structure`. Three-to-five pages',
    'covers most cases. Use the seed pages as a starting point; add or remove',
    'based on the resolved intent. Paths must start with "/" and use lowercase',
    'slugs (e.g. "/", "/about", "/products/cake-1"). sort_order from 0 upward.',
  ].join('\n');
}

// ── Phase 4: content_generation ────────────────────────────────────────────

function contentGenerationMessage(session: SessionState): string {
  const t = session.template;
  const structure = (session.accumulatedState.content_structure ?? {}) as { pages?: Array<{ path: string; title: string }> };
  const declaredPages = (structure.pages ?? []).map(p => `  - ${p.path}: ${p.title}`).join('\n');

  // Anchor: include the template's seed HTML for at least the first page so
  // the LLM has a stylistic example to follow.
  const seedExamples = t.seedPages.slice(0, 2).map(p =>
    `### ${p.path} (template seed)\n\`\`\`html\n${p.html}\n\`\`\``,
  ).join('\n\n');

  return [
    `Pages declared in content_structure:`,
    declaredPages || '  (none)',
    '',
    `Template seed HTML — use these as stylistic anchors and adapt to the resolved intent:`,
    seedExamples,
    '',
    'Generate `pages[]` (path + html for each declared page) and optionally',
    '`structured_kinds[]` (e.g. for product catalogs, team rosters).',
    '',
    'Interpolation grammar that the renderer supports — use it freely:',
    '  {{title}}                                    page title',
    '  {{portal.displayTitle | category | address}} portal facts',
    '  {{page.path | title | sortOrder}}            page facts',
    '  {{data.<dotpath>}}                           page.structured_data',
    '  {{#each <kind>}}…{{field}}…{{/each}}         iterates portal_structured_data',
    '  {{asset:<path>}}                             portal asset URL (e.g. logo.png)',
    '  {{!raw <expr>}}                              skip HTML escaping (rare)',
    '',
    'Default behaviour: structured-data values are HTML-escaped. Keep HTML',
    'simple — semantic elements (header, main, section, h1-h3, ul/li, p, a).',
    'No inline scripts. The visitor renders this in a sandboxed iframe.',
  ].join('\n');
}

// ── Phase 5: capabilities ──────────────────────────────────────────────────

function capabilitiesMessage(session: SessionState): string {
  const t = session.template;
  const defaults = t.defaultCapabilities.map(c =>
    `  - ${c.id} (${c.verb}): "${c.title}" — ${c.description}`,
  ).join('\n');

  // Verb taxonomy: 1-line summary per verb. We keep this short to stay within
  // budget; per-verb baseline schemas are too heavy for this prompt.
  const verbTaxonomy = CAPABILITY_VERBS.map(v => {
    const baseline = VERB_BASELINES[v];
    return `  - ${v} (${baseline.trustLevel} trust, ${baseline.paymentDefault})`;
  }).join('\n');

  return [
    `Template's default capabilities (start from these):`,
    defaults || '  (none)',
    '',
    `Available verbs (12 core + custom escape hatch):`,
    verbTaxonomy,
    '',
    'Suggest `capabilities[]`. Two-to-five capabilities is typical. Each needs:',
    '  id          (lowercase slug, unique per portal — e.g. "order-cake")',
    '  verb        (one of the 13 above)',
    '  title       (human-readable, < 60 chars)',
    '  description (one or two sentences)',
    '  aap_endpoint (lowercase slug — e.g. "orders", "messages")',
    '  payment_required (boolean — set true ONLY for order/pay/booked-paid)',
    '  tags        (optional string[] for discovery)',
    '',
    'Match the verbs to the resolved intent. A commerce portal needs `order`;',
    'a community portal needs `join`; almost every portal benefits from `contact`.',
    'Avoid `delegate` and `authenticate` unless the use case clearly calls for them.',
  ].join('\n');
}

// ── Phase 6: aesthetics ────────────────────────────────────────────────────

function aestheticsMessage(session: SessionState): string {
  const identity = (session.accumulatedState.identity ?? {}) as { category?: string };
  return [
    `Portal category: ${identity.category ?? 'unknown'}`,
    '',
    'Suggest `palette` (free-form name) and `font_family`. Palette ideas by category:',
    '  - personal/creator: "minimal" / "warm-paper" / "deep-ocean"',
    '  - business/commerce: "professional-blue" / "neutral-grey"',
    '  - community/team: "energetic-citrus" / "rooted-forest"',
    '  - bulletin: "minimal" (always)',
    'Font family: pick one of system-ui, "Inter", "JetBrains Mono", "Source Serif".',
    'custom_css is optional and capped at 20 KB — leave it empty unless the',
    'template clearly calls for a hand-tuned look.',
  ].join('\n');
}

// ── Phase 7: review ────────────────────────────────────────────────────────

function reviewMessage(session: SessionState): string {
  // Provide the full state so the AI can score it holistically.
  const state = JSON.stringify(session.accumulatedState, null, 2);
  return [
    `Full accumulated state:`,
    '```json',
    state.length > 6000 ? state.slice(0, 6000) + '\n... (truncated)' : state,
    '```',
    '',
    'Rate this portal-build for production-readiness:',
    '  approved        (boolean — true if the portal is good to publish as-is)',
    '  quality_score   (number 0-10)',
    '  reviewer_notes  (optional one-paragraph summary)',
    '  flagged_issues  (optional string[] — concrete things to fix before publish)',
    '',
    'Be honest. Flag anything that looks placeholder, inconsistent across phases,',
    'or that violates the spec. Approve only if a real visitor would trust the portal.',
  ].join('\n');
}

// ── Phase 8: publish ───────────────────────────────────────────────────────

function publishMessage(session: SessionState): string {
  const review = (session.accumulatedState.review ?? {}) as { approved?: boolean };
  return [
    `Review approved: ${review.approved === true ? 'yes' : 'no'}`,
    '',
    'Suggest the publish settings. Default `public_index: false` (the user can',
    'opt in via the UI). Always `ready_to_register: true` — this phase exists',
    'as a deliberate confirmation step.',
  ].join('\n');
}
