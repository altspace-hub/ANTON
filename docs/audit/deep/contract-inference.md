# G.10 — Contract Inference (real)

**Generated:** 2026-04-26 UTC
**Commit:** `0fabf7f`
**Pattern:** G.10
**Scanned:** 529 TS files (server/services/, server/routes/) — exported callables only
**Findings:** 13

> Each finding is a candidate for typed-contract enforcement. HIGH = declared type lies (runtime-visible bug surface). MEDIUM = `any` or `as` cast (typing debt). LOW = none currently surfaced.

## Severity rollup

| Severity | Count |
|---|---|
| HIGH | 0 |
| MEDIUM | 13 |
| LOW | 0 |

## MEDIUM — typing debt

Functions declared with `any` in the return type, or returns that use `as` casts (silently coercing to a different type than the body actually produces).

| File | Line | Function | Declared | Issue |
|---|---|---|---|---|
| `server/services/bundle-sharing-service.ts` | 3 | `createBundleSharingService` | `Promise<{ pushBundle: (bundleType: string, contactHash: s…` | declared `any` — type erased |
| `server/services/chroma-client.ts` | 121 | `queryCollection` | `Promise<{ ids: string[][]; documents: string[][]; metadatas: Record<string, a…` | 'as' cast at return site (`results as any`) |
| `server/services/compliance-rules.ts` | 45 | `createComplianceRulesService` | `Promise<{ getAllRules: (category?: string | undefined) =>…` | declared `any` — type erased |
| `server/services/export-pptx.ts` | 376 | `generatePptx` | `Promise<Buffer<ArrayBufferLike>>` | 'as' cast at return site (`output as Buffer`) |
| `server/services/graph-analytics.ts` | 24 | `createGraphAnalytics` | `Promise<{ calculateDegreeCentrality: (limit?: number) => …` | declared `any` — type erased |
| `server/services/institutional-memory.ts` | 12 | `createInstitutionalMemory` | `Promise<{ saveCheckpointDecision: (params: { executionId:…` | declared `any` — type erased |
| `server/services/knowledge-graph.ts` | 14 | `createKnowledgeGraph` | `Promise<{ buildGraph: (options?: { minAtomCount?: number …` | declared `any` — type erased |
| `server/services/model-adapter.ts` | 567 | `createModelAdapter` | `BaseAdapter` | 'as' cast at return site (`new AzureOpenAIAdapter(azureConfig) as unknown as BaseAda…`) |
| `server/services/orchestrator-demo.ts` | 164 | `getDemoState` | `Promise<DemoState>` | 'as' cast at return site (`parsed as DemoState`) |
| `server/services/pattern-detection.ts` | 3 | `createPatternDetection` | `Promise<{ detectTemporalCorrelation: (windowHours?: numbe…` | declared `any` — type erased |
| `server/services/pattern-scheduler.ts` | 18 | `createPatternScheduler` | `Promise<{ start: (userConfig?: Partial<import("C:/ANTON_P…` | declared `any` — type erased |
| `server/services/quality-ratchet.ts` | 38 | `createQualityRatchet` | `Promise<{ scoreOutput: (params: { content: string; module…` | declared `any` — type erased |
| `server/services/risk-atlas/atlas-residual-calculator.ts` | 50 | `calculateInherent` | `Score1to5` | 'as' cast at return site (`Math.max(exposure, threat, vulnerability) as Score1to5`) |

## Top files by finding count

| File | Findings |
|---|---|
| `server/services/bundle-sharing-service.ts` | 1 |
| `server/services/chroma-client.ts` | 1 |
| `server/services/compliance-rules.ts` | 1 |
| `server/services/export-pptx.ts` | 1 |
| `server/services/graph-analytics.ts` | 1 |
| `server/services/institutional-memory.ts` | 1 |
| `server/services/knowledge-graph.ts` | 1 |
| `server/services/model-adapter.ts` | 1 |
| `server/services/orchestrator-demo.ts` | 1 |
| `server/services/pattern-detection.ts` | 1 |

---

**Cadence (per addendum §G.10):** per-PR on changed files; weekly full sweep; pre-release mandatory.

**Acceptance:** every HIGH finding warrants a PR — either narrow the function body to never return null/undefined OR widen the declared type to allow it. MEDIUM findings are typing-debt candidates for the H.1 priority queue.
