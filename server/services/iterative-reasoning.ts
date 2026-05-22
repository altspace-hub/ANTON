/**
 * iterative-reasoning.ts
 * Iterative Reasoning Engine (IRE) — multi-phase Claude reasoning loop.
 *
 * Phase map:
 *   think_hard        → [analyse, reflect]
 *   investigate       → [analyse, reflect, deepen, synthesise]
 *   plan_first        → [analyse, reflect, deepen, synthesise]
 *   deep_investigate  → [analyse, reflect, deepen, tool_pass_1, tool_pass_2, synthesise]
 *
 * Phases 0 through N-2 run as internal non-streaming calls (prompt caching reduces cost ~60%).
 * Phase N-1 (synthesise) streams live text to the SSE response.
 *
 * DB writes: revelation_chains + revelation_steps rows persisted per request.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { Response } from 'express';
import type { DatabaseAdapter } from '../db/database.js';

import { getClient } from './claude-client.js';

// ── Phase definitions ─────────────────────────────────────────────

type ThinkingLevel = 'think_hard' | 'investigate' | 'plan_first' | 'deep_investigate';

interface PhaseConfig {
  name: string;
  systemSuffix: string;   // Extra instruction appended to system prompt for this phase
  streaming: boolean;      // true only for the final synthesis phase
  budgetTokens: number;    // kept for max_tokens safety margin calculation
  effort: 'high' | 'max'; // Opus adaptive thinking effort level
  maxTokens: number;       // max output tokens for this phase
}

const PHASE_MAP: Record<ThinkingLevel, PhaseConfig[]> = {
  // ── think_hard: 2-phase (analyse → synthesise) ──
  // Users chose deep reasoning — give the final output generous room.
  think_hard: [
    {
      name: 'analyse',
      systemSuffix: 'PHASE: ANALYSE\nYou are in the analysis phase. Produce a structured, thorough analysis. Be explicit about your reasoning. Do NOT synthesise yet — focus on understanding the problem deeply and identifying key dimensions, evidence, and uncertainty.',
      streaming: false,
      budgetTokens: 8000,
      effort: 'high',
      maxTokens: 32000,
    },
    {
      name: 'synthesise',
      systemSuffix: 'PHASE: SYNTHESISE\nBased on the analysis, produce the final response for the user. Be clear, precise, and comprehensive. Cite your analysis. This is the final user-facing output.',
      streaming: true,
      budgetTokens: 10000,
      effort: 'max',
      maxTokens: 64000,
    },
  ],
  // ── investigate: 4-phase (analyse → reflect → deepen → synthesise) ──
  // Intermediate phases get meaningful room; synthesise gets Opus ceiling.
  investigate: [
    {
      name: 'analyse',
      systemSuffix: 'PHASE: ANALYSE\nYou are in the analysis phase. Produce a deep, multi-angle analysis. Do NOT synthesise. Identify the core problem, sub-problems, evidence, gaps, and risk factors.',
      streaming: false,
      budgetTokens: 10000,
      effort: 'high',
      maxTokens: 32000,
    },
    {
      name: 'reflect',
      systemSuffix: 'PHASE: REFLECT\nYou are in the reflection phase. Review the analysis from the previous phase. Challenge assumptions, identify logical gaps, and surface counter-arguments or alternative interpretations. Conclude with a confidence score (0.0–1.0) and whether a revision of the analysis is needed.',
      streaming: false,
      budgetTokens: 8000,
      effort: 'high',
      maxTokens: 24000,
    },
    {
      name: 'deepen',
      systemSuffix: 'PHASE: DEEPEN\nYou are in the deepening phase. Take the most uncertain or contested areas from the reflection phase and explore them more rigorously. Resolve the key uncertainties and strengthen the analysis.',
      streaming: false,
      budgetTokens: 10000,
      effort: 'max',
      maxTokens: 32000,
    },
    {
      name: 'synthesise',
      systemSuffix: 'PHASE: SYNTHESISE\nYou have completed the multi-phase investigation. Now produce the final, definitive response for the user. Integrate all phase outputs. Be comprehensive, precise, and well-structured. This is the final user-facing output.',
      streaming: true,
      budgetTokens: 16000,
      effort: 'max',
      maxTokens: 128_000, // Opus 4.7 ceiling — final user-facing output gets full capacity
    },
  ],
  // ── plan_first: 4-phase (analyse → plan → deepen → synthesise) ──
  plan_first: [
    {
      name: 'analyse',
      systemSuffix: 'PHASE: ANALYSE\nBegin by analysing the task in full. Map the scope, constraints, dependencies, and risks. Identify what a complete, high-quality response requires.',
      streaming: false,
      budgetTokens: 10000,
      effort: 'high',
      maxTokens: 32000,
    },
    {
      name: 'plan',
      systemSuffix: 'PHASE: PLAN\nCreate an explicit execution plan: sections, order, depth, key assumptions, and any gaps that need addressing. Present the plan as a structured outline.',
      streaming: false,
      budgetTokens: 8000,
      effort: 'high',
      maxTokens: 24000,
    },
    {
      name: 'deepen',
      systemSuffix: 'PHASE: DEEPEN\nReview your plan critically. Identify any missing elements, weak sections, or areas that require deeper treatment. Refine the plan and expand key reasoning.',
      streaming: false,
      budgetTokens: 10000,
      effort: 'max',
      maxTokens: 32000,
    },
    {
      name: 'synthesise',
      systemSuffix: 'PHASE: SYNTHESISE\nExecute the plan. Produce the complete, final response based on the plan and analysis phases. This is the final user-facing output.',
      streaming: true,
      budgetTokens: 16000,
      effort: 'max',
      maxTokens: 128_000, // Opus 4.7 ceiling — final user-facing output gets full capacity
    },
  ],
  // ── deep_investigate: 6-phase (analyse → reflect → deepen → explore → validate → synthesise) ──
  // Most expensive mode. Intermediate phases get generous room; synthesise gets Opus ceiling.
  deep_investigate: [
    {
      name: 'analyse',
      systemSuffix: 'PHASE: ANALYSE\nYou are in the deep investigation analysis phase. Produce an exhaustive, multi-angle analysis. Identify the core problem, all sub-problems, evidence quality, gaps, and risk factors. Do NOT synthesise.',
      streaming: false,
      budgetTokens: 16000,
      effort: 'high',
      maxTokens: 48000,
    },
    {
      name: 'reflect',
      systemSuffix: 'PHASE: REFLECT\nChallenge the analysis. Identify assumptions, logical gaps, alternative interpretations, and counter-arguments. Assign a confidence score (0.0–1.0) and flag specific areas needing deeper investigation.',
      streaming: false,
      budgetTokens: 12000,
      effort: 'high',
      maxTokens: 32000,
    },
    {
      name: 'deepen',
      systemSuffix: 'PHASE: DEEPEN\nAddress all flagged uncertainties from the reflection phase. Explore edge cases. Produce a refined, consolidated understanding of the problem.',
      streaming: false,
      budgetTokens: 16000,
      effort: 'max',
      maxTokens: 48000,
    },
    {
      name: 'explore',
      systemSuffix: 'PHASE: EXPLORE\nUsing your deepened understanding, explore the most important implications, dependencies, and second-order effects. What is most likely to be missed? What are the key risks?',
      streaming: false,
      budgetTokens: 12000,
      effort: 'max',
      maxTokens: 32000,
    },
    {
      name: 'validate',
      systemSuffix: 'PHASE: VALIDATE\nValidate your conclusions from all prior phases. Cross-check the logic, ensure completeness, and identify any remaining gaps or caveats that must be disclosed in the final output.',
      streaming: false,
      budgetTokens: 10000,
      effort: 'high',
      maxTokens: 24000,
    },
    {
      name: 'synthesise',
      systemSuffix: 'PHASE: SYNTHESISE\nProduce the final, definitive response. Integrate all phase outputs. Be comprehensive, authoritative, and precisely structured. Disclose remaining uncertainties. This is the final user-facing output.',
      streaming: true,
      budgetTokens: 24000,
      effort: 'max',
      maxTokens: 128_000, // Opus 4.7 ceiling — final user-facing output gets full capacity
    },
  ],
};

// ── Think tool definition ──────────────────────────────────────────

const THINK_TOOL = {
  name: 'think',
  description: 'Use this tool to record an explicit reasoning checkpoint. Return a structured assessment of the current analysis state.',
  input_schema: {
    type: 'object' as const,
    properties: {
      thought: { type: 'string', description: 'Your current thinking about the problem' },
      conclusion: { type: 'string', description: 'The conclusion reached so far' },
      confidence: { type: 'number', description: 'Confidence score from 0.0 to 1.0' },
      revision_needed: { type: 'boolean', description: 'Whether the previous phase output needs significant revision' },
      next_action: { type: 'string', description: 'What the next phase should focus on' },
    },
    required: ['thought', 'conclusion', 'confidence', 'revision_needed'],
  },
};

// ── IRE config ─────────────────────────────────────────────────────

export interface IREConfig {
  thinkingLevel: ThinkingLevel;
  model: string;
  staticSystemPrompt: string;   // Foundation + module prompt (will be prompt-cached)
  dynamicSystemPrompt: string;  // Output format + knowledge additions (changes per request)
  messages: Array<{ role: 'user' | 'assistant'; content: string | object[] }>;
  tools?: Array<{ type: string; name: string }>;
  sessionId?: string;
  sourceManifest?: string[];
}

export interface IRESummary {
  chainId: string;
  phaseCount: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalDurationMs: number;
  synthesisQualityScore: number | null;
  synthesisText: string;
}

// ── Internal non-streaming call ────────────────────────────────────

interface InternalCallResult {
  text: string;
  thinking: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  confidenceScore: number | null;
  revisionNeeded: boolean | null;
  nextAction: string | null;
}

async function runInternalPhase(
  anthropic: Anthropic,
  phase: PhaseConfig,
  staticSystemPrompt: string,
  dynamicSystemPrompt: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string | object[] }>,
  priorPhaseContext: string,
): Promise<InternalCallResult> {
  const start = Date.now();

  // Build the phase-specific system prompt
  // Static (cached) block = foundation + module prompt
  // Dynamic block = output format + knowledge + prior phases + current phase directive
  const dynamicWithPhase = [
    dynamicSystemPrompt,
    priorPhaseContext ? `\n\n## PRIOR PHASE CONTEXT\n${priorPhaseContext}` : '',
    `\n\n---\n${phase.systemSuffix}`,
  ].filter(Boolean).join('');

  const systemBlocks = [
    { type: 'text' as const, text: staticSystemPrompt, cache_control: { type: 'ephemeral' as const } },
    { type: 'text' as const, text: dynamicWithPhase },
  ];

  const thinkingConfig = phase.effort
    ? { thinking: { type: 'adaptive' as const }, output_config: { effort: phase.effort } }
    : {};

  // Include think tool for reflection and deepen phases
  const useThinkTool = ['reflect', 'deepen', 'explore', 'validate'].includes(phase.name);
  const tools = useThinkTool ? [THINK_TOOL] : undefined;

  // With adaptive thinking, max_tokens only governs output tokens
  const safeMaxTokens = phase.maxTokens;

  const requestParams: Record<string, unknown> = {
    model: 'claude-opus-4-7', // IRE always uses Opus for quality
    max_tokens: safeMaxTokens,
    system: systemBlocks,
    messages,
    ...thinkingConfig,
    ...(tools ? { tools } : {}),
  };

  let text = '';
  let thinking = '';
  let inputTokens = 0;
  let outputTokens = 0;
  let confidenceScore: number | null = null;
  let revisionNeeded: boolean | null = null;
  let nextAction: string | null = null;
  let toolInputAcc = '';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stream = await (anthropic.messages as any).stream(requestParams);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for await (const event of stream as AsyncIterable<any>) {
    if (event.type === 'content_block_delta') {
      if (event.delta?.type === 'text_delta') text += event.delta.text as string;
      else if (event.delta?.type === 'thinking_delta') thinking += event.delta.thinking as string;
      else if (event.delta?.type === 'input_json_delta') toolInputAcc += event.delta.partial_json as string;
    } else if (event.type === 'content_block_stop' && toolInputAcc) {
      try {
        const parsed = JSON.parse(toolInputAcc) as {
          confidence?: number;
          revision_needed?: boolean;
          next_action?: string;
        };
        if (typeof parsed.confidence === 'number') confidenceScore = parsed.confidence;
        if (typeof parsed.revision_needed === 'boolean') revisionNeeded = parsed.revision_needed;
        if (typeof parsed.next_action === 'string') nextAction = parsed.next_action;
      } catch { /* non-fatal */ }
      toolInputAcc = '';
    } else if (event.type === 'message_delta' && event.usage) {
      outputTokens = (event.usage.output_tokens as number) || 0;
    } else if (event.type === 'message_start' && event.message?.usage) {
      inputTokens = (event.message.usage.input_tokens as number) || 0;
    }
  }

  return {
    text,
    thinking,
    inputTokens,
    outputTokens,
    durationMs: Date.now() - start,
    confidenceScore,
    revisionNeeded,
    nextAction,
  };
}

// ── Main IRE runner ────────────────────────────────────────────────

export async function runIterativeReasoning(
  config: IREConfig,
  res: Response,
  db: DatabaseAdapter,
): Promise<IRESummary> {
  const anthropic = getClient();
  const phases = PHASE_MAP[config.thinkingLevel];
  const chainId = crypto.randomUUID();
  const totalStart = Date.now();

  // Persist revelation chain stub
  try {
    await db.run(
      `INSERT INTO revelation_chains (id, session_id, thinking_level, created_at)
       VALUES (?, ?, ?, ?)`
    , chainId, config.sessionId ?? null, config.thinkingLevel, new Date().toISOString());
  } catch (e) {
    console.error('[IRE] Failed to create revelation_chain row:', e);
  }

  // Send chain ID to client so it can fetch the trail later
  const sendEvent = (event: object) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  if (!res.headersSent) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
  }

  sendEvent({ type: 'stream_start', messageId: crypto.randomUUID() });
  sendEvent({ type: 'revelation_chain_id', chainId });

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let synthesisQualityScore: number | null = null;
  let finalSynthesisText = '';

  // Build rolling context from completed phases
  const priorOutputs: Array<{ phase: string; content: string }> = [];

  for (let i = 0; i < phases.length; i++) {
    const phase = phases[i];
    const isLastPhase = i === phases.length - 1;

    sendEvent({
      type: 'phase_start',
      phaseIndex: i,
      phaseName: phase.name,
      totalPhases: phases.length,
    });

    const priorContext = priorOutputs
      .map((p) => `### ${p.phase.toUpperCase()} PHASE OUTPUT\n${p.content}`)
      .join('\n\n');

    const phaseStart = Date.now();

    if (!isLastPhase) {
      // Internal non-streaming phase
      try {
        const result = await runInternalPhase(
          anthropic,
          phase,
          config.staticSystemPrompt,
          config.dynamicSystemPrompt,
          config.messages,
          priorContext,
        );

        totalInputTokens += result.inputTokens;
        totalOutputTokens += result.outputTokens;

        // Store the step
        try {
          await db.run(
            `INSERT INTO revelation_steps
             (id, chain_id, session_id, phase_index, phase_name,
              thinking_content, output_content, confidence_score,
              revision_needed, next_action, input_tokens, output_tokens,
              duration_ms, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          , crypto.randomUUID(),
            chainId,
            config.sessionId ?? null,
            i,
            phase.name,
            result.thinking,
            result.text,
            result.confidenceScore,
            result.revisionNeeded === null ? null : (result.revisionNeeded ? 1 : 0),
            result.nextAction,
            result.inputTokens,
            result.outputTokens,
            result.durationMs,
            new Date().toISOString(),);
        } catch (e) {
          console.error('[IRE] Failed to save revelation_step:', e);
        }

        priorOutputs.push({ phase: phase.name, content: result.text });

        sendEvent({
          type: 'phase_end',
          phaseIndex: i,
          phaseName: phase.name,
          durationMs: result.durationMs,
          confidenceScore: result.confidenceScore,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Internal phase error';
        console.error(`[IRE] Phase ${phase.name} failed:`, err);
        sendEvent({ type: 'error', message: `IRE phase '${phase.name}' failed: ${msg}` });
        res.write('data: [DONE]\n\n');
        res.end();
        return {
          chainId,
          phaseCount: i,
          totalInputTokens,
          totalOutputTokens,
          totalDurationMs: Date.now() - totalStart,
          synthesisQualityScore: null,
          synthesisText: '',
        };
      }
    } else {
      // Final synthesis phase — stream to SSE response
      const dynamicWithPhase = [
        config.dynamicSystemPrompt,
        priorContext ? `\n\n## PRIOR PHASE CONTEXT\n${priorContext}` : '',
        `\n\n---\n${phase.systemSuffix}`,
      ].filter(Boolean).join('');

      const systemBlocks = [
        { type: 'text' as const, text: config.staticSystemPrompt, cache_control: { type: 'ephemeral' as const } },
        { type: 'text' as const, text: dynamicWithPhase },
      ];

      const thinkingConfig = phase.effort
        ? { thinking: { type: 'adaptive' as const }, output_config: { effort: phase.effort } }
        : {};

      // With adaptive thinking, max_tokens only governs output tokens
      const safeMaxTokens = phase.maxTokens;

      const requestParams: Record<string, unknown> = {
        model: 'claude-opus-4-7',
        max_tokens: safeMaxTokens,
        system: systemBlocks,
        messages: config.messages,
        stream: true,
        ...thinkingConfig,
        ...(config.tools && config.tools.length > 0 ? { tools: config.tools } : {}),
      };

      const contentBlocks: Array<{ type: string; content: string }> = [];
      let synthText = '';
      let synthThinking = '';
      let synthInputTokens = 0;
      let synthOutputTokens = 0;
      let synthCacheRead = 0;
      let synthCacheCreation = 0;
      let currentText = '';
      let currentThinking = '';

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const stream = await (anthropic.messages as any).stream(requestParams);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for await (const event of stream as AsyncIterable<any>) {
          const evt = event as Record<string, unknown>;
          switch (evt.type) {
            case 'content_block_start': {
              const block = evt.content_block as Record<string, unknown> | undefined;
              if (block?.type === 'thinking') currentThinking = '';
              else if (block?.type === 'text') currentText = '';
              break;
            }
            case 'content_block_delta': {
              const delta = evt.delta as Record<string, unknown> | undefined;
              if (delta?.type === 'thinking_delta') {
                const t = delta.thinking as string;
                currentThinking += t;
                sendEvent({ type: 'thinking_delta', content: t });
              } else if (delta?.type === 'text_delta') {
                const t = delta.text as string;
                currentText += t;
                synthText += t;
                sendEvent({ type: 'text_delta', content: t });
              }
              break;
            }
            case 'content_block_stop': {
              if (currentThinking) {
                contentBlocks.push({ type: 'thinking', content: currentThinking });
                synthThinking += currentThinking;
                currentThinking = '';
              }
              if (currentText) {
                contentBlocks.push({ type: 'text', content: currentText });
                currentText = '';
              }
              break;
            }
            case 'message_delta': {
              const usage = evt.usage as Record<string, number> | undefined;
              if (usage) {
                synthOutputTokens = usage.output_tokens || 0;
                synthCacheRead = usage.cache_read_input_tokens || 0;
                synthCacheCreation = usage.cache_creation_input_tokens || 0;
              }
              break;
            }
            case 'message_start': {
              const msg = evt.message as Record<string, unknown> | undefined;
              const usage = msg?.usage as Record<string, number> | undefined;
              if (usage) {
                synthInputTokens = usage.input_tokens || 0;
              }
              break;
            }
          }
        }

        totalInputTokens += synthInputTokens;
        totalOutputTokens += synthOutputTokens;

        sendEvent({
          type: 'usage',
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          thinkingTokens: 0,
          cacheCreationTokens: synthCacheCreation,
          cacheReadTokens: synthCacheRead,
        });

        sendEvent({
          type: 'stream_end',
          contentBlocks,
          sourceManifest: config.sourceManifest ?? [],
        });

        const synthDuration = Date.now() - phaseStart;

        sendEvent({
          type: 'phase_end',
          phaseIndex: i,
          phaseName: phase.name,
          durationMs: synthDuration,
          confidenceScore: null,
        });

        // Persist synthesis step
        try {
          await db.run(
            `INSERT INTO revelation_steps
             (id, chain_id, session_id, phase_index, phase_name,
              thinking_content, output_content, confidence_score,
              revision_needed, next_action, input_tokens, output_tokens,
              duration_ms, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          , 
            crypto.randomUUID(),
            chainId,
            config.sessionId ?? null,
            i,
            phase.name,
            synthThinking,
            synthText,
            null,
            null,
            null,
            synthInputTokens,
            synthOutputTokens,
            synthDuration,
            new Date().toISOString(),
          );
        } catch (e) {
          console.error('[IRE] Failed to save synthesis step:', e);
        }

        finalSynthesisText = synthText;

      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Synthesis error';
        console.error('[IRE] Synthesis phase failed:', err);
        sendEvent({ type: 'error', message: `IRE synthesis failed: ${msg}` });
      }

      res.write('data: [DONE]\n\n');
      res.end();
    }
  }

  // Update revelation_chain with final totals
  const totalDuration = Date.now() - totalStart;
  try {
    await db.run(
      `UPDATE revelation_chains
       SET phase_count = ?,
           total_input_tokens = ?,
           total_output_tokens = ?,
           total_duration_ms = ?,
           synthesis_quality_score = ?
       WHERE id = ?`
    , phases.length, totalInputTokens, totalOutputTokens, totalDuration, synthesisQualityScore, chainId);
  } catch (e) {
    console.error('[IRE] Failed to update revelation_chain totals:', e);
  }

  return {
    chainId,
    phaseCount: phases.length,
    totalInputTokens,
    totalOutputTokens,
    totalDurationMs: totalDuration,
    synthesisQualityScore,
    synthesisText: finalSynthesisText,
  };
}

// ── Revelation chain fetcher ──────────────────────────────────────

export async function getRevelationChain(
  db: DatabaseAdapter,
  chainId: string,
): Promise<Record<string, unknown> | null> {
  try {
    const chain = await db.get(
      'SELECT * FROM revelation_chains WHERE id = ?',
      chainId,
    ) as Record<string, unknown> | undefined;
    if (!chain) return null;

    const rawSteps = await db.all(
      'SELECT * FROM revelation_steps WHERE chain_id = ? ORDER BY phase_index ASC',
      chainId,
    ) as Array<Record<string, unknown>>;

    // Map snake_case DB columns → camelCase for frontend
    const steps = rawSteps.map((s) => ({
      id: s.id,
      chainId: s.chain_id,
      sessionId: s.session_id,
      phaseIndex: s.phase_index,
      phaseName: s.phase_name,
      thinkingContent: s.thinking_content,
      outputContent: s.output_content,
      confidenceScore: s.confidence_score ?? null,
      revisionNeeded: s.revision_needed ? true : false,
      nextAction: s.next_action ?? null,
      inputTokens: s.input_tokens ?? 0,
      outputTokens: s.output_tokens ?? 0,
      durationMs: s.duration_ms ?? 0,
      createdAt: s.created_at,
    }));

    return {
      id: chain.id,
      sessionId: chain.session_id,
      messageId: chain.message_id,
      thinkingLevel: chain.thinking_level,
      phaseCount: chain.phase_count ?? 0,
      totalInputTokens: chain.total_input_tokens ?? 0,
      totalOutputTokens: chain.total_output_tokens ?? 0,
      totalDurationMs: chain.total_duration_ms ?? 0,
      synthesisQualityScore: chain.synthesis_quality_score ?? null,
      createdAt: chain.created_at,
      steps,
    };
  } catch {
    return null;
  }
}
