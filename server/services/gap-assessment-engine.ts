/**
 * gap-assessment-engine.ts
 * Orchestrates chunked Claude calls for structured compliance gap assessments.
 * Handles large frameworks (86 AMLR articles) by splitting into batches of 12-15.
 */

import type Database from 'better-sqlite3';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import Anthropic from '@anthropic-ai/sdk';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
  priority: 'critical' | 'high' | 'medium' | 'low';
  notes: string;
}

export interface AssessmentBatchResult {
  framework: string;
  findings: ArticleFinding[];
  batchIndex: number;
  totalBatches: number;
}

const BATCH_SIZE = 12;

// In-memory cache — frameworks are static JSON files; no need to re-read on every request
const frameworkCache = new Map<string, Framework>();

/** Strip markdown code fences then extract first JSON array or object */
function extractJson(text: string, type: 'array' | 'object'): string {
  const stripped = text.replace(/```(?:json)?\s*\n?([\s\S]*?)\n?```/g, '$1').trim();
  const pattern = type === 'array' ? /\[[\s\S]*\]/ : /\{[\s\S]*\}/;
  const match = stripped.match(pattern) ?? text.match(pattern);
  if (!match) throw new Error(`No JSON ${type} found in Claude response`);
  return match[0];
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
}): string {
  return `You are a senior AML/CFT compliance specialist conducting a structured gap assessment.

Entity: ${context.entityType}
Jurisdiction(s): ${context.jurisdiction}
Customer segments: ${context.segments}
Current AML maturity (self-rated): ${context.maturity}/5
Known concerns: ${context.concerns || 'None specified'}

Your task is to assess the entity's compliance with the articles listed below. For each article, provide a structured JSON assessment.

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

function buildBatchUserMessage(articles: FrameworkArticle[], framework: Framework): string {
  const articleList = articles.map(a =>
    `{"id":"${a.id}","title":"${a.title}","requirement":"${a.requirement.replace(/"/g, "'")}"}`
  ).join(',\n');

  return `Assess the following ${framework.shortName} articles for the entity described.

Articles to assess:
[${articleList}]

Return a JSON array with one object per article:
[
  {
    "articleId": "Art.XX",
    "articleTitle": "Article title",
    "requirement": "Brief restatement of the core requirement",
    "currentState": "2-3 sentence description of what a typical entity at this maturity level would have in place (or lack)",
    "score": "red|amber|yellow|green",
    "priority": "critical|high|medium|low",
    "notes": "Specific implementation gaps or recommendations for this article"
  }
]`;
}

export async function runAssessmentBatch(
  anthropic: Anthropic,
  frameworkId: string,
  articleBatch: FrameworkArticle[],
  contextConfig: Record<string, unknown>,
  batchIndex: number,
  totalBatches: number,
  extraSystemContext?: string
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

  const baseSystem = buildAssessmentSystemPrompt(context);
  const systemPrompt = extraSystemContext?.trim()
    ? `${extraSystemContext.trim()}\n\n---\n\n${baseSystem}`
    : baseSystem;

  const response = await anthropic.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 8000,
    system: systemPrompt,
    messages: [{ role: 'user', content: buildBatchUserMessage(articleBatch, framework) }],
  });

  const text = response.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('');

  const findings = JSON.parse(extractJson(text, 'array')) as ArticleFinding[];

  return { framework: frameworkId, findings, batchIndex, totalBatches };
}

export async function synthesiseCapabilityView(
  anthropic: Anthropic,
  allFindings: Record<string, ArticleFinding[]>,
  contextConfig: Record<string, unknown>
): Promise<string> {
  const findingsSummary = Object.entries(allFindings).map(([fw, findings]) => {
    const summary = findings.map(f => `${f.articleId}: ${f.score} (${f.priority}) — ${f.notes}`).join('\n');
    return `### Framework: ${fw}\n${summary}`;
  }).join('\n\n');

  const response = await anthropic.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 8000,
    system: `You are a senior compliance transformation advisor. Synthesise the article-level gap findings below into 8-10 cross-cutting capability themes. Each theme spans one or more regulatory articles and reflects a real organisational capability.

Entity: ${String(contextConfig.entityType || 'Credit institution')}, ${String(contextConfig.jurisdiction || 'EU')}

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
    "crossRegImpact": "Note if same gap affects multiple frameworks"
  }
]`,
    messages: [{ role: 'user', content: `Article-level findings to synthesise:\n\n${findingsSummary}` }],
  });

  const text = response.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('');
  return extractJson(text, 'array');
}

export async function generateBoardSummary(
  anthropic: Anthropic,
  capabilityView: string,
  allFindings: Record<string, ArticleFinding[]>,
  contextConfig: Record<string, unknown>
): Promise<string> {
  const redCount = Object.values(allFindings).flat().filter(f => f.score === 'red').length;
  const amberCount = Object.values(allFindings).flat().filter(f => f.score === 'amber').length;
  const greenCount = Object.values(allFindings).flat().filter(f => f.score === 'green').length;
  const criticalCount = Object.values(allFindings).flat().filter(f => f.priority === 'critical').length;

  const response = await anthropic.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 4000,
    system: `You are a senior compliance advisor drafting a one-page board briefing. Use plain language. No jargon. Every sentence must be decision-relevant.

Structure:
## Compliance Gap Assessment — Board Summary
**Entity:** [entity type] | **Date:** [today] | **Frameworks assessed:** [list]

### What's Working
- [2-3 positives — concrete, specific]

### What Needs Board Attention
For each of the top 5 issues:
**Issue [N]: [Title]** (Priority: CRITICAL/HIGH)
> [2 sentences: what the gap is and why it matters to the board]

### Decisions the Board Must Make
1. [Specific ask — policy approval / budget / organisational change]
2. [...]

### Regulatory Risk If Unaddressed
| Timeline | Risk |
|---|---|
| By [date] | [consequence if not addressed] |

### Next Steps
[Project plan reference — 3 phases, dates]`,
    messages: [{
      role: 'user',
      content: `Generate board summary.

Assessment scores: ${redCount} Red | ${amberCount} Amber | ${greenCount} Green | ${criticalCount} Critical findings
Entity: ${String(contextConfig.entityType || 'Credit institution')}, ${String(contextConfig.jurisdiction || 'EU')}

Capability view:
${capabilityView}`,
    }],
  });

  return response.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('');
}

export async function generateRoadmap(
  anthropic: Anthropic,
  capabilityView: string,
  allFindings: Record<string, ArticleFinding[]>,
  contextConfig: Record<string, unknown>
): Promise<string> {
  const criticalFindings = Object.entries(allFindings).flatMap(([fw, findings]) =>
    findings.filter(f => f.priority === 'critical' || f.priority === 'high')
      .map(f => ({ ...f, framework: fw }))
  );

  const response = await anthropic.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 8000,
    system: `You are a compliance transformation programme manager. Build a phased remediation roadmap.

Return a JSON object:
{
  "phases": [
    {
      "id": "phase-1",
      "name": "Quick Wins",
      "timeframe": "0-3 months",
      "objective": "...",
      "items": [
        {
          "id": "item-001",
          "title": "...",
          "description": "...",
          "framework": "amlr-2024",
          "articleIds": ["Art.12"],
          "owner": "MLRO / Compliance",
          "effort": "S|M|L|XL",
          "priority": "critical|high|medium|low",
          "dependencies": [],
          "verificationCriteria": "How to confirm completion"
        }
      ]
    },
    {
      "id": "phase-2",
      "name": "Structural Changes",
      "timeframe": "3-12 months",
      ...
    },
    {
      "id": "phase-3",
      "name": "Optimisation",
      "timeframe": "12-24 months",
      ...
    }
  ],
  "criticalPath": ["item-001", "item-003"],
  "totalItems": 0,
  "estimatedFTE": "...",
  "keyRisks": ["Risk 1 if delayed", "Risk 2"]
}`,
    messages: [{
      role: 'user',
      content: `Build remediation roadmap.

Entity: ${String(contextConfig.entityType || 'Credit institution')}, ${String(contextConfig.jurisdiction || 'EU')}

Critical/High findings (${criticalFindings.length}):
${criticalFindings.slice(0, 30).map(f => `- ${f.framework} ${f.articleId}: ${f.notes}`).join('\n')}

Capability gaps:
${capabilityView.substring(0, 3000)}`,
    }],
  });

  const text = response.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('');
  return extractJson(text, 'object');
}

type AssessmentRow = { id: string; frameworks: string; scope_config: string; context_config: string; article_scores: string; capability_view: string | null; status: string };

export function createGapAssessmentEngine(db: Database.Database) {
  function getAssessment(id: string): AssessmentRow | undefined {
    return db.prepare('SELECT * FROM gap_assessments WHERE id = ?').get(id) as AssessmentRow | undefined;
  }

  function getAssessmentForUser(id: string, userId: string): AssessmentRow | undefined {
    return db.prepare('SELECT * FROM gap_assessments WHERE id = ? AND user_id = ?').get(id, userId) as AssessmentRow | undefined;
  }

  function saveFindings(assessmentId: string, framework: string, findings: ArticleFinding[]) {
    const insert = db.prepare(
      `INSERT OR REPLACE INTO gap_findings
       (assessment_id, framework, article_id, article_title, requirement, current_state, score, priority, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const insertMany = db.transaction((items: ArticleFinding[]) => {
      for (const f of items) {
        insert.run(assessmentId, framework, f.articleId, f.articleTitle, f.requirement, f.currentState, f.score, f.priority, f.notes);
      }
    });
    insertMany(findings);
  }

  function updateArticleScores(assessmentId: string, framework: string, findings: ArticleFinding[]) {
    const assessment = getAssessment(assessmentId);
    if (!assessment) return;

    const existing = JSON.parse(assessment.article_scores || '{}') as Record<string, ArticleFinding[]>;
    if (!existing[framework]) existing[framework] = [];
    // Merge — replace existing entries for same articleId
    const articleMap = new Map(existing[framework].map(f => [f.articleId, f]));
    for (const f of findings) articleMap.set(f.articleId, f);
    existing[framework] = Array.from(articleMap.values());

    db.prepare('UPDATE gap_assessments SET article_scores = ?, updated_at = ? WHERE id = ?')
      .run(JSON.stringify(existing), new Date().toISOString(), assessmentId);
  }

  return { getAssessment, getAssessmentForUser, saveFindings, updateArticleScores, listAvailableFrameworks, getFramework };
}
