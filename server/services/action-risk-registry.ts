/**
 * action-risk-registry.ts — single source of truth for orchestrator action risk tiers.
 *
 * Each orchestrator-driven action is tagged with a risk tier. The risk tier
 * determines which trust phase may execute it without confirmation:
 *
 *   - low    : auto-executable from Supervised (Stage 3) onwards.
 *   - medium : auto-executable from Autonomous (Stage 4); requires user confirm in Supervised.
 *   - high   : always requires user confirm regardless of stage. Mission-style approval.
 *
 * Defined per ANTON_Improvement_and_Investigation_Brief.md §C.1.
 *
 * Adding a new action type:
 *   1. Add an entry to ACTION_RISK_REGISTRY below.
 *   2. Reference the action type from orchestrator-gate.ts when calling
 *      applyOrchestratorAction().
 *   3. Diagrams /docs/architecture/21-orchestrator-trust-phases.md may reference
 *      the registry — refresh on add.
 */

export type RiskTier = 'low' | 'medium' | 'high';

export interface ActionRiskEntry {
  id: string;
  /** Human label for UI surfaces. */
  label: string;
  /** One-line description for docs. */
  description: string;
  tier: RiskTier;
  /** Notes — surfaced in the diagram. */
  notes?: string;
}

export const ACTION_RISK_REGISTRY: ReadonlyArray<ActionRiskEntry> = [
  // ── Low-risk: read / surface only, no side-effects ─────────────────────
  { id: 'briefing.generate',           label: 'Generate briefing',          description: 'Produce a periodic briefing of recent activity / signals.', tier: 'low' },
  { id: 'proposal.create',             label: 'Create proposal',            description: 'Create a proposal for the user to review (no execution).',   tier: 'low' },
  { id: 'pattern.surface',             label: 'Surface pattern detection',  description: 'Bring a detected pattern to user attention.',                tier: 'low' },
  { id: 'audit-trail.aggregate',       label: 'Aggregate audit trail',      description: 'Build a unified trail view (read-only).',                    tier: 'low' },

  // ── Medium-risk: durable side effects on user data only ────────────────
  { id: 'session.tag',                 label: 'Tag a session',              description: 'Attach a tag / category to an existing session.',            tier: 'medium' },
  { id: 'workflow.trigger.headless',   label: 'Trigger headless workflow',  description: 'Auto-run a workflow with no external side effects.',         tier: 'medium' },
  { id: 'knowledge.atom.boost',        label: 'Boost knowledge atom',       description: 'Adjust atom boost score for retrieval ranking.',             tier: 'medium' },
  { id: 'output.version.create',       label: 'Create output version',      description: 'Save a new output version derived from prior content.',      tier: 'medium' },

  // ── High-risk: external side effects, irreversible, or shareable ───────
  { id: 'workflow.trigger.external',   label: 'Trigger external workflow',  description: 'Run a workflow with API calls / emails / external sends.',   tier: 'high', notes: 'Always requires user confirm.' },
  { id: 'mission.delegate',            label: 'Delegate mission step',      description: 'Hand off a mission step to a peer ANTON via AAP.',           tier: 'high' },
  { id: 'evidence-pack.publish',       label: 'Publish evidence pack',      description: 'Sign an evidence pack with the instance key.',                tier: 'high' },
  { id: 'bundle.publish',              label: 'Publish .anton bundle',      description: 'Publish a bundle to marketplace or AAP peer.',                tier: 'high' },
  { id: 'data.delete',                 label: 'Delete data',                description: 'Delete user data, session, or related artefact.',             tier: 'high', notes: 'Irreversible — never auto-execute.' },
  { id: 'orchestrator.demote-self',    label: 'Self-demote orchestrator',   description: 'Drop the orchestrator phase by one (in response to incident).', tier: 'high', notes: 'Demotion is itself a high-risk action; logged + user-visible.' },
];

const REGISTRY_BY_ID: Map<string, ActionRiskEntry> = new Map(
  ACTION_RISK_REGISTRY.map(e => [e.id, e])
);

export function getActionEntry(id: string): ActionRiskEntry | undefined {
  return REGISTRY_BY_ID.get(id);
}

export function getActionTier(id: string): RiskTier | undefined {
  return REGISTRY_BY_ID.get(id)?.tier;
}

/** Returns true iff the action is registered. Unregistered actions are treated as 'high' by callers. */
export function isRegisteredAction(id: string): boolean {
  return REGISTRY_BY_ID.has(id);
}
