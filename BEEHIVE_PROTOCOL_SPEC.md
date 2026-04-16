# BEEHIVE PROTOCOL — ANTON-to-ANTON Collaborative Group Intelligence

## Claude Code Implementation Brief

**Version:** 1.0  
**Author:** Daniel Bardun, FutureChain AB / openEXPERT  
**Date:** April 2026  
**Target Version:** v0.7.0+  
**Prerequisites:** AAP (ANTON Agent Protocol), Collaborative Canvas, Knowledge Atoms, Consul Council  
**Status:** Specification — ready for investigation-first implementation

---

## 1. WHAT THIS IS

The Beehive Protocol is a sustained multi-party reasoning system where multiple ANTON instances — each owned by different humans — form a persistent group deliberation session. Each ANTON brings its own accumulated context: knowledge atoms, institutional memory, checkpoint decisions, apprentice learning, persona calibrations, and domain expertise. The group deliberates together over an extended period (minutes to days) and produces a collaborative output that is better than any single ANTON could produce alone.

**The key distinction from existing features:**

| Feature | Scope | Duration | Participants | Communication |
|---------|-------|----------|-------------|---------------|
| **Consul Council** | Within one ANTON | Single turn | Multiple AI perspectives (same instance) | Internal prompt assembly |
| **Collaborative Canvas** | Within one ANTON deployment | Multi-step workflow | Multiple humans, one ANTON | Step assignments + reviews |
| **AAP Task Delegation** | Between two ANTONs | Request → response | 1:1 (requester + provider) | Signed messages via P2P |
| **Beehive** | Between N ANTONs | Persistent session (minutes to days) | N ANTONs (each with their own human + context) | Multi-party streaming reasoning channel |

**The compound value:** When five ANTONs from an Advisense team enter a Beehive to tackle an AMLR implementation question, they are not five copies of Claude thinking in parallel. They are five *contextually different professionals* whose AIs have been shaped by different client engagements, different regulatory interpretations, and different patterns detected over months of work. The Beehive lets those divergent knowledge bases cross-pollinate in real time.

---

## 2. INVESTIGATION-FIRST PROTOCOL

**Before writing any code, Claude Code must:**

1. **Scan existing AAP infrastructure** in `server/services/aap/` — understand the current P2P message format, Ed25519/X25519 key management, capability card structure, and task lifecycle states
2. **Scan existing Collaborative Canvas** in `server/services/collaborative-canvas.ts` — understand consensus modes, parallel review patterns, comment threading, and SLA tracking
3. **Scan existing Consul Council** implementation — understand how multi-perspective deliberation currently works within a single ANTON (prompt assembly, perspective rotation, synthesis)
4. **Scan existing Knowledge Atoms** in `server/services/knowledge/` — understand atom types, extraction, relationship mapping, and the atom sharing permissions model
5. **Scan existing `.anton` bundle infrastructure** — understand export/import format, bundle types, and metadata structure
6. **Check database schema** — identify which existing tables can be extended vs. which new tables are needed
7. **Report findings** before writing implementation code

---

## 3. CORE CONCEPTS

### 3.1 The Hive

A **Hive** is a persistent multi-party reasoning session with a defined question, participant list, governance rules, and convergence criteria. It exists across multiple ANTON instances simultaneously, with state replicated via AAP messages.

```typescript
interface Hive {
  id: string;                          // UUID
  name: string;                        // Human-readable name
  question: string;                    // The framing question or objective
  description?: string;                // Extended context for the deliberation
  type: HiveType;                      // 'deliberation' | 'build' | 'review' | 'brainstorm'
  status: HiveStatus;                  // 'forming' | 'active' | 'converging' | 'concluded' | 'archived'
  governance: HiveGovernance;          // Rules for the session
  created_by: string;                  // ANTON contact hash of initiator (Queen)
  created_at: string;                  // ISO timestamp
  concluded_at?: string;               // When the hive reached conclusion
  max_participants: number;            // Cap (default: 12)
  ttl_hours?: number;                  // Auto-conclude after N hours (optional)
}

type HiveType = 
  | 'deliberation'   // Reach a reasoned group conclusion on a question
  | 'build'          // Collaboratively produce an artifact (report, code, policy)
  | 'review'         // Multi-ANTON review of an existing artifact
  | 'brainstorm';    // Open-ended exploration, no convergence required

type HiveStatus =
  | 'forming'        // Queen has created hive, inviting participants
  | 'active'         // Deliberation in progress
  | 'converging'     // Convergence phase triggered, synthesising
  | 'concluded'      // Final output produced
  | 'archived';      // Moved to long-term storage
```

### 3.2 Hive Roles

Every participant in a Hive has a role that governs their permissions and responsibilities.

```typescript
type HiveRole = 
  | 'queen'          // Initiator — frames question, sets governance, triggers convergence, produces synthesis
  | 'worker'         // Full participant — contributes reasoning, shares atoms, challenges others
  | 'scout'          // Read-heavy participant — primarily surfaces relevant knowledge, less active reasoning
  | 'observer';      // Read-only — can see deliberation but not contribute (useful for learning/audit)

interface HiveParticipant {
  anton_contact_hash: string;          // ANTON-XXXX-XXXX-XXXX-XXXX
  display_name: string;                // Human-readable (from capability card)
  role: HiveRole;
  joined_at: string;
  last_active_at: string;
  status: 'active' | 'idle' | 'left';
  knowledge_disclosure_level: DisclosureLevel;  // What this ANTON shares with the hive
  contribution_count: number;          // Number of reasoning contributions
}
```

### 3.3 Knowledge Disclosure Levels

This is the critical privacy boundary. When an ANTON joins a Hive, its human controls how much accumulated context is shared with the group.

```typescript
type DisclosureLevel =
  | 'reasoning_only'    // Share reasoning and conclusions, but not source atoms or data
  | 'atoms_tagged'      // Share only knowledge atoms explicitly tagged as 'shareable'
  | 'atoms_domain'      // Share all atoms matching the hive's domain/topic
  | 'full_context';     // Share all relevant atoms, checkpoint decisions, and patterns

interface DisclosurePolicy {
  level: DisclosureLevel;
  excluded_clients?: string[];         // Never share atoms mentioning these client names
  excluded_tags?: string[];            // Never share atoms with these tags
  redact_names: boolean;               // Auto-redact personal/entity names before sharing
  max_atoms_shared: number;            // Cap on number of atoms shared per round (default: 50)
  require_human_approval: boolean;     // Human must approve each atom before it's shared
}
```

**Why this matters:** A consultant's ANTON may have atoms from confidential client engagements. The disclosure level ensures that the Beehive gets the benefit of the *reasoning patterns* without exposing privileged information. At `reasoning_only`, the ANTON can say "In my experience, banks typically struggle with cross-border CDD data completeness" without revealing which specific bank or engagement produced that insight.

### 3.4 Reasoning Contributions

The core unit of Beehive communication is a **Contribution** — a signed, structured reasoning message from one ANTON to the hive.

```typescript
interface HiveContribution {
  id: string;                          // UUID
  hive_id: string;
  contributor: string;                 // ANTON contact hash
  type: ContributionType;
  content: string;                     // The reasoning/argument text
  supporting_atoms?: SharedAtom[];     // Knowledge atoms offered as evidence (respecting disclosure)
  references_contributions?: string[]; // IDs of contributions this builds on or challenges
  confidence: number;                  // 0.0-1.0 — how confident this ANTON is in this contribution
  reasoning_trace?: string;            // Extended thinking (if transparency level permits)
  signature: string;                   // Ed25519 signature over content + metadata
  timestamp: string;
  round: number;                       // Which deliberation round this belongs to
}

type ContributionType =
  | 'position'         // Initial position or argument on the question
  | 'evidence'         // Supporting evidence (atoms, data, references)
  | 'challenge'        // Challenging another contribution's reasoning
  | 'synthesis'        // Attempting to synthesise multiple positions
  | 'question'         // Asking a clarifying question to the hive
  | 'revision'         // Revising own earlier position based on new information
  | 'dissent'          // Formal disagreement with emerging consensus (preserved in output)
  | 'build'            // For 'build' type hives — contributing a section or component
  | 'review_note';     // For 'review' type hives — feedback on the artifact

interface SharedAtom {
  atom_id: string;                     // Local atom ID (not shared — just for internal reference)
  atom_type: string;                   // fact | insight | conclusion | finding | recommendation
  content: string;                     // The atom text (potentially redacted per disclosure policy)
  confidence: number;                  // Source confidence
  domain: string;                      // Topic domain
  redacted: boolean;                   // Whether names/entities have been redacted
}
```

### 3.5 Deliberation Rounds

Beehive deliberation happens in **rounds** — structured phases that move the group toward convergence (or, in brainstorm mode, through exploration).

```typescript
interface DeliberationRound {
  round_number: number;
  phase: RoundPhase;
  started_at: string;
  ended_at?: string;
  contributions: HiveContribution[];
  summary?: string;                    // AI-generated summary of this round's key developments
  consensus_temperature: number;       // 0.0 (total disagreement) to 1.0 (full consensus)
}

type RoundPhase =
  | 'opening'          // Round 1: Each ANTON states initial position
  | 'deliberation'     // Rounds 2-N: Challenge, evidence, synthesis
  | 'convergence'      // Final round(s): Synthesise toward conclusion
  | 'dissent_capture';  // After convergence: Capture and preserve formal dissents
```

**Round flow for `deliberation` type:**

```
Round 1 — OPENING
  Each ANTON states its initial position on the question.
  Knowledge atoms are shared per disclosure policy.
  Queen ANTON summarises the landscape of positions.

Round 2..N — DELIBERATION  
  ANTONs challenge, support, and build on each other's positions.
  New evidence surfaces as atoms are shared.
  Consensus temperature is measured after each round.
  Queen can trigger next round or extend current round.
  Humans can inject guidance to their own ANTON between rounds.

Round N+1 — CONVERGENCE
  Triggered when: consensus temperature > threshold, OR max rounds reached, OR queen decides.
  Queen ANTON synthesises all contributions into a draft conclusion.
  All participants review and approve/challenge/add dissent.

Round N+2 — DISSENT CAPTURE
  Any ANTON that disagrees with the synthesis submits a formal dissent.
  Dissents are preserved in the final output with full attribution.
  No dissent is averaged away or silenced.
```

### 3.6 Hive Governance

```typescript
interface HiveGovernance {
  consensus_mode: ConsensusMode;       // How agreement is determined
  max_rounds: number;                  // Auto-trigger convergence after N rounds (default: 5)
  round_timeout_minutes: number;       // Max duration per round (default: 30)
  min_contributions_per_round: number; // Each ANTON must contribute at least N per round (default: 1)
  convergence_threshold: number;       // Consensus temperature to auto-trigger convergence (default: 0.8)
  allow_human_injection: boolean;      // Can humans inject guidance between rounds? (default: true)
  allow_late_join: boolean;            // Can new ANTONs join after Round 1? (default: true, before convergence)
  require_dissent_on_disagree: boolean; // Must disagreeing ANTONs file formal dissent? (default: true)
  output_format: OutputFormat;         // What the final deliverable looks like
}

type ConsensusMode =
  | 'unanimous'        // All participants must approve synthesis
  | 'supermajority'    // 2/3+ must approve
  | 'majority'         // 51%+ must approve
  | 'queen_decides'    // Queen synthesises, others provide input but queen has final say
  | 'no_consensus';    // Brainstorm mode — all positions preserved, no convergence required

type OutputFormat =
  | 'synthesis_report'  // Structured report with conclusion + reasoning trail + dissents
  | 'anton_bundle'      // .anton bundle with collaborative module/workflow
  | 'artifact'          // Specific deliverable (policy document, code, assessment)
  | 'raw_trail';        // Just the full reasoning trail, no synthesis
```

---

## 4. PROTOCOL — AAP EXTENSION

The Beehive Protocol extends AAP with new message types. All messages are signed with Ed25519 and encrypted with X25519, consistent with existing AAP architecture.

### 4.1 New AAP Message Types

```typescript
// Extend existing AAP message types
type BeehiveMessageType =
  | 'hive:create'           // Queen creates a new hive
  | 'hive:invite'           // Queen invites an ANTON to join
  | 'hive:join'             // ANTON accepts invitation and joins
  | 'hive:decline'          // ANTON declines invitation
  | 'hive:leave'            // ANTON leaves the hive
  | 'hive:contribution'     // ANTON submits a reasoning contribution
  | 'hive:round_summary'    // Queen publishes round summary
  | 'hive:round_advance'    // Queen advances to next round
  | 'hive:converge'         // Queen triggers convergence phase
  | 'hive:synthesis_draft'  // Queen publishes draft synthesis
  | 'hive:approve'          // Participant approves synthesis
  | 'hive:dissent'          // Participant formally dissents
  | 'hive:conclude'         // Queen concludes the hive
  | 'hive:state_sync'       // Full state sync for new/reconnecting participants
  | 'hive:heartbeat'        // Participant presence signal
  | 'hive:human_inject';    // Human guidance injected to their own ANTON (not shared with hive)

interface BeehiveMessage {
  type: BeehiveMessageType;
  hive_id: string;
  sender: string;                      // ANTON contact hash
  payload: any;                        // Type-specific payload
  signature: string;                   // Ed25519 signature
  timestamp: string;
  sequence: number;                    // Monotonically increasing per-hive, per-sender
}
```

### 4.2 Message Flow — Creating and Running a Hive

```
QUEEN                          WORKER_A                       WORKER_B
  |                               |                              |
  |-- hive:create --------------->|                              |
  |-- hive:invite --------------->|                              |
  |-- hive:invite ------------------------------------------>|
  |                               |                              |
  |<-- hive:join -----------------|                              |
  |<-- hive:join --------------------------------------------|
  |                               |                              |
  |-- hive:state_sync ----------->| (full hive config)           |
  |-- hive:state_sync ---------------------------------------->|
  |                               |                              |
  |== ROUND 1: OPENING ===========|==============================|
  |                               |                              |
  |<-- hive:contribution ---------|  (position + atoms)          |
  |<-- hive:contribution --------------------------------------|
  |-- hive:contribution --------->|------(broadcast)----------->|
  |                               |                              |
  |-- hive:round_summary -------->|  (landscape of positions)   |
  |-- hive:round_summary -------------------------------------->|
  |-- hive:round_advance -------->|                              |
  |-- hive:round_advance -------------------------------------->|
  |                               |                              |
  |== ROUND 2..N: DELIBERATION ===|==============================|
  |                               |                              |
  |<-- hive:contribution ---------|  (challenge to Queen)        |
  |-- (broadcast) --------------->|------(to Worker_B)---------->|
  |<-- hive:contribution --------------------------------------|  (evidence)
  |-- (broadcast) --------------->|                              |
  |                               |                              |
  |   [Human injects guidance to their ANTON — not broadcast]    |
  |                               |                              |
  |-- hive:converge ------------->|  (threshold met OR decided)  |
  |-- hive:converge ------------------------------------------>|
  |                               |                              |
  |== CONVERGENCE =================|==============================|
  |                               |                              |
  |-- hive:synthesis_draft ------>|                              |
  |-- hive:synthesis_draft ------------------------------------->|
  |                               |                              |
  |<-- hive:approve --------------|                              |
  |<-- hive:dissent ------------------------------------------|  (formal dissent)
  |                               |                              |
  |-- hive:conclude ------------->|  (final output produced)     |
  |-- hive:conclude ------------------------------------------>|
```

### 4.3 State Replication

Every participant maintains a local copy of the hive state. The Queen is the source of truth for round management and synthesis, but contributions are broadcast peer-to-peer (via AAP relay through Queen for simplicity in v1, direct mesh in v2).

**v1 topology:** Star — all messages route through Queen, who broadcasts to all participants. Simple, works within existing AAP infrastructure.

**v2 topology (future):** Mesh — participants can send directly to each other. Requires AAP group key agreement extension.

```typescript
interface LocalHiveState {
  hive: Hive;
  participants: HiveParticipant[];
  rounds: DeliberationRound[];
  my_contributions: HiveContribution[];
  my_disclosure_policy: DisclosurePolicy;
  my_shared_atoms: SharedAtom[];       // Atoms I've disclosed to this hive
  received_atoms: SharedAtom[];        // Atoms others have disclosed
  human_injections: string[];          // Guidance from my human (never shared)
  output?: HiveOutput;                 // Final output when concluded
}
```

---

## 5. DATABASE SCHEMA

### 5.1 New Tables

```sql
-- Core hive sessions
CREATE TABLE beehive_sessions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  question TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL CHECK(type IN ('deliberation', 'build', 'review', 'brainstorm')),
  status TEXT NOT NULL DEFAULT 'forming' CHECK(status IN ('forming', 'active', 'converging', 'concluded', 'archived')),
  governance_json TEXT NOT NULL,        -- JSON: HiveGovernance
  created_by TEXT NOT NULL,             -- ANTON contact hash
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  concluded_at TEXT,
  max_participants INTEGER DEFAULT 12,
  ttl_hours INTEGER,
  current_round INTEGER DEFAULT 0,
  consensus_temperature REAL DEFAULT 0.0
);

-- Participants in each hive
CREATE TABLE beehive_participants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hive_id TEXT NOT NULL REFERENCES beehive_sessions(id),
  anton_contact_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('queen', 'worker', 'scout', 'observer')),
  disclosure_policy_json TEXT NOT NULL,  -- JSON: DisclosurePolicy
  joined_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_active_at TEXT,
  status TEXT DEFAULT 'active' CHECK(status IN ('active', 'idle', 'left')),
  contribution_count INTEGER DEFAULT 0,
  UNIQUE(hive_id, anton_contact_hash)
);

-- Individual reasoning contributions
CREATE TABLE beehive_contributions (
  id TEXT PRIMARY KEY,
  hive_id TEXT NOT NULL REFERENCES beehive_sessions(id),
  contributor_hash TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('position', 'evidence', 'challenge', 'synthesis', 'question', 'revision', 'dissent', 'build', 'review_note')),
  content TEXT NOT NULL,
  supporting_atoms_json TEXT,           -- JSON: SharedAtom[]
  references_contributions_json TEXT,   -- JSON: string[] (contribution IDs)
  confidence REAL NOT NULL DEFAULT 0.5,
  reasoning_trace TEXT,
  signature TEXT NOT NULL,
  round INTEGER NOT NULL,
  sequence INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Deliberation rounds
CREATE TABLE beehive_rounds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hive_id TEXT NOT NULL REFERENCES beehive_sessions(id),
  round_number INTEGER NOT NULL,
  phase TEXT NOT NULL CHECK(phase IN ('opening', 'deliberation', 'convergence', 'dissent_capture')),
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at TEXT,
  summary TEXT,                         -- AI-generated round summary
  consensus_temperature REAL DEFAULT 0.0,
  contribution_count INTEGER DEFAULT 0,
  UNIQUE(hive_id, round_number)
);

-- Atoms shared during hive sessions (tracking what was disclosed)
CREATE TABLE beehive_shared_atoms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hive_id TEXT NOT NULL REFERENCES beehive_sessions(id),
  contribution_id TEXT REFERENCES beehive_contributions(id),
  source_anton_hash TEXT NOT NULL,
  atom_type TEXT NOT NULL,
  content TEXT NOT NULL,                -- Potentially redacted version
  original_atom_id TEXT,                -- Local reference (not shared externally)
  confidence REAL,
  domain TEXT,
  redacted BOOLEAN DEFAULT 0,
  shared_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Final hive outputs
CREATE TABLE beehive_outputs (
  id TEXT PRIMARY KEY,
  hive_id TEXT NOT NULL REFERENCES beehive_sessions(id) UNIQUE,
  output_type TEXT NOT NULL CHECK(output_type IN ('synthesis_report', 'anton_bundle', 'artifact', 'raw_trail')),
  synthesis_text TEXT,                  -- The synthesised conclusion
  dissents_json TEXT,                   -- JSON: formal dissents with attribution
  reasoning_trail_json TEXT,            -- JSON: complete contribution trail
  convergence_path_json TEXT,           -- JSON: how the group moved from positions to conclusion
  participant_approvals_json TEXT,      -- JSON: who approved/dissented
  output_file_path TEXT,                -- Path to .anton bundle or artifact file
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  quality_score REAL                    -- Quality Ratchet score of final output
);

-- Human injections (private — never shared with hive)
CREATE TABLE beehive_human_injections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hive_id TEXT NOT NULL REFERENCES beehive_sessions(id),
  user_id TEXT NOT NULL,                -- Local user who injected guidance
  content TEXT NOT NULL,
  injected_at TEXT NOT NULL DEFAULT (datetime('now')),
  applied_to_round INTEGER              -- Which round this guidance influenced
);

-- Hive message log (all AAP messages for audit)
CREATE TABLE beehive_message_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hive_id TEXT NOT NULL REFERENCES beehive_sessions(id),
  message_type TEXT NOT NULL,
  sender_hash TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  signature TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  received_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX idx_beehive_contributions_hive ON beehive_contributions(hive_id, round);
CREATE INDEX idx_beehive_contributions_contributor ON beehive_contributions(contributor_hash);
CREATE INDEX idx_beehive_shared_atoms_hive ON beehive_shared_atoms(hive_id);
CREATE INDEX idx_beehive_message_log_hive ON beehive_message_log(hive_id, sequence);
CREATE INDEX idx_beehive_sessions_status ON beehive_sessions(status);
```

---

## 6. SERVICE ARCHITECTURE

### 6.1 New Files

```
server/services/beehive/
├── beehive-manager.ts          # Core hive lifecycle management
├── beehive-protocol.ts         # AAP message handling for hive messages
├── beehive-deliberation.ts     # Round management, contribution processing, consensus measurement
├── beehive-knowledge.ts        # Knowledge disclosure, atom filtering, redaction
├── beehive-synthesis.ts        # Convergence synthesis, dissent capture, output generation
├── beehive-state.ts            # Local state management and replication
└── types.ts                    # All TypeScript interfaces

server/routes/
├── beehive.ts                  # REST API endpoints

client/src/pages/
├── BeehivePage.tsx              # Main Beehive UI — hive list, creation, management
├── BeehiveSessionPage.tsx       # Active hive view — rounds, contributions, real-time updates

client/src/components/beehive/
├── HiveCreator.tsx              # Create new hive form
├── HiveParticipantList.tsx      # Participant cards with roles and status
├── ContributionStream.tsx       # Real-time contribution feed (like a chat, but structured)
├── RoundNavigator.tsx           # Navigate between rounds
├── ConsensusGauge.tsx           # Visual consensus temperature indicator
├── DisclosurePolicyEditor.tsx   # Configure knowledge sharing boundaries
├── SynthesisView.tsx            # View and approve/dissent the final synthesis
├── HiveOutputViewer.tsx         # View the concluded hive output
└── HumanInjectionPanel.tsx      # Private panel for human to guide their ANTON
```

### 6.2 Key Service: `beehive-manager.ts`

```typescript
class BeehiveManager {
  // Lifecycle
  createHive(config: CreateHiveConfig): Promise<Hive>;
  inviteParticipant(hiveId: string, contactHash: string, role: HiveRole): Promise<void>;
  joinHive(hiveId: string, disclosurePolicy: DisclosurePolicy): Promise<void>;
  leaveHive(hiveId: string): Promise<void>;
  
  // Round management (Queen only)
  startRound(hiveId: string): Promise<DeliberationRound>;
  advanceRound(hiveId: string): Promise<DeliberationRound>;
  triggerConvergence(hiveId: string): Promise<void>;
  concludeHive(hiveId: string): Promise<HiveOutput>;
  
  // Contributions (all participants except observers)
  submitContribution(hiveId: string, contribution: NewContribution): Promise<HiveContribution>;
  
  // Human injection (private)
  injectHumanGuidance(hiveId: string, guidance: string): Promise<void>;
  
  // Synthesis (Queen)
  generateSynthesis(hiveId: string): Promise<string>;
  
  // Consensus
  approveOrDissent(hiveId: string, action: 'approve' | 'dissent', content?: string): Promise<void>;
  
  // State
  getHiveState(hiveId: string): Promise<LocalHiveState>;
  getActiveHives(): Promise<Hive[]>;
}
```

### 6.3 Key Service: `beehive-knowledge.ts`

This service handles the sensitive work of filtering and redacting knowledge atoms before they are shared with the hive.

```typescript
class BeehiveKnowledgeService {
  // Select atoms relevant to hive question, filtered by disclosure policy
  selectAtomsForDisclosure(
    hiveId: string,
    question: string,
    policy: DisclosurePolicy
  ): Promise<SharedAtom[]>;
  
  // Redact entity names from atom content
  redactAtomContent(atom: KnowledgeAtom, excludedClients: string[]): Promise<SharedAtom>;
  
  // Ingest atoms shared by other participants into local knowledge (with source tagging)
  ingestReceivedAtoms(hiveId: string, atoms: SharedAtom[], sourceHash: string): Promise<void>;
  
  // After hive concludes: optionally persist valuable received atoms to local knowledge base
  persistHiveKnowledge(hiveId: string, selectedAtomIds: string[]): Promise<void>;
}
```

### 6.4 Key Service: `beehive-deliberation.ts`

```typescript
class BeehiveDeliberationService {
  // Generate this ANTON's contribution for the current round
  generateContribution(
    hiveId: string,
    round: DeliberationRound,
    allContributions: HiveContribution[],
    humanGuidance?: string,
    localAtoms: SharedAtom[]
  ): Promise<NewContribution>;
  
  // Measure consensus temperature across all contributions
  measureConsensus(contributions: HiveContribution[]): Promise<number>;
  
  // Generate round summary (Queen role)
  generateRoundSummary(
    round: DeliberationRound,
    contributions: HiveContribution[]
  ): Promise<string>;
  
  // Determine if this ANTON should challenge, support, or synthesise
  assessDeliberationStrategy(
    myPosition: HiveContribution,
    othersContributions: HiveContribution[],
    localKnowledge: SharedAtom[]
  ): Promise<ContributionType>;
}
```

### 6.5 Key Service: `beehive-synthesis.ts`

```typescript
class BeehiveSynthesisService {
  // Generate the convergence synthesis from all rounds
  synthesise(
    hive: Hive,
    rounds: DeliberationRound[],
    allContributions: HiveContribution[]
  ): Promise<SynthesisDraft>;
  
  // Generate .anton bundle from hive output
  exportAsAntonBundle(hiveId: string): Promise<string>; // Returns file path
  
  // Generate structured report
  exportAsSynthesisReport(hiveId: string): Promise<string>;
  
  // Build the convergence path visualisation data
  buildConvergencePath(
    rounds: DeliberationRound[],
    contributions: HiveContribution[]
  ): Promise<ConvergencePath>;
}
```

---

## 7. API ENDPOINTS

```typescript
// Hive lifecycle
POST   /api/beehive/hives                    // Create a new hive
GET    /api/beehive/hives                    // List hives (active, concluded, archived)
GET    /api/beehive/hives/:id                // Get hive details + state
DELETE /api/beehive/hives/:id                // Archive a hive (Queen only)

// Participation
POST   /api/beehive/hives/:id/invite         // Invite an ANTON (Queen only)
POST   /api/beehive/hives/:id/join           // Join a hive (with disclosure policy)
POST   /api/beehive/hives/:id/leave          // Leave a hive
PATCH  /api/beehive/hives/:id/disclosure     // Update disclosure policy mid-session

// Rounds and contributions
POST   /api/beehive/hives/:id/rounds         // Start/advance round (Queen only)
POST   /api/beehive/hives/:id/contributions  // Submit a contribution
GET    /api/beehive/hives/:id/contributions  // Get all contributions (with round filter)

// Human injection
POST   /api/beehive/hives/:id/inject         // Inject human guidance (private, not shared)

// Convergence
POST   /api/beehive/hives/:id/converge       // Trigger convergence (Queen only)
POST   /api/beehive/hives/:id/approve        // Approve synthesis
POST   /api/beehive/hives/:id/dissent        // Submit formal dissent
POST   /api/beehive/hives/:id/conclude       // Conclude and generate output (Queen only)

// Output
GET    /api/beehive/hives/:id/output         // Get final output
GET    /api/beehive/hives/:id/output/export  // Export as .anton bundle or report

// Knowledge
GET    /api/beehive/hives/:id/atoms          // Get shared atoms in this hive
POST   /api/beehive/hives/:id/atoms/persist  // Persist valuable received atoms locally
```

---

## 8. UI DESIGN

### 8.1 Beehive Dashboard (`BeehivePage.tsx`)

The main page shows:
- **Active Hives** — hives currently in session, with status pill, participant count, current round, consensus temperature gauge
- **Invitations** — pending hive invitations from other ANTONs, with question preview and participant list
- **Concluded** — past hives with output preview and option to review full reasoning trail
- **Create Hive** button (opens HiveCreator modal)

### 8.2 Active Hive Session (`BeehiveSessionPage.tsx`)

**Layout:** Three-panel layout.

**Left panel — Participants:**
- Each participant shown as a card with avatar/icon, display name, role badge (Queen/Worker/Scout/Observer), disclosure level indicator, contribution count, last active timestamp, and idle/active status dot.

**Centre panel — Contribution Stream:**
- Chronological stream of contributions, grouped by round. Each contribution shows: contributor name + role, contribution type badge (position/challenge/evidence/synthesis/dissent), the reasoning text, supporting atoms (expandable), confidence indicator, references to other contributions (linked), timestamp.
- Round dividers with round summary (expandable).
- Consensus temperature gauge updates in real-time.
- At bottom: contribution composer (for worker/queen roles) with type selector.

**Right panel — Context:**
- **My Knowledge:** Atoms available for disclosure (filtered by policy), with checkboxes to include/exclude.
- **Hive Knowledge:** Atoms shared by all participants, searchable.
- **Human Injection:** Private text area for the human to type guidance to their ANTON. Clearly marked "PRIVATE — not shared with hive."
- **Convergence Path:** Visual showing how positions have shifted across rounds (only shown from Round 2 onwards).

### 8.3 Synthesis View

When the hive reaches convergence:
- **Draft Synthesis** — the Queen's synthesised conclusion, with inline references to contributions
- **Approve / Dissent** buttons for each participant
- **Dissent Panel** — if dissenting, a structured form: "I disagree because..." with references to specific contributions
- **Final Output Preview** — shows the report/bundle that will be generated
- **Export options** — .anton bundle, PDF report, markdown

---

## 9. PROMPT ENGINEERING

### 9.1 Contribution Generation Prompt Structure

When an ANTON generates a contribution, the prompt must include:

```
Layer 1: Beehive Protocol Instructions
  - Role in this hive (queen/worker/scout)
  - Current round and phase
  - Governance rules (consensus mode, contribution requirements)

Layer 2: The Question
  - The framing question / objective
  - Hive type (deliberation/build/review/brainstorm)

Layer 3: Previous Contributions (this round + summaries of prior rounds)
  - All contributions from other participants in current round
  - Summaries of positions from prior rounds
  - Consensus temperature trend

Layer 4: My Prior Contributions
  - What I've said so far
  - Any revisions I've made

Layer 5: My Knowledge Context
  - Relevant atoms from local knowledge base (pre-filtered by disclosure policy)
  - Checkpoint decisions relevant to this question
  - Institutional memory patterns

Layer 6: Human Guidance (if any)
  - Private injection from my human
  - "Your human has provided the following guidance: ..."

Layer 7: Contribution Strategy
  - Based on the deliberation state, should I: challenge, support, synthesise, ask, or revise?
  - Confidence calibration instructions
```

### 9.2 Synthesis Prompt Structure (Queen)

```
Layer 1: Synthesis Instructions
  - Consensus mode and threshold
  - Output format requirements

Layer 2: Complete Deliberation Trail
  - All contributions across all rounds, attributed
  - Round summaries
  - Consensus temperature progression

Layer 3: Convergence Analysis
  - Where positions converged
  - Where disagreement persists
  - Which evidence was most influential

Layer 4: Dissent Handling
  - Preserve all formal dissents with full reasoning
  - Do not average away disagreement
  - Present minority positions with same rigour as majority

Layer 5: Output Structure
  - Conclusion + confidence level
  - Reasoning path (how the group got here)
  - Evidence base (atoms cited)
  - Dissenting positions
  - Recommendations for further investigation
```

---

## 10. IMPLEMENTATION ORDER

### Phase 1: Foundation (Priority — implement first)

1. **Database tables** — All tables in Section 5.1
2. **TypeScript types** — All interfaces in `types.ts`
3. **`beehive-manager.ts`** — Core lifecycle: create, invite, join, leave, state management
4. **`beehive-state.ts`** — Local state management (no AAP integration yet — local-only mode for testing)
5. **Basic API endpoints** — CRUD for hives, participants
6. **`BeehivePage.tsx`** — Dashboard with hive list and creation

### Phase 2: Deliberation Engine

7. **`beehive-deliberation.ts`** — Contribution generation, round management, consensus measurement
8. **`beehive-knowledge.ts`** — Atom selection, redaction, disclosure filtering
9. **API endpoints** — Contributions, rounds, human injection
10. **`BeehiveSessionPage.tsx`** — Full session UI with contribution stream
11. **`ContributionStream.tsx`** + **`RoundNavigator.tsx`** + **`ConsensusGauge.tsx`**

### Phase 3: Convergence and Output

12. **`beehive-synthesis.ts`** — Synthesis generation, output production
13. **`SynthesisView.tsx`** — Approve/dissent UI
14. **`.anton` bundle export** — Collaborative variant of existing bundle format
15. **`HiveOutputViewer.tsx`** — View concluded hive outputs

### Phase 4: AAP Integration

16. **`beehive-protocol.ts`** — Wire Beehive messages into existing AAP message handling
17. **Star topology routing** — Queen as relay for all hive messages
18. **State sync** — Handle reconnection and late-join scenarios
19. **End-to-end testing** with two+ ANTON instances on the same network

### Phase 5: Polish

20. **`DisclosurePolicyEditor.tsx`** — Full UI for configuring knowledge sharing boundaries
21. **`HumanInjectionPanel.tsx`** — Private guidance panel
22. **Convergence path visualisation** — Visual showing how positions shifted
23. **Notification integration** — Alerts for invitations, round advances, convergence
24. **Audit logging** — All hive activity to `beehive_message_log`

---

## 11. ACCEPTANCE CRITERIA

### Must Have (v1)
- [ ] A user can create a Beehive session with a question, governance rules, and participant invitations
- [ ] Invited ANTONs can join with a configurable disclosure policy
- [ ] The deliberation proceeds through structured rounds (opening → deliberation → convergence)
- [ ] Each ANTON contributes reasoning based on its own knowledge atoms and context
- [ ] Knowledge atoms are shared according to the disclosure policy with redaction working correctly
- [ ] The Queen can summarise rounds and trigger convergence
- [ ] A synthesis is generated that preserves dissenting positions
- [ ] The output is exportable as a `.anton` bundle or synthesis report
- [ ] Humans can inject private guidance to their ANTON between rounds
- [ ] All messages are signed with Ed25519 (consistent with AAP)
- [ ] Full audit trail in `beehive_message_log`

### Should Have (v1.1)
- [ ] Real-time streaming of contributions (WebSocket or SSE)
- [ ] Consensus temperature gauge with visual progression
- [ ] Convergence path visualisation
- [ ] Late-join support with full state sync
- [ ] Integration with existing Collaborative Canvas for human review of hive outputs

### Nice to Have (v2)
- [ ] Mesh topology (direct P2P between all participants, not just through Queen)
- [ ] FutureChain payment integration — premium Beehive sessions require payment
- [ ] Cross-organisation Beehives with enhanced disclosure controls
- [ ] Beehive templates — pre-configured governance for common use cases
- [ ] "Beehive as a service" — offer your ANTON's expertise to external hives via marketplace

---

## 12. RELATIONSHIP TO SIX-LAYER VISION

| Layer | Beehive Role |
|-------|-------------|
| **Layer 1: Individual ANTON** | Each participant is a fully capable individual ANTON |
| **Layer 2: Intelligent ANTON** | Each brings accumulated knowledge atoms, patterns, institutional memory |
| **Layer 3: The Network** | Beehive is a network-native session type — it only exists between connected ANTONs |
| **Layer 4: Collaborative Intelligence** | **This is the beating heart of Layer 4.** The consul council is intelligence within a node. The Beehive is intelligence *between* nodes. |
| **Layer 5: The Marketplace** | Concluded Beehive outputs can be packaged and shared. Beehive participation can be a marketplace service. |
| **Layer 6: The Economy** | FutureChain payments for premium Beehive sessions, expert participation fees |

---

## 13. EXAMPLE USE CASES

### Use Case 1: Advisense AMLR Implementation Team

Five consultants' ANTONs form a Beehive to produce an AMLR gap assessment for a Swedish bank.

- **Queen:** Senior consultant (project lead)
- **Workers:** Data management specialist, risk assessment expert, monitoring specialist, governance expert
- **Question:** "What are the critical gaps in [Bank X]'s AMLR readiness, and what should the prioritised remediation roadmap look like?"
- **Disclosure:** `atoms_domain` — share all AML-related atoms, with `redact_names: true` and `excluded_clients: ['Bank Y', 'Bank Z']`
- **Output:** Synthesis report with five-perspective gap assessment, prioritised roadmap, and any dissenting views on priority ordering

### Use Case 2: Friend Group Travel Planning

Three friends' ANTONs (Life pillar) form a brainstorm Beehive.

- **Queen:** The trip organiser
- **Workers:** Two friends
- **Question:** "Plan a 10-day Japan trip for March that works for all our preferences, budgets, and dietary needs"
- **Disclosure:** `full_context` — share travel preferences, budget constraints, dietary atoms
- **Output:** Itinerary artifact with consensus on destinations and activities, dissent on specific restaurant choices
- **Consensus mode:** `majority` — if two out of three agree, it goes in the plan

### Use Case 3: Code Review Beehive

A development team's ANTONs review a major PR.

- **Queen:** Tech lead
- **Workers:** Three developers with different expertise (backend, frontend, security)
- **Question:** "Review PR #247 — the new payment processing module. Identify bugs, security issues, architecture concerns, and improvement opportunities."
- **Type:** `review`
- **Disclosure:** `atoms_domain` — share coding-area atoms related to payment processing
- **Output:** Structured review artifact with categorised findings and severity ratings

### Use Case 4: Cross-Organisation Regulatory Interpretation

Compliance officers from three different banks (via marketplace/network) form a Beehive to discuss an ambiguous regulatory requirement.

- **Disclosure:** `reasoning_only` — share reasoning but no client data or internal atoms
- **Consensus mode:** `no_consensus` — preserve all three perspectives
- **Output:** Raw reasoning trail showing three different interpretations, useful as peer input

---

## 14. SECURITY CONSIDERATIONS

### 14.1 Trust Boundaries
- Beehive operates within AAP's existing trust model: Ed25519 identity verification, X25519 encryption
- Every contribution is signed — no participant can be impersonated
- The Queen cannot modify other participants' contributions (signatures prevent tampering)
- Disclosure policies are enforced locally (each ANTON filters its own atoms before sending)

### 14.2 Data Leakage Prevention
- Atom redaction runs locally before any data leaves the ANTON
- `excluded_clients` filtering uses exact and fuzzy matching (catches "Bank X", "BankX", "Bank-X")
- `require_human_approval` mode lets the human review every atom before it's shared
- Human injections are NEVER broadcast to the hive — stored only in `beehive_human_injections`

### 14.3 Audit Trail
- Every AAP message logged to `beehive_message_log` with signature verification
- Complete contribution trail preserved in `beehive_contributions`
- Disclosure audit: `beehive_shared_atoms` records exactly what was shared, when, and by whom

### 14.4 Compliance
- RBAC integration: Only users with `beehive.create` permission can create hives
- Budget controls: Beehive sessions consume LLM tokens — integrated with existing budget framework
- GDPR: Disclosure policies and redaction are GDPR-aligned data minimisation
- EU AI Act: Reasoning trails provide the transparency required for high-risk AI use cases

---

## 15. FUTURECHAIN PAYMENT INTEGRATION (v2)

Premium Beehive features can be gated behind FutureChain payments:

- **Expert participation fees:** A recognised expert's ANTON charges a fee to join a Beehive. Paid via FutureChain.
- **Cross-organisation access:** Beehives spanning different organisations require a session fee.
- **Marketplace Beehives:** Public Beehive sessions where experts congregate around a topic — participants pay to join and contribute.
- **Output licensing:** The concluded output of a premium Beehive can be licensed to non-participants via the marketplace.

This directly feeds Layer 5 (Marketplace) and Layer 6 (Economy) of the six-layer vision.

---

## 16. WHITEPAPER PLACEMENT

This feature should be documented in **Whitepaper Part 4** (The Network is the Economy) as the primary manifestation of Layer 4: Collaborative Intelligence. The narrative arc:

- Part 3 established AAP as the communication backbone ("The network is worth more than any single node")
- Part 4 shows what you *do* with that network: Beehive is the first native network-intelligence feature
- The progression: AAP enables connection → Beehive enables collaboration → Marketplace enables exchange → FutureChain enables economy

The Beehive is the answer to the question: "What happens when AI coworkers don't just delegate tasks to each other, but actually *think together*?"

---

*Written for Claude Code as a comprehensive specification and implementation guide.*  
*Version 1.0 — April 2026*  
*Author: Daniel Bardun, FutureChain AB / openEXPERT*
