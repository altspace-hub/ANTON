// ── Beehive Protocol — Shared Types ──────────────────────────────────────────
// See BEEHIVE_PROTOCOL_SPEC.md for the conceptual model.

export type HiveType =
  | 'deliberation'   // Reach a reasoned group conclusion on a question
  | 'build'          // Collaboratively produce an artifact
  | 'review'         // Multi-ANTON review of an existing artifact
  | 'brainstorm';    // Open-ended exploration, no convergence required

export type HiveStatus =
  | 'forming'        // Queen has created hive, inviting participants
  | 'active'         // Deliberation in progress
  | 'converging'     // Convergence phase triggered, synthesising
  | 'concluded'      // Final output produced
  | 'archived';

export type HiveRole =
  | 'queen'          // Initiator — frames question, triggers convergence, produces synthesis
  | 'worker'         // Full participant — contributes reasoning, shares atoms, challenges
  | 'scout'          // Read-heavy — primarily surfaces relevant knowledge
  | 'observer';      // Read-only — can see deliberation but not contribute

export type DisclosureLevel =
  | 'reasoning_only'    // Share reasoning and conclusions, but not source atoms or data
  | 'atoms_tagged'      // Share only knowledge atoms explicitly tagged as 'shareable'
  | 'atoms_domain'      // Share all atoms matching the hive's domain/topic
  | 'full_context';     // Share all relevant atoms, checkpoint decisions, and patterns

export type ContributionType =
  | 'position'         // Initial position or argument on the question
  | 'evidence'         // Supporting evidence (atoms, data, references)
  | 'challenge'        // Challenging another contribution's reasoning
  | 'synthesis'        // Attempting to synthesise multiple positions
  | 'question'         // Asking a clarifying question to the hive
  | 'revision'         // Revising own earlier position based on new information
  | 'dissent'          // Formal disagreement with emerging consensus (preserved in output)
  | 'build'            // For 'build' type hives — contributing a section or component
  | 'review_note';     // For 'review' type hives — feedback on the artifact

export type RoundPhase =
  | 'opening'          // Round 1: Each ANTON states initial position
  | 'deliberation'     // Rounds 2..N: Challenge, evidence, synthesis
  | 'convergence'      // Final round(s): Synthesise toward conclusion
  | 'dissent_capture'; // After convergence: Capture and preserve formal dissents

export type ConsensusMode =
  | 'unanimous'        // All participants must approve synthesis
  | 'supermajority'    // 2/3+ must approve
  | 'majority'         // 51%+ must approve
  | 'queen_decides'    // Queen has final say, others provide input
  | 'no_consensus';    // Brainstorm mode — all positions preserved

export type OutputFormat =
  | 'synthesis_report'  // Structured report with conclusion + reasoning trail + dissents
  | 'anton_bundle'      // .anton bundle with collaborative module/workflow
  | 'artifact'          // Specific deliverable (policy document, code, assessment)
  | 'raw_trail';        // Just the full reasoning trail, no synthesis

export interface HiveGovernance {
  consensus_mode: ConsensusMode;
  max_rounds: number;
  round_timeout_minutes: number;
  min_contributions_per_round: number;
  convergence_threshold: number;        // 0..1 — auto-trigger convergence at this consensus
  allow_human_injection: boolean;
  allow_late_join: boolean;
  require_dissent_on_disagree: boolean;
  output_format: OutputFormat;
}

export interface DisclosurePolicy {
  level: DisclosureLevel;
  excluded_clients: string[];           // Never share atoms mentioning these client names
  excluded_tags: string[];              // Never share atoms with these tags
  redact_names: boolean;                // Auto-redact personal/entity names before sharing
  max_atoms_shared: number;             // Cap per round (default: 50)
  require_human_approval: boolean;      // Human must approve each atom before sharing
}

export interface Hive {
  id: string;
  name: string;
  question: string;
  description: string | null;
  type: HiveType;
  status: HiveStatus;
  governance: HiveGovernance;
  created_by: string;                   // ANTON contact hash of initiator (Queen)
  max_participants: number;
  ttl_hours: number | null;
  current_round: number;
  consensus_temperature: number;        // 0..1
  created_at: string;
  concluded_at: string | null;
  updated_at: string;
}

export type ParticipantInvitationStatus = 'invited' | 'joined' | 'declined' | 'left';
export type ParticipantStatus = 'active' | 'idle' | 'left';

export interface HiveParticipant {
  id: number;
  hive_id: string;
  anton_contact_hash: string;
  display_name: string;
  role: HiveRole;
  disclosure_policy: DisclosurePolicy;
  invitation_status: ParticipantInvitationStatus;
  status: ParticipantStatus;
  contribution_count: number;
  invited_at: string;
  joined_at: string | null;
  last_active_at: string | null;
}

export interface SharedAtom {
  atom_id?: string;                     // Local atom ID — internal reference, not transmitted
  atom_type: string;
  content: string;
  confidence: number;
  domain?: string;
  redacted: boolean;
}

export interface HiveContribution {
  id: string;
  hive_id: string;
  round: number;
  contributor_hash: string;
  type: ContributionType;
  content: string;
  supporting_atoms: SharedAtom[];
  references_contributions: string[];   // IDs of contributions this builds on / challenges
  confidence: number;
  reasoning_trace: string | null;
  signature: string;
  sequence: number;
  created_at: string;
}

export interface DeliberationRound {
  id: number;
  hive_id: string;
  round_number: number;
  phase: RoundPhase;
  summary: string | null;
  consensus_temperature: number | null;
  contribution_count: number;
  started_at: string;
  ended_at: string | null;
}

export interface HiveOutput {
  id: string;
  hive_id: string;
  output_type: OutputFormat;
  synthesis_text: string | null;
  dissents: DissentRecord[];
  reasoning_trail: HiveContribution[];
  convergence_path: ConvergencePathStep[];
  participant_approvals: Record<string, 'approved' | 'dissented' | 'abstained'>;
  output_file_path: string | null;
  quality_score: number | null;
  created_at: string;
}

export interface DissentRecord {
  contributor_hash: string;
  contributor_display_name: string;
  content: string;
  references_contributions: string[];
  created_at: string;
}

export interface ConvergencePathStep {
  round: number;
  consensus_temperature: number;
  summary: string;
  shifted_positions: string[];          // Contributor hashes that changed position this round
}

export interface LocalHiveState {
  hive: Hive;
  participants: HiveParticipant[];
  rounds: DeliberationRound[];
  contributions_count: number;          // Cheap count — full list fetched separately
  output: HiveOutput | null;
}

// ── BEEHIVE AAP message types (Phase 4 will wire these) ─────────────────────

export type BeehiveMessageType =
  | 'hive:create'
  | 'hive:invite'
  | 'hive:join'
  | 'hive:decline'
  | 'hive:leave'
  | 'hive:contribution'
  | 'hive:round_summary'
  | 'hive:round_advance'
  | 'hive:converge'
  | 'hive:synthesis_draft'
  | 'hive:approve'
  | 'hive:dissent'
  | 'hive:conclude'
  | 'hive:state_sync'
  | 'hive:heartbeat';

export interface BeehiveMessage<P = unknown> {
  type: BeehiveMessageType;
  hive_id: string;
  sender: string;                       // ANTON contact hash
  payload: P;
  signature: string;                    // Ed25519 signature
  timestamp: string;
  sequence: number;                     // Monotonic per (hive_id, sender)
}

// ── Service input types ─────────────────────────────────────────────────────

export interface CreateHiveInput {
  name: string;
  question: string;
  description?: string;
  type: HiveType;
  governance?: Partial<HiveGovernance>;
  max_participants?: number;
  ttl_hours?: number;
}

export interface InviteParticipantInput {
  anton_contact_hash: string;
  display_name: string;
  role: HiveRole;
}

export interface JoinHiveInput {
  anton_contact_hash: string;
  display_name: string;
  disclosure_policy?: Partial<DisclosurePolicy>;
}

export const DEFAULT_GOVERNANCE: HiveGovernance = {
  consensus_mode: 'majority',
  max_rounds: 5,
  round_timeout_minutes: 30,
  min_contributions_per_round: 1,
  convergence_threshold: 0.8,
  allow_human_injection: true,
  allow_late_join: true,
  require_dissent_on_disagree: true,
  output_format: 'synthesis_report',
};

export const DEFAULT_DISCLOSURE: DisclosurePolicy = {
  level: 'atoms_tagged',
  excluded_clients: [],
  excluded_tags: [],
  redact_names: true,
  max_atoms_shared: 50,
  require_human_approval: false,
};
