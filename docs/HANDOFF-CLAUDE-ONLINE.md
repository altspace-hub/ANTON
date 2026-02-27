# openEXPERT — Project Handoff for Claude (Web)

**Date:** February 2026
**Version:** 0.2.0
**Prepared by:** Claude Code (Sonnet 4.6) working with Daniel Bardun / FutureChains
**Purpose:** Comprehensive context document for Claude web conversations about openEXPERT

---

## 1. What Is openEXPERT?

openEXPERT is a **locally-hosted AI workbench** built for compliance professionals, lawyers, and financial crime prevention (FCP) consultants working at firms like Advisense. It wraps Claude (and other LLMs) in a professional, guided interface so that non-technical users — senior advisors, partners, compliance officers aged 35–65 — can access the full power of Claude's API without touching a terminal.

**Tagline:** "Start with the problem, not the solution."

**Who built it:** FutureChains / Anton — Daniel Bardun (lead), supported by Jonas Karlsson, Max Krackhardt, Björn Heir, Sofia Stenius-Linna, Petra Andrésdottir.

**Where it runs:** On the user's own machine or their firm's server. Nothing is cloud-hosted by FutureChains. Only Claude API calls leave the network.

**Target markets:** Nordic/European financial institutions (current), with strong ambition for **MENA, Africa, India, Pakistan, South America** (global impact mission — hence 30-language support).

**Rollout plan:** Friends & colleagues → AI community → LinkedIn → EY / Big4 → broader market. GitHub repo + intro/tutorial videos. Website at futurechains.com.

---

## 2. Technical Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript + Vite |
| UI | Tailwind CSS (Advisense dark theme: `#0B1426` bg, `#2DD4A8` teal accent) |
| State | Zustand |
| Routing | React Router v6 |
| Icons | Lucide React |
| Markdown | react-markdown + remark-gfm + rehype-highlight |
| Backend | Node.js + Express |
| Primary AI | Anthropic Claude (claude-opus-4-6 default, adaptive thinking, effort parameter) |
| Other AI | OpenAI, Google Gemini, Mistral, Ollama (local) — all switchable |
| Database | SQLite via better-sqlite3 |
| Vector DB | ChromaDB (local) |
| File parsing | mammoth (docx), pdf-parse, xlsx, csv-parse |
| Export | docx npm, exceljs, pdfkit, pptxgenjs |
| Desktop | Electron 33 (tray-only app, system tray icon) |
| Auth | JWT + bcrypt + optional OAuth (Google, GitHub, OIDC/SAML) |
| Scheduling | node-cron v4 |
| i18n | i18next + react-i18next, 30 languages |
| Package manager | pnpm |

---

## 3. Architecture Overview

### Frontend → Backend flow

```
React (Vite, port 5173 dev / bundled in prod)
    ↓ fetch / SSE streaming
Express server (port 3001)
    ├── /api/claude     → Anthropic SDK (streaming SSE, adaptive thinking)
    ├── /api/files      → multer upload + MIME validation + text extraction
    ├── /api/folders    → local folder indexing
    ├── /api/sessions   → SQLite session CRUD
    ├── /api/workflows  → workflow builder + executor
    ├── /api/radar      → regulatory monitoring + cron scheduler
    ├── /api/notifications → in-app notifications system
    ├── /api/profile    → user profile + language preference
    ├── /mcp            → Model Context Protocol (auth-guarded in team mode)
    └── 60+ other routes
    ↓
SQLite (data/openexpert.db) + ChromaDB (data/chroma/)
```

### Electron Desktop Wrapper

```
electron/main.ts
    ├── Single-instance lock
    ├── First-run wizard (if no API key): setup-wizard.html
    ├── Spawns Express server (dev: tsx, prod: dist/server/index.js)
    ├── Polls /api/health until ready (max 30s)
    ├── System tray (3 states: active/idle/loading) → opens browser on click
    └── Tray menu: Open in Browser | Start on Login | View Logs | Quit
```

### Database migrations

Migration files in `server/db/migrations/`:
- `001` — embeddings checkpoint fields
- `002` — pattern scheduler tables
- `003` — session notes
- `004` — radar cron schedule
- `005` — notifications table

---

## 4. The Two Core Features

### 4.1 Knowledge Source Panel (4-mode selector)

This is the **killer feature** — controls where Claude gets its reference material:

| Mode | What it does |
|---|---|
| 🧠 Claude's Own Knowledge | Claude's built-in knowledge, optionally with web search (`web_search_20250305` tool) |
| 🔗 Online References | Paste URLs to regulations/documents; server fetches and injects as context |
| 📂 Local Folders | Point at folders on the machine; extracts text from PDF/DOCX/XLSX/CSV/MD and injects |
| 🔄 Combined Mode | Claude knowledge + local documents with configurable priority (local_first / merged / claude_first) |

All four modes can be active simultaneously. Token counts shown live. Warns at 80% context.

### 4.2 Output Format Selector (value multiplier)

25 output format "chips" across 6 categories. Users click before running — Claude structures its response as that deliverable type:

- **Strategic:** Executive Summary, Decision Memo, Risk Appetite Statement
- **Analytical:** Detailed Findings, Regulatory Comparison, Impact Assessment
- **Operational:** Project Plan, Action Plan, Mitigation Plan, Policy Document, RACI Matrix
- **Scoring:** Gap Scoring Matrix, Maturity Assessment, Data Readiness Scorecard
- **Communication:** Quick Briefing, Problem→Solution, Presentation Outline, Training Material, Client Proposal
- **Planning:** Compliance Calendar, Monitoring Plan, Budget Estimate

Multiple formats selected = Claude produces all of them in one response, each under a "DELIVERABLE N:" header. Then exports to .md / .docx / .xlsx / .pdf.

---

## 5. Modules (8 built-in)

| # | Module | Default Thinking | Primary Outputs |
|---|---|---|---|
| 1 | AMLR Gap Analysis | Investigate (max) | Gap scoring matrix + Executive summary + Action plan |
| 2 | Document Creation | Think hard | Policy document |
| 3 | Sanctions Advisory | Think hard | Varies by sub-task |
| 4 | Regulatory Monitor | Think | Quick briefing + Impact assessment |
| 5 | Training Content Creator | Think | Training material |
| 6 | AMLA Data Management | Investigate | Data readiness scorecard + Action plan |
| 7 | Risk Assessment Support | Think hard | Maturity assessment + Detailed findings |
| 8 | Investigation & Case Support | Think hard | Problem→Solution |

Plus an extensive toolset: Workflow Builder, Regulatory Radar, Intelligence Dashboard, Pattern Detection, RAG (local semantic search), Presentation Builder, Code Review, Collaborative Canvas, Apprentice, Institutional Memory, and more.

---

## 6. What Was Built in This Session (2-Day Sprint)

### Phase A — Enterprise Security Hardening

| Fix | What was done |
|---|---|
| MCP authentication | `/mcp` router protected by `Authorization: Bearer <MCP_SECRET>` in team mode |
| Session invalidation | Password reset now deletes all `user_sessions` rows for that user |
| `/api/config` scoping | OAuth provider flags hidden from unauthenticated callers in team mode |
| File upload MIME check | `file-type` v19 validates magic bytes vs declared extension; mismatches rejected with 400 |
| `.env.example` | Added `MCP_SECRET=` with generation instructions |

### Phase B — Scheduled Workflows & Notifications

| Feature | What was done |
|---|---|
| Workflow executor | New `server/services/workflow-executor.ts` — headless execution engine (skips interactive steps) |
| Scheduler wiring | `scheduler.ts` now actually executes workflows on cron tick and creates notifications |
| Radar cron option | `RadarPage.tsx` has toggle: interval (every N hours) vs specific time (cron expression) |
| Notifications DB | Migration `005_notifications.sql` — `notifications` table with user_id, type, title, link, read_at |
| Notification service | `server/services/notification-service.ts` — createNotification, getUnreadCount, markRead |
| Notifications API | `server/routes/notifications.ts` — GET list, GET count, PATCH read, POST read-all |
| Bell icon in header | `NotificationDropdown.tsx` — unread badge, dropdown with last 10, mark-all-read, click-to-navigate |
| Dashboard widget | "Results Ready" amber card when scheduled jobs completed since last visit |

### Phase C — Electron Desktop App

| File | What was built |
|---|---|
| `electron/main.ts` | Full Electron main process: tray, server spawn, single-instance, log capture |
| `electron/setup-wizard.html` | First-run wizard: API key + port config, branded dark theme |
| `electron/wizard-preload.ts` | IPC bridge for wizard window (contextBridge) |
| `electron/logs-preload.ts` | IPC bridge for log streaming window |
| `scripts/generate-icons.ts` | Generates tray icons using sharp: tray-active/idle/loading (22×22) + app (512×512) |
| `tsconfig.electron.json` | TypeScript config compiling electron/ → dist/electron/ |
| `tsconfig.server.build.json` | TypeScript config compiling server/ → dist/server/ (for packaged app) |
| `electron-builder.yml` | NSIS (Windows), DMG (macOS), AppImage (Linux) |

**Tray icon design:** Rounded rect, dark green `#0D7D6C` bg + white `#FFFFFF` "A" (light/corporate variant of brand). Active=teal, Idle=grey, Loading=amber.

### Pre-release Polish

| Item | What was done |
|---|---|
| Version bump | `package.json` + `server/index.ts` → v0.2.0 |
| Legal document | `docs/DATA-AND-LEGAL.md` — enterprise-grade data/privacy/legal doc (GDPR, DPAs, financial services guidance, no-telemetry statement) |
| ScriptMediumPage layout | Chat panel column rebalanced 3/5/4 → 3/4/5, height 400→600px |

### i18n — All 5 Phases

| Phase | What was done |
|---|---|
| Phase 1 — RTL | `App.tsx` useEffect: `dir="rtl"` for ar/fa/he/ur, `dir="ltr"` otherwise, always sets `lang` attribute |
| Phase 2 — Hardcoded strings | Header.tsx: 4 breadcrumbs → `t()` calls; Settings.tsx: solo/team descriptions → `t()` calls; `en.json`: 6 new keys added |
| Phase 3 — Export labels | `getExportLabels(language)` helper + 10-language `EXPORT_LABELS` map added to all 4 export services (docx, pdf, pptx, xlsx) |
| Phase 4 — Date/number formatting | AnalyticsPage.tsx: `toLocaleDateString('en-GB')` → `i18n.language`; `toLocaleString('en-EU')` → `i18n.language` |
| Phase 5 — Profile persistence | Settings.tsx: language change fires PATCH `/api/profile`; App.tsx: mount effect restores language from profile (profile wins if differs from localStorage) |

---

## 7. Current Project State

### What's working
- Full React frontend with 60+ pages and 8 primary modules
- Express backend with 60+ routes
- Claude API integration (streaming, adaptive thinking, effort parameter, web search tool)
- Multi-provider AI (OpenAI, Gemini, Mistral, Ollama)
- RAG system (ChromaDB + BM25 hybrid search)
- Workflow builder + executor
- Regulatory radar with cron scheduling
- In-app notifications
- 30-language i18n with RTL support
- Electron desktop app with system tray, setup wizard, log viewer
- Export to DOCX, XLSX, PDF, PPTX
- SQLite database with 5 migrations applied
- Security hardening (MCP auth, session invalidation, MIME validation, config scoping)
- Enterprise legal/data document

### What still needs doing (before public launch)
1. **Run `pnpm run electron:icons`** — generates actual PNG icon files (script ready, files not yet generated)
2. **Run `pnpm run db:migrate`** — applies migrations 004 + 005
3. **Whitepaper alignment** — user has a Claude-generated whitepaper to align with DATA-AND-LEGAL.md
4. **GitHub repo** — code not yet published (in progress)
5. **Intro videos** — planned alongside GitHub release
6. **FutureChains homepage** — openEXPERT page within futurechains.com

---

## 8. Design System

### Brand Colors (dark theme)
```
adv-dark:      #0B1426   Main background
adv-dark-2:    #0F1B2D   Secondary background
adv-card:      #152238   Card/panel backgrounds
adv-teal:      #2DD4A8   Primary accent (CTAs, active states)
adv-teal-dark: #1BA882   Hover states
adv-off-white: #E0E0E0   Primary body text
adv-gray:      #B0B0B0   Secondary text
adv-gold:      #F5A623   Warning/attention
adv-red:       #E74C3C   Error
adv-green:     #27AE60   Success
```

### Design Philosophy
- Dark theme by default (Advisense brand)
- Card-based design with shadow-lg
- Teal = action (all interactive elements)
- 14px+ minimum font (users are 35–65)
- No jargon: "How deeply should Claude analyze?" not "budget_tokens"
- Progressive disclosure (advanced options in accordion)

---

## 9. The Claude API Integration

### Model: Claude Opus 4.6 (default)
```typescript
// Adaptive thinking + effort parameter (Opus 4.6)
{
  model: 'claude-opus-4-6',
  thinking: { type: 'adaptive' },
  effort: 'max',   // 'low' | 'medium' | 'high' | 'max'
  max_tokens: 32000,
  stream: true,
}
```

### Thinking levels → effort mapping
| UI Level | Effort | Use case |
|---|---|---|
| Quick | low | Fast answers, simple questions |
| Think | medium | Standard analysis |
| Think Hard | high | Complex regulatory work |
| Investigate | max | Full gap analysis, deep research |
| Plan First | max | Structured planning before execution |

### Creativity → system prompt injection (not temperature — incompatible with thinking)
- **Strict:** Precise, factual, cite everything, formal language
- **Balanced:** Accurate, accessible, use examples
- **Creative:** Engaging, storytelling, real-world examples

### Web Search
When enabled: `tools: [{ type: 'web_search_20250305', name: 'web_search' }]`
Streaming handles `server_tool_use`, `web_search_tool_result`, and `text` blocks.

---

## 10. Key Files to Know

| File | Purpose |
|---|---|
| `server/index.ts` | Express entry — all routes mounted here, MCP guard, config endpoint |
| `server/services/claude-client.ts` | Full Claude API wrapper with streaming |
| `server/services/workflow-executor.ts` | Headless workflow execution |
| `server/services/scheduler.ts` | Cron scheduler for workflows + notifications |
| `server/services/notification-service.ts` | Create/read/mark notifications |
| `server/services/export-docx.ts` | DOCX generation + `getExportLabels()` |
| `electron/main.ts` | Electron main process (tray, server, wizard) |
| `electron/setup-wizard.html` | First-run API key wizard |
| `src/App.tsx` | RTL/LTR direction + language restore on mount |
| `src/pages/Settings.tsx` | Language selector + saves to profile API |
| `src/components/shared/KnowledgeSourcePanel.tsx` | 4-mode knowledge selector |
| `src/components/shared/OutputFormatSelector.tsx` | 25-format output chip selector |
| `src/components/shared/NotificationDropdown.tsx` | Bell + notification center |
| `src/pages/Dashboard.tsx` | Main dashboard + "Results Ready" widget |
| `src/pages/RadarPage.tsx` | Regulatory radar + cron schedule option |
| `src/i18n/locales/en.json` | English translations (804+ keys, fallback for all others) |
| `docs/DATA-AND-LEGAL.md` | Enterprise privacy/legal document |
| `electron-builder.yml` | Cross-platform installer configuration |
| `CLAUDE.md` | Full project specification (most important context file) |

---

## 11. Outstanding Questions / Decisions

1. **Whitepaper alignment** — there is a FutureChains whitepaper that should be reflected in the public-facing docs/about pages. The DATA-AND-LEGAL.md is drafted but needs to be aligned with it.
2. **Translation quality** — the 30 language files were auto-generated. A native speaker review pass for the primary target markets (Arabic, Hindi, Urdu) would significantly improve quality before MENA/South Asia launch.
3. **Ollama model selection UI** — Ollama integration is present but model selection (which local model) may need a cleaner UX pass.
4. **`pnpm run electron:icons`** needs to be run to materialise the icon PNG files before any Electron build.
5. **`pnpm run db:migrate`** needs to be run to apply the latest two migrations.

---

*Document generated during a 2-day development sprint building v0.2.0 of openEXPERT. The codebase at C:\FCP_Workbench contains ~107 service files, ~60 route files, ~60 pages, 47 shared components, and 30 i18n locale files.*
