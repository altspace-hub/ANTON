import type { DatabaseAdapter } from '../db/database.js';
import type { MarketComputationService } from './market-computation-service.js';
import type Anthropic from '@anthropic-ai/sdk';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Types ────────────────────────────────────────────────────────────────────

interface RCIResult {
  question: string;
  reasoning: {
    selectedTemplate: string;
    params: Record<string, unknown>;
    explanation: string;
  };
  computation: {
    logId: string;
    success: boolean;
    output: unknown;
    durationMs: number;
    error?: string;
  };
  interpretation: {
    summary: string;
    confidence: number;
    caveats: string[];
  } | null;
}

interface TemplateSuggestion {
  template: string;
  params: Record<string, unknown>;
  reasoning: string;
}

// ── Factory ──────────────────────────────────────────────────────────────────

export async function createMarketRCIService(
  db: DatabaseAdapter,
  computationService: MarketComputationService,
  anthropicClient?: Anthropic,
) {

  // Load prompt templates
  const promptsDir = path.join(__dirname, '..', 'prompts');
  let reasonPrompt = '';
  let interpretPrompt = '';
  try {
    reasonPrompt = await readFile(path.join(promptsDir, 'market-rci-reason.md'), 'utf-8');
    interpretPrompt = await readFile(path.join(promptsDir, 'market-rci-interpret.md'), 'utf-8');
  } catch {
    console.warn('[market-rci] Could not load prompt templates — using inline defaults');
  }

  const templates = computationService.listTemplates();

  function buildTemplateList(): string {
    return templates.map(t => `- **${t.name}**: ${t.description}\n  Input: ${t.inputSchema}`).join('\n');
  }

  // ── REASON phase — select template + params ────────────────────────────

  async function reason(question: string, context?: string): Promise<TemplateSuggestion> {
    if (!anthropicClient) {
      throw new Error('Anthropic client not configured — RCI requires AI');
    }

    const systemPrompt = reasonPrompt || `You are a quantitative analyst. Given a natural language question about markets, select the most appropriate computation template and provide parameters.

Available templates:
${buildTemplateList()}

Respond with JSON only: { "template": "template_name", "params": { ... }, "reasoning": "why this template" }`;

    const userContent = context
      ? `Question: ${question}\n\nContext: ${context}`
      : `Question: ${question}`;

    const response = await anthropicClient.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: systemPrompt + '\n\nAvailable templates:\n' + buildTemplateList(),
      messages: [{ role: 'user', content: userContent }],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('');

    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('REASON phase did not return valid JSON');
    }

    const parsed = JSON.parse(jsonMatch[0]) as { template: string; params: Record<string, unknown>; reasoning: string };

    // Validate template exists
    const valid = templates.find(t => t.name === parsed.template);
    if (!valid) {
      throw new Error(`REASON phase selected unknown template: ${parsed.template}`);
    }

    return {
      template: parsed.template,
      params: parsed.params,
      reasoning: parsed.reasoning,
    };
  }

  // ── COMPUTE phase — run the template ───────────────────────────────────

  async function compute(template: string, params: Record<string, unknown>) {
    return await computationService.runTemplate(template, params, 'rci');
  }

  // ── INTERPRET phase — explain results ──────────────────────────────────

  async function interpret(
    question: string,
    templateName: string,
    computeOutput: unknown,
  ): Promise<{ summary: string; confidence: number; caveats: string[] }> {
    if (!anthropicClient) {
      return {
        summary: 'AI interpretation unavailable — see raw computation output.',
        confidence: 0,
        caveats: ['Anthropic client not configured'],
      };
    }

    const systemPrompt = interpretPrompt || `You are a senior financial analyst. Given a user's question and the raw computation results, provide a clear, actionable interpretation.

Respond with JSON only: { "summary": "plain English interpretation", "confidence": 0.0-1.0, "caveats": ["any limitations or warnings"] }`;

    const response = await anthropicClient.messages.create({
      // Direct Anthropic client call — cannot wrap with mapModelToProvider
      // here. Fixed invalid id (was ...-20250514, which the Anthropic API
      // rejects; registry id is ...-20250929).
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: `Original question: ${question}\n\nTemplate used: ${templateName}\n\nComputation results:\n${JSON.stringify(computeOutput, null, 2)}`,
      }],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('');

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { summary: text.trim(), confidence: 0.5, caveats: ['Could not parse structured response'] };
    }

    const parsed = JSON.parse(jsonMatch[0]) as { summary: string; confidence: number; caveats: string[] };
    return {
      summary: parsed.summary,
      confidence: Math.max(0, Math.min(1, parsed.confidence)),
      caveats: Array.isArray(parsed.caveats) ? parsed.caveats : [],
    };
  }

  // ── Full RCI Pipeline ──────────────────────────────────────────────────

  async function reasonComputeInterpret(question: string, context?: string): Promise<RCIResult> {
    // Phase 1: REASON
    const suggestion = await reason(question, context);

    // Phase 2: COMPUTE
    const computeResult = await compute(suggestion.template, suggestion.params);

    // Phase 3: INTERPRET (only if compute succeeded)
    let interpretation: RCIResult['interpretation'] = null;
    if (computeResult.success && computeResult.output) {
      try {
        interpretation = await interpret(question, suggestion.template, computeResult.output);
      } catch (err) {
        interpretation = {
          summary: `Interpretation failed: ${err instanceof Error ? err.message : String(err)}`,
          confidence: 0,
          caveats: ['Interpretation phase encountered an error'],
        };
      }
    }

    return {
      question,
      reasoning: {
        selectedTemplate: suggestion.template,
        params: suggestion.params,
        explanation: suggestion.reasoning,
      },
      computation: {
        logId: computeResult.logId,
        success: computeResult.success,
        output: computeResult.output,
        durationMs: computeResult.durationMs,
        error: computeResult.error,
      },
      interpretation,
    };
  }

  // ── Suggest Templates (REASON only) ────────────────────────────────────

  async function suggestTemplates(question: string): Promise<TemplateSuggestion[]> {
    try {
      const suggestion = await reason(question);
      return [suggestion];
    } catch {
      return [];
    }
  }

  return {
    reasonComputeInterpret,
    suggestTemplates,
  };
}

export type MarketRCIService = Awaited<ReturnType<typeof createMarketRCIService>>;
