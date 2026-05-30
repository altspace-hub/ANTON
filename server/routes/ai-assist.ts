/**
 * ai-assist.ts
 * Lightweight AI-assist endpoints for pages that previously had no Claude support.
 * All use non-streaming callSync (short, structured responses).
 * Covers: module builder, intelligence, patterns, deadlines, quality,
 *         compliance, versions, projects, skills, apprentice, analytics, workflows.
 */

import { safeError } from '../lib/error-response.js';
import { Router, Request, Response } from 'express';
import { callSync } from '../services/claude-client.js';

// ── Helpers ─────────────────────────────────────────────────────────────────

function stripAndParseJson(text: string): unknown {
  const stripped = text.replace(/```(?:json)?\s*\n?([\s\S]*?)\n?```/g, '$1').trim();
  const match = stripped.match(/[\[{][\s\S]*[\]}]/) ?? text.match(/[\[{][\s\S]*[\]}]/);
  if (!match) throw new Error('No JSON found in response');
  return JSON.parse(match[0]);
}

async function ai(system: string, user: string): Promise<string> {
  const result = await callSync({
    model: 'claude-sonnet-4-6',
    thinking: 'think',
    system,
    messages: [{ role: 'user', content: user }],
  });
  return result.text;
}

async function aiJson(system: string, user: string): Promise<unknown> {
  const text = await ai(system, user);
  return stripAndParseJson(text);
}

// ── Router ───────────────────────────────────────────────────────────────────

export async function createAiAssistRoutes(): Promise<Router> {
  const router = Router();

  // ── 1. Module Prompt Drafter ──────────────────────────────────────────────
  // POST /api/ai-assist/module-prompt
  router.post('/ai-assist/module-prompt', async (req: Request, res: Response) => {
    try {
      const { name, description, area, thinking, creativity } = req.body as {
        name: string; description?: string; area?: string; thinking?: string; creativity?: string;
      };
      if (!name?.trim()) return res.status(400).json({ error: 'name required' });

      const text = await ai(
        `You are an expert prompt engineer for AI compliance and professional services tools.
Write precise, high-quality system prompts for Claude-based specialist modules.

Rules:
- Use ## section headers to structure the prompt
- Define the expert role clearly in the opening paragraph
- Include an ANALYSIS FRAMEWORK section with numbered steps
- Include OUTPUT REQUIREMENTS with specific formatting rules
- 200-400 words total — authoritative, not repetitive
- Match thinking level "${thinking || 'think_hard'}" and creativity "${creativity || 'balanced'}"

Return ONLY the system prompt text — no explanation, no JSON, no preamble.`,
        `Write a system prompt for a module called "${name}".
${description ? `Description: ${description}` : ''}
${area ? `Area/domain: ${area}` : ''}
Make Claude the ideal specialist for this module's purpose.`
      );
      res.json({ prompt: text });
    } catch (err) {
      console.error('[ai-assist/module-prompt]', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── 2. Guided Input Suggester ─────────────────────────────────────────────
  // POST /api/ai-assist/module-inputs
  router.post('/ai-assist/module-inputs', async (req: Request, res: Response) => {
    try {
      const { name, description, systemPrompt } = req.body as {
        name: string; description?: string; systemPrompt?: string;
      };
      if (!name?.trim()) return res.status(400).json({ error: 'name required' });

      const data = await aiJson(
        `You are a UX designer for AI-powered professional tools.
Suggest guided input fields that users fill before running a module, giving Claude context for better outputs.

Return a JSON array of 3-5 field definitions:
[{
  "id": "field_id_snake_case",
  "type": "text"|"textarea"|"select"|"chips",
  "label": "Human-readable label",
  "description": "Short help text shown below the field",
  "placeholder": "Example input",
  "required": true|false,
  "options": [{"value": "val", "label": "Label"}]
}]
For select/chips types include 3-6 options. Return ONLY valid JSON array.`,
        `Suggest guided inputs for module: "${name}"
${description ? `Description: ${description}` : ''}
${systemPrompt ? `System prompt excerpt: ${systemPrompt.slice(0, 400)}` : ''}
What 3-5 inputs would most improve Claude's output quality?`
      );
      res.json({ fields: data });
    } catch (err) {
      console.error('[ai-assist/module-inputs]', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── 3. Intelligence Narrative Brief ──────────────────────────────────────
  // POST /api/ai-assist/intelligence-brief
  router.post('/ai-assist/intelligence-brief', async (req: Request, res: Response) => {
    try {
      const { totalAtoms, totalEntities, totalPatterns, criticalPatterns, distribution, topEntities, patterns, timeRange } = req.body as Record<string, unknown>;

      const text = await ai(
        `You are an intelligence analyst summarising AI knowledge system metrics for professional users.
Write in a direct, confident style. 3-4 short paragraphs. No jargon.
Structure: (1) Overall status, (2) Key patterns, (3) What needs attention, (4) Recommended actions.
Return markdown only.`,
        `Briefing for period: ${timeRange || 'last week'}
Knowledge atoms: ${totalAtoms} | Entities: ${totalEntities} | Patterns: ${totalPatterns} (${criticalPatterns} critical)
Distribution: ${JSON.stringify(distribution)}
Top entities: ${JSON.stringify(Array.isArray(topEntities) ? topEntities.slice(0, 5) : topEntities)}
Recent patterns: ${JSON.stringify(Array.isArray(patterns) ? patterns.slice(0, 5) : [])}

Write a 3-4 paragraph plain-English briefing: what this data means, what's notable, and what to do next.`
      );
      res.json({ brief: text });
    } catch (err) {
      console.error('[ai-assist/intelligence-brief]', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── 4. Pattern Analysis ───────────────────────────────────────────────────
  // POST /api/ai-assist/pattern-analyse
  router.post('/ai-assist/pattern-analyse', async (req: Request, res: Response) => {
    try {
      const { patternType, title, description, severity, evidenceCount, affectedEntities } = req.body as Record<string, unknown>;

      const data = await aiJson(
        `You are a knowledge intelligence analyst. Explain detected patterns in plain English and suggest concrete actions.
Return JSON: { "explanation": "2-3 sentence explanation", "urgency": "low|medium|high", "actions": ["Action 1", "Action 2", "Action 3"] }
Return ONLY valid JSON.`,
        `Pattern: ${title}
Type: ${patternType} | Severity: ${severity} | Evidence: ${evidenceCount}
Description: ${description}
Affected: ${JSON.stringify(affectedEntities || [])}
What does this mean and what should the user do?`
      );
      res.json(data);
    } catch (err) {
      console.error('[ai-assist/pattern-analyse]', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── 5. Deadline Prioritisation ────────────────────────────────────────────
  // POST /api/ai-assist/deadline-prioritise
  router.post('/ai-assist/deadline-prioritise', async (req: Request, res: Response) => {
    try {
      const { deadlines } = req.body as {
        deadlines: Array<{ id: string; title: string; due_date: string; priority: string; status: string; description?: string }>;
      };
      if (!deadlines?.length) return res.json({ summary: 'No pending deadlines to prioritise.', orderedIds: [], flags: [], recommendations: [] });

      const today = new Date().toISOString().split('T')[0];
      const data = await aiJson(
        `You are a compliance programme manager prioritising deadlines for financial crime prevention professionals.
Return JSON:
{
  "summary": "2-3 sentence executive summary",
  "orderedIds": ["id1", "id2"],
  "flags": [{ "id": "deadline_id", "flag": "warning|info", "message": "Short plain-English flag" }],
  "recommendations": ["Action 1", "Action 2", "Action 3"]
}
Return ONLY valid JSON.`,
        `Today: ${today}
Deadlines:
${deadlines.map(d => `- ID:${d.id} | "${d.title}" | Due:${d.due_date} | Priority:${d.priority} | Status:${d.status}${d.description ? ` | ${d.description.slice(0, 80)}` : ''}`).join('\n')}
Return prioritised order, flags, and recommendations.`
      );
      res.json(data);
    } catch (err) {
      console.error('[ai-assist/deadline-prioritise]', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── 6. Quality Coaching ───────────────────────────────────────────────────
  // POST /api/ai-assist/quality-coaching
  router.post('/ai-assist/quality-coaching', async (req: Request, res: Response) => {
    try {
      const { moduleId, scores, reasoning } = req.body as {
        moduleId: string;
        scores: { overall: number; completeness: number; accuracy: number; structure: number; actionability: number; citations: number };
        reasoning?: { strengths?: string[]; weaknesses?: string[]; improvementSuggestion?: string };
      };

      const data = await aiJson(
        `You are a coaching expert for AI compliance professionals. Give specific, actionable advice.
Return JSON:
{
  "headline": "One sentence focus recommendation",
  "tips": [{ "area": "completeness|accuracy|structure|actionability|citations", "tip": "Specific 1-sentence tip" }],
  "nextRun": "One specific instruction to add to the next run to immediately improve quality"
}
Return ONLY valid JSON. Be direct and specific — no generic platitudes.`,
        `Module: ${moduleId}
Scores (1-10): overall=${scores.overall} completeness=${scores.completeness} accuracy=${scores.accuracy} structure=${scores.structure} actionability=${scores.actionability} citations=${scores.citations}
${reasoning?.strengths?.length ? `Strengths: ${reasoning.strengths.join('; ')}` : ''}
${reasoning?.weaknesses?.length ? `Weaknesses: ${reasoning.weaknesses.join('; ')}` : ''}
${reasoning?.improvementSuggestion ? `Existing suggestion: ${reasoning.improvementSuggestion}` : ''}
What specific improvements would most increase quality?`
      );
      res.json(data);
    } catch (err) {
      console.error('[ai-assist/quality-coaching]', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── 7. Compliance Rule Suggester ──────────────────────────────────────────
  // POST /api/ai-assist/compliance-suggest-rules
  router.post('/ai-assist/compliance-suggest-rules', async (req: Request, res: Response) => {
    try {
      const { existingRules, recentViolations, goal } = req.body as {
        existingRules: Array<{ name: string; description?: string }>;
        recentViolations?: Array<{ rule_name?: string; module_id?: string }>;
        goal?: string;
      };

      const data = await aiJson(
        `You are a compliance engineer for AI systems. Suggest new quality and governance rules.
Return a JSON array of 3-5 rule suggestions:
[{
  "name": "Short rule name",
  "description": "What this rule checks",
  "category": "output_quality|content|formatting|safety|performance",
  "condition": "Plain English condition that triggers violation",
  "severity": "warning|error",
  "rationale": "Why this rule adds value"
}]
Return ONLY valid JSON array.`,
        `Goal: ${goal || 'Improve output quality and governance'}
Existing rules (${existingRules.length}):
${existingRules.slice(0, 10).map(r => `- ${r.name}${r.description ? `: ${r.description}` : ''}`).join('\n')}
${recentViolations?.length ? `Recent violations: ${[...new Set(recentViolations.map(v => v.rule_name || v.module_id || 'unknown'))].slice(0, 5).join(', ')}` : ''}
Suggest 3-5 new rules that would improve quality governance.`
      );
      res.json({ suggestions: data });
    } catch (err) {
      console.error('[ai-assist/compliance-suggest-rules]', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── 8. Violation Explainer ────────────────────────────────────────────────
  // POST /api/ai-assist/compliance-explain-violation
  router.post('/ai-assist/compliance-explain-violation', async (req: Request, res: Response) => {
    try {
      const { ruleName, ruleDescription, violationDetails, moduleId } = req.body as {
        ruleName: string; ruleDescription?: string; violationDetails?: string; moduleId?: string;
      };

      const data = await aiJson(
        `You are a compliance coach. Explain AI governance violations in plain English and give remediation advice.
Return JSON:
{
  "plainEnglish": "1-2 sentence plain English explanation",
  "impact": "Why this matters — what problem does this violation cause",
  "fix": "Specific, concrete advice to avoid this next time",
  "severity": "low|medium|high"
}
Return ONLY valid JSON.`,
        `Violation: ${ruleName}
${ruleDescription ? `Rule: ${ruleDescription}` : ''}
${violationDetails ? `Details: ${violationDetails}` : ''}
${moduleId ? `Module: ${moduleId}` : ''}`
      );
      res.json(data);
    } catch (err) {
      console.error('[ai-assist/compliance-explain-violation]', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── 9. Version Changelog ──────────────────────────────────────────────────
  // POST /api/ai-assist/version-changelog
  router.post('/ai-assist/version-changelog', async (req: Request, res: Response) => {
    try {
      const { oldContent, newContent, entityType } = req.body as {
        oldContent: string; newContent: string; entityType?: string;
      };
      if (!oldContent || !newContent) return res.status(400).json({ error: 'oldContent and newContent required' });

      const data = await aiJson(
        `You are a technical writer. Summarize changes between two versions of AI module content.
Return JSON:
{
  "summary": "One sentence: what changed and why it matters",
  "changes": [{ "type": "added|removed|modified", "description": "What changed (1 sentence)" }],
  "significance": "minor|moderate|major",
  "recommendation": "One sentence: what to test after this change"
}
Return ONLY valid JSON.`,
        `Summarize changes in this ${entityType || 'module'}.
OLD (first 800 chars): ${oldContent.slice(0, 800)}
NEW (first 800 chars): ${newContent.slice(0, 800)}
What are the meaningful differences?`
      );
      res.json(data);
    } catch (err) {
      console.error('[ai-assist/version-changelog]', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── 10. Project Scaffolder ────────────────────────────────────────────────
  // POST /api/ai-assist/project-scaffold
  router.post('/ai-assist/project-scaffold', async (req: Request, res: Response) => {
    try {
      const { name, goal, availableModuleIds } = req.body as {
        name: string; goal?: string; availableModuleIds?: string[];
      };
      if (!name?.trim()) return res.status(400).json({ error: 'name required' });

      const data = await aiJson(
        `You are a compliance project manager. Scaffold projects for financial crime prevention professionals.
Return JSON:
{
  "description": "1-2 sentence project description",
  "recommendedModules": ["module-id-1", "module-id-2"],
  "phases": [{ "name": "Phase name", "duration": "e.g. 1-2 weeks", "tasks": ["Task 1", "Task 2"] }],
  "successCriteria": ["Criterion 1", "Criterion 2"]
}
Return ONLY valid JSON. Pick recommendedModules from the available list only.`,
        `Project: "${name}"
${goal ? `Goal: ${goal}` : ''}
${availableModuleIds?.length ? `Available modules: ${availableModuleIds.slice(0, 30).join(', ')}` : ''}
Suggest project structure, phases, and up to 4 relevant modules.`
      );
      res.json(data);
    } catch (err) {
      console.error('[ai-assist/project-scaffold]', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── 11. Skill Drafter ─────────────────────────────────────────────────────
  // POST /api/ai-assist/skill-draft
  router.post('/ai-assist/skill-draft', async (req: Request, res: Response) => {
    try {
      const { intent, category } = req.body as { intent: string; category?: string };
      if (!intent?.trim()) return res.status(400).json({ error: 'intent required' });

      const data = await aiJson(
        `You are an expert skill author for AI professional tools.
Skills are reusable prompt instructions appended to Claude's system prompt.
Return JSON:
{
  "name": "Short skill name (3-5 words)",
  "description": "What this skill does (1 sentence)",
  "category": "language|communication|methodology|domain|style",
  "promptInstruction": "The actual prompt text injected into Claude (2-4 sentences, imperative, specific)",
  "suggestedTags": ["tag1", "tag2"]
}
Return ONLY valid JSON.`,
        `Draft a skill for: "${intent}"
${category ? `Preferred category: ${category}` : ''}`
      );
      res.json(data);
    } catch (err) {
      console.error('[ai-assist/skill-draft]', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── 12. Apprentice Next Steps ─────────────────────────────────────────────
  // POST /api/ai-assist/apprentice-next-steps
  router.post('/ai-assist/apprentice-next-steps', async (req: Request, res: Response) => {
    try {
      const { moduleId, moduleName, stage, sessionsCompleted, qualityAvg } = req.body as {
        moduleId: string; moduleName: string; stage: string; sessionsCompleted: number; qualityAvg?: number | null;
      };

      const data = await aiJson(
        `You are a learning coach for AI tool users. Give brief, specific, encouraging advice.
Return JSON:
{
  "headline": "One sentence focus recommendation",
  "tips": ["Short tip 1", "Short tip 2", "Short tip 3"],
  "nextChallenge": "One specific thing to try next session"
}
Return ONLY valid JSON.`,
        `Module: "${moduleName}" (${moduleId})
Stage: ${stage} | Sessions: ${sessionsCompleted}
Quality avg: ${qualityAvg != null ? qualityAvg.toFixed(1) + '/10' : 'not yet scored'}
What should they focus on to progress to the next stage?`
      );
      res.json(data);
    } catch (err) {
      console.error('[ai-assist/apprentice-next-steps]', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── 13. Analytics Narrative ───────────────────────────────────────────────
  // POST /api/ai-assist/analytics-narrative
  router.post('/ai-assist/analytics-narrative', async (req: Request, res: Response) => {
    try {
      const { overview, topModules, period } = req.body as Record<string, unknown>;

      const text = await ai(
        `You are a usage analyst for an AI tool. Write a brief, friendly 2-3 sentence narrative about the user's AI usage patterns.
Be specific about numbers. Highlight what's working and any patterns worth noting.
Return plain text only — no JSON, no markdown headers.`,
        `Period: ${period || 'recent'}
Overview: ${JSON.stringify(overview)}
Top modules: ${JSON.stringify(topModules)}`
      );
      res.json({ narrative: text });
    } catch (err) {
      console.error('[ai-assist/analytics-narrative]', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── 14. Workflow Failure Diagnosis ────────────────────────────────────────
  // POST /api/ai-assist/workflow-diagnose
  router.post('/ai-assist/workflow-diagnose', async (req: Request, res: Response) => {
    try {
      const { stepLabel, stepType, stepConfig, error: stepError, context } = req.body as Record<string, unknown>;

      const data = await aiJson(
        `You are a workflow debugging expert for AI automation systems.
Return JSON:
{
  "likelyCause": "1-2 sentence explanation of what went wrong",
  "causeType": "data|config|api|timeout|permission|unknown",
  "fix": "Specific actionable fix (2-3 bullet points as a string)",
  "prevention": "How to prevent this in future runs (1 sentence)"
}
Return ONLY valid JSON.`,
        `Step: ${stepLabel}
Type: ${stepType}
Error: ${String(stepError || '').slice(0, 500)}
Config: ${JSON.stringify(stepConfig || {}).slice(0, 300)}
Context: ${JSON.stringify(context || {}).slice(0, 200)}`
      );
      res.json(data);
    } catch (err) {
      console.error('[ai-assist/workflow-diagnose]', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  return router;
}
