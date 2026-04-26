# 13-multi-llm-routing — Multi-LLM Routing

**Status of diagram:** Generated 2026-04-26 by Claude Code from commit `0fabf7f` (`openexpert@0.7.5`)
**Subsystem status legend:** ✅ Built · 🟢 Partial · 📋 Spec-only · ❌ Future
**Maintainer note:** Regenerate when a new provider/adapter is added, when a new caching path is wired (e.g. OpenAI prompt-cache), or when the long-context beta header changes.

How `unified-llm-client` decides which provider/model to use for a given request, how the Anthropic short-circuit preserves prompt caching, how reasoning is mapped to provider-specific parameters, and where the fallback chain lives.

## Diagram

```mermaid
flowchart LR
  classDef inp fill:#1E3A8A,stroke:#93C5FD,color:#EFF6FF
  classDef path fill:#0F766E,stroke:#5EEAD4,color:#F0FDFA
  classDef azure fill:#581C87,stroke:#D8B4FE,color:#FAF5FF
  classDef ext fill:#1F2937,stroke:#9CA3AF,color:#F9FAFB
  classDef partial fill:#7C2D12,stroke:#FDBA74,color:#FFF7ED,stroke-dasharray: 5 3

  Req["UnifiedStreamConfig<br/>{model, thinking, creativity,<br/>system, staticSystemPrompt,<br/>messages, tools, maxTokens, db}"]:::inp

  Req --> Resolve["getProviderFromModelId(modelId, db)"]
  Resolve --> Custom{custom-model<br/>slot match?}
  Custom -- yes --> CustomKey[Use apiKeyOverride<br/>or apiKeyEnvVar]
  Custom -- no --> StdKey[Use process.env\\.{PROVIDER}_API_KEY]
  CustomKey --> Provider
  StdKey --> Provider

  Provider{provider}

  %% ── Anthropic short-circuit ──────────────────────────────────────
  Provider -- anthropic --> CC["claude-client.streamToResponse"]:::path
  CC --> CCCache["staticSystemPrompt block<br/>cache_control: ephemeral<br/>(Opus 4.7 / Sonnet 4.6)"]:::path
  CC --> CCThink["adaptive thinking:<br/>{type: 'adaptive',<br/>output_config: {effort}}<br/>(Opus 4.7 / Sonnet 4.6)<br/>OR budget_tokens<br/>(Sonnet 4.5 / Haiku)"]:::path
  CC --> CCContext["1M context:<br/>Opus 4.7 + Sonnet 4.6 = GA<br/>Sonnet 4.5 = beta header<br/>when tokens > 200k"]:::path
  CC --> CCCompact["compaction:<br/>buildCompactionConfig(model,'interactive')<br/>Opus 4.7 / Sonnet 4.6 only"]:::path
  CCCache --> AnthropicAPI[Anthropic API]:::ext
  CCThink --> AnthropicAPI
  CCContext --> AnthropicAPI
  CCCompact --> AnthropicAPI

  %% ── Non-Anthropic adapter path ───────────────────────────────────
  Provider -- openai --> ADP[createModelAdapter(provider,<br/>apiKey, azureCfg?)]:::path
  Provider -- google --> ADP
  Provider -- mistral --> ADP
  Provider -- ollama --> ADP
  Provider -- azure_openai --> AzureResolve["resolveAzureConfig(modelId, db)<br/>↓<br/>Lookup azure_openai_deployments<br/>+ azure_openai_config<br/>+ decrypt(api_key_encrypted)"]:::azure
  AzureResolve --> ADP

  ADP --> StripWS{contains<br/>'WEB SEARCH ENABLED'?}
  StripWS -- yes + Azure + Bing key --> Bing["bing-search.searchAndFormat<br/>Inject results into systemPrompt"]:::path
  StripWS -- yes (other) --> Strip[Regex-strip web-search directive]:::path
  StripWS -- no --> Build
  Bing --> Build
  Strip --> Build

  Build[Build UnifiedLLMRequest]:::path
  Build --> ADPCall[adapter.sendStreamRequest()]
  ADPCall --> Translate["mapTemperature(creativity, providerMax)<br/>+ mapThinkingBudget(thinking)"]
  Translate --> ProviderAPI[Provider-native API call]:::ext

  ProviderAPI --> Stream[For-await stream chunks<br/>→ SSE content_block_delta]
  AnthropicAPI --> Stream

  Stream --> EstTokens["Estimate tokens:<br/>(systemPrompt.length +<br/>messages.length) / 4"]
  EstTokens --> SendStop["SSE message_stop {usage}"]
  SendStop --> Done([SSE done · res.end])
  Done --> CB["circuit-breaker:<br/>recordSuccess() / recordFailure(status)"]

  %% ── Health-check sidebar ─────────────────────────────────────────
  subgraph Health["checkProviderHealth(provider)"]
    direction TB
    HCKey{API key set?}
    HCKey -- no + not ollama --> HCFail[available: false]
    HCKey -- yes --> HCOllama{provider == ollama?}
    HCOllama -- yes --> HCFetch[fetch /api/tags<br/>2s timeout]
    HCOllama -- no --> HCOK[available: true]
    HCFetch --> HCOK
  end

  %% ── Fallback (not yet automated) ─────────────────────────────────
  subgraph Fallback["Fallback chain 🟢"]
    F1["On error → recordFailure(status)<br/>circuit-breaker may open"]:::partial
    F2["No automatic provider switch:<br/>user re-runs with different model"]:::partial
    F1 --> F2
  end
  CB -. on failure .-> Fallback
```

## Provider dispatch table

`server/services/model-adapter.ts:552–582`:

```ts
case 'anthropic':    new AnthropicAdapter(apiKey)
case 'openai':       new OpenAIAdapter(apiKey)
case 'azure_openai': new AzureOpenAIAdapter(azureCfg)
case 'google':       new GeminiAdapter(apiKey)
case 'mistral':      new MistralAdapter(apiKey)
case 'ollama':       new OllamaAdapter(baseUrl)
default:             throw new Error(`Unsupported provider: ${provider}`)
```

## Thinking → provider mapping

| `ThinkingLevel` | Opus 4.7 / Sonnet 4.6 (adaptive) | Sonnet 4.5 / Haiku (`budget_tokens`) | Other providers |
|---|---|---|---|
| `quick` | `effort: 'low'` | 0 | temperature only |
| `think` | `effort: 'medium'` | 4096 | temperature only |
| `think_hard` | `effort: 'high'` | 16384 | temperature only |
| `investigate` | `effort: 'max'` | 32768 | temperature only |
| `plan_first` | `effort: 'max'` + plan-first instruction | 32768 | + plan-first instruction |
| `deep_investigate` | `effort: 'max'` + IRE branch | 32768 | n/a (IRE = Anthropic-only) |

`mapThinkingBudget()` in `model-adapter.ts:82–94` implements the budget-tokens row.

## Creativity → temperature mapping

`baseTemps = { strict: 0.0, balanced: 0.5, creative: 0.9 }` then normalised to provider's max range (`mapTemperature`, `model-adapter.ts:71–76`).

## Caching / 1M context / compaction matrix

| Model | Prompt caching | 1M context | Compaction |
|---|---|---|---|
| `claude-opus-4-7` | ✅ ephemeral | ✅ GA (no header) | ✅ |
| `claude-sonnet-4-6` | ✅ ephemeral | ✅ GA (no header) | ✅ |
| `claude-sonnet-4-5-20250929` | (not auto) | 🟢 beta header when > 200k | — |
| `claude-haiku-4-5-20251001` | — | — | — |
| OpenAI / Azure / Gemini / Mistral / Ollama | — | provider-native | — |

Compaction param wiring: `server/routes/claude.ts` near L985 calls `buildCompactionConfig(selectedModel, 'interactive')` when `compactionEnabled !== false`, then forwards `{ enabled, triggerThreshold, pauseAfterCompaction }` into `streamToResponse`.

## Source-of-truth references

- `server/services/unified-llm-client.ts:25–37` — `UnifiedStreamConfig`.
- `server/services/unified-llm-client.ts:39–46` — `StreamCompletionData`.
- `server/services/unified-llm-client.ts:49–56` — `API_KEYS` map.
- `server/services/unified-llm-client.ts:59–87` — `resolveAzureConfig` (DB lookup + decrypt).
- `server/services/unified-llm-client.ts:91–115` — `getApiKeyForModel` (custom-model override).
- `server/services/unified-llm-client.ts:117–137` — `isModelAvailable`.
- `server/services/unified-llm-client.ts:141–300` — `streamToResponse` (Anthropic short-circuit at L148–164; non-Anthropic at L166+).
- `server/services/unified-llm-client.ts:198–225` — web-search stripping + Azure+Bing pre-search.
- `server/services/unified-llm-client.ts:247–250` — for-await chunk loop → SSE.
- `server/services/unified-llm-client.ts:480–514` — `checkProviderHealth`.
- `server/services/unified-llm-client.ts:518–519` — re-exports `isApiKeyConfigured`, `getClient` from claude-client.
- `server/services/model-adapter.ts:30–48` — `UnifiedLLMRequest`.
- `server/services/model-adapter.ts:50–59` — `UnifiedLLMResponse`.
- `server/services/model-adapter.ts:71–76` — `mapTemperature`.
- `server/services/model-adapter.ts:82–94` — `mapThinkingBudget`.
- `server/services/model-adapter.ts:99+` — `AnthropicAdapter` (also referenced by adapters but Anthropic typically goes through the short-circuit).
- `server/services/model-adapter.ts:552–582` — provider switch (`createModelAdapter`).
- `server/services/claude-client.ts` — Anthropic streaming + caching + adaptive thinking + compaction.
- `server/services/adapters/{openai,azureOpenai,gemini,mistral,ollama}Adapter.ts` — non-Anthropic adapters.
- `server/services/credential-vault.ts` — `decrypt` for Azure key.
- `server/services/circuit-breaker.ts` — `recordSuccess` / `recordFailure`.
- `server/services/bing-search.ts` — Azure + Bing pre-search injection.
- `server/routes/claude.ts:976–1000` — IRE branch decision + compaction config.
- `server/db/migrations-pg/090_azure_openai.sql` — `azure_openai_config` + `azure_openai_deployments` tables.

## Open questions

- **Automatic fallback chain** — the brief asks for a fallback chain on failure; today the circuit breaker records failures and may open, but provider switching is manual (user picks a different model in settings). 🟢 Partial.
- **OpenAI prompt-cache** — OpenAI added a prompt-cache feature; not yet wired in this codebase. Worth a future enhancement.
- **Long-context beta header** — `ANTHROPIC_LONG_CONTEXT_BETA=true` env var gates it for Sonnet 4.5; absent, only the GA-1M Opus 4.7 / Sonnet 4.6 paths get long context.

## Related diagrams

- `01-system-context` — outer view of the LLM-provider edges.
- `02-container-diagram` — container-level placement of unified-llm-client + adapters.
- `10-module-execution-sequence` — where this routing is invoked.
- `11-seven-layer-prompt-builder` — staticSystemPrompt comes from here, fed into the cache block.
