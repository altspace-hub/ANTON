/**
 * market-consul-service.ts — Markets Consul Council orchestrator.
 *
 * Runs a deliberation across N consul personas (defined by prompt files in
 * server/prompts/market-consul-*.md), then a synthesis pass. Each pass
 * persists into revelation_chains + revelation_steps so the deliberation is
 * an audit-grade trail (reuses IRE persistence — no new trail format).
 *
 * Shipped per ANTON_Improvement_and_Investigation_Brief.md §E.4.
 */

import path from 'path';
import fs from 'fs/promises';
import { randomUUID } from 'crypto';
import type Anthropic from '@anthropic-ai/sdk';
import type { DatabaseAdapter } from '../db/database.js';
import { callSync } from './claude-client.js';

export interface ConsulMember {
  /** Stable id used for performance tracking. */
  id: string;
  /** Display label. */
  name: string;
  /** Path (relative to server/prompts) to the consul's system prompt. */
  promptFile: string;
}

const COUNCIL_MEMBERS: ReadonlyArray<ConsulMember> = [
  { id: 'macro-strategist', name: 'Macro Strategist', promptFile: 'market-consul-macro-strategist.md' },
  { id: 'sector-analyst',   name: 'Sector Analyst',   promptFile: 'market-consul-sector-analyst.md' },
  { id: 'risk-assessor',    name: 'Risk Assessor',    promptFile: 'market-consul-risk-assessor.md' },
  { id: 'contrarian',       name: 'Contrarian',       promptFile: 'market-consul-contrarian.md' },
];

const SYNTHESIS_PROMPT_FILE = 'market-consul-synthesis.md';

export interface DeliberationInput {
  /** Subject of the deliberation — e.g. a thesis id, pattern id, or free-form topic. */
  subject: string;
  /** Free-text context the consuls should consider (atoms, why-chain, market data summary). */
  context: string;
  /** Which model to use. Defaults to claude-opus-4-8. */
  model?: 'claude-opus-4-8' | 'claude-sonnet-4-6' | 'claude-sonnet-4-5-20250929' | 'claude-haiku-4-5-20251001';
  /** Optional subset of consul ids; defaults to all four. */
  consulIds?: string[];
}

export interface ConsulContribution {
  consulId: string;
  consulName: string;
  contribution: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
}

export interface DeliberationResult {
  chainId: string;
  contributions: ConsulContribution[];
  synthesis: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalDurationMs: number;
}

const PROMPTS_DIR = path.resolve(process.cwd(), 'server', 'prompts');

async function loadPrompt(file: string): Promise<string> {
  const fullPath = path.join(PROMPTS_DIR, file);
  return await fs.readFile(fullPath, 'utf-8');
}

export async function runDeliberation(
  db: DatabaseAdapter,
  client: Anthropic,
  input: DeliberationInput
): Promise<DeliberationResult> {
  const t0 = Date.now();
  const model = input.model ?? 'claude-opus-4-8';
  const members = input.consulIds
    ? COUNCIL_MEMBERS.filter(m => input.consulIds!.includes(m.id))
    : [...COUNCIL_MEMBERS];

  if (members.length === 0) {
    throw new Error('No consul members selected for deliberation');
  }

  // Persist a revelation_chains row up-front so steps can reference it.
  const chainId = randomUUID();
  await db.run(
    `INSERT INTO revelation_chains (id, session_id, message_id, thinking_level, phase_count, created_at)
     VALUES (?, ?, ?, ?, ?, NOW())`,
    chainId, null, null, 'consul_deliberation', members.length + 1
  );

  // ── Phase 1: each consul contributes in parallel ────────────────────
  const contributions: ConsulContribution[] = [];
  let totalIn = 0, totalOut = 0;

  // Run consul prompts in parallel — they don't depend on each other.
  const consulPromises = members.map(async (member, idx) => {
    const startedAt = Date.now();
    const promptBody = await loadPrompt(member.promptFile);
    const userMsg = `Subject of deliberation: ${input.subject}\n\nContext:\n${input.context}\n\nProvide your contribution from your role's perspective. Be concise but specific. Cite reasoning, not just conclusions.`;
    const result = await callSync({
      model,
      thinking: 'think',
      system: promptBody,
      messages: [{ role: 'user', content: userMsg }],
    });
    const durationMs = Date.now() - startedAt;
    // Persist as a revelation_step.
    await db.run(
      `INSERT INTO revelation_steps (id, chain_id, step_index, phase_name, content, input_tokens, output_tokens, duration_ms, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      randomUUID(), chainId, idx, member.id,
      result.text, result.inputTokens, result.outputTokens, durationMs
    );
    return {
      consulId: member.id,
      consulName: member.name,
      contribution: result.text,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      durationMs,
    } satisfies ConsulContribution;
  });

  const settled = await Promise.allSettled(consulPromises);
  for (const r of settled) {
    if (r.status === 'fulfilled') {
      contributions.push(r.value);
      totalIn += r.value.inputTokens;
      totalOut += r.value.outputTokens;
    } else {
      console.warn('[consul-deliberation] member failed:', r.reason);
    }
  }

  if (contributions.length === 0) {
    throw new Error('All consul contributions failed');
  }

  // ── Phase 2: synthesis ──────────────────────────────────────────────
  const synthesisPrompt = await loadPrompt(SYNTHESIS_PROMPT_FILE);
  const synthesisInput = [
    `Subject: ${input.subject}`,
    `Original context:\n${input.context}`,
    '',
    'Council contributions:',
    ...contributions.map(c => `\n--- ${c.consulName} (${c.consulId}) ---\n${c.contribution}`),
    '',
    'Synthesise the council\'s deliberation into a single, well-structured output. Resolve disagreements explicitly; flag where the council was unable to reach consensus.',
  ].join('\n');

  const synthesisStarted = Date.now();
  const synthesisResult = await callSync({
    model,
    thinking: 'think_hard',
    system: synthesisPrompt,
    messages: [{ role: 'user', content: synthesisInput }],
  });
  const synthDuration = Date.now() - synthesisStarted;
  totalIn += synthesisResult.inputTokens;
  totalOut += synthesisResult.outputTokens;

  await db.run(
    `INSERT INTO revelation_steps (id, chain_id, step_index, phase_name, content, input_tokens, output_tokens, duration_ms, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    randomUUID(), chainId, members.length, 'synthesis',
    synthesisResult.text, synthesisResult.inputTokens, synthesisResult.outputTokens, synthDuration
  );

  // ── Update chain totals ─────────────────────────────────────────────
  const totalDuration = Date.now() - t0;
  await db.run(
    `UPDATE revelation_chains SET
       total_input_tokens = ?,
       total_output_tokens = ?,
       total_duration_ms = ?
     WHERE id = ?`,
    totalIn, totalOut, totalDuration, chainId
  );

  return {
    chainId,
    contributions,
    synthesis: synthesisResult.text,
    totalInputTokens: totalIn,
    totalOutputTokens: totalOut,
    totalDurationMs: totalDuration,
  };
}

/** Public catalogue of council members — used by the UI to render the panel. */
export function listCouncilMembers(): ReadonlyArray<ConsulMember> {
  return COUNCIL_MEMBERS;
}
