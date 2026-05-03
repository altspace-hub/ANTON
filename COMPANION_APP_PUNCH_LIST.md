# Companion App Punch List — May 3 2026 IRE Pass

Source: 4-agent expert audit on 2026-05-03. **221 findings** (22 BLOCKER, 80 HIGH, 91 MEDIUM, 28 LOW). Working from this list; status updated inline. ✅ = done + verified on device, 🔧 = in progress, ⬜ = open, 💀 = deleted as dead code, ❎ = won't fix (out of scope / disagreed).

---

## EXECUTION ORDER (BLOCKERS first, by dependency)

| # | Cluster | Severity | Why first |
|---|---|---|---|
| 1 | Keystore + password in repo | BLOCKER · security | Anyone with repo access can sign as us. Rotate immediately. |
| 2 | ProGuard rules empty | BLOCKER · release-crash | Next release build will crash on first plugin call. |
| 3 | Tasks / Schedule / Wallet data wiring | BLOCKER · 3 broken screens | Single-pattern fix: add 3 gateway adapters. Restores 3 More-tiles. |
| 4 | 6 components on legacy `bg-adv-*` | BLOCKER · white-on-white | Visible breakage. 2 are dead-code (delete), 4 need migration. |
| 5 | Push permission gap (legacy pair) | BLOCKER · Play Store policy | Move runtime prompt out of pair-gated branch. |
| 6 | HTTPS deep-link filter | BLOCKER · pairing-url.ts contract | Add `<intent-filter android:autoVerify="true">`. |
| 7 | StdSettingsScreen non-functional rows | BLOCKER · misleading affordance | Wire onClick or remove chevron. |
| 8 | InstanceSwitcher / VoiceMode back-handler + interval leak | BLOCKER | Register back handler + clean interval. |
| 9 | CapturePage uploads full-resolution photos | BLOCKER · spec violation | Resize to 2048px @ 70% client-side. |
| 10 | App.tsx push-vs-session race | BLOCKER · push 401 on cold start | Gate `registerPush()` on session ready. |

After BLOCKERS, sweep HIGH cluster fix-templates (one PR each):
- ✅ A: shared `<ErrorPill>` retiring 14+ silent catches → DONE
- ✅ B: cancellation flags / AbortController across all data-fetch effects → DONE (cancellation flags); AbortSignal at api.ts deferred
- ✅ C: `<Spinner size>` primitive retiring 20+ inline copies → DONE (17 sites migrated)
- ✅ D: form `<label htmlFor>` migration → DONE (5 forms; SectionLabel extended)
- ✅ E: `prefers-reduced-motion` wrap in `app.css` → DONE
- ✅ F: focus-trap hook for all modals (4 components) → DONE (BottomSheet, InstanceSwitcher, VoiceMode, DetailSheet)
- ✅ G: touch-target sweep (7 icon buttons under 44dp) → DONE (9 buttons in 5 files + 4 inert top-bar Ico icons)
- 🔧 H: `<PageHeader>` adoption → PARTIAL (U17 3-page harmonization). Tab-mode PageHeader variant is a follow-up.

---

## BLOCKERS (22)

### Security & build
- ❎ **B1** — *FALSE POSITIVE.* Audit assumed committed because files exist on disk; `android/.gitignore` correctly excludes `*.keystore` + `keystore.properties`. `git ls-files` returned nothing; password never appears in history. No security incident.
- ✅ **B2** — `proguard-rules.pro` filled with keep rules for Capacitor + 14 plugins + ML Kit + WebView. Verified: release APK builds successfully (25MB) with `minifyReleaseWithR8` task.

### Data wiring (3 screens, 1 pattern) — verified end-to-end on device
- ✅ **B3** — Added `GET/POST /api/app/org/:orgId/tasks` to `app-gateway.ts:1608+`; `TaskScreen` switched to `getOrgTasks` + `createOrgTask`. Schema fix: `description NOT NULL` → defaults to title. Tested on device: list + add round-trip works.
- ✅ **B4** — Added `GET /api/app/org/:orgId/deadlines/morning-brief`. `ScheduleScreen` switched. Renders "PTD Presentation / Overdue · 2026-04-14 / HIGH" on device.
- ✅ **B5** — Added `GET /api/app/org/:orgId/wallet` (bundles wallets + transactions). `WalletScreen` switched. Plus `formatFtc()` helper coerces NUMERIC strings (B20 covered).

### Legacy `bg-adv-*` migration / deletion
- 💀 **B6** — `OrgHomePage.tsx` deleted (verified zero imports across `src/app/`).
- 💀 **B7** — `ConnectionStatus.tsx` deleted (verified zero imports).
- ✅ **B8** — `InstanceSwitcher.tsx` rewritten with `var(--color-*)` tokens, `Ico` for icons, 44×44 unpair button (covers B21).
- ✅ **B9** — `VoiceMode.tsx` migrated to light tokens + `role="dialog"` + `aria-label` + `Ico` for close/mic.
- ✅ **B10** — `VoiceInput.tsx` migrated to tokens + `Ico` for mic + `aria-pressed` + `role="status"` on captions.
- ✅ **B11** — `ReasoningDrawer.tsx` rewritten with tokens, lifted to 12px @ 100% opacity, `Ico` for chevron.

Bonus: 💀 `services/socket.ts` deleted (FL1 — dead WebSocket client, ~110 lines).

### Push & permissions
- ✅ **B12** — Added standalone `requestPushPermission()` in `push.ts`. `App.tsx` now branches: legacy pair → permission only; modern pair → permission + token registration.
- ✅ **B13** — Server now returns `vapid_public_key: process.env.VAPID_PUBLIC_KEY || null` from `/api/app/instance-info`. Web-push works when env var set, gracefully unsupported otherwise.
- ✅ **B14** — `App.tsx` `registerPush()` now gated on `getSessionToken() !== null` to avoid racing the cold-start bridge.

### Manifest / deep-link
- ✅ **B15** — Added `<intent-filter android:autoVerify="true">` for `https://*/anton/enroll|join` paths. App Links chooser-free when instance hosts `/.well-known/assetlinks.json`.

### Misleading affordances
- ✅ **B16** — `StdSettingsScreen` non-functional rows: removed chevronRight icon. Rows now read as informational, not actionable.

### Lifecycle leaks
- ✅ **B17** — `InstanceTopBar`: dropped wasteful `key={tick}` on `InstanceSwitcher` (was remounting subtree every 30s ping). Original interval cleanup was correct.
- ✅ **B18** — `App.tsx SUB_SCREENS` extended with `std_calendar|wallet|voice|settings`. Hardware back from those now bounces to home, not exit-prompt.

### Capture
- ✅ **B19** — `CapturePage.shoot()` now resizes to ≤2048px on longest edge at 70% quality before `toDataURL`.

### Wallet display
- ✅ **B20** — Covered by B5 (`formatFtc()` helper handles NUMERIC string coercion at all 4 sites).

### Tracking / dead UX
- ✅ **B21** — Covered by B8 (44×44 unpair button + `aria-label` + `Ico name="x"`).
- ✅ **B22** — `push.ts registerNative()` rewritten: handles awaited up-front, listeners cleaned up synchronously via shared `cleanup()` closure; no more handle-resolved-after-fire race.

---

## BLOCKER VERIFICATION SUMMARY (2026-05-03 IRE round)

| Method | Findings | Notes |
|---|---|---|
| Live on device | B3, B4, B5, B8, B12, B17, B18 (analog), Approvals tab | Captured in `.live-walk/v15-*.png` and `v16-*.png` |
| Code review | B11, B14, B15, B16, B19 | Pure structural fixes, no UI state to trigger |
| Build verified | B2 | Signed release APK 25MB built successfully with R8 |
| Inadvertent | B17, B18 (settings), Approvals tab | Confirmed during other tests |
| Deleted as dead | B6, B7, FL1 | Verified zero imports first |
| False positive | B1 | Keystore was always gitignored |

**1 NEW HIGH discovered during verification** → B23 (InstanceSwitcher missing back-handler).

- ✅ **B23 (NEW, post-audit)** — `InstanceSwitcher.tsx` doesn't use `BottomSheet` primitive so didn't auto-register a back-handler. Added `useEffect → registerBackHandler(onClose)` gated on `open`. Discovered during B8 verification when hardware back from open switcher fell through to App-level exit prompt.

---

## HIGH (80)

### UX (23)

- ⬜ **U1** — `OrgHomePage.tsx:38-42, 121` — emoji intent icons (`💬📖❓📄🔍📅👥🛡️❤️💼🎓🌍`). Map to `Ico` names.
- ⬜ **U2** — `SchoolFeedScreen.tsx:81, 143, 155` — `🔥📶🎧` glyphs in Pills. Use `Ico` or text-only.
- ⬜ **U3** — `PersonalizePage.tsx:128-133` + `StdSettingsScreen.tsx:188-194` — `✓` Unicode in active swatches. Use `<Ico name="check" />`.
- ⬜ **U4** — `StdSettingsScreen.tsx:100, 130` — "✓ In use" plain text. Use Ico.
- ⬜ **U5** — `EmailSetupScreen.tsx:150` — `✓`/`✕` glyphs. Use Ico.
- ⬜ **U6** — `SearchScreen.tsx:218` — `✓` glyph in 12px pill. Use Ico.
- ⬜ **U7** — `OrgHomePage.tsx:140-141, 162` — inline `<svg>` for chat-icon + chevron. Use Ico.
- ⬜ **U8** — `InstanceSwitcher.tsx:121` — inline `<svg>` for unpair X. Use Ico.
- ⬜ **U9** — `VoiceMode.tsx:156-157, 190-193` — two inline SVGs (close + mic). Use Ico.
- ⬜ **U10** — `ConnectionStatus.tsx` — `safe-top` mismatch with rest of app. Align to one approach.
- ⬜ **U11** — `WorkModulesScreen.tsx:138-176` — chip overlays use raw `rgba(255,255,255,0.18-0.30)`. Add `--color-on-accent-soft` token or use `color-mix`.
- ⬜ **U12** — `StdVoiceScreen.tsx:136-138` — composer overlays use raw rgba. Tokenise.
- ⬜ **U13** — `SchoolFeedScreen.tsx:127, 138-152` — progress dots + pill overlays use rgba. Tokenise.
- ⬜ **U14** — `OrgHomePage.tsx:73, 83` — 28px spinner + 36px back button. Use 24px + 44px. Plus bypasses PageHeader.
- ⬜ **U15** — `MarketsScreen.tsx:143-146` + `RadarScreen.tsx` + `CalendarScreen.tsx:103-106` + `UnifiedMailScreen.tsx:142-147` + `SchoolFeedScreen.tsx:60-63` + `WorkModulesScreen.tsx:106-110` — top-bar action icons rendered as inert `<Ico>`. Wrap in 44×44 `<button>`.
- ⬜ **U16** — 8 screens reimplement custom top bars with subtle drift. Adopt `PageHeader` (or extend it for tab pages).
- ⬜ **U17** — `TaskScreen.tsx:69` + `ScheduleScreen.tsx:43-45` + `WalletScreen.tsx:46-48` — 22px inline `<h1>` for tab pages, no PageHeader, no consistent style with sibling tab pages (24px elsewhere).
- ⬜ **U18** — `ApprovalsScreen.tsx:108-138` — custom inline `<header>` with Refresh button. Use PageHeader.
- ⬜ **U19** — `HomeScreen.tsx:140-160` — greeting `<h1>` is 26/700/-0.7, larger than every other tab page.
- ⬜ **U20** — `CapturePage.tsx:200-220` — custom 18px header + 40×40 back button. Use PageHeader, 44×44.
- ⬜ **U21** — `ChatPage.tsx:196-240` — reimplements PageHeader inline with streaming subtitle. Extract streaming-aware variant.
- ⬜ **U22** — `Std*Screen.tsx` (all 5) — px-18 padding diverges from 4px grid. Pick `px-4` or `px-5`.
- ⬜ **U23** — `SchoolFeedScreen.tsx:215-220` + `WorkModulesScreen.tsx:208-213` — pinned-card glyphs are 8×8 colored squares vs 32-44px MonogramTile elsewhere. Use MonogramTile.

### Functional (25)

- ⬜ **F1** — `TaskScreen.tsx:33,55` — `.catch(() => {})` swallows 401/403/network. Surface errors.
- ⬜ **F2** — `ScheduleScreen.tsx:33` — same silent-catch pattern.
- ⬜ **F3** — `WalletScreen.tsx:37` — `Promise.all().catch(() => {})` swallows both wallet + tx errors.
- ⬜ **F4** — `HomeScreen.tsx:102, 112, 122` — three sequential silent catches; permanent loading state if any 500s.
- ⬜ **F5** — `StdHomeScreen.tsx:69, 79` — same silent-catch pattern.
- ⬜ **F6** — `ChatPage.tsx:71` — silent on `getOrgProfile`. Show name="(failed to load)".
- ⬜ **F7** — `ChatPage.tsx:107` — silent on `getSessionDetail`. Show "Couldn't load — try again".
- ⬜ **F8** — `SessionHistoryPage.tsx:47` — silent on session-load. Distinguish "no sessions" from "load failed".
- ⬜ **F9** — `OrgHomePage.tsx:67` — `Promise.all().catch().finally()` — one failure cancels all three. Per-promise catch.
- ⬜ **F10** — `StdMailScreen.tsx:33` — bare await, no try/catch around `listMailInbox`. Wrap.
- ⬜ **F11** — `HomeScreen.tsx:170` — silent on `listPendingCheckpoints` polling. Stale badge forever.
- ⬜ **F12** — `ProfilePage.tsx:35` — silent on `updateProfile`. Surface save error.
- ⬜ **F13** — `ProfilePage.tsx:26` — silent on `getLanguages`. Pre-seed + retry hint.
- ⬜ **F14** — `ConnectionsPage.tsx:81` — silent on connections. Distinguish expired-session.
- ⬜ **F15** — `TaskScreen.tsx:29-35` — useEffect missing cancellation flag.
- ⬜ **F16** — `ScheduleScreen.tsx:26-35` — same.
- ⬜ **F17** — `WalletScreen.tsx:29-38` — same.
- ⬜ **F18** — `OrgHomePage.tsx:51-68` — same.
- ⬜ **F19** — `SessionHistoryPage.tsx:44-49` — same.
- ⬜ **F20** — `ProfilePage.tsx:26` — same.
- ⬜ **F21** — `ConnectionsPage.tsx:78-83` — same.
- ⬜ **F22** — `App.tsx:131-138` — instance-switch listener; queued tab-switch can fire setState on unmounted. AbortController per fetch.
- ⬜ **F23** — `StdHomeScreen.tsx:67` — push deep-link router assumes `setActiveTab('approvals')` (Pro tab). Route to `'std_thread'` in Standard mode.
- ⬜ **F24** — `StdWalletScreen.tsx:31, 37` — hardcoded SAMPLE_RECENT placeholders. Wire to real adapter once shipped.
- ⬜ **F25** — `StdSettingsScreen.tsx:31-34` — hardcoded settings rows ("Text size · Large", etc.) don't reflect state. Wire or remove chevron.

### A11y/Perf (24)

- ⬜ **AP1** — `InstanceSwitcher.tsx:64-110` — entire screen on legacy classes. (Same as B8.)
- ⬜ **AP2** — `ChatBubble.tsx:53-69` — accent-fg `#FFFFFF` on `--org-brand-color` override has no contrast guarantee. Validate at save time.
- ⬜ **AP3** — `ReasoningDrawer.tsx:21-32` — caption text 11px @ 60% opacity → unreadable. (Same as B11.)
- ⬜ **AP4** — `VoiceMode.tsx:154-213` — full-screen overlay missing `role="dialog"` + Esc key. (Adjacent to B9.)
- ⬜ **AP5** — `VoiceInput.tsx:178-203` — `disabled:opacity-25` invisible. Raise to 50%, add `aria-disabled`.
- ⬜ **AP6** — `CapturePage.tsx:202-209` — back button 36×36dp. (Same as U20.)
- ⬜ **AP7** — `StdMailScreen.tsx:60-62` — header search button unlabeled, ~32dp. `aria-label` + 44×44.
- ⬜ **AP8** — `StdCalendarScreen.tsx:76-90` — back + plus unlabeled, undersized.
- ⬜ **AP9** — `StdWalletScreen.tsx:46` — back undersized + unlabeled.
- ⬜ **AP10** — `StdThreadScreen.tsx:37-39` — back undersized + unlabeled.
- ⬜ **AP11** — `SchoolFeedScreen.tsx:121-130` + line 81 — emoji icons w/o aria-label. Wrap aria-hidden + sr-only sibling.
- ⬜ **AP12** — `OrgHomePage.tsx:38-42, 121` — emoji-only intent icons w/o aria-hidden.
- ⬜ **AP13** — `SearchScreen.tsx:218-219, 247-251` — citation `<sup>` look clickable but aren't. Make buttons or restyle.
- ⬜ **AP14** — `JoinPage.tsx:303` — bare `<video>` w/o aria-label. Wrap `role="img"`.
- ⬜ **AP15** — `CapturePage.tsx:229-235` — bare camera viewfinder ditto.
- ⬜ **AP16** — `QuickActionsFab.tsx:108-121` — badge count not announced. Include in parent aria-label.
- ⬜ **AP17** — `HomeScreen.tsx:96-125` — three sequential awaits in one IIFE. `Promise.all`.
- ⬜ **AP18** — `ConnectionsPage.tsx:78-83` — getConnections has no abort. AbortController.
- ⬜ **AP19** — `SettingsPage.tsx:32-36` — Object URL revoked synchronously after `a.click()`; broken downloads on slow devices. setTimeout 1-2s revoke.
- ⬜ **AP20** — `UnifiedMailScreen.tsx:74-84` — second useEffect refetches on every filter change w/o abort. AbortController per call.
- ⬜ **AP21** — `MarketsScreen.tsx:54` — Sparkline does Math.min/max + points string per render. `React.memo` + `useMemo`.
- ⬜ **AP22** — `RadarScreen.tsx:107-118` — `counts` useMemo deps `items.length` (stale on filter). Depend on `items`.
- ⬜ **AP23** — `InstanceTopBar.tsx:178` — `key={tick}` remounts InstanceSwitcher subtree every 30s. Drop key.
- ⬜ **AP24** — `App.tsx:163-175` — pending-approvals refresh fires on every `activeTab` change AND every 60s. Debounce or remove `activeTab` from deps.

### Android (8)

- ⬜ **AN1** — `api.ts:23,25-31,39` — `anton-companion-session` + `openexpert-token` JWT in plaintext localStorage. Spec §5.4 says secure-store canonical, localStorage mirror only.
- ⬜ **AN2** — `App.tsx:141-160` — `registerPush()` re-fires on every instance switch w/o de-dup. Cache last `(device_id, token)` pair.
- ⬜ **AN3** — `push.ts:43-47` — no rationale UI before runtime prompt. Show pre-prompt sheet on `prompt-with-rationale` status.
- ⬜ **AN4** — `capacitor.config.ts:60` — `allowMixedContent: true` in production. Build variant with release=false.
- ⬜ **AN5** — `ApprovalsScreen.tsx:66-72` — `?approval=` query read w/o validation. Regex against `cp_*` prefix.
- ⬜ **AN6** — `BottomSheet.tsx:34-113` — no drag-to-dismiss. Add Material 3 drag handler.
- ⬜ **AN7** — `push.ts:161-175` — cold-start notification tap can lose `data` (race vs WebView bridge). Also poll `getDeliveredNotifications()` once on first mount.
- ⬜ **AN8** — `CapturePage.tsx:91-97` — MediaStream not released on `appStateChange` background. Subscribe to App state.

---

## MEDIUM (91)

### UX (25)
- ⬜ **UM1** — `Spinner` inconsistency — 12/14/16/24/28px scattered, three different colour patterns. Build `<Spinner size>`.
- ⬜ **UM2** — `ApprovalsScreen.tsx:124-136` — Refresh inline-styled. Use `Btn variant="ghost" size="sm"`.
- ⬜ **UM3** — `ConnectionsPage.tsx:138-149` — Join pill inline-styled. Use `Btn` or `Pill`.
- ⬜ **UM4** — `RadarScreen.tsx:154-167` — Scan now inline-styled. Use `Btn`.
- ⬜ **UM5** — `TaskScreen.tsx:88-99` — Add inline-styled. Use `Btn`.
- ⬜ **UM6** — `ProfilePage.tsx:130-142, 146-156` — Save + Sign out inline-styled. Use `Btn variant="primary|danger"`.
- ⬜ **UM7** — `SettingsPage.tsx:106-161` — Delete-All-Data row sets bg + border to same red-dim → no contrast. Use red border or no border.
- ⬜ **UM8** — `StdHomeScreen.tsx:151-164` — "Review and approve" inline-styled. `Btn variant="primary" size="lg"`.
- ⬜ **UM9** — `StdWalletScreen.tsx:80-103` — Send/Receive inline-styled. `Btn` group.
- ⬜ **UM10** — `StdThreadScreen.tsx:99-107` — "Review and approve" inline-styled.
- ⬜ **UM11** — `PersonalizePage.tsx:155-160` + `SchoolFeedScreen.tsx:159-170` — link-style buttons inline. Use `Btn variant="ghost|primary"`.
- ⬜ **UM12** — `CalendarScreen.tsx:28` + `StdCalendarScreen.tsx:26` + `ConnectionsPage.tsx:41` — hardcoded `'#6A3E8F'` plum. Add `--color-plum` + `--color-plum-dim` tokens.
- ⬜ **UM13** — `MonogramTile.tsx:26-32` — hardcoded hex for red/blue/gold/plum tones diverges from status tokens. Document or remap.
- ⬜ **UM14** — `CapturePage.tsx:226` — viewfinder `'#0A0A0A'` (true black). Add `--color-camera-bg` token.
- ⬜ **UM15** — `ChatPage.tsx:67` — magic-string compare against `'#2A6459'`. Expose constant.
- ⬜ **UM16** — `BottomSheet.tsx:68` + `ApprovalsScreen.tsx:276` — backdrop scrim hardcoded with two different tints. Add `--color-scrim`.
- ⬜ **UM17** — `useAndroidBackButton.ts:87-94` — toast styles inject raw rgba. Tokenise.
- ⬜ **UM18** — Page-content padding inconsistency: spec is `mx-auto max-w-2xl space-y-5 px-4 pb-10 pt-5`. Some screens use `space-y-6`, `pb-8`, or per-section `mx-4`. Standardise.
- ⬜ **UM19** — `MarketsScreen.tsx:213-219` + `RadarScreen.tsx` + `WorkModulesScreen.tsx:196-249` — inline `marginLeft:16, marginRight:16` instead of `mx-4`.
- ⬜ **UM20** — Title-size scale inconsistency across 10+ pages (16/20/22/24/26/28). Pick 3 sizes.
- ⬜ **UM21** — Body type drift across multiple pages (12/14/15/16/17). Spec is 13-15.
- ⬜ **UM22** — Mono micro-label tracking varies 0.3-0.8px inline. Adopt `SectionLabel` or extend with size variants.
- ⬜ **UM23** — `WelcomePage.tsx:184` — Pill style override `fontSize:10`. Remove.
- ⬜ **UM24** — `CalendarScreen.tsx:174, 224-225` + `SchoolFeedScreen.tsx:135-156, 238` — Pills sized to 9-10px inline. Add `Pill size="xs"` variant or align to 11.
- ⬜ **UM25** — `CapturePage.tsx:264-280` — bypasses `SectionLabel` primitive. Use it.

### Functional (23)
- ⬜ **FM1** — `MarketsScreen.tsx:222` — `(r.change_pct ?? 0) >= 0` defensive cast missing if string. Wrap `Number()`.
- ⬜ **FM2** — `TaskScreen.tsx:54` — `setTasks(d.tasks || d || [])` unsafe if `d` is `{}`. Guard with `Array.isArray`.
- ⬜ **FM3** — `ConnectionsPage.tsx:80` — `.then(setConnections)` no Array.isArray guard.
- ⬜ **FM4** — `ApprovalsScreen.tsx:154` — first-render shows nothing while `loading=true`. Add inline spinner.
- ⬜ **FM5** — `WelcomePage.tsx:39` — getLanguages skipped on Capacitor; never refreshes after pair. Re-fetch.
- ⬜ **FM6** — `WorkModulesScreen.tsx:200, 255` — pinned + browse buttons all `onNavigate('chat')`. Pass module id as prefilled prompt or deep-link.
- ⬜ **FM7** — `app-gateway.ts:1035-1052` — `/modules` returns hardcoded list, not derived from `MODULES` registry. Drive from `src/lib/constants.ts`.
- ⬜ **FM8** — `StdVoiceScreen.tsx:35-56` — orb's onClick sets `listening=true` without starting recognition. Either implement Web Speech wiring or remove orb.
- ⬜ **FM9** — `SchoolFeedScreen.tsx:208` — both ternary branches navigate to `'chat'`. Useless ternary; route by kind.
- ⬜ **FM10** — `StdThreadScreen.tsx:54-117` — composer `onClick={onOpenInPro}` on both Btn + mic. Either remove composer or wire to `query-sync`.
- ⬜ **FM11** — `StdHomeScreen.tsx:74` — Today list shows `[]` on error w/o cue. (Same pattern as F1-F14.)
- ⬜ **FM12** — `InstanceTopBar.tsx:50-62` — interval not cleared on `active?.id` change mid-flight. (Same as B17.)
- ⬜ **FM13-25** — see UX/A11y overlap above; consolidated under cross-cutting fix templates A-H.

### A11y/Perf (22)
- ⬜ **APM1** — `TabBar.tsx:54-119` — uses `<nav>` w/o `role="tab|tablist"` + `aria-controls`.
- ⬜ **APM2** — `ChatPage.tsx:212-222` — multiple `<h1>` per page-load lifetime. Use h2 in sub-screens.
- ⬜ **APM3** — `SchoolFeedScreen.tsx` + Markets/Radar/Calendar/Mail/Search/WorkModules — page title is `<div>` not `<h1>`.
- ⬜ **APM4** — `CapturePage.tsx:322-334` — textarea placeholder-only. Add label.
- ⬜ **APM5** — `TaskScreen.tsx:75-87` — input placeholder-only.
- ⬜ **APM6** — `SearchScreen.tsx:127-138` — query textarea placeholder-only.
- ⬜ **APM7** — `JoinPage.tsx:337-368` — three inputs use SectionLabel `<div>` not `<label htmlFor>`.
- ⬜ **APM8** — `ProfilePage.tsx:99-128` — name + language inputs same.
- ⬜ **APM9** — `SettingsPage.tsx:75-100` — error/loading divs render w/o `role="alert|status"` + `aria-live`.
- ⬜ **APM10** — `ApprovalsScreen.tsx:140-151` — error block is just colored div. `role="alert"`.
- ⬜ **APM11** — `BottomSheet.tsx:71-80` — `aria-modal="true"` set but no focus trap. Add hook.
- ⬜ **APM12** — `InstanceSwitcher.tsx:32-37` — same focus-trap omission.
- ⬜ **APM13** — `ApprovalsScreen.tsx:246-410` — DetailSheet missing focus management.
- ⬜ **APM14** — `app.css:172-199` — `fadeSlideIn|slideUp|fabPress|pulseDot` keyframes ignore `prefers-reduced-motion`.
- ⬜ **APM15** — Multiple files — `active:scale-[0.97-0.98]` ignores `prefers-reduced-motion`. Disable for media query.
- ⬜ **APM16** — `MonogramTile.tsx:67` — `aria-hidden="true"` removes initials. Verify parent button always has readable text.
- ⬜ **APM17** — `StdHomeScreen.tsx:107-115` — avatar button has only initials, no aria-label.
- ⬜ **APM18** — `StdSettingsScreen.tsx:188-195` + `PersonalizePage.tsx:128-141` — accent-swatch labels positioned absolute over color; light accents (gold/sunrise) may fail AA. Measure + darken or backdrop pill.
- ⬜ **APM19** — `MarketsScreen.tsx:95-114` + `RadarScreen.tsx:53-67, 71-85` — three useEffects w/o AbortController.
- ⬜ **APM20** — `ChatPage.tsx:243` — `behavior:'smooth'` on every stream chunk → nausea. `'auto'` during stream, `'smooth'` on final.
- ⬜ **APM21** — `ChatBubble.tsx:77` — ReactMarkdown re-parses every render. `React.memo`.
- ⬜ **APM22** — `Array.from({length:n})` keyed by index in SchoolFeedScreen + JoinPage. Acceptable but flagged.

### Android (21)
- ⬜ **ANM1** — `WelcomePage.tsx:71-75` — legacy join skips Ed25519 keypair when `crypto.subtle` missing. Fall back to `@noble/ed25519`.
- ⬜ **ANM2** — `signNonce()` ignores `_privateKeyHex` arg + reads from secure store but `JoinPage.tsx:208` still passes legacy localStorage blob. Cache + use, or remove arg + migrate explicitly.
- ⬜ **ANM3** — `instances.ts:133-138` — `setActiveInstance(id)` sync path racy w/ concurrent `addInstance`. Use `setActiveInstanceAsync` exclusively.
- ⬜ **ANM4** — `network_security_config.xml:11-14` — only `localhost` + emulator host whitelisted. RFC1918 LAN cleartext blocked. Add `192.168.0.0/16` etc.
- ⬜ **ANM5** — `AndroidManifest.xml:14` — `configChanges` includes `locale`; locale changes never re-render.
- ⬜ **ANM6** — `safe-top` double-padding hazard: `App.tsx:272` + `InstanceTopBar.tsx:83` (real double-pad). Pick single owner.
- ⬜ **ANM7** — `android/app/build.gradle:32-38` — release block missing `debuggable false` + `shrinkResources true`.
- ⬜ **ANM8** — `AndroidManifest.xml:5` — `allowBackup="false"` correct but missing `android:dataExtractionRules` for Android 12+.
- ⬜ **ANM9** — `AndroidManifest.xml:13-20` — `android:resizeableActivity` undeclared. Multi-window state changes leave stale `100dvh`.
- ⬜ **ANM10** — `MainActivity.java` is bare `extends BridgeActivity`. OK now; flag for future deep-link work.
- ⬜ **ANM11** — `build.gradle:62-68` — missing `google-services.json` swallowed silently. Push always emits `registrationError`. Surface toast + ship config.
- ⬜ **ANM12** — `splash.png` only in `drawable-port-hdpi` + `xhdpi`. Regenerate for all densities or use Android 12 Splash API.
- ⬜ **ANM13** — `BottomSheet.tsx:35-53` — body-scroll lock can leak with nested sheets/modals. Use ref-counted lock helper.
- ⬜ **ANM14** — `InstanceSwitcher.tsx:1-127` — no `registerBackHandler`. Android back exits app instead of dismissing sheet.
- ⬜ **ANM15** — `VoiceMode.tsx:41-54` — same omission.
- ⬜ **ANM16** — `instances.ts:131-132` + `JoinPage.tsx:224` — `setSecure('devcert:', '')` writes empty string vs null distinction. Skip empty writes.
- ⬜ **ANM17** — `enrollment.ts` server-side `INSTANCE_KEY_ENCRYPTION_KEY` env. Refuse pair if unsigned-server warning header present.
- ⬜ **ANM18** — `AndroidManifest.xml` — no `<queries>` element for Android 11+ package visibility. Share plugin needs it.
- ⬜ **ANM19** — `AndroidManifest.xml:92` — `RECEIVE_BOOT_COMPLETED` declared but no receiver. Remove or wire.
- ⬜ **ANM20** — `AndroidManifest.xml:60-63, 95-96` — `FOREGROUND_SERVICE_MICROPHONE` declared but service is generic WorkManager; type unused. Remove.
- ⬜ **ANM21** — `AndroidManifest.xml` root — no `installLocation="auto"`. APK install fails on low-storage.

---

## LOW (28)

### UX (6)
- ⬜ **UL1** — `HomeScreen.tsx:230-274` — quick-action tiles inline-styled. Extract `QuickActionTile` primitive.
- ⬜ **UL2** — `SearchScreen.tsx:23-25` — `citeColour` constant always returns accent. Remove.
- ⬜ **UL3** — `WorkModulesScreen.tsx:48-63` — `MODULE_GLYPH_HAS` reaches into MonogramTile internals. Export `hasModuleGlyph(id)`.
- ⬜ **UL4** — `StdMailScreen.tsx:60-63` + `StdCalendarScreen.tsx:88-90` — header icon buttons ~24dp. Wrap 44×44.
- ⬜ **UL5** — `StdSettingsScreen.tsx:74-105, 104-133` — ModeCard duplicated 30 lines. Extract primitive.
- ⬜ **UL6** — `BottomSheet.tsx:88-97` — sheet title 15/700 inline. Extract `SheetTitle`.

### Functional (5)
- ⬜ **FL1** — `socket.ts` (full file) — dead WebSocket client, 110 lines. Verify dead, delete.
- ⬜ **FL2** — `push.ts:50-63` — race in addListener Promise. (Same as B22.)
- ⬜ **FL3** — `MarketsScreen.tsx:222` — `change_pct` defensive cast. (Same as FM1.)

### Android (17)
- ⬜ **ANL1** — `identity.ts:159-173` — `lastNonce` module-level shared across instances. Per-instance nonce store.
- ⬜ **ANL2** — `JoinPage.tsx:40-47` — deep-link parsed only on first mount. Subscribe to `appUrlOpen`.
- ⬜ **ANL3** — `WelcomePage.tsx:39` — never re-fetches richer language list post-pair.
- ⬜ **ANL4** — `VoiceMode.tsx:69` — `removeAllListeners` kills sibling listeners. Hold per-listener handle.
- ⬜ **ANL5** — `capacitor.config.ts:38-42` — Keyboard `resize:'native'` + `100dvh` collapse with IME. Switch to `'body'`.
- ⬜ **ANL6** — `capacitor.config.ts:33-37` + `styles.xml:18,27` — StatusBar config dupe. Pick one.
- ⬜ **ANL7** — `splash.png` color seam vs `colorPrimaryDark` `#F5F3EF`. Regenerate from one source.
- ⬜ **ANL8** — `android/.gitignore:75` — `assets/public` rebuilt by `cap copy`; no automated hook. Add Gradle preBuild task.
- ⬜ **ANL9** — `variables.gradle:15` — stale `cordovaAndroidVersion`. Drop if unused.
- ⬜ **ANL10** — `aapt_proguard_file/release/...` — stale Firebase keep rules from prior build cache. `./gradlew clean`.
- ⬜ **ANL11** — `ChatPage.tsx` — voice-mode sheet doesn't register back handler.
- ⬜ **ANL12** — `CapturePage.tsx:65-90` + `VoiceInput.tsx:74` + `VoiceMode.tsx:65` — no rationale UI before camera/mic prompt. Pre-prompt sheet.
- ⬜ **ANL13** — `useAndroidBackButton.ts:31-71` — `[onBack]` deps cause re-attach storm. Ref-based.
- ⬜ **ANL14** — `file_paths.xml:2-5` — FileProvider paths over-broad. Scope to `Pictures/anton-companion/`.
- ⬜ **ANL15** — `capacitor.config.ts:26-32` — splash auto-hide 800ms then `safe-top` jolt. `splashFullScreen:false` or precompute.
- ⬜ **ANL16** — `capacitor.config.ts:35` + `styles.xml:18,27` — StatusBar style + windowLightStatusBar both set independently. Document precedence.
- ⬜ **ANL17** — `android/app/src/test/` + `androidTest/` empty. Either smoke test or remove deps.

---

## Status legend
- ⬜ open
- 🔧 in progress
- ✅ done + verified on device
- 💀 deleted as dead code
- ❎ won't fix
