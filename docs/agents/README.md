# Specialized Agents

> ANTON's **Layer 4 (Collaborative Intelligence)** primitive. Agents are reusable, cross-pillar autonomous personas that Missions, Workflows, and other surfaces can compose. Where a Mission is a templated business workflow, a Specialized Agent is a long-lived, conversational, capability-bound entity.

---

## Agent vs Mission — what's the difference?

| Specialized Agent | Mission |
|---|---|
| Long-lived, conversational | Time-bound, task-graph-driven |
| Cross-pillar primitive | Templated business workflow |
| Composes into Missions and other surfaces | Composes Agents (and modules, workflows) |
| State persists between conversations | State persists per-mission instance |
| Owns capability-descriptor + connector bindings | Inherits capabilities from its Service Pack |
| Reachable via AAP from peer ANTONs (`remote-agent-client.ts`) | Local to the instance unless explicitly delegated |
| Examples: "Compliance Officer", "Travel Planner", "FCP Researcher" | Examples: "AMLR Readiness Programme", "Knowledge Synthesis" |

A Mission can invoke an Agent for a specific step. An Agent can be the persona behind a long-running Mission. The two compose.

---

## Six-Layer Vision tie-in

ANTON's strategic architecture has [six layers](../architecture/04-six-layer-vision.md):

1. Individual ANTON (pillars + 7-layer prompts)
2. Intelligent ANTON (atoms · patterns · predictions · trust)
3. The Network (Community + signed E2E messaging)
4. **Collaborative Intelligence** ← Specialized Agents live here
5. The Marketplace (`.anton` exchange)
6. The Economy (FutureChain)

Agents are how **Layer 4 becomes a user-visible primitive**. Without Agents, Layer 4 is conceptual — "ANTONs collaborating." With Agents:

- A user can **define a named persona** with system prompt + capabilities + connectors
- The persona is **reachable via AAP** from peer ANTONs, with capability negotiation
- Each interaction emits a signed trail entry
- Multiple agents on multiple instances can deliberate (this is the Beehive use case)

The implementation lives at `server/services/agent-service.ts`, `agent-processor.ts`, `agent-builder.ts`, `agent-connector-executor.ts`, `remote-agent-client.ts`. The hub UI is `src/pages/agents/AgentHubPage.tsx`.

---

## What's in this doc tree

| File | Audience | Purpose |
|---|---|---|
| `README.md` (this file) | everyone | Why Agents · Agent vs Mission · Layer 4 tie-in |
| [`builder.md`](builder.md) | contributors | How `agent-builder.ts` lets a user define a new specialized agent |
| [`connector-executor.md`](connector-executor.md) | implementers | How agents reach external systems |
| [`remote-agents.md`](remote-agents.md) | implementers | The AAP-via-agents story (cross-instance agents) |
| **External:** [`/docs/marketing/specialized-agents.md`](../marketing/specialized-agents.md) | strategic readers | Layer 4 as a sellable primitive |
| **External:** [`/docs/architecture/27-specialized-agents.md`](../architecture/27-specialized-agents.md) | architects | Lifecycle diagram (build → register → invoke → emit trail) |

---

## Service surface

| Service | Responsibility |
|---|---|
| `agent-service.ts` | CRUD over the `agent_profiles` table |
| `agent-processor.ts` | Run a conversation turn against an agent profile (LLM call + tool routing) |
| `agent-builder.ts` | Programmatic + UI-driven creation of new agents |
| `agent-connector-executor.ts` | Execute a connector call (REST / DB / MCP) on behalf of an agent |
| `remote-agent-client.ts` | Cross-instance agent invocation via AAP |

The hub UI at `/agents` (`src/pages/agents/AgentHubPage.tsx`) lets users browse, build, edit, and converse with their agents.

---

## Schema

Migration 111 introduces:

- `agent_profiles` — per-agent identity (name, system prompt, default model, capabilities)
- `agent_capabilities` — per-agent capability bindings (which AAP verbs the agent exposes)
- `agent_connectors` — per-agent connector bindings (which external systems)
- `agent_invocations` — audit trail (every call → response → tokens → outcome)
- `agent_remote_resolutions` — cache of contact-hash → remote agent resolutions

---

## How an agent flows

1. **Build** — owner defines name + system prompt + default model + capabilities + connectors.
2. **Register** — agent profile signed with instance Ed25519 key; published as a capability descriptor (registry-protocol).
3. **Discover** — locally via `/agents`; cross-instance via `remote-agent-client.ts` + AAP.
4. **Invoke** — call goes through `agent-processor.ts` → LLM (via `unified-llm-client`) + connector executor → response.
5. **Trail** — every invocation appends to `agent_invocations` + (for cross-instance) `community_signed_trail_entries`.
6. **Compose** — Missions and Workflows can call agents as steps; agents can call other agents (with cycle detection).

---

## Where to start

- **Try it:** `/agents` (Agent Hub).
- **Code:** `server/services/agent-*.ts`, `server/routes/agents.ts`.
- **Architecture:** [`/docs/architecture/27-specialized-agents.md`](../architecture/27-specialized-agents.md).

---

*Refresh when a new agent service ships, when the Layer 4 framing evolves, or when the connector type catalogue extends.*
