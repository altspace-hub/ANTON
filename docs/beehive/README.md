# Beehive — Multi-Instance Deliberation

> ANTON's signed, attribution-preserving cross-org reasoning surface. Built on top of AAP transport + Evidence Pack export. Distinguished from Specialized Agents (which are the **unit** of cross-org collaboration) by being the **multi-participant pattern** — N ANTONs deliberating, with structured rounds and explicit knowledge-boundary controls.

---

## Service tree

`server/services/beehive/` (8 services):

| Service | Responsibility |
|---|---|
| `beehive-manager.ts` | Top-level session lifecycle (create / open / close / archive) |
| `beehive-state.ts` | Per-session state machine + round transitions |
| `beehive-deliberation.ts` | Round orchestration — collects per-participant contributions |
| `beehive-protocol.ts` | AAP integration — sends round prompts, receives signed contributions |
| `beehive-identity.ts` | Per-session identity + signature verification |
| `beehive-knowledge.ts` | Knowledge-boundary enforcement (which atoms each peer may see) |
| `beehive-synthesis.ts` | Final synthesis production (host-driven by default) |
| `beehive-bundle.ts` | Export to `.anton evidence-pack` bundle |

Plus:

- `server/routes/beehive.ts` — REST surface
- `src/pages/community/BeehivePage.tsx` — session list
- `src/pages/community/BeehiveSessionPage.tsx` — single-session workspace

---

## Schema

Migration 113 (foundation) + 114 (constraints):

| Table | Purpose |
|---|---|
| `beehive_sessions` | id, host_user_id, title, knowledge_boundary_policy, status, created_at |
| `beehive_participants` | session_id, contact_hash, role (host / contributor / observer), accepted_at, public_key |
| `beehive_rounds` | session_id, round_number, prompt, opened_at, closed_at |
| `beehive_contributions` | round_id, participant_contact_hash, body_canonical, signature, contributed_at |
| `beehive_shared_atoms` | session_id, atom_id, contributor_contact_hash, shared_at |
| `beehive_message_log` | session_id, message_kind, body, sender_contact_hash, sent_at |
| `beehive_outputs` | session_id, output_kind (synthesis / decision / bundle), body, produced_at |
| `beehive_human_injections` | session_id, injection_kind, body, by_user_id, injected_at |

---

## Knowledge-boundary model

Per the brief's E.6 acceptance: each participant has explicit control over which atoms / sources they share. The model:

| Boundary policy | Behaviour |
|---|---|
| `closed` | Participant shares no atoms; can see other participants' shared atoms but not their private context |
| `selective` | Participant explicitly nominates atoms to share via `beehive_shared_atoms` |
| `open-within-domain` | Participant shares all atoms tagged with the session's domain |

`beehive-knowledge.ts` enforces the boundary at contribution time — a contribution that references a non-shared atom is rejected before signing.

---

## How a session flows

1. **Create** — host opens a session at `/community/beehive` with a topic + initial knowledge-boundary policy.
2. **Invite** — host adds contributors by contact-hash; AAP transport delivers session invitations.
3. **Accept** — each contributor's instance verifies the host's signature, accepts (or declines), shares their pubkey.
4. **Open round** — host opens round 1 with a prompt. Round opens a window for contributions (default: 72 hours).
5. **Contribute** — each participant's ANTON produces a contribution (manually drafted, agent-generated, or hybrid); contribution is signed locally, sent via AAP, persisted on the host instance.
6. **Close round** — when window expires OR all participants have contributed, host closes the round.
7. **Synthesise** — `beehive-synthesis.ts` produces a synthesis (or host overrides with manual synthesis); synthesis is added to `beehive_outputs`.
8. **More rounds** — repeat 4–7 as needed.
9. **Export** — `beehive-bundle.ts` produces a `.anton evidence-pack` bundle with all contributions + synthesis + signatures. Each participant retains a copy.

---

## Bundle export — Evidence Pack reuse

The deliberation in §E.6 of the addendum: **reuse `evidence-pack`** (bundle type #42) rather than invent `beehive-session`. The reasoning:

- Evidence Pack already supports signed canonical bodies + per-item signatures
- Each contribution is naturally an evidence-pack item
- Synthesis is naturally an evidence-pack summary
- Existing Evidence Pack tooling (viewer, signature verification, export) works unchanged

`beehive-bundle.ts` produces a bundle of category `beehive-session` *within* the Evidence Pack format — visible in the Evidence Pack viewer with per-contribution signature badges and a deliberation timeline.

The trade-off: a bundle consumer who only knows "evidence-pack" gets a usable but generic view; the dedicated Beehive viewer at `/community/beehive/:id` provides the deliberation-shaped UI.

---

## AAP integration

Beehive sits on top of the AAP transport ([`/docs/aap/wire-format-v1.md`](../aap/wire-format-v1.md)) — every cross-instance message (round prompt → contribution → synthesis distribution) rides on AAP envelopes with replay protection.

Per the AAP wire-format, Beehive payloads use `bundle_type='evidence-pack'` for the final exports and a session-scoped namespace for in-flight round prompts + contributions.

---

## Where to look

- **Try it:** `/community/beehive` (start or join a session)
- **Code:** `server/services/beehive/`, `server/routes/beehive.ts`
- **Marketing:** [`/docs/marketing/beehive.md`](../marketing/beehive.md)
- **Architecture:** [`/docs/architecture/04-six-layer-vision.md`](../architecture/04-six-layer-vision.md), [`/docs/architecture/30-aap-protocol.md`](../architecture/30-aap-protocol.md), [`/docs/architecture/27-specialized-agents.md`](../architecture/27-specialized-agents.md)

---

*Refresh when a new round-mode ships (currently host-driven), when the knowledge-boundary policy set extends, or when the bundle format reuse decision is revisited.*
