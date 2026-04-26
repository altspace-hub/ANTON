# ANTON — Improvement & Investigation Brief: Addendum 2

> **Audience:** Claude Code
> **Authored by:** Claude (strategic thinking partner) for Daniel Bardun
> **Date:** 26 April 2026
> **Type:** Deep code investigation patterns + improvement queue
> **Why an addendum:** the original brief and addendum 1 mostly cover *what to build next* and *narrative work*. The investigation patterns there (G.1–G.8) are surface-level — counts, file existence, grep hits. They tell you "this exists" but not "this is wrong." This file specifies **deep investigation** — semantic analysis, runtime tracing, data-flow analysis, contract inference, security depth — the kind that finds bugs, leaks, decay, and accidental complexity. **Read the original brief and addendum 1 first.** This one extends Part F (quality investigation) and Part G (investigation patterns), and adds a new Priority 5 of improvement work derived from deep investigation.

---

## What This Addendum Adds

| ID | Title | Type | What changes |
|---|---|---|---|
| G.9 | Data-flow analysis: where does sensitive data go? | Investigation pattern | new |
| G.10 | Contract inference: what each service actually returns | Investigation pattern | new |
| G.11 | Database access pattern audit | Investigation pattern | new |
| G.12 | Prompt assembly correctness audit | Investigation pattern | new |
| G.13 | LLM provider parity audit | Investigation pattern | new |
| G.14 | Async / concurrency audit | Investigation pattern | new |
| G.15 | Error path audit | Investigation pattern | new |
| G.16 | Cost & token economics audit | Investigation pattern | new |
| G.17 | Migration history audit | Investigation pattern | new |
| G.18 | Dead code / unreachable code audit | Investigation pattern | new |
| H.1 | Improvement queue derived from G.9–G.18 | Improvement protocol | new |
| H.2 | Continuous deep-investigation runner | Tooling | new |

These complement — they don't replace — the surface scans in G.1–G.8.

---

## Core Principle

A surface scan answers: **does it exist?**
A deep investigation answers: **does it work, is it safe, is it sustainable?**

Each pattern below is structured the same way:

1. **What it detects** — the question being answered
2. **Why it matters** — what kind of bug or decay it catches
3. **How to run** — the script or sequence (concrete commands, not "scan for issues")
4. **What the output looks like** — the file, the schema, the severity rules
5. **Acceptance criteria for findings** — what constitutes a real signal vs. noise
6. **When to run** — cadence

These all write outputs into `/docs/audit/deep/` to keep them separate from the surface scans in `/docs/audit/`.

---

## G.9 — Data-Flow Analysis: Sensitive Data Tracing

### What it detects

For every piece of sensitive data — API keys, user PII, document contents, credential vault entries, RBAC tokens, contact-hash bindings, attestations — traces the data from ingest to every place it lands. Detects:

- Sensitive data written to logs
- Sensitive data passed into LLM prompts without redaction
- Sensitive data exported into `.anton` bundles without consent
- Sensitive data transmitted over AAP without explicit user action
- Sensitive data stored in localStorage / IndexedDB / cookies on the frontend
- Cross-tenant leak risk: data fetched by one user surfacing in another's session

### Why it matters

For a regulated-industry product (FCP modules, AML, EU AI Act Annex III concerns in Talent Discovery), this is the highest-value audit category. A single grep miss here is what gets a regulator's attention. Surface scans in F.2 only catch hard-coded secrets; this catches data flowing through legitimate paths into illegitimate destinations.

### How to run

```bash
# Build the inventory of sensitive-data fields per table
# Read every CREATE TABLE in server/db/migrations-pg/ and flag columns matching:
#   pii: name, email, phone, address, dob, ssn, passport, national_id
#   credential: api_key, token, secret, password, refresh_token
#   identity: contact_hash, ed25519_pubkey, x25519_pubkey
#   protected: salary, salary_history, aspiration, mental_health, medical
#   regulated: customer_data, sar, str, bra, cdd, edd, beneficial_owner
#   bundle: bundle_payload, bundle_signature, attestation
mkdir -p docs/audit/deep
bash scripts/audit/sensitive-fields-inventory.sh > docs/audit/deep/sensitive-fields.md

# For each sensitive field, find every code reference
# (this is the deep step — not just "is this column queried" but "where does the value go")
bash scripts/audit/sensitive-flow-trace.sh > docs/audit/deep/sensitive-flow.md
```

The trace script for each sensitive column does:

```bash
column="api_key"
# Every service that reads this column
read_sites=$(grep -rln "$column\|${column//_/}" server/services/ --include="*.ts")
for site in $read_sites; do
  # What does this service return / log / send?
  echo "=== $site ==="
  # Logging
  grep -n "console\|logger\|log(" $site
  # LLM prompt assembly
  grep -n "messages.push\|system:\|user:" $site
  # Bundle building
  grep -n "anton-bundler\|bundleBuilder" $site
  # AAP / external transport
  grep -n "aap-rollout-bridge\|fetch\|axios" $site
  # Frontend transmission
  grep -n "res.json\|res.send" $site
done
```

### What the output looks like

`/docs/audit/deep/sensitive-flow.md` — for each sensitive column:

```
## customers.beneficial_owner_data

Read sites: 12 services
Write sites: 4 services

### Flow paths
- read by `customer-service.ts:142` → returned via `routes/customers.ts:88` → frontend ✅ expected
- read by `customer-service.ts:142` → passed into prompt-builder Layer 2c (Roaring) → LLM ⚠️ verify redaction
- read by `report-builder.ts:201` → embedded in PDF artifact → user download ✅ expected
- read by `cross-workflow-intelligence.ts:55` → written to `pattern_signals.value` ⚠️ verify hashing
- read by `bundle-export.ts:67` → embedded in `.anton evidence-pack` ⚠️ verify consent gate

### Findings
- HIGH: `cross-workflow-intelligence.ts:55` writes raw value to pattern_signals — should be hashed.
- MEDIUM: `bundle-export.ts:67` exports without checking `bundle_consent_log` first.
```

### Acceptance criteria for findings

- **HIGH:** sensitive data reaches a destination outside its scope (logs, third-party API, bundle without consent)
- **MEDIUM:** sensitive data passes through a derivation step without explicit redaction / hashing
- **LOW:** sensitive data has a long retention path that lacks an explicit TTL

A finding is "real" only if Claude Code can produce the file:line citation for both the read and the destination. Speculative findings (e.g. "this *could* leak") get no severity badge — they go in an "investigate further" appendix.

### When to run

- **Pre-release:** mandatory before any minor or major version bump
- **Quarterly:** scheduled
- **On-demand:** any time a new pillar ships

---

## G.10 — Contract Inference: What Services Actually Return

### What it detects

TypeScript types are aspirations, not contracts. A function declared to return `Promise<User>` might return `Promise<User | null>` in some branches and `Promise<{user: User, meta: Meta}>` in others, with the type assertion silently lying. This pattern infers the **actual shape** returned by every exported service function and flags divergence from the declared type.

Also catches:
- Functions whose declared return type is `any` (signal of skipped typing)
- Functions whose declared return type uses `as` casting at the return site (silently lied about)
- Functions whose body throws in branches not declared in the signature
- Functions whose error path returns `null` / `undefined` while the type claims non-nullable
- Routes whose response shape diverges from the service it calls

### Why it matters

ANTON has 221 services. Every drift between declared and actual behavior is a future bug. This pattern catches them before they ship — and gives Claude Code a candidate list for typed-contract enforcement.

### How to run

```bash
# Use ts-morph or the TypeScript Compiler API for real AST analysis
# (not regex — regex can't trace return-type inference reliably)

bash scripts/audit/contract-inference.sh > docs/audit/deep/contract-inference.md
```

The script (Node, using ts-morph):

```javascript
// scripts/audit/contract-inference.ts
import { Project, SyntaxKind } from "ts-morph";

const project = new Project({ tsConfigFilePath: "tsconfig.json" });
const findings = [];

for (const sf of project.getSourceFiles("server/services/**/*.ts")) {
  for (const fn of sf.getFunctions()) {
    if (!fn.isExported()) continue;
    const declared = fn.getReturnType().getText();
    const inferred = fn.getReturnType().getApparentType().getText();

    // Branches with explicit `as` casts at return site
    const casts = fn.getDescendantsOfKind(SyntaxKind.AsExpression)
      .filter(c => c.getParent().getKind() === SyntaxKind.ReturnStatement);

    // Returns of `null` / `undefined` when declared type is non-nullable
    const nullishReturns = fn.getDescendantsOfKind(SyntaxKind.ReturnStatement)
      .filter(r => /null|undefined/.test(r.getText()));

    // any in declared
    const isAny = declared.includes("any");

    if (isAny || casts.length > 0 || (nullishReturns.length > 0 && !declared.includes("null") && !declared.includes("undefined"))) {
      findings.push({
        file: sf.getFilePath(),
        function: fn.getName(),
        declared,
        inferred,
        anyTypes: isAny,
        castsAtReturn: casts.length,
        nullishReturns: nullishReturns.length,
      });
    }
  }
}

console.log(JSON.stringify(findings, null, 2));
```

### What the output looks like

`/docs/audit/deep/contract-inference.md` — ranked table:

```
| File | Function | Declared | Issue | Severity |
|---|---|---|---|---|
| services/orchestrator-engine.ts | applyAction | Promise<ActionResult> | 3 nullish returns, type doesn't allow null | HIGH |
| services/portal-service.ts | listMyPortals | Promise<Portal[]> | uses `as Portal[]` cast at return — likely the C.5 root cause | HIGH |
| services/agent-builder.ts | build | Promise<any> | declared any | MEDIUM |
| services/mission-runner.ts | run | Promise<MissionRun> | 2 nullish, 1 throw branch undeclared | MEDIUM |
```

### Acceptance criteria for findings

- **HIGH:** declared type lies about nullability in a function called by an HTTP route (causes runtime errors users see)
- **MEDIUM:** declared type uses `any` or has `as` cast at return (typing debt)
- **LOW:** declared type narrower than inferred (defensive over-typing — flag for review, not a bug)

### When to run

- **Per-PR:** on changed files (cheap, runs in seconds)
- **Weekly:** full sweep
- **Pre-release:** mandatory

---

## G.11 — Database Access Pattern Audit

### What it detects

For each service, audits how it accesses the database. Catches:

- **N+1 queries:** loops with sequential awaits to db.query
- **SELECT \*:** fetching all columns when only some are used
- **Unindexed columns in WHERE:** confirms each WHERE-clause column has an index in the migration
- **JOINs across migration boundaries:** queries that join tables added in different migrations without confirming the foreign key was added
- **Inconsistent transaction boundaries:** services that mutate multiple tables outside a transaction
- **Direct schema bypass:** services that talk to `pg` directly instead of through the established db helper
- **Stale schema references:** queries that reference columns that no longer exist (or were renamed in a later migration)
- **Missing `LIMIT` on user-facing queries:** unbounded result sets on routes
- **Race conditions:** read-then-write sequences without locking

### Why it matters

With 289 tables, 121 PostgreSQL migrations, and 221 services, the surface area for "two services that disagree about the schema" is huge. This pattern catches the disagreements before they cause production data issues.

### How to run

```bash
bash scripts/audit/db-access-patterns.sh > docs/audit/deep/db-access.md
```

The script does:

```bash
# 1. Build canonical column inventory from migrations (last-seen wins for renames/drops)
node scripts/audit/build-schema-inventory.js > /tmp/schema-inventory.json

# 2. For each service file, extract every SQL string (template literals, .query() calls)
for svc in $(find server/services -name "*.ts" -not -name "*.test.ts"); do
  # Use AST to find sql template-literal calls
  node scripts/audit/extract-sql.js "$svc"
done > /tmp/sql-sites.json

# 3. Cross-check each SQL site against schema inventory
node scripts/audit/check-sql-sites.js \
  --schema /tmp/schema-inventory.json \
  --sites /tmp/sql-sites.json \
  --output docs/audit/deep/db-access.md

# 4. Detect N+1 patterns via AST
node scripts/audit/detect-n-plus-one.js >> docs/audit/deep/db-access.md
```

### What the output looks like

`/docs/audit/deep/db-access.md`:

```
## Schema drift findings

### customer-service.ts:142
SELECT customer_legal_name, beneficial_owner_data FROM customers WHERE id = $1
- ❌ `customer_legal_name` does not exist (renamed to `legal_name` in migration 089)
- LAST SEEN in migration 067; RENAMED in 089

### portal-service.ts:88
SELECT * FROM portals WHERE owner_id = $1
- ⚠️ SELECT * (consider explicit columns)
- ✅ owner_id indexed (idx_portals_owner_id from migration 145)
- ⚠️ no LIMIT — route /portals/mine could return unbounded rows

## N+1 candidates

### mission-runner.ts:201
for (const step of steps) {
  await db.query(`SELECT ... FROM mission_steps WHERE id = $1`, [step.id]);
}
- HIGH: N+1 over potentially-large mission_steps; replace with WHERE id = ANY($1)

## Transaction boundary issues

### grow-sync.ts:55
db.query("UPDATE grow_signals ...");
db.query("INSERT INTO grow_interactions ...");
- MEDIUM: two writes without BEGIN/COMMIT — risk of partial state

## Direct pg bypass

### legacy-importer.ts
imports from 'pg' directly — should use server/db/index.ts helper
- LOW: technical debt, not a correctness bug
```

### Acceptance criteria for findings

- **HIGH:** schema drift (column doesn't exist), N+1 on user-facing route, missing transaction on multi-table write
- **MEDIUM:** SELECT \*, missing LIMIT on user-facing route, missing index on hot WHERE column
- **LOW:** direct pg bypass, defensive over-querying

### When to run

- **Per-migration:** mandatory — every new migration triggers a full re-audit
- **Weekly:** scheduled
- **Pre-release:** mandatory

---

## G.12 — Prompt Assembly Correctness Audit

### What it detects

The seven-layer (effectively twelve-layer) prompt builder is the heart of ANTON. A bug here doesn't crash anything — it just makes ANTON worse. This audit catches:

- **Layer omissions:** modules that skip the org_context (Layer 2a) or knowledge_pack (Layer 2b) without explicit opt-out
- **Layer order violations:** assemblies that put module-expertise before area-context
- **Token budget overruns:** assemblies that emit prompts > MAX_CONTEXT_TOKENS without compaction
- **Missing transparency layer (Layer 7):** prompts shipped to LLM without the reasoning-trail config injected
- **Sub-layer leakage:** Roaring (2c) entity data in non-FCP-area prompts (cross-tenant leak surface)
- **Persona/skill double-injection:** the same persona appearing in both Layer 4 and Layer 5 by accident
- **Knowledge-pack hallucination:** prompts that reference a knowledge pack that doesn't exist on disk
- **System-foundation drift:** modules that override the system foundation (Layer 1) silently
- **Prompt caching mis-key:** cache keys that don't include all variant inputs (cache hits returning wrong content)

### Why it matters

This is the audit that protects ANTON's signature differentiator. A subtle bug in prompt assembly produces correct-looking but wrong outputs — the worst kind of bug because users don't notice for months. With 263 modules, 59 areas, and Roaring/Dow Jones sub-layers, the assembly matrix is huge.

### How to run

```bash
bash scripts/audit/prompt-assembly-audit.sh > docs/audit/deep/prompt-assembly.md
```

The script does:

```bash
# 1. Inventory layer-injection sites in prompt-builder.ts
node scripts/audit/extract-prompt-layers.js > /tmp/layer-sites.json

# 2. For every module, simulate prompt assembly with a synthetic input
# (no LLM call — just run the assembly path and snapshot the prompt structure)
for area in $(ls server/areas); do
  for module in $(ls server/areas/$area/modules 2>/dev/null); do
    node scripts/audit/simulate-assembly.js --area "$area" --module "$module" \
      --output "/tmp/assembly/$area-$module.json"
  done
done

# 3. Verify each assembly:
#    - all required layers present
#    - layer order correct
#    - token budget respected
#    - sub-layers gated correctly (Roaring only in FCP scope)
node scripts/audit/verify-assemblies.js \
  --assemblies /tmp/assembly/ \
  --output docs/audit/deep/prompt-assembly.md
```

### What the output looks like

```
## Layer omission findings

### area: school, module: math-tutor-grade-3
- Layer 7 (transparency) missing — reasoning trails won't be emitted
- Confirmed at: simulate-assembly output line 88

### area: fcp, module: bra-builder
- Layer 2c (Roaring) missing — expected for FCP-scope module
- Likely cause: roaring-injector.ts gated by area_id check that excludes fcp/bra-builder

## Sub-layer leakage findings

### area: marketing, module: campaign-planner
- Layer 2d (Dow Jones screening) injected — leakage from FCP sub-layer
- HIGH: cross-area leak; campaign-planner has no need for sanctions data

## Token budget findings

### area: legal, module: contract-analyzer
- Assembled prompt: 1,140,000 tokens
- MAX_CONTEXT_TOKENS: 900,000
- Compaction not triggered — overflows

## Cache key findings

### prompt-cache-service.ts:88
- Cache key includes (area, module, persona) but not (knowledge_pack_version)
- HIGH: stale cache hits when knowledge pack updates
```

### Acceptance criteria for findings

- **HIGH:** layer omitted that the module declares it requires; sub-layer leakage across areas; token overrun without compaction; cache key incomplete
- **MEDIUM:** layer-order violation; persona double-injection
- **LOW:** declarative drift between module manifest and assembly

### When to run

- **Per-module ship:** mandatory — every new module triggers a re-audit
- **Weekly:** scheduled
- **Pre-release:** mandatory
- **After any prompt-builder change:** mandatory

---

## G.13 — LLM Provider Parity Audit

### What it detects

ANTON supports six LLM providers: Anthropic direct, Azure OpenAI, OpenAI direct, Mistral direct, Google Gemini, Local Ollama. Each adapter has its own quirks. This pattern verifies parity:

- **Feature support matrix:** does each adapter handle streaming, tool use, prompt caching, structured outputs, vision, long-context, system messages?
- **Token-counting parity:** do all adapters report token usage, and is it normalized to a single shape?
- **Error-shape parity:** do all adapters surface errors in a uniform contract?
- **Retry policy parity:** do all adapters retry with the same backoff strategy?
- **Beta-flag tracking:** does Sonnet 4.5 long-context beta flag still gate correctly? Does compact-2026-01-12 header still apply on Opus 4.7 paths?
- **Model-version drift:** do `claude-opus-4-7`, `claude-sonnet-4-6`, `claude-haiku-4-5-20251001` references match the latest available models?
- **Cost-per-token consistency:** is the cost-tracking layer reading the right rate per provider/model?

### Why it matters

When adapters drift, users on different providers get subtly different behavior. A user who tests on Opus and deploys on Mistral may discover six months later that tool calls were silently dropped in Mistral. With Mistral as a strategic partnership target and Azure OpenAI marketed as a first-class provider, parity is a credibility issue.

### How to run

```bash
bash scripts/audit/llm-provider-parity.sh > docs/audit/deep/llm-parity.md
```

The script:

```bash
# Build the feature matrix
node scripts/audit/build-llm-feature-matrix.js > /tmp/llm-features.json

# For each feature, scan each adapter for support evidence
for adapter in $(ls server/services/adapters/*.ts); do
  for feature in streaming tool_use prompt_caching structured_outputs vision long_context system_messages cost_tracking retry_policy; do
    node scripts/audit/check-feature-support.js --adapter "$adapter" --feature "$feature"
  done
done > /tmp/llm-support.json

# Diff against declared support
node scripts/audit/diff-llm-support.js \
  --features /tmp/llm-features.json \
  --support /tmp/llm-support.json \
  --output docs/audit/deep/llm-parity.md

# Verify model strings against current Anthropic / Azure / OpenAI / Mistral catalogues
# (this requires a live check — Claude Code surfaces it; doesn't auto-decide)
node scripts/audit/check-model-versions.js >> docs/audit/deep/llm-parity.md
```

### What the output looks like

```
## Feature parity matrix

| Feature | Anthropic | Azure OpenAI | OpenAI | Mistral | Gemini | Ollama |
|---|---|---|---|---|---|---|
| Streaming | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Tool use | ✅ | ✅ | ✅ | 🟢 partial | ✅ | ❌ |
| Prompt caching | ✅ | ❌ | ❌ | ❌ | ❌ | n/a |
| Long context (1M) | ✅ Opus 4.7 / Sonnet 4.6 | ❌ | ❌ | ❌ | 🟢 1M experimental | n/a |
| Cost tracking | ✅ | ✅ | ✅ | 🟢 partial | ❌ | n/a |

## Findings

### Mistral tool_use partial
- mistral-adapter.ts:88 sends tools but doesn't parse tool_calls from response
- Result: tool-using modules silently degrade on Mistral
- HIGH: violates parity claim in unified-llm-client docstring

### Gemini cost tracking missing
- gemini-adapter.ts has no cost-per-token recording
- Result: cost dashboard underreports for Gemini users
- MEDIUM

### Model version drift
- anthropic-adapter.ts references "claude-opus-4-6" as default fallback
- Current preferred default: claude-opus-4-7
- LOW: works, but stale
```

### Acceptance criteria for findings

- **HIGH:** declared feature not actually working (silent degradation)
- **MEDIUM:** feature works but observability missing (cost tracking, error reporting)
- **LOW:** stale model strings, deprecated model references

### When to run

- **Monthly:** scheduled
- **Pre-release:** mandatory
- **After any adapter change:** mandatory

---

## G.14 — Async / Concurrency Audit

### What it detects

JavaScript concurrency bugs are the worst kind of bug — non-deterministic, hard to reproduce, often invisible in dev. This pattern catches:

- **Promise.all on a list that should be Promise.allSettled:** one rejection killing the whole batch
- **Forgotten await:** function-call results that should be awaited but aren't (the function returns a Promise that gets dropped)
- **Sequential awaits in a loop where parallel would be safe:** performance bug, opportunity for Promise.all
- **Race conditions in set/setState patterns:** state updates that read stale data
- **Unhandled promise rejections:** await without try/catch on a function that can throw
- **Lock-free critical sections:** read-then-write in a service that handles concurrent users without a lock
- **Setinterval / setTimeout leaks:** timers that aren't cleared on shutdown
- **WebSocket / event listener leaks:** subscriptions not cleaned up on connection close
- **Async function called as sync:** returns Promise that's used as if it were a value

### Why it matters

With Companion App Gateway sustaining persistent WebSockets, AAP bridge maintaining peer connections, the workflow engine running scheduled jobs, and the IRE running multi-step deliberations, concurrency surface area is large. A race condition in any of these is a bug waiting to be reported by a user once and never reproduced.

### How to run

```bash
bash scripts/audit/async-audit.sh > docs/audit/deep/async-audit.md
```

The script uses ts-morph to find:

```javascript
// scripts/audit/async-audit.ts
import { Project, SyntaxKind } from "ts-morph";

const project = new Project({ tsConfigFilePath: "tsconfig.json" });
const findings = [];

for (const sf of project.getSourceFiles(["server/**/*.ts", "src/**/*.ts", "src/**/*.tsx"])) {
  // Pattern 1: Promise.all on user-data lists
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const text = call.getText();
    if (text.startsWith("Promise.all(")) {
      // Heuristic: if any .map inside has an HTTP call or db query, suggest allSettled
      if (/\.map\(.*(?:fetch|query|axios|invoke)/.test(text)) {
        findings.push({ file: sf.getFilePath(), line: call.getStartLineNumber(), pattern: "Promise.all on fallible list", severity: "MEDIUM" });
      }
    }
  }

  // Pattern 2: forgotten await on call to async function
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const sym = call.getExpression().getSymbol();
    if (!sym) continue;
    const decls = sym.getDeclarations();
    for (const d of decls) {
      const isAsync = d.getText().includes("async ") || /Promise</.test(d.getText());
      if (!isAsync) continue;
      const parent = call.getParent();
      const grandparent = parent?.getParent();
      const isAwaited = parent?.getKind() === SyntaxKind.AwaitExpression;
      const isReturned = grandparent?.getKind() === SyntaxKind.ReturnStatement;
      const isAssigned = parent?.getKind() === SyntaxKind.VariableDeclaration;
      const isThenable = call.getText().includes(".then(");
      if (!isAwaited && !isReturned && !isAssigned && !isThenable) {
        findings.push({ file: sf.getFilePath(), line: call.getStartLineNumber(), pattern: "Forgotten await", severity: "HIGH" });
      }
    }
  }

  // Pattern 3: sequential awaits in loop
  for (const loop of sf.getDescendantsOfKind(SyntaxKind.ForOfStatement).concat(sf.getDescendantsOfKind(SyntaxKind.ForStatement))) {
    const awaits = loop.getDescendantsOfKind(SyntaxKind.AwaitExpression);
    if (awaits.length === 1) {
      // Check whether the awaited call has dependencies on prior iterations
      // (simple heuristic — independent calls go to LOW severity)
      findings.push({ file: sf.getFilePath(), line: loop.getStartLineNumber(), pattern: "Sequential await in loop", severity: "LOW" });
    }
  }

  // Pattern 4: setInterval / setTimeout without clear
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const fn = call.getExpression().getText();
    if (fn === "setInterval" || fn === "setTimeout") {
      const block = call.getFirstAncestorByKind(SyntaxKind.Block);
      const hasClear = block?.getText().includes(`clear${fn === "setInterval" ? "Interval" : "Timeout"}`);
      if (!hasClear) {
        findings.push({ file: sf.getFilePath(), line: call.getStartLineNumber(), pattern: `Possibly leaked ${fn}`, severity: "MEDIUM" });
      }
    }
  }
}

console.log(JSON.stringify(findings, null, 2));
```

### What the output looks like

```
## Forgotten await (HIGH)

### server/services/orchestrator-engine.ts:201
emitTrail(reason); // emitTrail returns Promise — not awaited
- Result: trail emission may not complete before caller returns

### src/pages/MissionsCatalogPage.tsx:88
loadMissions(); // returns Promise<Mission[]> — result discarded

## Promise.all on fallible list (MEDIUM)

### server/services/aap-rollout-bridge.ts:120
await Promise.all(peers.map(p => sendBundle(p, bundle)));
- One peer failure kills delivery to all peers; use allSettled

## Possibly leaked setInterval (MEDIUM)

### server/services/companion-app-gateway.ts:55
setInterval(heartbeat, 30000) without matching clearInterval on connection close
```

### Acceptance criteria for findings

- **HIGH:** forgotten await, race condition in user-facing flow
- **MEDIUM:** Promise.all where allSettled is correct, leaked timer in long-running service
- **LOW:** sequential await in loop where parallel is safe (perf, not correctness)

### When to run

- **Weekly:** scheduled (cheap, runs in seconds)
- **Per-PR:** on changed files
- **Pre-release:** mandatory

---

## G.15 — Error Path Audit

### What it detects

The happy path is tested. The error path is where bugs hide. This pattern audits:

- **Catch blocks that swallow errors silently:** `catch {}` or `catch (e) {}` with no log, no rethrow
- **Catch blocks that lose stack trace:** `throw new Error(e.message)` without `cause`
- **Routes without error middleware:** Express routes that don't have a `.catch(next)` or async wrapper
- **try/finally without catch:** common pattern that masks errors
- **Generic `catch (e)` typed as any:** error narrowing skipped
- **HTTP error responses that leak internal info:** stack traces returned to client
- **HTTP error responses that don't follow a uniform error contract:** different error shapes from different routes
- **Compensating action missing:** a rollback path missing for a partial-success operation
- **User-facing error messages that are technical / unhelpful:** "Internal Server Error" without context

### Why it matters

For an open-source product where contributors will find issues, error-path quality determines whether issues are reproducible and fixable. For an enterprise product where regulators audit, error handling is a compliance question. With 151 routes and 221 services, drift here is inevitable without periodic audit.

### How to run

```bash
bash scripts/audit/error-path-audit.sh > docs/audit/deep/error-paths.md
```

The script:

```bash
# Pattern 1: silent catch
grep -rn "catch\s*([^)]*)\s*{\s*}" server/ src/ --include="*.ts" --include="*.tsx" \
  | grep -v node_modules > /tmp/silent-catch.txt

# Pattern 2: catch without log or rethrow (more nuanced — needs AST)
node scripts/audit/find-silent-error-handling.js > /tmp/silent-handling.json

# Pattern 3: routes missing async error middleware
for route in $(find server/routes -name "*.ts"); do
  # Routes that use `async (req, res)` without `.catch(next)` and without try/catch
  node scripts/audit/check-route-error-handling.js "$route"
done > /tmp/route-errors.json

# Pattern 4: HTTP responses that leak stack traces
grep -rn "stack\|err\.stack" server/routes/ --include="*.ts"
grep -rn "res\.json(.*err)\|res\.send(.*err)" server/routes/ --include="*.ts"

# Pattern 5: missing compensating actions
node scripts/audit/find-compensation-gaps.js > /tmp/compensation-gaps.json

# Aggregate
node scripts/audit/aggregate-error-findings.js > docs/audit/deep/error-paths.md
```

### What the output looks like

```
## Silent catch (HIGH)

### server/services/bundle-export.ts:144
} catch {}
- No log, no rethrow — failures invisible

### server/services/agent-connector-executor.ts:88
} catch (e) {}
- Untyped error, no log

## Routes leaking internal info (HIGH)

### server/routes/portals.ts:142
res.status(500).json({ error: err.stack });
- Stack trace returned to client — potential info disclosure

## Routes without error middleware (MEDIUM)

### server/routes/missions.ts:55
router.post('/missions', async (req, res) => { ... });
- async route without try/catch or .catch(next) — unhandled rejection

## Missing compensating action (MEDIUM)

### server/services/mission-runner.ts:201
- Creates mission row, then provisions service pack, then binds credentials
- If credential binding fails, mission row + provisioned pack remain
- Suggest: wrap in transaction or implement explicit rollback
```

### Acceptance criteria for findings

- **HIGH:** silent error in critical path (orchestrator, prompt-builder, bundle-export, AAP transport); stack-trace leakage to client; unhandled rejection on user-facing route
- **MEDIUM:** silent error in non-critical path; missing compensation in multi-step write; non-uniform error contract
- **LOW:** generic `catch (e)` typed as `any`

### When to run

- **Weekly:** scheduled
- **Pre-release:** mandatory

---

## G.16 — Cost & Token Economics Audit

### What it detects

ANTON is model-agnostic with a 12-layer prompt builder, prompt caching on the Anthropic path, IRE iterations up to 25 deep, workflow engines that run loops, and Companion App push that makes calls cheap to trigger. Cost can spiral. This pattern audits:

- **Per-route cost projection:** for each user-facing route, what's the typical token spend? What's the worst-case?
- **Cache hit rate:** for the Anthropic path, what's the cache-hit rate per area / module? Cold-cache routes are first targets for caching investment.
- **Re-invocation patterns:** services that call the LLM multiple times where one call would do (often hidden in IRE depth + workflow loops)
- **Knowledge-pack ballooning:** prompt-builder Layer 6 adding 200KB knowledge packs to every assembly when only 5KB is relevant
- **Cost-tier mismatches:** routine work going to Opus 4.7 when Haiku would suffice; high-stakes work going to Haiku when Opus is warranted
- **Free-tier exposure:** routes that any visitor (not authenticated) can hit that trigger LLM calls
- **Mission cost ceilings:** Missions that auto-execute (Phase 3/4 Orchestrator) without per-day spend caps
- **Workflow recursion:** workflows that schedule themselves without termination guards

### Why it matters

For a self-hostable open-source product, cost is the most common reason adopters churn. For Daniel's enterprise prospects, predictable cost is a procurement question. A single missing cap on Phase 4 Autonomous mission auto-execution is "your AI agent burned $50,000 in one weekend." This audit prevents that.

### How to run

```bash
bash scripts/audit/cost-economics.sh > docs/audit/deep/cost-economics.md
```

The script:

```bash
# Build per-route LLM call inventory
node scripts/audit/inventory-llm-calls-per-route.js > /tmp/llm-calls-per-route.json

# Project costs (using rate cards from cost-tracking-service.ts)
node scripts/audit/project-route-costs.js \
  --calls /tmp/llm-calls-per-route.json \
  --rates server/services/cost-tracking-service.ts \
  --output docs/audit/deep/cost-economics.md

# Cache hit rate (requires runtime data — pull from prompt_cache_log if it exists)
psql -c "SELECT area_id, COUNT(*) FILTER (WHERE cache_hit) * 100.0 / COUNT(*) AS hit_rate FROM prompt_cache_log GROUP BY area_id ORDER BY hit_rate ASC LIMIT 20;" \
  >> docs/audit/deep/cost-economics.md

# Routes without auth gating that trigger LLM calls
for route in $(find server/routes -name "*.ts"); do
  has_auth=$(grep -l "requireAuth\|authMiddleware" "$route")
  has_llm=$(grep -l "unifiedLlmClient\|invokeLLM\|claudeClient" "$route")
  if [ -z "$has_auth" ] && [ -n "$has_llm" ]; then
    echo "UNAUTHED LLM ROUTE: $route"
  fi
done >> docs/audit/deep/cost-economics.md

# Mission auto-execution without spend caps
grep -rn "auto_execute\|autoExecute\|orchestrator_phase" server/services/missions/ \
  | grep -v "spend_cap\|spendCap\|max_cost\|maxCost" \
  >> docs/audit/deep/cost-economics.md
```

### What the output looks like

```
## Per-route cost projection

| Route | Avg tokens | Worst-case | Avg $/req | Worst-case $/req | Notes |
|---|---|---|---|---|---|
| /risk-atlas/run-stage-3 | 32,000 | 180,000 | $0.48 | $2.70 | Compaction triggered at >150k |
| /missions/run | 18,000 | 420,000 | $0.27 | $6.30 | IRE depth-25 ceiling, no per-call cap |
| /pathfinder/query | 8,000 | 24,000 | $0.12 | $0.36 | OK |

## Cache hit rate (last 7 days)

| Area | Hit rate | Action |
|---|---|---|
| school | 12% | Knowledge packs vary per student — caching limited; expected |
| fcp | 78% | Good |
| markets | 23% | Investigate — high spend, low hits |

## Unauthed LLM routes

### routes/portals-public.ts:88
- Unauthenticated route invokes LLM for portal preview
- HIGH: cost amplification surface for abuse

## Missions without spend cap

### missions/auto-execute.ts:142
- Phase 4 Autonomous missions execute without max-cost-per-day enforcement
- HIGH: ship spend-cap before any user reaches Phase 4 (links to C.1)
```

### Acceptance criteria for findings

- **HIGH:** unauthed LLM-invoking route, autonomous mission without spend cap, IRE without iteration ceiling
- **MEDIUM:** cold-cache hot path (high spend, low cache hit), tier mismatch (Opus where Haiku is enough)
- **LOW:** knowledge-pack size optimization opportunities

### When to run

- **Monthly:** scheduled
- **Pre-release:** mandatory
- **After any new auto-execution feature:** mandatory

---

## G.17 — Migration History Audit

### What it detects

121 migrations over the lifetime of the project means migration debt accumulates. This pattern audits:

- **Reversible vs irreversible migrations:** which migrations have a corresponding `down`? (For SQL migrations, do they include rollback SQL?)
- **Migrations that drop columns / tables:** are those columns referenced anywhere in code? (Dead-write detection)
- **Migrations that rename columns:** were all references updated? Are there services still using the old name?
- **Migrations that change column types:** was the data migrated correctly? Are there casts in code that assume the old type?
- **Index efficacy:** are added indexes actually used? (Pull from `pg_stat_user_indexes` if production data accessible.)
- **Constraint additions on populated tables:** did the migration backfill or just add the constraint?
- **Migration file naming consistency:** all migrations follow `NNN_description.sql`?
- **Out-of-order migration numbers:** any gaps or duplicates in the sequence?

### Why it matters

A migration applied incorrectly is the worst kind of bug because the data is already in production. This pattern catches the classes of mistake that aren't visible until someone tries to roll back, restore, or query against an old assumption.

### How to run

```bash
bash scripts/audit/migration-history.sh > docs/audit/deep/migration-history.md
```

The script:

```bash
# Inventory all migrations
ls server/db/migrations-pg/*.sql | sort > /tmp/migration-files.txt

# Check naming consistency
awk -F'/' '{print $NF}' /tmp/migration-files.txt | grep -vE "^[0-9]{3}_[a-z0-9_]+\.sql$"

# Check sequence gaps
seq=$(awk -F'/' '{print $NF}' /tmp/migration-files.txt | cut -c1-3 | sort -n | uniq -d)
echo "Duplicate numbers: $seq"

# Find DROPs and check references
for mig in $(grep -l "DROP COLUMN\|DROP TABLE" server/db/migrations-pg/*.sql); do
  table_col=$(grep "DROP COLUMN\|DROP TABLE" "$mig" | sed 's/.*DROP \(COLUMN\|TABLE\)//;s/[ ;]//g')
  refs=$(grep -rln "$table_col" server/services/ src/ 2>/dev/null | wc -l)
  echo "$mig drops $table_col — $refs references in code"
done

# Find renames and check old-name references
for mig in $(grep -l "RENAME" server/db/migrations-pg/*.sql); do
  old=$(grep "RENAME" "$mig" | sed 's/.*RENAME[^ ]* \(TO\|COLUMN\) //;s/ TO .*//')
  refs=$(grep -rln "$old" server/services/ src/ 2>/dev/null | wc -l)
  echo "$mig renames $old — $refs old-name references remain"
done

# Find type changes and check casts
grep -l "ALTER COLUMN.*TYPE\|ALTER COLUMN.*USING" server/db/migrations-pg/*.sql

# Index efficacy (requires production access)
# psql -c "SELECT schemaname, tablename, indexname, idx_scan FROM pg_stat_user_indexes WHERE idx_scan = 0 ORDER BY tablename;"
```

### What the output looks like

```
## Drop-then-still-referenced

### 089_rename_customer_legal_name.sql
DROPs `customer_legal_name`
References in code: 3
- server/services/customer-service.ts:142
- server/services/legacy-importer.ts:88
- server/db/views/customer_summary.sql:12

## Rename-then-old-name-still-used

### 117_rename_grow_signal_source.sql
RENAMES `signal_source` → `signal_origin`
Old-name references: 5

## Migrations without rollback SQL

| Migration | Has -- DOWN section | Severity |
|---|---|---|
| 089_rename_customer_legal_name.sql | No | MEDIUM |
| 145_create_portal_tables.sql | No | LOW (additive) |

## Sequence gaps

- Numbers 094, 095 missing between 093 and 096

## Unused indexes (production data)

- idx_pattern_signals_legacy on pattern_signals(legacy_id) — 0 scans in 90 days — drop candidate
```

### Acceptance criteria for findings

- **HIGH:** dropped column/table still referenced in code; renamed column with stale references in non-test code
- **MEDIUM:** type change without explicit cast review; missing rollback on destructive migration
- **LOW:** naming inconsistency; sequence gaps; unused indexes

### When to run

- **Per-migration:** mandatory
- **Quarterly:** full sweep
- **Pre-release:** mandatory

---

## G.18 — Dead Code / Unreachable Code Audit

### What it detects

ANTON has grown fast. Code accumulates. This pattern finds:

- **Unimported modules:** `.ts` files that no other file imports
- **Unexported-but-private code:** functions / classes / constants that are exported but never imported externally
- **Unused dependencies:** packages in `package.json` not referenced in any source file
- **Unreachable code paths:** functions whose call sites are all themselves dead
- **Feature-flag-gated code with permanently-false flags:** dead branches that look live
- **Components imported but never rendered:** React components imported but no JSX usage
- **Routes registered but never linked:** routes the frontend has no link to
- **Migrations that create tables never queried:** dead schemas
- **Bundle types in the union but never built:** the `BundleType` union has 45 entries — are all 45 actually constructed somewhere?

### Why it matters

The audit on 26 April found 263 modules vs. memory's 240, 221 services, 251 frontend pages. Some fraction of that growth is dead code. Dead code is misleading (gives false sense of capability), risky (untested paths can be reactivated by accident), and expensive (compile time, bundle size, audit surface). This pattern flags the candidates without auto-deleting — humans decide.

### How to run

```bash
bash scripts/audit/dead-code.sh > docs/audit/deep/dead-code.md
```

The script:

```bash
# Pattern 1: unimported modules
node scripts/audit/find-unimported.js > /tmp/unimported.json

# Use ts-prune or knip if available; otherwise:
# For each .ts file, check if any other file imports it
for f in $(find server/ src/ -name "*.ts" -not -name "*.test.ts" -not -name "*.d.ts"); do
  base=$(basename "$f" .ts)
  refs=$(grep -rln "from.*$base[\"']\|from.*$base$" server/ src/ --include="*.ts" --include="*.tsx" | grep -v "$f" | wc -l)
  if [ "$refs" = "0" ]; then
    echo "Unimported: $f"
  fi
done

# Pattern 2: unused dependencies (use depcheck or knip)
npx depcheck --json > /tmp/depcheck.json

# Pattern 3: unrendered components
for cmp in $(find src/components -name "*.tsx" -not -name "*.test.tsx"); do
  name=$(grep -E "^(export default|export function|export const)" "$cmp" | head -1 | sed 's/.*\(function\|const\) //;s/[ (=].*//')
  refs=$(grep -rln "<$name[ />]" src/ --include="*.tsx" | grep -v "$cmp" | wc -l)
  if [ "$refs" = "0" ]; then
    echo "Unrendered component: $cmp ($name)"
  fi
done

# Pattern 4: routes never linked from frontend
for route in $(grep -h "router\.\(get\|post\|put\|delete\)" server/routes/*.ts | sed "s/.*['\"]//;s/['\"].*//" | sort -u); do
  refs=$(grep -rln "$route" src/ --include="*.ts" --include="*.tsx" | wc -l)
  if [ "$refs" = "0" ]; then
    echo "Unlinked route: $route"
  fi
done

# Pattern 5: bundle types in union but never built
union_types=$(node -e "/* parse anton-bundler.ts to extract union */")
for type in $union_types; do
  refs=$(grep -rln "type:\s*['\"]$type['\"]" server/ --include="*.ts" | wc -l)
  if [ "$refs" = "0" ]; then
    echo "Unbuilt bundle type: $type"
  fi
done

# Pattern 6: migrations creating tables never queried
for table in $(grep -h "CREATE TABLE" server/db/migrations-pg/*.sql | sed 's/.*CREATE TABLE[^a-z_]*//;s/[ (].*//' | sort -u); do
  refs=$(grep -rln "FROM $table\|UPDATE $table\|INSERT INTO $table\|DELETE FROM $table" server/ --include="*.ts" | wc -l)
  if [ "$refs" = "0" ]; then
    echo "Unqueried table: $table"
  fi
done
```

### What the output looks like

```
## Unimported services (28)

| File | Last modified | Last referenced (any) |
|---|---|---|
| server/services/legacy-prompt-shaper.ts | 2025-11-12 | 2025-12-04 |
| server/services/old-portal-builder.ts | 2026-01-08 | 2026-01-15 |
...

## Unused dependencies (4)

- @types/react-helmet — no helmet usage in src/
- styled-components — no styled-components imports
- moment — replaced by date-fns; references remain only in node_modules
- mongoose — never used (Mongo not adopted)

## Unrendered components (12)

- src/components/legacy/LegacySidebar.tsx
- src/components/portal/old/PortalCardV1.tsx
...

## Unlinked routes (8)

- GET /api/legacy/customers — no frontend link
- POST /api/admin/sync-mongo — no frontend link, dependency on mongoose

## Unbuilt bundle types (3)

- legacy-skill-pack — declared in union, never constructed
- experimental-anton-template — declared but unbuilt
- migration-bridge — declared but unbuilt

## Unqueried tables (5)

- legacy_user_preferences — created in migration 023, never queried since
- experimental_pattern_seeds — created in migration 098, never queried
```

### Acceptance criteria for findings

- **No automatic deletions.** Every finding is a candidate.
- **HIGH:** unused dependency (real cost — bundle size, security surface)
- **MEDIUM:** unimported service file > 90 days old (likely dead)
- **LOW:** unrendered component, unlinked route (might be admin-only or pending wiring)

Each finding includes a "delete or document" suggestion per the H.4 rule from the original brief.

### When to run

- **Quarterly:** scheduled
- **Pre-release:** mandatory
- **Before any major refactor:** mandatory

---

## H.1 — Improvement Queue Derived from Deep Investigation

This section gives Claude Code a protocol for turning audit findings into improvement work, automatically.

### The protocol

1. Run `pnpm run anton:investigate-deep` (Part H.2) — produces all 10 audit outputs.
2. Aggregate all `HIGH` findings across all audits into a single ranked list.
3. Score each finding by:
   - **Severity:** HIGH = 3, MEDIUM = 2, LOW = 1
   - **Blast radius:** count of files / services / routes affected (1–N)
   - **User-facing:** does this affect a user-visible flow? (Yes = 2x multiplier)
   - **Regulated:** does this affect a compliance / audit / regulator-relevant path? (Yes = 3x multiplier)
4. Output the top 10 as `/docs/audit/deep/_priority-queue.md`.
5. For each top-10 item, Claude Code drafts a short fix proposal (file:line, description, proposed change, test plan) into `/docs/audit/deep/proposals/`.
6. Daniel reviews the proposals, picks N to ship, and Claude Code executes those.

This makes the deep investigation output **actionable** rather than just informational. Without this step, a 200-finding audit becomes paralysis. With it, the platform improves by N concrete fixes per cycle, derived from real signal.

### Acceptance criteria

- After running deep investigation, `_priority-queue.md` exists and ranks at least the top 20 findings
- Top 10 each have a proposal in `/docs/audit/deep/proposals/`
- Each proposal cites file:line for both the problem and the proposed fix
- Each proposal includes a test plan (how would we know the fix worked?)

---

## H.2 — Continuous Deep-Investigation Runner

The original brief had `pnpm run anton:investigate` for surface scans. This addendum adds `pnpm run anton:investigate-deep` for the deeper analyses.

### The runner

`scripts/audit/investigate-deep.sh`:

```bash
#!/usr/bin/env bash
set -e
mkdir -p docs/audit/deep
echo "Running data-flow analysis..."
bash scripts/audit/sensitive-flow-trace.sh > docs/audit/deep/sensitive-flow.md

echo "Running contract inference..."
node scripts/audit/contract-inference.ts > docs/audit/deep/contract-inference.md

echo "Running database access audit..."
bash scripts/audit/db-access-patterns.sh > docs/audit/deep/db-access.md

echo "Running prompt assembly audit..."
bash scripts/audit/prompt-assembly-audit.sh > docs/audit/deep/prompt-assembly.md

echo "Running LLM provider parity audit..."
bash scripts/audit/llm-provider-parity.sh > docs/audit/deep/llm-parity.md

echo "Running async / concurrency audit..."
node scripts/audit/async-audit.ts > docs/audit/deep/async-audit.md

echo "Running error path audit..."
bash scripts/audit/error-path-audit.sh > docs/audit/deep/error-paths.md

echo "Running cost & token economics audit..."
bash scripts/audit/cost-economics.sh > docs/audit/deep/cost-economics.md

echo "Running migration history audit..."
bash scripts/audit/migration-history.sh > docs/audit/deep/migration-history.md

echo "Running dead code audit..."
bash scripts/audit/dead-code.sh > docs/audit/deep/dead-code.md

echo "Building improvement queue..."
node scripts/audit/build-priority-queue.ts > docs/audit/deep/_priority-queue.md

echo "Drafting top-10 proposals..."
node scripts/audit/draft-proposals.ts > /tmp/proposals.txt

echo "Done. See docs/audit/deep/ for outputs."
```

Add to `package.json`:

```json
"scripts": {
  "anton:investigate": "bash scripts/audit/investigate.sh",
  "anton:investigate-deep": "bash scripts/audit/investigate-deep.sh",
  "anton:investigate-all": "pnpm run anton:investigate && pnpm run anton:investigate-deep"
}
```

### Cadence

- **Per-PR:** `anton:investigate` (cheap, surface scans)
- **Weekly:** `anton:investigate-deep` (more expensive, but produces actionable queue)
- **Pre-release:** `anton:investigate-all` (full sweep, mandatory)

---

## H.3 — Investigation-Driven Improvement Cycle

The cycle that ties this all together:

```
Run anton:investigate-deep
  ↓
Read _priority-queue.md (top 20)
  ↓
Read top-10 proposals
  ↓
Daniel selects N items to ship (typically 3–5)
  ↓
Claude Code executes selected items in dedicated PRs
  ↓
Each PR links back to the proposal, includes the test plan
  ↓
After ship, re-run relevant audit pattern to confirm finding cleared
  ↓
If cleared, mark proposal as "shipped, verified"; if not, the fix didn't work
  ↓
Cycle resets monthly, quarterly, or per-release
```

This is the **engine** that lets ANTON improve continuously without each improvement requiring a hand-written brief.

---

## Z. Acceptance-Criteria Update (replacing previous Z)

The original brief + addendum 1 + addendum 2 together are acceptable when:

1. **Surface investigation runner deployed** (G.1–G.8). ✅ from addendum 1 acceptance
2. **Deep investigation runner deployed** (G.9–G.18). New requirement.
3. **`anton:investigate-all` runs cleanly end-to-end** and produces all outputs in `docs/audit/` and `docs/audit/deep/`.
4. **Priority queue + top-10 proposals exist** after first deep run.
5. **At least 5 deep-investigation findings shipped** as fixes. These come from the proposals — not from this brief directly. The brief specifies *how to find them*; the audit specifies *what to fix*.
6. **All previous acceptance criteria** from original brief and addendum 1 still hold.

The original Priority 1–4 work + addendum 1 work + this addendum's investigation outputs together give Daniel a closed-loop improvement system. Once running, ANTON improves itself in measurable steps every cycle.

---

## Sequencing Recommendation Update

The recommended sequence after addendum 1's update was:

1. C.4 (warm-up — workflow registry)
2. C.5 (bug fix — portals/mine)
3. C.3 (UX cleanup — AppMode promotion)
4. D.5 (Portals elevation)
5. D.6 (Missions elevation)
6. C.1 (Orchestrator gating — needs decision)
7. C.2 (Reasoning Trails viewer)
8. D.7, E.6 (Specialized Agents docs, Beehive completion)
9. Remaining D, E items
10. F surface audits

Addendum 2 inserts at two points:

- **Between step 1 and step 2:** ship `anton:investigate-deep` runner with stub scripts that just `echo "TODO"` initially. The runner discipline matters more than the script depth at this stage.
- **Between step 5 and step 6:** run `anton:investigate-deep` for real (with one or two patterns implemented), produce first priority queue, ship the top 3–5 fixes before tackling the bigger C.1 / C.2 work. This is the validation that the engine works on real ANTON code before being relied on to drive bigger decisions.

Then continue the original sequence.

---

## Closing Note: The Strategic Frame

The original brief asked: *what do we ship next?*
Addendum 1 asked: *what do we narrate next?*
Addendum 2 asks: *what's wrong with what we already have, and how do we keep finding out?*

Together these three documents form ANTON's improvement system. The first directs forward motion; the second ensures the motion is visible; the third ensures the motion is sustainable.

For an open-source product, this matters more than for a closed product. Contributors will read the audit outputs and pick fixes. Enterprise prospects will ask for the audit reports. Regulators will want to see the migration history audit. The investigation system isn't internal hygiene — it's a **public artefact** that demonstrates how seriously the platform takes its own quality.

When `pnpm run anton:investigate-all` produces a clean report on every release, that's a credibility wedge competitors don't have.

---

**End of Addendum 2.**
