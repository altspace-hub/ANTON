# DEFERRED TASKS
> Items from IMPROVEMENT_PLAN.md that cannot be implemented without external dependencies,
> architectural decisions, or require third-party accounts/credentials/contracts.
> Revisit when those prerequisites are met.

---

## Requires External Infrastructure

| ID | Item | Blocker |
|----|------|---------|
| SCALE-01 | SQLite → PostgreSQL migration | Decision: team deployment size + pg infrastructure |
| SCALE-03 | Read replicas for analytics | Requires PostgreSQL first |
| REDIS-01 | Move auth codes to Redis | Requires Redis instance |
| REDIS-02 | Socket.IO Redis adapter | Requires Redis instance |
| REDIS-03 | Cache in Redis | Requires Redis instance |
| REDIS-04 | Distributed locks in Redis | Requires Redis instance |
| LONE-14 | Electron code signing | Requires EV code signing certificate (~$400/yr) |
| LONE-15 | Electron auto-update | Requires code signing first |

---

## Requires External API Credentials

| ID | Item | Blocker |
|----|------|---------|
| INT-01 | GoAML connector | Requires GoAML API access (national FIU approval) |
| INT-02 | Temenos T24 connector | Requires Temenos partnership/API licence |
| INT-03 | Microsoft Graph connector | Requires Azure app registration + customer tenant consent |
| INT-04 | Slack bot | Requires Slack app registration |
| INT-05 | JIRA connector | Requires Atlassian OAuth app |
| INT-06 | Actimize connector | Requires NICE Actimize partnership |

---

## Requires Legal / Compliance Process

| ID | Item | Blocker |
|----|------|---------|
| CERT-01 | SOC 2 Type II | Requires auditor engagement (6–12 months) |
| CERT-02 | ISO 27001 | Requires certification body engagement |
| CERT-04 | Regulatory counsel validation | Requires legal partner engagement |
| EUAI-01 | EU AI Act conformity assessment | Requires legal counsel |
| EUAI-02 | Human oversight sign-off workflow | Requires EUAI-01 classification first |
| EUAI-03 | Transparency documentation | Requires EUAI-01 scope first |
| EUAI-04 | Post-market monitoring log | Requires EUAI-01 scope first |
| OSS-03 | Separate proprietary prompts to private repo | Requires IP ownership decision |

---

## Requires Architecture Decision

| ID | Item | Blocker |
|----|------|---------|
| AUTH-01 | LDAP/Active Directory sync | Requires team-mode deployment decision |
| AUTH-02 | SAML 2.0 endpoint | Requires enterprise customer requirements |
| AUTH-04 | Organization invitation workflow | Requires multi-org design |
| NEXT-04 | Computer-use sandbox | Awaiting Claude computer-use API GA |
| KG-03 | BM25 FTS5 scoring | Requires better-sqlite3-fts5 native build decision |
| KG-06 | Transitive closure queries | Requires KG-03 first |

---

## Data Verification Required

| ID | Item | Blocker |
|----|------|---------|
| DATA-01 | Fix Art.12 AMLR mislabel | Needs EUR-Lex Art.12 authoritative text confirmation |
| DATA-02 | Fix AMLR application date | Needs EUR-Lex Art.74 authoritative text confirmation |
| DATA-03 | Fix CDD threshold €10k→€15k | Needs EUR-Lex Art.10 authoritative text confirmation |
| DATA-04 | Fix Art.40 mislabel | Needs EUR-Lex Art.40 authoritative text confirmation |
| DATA-05 | Add missing Art.22 | Needs EUR-Lex Art.22 full text |
| DATA-08 | Full AMLR dataset validation | Requires EUR-Lex systematic review (L effort) |

---

## Large Engineering Work (Future Sprints)

| ID | Item | Why Deferred |
|----|------|-------------|
| PERF-01 | Split useSessionStore | L effort refactor, no user-facing impact yet |
| PERF-03 | Virtualise ConversationThread | M effort, only needed at 100+ messages |
| PERF-06 | Replace getState() with subscriptions | M effort refactor, currently functional |
| TEST-01 | claude-client.ts unit tests | L effort, requires test infrastructure setup |
| TEST-02 | knowledge-resolver.ts unit tests | L effort |
| TEST-04 | Playwright E2E tests | L effort, requires E2E infra |
| TEST-06 | k6/artillery load tests | L effort, requires load test infra |
| TEST-07 | Playwright cross-browser | M effort |
| COMPAT-04 | SSE long-polling fallback | L effort, modern browsers all support ReadableStream |
| SEC-05 | JWT → httpOnly cookies | M effort auth refactor, low risk in local-only deployment |
| LONE-09 | World-building lore ledger | L effort, niche use case |
| LONE-10 | Teacher oversight dashboard | L effort, School Mode branch not yet merged |
| LONE-11 | Log-Frame/Theory of Change | L effort, single NGO use case |
| LONE-18 | Regulatory Feed subscription | Duplicate of LONE-07 |
| LONE-23 | Field-level encryption for PII | L effort key management, local deployment low risk |
| LONE-25 | Workflow approval/e-signature | XL effort, requires external signature provider |
| UX-06 | Engagement/client workspace | XL effort, major UX redesign |

---

## Partially Blocked

| ID | Item | Status |
|----|------|--------|
| DB-02 | user_id filter in all SELECT queries | Columns added (migration 033); routes need systematic audit |
| MODEL-02 | OpenAI/Gemini/Mistral in stream path | Adapters exist; stream routing needs unification |
| OSS-05 | OpenAPI 3.0 spec | Can auto-generate but requires stable route inventory |
| LONE-07 | Regulatory Feed | Can prototype with existing web search; full subscription model needs external sources |

---

*Last updated: 2026-03-08*
