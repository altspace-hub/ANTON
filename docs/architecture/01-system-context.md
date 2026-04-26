# 01-system-context — ANTON System Context

**Status of diagram:** Generated 2026-04-26 by Claude Code from commit `0fabf7f` (`openexpert@0.7.5`)
**Subsystem status legend:** ✅ Built · 🟢 Partial · 📋 Spec-only · ❌ Future
**Maintainer note:** Regenerate when a new external integration is added (new LLM provider, new connector type, new transport for AAP / Companion App), or when an actor type changes.

This is the highest-altitude view of ANTON: a single box in the middle, every external actor and system it talks to on the outside. C4 "System Context" style.

## Diagram

```mermaid
flowchart LR
  classDef actor fill:#1F2937,stroke:#9CA3AF,stroke-width:1px,color:#F9FAFB
  classDef llm fill:#0F766E,stroke:#5EEAD4,stroke-width:1px,color:#F0FDFA
  classDef extdata fill:#1E3A8A,stroke:#93C5FD,stroke-width:1px,color:#EFF6FF
  classDef proto fill:#7C2D12,stroke:#FDBA74,stroke-width:1px,color:#FFF7ED
  classDef anton fill:#0D7D6C,stroke:#0D7D6C,stroke-width:3px,color:#FFFFFF
  classDef partial stroke-dasharray: 5 3
  classDef spec stroke-dasharray: 2 2,opacity:0.7

  %% ── Human actors ──────────────────────────────────────────────────────────
  subgraph Actors["End-user actors"]
    direction TB
    Pro["Professional<br/>(consultant, lawyer, MLRO,<br/>compliance officer, analyst) ✅"]:::actor
    Admin["Instance Admin<br/>(deploys + pairs devices) ✅"]:::actor
    Guardian["Guardian<br/>(School pillar) ✅"]:::actor
    Teacher["Teacher<br/>(School pillar) ✅"]:::actor
    Student["Student<br/>(School pillar) ✅"]:::actor
  end

  %% ── ANTON itself ──────────────────────────────────────────────────────────
  ANTON["<b>ANTON Instance</b><br/>localhost web app + companion gateway<br/>v0.7.5 — 12 pillars<br/>59 areas · 263 modules<br/>121 PG migrations"]:::anton

  %% ── External LLM providers ────────────────────────────────────────────────
  subgraph LLMs["External LLM providers (server-side keys only)"]
    direction TB
    Anthropic["Anthropic<br/>claude-opus-4-7 default<br/>+ prompt caching ✅"]:::llm
    OpenAI["OpenAI<br/>gpt-4o ✅"]:::llm
    Azure["Azure OpenAI<br/>(reasoning models o3/o4-mini) ✅"]:::llm
    Gemini["Google Gemini<br/>gemini-2.0-flash ✅"]:::llm
    Mistral["Mistral<br/>mistral-large-latest ✅"]:::llm
    Ollama["Local Ollama<br/>(offline) ✅"]:::llm
  end

  %% ── External data ─────────────────────────────────────────────────────────
  subgraph Data["External data sources"]
    direction TB
    Web["Web search<br/>(Anthropic web_search_20250305<br/>+ Bing fallback) ✅"]:::extdata
    URLs["User-supplied URLs<br/>(url-fetcher) ✅"]:::extdata
    Folders["Local folders<br/>(ALLOWED_FOLDER_PATHS<br/>whitelist) ✅"]:::extdata
    EDI["External Data Integration<br/>PostgreSQL · MySQL · MSSQL ·<br/>MongoDB · REST · MCP 🟢"]:::extdata
    Roaring["Roaring<br/>(Nordic entity data) ✅"]:::extdata
    DowJones["Dow Jones<br/>(sanctions screening) ✅"]:::extdata
  end

  %% ── ANTON-to-ANTON & payment protocols ───────────────────────────────────
  subgraph Protocols["Network protocols"]
    direction TB
    AAPPeers["AAP peers<br/>(other ANTON instances)<br/>P2P + E2E 🟢"]:::proto
    Marketplace["ANTON Marketplace<br/>(.anton bundle exchange) 🟢"]:::proto
    FutureChain["FutureChain<br/>(payment rail) 📋"]:::proto
  end

  %% ── Companion-app clients ────────────────────────────────────────────────
  subgraph Clients["Companion App clients"]
    direction TB
    PWA["PWA<br/>(served from /app/) ✅"]:::actor
    Android["Android<br/>(Capacitor APK / AAB) ✅"]:::actor
    iOS["iOS<br/>(scaffold + templates) 🟢"]:::actor
    Desktop["Desktop browser<br/>Windows / Chromebook ✅"]:::actor
  end

  %% ── Edges from actors ────────────────────────────────────────────────────
  Pro -->|HTTPS · React SPA| ANTON
  Admin -->|Pairing QR · enrollment| ANTON
  Guardian --> ANTON
  Teacher --> ANTON
  Student --> ANTON

  %% ── Edges to LLM providers ───────────────────────────────────────────────
  ANTON -->|"streaming + caching<br/>(claude-client)"| Anthropic
  ANTON -->|adapter| OpenAI
  ANTON -->|adapter + reasoning effort| Azure
  ANTON -->|adapter| Gemini
  ANTON -->|adapter| Mistral
  ANTON -->|adapter (LAN-only)| Ollama

  %% ── Edges to data ───────────────────────────────────────────────────────
  ANTON --> Web
  ANTON --> URLs
  ANTON --> Folders
  ANTON --> EDI
  ANTON --> Roaring
  ANTON --> DowJones

  %% ── Edges to protocols ──────────────────────────────────────────────────
  ANTON <-->|"E2E (Ed25519/X25519/AES-GCM)<br/>+ .anton bundles"| AAPPeers
  ANTON <-->|signed bundle exchange| Marketplace
  ANTON -. payments rail .-> FutureChain

  %% ── Edges to companion clients ──────────────────────────────────────────
  ANTON <-->|"WebSocket / HTTPS<br/>signed-envelope responses"| PWA
  ANTON <-->|app-gateway| Android
  ANTON <-->|app-gateway| iOS
  ANTON <-->|HTTPS| Desktop

  class FutureChain spec
  class iOS,EDI,AAPPeers,Marketplace partial
```

## Legend

- **Solid arrow** — implemented and live in code paths confirmed during the audit.
- **Dashed arrow** — protocol/integration that exists in code but is not fully wired across all surfaces.
- **Dotted arrow** — spec-only future protocol (FutureChain payment rail).
- Status badges in node labels use the four-state convention from `Part D.3` of `ANTON_Architecture_Schematics_Brief.md`.
- Companion-app clients are *separate* from end-user actors because they speak a different transport (WebSocket / signed envelope) than the React SPA.

## Source-of-truth references

- `package.json` — confirms `openexpert@0.7.5`, dependencies on `@anthropic-ai/sdk`, `openai`, `@google/generative-ai`, `@mistralai/mistralai`, etc. — establishes which LLM SDKs are present.
- `server/services/unified-llm-client.ts:480` — `checkProviderHealth(provider: 'anthropic' \| 'openai' \| 'azure_openai' \| 'google' \| 'mistral' \| 'ollama')` — canonical six-provider list.
- `server/services/model-adapter.ts:552–582` — provider-dispatch switch (six cases).
- `server/services/claude-client.ts` — Anthropic streaming + ephemeral prompt-caching block.
- `server/services/adapters/{azureOpenai,gemini,mistral,ollama,openai}Adapter.ts` — non-Anthropic adapters.
- `server/services/knowledge-resolver.ts` — Mode 1 (Claude knowledge + web), Mode 2 (online refs), Mode 3 (local folders), Mode 4 (combined).
- `server/services/url-fetcher.ts` — URL fetch (Mode 2).
- `server/db/schema.sql` — `registered_folders` table for Mode 3.
- `server/services/bing-search.ts` — fallback web search.
- `server/services/roaring-connector.ts`, `dowjones-connector.ts` — partner data integrations.
- `server/services/db-drivers/` (per audit) — External Data Integration adapters (PostgreSQL/MySQL/MSSQL/MongoDB/REST). MCP wiring lives under `server/mcp/`.
- `server/services/community-crypto.ts`, `community-e2e.ts`, `community-signing-service.ts` — crypto primitives backing AAP and signed-envelope responses.
- `server/services/aap-rollout-bridge.ts` — AAP transport bridge.
- `server/services/app-gateway.ts`, `app-enrollment-service.ts`, `app-push-service.ts`, `app-checkpoint-service.ts`, `app-websocket.ts` — Companion App Gateway surface.
- `src/app/` — Companion App frontend (PWA shell wrapped by Capacitor).
- `android/` — Capacitor Android target.
- `ios-templates/` — overlay files for Mac-generated iOS Capacitor project.
- `server/db/migrations-pg/094_app_gateway.sql`, `130_app_companion_security.sql`, `131_app_companion_security_review_fixes.sql` — Companion App pairing tables.
- `server/db/migrations-pg/081_futurechain_foundation.sql`, `082_fc_marketplace_budget.sql`, `087_fc_gateway.sql` — FutureChain stub tables (status: 📋 — payment rail itself is external/future).
- `_audit-notes.md` §6 D9 — Marketplace status reasoning.

## Open questions

- **AAP contact-hash format** — `ANTON-XXXX-XXXX-XXXX-XXXX` referenced in the brief was not directly grep-confirmed in code; the underlying crypto is built. Diagram marks the protocol as 🟢 partial pending verification.
- **MCP-as-server** vs MCP-as-client — both directions are referenced in CLAUDE.md but the audit did not separate them; treated here as a single bidirectional EDI edge.
- **iOS distribution status** — code path is 🟢 (templates + Capacitor scaffold) but no built `.ipa` or App Store presence has been confirmed.

## Related diagrams

- `02-container-diagram` — what's inside the ANTON box.
- `03-pillar-topology` — how the ANTON box is sliced into user-facing pillars.
- `13-multi-llm-routing` (Group 2) — how the LLM-provider edges are decided per request.
- `30-aap-protocol` (Group 4) — detail on the AAP-peers edge.
- `31-companion-app-gateway` (Group 4) — detail on the Companion-client edges.
