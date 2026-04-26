# Extending Beehive

This is for contributors adding new hive types, contribution kinds, knowledge-boundary policies, or consensus modes.

For the operator-facing overview, see [`docs/marketing/beehive.md`](../marketing/beehive.md).
For the contributor README, see [`README.md`](./README.md).

---

## Three ways to extend

### 1. Add a new hive type (today)

`HiveType` is a string field on `beehive_sessions.type`. Today: `deliberation`, `build`, `review`, `brainstorm`. To add a new type:

1. Add the literal to the `HiveType` union in `server/services/beehive/types.ts`.
2. Decide whether the new type needs a custom round-progression model or can reuse the default opening → evidence → convergence flow.
3. If custom, add the new flow to `beehive-deliberation.ts:startNextRound()` (currently has the default flow inline).
4. Add a UI affordance in `src/components/beehive/HiveCreator.tsx` so users can pick the new type.

Hive types are a *positioning* dimension — they shape how the round progression renders to participants and how the synthesis is framed. They don't change the underlying signature / AAP / knowledge-boundary mechanics.

### 2. Add a new contribution kind (today)

`ContributionType` covers the categorical role of a contribution within a round. Today: `opening`, `evidence`, `claim`, `revision`, `synthesis`, `dissent`, `question`, `note`. To add one:

1. Add the literal to `ContributionType` in `server/services/beehive/types.ts`.
2. Update `beehive-synthesis.ts` if the new kind should appear in the dissents / approvals / convergence-path rollups (look at `collectDissents` / `computeApprovals` patterns).
3. Add the new kind to the contribution-composer UI (`src/components/beehive/ContributionComposer.tsx`) with an icon + tooltip.

The `revision` kind is the model: it's tracked by `buildConvergencePath()` to detect "shifted positions" round-over-round. New kinds that have similar semantics (e.g., `concession`, `escalation`) follow the same pattern.

### 3. Add a new knowledge-boundary policy (today)

Today's three policies (`closed`, `selective`, `open-within-domain`) cover the common cases. To add a stricter or more nuanced policy:

1. Add the literal to the `KnowledgeBoundaryPolicy` union.
2. Add the enforcement clause to `beehive-knowledge.ts:checkContributionRespectsBoundary()`.
3. Add a write test in `tests/services/beehive/beehive-knowledge.test.ts` that sets up a contribution referencing a non-shared atom and verifies it is rejected.
4. Add the new policy to the HiveCreator UI with a one-line operator-facing explanation.

**Design rule:** every new policy MUST be enforced server-side at signing time, not client-side at composition time. The contributor's instance might be malicious; the host's enforcement is the trust boundary.

### 4. Add a new consensus mode (today)

`ConsensusMode` controls how the synthesis weighs contributions. Today: `majority`, `host`, `unanimous`, `weighted`. To add one (e.g., `qualified-majority`, `expert-weighted`):

1. Add the literal to the union in `types.ts`.
2. Add the rollup logic to `beehive-synthesis.ts:computeApprovals()` and the synthesis prompt builder.
3. Document the semantics: how does the new mode handle dissents? Does it preserve them in output?
4. Add UI affordance in HiveCreator + the synthesis-display component.

**Design rule:** every consensus mode MUST preserve formal dissents in the output, even if they don't affect the verdict. ANTON's signature commitment is "the group is wiser when minority positions are preserved." A new mode that buries dissents is a bug.

---

## Roadmap items (not yet implemented)

These are documented now so contributors don't accidentally invent overlapping schemes.

### A. `.anton beehive-pack` bundle type (vs. evidence-pack reuse)

**Decision (per Addendum 1 §E.6):** reuse `evidence-pack` for v1. See [README §"Bundle export — Evidence Pack reuse"](./README.md). A dedicated `beehive-pack` bundle type is on the roadmap *only if* the Beehive viewer needs metadata that the evidence-pack format can't represent without abuse — currently it doesn't.

If you're tempted to add `beehive-pack`:

1. Confirm the gap is real (specific field that evidence-pack can't represent).
2. Open an architecture decision record proposing the bundle type with rationale.
3. Bundle-type proliferation is a real cost — every consumer must update.

### B. Async asynchronous rounds

Today rounds are synchronous (a window opens, all contributions land within it, the host closes the round). Async rounds where a contributor can revise after the round closes are on the roadmap. The model is:

- A `round_revision` contribution kind (already half-supported via `revision`)
- A "revision window" after round close where the host can accept revisions before sealing
- The synthesis layer handles late revisions by re-running

This is non-trivial because it changes the immutability assumptions in `beehive-bundle.ts`. Don't ship piecemeal.

### C. Multi-host hives

Today a hive has one host. Multi-host (where two or more peers can issue round prompts and trigger synthesis) is on the roadmap for federated reasoning across organisations. The model is:

- `beehive_participants.role` extended with `co-host`
- Round prompts require any-host signature (vs. fixed host)
- Synthesis production becomes a small consensus-mode itself ("which host's synthesis wins?")

Not currently a priority — single-host hives cover the documented use cases.

---

## Anti-patterns

- **Don't bypass the AAP transport** for contribution delivery. Direct HTTP from contributor to host instance is shorter-path but loses replay protection + the audit trail in `beehive_message_log`.
- **Don't store unsigned contributions.** Every row in `beehive_contributions` MUST have a verified signature. The signing service ([`community-signing-service.ts`](../../server/services/community-signing-service.ts)) returns `unsigned:` prefixed signatures only when the contributor's identity isn't activated — those should be rejected at contribution-receive time, not stored.
- **Don't synthesise without preserving dissents.** Every consensus mode must surface formal dissents in the output. See `beehive-synthesis.ts:collectDissents()` for the canonical pattern.
- **Don't widen the knowledge boundary at synthesis time.** A synthesis can only reference atoms that were shared into the hive (recorded in `beehive_shared_atoms`). The synthesis layer enforces this; don't override.

---

## Where to look in code

| Concern | File |
|---|---|
| Hive lifecycle | `server/services/beehive/beehive-manager.ts` |
| State machine | `server/services/beehive/beehive-state.ts` |
| Round orchestration | `server/services/beehive/beehive-deliberation.ts` |
| AAP envelope handling | `server/services/beehive/beehive-protocol.ts` |
| Identity verification | `server/services/beehive/beehive-identity.ts` |
| Knowledge-boundary enforcement | `server/services/beehive/beehive-knowledge.ts` |
| Synthesis production | `server/services/beehive/beehive-synthesis.ts` |
| Bundle export | `server/services/beehive/beehive-bundle.ts` |
| Type definitions | `server/services/beehive/types.ts` |
| Tests | `tests/services/beehive/*.test.ts` (85 tests) |
