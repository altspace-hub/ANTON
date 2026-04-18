# 06 — Screenshot Capture List

**For Daniel.** Walk this list top-to-bottom. Confirm light theme is active before each capture (theme switcher in `Header` — click the sun until you see the sun icon, or check `localStorage.openexpert-theme === 'light'`).

Save into `design-export/screenshots/` with the suggested filenames.

**Format target:** PNG, 2× DPR if your display supports it (Mac: ⌘⇧4 then drag, or use a browser extension). Window width ≥ 1440px so the full sidebar + main pane is captured.

---

## 0 — Pre-flight

- [ ] `pnpm run dev` running (`http://localhost:5173/`)
- [ ] Logged in (`pnpm run db:init` if first run; create the dev user via Settings)
- [ ] Theme = **light** (Header → sun icon visible)
- [ ] Pillar = **Work** (default)
- [ ] At least one Atlas exists (the `/atlas/new` wizard takes 90 seconds; pick `sme-general`)
- [ ] At least one Project + one Engagement exists
- [ ] At least one mission has been kicked off (use `tmpl_knowledge_synthesis_v1` — fastest)

---

## 1 — Shell + chrome (3 captures)

- [ ] **Dashboard with sidebar expanded**
  Route: `/`
  State: After login, default landing.
  File: `screenshots/01-shell-dashboard.png`

- [ ] **Sidebar collapsed**
  Route: `/` (toggle the sidebar with the chevron)
  File: `screenshots/01-shell-sidebar-collapsed.png`

- [ ] **Command palette open**
  Route: `/` then ⌘K (Mac) / Ctrl-K (Win/Linux)
  State: Empty input — show the recent + suggested rows.
  File: `screenshots/01-shell-command-palette.png`

---

## 2 — Work pillar (5 captures)

- [ ] **Module page — configuration pane fresh**
  Route: `/module/gap-analysis` (or any module — gap analysis is a good showcase)
  State: Fresh load, no run yet. All four panels visible (knowledge sources, output formats, thinking controls, model + creativity).
  File: `screenshots/02-work-module-config.png`

- [ ] **Module page — mid-stream output with thinking expanded**
  Same route, after clicking "Run". Capture mid-stream so the streaming spinner is visible AND the "How ANTON Thought" panel is expanded.
  File: `screenshots/02-work-module-streaming.png`

- [ ] **Engagement workspace — first phase**
  Route: `/engagements/:id` (use the engagement you created)
  State: First tab active (Scope Agreement).
  File: `screenshots/02-work-engagement.png`

- [ ] **Coding large project**
  Route: `/coding/large/project/:id`
  State: With a release in progress so the file manifest + execution plan are populated.
  File: `screenshots/02-work-coding-large.png`

- [ ] **Deadlines kanban view**
  Route: `/deadlines`
  State: Switch to Kanban view; have at least 3-4 deadlines across columns.
  File: `screenshots/02-work-deadlines-kanban.png`

---

## 3 — Risk Atlas (4 captures — important; this is the freshest pillar)

- [ ] **Atlas landing**
  Route: `/atlas`
  State: With your created Atlas listed.
  File: `screenshots/03-atlas-landing.png`

- [ ] **Atlas setup wizard step 3**
  Route: `/atlas/new` (walk to step 3 — choose mode)
  File: `screenshots/03-atlas-wizard-mode.png`

- [ ] **Atlas workspace — Dashboard tab**
  Route: `/atlas/:id` (click an existing Atlas)
  State: Dashboard tab. Should show stats, integrity findings, cross-domain bundles, exports row, quality score card.
  File: `screenshots/03-atlas-workspace-dashboard.png`

- [ ] **Atlas workspace — Threat Paths tab with heatmap + cards**
  Same route, switch to Threat Paths tab. Have at least 3 paths with residual scores so the heatmap has dots.
  File: `screenshots/03-atlas-workspace-paths.png`

---

## 4 — School pillar (3 captures)

- [ ] **Student dashboard**
  Route: `/school` (switch App Mode → School first)
  State: Today's assignments + course progress.
  File: `screenshots/04-school-student-dashboard.png`

- [ ] **Student chat in Läxhjälp mode**
  Route: `/school/chat`
  State: Toggle Läxhjälp mode; ask a question; capture the hint-style response.
  File: `screenshots/04-school-chat-laxhjalp.png`

- [ ] **Teacher oversight**
  Route: `/school/teacher/oversight`
  State: With at least one student session in the log.
  File: `screenshots/04-school-teacher-oversight.png`

---

## 5 — Life pillar (3 captures)

- [ ] **Life landing**
  Route: `/life` (switch App Mode → Life)
  File: `screenshots/05-life-landing.png`

- [ ] **News feed with truth-check chips**
  Route: `/news/feed`
  State: With at least 5 stories so the bias / truth indicators are visible.
  File: `screenshots/05-life-news-feed.png`

- [ ] **Travel planner mid-itinerary**
  Route: `/travel/planner`
  State: With a partial trip drafted.
  File: `screenshots/05-life-travel-planner.png`

---

## 6 — Pathfinder (1 capture)

- [ ] **Pathfinder result panel after a query**
  Route: `/pathfinder` (switch App Mode → Pathfinder)
  State: Type a query, wait for results — capture with sources visible.
  File: `screenshots/06-pathfinder-results.png`

---

## 7 — Markets pillar (4 captures — biggest pillar by surface count)

- [ ] **Markets dashboard**
  Route: `/markets` (switch App Mode → Markets)
  File: `screenshots/07-markets-dashboard.png`

- [ ] **Thesis detail with why-chain**
  Route: `/markets/theses/:id` (click any thesis)
  File: `screenshots/07-markets-thesis-detail.png`

- [ ] **Index detail**
  Route: `/markets/indexes/:id` (click any ANTON 100 index)
  File: `screenshots/07-markets-index-detail.png`

- [ ] **Pattern detection**
  Route: `/markets/patterns`
  State: With at least 3 patterns listed so confidence bars are comparable.
  File: `screenshots/07-markets-patterns.png`

---

## 8 — Community pillar (3 captures)

- [ ] **Community landing**
  Route: `/community` (switch App Mode → Community)
  File: `screenshots/08-community-landing.png`

- [ ] **Beehive session in progress**
  Route: `/community/beehive/:id` (open a hive — start a quick test one if needed)
  State: Mid-round, contributions visible, consensus gauge populated.
  File: `screenshots/08-community-beehive-session.png`

- [ ] **Capability card**
  Route: `/community/capability-card`
  File: `screenshots/08-community-capability-card.png`

---

## 9 — Sub-pillars (Procure / Civic / Grow / Talent / Agents) (5 captures)

- [ ] **Procure cycle detail**
  Route: `/procure/cycle/:cycleId` (or `/procure` if no cycle exists)
  File: `screenshots/09-procure-cycle.png`

- [ ] **Civic engagement detail**
  Route: `/civic/engagement/:engagementId` (or `/civic`)
  File: `screenshots/09-civic-engagement.png`

- [ ] **Grow pipeline kanban**
  Route: `/grow/pipeline`
  File: `screenshots/09-grow-pipeline.png`

- [ ] **Talent campaign detail**
  Route: `/talent/campaign/:campaignId` (or `/talent`)
  File: `screenshots/09-talent-campaign.png`

- [ ] **Agent hub**
  Route: `/agents`
  File: `screenshots/09-agent-hub.png`

---

## 10 — Missions (3 captures)

- [ ] **Missions list**
  Route: `/missions`
  State: At least one running, one completed.
  File: `screenshots/10-missions-list.png`

- [ ] **Mission inbox**
  Route: `/missions/inbox`
  State: With at least one pending checkpoint.
  File: `screenshots/10-missions-inbox.png`

- [ ] **Mission dashboard with task graph**
  Route: `/missions/:id`
  State: Mid-mission so task graph + budget monitor are populated.
  File: `screenshots/10-mission-dashboard.png`

---

## 11 — Payments / FutureChain (2 captures)

- [ ] **FC dashboard**
  Route: `/futurechain` (switch App Mode → Payments)
  File: `screenshots/11-fc-dashboard.png`

- [ ] **Marketplace**
  Route: `/futurechain/marketplace`
  File: `screenshots/11-fc-marketplace.png`

---

## 12 — Settings + admin (2 captures)

- [ ] **Settings**
  Route: `/settings`
  State: Open the Theme tab so the three theme cards are visible.
  File: `screenshots/12-settings.png`

- [ ] **App Gateway (admin pairing)**
  Route: `/app-gateway`
  State: Open the "Generate enrollment QR" flow — capture with a QR visible.
  File: `screenshots/12-app-gateway-qr.png`

---

## 13 — Companion App (most important — 8 captures)

For the companion app you have two options:
- **Browser PWA** — open `http://localhost:5173/app/` in a phone-sized viewport (Chrome DevTools → Responsive → 390×844 iPhone preset).
- **Real device** — install the PWA via the prompt or sideload the APK.

Confirm light theme is active in companion settings.

- [ ] **Welcome screen**
  Route: `http://localhost:5173/app/`
  State: First-launch — no instances paired.
  File: `screenshots/13-app-welcome.png`

- [ ] **Pairing — QR scanner**
  State: Tap "Pair with my ANTON" → scanner active. Use the desktop `/app-gateway` page on another monitor / laptop to generate a QR to point the camera at (or trigger the manual-entry mode).
  File: `screenshots/13-app-pair-scanner.png`

- [ ] **Pairing — confirmation code prompt**
  State: After scanning a QR that requires a code, the manual form should show the 6-digit input. (Pre-bind an enrollment to your user via the admin flow to trigger this.)
  File: `screenshots/13-app-pair-confirmation-code.png`

- [ ] **Workspace home with InstanceTopBar**
  State: After pairing — capture with the green status dot visible in the top bar.
  File: `screenshots/13-app-home-instancebar.png`

- [ ] **InstanceSwitcher bottom sheet**
  State: Pair with at least 2 instances; tap the InstanceTopBar; capture the open sheet.
  File: `screenshots/13-app-instance-switcher.png`

- [ ] **ApprovalsScreen with at least one critical + one normal**
  State: Trigger 2 checkpoints from the desktop side (e.g., via `POST /api/admin/app/checkpoints`). Capture the inbox.
  File: `screenshots/13-app-approvals-list.png`

- [ ] **ApprovalsScreen detail sheet with biometric prompt visible**
  State: Tap a critical approval → tap Approve → biometric prompt fires.
  File: `screenshots/13-app-approval-detail.png`

- [ ] **VoiceMode listening**
  State: Tap the FAB → Voice → hold to talk. Capture mid-listen so the captions popover is filled.
  File: `screenshots/13-app-voice-mode.png`

- [ ] **QuickActionsFab menu open**
  State: Tap the FAB; capture the bottom sheet with all five tiles visible (badge on Approvals if any pending).
  File: `screenshots/13-app-fab-menu.png`

- [ ] **Capture page**
  Route: tap Capture tab → take a photo of any document.
  State: Preview shown; intent picker visible.
  File: `screenshots/13-app-capture-preview.png`

---

## 14 — States to capture across surfaces (1 capture each, optional but high-value)

- [ ] **Empty state — Atlas with no threat paths yet** (if you have time)
  File: `screenshots/14-state-empty-atlas.png`

- [ ] **Loading state — Module mid-thinking** (already covered in 02 if you caught it)

- [ ] **Error state — Disconnected instance in companion app**
  State: Stop the dev server; observe the red dot + queued banner.
  File: `screenshots/14-state-disconnected-companion.png`

- [ ] **Long-output state — Markets thesis with full why-chain expanded** (already in 07)

---

## 15 — Theme variants (optional but useful for Claude Design)

If you want Claude Design to see the dark + corporate variants too, repeat captures 1-3 (Dashboard / Module / Atlas dashboard) in each theme:

- [ ] `screenshots/15-dark-dashboard.png`
- [ ] `screenshots/15-dark-module.png`
- [ ] `screenshots/15-dark-atlas-dashboard.png`
- [ ] `screenshots/15-corporate-dashboard.png`
- [ ] `screenshots/15-corporate-module.png`
- [ ] `screenshots/15-corporate-atlas-dashboard.png`

These are nice-to-have. Light mode is the iteration target.

---

## Counts

- **Required:** ~50 captures across 13 sections (sections 0-13 + section 14's first item).
- **Optional:** 7 more for full theme + state coverage.
- **Estimated time:** 90 minutes if the data is set up; 3 hours if you have to seed the orgs / projects / atlas / mission / approvals first.

---

## When done

1. Verify every file in `screenshots/` matches a checkbox above.
2. Note any surface where light mode looked broken — flag that in `00-README.md` Addendum so Claude Design knows the as-shipped state.
3. Bundle the entire `design-export/` folder (markdown + screenshots) and upload to Claude Design.
