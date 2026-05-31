// ── Beehive — Convergence, Synthesis, Output ────────────────────────────────
//
// Phase 3:
//  • generateSynthesis        — LLM-drafts the convergence synthesis from the
//                              full reasoning trail
//  • approveOrDissent         — record participant approval / formal dissent
//  • concludeHive             — finalize: compute approvals, persist output
//  • buildConvergencePath     — track how positions shifted across rounds
//
// Synthesis explicitly preserves dissents. Minority positions are NEVER
// averaged away — they appear with full attribution in the final output.

import { randomUUID } from 'crypto';
import type { DatabaseAdapter } from '../../db/database.js';
import { createBeehiveState } from './beehive-state.js';
import { createBeehiveDeliberation } from './beehive-deliberation.js';
import { callChat, mapModelToProvider, type StreamChatConfig, type ChatResult } from '../provider-router.js';

/** Hard timeout wrapper around callChat — 180s for the deep synthesis call. */
async function callChatWithTimeout(config: StreamChatConfig, timeoutMs = 180_000): Promise<ChatResult> {
  return Promise.race<ChatResult>([
    callChat(config),
    new Promise<ChatResult>((_, reject) =>
      setTimeout(() => reject(new Error(`LLM call timed out after ${timeoutMs}ms`)), timeoutMs),
    ),
  ]);
}
import type {
  Hive,
  HiveContribution,
  HiveOutput,
  HiveParticipant,
  DeliberationRound,
  DissentRecord,
  ConvergencePathStep,
  OutputFormat,
  ConsensusMode,
} from './types.js';

// ── Helpers ────────────────────────────────────────────────────────────────

function nowIso(): string { return new Date().toISOString(); }
function newOutputId(): string {
  return `output_${Date.now()}_${randomUUID().slice(0, 8)}`;
}

function asNumber(v: unknown, fallback = 0): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') { const n = Number(v); return Number.isFinite(n) ? n : fallback; }
  return fallback;
}

// ── Service factory ────────────────────────────────────────────────────────

export async function createBeehiveSynthesis(db: DatabaseAdapter) {
  const state = createBeehiveState(db);
  const deliberation = await createBeehiveDeliberation(db);

  /**
   * Generate the convergence synthesis using Opus 4.8 with deep reasoning.
   * Returns the draft text WITHOUT persisting it yet — concludeHive does that.
   */
  async function generateSynthesisDraft(hiveId: string): Promise<{ synthesis: string; reasoning: string; dissents: DissentRecord[] }> {
    const stateData = await state.loadFullState(hiveId);
    if (!stateData) throw new Error('Hive not found');
    const { hive, participants, rounds } = stateData;

    const allContributions = await deliberation.listContributions(hiveId);
    const dissents = collectDissents(allContributions, participants);

    const trailBlock = buildContributionTrail(rounds, allContributions, participants);
    const consensusProgression = rounds.map(r => `Round ${r.round_number}: ${r.consensus_temperature != null ? `${(r.consensus_temperature * 100).toFixed(0)}%` : '—'}`).join(' → ');

    const result = await callChatWithTimeout({
      model: mapModelToProvider('claude-opus-4-8'),
      system: buildSynthesisSystemPrompt(hive.governance.consensus_mode, hive.governance.output_format, dissents.length > 0),
      messages: [{
        role: 'user',
        content: `HIVE: ${hive.name}
TYPE: ${hive.type}
QUESTION: ${hive.question}
${hive.description ? `CONTEXT: ${hive.description}\n` : ''}
PARTICIPANTS: ${participants.filter(p => p.invitation_status === 'joined').map(p => `${p.display_name} (${p.role})`).join(', ')}
ROUNDS: ${rounds.length}
CONSENSUS PROGRESSION: ${consensusProgression}

COMPLETE REASONING TRAIL:

${trailBlock}

Produce the final synthesis now.`,
      }],
      maxTokens: 16000,
      thinkingLevel: 'investigate',
    });

    return {
      synthesis: result.text.trim(),
      reasoning: result.thinking,
      dissents,
    };
  }

  /**
   * Record a participant's approval or formal dissent on the current synthesis.
   * Dissent records are preserved in the final output with full attribution.
   */
  async function approveOrDissent(
    hiveId: string,
    contactHash: string,
    action: 'approve' | 'dissent',
    dissentContent?: string,
  ): Promise<HiveContribution | null> {
    const stateData = await state.loadFullState(hiveId);
    if (!stateData) throw new Error('Hive not found');
    if (stateData.hive.status !== 'converging') {
      throw new Error('Hive must be in converging status to approve or dissent');
    }
    const participant = stateData.participants.find(p => p.anton_contact_hash === contactHash);
    if (!participant) throw new Error('Not a participant of this hive');
    if (participant.role === 'observer') throw new Error('Observers cannot approve or dissent');

    if (action === 'approve') {
      // Approval is a tiny "synthesis"-type contribution in the convergence round.
      return deliberation.submitContribution(hiveId, {
        contributorHash: contactHash,
        type: 'synthesis',
        content: '✓ Approves the synthesis as drafted.',
        confidence: 0.9,
      });
    }
    if (!dissentContent || !dissentContent.trim()) {
      throw new Error('Dissent must include a written explanation');
    }
    return deliberation.submitContribution(hiveId, {
      contributorHash: contactHash,
      type: 'dissent',
      content: dissentContent.trim(),
      confidence: 0.95,
    });
  }

  /**
   * Conclude a hive: persist the final output (synthesis + dissents +
   * reasoning trail + convergence path), update status to `concluded`.
   * Only the Queen can conclude.
   */
  async function concludeHive(hiveId: string, queenHash: string, synthesisOverride?: string): Promise<HiveOutput> {
    const stateData = await state.loadFullState(hiveId);
    if (!stateData) throw new Error('Hive not found');
    const { hive, participants, rounds } = stateData;
    if (hive.created_by !== queenHash) throw new Error('Only the Queen can conclude');

    // Atomic status transition: claim conclusion by flipping
    // active|forming|converging → concluding. Returns existing output if a
    // concurrent caller already owns the conclusion.
    const claim = await db.run(
      `UPDATE beehive_sessions
       SET status = 'converging', updated_at = NOW()
       WHERE id = ? AND status IN ('forming', 'active', 'converging')`,
      hiveId,
    );
    if (claim.changes === 0) {
      // Hive is already concluded or archived — return existing output if any
      const existing = await state.getOutput(hiveId);
      if (existing) return existing;
      throw new Error(`Hive cannot be concluded from status ${hive.status}`);
    }

    // Bail out cheaply if another caller already wrote an output between the
    // two statements above and the synthesis call below (rare but possible).
    const earlyExisting = await state.getOutput(hiveId);
    if (earlyExisting) return earlyExisting;

    // Generate or reuse the synthesis text (this can take 30-90s on Opus 4.8)
    let synthesisText: string;
    let dissents: DissentRecord[];
    if (synthesisOverride && synthesisOverride.trim()) {
      synthesisText = synthesisOverride.trim();
      const allContribs = await deliberation.listContributions(hiveId);
      dissents = collectDissents(allContribs, participants);
    } else {
      const draft = await generateSynthesisDraft(hiveId);
      synthesisText = draft.synthesis;
      dissents = draft.dissents;
    }

    const allContributions = await deliberation.listContributions(hiveId);
    const convergencePath = buildConvergencePath(rounds, allContributions);
    const approvals = computeApprovals(allContributions, participants);

    // Close the convergence round if still open
    const lastRound = rounds[rounds.length - 1];
    if (lastRound && !lastRound.ended_at) {
      const summary = await deliberation.generateRoundSummary(hive, lastRound, allContributions.filter(c => c.round === lastRound.round_number));
      await db.run(
        `UPDATE beehive_rounds SET summary = ?, ended_at = NOW() WHERE id = ?`,
        summary, lastRound.id,
      );
    }

    const outputId = newOutputId();
    const concludedAt = nowIso();
    // Idempotent INSERT — UNIQUE(hive_id) on beehive_outputs makes the second
    // racer's write a no-op rather than a 500.
    await db.run(
      `INSERT INTO beehive_outputs
        (id, hive_id, output_type, synthesis_text, dissents, reasoning_trail,
         convergence_path, participant_approvals, output_file_path, quality_score, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (hive_id) DO NOTHING`,
      outputId, hiveId, hive.governance.output_format ?? 'synthesis_report',
      synthesisText,
      JSON.stringify(dissents),
      JSON.stringify(allContributions),
      JSON.stringify(convergencePath),
      JSON.stringify(approvals),
      null, null, concludedAt,
    );

    await state.updateHiveStatus(hiveId, 'concluded', concludedAt);

    const output = await state.getOutput(hiveId);
    if (!output) throw new Error('Output disappeared after insert');
    return output;
  }

  return {
    generateSynthesisDraft,
    approveOrDissent,
    concludeHive,
    buildConvergencePath,
    collectDissents,
    computeApprovals,
  };
}

export type BeehiveSynthesis = Awaited<ReturnType<typeof createBeehiveSynthesis>>;

// ── Pure helpers (also exported for testing) ───────────────────────────────

export function collectDissents(
  contributions: HiveContribution[],
  participants: HiveParticipant[],
): DissentRecord[] {
  return contributions
    .filter(c => c.type === 'dissent')
    .map(c => {
      const p = participants.find(p => p.anton_contact_hash === c.contributor_hash);
      return {
        contributor_hash: c.contributor_hash,
        contributor_display_name: p?.display_name ?? c.contributor_hash.slice(-12),
        content: c.content,
        references_contributions: c.references_contributions,
        created_at: c.created_at,
      };
    });
}

export function computeApprovals(
  contributions: HiveContribution[],
  participants: HiveParticipant[],
): Record<string, 'approved' | 'dissented' | 'abstained'> {
  const out: Record<string, 'approved' | 'dissented' | 'abstained'> = {};
  // Look at convergence-phase contributions
  const dissenters = new Set(contributions.filter(c => c.type === 'dissent').map(c => c.contributor_hash));
  const approvers = new Set(
    contributions
      .filter(c => c.type === 'synthesis' && /\b(approves?|✓)/i.test(c.content))
      .map(c => c.contributor_hash),
  );
  for (const p of participants) {
    if (p.invitation_status !== 'joined' || p.role === 'observer') continue;
    if (dissenters.has(p.anton_contact_hash)) out[p.anton_contact_hash] = 'dissented';
    else if (approvers.has(p.anton_contact_hash)) out[p.anton_contact_hash] = 'approved';
    else out[p.anton_contact_hash] = 'abstained';
  }
  return out;
}

export function buildConvergencePath(
  rounds: DeliberationRound[],
  contributions: HiveContribution[],
): ConvergencePathStep[] {
  return rounds.map(r => {
    const roundContribs = contributions.filter(c => c.round === r.round_number);
    const revisions = roundContribs.filter(c => c.type === 'revision').map(c => c.contributor_hash);
    return {
      round: r.round_number,
      consensus_temperature: r.consensus_temperature ?? 0,
      summary: r.summary ?? '',
      shifted_positions: Array.from(new Set(revisions)),
    };
  });
}

// ── Prompt builder ─────────────────────────────────────────────────────────

function buildSynthesisSystemPrompt(consensusMode: ConsensusMode | undefined, outputFormat: OutputFormat | undefined, hasDissents: boolean): string {
  return `You are the Queen of a BEEHIVE multi-party reasoning session, producing the final synthesis from a complete deliberation trail.

CONSENSUS MODE: ${consensusMode ?? 'majority'}
OUTPUT FORMAT: ${outputFormat ?? 'synthesis_report'}

YOUR JOB:
1. Identify where the group converged and articulate that conclusion clearly.
2. Identify where disagreement persists and present it transparently.
3. Cite the strongest evidence and the contributions that introduced it.
4. **Preserve formal dissents.** ${hasDissents ? 'There are formal dissents in this session — they MUST appear in the output with full attribution and reasoning.' : 'No formal dissents were filed.'}
5. Note remaining uncertainties and recommended follow-up investigations.

QUALITY BAR:
- Do not paper over real disagreement. The group is wiser when it preserves minority positions.
- Attribute claims to specific contributors when material.
- Use Markdown structure: H2 sections for Conclusion, Reasoning Path, Evidence Base, Dissenting Positions (if any), Recommendations.
- Keep total length to roughly 800-2000 words. Density over verbosity.
- Do not introduce new analysis that wasn't in the deliberation trail.

OUTPUT: Markdown only. No preamble. No JSON. Begin with "## Conclusion".`;
}

function buildContributionTrail(
  rounds: DeliberationRound[],
  contributions: HiveContribution[],
  participants: HiveParticipant[],
): string {
  const nameOf = (hash: string) => participants.find(p => p.anton_contact_hash === hash)?.display_name ?? hash.slice(-12);
  const out: string[] = [];
  for (const round of rounds) {
    out.push(`### ROUND ${round.round_number} — ${round.phase}`);
    if (round.summary) out.push(`Round summary: ${round.summary}`);
    const roundContribs = contributions.filter(c => c.round === round.round_number);
    if (roundContribs.length === 0) {
      out.push('(no contributions)');
    } else {
      for (const c of roundContribs) {
        out.push(`- **${nameOf(c.contributor_hash)}** [${c.type}, conf ${c.confidence.toFixed(2)}]: ${c.content}`);
      }
    }
    out.push('');
  }
  return out.join('\n');
}
