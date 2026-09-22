# Security CVE Triage — Runtime Dependencies

**Task:** #50 (pre-launch security item)
**Date:** 2026-06-11
**Scope:** `pnpm audit --prod --audit-level=high` (runtime/production deps only) for the
root workspace (`openexpert`) and the workspace-excluded relay (`relay/`).
**Owner of changes:** `package.json` (root + relay), `pnpm-lock.yaml` files,
`.github/workflows/ci.yml` + `security.yml` audit gate. No app/server source touched.

---

## Summary

| | Root | Relay |
|---|---|---|
| **Before** | `pnpm audit --prod --audit-level=high` → **exit 1** (24 high/critical advisories across 13 modules) | exit **0** (already clean) |
| **After** | **exit 0** (21 low/moderate remain, below `high` threshold — not blocked) | exit **0** |

The relay workspace had **no** high/critical runtime advisories and required no changes
(verified with `pnpm audit --prod --audit-level=high --ignore-workspace` run inside `relay/`).

All root high/critical advisories were **fully remediated** — nothing is
"accepted-with-reason." The CI/security audit gate is now **blocking**.

---

## Remediation detail (root)

### Direct dependency bumps (least-risk, within the existing major)

| Package | Was | Now | Advisory(ies) fixed | Dependent it serves |
|---|---|---|---|---|
| `express-rate-limit` | `^8.2.1` (8.2.1) | `^8.5.2` (8.5.2) | GHSA (express-rate-limit `>=8.2.0 <8.2.2`); also clears the transitive `express-rate-limit` under `@modelcontextprotocol/sdk` and its `ip-address` finding | Direct dep (server rate limiting) |
| `@opentelemetry/sdk-node` | `^0.213.0` | `^0.217.0` | GHSA-q7rr-3cgh-j5r3 (`<0.217.0`). Transitively patches `@opentelemetry/exporter-prometheus` → 0.217.0, `@grpc/grpc-js` → 1.14.4, and `protobufjs` → 8.6.3 under the otel grpc/transformer subtree | Direct dep (telemetry) |
| `@opentelemetry/auto-instrumentations-node` | `^0.71.0` | `^0.75.0` | GHSA-q7rr-3cgh-j5r3 (`<0.75.0`) | Direct dep (telemetry) |
| `@opentelemetry/exporter-trace-otlp-http` | `^0.213.0` | `^0.217.0` | version-aligned with sdk-node so the shared otlp-transformer/protobufjs subtree resolves to patched copies | Direct dep (telemetry) |

### Transitive overrides (`pnpm.overrides` in root `package.json`)

Each override pins the **patched floor**; the value chosen is one the dependent tolerates
(verified by green typecheck / tests / build after install).

| Override | Pin | Advisory(ies) | Dependent (path) |
|---|---|---|---|
| `protobufjs` | `>=7.5.5` | **critical** GHSA (`<7.5.5`) | `@opentelemetry/...>otlp-transformer>protobufjs` and `@grpc/proto-loader>protobufjs`. Resolves to 8.6.3 via grpc-js 1.14.4; tolerated. |
| `hono` | `>=4.12.4` | GHSA-q5qw-h33p-qvwr (`<4.12.4`) + the rest of the hono high cluster | `@modelcontextprotocol/sdk>hono` |
| `@hono/node-server` | `>=1.19.10` | GHSA (`<1.19.10`) | `@modelcontextprotocol/sdk>@hono/node-server` |
| `socket.io-parser` | `>=4.2.6` | GHSA (`>=4.0.0 <4.2.6`) | `socket.io>socket.io-parser` |
| `@xmldom/xmldom` | `>=0.8.13` | 5 GHSAs (`<0.8.12`) | `@capacitor/cli>plist>@xmldom/xmldom` |
| `fast-uri` | `>=3.1.1` | GHSA (`<=3.1.0`) | `ajv>fast-uri` |
| `tmp` | `>=0.2.6` | GHSA (`<0.2.6`) | `exceljs>tmp` |
| `@grpc/grpc-js` | `>=1.14.4` | GHSA-5375-pq7m-f5r2 + GHSA-99f4-grh7-6pcq (`>=1.14.0 <1.14.4`) | `@opentelemetry/...>exporter-logs-otlp-grpc>@grpc/grpc-js` |
| `express@4>path-to-regexp` | `0.1.13` (exact) | GHSA-37ch-88jc-xwx2 (`<0.1.13`) | top-level `express@4>path-to-regexp` — **must stay on the 0.1.x line**; express@4's router API is incompatible with path-to-regexp 8.x, so this is pinned to the patched 0.1.13 patch release, NOT a `>=` range (a loose range wrongly hoisted 8.x and broke express@4 routing — caught and fixed during this work). |
| `router>path-to-regexp` | `>=8.4.0` | GHSA-j3q9-mxjg-w52f (`>=8.0.0 <8.4.0`) | `@modelcontextprotocol/sdk>express@5>router>path-to-regexp` — the express@5 line uses the 8.x major; pinned to 8.4.2. |

**Why two separate `path-to-regexp` overrides:** the tree contains two incompatible major
lines simultaneously — express@4 (top-level + via express-rate-limit peer) requires the
`0.1.x` API, while MCP's express@5 `router` requires the `8.x` API. A single override
cannot patch both. They are scoped by direct parent (`express@4>...` and `router>...`).

### Accepted-with-reason

**None as of 2026-06-21** — every high/critical runtime advisory was patched, and no
`pnpm audit` ignore/allowlist entry was added. (Should a future advisory prove unfixable
without a breaking major, the cleanest mechanism is `auditConfig.ignoreCves` in
`package.json` with a dated reason, keeping the gate blocking for everything else.)

> **Superseded 2026-07-25.** That mechanism is now in use: exactly one advisory
> (`GHSA-mh99-v99m-4gvg`, brace-expansion) is accepted, via
> `pnpm.auditConfig.ignoreGhsas`. See the 2026-07-25 addendum for the rationale and its
> review trigger.

---

## Residual (post-fix) — NOT blocked

After remediation `pnpm audit --prod --audit-level=high` reports **0 high/critical** and
exits **0**. 21 low/moderate advisories remain; these are below the `--audit-level=high`
gate threshold and are intentionally not blocked (the gate's job is high/critical runtime
CVEs). Re-run `pnpm audit --prod` (no level filter) to view them.

---

## CI gate change (now BLOCKING)

| File | Job | Before | After |
|---|---|---|---|
| `.github/workflows/ci.yml` | `security-audit` → "Security audit (runtime deps)" | `pnpm audit --prod --audit-level=high \|\| true` (soft) | `pnpm audit --prod --audit-level=high` (hard) |
| `.github/workflows/security.yml` | `security` → "Run security audit (runtime deps)" | `continue-on-error: true` | removed (hard) |

A **new** runtime high/critical CVE will now fail CI.

---

## Verification gates (all green, 2026-06-11)

| Gate | Command | Result |
|---|---|---|
| Typecheck | `pnpm run typecheck` | ✅ exit 0 |
| Unit/integration | `npx vitest run tests/routes tests/services tests/db` | ✅ 1658 passed, 16 skipped |
| Relay tests | `npx vitest run` (in `relay/`) | ✅ 219 passed, 38 skipped |
| Build | `pnpm run build` | ✅ built, PWA generated, exit 0 |
| Audit (root) | `pnpm audit --prod --audit-level=high` | ✅ exit 0 |
| Audit (relay) | `pnpm audit --prod --audit-level=high --ignore-workspace` (in `relay/`) | ✅ exit 0 |

---

## Addendum — 2026-06-21 (3 new HIGH advisories)

After 06-11 the gate went red again: **3 new high runtime advisories** published against
modules already in the tree. The CI `security-audit` job (now blocking) failed on the next
push. All three were patched the same way as before — direct bump where it's a direct dep,
`pnpm.overrides` floor where it's transitive — with no breaking-major exception and nothing
accepted-with-reason.

| Package | Advisory | Was | Fix | Path |
|---|---|---|---|---|
| `nodemailer` | GHSA-p6gq-j5cr-w38f — `raw` option bypasses `disableFileAccess`/`disableUrlAccess` (arbitrary file read + SSRF), `<=9.0.0` | `^8.0.1` | **direct bump → `^9.0.1`** | `.>nodemailer` (server/services/email.ts; only `createTransport`/`sendMail`/`createTestAccount`/`getTestMessageUrl` used — API unchanged across 8→9, no `raw` usage) |
| `ws` | GHSA-96hv-2xvq-fx4p — memory-exhaustion DoS from tiny fragments, `>=8.0.0 <8.21.0` | `^8.20.1` (direct) + transitive via `socket.io>engine.io>ws` | **direct bump → `^8.21.0`** + override `ws: >=8.21.0` (covers the engine.io transitive copy) | `.>ws`, `.>socket.io>engine.io>ws` |
| `form-data` | GHSA-hmw2-7cc7-3qxx — CRLF injection via unescaped multipart field/file names, `>=4.0.0 <4.0.6` | transitive | **override → `form-data: >=4.0.6`** | `.>openai>@types/node-fetch>form-data` |

**Result:** `pnpm audit --prod --audit-level=high` → **exit 0** (28 low/moderate remain,
below the gate). Re-verified: `pnpm run typecheck` ✅ exit 0; `npx vitest run
tests/services/coding/coding-workspace.test.ts` ✅ 85/85 (also fixed 2 cross-platform path
tests that fail on the Linux runner — unrelated to the CVE work).

> **Standing risk (from the go-live readiness review):** the runtime-CVE landscape moves —
> re-run `pnpm audit --prod --audit-level=high` immediately before launch and keep the
> override pins current.

---

## Addendum — 2026-07-25 (12 blocking advisories after a 4-week gate outage)

**Root cause was process, not code.** CI died at the install step on **2026-06-28**
(`ERR_PNPM_OUTDATED_LOCKFILE` — `apps/anton-agent-pay/package.json` declared two `@noble`
packages the lockfile never listed, and all eight install steps use `--frozen-lockfile`).
Every job, including `security-audit`, failed in ~40s *before running anything*. `main` had
no branch protection, so PRs #7/#8/#9 merged fully red.

For ~4 weeks the gate was dead and silent. When the lockfile was repaired on 2026-07-24 the
audit ran again and reported **12 blocking advisories (1 critical + 11 high) across 7
modules**. None is a code regression — they simply accumulated unobserved. The lesson is
the one this doc's own standing risk note anticipated: *a gate that cannot run is
indistinguishable from a gate that passes.*

| Package | Advisory | Was | Fix | Path |
|---|---|---|---|---|
| `adm-zip` | GHSA-xcpc-8h2w-3j85 — crafted ZIP triggers ~4GB allocation, `<0.6.0` | `^0.5.16` (direct) | **direct bump → `^0.6.0`** (+ dropped `@types/adm-zip`, now bundled) | `.>adm-zip` |
| `tar` | **CRITICAL** decompression/parse DoS + negative-entry infinite loop, `<=7.5.18` | transitive | **scoped override → `@capacitor/cli>tar: >=7.5.19`** | `.>@capacitor/cli>tar` |
| `fast-uri` | 2× host confusion, `>=4.0.0 <=4.1.0` | override `>=3.1.1` (unbounded) | **corrected override → `>=3.1.4 <4.0.0`** (a *downgrade*) | `.>ajv>fast-uri` |
| `engine.io` | GHSA — polling-transport connection exhaustion, `>=4.1.0 <6.6.7` | transitive | **override → `>=6.6.7 <6.7.0`** | `.>socket.io>engine.io` |
| `find-my-way` | DDoS with HTTP/2, `<=9.6.0` | transitive | **override → `>=9.7.0`** | `apps__anton-agent-pay>fastify>find-my-way` |
| `@opentelemetry/propagator-jaeger` | DoS in `JaegerPropagator`, `<2.9.0` | transitive | **override → `>=2.9.0 <3.0.0`** | `.>@opentelemetry/sdk-node>...` |
| `brace-expansion` ×4 | GHSA-3jxr-9vmj-r5cp (exponential expansion) + GHSA-mh99-v99m-4gvg (unbounded expansion → OOM) | transitive | **three major-scoped pins** `@1: >=1.1.16 <2.0.0`, `@2: >=2.1.2 <3.0.0`, `@5: >=5.0.8 <6.0.0`; mh99 **accepted** on the 1.x/2.x lines | via `exceljs>archiver>…>minimatch` (×2) and `@capacitor/cli>rimraf>glob>minimatch` |

**Result:** `pnpm audit --prod --audit-level=high` → **exit 0**, 0 unignored high/critical
(was 1 critical + 13 high by path count). Residual: 6 low / 30 moderate, below the gate.

### Three things worth carrying forward

**1. `fast-uri` was a DOWNGRADE, and that is the interesting failure.** The pre-existing
override `">=3.1.1"` had no upper bound, so it hoisted `fast-uri@4.0.0` — a major that
**neither parent declares** (`ajv@8.18.0` wants `^3.0.1`; `fast-json-stringify` wants
`^3.0.0`). The override had been silently violating semver since 4.0.0 published, and 4.0.0
then picked up its own advisories. Bounding it back into the declared line (`>=3.1.4
<4.0.0`) fixes both problems at once.

This is the **second** time an unbounded override has bitten (`path-to-regexp` was the
first — see the note above about two incompatible majors). **Ten of the thirteen
pre-existing overrides are still bare `>=` floors.** Each can silently hoist an undeclared
major. Bounding them to the major their parents actually declare is a tracked follow-up.

**2. Two overrides must stay scoped.** `tar` is pinned as `@capacitor/cli>tar`, not
globally: a bare `"tar": ">=7.5.19"` would drag the dev tree's `tar@6.2.1` across a major
under `@electron/rebuild`, `node-gyp` and `cacache`, putting `pnpm run electron:build` at
risk. `brace-expansion` needs three separate major-scoped pins because `minimatch@3/5/9`
provably cannot consume the 5.x line. Verify with `pnpm why tar` / `pnpm why
brace-expansion` after any dependency change.

Related footgun: **`pnpm.overrides` is read only from the workspace-root manifest.** An
overrides block added to `apps/*/package.json` is silently ignored — `find-my-way` is the
first entry here driven by a workspace app, and it is pinned at the root.

**3. `@capacitor/cli` moved `dependencies` → `devDependencies`.** It is a build tool (only
`npx cap …` in scripts; zero runtime imports), and that misclassification was the sole
reason its transitive `tar` put the batch's only CRITICAL into a `--prod` audit. The scoped
override is deliberately kept as well, so the pin survives if the move is reverted.

### Accepted-with-reason — GHSA-mh99-v99m-4gvg (brace-expansion)

**Unfixable on the 1.x and 2.x lines.** The unbounded-expansion cap shipped only in
**5.0.8** and was never backported: 1.x ends at 1.1.16, 2.x ends at 2.1.2. No reachable
graph puts all three copies at `>=5.0.8` — `minimatch@3/5/9` cannot consume 5.x; `exceljs`
is end-of-line at 4.4.0 and pins `archiver ^5`; even `archiver@7` stays on the 2.x line via
`archiver-utils@5 > glob ^10 > minimatch@9`.

**Safe by construction:** after the 5.x pin, the advisory has no remaining *executed* path.
`exceljs` never calls archiver's `.glob()` or `.directory()` — the only two entry points
that load `minimatch` at all. Every glob pattern on these paths is developer-authored
inside the dependencies themselves; no ANTON code passes a user-controlled glob to
`exceljs`, `archiver` or `rimraf`.

Suppressed via `pnpm.auditConfig.ignoreGhsas`, which names that single advisory ID and so
cannot mask anything else. The gate stays blocking for everything.

> **Review trigger (dated).** Revisit when **either**: `exceljs` ships a release off
> `archiver@5`, **or** a `1.1.17` / `2.1.3` backport of the 5.0.8 cap appears. Re-check at
> the next quarterly dependency sweep regardless. An ignore with no expiry is how a gate
> rots — this one has an owner and a condition.

### Verification gates (all green, 2026-07-25)

| Gate | Command | Result |
|---|---|---|
| Audit (THE gate) | `pnpm audit --prod --audit-level=high` | ✅ exit 0, 0 unignored high/critical |
| Typecheck | `npx tsc -b --noEmit` | ✅ exit 0 |
| Zip/ajv regression | 9 bundle + capability-descriptor suites | ✅ 155 passed |
| Root | `pnpm run test` | ✅ 2196 passed, 16 skipped |
| Comm / Business / Pay / Companion | `pnpm run test:{comm,business,pay,app}` | ✅ 825 / 366 / 311 / 11 |
| Agent Pay | `npx vitest run` (in `apps/anton-agent-pay/`) | ✅ 237 passed |
| Capacitor CLI still usable | `npx cap --version` | ✅ 8.3.1 from devDependencies |
| Electron chain intact | `pnpm why tar` | ✅ `tar@6.2.1` still under `@electron/rebuild` |

---

## Addendum — 2026-08-12 (8 new HIGH advisory paths; the accepted ignore RETIRED)

Eighteen days after the 07-25 batch, the gate is red again: **8 blocking high paths across
6 package groups**, all published after 07-25 against modules already in the tree. Same
playbook — direct bump where direct, bounded override where transitive — plus one new shape
(a dependency-**removal** override) and one piece of good news: the 07-25 accepted-risk
entry's review trigger fired, and the ignore list is **empty again**.

| Package | Advisory | Was | Fix | Path |
|---|---|---|---|---|
| `socket.io-parser` | GHSA-2m8v-j782-fhvr — zero-attachment memory exhaustion, `>=4.0.0 <4.2.7` | override `>=4.2.6` (unbounded) | **override → `>=4.2.7 <4.3.0`** (now bounded to the `~4.2.4` both socket.io@4.8.3 and socket.io-client@4.8.3 declare) | `.>socket.io>socket.io-parser` — **reachable pre-auth**: `/study-rooms` namespace has no auth middleware and the parser decodes packets before any namespace auth runs |
| `fast-uri` | GHSA-7p8r-x3mc-p8w7 — host confusion via backslash, `>=3.0.0 <3.1.5` | override `>=3.1.4 <4.0.0` | **floor raised → `>=3.1.5 <4.0.0`** (same bounded shape) | `.>ajv>fast-uri` — reachable via ajv-formats URI validation of remote portal capability descriptors |
| `ip-address` | GHSA-mwp4-54f8-5fhr — Address4 leading-zero octet confusion, `<=10.3.0` | transitive 10.2.0 | **new override → `>=10.3.1 <11.0.0`** (both parents declare ^10.x: express-rate-limit ^10.2.0, socks ^10.0.1) | `.>express-rate-limit>ip-address` (+ MCP SDK copy, + dev-tree socks). Low reachability: express-rate-limit gates it behind `net.isIPv6` and `trust proxy` is not set, so `req.ip` is OS-canonical |
| `brace-expansion` ×3 | GHSA-rgw5-rvv9-x895 — DoS bypassing the CVE-2026-14257 caps; `<1.1.18`, `>=2.0.0 <2.1.4`, `>=4.0.0 <5.0.9` | pins `>=1.1.16` / `>=2.1.2` / `>=5.0.8` | **pins raised → `@1: >=1.1.18 <2.0.0`, `@2: >=2.1.4 <3.0.0`, `@5: >=5.0.9 <6.0.0`** (each patch sits inside its minimatch parent's declared caret) | via `exceljs>archiver>…>minimatch` ×2 + build-tooling `glob@11+` |
| `image-size` ×2 | GHSA-w3rx-r6r6-pgpr (ICNS) + GHSA-5p2g-fcmc-qvqq (JXL/HEIF) — parser infinite loops, `<=2.0.2`, **no patched release exists** | transitive 1.2.1 | **removal override → `"pptxgenjs>image-size": "-"`** (see below) | `.>pptxgenjs>image-size` |
| `nanoid` | GHSA-28wg-ghj8-5hjv — non-secure generator infinite loop on negative size; `>=4.0.0 <5.1.16` and `<3.3.16` | direct `^5.1.6`; dev-tree 3.3.11 | **direct bump → `^5.1.16`** + **override `nanoid@3: >=3.3.16 <4.0.0`** (postcss declares ^3.3.11; dev-tree only, keeps the unfiltered `pnpm run audit` clean) | `.>nanoid` (secure root export only, constant sizes — the vulnerable `non-secure` module is imported nowhere) |

### The `image-size` removal override — a new shape, with its own trigger

Both advisories list **no patched version** (npm latest is 2.0.2, the vulnerable one), and
pptxgenjs@4.0.1 — the current latest — declares `image-size ^1.2.1`. But image-size is a
**phantom dependency**: it appears in pptxgenjs's manifest and is never imported by any
shipped pptxgenjs build (grep of all four dist bundles: zero references; the one `sizeOf`
mention sits in a block-commented "currently unused" function). ANTON's three pptxgenjs
call sites (`export-pptx.ts`, `renderers/adapt/board-deck.ts`, `template-injector.ts`)
never call `addImage`, so no image ever flows toward it. pnpm's `"-"` override value
removes the package from the tree entirely — the vulnerable code is not on disk, which
beats any ignore.

> **Review trigger (dated).** Re-verify at the **next pptxgenjs version bump** (if a future
> release genuinely imports image-size, pptx export fails loudly with MODULE_NOT_FOUND at
> require time — not silently), or by **2027-02-01**, whichever comes first.

### GHSA-mh99-v99m-4gvg: the accepted risk is retired

The 07-25 trigger read *"revisit when a 1.1.17 / 2.1.3 backport of the 5.0.8 cap
appears."* It appeared: the advisory now lists patched **1.1.17 / 2.1.3 / 3.0.3 / 5.0.8**,
and the new floors (1.1.18 / 2.1.4 / 5.0.9) exceed them on every line.
`pnpm.auditConfig.ignoreGhsas` is **empty** again, and this doc's accepted-with-reason
state returns to **None** — the 06-21 claim holds once more.

### Correction to the 06-11 table

The 06-11 entry for `express-rate-limit` claimed the `^8.5.2` bump *"also clears … its
`ip-address` finding."* That was wrong: the bump cleared the express-rate-limit advisory
itself, but the lockfile kept `ip-address@10.2.0`, which this batch's advisory now flags.
Cleared properly today by the bounded override above. (Lesson: verify the *resolved*
version in the lockfile, not the parent's declared range.)

### Bare-floor cleanup (partial)

`socket.io-parser` was one of the ten bare `>=` floors flagged on 07-25; it is now bounded.
Nine remain (`protobufjs`, `hono`, `@hono/node-server`, `@xmldom/xmldom`, `tmp`,
`@grpc/grpc-js`, `find-my-way`, `ws`, `form-data`) — still a tracked follow-up.

## Addendum — 2026-09-03 (5 blocking HIGH advisories; both fixes semver-compatible)

The gate went red on the first CI run after a three-day gap — **5 high paths across 2
packages**, all published against modules already in the tree, none related to the branch's
own changes. Both fixes stayed inside the range their parents already declare, so neither
needed a new override shape.

| Package | Advisory | Was | Fix | Path |
|---|---|---|---|---|
| `fast-uri` ×4 | GHSA-5jgf-p345-68v8 (host confusion, skipped IDN canonicalization on scheme-relative refs, `>=3.1.3 <3.1.6`), GHSA-f65p-4m7j-42xc (SSRF via malformed IPv6 normalization, `>=3.0.0 <3.1.6`), GHSA-fph4-wmhf-6fwf (SSRF via repeated hostname percent-decoding, `>=3.1.2 <3.1.6`), GHSA-jqff-g426-hqxp (host confusion via percent-encoded scheme normalization, `>=3.0.0 <3.1.6`) | override `>=3.1.5 <4.0.0`, resolved 3.1.5 | **floor raised → `>=3.1.6 <4.0.0`** (same bounded shape; resolves 3.1.7, still inside the `^3.0.1` ajv declares) | `.>ajv>fast-uri` — same reachability as the 08-12 entry: ajv-formats URI validation of remote portal capability descriptors |
| `mysql2` | GHSA-3f6p-5ww8-9rcr — auth plugin downgrade to `mysql_clear_password` leaks plaintext credentials (CWE-522), `<3.22.0` | direct `^3.17.3`, **resolved 3.18.2** | **direct bump → `^3.22.0`** (resolves 3.24.3) | `.>mysql2` — reachable: `server/services/db-drivers/mysql-driver.ts` and `workflow-executor.ts` connect to a user-configured MySQL/MariaDB host with credentials from the vault. A hostile or on-path server can request the downgrade and harvest them in plaintext |

### The mysql2 finding is the fourth instance of the same lesson

`^3.17.3` already permitted the patched 3.22.0 — the *declared range* was never wrong, the
*lockfile resolution* was stale at 3.18.2. This is exactly the 08-12 correction to the 06-11
`express-rate-limit` / `ip-address` entry, and the 07-25 note before it: **audit the resolved
version, not the declared range.** The floor is raised to `^3.22.0` anyway so a future
`pnpm install` cannot silently resolve back below the patch line.

### Bare-floor cleanup

No change this batch. Nine unbounded `>=` floors remain (`protobufjs`, `hono`,
`@hono/node-server`, `@xmldom/xmldom`, `tmp`, `@grpc/grpc-js`, `find-my-way`, `ws`,
`form-data`) — still a tracked follow-up. `pnpm.auditConfig.ignoreGhsas` remains **empty**;
accepted-with-reason state remains **None**.
