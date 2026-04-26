# 04-six-layer-vision — ANTON Six-Layer Vision (Strategic)

**Status of diagram:** Generated 2026-04-26 by Claude Code from commit `0fabf7f` (`openexpert@0.7.5`)
**Subsystem status legend:** ✅ Built · 🟢 Partial · 📋 Spec-only · ❌ Future
**Document type:** **Strategic reference, not a structural diagram.** Per `ANTON_Architecture_Schematics_Brief.md` Part C, G1.4, this is the only diagram allowed to show aspirational layers without a tight code citation per node. It maps each layer to *which already-built features serve it* and which are still ahead.
**Maintainer note:** Regenerate when a layer crosses a status threshold (e.g. Marketplace flips from 🟢 → ✅, Economy from ❌ → 📋).

The 6-layer vision is from `CLAUDE.md` "Knowledge Layers & Vision" — each layer independently valuable, each making the next more powerful.

## Diagram

```mermaid
flowchart TD
  classDef done fill:#0F766E,stroke:#5EEAD4,color:#F0FDFA
  classDef partial fill:#7C2D12,stroke:#FDBA74,color:#FFF7ED,stroke-dasharray: 5 3
  classDef spec fill:#1F2937,stroke:#9CA3AF,color:#F9FAFB,stroke-dasharray: 2 2
  classDef future fill:#1F2937,stroke:#6B7280,color:#9CA3AF,stroke-dasharray: 1 4

  L1["<b>Layer 1 — Individual ANTON</b> ✅<br/>Pillars · 7-layer prompts · 4 knowledge modes ·<br/>multi-LLM · output formats · exports"]:::done

  L2["<b>Layer 2 — Intelligent ANTON</b> 🟢<br/>Knowledge atoms · pattern detection ·<br/>predictions · calibration · IRE ·<br/>orchestrator · quality ratchet · apprentice"]:::partial

  L3["<b>Layer 3 — The Network</b> ✅<br/>Community pillar · E2E messaging ·<br/>contact hashes · trust scoring ·<br/>signed knowledge sharing"]:::done

  L4["<b>Layer 4 — Collaborative Intelligence</b> 🟢<br/><b>Specialized Agents — user-visible primitive ✅</b><br/>(see 27-specialized-agents.md)<br/>· ANTON Agent Protocol (AAP) ·<br/><b>Portals — universal public surface ✅</b><br/>(absorbs Marketplace · Beehive · Recruitment ·<br/>Knowledge-Pack libraries) ·<br/>Missions delegation · remote-agent discovery"]:::partial

  L5["<b>Layer 5 — The Marketplace</b> 🟢<br/>Bundle marketplace tables ·<br/>marketplace visitor surface ·<br/>~48 .anton bundle types in registry"]:::partial

  L6["<b>Layer 6 — The Economy</b> 📋<br/>FutureChain payment rail ·<br/>expertise as income ·<br/>fc-* service stubs"]:::spec

  L1 --> L2 --> L3 --> L4 --> L5 --> L6

  %% ── L1 anchors ─────────────────────────────────────────────────────
  subgraph L1A["L1 anchors"]
    direction TB
    L1a["12 pillars wired<br/>(see 03-pillar-topology)"]:::done
    L1b["7-layer prompt-builder.ts ✅"]:::done
    L1c["6 LLM providers (anthropic/openai/<br/>azure/gemini/mistral/ollama) ✅"]:::done
    L1d["40+ output formats ·<br/>5 export targets ✅"]:::done
  end
  L1 --- L1A

  %% ── L2 anchors ─────────────────────────────────────────────────────
  subgraph L2A["L2 anchors"]
    direction TB
    L2a["IRE (iterative-reasoning.ts) ✅"]:::done
    L2b["knowledge-graph + atom-extractor ✅"]:::done
    L2c["pattern-detection ✅"]:::done
    L2d["quality-ratchet · apprentice 🟢"]:::partial
    L2e["orchestrator (Phase 1 = Observer ✅;<br/>Phases 2–4 🟢)"]:::partial
    L2f["Markets pillar = canonical proof<br/>(closed-loop predictions) ✅"]:::done
  end
  L2 --- L2A

  %% ── L3 anchors ─────────────────────────────────────────────────────
  subgraph L3A["L3 anchors"]
    direction TB
    L3a["community-crypto · community-e2e ✅"]:::done
    L3b["community-signing-service ✅"]:::done
    L3c["friends layer (mig 164) ✅"]:::done
    L3d["friend messaging (mig 165) ✅"]:::done
    L3e["knowledge-sharing-service ✅"]:::done
  end
  L3 --- L3A

  %% ── L4 anchors ─────────────────────────────────────────────────────
  subgraph L4A["L4 anchors"]
    direction TB
    L4a["Specialized Agents (5 services + mig 111) ✅"]:::done
    L4b["remote-agent-client (peer discovery) ✅"]:::done
    L4c["Missions delegation + service packs ✅"]:::done
    L4d["Portals = machine-readable<br/>capability surfaces ✅"]:::done
    L4e["AAP transport (aap-rollout-bridge) 🟢"]:::partial
    L4f["Beehive (multi-agent deliberation) 🟢"]:::partial
  end
  L4 --- L4A

  %% ── L5 anchors ─────────────────────────────────────────────────────
  subgraph L5A["L5 anchors"]
    direction TB
    L5a["bundle_marketplace (mig 104) ✅"]:::done
    L5b["marketplace_visitor (mig 163) 🟢"]:::partial
    L5c["MarketplacePage.tsx 🟢"]:::partial
    L5d["~48 bundle types registered<br/>in anton-bundler.ts ✅"]:::done
    L5e["bundle-sharing-service ✅"]:::done
    L5f["Discovery · rating · monetisation 📋"]:::spec
  end
  L5 --- L5A

  %% ── L6 anchors ─────────────────────────────────────────────────────
  subgraph L6A["L6 anchors"]
    direction TB
    L6a["fc-gateway · fc-marketplace ·<br/>fc-budget · fc-settings ·<br/>fc-transactions 🟢"]:::partial
    L6b["FutureChain integration spec exists 📋"]:::spec
    L6c["Expertise-as-income flows ❌"]:::future
  end
  L6 --- L6A
```

## Reading the diagram

The vertical chain (L1 → L6) is the **value-amplification axis**: each layer is independently valuable, and each layer makes the next more powerful. The horizontal anchor groups show **which already-built features serve each layer** — so a strategic conversation about "where are we on Layer 4?" can be answered with a concrete inventory of services and migrations rather than a roadmap.

This is also the diagram to look at when adding a new feature: ask which layer it serves, and whether it makes the next layer more powerful (per CLAUDE.md guidance).

## Layer-by-layer summary

| Layer | Status | What's there now | What's still ahead |
|---|---|---|---|
| **L1 Individual ANTON** | ✅ | 12 pillars, 7-layer prompts, 4 knowledge modes, 6 LLM providers, exports, knowledge packs | — |
| **L2 Intelligent ANTON** | 🟢 | IRE, knowledge graph, atom extraction, pattern detection, Markets closed-loop. Quality ratchet + apprentice partial. Orchestrator Phase 1 only. | Orchestrator phases 2–4 (Proposal Manager → Supervised → Autonomous), full apprentice loop |
| **L3 The Network** | ✅ | E2E crypto, signing, friends + messaging, knowledge sharing | — |
| **L4 Collaborative Intelligence** | 🟢 | Specialized Agents, remote agent discovery, Missions delegation, Portals as capability surfaces | AAP contact-hash format verified end-to-end, Beehive deliberation surface, full ANTON-to-ANTON capability invocation |
| **L5 The Marketplace** | 🟢 | Bundle marketplace tables, visitor surface, 48 registered bundle types, sharing service | Discovery / rating / monetisation flows |
| **L6 The Economy** | 📋 | fc-* service stubs, FutureChain spec | FutureChain payment rail integration, expertise-as-income flows |

## Source references (loose, by design)

This diagram intentionally cites broadly rather than per-line — it's strategic, not structural. For tight citations see the structural diagrams (`01`, `02`, `03`).

- **L1:** `src/App.tsx`, `src/lib/constants.ts`, `server/services/prompt-builder.ts`, `server/services/unified-llm-client.ts`, `server/services/export-*.ts`.
- **L2:** `server/services/iterative-reasoning.ts`, `knowledge-graph.ts`, `atom-extractor.ts`, `pattern-detection.ts`, `quality-ratchet.ts`, `apprentice.ts`, `orchestrator-engine.ts`, `market-*.ts`.
- **L3:** `server/services/community-{crypto,e2e,signing-service}.ts`, `knowledge-sharing-service.ts`, migrations 077, 080, 099–104, 110, 164–165.
- **L4:** `server/services/agent-*.ts`, `remote-agent-client.ts`, `mission-delegation.ts`, `portals/`, `capability-descriptor/`, `aap-rollout-bridge.ts`, `beehive-*.ts`.
- **L5:** `server/db/migrations-pg/104_bundle_marketplace.sql`, `163_marketplace_visitor.sql`, `server/services/anton-bundler.ts`, `bundle-sharing-service.ts`, `src/pages/MarketplacePage.tsx`.
- **L6:** `server/services/fc-*.ts`, migrations 081, 082, 087.
- **CLAUDE.md** — "Knowledge Layers & Vision" section is the canonical six-layer narrative.

## Open questions

- **Layer 2 Orchestrator phasing** — exact built/partial split per phase (Observer → Proposal → Supervised → Autonomous) needs the G3.2 deep-dive before the L2 status can be promoted from 🟢 to ✅.
- **Layer 4 AAP** — until contact-hash format and full handshake are confirmed in code, AAP stays 🟢 (transport bridge exists; protocol semantics unverified).
- **Layer 5 Marketplace** — the *surface* exists but the *economy mechanics* (discovery, rating, monetisation) do not. Status is intentionally split per anchor.

## Related diagrams

- `01-system-context` — outer-world view that L3, L4, L5, L6 all touch.
- `02-container-diagram` — services that anchor each layer.
- `03-pillar-topology` — L1 user-facing surfaces.
- `f-50-markets-pillar` (Group 5) — L2 proof case.
- `f-51-talent-discovery` (Group 5) — L4 example.
- `30-aap-protocol` (Group 4) — L4 transport detail.
