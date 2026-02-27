# SESSION NOTES — openEXPERT by ANTON
*Last updated: 2026-02-27*

---

## What This Project Is

**openEXPERT** (internal name: FCP Workbench / `openexpert`) is a full-stack AI-powered web application built for Advisense FCP consultants. It gives non-technical compliance professionals a visual interface to access Claude's full capabilities — modules, chat, workflows, radar, quality scoring, knowledge graphs, and more.

- **Frontend:** React 18 + TypeScript + Tailwind CSS 4 + Vite 6
- **Backend:** Node.js + Express + SQLite (better-sqlite3)
- **AI:** Claude API (Anthropic SDK) + OpenAI + Gemini + Mistral
- **Electron:** Desktop app wrapper (tray icon, launches browser to localhost:3001)
- **Package manager:** pnpm
- **Version:** 0.2.0 | 61 pages | 65 server routes

---

## How to Run

```bash
# Development (always use this for day-to-day work)
pnpm run dev
# → Vite dev server at http://localhost:5173
# → Express API server at http://localhost:3001

# Production build (see KNOWN ISSUE below)
pnpm run build
# → Output: dist/client/ (React) + dist/server/ + dist/electron/

# Electron desktop app (dev mode)
pnpm run electron:dev
```

**First run after clone/rebuild:**
```bash
pnpm install
pnpm run db:init
pnpm run db:migrate
```

---

## Current Build State

| Target | Status | Notes |
|---|---|---|
| `dist/client/` | ✅ Built (2026-02-26 21:51) | Last successful production build |
| `dist/server/` | ✅ Exists | Compiled server TypeScript |
| `dist/electron/` | ✅ Exists | `main.js`, `logs-preload.js`, `wizard-preload.js` |
| TypeScript (all targets) | ✅ Clean | `tsc -b --noEmit` passes |
| `pnpm run dev` | ✅ Working | Server + Vite dev mode both healthy |

---

## KNOWN ISSUE: Production Build OOM Crash

**Symptom:**
```
vite v6.4.1 building for production...
transforming...
memory allocation of 13761037952 bytes failed
ELIFECYCLE  Command failed with exit code 3221226505
```

**Root cause:** Not a code bug. The V8 engine tries to reserve ~13.76 GB of virtual address space at startup. This fails when Windows has less than ~10 GB of free committed memory.

**Why it happened:** At the time of crash, the system only had 8.5 GB free (Firefox, VS Code, NordVPN, and other apps consumed the rest of the 44.7 GB commit budget).

**Fix: Restart the computer** (or close Firefox + VS Code + NordVPN), then run `pnpm run build`. It completed successfully at 21:51 the day before with a fresh system.

**The 13 GB is virtual address space only** — the actual build uses ~1–2 GB real RAM and releases everything when done. After the build, normal operation uses ~300–500 MB.

**Things tried that did NOT help** (don't repeat these):
- `--disable-wasm-trap-handler` (flag works for process-level testing but doesn't prevent the crash in the full build context)
- `--max-old-space-size=4096`
- `maxParallelFileOps: 1`
- Pinning rollup to 4.57.1 (kept this override because it prevents unintended upgrades)
- Pinning tailwindcss to 4.1.18
- `@rollup/wasm-node` override (wrong approach — incompatible API)

**Permanent optional fix:** In Windows → System Properties → Advanced → Performance → Virtual Memory, set a custom pagefile of min 20 GB / max 30 GB.

---

## Package.json Overrides (keep these)

```json
"pnpm": {
  "onlyBuiltDependencies": ["better-sqlite3", "esbuild"],
  "overrides": {
    "rollup": "4.57.1"
  }
}
```
The rollup override prevents automatic upgrades to 4.59.0+ which also exhibit the same OOM behaviour.

---

## Recent Session Work (last 2 sessions)

### Fixed: TypeScript Build Errors in `EngagementQualityGate.tsx`
- Root cause: TypeScript's JSX type inference budget exhausted by too many `&&`-chained children
- Fix: Extracted expanded block into `CheckPanelDetails` sub-component (ternary operators, explicit `React.ReactElement` return type)
- All 3 TypeScript targets now clean

### Fixed: better-sqlite3 ABI Mismatch
- Cause: `electron:build` ran `electron-rebuild` which recompiled `better-sqlite3` for Electron's Node ABI (130) instead of Node.js v22 ABI (127)
- Fix: `pnpm rebuild better-sqlite3` — verified working

### Fixed: PWA Service Worker Breaking Dev Mode
- Cause: Stale SW from a previous production build was intercepting Vite dev server requests
- Fix: Added `devOptions: { enabled: false }` to VitePWA config in `vite.config.ts`
- If browser shows blank page or stale content: open DevTools → Application → Service Workers → Unregister, then hard refresh

### Fixed: Dev Server Hang / High RAM on First Start
- Cause: 30 locale JSON files (1.5 MB) were statically imported, forcing Vite to pre-bundle them all at startup
- Fix: Moved locale files from `src/i18n/locales/` to `public/locales/` and switched to `i18next-http-backend` (lazy HTTP loading)
- On first start after clearing `.vite` cache: wait 1–2 minutes for pre-bundling. Subsequent starts are fast.

### Completed from Plan (3 parts done before current session):
1. ✅ **My Work → Open Chat bug fix** — sessions now route to `/prompt?session=ID` not `/module/open-chat`
2. ✅ **Haiku reasoning transparency** — `score_reasoning` column added, strengths/weaknesses shown in QualityPage
3. ✅ **Command Palette full capacity** — arrow-key history, context-aware suggestions, multi-step confirmation, macros

---

## Next Planned Work (from active plan)

**Transparency Level Toggle — add to all remaining pages**

Only `ModulePage` currently has the Off / Summary / Detailed toggle. Need to add it to:

| Page | File | Approach |
|---|---|---|
| **Open Chat** | `src/pages/PromptPage.tsx` | Use full `SessionTogglesPanel` (store already has state) |
| **BriefMe** | `src/pages/BriefMePage.tsx` | Compact inline 3-button toggle + wire into streamMessage |
| **DataInsights** | `src/pages/DataInsightsPage.tsx` | Same compact pattern |
| **SoundingBoard** | `src/pages/SoundingBoardPage.tsx` | Same compact pattern |
| **ChallengeThis** | `src/pages/ChallengeThisPage.tsx` | Same compact pattern |
| **ReviewEngine** | `src/pages/ReviewEnginePage.tsx` | Same compact pattern |
| **DualInterpretation** | `src/pages/DualInterpretationPage.tsx` | Same compact pattern |

**Compact inline toggle pattern** (for all except PromptPage):
```tsx
const [transparencyLevel, setTransparencyLevel] = useState<0 | 1 | 2>(0);

// UI:
<div className="space-y-1">
  <div className="text-[11px] text-adv-gray-med">Transparency</div>
  <div className="flex gap-1.5">
    {([{ level: 0, label: 'Off' }, { level: 1, label: 'Summary' }, { level: 2, label: 'Detailed' }] as const).map(({ level, label }) => (
      <button key={level} type="button" onClick={() => setTransparencyLevel(level)}
        className={`flex-1 rounded-lg border px-2 py-1.5 text-xs transition-colors ${
          transparencyLevel === level
            ? 'border-adv-teal bg-adv-teal-dim text-adv-teal'
            : 'border-border bg-adv-dark text-adv-gray hover:border-adv-gray-med hover:text-adv-off-white'
        }`}>{label}</button>
    ))}
  </div>
</div>
```

Also wire `transparencyLevel` into each page's `streamMessage()` call.

**Pages that hardcode `transparencyLevel: 0`** (need updating):
- `BriefMePage.tsx` line ~83
- `DataInsightsPage.tsx` line ~461

**Pages that are missing `transparencyLevel` entirely** (need adding):
- `SoundingBoardPage.tsx` line ~160
- `ChallengeThisPage.tsx` line ~75
- `ReviewEnginePage.tsx` line ~218
- `DualInterpretationPage.tsx` line ~81

---

## Key File Locations

| File | Purpose |
|---|---|
| `src/components/shared/SessionTogglesPanel.tsx` | Full toggles panel with transparency (Off/Summary/Detailed) — use this for PromptPage |
| `src/pages/ModulePage.tsx` | Reference implementation — has SessionTogglesPanel fully wired |
| `src/stores/useSessionStore.ts` | Global session state — has `transparencyLevel`, `setTransparencyLevel` |
| `server/services/claude-client.ts` | Claude API wrapper — handles transparency in `streamMessage()` |
| `public/locales/` | 30 locale JSON files (en, sv, fr, de, ...) loaded via HTTP at runtime |
| `src/i18n/index.ts` | i18n init — uses i18next-http-backend, loads from `/locales/{{lng}}.json` |
| `electron/main.ts` | Electron tray app entry point |
| `data/workbench.sqlite` | SQLite database (gitignored) |

---

## Environment

```
Node.js: v22.20.0
pnpm: v10.29.3
Vite: 6.4.1
Rollup: 4.57.1 (pinned via override)
OS: Windows 11 Home
Shell: Git Bash (use Unix paths in bash, Windows paths in Node requires)
Port: Vite dev → :5173, Express API → :3001
DB: ./data/workbench.sqlite
```

---

## Git State

3 commits:
1. `aa95218` Initial commit: FCP Workbench + pre-launch audit fixes (H1-H8)
2. `70f8ddc` Fix API key banner showing on server startup race condition
3. `baad67a` Fix server crash: move dotenv load before module imports (ESM ordering bug)

*All recent session changes are uncommitted (EngagementQualityGate fix, i18n changes, vite.config changes, etc.)*
