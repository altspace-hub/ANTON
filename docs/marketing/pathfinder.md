# Pathfinder — One-Pager

> **What it is:** ANTON's mode-aware research and discovery layer. The "smart action bar" that resolves user intent across portals, agents, modules, and capability descriptors.
> **Who it's for:** anyone using ANTON to find something — a portal that solves a need, an agent that has expertise, a module that fits a task, a knowledge pack covering a domain.
> **What makes it different:** **manifest-first discovery + capability negotiation**. Pathfinder doesn't search vector embeddings; it queries the registry of what each portal / agent / module declares it can do, in the 12-verb capability taxonomy, with cryptographic provenance.

---

## The pitch

Most "AI search" tools are vector retrieval over a corpus. They find documents that look similar to the query.

Pathfinder is shaped differently: it's a **discovery + negotiation layer over manifest-declared capabilities**. The user types intent ("find me a regulator-friendly AML knowledge pack" or "an agent that does sanctions screening"); Pathfinder:

1. Maps intent to one of the 12 capability verbs (search, get, render, verify, attest, invoke, etc.)
2. Queries the local + cached-peer registries for portals + agents that declare the verb
3. Validates each candidate's signature against its publishing instance's pubkey
4. Ranks by match-to-intent, recency, trust score
5. Returns a structured result with deep-links + invocation contracts

This makes Pathfinder the entry point to ANTON's Layer 4 (Collaborative Intelligence). Without it, the network of portals + agents is hard to use; with it, the network is queryable.

---

## What you can do today

| Surface | Purpose |
|---|---|
| `/pathfinder` (visitor) | Visitor-side discovery — browse portals + agents by category, search by capability |
| (embedded) Pathfinder smart action bar | Per-pillar embed — surface relevant capabilities in context |

Plus modes for specific contexts:
- **`anton-portal` mode** — discover portals + invoke their capabilities
- **`agent-discovery` mode** — find Specialized Agents via remote-agent-client
- **`knowledge-pack` mode** — find regulatory knowledge packs via marketplace

---

## Service surface

| File | Responsibility |
|---|---|
| `server/services/pathfinder-engine.ts` | Top-level intent → capability resolver |
| `server/services/smart-actions-analyzer.ts` | Maps natural-language intent to 12-verb capabilities |

Plus reads from:
- `registry-client/` for cross-instance descriptor fetches
- `capability-descriptor/` for verb-vocabulary semantics
- `connected_users` for trust-graph distance

---

## Schema

| Migration | Tables |
|---|---|
| 161 (pathfinder visitor) | `pathfinder_search_log`, `pathfinder_result_feedback` |

---

## Where it sits in the architecture

Pathfinder is the **consumer** of what Portals + Specialized Agents + Knowledge Packs publish. Without published capabilities, Pathfinder has nothing to discover. The strategic shape:

```
Portals + Agents + Packs publish capability descriptors → registry
                          ↓
                    Pathfinder queries
                          ↓
              user gets a structured result
                          ↓
                Pathfinder invokes the chosen capability
```

This makes Pathfinder a small surface today (1 dedicated page, 2 services) but a load-bearing primitive for the network.

---

## Where to look

- **Try it:** `/pathfinder` (visitor)
- **Code:** `server/services/pathfinder-engine.ts`, `smart-actions-analyzer.ts`
- **Docs:** [`/docs/pathfinder/`](../pathfinder/)
- **Architecture:** [`/docs/architecture/33-portals-pathfinder.md`](../architecture/33-portals-pathfinder.md)
- **Capability taxonomy:** [`/docs/portals/capability-descriptor.md`](../portals/capability-descriptor.md)

---

*Refresh when a new Pathfinder mode lands, when the verb taxonomy extends, or when ranking signals evolve.*
