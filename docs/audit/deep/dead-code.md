# G.18 — Dead Code / Unreachable Code Audit

**Generated:** 2026-04-26 UTC
**Commit:** `0fabf7f`
**Pattern:** G.18

> **No automatic deletions.** Every finding is a candidate — humans decide.

## 1. Unimported service files

`.ts` files at the top level of `server/services/` that no other file in `server/` or `src/` imports.

*Caveat: re-exports through index.ts barrels can hide imports — verify before deleting.*

**Scanned:** 222 top-level service files. **Unimported candidates:** 33

Top-level service files with zero imports:
```
server/services/aap-transport-client.ts
server/services/aap-transport-server.ts
server/services/agent-connector-executor.ts
server/services/antonImport.ts
server/services/bing-search.ts
server/services/bundle-sharing-service.ts
server/services/capability-card-generator.ts
server/services/category-finance.ts
server/services/category-news.ts
server/services/category-travel.ts
server/services/civic-knowledge-pack.ts
server/services/cross-workflow-intelligence.ts
server/services/fc-budget-service.ts
server/services/fc-connection-service.ts
server/services/fc-gateway-service.ts
server/services/fc-marketplace-service.ts
server/services/fc-transaction-service.ts
server/services/fc-wallet-service.ts
server/services/knowledge-sharing-service.ts
server/services/market-business-model-similarity.ts
server/services/market-cross-metric-validator.ts
server/services/market-fundamental-analysis-service.ts
server/services/market-prediction-verifier.ts
server/services/market-why-chain-executor.ts
server/services/message-queue-service.ts
server/services/orchestrator-pattern-engine.ts
server/services/public-relay-client.ts
server/services/remote-agent-client.ts
server/services/smart-actions-analyzer.ts
server/services/structured-extraction-queue.ts
server/services/structured-message-handler.ts
server/services/task-auto-processor.ts
server/services/template-injector.ts
```

**Severity:** MEDIUM (likely dead, verify each).

## 2. Unrendered React components

`.tsx` components in `src/components/` whose name never appears as a JSX tag (`<Name`) in any other file.

*Caveat: dynamic imports + storybook-only components show as unrendered — verify.*

**Scanned:** 207 components. **Unrendered candidates:** 37

Components with no JSX usage:
```
src/components/deadlines/LabelManager.tsx (LabelManager)
src/components/exchange/ExportModuleModal.tsx (ExportModuleModal)
src/components/exchange/ImportModuleModal.tsx (ImportModuleModal)
src/components/layout/NavItemConfig.tsx (NAV_ITEMS_HIDDEN_KEY)
src/components/modules/DataManagement.tsx (DataManagement)
src/components/modules/DocumentCreation.tsx (DocumentCreation)
src/components/modules/EngagementProposal.tsx (EngagementProposal)
src/components/modules/GapAnalysis.tsx (GapAnalysis)
src/components/modules/InvestigationSupport.tsx (InvestigationSupport)
src/components/modules/ManagementPresentation.tsx (ManagementPresentation)
src/components/modules/ModelValidation.tsx (ModelValidation)
src/components/modules/RegulatoryMonitor.tsx (RegulatoryMonitor)
src/components/modules/RiskAssessment.tsx (RiskAssessment)
src/components/modules/SanctionsAdvisory.tsx (SanctionsAdvisory)
src/components/modules/TrainingContent.tsx (TrainingContent)
src/components/OrchestratorPhasePanel.tsx (OrchestratorPhasePanel)
src/components/platform/IdentityPanel.tsx (IdentityPanel)
src/components/review/ReviewPanel.tsx (ReviewPanel)
src/components/risk-atlas/GlossaryTooltip.tsx (GlossaryTooltip)
src/components/shared/AudienceAdaptButtons.tsx (AudienceAdaptButtons)
src/components/shared/BenchmarkDisplay.tsx (BenchmarkDisplay)
src/components/shared/ConnectorTemplatesBrowser.tsx (ConnectorTemplatesBrowser)
src/components/shared/ContextBudgetIndicator.tsx (ContextBudgetIndicator)
src/components/shared/ContextPanel.tsx (ContextPanel)
src/components/shared/ModelRecommendationBadge.tsx (ModelRecommendationBadge)
src/components/shared/OutputChainActions.tsx (OutputChainActions)
src/components/shared/ProjectContextBanner.tsx (ProjectContextBanner)
src/components/shared/SuggestionWidget.tsx (SuggestionWidget)
src/components/web-overlays/NotifPanel.tsx (NotifPanel)
src/components/web-overlays/ShortcutsOverlay.tsx (ShortcutsOverlay)
  ... + 7 more
```

**Severity:** LOW (might be admin-only or pending wiring; humans decide).

## 3. Unlinked routes

Backend routes in `server/routes/` whose URL never appears in frontend code (`src/`).

*Caveats:*
*- Routes are registered relative to their mount prefix (e.g. `router.get('/:id/documents')` mounted at `/api/engagements` becomes `/api/engagements/:id/documents`). This script doesn't reconstruct the full URL, so it overcounts.*
*- API-only routes (server-to-server, agent connectors, admin endpoints) are legitimately unlinked.*
*- Use this section as a starting set; real triage requires reading `server/index.ts` to map mount prefixes.*

**Routes scanned:** 781. **Unlinked candidates:** 556

Routes with no frontend reference:
```
/:id/changelog
/:id/client-intelligence
/:id/documents
/:id/documents/:docId/extract
/:id/execute
/:id/export
/:id/iterations
/:id/iterations/:itId
/:id/iterations/:itId/gap-analysis
/:id/peer-benchmarks
/:id/peer-benchmarks/:benchmarkId
/:id/peer-benchmarks/from-internal/:sourceId
/:id/peer-benchmarks/web-search
/:id/project
/:id/quality-gate/latest
/:id/quality-gate/run
/:id/rag-directory
/:id/rag-directory/reindex
/:id/resource-categories
/:id/resources
/:id/resources/:resId
/:id/scope-items
/:id/scope-items/:itemId
/:id/team
/:id/team/:memberId
/:id/team/extract
/:id/workstreams
/:id/workstreams/:wsId
/admin/budgets
/admin/users/:id
/admin/users/:id/budget
/admin/users/:id/reset-usage
/agents/:id
/agents/:id/activate
/agents/:id/connectors
/agents/:id/connectors/:connectorId
/agents/:id/connectors/:connectorId/test
/agents/:id/conversations
/agents/:id/pause
/agents/:id/query
  ... + 516 more
```

**Severity:** LOW (server-to-server routes, agent connectors, admin endpoints are legitimately unlinked).

## 4. Unused npm dependencies

Per `npx depcheck`. Each one is a real cost (bundle size, install time, security surface).

**Unused dependencies (reported by depcheck):**
```json
"dependencies":["@capacitor-mlkit/barcode-scanning",
  "@capacitor/android",
  "@capacitor/app",
  "@capacitor/network",
  "@capacitor/share",
  "@capacitor/splash-screen",
  "@capacitor/status-bar",
  "@opentelemetry/sdk-trace-node",
  "capacitor-secure-storage-plugin",
  "pino-pretty",
  "uuid"]
```

**Unused devDependencies:**
```json
"devDependencies":["@types/uuid",
  "cross-env",
  "eslint-config-prettier",
  "tailwindcss"]
```

**Severity:** HIGH (real cost — bundle size, security surface). Verify each isn't a peer-dep / runtime-only / dynamic require.

## 5. Lazy-loaded pages with no `<Route>` registered

`React.lazy(() => import('./pages/Foo'))` declarations whose component name never appears as a `<Route element={...}>` target.

**Lazy declarations scanned:** 268. **Unrouted candidates:** 0

✅ Every lazy import is registered as a Route.

---

## Summary

| Check | Count |
|---|---|
| Top-level services scanned | 222 |
| → unimported candidates | **33** |
| Components scanned | 207 |
| → unrendered candidates | **37** |
| Routes scanned | 781 |
| → unlinked candidates | **556** |
| Lazy imports scanned | 268 |
| → unrouted candidates | **0** |

**Cadence:** quarterly + pre-release + before any major refactor (per addendum §G.18).

**Acceptance:** every finding is a *candidate*, not an action. Each candidate gets a 'delete or document' decision before any code is removed.
