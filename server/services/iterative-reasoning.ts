/**
 * iterative-reasoning.ts
 * Iterative Reasoning Engine (IRE) — multi-phase reasoning loop
 * (whitepaper §24, "revelation chains").
 *
 * Phase map:
 *   think_hard        → [analyse, synthesise]
 *   investigate       → [analyse, reflect, deepen, synthesise]
 *   plan_first        → [analyse, plan, deepen, synthesise]
 *   deep_investigate  → [analyse, reflect, deepen, explore, validate, synthesise]
 *
 * Phases 0 through N-2 run as internal non-streaming calls; phase N-1
 * (synthesise) streams live text to the SSE response.
 *
 * Every call goes through the provider router (`callChat` / `streamChat`) on
 * the model the run was given — the prefixed id as the route resolved it, so
 * `sdk:claude-opus-5` runs on the subscription engine and `claude-opus-4-8`
 * on the API key. Until 2026-09-17 this file built a raw Anthropic client and
 * pinned every phase to `claude-opus-4-8`, so on an instance whose default is
 * the subscription engine the chain never ran: revelation_chains stayed empty
 * and deep_investigate was one call at max effort.
 *
 * Reasoning depth is expressed per phase as an ANTON thinking level and left
 * to the router: thinking-map.ts owns the effort ladder (and the `xhigh` →
 * `max` clamp for models that predate the rung), so this file never puts an
 * effort or a budget into a request.
 *
 * DB writes: revelation_chains + revelation_steps rows persisted per request.
 */

import type { Response } from 'express';
import type { DatabaseAdapter } from '../db/database.js';
import type { ThinkingLevel } from '../../src/lib/types.js';

import { callChat, streamChat, type ChatResult } from './provider-router.js';
import { getProviderFromModelId } from './model-adapter.js';
import { capabilityModelId } from './engine-model-id.js';
import { MODEL_REGISTRY } from '../types/modelAdapter.js';

// ── Engine gate ───────────────────────────────────────────────────

/**
 * Providers the chain runs on. Both Anthropic engines express the full
 * thinking ladder the phases are written against; routes/claude.ts gates the
 * IRE branch on this so the subscription engine is no longer excluded.
 */
export function ireSupportedProvider(provider: string): boolean {
  return provider === 'anthropic' || provider === 'anthropic_sdk';
}

// ── Phase definitions ─────────────────────────────────────────────

type IREThinkingLevel = 'think_hard' | 'investigate' | 'plan_first' | 'deep_investigate';

/**
 * How hard a phase thinks, as an ANTON level the router resolves per engine.
 *   'run'        — the run's own level (investigate → xhigh, deep_investigate → max, …)
 *   'think_hard' — scaffolding depth (effort 'high' on every adaptive model)
 * Before the router this was a literal effort per phase ('high' | 'max'); the
 * same phases keep the same rung, the ladder just lives in thinking-map.ts.
 */
type PhaseThinking = 'run' | 'think_hard';

interface PhaseConfig {
  name: string;
  systemSuffix: string;   // Extra instruction appended to system prompt for this phase
  streaming: boolean;      // true only for the final synthesis phase
  thinking: PhaseThinking;
  maxTokens: number;       // max output tokens for this phase (API engines; the SDK engine has no ceiling surface)
}

const PHASE_MAP: Record<IREThinkingLevel, PhaseConfig[]> = {
  // ── think_hard: 2-phase (analyse → synthesise) ──
  // Users chose deep reasoning — give the final output generous room.
  think_hard: [
    {
      name: 'analyse',
      systemSuffix: 'PHASE: ANALYSE\nYou are in the analysis phase. Produce a structured, thorough analysis. Be explicit about your reasoning. Do NOT synthesise yet — focus on understanding the problem deeply and identifying key dimensions, evidence, and uncertainty.',
      streaming: false,
      thinking: 'think_hard',
      maxTokens: 32000,
    },
    {
      name: 'synthesise',
      systemSuffix: 'PHASE: SYNTHESISE\nBased on the analysis, produce the final response for the user. Be clear, precise, and comprehensive. Cite your analysis. This is the final user-facing output.',
      streaming: true,
      thinking: 'run',
      maxTokens: 64000,
    },
  ],
  // ── investigate: 4-phase (analyse → reflect → deepen → synthesise) ──
  // Intermediate phases get meaningful room; synthesise gets the model's ceiling.
  investigate: [
    {
      name: 'analyse',
      systemSuffix: 'PHASE: ANALYSE\nYou are in the analysis phase. Produce a deep, multi-angle analysis. Do NOT synthesise. Identify the core problem, sub-problems, evidence, gaps, and risk factors.',
      streaming: false,
      thinking: 'think_hard',
      maxTokens: 32000,
    },
    {
      name: 'reflect',
      systemSuffix: 'PHASE: REFLECT\nYou are in the reflection phase. Review the analysis from the previous phase. Challenge assumptions, identify logical gaps, and surface counter-arguments or alternative interpretations. Conclude with a confidence score (0.0–1.0) and whether a revision of the analysis is needed.',
      streaming: false,
      thinking: 'think_hard',
      maxTokens: 24000,
    },
    {
      name: 'deepen',
      systemSuffix: 'PHASE: DEEPEN\nYou are in the deepening phase. Take the most uncertain or contested areas from the reflection phase and explore them more rigorously. Resolve the key uncertainties and strengthen the analysis.',
      streaming: false,
      thinking: 'run',
      maxTokens: 32000,
    },
    {
      name: 'synthesise',
      systemSuffix: 'PHASE: SYNTHESISE\nYou have completed the multi-phase investigation. Now produce the final, definitive response for the user. Integrate all phase outputs. Be comprehensive, precise, and well-structured. This is the final user-facing output.',
      streaming: true,
      thinking: 'run',
      maxTokens: 128_000, // final user-facing output gets the full output ceiling
    },
  ],
  // ── plan_first: 4-phase (analyse → plan → deepen → synthesise) ──
  plan_first: [
    {
      name: 'analyse',
      systemSuffix: 'PHASE: ANALYSE\nBegin by analysing the task in full. Map the scope, constraints, dependencies, and risks. Identify what a complete, high-quality response requires.',
      streaming: false,
      thinking: 'think_hard',
      maxTokens: 32000,
    },
    {
      name: 'plan',
      systemSuffix: 'PHASE: PLAN\nCreate an explicit execution plan: sections, order, depth, key assumptions, and any gaps that need addressing. Present the plan as a structured outline.',
      streaming: false,
      thinking: 'think_hard',
      maxTokens: 24000,
    },
    {
      name: 'deepen',
      systemSuffix: 'PHASE: DEEPEN\nReview your plan critically. Identify any missing elements, weak sections, or areas that require deeper treatment. Refine the plan and expand key reasoning.',
      streaming: false,
      thinking: 'run',
      maxTokens: 32000,
    },
    {
      name: 'synthesise',
      systemSuffix: 'PHASE: SYNTHESISE\nExecute the plan. Produce the complete, final response based on the plan and analysis phases. This is the final user-facing output.',
      streaming: true,
      thinking: 'run',
      maxTokens: 128_000, // final user-facing output gets the full output ceiling
    },
  ],
  // ── deep_investigate: 6-phase (analyse → reflect → deepen → explore → validate → synthesise) ──
  // Most expensive mode. Intermediate phases get generous room; synthesise gets the ceiling.
  deep_investigate: [
    {
      name: 'analyse',
      systemSuffix: 'PHASE: ANALYSE\nYou are in the deep investigation analysis phase. Produce an exhaustive, multi-angle analysis. Identify the core problem, all sub-problems, evidence quality, gaps, and risk factors. Do NOT synthesise.',
      streaming: false,
      thinking: 'think_hard',
      maxTokens: 48000,
    },
    {
      name: 'reflect',
      systemSuffix: 'PHASE: REFLECT\nChallenge the analysis. Identify assumptions, logical gaps, alternative interpretations, and counter-arguments. Assign a confidence score (0.0–1.0) and flag specific areas needing deeper investigation.',
      streaming: false,
      thinking: 'think_hard',
      maxTokens: 32000,
    },
    {
      name: 'deepen',
      systemSuffix: 'PHASE: DEEPEN\nAddress all flagged uncertainties from the reflection phase. Explore edge cases. Produce a refined, consolidated understanding of the problem.',
      streaming: false,
      thinking: 'run',
      maxTokens: 48000,
    },
    {
      name: 'explore',
      systemSuffix: 'PHASE: EXPLORE\nUsing your deepened understanding, explore the most important implications, dependencies, and second-order effects. What is most likely to be missed? What are the key risks?',
      streaming: false,
      thinking: 'run',
      maxTokens: 32000,
    },
    {
      name: 'validate',
      systemSuffix: 'PHASE: VALIDATE\nValidate your conclusions from all prior phases. Cross-check the logic, ensure completeness, and identify any remaining gaps or caveats that must be disclosed in the final output.',
      streaming: false,
      thinking: 'think_hard',
      maxTokens: 24000,
    },
    {
      name: 'synthesise',
      systemSuffix: 'PHASE: SYNTHESISE\nProduce the final, definitive response. Integrate all phase outputs. Be comprehensive, authoritative, and precisely structured. Disclose remaining uncertainties. This is the final user-facing output.',
      streaming: true,
      thinking: 'run',
      maxTokens: 128_000, // final user-facing output gets the full output ceiling
    },
  ],
};

/** The ANTON level a phase runs at, resolved to an effort by the router. */
export function phaseThinkingLevel(phase: PhaseThinking, runLevel: IREThinkingLevel): ThinkingLevel {
  return phase === 'run' ? runLevel : 'think_hard';
}

// ── Reasoning checkpoint ──────────────────────────────────────────
//
// The reflect / deepen / explore / validate phases end with a structured
// self-assessment (confidence, revision_needed, next_action). This used to be
// a custom `think` tool the raw client could read back as a tool_use block;
// the router returns text and thinking only, and the subscription engine is a
// text engine with no custom-tool surface, so the checkpoint is now asked for
// in the phase directive and parsed from the phase text on both engines.

const CHECKPOINT_PHASES: ReadonlySet<string> = new Set(['reflect', 'deepen', 'explore', 'validate']);

const CHECKPOINT_INSTRUCTION =
  'Finish with exactly one reasoning checkpoint, on its own lines, in this form and nothing else after it:\n' +
  '<checkpoint>{"confidence": <0.0-1.0>, "revision_needed": <true|false>, "next_action": "<what the next phase should focus on>"}</checkpoint>';

const CHECKPOINT_RE = /<checkpoint>\s*(?:```(?:json)?\s*)?(\{[\s\S]*?\})\s*(?:```\s*)?<\/checkpoint>/i;

export interface ReasoningCheckpoint {
  confidenceScore: number | null;
  revisionNeeded: boolean | null;
  nextAction: string | null;
}

/**
 * Pull the checkpoint out of a phase's text. Returns the text with the block
 * removed (it is bookkeeping, not analysis, so it never rides into the next
 * phase's context) plus the parsed fields; a missing or malformed block is
 * non-fatal and yields nulls, exactly as an unused think tool did.
 */
export function extractCheckpoint(text: string): { text: string; checkpoint: ReasoningCheckpoint } {
  const empty: ReasoningCheckpoint = { confidenceScore: null, revisionNeeded: null, nextAction: null };
  const m = CHECKPOINT_RE.exec(text);
  if (!m) return { text, checkpoint: empty };
  let parsed: unknown;
  try { parsed = JSON.parse(m[1]); } catch { return { text: text.replace(m[0], '').trimEnd(), checkpoint: empty }; }
  const obj = (parsed && typeof parsed === 'object') ? parsed as Record<string, unknown> : {};
  const conf = typeof obj.confidence === 'number' && Number.isFinite(obj.confidence)
    ? Math.min(1, Math.max(0, obj.confidence))
    : null;
  return {
    text: text.replace(m[0], '').trimEnd(),
    checkpoint: {
      confidenceScore: conf,
      revisionNeeded: typeof obj.revision_needed === 'boolean' ? obj.revision_needed : null,
      nextAction: typeof obj.next_action === 'string' && obj.next_action.trim() ? obj.next_action.trim() : null,
    },
  };
}

// ── IRE config ─────────────────────────────────────────────────────

export interface IREConfig {
  thinkingLevel: IREThinkingLevel;
  /** The run's model id exactly as the route resolved it — `sdk:` prefix and
   *  all. It is dispatched, never used as a capability key, so it keeps its
   *  engine prefix (see engine-model-id.ts). */
  model: string;
  staticSystemPrompt: string;   // Foundation + module prompt
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
  /** Provider the chain ran on ('anthropic' | 'anthropic_sdk'). */
  engine: string;
  /** The id every phase was dispatched with (prefixed, as given). */
  model: string;
  /** Human label for the model + engine, from the registry — never a guess. */
  modelLabel: string;
}

// ── Model description ─────────────────────────────────────────────

/**
 * What the chain ran on, for the summary, the SSE envelope and any user-facing
 * text: the provider, the dispatched id, and the registry display name of the
 * underlying model with the engine named when it is the subscription one.
 * Falls back to the bare id for a model the registry does not know.
 */
export function describeIreModel(modelId: string): { engine: string; model: string; label: string } {
  let engine: string;
  try { engine = getProviderFromModelId(modelId); } catch { engine = 'unknown'; }
  const bare = capabilityModelId(modelId);
  const display = MODEL_REGISTRY[bare]?.displayName ?? bare;
  const label = engine === 'anthropic_sdk' ? `${display} (subscription engine)` : display;
  return { engine, model: modelId, label };
}

// ── Message flattening ────────────────────────────────────────────

/**
 * The router carries message content as a string. Text blocks (either the
 * API's `{type:'text', text}` or the stored-content `{type:'text', content}`
 * shape) are joined; an earlier turn's thinking is internal and not replayed
 * as prose; anything else (an image block, a tool block) is named so the
 * model knows something was there rather than silently losing it.
 */
export function flattenMessageContent(content: string | object[]): string {
  if (typeof content === 'string') return content;
  const parts: string[] = [];
  for (const block of content) {
    const b = block as { type?: unknown; text?: unknown; content?: unknown };
    if (b.type === 'text') {
      const t = typeof b.text === 'string' ? b.text : typeof b.content === 'string' ? b.content : '';
      if (t) parts.push(t);
    } else if (b.type === 'thinking' || b.type === 'redacted_thinking') {
      continue;
    } else if (typeof b.type === 'string') {
      parts.push(`[${b.type} block not carried into this reasoning phase]`);
    }
  }
  return parts.join('\n\n');
}

function routerMessages(messages: IREConfig['messages']): Array<{ role: string; content: string }> {
  return messages.map((m) => ({ role: m.role, content: flattenMessageContent(m.content) }));
}

// ── Usage ─────────────────────────────────────────────────────────

interface PhaseUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

/**
 * ChatResult carries input/output tokens on every engine. Cache tokens are
 * not on the router's result type today; both engines have them at the
 * source (response.usage on the API, SdkCompletionData on the engine), so
 * read them when a future router surfaces them and report 0 — not a guess —
 * until then.
 */
function readUsage(r: ChatResult): PhaseUsage {
  const extra = r as ChatResult & { cacheReadTokens?: unknown; cacheCreationTokens?: unknown };
  const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  return {
    inputTokens: num(r.inputTokens),
    outputTokens: num(r.outputTokens),
    cacheReadTokens: num(extra.cacheReadTokens),
    cacheCreationTokens: num(extra.cacheCreationTokens),
  };
}

// ── Phase prompt ──────────────────────────────────────────────────

/**
 * One system string per phase: static (foundation + module) first, then the
 * dynamic block, prior-phase outputs, and the phase directive. The router
 * takes `system` as a string, so the old cache_control split collapses here
 * with its order preserved; the subscription engine caches on its own.
 */
function phaseSystemPrompt(
  phase: PhaseConfig,
  staticSystemPrompt: string,
  dynamicSystemPrompt: string,
  priorPhaseContext: string,
): string {
  const dynamicWithPhase = [
    dynamicSystemPrompt,
    priorPhaseContext ? `\n\n## PRIOR PHASE CONTEXT\n${priorPhaseContext}` : '',
    `\n\n---\n${phase.systemSuffix}`,
    CHECKPOINT_PHASES.has(phase.name) ? `\n\n${CHECKPOINT_INSTRUCTION}` : '',
  ].filter(Boolean).join('');
  return [staticSystemPrompt, dynamicWithPhase].filter((s) => s.trim().length > 0).join('\n\n');
}

// ── Internal non-streaming call ────────────────────────────────────

interface InternalCallResult extends PhaseUsage, ReasoningCheckpoint {
  text: string;
  thinking: string;
  durationMs: number;
}

async function runInternalPhase(
  phase: PhaseConfig,
  config: IREConfig,
  priorPhaseContext: string,
  db: DatabaseAdapter,
): Promise<InternalCallResult> {
  const start = Date.now();

  const result = await callChat({
    model: config.model,
    system: phaseSystemPrompt(phase, config.staticSystemPrompt, config.dynamicSystemPrompt, priorPhaseContext),
    messages: routerMessages(config.messages),
    maxTokens: phase.maxTokens,
    thinkingLevel: phaseThinkingLevel(phase.thinking, config.thinkingLevel),
    db,
  });

  const { text, checkpoint } = CHECKPOINT_PHASES.has(phase.name)
    ? extractCheckpoint(result.text)
    : { text: result.text, checkpoint: { confidenceScore: null, revisionNeeded: null, nextAction: null } };

  return {
    text,
    thinking: result.thinking ?? '',
    ...readUsage(result),
    durationMs: Date.now() - start,
    ...checkpoint,
  };
}

// ── Main IRE runner ────────────────────────────────────────────────

export async function runIterativeReasoning(
  config: IREConfig,
  res: Response,
  db: DatabaseAdapter,
): Promise<IRESummary> {
  const phases = PHASE_MAP[config.thinkingLevel];
  const chainId = crypto.randomUUID();
  const totalStart = Date.now();
  const ran = describeIreModel(config.model);

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
  sendEvent({
    type: 'revelation_chain_id',
    chainId,
    engine: ran.engine,
    model: ran.model,
    modelLabel: ran.label,
    totalPhases: phases.length,
  });

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCacheReadTokens = 0;
  let totalCacheCreationTokens = 0;
  let synthesisQualityScore: number | null = null;
  let finalSynthesisText = '';

  // Build rolling context from completed phases
  const priorOutputs: Array<{ phase: string; content: string }> = [];

  const summary = (phaseCount: number, quality: number | null, synthesisText: string): IRESummary => ({
    chainId,
    phaseCount,
    totalInputTokens,
    totalOutputTokens,
    totalDurationMs: Date.now() - totalStart,
    synthesisQualityScore: quality,
    synthesisText,
    engine: ran.engine,
    model: ran.model,
    modelLabel: ran.label,
  });

  for (let i = 0; i < phases.length; i++) {
    const phase = phases[i];
    const isLastPhase = i === phases.length - 1;

    sendEvent({
      type: 'phase_start',
      phaseIndex: i,
      phaseName: phase.name,
      totalPhases: phases.length,
      thinkingLevel: phaseThinkingLevel(phase.thinking, config.thinkingLevel),
    });

    const priorContext = priorOutputs
      .map((p) => `### ${p.phase.toUpperCase()} PHASE OUTPUT\n${p.content}`)
      .join('\n\n');

    const phaseStart = Date.now();

    if (!isLastPhase) {
      // Internal non-streaming phase
      try {
        const result = await runInternalPhase(phase, config, priorContext, db);

        totalInputTokens += result.inputTokens;
        totalOutputTokens += result.outputTokens;
        totalCacheReadTokens += result.cacheReadTokens;
        totalCacheCreationTokens += result.cacheCreationTokens;

        // 2026-07-17: carry the chain's synthesis_quality_score from the model's
        // own reflect-phase confidence (the last phase to report one — typically
        // the final REFLECT before synthesis). Previously this column was declared
        // and written but NEVER assigned, so it was always NULL. This is a real
        // self-assessed signal, not a fabricated score.
        if (typeof result.confidenceScore === 'number') {
          synthesisQualityScore = result.confidenceScore;
        }

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
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Internal phase error';
        console.error(`[IRE] Phase ${phase.name} failed:`, err);
        sendEvent({ type: 'error', message: `IRE phase '${phase.name}' failed: ${msg}` });
        res.write('data: [DONE]\n\n');
        res.end();
        return summary(i, null, '');
      }
    } else {
      // Final synthesis phase — the router streams text_delta / thinking_delta
      // frames to the response itself (on every engine, the SDK one through
      // its forwarding sink) and hands back the accumulated result; the
      // envelope around them (usage, stream_end, phase_end, [DONE]) is ours.
      try {
        const result = await streamChat({
          model: config.model,
          system: phaseSystemPrompt(phase, config.staticSystemPrompt, config.dynamicSystemPrompt, priorContext),
          messages: routerMessages(config.messages),
          maxTokens: phase.maxTokens,
          thinkingLevel: phaseThinkingLevel(phase.thinking, config.thinkingLevel),
          ...(config.tools && config.tools.length > 0 ? { tools: config.tools } : {}),
          db,
        }, res);

        const usage = readUsage(result);
        const synthText = result.text ?? '';
        const synthThinking = result.thinking ?? '';

        totalInputTokens += usage.inputTokens;
        totalOutputTokens += usage.outputTokens;
        totalCacheReadTokens += usage.cacheReadTokens;
        totalCacheCreationTokens += usage.cacheCreationTokens;

        sendEvent({
          type: 'usage',
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          thinkingTokens: 0,
          cacheCreationTokens: totalCacheCreationTokens,
          cacheReadTokens: totalCacheReadTokens,
        });

        const contentBlocks: Array<{ type: string; content: string }> = [];
        if (synthThinking) contentBlocks.push({ type: 'thinking', content: synthThinking });
        if (synthText) contentBlocks.push({ type: 'text', content: synthText });

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
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
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
            usage.inputTokens,
            usage.outputTokens,
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
    ...summary(phases.length, synthesisQualityScore, finalSynthesisText),
    totalDurationMs: totalDuration,
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
