# openEXPERT — Claude Code Session Handoff

**Date:** February 2026
**For:** Claude Code (next session after restart)
**Project path:** `C:\FCP_Workbench`
**Version:** 0.2.0

---

## Immediate Context

You are working on **openEXPERT** — a locally-hosted AI compliance workbench built by FutureChains/Anton. Read `CLAUDE.md` in the project root for the full project specification. The user is **Daniel Bardun**.

You just completed a major 2-day sprint. Everything below is done. Do NOT re-implement any of it.

---

## What Was Completed (Do Not Redo)

### Phase A — Security
- `server/index.ts`: MCP auth guard (Bearer token check before `/mcp` in team mode), `/api/config` scoped (OAuth flags hidden from unauthenticated callers in team mode)
- `server/routes/auth.ts`: Password reset now deletes `user_sessions` for that user (`DELETE FROM user_sessions WHERE user_id = ?`)
- `server/routes/files.ts`: MIME validation using `file-type` v19 — magic bytes checked against declared extension, mismatch → 400 + file deleted
- `.env.example`: Added `MCP_SECRET=` documentation

### Phase B — Scheduling + Notifications
- `server/services/workflow-executor.ts`: NEW — headless workflow execution engine
- `server/services/scheduler.ts`: Now calls `executeScheduledWorkflow()` and creates notifications on tick
- `server/routes/radar.ts`: Added `autoScanCron` field + cron validation
- `server/db/migrations/004_radar_cron_schedule.sql`: NEW — seeds `auto_scan_cron` key
- `server/db/migrations/005_notifications.sql`: NEW — `notifications` table + index
- `server/services/notification-service.ts`: NEW — createNotification, getUnreadCount, markRead, markAllRead
- `server/routes/notifications.ts`: NEW — GET list, GET count, PATCH /:id/read, POST /read-all
- `server/index.ts`: Notifications router mounted at `/api`; radar cron startup logic
- `src/components/shared/NotificationDropdown.tsx`: NEW — bell icon + unread badge + dropdown
- `src/components/layout/Header.tsx`: NotificationDropdown added to icon cluster; 4 breadcrumb labels → `t()` calls
- `src/pages/Dashboard.tsx`: "Results Ready" amber widget for unread scheduled notifications
- `src/pages/RadarPage.tsx`: Scan schedule type toggle (interval vs cron) + cron expression input

### Phase C — Electron
- `electron/main.ts`: NEW — full Electron main process (tray, server spawn, wizard, logs, single-instance)
- `electron/setup-wizard.html`: NEW — first-run API key wizard (branded, dark theme)
- `electron/wizard-preload.ts`: NEW — contextBridge IPC (saveConfig, skipSetup, openExternal)
- `electron/logs-preload.ts`: NEW — contextBridge IPC (onLogLine)
- `electron/icons/.gitkeep`: NEW — directory placeholder
- `scripts/generate-icons.ts`: NEW — sharp-based icon generator, brand colors (dark green + white A)
- `tsconfig.electron.json`: NEW — compiles electron/ → dist/electron/
- `tsconfig.server.build.json`: NEW — compiles server/ → dist/server/ (emit enabled)
- `electron-builder.yml`: NEW — NSIS/DMG/AppImage build config
- `package.json`: electron + electron-builder + @electron/rebuild in devDeps; new scripts; main = dist/electron/main.js; version 0.2.0

### Pre-release Polish
- `package.json`: version 0.2.0
- `server/index.ts`: version string 0.2.0
- `docs/DATA-AND-LEGAL.md`: NEW — enterprise legal/privacy document
- `src/pages/ScriptMediumPage.tsx`: Column layout 3/5/4 → 3/4/5; chat max-h 400→600px

### i18n (5 phases — all done)
- `src/App.tsx`: RTL useEffect (ar/fa/he/ur → dir=rtl); language restore useEffect on mount from `/api/profile`
- `src/pages/AnalyticsPage.tsx`: `toLocaleDateString('en-GB')` → `i18n.language`; `toLocaleString('en-EU')` → `i18n.language`
- `src/components/layout/Header.tsx`: 4 breadcrumbs use `t('nav.governance')` etc.
- `src/pages/Settings.tsx`: solo/team descriptions use `t('settings.soloModeDescription')` etc.; `handleSetLanguage` fires PATCH `/api/profile`
- `src/i18n/locales/en.json`: Added `nav.governance`, `nav.skillPacks`, `nav.compareAnton`, `nav.marketplace`, `settings.soloModeDescription`, `settings.teamModeDescription`
- `server/services/export-docx.ts` / `export-pdf.ts` / `export-pptx.ts` / `export-xlsx.ts`: Added `EXPORT_LABELS` map + `getExportLabels(language)` helper (10 languages, 9 keys each)

---

## Outstanding Tasks (Needs Doing)

### Immediate / Before Build

1. **Generate icon files** — run once:
   ```bash
   pnpm run electron:icons
   ```
   Creates `electron/icons/tray-active.png`, `tray-idle.png`, `tray-loading.png`, `app.png`.

2. **Apply new migrations** — run once:
   ```bash
   pnpm run db:migrate
   ```
   Applies migrations 004 (radar cron) and 005 (notifications).

3. **Rebuild native modules for Electron**:
   ```bash
   pnpm run postinstall
   ```

### Content / Editorial

4. **Whitepaper alignment** — Daniel has a FutureChains whitepaper (generated via Claude web) that needs to be reflected in `docs/DATA-AND-LEGAL.md` and possibly other docs. Daniel will bring the whitepaper content.

### Before GitHub Release

5. Review `electron/setup-wizard.html` — placeholder contact fields `[Insert registered address]` in DATA-AND-LEGAL.md need filling in.
6. Consider a `README.md` for the GitHub repo (user hasn't asked for this yet — ask before creating).

---

## Key Architecture Facts

### File paths
- Main server: `server/index.ts`
- DB init: `server/db/init.ts`
- Electron entry: `electron/main.ts` → compiles to `dist/electron/main.js`
- Server build: compiles to `dist/server/index.js`
- React build: compiles to `dist/client/`
- Icons: `electron/icons/`
- SQLite: `data/openexpert.db`
- Uploads: `uploads/`
- Outputs: `outputs/`
- Env file: `.env` (project root in dev; alongside .exe in packaged)

### Authentication / deployment modes
- `DEPLOYMENT_MODE=solo` (default) — no login required
- `DEPLOYMENT_MODE=team` — JWT auth, bcrypt passwords, rate limiting, MCP secret required
- JWT verified via `Authorization: Bearer <token>` header
- Sessions stored in `user_sessions` table (deleted on password reset)

### i18n
- 30 language files in `src/i18n/locales/`
- Fallback: `en` — only `en.json` needs new keys; others fall back automatically
- Language stored in `localStorage.getItem('openexpert-language')`
- Also persisted to `user_profiles.output_language` via PATCH `/api/profile`
- RTL languages (set `dir="rtl"`): ar, fa, he, ur
- Language restored from profile on app mount (profile wins if differs from localStorage)

### Electron app flow
1. `app.whenReady()` → `createTray()` (tray-idle icon)
2. Check `hasApiKeyConfigured()` → if false, show `showSetupWizard()`
3. Wizard IPC: `wizard:save-config` → `writeEnvValues()` → writes `.env`
4. `startServer()` → spawn tsx (dev) or import `dist/server/index.js` (prod)
5. Poll `/api/health` up to 30s → set tray-active → `openInBrowser()`
6. Tray menu: Open in Browser | Start on Login (checkbox) | View Logs | Quit

### Notifications system
- Table: `notifications(id, user_id, type, title, message, link, read_at, created_at)`
- Types: `scheduled_workflow`, `radar_scan`, `system`
- API: `GET /api/notifications`, `GET /api/notifications/count`, `PATCH /api/notifications/:id/read`, `POST /api/notifications/read-all`
- Frontend: `NotificationDropdown.tsx` in Header.tsx, polls `/api/notifications/count` every 60s
- Dashboard shows amber "Results Ready" widget when unread scheduled notifications exist

### Workflow executor
- `server/services/workflow-executor.ts` — `executeScheduledWorkflow(db, workflowId, scheduleId)`
- Returns `{ success, runId, stepsCompleted, stepsSkipped, error? }`
- Interactive steps (claude, input, export, checkpoint) are skipped in headless mode
- Creates `workflow_runs` records; called by `scheduler.ts` on cron tick

### Export services
- All 4 export files now export `getExportLabels(language: string)` helper
- Covers: en, ar, de, es, fr, hi, ja, ko, pt, zh-CN
- 9 keys: executiveSummary, analysis, recommendations, introduction, conclusion, references, methodology, background, keyFindings

---

## Project Scale (for context)

- ~107 service files in `server/services/`
- ~60 route files in `server/routes/`
- ~60 page components in `src/pages/`
- 47 shared components in `src/components/shared/`
- 30 language files in `src/i18n/locales/`
- 29 documentation files in `docs/`
- 5 DB migration files
- `package.json` version: 0.2.0

---

## Common Commands

```bash
# Development
pnpm run dev              # React (5173) + Express (3001) concurrently

# Database
pnpm run db:init          # Fresh init (drops + recreates)
pnpm run db:migrate       # Apply pending migrations ← NEEDS RUNNING

# Icons
pnpm run electron:icons   # ← NEEDS RUNNING (generates PNGs)

# Electron
pnpm run electron:dev     # Electron + dev server
pnpm run electron:build   # Full packaged build

# Testing
pnpm test                 # Vitest
pnpm run security:audit   # Security audit script
pnpm run audit            # pnpm dependency audit
```

---

## Daniel's Goals (Context for Priorities)

1. **Soft launch** → friends & work colleagues first
2. **AI community** → GitHub repo + tutorial videos
3. **LinkedIn + EY/Big4** → broader reach
4. **Global impact** — especially MENA, Africa, India, Pakistan, South America (hence 30 languages + RTL)
5. **FutureChains homepage** — openEXPERT page to go live
6. Whitepaper coming from Claude web — needs to be reflected in documentation

---

*This handoff document was written at the end of a 2-day sprint completing v0.2.0. Restart safely — everything is saved.*
