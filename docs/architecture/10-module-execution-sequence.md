# 10-module-execution-sequence — Single Module Execution

**Status of diagram:** Generated 2026-04-26 by Claude Code from commit `0fabf7f` (`openexpert@0.7.5`)
**Subsystem status legend:** ✅ Built · 🟢 Partial · 📋 Spec-only · ❌ Future
**Maintainer note:** Regenerate when the request lifecycle changes — new pre-stream phase (compaction, IRE, quality ratchet), new persistence target, new abort/timeout logic, or a new provider-routing branch.

The canonical request lifecycle: a user clicks **Run** on a module and receives streamed output. Most module runs go through this exact path; specialised runs (Workflows, Missions, Agents) wrap or extend it.

## Diagram

```mermaid
sequenceDiagram
  autonumber
  actor U as User
  participant FE as React SPA<br/>(src/pages/* + useStreamStore)
  participant API as /api/claude<br/>(server/routes/claude.ts)
  participant PB as prompt-builder.ts
  participant KR as knowledge-resolver.ts
  participant CB as circuit-breaker<br/>+ rate-limit
  participant IRE as iterative-reasoning.ts
  participant ULL as unified-llm-client
  participant CC as claude-client.ts<br/>(Anthropic + caching)
  participant ADP as adapters/*<br/>(non-Anthropic)
  participant LLM as External LLM<br/>(Anthropic / OpenAI / Azure /<br/>Gemini / Mistral / Ollama)
  participant DB as PostgreSQL<br/>(sessions / messages / atoms)
  participant QR as quality-ratchet<br/>(scoreOutput, async)

  U->>FE: Click Run / submit prompt
  FE->>API: POST /api/claude/* (SSE)<br/>{moduleId, areaId, messages, knowledgeSources,<br/>thinking, model, sessionId}

  API->>API: Auth · CSRF · rate-limit · safeError
  API->>CB: Acquire request slot
  CB-->>API: ok / open

  rect rgba(15,118,110,0.12)
    note over API,KR: Pre-stream assembly
    API->>PB: composeSystemPrompt(area, module, persona, skills, knowledge)
    PB->>PB: Layer 1 system foundation<br/>+ Layer 2 area context<br/>+ Layer 2a/b/c/d (org · KP · Roaring · DJ)<br/>+ Layer 3 module expertise (system-prompt.md)<br/>+ Layer 4 persona (+ 4a resume)<br/>+ Layer 5 skills<br/>+ Layer 7 transparency / reasoning config
    PB-->>API: composedPrompt + staticSystemPrompt
    API->>KR: resolveKnowledgeSources(config, files)
    KR->>KR: Mode 1 web search · Mode 2 URLs ·<br/>Mode 3 folders · Mode 4 combined ·<br/>Mode 5 RAG (BM25 / Chroma)
    KR->>KR: Apply token budget (≤ 900k default)
    KR-->>API: resolvedKnowledge<br/>{ contextDocuments, tools, sourceManifest, tokens }
    API->>API: Append Layer 6 knowledge to composedPrompt<br/>(applyAntonBoosts + applyTokenBudget)
  end

  alt thinking ∈ {think_hard, investigate, plan_first, deep_investigate}<br/>AND iterativeReasoningEnabled
    API->>IRE: runIterativeReasoning(...)
    IRE->>CC: streamToResponse · phase=analyse
    CC->>LLM: messages.create (cache_control)
    LLM-->>CC: SSE deltas
    CC-->>IRE: text + thinking
    IRE->>CC: phase=deepen → tool_pass_1 → tool_pass_2 → synthesise
    note right of IRE: revelation_chains + revelation_steps<br/>persisted per phase
    IRE->>DB: insert revelation_chain · revelation_steps
    IRE-->>API: synthesisText
  else Anthropic direct
    API->>CC: streamToResponse({model, system, staticSystemPrompt, messages,<br/>thinking, tools, compaction, useLongContext, signal})
    CC->>LLM: messages.create<br/>(adaptive thinking · ephemeral cache · maybe 1M beta)
    LLM-->>CC: SSE event stream
    CC-->>API: forwarded SSE chunks
  else Non-Anthropic
    API->>ULL: streamToResponse(unifiedReq)
    ULL->>ADP: createModelAdapter(provider).sendStreamRequest
    ADP->>LLM: provider-native call
    LLM-->>ADP: stream
    ADP-->>ULL: chunks
    ULL-->>API: SSE chunks
  end

  loop for each chunk
    API-->>FE: SSE: content_block_delta
    FE->>FE: useStreamStore.appendDelta()
    FE-->>U: render incrementally
  end

  API-->>FE: SSE: message_stop {usage}
  API-->>FE: SSE: done
  API->>DB: onComplete: insert message<br/>(text, thinking, inputTokens, outputTokens)
  API->>QR: scoreOutput(content, moduleId, areaId, sessionId)<br/>(fire-and-forget)
  QR->>DB: write quality score
  CB->>CB: recordSuccess() / recordFailure(status)

  opt Client disconnects
    FE-->>API: req close → AbortController.abort()
    API->>LLM: cancel stream
  end
```

## Legend

- **Pre-stream assembly box (teal)** — every request, regardless of provider, runs the full prompt + knowledge resolution pipeline before any model call. The labels Layer 1 / 3 / 5 / 7 are conceptual; the code labels only Layer 2 (with sub-layers a/b/c/d), Layer 4a, and Layer 6 explicitly. See diagram `11-seven-layer-prompt-builder` for the layer detail.
- **Three branches** — IRE (deep thinking branch), Anthropic direct (the default path; preserves prompt caching), Non-Anthropic (via the adapter factory).
- **`onComplete` callback** — same callback contract across all three branches; the route owns persistence after the stream finishes.
- **Quality scoring** — fire-and-forget; never blocks the response. Output goes into the quality_ratchet trail.

## Source-of-truth references

- `server/routes/claude.ts:5` — imports `streamToResponse`, `isApiKeyConfigured`, `callSync`, `getClient` from `claude-client`.
- `server/routes/claude.ts:11` — imports `buildOrgContextLayer`, `buildResumeContextLayer`, `buildKnowledgePackLayer`, `buildAtomLayer` from `prompt-builder`.
- `server/routes/claude.ts:993` — main Anthropic streaming call.
- `server/routes/claude.ts:990–1000` — IRE branch (`useIRE` + `runIterativeReasoning`).
- `server/routes/claude.ts:920–950` — request timeout + abort wiring (`thinkingTimeouts`, `AbortController`, `req.on('close')`).
- `server/routes/claude.ts:1496` — second `streamToResponse` (alternate route handler).
- `server/services/prompt-builder.ts:259` — `buildOrgContextLayer` (Layer 2a).
- `server/services/prompt-builder.ts:299` — `buildResumeContextLayer` (Layer 4a).
- `server/services/prompt-builder.ts:340` — `buildKnowledgePackLayer` (Layer 2b).
- `server/services/prompt-builder.ts:382` — `buildAtomLayer`.
- `server/services/prompt-builder.ts:554, 558` — Layer 2c / 2d (Roaring · Dow Jones).
- `server/services/prompt-builder.ts:562, 582` — Layer 6 hardware HKP.
- `server/services/prompt-builder.ts:2` — imports `applyAntonBoosts`, `applyTokenBudget` from `atom-boost`.
- `server/services/knowledge-resolver.ts:6–12` — 5-mode comment block.
- `server/services/knowledge-resolver.ts:34–36` — `MAX_CONTEXT_TOKENS = 900_000` default.
- `server/services/knowledge-resolver.ts:77–94` — `resolveKnowledgeSources` signature + return shape.
- `server/services/knowledge-resolver.ts:108–120` — Mode 1 web-search tool injection.
- `server/services/unified-llm-client.ts:141–300` — `streamToResponse` (provider dispatch + SSE).
- `server/services/unified-llm-client.ts:148–164` — Anthropic short-circuit (preserves caching).
- `server/services/iterative-reasoning.ts` — IRE phase loop.
- `server/services/quality-ratchet.ts` — `scoreOutput` (fire-and-forget).
- `server/services/circuit-breaker.ts` — request-slot acquisition.
- `server/db/schema.sql` — `sessions`, `messages` tables; `revelation_chains`, `revelation_steps` from migrations.

## Open questions

- **Quality-ratchet schema** — fire-and-forget call writes to a quality table; the exact target is partial in the audit and will be confirmed in `26-cross-workflow-intelligence`.
- **Compaction trigger thresholds** — `buildCompactionConfig(selectedModel, 'interactive')` returns model-specific thresholds; not detailed here but covered in `13-multi-llm-routing`.
- **Workflow / Mission / Agent execution** — these wrap the same `streamToResponse` path with their own orchestration. Separate diagrams: `24-workflow-engine` covers Workflows; Missions and Agents inherit this lifecycle and aren't drawn separately.

## Related diagrams

- `11-seven-layer-prompt-builder` — pre-stream assembly detail.
- `12-knowledge-source-resolver` — knowledge-resolver decision tree.
- `13-multi-llm-routing` — provider selection + caching + fallback.
- `22-iterative-reasoning-engine` — what happens inside the IRE branch.
- `23-reasoning-trails` — what gets persisted for the audit trail.
