/**
 * gap-assessment-engine.ts
 * Orchestrates chunked Claude calls for structured compliance gap assessments.
 * Handles large frameworks (86 AMLR articles) by splitting into batches of 12-15.
 */

import type { DatabaseAdapter } from '../db/database.js';

import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import Anthropic from '@anthropic-ai/sdk';
import { callChat, mapModelToProvider } from './provider-router.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Model tier config ────────────────────────────────────────────────────────
// Supports Claude tiers + any custom model ID (Azure, Mistral, OpenAI, etc.)
export type GapModelTier = 'sonnet' | 'opus' | string;

function getModelConfig(tier: GapModelTier) {
  if (tier === 'opus') {
    return {
      model: 'claude-opus-4-8' as string,
      thinkingLevel: 'investigate' as string,
      maxTokensBatch: 16000,
      maxTokensSynthesis: 128_000,
    };
  }
  if (tier === 'sonnet') {
    return {
      model: 'claude-sonnet-4-6' as string,
      thinkingLevel: 'investigate' as string,
      maxTokensBatch: 40000,
      maxTokensSynthesis: 128_000,
    };
  }
  // Custom model ID (Azure, Mistral, OpenAI, etc.)
  return {
    model: tier,
    thinkingLevel: 'think_hard' as string,
    maxTokensBatch: 16384,
    maxTokensSynthesis: 64000,
  };
}

// callChat from provider-router replaces the old streamCollect helper.
// It handles Anthropic, Mistral, OpenAI, Gemini, and Ollama in a single call.

export interface FrameworkArticle {
  id: string;         // e.g. "Art.12"
  title: string;
  theme: string;      // grouping category
  requirement: string; // short description of what is required
}

export interface Framework {
  id: string;
  name: string;
  shortName: string;
  articleCount: number;
  themes: string[];
  articles: FrameworkArticle[];
}

export interface ArticleFinding {
  articleId: string;
  articleTitle: string;
  requirement: string;
  currentState: string;
  score: 'red' | 'amber' | 'yellow' | 'green';
  numericScore: number; // 0-100, 100 = fully compliant
  priority: 'critical' | 'high' | 'medium' | 'low';
  notes: string;
}

export interface AssessmentBatchResult {
  framework: string;
  findings: ArticleFinding[];
  batchIndex: number;
  totalBatches: number;
  thinking: string;
}

const BATCH_SIZE = 12;

// In-memory cache — frameworks are static JSON files; no need to re-read on every request
const frameworkCache = new Map<string, Framework>();

/** Strip markdown code fences then extract first JSON array or object.
 *  If the JSON is truncated (common with large outputs hitting max_tokens),
 *  attempt to repair by closing open brackets and recovering complete elements. */
function extractJson(text: string, type: 'array' | 'object'): string {
  const stripped = text.replace(/```(?:json)?\s*\n?([\s\S]*?)\n?```/g, '$1').trim();
  const opener = type === 'array' ? '[' : '{';
  const closer = type === 'array' ? ']' : '}';

  // Find the start of the JSON
  const startIdx = stripped.indexOf(opener);
  if (startIdx === -1) {
    // Fallback: check original text
    const fallbackIdx = text.indexOf(opener);
    if (fallbackIdx !== -1) return repairJson(text.slice(fallbackIdx), type);

    // Last resort: if looking for object but got array (or vice versa), try the other
    const altOpener = type === 'array' ? '{' : '[';
    const altIdx = stripped.indexOf(altOpener);
    if (altIdx !== -1) {
      console.warn(`[gap-engine] Expected JSON ${type} but found ${type === 'array' ? 'object' : 'array'} — adapting`);
      if (type === 'object' && stripped.indexOf('[') !== -1) {
        // Wrap array in an object
        return `{"items": ${extractJson(text, 'array')}}`;
      }
      return repairJson(stripped.slice(altIdx), type === 'array' ? 'object' : 'array');
    }

    // Log what we actually got
    console.error(`[gap-engine] No JSON ${type} found. Response starts with: ${stripped.slice(0, 300)}`);
    throw new Error(`No JSON ${type} found in Claude response`);
  }
  const raw = stripped.slice(startIdx);

  // Try parsing as-is first
  try { JSON.parse(raw); return raw; } catch { /* needs repair */ }

  // Strategy 1: Claude may add text after the JSON — find the matching closer
  const closerIdx = findMatchingCloser(raw, opener, closer);
  if (closerIdx > 0) {
    const exact = raw.slice(0, closerIdx + 1);
    try { JSON.parse(exact); return exact; } catch { /* fall through */ }
  }

  return repairJson(raw, type);
}

/** Find the position of the bracket/brace that closes the opening one at position 0 */
function findMatchingCloser(raw: string, opener: string, closer: string): number {
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === opener) depth++;
    if (ch === closer) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1; // No matching closer found (truncated)
}

/** Attempt to repair truncated JSON by finding the last complete element */
function repairJson(raw: string, type: 'array' | 'object'): string {
  // For arrays: find the last complete top-level object and close the array
  if (type === 'array') {
    // Strategy 1: Walk forward tracking depth precisely
    let depth = 0;
    let lastCompleteObj = -1;
    let inString = false;
    let escape = false;

    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i];
      if (escape) { escape = false; continue; }
      if (ch === '\\' && inString) { escape = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === '{') depth++;
      if (ch === '}') {
        depth--;
        if (depth === 1) lastCompleteObj = i; // depth 1 = just closed an object inside the array
      }
    }

    if (lastCompleteObj > 0) {
      const repaired = raw.slice(0, lastCompleteObj + 1) + '\n]';
      try {
        JSON.parse(repaired);
        console.log(`[gap-engine] JSON repair (forward): recovered ${repaired.length} chars (truncated at ${raw.length})`);
        return repaired;
      } catch { /* fall through */ }
    }

    // Strategy 2: Walk BACKWARDS from the end to find last "},\n" or "}\n" pattern
    // This is simpler and handles cases where forward scanning gets confused by string content
    for (let i = raw.length - 1; i > 100; i--) {
      if (raw[i] === '}') {
        // Check if adding ] makes valid JSON
        const candidate = raw.slice(0, i + 1);
        // Remove any trailing comma
        const cleaned = candidate.replace(/,\s*$/, '') + '\n]';
        try {
          JSON.parse(cleaned);
          console.log(`[gap-engine] JSON repair (backward): recovered ${cleaned.length} chars (truncated at ${raw.length})`);
          return cleaned;
        } catch { /* try next } */ }
      }
    }
  }

  // For objects: find last valid truncation point and close brackets
  if (type === 'object') {
    // Strategy 1: Backward scan — find last } that yields valid JSON when brackets are closed
    for (let i = raw.length - 1; i > 100; i--) {
      if (raw[i] === '}') {
        const candidate = raw.slice(0, i + 1);
        // Count open brackets/braces to close them
        let ob = 0, oq = 0, ins = false, esc = false;
        for (const ch of candidate) {
          if (esc) { esc = false; continue; }
          if (ch === '\\' && ins) { esc = true; continue; }
          if (ch === '"') { ins = !ins; continue; }
          if (ins) continue;
          if (ch === '{') ob++; if (ch === '}') ob--;
          if (ch === '[') oq++; if (ch === ']') oq--;
        }
        const closed = candidate + '}'.repeat(Math.max(0, ob)) + ']'.repeat(Math.max(0, oq));
        try {
          JSON.parse(closed);
          console.log(`[gap-engine] JSON object repair (backward): recovered ${closed.length} chars (truncated at ${raw.length})`);
          return closed;
        } catch { /* try next } */ }
      }
    }

    // Strategy 2: Brute force — trim trailing incomplete value, close open brackets
    let trimmed = raw.replace(/,\s*"[^"]*":\s*"[^"]*$/, ''); // remove last incomplete key-value
    trimmed = trimmed.replace(/,\s*$/, ''); // trailing comma
    let openBraces = 0, openBrackets = 0;
    let inString = false, escape = false;
    for (const ch of trimmed) {
      if (escape) { escape = false; continue; }
      if (ch === '\\' && inString) { escape = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === '{') openBraces++;
      if (ch === '}') openBraces--;
      if (ch === '[') openBrackets++;
      if (ch === ']') openBrackets--;
    }
    trimmed += '}'.repeat(Math.max(0, openBraces)) + ']'.repeat(Math.max(0, openBrackets));
    try {
      JSON.parse(trimmed);
      console.log(`[gap-engine] JSON repair (brute): recovered ${trimmed.length} chars`);
      return trimmed;
    } catch { /* give up */ }
  }

  // Last resort: log first and last 200 chars for debugging
  console.error(`[gap-engine] JSON repair failed. First 200: ${raw.slice(0, 200)}`);
  console.error(`[gap-engine] Last 200: ${raw.slice(-200)}`);
  throw new Error(`Failed to parse or repair JSON ${type} from Claude response (${raw.length} chars)`);
}

function loadFramework(frameworkId: string): Framework | null {
  if (frameworkCache.has(frameworkId)) return frameworkCache.get(frameworkId)!;
  try {
    const frameworkDir = path.join(__dirname, '..', '..', 'data', 'frameworks');
    const filePath = path.join(frameworkDir, `${frameworkId}.json`);
    if (!fs.existsSync(filePath)) return null;
    const fw = fs.readJsonSync(filePath) as Framework;
    frameworkCache.set(frameworkId, fw);
    return fw;
  } catch (err) {
    console.error(`[gap-engine] Failed to load framework ${frameworkId}:`, err);
    return null;
  }
}

export function listAvailableFrameworks(): Omit<Framework, 'articles'>[] {
  try {
    const frameworkDir = path.join(__dirname, '..', '..', 'data', 'frameworks');
    if (!fs.existsSync(frameworkDir)) return [];
    const files = fs.readdirSync(frameworkDir).filter(f => f.endsWith('.json'));
    return files.map(f => {
      const fw = fs.readJsonSync(path.join(frameworkDir, f)) as Framework;
      const { articles: _articles, ...meta } = fw;
      return meta;
    });
  } catch {
    return [];
  }
}

export function getFramework(id: string): Framework | null {
  return loadFramework(id);
}

function buildAssessmentSystemPrompt(context: {
  entityType: string;
  jurisdiction: string;
  segments: string;
  maturity: number;
  concerns: string;
}, hasEvidence: boolean): string {
  const groundingRules = hasEvidence
    ? `Grounding rules for "currentState":
- Describe THIS entity's ACTUAL current state, grounded in the evidence documents and interview notes provided with this assessment. Reference the specific document or interview you are drawing on.
- If the provided evidence does not cover an article, that article's "currentState" MUST begin with exactly: "No evidence provided — based on stated maturity level:" and may then describe what an entity at the stated maturity level (${context.maturity}/5) would typically have in place (or lack).
- Never present an assumed or archetype state as if it had been observed at this entity.`
    : `Grounding rules for "currentState":
- No evidence documents were provided for this assessment, so every article's "currentState" MUST begin with exactly: "No evidence provided — based on stated maturity level:" followed by what an entity at the stated maturity level (${context.maturity}/5) would typically have in place (or lack).
- Never present an assumed or archetype state as if it had been observed at this entity.`;

  return `You are a senior AML/CFT compliance specialist conducting a structured gap assessment.

Entity: ${context.entityType}
Jurisdiction(s): ${context.jurisdiction}
Customer segments: ${context.segments}
Current AML maturity (self-rated): ${context.maturity}/5
Known concerns: ${context.concerns || 'None specified'}

Your task is to assess the entity's compliance with the articles listed below. For each article, provide a structured JSON assessment.

${groundingRules}

Scoring legend:
- "green": Article requirements are substantially met. Controls are documented, tested, and effective.
- "yellow": Work in progress. Partial implementation, documented plans, or minor gaps.
- "amber": Partially met. Significant gaps exist but some elements are in place.
- "red": Not met. Missing, ineffective, or absent controls for this requirement.

Priority legend:
- "critical": Regulatory enforcement risk within 6 months if not addressed.
- "high": Must be addressed in next 12 months.
- "medium": Address within 18-24 months.
- "low": Best practice improvement, not enforcement-critical.

Respond ONLY with a valid JSON array. No preamble, no explanation outside the JSON.`;
}

function buildBatchUserMessage(articles: FrameworkArticle[], framework: Framework, hasEvidence: boolean): string {
  const articleList = articles.map(a =>
    `{"id":"${a.id}","title":"${a.title}","requirement":"${a.requirement.replace(/"/g, "'")}"}`
  ).join(',\n');

  const currentStateInstruction = hasEvidence
    ? "2-3 sentence description of THIS entity's actual current state, grounded in the evidence documents and interview notes provided (name the document/interview). If no provided evidence covers this article, begin with exactly 'No evidence provided — based on stated maturity level:' and then describe what an entity at the stated maturity level would typically have in place (or lack)"
    : "2-3 sentence description beginning with exactly 'No evidence provided — based on stated maturity level:' followed by what an entity at the stated maturity level would typically have in place (or lack) for this article";

  return `Assess the following ${framework.shortName} articles for the entity described.

Articles to assess:
[${articleList}]

Return a JSON array with one object per article:
[
  {
    "articleId": "Art.XX",
    "articleTitle": "Article title",
    "requirement": "Brief restatement of the core requirement",
    "currentState": "${currentStateInstruction}",
    "score": "red|amber|yellow|green",
    "numericScore": 0-100,
    "priority": "critical|high|medium|low",
    "notes": "Specific implementation gaps or recommendations for this article"
  }
]

numericScore guide: 0-24 = Red (non-compliant/no controls), 25-49 = Amber (major gaps), 50-74 = Yellow (partial compliance, improvements needed), 75-100 = Green (compliant/minor improvements). Be precise — use the full range, not just 0/25/50/75/100.`;
}

export async function runAssessmentBatch(
  anthropic: Anthropic,
  frameworkId: string,
  articleBatch: FrameworkArticle[],
  contextConfig: Record<string, unknown>,
  batchIndex: number,
  totalBatches: number,
  extraSystemContext?: string,
  modelTier: GapModelTier = 'sonnet',
  db?: DatabaseAdapter
): Promise<AssessmentBatchResult> {
  const framework = loadFramework(frameworkId);
  if (!framework) throw new Error(`Framework ${frameworkId} not found`);

  // Sanitize user-supplied strings: strip control characters, limit length
  const sanitize = (v: unknown, max = 500) =>
    String(v || '').replace(/[\x00-\x1F\x7F]/g, ' ').slice(0, max);

  const context = {
    entityType: sanitize(contextConfig.entityType || 'Credit institution', 200),
    jurisdiction: sanitize(contextConfig.jurisdiction || 'EU', 200),
    segments: sanitize(contextConfig.segments || 'Retail, SME', 300),
    maturity: Math.min(5, Math.max(1, Number(contextConfig.maturity || 3))),
    concerns: sanitize(contextConfig.concerns || '', 1000),
  };

  // Evidence documents and interview notes (already extracted and concatenated on the client)
  const evidenceText = typeof contextConfig.documents === 'string' && contextConfig.documents.trim()
    ? contextConfig.documents.slice(0, 120_000)  // Cap at ~120k chars to stay within context
    : '';

  const hasEvidence = evidenceText.length > 0;
  const baseSystem = buildAssessmentSystemPrompt(context, hasEvidence);
  const evidenceSection = hasEvidence
    ? `\n\n## EVIDENCE DOCUMENTS & INTERVIEW NOTES\nThe following evidence was provided by the assessor. Use this to produce SPECIFIC, evidence-based findings about THIS entity rather than generic assessments. Quote or reference specific documents/interviews where applicable. Where the evidence does not cover an article, say so explicitly per the grounding rules above.\n\n${evidenceText}`
    : '';
  const systemPrompt = [extraSystemContext?.trim(), baseSystem, evidenceSection].filter(Boolean).join('\n\n---\n\n');

  const mc = getModelConfig(modelTier);
  // For custom model IDs (azure:*, gpt-*, mistral-*), use directly; for Claude tiers, map via provider
  const isCustomModel = modelTier !== 'sonnet' && modelTier !== 'opus';
  const result = await callChat({
    model: isCustomModel ? mc.model : mapModelToProvider(mc.model),
    system: systemPrompt,
    messages: [{ role: 'user', content: buildBatchUserMessage(articleBatch, framework, hasEvidence) }],
    maxTokens: mc.maxTokensBatch,
    thinkingLevel: mc.thinkingLevel,
    db,
  });

  const findings = JSON.parse(extractJson(result.text, 'array')) as ArticleFinding[];

  return { framework: frameworkId, findings, batchIndex, totalBatches, thinking: result.thinking || '' };
}

export async function synthesiseCapabilityView(
  anthropic: Anthropic,
  allFindings: Record<string, ArticleFinding[]>,
  contextConfig: Record<string, unknown>,
  modelTier: GapModelTier = 'sonnet',
  db?: DatabaseAdapter
): Promise<{ json: string; reasoning: string }> {
  const findingsSummary = Object.entries(allFindings).map(([fw, findings]) => {
    const summary = findings.map(f => `${f.articleId}: ${f.score} (${f.priority}) — ${f.notes}`).join('\n');
    return `### Framework: ${fw}\n${summary}`;
  }).join('\n\n');

  const totalFindings = Object.values(allFindings).flat().length;
  const redCount = Object.values(allFindings).flat().filter(f => f.score === 'red').length;
  const criticalCount = Object.values(allFindings).flat().filter(f => f.priority === 'critical').length;

  const mc = getModelConfig(modelTier);
  const isCustomModel = modelTier !== 'sonnet' && modelTier !== 'opus';
  const result = await callChat({
    model: isCustomModel ? mc.model : mapModelToProvider(mc.model),
    maxTokens: mc.maxTokensSynthesis,
    thinkingLevel: mc.thinkingLevel,
    db,
    system: `You are a senior compliance transformation advisor with 20+ years of experience in AML/CFT regulatory implementation across Nordic and European financial institutions.

Synthesise the article-level gap findings below into 8-12 cross-cutting capability themes. Each theme spans one or more regulatory articles and reflects a real organisational capability (not just a regulation grouping).

Entity: ${String(contextConfig.entityType || 'Credit institution')}, ${String(contextConfig.jurisdiction || 'EU')}
Total findings: ${totalFindings} | Red: ${redCount} | Critical: ${criticalCount}

QUALITY REQUIREMENTS:
- Each capability should be a genuine organisational function (e.g. "Transaction Monitoring Effectiveness" not "Articles 12-15")
- Maturity scores must be evidence-based — cite specific article findings that justify the score
- Where the underlying article findings are marked "No evidence provided — based on stated maturity level", carry that caveat through: do not present assumed states as observed facts about this entity
- Key gaps should be specific and actionable, not generic platitudes
- Quick wins must be genuinely achievable in <3 months with minimal investment
- Cross-regulatory impact should flag where the same organisational weakness creates risk under multiple frameworks

For EACH capability theme, provide DETAILED narrative text (2-4 paragraphs each) for all the following fields. These must be substantive, specific to the entity's situation, and reference concrete regulatory articles:

1. "regulatoryRequirement" — What does the regulation require? Cite specific articles and explain what obligations apply to this entity type.
2. "gapAnalysis" — What is the specific gap between current state and regulatory expectation? Be concrete and evidence-based.
3. "importanceToClose" — Why is closing this gap important? What are the regulatory, operational, and reputational risks if not addressed?
4. "strengths" — What is the entity already doing well in this area? What existing capabilities can be leveraged?
5. "areasToImprove" — What specific weaknesses need to be addressed? Be actionable and prioritised.
6. "goodOutcome" — What does success look like? Describe the target state when this capability is fully mature.
7. "designActions" — What needs to happen in the DESIGN phase? (Policies, frameworks, governance structures, vendor selection, architecture decisions)
8. "implementationActions" — What needs to happen in the IMPLEMENTATION phase? (Build, configure, deploy, train, operationalise)
9. "testingVerification" — What needs to happen in TESTING & VERIFICATION? (UAT, parallel runs, audit trails, regulatory validation, ongoing monitoring)

Return a JSON array of capability themes:
[
  {
    "id": "cust-identification",
    "name": "Customer Identification & Verification",
    "description": "Ability to identify, verify, and document customer identity at onboarding and on an ongoing basis",
    "maturityScore": 1-5,
    "gapSeverity": "critical|high|medium|low",
    "affectedArticles": ["Art.12","Art.13"],
    "frameworks": ["amlr-2024"],
    "keyGaps": ["Gap 1", "Gap 2"],
    "quickWins": ["Action that can be done in <3 months"],
    "crossRegImpact": "Note if same gap affects multiple frameworks",
    "regulatoryRequirement": "Detailed text about what the regulation requires...",
    "gapAnalysis": "Detailed text about the current gaps...",
    "importanceToClose": "Detailed text about why this matters...",
    "strengths": "Detailed text about what is already working well...",
    "areasToImprove": "Detailed text about specific weaknesses...",
    "goodOutcome": "Detailed text describing the target state...",
    "designActions": "Detailed text about design phase actions...",
    "implementationActions": "Detailed text about implementation phase actions...",
    "testingVerification": "Detailed text about testing and verification actions..."
  }
]`,
    messages: [{ role: 'user', content: `Article-level findings to synthesise:\n\n${findingsSummary}` }],
  });

  return { json: extractJson(result.text, 'array'), reasoning: result.thinking };
}

export async function generateBoardSummary(
  anthropic: Anthropic,
  capabilityView: string,
  allFindings: Record<string, ArticleFinding[]>,
  contextConfig: Record<string, unknown>,
  modelTier: GapModelTier = 'sonnet',
  db?: DatabaseAdapter
): Promise<{ summary: string; reasoning: string }> {
  const allFlat = Object.values(allFindings).flat();
  const redCount = allFlat.filter(f => f.score === 'red').length;
  const amberCount = allFlat.filter(f => f.score === 'amber').length;
  const yellowCount = allFlat.filter(f => f.score === 'yellow').length;
  const greenCount = allFlat.filter(f => f.score === 'green').length;
  const criticalCount = allFlat.filter(f => f.priority === 'critical').length;
  const highCount = allFlat.filter(f => f.priority === 'high').length;

  // Collect top 15 critical/high findings with full notes for context
  const topFindings = Object.entries(allFindings).flatMap(([fw, findings]) =>
    findings.filter(f => f.priority === 'critical' || f.priority === 'high')
      .map(f => ({ ...f, framework: fw }))
  ).slice(0, 15);

  const topFindingsText = topFindings.map(f =>
    `- **${f.framework} ${f.articleId}** (${f.articleTitle}) [${f.score.toUpperCase()} / ${f.priority.toUpperCase()}]\n  Current state: ${f.currentState}\n  Notes: ${f.notes}`
  ).join('\n');

  const frameworkNames = Object.keys(allFindings).join(', ');

  const mcBoard = getModelConfig(modelTier);
  const isCustomModel = modelTier !== 'sonnet' && modelTier !== 'opus';
  const result = await callChat({
    model: isCustomModel ? mcBoard.model : mapModelToProvider(mcBoard.model),
    maxTokens: mcBoard.maxTokensSynthesis,
    thinkingLevel: mcBoard.thinkingLevel,
    db,
    system: `You are a senior compliance advisor with deep experience presenting to boards of Nordic and European financial institutions. Draft a comprehensive board briefing that is decision-ready. Use plain language. No jargon. Every sentence must be decision-relevant.

Truthfulness rule: where the underlying findings are marked "No evidence provided — based on stated maturity level", make clear to the board that those points reflect the stated maturity level rather than reviewed evidence — never present them as observed facts about this institution.

Structure:
## Compliance Gap Assessment — Board Summary
**Entity:** [entity type] | **Date:** ${new Date().toISOString().slice(0, 10)} | **Frameworks assessed:** ${frameworkNames}

### Overall Compliance Posture
[2-3 paragraph executive overview: overall risk level, comparison to regulatory expectations, and urgency assessment. Include estimated financial exposure range if enforcement action were taken (consider typical FI fines in the jurisdiction).]

### What's Working
- [3-5 positives — concrete, specific, citing evidence]

### What Needs Board Attention
For each of the top 5-7 issues:
**Issue [N]: [Title]** (Priority: CRITICAL/HIGH)
> [3-4 sentences: what the gap is, why it matters to the board, estimated financial/reputational risk if unaddressed, and regulatory timeline pressure]

### Peer Comparison Context
[Brief note on how similar institutions in the jurisdiction/sector typically score on these dimensions. Flag areas where the entity is behind peer norms.]

### Regulatory Timeline Pressure
| Regulatory Milestone | Date | Risk If Not Compliant |
|---|---|---|
| [e.g. AMLR application date] | [date] | [specific consequence: supervisory measures, fines range, licence conditions] |

### Decisions the Board Must Make
1. [Specific ask — budget quantum, policy approval, organisational change, or strategic direction]
2. [...]
3. [...]

### Estimated Remediation Investment
| Category | Estimated Range | Timing |
|---|---|---|
| Personnel / FTE | [range] | [when needed] |
| Technology / Systems | [range] | [when needed] |
| External Advisory | [range] | [when needed] |
| Training Programme | [range] | [when needed] |

### Governance Implications
[Note any governance structure changes needed: new committees, reporting lines, MLRO mandate expansion, board training requirements]

### Next Steps
[Detailed 3-phase project plan reference with approximate dates and key milestones]`,
    messages: [{
      role: 'user',
      content: `Generate a comprehensive board summary.

Assessment scores: ${redCount} Red | ${amberCount} Amber | ${yellowCount} Yellow | ${greenCount} Green
Priority breakdown: ${criticalCount} Critical | ${highCount} High | ${allFlat.length - criticalCount - highCount} Medium/Low
Total findings: ${allFlat.length} across ${Object.keys(allFindings).length} framework(s)
Entity: ${String(contextConfig.entityType || 'Credit institution')}, ${String(contextConfig.jurisdiction || 'EU')}
Customer segments: ${String(contextConfig.segments || 'Not specified')}
Current maturity: ${String(contextConfig.maturity || '3')}/5
Known concerns: ${String(contextConfig.concerns || 'None specified')}

### Top Critical/High Findings (${topFindings.length}):
${topFindingsText}

### Capability view:
${capabilityView}`,
    }],
  });

  return { summary: result.text, reasoning: result.thinking };
}

export async function generateRoadmap(
  anthropic: Anthropic,
  capabilityView: string,
  allFindings: Record<string, ArticleFinding[]>,
  contextConfig: Record<string, unknown>,
  modelTier: GapModelTier = 'sonnet',
  db?: DatabaseAdapter
): Promise<{ json: string; reasoning: string }> {
  const criticalFindings = Object.entries(allFindings).flatMap(([fw, findings]) =>
    findings.filter(f => f.priority === 'critical' || f.priority === 'high')
      .map(f => ({ ...f, framework: fw }))
  );

  const criticalFindingsText = criticalFindings.map(f =>
    `- ${f.framework} ${f.articleId} (${f.articleTitle}) [${f.score}/${f.priority}]: ${f.currentState} — ${f.notes}`
  ).join('\n');

  const mcRoad = getModelConfig(modelTier);
  const isCustomModel = modelTier !== 'sonnet' && modelTier !== 'opus';
  const result = await callChat({
    model: isCustomModel ? mcRoad.model : mapModelToProvider(mcRoad.model),
    maxTokens: mcRoad.maxTokensSynthesis,
    thinkingLevel: mcRoad.thinkingLevel,
    db,
    system: `You are a compliance transformation programme manager with extensive experience delivering AML/CFT remediation programmes for Nordic and European financial institutions. Build a detailed, phased remediation roadmap.

Return a JSON object:
{
  "phases": [
    {
      "id": "phase-1",
      "name": "Quick Wins & Critical Remediation",
      "timeframe": "0-3 months",
      "objective": "Detailed phase objective explaining what will be achieved and why this sequencing",
      "items": [
        {
          "id": "item-001",
          "title": "...",
          "description": "Detailed description of what needs to be done",
          "rationale": "Why this item is prioritised in this phase — regulatory pressure, risk reduction, dependency",
          "framework": "amlr-2024",
          "articleIds": ["Art.12"],
          "owner": "MLRO / Compliance",
          "effort": "S|M|L|XL",
          "priority": "critical|high|medium|low",
          "dependencies": [],
          "verificationCriteria": "How to confirm completion",
          "regulatoryDeadline": "Relevant regulatory deadline if applicable, or null",
          "riskIfDelayed": "Specific consequence of delaying this item",
          "resourceRequirements": "FTE count, skills needed, external support",
          "successMetrics": "Measurable KPIs to track progress"
        }
      ]
    },
    {
      "id": "phase-2",
      "name": "Structural Changes & Policy Overhaul",
      "timeframe": "3-12 months",
      "objective": "...",
      "items": [...]
    },
    {
      "id": "phase-3",
      "name": "Optimisation & Embedding",
      "timeframe": "12-24 months",
      "objective": "...",
      "items": [...]
    }
  ],
  "criticalPath": ["item-001", "item-003"],
  "totalItems": 0,
  "estimatedFTE": "Detailed FTE breakdown by phase and skill type",
  "estimatedBudget": "Total estimated budget range with breakdown by category",
  "keyRisks": ["Risk 1 if delayed", "Risk 2"],
  "governanceModel": "Recommended governance structure for the remediation programme",
  "reportingCadence": "Recommended reporting frequency to board/ExCo"
}

QUALITY REQUIREMENTS:
- Every item must have a clear rationale explaining why it is in that specific phase
- Dependencies should be realistic and reflect actual implementation constraints
- Resource requirements should be specific enough for budget planning
- Success metrics must be measurable, not vague
- Risk-if-delayed should cite specific regulatory consequences where applicable`,
    messages: [{
      role: 'user',
      content: `Build a comprehensive remediation roadmap.

Entity: ${String(contextConfig.entityType || 'Credit institution')}, ${String(contextConfig.jurisdiction || 'EU')}
Customer segments: ${String(contextConfig.segments || 'Not specified')}
Current maturity: ${String(contextConfig.maturity || '3')}/5
Known concerns: ${String(contextConfig.concerns || 'None specified')}

Critical/High findings (${criticalFindings.length}):
${criticalFindingsText}

Capability gaps:
${capabilityView}`,
    }],
  });

  return { json: extractJson(result.text, 'object'), reasoning: result.thinking };
}

type AssessmentRow = { id: string; frameworks: string; scope_config: string; context_config: string; article_scores: string; capability_view: string | null; board_summary: string | null; roadmap: string | null; status: string };

export async function createGapAssessmentEngine(db: DatabaseAdapter) {
  async function getAssessment(id: string): Promise<AssessmentRow | undefined> {
    return await db.get('SELECT * FROM gap_assessments WHERE id = ?', id) as AssessmentRow | undefined;
  }

  async function getAssessmentForUser(id: string, userId: string): Promise<AssessmentRow | undefined> {
    return await db.get('SELECT * FROM gap_assessments WHERE id = ? AND user_id = ?', id, userId) as AssessmentRow | undefined;
  }

  async function saveFindings(assessmentId: string, framework: string, findings: ArticleFinding[]) {
    await db.transaction(async (txDb) => {
      for (const f of findings) {
        await txDb.run(
      `INSERT INTO gap_findings
       (assessment_id, framework, article_id, article_title, requirement, current_state, score, numeric_score, priority, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (assessment_id, framework, article_id) DO UPDATE SET
         article_title = EXCLUDED.article_title,
         requirement = EXCLUDED.requirement,
         current_state = EXCLUDED.current_state,
         score = EXCLUDED.score,
         numeric_score = EXCLUDED.numeric_score,
         priority = EXCLUDED.priority,
         notes = EXCLUDED.notes`
    , assessmentId, framework, f.articleId, f.articleTitle, f.requirement, f.currentState, f.score, f.numericScore ?? 0, f.priority, f.notes);
      }
    });
  }

  async function updateArticleScores(assessmentId: string, framework: string, findings: ArticleFinding[]) {
    const assessment = await getAssessment(assessmentId);
    if (!assessment) return;

    const existing = JSON.parse(assessment.article_scores || '{}') as Record<string, ArticleFinding[]>;
    if (!existing[framework]) existing[framework] = [];
    // Merge — replace existing entries for same articleId
    const articleMap = new Map(existing[framework].map(f => [f.articleId, f]));
    for (const f of findings) articleMap.set(f.articleId, f);
    existing[framework] = Array.from(articleMap.values());

    await db.run('UPDATE gap_assessments SET article_scores = ?, updated_at = ? WHERE id = ?', JSON.stringify(existing), new Date().toISOString(), assessmentId);
  }

  return { getAssessment, getAssessmentForUser, saveFindings, updateArticleScores, listAvailableFrameworks, getFramework };
}
