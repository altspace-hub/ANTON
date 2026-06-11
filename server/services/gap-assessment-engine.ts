/**
 * gap-assessment-engine.ts
 * Orchestrates chunked Claude calls for structured compliance gap assessments.
 * Handles large frameworks (86 AMLR articles) by splitting into batches of 12-15.
 */

import type { DatabaseAdapter } from '../db/database.js';

import fs from 'fs-extra';
import path from 'path';
import { createHash } from 'crypto';
import { fileURLToPath } from 'url';
import Anthropic from '@anthropic-ai/sdk';
import { callChat, mapModelToProvider } from './provider-router.js';
import {
  computeScoring,
  scoringForManual,
  normalizeFacts,
  validateEvidenceRefs,
  enforceEvidenceConsistency,
  factsEqual,
  isRagBand,
  type CriterionFacts,
  type EvidenceRef,
  type RagBand,
  type Priority,
} from './gap-scoring.js';

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
  // ── Deterministic scoring core (Wave 1.1 / 1.5 / 1.7) ──────────────────
  /** Structured criterion facts the LLM answered (rubric input). Absent = legacy model-scored finding. */
  criteria?: CriterionFacts;
  /** Evidence citations {docId, quote} backing the criteria (validated against the manifest). */
  evidenceRefs?: EvidenceRef[];
  /** Validation warnings (dropped refs, missing change reasons, ...). Never fails the run. */
  warnings?: string[];
  /** Rubric version that computed score/numericScore/priority. null = legacy LLM-decided. */
  rubricVersion?: number | null;
  /** Re-assessment: this finding was carried forward unchanged from the prior iteration. */
  carriedForward?: boolean;
  /** Re-assessment: required explanation when facts moved vs the baseline. */
  changeReason?: string | null;
}

/** Prior-iteration baseline injected in re-assessment mode (Wave 1.7). */
export interface BaselineFinding {
  articleId: string;
  articleTitle?: string;
  requirement?: string;
  currentState?: string;
  score: string;
  numericScore: number;
  priority: string;
  notes?: string;
  criteria?: CriterionFacts | null;
  evidenceRefs?: EvidenceRef[];
  rubricVersion?: number | null;
}

// ── Addressable evidence (Wave 1.5) ─────────────────────────────────────────

export interface EvidenceItem {
  docId: string;
  name: string;
  kind: 'document' | 'interview';
  text: string;
}

export interface EvidenceManifestEntry {
  docId: string;
  name: string;
  kind: 'document' | 'interview';
  sha256: string;
  chars: number;
}

/**
 * Extract addressable evidence items from context_config.
 * New wizard versions send `evidenceItems: [{name, text, kind}]`; docIds are
 * assigned deterministically (doc-1.., int-1..) so refs stay stable per run.
 * Legacy assessments only have the concatenated `documents` string — those
 * yield no addressable items (refs not required there).
 */
export function extractEvidenceItems(contextConfig: Record<string, unknown>): EvidenceItem[] {
  const raw = contextConfig.evidenceItems;
  if (!Array.isArray(raw)) return [];
  const items: EvidenceItem[] = [];
  let docN = 0;
  let intN = 0;
  for (const entry of raw) {
    if (entry === null || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    const text = typeof e.text === 'string' ? e.text : '';
    if (!text.trim()) continue;
    const kind: 'document' | 'interview' = e.kind === 'interview' ? 'interview' : 'document';
    const docId = kind === 'interview' ? `int-${++intN}` : `doc-${++docN}`;
    items.push({
      docId,
      name: String(e.name ?? docId).slice(0, 200),
      kind,
      text,
    });
  }
  return items;
}

/** sha256-fingerprinted manifest for storage on the assessment row. */
export function buildEvidenceManifest(items: EvidenceItem[]): EvidenceManifestEntry[] {
  return items.map(i => ({
    docId: i.docId,
    name: i.name,
    kind: i.kind,
    sha256: createHash('sha256').update(i.text, 'utf8').digest('hex'),
    chars: i.text.length,
  }));
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
}, hasEvidence: boolean, reassess: boolean): string {
  const groundingRules = hasEvidence
    ? `Grounding rules for "currentState":
- Describe THIS entity's ACTUAL current state, grounded in the evidence documents and interview notes provided with this assessment. Reference the specific document or interview you are drawing on.
- If the provided evidence does not cover an article, that article's "currentState" MUST begin with exactly: "No evidence provided — based on stated maturity level:" and may then describe what an entity at the stated maturity level (${context.maturity}/5) would typically have in place (or lack).
- Never present an assumed or archetype state as if it had been observed at this entity.`
    : `Grounding rules for "currentState":
- No evidence documents were provided for this assessment, so every article's "currentState" MUST begin with exactly: "No evidence provided — based on stated maturity level:" followed by what an entity at the stated maturity level (${context.maturity}/5) would typically have in place (or lack).
- Never present an assumed or archetype state as if it had been observed at this entity.`;

  const reassessRules = reassess
    ? `\n\nRE-ASSESSMENT MODE: A prior assessment iteration exists. Each article below carries its "baseline" (prior criteria + score). Assess ONLY what changed given the CURRENT evidence:
- If nothing material changed for an article, return {"articleId": "...", "changed": false} for it and nothing else — the baseline carries forward unchanged.
- If something changed, return "changed": true with the FULL criteria, fresh currentState/notes, and a "changeReason" (1-2 sentences naming the specific evidence that moved the answer). changeReason is MANDATORY whenever any criterion answer differs from the baseline.`
    : '';

  return `You are a senior AML/CFT compliance specialist conducting a structured gap assessment.

Entity: ${context.entityType}
Jurisdiction(s): ${context.jurisdiction}
Customer segments: ${context.segments}
Current AML maturity (self-rated): ${context.maturity}/5
Known concerns: ${context.concerns || 'None specified'}

Your task is to assess the entity's compliance with the articles listed below. For each article you provide STRUCTURED CRITERION FACTS — you do NOT assign scores, RAG bands, or priorities. A deterministic, versioned rubric computes those from your facts after the run. Put all of your judgement into answering the criteria truthfully and into the narrative fields.

${groundingRules}

Criterion facts (answer ALL five for every article):
- "documented": Is the requirement covered by an approved, current policy / procedure / control description? yes | partial | no | unknown
- "implemented": Is the requirement operating in practice (people, process, systems) — not just on paper? yes | partial | no | unknown
- "tested": Has effectiveness been independently tested, audited, or QA'd? yes | partial | no | n_a | unknown. Use n_a ONLY where testing is not meaningful (e.g. purely definitional articles).
- "evidenced": Are your answers for this article grounded in the evidence provided with this assessment? yes | no. If yes, you MUST cite evidenceRefs.
- "ownerAssigned": Is there a clearly accountable owner for this requirement? yes | no | unknown

Strictness rules:
- Answer "unknown" when the provided material is silent — never guess in the entity's favour.
- Every "yes" or "partial" answer that is grounded in provided evidence MUST be backed by at least one evidenceRefs entry: {"docId": "<id from the evidence list>", "quote": "<short verbatim span from that document, max 300 chars>"}.
- Where no provided evidence covers an article, "evidenced" must be "no" and evidenceRefs must be [].${reassessRules}

Respond ONLY with a valid JSON array. No preamble, no explanation outside the JSON.`;
}

function buildBatchUserMessage(
  articles: FrameworkArticle[],
  framework: Framework,
  hasEvidence: boolean,
  baseline?: Record<string, BaselineFinding>,
): string {
  const articleList = articles.map(a => {
    const entry: Record<string, unknown> = { id: a.id, title: a.title, requirement: a.requirement };
    const b = baseline?.[a.id];
    if (b) {
      entry.baseline = {
        criteria: b.criteria ?? null,
        numericScore: b.numericScore,
        score: b.score,
        priority: b.priority,
        currentState: (b.currentState ?? '').slice(0, 400),
      };
    }
    return JSON.stringify(entry);
  }).join(',\n');

  const currentStateInstruction = hasEvidence
    ? "2-3 sentence description of THIS entity's actual current state, grounded in the evidence documents and interview notes provided (name the document/interview). If no provided evidence covers this article, begin with exactly 'No evidence provided — based on stated maturity level:' and then describe what an entity at the stated maturity level would typically have in place (or lack)"
    : "2-3 sentence description beginning with exactly 'No evidence provided — based on stated maturity level:' followed by what an entity at the stated maturity level would typically have in place (or lack) for this article";

  const reassessFields = baseline
    ? `\n    "changed": true,
    "changeReason": "REQUIRED when changed is true — 1-2 sentences naming the evidence that moved the answer",`
    : '';

  const reassessNote = baseline
    ? `\n\nFor articles where nothing material changed versus the baseline, return ONLY {"articleId": "Art.XX", "changed": false}.`
    : '';

  return `Assess the following ${framework.shortName} articles for the entity described.

Articles to assess:
[${articleList}]

Return a JSON array with one object per article:
[
  {
    "articleId": "Art.XX",
    "articleTitle": "Article title",
    "requirement": "Brief restatement of the core requirement",
    "currentState": "${currentStateInstruction}",${reassessFields}
    "criteria": {
      "documented": "yes|partial|no|unknown",
      "implemented": "yes|partial|no|unknown",
      "tested": "yes|partial|no|n_a|unknown",
      "evidenced": "yes|no",
      "ownerAssigned": "yes|no|unknown"
    },
    "evidenceRefs": [{"docId": "doc-1", "quote": "short verbatim span from that document (max 300 chars)"}],
    "notes": "Specific implementation gaps or recommendations for this article"
  }
]

Do NOT include score, numericScore, or priority fields — they are computed deterministically from your criteria by a versioned rubric after the run.${reassessNote}`;
}

/** Shape of one raw (untrusted) finding object as returned by the LLM. */
interface RawBatchFinding {
  articleId?: unknown;
  articleTitle?: unknown;
  requirement?: unknown;
  currentState?: unknown;
  criteria?: unknown;
  evidenceRefs?: unknown;
  notes?: unknown;
  changed?: unknown;
  changeReason?: unknown;
  // Legacy fields — models that ignore the schema may still emit these
  score?: unknown;
  numericScore?: unknown;
  priority?: unknown;
}

/** Build the addressable evidence blob ("### DOCUMENT [doc-1]: name") from items,
 *  falling back to the legacy pre-concatenated `documents` string. */
function buildEvidenceText(contextConfig: Record<string, unknown>, items: EvidenceItem[]): string {
  if (items.length > 0) {
    const blob = items.map(i =>
      `### ${i.kind === 'interview' ? 'INTERVIEW' : 'DOCUMENT'} [${i.docId}]: ${i.name}\n${i.text}`
    ).join('\n\n---\n\n');
    return blob.slice(0, 120_000); // Cap at ~120k chars to stay within context
  }
  return typeof contextConfig.documents === 'string' && contextConfig.documents.trim()
    ? contextConfig.documents.slice(0, 120_000)
    : '';
}

/** Construct a carried-forward finding from the prior-iteration baseline (Wave 1.7). */
function findingFromBaseline(article: FrameworkArticle, b: BaselineFinding, warnings: string[] = []): ArticleFinding {
  return {
    articleId: article.id,
    articleTitle: b.articleTitle || article.title,
    requirement: b.requirement || article.requirement,
    currentState: b.currentState ?? '',
    score: (isRagBand(b.score) ? b.score : 'amber'),
    numericScore: Number.isFinite(b.numericScore) ? b.numericScore : 0,
    priority: (['critical', 'high', 'medium', 'low'].includes(b.priority) ? b.priority : 'medium') as Priority,
    notes: b.notes ?? '',
    criteria: b.criteria ?? undefined,
    evidenceRefs: b.evidenceRefs ?? [],
    warnings,
    rubricVersion: b.rubricVersion ?? null,
    carriedForward: true,
    changeReason: null,
  };
}

/**
 * Deterministic post-processing of one raw LLM finding (Wave 1.1):
 * normalize criteria → validate evidence refs → enforce consistency →
 * compute score/band/priority via the versioned rubric. The LLM's narrative
 * fields (currentState/notes) pass through untouched; its numbers never do.
 */
function buildFinding(
  article: FrameworkArticle,
  raw: RawBatchFinding,
  knownDocIds: ReadonlySet<string>,
  baseline?: BaselineFinding,
): ArticleFinding {
  const warnings: string[] = [];

  // Re-assessment short-circuit: explicit "nothing changed"
  if (baseline && raw.changed === false) {
    return findingFromBaseline(article, baseline);
  }

  const normalized = normalizeFacts(raw.criteria);

  if (!normalized) {
    // No criteria object at all.
    if (baseline) {
      // Re-assessment: treat as unchanged rather than inventing facts.
      return findingFromBaseline(article, baseline, ['missing_criteria']);
    }
    if (isRagBand(raw.score)) {
      // Model ignored the schema but produced a legacy-style score — keep it,
      // flagged as legacy (rubricVersion null → "scored by legacy model assessment").
      const numeric = Math.max(0, Math.min(100, Math.round(Number(raw.numericScore ?? 0)) || 0));
      const prio = (['critical', 'high', 'medium', 'low'].includes(String(raw.priority)) ? String(raw.priority) : 'medium') as Priority;
      return {
        articleId: String(raw.articleId ?? article.id),
        articleTitle: String(raw.articleTitle ?? article.title),
        requirement: String(raw.requirement ?? article.requirement),
        currentState: String(raw.currentState ?? ''),
        score: raw.score as RagBand,
        numericScore: numeric,
        priority: prio,
        notes: String(raw.notes ?? ''),
        warnings: ['missing_criteria'],
        rubricVersion: null,
        evidenceRefs: [],
      };
    }
    // Neither criteria nor a usable legacy score — conservative all-unknown facts.
    const fallback: CriterionFacts = { documented: 'unknown', implemented: 'unknown', tested: 'unknown', evidenced: 'no', ownerAssigned: 'unknown' };
    const computed = computeScoring(fallback);
    return {
      articleId: String(raw.articleId ?? article.id),
      articleTitle: String(raw.articleTitle ?? article.title),
      requirement: String(raw.requirement ?? article.requirement),
      currentState: String(raw.currentState ?? ''),
      score: computed.score,
      numericScore: computed.numericScore,
      priority: computed.priority,
      notes: String(raw.notes ?? ''),
      criteria: fallback,
      evidenceRefs: [],
      warnings: ['missing_criteria'],
      rubricVersion: computed.rubricVersion,
    };
  }

  warnings.push(...normalized.warnings);

  const refResult = validateEvidenceRefs(raw.evidenceRefs, knownDocIds);
  warnings.push(...refResult.warnings);

  const consistency = enforceEvidenceConsistency(normalized.facts, refResult.refs);
  warnings.push(...consistency.warnings);
  const facts = consistency.facts;

  // Re-assessment: identical facts carry forward deterministically, regardless
  // of what the model claimed in `changed`.
  if (baseline && baseline.criteria && factsEqual(baseline.criteria, facts)) {
    return findingFromBaseline(article, baseline, warnings);
  }

  let changeReason: string | null = null;
  if (baseline) {
    changeReason = typeof raw.changeReason === 'string' && raw.changeReason.trim()
      ? raw.changeReason.trim().slice(0, 1000)
      : null;
    if (!changeReason) warnings.push('missing_change_reason');
  }

  const computed = computeScoring(facts);

  return {
    articleId: String(raw.articleId ?? article.id),
    articleTitle: String(raw.articleTitle ?? article.title),
    requirement: String(raw.requirement ?? article.requirement),
    currentState: String(raw.currentState ?? ''),
    score: computed.score,
    numericScore: computed.numericScore,
    priority: computed.priority,
    notes: String(raw.notes ?? ''),
    criteria: facts,
    evidenceRefs: refResult.refs,
    warnings,
    rubricVersion: computed.rubricVersion,
    carriedForward: false,
    changeReason,
  };
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
  db?: DatabaseAdapter,
  opts?: {
    /** Prior-iteration baseline keyed by articleId — activates re-assessment mode (Wave 1.7). */
    baseline?: Record<string, BaselineFinding>;
  }
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

  // Addressable evidence items (Wave 1.5) with legacy concatenated-blob fallback
  const evidenceItems = extractEvidenceItems(contextConfig);
  const knownDocIds: ReadonlySet<string> = new Set(evidenceItems.map(i => i.docId));
  const evidenceText = buildEvidenceText(contextConfig, evidenceItems);

  const baseline = opts?.baseline && Object.keys(opts.baseline).length > 0 ? opts.baseline : undefined;

  const hasEvidence = evidenceText.length > 0;
  const baseSystem = buildAssessmentSystemPrompt(context, hasEvidence, !!baseline);
  const idListNote = evidenceItems.length > 0
    ? `\nEach item has a stable id in [brackets] — cite those ids in evidenceRefs.\n`
    : '';
  const evidenceSection = hasEvidence
    ? `\n\n## EVIDENCE DOCUMENTS & INTERVIEW NOTES\nThe following evidence was provided by the assessor. Use this to produce SPECIFIC, evidence-based findings about THIS entity rather than generic assessments. Quote or reference specific documents/interviews where applicable. Where the evidence does not cover an article, say so explicitly per the grounding rules above.${idListNote}\n${evidenceText}`
    : '';
  const systemPrompt = [extraSystemContext?.trim(), baseSystem, evidenceSection].filter(Boolean).join('\n\n---\n\n');

  const mc = getModelConfig(modelTier);
  // For custom model IDs (azure:*, gpt-*, mistral-*), use directly; for Claude tiers, map via provider
  const isCustomModel = modelTier !== 'sonnet' && modelTier !== 'opus';
  const result = await callChat({
    model: isCustomModel ? mc.model : mapModelToProvider(mc.model),
    system: systemPrompt,
    messages: [{ role: 'user', content: buildBatchUserMessage(articleBatch, framework, hasEvidence, baseline) }],
    maxTokens: mc.maxTokensBatch,
    thinkingLevel: mc.thinkingLevel,
    db,
  });

  const rawFindings = JSON.parse(extractJson(result.text, 'array')) as RawBatchFinding[];
  const byArticleId = new Map<string, RawBatchFinding>();
  for (const r of rawFindings) {
    if (r && typeof r === 'object' && typeof r.articleId === 'string') byArticleId.set(r.articleId, r);
  }

  // Deterministic scoring pass — one finding per requested article.
  const findings: ArticleFinding[] = [];
  for (const article of articleBatch) {
    const raw = byArticleId.get(article.id);
    const b = baseline?.[article.id];
    if (!raw) {
      // Model omitted the article. In re-assessment mode carry the baseline
      // forward; in normal mode skip (matches prior partial-batch behaviour).
      if (b) findings.push(findingFromBaseline(article, b, ['missing_from_response']));
      continue;
    }
    findings.push(buildFinding(article, raw, knownDocIds, b));
  }

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

/** gap_findings DB row (snake_case, facts as parsed JSONB object on PG). */
export interface GapFindingRow {
  id: number;
  assessment_id: string;
  framework: string;
  article_id: string;
  article_title: string | null;
  requirement: string | null;
  current_state: string | null;
  score: string | null;
  numeric_score: number | null;
  priority: string | null;
  notes: string | null;
  facts: unknown;
  rubric_version: number | null;
  computed_score: string | null;
  computed_numeric_score: number | null;
  computed_priority: string | null;
  overridden_by: string | null;
  override_reason: string | null;
  overridden_at: string | null;
  override_kind: string | null;
  carried_forward: boolean | null;
  change_reason: string | null;
}

interface FactsColumn {
  criteria?: CriterionFacts | null;
  evidenceRefs?: EvidenceRef[];
  warnings?: string[];
  /** Assessor-edited criteria from a 'facts' override — the LLM's original criteria stay in `criteria`. */
  overrideCriteria?: CriterionFacts | null;
}

function parseFactsColumn(raw: unknown): FactsColumn {
  if (raw === null || raw === undefined) return {};
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) as FactsColumn; } catch { return {}; }
  }
  if (typeof raw === 'object') return raw as FactsColumn;
  return {};
}

/** Map a gap_findings row to the camelCase API shape (single source of truth). */
export function mapFindingRow(f: GapFindingRow): Record<string, unknown> {
  const facts = parseFactsColumn(f.facts);
  return {
    id: f.id,
    framework: f.framework,
    articleId: f.article_id,
    articleTitle: f.article_title,
    requirement: f.requirement,
    currentState: f.current_state,
    score: f.score,
    numericScore: f.numeric_score ?? 0,
    priority: f.priority,
    notes: f.notes,
    criteria: facts.criteria ?? null,
    evidenceRefs: facts.evidenceRefs ?? [],
    warnings: facts.warnings ?? [],
    overrideCriteria: facts.overrideCriteria ?? null,
    rubricVersion: f.rubric_version ?? null,
    computedScore: f.computed_score,
    computedNumericScore: f.computed_numeric_score,
    computedPriority: f.computed_priority,
    overriddenBy: f.overridden_by,
    overrideReason: f.override_reason,
    overriddenAt: f.overridden_at,
    overrideKind: f.override_kind,
    carriedForward: !!f.carried_forward,
    changeReason: f.change_reason,
  };
}

/** Body accepted by the assessor-override endpoint (Wave 1.2). */
export interface OverrideRequestBody {
  criteria?: unknown;
  manualScore?: { numericScore?: unknown; priority?: unknown };
  reason?: unknown;
  revert?: boolean;
}

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
        const isRubricScored = f.rubricVersion !== null && f.rubricVersion !== undefined;
        const factsJson = (f.criteria !== undefined || (f.evidenceRefs?.length ?? 0) > 0 || (f.warnings?.length ?? 0) > 0)
          ? JSON.stringify({ criteria: f.criteria ?? null, evidenceRefs: f.evidenceRefs ?? [], warnings: f.warnings ?? [] } satisfies FactsColumn)
          : null;
        await txDb.run(
      `INSERT INTO gap_findings
       (assessment_id, framework, article_id, article_title, requirement, current_state, score, numeric_score, priority, notes,
        facts, rubric_version, computed_score, computed_numeric_score, computed_priority, carried_forward, change_reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (assessment_id, framework, article_id) DO UPDATE SET
         article_title = EXCLUDED.article_title,
         requirement = EXCLUDED.requirement,
         current_state = EXCLUDED.current_state,
         score = EXCLUDED.score,
         numeric_score = EXCLUDED.numeric_score,
         priority = EXCLUDED.priority,
         notes = EXCLUDED.notes,
         facts = EXCLUDED.facts,
         rubric_version = EXCLUDED.rubric_version,
         computed_score = EXCLUDED.computed_score,
         computed_numeric_score = EXCLUDED.computed_numeric_score,
         computed_priority = EXCLUDED.computed_priority,
         carried_forward = EXCLUDED.carried_forward,
         change_reason = EXCLUDED.change_reason,
         overridden_by = NULL,
         override_reason = NULL,
         overridden_at = NULL,
         override_kind = NULL`
    , assessmentId, framework, f.articleId, f.articleTitle, f.requirement, f.currentState, f.score, f.numericScore ?? 0, f.priority, f.notes,
      factsJson,
      isRubricScored ? f.rubricVersion : null,
      // computed_* preserve the rubric output; legacy (LLM-decided) findings leave them NULL
      isRubricScored ? f.score : null,
      isRubricScored ? (f.numericScore ?? 0) : null,
      isRubricScored ? f.priority : null,
      f.carriedForward === true,
      f.changeReason ?? null);
      }
    });
  }

  /**
   * Assessor override (Wave 1.2). Three modes:
   *  - criteria: edit the criterion facts → score recomputed by the rubric (kind 'facts')
   *  - manualScore: explicit numeric score (band derived from rubric thresholds; kind 'manual')
   *  - revert: restore the preserved computed values, clear the override
   * Computed values are NEVER destroyed: on first override of a legacy finding
   * the current effective values are copied into computed_* first.
   */
  async function applyFindingOverride(
    assessmentId: string,
    findingId: number,
    userId: string,
    body: OverrideRequestBody,
  ): Promise<{ status: number; body: Record<string, unknown> }> {
    const row = await db.get<GapFindingRow>(
      'SELECT * FROM gap_findings WHERE id = ? AND assessment_id = ?', findingId, assessmentId
    );
    if (!row) return { status: 404, body: { error: 'Finding not found' } };

    const facts = parseFactsColumn(row.facts);
    const now = new Date().toISOString();

    let effective: { score: string; numericScore: number; priority: string };
    let overrideKind: 'facts' | 'manual' | null;
    let overrideReason: string | null;
    let overriddenBy: string | null;
    let overriddenAt: string | null;

    if (body.revert === true) {
      if (row.computed_score === null || row.computed_numeric_score === null || row.computed_priority === null) {
        return { status: 400, body: { error: 'Nothing to revert — no computed values preserved for this finding' } };
      }
      effective = { score: row.computed_score, numericScore: row.computed_numeric_score, priority: row.computed_priority };
      overrideKind = null;
      overrideReason = null;
      overriddenBy = null;
      overriddenAt = null;
      delete facts.overrideCriteria;
    } else {
      const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
      if (!reason) return { status: 400, body: { error: 'override reason is required' } };
      overrideReason = reason.slice(0, 2000);
      overriddenBy = userId;
      overriddenAt = now;

      if (body.criteria !== undefined) {
        const normalized = normalizeFacts(body.criteria);
        if (!normalized || normalized.warnings.length > 0) {
          return { status: 400, body: { error: 'Invalid criteria — all five criterion facts must carry valid values', details: normalized?.warnings ?? [] } };
        }
        const computed = computeScoring(normalized.facts);
        effective = { score: computed.score, numericScore: computed.numericScore, priority: computed.priority };
        overrideKind = 'facts';
        facts.overrideCriteria = normalized.facts;
      } else if (body.manualScore && typeof body.manualScore === 'object') {
        const n = Number(body.manualScore.numericScore);
        if (!Number.isFinite(n)) {
          return { status: 400, body: { error: 'manualScore.numericScore must be a number 0-100' } };
        }
        const manual = scoringForManual(n, body.manualScore.priority);
        effective = manual;
        overrideKind = 'manual';
        delete facts.overrideCriteria;
      } else {
        return { status: 400, body: { error: 'Provide criteria, manualScore, or revert' } };
      }
    }

    // First override of a legacy finding: preserve the pre-override values as computed_*
    const computedScore = row.computed_score ?? row.score;
    const computedNumeric = row.computed_numeric_score ?? row.numeric_score ?? 0;
    const computedPriority = row.computed_priority ?? row.priority;

    await db.transaction(async (txDb) => {
      await txDb.run(
        `UPDATE gap_findings SET
           score = ?, numeric_score = ?, priority = ?, facts = ?,
           computed_score = ?, computed_numeric_score = ?, computed_priority = ?,
           overridden_by = ?, override_reason = ?, overridden_at = ?, override_kind = ?
         WHERE id = ? AND assessment_id = ?`,
        effective.score, effective.numericScore, effective.priority, JSON.stringify(facts),
        computedScore, computedNumeric, computedPriority,
        overriddenBy, overrideReason, overriddenAt, overrideKind,
        findingId, assessmentId
      );

      // Keep the article_scores blob (read by synthesis/board/roadmap) in sync
      const assessment = await txDb.get<{ article_scores: string | null }>(
        'SELECT article_scores FROM gap_assessments WHERE id = ?', assessmentId
      );
      if (assessment) {
        let blob: Record<string, ArticleFinding[]> = {};
        try { blob = JSON.parse(assessment.article_scores || '{}'); } catch { /* keep empty */ }
        const list = blob[row.framework];
        if (Array.isArray(list)) {
          const entry = list.find(e => e.articleId === row.article_id);
          if (entry) {
            entry.score = effective.score as RagBand;
            entry.numericScore = effective.numericScore;
            entry.priority = effective.priority as Priority;
            (entry as unknown as Record<string, unknown>).overrideKind = overrideKind;
            (entry as unknown as Record<string, unknown>).overrideReason = overrideReason;
            await txDb.run('UPDATE gap_assessments SET article_scores = ?, updated_at = ? WHERE id = ?',
              JSON.stringify(blob), now, assessmentId);
          }
        }
      }
    });

    const updated = await db.get<GapFindingRow>('SELECT * FROM gap_findings WHERE id = ? AND assessment_id = ?', findingId, assessmentId);
    return { status: 200, body: { finding: updated ? mapFindingRow(updated) : null } };
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

  return { getAssessment, getAssessmentForUser, saveFindings, updateArticleScores, applyFindingOverride, listAvailableFrameworks, getFramework };
}
