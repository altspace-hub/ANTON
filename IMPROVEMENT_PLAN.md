# ANTON FCP Workbench — Master Improvement Plan

Generated from synthesis of 100-expert review (100expert.md).
All 35 thematic clusters merged, duplicates consolidated, standalone findings appended.
Last updated: 2026-03-07

---

## HOW TO READ THIS DOCUMENT

Each item has:
- **ID** — unique reference (e.g. `SEC-01`)
- **Experts** — which expert numbers independently raised it (consensus = more important)
- **Effort** — S (< 1 day), M (1-3 days), L (1-2 weeks), XL (3+ weeks)
- **Status** — `[ ]` open, `[x]` done, `[~]` in progress

Items are organized into **8 phases**. Phases must be completed in order for Phases 0-3 (blockers). Phases 4-8 can run in parallel after Phase 3 is stable.

---

## PHASE 0 — SECURITY & LEGAL BLOCKERS
> Must complete before any external user testing. These are non-negotiable.

### 0A — Cross-Site Scripting (XSS) Prevention
| ID | Finding | Experts | Effort | Status |
|----|---------|---------|--------|--------|
| SEC-01 | Wrap all `dangerouslySetInnerHTML` usages with `DOMPurify.sanitize()` | 9, 43 | S | [x] |
| SEC-02 | Add Content Security Policy headers: `script-src 'self'`; remove `unsafe-inline` from Helmet config | 9, 19 | S | [~] |
| SEC-03 | Remove `allow-same-origin` + `allow-modals` from iframe sandbox attributes | 9, 43 | S | [x] |
| SEC-04 | Validate `e.origin` in all `postMessage` listeners before processing | 9 | S | [x] |
| SEC-05 | Move JWT from `localStorage` to `httpOnly; Secure; SameSite=Strict` cookies | 9, 38 | M | [ ] |

**Notes:** SEC-01 through SEC-04 are 1-line fixes each. SEC-05 requires coordinating frontend token reads with cookie-based auth — do last.

---

### 0B — Path Traversal & File System Security
| ID | Finding | Experts | Effort | Status |
|----|---------|---------|--------|--------|
| SEC-06 | Sanitise all file paths: `path.resolve()` + validate result starts inside allowed root | 14, 43 | S | [x] |
| SEC-07 | Reject filenames with `..`, null bytes, or absolute path components before multer saves | 14, 44 | S | [x] |
| SEC-08 | Add max folder recursion depth (limit: 20 levels) to `scanFolder()` | 14, 44, 88 | S | [x] |
| SEC-09 | Add compression ratio check to ZIP uploads: reject if expanded > 100× compressed size | 19, 44 | M | [ ] |
| SEC-10 | Validate MIME type via `file-type` stream sniffer, not just extension — before multer saves | 14, 44 | M | [x] |

---

### 0C — SQL Injection & Query Safety
| ID | Finding | Experts | Effort | Status |
|----|---------|---------|--------|--------|
| SEC-11 | Replace all dynamic WHERE/SET string concatenation with parameterised statements | 14, 17 | M | [x] |
| SEC-12 | Add Zod/schema validation to all `req.body` / `req.query` / `req.params` at route entry | 7, 14 | L | [x] |
| SEC-13 | Validate `parseInt()` results — check `!isNaN()` before use in SQL LIMIT/OFFSET | 14 | S | [x] |

---

### 0D — Authentication & Session Security
| ID | Finding | Experts | Effort | Status |
|----|---------|---------|--------|--------|
| SEC-14 | Add CSRF token validation on all state-mutating routes (POST/PUT/DELETE) | 11, 19, 38 | M | [~] |
| SEC-15 | Rate-limit `/api/auth/*` endpoints: max 10 attempts/min per IP | 12, 38 | S | [x] |
| SEC-16 | Add WebSocket auth validation: reject socketIO connections without valid JWT | 14 | M | [x] |
| SEC-17 | Add `req.on('close')` + `res.socket?.destroy()` cleanup to all 19 SSE endpoints | 13 | M | [x] |

---

### 0E — Webhook & API Hardening
| ID | Finding | Experts | Effort | Status |
|----|---------|---------|--------|--------|
| SEC-18 | Fix HMAC validation: explicit failure (don't fall back to JSON.stringify) when rawBody missing | 14, 76 | S | [x] |
| SEC-19 | Add rate limiting to public inbound webhook endpoints — currently bypasses `authLimiter` | 14, 76 | S | [x] |
| SEC-20 | Validate `Content-Length`: reject if parseInt returns NaN or value exceeds 1MB | 76 | S | [x] |
| SEC-21 | Validate webhook URLs: accept only `https://` scheme; reject http, javascript, data URIs | 9, 76 | S | [x] |

---

### 0F — Legal Liability Disclaimers
| ID | Finding | Experts | Effort | Status |
|----|---------|---------|--------|--------|
| LEGAL-01 | Inject mandatory disclaimer footer in `export-docx.ts`, `export-xlsx.ts`, `export-pdf.ts`: "AI-Assisted Analysis — Not Legal Advice — Requires Professional Review" | 91, 92 | S | [x] |
| LEGAL-02 | Add visible non-dismissable banner on all FCP module run confirmation dialogs: "AI outputs are advisory only. Compliance decisions remain your responsibility." | 91, 92, 17 | S | [x] |
| LEGAL-03 | Add patient safety disclaimer banner (non-closeable) to all healthcare modules | 72 | S | [x] |
| LEGAL-04 | Add COPPA/GDPR-K age verification gate to School Mode sessions | 74 | M | [x] |

**Phase 0 Total Effort: ~10-14 days for one developer. These are all independent and can be parallelised.**

---

## PHASE 1 — INFRASTRUCTURE STABILITY
> Core plumbing fixes. Required before reliable team-mode operation.

### 1A — Database: Multi-Tenant Isolation (CRITICAL)
| ID | Finding | Experts | Effort | Status |
|----|---------|---------|--------|--------|
| DB-01 | Add `user_id` column to all 5 tables missing it: `registered_folders`, `module_configs`, `projects`, `skills`, `reviews` | 12 | M | [ ] |
| DB-02 | Add `user_id` filter to ALL SELECT queries in corresponding routes — verify no unscoped reads remain | 12, 96 | L | [ ] |
| DB-03 | Add `org_id` column to sessions, projects, messages for future multi-org support | 96 | M | [ ] |
| DB-04 | Fix migration runner in `init.ts` — run ALL numbered migration files (001–027), not just hardcoded ones | 12 | M | [x] |
| DB-05 | Wrap `init.ts` schema creation in a single transaction — prevent partial state on power loss | 12 | S | [x] |
| DB-06 | Add `PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000;` to `init.ts` | 12, 87, 89 | S | [x] |
| DB-07 | Add 8 missing compound indexes: `messages(session_id, role, created_at)`, `audit_log(user_id, created_at)`, etc. | 12 | S | [x] |

---

### 1B — Streaming & SSE Reliability
| ID | Finding | Experts | Effort | Status |
|----|---------|---------|--------|--------|
| STREAM-01 | Destroy server-side Anthropic stream on client disconnect (`req.on('close', () => stream.destroy())`) | 13, 87 | S | [x] |
| STREAM-02 | Move `res.writeHead()` before the retry loop — prevent "headers already sent" on retry | 87 | S | [x] |
| STREAM-03 | Clear module-scoped `_textBuf`/`_thinkBuf` on stream start and on error — prevent cross-session contamination | 13, 8 | S | [x] |
| STREAM-04 | Add 5-minute inactivity timeout: emit `{type: 'error', message: 'Request timeout'}` if no new SSE events | 13, 87 | M | [x] |
| STREAM-05 | Add per-user concurrent stream limit (max 3) with 429 rejection when exceeded | 13 | M | [ ] |
| STREAM-06 | Add client-side retry with exponential backoff (1s, 2s, 4s) for SSE connection drops | 87 | M | [ ] |
| STREAM-07 | Wire `AbortController` signal to server so client abort triggers `stream.destroy()` | 87, 13 | M | [ ] |

---

### 1C — Token Counting & Context Safety
| ID | Finding | Experts | Effort | Status |
|----|---------|---------|--------|--------|
| TOKEN-01 | Replace `estimateTokens()` word-count heuristic with `js-tiktoken` accurate counting | 18, 64, 88 | S | [x] |
| TOKEN-02 | Add pre-flight token validation before any Claude API call — reject with clear error if > 180k tokens | 64, 88 | M | [ ] |
| TOKEN-03 | Emit SSE progress events during context assembly: `context_assembly_start`, per-folder progress, `context_assembly_complete` | 88 | M | [ ] |
| TOKEN-04 | Show token cost estimate to user BEFORE running analysis (not just after) | 64 | M | [ ] |
| TOKEN-05 | Add folder indexing safeguards: max 1000 files/folder, 5000 total; warn user at registration time | 88 | M | [ ] |

---

### 1D — Rate Limiting & Request Safety
| ID | Finding | Experts | Effort | Status |
|----|---------|---------|--------|--------|
| RATE-01 | Switch `userLimiter` key from IP to `req.user?.id \|\| req.ip` — prevents shared-office starvation | 14, 89 | S | [x] |
| RATE-02 | Add circuit breaker for Claude API: fast-fail after 3 consecutive 5xx errors in 60s window | 87 | M | [ ] |
| RATE-03 | Add request timeout per Claude API attempt: 30s per attempt, 90s total across 3 retries | 87 | M | [ ] |
| RATE-04 | Add background async audit logging queue: batch-insert every 5s instead of per-request synchronous write | 89 | M | [ ] |

---

### 1E — Prompt Injection Prevention
| ID | Finding | Experts | Effort | Status |
|----|---------|---------|--------|--------|
| INJECT-01 | Add system prompt boundary markers (`===SYSTEM BOUNDARY===`) before/after all user-controlled text | 16, 19 | S | [x] |
| INJECT-02 | Never insert raw user content at `[SYSTEM]` level; use `[USER]` delimiters in multi-turn context assembly | 19 | S | [x] |
| INJECT-03 | Sanitise extracted document text before injection — strip any content that looks like system prompt override | 19 | M | [x] |

**Phase 1 Total Effort: ~3-4 weeks for one developer. DB-01/02/04 are the most critical and should go first.**

---

## PHASE 2 — DATA QUALITY & KNOWLEDGE ACCURACY
> Fixes that affect the correctness of compliance outputs.

### 2A — AMLR Framework Factual Corrections (URGENT)
| ID | Finding | Experts | Effort | Status |
|----|---------|---------|--------|--------|
| DATA-01 | Fix Art. 12 mislabel: "Enhanced due diligence" → correct label "CDD measures" | 58, 22 | S | [ ] |
| DATA-02 | Fix application date: July 10 2027 → June 30 2025 (AMLR 2024/1624 Art. 74) | 58 | S | [ ] |
| DATA-03 | Fix CDD threshold: €10k → €15,000 (AMLR Art. 10) | 58 | S | [ ] |
| DATA-04 | Fix Art. 40 mislabel: "Ongoing monitoring" → "Beneficial ownership registers" | 58 | S | [ ] |
| DATA-05 | Add missing Art. 22: "Reliance on third parties for CDD" — currently absent from 86-article dataset | 58 | S | [ ] |
| DATA-06 | Add "shall" vs "may" distinction to all articles — captures optionality correctly | 58 | M | [ ] |
| DATA-07 | Add cross-reference structure: articles reference each other — capture `references: [art_id, ...]` | 58 | M | [ ] |
| DATA-08 | Validate entire AMLR dataset against EUR-Lex official text — systematic fact-check | 58, 22, 23 | L | [ ] |

---

### 2B — Semantic Search & Knowledge Graph
| ID | Finding | Experts | Effort | Status |
|----|---------|---------|--------|--------|
| KG-01 | Embed all `entity_nodes` in knowledge packs — currently 100% invisible to semantic search | 59, 62 | M | [ ] |
| KG-02 | Add embedding dimension validation: reject or re-embed when stored dims != current model dims | 59, 62 | M | [ ] |
| KG-03 | Replace SQL LIKE substring BM25 fallback with proper BM25 scoring (use `better-sqlite3-fts5`) | 59 | L | [ ] |
| KG-04 | Add referential integrity check on knowledge pack import: fail if relationship references non-existent entity | 56 | S | [x] |
| KG-05 | Add typed relationship schema: replace generic types with `implements`, `clarifies`, `requires`, `supersedes` | 57 | M | [x] |
| KG-06 | Add transitive closure query support: "all articles transitively required by Art. X" | 57 | L | [ ] |
| KG-07 | Add entity description truncation warning: show user when description was cut to 4000 chars | 56 | S | [x] |
| KG-08 | Add embedding probe guard with error logging — currently fails silently | 62 | S | [x] |

---

### 2C — Knowledge Pack Governance
| ID | Finding | Experts | Effort | Status |
|----|---------|---------|--------|--------|
| KP-01 | Add schema validation to knowledge pack import: verify entity/relationship counts, required fields, ID uniqueness | 56, 58 | M | [x] |
| KP-02 | Add content accuracy attestation requirement on import: submitter must confirm source + date of regulatory text | 58, 92 | S | [x] |
| KP-03 | Version-stamp all knowledge packs: `effective_date`, `source_url`, `validated_by` fields | 56, 58 | S | [x] |

**Phase 2 Total Effort: ~2-3 weeks. DATA-01 through DATA-05 are same-day fixes. KG work requires more planning.**

---

## PHASE 3 — COMPLIANCE, ETHICS & GOVERNANCE
> AI governance requirements for production FCP deployment.

### 3A — System Prompt Versioning & Immutable Audit
| ID | Finding | Experts | Effort | Status |
|----|---------|---------|--------|--------|
| GOV-01 | Create `system_prompts` DB table: `(id, module_id, version, content_hash, effective_date, deprecated_at)` | 92, 93, 95 | M | [x] |
| GOV-02 | Store `(session_id, system_prompt_version_id)` in audit log on every compliance request | 92, 93 | M | [x] |
| GOV-03 | Create immutable `session_snapshots` table: written on session completion with full config hash | 92, 93 | M | [x] |
| GOV-04 | On export, include "Analysis produced with module v[X] effective [date], model [Y], thinking [Z]" | 92, 93, 95 | S | [x] |
| GOV-05 | Add `prompt_audit` table: log every PromptEditor change with (original_hash, edited_hash, edited_by, edited_at) | 95 | M | [x] |
| GOV-06 | Enforce critical guardrails (e.g., "You do NOT make compliance decisions") as non-editable in PromptEditor | 91, 93 | M | [x] |

---

### 3B — Source Attribution & Confidence Scoring
| ID | Finding | Experts | Effort | Status |
|----|---------|---------|--------|--------|
| ATTR-01 | Add source attribution footnote instructions to all 8 FCP system prompts: `[Source: AMLR Art. X, local PDF p.12, or web search]` | 92, 95 | S | [x] |
| ATTR-02 | Add "Sources & Scope" section to all compliance exports: which docs loaded, model/thinking/creativity, session ID, timestamp | 92, 95 | M | [x] |
| ATTR-03 | Add structured confidence annotation to gap-analysis, risk-assessment, data-management prompts: `Confidence: [High | Medium | Low] + rationale` | 95 | S | [x] |
| ATTR-04 | Extend CitationVerifier to parse source footnotes and cross-check against loaded knowledge sources | 95 | M | [ ] |
| ATTR-05 | Surface RAG chunks to user in a collapsible "Sources used" panel (currently logged but not shown) | 95 | M | [ ] |

---

### 3C — Bias Awareness in FCP Prompts
| ID | Finding | Experts | Effort | Status |
|----|---------|---------|--------|--------|
| BIAS-01 | Add bias awareness block to `gap-analysis.md`, `risk-assessment.md`, `sanctions-advisory.md`: geographic bias, name-matching false positives, jurisdiction balance | 94 | S | [x] |
| BIAS-02 | Add diversity instruction to `training-content.md`: "Include examples across gender, age, occupation, geography. Avoid stereotyping." | 94 | S | [x] |
| BIAS-03 | Add false positive guidance to Sanctions Advisory: flag if matching confidence < 85% or depends on partial name match alone | 94 | S | [x] |
| BIAS-04 | Add epistemic humility block to all 8 core FCP system prompts: flag knowledge cutoff; never infer unstated obligations; cite uncertainty explicitly | 91 | S | [x] |

---

### 3D — Model Governance Controls
| ID | Finding | Experts | Effort | Status |
|----|---------|---------|--------|--------|
| MGOV-01 | Add admin tab to Settings: "Compliance Policy" — enforce Opus 4.6 + investigate thinking per specified module | 92, 93 | M | [x] |
| MGOV-02 | Add `model_allowed` table: per-user model allowlist; block use of disallowed models at route level | 93 | M | [x] |
| MGOV-03 | Add model end-of-life dates to MODELS array; emit 90-day/30-day warnings in ModelSelector | 93 | M | [x] |
| MGOV-04 | Surface `transparencyLevel` parameter in `claude.ts` — currently set in UI but never passed to API | 65 | M | [x] |

---

### 3E — EU AI Act Preparedness
| ID | Finding | Experts | Effort | Status |
|----|---------|---------|--------|--------|
| EUAI-01 | Conduct EU AI Act conformity assessment: classify ANTON under Annex III (financial crime — likely high-risk) | 92 | XL | [ ] |
| EUAI-02 | Implement enforced human oversight sign-off workflow for gap-analysis, sanctions-advisory, investigation-support | 92, 91 | L | [ ] |
| EUAI-03 | Create transparency documentation per Art. 13: plain-language system card per module (capabilities, limitations, failure modes) | 92, 95 | L | [ ] |
| EUAI-04 | Add post-market monitoring log: track output quality, reversal rate, complaint register | 92 | L | [ ] |

**Phase 3 Total Effort: ~3-4 weeks. 3A/3B/3C items are fast (1-2 days total). 3D/3E are larger.**

---

## PHASE 4 — UX, ACCESSIBILITY & EXPORT QUALITY
> User experience and deliverable quality improvements.

### 4A — Navigation & Cognitive Load
| ID | Finding | Experts | Effort | Status |
|----|---------|---------|--------|--------|
| UX-01 | Create 3 role-based nav presets in NavItemConfig: "FCP Consultant", "Lawyer/GC", "Compliance Officer" — show only relevant modules | 1, 5, 65 | M | [ ] |
| UX-02 | Add "Quick Start" card to Dashboard: most recent session + 3 recommended modules for user role | 5, 81 | M | [ ] |
| UX-03 | Add "5-Minute Brief" fast path: one-click Sonnet + Quick + Quick Briefing — for time-constrained executives | 85 | M | [x] |
| UX-04 | Add module search/filter bar in sidebar — users with 31 modules can't scan without search | 1 | S | [x] |
| UX-05 | Add "Show Onboarding Again" button in Settings | 1 | S | [x] |
| UX-06 | Add engagement/client workspace: "Client" and "Engagement" as first-class objects scoping sessions + files | 67, 83 | XL | [ ] |

---

### 4B — Accessibility (WCAG AA)
| ID | Finding | Experts | Effort | Status |
|----|---------|---------|--------|--------|
| A11Y-01 | Replace all 708 instances of `outline-none` with `focus-visible:outline-2 focus-visible:outline-adv-teal` | 2, 3 | M | [ ] |
| A11Y-02 | Add text labels to all color-only status indicators (green check, red alert, amber warning) | 2 | S | [ ] |
| A11Y-03 | Add skip-to-content link as first focusable element: `<a href="#main-content" className="sr-only focus:not-sr-only">` | 2 | S | [x] |
| A11Y-04 | Add `aria-expanded`, `aria-controls`, `role="tooltip"` + `aria-describedby` to all interactive components | 2 | M | [ ] |
| A11Y-05 | Replace `title=` attributes with accessible tooltip components (`role="tooltip"` + `aria-describedby`) | 2 | M | [ ] |
| A11Y-06 | Replace placeholder-only labels with linked `<label htmlFor="">` elements | 2 | M | [ ] |
| A11Y-07 | Fix color contrast: replace `text-adv-gray-med` (#707070) with higher contrast alternative in body text | 2, 3 | S | [ ] |
| A11Y-08 | Remove arbitrary small font sizes: replace `text-[10px]`, `text-[9px]` with minimum `text-xs` (12px) | 3, 4 | S | [ ] |
| A11Y-09 | Add `role="dialog"` + focus trap to all modals (use `focus-trap-react` library) | 2 | M | [ ] |

---

### 4C — Responsive Design
| ID | Finding | Experts | Effort | Status |
|----|---------|---------|--------|--------|
| RESP-01 | Add mini-sidebar mode (60px icons-only) at `md:` breakpoint for 13" laptops | 4 | M | [ ] |
| RESP-02 | Add `sticky first column` to horizontal-scroll gap scoring tables | 4 | S | [x] |
| RESP-03 | Fix ModulePage two-column layout: stack config panel below output panel below `lg` breakpoint | 4 | M | [ ] |
| RESP-04 | Add `@media print` styles for PDF print path | 4 | S | [x] |
| RESP-05 | Set root font-size floor to 14px regardless of OS scaling | 4, 2 | S | [x] |

---

### 4D — Export Document Quality
| ID | Finding | Experts | Effort | Status |
|----|---------|---------|--------|--------|
| EXPORT-01 | Add governance-ready cover page: client name, project, date, version, author, reviewer signature lines | 67, 83 | M | [ ] |
| EXPORT-02 | Add footer: confidentiality classification, version number, "DRAFT/FINAL" watermark, page number | 67, 83 | M | [ ] |
| EXPORT-03 | Add change log table (auto-populated on re-run vs. prior version) | 83 | M | [ ] |
| EXPORT-04 | Auto-name exported files: `{ClientName}_{Module}_{v1.0}_{YYYYMMDD}.{ext}` | 83 | S | [x] |
| EXPORT-05 | Fix DOCX table rendering for 20+ column gap scoring matrices | 24, 77 | M | [ ] |
| EXPORT-06 | Fix Excel formula calculation at export time — formulas currently show as errors | 24, 77 | M | [ ] |
| EXPORT-07 | Fix PDF page numbering and table of contents accuracy | 24 | M | [ ] |
| EXPORT-08 | Add "Legal Memo" export format: Matter → Question Presented → Brief Answer → Discussion → Conclusion | 84 | M | [ ] |

---

### 4E — Onboarding & Help
| ID | Finding | Experts | Effort | Status |
|----|---------|---------|--------|--------|
| ONBOARD-01 | Add in-app help text and contextual tooltips to all ThinkingControls, KnowledgeSourcePanel, OutputFormatSelector | 5, 46, 65 | M | [ ] |
| ONBOARD-02 | Add guided "first gap analysis" walkthrough (3 steps: upload policy, select AMLR pack, run) | 81 | M | [ ] |
| ONBOARD-03 | Document all keyboard shortcuts in Settings > Help (Cmd+K palette, Cmd+Enter submit, etc.) | 1 | S | [x] |
| ONBOARD-04 | Add "Plain language" toggle to Counsel's Desk: board-member summary before full legal analysis | 84 | M | [ ] |

**Phase 4 Total Effort: ~3-4 weeks. A11Y-01 through A11Y-03 are quick wins. UX-06 is the largest item.**

---

## PHASE 5 — PERFORMANCE & RELIABILITY
> Technical debt that affects stability and speed.

### 5A — React Performance
| ID | Finding | Experts | Effort | Status |
|----|---------|---------|--------|--------|
| PERF-01 | Split monolithic 58-property `useSessionStore` into 3 focused stores: session metadata, streaming state, config | 6, 8 | L | [ ] |
| PERF-02 | Add `React.memo` to ContextPanel, OutputFormatSelector, ThinkingControls, KnowledgeSourcePanel | 6 | M | [x] |
| PERF-03 | Virtualise `ConversationThread` using `react-virtual` — render only visible messages | 6 | M | [ ] |
| PERF-04 | Lazy-load heavy export libraries: `docx`, `exceljs`, `pdf-parse` only on export button click | 6 | M | [ ] |
| PERF-05 | Debounce streaming text updates: batch `streamingText` updates every 100ms instead of per-token | 6 | S | [x] |
| PERF-06 | Replace `useSessionStore.getState()` direct reads with Zustand subscriptions where re-rendering needed | 8 | M | [ ] |

---

### 5B — Prompt Caching
| ID | Finding | Experts | Effort | Status |
|----|---------|---------|--------|--------|
| CACHE-01 | Implement mandatory 3-layer caching in `claude-client.ts`: foundation layer (never changes) + area-context layer (per-area) + knowledge-source layer (per-request) | 64, 99 | L | [x] |
| CACHE-02 | Apply `cache_control: { type: 'ephemeral' }` to static system prompt blocks on all routes | 64, 99 | M | [x] |
| CACHE-03 | Add cache hit/miss tracking to audit log; display "saved $X.XX from prompt caching" in session summary | 64 | M | [x] |

---

### 5C — Test Coverage
| ID | Finding | Experts | Effort | Status |
|----|---------|---------|--------|--------|
| TEST-01 | Add unit tests for `claude-client.ts`: `withRetry()` exhaustion, streaming event parsing, thinking blocks | 86, 87 | L | [ ] |
| TEST-02 | Add unit tests for `knowledge-resolver.ts`: token overflow truncation, file scanning limits, URL fetch failure | 86, 88 | L | [ ] |
| TEST-03 | Add unit tests for `prompt-builder.ts`/`prompt-composer.ts`: prompt caching layer split, injection prevention | 86 | M | [ ] |
| TEST-04 | Add 5 Playwright E2E tests: upload PDF → run Claude → export; knowledge sources; thinking blocks; error recovery; export | 86, 90 | L | [ ] |
| TEST-05 | Add 3 streaming chaos tests: 429 retry, mid-stream disconnect, malformed SSE | 86, 87 | M | [ ] |
| TEST-06 | Add load test suite (k6 or artillery): 10/50/100 concurrent users; measure p95 latency and error rate | 53, 89 | L | [ ] |
| TEST-07 | Add Playwright cross-browser matrix: Chrome, Firefox, WebKit (Safari); run nightly | 90 | M | [ ] |
| TEST-08 | Configure vitest coverage reporting in CI: fail if critical module coverage drops below 60% | 86 | S | [x] |

---

### 5D — Browser Compatibility
| ID | Finding | Experts | Effort | Status |
|----|---------|---------|--------|--------|
| COMPAT-01 | Change `tsconfig.app.json` target from `ES2020` to `ES2015`; add `@babel/preset-env` for transpilation | 90 | M | [ ] |
| COMPAT-02 | Create `src/lib/browser-compat.ts`: feature detection for `AbortController`, `ReadableStream`, `clipboard`, `localStorage` | 90 | S | [x] |
| COMPAT-03 | Add `localStorage` quota error handling: wrap all access in try-catch for `QuotaExceededError` | 90 | S | [x] |
| COMPAT-04 | Add SSE long-polling fallback when `ReadableStream` unavailable | 90 | L | [ ] |
| COMPAT-05 | Add Safari web clip icon and iOS PWA meta tags | 90 | S | [x] |

---

### 5E — Observability & Logging
| ID | Finding | Experts | Effort | Status |
|----|---------|---------|--------|--------|
| OBS-01 | Add structured JSON logging with `pino` or `winston`: replace all `console.log` calls | 54, 96 | M | [x] |
| OBS-02 | Add OpenTelemetry tracing for cross-request flows (Claude API latency, DB query time) | 54, 96 | L | [ ] |
| OBS-03 | Add `/metrics` endpoint exposing Prometheus-format counters (requests/s, error rate, stream count) | 54, 96 | M | [x] |
| OBS-04 | Add `/health` endpoint returning database status, queue depth, memory usage | 96 | S | [x] |
| OBS-05 | Add graceful shutdown: drain in-flight requests (30s timeout) before process exit | 96 | M | [x] |

**Phase 5 Total Effort: ~4-6 weeks. PERF-05, CACHE-02, COMPAT-02/03 are quick wins.**

---

## PHASE 6 — MODULE QUALITY & DOMAIN ACCURACY
> Improves the correctness and completeness of FCP and domain-specific module outputs.

### 6A — FCP Module System Prompts
| ID | Finding | Experts | Effort | Status |
|----|---------|---------|--------|--------|
| MOD-01 | Upgrade `gap-analysis.md`: AMLR thematic framework, severity scale, gap categorisation types, remediation effort scale | 22, 58, 67 | M | [x] |
| MOD-02 | Upgrade `risk-assessment.md`: BWRA 5-dimension framework, inherent/control/residual scoring, 5-level maturity model | 22, 66 | M | [x] |
| MOD-03 | Upgrade `sanctions-advisory.md`: add EBA false-positive guidance, name-bias warnings, screening confidence thresholds | 26, 94 | M | [x] |
| MOD-04 | Upgrade `document-creation.md`: 8 document type frameworks with EBA-aligned structures (BWRA dimensions, TM policy decision trees) | 25, 67 | L | [x] |
| MOD-05 | Upgrade `investigation-support.md`: 5-phase framework, 7-typology library, SAR narrative structure, counter-hypothesis requirement | 70 | M | [x] |
| MOD-06 | Upgrade `training-content.md`: AMLR Art. 18 obligations, 5-audience frameworks, bias-aware scenario design | 47, 94 | M | [x] |
| MOD-07 | Upgrade `regulatory-monitor.md`: Level 1/2/3/soft-law classification, 5-dimension impact assessment, output templates | 69 | M | [x] |
| MOD-08 | Upgrade `data-management.md`: AMLA data domains, 5-level readiness scale, GoAML data requirements, DORA interface | 68 | M | [x] |

---

### 6B — Regulatory Framework Coverage
| ID | Finding | Experts | Effort | Status |
|----|---------|---------|--------|--------|
| FRAME-01 | Add FATF Recommendations cross-reference to AMLR knowledge pack | 20, 22 | M | [ ] |
| FRAME-02 | Add Nordic supervisory guidance (Finansinspektionen, Finanstilsynet, FIN-FSA) as knowledge pack | 28, 31 | L | [ ] |
| FRAME-03 | Add UK FCA AML rules coverage (UK-specific modules post-Brexit) | 27 | L | [ ] |
| FRAME-04 | Add DORA-specific modules: ICT risk, incident reporting, third-party risk | 32 | L | [ ] |
| FRAME-05 | Add MiCA/crypto compliance coverage to blockchain area | 33 | M | [ ] |
| FRAME-06 | Add PSD2/payment institution compliance module | 34 | M | [ ] |
| FRAME-07 | Add Solvency II / IDD insurance compliance modules | 35 | L | [ ] |

---

### 6C — Foundation Prompts for Non-FCP Domains
| ID | Finding | Experts | Effort | Status |
|----|---------|---------|--------|--------|
| FOUND-01 | Create `server/prompts/healthcare-foundation.md`: patient safety disclaimers, evidence hierarchy, HIPAA/GDPR obligations, duty of care — inject into all healthcare modules | 72 | M | [x] |
| FOUND-02 | Create `server/prompts/ngo-foundation.md`: Do No Harm, PSEA, beneficiary data protection, Sphere Standards — inject into all NGO modules | 75 | M | [x] |
| FOUND-03 | Create `server/prompts/creative-ip-foundation.md`: IP/copyright guidance, originality disclaimer, defamation awareness — inject into all creative modules | 73 | M | [x] |
| FOUND-04 | Create `server/prompts/school-safety-foundation.md`: safeguarding response layer, age-appropriate content, safe messaging — inject into all School Mode modules | 74 | M | [x] |

---

### 6D — Deliverable Versioning
| ID | Finding | Experts | Effort | Status |
|----|---------|---------|--------|--------|
| VER-01 | Implement deliverable versioning: when re-running a module for the same engagement, detect as v2.0 | 83 | L | [ ] |
| VER-02 | Show diff between versions: "+2 Critical findings, -1 Medium finding" | 83 | M | [ ] |
| VER-03 | Maintain version history in side-panel with timestamp and change summary | 83 | M | [ ] |

**Phase 6 Total Effort: ~4-5 weeks. FOUND-01 through FOUND-04 are highest priority (1 day each). MOD-01/02 next.**

---

## PHASE 7 — SCALABILITY & ARCHITECTURE
> Required before any team deployment beyond 5 concurrent users.

### 7A — Database Migration
| ID | Finding | Experts | Effort | Status |
|----|---------|---------|--------|--------|
| SCALE-01 | Migrate team-mode storage from SQLite to PostgreSQL: implement connection pooling with `pg` or Prisma | 89, 96 | XL | [ ] |
| SCALE-02 | Keep SQLite as default for solo local mode; auto-detect and branch on `DEPLOYMENT_MODE` | 96 | M | [ ] |
| SCALE-03 | Add read replicas for heavy analytics queries (dashboard stats, audit export) | 89, 96 | L | [ ] |

---

### 7B — Redis & Distributed State
| ID | Finding | Experts | Effort | Status |
|----|---------|---------|--------|--------|
| REDIS-01 | Move auth codes and OIDC state from in-memory to Redis with TTL | 96 | M | [ ] |
| REDIS-02 | Add `socket.io-redis` adapter for Socket.IO horizontal scaling | 96 | M | [ ] |
| REDIS-03 | Cache folder indices, knowledge pack lookups, and Roaring/Dow Jones screening results in Redis | 89, 96 | L | [ ] |
| REDIS-04 | Implement distributed locks for background jobs (orchestrator heartbeat, embedding pipeline, radar scan) | 89, 96 | M | [ ] |

---

### 7C — Multi-Model Routing
| ID | Finding | Experts | Effort | Status |
|----|---------|---------|--------|--------|
| MODEL-01 | Implement model router: classify task complexity → route to Haiku (classification/extraction), Sonnet (standard), Opus (deep compliance analysis) | 61, 64, 99 | L | [ ] |
| MODEL-02 | Fix non-Anthropic model routing: wire OpenAI/Gemini/Mistral adapters into claude.ts stream path | 61 | L | [ ] |
| MODEL-03 | Add cost calculator: show per-task model recommendation and projected savings | 64, 99 | M | [ ] |
| MODEL-04 | Route eligible bulk jobs (gap analysis across 100 documents) to Claude Batch API (50% cost reduction) | 99 | L | [ ] |

---

### 7D — Enterprise Authentication
| ID | Finding | Experts | Effort | Status |
|----|---------|---------|--------|--------|
| AUTH-01 | Add LDAP/Active Directory user sync: `POST /api/auth/ldap/sync` batch-imports users | 100 | XL | [ ] |
| AUTH-02 | Add SAML 2.0 endpoint at `/api/auth/saml/acs` for legacy enterprise IdPs | 100 | L | [ ] |
| AUTH-03 | Add TOTP (via `speakeasy`) for multi-factor authentication: `POST /api/auth/mfa/enable` | 100 | M | [ ] |
| AUTH-04 | Add organization invitation workflow: `POST /api/orgs/invites` → accept → member provisioned | 96 | L | [ ] |

**Phase 7 Total Effort: ~6-10 weeks. SCALE-01 is the biggest single item; plan carefully before starting.**

---

## PHASE 8 — STRATEGIC CAPABILITIES
> Enterprise sales enablers and market expansion. These are longer-horizon investments.

### 8A — Enterprise Integrations
| ID | Finding | Experts | Effort | Status |
|----|---------|---------|--------|--------|
| INT-01 | Build GoAML connector: SAR upload, entity enrichment, historical lookups, duplicate detection | 100 | XL | [ ] |
| INT-02 | Build Temenos T24 / core banking connector: customer profiles, account types, transaction history | 100 | XL | [ ] |
| INT-03 | Build Microsoft Graph connector: SharePoint/OneDrive file access, Teams files, Word document generation | 100 | L | [ ] |
| INT-04 | Build Slack bot: findings summary push, deadline alerts, /slash commands | 100 | L | [ ] |
| INT-05 | Build JIRA connector: create/update issues from action plan, sync status back | 100 | L | [ ] |
| INT-06 | Build Actimize / AML workflow platform connector for action plan sync | 100 | XL | [ ] |

---

### 8B — Certifications & Compliance
| ID | Finding | Experts | Effort | Status |
|----|---------|---------|--------|--------|
| CERT-01 | Pursue SOC 2 Type II certification: engage auditor, implement required controls, publish report | 98 | XL | [ ] |
| CERT-02 | Pursue ISO 27001 certification | 98 | XL | [ ] |
| CERT-03 | Draft and publish GDPR DPA template for enterprise customers | 98 | M | [ ] |
| CERT-04 | Partner with regulatory counsel to validate all FCP modules against FATF/EBA/DORA sources | 98 | XL | [ ] |
| CERT-05 | Build RegTech Compliance Pack: DPA + vendor profile + IR plan + SLA — for enterprise procurement | 98, 100 | M | [ ] |

---

### 8C — Claude API Next-Generation
| ID | Finding | Experts | Effort | Status |
|----|---------|---------|--------|--------|
| NEXT-01 | Migrate document handling to Claude Files API (replace pdf-parse/mammoth with Files API uploads) | 99 | L | [ ] |
| NEXT-02 | Expose vision capabilities: add image upload to FileUploader; allow visual compliance review (screenshots, diagrams) | 99 | M | [ ] |
| NEXT-03 | Expand MCP interface: expose module definitions, session history, knowledge packs as MCP resources/tools | 99 | L | [ ] |
| NEXT-04 | Design computer-use sandbox architecture for future automated compliance testing | 99 | XL | [ ] |

---

### 8D — Open Source & Community
| ID | Finding | Experts | Effort | Status |
|----|---------|---------|--------|--------|
| OSS-01 | Add CODE_OF_CONDUCT.md (Contributor Covenant), GOVERNANCE.md, ROADMAP.md | 97 | S | [ ] |
| OSS-02 | Add CI/CD enforcement: `pnpm audit` + license-checker on every PR; block on GPL dependencies | 97 | M | [ ] |
| OSS-03 | Separate proprietary FCP domain prompts into private repository; keep only generic templates public | 97 | L | [ ] |
| OSS-04 | Create Docker image for easy deployment (Dockerfile + docker-compose.yml) | 97 | M | [ ] |
| OSS-05 | Generate and publish OpenAPI 3.0 specification at `/api/openapi.json` | 100 | L | [ ] |

**Phase 8 Total Effort: 6-18 months depending on certification timelines.**

---

## STANDALONE FINDINGS
> Raised by a single expert with no overlap. Implement when time allows.

| ID | Finding | Expert | Effort | Status |
|----|---------|--------|--------|--------|
| LONE-01 | Add ESLint + Prettier to codebase (currently missing) | 10 | S | [ ] |
| LONE-02 | Fix soft-delete inconsistency: standardise on `is_archived` across all tables | 12 | M | [ ] |
| LONE-03 | Add regulatory deadline countdown to dashboard (days until AMLR application) | 60 | S | [ ] |
| LONE-04 | Add drill-down from dashboard metrics (e.g., "Unread Insights: 2" links to items) | 60 | S | [ ] |
| LONE-05 | Add compliance posture heatmap: 5-level maturity across 8 dimensions | 60 | M | [ ] |
| LONE-06 | Add risk appetite status dashboard for CRO persona | 85 | M | [ ] |
| LONE-07 | Add Regulatory Feed subscription: monitor 5+ sources weekly and deliver digest | 85 | L | [ ] |
| LONE-08 | Add script-development Fountain/FDX export for creative production modules | 73 | M | [ ] |
| LONE-09 | Add world-building lore ledger (JSON, per-session) with consistency checker | 73 | L | [ ] |
| LONE-10 | Add teacher oversight dashboard for School Mode | 74 | L | [ ] |
| LONE-11 | Add Log-Frame / Theory of Change generator module for NGO sector | 75 | L | [ ] |
| LONE-12 | Fix Socket.IO max packet size / per-message deflate limits (DoS vector) | 89 | S | [ ] |
| LONE-13 | Add `data:` URI and `javascript:` scheme rejection for all URL inputs | 9 | S | [ ] |
| LONE-14 | Add Electron code signing (prevents Windows SmartScreen warning) | 55 | XL | [ ] |
| LONE-15 | Add Electron auto-update mechanism | 55 | L | [ ] |
| LONE-16 | Add Electron graceful uninstall (remove .env + database on uninstall) | 55 | S | [ ] |
| LONE-17 | Add citation verification badges: green (from active pack), yellow (web source), red (AI inference) | 84, 95 | M | [ ] |
| LONE-18 | Add "Regulatory Feed" subscription module | 98 | L | [ ] |
| LONE-19 | Add RTL locale support (`dir="rtl"` on `<html>`) for Arabic/Hebrew | 80 | M | [ ] |
| LONE-20 | Add missing key validation in CI across all 30 locale files | 80 | S | [ ] |
| LONE-21 | Add sticky first column to horizontal-scroll tables | 4 | S | [ ] |
| LONE-22 | Add `X-API-Version: 1.0` response header and `/api/v1/` versioning | 97 | M | [ ] |
| LONE-23 | Add field-level encryption for API keys and PII stored in user_profiles | 100 | L | [ ] |
| LONE-24 | Add audit log export endpoint: `GET /api/audit/export?format=json&start_date=...` | 100 | M | [ ] |
| LONE-25 | Add workflow approval/signature step (e-signature integration) for compliance document sign-off | 100 | XL | [ ] |

---

## QUICK WINS — DO FIRST
> All completable in under 1 day. High impact relative to effort.

| ID | Fix | Experts | Time |
|----|-----|---------|------|
| SEC-01 | Wrap `dangerouslySetInnerHTML` with DOMPurify | 9, 43 | 2h |
| SEC-03 | Remove `allow-same-origin` from iframe sandboxes | 9 | 30m |
| SEC-18 | Fix HMAC validation fallback | 14, 76 | 30m |
| SEC-19 | Rate-limit inbound webhooks | 14, 76 | 1h |
| DB-06 | Add PRAGMA WAL + busy_timeout to init.ts | 12, 87, 89 | 30m |
| LEGAL-01 | Add liability footer to 3 export functions | 91, 92 | 2h |
| LEGAL-02 | Add disclaimer banner to FCP module run dialogs | 91, 92 | 1h |
| DATA-01 to DATA-05 | Fix 5 AMLR factual errors | 58 | 2h |
| RATE-01 | Switch rate limiter to user ID | 14, 89 | 1h |
| TOKEN-01 | Replace token estimator with js-tiktoken | 18, 64, 88 | 3h |
| INJECT-01 | Add system prompt boundary markers | 16, 19 | 1h |
| BIAS-01 to BIAS-04 | Add bias + epistemic humility blocks to FCP prompts | 91, 94 | 3h |
| A11Y-02 | Add text labels to color-only status indicators | 2 | 2h |
| A11Y-03 | Add skip-to-content link | 2 | 30m |
| A11Y-07 | Fix contrast for adv-gray-med text | 2, 3 | 1h |
| STREAM-01 | Add req.on('close') + stream.destroy() to SSE endpoints | 13, 87 | 3h |
| GOV-01 | Create system_prompts DB table | 92, 93 | 3h |
| ATTR-01 | Add source attribution footnote to FCP prompts | 92, 95 | 2h |
| ATTR-03 | Add confidence annotation to FCP prompts | 95 | 1h |
| LONE-03 | Add regulatory deadline countdown to dashboard | 60 | 2h |
| OSS-01 | Add CODE_OF_CONDUCT.md + GOVERNANCE.md | 97 | 2h |
| OBS-04 | Add /health endpoint | 96 | 1h |

**Total Quick Wins: ~35 hours across ~22 items. A focused 2-day sprint covers all of them.**

---

## PHASE SUMMARY

| Phase | Theme | Items | Effort | Dependency |
|-------|-------|-------|--------|------------|
| **0** | Security & Legal Blockers | 26 items | 2 weeks | — (do first) |
| **1** | Infrastructure Stability | 28 items | 3-4 weeks | After Phase 0 |
| **2** | Data Quality & Knowledge | 18 items | 2-3 weeks | After Phase 1 |
| **3** | Compliance, Ethics & Governance | 22 items | 3-4 weeks | Can start after Phase 0 |
| **4** | UX, Accessibility & Export | 37 items | 3-4 weeks | Can run parallel to Phase 3 |
| **5** | Performance & Reliability | 30 items | 4-6 weeks | After Phase 1 |
| **6** | Module Quality & Domain | 26 items | 4-5 weeks | After Phase 3 |
| **7** | Scalability & Architecture | 22 items | 6-10 weeks | After Phase 1 stable |
| **8** | Strategic Capabilities | 21 items | 6-18 months | Ongoing |
| **Standalone** | Isolated improvements | 25 items | As capacity allows | Any time |

---

## TOTAL ITEM COUNT

| Category | Count |
|----------|-------|
| Phase 0 items | 26 |
| Phase 1 items | 28 |
| Phase 2 items | 18 |
| Phase 3 items | 22 |
| Phase 4 items | 37 |
| Phase 5 items | 30 |
| Phase 6 items | 26 |
| Phase 7 items | 22 |
| Phase 8 items | 21 |
| Standalone items | 25 |
| **TOTAL** | **255 items** |

---

*This plan consolidates 100 expert findings (35 thematic clusters, ~255 distinct improvement items) from the ANTON 100-expert review. Cross-reference: 100expert.md. Owner: Futurechain engineering team.*
