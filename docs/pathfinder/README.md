# Pathfinder

> ANTON's manifest-first discovery layer. Maps user intent to capability descriptors across portals, agents, knowledge packs, and modules. Sits at the entry point of Layer 4 (Collaborative Intelligence).

---

## Quick map

| If you want to… | Read |
|---|---|
| Strategic positioning | [`/docs/marketing/pathfinder.md`](../marketing/pathfinder.md) |
| 12-verb capability taxonomy | [`/docs/portals/capability-descriptor.md`](../portals/capability-descriptor.md) |
| Architecture | [`/docs/architecture/33-portals-pathfinder.md`](../architecture/33-portals-pathfinder.md) |
| Extending Pathfinder | [`extending.md`](extending.md) |

---

## Service surface

| File | Responsibility |
|---|---|
| `server/services/pathfinder-engine.ts` | Top-level intent → capability resolver |
| `server/services/smart-actions-analyzer.ts` | Maps natural-language intent to 12-verb capabilities |

Reads from `registry-client/` for cross-instance descriptor fetches; `capability-descriptor/` for verb-vocabulary semantics.

---

## Schema

| Migration | Tables |
|---|---|
| 161 (pathfinder visitor) | `pathfinder_search_log`, `pathfinder_result_feedback` |

---

## Pathfinder modes

Pathfinder operates in mode-aware form. Each mode targets a specific kind of capability:

| Mode | Targets |
|---|---|
| `anton-portal` | Portals (any category) — discover + invoke verbs |
| `agent-discovery` | Specialized Agents — discover + invoke (remote-agent-client) |
| `knowledge-pack` | Regulatory knowledge packs via marketplace |
| `module-discovery` | Work-pillar modules + custom_modules |

Each mode is a thin layer on top of the same intent → 12-verb mapping. Future modes (`mission-discovery`, `evidence-pack-discovery`, etc.) extend additively.

---

## How an invocation flows

1. User types intent at `/pathfinder` (or in an embedded smart action bar).
2. `smart-actions-analyzer.ts` maps intent → primary verb + secondary verbs + extracted slots (e.g. domain, jurisdiction, target entity).
3. `pathfinder-engine.ts` queries:
   - Local descriptor cache (`portal_descriptor_cache`, equivalent for agents)
   - Cross-instance descriptors via `registry-client/`
4. Each candidate's signature verified against its publishing instance's pubkey.
5. Candidates ranked by: verb match, slot fit, recency, trust-graph distance.
6. User sees ranked list with deep-link + invocation contract.
7. User picks → Pathfinder invokes via the capability's invocation surface (`portal-handler.ts` for portals, `remote-agent-client.ts` for agents).
8. Invocation logged to `pathfinder_search_log` + `pathfinder_result_feedback`.

---

## Where to start

- **Try it:** `/pathfinder` (visitor)
- **Code:** `server/services/pathfinder-engine.ts`, `smart-actions-analyzer.ts`
- **Marketing:** [`/docs/marketing/pathfinder.md`](../marketing/pathfinder.md)
- **Capability taxonomy:** [`/docs/portals/capability-descriptor.md`](../portals/capability-descriptor.md)
- **Extending:** [`extending.md`](extending.md)

---

*Refresh when a new mode ships, when ranking signals evolve, or when the intent → verb mapping is retrained.*
