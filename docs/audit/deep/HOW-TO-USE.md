# Deep Investigation — How To Use

> **Audience:** ANTON contributors triaging the deep-investigation outputs in this directory.
> **Spec:** `ANTON_Improvement_Brief_Addendum_2_Deep_Investigation.md` §G.9–G.18 + §H.1–H.3.
> **TL;DR:** run `pnpm run anton:investigate-deep`, open `_priority-queue.md`, fix the top 3–5 findings, re-run.

---

## What this directory contains

```
docs/audit/deep/
├── _priority-queue.md           ← START HERE. Top 20 ranked actionable findings.
├── sensitive-flow.md            G.9  — PII / credential / regulated data leak candidates
├── contract-inference.md        G.10 — TypeScript return-type drift
├── db-access.md                 G.11 — schema fragility, N+1, missing LIMIT, pg-bypass
├── prompt-assembly.md           G.12 — (stub) 12-layer assembly correctness
├── llm-parity.md                G.13 — (stub) provider feature matrix
├── async-audit.md               G.14 — concurrency hazards (forgotten await, leaks)
├── error-paths.md               G.15 — silent catches, stack leakage
├── cost-economics.md            G.16 — unauthed LLM routes, missing spend caps
├── migration-history.md         G.17 — drops/renames with stale refs, sequence gaps
├── dead-code.md                 G.18 — unimported services, unused deps, unrendered components
└── proposals/                   per-finding fix proposals (created on demand)
```

Stubs (G.12 / G.13) print TODOs + manual quick-check commands; the rest produce real signal.

---

## The improvement loop

```
pnpm run anton:investigate-deep
            │
            ▼
   docs/audit/deep/_priority-queue.md
            │
            ▼
   Pick top 1–5 findings to ship this cycle
            │
            ▼
   For each:
     1. Read the cited file:line
     2. Decide the fix shape (single source vs N callsites)
     3. Make the change
     4. Re-run the relevant audit:
          bash scripts/audit/deep-<pattern>.sh
     5. Confirm finding cleared (grep the audit output)
            │
            ▼
   Re-run the full pipeline:  pnpm run anton:investigate-deep
            │
            ▼
   Queue regenerates with next priorities
```

This is the H.3 cycle from Addendum 2.

---

## How findings are scored (H.1)

```
score = severity × min(callsites, 50) × user_facing × regulated
  severity:        HIGH=3 | MEDIUM=2 | LOW=1
  callsites:       lines collapsed into this entry (capped at 50)
  user_facing:     ×2 if file is in
                     server/routes/, src/pages/, src/app/pages/,
                     src/features/, src/components/, App.tsx
  regulated:       ×3 if file path matches:
                     risk-atlas|sanctions|gdpr|evidence-pack|credential-vault|
                     audit|compliance|beneficial[-_]owner|
                     \b(fcp|aml|sar|str|cdd|edd|kyc)\b
```

**Dedup:** findings are grouped by `(audit, file, pattern)`. 22 lines of the
same pattern in the same file collapse into one queue entry with a
`callsites=22` annotation. Without dedup, a single noisy file would fill
the top 20 and obscure cross-file leverage.

**Spread (informational):** distinct files affected by the same `(audit, pattern)`
tuple. High spread = the pattern is endemic; consider a code-style rule or
a lint check.

---

## Picking what to fix this cycle

The queue ranks by score, but the score isn't everything. Use the
following rubric to pick from the top 20:

| Signal | Pick if … |
|---|---|
| **Single-source fix** | Top entry has high `callsites` and the underlying function lives in one place. Fix once, kill 22 findings. |
| **Mechanical class** | Same `pattern` appears across 3+ files (high `spread`). Apply the same diff template; helper extraction often makes sense. |
| **Regulated-product surface** | Anything tagged `regulated×3` in the score breakdown — these affect compliance/audit defensibility. |
| **Cost amplification** | G.16 unauthed-LLM routes — fix before any team-mode deployment. |
| **Pre-existing latent bug** | G.10 contract-inference HIGH (declared type lies about nullability). Often caught at runtime by a downstream caller crashing. |
| **Performance cliff** | G.11 N+1 in a route handler. One affected user → degraded latency for everyone. |

**Don't pick:**
- Audit-locked code (e.g., `risk-atlas/atlas-residual-calculator.ts` math casts) — leave with documented justification.
- Stubs (G.12 / G.13) — wait for the real implementation.
- Deferred-by-design patterns (e.g., school.ts `try { db.exec(ALTER) } catch {}` idempotent semi-migrations should be consolidated into a real migration, not papered over with `.catch()` calls).

---

## Common fix patterns (templates)

### Pattern A — Fire-and-forget audit log

**Symptom:** G.14 forgotten-await on a `logXxx()` / `recordXxx()` call.

**Fix:** make the helper return `void` (sync) but internally chain `.catch()`
on the async DB write. Callers don't change.

```typescript
// before
async function logChange(…): Promise<void> {
  await db.run('INSERT …', …);
}

// after
function logChange(…): void {
  db.run('INSERT …', …)
    .catch((err) => console.warn('[area] logChange failed (non-fatal):',
      err instanceof Error ? err.message : err));
}
```

Used at: `engagements.ts:logChange` (cleared 22 findings),
`connection-manager.ts:logAction` (cleared 4).

### Pattern B — `catch (e: any)` → `catch (e: unknown)` + `errMsg` helper

**Symptom:** G.15 `catch (e: any)` typing-debt; same file has `err.message`
in the catch body.

**Fix:** add a 4-line `errMsg(err: unknown): string` helper at the top
of the route file; bulk-replace catch declarations + body references.

```typescript
function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// before
} catch (err: any) {
  res.status(500).json({ error: err.message });
}

// after
} catch (err: unknown) {
  res.status(500).json({ error: errMsg(err) });
}
```

Used at: `discovery.ts` (16), `intelligence-dashboard.ts` (10),
`knowledge-graph.ts` (6).

### Pattern C — Sync function mistakenly declared `async`

**Symptom:** G.14 forgotten-await on a function whose body has no `await`.

**Fix:** drop the `async` keyword + return type `: void`.

```typescript
// before — causes 12 forgotten-await findings at callsites
async function sendEvent(data: Record<string, unknown>) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

// after — clears all 12
function sendEvent(data: Record<string, unknown>): void {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}
```

Used at: `gap-assessments.ts:sendEvent` (cleared 12).

### Pattern D — Typed `db.all<T>()` instead of `as T[]` cast

**Symptom:** G.10 `as` cast at return site of a `db.all(...)` / `db.get(...)`.

**Fix:** the `DatabaseAdapter` interface supports generics — pass the type
directly. Drop the `as` cast.

```typescript
// before
return await db.all('SELECT * FROM x') as KnowledgeCollection[];

// after
return await db.all<KnowledgeCollection>('SELECT * FROM x');
```

Used at: `collection-manager.ts` (4), `apprentice.ts` (2).

### Pattern E — Type predicate filter

**Symptom:** G.10 `.filter(Boolean) as T[]` at return.

**Fix:** type-predicate filter — TypeScript narrows the array element type.

```typescript
// before
return ids.map((id) => map.get(id)).filter(Boolean) as T[];

// after
return ids
  .map((id) => map.get(id))
  .filter((v): v is T => v !== undefined);
```

Used at: `personas-manager.ts:resolvePersonas`.

---

## When findings are false positives

The deep audits aim for high recall. False positives happen. When you
verify a finding is a false positive:

1. **Don't change the audit script unless the false-positive class is
   broad** (multiple files / patterns). One-off false positives stay in
   the queue with a `// audit:false-positive` comment in the code:

   ```typescript
   // audit:false-positive G.10 — Math.max() of Score1to5 union is provably
   // bounded; the cast is a safe annotation, not a type lie.
   return Math.max(a, b, c) as Score1to5;
   ```

2. **If broad,** open a follow-up to extend the audit — the previous
   reviews already caught + fixed:
   - `.then()` inside `Promise.all/allSettled/race/any` wrapper (G.14)
   - `setInterval` returned-handle / file-wide clear search (G.14)
   - `regulated×3` short-acronym `str` matching `Orche{str}ation` (H.1)

   See `memory/project_deep_investigation_v1.md` for the running list.

---

## Cadence (per Addendum 2)

| Pattern | Suggested cadence |
|---|---|
| `anton:investigate` (G.1–G.8 surface) | per-PR |
| `anton:investigate-deep` (G.9–G.18 + H.1) | weekly + pre-release |
| `anton:investigate-all` | mandatory pre-release |
| Per-pattern targeted re-runs | after fixing a finding from that pattern |

Add to your CI pipeline: a non-blocking weekly job that posts the
`_priority-queue.md` diff to a Slack channel / GitHub issue.

---

## Skipping a pattern

To run only one audit:

```bash
pnpm run anton:investigate-deep:migration   # G.17 only
pnpm run anton:investigate-deep:dead        # G.18 only
pnpm run anton:investigate-deep:error       # G.15 only
# Or directly:
bash scripts/audit/investigate-deep.sh --pattern <name>
# Valid: sensitive | contract | db | prompt | llm | async | error | cost | migration | dead
```

---

## Adding a new audit pattern

1. Create `scripts/audit/deep-<name>.sh` (real implementation: a thin
   wrapper around a `.ts` script using ts-morph).
2. Create `scripts/audit/deep-<name>.ts` if the audit needs AST analysis;
   otherwise the `.sh` can do the work directly.
3. Output to stdout in the standard format:
   - `# G.NN — <Pattern> (real)` heading
   - `## Severity rollup` table
   - `## HIGH / MEDIUM / LOW` sections, each with a `| File | Line | Pattern | Detail |`
     table (or use the code-block format with `## N. Section` headings — the
     H.1 parser handles both).
4. Add the pattern to the runner in `scripts/audit/investigate-deep.sh`
   (the `case "$PATTERN"` block + the `all` enumeration).
5. Add a metadata entry to `AUDIT_META` in `scripts/audit/deep-priority-queue.ts`.
6. Run end-to-end and verify findings appear in `_priority-queue.md`.

The existing audits (G.10, G.11, G.14, G.15, G.16, G.17, G.18, G.9) are
templates to copy.
