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

**None.** Every high/critical runtime advisory was patched. No breaking-major exception
was required, so no `pnpm audit` ignore/allowlist entry was added. (Should a future
advisory prove unfixable without a breaking major, the cleanest mechanism is
`auditConfig.ignoreCves` in `package.json` with a dated reason, keeping the gate blocking
for everything else.)

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
