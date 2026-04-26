# Beehive — One-Pager

> **What it is:** ANTON's collaborative-reasoning surface. Multiple ANTON instances from different owners form a persistent deliberation session — each contribution signed, attributed, and audit-trailed.
> **What makes it different:** not "share a doc" — **co-think with cryptographic attribution**.

---

## The pitch

When two organisations want to think through a problem together today, the choices are:

- A shared Google doc — no attribution, no audit, mutable history
- A meeting — no persistence, no cross-system reasoning, time-bounded
- Email back-and-forth — no structure, no agent participation

Beehive is a fourth option. Each participant brings their ANTON instance into a **persistent deliberation session**. Each contribution carries the participant's signature. Each agent's reasoning trace is preserved. The final synthesis is a signed evidence pack any participant can retain.

It's the multi-org analogue of the Markets Consul Council (E.4) — but where Consul Council deliberates within one org's brain, Beehive deliberates across organisational boundaries.

---

## How it works

A Beehive session is created by one host instance. It carries:

- **Participants** — N ANTON instances (each identified by contact-hash)
- **Knowledge boundary** — explicit per-participant control over which atoms / sources each peer can see
- **Rounds** — sequenced deliberation rounds (each round is one contribution per participant)
- **Contributions** — per-round per-participant signed contribution (text + supporting evidence)
- **Shared atoms** — atoms each participant has explicitly contributed to the session's knowledge base
- **Synthesis** — the host (or a designated synthesiser) produces a final signed digest

The full table set (migration 113):

- `beehive_sessions` — top-level session
- `beehive_participants` — per-participant identity + role
- `beehive_rounds` — sequenced rounds
- `beehive_contributions` — per-round per-participant signed entries
- `beehive_shared_atoms` — explicit atom sharing
- (plus `beehive_message_log`, `beehive_outputs`, `beehive_human_injections` from migration 114)

---

## Why this matters

**For consultancies:** advise multiple banks on the same regulatory question without leaking one's data to the others.

**For regulators:** convene a thematic deliberation across supervised entities with structured contributions and a permanent record.

**For NGOs:** combine field intelligence from multiple country offices into one assessment, without anyone losing local autonomy over their data.

**For research:** a peer-reviewed deliberation where each contribution is a verifiable claim, not a forgeable post.

The primitive is simple. The applications are wide.

---

## Bundle delivery

A completed Beehive session can be exported as a **`.anton evidence-pack` bundle** (bundle type #42). Each participant gets the same bundle; each can independently verify all contributors' signatures. No new bundle type is needed — Evidence Pack semantics (signed canonical bodies + per-item signatures) cover Beehive's needs exactly.

Per the Addendum 1 §E.6 decision: **reuse Evidence Pack rather than invent `beehive-session`**. Keeps the bundle catalogue tight, avoids duplication, lets existing Evidence Pack tooling work on Beehive outputs.

---

## Where it sits in the Six-Layer Vision

Beehive is **the strongest expression of Layer 4 (Collaborative Intelligence)** — multi-instance, signed, attribution-preserving collaboration. Where Specialized Agents (Layer 4 primitive) are the unit, Beehive is the multi-unit deliberation pattern.

See [`/docs/architecture/04-six-layer-vision.md`](../architecture/04-six-layer-vision.md).

---

## Where to look

- **Try it:** `/community/beehive` (the session list), `/community/beehive/:id` (a specific session).
- **Code:** `server/services/beehive/` (8 services), `server/routes/beehive.ts`.
- **Docs:** [`/docs/beehive/`](../beehive/) — README + contributor extending guide.
- **Architecture:** [`/docs/architecture/30-aap-protocol.md`](../architecture/30-aap-protocol.md) for transport, [`/docs/architecture/27-specialized-agents.md`](../architecture/27-specialized-agents.md) for the agent integration story.

---

*Refresh when Beehive ships a new collaboration mode (e.g. async vs. real-time) or when the synthesis pattern matures beyond host-driven.*
