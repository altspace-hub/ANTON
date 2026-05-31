# Multi-Provider Parity — Investigation & Improvement Plan (2026-05-31)

> **Goal.** Everywhere ANTON uses Claude (and Claude-specific capabilities), make it *also* work — to
> each provider's best effort — on **Mistral**, **Ollama/Qwen** (local *and* via OpenRouter/Together
> `compat:`), and the generic OpenAI-compatible path. This is the map of where we are + the plan for
> where to improve. Based on an 8-agent deep audit (workflow `w96442zy5`, ~1.08M tokens) reading real
> code with file:line evidence.

## TL;DR

Claude works everywhere. **Mistral** is the strongest stand-in and runs most things (its Magistral
reasoning mapping is genuinely good). **Ollama/Qwen-local** runs *module* generations (degraded — text
only). **`compat:` hosted Qwen (OpenRouter/Together) is largely broken end-to-end** and isn't even
selectable in the UI. The deeper "intelligent" features (IRE, Pathfinder, Markets, beehive, renderers,
missions) are mostly **Claude-locked** — either by direct SDK calls or by handing a *literal* `claude-*`
id to the router, which then short-circuits to Anthropic.

### The systemic root cause

Most non-module code paths choose a provider in one of three ways, and **none reads the user's selected
model**:
1. **Direct Anthropic SDK / `getClient()` / `callSync()`** → hard Claude lock (IRE, Pathfinder search,
   photo-id, market-consul, most of School).
2. **`callChat({ model: 'claude-…' })` with a literal id, no `mapModelToProvider`** → `getProviderFromModelId`
   returns `'anthropic'` and the router short-circuits to Claude (beehive, mission-executor, market
   non-web branch, **all LLM renderers**). *These are the cheap wins — see Tier S.*
3. **`callChat(mapModelToProvider('claude-…'))`** → routes by **env-key priority** (`ANTHROPIC > MISTRAL >
   OPENAI > GOOGLE`), not the session model. With `ANTHROPIC_API_KEY` set (effectively required), these
   *always* pick Claude. `getConfiguredProvider()` can never return `ollama`/`openai_compatible`, and
   `TIER_MAP` has no rows for them.

### ⚠️ #1 dangerous bug — `compat:` silently runs on Claude

Selecting a `compat:<slug>:<model>` model (OpenRouter/Together/Groq/DeepSeek/Qwen) for a **module run**
hits `getModelConfig` (`server/types/modelAdapter.ts`), which has **no `compat:` branch** → returns
`undefined` → `claude.ts:148` sets `provider = modelConfig?.provider || 'anthropic'` → the request runs
on **Claude**, billing Anthropic and ignoring the selection entirely. The only stack that handles
`compat:` correctly (`unified-llm-client.streamToResponse`) is **bypassed** by the actual `/api/claude`
module route. This is the highest-priority fix (Tier M1).

---

## Capability × provider matrix

Legend: ✅ full · 🟡 degraded (runs, loses the Claude-specific behavior) · ❌ broken (errors or silently
mis-routes to Claude) · — n/a (provider genuinely can't).

### Capabilities

| Capability | Mistral | Ollama/Qwen (local) | compat: (OpenRouter/Together) |
|---|:--:|:--:|:--:|
| Streaming text (module path) | ✅ | ✅ | ❌ (silent Claude misroute) |
| Adaptive thinking / reasoning | ✅ (Magistral; SDK-path 🟡) | 🟡 (no `think` param) | 🟡 |
| Web search (Claude tool → Bing) | 🟡 (stripped, no Bing) | 🟡 | 🟡 (Bing is Azure-only) |
| Prompt caching / context compaction | — (graceful) | — | — |
| Tool / function calling | 🟡 (router inline only) | ❌ (no tools field) | ❌ |
| Vision / PDF image input | ❌ (content stringified) | ❌ | ❌ (photo-id is Claude-locked) |
| JSON / structured-output mode | ❌ (flag true, never wired) | 🟡 | 🟡 |
| Haiku structured-extractor (post-hoc) | ❌ (hardcoded Haiku→Claude) | ❌ | ❌ |
| Embeddings (atoms/inst. memory) | — | ✅ (nomic-embed) | 🟡 (no embed method) |

### Dispatch & selection surface

| Path | Mistral | Ollama/Qwen | compat: |
|---|:--:|:--:|:--:|
| Module `/api/claude/message` (stream) | 🟡 | 🟡 | ❌ |
| Module `/message-sync` (MCP) | ❌ (Claude allowlist) | ❌ | ❌ |
| `provider-router` specialty routes (×42) | 🟡 (env-priority) | ❌ (`callChat` no branch) | ❌ |
| `unified-llm-client.streamToResponse` | ✅ | ✅ | ✅ (but 1 importer) |
| Model picker (ModelSelector) | ✅ | ✅ | ❌ (not surfaced) |
| Agent runtime (`callChat`) | ✅ | ❌ | ❌ |
| Agent model-selection UI | ❌ (no picker) | ❌ | ❌ |
| Model recommender badge | ❌ (Claude-only stub) | ❌ | ❌ |

### Intelligent / automation features

| Feature | Mistral | Ollama/Qwen | compat: | Note |
|---|:--:|:--:|:--:|---|
| Orchestrator engine | ✅ (env) | ❌ | ❌ | env-priority |
| Multi-agent orchestrator | ✅ (env) | ❌ | ❌ | literal agent ids |
| Deliberation engine | 🟡 | ❌ | ❌ | maps 3 Claude tiers→1 provider |
| Pathfinder (search step) | ❌ | ❌ | ❌ | Claude `web_search` SDK, throws for others |
| Pathfinder (synthesis) | 🟡 | ❌ | ❌ | confidence tool = direct Anthropic |
| IRE (iterative-reasoning) | ❌ | ❌ | ❌ | hardcoded Opus + cache + THINK_TOOL |
| Beehive (synthesis + deliberation) | ❌→**S** | ❌ | ❌ | literal id; **fixable to Mistral (Tier S)** |
| LLM renderers (board-deck, devil's-advocate, regulator's-eye, plain-language, exec-one-pager) | ❌→**S** | ❌ | ❌ | literal id; **fixable to Mistral (Tier S)** |
| Mission executor | ❌→**S** | ❌ | ❌ | `model_strategy` unused; partial Tier S |
| Market workflow / consul | ❌ | ❌ | ❌ | Claude-pinned + `web_search`; the "showcase" is 100% Claude |
| Command parser | ✅ | ❌ | ❌ | already `mapModelToProvider` |
| Discovery engine | 🟡 | ❌ | ❌ | hard-throws without an Anthropic client |
| Specialized-agent tool routing | ✅ | ✅ | ✅ | text `tool_call` protocol, provider-agnostic |
| Mission action executors (http/sql/browser) | — | — | — | non-LLM |

---

## Improvement plan (prioritized)

### Tier S — easy, low-risk, high-value

- **S1. ✅ DONE — Wrap literal `claude-*` ids in `mapModelToProvider()`** at the literal-id-short-circuit
  sites: beehive-synthesis, beehive-deliberation, the 5 LLM renderers (board-deck, devil's-advocate,
  regulator's-eye, plain-language, exec-one-pager), market-workflow non-web branch, mission-executor
  `resolveModel`. (multi-agent was already mapped.) **Zero behavior change for Claude installs** (returns
  the same id when Anthropic is configured); immediately unlocks **Mistral** for ~10 features.
- **S2. ✅ DONE — Add `GET /api/ollama/status`** (health + installed-model count, probes `/api/tags`
  directly so "down" ≠ "0 models") — the Settings "Local Models" panel called it and 404'd, so the Ollama
  status card always showed "not detected" even when up.
- **S3. (pending) Pass `compatConfig` in `unified-llm-client.sendRequest` + `streamToHandler`** (replicate
  the `resolveCustomEndpoint` block from `streamToResponse`) so the Review Engine / WebSocket delivery
  don't throw on `compat:` models.
- **S4. (pending) Clamp the SDK `MistralAdapter` temperature ceiling** to ≤1.0 (currently maps creative→1.8,
  risking 422s) and default `maxTokens` from `model-capabilities.ts` instead of a flat 8192.

### Tier M — moderate (the real parity unlocks)

- **M1. `compat:` end-to-end (fixes the #1 silent-Claude bug).** Add a `compat:` branch to `getModelConfig`
  (provider `openai_compatible`) + a dispatch branch in `claude.ts` (or route the module path through
  `unified-llm-client`). Also fix the type-rot: `server/types/modelAdapter.ts` `ModelProvider` union is
  missing `ollama`/`openai_compatible`.
- **M2. Surface `compat:` endpoints in `ModelSelector`** — fetch `/api/settings/model-endpoints` and render
  `compat:<slug>:<model>` (Settings already promises this; the picker never reads it).
- **M3. `provider-router.callChat`: add `ollama` + `openai_compatible` non-streaming branches** (+ thread
  `db`). Today every specialty route + agent on local-Qwen/compat throws "Non-streaming not implemented".
- **M4. Extend `getConfiguredProvider` priority + `TIER_MAP`** with `ollama`/`openai_compatible` rows, and
  let tier resolution read a configured default model. Unlocks Qwen everywhere `mapModelToProvider` is used.
- **M5. Honor the session-selected model** (not env-priority) across the ~42 `provider-router` specialty
  routes — most hardcode `mapModelToProvider('claude-…')`.
- **M6. Bing pre-search for all non-Anthropic providers** (currently Azure-only); decouple the Bing key from
  `azure_openai_config` (store in `app_settings`). Gives Mistral/Ollama/compat real web grounding.
- **M7. JSON/structured-output + tools wiring** in the Mistral/Ollama/compat adapters (the capability flags
  already claim support; the bodies never send `response_format`/`format`/`tools`).
- **M8. Mission executor: honor `model_strategy`/`provider_preference`** (currently the param is `_strategy`).
- **M9. Add a `ModelSelector` to the Agent Hub create/edit form** (binds `default_model`).
- **M10. Consolidate the 3 Mistral impls** into one enriched `streamMistral` (tools + json + vision) that the
  other stacks delegate to, ending the drift.

### Tier L — large (deep features / multimodal)

- **L1. Multi-provider vision/PDF** — stop `JSON.stringify`-ing message content; per-provider image-part
  mapping (OpenAI `image_url`, Anthropic block, Ollama `images:[]`); route `photo-id-service` through an adapter.
- **L2. Port IRE off the hardcoded Opus Anthropic SDK** to a provider-aware path (non-Claude loses
  caching/THINK_TOOL but gains reasoning via Magistral etc.).
- **L3. Pathfinder search step** — route through `bing-search` + the selected provider instead of the
  Claude-only `web_search_20250305` tool.
- **L4. Provider-aware model recommender** (or hide the badge when no Anthropic key) — it's a hardcoded
  3-Claude-tier stub today.
- **L5. Markets workflow/consul provider abstraction** — the learning showcase is 100% Claude-bound.
- **L6. Codestral FIM endpoint + Devstral as the Mistral coding default** (selectable today but run as plain chat).

---

## How to read this

- **Claude is unaffected by every fix above** — the Tier-S wraps are no-ops when Anthropic is configured.
- The biggest single unlock is **M1 + M3** (compat: + `callChat` local branches): together they make
  Qwen-via-OpenRouter and local-Qwen actually usable across modules *and* agents.
- "Best effort" means: where a provider can't do a Claude-native thing (prompt caching, `web_search` tool),
  we degrade gracefully (no error) and substitute where possible (Bing for web, Magistral for thinking).
