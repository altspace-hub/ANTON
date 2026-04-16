// ── Beehive — Deliberation Engine ───────────────────────────────────────────
//
// Round management, contribution submission, consensus measurement, round
// summaries, and auto-generated contributions. Sits above beehive-state and
// uses the existing community signing service for Ed25519 signatures.
//
// Phase 2 deliberately keeps the LLM calls non-streaming (callChat) since we
// store the full text per contribution. Phase 4 will wire AAP delivery and
// state replication on top of these primitives.

import { randomUUID } from 'crypto';
import type { DatabaseAdapter } from '../../db/database.js';
import { createBeehiveState } from './beehive-state.js';
import { createBeehiveKnowledge } from './beehive-knowledge.js';
import { createSigningService } from '../community-signing-service.js';
import { callChat, type StreamChatConfig, type ChatResult } from '../provider-router.js';

/**
 * Wrap callChat in a hard timeout so a hung LLM provider can't block the
 * request indefinitely. Default 90s covers investigate-level Opus calls.
 */
async function callChatWithTimeout(config: StreamChatConfig, timeoutMs = 90_000): Promise<ChatResult> {
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
  HiveParticipant,
  ContributionType,
  RoundPhase,
  DeliberationRound,
  SharedAtom,
} from './types.js';

// ── Types ──────────────────────────────────────────────────────────────────

export interface SubmitContributionInput {
  contributorHash: string;
  type: ContributionType;
  content: string;
  supportingAtoms?: SharedAtom[];
  references?: string[];           // contribution IDs this builds on / challenges
  confidence?: number;
  reasoningTrace?: string;
}

export interface GenerateContributionParams {
  asContactHash: string;
  asDisplayName: string;
  type: ContributionType;
  /** Optional hint to the LLM (e.g. "argue against contribution X") */
  hint?: string;
  /** Atoms the participant chooses to disclose with this contribution */
  supportingAtoms: SharedAtom[];
  /** Private guidance from the human (only injected for own contributions) */
  humanGuidance?: string;
  references?: string[];
}

interface ConsensusResult {
  temperature: number;             // 0..1
  rationale: string;
  agreementClusters: string[];     // brief summaries of points-of-agreement
  disagreements: string[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

function nowIso(): string { return new Date().toISOString(); }
function newContributionId(): string {
  return `contrib_${Date.now()}_${randomUUID().slice(0, 8)}`;
}

function clampConfidence(n: number | undefined): number {
  if (typeof n !== 'number' || !Number.isFinite(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}

function asNumber(v: unknown, fallback = 0): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') { const n = Number(v); return Number.isFinite(n) ? n : fallback; }
  return fallback;
}

interface ContributionRow {
  id: string;
  hive_id: string;
  round: number;
  contributor_hash: string;
  type: string;
  content: string;
  supporting_atoms: unknown;
  references_contributions: unknown;
  confidence: number | string;
  reasoning_trace: string | null;
  signature: string;
  sequence: number | string;
  created_at: string;
}

// ── Service factory ────────────────────────────────────────────────────────

export async function createBeehiveDeliberation(db: DatabaseAdapter) {
  const state = createBeehiveState(db);
  const knowledge = createBeehiveKnowledge(db);
  const signing = await createSigningService(db);

  // Cache identity for fast signing
  let cachedIdentity: { contact_hash: string; private_key_encrypted: string | null } | null = null;
  async function getLocalIdentity() {
    if (cachedIdentity) return cachedIdentity;
    const row = await db.get<{ contact_hash: string; private_key_encrypted: string | null }>(
      `SELECT contact_hash, private_key_encrypted FROM community_identity WHERE user_id = 'default'`,
    );
    cachedIdentity = row ?? null;
    return cachedIdentity;
  }

  // ── Round management ─────────────────────────────────────────────────────

  /**
   * Start the next round of a hive. Phase is inferred from current state:
   *   round 0 → Round 1 OPENING
   *   round N → Round N+1 DELIBERATION (until convergence is triggered)
   *
   * The current round (if any) is closed first. Activates the hive on Round 1.
   */
  async function startNextRound(hiveId: string, queenHash: string): Promise<DeliberationRound> {
    const hive = await state.getHive(hiveId);
    if (!hive) throw new Error('Hive not found');
    if (hive.created_by !== queenHash) throw new Error('Only the Queen can advance rounds');
    if (hive.status === 'concluded' || hive.status === 'archived') {
      throw new Error(`Cannot start a round on a ${hive.status} hive`);
    }
    if (hive.status === 'converging') {
      throw new Error('Hive is in convergence; trigger conclude instead of advance');
    }

    const existing = await state.listRounds(hiveId);
    const last = existing[existing.length - 1];

    if (last && !last.ended_at) {
      // Close the previous round first — generate summary if not already there
      if (!last.summary) {
        const contributions = await listContributions(hiveId, last.round_number);
        const summary = contributions.length > 0
          ? await generateRoundSummary(hive, last, contributions)
          : 'No contributions submitted in this round.';
        await db.run(
          `UPDATE beehive_rounds SET summary = ?, ended_at = NOW() WHERE id = ?`,
          summary, last.id,
        );
      } else {
        await db.run(`UPDATE beehive_rounds SET ended_at = NOW() WHERE id = ?`, last.id);
      }
    }

    const nextNumber = (last?.round_number ?? 0) + 1;
    const phase: RoundPhase = nextNumber === 1 ? 'opening' : 'deliberation';

    await db.run(
      `INSERT INTO beehive_rounds (hive_id, round_number, phase, started_at)
       VALUES (?, ?, ?, NOW())`,
      hiveId, nextNumber, phase,
    );

    // Promote hive status to active on Round 1
    if (nextNumber === 1 && hive.status === 'forming') {
      await state.updateHiveStatus(hiveId, 'active');
    }
    await state.updateConsensusTemperature(hiveId, hive.consensus_temperature, nextNumber);

    const rounds = await state.listRounds(hiveId);
    const created = rounds.find(r => r.round_number === nextNumber);
    if (!created) throw new Error('Round creation failed');
    return created;
  }

  /** Convergence phase: triggered when threshold met OR Queen decides. */
  async function triggerConvergence(hiveId: string, queenHash: string): Promise<DeliberationRound> {
    const hive = await state.getHive(hiveId);
    if (!hive) throw new Error('Hive not found');
    if (hive.created_by !== queenHash) throw new Error('Only the Queen can trigger convergence');
    if (hive.status !== 'active' && hive.status !== 'forming') {
      throw new Error(`Cannot trigger convergence from ${hive.status}`);
    }

    const rounds = await state.listRounds(hiveId);
    const last = rounds[rounds.length - 1];
    if (last && !last.ended_at) {
      const contributions = await listContributions(hiveId, last.round_number);
      const summary = contributions.length > 0
        ? await generateRoundSummary(hive, last, contributions)
        : 'No contributions submitted in this round.';
      await db.run(
        `UPDATE beehive_rounds SET summary = ?, ended_at = NOW() WHERE id = ?`,
        summary, last.id,
      );
    }

    const nextNumber = (last?.round_number ?? 0) + 1;
    await db.run(
      `INSERT INTO beehive_rounds (hive_id, round_number, phase, started_at)
       VALUES (?, ?, 'convergence', NOW())`,
      hiveId, nextNumber,
    );
    await state.updateHiveStatus(hiveId, 'converging');
    await state.updateConsensusTemperature(hiveId, hive.consensus_temperature, nextNumber);

    const updated = await state.listRounds(hiveId);
    const created = updated.find(r => r.round_number === nextNumber);
    if (!created) throw new Error('Convergence round creation failed');
    return created;
  }

  // ── Contributions ────────────────────────────────────────────────────────

  /**
   * Submit a contribution. Signs with the local Ed25519 key, assigns the next
   * monotonic sequence number for this (hive, contributor), and persists.
   * Bumps the participant's contribution_count and last_active_at.
   */
  async function submitContribution(hiveId: string, input: SubmitContributionInput): Promise<HiveContribution> {
    const hive = await state.getHive(hiveId);
    if (!hive) throw new Error('Hive not found');
    if (hive.status === 'concluded' || hive.status === 'archived') {
      throw new Error(`Cannot contribute to a ${hive.status} hive`);
    }

    const participant = await state.getParticipant(hiveId, input.contributorHash);
    if (!participant) throw new Error('Contributor is not a participant of this hive');
    if (participant.role === 'observer') throw new Error('Observers cannot contribute');
    if (participant.invitation_status !== 'joined' || participant.status === 'left') {
      throw new Error('Participant has not joined or has left the hive');
    }

    const rounds = await state.listRounds(hiveId);
    const currentRound = rounds.find(r => !r.ended_at);
    if (!currentRound) {
      throw new Error('No active round — Queen must start a round before contributions can be submitted');
    }

    const contributionId = newContributionId();
    const supportingAtoms = input.supportingAtoms ?? [];
    const references = input.references ?? [];
    const confidence = clampConfidence(input.confidence);
    const identity = await getLocalIdentity();

    // Sequence allocation + insert + counter updates run inside a transaction.
    // Migration 114 adds UNIQUE (hive_id, contributor_hash, sequence), so a
    // concurrent racing tx that picks the same sequence will violate the
    // constraint — we catch and retry up to MAX_SEQ_RETRIES times.
    const MAX_SEQ_RETRIES = 5;
    let attempt = 0;

    while (true) {
      try {
        await db.transaction(async (tx) => {
          const sequenceRow = await tx.get<{ s: number | string }>(
            `SELECT COALESCE(MAX(sequence), 0)::bigint AS s FROM beehive_contributions
             WHERE hive_id = ? AND contributor_hash = ?`,
            hiveId, input.contributorHash,
          );
          const nextSequence = asNumber(sequenceRow?.s ?? 0) + 1;

          // Sign the canonical content (deterministic JSON).
          const canonicalPayload = JSON.stringify({
            hive_id: hiveId,
            round: currentRound.round_number,
            contributor: input.contributorHash,
            type: input.type,
            content: input.content,
            sequence: nextSequence,
            timestamp: nowIso(),
          });
          // In v1 local mode all contributions are signed by the local key. Phase 4
          // will require contributorHash == local identity for self-contributions
          // and accept verified signatures from peers for theirs.
          const signature = signing.ed25519Sign(canonicalPayload, identity?.private_key_encrypted ?? null);

          await tx.run(
            `INSERT INTO beehive_contributions
              (id, hive_id, round, contributor_hash, type, content,
               supporting_atoms, references_contributions, confidence,
               reasoning_trace, signature, sequence)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            contributionId, hiveId, currentRound.round_number, input.contributorHash,
            input.type, input.content,
            JSON.stringify(supportingAtoms), JSON.stringify(references), confidence,
            input.reasoningTrace ?? null, signature, nextSequence,
          );

          // Update participant + round counters in the same tx
          await tx.run(
            `UPDATE beehive_participants
             SET contribution_count = contribution_count + 1, last_active_at = NOW()
             WHERE hive_id = ? AND anton_contact_hash = ?`,
            hiveId, input.contributorHash,
          );
          await tx.run(
            `UPDATE beehive_rounds SET contribution_count = contribution_count + 1 WHERE id = ?`,
            currentRound.id,
          );
        });
        break; // success
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const isSequenceConflict = /uq_beehive_contrib_hive_contrib_seq/i.test(msg) || /duplicate key|unique constraint/i.test(msg);
        if (isSequenceConflict && attempt < MAX_SEQ_RETRIES) {
          attempt++;
          continue;
        }
        throw err;
      }
    }

    // Persist disclosed atoms outside the tx — audit trail; failure here
    // shouldn't roll back the contribution itself.
    if (supportingAtoms.length > 0) {
      await knowledge.recordSharedAtoms(hiveId, contributionId, input.contributorHash, supportingAtoms);
    }

    const row = await db.get<ContributionRow>(
      `SELECT * FROM beehive_contributions WHERE id = ?`,
      contributionId,
    );
    if (!row) throw new Error('Contribution disappeared after insert');
    return state.rowToContribution(row);
  }

  /**
   * Generate a contribution via LLM, taking into account the participant's
   * role, recent contributions, and disclosed atoms. Returns a ready-to-edit
   * draft (NOT yet persisted — submitContribution does that).
   *
   * In v1 local mode this is the primary way to populate hives: the user
   * triggers it for each invited participant to simulate the deliberation.
   */
  async function generateContributionDraft(
    hiveId: string,
    params: GenerateContributionParams,
  ): Promise<{ draft: string; reasoning: string; modelUsed: string }> {
    const hive = await state.getHive(hiveId);
    if (!hive) throw new Error('Hive not found');

    const rounds = await state.listRounds(hiveId);
    const currentRound = rounds.find(r => !r.ended_at);
    if (!currentRound) throw new Error('No active round');

    const allContributions = await listContributions(hiveId);
    const otherParticipants = (await state.listParticipants(hiveId))
      .filter(p => p.invitation_status === 'joined' && p.anton_contact_hash !== params.asContactHash);

    const systemPrompt = buildContributionPrompt({
      hive,
      round: currentRound,
      asDisplayName: params.asDisplayName,
      asRole: (await state.getParticipant(hiveId, params.asContactHash))?.role ?? 'worker',
      contributionType: params.type,
      otherParticipantNames: otherParticipants.map(p => p.display_name),
      priorContributions: allContributions,
      myAtoms: params.supportingAtoms,
      humanGuidance: params.humanGuidance,
      hint: params.hint,
      references: params.references ?? [],
    });

    const result = await callChatWithTimeout({
      model: 'claude-sonnet-4-6',
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: `Compose your ${params.type} contribution to Round ${currentRound.round_number}. Speak in first person as ${params.asDisplayName}. Output the contribution text only — no preamble, no markdown headers, no role labels.`,
      }],
      maxTokens: 2048,
      thinkingLevel: 'think',
    });

    return {
      draft: result.text.trim(),
      reasoning: result.thinking,
      modelUsed: 'claude-sonnet-4-6',
    };
  }

  // ── Listing ──────────────────────────────────────────────────────────────

  async function listContributions(hiveId: string, round?: number): Promise<HiveContribution[]> {
    const rows = round !== undefined
      ? await db.all<ContributionRow>(
          `SELECT * FROM beehive_contributions WHERE hive_id = ? AND round = ? ORDER BY sequence ASC, created_at ASC`,
          hiveId, round,
        )
      : await db.all<ContributionRow>(
          `SELECT * FROM beehive_contributions WHERE hive_id = ? ORDER BY round ASC, sequence ASC, created_at ASC`,
          hiveId,
        );
    return rows.map(state.rowToContribution);
  }

  // ── Round summary + consensus ────────────────────────────────────────────

  async function generateRoundSummary(
    hive: Hive,
    round: DeliberationRound,
    contributions: HiveContribution[],
  ): Promise<string> {
    if (contributions.length === 0) return 'No contributions submitted in this round.';

    const block = contributions.map((c, i) =>
      `[${i + 1}] ${c.contributor_hash.slice(-8)} (${c.type}, conf ${c.confidence.toFixed(2)}):\n${c.content}`,
    ).join('\n\n');

    const result = await callChatWithTimeout({
      model: 'claude-sonnet-4-6',
      system: `You are summarising one round of a multi-party reasoning deliberation in the BEEHIVE protocol.
Produce a tight Markdown summary (≤200 words) covering:
- the dominant positions in this round
- key points of agreement
- key points of disagreement / tension
- evidence introduced (atoms / data)
- any explicit dissent

Be neutral. Attribute claims to contributors when material. Do not evaluate quality.`,
      messages: [{
        role: 'user',
        content: `HIVE: ${hive.name}\nQUESTION: ${hive.question}\n\nROUND ${round.round_number} (${round.phase}) CONTRIBUTIONS:\n\n${block}\n\nSummarise this round.`,
      }],
      maxTokens: 800,
      thinkingLevel: 'think',
    });
    return result.text.trim();
  }

  /**
   * Use an LLM to score the consensus level across contributions in the
   * latest round. Returns a 0..1 temperature where:
   *   1.0 = total agreement on a position
   *   0.5 = mixed / partial alignment
   *   0.0 = irreconcilable disagreement
   */
  async function measureConsensus(
    hiveId: string,
    contributions: HiveContribution[],
  ): Promise<ConsensusResult> {
    if (contributions.length === 0) {
      return { temperature: 0, rationale: 'No contributions to measure.', agreementClusters: [], disagreements: [] };
    }
    if (contributions.length === 1) {
      return { temperature: 0.5, rationale: 'Only one contribution — consensus undefined.', agreementClusters: [], disagreements: [] };
    }

    const block = contributions.map((c, i) =>
      `[${i + 1}] ${c.contributor_hash.slice(-8)} (${c.type}):\n${c.content}`,
    ).join('\n\n');

    const result = await callChatWithTimeout({
      model: 'claude-sonnet-4-6',
      system: `You are measuring consensus across reasoning contributions in a multi-party deliberation.
Output ONLY a single JSON object on one line, no preamble, no markdown fences:
{"temperature": <0.0..1.0>, "rationale": "<one sentence>", "agreement_clusters": ["<short bullet>", ...], "disagreements": ["<short bullet>", ...]}

Scoring:
  1.0 = participants converge on the same conclusion
  0.7-0.9 = broad agreement with refinements
  0.4-0.6 = partial alignment, real differences remain
  0.0-0.3 = irreconcilable positions

Count formal dissents (type: dissent) as strong disagreement signals.`,
      messages: [{
        role: 'user',
        content: `Measure consensus across these contributions:\n\n${block}`,
      }],
      maxTokens: 600,
      thinkingLevel: 'think',
    });

    const parsed = parseJsonObject<{ temperature: number; rationale: string; agreement_clusters?: string[]; disagreements?: string[] }>(result.text);
    if (!parsed) {
      return { temperature: 0.5, rationale: 'Consensus measurement failed to parse.', agreementClusters: [], disagreements: [] };
    }

    const temperature = Math.max(0, Math.min(1, asNumber(parsed.temperature, 0.5)));
    return {
      temperature,
      rationale: parsed.rationale ?? '',
      agreementClusters: parsed.agreement_clusters ?? [],
      disagreements: parsed.disagreements ?? [],
    };
  }

  /** Recalculates consensus for the latest round and persists it. */
  async function refreshConsensusForCurrentRound(hiveId: string): Promise<ConsensusResult> {
    const rounds = await state.listRounds(hiveId);
    const current = rounds[rounds.length - 1];
    if (!current) return { temperature: 0, rationale: 'No rounds yet.', agreementClusters: [], disagreements: [] };

    const contributions = await listContributions(hiveId, current.round_number);
    const result = await measureConsensus(hiveId, contributions);

    await db.run(
      `UPDATE beehive_rounds SET consensus_temperature = ? WHERE id = ?`,
      result.temperature, current.id,
    );
    await state.updateConsensusTemperature(hiveId, result.temperature, current.round_number);
    return result;
  }

  // ── Human injection ──────────────────────────────────────────────────────

  async function recordHumanInjection(hiveId: string, userId: string, content: string, applyToRound?: number): Promise<void> {
    if (!content.trim()) throw new Error('Injection content is required');
    await db.run(
      `INSERT INTO beehive_human_injections (hive_id, user_id, content, applied_to_round)
       VALUES (?, ?, ?, ?)`,
      hiveId, userId, content.trim(), applyToRound ?? null,
    );
  }

  /**
   * List a single user's private guidance for a hive. Filtering by user_id is
   * a privacy requirement — injections are explicitly scoped to one human and
   * never broadcast to the hive. Other participants must not see them.
   */
  async function listHumanInjections(hiveId: string, userId: string): Promise<Array<{ id: number; content: string; applied_to_round: number | null; injected_at: string }>> {
    return db.all(
      `SELECT id, content, applied_to_round, injected_at FROM beehive_human_injections
       WHERE hive_id = ? AND user_id = ? ORDER BY injected_at ASC`,
      hiveId, userId,
    );
  }

  return {
    startNextRound,
    triggerConvergence,
    submitContribution,
    generateContributionDraft,
    listContributions,
    generateRoundSummary,
    measureConsensus,
    refreshConsensusForCurrentRound,
    recordHumanInjection,
    listHumanInjections,
  };
}

export type BeehiveDeliberation = Awaited<ReturnType<typeof createBeehiveDeliberation>>;

// ── Prompt builders ────────────────────────────────────────────────────────

interface ContributionPromptParams {
  hive: Hive;
  round: DeliberationRound;
  asDisplayName: string;
  asRole: HiveParticipant['role'];
  contributionType: ContributionType;
  otherParticipantNames: string[];
  priorContributions: HiveContribution[];
  myAtoms: SharedAtom[];
  humanGuidance?: string;
  hint?: string;
  references?: string[];
}

function buildContributionPrompt(p: ContributionPromptParams): string {
  const recentRoundContribs = p.priorContributions
    .filter(c => c.round === p.round.round_number)
    .slice(-12);
  const earlierRoundContribs = p.priorContributions
    .filter(c => c.round < p.round.round_number)
    .slice(-8);

  const formatContrib = (c: HiveContribution) => {
    const who = c.contributor_hash.slice(-8);
    return `- [Round ${c.round}] ${who} (${c.type}): ${c.content.length > 600 ? c.content.slice(0, 600) + '…' : c.content}`;
  };

  const atomsBlock = p.myAtoms.length === 0
    ? '(no atoms disclosed for this contribution)'
    : p.myAtoms.map(a => `- [${a.atom_type}, conf ${a.confidence.toFixed(2)}] ${a.content}`).join('\n');

  return `You are participating in a BEEHIVE multi-party reasoning session.

ROLE: You are speaking as **${p.asDisplayName}** (role: ${p.asRole}).
Always speak in first person from this participant's perspective. Do not break character.

HIVE: "${p.hive.name}"
TYPE: ${p.hive.type}
QUESTION: ${p.hive.question}
${p.hive.description ? `CONTEXT: ${p.hive.description}\n` : ''}
CURRENT ROUND: ${p.round.round_number} (${p.round.phase})
OTHER PARTICIPANTS: ${p.otherParticipantNames.join(', ') || '(none yet)'}

CONTRIBUTION TYPE REQUESTED: ${p.contributionType}
${contributionTypeGuidance(p.contributionType)}

${earlierRoundContribs.length > 0 ? `PRIOR ROUND CONTRIBUTIONS (summary):\n${earlierRoundContribs.map(formatContrib).join('\n')}\n` : ''}
${recentRoundContribs.length > 0 ? `THIS ROUND'S CONTRIBUTIONS SO FAR:\n${recentRoundContribs.map(formatContrib).join('\n')}\n` : ''}
KNOWLEDGE YOU CAN CITE (atoms you've disclosed for this round):
${atomsBlock}
${p.humanGuidance ? `\nPRIVATE GUIDANCE FROM YOUR HUMAN (not shared with other participants):\n${p.humanGuidance}\n` : ''}
${p.hint ? `\nADDITIONAL HINT FOR THIS CONTRIBUTION:\n${p.hint}\n` : ''}
${p.references && p.references.length > 0 ? `\nREFERENCING CONTRIBUTIONS: ${p.references.join(', ')}\n` : ''}

QUALITY BAR:
- Be specific. Cite atoms by content when they're material to your point.
- Disagree where you genuinely disagree — do not paper over differences.
- Keep contributions tight (200-500 words typical).
- Do not summarise the round; that's the Queen's job.`;
}

function contributionTypeGuidance(type: ContributionType): string {
  const map: Record<ContributionType, string> = {
    position:     'State your initial position on the question. Be clear about what you conclude and why. Acknowledge uncertainty where appropriate.',
    evidence:     'Bring concrete evidence to bear: cite atoms, data, prior cases. Connect the evidence to a specific claim or position.',
    challenge:    'Challenge a specific contribution\'s reasoning, evidence, or conclusion. Be precise about what you disagree with and why.',
    synthesis:    'Attempt to synthesise multiple positions into a coherent view. Acknowledge real differences; do not falsely converge.',
    question:     'Ask a clarifying question that the group needs to answer to move forward.',
    revision:     'Revise your earlier position based on new information. Explain what changed your mind.',
    dissent:      'Formally dissent from emerging consensus. Your position will be preserved in the final output. Be specific about what you reject.',
    build:        'Contribute a section, component, or concrete artifact to the build.',
    review_note:  'Provide structured review feedback: severity, location, specific issue, suggested fix.',
  };
  return map[type];
}

function parseJsonObject<T>(text: string): T | null {
  // Try to find a JSON object — robust to surrounding whitespace / markdown fences
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { return JSON.parse(cleaned) as T; } catch { /* fall through */ }
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]) as T; } catch { return null; }
}
