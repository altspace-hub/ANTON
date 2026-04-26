# Priority Queue (H.1)

**Generated:** 2026-04-26 UTC
**Commit:** `0fabf7f`
**Aggregates:** 10 audits in `docs/audit/deep/`

Scoring formula (per Addendum 2 §H.1, with dedup applied):

```
Findings are deduplicated by (audit, file, pattern) — many lines of
the same pattern in the same file collapse into ONE queue entry
with a callsite count.

score = severity × min(callsites, 50) × user_facing × regulated
  severity:        HIGH=3 | MEDIUM=2 | LOW=1
  callsites:       lines collapsed into this entry (capped at 50)
  user_facing:     ×2 if server/routes/, src/pages/, src/app/pages/, src/features/, src/components/, App.tsx
  regulated:       ×3 if risk-atlas|fcp|aml|sanctions|gdpr|evidence-pack|credential-vault|audit|compliance|kyc
  spread (informational): distinct files affected by this (audit, pattern) tuple
```

## Audit status

| Pattern | Status | HIGH | MEDIUM | LOW |
|---|---|---|---|---|
| G.10 Contract inference | real | 0 | 13 | 0 |
| G.11 DB access patterns | real | 60 | 60 | 2 |
| G.12 Prompt assembly | STUB | 0 | 0 | 0 |
| G.13 LLM provider parity | STUB | 0 | 0 | 0 |
| G.14 Async / concurrency | real | 54 | 30 | 30 |
| G.15 Error paths | real | 0 | 60 | 11 |
| G.16 Cost & token economics | real | 22 | 1 | 0 |
| G.17 Migration history | real | 0 | 0 | 0 |
| G.18 Dead code | real | 0 | 0 | 0 |
| G.9 Sensitive data flow | real | 3 | 7 | 0 |
| **TOTAL** | — | **139** | **171** | **43** |

## Top 20 ranked findings (deduplicated)

| Rank | Score | Audit | Severity | File | Callsites | First line | Pattern | Detail | Score breakdown |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 44 | G.15 Error paths | 🟡 MEDIUM | `server/routes/school.ts` | **11×** | 399 | Silent catches | } catch {} | sev=2 · callsites=11 · spread=19 · userFacing×2 |
| 2 | 36 | G.15 Error paths | 🟡 MEDIUM | `server/db/init.ts` | **18×** | 143 | Silent catches | } catch (e) { | sev=2 · callsites=18 · spread=19 |
| 3 | 32 | G.11 DB access patterns | 🟡 MEDIUM | `server/services/market-bundle-importer.ts` | **16×** | 45 | N+1 query candidate | loop body contains `await db.<method>(…)` — seq… | sev=2 · callsites=16 · spread=31 |
| 4 | 24 | G.14 Async / concurrency | 🔴 HIGH | `src/pages/KnowledgeGraphPage.tsx` | **4×** | 54 | Forgotten await | `selectEntity(entities[0])` | sev=3 · callsites=4 · spread=27 · userFacing×2 |
| 5 | 24 | G.11 DB access patterns | 🔴 HIGH | `server/routes/alignment-reviewer.ts` | **4×** | 22 | Missing LIMIT on user-facing query | `db.all(SELECT …)` without LIMIT — unbounded re… | sev=3 · callsites=4 · spread=25 · userFacing×2 |
| 6 | 24 | G.11 DB access patterns | 🔴 HIGH | `server/routes/community.ts` | **4×** | 192 | N+1 query candidate | loop body contains `await db.<method>(…)` — seq… | sev=3 · callsites=4 · spread=31 · userFacing×2 |
| 7 | 24 | G.11 DB access patterns | 🔴 HIGH | `server/routes/markets.ts` | **4×** | 72 | N+1 query candidate | loop body contains `await db.<method>(…)` — seq… | sev=3 · callsites=4 · spread=31 · userFacing×2 |
| 8 | 21 | G.14 Async / concurrency | 🔴 HIGH | `server/services/workflow-executor.ts` | **7×** | 69 | Forgotten await | `recordRun(db, runId, workflowId, scheduleId, '… | sev=3 · callsites=7 · spread=27 |
| 9 | 20 | G.15 Error paths | 🟡 MEDIUM | `src/pages/AppGatewayPage.tsx` | **5×** | 479 | Silent catches | try { setIntents(await api.get(`/orgs/${orgId}/… | sev=2 · callsites=5 · spread=19 · userFacing×2 |
| 10 | 18 | G.14 Async / concurrency | 🔴 HIGH | `server/routes/school.ts` | **3×** | 372 | Forgotten await | `checkAndAwardAchievements(db, userId, { sessio… | sev=3 · callsites=3 · spread=27 · userFacing×2 |
| 11 | 18 | G.14 Async / concurrency | 🔴 HIGH | `server/routes/task-agent.ts` | **3×** | 884 | Forgotten await | `emitTaskAtoms(task, allOutputText, `All ${exis… | sev=3 · callsites=3 · spread=27 · userFacing×2 |
| 12 | 18 | G.14 Async / concurrency | 🔴 HIGH | `src/pages/InnovationRadarPage.tsx` | **3×** | 240 | Forgotten await | `fetchData()` | sev=3 · callsites=3 · spread=27 · userFacing×2 |
| 13 | 18 | G.14 Async / concurrency | 🔴 HIGH | `src/pages/RadarPage.tsx` | **3×** | 203 | Forgotten await | `fetchData()` | sev=3 · callsites=3 · spread=27 · userFacing×2 |
| 14 | 18 | G.14 Async / concurrency | 🔴 HIGH | `src/features/compliance/ViolationsManager.tsx` | 1 | 84 | Forgotten await | `fetchViolations()` | sev=3 · callsites=1 · spread=27 · userFacing×2 · regulated×3 |
| 15 | 18 | G.11 DB access patterns | 🔴 HIGH | `server/routes/compliance-policy.ts` | 1 | 35 | Missing LIMIT on user-facing query | `db.all(SELECT …)` without LIMIT — unbounded re… | sev=3 · callsites=1 · spread=25 · userFacing×2 · regulated×3 |
| 16 | 18 | G.11 DB access patterns | 🔴 HIGH | `server/routes/custom-modules.ts` | **3×** | 64 | Missing LIMIT on user-facing query | `db.all(SELECT …)` without LIMIT — unbounded re… | sev=3 · callsites=3 · spread=25 · userFacing×2 |
| 17 | 18 | G.11 DB access patterns | 🔴 HIGH | `server/routes/finance.ts` | **3×** | 65 | Missing LIMIT on user-facing query | `db.all(SELECT …)` without LIMIT — unbounded re… | sev=3 · callsites=3 · spread=25 · userFacing×2 |
| 18 | 18 | G.11 DB access patterns | 🔴 HIGH | `server/routes/friends.ts` | **3×** | 65 | Missing LIMIT on user-facing query | `db.all(SELECT …)` without LIMIT — unbounded re… | sev=3 · callsites=3 · spread=25 · userFacing×2 |
| 19 | 18 | G.11 DB access patterns | 🔴 HIGH | `server/routes/gap-assessments.ts` | **3×** | 239 | Missing LIMIT on user-facing query | `db.all(SELECT …)` without LIMIT — unbounded re… | sev=3 · callsites=3 · spread=25 · userFacing×2 |
| 20 | 18 | G.11 DB access patterns | 🔴 HIGH | `server/routes/jobs.ts` | **3×** | 108 | Missing LIMIT on user-facing query | `db.all(SELECT …)` without LIMIT — unbounded re… | sev=3 · callsites=3 · spread=25 · userFacing×2 |

## Files with most findings (across all audits)

| File | Total findings | Score sum |
|---|---|---|
| `server/routes/school.ts` | 15 | 66 |
| `server/routes/alignment-reviewer.ts` | 7 | 42 |
| `server/db/init.ts` | 18 | 36 |
| `server/routes/markets.ts` | 6 | 36 |
| `server/services/market-bundle-importer.ts` | 16 | 32 |
| `server/routes/finance.ts` | 5 | 30 |
| `server/routes/gap-assessments.ts` | 5 | 30 |
| `src/pages/KnowledgeGraphPage.tsx` | 4 | 24 |
| `server/routes/community.ts` | 4 | 24 |
| `server/routes/custom-modules.ts` | 4 | 24 |
| `server/routes/lore-ledger.ts` | 4 | 24 |
| `server/routes/instruction-builder.ts` | 4 | 24 |
| `server/services/workflow-executor.ts` | 8 | 22 |
| `server/routes/auth.ts` | 4 | 22 |
| `src/pages/AppGatewayPage.tsx` | 5 | 20 |

## Findings by pattern

| Audit · Pattern | Count |
|---|---|
| G.11 DB access patterns — N+1 query candidate | 31 |
| G.14 Async / concurrency — Forgotten await | 27 |
| G.11 DB access patterns — Missing LIMIT on user-facing query | 25 |
| G.14 Async / concurrency — .then() without .catch() | 22 |
| G.16 Cost & token economics — Unauthed route invokes LLM | 22 |
| G.15 Error paths — Silent catches | 19 |
| G.14 Async / concurrency — Sequential await in loop | 17 |
| G.15 Error paths — `catch (e: any)` — type narrowing skipped | 7 |
| G.9 Sensitive data flow — Sensitive value in log (pii) | 3 |
| G.9 Sensitive data flow — Sensitive value in HTTP response (credential) | 2 |
| G.14 Async / concurrency — Possibly leaked setInterval | 2 |
| G.11 DB access patterns — Direct pg / sqlite import bypass | 2 |
| G.10 Contract inference — createComplianceRulesService | 1 |
| G.10 Contract inference — calculateInherent | 1 |
| G.9 Sensitive data flow — Sensitive value in HTTP response (pii) | 1 |
| G.9 Sensitive data flow — Sensitive value in LLM call (pii) | 1 |
| G.14 Async / concurrency — Promise.all on fallible list | 1 |
| G.10 Contract inference — createBundleSharingService | 1 |
| G.10 Contract inference — queryCollection | 1 |
| G.10 Contract inference — generatePptx | 1 |

---

## How to use this queue

1. **Triage top-N by score.** The top 20 are the highest-leverage fixes (severity × blast × user-facing × regulated).
2. **Pick 3-5 to ship per cycle.** Each fix gets a PR linked to a proposal in `docs/audit/deep/proposals/<finding-id>.md`.
3. **After the fix lands, re-run the relevant audit** to confirm the finding cleared.
4. **Re-run this queue weekly** to surface drift.

Per Addendum 2 §H.3 — this is the engine that turns deep-audit findings into continuous improvement work.
