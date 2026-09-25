#!/usr/bin/env tsx
/**
 * openrouter-eval.ts — the showcase model test run (2026-09-25).
 *
 * Runs ten representative Work modules, each with a fixed synthetic input (no
 * client data), against the candidate showcase models on OpenRouter, and records
 * what a visitor would get: the answer, tokens, reasoning tokens, OpenRouter's
 * billed cost (usage.cost), latency and finish_reason. Optionally a judge on the
 * local subscription engine grades each answer against a rubric.
 *
 * The system prompt is the one ANTON composes for a fresh Work run of the module:
 * prompt-composer.ts fed with the module's own defaults (formats, creativity,
 * first recommended persona, transparency) the way POST /api/claude/message
 * builds it. Read-only — no database, no ANTON server.
 *
 * Self-contained on purpose: OpenRouter is called with fetch, not through ANTON's
 * compat adapter, so the numbers do not move with the adapter work in progress.
 *
 *   npx tsx scripts/eval/openrouter-eval.ts --dry-run         plan + cost estimate, no calls
 *   npx tsx scripts/eval/openrouter-eval.ts --max-usd 2       run (needs OPENROUTER_API_KEY)
 *   npx tsx scripts/eval/openrouter-eval.ts --judge           ... and grade each answer
 *
 * Usage and caveats: scripts/eval/README.md.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { composeSystemPromptParts } from '../../server/services/prompt-composer.js';
import { getModule } from '../../server/services/module-loader.js';
import { preloadDiskSkills, getAutoAttachSkillIds } from '../../server/services/skills-manager.js';
import { retrieveGroundingText } from '../../server/services/framework-text-retrieval.js';
import { frameworksForArea } from '../../server/services/area-frameworks.js';
import { estimateTokens } from '../../server/services/token-estimator.js';
import { buildOutputInstruction } from '../../src/lib/output-format-definitions.js';
import type { ModuleConfig } from '../../server/types/area-config.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';
export const DEFAULT_JUDGE_MODEL = 'sdk:claude-opus-5-5';

// ── Candidates ──────────────────────────────────────────────

export type Effort = 'low' | 'medium' | 'high' | 'max';
export type EffortChoice = Effort | 'none' | 'auto';

export interface Candidate {
  key: string;
  label: string;
  /** OpenRouter model id. */
  model: string;
  /** Merged into the request body (OpenRouter `provider` routing, …). */
  extraBody?: Record<string, unknown>;
  /** null = send no `reasoning` field at all. */
  reasoning: { mandatory: boolean; efforts: Effort[] } | null;
  /** List price, USD per 1M tokens — the dry-run estimate and the fallback when no cost is reported. */
  pricePerM?: { input: number; output: number };
  /** The endpoint's output cap (reasoning counts against it). */
  maxCompletionTokens?: number;
}

const GLM = 'z-ai/glm-5.3-flash';
const LING = 'inclusionai/ling-3.0-flash-vl';

/**
 * The showcase default: GLM pinned to the two EU zero-retention providers (brief,
 * decision 1). `only` keeps it on those two; allow_fallbacks lets one stand in
 * for the other on a 429 (with false, only OpenRouter's first pick is tried).
 */
export const EU_ZDR_PROVIDER = {
  only: ['inceptron', 'nextbit'],
  allow_fallbacks: true,
  zdr: true,
  data_collection: 'deny',
};

// Prices are the list (not promotional) prices in the 2026-09-25 findings file;
// the run itself records what OpenRouter billed. GLM's reasoning is mandatory and
// takes low/high/max only (Z.ai model card: anything else becomes max). Ling's
// reasoning can be switched off; its effort set is OpenRouter's standard one
// (not confirmed against /models).
export const CANDIDATES: readonly Candidate[] = [
  {
    key: 'glm-eu',
    label: 'GLM 5.3 Flash, pinned to Inceptron/NextBit (EU, zero retention)',
    model: GLM,
    extraBody: { provider: EU_ZDR_PROVIDER },
    reasoning: { mandatory: true, efforts: ['low', 'high', 'max'] },
    pricePerM: { input: 0.165, output: 0.55 },
  },
  {
    key: 'glm-default',
    label: 'GLM 5.3 Flash, OpenRouter default routing',
    model: GLM,
    reasoning: { mandatory: true, efforts: ['low', 'high', 'max'] },
    pricePerM: { input: 0.15, output: 0.5 },
  },
  {
    key: 'ling-vl',
    label: 'Ling 3.0 Flash VL, OpenRouter default routing',
    model: LING,
    reasoning: { mandatory: false, efforts: ['low', 'medium', 'high'] },
    pricePerM: { input: 0.075, output: 0.22 },
    maxCompletionTokens: 32768,
  },
];

// ── Cases ───────────────────────────────────────────────────

export interface EvalCase {
  id: string;
  /** What the case stands for in the brief's list. */
  kind: string;
  moduleId: string;
  /** Guided inputs, keyed by the module's field ids, with option VALUES (rendered to labels like the route does). */
  moduleInputs: Record<string, unknown>;
  userMessage: string;
  /** Composer output language ('sv' → the Swedish layer). */
  outputLanguage?: string;
  /** Rough answer length, for the estimate only. */
  expectedOutputTokens: number;
  /** Module-specific checks for the judge (the generic ones are added). */
  rubric: string[];
}

const VARIANCE_TABLE = [
  '| Line (SEK thousand) | Budget | Actual |',
  '|---|---:|---:|',
  '| Revenue: subscriptions | 18,400 | 17,150 |',
  '| Revenue: professional services | 3,200 | 4,050 |',
  '| Revenue: hardware resale | 1,100 | 640 |',
  '| COGS: hosting | 2,300 | 2,780 |',
  '| COGS: third-party licences | 1,450 | 1,390 |',
  '| COGS: hardware | 880 | 530 |',
  '| Salaries: R&D | 6,900 | 7,240 |',
  '| Salaries: sales and marketing | 3,100 | 2,760 |',
  '| Salaries: G&A | 1,800 | 1,830 |',
  '| Contractors | 900 | 1,520 |',
  '| Marketing programmes | 1,200 | 640 |',
  '| Travel | 350 | 410 |',
  '| Office rent | 780 | 780 |',
  '| IT and software | 420 | 505 |',
  '| Professional fees (legal, audit) | 300 | 560 |',
  '| Depreciation | 610 | 600 |',
  '| Bad debt provision | 150 | 390 |',
  '| FX gain/(loss) | 0 | -210 |',
].join('\n');

// Every organisation and person below is invented.
export const CASES: readonly EvalCase[] = [
  {
    id: 'fcp-gap',
    kind: 'FCP gap analysis',
    moduleId: 'gap-analysis',
    moduleInputs: {
      entity_type: 'fintech',
      jurisdiction: ['sweden', 'eu'],
      amla_supervision_category: 'national_under_amla',
      focus_areas: ['cdd', 'tm', 'governance', 'pep'],
      known_concerns: 'Transaction-monitoring rules were last tuned in 2023. PEP screening runs only at onboarding.',
    },
    userMessage:
      'Fictional client: Nordvik Betal AB, a Swedish payment institution authorised by Finansinspektionen. '
      + 'About 180,000 retail customers; card issuing and account-to-account payments; 45 staff; KYC checks '
      + 'outsourced to a vendor; customers mostly in Sweden, 8% in other EU countries. Current AML framework: '
      + 'policy last approved in 2024 under the Swedish AML Act (2017:630); risk-based CDD with three risk tiers; '
      + 'no documented group-wide policy; the MLRO is also Head of Compliance and reports to the COO; no '
      + 'independent AML audit since 2022. Run an AMLR (Regulation (EU) 2024/1624) gap analysis against this '
      + 'description and tell us what to fix first.',
    expectedOutputTokens: 7000,
    rubric: [
      'Cites AMLR articles that exist and fit (e.g. governance, the business-wide risk assessment, CDD) without inventing article numbers',
      'The gap matrix has one row per gap with severity, a suggested owner and a target date',
      'Findings use the facts given: the MLRO reporting line, PEP screening only at onboarding, stale monitoring rules, no recent audit',
      'Takes the AMLR application date (10 July 2027) into account when prioritising',
      'Labels typical or assumed findings as such instead of presenting them as verified',
    ],
  },
  {
    id: 'bwra',
    kind: 'BWRA',
    moduleId: 'business-wide-risk-assessment',
    moduleInputs: {
      institution_type: 'casp',
      jurisdictions: ['EU', 'Nordics'],
      business_description:
        'Fictional: Fjordkrypto AB, a MiCA-authorised crypto-asset service provider in Sweden. Services: custody, '
        + 'exchange of crypto-assets for SEK and EUR, and transfer services. 60,000 retail customers (92% Sweden, '
        + '6% Finland and Norway, 2% other EU) and 300 business customers, 15 of them OTC clients trading above '
        + 'EUR 1 million a month. Fully online onboarding with video identification. Transfers to and from '
        + 'self-hosted wallets allowed after proof of address ownership. Blockchain analytics vendor in place; '
        + 'travel-rule solution live since Q1 2025. Twelve in-house transaction-monitoring scenarios. 85 staff; '
        + 'an MLRO team of four.',
    },
    userMessage: 'Produce the business-wide risk assessment for this firm. No Risk Atlas board pack exists yet.',
    expectedOutputTokens: 10000,
    rubric: [
      'Covers the twelve sections the module asks for, including all seven stages',
      'Inherent = the highest of exposure, threat and vulnerability, and the residual subtraction is shown per path (e.g. 5 - 1 = 4) and is right',
      'Appetite bands follow the rules: residual 1-2 within, 3 boundary, 4 outside, 5 unacceptable',
      'At least eight threat paths that fit a CASP (self-hosted wallets, OTC clients, travel-rule gaps, mixers, sanctions evasion)',
      'Counts in the executive summary match the tables, and scores are marked as proposals to confirm',
    ],
  },
  {
    id: 'hr-policy',
    kind: 'Policy drafting',
    moduleId: 'hr-policy',
    moduleInputs: {
      policy_type: 'remote_work',
      jurisdiction: 'sweden',
      org_size: 'medium',
      unionised: 'yes',
      existing_policy: 'new',
      special_requirements: 'Staff may work from another EU country for up to 20 working days a year.',
    },
    userMessage:
      'Draft a remote and hybrid work policy for Ljusbacken Systems AB, a fictional 250-person Swedish software '
      + 'company bound by a collective agreement. Staff are in the office three days a week. Cover equipment, '
      + 'working hours and rest, responsibility for the work environment at home, information security at home, '
      + 'working from abroad, and how requests are approved.',
    expectedOutputTokens: 5000,
    rubric: [
      'A complete policy: purpose, scope, definitions, rules, roles, approval process, review date',
      'References to Swedish law (working hours, work environment, consultation with the union) are correct and not invented',
      'Handles the 20-day cross-border rule with tax and social-security caveats',
      'Rules are practical and unambiguous for an employee',
      'Says where local legal review is needed',
    ],
  },
  {
    id: 'contract-review',
    kind: 'Contract review',
    moduleId: 'contract-review',
    moduleInputs: {
      contract_type: 'ict_contract',
      your_role: 'client',
      review_focus: ['regulatory', 'liability', 'termination', 'data_protection', 'sla'],
      jurisdiction: 'swedish',
    },
    userMessage: [
      'Excerpt from a fictional cloud-hosting agreement between Solvik Sparbank AB (customer, a bank) and '
        + 'CloudNord Oy (supplier). The service hosts the bank\'s core payment system, a critical function.',
      '',
      '4.1 Service levels. Supplier targets 99.5% monthly availability. Service credits of up to 5% of the monthly fee are the Customer\'s sole remedy for unavailability.',
      '7.2 Subcontracting. Supplier may engage subcontractors without notice to Customer.',
      '8.1 Data location. Customer data is stored in the EU or in such other locations as Supplier deems fit.',
      '9.3 Audit. Customer may audit once per calendar year on 60 days\' written notice, at Customer\'s cost.',
      '10.1 Incidents. Supplier notifies Customer of security incidents without undue delay.',
      '12.1 Liability. Supplier\'s aggregate liability is limited to the fees paid in the preceding three months. Supplier is not liable for loss of data.',
      '14.2 Termination. Supplier may terminate for convenience on 30 days\' notice.',
      '14.5 Exit. Supplier will use reasonable efforts to assist with transition for 14 days after termination.',
      '18. Governing law: Finnish law.',
      '',
      'Review this against DORA (Regulation (EU) 2022/2554) Article 30 and the EBA outsourcing guidelines and list the clauses we must renegotiate.',
    ].join('\n'),
    expectedOutputTokens: 4500,
    rubric: [
      'Finds the DORA Article 30 gaps: audit and access rights, exit and transition, subcontracting, data location, incident notification, termination rights',
      'Treats the three-month liability cap and the data-loss exclusion as unacceptable for a critical function',
      'Proposes concrete replacement wording or negotiating positions',
      'Separates must-haves from nice-to-haves',
      'Does not invent clause text that is not in the excerpt',
    ],
  },
  {
    id: 'board-summary',
    kind: 'Executive summary',
    moduleId: 'board-legal-summary',
    moduleInputs: {
      reporting_period: 'Q3 2026',
      audience: 'board',
      jurisdictions: ['eu', 'sweden'],
      regulatory_areas: ['aml_cft', 'dora', 'gdpr'],
      key_developments: 'AMLR preparation (applies from July 2027); DORA register of information follow-up; handling of GDPR complaints.',
      internal_matters:
        'Two overdue items in the DORA register of information. One GDPR complaint escalated to IMY (resolved, no fine). '
        + 'AML transaction-monitoring backlog of 1,400 alerts (target: under 300 by year end). New MLRO appointed 1 August.',
    },
    userMessage:
      'Write the quarterly legal and regulatory update for the board of Solvik Sparbank AB, a fictional mid-size '
      + 'Swedish bank. Keep it to what the board must know and decide.',
    expectedOutputTokens: 3000,
    rubric: [
      'Opens with an executive summary a board member can read in two minutes',
      'Separates decisions the board must take from information',
      'Uses the internal matters given (DORA register items, IMY complaint, alert backlog, new MLRO) accurately',
      'Does not make up regulatory events, dates or enforcement cases, and marks anything unverified',
      'Concise, without padding',
    ],
  },
  {
    id: 'op-risk',
    kind: 'Risk assessment',
    moduleId: 'operational-risk',
    moduleInputs: {
      task: 'rcsa',
      process_area: ['technology', 'process_failure', 'fraud_external', 'business_disruption'],
      context:
        'Incidents in the last 12 months: two outages of 3 and 5 hours at the cloud provider; one authorised '
        + 'push-payment fraud wave with SEK 4.2 million in customer losses; six manual reconciliation errors.',
    },
    userMessage:
      'Run a risk and control self-assessment of the retail instant-payment process at Nordvik Betal AB (fictional). '
      + 'Customers start instant payments in the app; each payment passes a vendor fraud-scoring model, then '
      + 'sanctions screening, then goes to the national instant-payment scheme. End-of-day reconciliation is a '
      + 'manual spreadsheet step. Identify the risks, score inherent and residual risk on a 5x5 scale, assess the '
      + 'controls and propose key risk indicators.',
    expectedOutputTokens: 5000,
    rubric: [
      'Risks are specific to the described process, not generic',
      'Inherent and residual scores on a consistent 5x5 scale, with rationale',
      'Controls assessed for design and operating effectiveness, tied to the incident history',
      'KRIs are measurable and have thresholds',
      'An action plan with owners and dates',
    ],
  },
  {
    id: 'legal-memo',
    kind: 'Legal research memo',
    moduleId: 'legal-brief',
    moduleInputs: {
      brief_type: 'legal_memo',
      legal_question:
        'Does a buy-now-pay-later option offered at checkout by a Swedish payment institution fall under the '
        + 'new Consumer Credit Directive (EU) 2023/2225, and what must change before it applies?',
      jurisdiction: ['eu', 'sweden'],
      audience: 'compliance',
      background:
        'The institution (fictional) lets consumers split purchases into four interest-free instalments; it charges '
        + 'a late fee of SEK 60 per missed instalment and is paid a fee by the merchant.',
    },
    userMessage: 'Write the legal memo for the compliance team.',
    expectedOutputTokens: 4000,
    rubric: [
      'Answers the question directly at the top',
      'Names the right instruments and timeline (Directive (EU) 2023/2225 and its Swedish implementation) and explains when interest-free deferred payment is in or out of scope',
      'Separates settled law from open points such as the details of Swedish implementing law',
      'Gives practical consequences (creditworthiness assessment, pre-contractual information, advertising rules)',
      'No invented case law or article numbers',
    ],
  },
  {
    id: 'variance',
    kind: 'Data-heavy (variance analysis)',
    moduleId: 'budget-variance-analyzer',
    moduleInputs: {
      reporting_period: 'Q2 2026 (April to June)',
      variance_data: VARIANCE_TABLE,
      materiality_threshold: '5% and SEK 250 thousand',
      business_context:
        'Fictional Swedish B2B software company. A large hardware-resale customer paused orders in May; two '
        + 'contractors were hired to cover open R&D roles; a customer went into reconstruction in June.',
      audience: 'executive',
    },
    userMessage: 'Analyse the variances, explain what drives them and tell management what to do.',
    expectedOutputTokens: 4000,
    rubric: [
      'Variance arithmetic is right. Spot checks: total revenue -860 (-3.8%); subscriptions -1,250 (-6.8%); contractors +620 (+68.9%); operating result from +1,560 budget to -305 actual',
      'Applies the materiality threshold consistently',
      'Links variances to the business context (hardware customer, contractors, reconstruction) without inventing other causes as fact',
      'Separates timing from permanent variances and gives actions',
      'Tables are readable and consistent with the narrative',
    ],
  },
  {
    id: 'press-release',
    kind: 'Short task',
    moduleId: 'press-release',
    moduleInputs: {
      release_type: 'appointment',
      key_message:
        'Fictional: Solvik Sparbank AB appoints Karin Testberg as Chief Risk Officer from 1 November 2026. She joins '
        + 'from a Nordic insurer where she led enterprise risk for eight years.',
      quotes_speakers: 'CEO Johan Exempel',
    },
    userMessage: 'Write the press release. Keep it under 350 words.',
    expectedOutputTokens: 700,
    rubric: [
      'Under about 350 words, with headline, dateline, lead paragraph, quote, boilerplate and contact',
      'Uses only the facts given; anything else is a placeholder, not an invented fact',
      'A natural quote attributed to the CEO',
      'No hype or unverifiable superlatives',
    ],
  },
  {
    id: 'sv-dsar',
    kind: 'Swedish-language',
    moduleId: 'gdpr-dsar-handler',
    outputLanguage: 'sv',
    moduleInputs: {
      request_type: 'access',
      request_details:
        'Registerutdrag enligt artikel 15 GDPR, inkommet via e-post med kopia av körkort. Kunden vill ha alla '
        + 'uppgifter, inklusive varför kontot stängdes.',
      data_subject_type: 'former_customer',
      received_date: '2026-09-15',
      known_data_sources:
        'Kärnbankssystem, CRM, inspelade kundtjänstsamtal, transaktionsövervakning (penningtvätt), e-postarkiv',
      potential_exemptions: ['aml_tipping_off'],
    },
    userMessage:
      'En tidigare kund (fiktiv) begär ut alla personuppgifter vi har om henne, inklusive anteckningar från vår '
      + 'penningtvättsutredning om hennes konto, som avslutades i maj. Vi har lämnat en rapport till Finanspolisen '
      + 'om kontot. Hur ska vi hantera begäran, vilka tidsfrister gäller och vad får vi inte lämna ut? Skriv också '
      + 'ett svarsbrev på svenska till kunden.',
    expectedOutputTokens: 3500,
    rubric: [
      'Written entirely in fluent, professional Swedish',
      'The deadline is right: one month from 15 September 2026, extendable by two further months with notice (GDPR Art. 12(3))',
      'Handles the tipping-off ban correctly: nothing may reveal the report to Finanspolisen, and the restriction on access is grounded in law',
      'The reply letter is usable as it stands and does not disclose the report',
      'Covers identity verification and every listed data source',
    ],
  },
];

const GENERIC_RUBRIC = [
  'Follows the deliverable format and structure the task and the module ask for',
  'No invented citations, article numbers, cases, statistics or facts about the client',
  'Ends with the "Sources, assumptions and what was not checked" section ANTON requires',
];

// ── Prompt composition (read-only use of the composer) ──────

export interface PreparedCase {
  case: EvalCase;
  moduleLabel: string;
  areaId: string;
  thinking: string;
  outputFormats: string[];
  personas: string[];
  skills: string[];
  systemPrompt: string;
  systemPromptSha256: string;
  layers: string[];
  userContent: string;
  inputTokens: number;
}

/**
 * The "## Module Settings" block POST /api/claude/message puts before the user's
 * text: the module's own field and option labels, empty values dropped.
 * Kept in step with server/routes/claude.ts by hand (the route renders it inline).
 */
export function renderUserContent(mod: Pick<ModuleConfig, 'guidedInputs'>, inputs: Record<string, unknown>, userMessage: string): string {
  const fieldById = new Map((mod.guidedInputs ?? []).map((f) => [f.id, f] as const));
  const lines = Object.entries(inputs)
    .filter(([, v]) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0))
    .map(([k, v]) => {
      const field = fieldById.get(k);
      const label = field?.label?.trim() || k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      const render = (x: unknown): string => {
        const raw = String(x);
        return field?.options?.find((o) => o.value === raw)?.label ?? raw;
      };
      const value = Array.isArray(v) ? v.map(render).join(', ') : render(v);
      return `- **${label}:** ${value}`;
    });
  return lines.length > 0 ? `## Module Settings\n${lines.join('\n')}\n\n---\n\n${userMessage}` : userMessage;
}

let skillsPreloaded = false;

/** Compose the system prompt a fresh Work run of this module would send. */
export async function prepareCase(c: EvalCase, now: Date): Promise<PreparedCase> {
  const mod = await getModule(c.moduleId);
  if (!mod) throw new Error(`Module "${c.moduleId}" not found under server/areas`);
  if (!skillsPreloaded) {
    await preloadDiskSkills().catch(() => 0);
    skillsPreloaded = true;
  }
  const areaId = mod.areaId ?? '';
  const outputFormats = Array.isArray(mod.defaults?.outputFormats) ? mod.defaults.outputFormats : [];
  // ModulePage: the first recommended persona, else the plain assistant.
  const personas = [mod.recommendedPersonas?.[0] ?? 'general-assistant'];
  // The route adds the format-driven skills to the (empty) selection.
  const skills = getAutoAttachSkillIds(outputFormats);
  const userContent = renderUserContent(mod, c.moduleInputs, c.userMessage);
  // Framework text, as the route retrieves it: module label + the user's words, area frameworks as weak scope.
  const grounding = await retrieveGroundingText({
    query: [mod.label, c.userMessage].join(' '),
    frameworkIds: frameworksForArea(areaId),
    tokenBudget: 3000,
  }).catch(() => null);

  const composed = await composeSystemPromptParts({
    moduleId: mod.id,
    areaId,
    creativity: mod.defaults?.creativity ?? 'balanced',
    thinking: mod.defaults?.thinking ?? 'think_hard',
    outputInstruction: buildOutputInstruction(outputFormats) || undefined,
    plainTextMode: false,
    selectedPersonas: personas,
    selectedSkills: skills.length > 0 ? skills : undefined,
    multiPerspective: false,
    metaCognitiveEnabled: false,
    transparencyLevel: mod.defaults?.transparencyLevel ?? 0,
    writingTone: 'professional',
    emojiEnabled: false,
    outputLanguage: c.outputLanguage,
    frameworkGroundingPrompt: grounding?.text || undefined,
    now,
  });

  return {
    case: c,
    moduleLabel: mod.label,
    areaId,
    thinking: mod.defaults?.thinking ?? 'think_hard',
    outputFormats,
    personas,
    skills,
    systemPrompt: composed.full,
    systemPromptSha256: createHash('sha256').update(composed.full).digest('hex'),
    layers: composed.parts.map((p) => p.key),
    userContent,
    inputTokens: estimateTokens(composed.full) + estimateTokens(userContent),
  };
}

// ── Request body ────────────────────────────────────────────

const LADDER: ReadonlyArray<Effort | 'none'> = ['none', 'low', 'medium', 'high', 'max'];

/** The smallest supported effort at or above the one wanted, else the highest supported. */
export function nearestEffort(wanted: Effort, supported: readonly Effort[]): Effort {
  const rank = (e: Effort | 'none'): number => LADDER.indexOf(e);
  const sorted = [...supported].sort((a, b) => rank(a) - rank(b));
  return sorted.find((e) => rank(e) >= rank(wanted)) ?? sorted[sorted.length - 1] ?? wanted;
}

/** `--effort auto`: the module's default thinking level, as the findings suggest mapping it. */
export function effortForThinking(thinking: string): Effort | 'none' {
  switch (thinking) {
    case 'quick': return 'none';
    case 'think': return 'medium';
    case 'deep_investigate': return 'max';
    default: return 'high'; // think_hard, investigate, plan_first
  }
}

/** The `reasoning` object this candidate gets, or undefined for none. */
export function resolveReasoning(candidate: Candidate, choice: EffortChoice, thinking: string): Record<string, unknown> | undefined {
  if (!candidate.reasoning) return undefined;
  const wanted = choice === 'auto' ? effortForThinking(thinking) : choice;
  if (wanted === 'none') {
    // Mandatory reasoning cannot be switched off: ask for the least there is.
    return candidate.reasoning.mandatory
      ? { effort: nearestEffort('low', candidate.reasoning.efforts) }
      : { enabled: false };
  }
  return { effort: nearestEffort(wanted, candidate.reasoning.efforts) };
}

export interface RunSettings {
  effort: EffortChoice;
  maxTokens: number;
  temperature: number;
}

export function effectiveMaxTokens(candidate: Candidate, maxTokens: number): number {
  return candidate.maxCompletionTokens ? Math.min(maxTokens, candidate.maxCompletionTokens) : maxTokens;
}

export function buildRequestBody(candidate: Candidate, prepared: PreparedCase, settings: RunSettings): Record<string, unknown> {
  const reasoning = resolveReasoning(candidate, settings.effort, prepared.thinking);
  return {
    ...(candidate.extraBody ?? {}),
    model: candidate.model,
    stream: true,
    stream_options: { include_usage: true },
    usage: { include: true },
    messages: [
      { role: 'system', content: prepared.systemPrompt },
      { role: 'user', content: prepared.userContent },
    ],
    temperature: settings.temperature,
    max_tokens: effectiveMaxTokens(candidate, settings.maxTokens),
    ...(reasoning ? { reasoning } : {}),
  };
}

// ── Cost estimate ───────────────────────────────────────────

const REASONING_ALLOWANCE: Record<Effort | 'none', number> = { none: 0, low: 1500, medium: 3000, high: 6000, max: 12000 };

export interface CallEstimate {
  inputTokens: number;
  expectedOutputTokens: number;
  expectedUsd: number | null;
  /** Input plus a full max_tokens of output: the most one call can cost at list price. */
  ceilingUsd: number | null;
}

export function priceUsd(price: { input: number; output: number } | undefined, inputTokens: number, outputTokens: number): number | null {
  if (!price) return null;
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
}

export function estimateCall(candidate: Candidate, prepared: PreparedCase, settings: RunSettings): CallEstimate {
  const reasoning = resolveReasoning(candidate, settings.effort, prepared.thinking);
  const effort = typeof reasoning?.effort === 'string' ? (reasoning.effort as Effort) : reasoning ? 'none' : 'low';
  const cap = effectiveMaxTokens(candidate, settings.maxTokens);
  const expectedOutputTokens = Math.min(cap, prepared.case.expectedOutputTokens + REASONING_ALLOWANCE[effort]);
  return {
    inputTokens: prepared.inputTokens,
    expectedOutputTokens,
    expectedUsd: priceUsd(candidate.pricePerM, prepared.inputTokens, expectedOutputTokens),
    ceilingUsd: priceUsd(candidate.pricePerM, prepared.inputTokens, cap),
  };
}

// ── One call ────────────────────────────────────────────────

export interface Usage {
  promptTokens?: number;
  completionTokens?: number;
  reasoningTokens?: number;
  cachedTokens?: number;
  costUsd?: number;
}

export interface RunResult {
  caseId: string;
  moduleId: string;
  candidate: string;
  model: string;
  status: 'ok' | 'error' | 'skipped';
  skipReason?: string;
  error?: string;
  httpStatus?: number;
  /** A 402 for the key's limit or credits: nothing else will run. */
  budgetRefused?: boolean;
  /** Taken over from an earlier run (--resume): not called or paid for in this one. */
  reusedFrom?: string;
  finishReason?: string | null;
  nativeFinishReason?: string | null;
  truncated?: boolean;
  warnings: string[];
  servedModel?: string;
  provider?: string;
  generationId?: string;
  content: string;
  reasoning: string;
  usage: Usage;
  costUsd: number | null;
  costSource: 'reported' | 'estimated' | 'unknown' | 'none';
  latencyMs?: number;
  firstTokenMs?: number;
  firstContentMs?: number;
  request: { maxTokens: number; temperature: number; reasoning?: Record<string, unknown>; provider?: unknown };
  judge?: JudgeResult;
}

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
}
function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}
function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function readUsage(u: Record<string, unknown>): Usage {
  return {
    promptTokens: num(u.prompt_tokens),
    completionTokens: num(u.completion_tokens),
    reasoningTokens: num(asRecord(u.completion_tokens_details)?.reasoning_tokens),
    cachedTokens: num(asRecord(u.prompt_tokens_details)?.cached_tokens),
    costUsd: num(u.cost),
  };
}

/** OpenRouter's error body: `{ error: { code, message, metadata } }`. */
export function readErrorBody(text: string): { message: string; limitSource?: string } {
  try {
    const err = asRecord(asRecord(JSON.parse(text) as unknown)?.error);
    if (err) {
      const meta = asRecord(err.metadata);
      return { message: str(err.message) ?? text.slice(0, 500), limitSource: str(meta?.limit_source) };
    }
  } catch { /* not JSON */ }
  return { message: text.slice(0, 500) };
}

interface CallConfig {
  baseUrl: string;
  apiKey: string;
  timeoutMs: number;
  fetchImpl: typeof fetch;
  sleep: (ms: number) => Promise<void>;
}

const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 3;

function retryDelayMs(res: Response, attempt: number): number {
  const header = Number(res.headers.get('retry-after'));
  const seconds = Number.isFinite(header) && header > 0 ? Math.min(header, 30) : 5 * attempt;
  return seconds * 1000;
}

/** POST one streamed chat completion and read it to the end. */
export async function callOpenRouter(
  body: Record<string, unknown>,
  cfg: CallConfig,
): Promise<Omit<RunResult, 'caseId' | 'moduleId' | 'candidate' | 'model' | 'request' | 'costUsd' | 'costSource'>> {
  const url = `${cfg.baseUrl.replace(/\/$/, '')}/chat/completions`;
  const warnings: string[] = [];
  const base = { content: '', reasoning: '', usage: {}, warnings };

  for (let attempt = 1; ; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
    const t0 = performance.now();
    try {
      const res = await cfg.fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        const err = readErrorBody(text);
        const inFlight = res.status === 402 && err.limitSource === 'openrouter_in_flight_budget';
        if ((RETRYABLE.has(res.status) || inFlight) && attempt < MAX_ATTEMPTS) {
          clearTimeout(timer);
          await cfg.sleep(retryDelayMs(res, attempt));
          continue;
        }
        if (res.status === 402) {
          return {
            ...base,
            status: 'error',
            httpStatus: 402,
            budgetRefused: !inFlight,
            error: `OpenRouter refused for budget (402${err.limitSource ? `, ${err.limitSource}` : ''}): ${err.message}`,
          };
        }
        return { ...base, status: 'error', httpStatus: res.status, error: `HTTP ${res.status}: ${err.message}` };
      }
      if (!res.body) return { ...base, status: 'error', httpStatus: res.status, error: 'Response had no body' };
      return await readStream(res.body, t0, warnings);
    } catch (err) {
      const message = controller.signal.aborted
        ? `timed out after ${Math.round(cfg.timeoutMs / 1000)} s`
        : err instanceof Error ? err.message : String(err);
      return { ...base, status: 'error', error: message };
    } finally {
      clearTimeout(timer);
    }
  }
}

async function readStream(
  stream: ReadableStream<Uint8Array>,
  t0: number,
  warnings: string[],
): Promise<Omit<RunResult, 'caseId' | 'moduleId' | 'candidate' | 'model' | 'request' | 'costUsd' | 'costSource'>> {
  let content = '';
  let reasoning = '';
  let usage: Usage = {};
  let finishReason: string | null = null;
  let nativeFinishReason: string | null = null;
  let servedModel: string | undefined;
  let provider: string | undefined;
  let generationId: string | undefined;
  let streamError: string | undefined;
  let firstTokenMs: number | undefined;
  let firstContentMs: number | undefined;

  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const handle = (line: string): void => {
    const trimmed = line.trim();
    // ':' lines are OpenRouter keep-alive comments.
    if (!trimmed.startsWith('data:')) return;
    const data = trimmed.slice(5).trim();
    if (!data || data === '[DONE]') return;
    let chunk: Record<string, unknown> | undefined;
    try { chunk = asRecord(JSON.parse(data) as unknown); } catch { return; }
    if (!chunk) return;
    servedModel = str(chunk.model) ?? servedModel;
    provider = str(chunk.provider) ?? provider;
    generationId = str(chunk.id) ?? generationId;
    const err = asRecord(chunk.error);
    if (err) streamError = `${str(err.message) ?? 'stream error'}${err.code !== undefined ? ` (code ${String(err.code)})` : ''}`;
    const choice = asRecord(Array.isArray(chunk.choices) ? (chunk.choices[0] as unknown) : undefined);
    const delta = asRecord(choice?.delta);
    if (delta) {
      let r = str(delta.reasoning) ?? '';
      if (!r && Array.isArray(delta.reasoning_details)) {
        for (const d of delta.reasoning_details) r += str(asRecord(d)?.text) ?? '';
      }
      const c = str(delta.content) ?? '';
      if ((r || c) && firstTokenMs === undefined) firstTokenMs = performance.now() - t0;
      if (c && firstContentMs === undefined) firstContentMs = performance.now() - t0;
      reasoning += r;
      content += c;
    }
    finishReason = str(choice?.finish_reason) ?? finishReason;
    nativeFinishReason = str(choice?.native_finish_reason) ?? nativeFinishReason;
    const u = asRecord(chunk.usage);
    if (u) usage = readUsage(u);
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) handle(line);
  }
  if (buffer) handle(buffer);
  const latencyMs = performance.now() - t0;
  const common = {
    content, reasoning, usage, warnings, finishReason, nativeFinishReason,
    servedModel, provider, generationId, latencyMs, firstTokenMs, firstContentMs,
  };

  if (streamError || finishReason === 'error') {
    return { ...common, status: 'error', error: `Error inside the stream: ${streamError ?? 'finish_reason error'}` };
  }
  const truncated = finishReason === 'length';
  if (truncated) warnings.push('cut off at max_tokens (finish_reason length)');
  if (!finishReason) warnings.push('the stream ended without a finish_reason');
  if (!content.trim()) {
    return {
      ...common,
      truncated,
      status: 'error',
      error: truncated
        ? 'No answer text: max_tokens was used up by reasoning'
        : 'The model returned no answer text',
    };
  }
  return { ...common, truncated, status: 'ok' };
}

// ── Judge ───────────────────────────────────────────────────

export interface JudgeResult {
  model: string;
  scores: Array<{ criterion: string; score: number; note?: string }>;
  overall: number | null;
  verdict?: string;
  summary?: string;
  error?: string;
}

/** Given the prompts, return the judge model's raw reply. */
export type JudgeFn = (input: { model: string; system: string; user: string }) => Promise<string>;

const JUDGE_ANSWER_CAP = 60_000;

export function buildJudgePrompt(
  prepared: Pick<PreparedCase, 'moduleLabel' | 'userContent'> & { case: Pick<EvalCase, 'moduleId' | 'rubric' | 'outputLanguage'> },
  answer: string,
  finishReason: string | null | undefined,
): { system: string; user: string } {
  const criteria = [...prepared.case.rubric, ...GENERIC_RUBRIC];
  const system = [
    'You are a demanding senior reviewer. You grade one answer that an AI expert workspace produced for a professional user.',
    'You do not know which model wrote it. Judge only what is on the page.',
    'Score each criterion from 1 to 5: 5 = a senior professional would send it after light edits; 4 = good, minor gaps;',
    '3 = usable only after substantial edits; 2 = major errors or omissions; 1 = wrong, fabricated or harmful.',
    'Check facts, figures and legal references you are sure of; do not reward length.',
    'Reply with ONE JSON object and nothing else, in this shape:',
    '{"scores":[{"criterion":"<criterion text>","score":1,"note":"<one sentence>"}],"overall":1,"verdict":"ship|edit|reject","summary":"<two sentences>"}',
  ].join('\n');
  const answerText = answer.length > JUDGE_ANSWER_CAP ? `${answer.slice(0, JUDGE_ANSWER_CAP)}\n[... answer truncated for grading ...]` : answer;
  const user = [
    `## The task`,
    `Module: ${prepared.moduleLabel} (${prepared.case.moduleId})`,
    prepared.case.outputLanguage ? `Requested output language: ${prepared.case.outputLanguage}` : '',
    '',
    '### What the user sent',
    prepared.userContent,
    '',
    '## Criteria',
    ...criteria.map((c, i) => `${i + 1}. ${c}`),
    '',
    finishReason === 'length' ? 'Note: the answer was cut off at the output limit. Grade what is there and say so.\n' : '',
    '## The answer to grade',
    '<answer>',
    answerText,
    '</answer>',
  ].filter((l, i, all) => l !== '' || all[i - 1] !== '').join('\n');
  return { system, user };
}

/** The last JSON object in a reply (fences and prose around it are ignored). */
function lastJsonObject(text: string): Record<string, unknown> | undefined {
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, '');
  for (let end = cleaned.lastIndexOf('}'); end >= 0; end = cleaned.lastIndexOf('}', end - 1)) {
    let depth = 0;
    for (let start = end; start >= 0; start -= 1) {
      const ch = cleaned[start];
      if (ch === '}') depth += 1;
      else if (ch === '{') depth -= 1;
      if (depth === 0) {
        try {
          const parsed = asRecord(JSON.parse(cleaned.slice(start, end + 1)) as unknown);
          if (parsed) return parsed;
        } catch { /* keep looking */ }
        break;
      }
    }
  }
  return undefined;
}

export function parseJudgeReply(model: string, text: string): JudgeResult {
  const obj = lastJsonObject(text);
  if (!obj) return { model, scores: [], overall: null, error: 'The judge reply held no JSON object' };
  const scores: JudgeResult['scores'] = [];
  if (Array.isArray(obj.scores)) {
    for (const s of obj.scores) {
      const r = asRecord(s);
      const score = num(r?.score);
      if (!r || score === undefined || score < 1 || score > 5) continue;
      scores.push({ criterion: str(r.criterion) ?? '', score, note: str(r.note) });
    }
  }
  const stated = num(obj.overall);
  const overall = stated !== undefined && stated >= 1 && stated <= 5
    ? stated
    : scores.length > 0 ? scores.reduce((a, s) => a + s.score, 0) / scores.length : null;
  return {
    model,
    scores,
    overall,
    verdict: str(obj.verdict),
    summary: str(obj.summary),
    ...(overall === null ? { error: 'The judge reply held no scores' } : {}),
  };
}

/** The default judge: the local subscription engine, through ANTON's router. */
export const routerJudge: JudgeFn = async ({ model, system, user }) => {
  // No database here, so the Settings toggle cannot be read; the env fallback
  // decides. Only this process is affected, and an explicit value is respected.
  if (model.startsWith('sdk:') && process.env.SDK_ENGINE_ENABLED === undefined) process.env.SDK_ENGINE_ENABLED = 'true';
  const { callChat } = await import('../../server/services/provider-router.js');
  const result = await callChat({
    model,
    system,
    messages: [{ role: 'user', content: user }],
    maxTokens: 4000,
    thinkingLevel: 'think',
  });
  return result.text;
};

// ── Options ─────────────────────────────────────────────────

export interface EvalOptions {
  dryRun: boolean;
  maxUsd: number;
  judge: boolean;
  judgeModel: string;
  effort: EffortChoice;
  maxTokens: number;
  temperature: number;
  timeoutSec: number;
  concurrency: number;
  models: string[] | null;
  cases: string[] | null;
  reference: string | null;
  referencePrice: { input: number; output: number } | null;
  baseUrl: string;
  outDir: string | null;
  rejudge: string | null;
  /** An earlier run's results JSON: its finished answers are reused, not paid for again. */
  resume: string | null;
  help: boolean;
}

const EFFORTS: readonly EffortChoice[] = ['low', 'medium', 'high', 'max', 'none', 'auto'];

export function parseArgs(argv: readonly string[], env: Record<string, string | undefined> = process.env): EvalOptions {
  const opts: EvalOptions = {
    dryRun: false,
    maxUsd: 2,
    judge: false,
    judgeModel: DEFAULT_JUDGE_MODEL,
    effort: 'low',
    maxTokens: 16384,
    temperature: 0.5,
    timeoutSec: 900,
    concurrency: 1,
    models: null,
    cases: null,
    reference: null,
    referencePrice: null,
    baseUrl: env.OPENROUTER_BASE_URL?.trim() || DEFAULT_BASE_URL,
    outDir: null,
    rejudge: null,
    resume: null,
    help: false,
  };
  const args = [...argv];
  const value = (flag: string, inline: string | undefined): string => {
    const v = inline ?? args.shift();
    if (v === undefined || v.startsWith('--')) throw new Error(`${flag} needs a value`);
    return v;
  };
  const number = (flag: string, v: string, min: number): number => {
    const n = Number(v);
    if (!Number.isFinite(n) || n < min) throw new Error(`${flag} must be a number >= ${min} (got "${v}")`);
    return n;
  };
  const list = (v: string): string[] => v.split(',').map((s) => s.trim()).filter(Boolean);

  while (args.length > 0) {
    const raw = args.shift() as string;
    const eq = raw.indexOf('=');
    const flag = raw.startsWith('--') && eq > 0 ? raw.slice(0, eq) : raw;
    const inline = raw.startsWith('--') && eq > 0 ? raw.slice(eq + 1) : undefined;
    switch (flag) {
      case '--dry-run': opts.dryRun = true; break;
      case '--judge': opts.judge = true; break;
      case '--help': case '-h': opts.help = true; break;
      case '--max-usd': opts.maxUsd = number(flag, value(flag, inline), 0); break;
      case '--judge-model': opts.judgeModel = value(flag, inline); break;
      case '--effort': {
        const e = value(flag, inline) as EffortChoice;
        if (!EFFORTS.includes(e)) throw new Error(`--effort must be one of ${EFFORTS.join(', ')}`);
        opts.effort = e;
        break;
      }
      case '--max-tokens': opts.maxTokens = Math.floor(number(flag, value(flag, inline), 256)); break;
      case '--temperature': opts.temperature = number(flag, value(flag, inline), 0); break;
      case '--timeout-sec': opts.timeoutSec = number(flag, value(flag, inline), 1); break;
      case '--concurrency': {
        const n = Math.floor(number(flag, value(flag, inline), 1));
        if (n > 6) throw new Error('--concurrency is at most 6');
        opts.concurrency = n;
        break;
      }
      case '--models': opts.models = list(value(flag, inline)); break;
      case '--resume': opts.resume = value(flag, inline); break;
      case '--cases': opts.cases = list(value(flag, inline)); break;
      case '--reference': opts.reference = value(flag, inline); break;
      case '--reference-price': {
        const [i, o] = list(value(flag, inline)).map((v) => number(flag, v, 0));
        if (i === undefined || o === undefined) throw new Error('--reference-price takes "<input>,<output>" in USD per million tokens');
        opts.referencePrice = { input: i, output: o };
        break;
      }
      case '--base-url': opts.baseUrl = value(flag, inline); break;
      case '--out': opts.outDir = value(flag, inline); break;
      case '--rejudge': opts.rejudge = value(flag, inline); break;
      default: throw new Error(`Unknown option: ${raw} (see --help)`);
    }
  }
  return opts;
}

export const USAGE = `Usage: npx tsx scripts/eval/openrouter-eval.ts [options]

  --dry-run               Print the plan and a cost estimate. No model is called; no key needed.
  --max-usd <n>           Stop once this much has been spent (default 2). A call whose worst case
                          at list price would cross the line is not started.
  --judge                 Grade each answer with --judge-model through ANTON's router.
  --judge-model <id>      Default ${DEFAULT_JUDGE_MODEL} (the local subscription engine).
  --effort <e>            low (default) | medium | high | max | none | auto (from the module's thinking level).
  --max-tokens <n>        max_tokens per call, reasoning included (default 16384).
  --temperature <n>       Default 0.5 (what ANTON sends compat models today).
  --timeout-sec <n>       Per call (default 900).
  --concurrency <n>       Parallel calls, 1-6 (default 1).
  --resume <results.json> Reuse the finished answers of an earlier run (same case, model and
                          request settings, not cut off); only the rest is called and paid for.
  --models <keys>         Subset of: ${CANDIDATES.map((c) => c.key).join(', ')}, reference.
  --cases <ids>           Subset of: ${CASES.map((c) => c.id).join(', ')}.
  --reference <model>     Add an OpenRouter model as a reference (key "reference").
  --reference-price <i,o> Its list price in USD per million tokens, for the estimate and the budget guard.
  --base-url <url>        Default $OPENROUTER_BASE_URL or ${DEFAULT_BASE_URL}.
  --out <dir>             Default not_to_github/eval/<date>/.
  --rejudge <file.json>   Grade the answers in an earlier results file (no OpenRouter calls).

Environment: OPENROUTER_API_KEY (required unless --dry-run or --rejudge).`;

// ── The run ─────────────────────────────────────────────────

export interface EvalRecord {
  meta: {
    startedAt: string;
    finishedAt?: string;
    baseUrlHost: string;
    settings: RunSettings & { maxUsd: number; concurrency: number; timeoutSec: number };
    judgeModel: string | null;
    spentUsd: number;
    stopReason?: string;
  };
  candidates: Candidate[];
  cases: Array<{
    id: string;
    kind: string;
    moduleId: string;
    moduleLabel: string;
    areaId: string;
    thinking: string;
    outputFormats: string[];
    personas: string[];
    skills: string[];
    layers: string[];
    outputLanguage?: string;
    rubric: string[];
    systemPromptSha256: string;
    systemPromptChars: number;
    inputTokensEstimate: number;
    systemPrompt: string;
    userContent: string;
  }>;
  results: RunResult[];
}

export interface EvalDeps {
  fetchImpl?: typeof fetch;
  judge?: JudgeFn;
  log?: (line: string) => void;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
  apiKey?: string;
}

export interface EvalOutcome {
  exitCode: number;
  record?: EvalRecord;
  files?: { markdown: string; json: string };
}

function localDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function localStamp(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`;
}
export function usd(n: number | null | undefined): string {
  return n === null || n === undefined ? 'n/a' : `$${n.toFixed(4)}`;
}
function secs(ms: number | undefined): string {
  return ms === undefined ? '-' : `${(ms / 1000).toFixed(1)} s`;
}
function int(n: number | undefined): string {
  return n === undefined ? '-' : n.toLocaleString('en-US');
}
function mean(xs: number[]): number | undefined {
  return xs.length > 0 ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined;
}
function hostOf(url: string): string {
  try { return new URL(url).host; } catch { return url; }
}
function mdTable(head: string[], rows: string[][]): string {
  const esc = (s: string): string => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
  return [
    `| ${head.map(esc).join(' | ')} |`,
    `| ${head.map(() => '---').join(' | ')} |`,
    ...rows.map((r) => `| ${r.map(esc).join(' | ')} |`),
  ].join('\n');
}

export function selectCandidates(opts: Pick<EvalOptions, 'models' | 'reference' | 'referencePrice'>): Candidate[] {
  const all: Candidate[] = [...CANDIDATES];
  if (opts.reference) {
    all.push({
      key: 'reference',
      label: `Reference: ${opts.reference}`,
      model: opts.reference,
      // The run's --effort, like the candidates. With no reasoning field Claude 5
      // reasoned at full depth: 8-16k reasoning tokens of a 16k allowance, every
      // answer cut off, $0.19 a call (live run, 2026-09-25).
      reasoning: { mandatory: false, efforts: ['low', 'medium', 'high'] },
      ...(opts.referencePrice ? { pricePerM: opts.referencePrice } : {}),
    });
  }
  if (!opts.models) return all;
  const picked = opts.models.map((k) => {
    const c = all.find((x) => x.key === k);
    if (!c) throw new Error(`Unknown model key "${k}" (known: ${all.map((x) => x.key).join(', ')}${opts.reference ? '' : '; "reference" needs --reference'})`);
    return c;
  });
  return picked;
}

export function selectCases(ids: string[] | null): EvalCase[] {
  if (!ids) return [...CASES];
  return ids.map((id) => {
    const c = CASES.find((x) => x.id === id);
    if (!c) throw new Error(`Unknown case "${id}" (known: ${CASES.map((x) => x.id).join(', ')})`);
    return c;
  });
}

function recordCase(p: PreparedCase): EvalRecord['cases'][number] {
  return {
    id: p.case.id,
    kind: p.case.kind,
    moduleId: p.case.moduleId,
    moduleLabel: p.moduleLabel,
    areaId: p.areaId,
    thinking: p.thinking,
    outputFormats: p.outputFormats,
    personas: p.personas,
    skills: p.skills,
    layers: p.layers,
    outputLanguage: p.case.outputLanguage,
    rubric: p.case.rubric,
    systemPromptSha256: p.systemPromptSha256,
    systemPromptChars: p.systemPrompt.length,
    inputTokensEstimate: p.inputTokens,
    systemPrompt: p.systemPrompt,
    userContent: p.userContent,
  };
}

function planText(prepared: PreparedCase[], candidates: Candidate[], opts: EvalOptions, hasKey: boolean): string {
  const settings: RunSettings = { effort: opts.effort, maxTokens: opts.maxTokens, temperature: opts.temperature };
  const out: string[] = [];
  out.push(`OpenRouter showcase eval: ${prepared.length} module(s) x ${candidates.length} model(s) = ${prepared.length * candidates.length} call(s)`);
  out.push(`Endpoint: ${hostOf(opts.baseUrl)} · effort ${opts.effort} · max_tokens ${opts.maxTokens} · temperature ${opts.temperature} · --max-usd ${opts.maxUsd.toFixed(2)} · concurrency ${opts.concurrency}`);
  out.push(`OPENROUTER_API_KEY: ${hasKey ? 'set' : 'not set'} · judge: ${opts.judge ? opts.judgeModel : 'off'}`);
  out.push('');
  out.push('Models:');
  for (const c of candidates) {
    const reasoning = c.reasoning ? `reasoning ${c.reasoning.mandatory ? 'mandatory' : 'optional'} (${c.reasoning.efforts.join('/')})` : 'no reasoning field sent';
    const price = c.pricePerM ? `$${c.pricePerM.input}/$${c.pricePerM.output} per 1M` : 'price unknown';
    out.push(`  ${c.key.padEnd(12)} ${c.model} · ${reasoning} · ${price}${c.extraBody ? ` · extra body ${JSON.stringify(c.extraBody)}` : ''}`);
  }
  out.push('');
  const head = ['Case', 'Module', 'Layers', 'Input tok', ...candidates.map((c) => `${c.key} expected / ceiling`)];
  const rows: string[][] = [];
  const totals = candidates.map(() => ({ expected: 0 as number | null, ceiling: 0 as number | null }));
  for (const p of prepared) {
    rows.push([
      p.case.id,
      `${p.case.moduleId} (${p.areaId})`,
      String(p.layers.length),
      int(p.inputTokens),
      ...candidates.map((c, i) => {
        const e = estimateCall(c, p, settings);
        const t = totals[i];
        t.expected = t.expected === null || e.expectedUsd === null ? null : t.expected + e.expectedUsd;
        t.ceiling = t.ceiling === null || e.ceilingUsd === null ? null : t.ceiling + e.ceilingUsd;
        return `${usd(e.expectedUsd)} / ${usd(e.ceilingUsd)}`;
      }),
    ]);
  }
  rows.push(['Total', '', '', '', ...totals.map((t) => `${usd(t.expected)} / ${usd(t.ceiling)}`)]);
  out.push(mdTable(head, rows));
  const known = totals.every((t) => t.expected !== null);
  const grand = totals.reduce((a, t) => a + (t.expected ?? 0), 0);
  const grandCeiling = totals.reduce((a, t) => a + (t.ceiling ?? 0), 0);
  out.push('');
  out.push(`Estimated spend: ${usd(grand)} expected, ${usd(grandCeiling)} if every call used its full max_tokens${known ? '' : ' (plus the models with no known price)'}.`);
  out.push('Estimates use list prices from the 2026-09-25 findings; a real run records what OpenRouter billed (usage.cost).');
  return out.join('\n');
}

function avgInt(xs: Array<number | undefined>): string {
  const m = mean(xs.filter((x): x is number => x !== undefined));
  return m === undefined ? '-' : int(Math.round(m));
}

function modelSummaryRows(record: EvalRecord): string[][] {
  return record.candidates.map((c) => {
    const rs = record.results.filter((r) => r.candidate === c.key);
    const ok = rs.filter((r) => r.status === 'ok');
    const ran = rs.filter((r) => r.status !== 'skipped');
    const judged = ok.map((r) => r.judge?.overall).filter((x): x is number => typeof x === 'number');
    const costKnown = ran.every((r) => r.costUsd !== null);
    return [
      c.key,
      c.model,
      `${ok.length}/${rs.length}`,
      String(rs.filter((r) => r.status === 'error').length),
      String(rs.filter((r) => r.truncated).length),
      secs(mean(ok.map((r) => r.latencyMs).filter((x): x is number => x !== undefined))),
      secs(mean(ok.map((r) => r.firstContentMs).filter((x): x is number => x !== undefined))),
      avgInt(ok.map((r) => r.usage.completionTokens)),
      avgInt(ok.map((r) => r.usage.reasoningTokens)),
      `${usd(ran.reduce((a, r) => a + (r.costUsd ?? 0), 0))}${costKnown ? '' : ' +?'}`,
      judged.length > 0 ? (mean(judged) as number).toFixed(2) : '-',
    ];
  });
}

export function renderMarkdown(record: EvalRecord): string {
  const s = record.meta.settings;
  const ran = record.results.filter((r) => r.status !== 'skipped');
  const lines: string[] = [];
  const started = new Date(record.meta.startedAt);
  lines.push(`# OpenRouter showcase model eval (${localDate(started)} ${String(started.getHours()).padStart(2, '0')}:${String(started.getMinutes()).padStart(2, '0')})`);
  lines.push('');
  lines.push(`Endpoint ${record.meta.baseUrlHost} · effort \`${s.effort}\` · max_tokens ${s.maxTokens} · temperature ${s.temperature} · --max-usd ${s.maxUsd.toFixed(2)}`);
  lines.push(`Spent: ${usd(record.meta.spentUsd)} over ${ran.length} call(s); ${record.results.length - ran.length} skipped; ${record.results.filter((r) => r.status === 'error').length} error(s).`);
  lines.push(`Judge: ${record.meta.judgeModel ? `${record.meta.judgeModel} (blind to the model)` : 'off'}.`);
  if (record.meta.stopReason) lines.push(`Stopped early: ${record.meta.stopReason}.`);
  lines.push('');
  lines.push('## Models');
  lines.push('');
  lines.push(mdTable(
    ['Key', 'Model', 'OK', 'Errors', 'Cut off', 'Avg latency', 'Avg first text', 'Avg output tok', 'Avg reasoning tok', 'Cost', 'Avg judge (1-5)'],
    modelSummaryRows(record),
  ));
  lines.push('');
  for (const c of record.candidates) {
    lines.push(`- **${c.key}**: ${c.label}${c.extraBody ? ` · extra body \`${JSON.stringify(c.extraBody)}\`` : ''}`);
  }
  lines.push('');
  lines.push('## Runs');
  lines.push('');
  lines.push(mdTable(
    ['Case', 'Model', 'Status', 'finish', 'Latency', 'First text', 'In tok', 'Out tok', 'Reasoning tok', 'Cost', 'Served by', 'Judge'],
    record.results.map((r) => [
      r.caseId,
      r.candidate,
      r.status === 'skipped' ? 'skipped' : r.status,
      r.finishReason ?? '-',
      secs(r.latencyMs),
      secs(r.firstContentMs),
      int(r.usage.promptTokens),
      int(r.usage.completionTokens),
      int(r.usage.reasoningTokens),
      `${usd(r.costUsd)}${r.costSource === 'estimated' ? ' (est.)' : ''}`,
      r.provider ?? '-',
      typeof r.judge?.overall === 'number' ? r.judge.overall.toFixed(1) : r.judge?.error ? 'error' : '-',
    ]),
  ));
  const problems = record.results.filter((r) => r.status !== 'ok' || r.warnings.length > 0 || r.judge?.error);
  if (problems.length > 0) {
    lines.push('');
    lines.push('## Errors, warnings and skipped calls');
    lines.push('');
    for (const r of problems) {
      const bits = [r.skipReason, r.error, ...r.warnings, r.judge?.error ? `judge: ${r.judge.error}` : undefined].filter(Boolean);
      lines.push(`- ${r.caseId} x ${r.candidate}: ${bits.join('; ')}`);
    }
  }
  lines.push('');
  lines.push('## Answers');
  for (const c of record.cases) {
    lines.push('');
    lines.push(`### ${c.id}: ${c.moduleLabel} (${c.kind})`);
    lines.push('');
    lines.push(`Module \`${c.moduleId}\` in \`${c.areaId}\` · formats ${c.outputFormats.join(', ') || 'none'} · persona ${c.personas.join(', ')} · system prompt ${int(c.systemPromptChars)} chars (sha256 ${c.systemPromptSha256.slice(0, 12)})`);
    for (const r of record.results.filter((x) => x.caseId === c.id && x.status !== 'skipped')) {
      const judge = typeof r.judge?.overall === 'number' ? `, judge ${r.judge.overall.toFixed(1)}` : '';
      lines.push('');
      lines.push(`<details><summary>${r.candidate}: ${r.status}, ${int(r.usage.completionTokens)} output tokens, ${secs(r.latencyMs)}${judge}</summary>`);
      lines.push('');
      if (r.error) lines.push(`**Error:** ${r.error}\n`);
      if (r.judge && r.judge.scores.length > 0) {
        lines.push(mdTable(['Criterion', 'Score', 'Note'], r.judge.scores.map((s) => [s.criterion, String(s.score), s.note ?? ''])));
        if (r.judge.summary) lines.push(`\nJudge: ${r.judge.summary}${r.judge.verdict ? ` (verdict: ${r.judge.verdict})` : ''}`);
        lines.push('');
      }
      lines.push(r.content || '_(no answer text)_');
      lines.push('');
      lines.push('</details>');
    }
  }
  lines.push('');
  lines.push('## What this run does not cover');
  lines.push('');
  lines.push('- One run per model and module on synthetic inputs: it shows fitness and cost, not variance.');
  lines.push('- The system prompt is the composer\'s output with the module defaults. Layers that need the database are absent: knowledge packs, organisation context, goals and values, project and resume context, and memory atoms (off in demo mode anyway).');
  lines.push('- The request goes straight to OpenRouter, not through ANTON\'s compat adapter; the reasoning setting shown above is this script\'s, not the adapter\'s.');
  lines.push('- Costs are what OpenRouter reported in usage.cost; "(est.)" marks a list-price estimate where none was reported.');
  lines.push('');
  return lines.join('\n');
}

function writeRecord(record: EvalRecord, files: { markdown: string; json: string }): void {
  fs.writeFileSync(files.json, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  fs.writeFileSync(files.markdown, renderMarkdown(record), 'utf8');
}

async function judgeResults(record: EvalRecord, judge: JudgeFn, model: string, log: (l: string) => void, save: () => void): Promise<void> {
  const byCase = new Map(record.cases.map((c) => [c.id, c] as const));
  const todo = record.results.filter((r) => r.status === 'ok' && r.content.trim());
  let i = 0;
  for (const r of todo) {
    i += 1;
    const c = byCase.get(r.caseId);
    if (!c) continue;
    const prompt = buildJudgePrompt(
      { moduleLabel: c.moduleLabel, userContent: c.userContent, case: { moduleId: c.moduleId, rubric: c.rubric, outputLanguage: c.outputLanguage } },
      r.content,
      r.finishReason,
    );
    try {
      r.judge = parseJudgeReply(model, await judge({ model, ...prompt }));
    } catch (err) {
      r.judge = { model, scores: [], overall: null, error: err instanceof Error ? err.message : String(err) };
    }
    log(`  judge [${i}/${todo.length}] ${r.caseId} x ${r.candidate}: ${typeof r.judge.overall === 'number' ? r.judge.overall.toFixed(1) : `error: ${r.judge.error}`}`);
    save();
  }
}

export async function runEval(opts: EvalOptions, deps: EvalDeps = {}): Promise<EvalOutcome> {
  const log = deps.log ?? ((l: string) => console.log(l));
  const now = deps.now ?? (() => new Date());
  const judge = deps.judge ?? routerJudge;

  if (opts.help) {
    log(USAGE);
    return { exitCode: 0 };
  }

  // Grade an earlier run: no OpenRouter calls at all.
  if (opts.rejudge) {
    const record = JSON.parse(fs.readFileSync(opts.rejudge, 'utf8')) as EvalRecord;
    const stem = opts.rejudge.replace(/\.json$/i, '');
    const files = { json: `${stem}-judged.json`, markdown: `${stem}-judged.md` };
    record.meta.judgeModel = opts.judgeModel;
    await judgeResults(record, judge, opts.judgeModel, log, () => writeRecord(record, files));
    writeRecord(record, files);
    log(`Wrote ${files.markdown}`);
    return { exitCode: 0, record, files };
  }

  const candidates = selectCandidates(opts);
  const cases = selectCases(opts.cases);
  const startedAt = now();
  const prepared: PreparedCase[] = [];
  for (const c of cases) prepared.push(await prepareCase(c, startedAt));

  const apiKey = deps.apiKey ?? process.env.OPENROUTER_API_KEY?.trim() ?? '';
  log(planText(prepared, candidates, opts, apiKey.length > 0));

  if (opts.dryRun) {
    log('\nDry run: no model was called and nothing was written.');
    return { exitCode: 0 };
  }
  if (!apiKey) {
    log('\nOPENROUTER_API_KEY is not set. Set it, or use --dry-run to see the plan.');
    return { exitCode: 2 };
  }

  const settings: RunSettings = { effort: opts.effort, maxTokens: opts.maxTokens, temperature: opts.temperature };
  const outDir = opts.outDir ?? path.join(REPO_ROOT, 'not_to_github', 'eval', localDate(startedAt));
  fs.mkdirSync(outDir, { recursive: true });
  const stem = path.join(outDir, `openrouter-eval-${localStamp(startedAt)}`);
  const files = { json: `${stem}.json`, markdown: `${stem}.md` };
  const record: EvalRecord = {
    meta: {
      startedAt: startedAt.toISOString(),
      baseUrlHost: hostOf(opts.baseUrl),
      settings: { ...settings, maxUsd: opts.maxUsd, concurrency: opts.concurrency, timeoutSec: opts.timeoutSec },
      judgeModel: opts.judge ? opts.judgeModel : null,
      spentUsd: 0,
    },
    candidates,
    cases: prepared.map(recordCase),
    results: [],
  };
  const save = (): void => writeRecord(record, files);

  // Interleave models per case, so a run cut short by the budget still compares them.
  const jobs = prepared.flatMap((p) => candidates.map((c) => ({
    p, c, body: buildRequestBody(c, p, settings), estimate: estimateCall(c, p, settings),
  })));
  const slots: Array<RunResult | undefined> = new Array(jobs.length);
  const cfg: CallConfig = {
    baseUrl: opts.baseUrl,
    apiKey,
    timeoutMs: opts.timeoutSec * 1000,
    fetchImpl: deps.fetchImpl ?? fetch,
    sleep: deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms))),
  };
  let spent = 0;
  let reserved = 0;
  let stopReason: string | undefined;
  let next = 0;
  let done = 0;
  let warnedUnpriced = false;

  const shell = (p: PreparedCase, c: Candidate, body: Record<string, unknown>): Pick<RunResult, 'caseId' | 'moduleId' | 'candidate' | 'model' | 'request'> => {
    const reasoning = asRecord(body.reasoning);
    return {
      caseId: p.case.id,
      moduleId: p.case.moduleId,
      candidate: c.key,
      model: c.model,
      request: {
        maxTokens: Number(body.max_tokens),
        temperature: settings.temperature,
        ...(reasoning ? { reasoning } : {}),
        ...(body.provider !== undefined ? { provider: body.provider } : {}),
      },
    };
  };
  // --resume: an earlier answer to the very same request, finished (not cut off),
  // is reused. Its cost was paid in that run, so it does not count against this
  // run's --max-usd.
  if (opts.resume) {
    const earlier = JSON.parse(fs.readFileSync(opts.resume, 'utf8')) as EvalRecord;
    const same = (a: unknown, b: unknown): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
    let reused = 0;
    jobs.forEach(({ p, c, body }, i) => {
      const want = shell(p, c, body);
      const prior = earlier.results.find((r) => r.caseId === want.caseId && r.candidate === want.candidate && r.model === want.model
        && r.status === 'ok' && r.finishReason !== 'length' && !r.truncated
        && same(r.request.reasoning, want.request.reasoning) && same(r.request.provider, want.request.provider)
        && r.request.maxTokens === want.request.maxTokens);
      if (prior) {
        slots[i] = { ...prior, judge: undefined, reusedFrom: path.basename(opts.resume!) };
        reused += 1;
      }
    });
    record.results = slots.filter((r): r is RunResult => r !== undefined);
    log(`Resuming: ${reused} of ${jobs.length} answer(s) reused from ${path.basename(opts.resume)}.`);
  }

  const skipped = (i: number, reason: string): void => {
    const { p, c, body } = jobs[i];
    slots[i] = { ...shell(p, c, body), status: 'skipped', skipReason: reason, warnings: [], content: '', reasoning: '', usage: {}, costUsd: null, costSource: 'none' };
  };

  const worker = async (): Promise<void> => {
    for (;;) {
      const i = next;
      next += 1;
      if (i >= jobs.length) return;
      if (slots[i]) continue;   // reused from an earlier run (--resume)
      const { p, c, body, estimate } = jobs[i];
      if (stopReason) { skipped(i, stopReason); continue; }
      if (spent + reserved >= opts.maxUsd) {
        skipped(i, `budget: ${usd(spent)} spent of --max-usd ${opts.maxUsd.toFixed(2)}`);
        continue;
      }
      const hold = estimate.ceilingUsd ?? 0;
      if (estimate.ceilingUsd !== null && spent + reserved + hold > opts.maxUsd) {
        skipped(i, `budget: this call could cost up to ${usd(hold)} and ${usd(opts.maxUsd - spent - reserved)} of --max-usd is left`);
        continue;
      }
      reserved += hold;
      let outcome: Awaited<ReturnType<typeof callOpenRouter>>;
      try {
        outcome = await callOpenRouter(body, cfg);
      } finally {
        reserved -= hold;
      }
      let costUsd: number | null = outcome.usage.costUsd ?? null;
      let costSource: RunResult['costSource'] = costUsd !== null ? 'reported' : 'none';
      if (costUsd === null && outcome.latencyMs !== undefined) {
        // Streamed (so possibly billed) but no cost reported: price the tokens, or the text, at list price.
        const inTok = outcome.usage.promptTokens ?? p.inputTokens;
        const outTok = outcome.usage.completionTokens ?? estimateTokens(outcome.content + outcome.reasoning);
        costUsd = priceUsd(c.pricePerM, inTok, outTok);
        costSource = costUsd !== null ? 'estimated' : 'unknown';
        if (costUsd === null && !warnedUnpriced) {
          warnedUnpriced = true;
          log(`  warning: ${c.key} reported no cost and has no known price, so --max-usd cannot see its spend`);
        }
      }
      spent += costUsd ?? 0;
      if (outcome.budgetRefused) stopReason = 'OpenRouter refused for budget (402)';
      const result: RunResult = { ...shell(p, c, body), ...outcome, costUsd, costSource };
      slots[i] = result;
      done += 1;
      record.meta.spentUsd = spent;
      record.results = slots.filter((r): r is RunResult => r !== undefined);
      save();
      const tail = result.status === 'ok'
        ? `ok ${secs(result.latencyMs)}, ${int(result.usage.completionTokens)} out (${int(result.usage.reasoningTokens)} reasoning), ${usd(result.costUsd)}, ${result.finishReason ?? 'no finish_reason'}`
        : `error: ${result.error}`;
      log(`[${done}] ${p.case.id} x ${c.key}: ${tail}`);
    }
  };

  log('');
  await Promise.all(Array.from({ length: Math.min(opts.concurrency, jobs.length) }, () => worker()));
  record.results = slots.filter((r): r is RunResult => r !== undefined);
  record.meta.spentUsd = spent;
  if (stopReason) record.meta.stopReason = stopReason;
  save();

  if (opts.judge) {
    log(`\nGrading with ${opts.judgeModel} ...`);
    await judgeResults(record, judge, opts.judgeModel, log, save);
  }
  record.meta.finishedAt = now().toISOString();
  save();

  log('');
  log(mdTable(
    ['Key', 'Model', 'OK', 'Errors', 'Cut off', 'Avg latency', 'Avg first text', 'Avg output tok', 'Avg reasoning tok', 'Cost', 'Avg judge'],
    modelSummaryRows(record),
  ));
  log(`\nSpent ${usd(spent)}. Report: ${files.markdown}`);
  const ran = record.results.filter((r) => r.status !== 'skipped');
  const exitCode = ran.length > 0 && ran.every((r) => r.status === 'error') ? 1 : 0;
  return { exitCode, record, files };
}

// ── CLI ─────────────────────────────────────────────────────

function isMain(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return path.resolve(fileURLToPath(import.meta.url)).toLowerCase() === path.resolve(entry).toLowerCase();
}

if (isMain()) {
  let opts: EvalOptions;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    console.error(USAGE);
    process.exit(2);
  }
  runEval(opts)
    .then((o) => process.exit(o.exitCode))
    .catch((err: unknown) => {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    });
}
