# Mistral Integration Investigation — ANTON v0.7.0

**Date:** 2026-03-15
**Scope:** Can ANTON run with Mistral as the sole AI provider?
**Model mapping:** Mistral Large = Opus | Mistral Medium = Sonnet | Mistral Small = Haiku

---

## Executive Summary

ANTON has a sophisticated multi-LLM architecture, but **Claude is deeply embedded as the primary AI**. While the main chat endpoint (`/api/claude/message`) properly routes to Mistral via adapters, **20+ specialty routes bypass the adapter and call the Anthropic SDK directly**. Multiple services hardcode Claude model IDs (`claude-opus-4-6`, `claude-sonnet-4-6`, `claude-haiku-4-5-20251001`). Additionally, Claude-only features like extended thinking, prompt caching, context compaction, and web search have no Mistral equivalents in the codebase.

**Verdict:** If you switched to Mistral-only today, **basic chat works** but **Pathfinder, Deliberation, Gap Assessment, Iterative Reasoning, Orchestrator, Task Agent, and 15+ other specialty features would crash with errors.**

---

## 1. Mistral Model Lineup vs Claude

### Current Models (Verified from docs.mistral.ai, March 2026)

#### Generalist Models (Chat + Tools + Vision)

| Mistral Model | API Model ID | Alias | Context | Input $/1M | Output $/1M | Category | ANTON Mapping |
|---|---|---|---|---|---|---|---|
| **Mistral Large 3** (Dec 2025) | `mistral-large-2512` | `mistral-large-latest` | **256K** | **$0.50** | **$1.50** | Open | -> Opus 4.6 |
| **Mistral Medium 3.1** (Aug 2025) | `mistral-medium-2508` | `mistral-medium-latest` | 128K | $0.40 | $2.00 | Premier | -> Sonnet 4.6 |
| **Mistral Small 3.2** (Jun 2025) | `mistral-small-2506` | `mistral-small-latest` | 128K | $0.10 | $0.30 | Open | -> Haiku 4.5 |

All three support: Chat completions, **Function calling**, Agents, **Structured outputs**, Predicted outputs, OCR, Document Q&A, FIM, Embeddings, Moderation, Audio transcription, Batch inference.

Mistral Large 3: 675B total / 41B active (MoE architecture). All three are **multimodal** (vision).

#### Reasoning Models (Magistral)

| Magistral Model | API Model ID | Alias | Context | Input $/1M | Output $/1M | Category |
|---|---|---|---|---|---|---|
| **Magistral Medium 1.2** (Sep 2025) | `magistral-medium-2509` | `magistral-medium-latest` | **128K** | **$2.00** | **$5.00** | Premier |
| **Magistral Small 1.2** (Sep 2025) | `magistral-small-2509` | `magistral-small-latest` | **128K** | $0.50 | $1.50 | Open |

Magistral models: Same capabilities as generalist + structured thinking output. Use `prompt_mode: "reasoning"` parameter. Response contains `{ type: "thinking" }` + `{ type: "text" }` content blocks (tokenized control tokens, not `<think>` tags).

**Key corrections from initial investigation:**
- Mistral Medium is **3.1** (not 3), API ID is `mistral-medium-2508` (not `2503`)
- Magistral Medium context is **128K** (not 40K as previously reported)
- Magistral Small context is **128K** (not 40K)
- Magistral Medium pricing is **$2/$5** (not ~$0.40/~$2.00)
- Magistral Small pricing is **$0.50/$1.50** (not ~$0.10/~$0.30)

#### Other Notable Models (Not for primary mapping)

| Model | API ID | Purpose | Input $/1M | Output $/1M |
|---|---|---|---|---|
| Devstral 2 | `devstral-2-25-12` | Code agents | $0.40 | $2.00 |
| Codestral | `codestral-2508` | Code completion | Premier pricing |
| Ministral 3 14B/8B/3B | `ministral-3-*` | Edge/embedded | Very cheap |
| OCR 3 | `mistral-ocr-2512` | Document OCR | Premier |
| Mistral Small Creative | `mistral-small-creative-25-12` | Creative writing | Labs |

### Claude Models (for comparison)

| Claude Model | Context Window | Max Output | Input $/1M | Output $/1M |
|---|---|---|---|---|
| Opus 4.6 | 1,000,000 | 128,000 | $5.00 | $25.00 |
| Sonnet 4.6 | 1,000,000 | 64,000 | $3.00 | $15.00 |
| Haiku 4.5 | 200,000 | 8,192 | $0.80 | $4.00 |

### Revised Model Mapping for ANTON

| ANTON Role | Claude Today | Mistral Equivalent | Reasoning Variant |
|---|---|---|---|
| **Primary / Deep** | Opus 4.6 ($5/$25) | Mistral Large 3 ($0.50/$1.50) | Magistral Medium ($2/$5) |
| **Secondary / Balanced** | Sonnet 4.6 ($3/$15) | Mistral Medium 3.1 ($0.40/$2) | Magistral Small ($0.50/$1.50) |
| **Fast / Cheap** | Haiku 4.5 ($0.80/$4) | Mistral Small 3.2 ($0.10/$0.30) | -- (use Small directly) |

### Verdict: Model Capabilities

| Dimension | Claude Advantage | Mistral Advantage |
|---|---|---|
| **Context window** | 1M vs 256K (4x larger) | -- |
| **Max output** | 128K vs not documented (~16K default) | -- |
| **Pricing (generalist)** | -- | **10x cheaper** (Large $0.50 vs Opus $5.00 input) |
| **Pricing (reasoning)** | -- | **2.5x cheaper** (Magistral Med $2 vs Opus $5 input) |
| **Reasoning** | Integrated adaptive thinking (1 model, 5 effort levels) | Separate Magistral models with `prompt_mode: "reasoning"` |
| **Function calling** | `input_schema` format | OpenAI-compatible `parameters` format — **both work** |
| **Structured output** | Supported | Supported |
| **Vision/multimodal** | All models | All generalist models |
| **Web search** | Built-in `web_search` tool | Available via Agents API (different surface) |
| **Prompt caching** | Ephemeral cache (90% cost reduction) | Not supported |
| **Context compaction** | Automatic compaction beta | Not supported |
| **Thinking output format** | `thinking` content blocks with signatures | `thinking` content blocks (tokenized, v2509+) |

**Cost takeaway:** A Mistral-only deployment would be **dramatically cheaper** (10x on generalist input, 13x on output) but with significantly smaller context windows. Reasoning via Magistral is still cheaper than Claude but the gap narrows (2.5x vs 10x).

**Reasoning takeaway:** Mistral reasoning (Magistral) uses **separate model IDs** and a `prompt_mode: "reasoning"` parameter. The response format is structurally similar to Claude's thinking blocks (`{ type: "thinking" }` + `{ type: "text" }`), which is good news for ANTON's UI — the same thinking display can work. However, there is **no effort/budget control** — the model decides how much to think.

---

## 2. What Works Today

### Frontend Layer — READY

| Component | Status | Notes |
|---|---|---|
| Settings page model picker | WORKS | Mistral Large/Medium/Small in dropdown |
| `useSettingsStore` model selection | WORKS | Stores any `ModelId` |
| `useClaude` hook | WORKS | Model-agnostic, passes model to backend |
| `useStreamStore` streaming | WORKS | Handles `text_delta`, `thinking_delta` generically |
| `ConversationThread` rendering | WORKS | No model-specific rendering |
| `types.ts` ModelId union | WORKS | Includes `mistral-large-latest`, `mistral-medium-latest`, `mistral-small-latest` |
| API key configuration | WORKS | `MISTRAL_API_KEY` field in Settings |

### Main Chat Route — WORKS

`POST /api/claude/message` (the primary endpoint) supports Mistral:

```
Request with model: "mistral-large-latest"
  -> getProviderFromModelId() returns "mistral"
  -> routes to streamMistral() from mistralAdapter.ts
  -> streams SSE events back to frontend
```

This means: **PromptPage, ModulePage (basic chat), and any page that uses `useClaude` hook can work with Mistral today.**

### Token Estimation — EASILY ADAPTABLE

`token-estimator.ts` uses `tiktoken` (GPT tokenizer) which approximates Mistral tokens. Cost table needs updating.

---

## 3. What Breaks — Hardcoded Anthropic Routes

These 20 routes receive an `anthropic: Anthropic` client and call `anthropic.messages.create()` / `.stream()` directly. They will **throw errors** with Mistral:

| Route File | Feature | Anthropic Calls | Impact |
|---|---|---|---|
| `pathfinder.ts` | Pathfinder search (all depths) | `anthropic.messages.stream()` | **HIGH** — Core v0.7 feature |
| `gap-assessments.ts` | Compliance gap scoring + synthesis | `anthropic.messages.stream()` | **HIGH** — Core FCP feature |
| `legal-research.ts` | Counsel's Desk sessions | `anthropic.messages.stream()` | **HIGH** — Core legal feature |
| `task-agent.ts` | ANTON Task Agent | `anthropic.messages.create()` | **HIGH** — Intelligence feature |
| `orchestrator.ts` | ANTON Orchestrator | `anthropic.messages.create()` | **HIGH** — Intelligence feature |
| `regulatory-feed.ts` | Regulatory digest AI | `anthropic.messages.stream()` | MEDIUM |
| `lore-ledger.ts` | Consistency checker | `anthropic.messages.stream()` | MEDIUM |
| `news.ts` | News analysis | `anthropic.messages.stream()` | MEDIUM |
| `finance.ts` | Financial analysis | `anthropic.messages.stream()` | MEDIUM |
| `travel.ts` | Travel recommendations | `anthropic.messages.stream()` | MEDIUM |
| `school.ts` | School expert panels | `anthropic.messages.create()` | MEDIUM |
| `eurlex.ts` | EU legal research | `anthropic.messages.stream()` | MEDIUM |
| `custom-modules.ts` | Custom module execution | `anthropic.messages.create()` | MEDIUM |
| `bridges.ts` | Channel bridge forwarding | `anthropic.messages.stream()` | LOW |
| `discovery.ts` | Information discovery | `anthropic.messages.create()` | LOW |
| `batch.ts` | Batch API processing | `anthropic.messages.batch.create()` | LOW |
| `commands.ts` | Command execution | `anthropic.messages.create()` | LOW |
| `reviews.ts` | Review moderation | `anthropic.messages.create()` | LOW |
| `workflows.ts` | Workflow step execution | `anthropic.messages.create()` | LOW |
| `quality.ts` | Quality scoring | `anthropic.messages.create()` | LOW |

**Also broken:** `POST /api/claude/message-sync` hardcodes `validModels` to only Claude models.

---

## 4. What Breaks — Hardcoded Services

### 4.1 Deliberation Engine (`deliberation-engine.ts`)

**Status: WILL CRASH**

- Imports `callSync` from `claude-client.ts` (Anthropic SDK only)
- Hardcodes three-tier hierarchy:
  - Opus 4.6 with `think_hard` -> synthesis role
  - Sonnet 4.6 with `think` -> analysis role
  - Haiku 4.5 with `quick` -> fast scan role
- Synthesis always uses Opus with `thinking: { type: 'adaptive' }`
- **Mistral fix needed:** Replace `callSync()` with unified adapter, map to Mistral Large/Medium/Small

### 4.2 Iterative Reasoning Engine (`iterative-reasoning.ts`)

**Status: WILL CRASH**

- Imports `Anthropic` SDK directly
- All phases hardcoded to `'claude-opus-4-6'`
- Uses adaptive thinking with effort levels (`high`, `max`) per phase
- Uses prompt caching (`cache_control: { type: 'ephemeral' }`)
- Uses custom `THINK_TOOL` (tool_use) for reflection
- Streaming expects Claude event types (`thinking_delta`, `input_json_delta`)
- **This is the hardest service to port** — deeply coupled to Claude's thinking architecture

### 4.3 Gap Assessment Engine (`gap-assessment-engine.ts`)

**Status: WILL CRASH**

- Imports `Anthropic` SDK directly
- Hardcoded model selection (Opus/Sonnet) with adaptive thinking
- `anthropic.messages.create({ stream: true })` calls
- Streaming collector expects Anthropic `AsyncIterable` event structure
- JSON repair logic tuned to Claude's output formatting

### 4.4 Multi-Agent Orchestrator (`multi-agent-orchestrator.ts`)

**Status: WILL CRASH**

- 9 parallel agents all hardcoded to `'claude-haiku-4-5-20251001'`
- Synthesis hardcoded to `'claude-opus-4-6'`
- Adaptive thinking with `output_config: { effort: 'medium' }` for agents
- `is46Model` capability detection hardcoded to Opus/Sonnet 4.6

### 4.5 Orchestrator Engine (`orchestrator-engine.ts`)

**Status: WILL CRASH**

- Heartbeat model: `'claude-haiku-4-5-20251001'`
- Briefing model: `'claude-opus-4-6'`
- 10+ additional hardcoded model references
- Adaptive thinking for briefing synthesis and plan generation

### 4.6 Pathfinder Engine (`pathfinder-engine.ts`)

**Status: WILL CRASH**

- Search model: `'claude-haiku-4-5-20251001'`
- Analysis/synthesis model: `'claude-sonnet-4-6'`
- Council-of-models architecture assumes Claude hierarchy
- Uses `budget_tokens` and adaptive thinking
- Deep mode depends on Iterative Reasoning Engine (Opus-only)
- Confidence gating relies on tool_use reflection

### 4.7 Compaction Manager (`compaction-manager.ts`)

**Status: NOT APPLICABLE**

- Checks `MODEL_CAPABILITIES[modelId].supportsCompaction` — false for all Mistral models
- `context_management` parameter is Claude-only
- Mistral would silently skip compaction (no crash, but no benefit)

### 4.8 Knowledge Resolver (`knowledge-resolver.ts`)

**Status: PARTIALLY WORKS**

- Model-agnostic for semantic/local search
- Web search tool injection (`web_search_20250305`) is Claude-only — would need Mistral's web search equivalent
- **Works if web search is disabled**

---

## 5. Claude-Only Features With No Mistral Equivalent

| Feature | Claude Implementation | Mistral Equivalent | Gap |
|---|---|---|---|
| **Adaptive thinking** | `thinking: { type: 'adaptive' }` + `output_config: { effort }` | None (use Magistral model instead) | **MAJOR** — Requires model-switching instead of parameter |
| **Budget tokens** | `thinking: { type: 'enabled', budget_tokens: N }` | None | **MAJOR** — No thinking budget control |
| **Prompt caching** | `cache_control: { type: 'ephemeral' }` on system blocks | Not supported | **MODERATE** — Higher costs without caching |
| **Context compaction** | `compact-2026-01-12` beta, `context_management` param | Not supported | **MODERATE** — Must manage context manually |
| **1M context** | 1,000,000 token context window | 256,000 max (Large 3) | **MODERATE** — 4x smaller, affects knowledge layers |
| **128K output** | Opus generates up to 128K tokens | ~16K max | **MAJOR** — Long documents truncated |
| **Built-in web search** | `web_search_20250305` tool in messages API | Agents API only (`client.beta.agents`) | **MODERATE** — Different API surface |
| **Thinking blocks in stream** | `thinking` content blocks with signatures | Magistral has `"type": "thinking"` deltas | **MODERATE** — Different format |
| **Content block replay** | `rawContentBlocks` with thinking signatures for continuation | Not applicable | **MINOR** |
| **Cache read/creation tokens** | `cache_creation_input_tokens`, `cache_read_input_tokens` | Not supported | **MINOR** — Affects cost tracking |
| **Stop reason: compaction** | `stop_reason='compaction'` signals context was compacted | Not supported | **MINOR** |

---

## 6. Registry Inconsistencies (Existing Bugs)

Two competing model registries exist with **conflicting data**:

| Property | `model-capabilities.ts` | `types/modelAdapter.ts` | Verified Truth (docs.mistral.ai) |
|---|---|---|---|
| Mistral Large model ID | `mistral-large-latest` | `mistral-large-latest` | `mistral-large-2512` / `mistral-large-latest` |
| Mistral Large context | 128,000 | 131,072 | **256,000** (Large 3, Dec 2025) |
| Mistral Large max output | 4,096 | 16,384 | **Use 128,000** (match Opus tier — API accepts user-set `maxTokens`) |
| Mistral Large pricing (in) | $4.00 | $2.00 | **$0.50** |
| Mistral Large pricing (out) | $12.00 | $6.00 | **$1.50** |
| Mistral Medium model ID | NOT REGISTERED | `mistral-medium-latest` | `mistral-medium-2508` / `mistral-medium-latest` |
| Mistral Medium context | -- | 131,072 | **128,000** |
| Mistral Medium pricing | -- | $0.40/$2.00 | **$0.40/$2.00** (correct!) |
| Mistral Small model ID | NOT REGISTERED | `mistral-small-latest` | `mistral-small-2506` / `mistral-small-latest` |
| Mistral Small context | -- | 131,072 | **128,000** |
| Mistral Small pricing | -- | $0.10/$0.30 | **$0.10/$0.30** (correct!) |
| Magistral Medium | NOT REGISTERED | NOT REGISTERED | `magistral-medium-2509` — **$2.00/$5.00**, 128K context |
| Magistral Small | NOT REGISTERED | NOT REGISTERED | `magistral-small-2509` — **$0.50/$1.50**, 128K context |

**Verdict:** Both registries are stale. `model-capabilities.ts` only has 1 Mistral model (should be 5 including Magistral). Pricing for Large is from the old Mistral Large 2 era (8x too expensive). Medium/Small pricing in `types/modelAdapter.ts` is actually correct but not in `model-capabilities.ts`.

Additionally, `getProviderFromModelId()` only matches `mistral-` prefix — **Magistral models (`magistral-*`) would throw an error**.

---

## 7. Mistral API Differences

### Streaming Format

Mistral uses OpenAI-compatible SSE:
```
data: {"choices":[{"delta":{"content":"Hello"}}]}
data: [DONE]
```

Claude uses its own format:
```
event: content_block_delta
data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello"}}
event: message_stop
```

**Current adapter handles this correctly** — `mistralAdapter.ts` and `model-adapter.ts` both translate Mistral events to ANTON's internal format.

### Tool Format

| | Claude | Mistral |
|---|---|---|
| Tool definition | `{ name, description, input_schema }` | `{ type: "function", function: { name, description, parameters } }` |
| Tool result role | `role: "user"` with `tool_result` block | `role: "tool"` message |
| Tool choice | `tool_choice: { type: 'auto' }` | `tool_choice: "auto"` |

**Neither adapter implements tool format conversion.**

### Reasoning Models

Claude: Same model, adjust parameters (`effort: 'low'` to `'max'`)
Mistral: Switch to different model family (`mistral-large-latest` -> `magistral-medium-latest`)

**This is a fundamental architectural difference.** ANTON's thinking level system (`quick/think/think_hard/investigate/plan_first`) assumes parameter-based control. Mistral requires model-switching.

---

## 8. What Would a Mistral-Only ANTON Look Like?

### Tier Mapping (Verified)

| ANTON Role | Claude Today | Mistral Equivalent | Notes |
|---|---|---|---|
| **Primary model** | Opus 4.6 ($5/$25) | Mistral Large 3 ($0.50/$1.50) | 256K context (vs 1M), 10x cheaper |
| **Secondary model** | Sonnet 4.6 ($3/$15) | Mistral Medium 3.1 ($0.40/$2) | 128K context, 7.5x cheaper |
| **Fast/cheap model** | Haiku 4.5 ($0.80/$4) | Mistral Small 3.2 ($0.10/$0.30) | 128K context, 8x cheaper |
| **Deep reasoning** | Opus with `effort: 'max'` | Magistral Medium ($2/$5) | 128K context, separate model, `prompt_mode: "reasoning"` |
| **Cheap reasoning** | Sonnet with `budget_tokens` | Magistral Small ($0.50/$1.50) | 128K context, separate model |

### Features That Would Work

1. Basic chat via PromptPage / ModulePage (already works)
2. All 150+ module prompts (model-agnostic)
3. All export formats (model-agnostic)
4. Knowledge Source System (local/combined modes)
5. All UI components (model-agnostic)
6. Cost tracking (after registry update)
7. Streaming responses (adapter handles translation)

### Features That Would NOT Work Without Changes

1. **Pathfinder** — Hardcoded Haiku/Sonnet/Opus pipeline
2. **Deliberation** — Hardcoded three-model council
3. **Gap Assessment** — Direct Anthropic SDK calls
4. **Iterative Reasoning** — Opus-only with adaptive thinking
5. **Orchestrator** — Hardcoded heartbeat/briefing models
6. **Multi-Agent** — Hardcoded 9x Haiku + 1x Opus
7. **Task Agent** — Direct Anthropic SDK calls
8. **Web search** — Claude-only tool (Mistral has different API)
9. **Prompt caching** — Not supported by Mistral
10. **Context compaction** — Not supported by Mistral
11. **Extended thinking** — Would need Magistral model switching
12. **Sync endpoint** — Hardcoded to Claude model IDs
13. **15+ specialty routes** — All direct Anthropic calls

### Features That Would Degrade

1. **Knowledge layers** — 256K context (vs 1M) means smaller knowledge budgets
2. **Long document generation** — ~16K max output (vs 128K) means chunking needed
3. **JSON structured output** — Mistral's JSON adherence is less reliable
4. **Thinking transparency** — No thinking blocks to show users
5. **Cost estimates** — Registry data is stale

---

## 9. Remediation Plan

### Phase 1: Fix Registries (Effort: Small)

1. Update `model-capabilities.ts` with all 5 Mistral/Magistral models and correct pricing
2. Update `types/modelAdapter.ts` to match
3. Add `magistral-` prefix to `getProviderFromModelId()`
4. Update `token-estimator.ts` cost table

### Phase 2: Create Unified AI Client (Effort: Large)

Replace direct `anthropic.messages.create()` calls across 20+ routes with a unified client that routes based on the user's selected model:

```typescript
// Before (Claude-only):
const stream = anthropic.messages.stream({ model: 'claude-opus-4-6', ... });

// After (provider-agnostic):
const stream = unifiedClient.stream({ model: userSelectedModel, ... });
```

This is the **biggest refactor** — every route that receives `anthropic: Anthropic` needs to instead receive a provider-agnostic client.

### Phase 3: Thinking Level Abstraction (Effort: Medium)

Create a provider-aware thinking mapper:

```typescript
// Claude: same model, different effort
{ model: 'claude-opus-4-6', thinking: { type: 'adaptive' }, output_config: { effort: 'max' } }

// Mistral: switch model entirely
{ model: 'magistral-medium-latest', temperature: 0.7, max_tokens: 40960 }
```

Map ANTON thinking levels:
| Level | Claude | Mistral |
|---|---|---|
| `quick` | Same model, `effort: 'low'` | `mistral-small-latest` (no thinking) |
| `think` | Same model, `effort: 'medium'` | Same model (no thinking) |
| `think_hard` | Same model, `effort: 'high'` | `magistral-small-latest` + `prompt_mode: "reasoning"` ($0.50/$1.50) |
| `investigate` | Same model, `effort: 'max'` | `magistral-medium-latest` + `prompt_mode: "reasoning"` ($2/$5) |
| `plan_first` | Same model, `effort: 'max'` | `magistral-medium-latest` + `prompt_mode: "reasoning"` ($2/$5) |

Note: Magistral models have **128K context** (same as Medium/Small), so no context window penalty for reasoning mode. The response contains structured `{ type: "thinking" }` blocks that ANTON's thinking UI can render.

### Phase 4: Multi-Model Pipelines (Effort: Large)

Refactor services that hardcode Claude model hierarchies:

| Service | Current | Mistral Equivalent |
|---|---|---|
| **Deliberation** | Opus + Sonnet + Haiku | Large + Medium + Small |
| **Multi-Agent** | 9x Haiku + 1x Opus synthesis | 9x Small + 1x Large |
| **Pathfinder** | Haiku search -> Sonnet analysis -> Opus synthesis | Small search -> Medium analysis -> Large synthesis |
| **Orchestrator** | Haiku heartbeat + Opus briefing | Small heartbeat + Large briefing |
| **IRE** | Opus all phases | Large + Magistral Medium for deep phases |

### Phase 5: Feature Parity (Effort: Medium-Large)

1. **Web search:** Implement Mistral Agents API for web search, or use function-call pattern
2. **Tool format:** Add Claude-to-Mistral tool format converter (input_schema -> parameters)
3. **Thinking blocks:** Parse Magistral `"type": "thinking"` chunks into ANTON's thinking UI
4. **Context budgets:** Reduce knowledge layer budgets for Mistral's smaller context windows
5. **Output chunking:** For long outputs, implement multi-call chunking for Mistral's ~16K limit

### Phase 6: Graceful Degradation (Effort: Small)

For features that cannot work with Mistral:
1. **Prompt caching:** Skip silently (higher cost, no errors)
2. **Context compaction:** Skip silently (must manage context manually)
3. **1M context:** Reduce MAX_CONTEXT_TOKENS dynamically based on model capabilities
4. **128K output:** Show warning in UI when output format expects long content

---

## 10. Priority Recommendations

### Must-Do (for honest "multi-LLM support" claim)

1. **Fix model registries** — Correct pricing, add missing models, add Magistral prefix detection
2. **Audit and fix `/api/claude/message-sync`** — Add adapter routing like the streaming endpoint
3. **Add provider-aware error messages** — Instead of crashing, show "This feature requires Claude" for unsupported routes

### Should-Do (for Mistral as a viable alternative)

4. **Refactor top-6 specialty routes** through unified adapter (pathfinder, gap-assessments, legal-research, task-agent, orchestrator, deliberation)
5. **Implement thinking level abstraction** for Magistral model switching
6. **Add Mistral web search** via Agents API or function calling

### Nice-to-Have (for Mistral parity)

7. Refactor remaining 14 specialty routes
8. Implement output chunking for long documents
9. Add Mistral tool format conversion
10. Dynamic context budget scaling based on model capabilities

---

## 11. Cost Impact Analysis

Switching from Claude to Mistral would yield massive cost savings:

| Scenario | Claude Cost | Mistral Cost | Savings |
|---|---|---|---|
| **Single module run** (10K in, 2K out) | $0.10 | **$0.008** | 92% |
| **Pathfinder deep search** (3 models, ~50K total) | $0.85 | **$0.07** | 92% |
| **Deliberation** (3 models + synthesis) | $1.50 | **$0.12** | 92% |
| **Gap Assessment** (8 articles, batch) | $2.00 | **$0.16** | 92% |
| **Monthly heavy user** (estimated) | ~$150 | **~$12** | 92% |

**Caveat:** No prompt caching means Mistral costs don't benefit from the 90% cache discount that Claude gets on repeated system prompts. For modules with large system prompts called repeatedly, the gap narrows.

---

## Appendix A: Files Requiring Changes

### Critical Path (Phase 2 refactor)

| File | Lines | Change Needed |
|---|---|---|
| `server/services/claude-client.ts` | 500+ | Add provider-agnostic interface or keep as Claude-only |
| `server/services/deliberation-engine.ts` | 250+ | Replace `callSync` with unified client, parameterize models |
| `server/services/gap-assessment-engine.ts` | 450+ | Replace `Anthropic` SDK, parameterize models |
| `server/services/iterative-reasoning.ts` | 560+ | Replace `Anthropic` SDK, abstract thinking, parameterize models |
| `server/services/multi-agent-orchestrator.ts` | 400+ | Replace hardcoded model IDs with config |
| `server/services/orchestrator-engine.ts` | 1100+ | Replace hardcoded model IDs, abstract thinking |
| `server/services/pathfinder-engine.ts` | 1100+ | Replace hardcoded pipeline models |
| `server/routes/pathfinder.ts` | 300+ | Route through unified client instead of `anthropic` |
| `server/routes/gap-assessments.ts` | 500+ | Route through unified client |
| `server/routes/legal-research.ts` | 300+ | Route through unified client |
| `server/routes/task-agent.ts` | 500+ | Route through unified client |
| 16 additional route files | varies | Route through unified client |

### Quick Fixes (Phase 1)

| File | Change |
|---|---|
| `server/config/model-capabilities.ts` | Add 4 models, fix pricing |
| `server/types/modelAdapter.ts` | Sync with model-capabilities |
| `server/services/model-adapter.ts` | Add `magistral-` provider detection |
| `server/services/token-estimator.ts` | Update cost table |

---

## Appendix B: Mistral API Quick Reference (Verified from docs.mistral.ai)

```typescript
// SDK: @mistralai/mistralai
import { Mistral } from '@mistralai/mistralai';

const client = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });

// ── Chat completion ──
const response = await client.chat.complete({
  model: 'mistral-large-latest',
  messages: [
    { role: 'system', content: 'You are helpful.' },
    { role: 'user', content: 'Hello' },
  ],
  maxTokens: 8192,
  temperature: 0.7,
  randomSeed: 42,           // NOT 'seed'
});

// ── Streaming ──
const stream = await client.chat.stream({
  model: 'mistral-large-latest',
  messages: [...],
});

for await (const chunk of stream) {
  const delta = chunk.data.choices?.[0]?.delta?.content;
  if (delta) process.stdout.write(delta);
}

// ── Function calling (tools) ──
// NOTE: Format is OpenAI-compatible, NOT Claude format
const response = await client.chat.complete({
  model: 'mistral-large-latest',
  messages: [...],
  tools: [{
    type: 'function',
    function: {
      name: 'get_weather',
      description: 'Get current weather',
      parameters: {                    // NOT 'input_schema' (Claude format)
        type: 'object',
        properties: {
          location: { type: 'string' }
        },
        required: ['location']
      }
    }
  }],
  toolChoice: 'auto',                 // Options: 'auto', 'any', 'none'
  parallelToolCalls: false,
});

// Tool result (sent as role: 'tool', NOT role: 'user' like Claude)
messages.push({
  role: 'tool',
  name: 'get_weather',
  content: '{"temp": 22}',
  tool_call_id: toolCall.id,
});

// ── Reasoning (Magistral models) ──
const response = await client.chat.complete({
  model: 'magistral-medium-latest',   // Switch to Magistral model
  messages: [...],
  promptMode: 'reasoning',            // Enables structured thinking output
});

// Response content structure (v2509+, tokenized):
// [
//   { type: 'thinking', thinking: [{ type: 'text', text: '...reasoning...' }] },
//   { type: 'text', text: '...final answer...' }
// ]

// ── Web search (Agents API) ──
const agent = await client.beta.agents.create({
  model: 'mistral-large-latest',
  tools: [{ type: 'web_search' }],    // or 'web_search_premium'
});
```

### Model IDs Quick Reference

| Latest Alias | Pinned Version ID | Category |
|---|---|---|
| `mistral-large-latest` | `mistral-large-2512` | Generalist (Open) |
| `mistral-medium-latest` | `mistral-medium-2508` | Generalist (Premier) |
| `mistral-small-latest` | `mistral-small-2506` | Generalist (Open) |
| `magistral-medium-latest` | `magistral-medium-2509` | Reasoning (Premier) |
| `magistral-small-latest` | `magistral-small-2509` | Reasoning (Open) |

### Rate Limits

| Tier | Requests/min | Tokens/min | Tokens/month |
|---|---|---|---|
| Free | 2 | 500K | 1B |
| Production | 120 | 1M | 10B |

---

*Investigation conducted by Claude Opus 4.6 for ANTON by openEXPERT*
*Model data verified from docs.mistral.ai on 2026-03-15*
