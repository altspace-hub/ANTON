# Specialized Agents — One-Pager

> **What it is:** Layer 4 of ANTON's Six-Layer Vision, made into a user-visible primitive.
> **Who it's for:** anyone who wants long-lived AI personas — not single-shot chats, not workflow-templated missions, but **named agents with defined capabilities** that can be composed, shared, and invoked across instances.
> **What makes it different:** Specialized Agents are the only platform primitive that natively supports **agent-to-agent collaboration across organisational boundaries** with cryptographic attribution.

---

## The pitch

The first wave of agents — assistants in IDEs, workflow runners — assume agents live inside a single environment owned by a single user. Useful, but they don't compose across orgs.

Specialized Agents solve a different problem: **multi-org agent collaboration with audit-grade attribution**.

A consultancy publishes an "FCP Specialist" agent. A bank's compliance team can discover it, verify its provenance, invoke its `search` capability, and receive structured answers — without the consultancy's data leaving their instance and without the bank's question leaving theirs. Both sides record the exchange in a signed trail.

Multiply that across thousands of organisations. **A network of named, signed, auditable agents** is the substrate Layer 4 of the Six-Layer Vision is building toward.

---

## Six-Layer Vision tie-in

| Layer | What it provides | Specialized Agents' role |
|---|---|---|
| 1 — Individual ANTON | Pillars, modules, prompts | Agents *use* modules + prompts |
| 2 — Intelligent ANTON | Atoms, patterns, predictions, trust | Agents *learn* from atoms; trust phase governs autonomy |
| 3 — The Network | Community, signed messaging | Agents *travel* via the same E2E channels |
| **4 — Collaborative Intelligence** | **Cross-org agent collaboration** | **Specialized Agents are how this layer is operational today** |
| 5 — The Marketplace | `.anton` exchange | Agents *ship* as `.anton skill-pack` bundles |
| 6 — The Economy | FutureChain | Agents *bill* (future) per invocation via FutureChain |

Without Specialized Agents, Layer 4 is conceptual. With them, it's `/agents` + `remote-agent-client.ts` + `agent_invocations`.

---

## What you can do today

- **Build** named agents with system prompt + default model + capabilities + connectors at `/agents`
- **Reach** external systems via the Connector Executor (Roaring, Dow Jones, Salesforce, HubSpot, REST, MCP)
- **Compose** agents into Missions and Workflows
- **Publish** agents as `public-aap` so peer ANTONs can discover them via Pathfinder
- **Invoke** remote agents with capability negotiation + signed responses
- **Audit** every invocation in the consolidated `/audit-trail` viewer

---

## What's coming next

The pattern is in place; the next maturation steps:

- **Agent marketplace** — agents as a `.anton skill-pack` bundle category in the Marketplace pillar
- **Per-invocation pricing** — Layer 6 integration so `public-aap` agents can charge for use
- **Multi-agent deliberation** — the Beehive surface (Addendum 1 §E.6) makes N agents on N instances co-think on a problem with attribution preserved

---

## Where to look

- **Try it:** `/agents` (the Hub)
- **Code:** `server/services/agent-*.ts` (5 services), `server/routes/agents.ts`
- **Docs:** [`/docs/agents/`](../agents/) — README, builder, connector-executor, remote-agents
- **Architecture:** [`/docs/architecture/27-specialized-agents.md`](../architecture/27-specialized-agents.md), [`/docs/architecture/04-six-layer-vision.md`](../architecture/04-six-layer-vision.md)

---

*Refresh when remote-invocation flows mature, when agent-marketplace lands, or when the Layer-6 pricing layer becomes real.*
