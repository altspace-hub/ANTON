# Changelog

All notable changes to openEXPERT will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] - 2026-02-18

### Added

#### Expert Areas & Modules
- **29 expert areas** spanning Financial Crime Prevention, Legal, Cyber, HR, Tax, ESG, and more
- **145+ pre-built expert modules** covering the full lifecycle of professional advisory tasks
- Each area ships with a curated set of 5+ modules, an area context document, and area-specific personas
- Module library is fully extensible: add new modules by dropping JSON + markdown files into the `server/areas/` directory

#### 7-Layer Prompt Composer
- Layered prompt assembly: system identity → area context → module role → persona → output format → knowledge sources → creativity/thinking controls
- Each layer is independently editable and overridable per session
- PromptEditor component with diff view (show changes vs. default)
- Prompt layers visible in the advanced panel with per-layer reset buttons

#### BM25 RAG Pipeline
- Local document indexing with BM25 keyword ranking
- Supports `.pdf`, `.docx`, `.doc`, `.txt`, `.md`, `.xlsx`, `.csv`, `.html`
- Folder registration persists across sessions (stored in SQLite)
- Token-aware chunking: automatically splits large documents to fit context window
- Token count and cost estimate displayed before every run
- Warning banner at 80% context capacity with smart truncation suggestions
- Recursive folder scanning with configurable file-type filters

#### Multi-LLM Support
- Primary: `claude-opus-4-6` (default), `claude-sonnet-4-5`, `claude-haiku-4-5`
- Optional: OpenAI GPT-4o, Google Gemini 1.5 Pro, Mistral Large (requires respective API keys in `.env`)
- Smart model routing: automatically selects the most appropriate model based on task complexity and token budget
- Per-session model override; last-used model remembered per module

#### Authentication & Authorisation System
- `DEPLOYMENT_MODE=solo` — no authentication, single-user local mode (default)
- `DEPLOYMENT_MODE=team` — JWT-based authentication for shared deployments
- First-launch admin password setup wizard in team mode
- User roles: `admin`, `consultant`, `viewer`
- Per-user session isolation; admins can view all sessions
- Session tokens expire after 8 hours of inactivity; configurable via `JWT_EXPIRY`

#### Audit Log
- Immutable SQLite audit table records every API call: timestamp, user, module, model, token counts, cost estimate, duration
- Audit log viewable in Settings → Audit Log with date/user/module filters
- CSV export of audit log for compliance reporting
- Per-session cost tracking displayed in the status bar

#### .anton Exchange Format
- Proprietary `.anton` bundle format (ZIP-based) for sharing sessions, modules, and personas between openEXPERT instances
- Export any session as `.anton`: includes config, conversation history, uploaded documents (optional), and output files
- Import `.anton` file to restore a full session with all context
- Module-only `.anton` bundles for sharing expert module definitions without conversation data
- Community skill/module submission via `.anton` bundles

#### Export System
- **Markdown (.md):** Default output format, source of truth, instant copy/download
- **Word (.docx):** Advisense-branded header/footer, heading hierarchy, tables, page numbers, auto-generated Table of Contents via `docx` npm package
- **Excel (.xlsx):** Conditional formatting (green/amber/red RAG), auto-filters, freeze panes, formulas, named ranges via `exceljs`
- **PDF (.pdf):** Advisense branding, professional typography, page numbers, Table of Contents via Puppeteer + `markdown-it`
- **PowerPoint (.pptx):** Slide-per-section outline generation via `pptxgenjs` — ideal for Presentation Outline output format
- Multi-format export: select multiple formats and download as a single `.zip`
- Export history per session, re-downloadable from the session panel

#### Batch Create
- Run the same module across multiple inputs (files, entities, or text snippets) in one operation
- Progress indicator with per-item status (queued / running / done / error)
- Consolidated export: all outputs merged into a single Excel workbook (one sheet per item) or a single PDF
- Rate-limiting and retry logic for API quota management

#### Guided Workflow
- Step-by-step wizard mode for complex multi-stage tasks (e.g. full gap analysis: scope → upload → configure → run → review → export)
- Each step has contextual help, default values, and a "why this matters" tooltip
- Wizard state persists if the user navigates away and returns
- Wizard can be bypassed at any step by switching to the standard module view

#### Brief Me
- One-click "Brief Me" button on every module: generates a 3-paragraph briefing on the module's purpose, typical use cases, and what a great output looks like
- Briefing is generated using Claude with no user input required
- Displayed in a slide-out panel; does not consume the session's conversation history

#### Guide Me
- Contextual AI coaching: after viewing output, "Guide Me" suggests logical next steps (e.g. "You have a gap analysis — would you like to generate an Action Plan?")
- "Guide Me" is aware of the current module, outputs already generated, and files in context
- Suggestions appear as clickable cards that pre-fill the next module with relevant context

#### Projects
- Group multiple sessions under a named project (e.g. client name, regulatory initiative)
- Project view shows all sessions, their status, combined token/cost totals, and export history
- Project-level notes field for engagement context
- Projects stored in SQLite; exportable as a full `.anton` bundle

#### Community Skills & Modules
- Community module library browsable from the sidebar (requires internet connection)
- Submit modules to the community via `.anton` bundle upload on GitHub Discussions
- Community modules are sandboxed: reviewed before appearing in the in-app library
- Rating and usage count displayed per community module
- One-click install: community module added to local `server/areas/community/` directory

#### 36 Expert Personas
- 36 pre-built personas spanning seniority levels, specialisations, and communication styles
- Examples: Senior AML Investigator, Board Risk Advisor, Regulatory Lawyer, Data Protection Officer, ESG Reporting Specialist, Cyber Incident Responder
- Each persona has a defined tone, vocabulary preferences, and default creativity level
- Custom persona creation: name, role, communication style, default module, knowledge focus
- Personas stored per-user in team mode; globally in solo mode

#### Communications Panel
- Dedicated panel for drafting client-facing or internal communications based on analysis output
- Templates: client email, internal memo, board narrative, press statement, regulator letter
- Tone controls: formal / professional / direct / empathetic
- Auto-populates key findings from the current session's output

#### Quality Indicators
- Per-output quality score (0–100) based on completeness, specificity, evidence count, and format compliance
- Quality dimensions shown as a mini scorecard below the output panel
- "Improve" button triggers a targeted follow-up prompt addressing the lowest-scoring dimension
- Quality scores stored per session for trend analysis

#### Smart Model Routing
- Automatic model selection based on task type, estimated input tokens, and configured cost limits
- Routing rules configurable in Settings → Model Routing
- Override always available per-session
- Routing decision shown in the status bar ("Using Opus 4.6 — complex analysis detected")

#### Core Infrastructure
- React 18 + TypeScript frontend with Vite build tooling
- Express server with full Anthropic SDK integration (streaming SSE, adaptive thinking, effort parameter, web search tool)
- SQLite via `better-sqlite3` for sessions, audit log, folder registrations, projects, users
- Zustand state management with session persistence
- Full streaming support including `server_tool_use` and `web_search_tool_result` blocks
- Knowledge Source System: 4-mode resolver (Claude knowledge, online references, local folders, combined mode)
- Output Format Selector: 25 formats across 6 categories (Strategic, Analytical, Operational, Scoring, Communication, Planning)
- Advisense dark theme design system (`adv-dark`, `adv-teal`, etc.) with optional light mode
- pnpm workspaces monorepo structure
- Docker support: `Dockerfile` and `docker-compose.yml` for solo and team deployments
- GitHub Actions CI: TypeScript check + build check on push to `main` and `develop`

---

## [Unreleased]

### Planned
- Regulatory Comparison module
- Compliance Calendar module
- Interview Prep module
- Peer Review module
- Client Proposal Generator module
- Regulatory Response Drafter module
- Compliance Monitoring Design module
- Model Validation module
- Whistleblower Framework module
- Outsourcing Risk Assessment module
- Real-time collaborative sessions (team mode)
- Plugin API for third-party integrations
- openEXPERT Hub (cloud-hosted community module registry)

---

[1.0.0]: https://github.com/advisense/openexpert/releases/tag/v1.0.0
[Unreleased]: https://github.com/advisense/openexpert/compare/v1.0.0...HEAD
