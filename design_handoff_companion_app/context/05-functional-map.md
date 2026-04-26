# 05 — Functional Map

The bridge between architectural concepts (documented in `CLAUDE.md` + the whitepaper) and the **visual surfaces a designer needs to understand**. One page. Mental model first, route second.

---

## The shell

Every authenticated route is wrapped in `MainLayout` → `Sidebar` (left) + `Header` (top) + `<Outlet>` (the route content).

The **`Sidebar` is pillar-aware**: its content swaps based on `useSettingsStore.appMode` (`work` / `school` / `life` / `pathfinder` / `markets` / `community` / `payments`). The user changes pillar via the App Mode toggle in `Header`. There is no URL-based pillar router — `appMode` is in localStorage.

The **`Header` carries the theme switcher** (sun / moon / building icons cycle dark → light → corporate). Notification bell + profile menu live here. Brand mark in the sidebar logo box is locked to the deep teal (`#0D7D6C`) regardless of theme.

---

## Where the cross-cutting capabilities show up

### IRE (Iterative Reasoning Engine)
Used as a quality+depth chain across long-running flows. Visible in:
- `ModulePage` — when `thinking_level` is `investigate` or `plan_first`, the right pane shows the IRE phase indicator (`ireCurrentPhase` / `ireTotalPhases` / `ireCurrentPhaseName`) above the streaming output.
- `MissionDashboardPage` — task graph view with IRE status per task.
- `BeehivePage` — multi-participant deliberation that uses an IRE-style consensus loop; surfaced as `ConsensusGauge` + `RoundNavigator`.
- `AICouncilPage` — three-model jury for high-stakes decisions; IRE chains across the council's responses.

### Knowledge atoms
- Created automatically by every module run (when `atomCollectionEnabled` is true in `useSessionStore`).
- Visible as a sidebar in `ModulePage` (the `InjectedAtomsPanel` shows which atoms were referenced in the current run).
- Editable in `KnowledgePage`, `KnowledgeBasePage`, `KnowledgeGraphPage`.
- Cross-pillar visible in Markets via `MarketAtomsPage` + on every `MarketThesisDetailPage` ("supporting atoms" section).
- **Not surfaced** in: companion app (atoms are a desktop concept), most Life sub-pillars (News / Travel / Finance treat atoms as opaque infrastructure).

### Personas + Skills
- Both are pickers in `ModulePage` (left pane, alongside model + thinking + creativity).
- Skill catalogue at `/skills` (`SkillsLibrary`), `/skill-packs` (`SkillPacksPage`).
- Persona catalogue at `/coworkers` (`CoworkerGallery`).
- Specialized agents (Layer 4) at `/agents` (`AgentHubPage`) — full agent profile with persona + skill + connector + escalation.

### Earned autonomy
- Configured per Atlas in the Risk Atlas setup wizard (`RiskAtlasSetupPage` step 3 — Socratic / Draft / Expert / Autonomous).
- Visible as a mode badge on the Atlas workspace header.
- Promoted via Mission progression (`MissionDashboardPage` shows current trust level).
- Not yet surfaced as a global "autonomy progression" badge — each surface owns its own state.

### Output formats + export
- 40+ output formats picked **before** running a module (`OutputFormatSelector` in `ModulePage` left pane).
- After the run, `ExportBar` + `OutputToolbar` offer md/docx/xlsx/pdf/pptx/fountain.
- The Risk Atlas `Dashboard` tab exposes its own `ExportRow` (board pack DOCX, threat-path PDF, heatmap SVG, .anton bundle).
- Markets `MarketThesisDetailPage` exports board-ready PDFs.

### Multi-LLM / model selection
- `ModelSelector` in every module run config.
- Provider-specific surfaces: `/settings/azure-openai` for Azure OpenAI deployments; Ollama is implicit (auto-detected).
- Recommendation banner: `ModelRecommendationBadge` + `SmartModelBanner` highlight the right model for the current task.

### Quality Ratchet
- Score appears as `QualityIndicatorBar` in `ModulePage` after a run.
- Historical trend at `/quality` (`QualityPage`).
- Per-module trend in `SystemCardsPage`.
- Atlas board pack scoring at `RiskAtlasWorkspacePage` Dashboard tab.

---

## Where the major UI primitives live

### Sidebar
- Collapsed / expanded toggle in the top-left.
- Pillar switcher inline (App Mode toggle).
- Per-pillar nav items, each tagging into a `NavLinkWithStar` — favourited routes get a star.
- The **Risk module group** in the Work sidebar contains the Atlas — `AtlasMigrationBanner` cross-cuts onto legacy FCP module pages to redirect users to it.

### Command palette
- ⌘K / Ctrl-K → `CommandPalette` (`src/components/shared/CommandPalette.tsx`). Global on `MainLayout`. Routes + recent sessions + module search.

### FAB / quick actions
- Companion app only — `QuickActionsFab` at bottom-centre (Voice / Capture / Ask / Approvals / Switch instance).
- Desktop ANTON has **no FAB** — actions live in the module page or sidebar.

### Bottom sheets
- Companion app — `BottomSheet` + `InstanceSwitcher` + `QuickActionsFab` menu + ApprovalsScreen detail.
- Desktop ANTON — uses **modals + side drawers** instead of bottom sheets (e.g., `ImportModuleModal`, `ExportModuleModal`, `CreateCollectionModal`). No bottom-sheet primitive exists in `src/components/`.

### Notifications
- Desktop — `NotificationDropdown` in `Header` (bell icon).
- Companion — push-driven, surfaced through `ApprovalsScreen` deep links + the `Approvals` tab badge.

---

## Where the orgs and projects show up

- A **project** scopes a session to a folder of files + members (`ProjectsPage`, `ProjectFiles`, `ProjectMembers`, `ProjectNotes`). Every module run can be project-scoped.
- An **engagement** is a multi-phase consulting workflow with its own workspace (`EngagementWorkspacePage`). Sits above projects.
- An **org** (in companion-app terminology, `connected_user_orgs`) is the multi-tenant container. Companion-app users belong to one or more orgs; desktop users belong to one tenant.
- **Pinned org context** appears as `OrgContextPanel` + `ProjectContextBanner` at the top of module pages when active.

---

## Where the data partnerships surface

- **Roaring** (Nordic entity data) — `/roaring` (`RoaringSearchPage`) + `RoaringEntityCard` rendered inline in entity-aware modules.
- **Dow Jones** — `/dj-screening` (`DJScreeningPage`) + `DJScreeningPanel` inline in sanctions / KYC modules.
- **Both visible in** `EntityIntelligencePage` (`/entity-intelligence`) which composes them with internal data.

---

## Where the autonomy + governance surfaces live

- **Audit log** — `/audit` (`AuditLogPage`).
- **Governance dashboard** — `/governance` (`GovernanceDashboard`) — meta-view of model usage, quality trends, escalations.
- **System cards** — `/system-cards/[:moduleId]` — auto-generated module documentation à la Anthropic system cards.
- **Compliance posture** — `/compliance-posture` (`CompliancePosturePage`) — RAG-style red/yellow/green per FCP domain.
- **Risk appetite dashboard** — `/risk-appetite` (`RiskAppetiteDashboard`) — board-level appetite tracking.
- **Risk Atlas** — `/atlas/*` — the methodology that powers the appetite + posture surfaces.
- **Lore Ledger** — `/lore-ledger` (`LoreLedgerPage`) — append-only "things ANTON learned" log.

---

## Where the human-in-the-loop gates appear

- **`HumanOversightGate`** — wraps actions in `MissionDashboardPage`, `AntonTaskAgentPage`, autonomous flows. Renders an "approve / reject / modify" inline UI.
- **Mission inbox** — `/missions/inbox` — the desktop equivalent of the companion app's `ApprovalsScreen`. Same data model (`app_checkpoints` + companion app pulls via `/api/app/checkpoints/*`); different chrome.
- **Atlas integrity findings** — `RiskAtlasWorkspacePage` Dashboard tab `IntegrityFindingsSection` — Compliance-as-Code rule violations.
- **Quality Ratchet score** — `ModulePage` post-run, with regression warnings.

---

## How the pillars relate

```
                      ┌────────── App Mode toggle ──────────┐
                      │                                       │
   ┌──── Work ────┐ ┌── School ──┐ ┌── Life ──┐ ┌─ Pathfinder ─┐
   │ 80+ routes  │ │ 22 routes  │ │ 20 routes│ │  2 routes     │
   │ ModulePage   │ │ Student +  │ │ News /   │ │ Smart action  │
   │ Engagements  │ │ Teacher    │ │ Finance /│ │ bar           │
   │ Coding       │ │ paths      │ │ Travel   │ │               │
   └──────────────┘ └────────────┘ └──────────┘ └───────────────┘

   ┌── Markets ───┐ ┌─ Community ┐ ┌── Payments ──┐
   │ 23 routes    │ │ 24 routes  │ │ FutureChain   │
   │ Theses /     │ │ E2E msg /  │ │ wallet +      │
   │ atoms /      │ │ Beehive    │ │ marketplace   │
   │ patterns     │ │            │ │               │
   └──────────────┘ └────────────┘ └───────────────┘

   ┌─ Risk Atlas ─┐ ┌── Missions ─┐ ┌── Agents ────┐  (cross-cutting)
   │ /atlas/*     │ │ /missions/* │ │ /agents      │
   └──────────────┘ └─────────────┘ └──────────────┘

   ┌── Procure ──┐ ┌── Civic ──┐ ┌── Grow ──┐ ┌── Talent ──┐  (under Work today)
   └─────────────┘ └───────────┘ └──────────┘ └────────────┘
```

The **companion app** sits next to all of this — same database, different surface — see `04-companion-app-surfaces.md`.

---

## Things Claude Design needs to know that aren't a route

- **Three themes share token names** — `--color-adv-teal` resolves differently in dark / light / corporate. A designer who replaces a colour anywhere needs to update three OKLCH triples.
- **No shadcn primitives layer** — see `02-component-inventory.md`. Pages compose with raw Tailwind utilities. A consistent `Button` / `Input` / `Card` primitive set would be the largest visible quality lift Claude Design could propose.
- **Inter is the base font, Montserrat for corporate-mode headings.** No self-hosted font files yet.
- **Most surfaces are dense** by intent — ANTON's users are professionals who want information density (Linear / Raycast bar). Resist pressure to add whitespace where it would reduce the per-screen signal.
- **Light mode is the daily driver** — capture light, audit light, design for light. Dark + corporate are valid but secondary.
