# ANTON — Pre-Launch Expert Panel Audit Prompt
*Copy this entire prompt into a Claude session with the ANTON codebase attached as context, or run it directly with the codebase open.*

---

## FRAMING

You are convening a **Pre-Launch Expert Panel Review** for a production application called **ANTON** (formerly the Advisense FCP Compliance AI Workbench — now a broader enterprise AI platform for Advisense consultants). The application is going live soon, used by senior compliance professionals, lawyers, AML/CFT specialists, and advisors aged 35–65 at Nordic and European financial institutions.

**What ANTON is:** A local-first, full-stack AI-powered workbench running on `localhost`. It exposes the full Claude API (and multi-LLM support) through a structured visual interface. It includes 13 FCP-specific modules (Gap Analysis, Document Creation, Sanctions Advisory, Regulatory Monitor, Training Content, Data Management, Risk Assessment, Investigation Support, Engagement Proposal, Engagement Execution, Management Presentation, Model Validation), plus a Coding Workbench, Presentation Builder, Workflow Builder, Deadline Manager, Knowledge Graph, RAG system, Institutional Memory, Regulatory Radar, Quality Ratchet, and 50+ additional pages and features.

**Stack:**
- Frontend: React 18 + TypeScript + Vite + Tailwind CSS + Zustand
- Backend: Node.js + Express + better-sqlite3 + Chromadb
- AI: Anthropic Claude (primary, with adaptive thinking + web search), OpenAI, Gemini, Mistral, Ollama
- Auth: JWT + OAuth (Google/GitHub) + OIDC SSO
- Storage: Local SQLite + local filesystem — only Claude API calls leave the machine
- Export: .md, .docx, .xlsx, .pdf, .pptx

**The review must be brutally honest, specific, and actionable.** Vague praise is useless. Find what is broken, incomplete, dangerous, confusing, or suboptimal. The goal is a ranked list of things to fix before launch.

---

## THE PANEL

You will speak as **eight distinct expert voices** in sequence. Each one reads the same codebase with a completely different lens. After all eight reviews, you synthesize into a **Master Pre-Launch Checklist** with severity-rated items.

Adopt each voice fully. Do not blend them. Each expert is a real professional who has shipped production software and has opinions.

---

## EXPERT 1 — SENIOR FULL-STACK ENGINEER & ARCHITECT
*15 years shipping production Node.js + React. Opinionated about correctness, maintainability, and things that blow up at 2am.*

Conduct a thorough **architectural and code quality audit**. Go through every layer:

**Backend / Server:**
- Review `server/index.ts` — is startup sequence correct? Are all routes registered? Are there race conditions on init (DB not ready when routes start serving)?
- Review `server/db/init.ts` — are all migrations safe? What happens on a fresh install vs. an existing database? Any missing `IF NOT EXISTS` guards? Are all foreign key constraints correct?
- Scan `server/routes/` — are all routes properly authenticated with middleware? Are there any unprotected endpoints that should require auth? Is there consistent error handling (`try/catch` everywhere, or are some async routes missing error catches that would crash the process)?
- Review `server/services/` — are there any services that open DB connections they never close? Any memory leaks (event emitters not cleaned up, intervals not cleared, file handles left open)?
- Check `server/services/quality-ratchet.ts` and all services that write to SQLite — are prepared statements used everywhere (SQL injection protection)? Are any raw string concatenations in queries?
- Check `server/services/claude-client.ts` and `unified-llm-client.ts` — is the streaming implementation robust? What happens when the API key is invalid, rate-limited, or the response is cut off mid-stream? Are AbortController signals properly propagated? Is there a timeout?
- Review `server/services/credential-vault.ts` — how are credentials encrypted? Is the encryption key derived safely? What happens if the key is lost?
- Check `server/middleware/auth.ts` — is JWT validation complete (expiry, signature, algorithm)? Can tokens be replayed?
- Audit `server/services/script-executor.ts` — is there a sandbox? Can user scripts do arbitrary OS operations? This is a critical attack surface.
- Review all file path operations across `server/routes/files.ts`, `folders.ts`, `project-files.ts` — is there path traversal protection on every operation that accepts a file path from the client?

**Frontend / React:**
- Review `src/App.tsx` — are all 54 lazy-loaded routes properly wrapped in Suspense? What is the fallback? Are there any routes that should be protected that aren't behind an auth guard?
- Review `src/stores/` — are Zustand stores properly initialized? Is there a risk of stale state across sessions (user logs out but session store isn't cleared)?
- Review `src/hooks/useClaude.ts` — is the streaming hook properly cleanup up on unmount? Is there a race condition if the user sends a new message before the previous stream finishes?
- Scan `src/components/` — are there any `useEffect` hooks with missing dependencies that could cause stale closures or infinite loops? Any `any` types that mask real type errors?
- Review error boundaries — is there a root-level error boundary? What happens when a module component throws?
- Check `src/lib/api.ts` — is there consistent error handling? Are network errors distinguished from API errors from auth errors?
- Review the export system (`src/hooks/useExport.ts`, `server/routes/export.ts`, `server/services/export-*.ts`) — do all four formats (DOCX, XLSX, PDF, PPTX) work end-to-end? Is Puppeteer reliably available on a Windows laptop? Are there dependency issues with `pdfkit` vs `puppeteer`?

**Build & Deployment:**
- Is there a production build script that works? Does `pnpm run build && pnpm run start` produce a working app?
- Is the Vite dev/prod distinction handled correctly for API proxy configuration?
- Are source maps disabled in production? Are any secrets hardcoded anywhere?
- Is the `uploads/`, `outputs/`, `data/`, `workspaces/` directory structure auto-created on first run?
- What happens if Chromadb is not running? Does the app fail gracefully or crash?

**Flag every issue with severity: CRITICAL / HIGH / MEDIUM / LOW**

---

## EXPERT 2 — AI SYSTEMS ENGINEER & PROMPT ARCHITECT
*Spent 4 years doing nothing but production LLM systems. Has deep opinions about prompt reliability, model selection, streaming edge cases, and the 50 ways Claude can surprise you.*

Conduct a thorough **AI integration and prompt quality audit**:

**Model & API Integration:**
- Review `server/services/claude-client.ts` — is the `adaptive thinking + effort` parameter implementation correct for `claude-opus-4-6`? The plan says Opus 4.6 uses `{ thinking: { type: 'adaptive' }, effort: 'high' }` — verify this matches Anthropic's actual API spec as of today. Is `budget_tokens` still used for Sonnet/Haiku correctly?
- Is `max_tokens` set correctly for each model? Opus 4.6 supports up to 32k output — is this used? Is there a risk of truncated outputs on long gap analyses?
- How is the **web search tool** handled in the streaming pipeline? When Claude decides to call `web_search_20250305`, the stream emits `server_tool_use` blocks, then `web_search_tool_result` blocks. Is this handled in `server/routes/claude.ts`? Does the frontend correctly display "searching the web..." states?
- Is multi-turn conversation handled correctly with thinking blocks? Extended thinking responses contain `thinking` content blocks — when sent back in conversation history, do they need to be stripped or preserved? (Anthropic requires thinking blocks from previous turns be included in subsequent turns for context continuity.)
- What happens when Claude hits a content policy refusal mid-stream? Is there a clean error state?
- Review the multi-LLM adapters (`openaiAdapter.ts`, `geminiAdapter.ts`, `mistralAdapter.ts`, `ollamaAdapter.ts`) — do they all handle the same `ClaudeRunConfig` interface? Are thinking levels gracefully degraded when using non-Claude models?

**Prompt Quality — FCP Modules:**
Review `server/prompts/` for each of the 8 core FCP module prompts:
- `gap-analysis.md` — does it produce properly structured gap analysis with RAG-status (Red/Amber/Green), article-by-article coverage, concrete action items with owners and timelines?
- `document-creation.md` — does it produce governance-quality policy documents? Does it handle the 10 sub-types (AML Policy, BWRA, KYC Procedures, etc.) distinctly?
- `sanctions-advisory.md` — is the prompt careful enough about the legal nature of sanctions advice? Are there appropriate disclaimers built in? Does it correctly handle the 6 sub-tasks?
- `regulatory-monitor.md` — does it produce useful impact assessments from regulatory updates?
- `risk-assessment.md` — does it produce defensible, evidence-based risk assessments?
- Are prompts versioned? What happens when a prompt is edited by a user and they want to reset?

**Output Format System:**
- Review `src/lib/output-format-definitions.ts` — are all 21+ format `promptInstruction` fields detailed enough to consistently produce the right structure? Which ones are thin or generic?
- When multiple output formats are selected, is the `buildOutputInstruction()` multi-format concatenation reliable? Does Claude actually produce all requested deliverables or does it drop some?
- Are the Excel-specific formats (`gap-scoring-matrix`, `data-readiness-scorecard`, `maturity-assessment`) producing data that is actually parseable into XLSX by the export service?

**Knowledge Source System:**
- Review `server/services/knowledge-resolver.ts` — are all 4 modes implemented? Is there a token budget check before sending? What happens when the combined context exceeds `MAX_CONTEXT_TOKENS`? Is there smart truncation or does it just fail?
- Is URL fetching robust? What happens with paywall-protected URLs (common for regulatory publications)?
- Is the local folder indexer handling large folders (e.g. 50+ PDFs) without hanging the server?

**Quality Ratchet:**
- Is the Haiku scoring prompt reliable? Does it produce valid JSON consistently, or does it sometimes return markdown-wrapped JSON, prose, or nothing?
- Is the `output_feedback` to quality baseline nudge correctly weighted? Does a single 1-star rating on an otherwise 9.5-baseline module cause a visible drop?

**Flag every AI-specific issue with severity: CRITICAL / HIGH / MEDIUM / LOW**
*Pay special attention to cases where Claude might produce output that looks correct but is factually wrong for compliance purposes.*

---

## EXPERT 3 — UX DESIGNER & ACCESSIBILITY SPECIALIST
*Senior UX at a fintech. Deep experience designing for non-technical enterprise users. Cares obsessively about first-time experience, error states, and users who will never read a tooltip.*

Conduct a thorough **user experience and accessibility audit**:

**First-Time User Experience:**
- What does a brand-new consultant see on first load? Is there an onboarding flow, or does the full dashboard just appear? Is the value proposition immediately clear?
- How does a non-technical user discover which module to use for their current task? Is there guidance?
- The sidebar reportedly has 57KB of navigation. Is there a risk of cognitive overload with 50+ pages and features? How is navigation organized and prioritised?
- Are there empty states for every major feature (no sessions yet, no modules run yet, no quality data yet, no deadlines yet)? Are empty states helpful (explain what to do) or just blank?

**Module Workspace UX:**
- The layout has a Configuration Panel on the left and Output Panel on the right. On a 13" laptop, does this work? Is there a responsive breakpoint where it stacks vertically?
- The Knowledge Source Panel is 28KB — is it overwhelming? Can a first-time user understand the difference between the 4 modes without reading documentation?
- ThinkingControls, CreativitySlider, ModelSelector, OutputFormatSelector, PromptEditor, FileUploader, FolderBrowser — that is a lot of controls before the user can even run the module. What is the default state? Can they just click "Run" immediately?
- Is the OutputToolbar (Citations, Review, Thinking, Full Prompt, Feedback, Save) visible and intuitive post-output? Are users likely to find and use the Feedback chip?
- What does the output area look like while Claude is streaming? Is there a clear indicator? Is the thinking content hidden by default (recommended for non-technical users)?

**Error States:**
- What does the user see if the Claude API key is invalid?
- What does the user see if a file upload fails?
- What does the user see if a folder can't be indexed (permissions, too large, corrupted PDF)?
- What does the user see if an export fails?
- What does the user see if they lose network connectivity mid-stream?
- Are error messages human-readable (not stack traces, not HTTP 500)?

**Accessibility:**
- Is minimum font size 14px throughout? (Users are 35–65.)
- Are all interactive elements keyboard-navigable with visible focus rings?
- Do all icon-only buttons have `aria-label` attributes?
- Are form inputs properly labelled (`<label for>` or `aria-label`)?
- Does the dark theme provide sufficient contrast ratios (WCAG AA at minimum)?
- Are loading states announced to screen readers (`aria-live` regions)?
- Are modal dialogs trapping focus correctly?

**Language & Labels:**
- Is all UI copy free of technical jargon (`budget_tokens`, `SSE`, `RAG`, `EMA`, `ChromaDB`)? Users should not need to know what these mean.
- Are the thinking level labels (`quick`, `think`, `think_hard`, `investigate`, `plan_first`) self-explanatory to a compliance officer who has never heard of "extended thinking"?
- Are tooltips present on all non-obvious controls? Are they accurate and helpful?
- Is there consistency in terminology across modules (e.g. is it always "Run Analysis" or sometimes "Submit" or "Generate")?

**Progressive Disclosure:**
- Are advanced settings (model selector, thinking controls, creativity slider, knowledge source panel) behind an expandable "Advanced" section, or are they always visible?
- Is the system prompt editor collapsed by default for non-technical users?
- Is there a "Simple Mode" vs "Expert Mode" toggle?

**Mobile & Responsive:**
- Is the app usable on a tablet? On a phone? (Even if not designed for mobile, does it break catastrophically?)
- On a 13" MacBook, does the two-panel layout feel cramped?

**Flag every UX issue with severity: CRITICAL / HIGH / MEDIUM / LOW**
*Assume the user is a 55-year-old compliance lawyer who is technically capable but has never used an AI tool before.*

---

## EXPERT 4 — FINANCIAL CRIME COMPLIANCE DOMAIN EXPERT
*20 years in AML/CFT, sanctions, and regulatory compliance at tier-1 Nordic banks. Has reviewed many AI compliance tools and found most of them dangerously superficial.*

Conduct a thorough **FCP domain accuracy and compliance utility audit**:

**Module Accuracy:**
- **AMLR Gap Analysis:** Does the module correctly understand the scope and timeline of AMLR (Regulation 2024/1624), including which articles apply to which obliged entities, the distinction between AMLA direct supervision scope and national competent authority scope, and the transition deadlines? Is the gap analysis output actually useful to a compliance officer, or does it produce generic observations?
- **Sanctions Advisory:** Is this module appropriately cautious about the legal weight of its outputs? Does it make clear that it is not legal advice? Does it handle the critical distinction between EU, UK, US (OFAC), and UN sanctions regimes accurately? Does it correctly address the 50% rule, OFAC General Licences, and EU derogation requirements?
- **Document Creation:** Are the AML policy templates aligned with current FATF Recommendations, EBA Guidelines on Risk-Based Approach, and AMLR requirements? Does the BWRA template include all required components (business line mapping, threat assessment, vulnerability assessment, residual risk determination)?
- **Risk Assessment Support:** Does the module understand the distinction between enterprise-wide risk assessment, business relationship risk assessment, and transaction monitoring risk indicators?
- **Regulatory Monitor:** Is the monitor aware of the current key regulatory developments (AMLR, AMLD6, AMLA, EBA PSD3/PSR, DORA for AML)? Can it correctly identify what is in force vs. what is proposed vs. what is in consultation?

**Output Quality & Professional Standards:**
- Would a senior compliance partner at a Big Four firm be comfortable with outputs from these modules? Or would they require substantial editing?
- Are regulatory citations accurate? Does the module cite specific articles, recitals, and guidance correctly?
- Is the risk scoring methodology defensible? (For gap analysis, maturity assessment, data readiness scorecards — are the scoring criteria transparent and auditable?)
- Does the investigation support module correctly state that it does NOT make compliance decisions and is providing analytical structure only? This is legally important.

**Missing Regulatory Content:**
- Is there a module or coverage area for DORA (Digital Operational Resilience Act)?
- Is there coverage for ESG/sustainability-related financial crime risks?
- Is there a PEP (Politically Exposed Person) screening advisory module?
- Is there coverage for the new AMLA (Anti-Money Laundering Authority) setup and what it means for supervised institutions?
- Are the training content templates compliant with EBA's guidelines on AML/CFT training?

**Professional Disclaimers:**
- Does every module output include appropriate professional disclaimers? ("This output was AI-generated and requires review by a qualified compliance professional before use.")
- Are there "hallucination risk" indicators for regulatory citations that should be verified?

**Flag every domain accuracy issue with severity: CRITICAL / HIGH / MEDIUM / LOW**
*CRITICAL means a consultant could act on incorrect information in a real compliance engagement.*

---

## EXPERT 5 — SECURITY ENGINEER
*Specialises in application security for SaaS and enterprise tools. Has performed pen tests on similar platforms. Paranoid by profession.*

Conduct a thorough **security audit**:

**Authentication & Authorization:**
- Review the JWT implementation — is the secret strong enough? Is RS256 used or just HS256? Can a token be forged if the secret is weak?
- In solo mode (no auth), what prevents someone on the same local network from accessing the application?
- Are there any admin endpoints that check role (`requireRole('admin')`) but can be bypassed via direct API calls?
- Is the `share_token` for shared sessions cryptographically random (UUID v4 or better) and sufficiently long to resist brute force?
- Review OAuth callback handling — is the `state` parameter validated to prevent CSRF on OAuth flows?

**API Key Security:**
- The `ANTHROPIC_API_KEY` is in `.env` — is it ever returned to the frontend? Is it ever included in client-side error messages?
- Are any other API keys (OpenAI, Gemini, Mistral) stored or transmitted insecurely?
- Is the credential vault encryption adequate? What algorithm, what key size, where is the encryption key stored?

**Path Traversal & File System:**
- Every endpoint that accepts a `path` parameter from the client is a potential path traversal attack. Review all `files.ts`, `folders.ts`, `project-files.ts`, `knowledge.ts`, `datasets.ts` routes for adequate path sanitization.
- Is `path.resolve()` + containment check used, or `path.normalize()` alone (which is insufficient)?
- Can a user register a folder like `/etc` or `C:\Windows\System32` and have ANTON read and return its contents?

**Script Execution:**
- `script-executor.ts` executes user-provided scripts. What is the sandbox? Is `vm2` or similar used? Can scripts access the file system, make network calls, or spawn child processes?
- The workflow `ScriptStep` allows script execution — same question. Is there a permissions model?

**Input Validation & Injection:**
- Are all API inputs validated at the route level (required fields, type checking, length limits)?
- Is there any user-controlled input that reaches a shell command (`exec`, `spawn`) without sanitization?
- Are SQLite queries exclusively using prepared statements (not string concatenation)?
- Is HTML rendered from user input in any component? If so, is it properly sanitized to prevent stored XSS?
- Are URLs fetched by the URL-fetcher (`server/services/url-fetcher.ts`) validated against an allowlist or at least against SSRF (Server-Side Request Forgery) attack patterns? A user could submit `http://localhost:3001/api/admin/...` as a URL to fetch.

**Rate Limiting:**
- Is rate limiting applied to the Claude API endpoint specifically? What are the limits? Are they per-user (in team mode) or global?
- Is rate limiting applied to auth endpoints (login, token refresh) to prevent brute force?

**Data Exfiltration:**
- What data does ANTON send to external services? Is it limited to (a) Claude API calls (b) OAuth flows (c) URL fetching (d) optional external LLM calls?
- Is there any telemetry, analytics, or crash reporting that sends data to third parties?
- Do any dependencies have known vulnerabilities? (`pnpm audit`)

**CORS:**
- Is CORS correctly configured for `localhost` only? Could it be misconfigured to allow any origin?

**Flag every security issue with severity: CRITICAL / HIGH / MEDIUM / LOW**
*CRITICAL = exploitable right now on a fresh install.*

---

## EXPERT 6 — QA ENGINEER & RELIABILITY SPECIALIST
*10 years in QA for enterprise software. Specialises in finding the edge cases that pass all unit tests but break in production. Obsessed with data integrity.*

Conduct a thorough **reliability and edge case audit**:

**Streaming Reliability:**
- What happens if the user navigates away from a module mid-stream? Is the stream properly aborted? Does the server keep processing (costing API credits) after the client disconnects?
- What happens if Claude returns an empty response? A response with only whitespace? A response that is only a thinking block with no text?
- What happens if the stream connection drops at exactly 50% through a long response? Can the user recover or retry?
- What happens if the user sends a second message while the first is still streaming? Does it queue, cancel, or create two concurrent streams?

**Data Integrity:**
- What happens to a session if the server crashes mid-write? Is the SQLite database left in a consistent state? Does the app use transactions for multi-step session writes?
- What happens if the uploads directory is full? Is there a graceful error or a crash?
- What happens if a PDF is password-protected? What if it's corrupted? What if it's a 200-page legal document (high token count)?
- Is there a maximum file size enforcement on the server, not just the client?
- What happens if Chromadb is unavailable (not running, crashed)? Does the entire app fail or just the RAG features?

**Concurrent Operations:**
- Can two users (team mode) run gap analyses simultaneously? Is there resource contention on the database? On the Anthropic API rate limits?
- If two users try to update the same module config simultaneously, is there a last-write-wins issue?
- Can a user start a workflow that modifies files while another session is indexing the same folder?

**Token & Budget Edge Cases:**
- What happens if the token estimate is wrong and the actual prompt exceeds the model's context window? Is there a clear error?
- What happens if the monthly budget cap is hit mid-stream?
- What happens if `MAX_CONTEXT_TOKENS` is set to a value larger than the model actually supports?

**Export Reliability:**
- Does PDF export via Puppeteer work reliably on Windows without a separate Chrome installation? Puppeteer on Windows can be finicky.
- Is PPTX generation consistent — do all slide types render correctly?
- Are XLSX exports with conditional formatting opening correctly in Excel (not just Google Sheets)?
- What happens if the output being exported is 50,000 words? Does memory handling work?

**Session Management:**
- Is there session expiry? What happens when a JWT expires mid-session — does the user lose their work?
- Is conversation history properly bounded? If a session has 100 messages, does the token estimate still work?

**Migration Safety:**
- Have all ALTER TABLE migrations in `init.ts` been tested on databases created from previous versions? Is there a migration history or just conditional adds?
- What happens if the app is started with an older database schema that's missing a table a new feature needs?

**Flag every reliability issue with severity: CRITICAL / HIGH / MEDIUM / LOW**

---

## EXPERT 7 — PERFORMANCE ENGINEER
*Has profiled React apps and Node.js services in anger. The kind of engineer who actually opens Chrome DevTools Performance tab before calling something "fast enough."*

Conduct a thorough **performance audit**:

**Frontend Bundle:**
- 54 lazy-loaded pages is a lot. What is the estimated bundle size for the initial load (main chunk)? What is the largest lazy chunk? Are there any non-lazy-loaded heavy dependencies that could bloat the initial bundle?
- Are `react-markdown` + `remark-gfm` + `recharts` + `@dnd-kit` in the main bundle or properly code-split?
- Is `constants.ts` (~1200+ lines) imported in the main bundle? If it contains the full module/area definitions, does it inflate the initial load?

**Rendering Performance:**
- The `Sidebar.tsx` is reportedly 57KB of code. Does it re-render on every route change? Is it memoized?
- `ConversationThread.tsx` — as sessions grow to 50+ messages, is the conversation virtualized or does it render all messages as DOM nodes?
- The `KnowledgeSourcePanel.tsx` is 28KB. Is it conditionally loaded or always included in module pages?
- Are there any components that subscribe to the full Zustand store and re-render on every state change?

**Streaming Performance:**
- The SSE stream sends text chunks to the browser. Is there any batching/debouncing on the render side, or does every single token trigger a full React re-render?
- For long outputs (20,000+ words), does the browser remain responsive during streaming?

**Database Performance:**
- Are there any missing indexes for common queries? (Sessions by user_id, quality_scores by module_id and date, audit_log by session_id)
- Are heavy queries (leaderboard, knowledge graph analytics) done synchronously on the main Express thread, potentially blocking other requests?
- Is the `quality_baselines` table queried on every output display even when there's no quality data?

**Local Folder Indexing:**
- If a user registers a folder with 200 PDF files, how long does indexing take? Is it blocking? Is there progress feedback?
- Is the folder watcher (`chokidar`) configured correctly to avoid watching too many files and exhausting inotify handles?

**Chromadb/RAG:**
- How long does a semantic search query take with 10,000+ indexed chunks? Is there a timeout?
- Is Chromadb embedded (runs in-process) or external? If external, what happens on startup if it's not ready?

**Memory:**
- When a large PDF (50MB, 500 pages) is uploaded and text-extracted, does the extracted text stay in memory? Is it streamed or fully buffered?
- Are there any global caches (in-memory) that grow unbounded?

**Flag every performance issue with severity: CRITICAL / HIGH / MEDIUM / LOW**

---

## EXPERT 8 — ONBOARDING & TRAINING SPECIALIST
*Designs enterprise software training programs. Has watched hundreds of users interact with complex tools for the first time. Knows that what seems obvious to the developer is invisible to the user.*

Conduct a thorough **onboarding, learnability, and documentation audit**:

**First Launch:**
- When ANTON is installed and opened for the first time (fresh database, no API key yet), what happens? Is there a clear "Get Started" flow that asks for the API key?
- Is there a `README.md` or `QUICKSTART.md` that a non-technical consultant can follow to get from download to first result in under 5 minutes?
- Is the `.env.example` file present and self-documented? Does each variable have a comment explaining what it is and where to get it?

**Discoverability:**
- If a user wants to do a gap analysis, is it immediately obvious which module to open?
- If a user wants to check the quality of recent outputs, can they find the Quality Ratchet?
- If a user wants to upload a client policy document and compare it against AMLR, is the workflow discoverable?
- Are the 50+ pages/features organized in a way that doesn't overwhelm?

**Contextual Help:**
- Does every major control have a `HelpTooltip` (the component exists)? Are tooltips actually present on ThinkingControls, CreativitySlider, KnowledgeSourcePanel modes, output format chips?
- Is there an "I'm new here — walk me through this module" flow?
- Are error messages actionable? ("Failed to index folder" is bad — "Could not read folder — check that you have permission to access this path" is good)

**Help Content Quality:**
- Do the thinking level descriptions explain the real-world trade-off in non-technical language? ("Quick: fast and suitable for simple questions. Investigate: Claude carefully reasons through complex problems — takes longer but produces better analysis for regulatory work.")
- Do the output format descriptions explain when to use each one? ("Gap Scoring Matrix: best when you need to show the full picture to a project sponsor in Excel format")
- Does the knowledge source panel explain what "Combined Mode" means to someone who has never used RAG?

**Session Continuity:**
- When a user returns to ANTON the next day, do their recent sessions appear prominently? Is there a "Resume last session" shortcut?
- If a user accidentally closes a tab mid-stream, can they recover the output?

**Feature Discovery:**
- Is there any in-app "what's new" or feature announcement mechanism?
- Are the advanced features (multi-agent orchestration, knowledge graph, compliance rules engine) explained anywhere for users who didn't know they existed?

**Flag every onboarding/training issue with severity: CRITICAL / HIGH / MEDIUM / LOW**

---

## SYNTHESIS — MASTER PRE-LAUNCH CHECKLIST

After completing all eight expert reviews, produce the following synthesis:

### 1. CRITICAL BLOCKERS (Must fix before launch — could cause data loss, security breach, or professional harm)
List all CRITICAL issues from all experts in a single prioritised table:
| # | Expert Area | Issue | Impact | Fix |
|---|---|---|---|---|

### 2. HIGH PRIORITY (Should fix before launch — significantly degrades experience or reliability)
Same table format.

### 3. MEDIUM PRIORITY (Fix in first two weeks post-launch)
Same table format.

### 4. LOW / ENHANCEMENT (Backlog — nice to have)
Same table format.

### 5. THE TOP 10 LAUNCH-BLOCKING ITEMS
Pick the 10 most important items from the entire review and write a paragraph for each:
- What the issue is
- Why it matters for ANTON's specific user base (senior compliance professionals)
- Exactly what needs to be done to fix it
- Estimated complexity (hours, days, sprint)

### 6. WHAT IS ACTUALLY GOOD — STRENGTHS TO PRESERVE
List what is working well and should not be changed. A pre-launch audit that only finds problems is incomplete.

### 7. THE LAUNCH READINESS VERDICT
Give a clear, honest answer to: **Is ANTON ready to go live as-is? If not, what is the minimum viable fix list that would make it ready?**
Score on a 1–10 launch readiness scale with justification.

---

## ADDITIONAL PROBES (Run these after the main audit if time permits)

**Probe A — The New Consultant Test:**
Simulate being a compliance consultant named Sofia, 42, who has just installed ANTON and wants to run her first AMLR gap analysis for a mid-size Swedish bank. Walk through the entire experience step by step. Identify every point of friction, confusion, or failure.

**Probe B — The 3am Crash Test:**
Simulate what happens when: (a) the Claude API returns an error mid-stream during a critical analysis, (b) the user's hard drive is 95% full when trying to export a PDF, (c) someone on the team mode accidentally deletes a shared session, (d) a PDF upload contains a scanned image only (no extractable text).

**Probe C — The Regulatory Accuracy Spot Check:**
Pick three specific AMLR/AMLD/sanctions topics and ask ANTON's modules to answer them. Evaluate whether the outputs would pass review by a senior compliance partner.

**Probe D — The Security Stress Test:**
Attempt: (a) path traversal via the folder registration API, (b) submitting a URL pointing to `http://localhost:3001/api/admin` in the online reference panel, (c) uploading a file with a `.exe` extension renamed to `.pdf`, (d) sending a 10MB JSON body to any API endpoint.

**Probe E — The Export Chain Test:**
Run a gap analysis with "Investigate" thinking level, select Executive Summary + Action Plan + Gap Scoring Matrix as outputs, then export to .docx, .xlsx, and .pdf. Verify that all three exports (a) complete without error, (b) look professionally formatted, (c) contain all three deliverables.

---

*End of Pre-Launch Expert Panel Audit Prompt*
*Generated for ANTON by the Advisense FCP team — review scheduled pre-launch 2026*
