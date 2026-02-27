# openEXPERT by ANTON — Master Implementation Plan

**Version:** 1.0 — February 18, 2026
**Status:** Strategic Planning Document
**Author:** Daniel Bardun & Claude

---

## Part 1: Multi-LLM Support Architecture

### 1.1 Supported Models & Priority

| Priority | Provider | Default Model | Alt Models | Role |
|----------|----------|--------------|------------|------|
| **1 (Default)** | Anthropic | Claude Sonnet 4.6 | Opus 4.6, Haiku 4.5 | Primary — best for consulting output quality, safety, structured reasoning |
| **2** | OpenAI | GPT-5.2 | GPT-5.1, GPT-4o | Enterprise clients on Azure/Microsoft stack |
| **3** | Google | Gemini 3 Pro | Gemini 2.5 Flash | Clients on Google Cloud/Workspace; 1M context for massive document analysis |
| **4** | Mistral | Mistral Large | Magistral Medium, Mistral Medium 3 | EU data sovereignty (Paris-based); open-weight option; cost-effective |

### 1.2 Critical API Differences — The Compatibility Matrix

This is the core technical challenge. Each provider handles system prompts, parameters, reasoning, and structured output differently. The PromptComposer and ModelAdapter must normalise these differences.

#### 1.2.1 System Prompt Injection

| Feature | Claude | GPT | Gemini | Mistral |
|---------|--------|-----|--------|---------|
| System prompt mechanism | Separate `system` parameter | `role: "system"` in messages array | `system_instruction` parameter | `role: "system"` in messages (OpenAI-compatible) |
| Multiple system messages | No — single string | Yes — multiple system messages allowed | No — single instruction | Yes — multiple system messages |
| System prompt caching | Yes — prompt caching reduces cost for repeated system prompts | Automatic caching on repeated prefixes | Varies by model tier | No native caching |

**Impact on openEXPERT:** The 7-layer prompt composition currently produces a single concatenated system prompt. This works directly for Claude and Gemini. For GPT and Mistral, we could either concatenate into one system message (simplest) or split layers into separate system messages (potentially better adherence but more complex). **Recommendation: concatenate into single system message for all providers** — simplest, most portable, tested.

#### 1.2.2 Temperature & Sampling Parameters

| Parameter | Claude | GPT | Gemini | Mistral |
|-----------|--------|-----|--------|---------|
| Temperature range | 0.0–1.0 | 0.0–2.0 | 0.0–2.0 (but 3.0 models optimised for 1.0) | 0.0–2.0 |
| Top-p | Yes (but can't combine with temp in 4.5) | Yes | Yes | Yes |
| Top-k | No | No | Yes (unique to Gemini) | No |
| Frequency penalty | **No** | Yes (-2.0 to 2.0) | Yes | Yes |
| Presence penalty | **No** | Yes (-2.0 to 2.0) | Yes | Yes |
| Seed / determinism | No (even temp=0 not fully deterministic) | Yes — `seed` parameter | No | Yes — `random_seed` |
| Logit bias | No | Yes (per-token) | No | No |

**Impact on openEXPERT:** Our interface currently doesn't expose temperature/sampling controls (it's hardcoded in the API call). When we add the model selector, we need a **normalised temperature scale** — e.g., openEXPERT's "precision" slider maps 0.0–1.0 internally but translates differently per provider:
- Claude: direct pass-through (0.0–1.0)
- GPT: multiply by 2 (0.0–2.0 range)
- Gemini: keep at 1.0 for Gemini 3 models (Google's recommendation) OR normalise
- Mistral: multiply by 2 (0.0–2.0 range)

**Recommendation:** Don't expose raw temperature. Instead offer a **Precision/Creativity toggle** with 5 presets:

| Preset | Description | Claude | GPT | Gemini | Mistral |
|--------|-------------|--------|-----|--------|---------|
| Strict | Regulatory/compliance output | 0.0 | 0.0 | 0.5* | 0.0 |
| Precise | Analytical work | 0.2 | 0.3 | 0.7* | 0.3 |
| Balanced | General consulting (default) | 0.5 | 0.7 | 1.0* | 0.7 |
| Creative | Brainstorming, drafting | 0.7 | 1.2 | 1.0* | 1.2 |
| Exploratory | Ideation, edge cases | 0.9 | 1.6 | 1.2* | 1.6 |

*Gemini 3 models perform best near 1.0 — Google warns lower values cause looping. Adjustments are subtle.

#### 1.2.3 Reasoning / Thinking Modes

This is where the providers diverge most significantly, and it directly impacts our Structured Reasoning toggle.

| Feature | Claude | GPT | Gemini | Mistral |
|---------|--------|-----|--------|---------|
| Extended thinking | Yes — `thinking` parameter with `budget_tokens` | Separate model variant (GPT-5.2 Thinking) | "Deep Think" mode on Gemini 3 Pro | Separate model family (Magistral) |
| Reasoning effort control | Yes — `reasoning_effort` parameter (low/medium/high) | Not on standard models; thinking variant has budget | Not directly — Deep Think is on/off | Not directly — use Magistral models |
| Chain-of-thought visible | Yes — thinking blocks returned in response | Yes — in thinking variant | Yes — in Deep Think mode | Yes — Magistral returns reasoning traces |
| Cost impact | Thinking tokens billed at input rate | Thinking variant: $168/M output tokens (!!) | Deep Think significantly more expensive | Magistral priced higher than standard |
| How to activate | API parameter on same model | Switch to different model string | Different model mode | Switch to different model string |

**Impact on openEXPERT:** Our Structured Reasoning toggle currently injects a prompt-based reasoning framework (MIT Meta-Cognitive). This works across ALL providers because it's in the system prompt. However, we can ALSO activate native reasoning for providers that support it.

**Recommendation — two-tier reasoning:**

1. **Prompt-based reasoning (our toggle):** Works identically across all providers. The system prompt injection forces decomposition → solve → verify → combine → reflect. This is provider-agnostic and is our primary approach.

2. **Native reasoning boost (optional, advanced):** When our Structured Reasoning toggle is ON, we can ADDITIONALLY activate native extended thinking where available:
   - Claude: add `thinking: { type: "enabled", budget_tokens: 8000 }`
   - GPT: switch from `gpt-5.2` to `gpt-5.2-thinking` (note: massive cost increase)
   - Gemini: activate Deep Think mode
   - Mistral: switch from `mistral-large` to `magistral-medium`

   This should be a separate toggle: **"Native Reasoning Boost"** — off by default due to cost. When on, it doubles down on reasoning at the cost of higher token usage.

#### 1.2.4 Structured Output / JSON Mode

| Feature | Claude | GPT | Gemini | Mistral |
|---------|--------|-----|--------|---------|
| Native JSON mode | **No** — uses tool_use trick | Yes — `response_format: { type: "json_schema" }` with strict schema enforcement | Yes — `response_schema` parameter | Yes — `response_format: { type: "json_object" }` |
| Schema enforcement | Via tool input_schema (indirect) | Server-side guaranteed schema compliance | Server-side schema validation | Client-side validation needed |
| Structured output quality | Excellent (follows prompt instructions well) | Excellent (native enforcement) | Good | Good (validate with Pydantic) |

**Impact on openEXPERT:** Our export pipeline (docx/xlsx/pptx generation) requires structured data from the LLM. For Claude we use prompt engineering to get structured output. For GPT and Gemini, we can use native JSON mode for even more reliable structured data extraction.

**Recommendation:** The ModelAdapter should use native structured output where available, falling back to prompt-based structuring for Claude. This makes exports more reliable when using GPT/Gemini.

#### 1.2.5 Context Windows

| Provider | Standard | Extended | Practical Implication |
|----------|----------|----------|----------------------|
| Claude | 200K tokens | 1M beta (via API header) | ~150K words. Excellent for most consulting work |
| GPT | 128K (GPT-4o) / 400K (GPT-5.2) | — | GPT-5.2 handles very large documents |
| Gemini | 1M tokens (Gemini 3 Pro) | 2M coming | Entire codebases, massive regulatory libraries |
| Mistral | 128K (Mistral Large) | — | Adequate for most tasks, but smallest window |

**Impact on openEXPERT:** Knowledge Source injection (Mode 3 — local files) needs to respect context limits per provider. The PromptComposer should calculate: system prompt tokens + knowledge tokens + user input + reserved output buffer, and warn if approaching limits.

**Recommendation:** Add a **context budget calculator** that shows users how much "space" they have left after system prompt + knowledge injection. Visual indicator in the UI. Critical when using Mistral (128K) vs Gemini (1M).

#### 1.2.6 Safety / Content Filtering

| Feature | Claude | GPT | Gemini | Mistral |
|---------|--------|-----|--------|---------|
| Built-in safety | Constitutional AI — strong refusal of harmful content | Content policy filters, configurable | `safety_settings` parameter — 4 categories with adjustable thresholds | `safe_prompt` boolean |
| Compliance orientation | 4.7% prompt injection rate (best) | 21.9% prompt injection rate | 12.5% prompt injection rate | Not benchmarked |
| Enterprise control | Via API terms, ZDR option | Azure content filtering config | Per-category threshold levels | Simple on/off |

**Impact on openEXPERT:** For financial crime compliance work, Claude's safety profile is actually an advantage — it's the most resistant to prompt injection, which matters when processing client data. Gemini's adjustable safety thresholds could be useful for edge cases.

**Recommendation:** Default to each provider's standard safety settings. No need to weaken them — consulting work doesn't need edgy content. Document Claude's superior injection resistance as a feature in the whitepaper.

#### 1.2.7 Unique Features Per Provider

| Provider | Unique Feature | Relevance to openEXPERT |
|----------|---------------|------------------------|
| Claude | Prompt caching | Major cost saver — our 7-layer system prompt is repeated every call. Cache it. |
| Claude | Reasoning effort parameter | Fine-tune thinking depth without switching models |
| GPT | Native JSON schema enforcement | More reliable structured output for exports |
| GPT | Seed parameter | Reproducible outputs for audit trail |
| Gemini | 1M token context | Inject entire regulatory libraries in one call |
| Gemini | top_k parameter | Fine-grained sampling control |
| Gemini | safety_settings categories | Granular content filtering |
| Mistral | Apache 2.0 license (open models) | Can self-host model — true air-gap possible |
| Mistral | EU data residency (Paris servers) | GDPR compliance story for EU clients |
| Mistral | safe_prompt | Simple compliance toggle |

---

### 1.3 Architecture: The ModelAdapter Pattern

```
┌─────────────────────────────────────────────────────┐
│                    openEXPERT UI                     │
│  [Model Selector: Claude ▼] [Precision: Balanced ▼] │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│                  PromptComposer                      │
│  Layer 1-7 assembled into unified system prompt      │
│  + Session toggles (reasoning, tone, emoji)          │
│  + Knowledge source content                          │
│  = Complete prompt package                           │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│                  ModelAdapter                         │
│                                                      │
│  Receives: { systemPrompt, userMessage, settings }   │
│                                                      │
│  ┌─────────────┐ ┌──────────┐ ┌────────┐ ┌────────┐│
│  │ ClaudeAdapter│ │GPTAdapter│ │GeminiAd│ │MistralA││
│  │             │ │          │ │        │ │        ││
│  │ system:str  │ │ messages │ │ system │ │messages ││
│  │ thinking:?  │ │ [system] │ │_instru │ │[system] ││
│  │ temp:0-1    │ │ temp:0-2 │ │ temp:* │ │temp:0-2 ││
│  │ cache:yes   │ │ json:yes │ │ topk:? │ │safe:yes ││
│  └─────────────┘ └──────────┘ └────────┘ └────────┘│
│                                                      │
│  Returns: unified { content, thinking?, usage }      │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│              ResponseProcessor                       │
│  Normalises response format across providers         │
│  Extracts: content, reasoning traces, token counts   │
│  Feeds: ReviewEngine, ExportPipeline, AuditLog       │
└─────────────────────────────────────────────────────┘
```

### 1.4 TypeScript Interfaces

```typescript
// src/types/modelAdapter.ts

type ModelProvider = 'anthropic' | 'openai' | 'google' | 'mistral';

interface ModelConfig {
  provider: ModelProvider;
  modelId: string;
  displayName: string;
  contextWindow: number;        // tokens
  maxOutputTokens: number;
  supportsThinking: boolean;
  supportsJsonMode: boolean;
  supportsPromptCaching: boolean;
  supportsSeed: boolean;
  temperatureRange: [number, number]; // [min, max]
  costPer1MInput: number;       // USD
  costPer1MOutput: number;      // USD
  apiEndpoint: string;
  requiresApiKey: string;       // env var name
}

const MODEL_REGISTRY: Record<string, ModelConfig> = {
  'claude-sonnet-4.6': {
    provider: 'anthropic',
    modelId: 'claude-sonnet-4-6',
    displayName: 'Claude Sonnet 4.6',
    contextWindow: 200000,
    maxOutputTokens: 8192,
    supportsThinking: true,
    supportsJsonMode: false,  // uses tool_use trick
    supportsPromptCaching: true,
    supportsSeed: false,
    temperatureRange: [0, 1],
    costPer1MInput: 3.00,
    costPer1MOutput: 15.00,
    apiEndpoint: 'https://api.anthropic.com/v1/messages',
    requiresApiKey: 'ANTHROPIC_API_KEY',
  },
  'claude-opus-4.6': {
    provider: 'anthropic',
    modelId: 'claude-opus-4-6',
    displayName: 'Claude Opus 4.6 (Premium)',
    contextWindow: 200000,
    maxOutputTokens: 8192,
    supportsThinking: true,
    supportsJsonMode: false,
    supportsPromptCaching: true,
    supportsSeed: false,
    temperatureRange: [0, 1],
    costPer1MInput: 5.00,
    costPer1MOutput: 25.00,
    apiEndpoint: 'https://api.anthropic.com/v1/messages',
    requiresApiKey: 'ANTHROPIC_API_KEY',
  },
  'gpt-5.2': {
    provider: 'openai',
    modelId: 'gpt-5.2',
    displayName: 'GPT-5.2',
    contextWindow: 400000,
    maxOutputTokens: 16384,
    supportsThinking: false, // thinking is separate model variant
    supportsJsonMode: true,
    supportsPromptCaching: true,
    supportsSeed: true,
    temperatureRange: [0, 2],
    costPer1MInput: 1.75,
    costPer1MOutput: 14.00,
    apiEndpoint: 'https://api.openai.com/v1/chat/completions',
    requiresApiKey: 'OPENAI_API_KEY',
  },
  'gemini-3-pro': {
    provider: 'google',
    modelId: 'gemini-3-pro',
    displayName: 'Gemini 3 Pro',
    contextWindow: 1000000,
    maxOutputTokens: 8192,
    supportsThinking: true, // Deep Think mode
    supportsJsonMode: true,
    supportsPromptCaching: false,
    supportsSeed: false,
    temperatureRange: [0, 2], // but optimised at 1.0
    costPer1MInput: 1.25,
    costPer1MOutput: 10.00,
    apiEndpoint: 'https://generativelanguage.googleapis.com/v1beta',
    requiresApiKey: 'GOOGLE_API_KEY',
  },
  'mistral-large': {
    provider: 'mistral',
    modelId: 'mistral-large-latest',
    displayName: 'Mistral Large',
    contextWindow: 128000,
    maxOutputTokens: 8192,
    supportsThinking: false, // Magistral is separate
    supportsJsonMode: true,
    supportsPromptCaching: false,
    supportsSeed: true,
    temperatureRange: [0, 2],
    costPer1MInput: 2.00,
    costPer1MOutput: 6.00,
    apiEndpoint: 'https://api.mistral.ai/v1/chat/completions',
    requiresApiKey: 'MISTRAL_API_KEY',
  },
};

// Precision presets mapped per provider
type PrecisionLevel = 'strict' | 'precise' | 'balanced' | 'creative' | 'exploratory';

const TEMPERATURE_MAP: Record<ModelProvider, Record<PrecisionLevel, number>> = {
  anthropic: { strict: 0.0, precise: 0.2, balanced: 0.5, creative: 0.7, exploratory: 0.9 },
  openai:    { strict: 0.0, precise: 0.3, balanced: 0.7, creative: 1.2, exploratory: 1.6 },
  google:    { strict: 0.5, precise: 0.7, balanced: 1.0, creative: 1.0, exploratory: 1.2 },
  mistral:   { strict: 0.0, precise: 0.3, balanced: 0.7, creative: 1.2, exploratory: 1.6 },
};

// Adapter interface — each provider implements this
interface IModelAdapter {
  sendMessage(request: UnifiedRequest): Promise<UnifiedResponse>;
  estimateTokens(text: string): number;
  getContextBudget(modelId: string, systemPromptTokens: number): number;
}

interface UnifiedRequest {
  systemPrompt: string;
  userMessage: string;
  conversationHistory: Message[];
  settings: {
    model: string;
    precision: PrecisionLevel;
    enableThinking: boolean;
    enableNativeReasoning: boolean;
    jsonMode: boolean;
    seed?: number;
  };
}

interface UnifiedResponse {
  content: string;
  thinkingContent?: string;    // reasoning traces if available
  usage: {
    inputTokens: number;
    outputTokens: number;
    thinkingTokens?: number;
    estimatedCostUSD: number;
  };
  model: string;
  provider: ModelProvider;
  responseId: string;           // for audit trail
}
```

---

## Part 2: New Toggle — Precision/Creativity

Added to the existing toggle system (Structured Reasoning, Writing Tone, Emoji):

### Toggle 4: Precision Level

- **Type:** Dropdown selector (5 options)
- **Default:** Balanced
- **Injection:** Controls temperature parameter at API call level (not prompt injection)
- **Module defaults:**
  - Regulatory Interpretation → Strict
  - Gap Analysis → Precise
  - Risk Assessment → Precise
  - Brainstorming → Creative
  - Policy Drafting → Balanced
  - Quick Reference → Balanced

### Toggle 5: Native Reasoning Boost

- **Type:** Binary toggle (Off/On)
- **Default:** Off
- **Warning on activation:** "Native reasoning significantly increases API costs. Estimated +3-10x per query."
- **Behaviour when On:**
  - Claude: activates extended thinking with budget_tokens
  - GPT: switches to thinking variant
  - Gemini: activates Deep Think
  - Mistral: switches to Magistral model
- **Complementary to prompt-based Structured Reasoning** — they can both be on simultaneously

### Toggle 6: Model Selector

- **Type:** Dropdown with model groups
- **Default:** Claude Sonnet 4.6
- **Display:** Shows model name + context window + cost indicator (€/€€/€€€)
- **Per-model info tooltip:** Context window, strengths, cost tier
- **Remembers last selection** per session

---

## Part 3: Full Roadmap — All Work Areas

### Phase 0: Foundation (Weeks 1–2) — CURRENT SPRINT

| # | Task | Area | Priority | Effort | Dependencies |
|---|------|------|----------|--------|-------------|
| 0.1 | Update current Claude integration to Sonnet 4.6 model string | LLM | Critical | 1h | None |
| 0.2 | Install i18n framework (react-i18next), externalise all UI strings | i18n | Critical | 2d | None |
| 0.3 | Implement session toggles (Reasoning, Tone, Emoji) per existing spec | Toggles | Critical | 3d | Toggles spec |
| 0.4 | Add audit log foundation — immutable record per API call | Security | Critical | 2d | None |
| 0.5 | Fix UI contrast issues identified in testing | UX | High | 1d | None |
| 0.6 | Make all module configs JSON-serialisable (prep for .anton) | Architecture | High | 2d | None |
| 0.7 | Add `formatVersion` field to all config schemas | Architecture | High | 0.5d | 0.6 |

### Phase 1: Multi-LLM Foundation (Weeks 3–5)

| # | Task | Area | Priority | Effort | Dependencies |
|---|------|------|----------|--------|-------------|
| 1.1 | Define ModelAdapter interface and UnifiedRequest/Response types | LLM | Critical | 1d | None |
| 1.2 | Implement ClaudeAdapter (refactor existing code) | LLM | Critical | 2d | 1.1 |
| 1.3 | Implement GPTAdapter (OpenAI API integration) | LLM | High | 2d | 1.1 |
| 1.4 | Implement GeminiAdapter (Google API integration) | LLM | High | 2d | 1.1 |
| 1.5 | Implement MistralAdapter (Mistral API integration) | LLM | High | 2d | 1.1 |
| 1.6 | Build temperature normalisation (TEMPERATURE_MAP) | LLM | High | 0.5d | 1.1 |
| 1.7 | Build context budget calculator | LLM | High | 1d | 1.1 |
| 1.8 | Add model selector to UI (Toggle 6) | UI | High | 1d | 1.2–1.5 |
| 1.9 | Add precision level selector to UI (Toggle 4) | UI | Medium | 0.5d | 1.6 |
| 1.10 | Add native reasoning boost toggle (Toggle 5) with cost warning | UI | Medium | 1d | 1.2–1.5 |
| 1.11 | API key management UI — configure keys per provider | UI/Security | High | 1d | 1.2–1.5 |
| 1.12 | Model-specific response parsing (normalise thinking/content) | LLM | High | 1d | 1.2–1.5 |
| 1.13 | Prompt caching implementation for Claude | LLM/Cost | Medium | 1d | 1.2 |
| 1.14 | Seed parameter pass-through for GPT/Mistral (audit reproducibility) | LLM/Security | Medium | 0.5d | 1.3, 1.5 |

### Phase 2: Security & Enterprise Foundation (Weeks 5–7)

| # | Task | Area | Priority | Effort | Dependencies |
|---|------|------|----------|--------|-------------|
| 2.1 | Structured audit log — who, when, model, module, settings, input hash, output hash | Security | Critical | 3d | 0.4 |
| 2.2 | Human review workflow — Draft → Reviewed → Approved status on outputs | Security | High | 2d | 2.1 |
| 2.3 | Basic authentication system (local users, password hashed) | Auth | High | 2d | None |
| 2.4 | Session isolation per user | Auth | High | 1d | 2.3 |
| 2.5 | Token usage tracking per session, per user, per module | Cost | High | 2d | Phase 1 |
| 2.6 | Cost estimation display in UI (before send) | Cost/UI | Medium | 1d | 2.5 |
| 2.7 | Budget cap system — admin-set monthly limits per user | Cost | Medium | 1d | 2.5, 2.3 |
| 2.8 | Security audit — all 10 codebase actions from Appendix E | Security | Critical | 3d | None |
| 2.9 | CSP headers, rate limiting, HTTPS enforcement docs | Security | High | 1d | 2.8 |
| 2.10 | Security Architecture Overview document for whitepaper | Docs | High | 1d | 2.8 |
| 2.11 | Dependency audit — npm audit + license check | Security | High | 0.5d | None |

### Phase 3: .anton Exchange System (Weeks 7–9)

| # | Task | Area | Priority | Effort | Dependencies |
|---|------|------|----------|--------|-------------|
| 3.1 | Define .anton manifest.json schema (v1.0) | Exchange | Critical | 1d | 0.6 |
| 3.2 | Export pipeline — bundle module to .anton file | Exchange | Critical | 2d | 3.1 |
| 3.3 | Import pipeline — validate and install .anton file | Exchange | Critical | 3d | 3.1 |
| 3.4 | 5-step import security validation (zip check, schema, content, injection scan, deps) | Exchange/Security | Critical | 2d | 3.3 |
| 3.5 | Dependency resolution system (check missing skills/personas) | Exchange | High | 2d | 3.3 |
| 3.6 | Module version history — store last N versions, allow rollback | Exchange | Medium | 1d | 3.1 |
| 3.7 | Changelog system per module | Exchange | Medium | 0.5d | 3.6 |
| 3.8 | Export/Import UI — file picker, preview, install wizard | UI | High | 2d | 3.2, 3.3 |

### Phase 4: RAG Pipeline (Weeks 9–12)

| # | Task | Area | Priority | Effort | Dependencies |
|---|------|------|----------|--------|-------------|
| 4.1 | Evaluate vector DB options (SQLite-vec, ChromaDB, LanceDB) | RAG | High | 1d | None |
| 4.2 | Document chunking engine (PDF, DOCX, XLSX, TXT, MD) | RAG | High | 3d | None |
| 4.3 | Embedding generation (local model or API-based) | RAG | High | 2d | 4.1 |
| 4.4 | Vector storage and retrieval | RAG | High | 2d | 4.1, 4.3 |
| 4.5 | Semantic search — retrieve top-k relevant chunks per query | RAG | High | 2d | 4.4 |
| 4.6 | Knowledge Source Mode 5 — "Indexed Knowledge Base" in UI | RAG/UI | High | 2d | 4.5 |
| 4.7 | Document indexing management — add/remove/reindex docs | RAG/UI | Medium | 1d | 4.6 |
| 4.8 | Chunk relevance scoring display (optional) | RAG/UI | Low | 0.5d | 4.5 |
| 4.9 | Integration with context budget calculator (RAG chunks count) | RAG/LLM | Medium | 0.5d | 4.5, 1.7 |

### Phase 5: Advanced Features (Weeks 12–16)

| # | Task | Area | Priority | Effort | Dependencies |
|---|------|------|----------|--------|-------------|
| 5.1 | Review Engine implementation (multi-agent: quality, regulatory, technical, comms, red team) | Quality | High | 5d | Phase 1 |
| 5.2 | Export pipeline — structured data extraction for docx/xlsx/pptx | Export | High | 3d | Phase 1 |
| 5.3 | Native JSON mode usage for GPT/Gemini in export pipeline | Export/LLM | Medium | 1d | 1.3, 1.4, 5.2 |
| 5.4 | MCP integration investigation — connect to external data sources | Integration | Medium | 2d | None |
| 5.5 | RBAC — role-based access control (Admin, Analyst, Viewer) | Auth | Medium | 3d | 2.3 |
| 5.6 | SSO investigation (SAML/OIDC for enterprise) | Auth | Medium | 2d | 5.5 |
| 5.7 | Dashboard — usage analytics, cost reporting, quality metrics | UI | Medium | 3d | 2.5 |
| 5.8 | Methodology documentation within modules ("why this works") | Content | Medium | Ongoing | None |
| 5.9 | Quality indicators on output ("8 of 10 dimensions covered") | Quality | Medium | 2d | 5.1 |
| 5.10 | Local LLM support via Ollama (for air-gapped deployment) | LLM | Low | 3d | 1.1 |

### Phase 6: Polish & Launch Prep (Weeks 16–20)

| # | Task | Area | Priority | Effort | Dependencies |
|---|------|------|----------|--------|-------------|
| 6.1 | Whitepaper — complete draft with security walkthrough | Docs | Critical | 5d | All |
| 6.2 | Security scorecard self-assessment | Docs/Security | High | 1d | 2.8 |
| 6.3 | README and contribution guidelines | Docs | High | 1d | None |
| 6.4 | GitHub repository setup (license, CI/CD, issue templates) | DevOps | High | 1d | None |
| 6.5 | Demo video / walkthrough | Marketing | Medium | 2d | All |
| 6.6 | Starter module packs (FCP, Legal, Audit — 3 areas minimum) | Content | High | 5d | Phase 3 |
| 6.7 | Hardening guide for deployment | Docs/Security | High | 1d | 2.8 |
| 6.8 | Performance testing — response times, concurrent users | QA | Medium | 2d | Phase 2 |
| 6.9 | Pen test (OWASP Top 10 minimum) | Security | High | 3d | 2.8 |
| 6.10 | Beta testing with 2–3 friendly institutions | QA | Critical | Ongoing | All |

---

## Part 4: Model Selection Guidance for Users

This should appear in the UI as a tooltip/help section when selecting models:

### When to use each model

**Claude Sonnet 4.6 (Default — Recommended)**
Best for: Regulatory analysis, policy drafting, structured compliance output, gap assessments, risk assessments. Strongest safety profile, best at following complex system prompts, most reliable for consulting-grade output.

**Claude Opus 4.6 (Premium)**
Best for: The most complex analytical work — multi-jurisdictional analysis, novel regulatory interpretation, board-level strategic advice. Higher cost, deeper reasoning.

**GPT-5.2**
Best for: Clients on Microsoft/Azure stack, mathematical analysis, tasks requiring reproducible outputs (seed parameter), bulk document processing where native JSON mode reduces errors.

**Gemini 3 Pro**
Best for: Massive document analysis (1M token context — feed entire regulatory libraries), clients on Google Cloud, multimodal analysis (if images/diagrams are involved).

**Mistral Large**
Best for: EU data sovereignty requirements (Paris-based servers), cost-sensitive deployments, clients wanting open-weight models for future self-hosting potential. Also: Apache 2.0 licensed models available for true air-gapped deployment.

---

## Part 5: Updated Toggle Architecture (Complete)

```
Layer 1: System Foundation
  └─ Writing Tone (end of Layer 1)
  └─ Emoji Usage (after Tone)
Layer 2: Area Context
Layer 3: Module Expertise
Layer 4: Persona Injection
Layer 5: Skills Attachment
Layer 6: Knowledge Source Integration
Layer 7: Transparency & Reasoning
  └─ Structured Reasoning — prompt-based (FIRST in Layer 7)
  └─ Transparency (AFTER Reasoning)

API-Level Settings (not prompt injection):
  └─ Model Selection → ModelAdapter routing
  └─ Precision Level → temperature mapping per provider
  └─ Native Reasoning Boost → thinking/model-variant activation
```

**Total toggles: 6**
1. Structured Reasoning (prompt injection) — Binary, default Off
2. Writing Tone (prompt injection) — Dropdown 4 options, default Professional
3. Emoji Usage (prompt injection) — Binary, default Off
4. Precision Level (API parameter) — Dropdown 5 options, default Balanced
5. Native Reasoning Boost (API parameter) — Binary, default Off, cost warning
6. Model Selector (API routing) — Dropdown with model registry, default Claude Sonnet 4.6

---

## Part 6: Summary — Effort Estimates

| Phase | Focus | Weeks | Est. Dev Days | Blocking? |
|-------|-------|-------|---------------|-----------|
| Phase 0 | Foundation | 1–2 | 11d | Yes — enables everything |
| Phase 1 | Multi-LLM | 3–5 | 16d | Yes — core differentiator |
| Phase 2 | Security & Enterprise | 5–7 | 17d | Yes — client deployment |
| Phase 3 | .anton Exchange | 7–9 | 14d | No — parallel work possible |
| Phase 4 | RAG Pipeline | 9–12 | 14d | No — parallel work possible |
| Phase 5 | Advanced Features | 12–16 | 26d | No — incremental |
| Phase 6 | Launch Prep | 16–20 | 22d | Yes — before public release |
| **Total** | | **~20 weeks** | **~120 dev days** | |

**Critical path:** Phase 0 → Phase 1 → Phase 2 → Phase 6

**Parallelisable:** Phase 3 + Phase 4 can run alongside Phase 2. Phase 5 items can be cherry-picked throughout.

---

*This is a living document. Update as implementation progresses and decisions are made.*

---

## Implementation Progress Tracker

**Last updated:** 2026-02-18

### Phase 0 — Foundation

| # | Task | Status | Notes |
|---|------|--------|-------|
| 0.1 | Update to Sonnet 4.6 model string | ✅ Done | MODEL_REGISTRY uses correct model IDs |
| 0.2 | Install react-i18next, externalise UI strings | 🟡 Partial | Library installed; strings partially externalised |
| 0.3 | Session toggles (Reasoning, Tone, Emoji) | ✅ Done | SessionTogglesPanel.tsx, togglePrompts.ts, wired into prompt-composer.ts |
| 0.4 | Audit log foundation | ✅ Done | auditLogger.ts, audit.ts, AuditLogPage.tsx, Draft→Reviewed→Approved workflow |
| 0.5 | UI contrast fixes | 🟡 Ongoing | Addressed progressively |
| 0.6 | JSON-serialisable module configs | ✅ Done | All module.json files are clean JSON |
| 0.7 | `formatVersion` in all config schemas | ✅ Done | Added to all 150+ module.json and area.json files |

### Phase 1 — Multi-LLM Foundation

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1.1 | ModelAdapter interface + types | ✅ Done | server/types/modelAdapter.ts — MODEL_REGISTRY, TEMPERATURE_MAP, PrecisionLevel |
| 1.2 | ClaudeAdapter (refactor) | ✅ Done | Existing claude-client.ts extended |
| 1.3 | GPTAdapter (OpenAI) | ✅ Done | server/services/adapters/openaiAdapter.ts |
| 1.4 | GeminiAdapter (Google) | ✅ Done | server/services/adapters/geminiAdapter.ts |
| 1.5 | MistralAdapter | ✅ Done | server/services/adapters/mistralAdapter.ts |
| 1.6 | Temperature normalisation (TEMPERATURE_MAP) | ✅ Done | Defined in modelAdapter.ts per provider |
| 1.7 | Context budget calculator | 🟡 Partial | token-estimator.ts exists |
| 1.8 | Model selector UI (Toggle 6) | ✅ Done | ModelSelector.tsx already existed |
| 1.9 | Precision level selector UI (Toggle 4) | ✅ Done | PrecisionSelector.tsx, wired into ModulePage |
| 1.10 | Native reasoning boost toggle (Toggle 5) | ⬜ Pending | Not yet implemented |
| 1.11 | API key management UI | ✅ Done | Settings.tsx "Additional AI Providers" section, settings.ts route |
| 1.12 | Model-specific response parsing | ✅ Done | Each adapter normalises output format |
| 1.13 | Prompt caching for Claude | ⬜ Pending | Not yet implemented |
| 1.14 | Seed parameter for GPT/Mistral | ⬜ Pending | Not yet implemented |

### Phase 2 — Security & Enterprise

| # | Task | Status | Notes |
|---|------|--------|-------|
| 2.1 | Structured audit log | ✅ Done | 22-column audit_log table, writeAuditEntry() per API call |
| 2.2 | Human review workflow | ✅ Done | Draft→Reviewed→Approved status with AuditLogPage UI |
| 2.3 | Basic authentication (local users) | ⬜ Pending | DEPLOYMENT_MODE env var foundation in place |
| 2.4 | Session isolation per user | ⬜ Pending | Requires 2.3 |
| 2.5 | Token tracking per session/user/module | 🟡 Partial | Per-session tracking exists; per-user pending |
| 2.6 | Cost estimation in UI (before send) | ✅ Done | ModulePage shows estimated cost |
| 2.7 | Budget cap system | ⬜ Pending | |
| 2.8 | Security audit (OWASP Top 10) | 🟡 Partial | helmet, rate-limit, CORS in place |
| 2.9 | CSP headers, HTTPS enforcement | 🟡 Partial | helmet covers CSP; HTTPS docs pending |
| 2.10 | Security architecture docs | ⬜ Pending | |
| 2.11 | Dependency audit (npm audit) | ⬜ Pending | |

### Phase 3 — .anton Exchange System

| # | Task | Status | Notes |
|---|------|--------|-------|
| 3.1 | .anton manifest.json schema v1.0 | ✅ Done | Defined in antonExport.ts + antonImport.ts |
| 3.2 | Export pipeline (.anton) | ✅ Done | server/services/antonExport.ts, POST /api/exchange/export/:moduleId |
| 3.3 | Import pipeline (.anton) | ✅ Done | server/services/antonImport.ts, POST /api/exchange/import |
| 3.4 | 5-step import security validation | ✅ Done | zip check, schema, content, injection scan, deps in antonImport.ts |
| 3.5 | Dependency resolution | ✅ Done | missingDeps returned in ImportResult |
| 3.6 | Module version history | ⬜ Pending | |
| 3.7 | Changelog system | ⬜ Pending | |
| 3.8 | Export/Import UI | ✅ Done | ExchangePage.tsx, nav link in Sidebar, route /exchange |

### Platform & Distribution (from peppy-crafting-wall plan)

| Item | Status | Notes |
|------|--------|-------|
| Brief Me mode (/brief) | ✅ Done | BriefMePage.tsx |
| Guide Me mode (/guide) | ✅ Done | GuideMePage.tsx |
| Batch Create (/batch) | ✅ Done | BatchCreatePage.tsx |
| Shareable session links | ✅ Done | SharePage.tsx, /share/:token |
| 18 new content areas (Wave 3-5) | ✅ Done | startups, personal-dev, academic, comms-pr, hr, accounting, branding, software-eng, sales, insurance, real-estate, personal-finance, healthcare, manufacturing, public-sector, consumer-legal, education + depth expansions |
| Home page with favourites | ✅ Done | localStorage-based, gold star on hover, favourites row at top |
| i18n Swedish | 🟡 Partial | Library installed; full string extraction pending |
| DEPLOYMENT_MODE=solo/team | ✅ Done | server/index.ts GET /api/config, useSettingsStore |

### Summary

| Phase | Progress |
|-------|----------|
| Phase 0 — Foundation | **6/7 complete** |
| Phase 1 — Multi-LLM | **9/14 complete** |
| Phase 2 — Security | **4/11 complete** |
| Phase 3 — Exchange | **6/8 complete** |
| Platform & Distribution | **8/9 complete** |

**Next priorities:** Phase 2 authentication (2.3, 2.4), native reasoning boost toggle (1.10), prompt caching (1.13), i18n string extraction (0.2), RAG pipeline (Phase 4).
