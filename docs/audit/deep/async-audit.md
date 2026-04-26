# G.14 — Async / Concurrency Audit (real)

**Generated:** 2026-04-26 UTC
**Commit:** `0fabf7f`
**Pattern:** G.14
**Scanned:** 1199 TS/TSX files (server/services/, server/routes/, src/)
**Findings:** 234

> JavaScript concurrency bugs are non-deterministic and hard to reproduce.
> HIGH = in route or critical-path service (orchestrator / prompt-builder / AAP / bundle / vault / agent).
> MEDIUM = elsewhere in services. LOW = performance-only (sequential awaits in service loops).

## Severity rollup

| Severity | Count |
|---|---|
| HIGH | 54 |
| MEDIUM | 30 |
| LOW | 150 |

## By pattern

| Pattern | Count |
|---|---|
| Sequential await in loop | 150 |
| Forgotten await | 52 |
| .then() without .catch() | 28 |
| Possibly leaked setInterval | 3 |
| Promise.all on fallible list | 1 |

## HIGH — route / critical-path findings

Async hazards in user-facing routes or core services. Highest investigation priority.

| File | Line | Pattern | Detail |
|---|---|---|---|
| `server/routes/app-gateway.ts` | 1610 | Possibly leaked setInterval | no matching clearInterval in enclosing scope or file |
| `server/routes/auth.ts` | 147 | Forgotten await | `acceptPendingInvitations(db, user.id as string, user.email as string)` |
| `server/routes/auth.ts` | 714 | Forgotten await | `acceptPendingInvitations(db, user.id as string, email)` |
| `server/routes/claude.ts` | 290 | .then() without .catch() | unhandled rejection if the promise rejects |
| `server/routes/school.ts` | 372 | Forgotten await | `checkAndAwardAchievements(db, userId, { session_count: 1, xp_level: 1,…` |
| `server/routes/school.ts` | 431 | Forgotten await | `updateWeeklySnapshot(db, userId, eventXp + streakXp)` |
| `server/routes/school.ts` | 432 | Forgotten await | `checkAndAwardAchievements(db, userId, { session_count: count, xp_level…` |
| `server/routes/task-agent.ts` | 884 | Forgotten await | `emitTaskAtoms(task, allOutputText, `All ${existingResults.length} step…` |
| `server/routes/task-agent.ts` | 934 | Forgotten await | `emitTaskAtoms(task, summary, 'Task marked complete', 0)` |
| `server/routes/task-agent.ts` | 1010 | Forgotten await | `emitTaskAtoms(task, allOutputText, `Backfill: ${results.length} steps`…` |
| `server/services/discovery-engine.ts` | 1413 | Forgotten await | `updateSessionState(sessionId, updatedState)` |
| `server/services/knowledge-graph.ts` | 156 | Forgotten await | `traverse(nextType, nextId, depth + 1)` |
| `server/services/knowledge-graph.ts` | 160 | Forgotten await | `traverse(entityType, entityId, 0)` |
| `server/services/orchestrator-demo.ts` | 242 | Forgotten await | `saveDemoState(db, state)` |
| `server/services/orchestrator-demo.ts` | 267 | Forgotten await | `saveDemoState(db, { mode: 'off', persona: 'meridian', activated_at: nu…` |
| `server/services/orchestrator-engine.ts` | 1373 | Forgotten await | `logTrailToAuditLog(trailId, db, { trigger_type: 'heartbeat', status, t…` |
| `server/services/output-store.ts` | 112 | Forgotten await | `queueSummaryGeneration(id, params.outputData)` |
| `server/services/pathfinder-engine.ts` | 822 | Forgotten await | `persistSearch(db, result, userId, threadId)` |
| `server/services/pathfinder-engine.ts` | 929 | Forgotten await | `persistSearch(db, result, userId, threadId)` |
| `server/services/pathfinder-engine.ts` | 1093 | Forgotten await | `persistSearch(db, result, userId, threadId)` |
| `server/services/pattern-scheduler.ts` | 62 | Forgotten await | `logDetectionRun({           run_time: new Date().toISOString(),     …` |
| `server/services/pattern-scheduler.ts` | 71 | Forgotten await | `logDetectionRun({           run_time: new Date().toISOString(),     …` |
| `server/services/pattern-scheduler.ts` | 136 | Forgotten await | `logDetectionRun({         run_time: new Date().toISOString(),       …` |
| `server/services/pattern-scheduler.ts` | 148 | Forgotten await | `logDetectionRun({         run_time: new Date().toISOString(),       …` |
| `server/services/scheduler.ts` | 22 | Forgotten await | `scheduleWorkflow(db, schedule)` |
| `server/services/time-intelligence.ts` | 321 | Forgotten await | `this.refreshStatuses()` |
| `server/services/workflow-executor.ts` | 69 | Forgotten await | `recordRun(db, runId, workflowId, scheduleId, 'failed', 'Workflow defin…` |
| `server/services/workflow-executor.ts` | 73 | Forgotten await | `recordRun(db, runId, workflowId, scheduleId, 'failed', 'Workflow defin…` |
| `server/services/workflow-executor.ts` | 79 | Forgotten await | `recordRun(db, runId, workflowId, scheduleId, 'running')` |
| `server/services/workflow-executor.ts` | 107 | Forgotten await | `updateRun(db, runId, 'awaiting_approval', `Paused at step ${stepIndex}…` |
| `server/services/workflow-executor.ts` | 198 | Forgotten await | `updateRun(db, runId, 'failed', `Step ${stepIndex} (${step.label || ste…` |
| `server/services/workflow-executor.ts` | 204 | Forgotten await | `updateRun(db, runId, 'completed')` |
| `server/services/workflow-executor.ts` | 208 | Forgotten await | `updateRun(db, runId, 'failed', msg)` |
| `src/hooks/useClaude.ts` | 285 | Forgotten await | `generateAndSaveTitle(activeSessionId, userMessage, responseText, model…` |
| `src/pages/EngagementListPage.tsx` | 136 | Forgotten await | `loadEngagements()` |
| `src/pages/InnovationRadarPage.tsx` | 240 | Forgotten await | `fetchData()` |
| `src/pages/InnovationRadarPage.tsx` | 332 | Forgotten await | `fetchData()` |
| `src/pages/InnovationRadarPage.tsx` | 338 | Forgotten await | `fetchData()` |
| `src/pages/IntelligenceDashboard.tsx` | 127 | Forgotten await | `loadDashboardData()` |
| `src/pages/KnowledgeGraphPage.tsx` | 54 | Forgotten await | `selectEntity(entities[0])` |
| `src/pages/KnowledgeGraphPage.tsx` | 97 | Forgotten await | `fetchTopEntities()` |
| `src/pages/KnowledgeGraphPage.tsx` | 98 | Forgotten await | `fetchMergeLog()` |
| `src/pages/KnowledgeGraphPage.tsx` | 132 | Forgotten await | `selectEntity(newEntity)` |
| `src/pages/RadarPage.tsx` | 203 | Forgotten await | `fetchData()` |
| `src/pages/RadarPage.tsx` | 314 | Forgotten await | `fetchData()` |
| `src/pages/RadarPage.tsx` | 342 | Forgotten await | `fetchData()` |
| `src/components/shared/OutputToolbar.tsx` | 195 | Forgotten await | `tryFetch(1)` |
| `src/features/compliance/ViolationsManager.tsx` | 84 | Forgotten await | `fetchViolations()` |
| `src/features/intelligence/InstitutionalMemoryTab.tsx` | 110 | Forgotten await | `loadMemoryData()` |
| `src/pages/school/GuardianDashboardPage.tsx` | 76 | Forgotten await | `loadDigest()` |
| `src/pages/school/SchoolCurriculumPage.tsx` | 113 | Forgotten await | `fetch(`/api/school/lessons${params}`)       .then(r => r.ok ? r.json(…` |
| `src/pages/school/SchoolDashboardPage.tsx` | 92 | Forgotten await | `loadLeaderboard((data.classes as { id: string }[])[0].id)` |
| `src/pages/school/SocraticExamPage.tsx` | 58 | Forgotten await | `sendToExaminer([], data)` |
| `src/pages/school/SubjectsPage.tsx` | 457 | Forgotten await | `loadClasses()` |

## MEDIUM — service-layer findings

| File | Line | Pattern | Detail |
|---|---|---|---|
| `server/services/atom-extractor.ts` | 269 | Promise.all on fallible list | one rejection kills the whole batch — consider Promise.allSettled |
| `src/pages/CodeReviewPage.tsx` | 97 | .then() without .catch() | unhandled rejection if the promise rejects |
| `src/pages/CounselsDesk.tsx` | 234 | .then() without .catch() | unhandled rejection if the promise rejects |
| `src/pages/DJScreeningPage.tsx` | 110 | .then() without .catch() | unhandled rejection if the promise rejects |
| `src/pages/DJScreeningPage.tsx` | 325 | .then() without .catch() | unhandled rejection if the promise rejects |
| `src/pages/GapAssessmentHub.tsx` | 120 | .then() without .catch() | unhandled rejection if the promise rejects |
| `src/pages/GapAssessmentHub.tsx` | 121 | .then() without .catch() | unhandled rejection if the promise rejects |
| `src/pages/GapAssessmentWizard.tsx` | 444 | .then() without .catch() | unhandled rejection if the promise rejects |
| `src/pages/ModulePage.tsx` | 337 | .then() without .catch() | unhandled rejection if the promise rejects |
| `src/pages/ModulePage.tsx` | 343 | .then() without .catch() | unhandled rejection if the promise rejects |
| `src/pages/ModulePage.tsx` | 349 | .then() without .catch() | unhandled rejection if the promise rejects |
| `src/pages/ModulePage.tsx` | 428 | .then() without .catch() | unhandled rejection if the promise rejects |
| `src/pages/OrchestratorDashboard.tsx` | 224 | Possibly leaked setInterval | no matching clearInterval in enclosing scope or file |
| `src/pages/OrchestratorDashboard.tsx` | 272 | Possibly leaked setInterval | no matching clearInterval in enclosing scope or file |
| `src/pages/PathfinderPage.tsx` | 345 | .then() without .catch() | unhandled rejection if the promise rejects |
| `src/pages/PresentationBuilderPage.tsx` | 336 | .then() without .catch() | unhandled rejection if the promise rejects |
| `src/pages/ScriptLitePage.tsx` | 191 | .then() without .catch() | unhandled rejection if the promise rejects |
| `src/pages/ScriptMediumPage.tsx` | 344 | .then() without .catch() | unhandled rejection if the promise rejects |
| `src/pages/VersionHistoryPage.tsx` | 78 | .then() without .catch() | unhandled rejection if the promise rejects |
| `src/components/hardware/PhotoModuleId.tsx` | 48 | .then() without .catch() | unhandled rejection if the promise rejects |
| `src/components/school/CodeSandbox.tsx` | 33 | .then() without .catch() | unhandled rejection if the promise rejects |
| `src/features/versions/VersionDiffViewer.tsx` | 309 | .then() without .catch() | unhandled rejection if the promise rejects |
| `src/pages/friends/FriendsHomePage.tsx` | 52 | .then() without .catch() | unhandled rejection if the promise rejects |
| `src/pages/futurechain/FCGatewayPage.tsx` | 87 | .then() without .catch() | unhandled rejection if the promise rejects |
| `src/pages/grow/GrowContactsPage.tsx` | 387 | .then() without .catch() | unhandled rejection if the promise rejects |
| `src/pages/grow/GrowOrganisationsPage.tsx` | 359 | .then() without .catch() | unhandled rejection if the promise rejects |
| `src/pages/jobs/CareerProfilePage.tsx` | 44 | .then() without .catch() | unhandled rejection if the promise rejects |
| `src/pages/school/SchoolCurriculumPage.tsx` | 113 | .then() without .catch() | unhandled rejection if the promise rejects |
| `src/pages/school/SchoolCurriculumPage.tsx` | 113 | .then() without .catch() | unhandled rejection if the promise rejects |
| `src/pages/school/TeacherStudentsPage.tsx` | 59 | .then() without .catch() | unhandled rejection if the promise rejects |

## LOW — performance opportunities

Sequential awaits in service loops. May be intentional (data dependencies) or could be parallelised. Verify.

| File | Line | Pattern | Detail |
|---|---|---|---|
| `server/services/aap-transport-client.ts` | 67 | Sequential await in loop | iterations may be independent — check if Promise.all would be safe |
| `server/services/anton-validator.ts` | 442 | Sequential await in loop | iterations may be independent — check if Promise.all would be safe |
| `server/services/anton-validator.ts` | 458 | Sequential await in loop | iterations may be independent — check if Promise.all would be safe |
| `server/services/atom-extractor.ts` | 206 | Sequential await in loop | iterations may be independent — check if Promise.all would be safe |
| `server/services/atom-extractor.ts` | 355 | Sequential await in loop | iterations may be independent — check if Promise.all would be safe |
| `server/services/atom-extractor.ts` | 433 | Sequential await in loop | iterations may be independent — check if Promise.all would be safe |
| `server/services/atom-extractor.ts` | 455 | Sequential await in loop | iterations may be independent — check if Promise.all would be safe |
| `server/services/audit-queue.ts` | 43 | Sequential await in loop | iterations may be independent — check if Promise.all would be safe |
| `server/services/civic-eligibility.ts` | 130 | Sequential await in loop | iterations may be independent — check if Promise.all would be safe |
| `server/services/civic-service.ts` | 305 | Sequential await in loop | iterations may be independent — check if Promise.all would be safe |
| `server/services/coding-review-engine.ts` | 135 | Sequential await in loop | iterations may be independent — check if Promise.all would be safe |
| `server/services/compliance-rules.ts` | 125 | Sequential await in loop | iterations may be independent — check if Promise.all would be safe |
| `server/services/compliance-rules.ts` | 350 | Sequential await in loop | iterations may be independent — check if Promise.all would be safe |
| `server/services/data-importer.ts` | 389 | Sequential await in loop | iterations may be independent — check if Promise.all would be safe |
| `server/services/dataset-store.ts` | 69 | Sequential await in loop | iterations may be independent — check if Promise.all would be safe |
| `server/services/delegation-compliance-service.ts` | 87 | Sequential await in loop | iterations may be independent — check if Promise.all would be safe |
| `server/services/document-indexer.ts` | 93 | Sequential await in loop | iterations may be independent — check if Promise.all would be safe |
| `server/services/document-indexer.ts` | 188 | Sequential await in loop | iterations may be independent — check if Promise.all would be safe |
| `server/services/embedding-pipeline.ts` | 90 | Sequential await in loop | iterations may be independent — check if Promise.all would be safe |
| `server/services/embedding-pipeline.ts` | 139 | Sequential await in loop | iterations may be independent — check if Promise.all would be safe |
| `server/services/gap-assessment-engine.ts` | 702 | Sequential await in loop | iterations may be independent — check if Promise.all would be safe |
| `server/services/knowledge-graph.ts` | 32 | Sequential await in loop | iterations may be independent — check if Promise.all would be safe |
| `server/services/knowledge-pack-service.ts` | 355 | Sequential await in loop | iterations may be independent — check if Promise.all would be safe |
| `server/services/knowledge-pack-service.ts` | 403 | Sequential await in loop | iterations may be independent — check if Promise.all would be safe |
| `server/services/knowledge-pack-service.ts` | 422 | Sequential await in loop | iterations may be independent — check if Promise.all would be safe |
| `server/services/knowledge-pack-service.ts` | 425 | Sequential await in loop | iterations may be independent — check if Promise.all would be safe |
| `server/services/knowledge-pack-service.ts` | 447 | Sequential await in loop | iterations may be independent — check if Promise.all would be safe |
| `server/services/knowledge-pack-service.ts` | 583 | Sequential await in loop | iterations may be independent — check if Promise.all would be safe |
| `server/services/knowledge-resolver.ts` | 48 | Sequential await in loop | iterations may be independent — check if Promise.all would be safe |
| `server/services/knowledge-resolver.ts` | 128 | Sequential await in loop | iterations may be independent — check if Promise.all would be safe |

*… + 120 more (truncated)*

## Top files by finding count

| File | Findings |
|---|---|
| `server/services/market-bundle-importer.ts` | 14 |
| `server/services/market-data-service.ts` | 14 |
| `server/services/market-workflow-orchestrator.ts` | 8 |
| `server/services/workflow-executor.ts` | 7 |
| `server/services/knowledge-pack-service.ts` | 6 |
| `server/services/atom-extractor.ts` | 5 |
| `server/services/pathfinder-engine.ts` | 5 |
| `server/services/risk-atlas/atlas-service.ts` | 5 |
| `server/services/knowledge-resolver.ts` | 4 |
| `server/services/market-index-rebalance-service.ts` | 4 |

---

**Cadence (per addendum §G.14):** weekly + per-PR on changed files; pre-release mandatory.

**Acceptance:**
- HIGH findings warrant a PR — either add the missing await / catch / clearInterval, or document why the bare call is safe.
- MEDIUM findings go to the H.1 priority queue for triage.
- LOW findings are perf opportunities; only worth fixing if the loop is a hot path.
