# 03 — ANTON Surfaces by Pillar

**Convention:** Each pillar lists ~5 canonical surfaces — chosen for breadth (most diverse interactions), depth (the surface the pillar is "about"), and frequency (most-visited per `useSettingsStore.appMode`). The full route appendix at the end carries every other route grouped by pillar so nothing is hidden.

**State of light mode**: `clean` = renders correctly, `needs review` = some hard-coded dark hex / contrast issues, `not yet styled` = was built dark-only and never re-themed.

---

## Work (default — `appMode = 'work'`)

The original ANTON. Module-driven expert workspace. Sidebar shows 60+ areas (FCP, Legal, Audit, Banking, Risk, …) each with their own modules.

### Dashboard
- Route: `/`
- Source: `src/pages/Dashboard.tsx`
- Function: Landing screen — recent sessions, recommended modules, quick links to favourites. The user's daily entry point.
- Primary components: `Sidebar`, `Header`, recent-session cards, `NotificationDropdown`.
- Key interactions: tap module → navigates to `/module/:moduleId`.
- State: `clean`.

### Module page (the workhorse)
- Route: `/module/:moduleId`
- Source: `src/pages/ModulePage.tsx` (1000+ lines)
- Function: The signature ANTON surface. Left pane = module header + guided inputs + knowledge sources + output formats + thinking controls + creativity + model selector + persona/skill picker. Right pane = streaming output as a chat-style transcript with collapsible "How ANTON Thought" thinking. Top-right = export bar.
- Primary components: `KnowledgeSourcePanel`, `OutputFormatSelector`, `ThinkingControls`, `CreativitySlider`, `ModelSelector`, `MessageWithThinking`, `ExportBar`, `OutputToolbar`, `FileUploader`, `AtlasMigrationBanner` (on FCP modules).
- Key interactions: configure → run → stream output → export → continue follow-up.
- State: `clean` (light mode is the daily driver in v0.7.5).

### Engagement workspace
- Route: `/engagements/:id`
- Source: `src/pages/EngagementWorkspacePage.tsx`
- Function: Multi-phase consulting engagement — scope agreement → client intelligence → resource collection → workstream planning → execution → quality gate → review. Each phase is a tab.
- Primary components: 12 components from `src/components/engagement/` (one per phase).
- Key interactions: progress through phases; team panel; review trigger.
- State: `clean`.

### Coding (large project)
- Route: `/coding/large/project/:projectId`
- Source: `src/pages/CodingLargeProjectPage.tsx` (+ Architecture, Release, Discovery sub-pages)
- Function: Multi-release software project with discovery → architecture → release planning → execution. ANTON-as-engineering-co-pilot.
- Primary components: `CodeViewer`, `FileManifest`, `ProgressView`, `ExecutionPlanPanel`, `QualityScore`, `VersionHistory`, `ExportAntonButton`.
- Key interactions: pick release → run plan → view files → export back to ANTON main flow.
- State: `clean`.

### Deadlines
- Route: `/deadlines`
- Source: `src/pages/DeadlinesPage.tsx`
- Function: GTD-style deadline manager with five view modes (Kanban / List / Month / Week / Year). Capacity planning + work rhythms overlays.
- Primary components: `DeadlineKanbanView` + 4 other view components, `DeadlineCard`, `DeadlineForm`, `CapacityPlanner`, `WorkRhythmsSection`, `ViewSwitcher`.
- Key interactions: switch view, create / edit deadline, drag in kanban, label / reminder config.
- State: `clean`.

---

## School (`appMode = 'school'`)

Educational interface with teacher oversight. Dedicated layout (`SchoolLayout`) and login (`SchoolLoginPage`). RTL-aware (Urdu, Hindi, Arabic via Noto fonts).

### Student dashboard
- Route: `/school`
- Source: `src/pages/school/SchoolDashboardPage.tsx`
- Function: Today's assignments, current course progression, recent chats. Built for a single-student / teacher hand-off scenario.
- Primary components: `SchoolLayout`, `AvatarDisplay`, `AssistanceLevelBadge`, `OfflineBanner`.
- Key interactions: pick assignment → goes to `/school/assignments/:id/take`.
- State: `clean`.

### Student chat
- Route: `/school/chat`
- Source: `src/pages/school/SchoolChatPage.tsx`
- Function: Conversational AI tutor. Voice input default. "Läxhjälp" (Swedish homework-help) mode for guided problem-solving instead of answer-giving.
- Primary components: `LaxhjalpMode`, `MessageWithThinking`, `VoiceInput`, `ModeToggle`.
- Key interactions: voice or type → tutor responds with hints rather than answers (when Läxhjälp is on).
- State: `clean`.

### Teacher oversight
- Route: `/school/teacher/oversight`
- Source: `src/pages/school/TeacherOversightPage.tsx`
- Function: Teacher's view of every student's session activity, flagged moments, time-on-task. The teacher-trust mechanism.
- Primary components: tabular session log + drill-in.
- Key interactions: filter by class / student / flag → drill into session.
- State: `clean`.

### Coding (school)
- Route: `/school/coding/:module`
- Source: `src/pages/school/SchoolCodingChatPage.tsx`
- Function: Guided coding sessions for students. In-browser code sandbox + chat tutor.
- Primary components: `CodeSandbox` or `PythonSandbox`, school chat shell.
- Key interactions: edit code → run in sandbox → ask tutor.
- State: `clean`.

### Socratic exam
- Route: `/school/assignments/:id/socratic`
- Source: `src/pages/school/SocraticExamPage.tsx`
- Function: Examiner-led Socratic dialogue — student answers, ANTON probes for reasoning. The "thinking exam" mode.
- Primary components: stripped-down chat shell with structured turn-taking.
- Key interactions: answer → probe → answer.
- State: `clean`.

---

## Life (`appMode = 'life'`)

Personal-life modules. Lighter chrome than Work.

### Life landing
- Route: `/life`
- Source: `src/pages/LifePage.tsx`
- Function: Tile grid for News / Finance / Travel / Community. Routes the user into the right sub-pillar.
- Primary components: tile cards.
- Key interactions: tap tile → navigate.
- State: `clean`.

### News feed
- Route: `/news/feed`
- Source: `src/pages/news/NewsFeedPage.tsx`
- Function: Personalised news feed with truth-check + bias indicators. Sources curated per user.
- Primary components: story cards with source + bias chip.
- Key interactions: open story (`/news/story/:id`) → truth-check (`/news/truth-check`).
- State: `clean`.

### Finance market
- Route: `/finance/market`
- Source: `src/pages/finance/FinanceMarketPage.tsx`
- Function: Personal-finance market tracker — watchlist, goals, learn modules.
- Primary components: market chart, watchlist list, goal progress bars.
- Key interactions: add watchlist item, set goal.
- State: `clean`.

### Travel planner
- Route: `/travel/planner`
- Source: `src/pages/travel/TravelPlannerPage.tsx`
- Function: Trip planning with country guides + ANTON-drafted itineraries.
- Primary components: itinerary timeline, country chips.
- Key interactions: build trip from country guide.
- State: `clean`.

### Community Beehive
- Route: `/community/beehive`
- Source: `src/pages/community/BeehivePage.tsx`
- Function: Multi-participant deliberation — start a hive, others contribute, ANTON synthesises consensus + dissent.
- Primary components: 8 components from `src/components/beehive/`.
- Key interactions: create hive → invite → collect contributions → synthesise.
- State: `clean`.

---

## Pathfinder (`appMode = 'pathfinder'`)

Mode-aware research assistant. The "smart action bar" pillar.

### Pathfinder bar
- Route: `/pathfinder`
- Source: `src/pages/pathfinder/PathfinderPage.tsx`
- Function: Single search input that picks the right ANTON capability behind the scenes (web search, knowledge atom retrieval, council deliberation, module dispatch).
- Primary components: `PathfinderBar`, `SmartActionBar`, `DepthSelector`, `SearchModeSelector`, `PathfinderResultPanel`, `SourceCard`, `WebSourcesList`, `PipeToModuleButton`, `ProactiveSuggestions`, `PathfinderCostDisplay`.
- Key interactions: type → select depth/mode → see results with sources → pipe to module if useful.
- State: `clean`.

### Pathfinder history
- Route: `/pathfinder/history`
- Source: `src/pages/pathfinder/PathfinderHistoryPage.tsx`
- Function: Past Pathfinder threads, searchable.
- Primary components: thread list, `PathfinderThreadTabs`.
- State: `clean`.

---

## Markets (`appMode = 'markets'`)

ANTON's self-learning intelligence showcase. 23 routes; biggest pillar by surface count.

### Markets landing
- Route: `/markets`
- Source: `src/pages/markets/MarketsPage.tsx`
- Function: Markets dashboard — ANTON 100 indexes, recent predictions, watchlist, calibration accuracy, latest patterns.
- Primary components: index grid, prediction list, calibration chart, recent-pattern feed.
- State: `clean`.

### Market thesis detail
- Route: `/markets/theses/:id`
- Source: `src/pages/markets/MarketThesisDetailPage.tsx`
- Function: A single thesis (e.g., "Rates cycle tops in Q3") with the why-chain, supporting atoms, predictions, calibration history.
- Primary components: why-chain visualisation, atom list, prediction outcomes table.
- Key interactions: drill into atoms / predictions / calibrate.
- State: `clean`.

### ANTON 100 index detail
- Route: `/markets/indexes/:id`
- Source: `src/pages/markets/MarketIndexDetailPage.tsx`
- Function: Single ANTON-derived index (e.g., "Geopolitical risk index") — composition, performance, methodology, contributing entities.
- Primary components: composition pie, performance chart, methodology drawer.
- State: `clean`.

### Why-chain detail
- Route: `/markets/why-chains/:id`
- Source: `src/pages/markets/MarketWhyChainDetailPage.tsx`
- Function: Hierarchical "5 whys" reasoning for a market hypothesis — every claim has a why-link below it.
- Primary components: tree view, atom citations.
- Key interactions: expand / collapse why-links.
- State: `clean`.

### Pattern detection
- Route: `/markets/patterns`
- Source: `src/pages/markets/MarketPatternsPage.tsx`
- Function: ANTON-detected patterns across the market data (e.g., "EUR/USD weakness coincides with…"). Each pattern has confidence + history.
- Primary components: pattern list with confidence bars + drill-in.
- State: `clean`.

---

## Community (`appMode = 'community'`)

E2E-encrypted ANTON-to-ANTON. Contact hashes, trust scoring, groups, beehive.

### Community landing
- Route: `/community`
- Source: `src/pages/community/CommunityPage.tsx`
- Function: Inbox-style entry — recent messages, contacts, group activity.
- Primary components: thread list.
- State: `clean`.

### Contacts
- Route: `/community/contacts`
- Source: `src/pages/community/CommunityContactsPage.tsx`
- Function: Contact list with `ANTON-XXXX-XXXX-XXXX-XXXX` hashes, trust score, last-seen.
- Primary components: contact card list, trust badge.
- State: `clean`.

### Messages
- Route: `/community/messages`
- Source: `src/pages/community/CommunityMessagesPage.tsx`
- Function: 1:1 + group threads. E2E encrypted client-side.
- Primary components: thread + composer.
- State: `clean`.

### Beehive session
- Route: `/community/beehive/:id`
- Source: `src/pages/community/BeehiveSessionPage.tsx`
- Function: A live deliberation session — round-by-round contributions + synthesis.
- Primary components: 8 components from `src/components/beehive/` (`HiveCreator`, `RoundNavigator`, `ContributionStream`, `ContributionComposer`, `ConsensusGauge`, `SynthesisPanel`, `HumanInjectionPanel`).
- State: `clean`.

### Capability card
- Route: `/community/capability-card`
- Source: `src/pages/community/CommunityCapabilityCardPage.tsx`
- Function: Display the user's own capability card (skills, areas of expertise) — used for project matching.
- Primary components: card editor.
- State: `clean`.

---

## Procure (`appMode = 'work'` sub-pillar)

Procurement cycles, vendor evaluation, criteria scoring, contract tracking.

### Procure landing
- Route: `/procure`
- Source: `src/pages/procure/ProcurePage.tsx`
- Function: List of procurement cycles + vendor pipeline.
- State: `clean`.

### Procure cycle detail
- Route: `/procure/cycle/:cycleId`
- Source: `src/pages/procure/ProcureCyclePage.tsx`
- Function: Single procurement cycle — RFP scope, vendor responses, criteria scoring matrix, decision log.
- State: `clean`.

---

## Civic (`appMode = 'work'` sub-pillar)

Civic engagements — eligibility checks, document submissions, knowledge packs.

### Civic landing
- Route: `/civic`
- Source: `src/pages/civic/CivicPage.tsx`
- Function: List of civic engagements (grant applications, permit submissions, public consultations).
- State: `clean`.

### Civic engagement detail
- Route: `/civic/engagement/:engagementId`
- Source: `src/pages/civic/CivicEngagementPage.tsx`
- Function: Single engagement — eligibility, requirements, submitted documents, deadlines.
- State: `clean`.

---

## Grow (`appMode = 'work'` sub-pillar)

CRM-style: contacts, pipeline, opportunities, signals, briefings.

### Grow landing
- Route: `/grow`
- Source: `src/pages/grow/GrowPage.tsx`
- Function: Today's signals + pending briefings.
- State: `clean`.

### Pipeline
- Route: `/grow/pipeline`
- Source: `src/pages/grow/GrowPipelinePage.tsx`
- Function: Sales pipeline kanban (lead → qualify → proposal → close).
- State: `clean`.

### Opportunity detail
- Route: `/grow/opportunities/:id`
- Source: `src/pages/grow/GrowOpportunityPage.tsx`
- Function: Single opportunity — contacts, signals, briefing, next-best-action.
- State: `clean`.

### Contacts / Organisations
- Routes: `/grow/contacts`, `/grow/organisations`
- Function: People + accounts.
- State: `clean`.

---

## Talent

Hiring + talent pipeline — fully in code.

### Talent landing
- Route: `/talent`
- Source: `src/pages/talent/TalentPage.tsx`
- Function: Active campaigns + candidate pipeline.
- State: `clean`.

### Talent campaign
- Route: `/talent/campaign/:campaignId`
- Source: `src/pages/talent/TalentCampaignPage.tsx`
- Function: Single hiring campaign — role spec, candidate list, scoring matrix, interview tracking.
- State: `clean`.

---

## Portals (`appMode = 'portals'`)

ANTON-hosted public pages with an AAP machine-readable twin. Every portal is simultaneously a human-visitable site AND a capability descriptor other ANTONs can invoke. This is ANTON's proof of inter-instance interoperability — see `ANTON_Portals_Spec.md` v0.3.

The pillar has its own left sidebar (parallels Markets / Payments). Nav sections: Landing, Manage, Discover, Inbox, Templates.

### Portals landing
- Route: `/portals`
- Source: `src/pages/portals/PortalsLandingPage.tsx`
- Function: First-run welcome or recently-built portals + Quick-Start shortcut.
- State: `clean`.

### Portal builder (8-phase walkthrough)
- Route: `/portals/build/:portalId?`
- Source: `src/pages/portals/PortalBuilderPage.tsx`
- Function: Guided construction — name, category, audience, capabilities, pages, publish. LLM phase-suggestions + Quality Ratchet + SSE streaming.
- State: `clean`. Phase indicator at the top; capability descriptor editor + 12-verb taxonomy (contact, order, book, etc.) as a dedicated phase.

### Portal manage
- Route: `/portals/manage/:portalId`
- Source: `src/pages/portals/PortalManagePage.tsx`
- Function: Post-publish editor — assets, metadata, capabilities, visibility, transfer/revoke. Publish → registry signs + pushes to transparency log.
- State: `clean`.

### Portal discovery
- Route: `/portals/discover`
- Source: `src/pages/portals/PortalsDiscoveryPage.tsx`
- Function: Search the public registry by name/capability/tag. Results show trust-bundle status + capability badges + LAN-discoverable flag.
- State: `clean`. LAN-discoverable portals get a small signal dot next to the name.

### Portal inbox
- Route: `/portals/inbox`
- Source: `src/pages/portals/PortalsInboxPage.tsx`
- Function: Incoming capability invocations (another ANTON asked yours to `contact`, `book`, etc.). Approval gate lives here for high-severity verbs.
- State: `clean`.

### Portal template gallery
- Route: `/portals/templates`
- Source: `src/pages/portals/PortalsTemplateGalleryPage.tsx`
- Function: 7 starter templates (bakery, clinic, etc.) that seed the builder.
- State: `clean`.

### Portal visitor (public-facing)
- Route: `/p/:namespace/:name`
- Source: `src/pages/portals/PortalVisitorPage.tsx`
- Function: The rendered portal itself — a unique surface per builder output. Also serves `/.well-known/aap-capabilities` for machine-readable discovery.
- State: `clean`. Visitor view must render correctly in light/dark/corporate themes AND without auth.

---

## Payments / FutureChain (`appMode = 'payments'`)

FutureChain wallet + marketplace integration.

### FC dashboard
- Route: `/futurechain`
- Source: `src/pages/futurechain/FCDashboardPage.tsx`
- Function: Wallet balance, recent transactions, KYC status.
- State: `clean`.

### KYC
- Route: `/futurechain/kyc`
- Source: `src/pages/futurechain/FCKycPage.tsx`
- Function: KYC verification flow (document upload + status).
- State: `clean`.

### Wallets / Transactions / Budget / Marketplace
- Routes: `/futurechain/{wallets,transactions,budget,marketplace}`
- Function: Standard fintech surfaces — wallet list, txn ledger, budget tracker, .anton bundle marketplace.
- State: `clean`.

---

## Risk Atlas (cross-cutting, `appMode = 'work'`)

Built April 2026 (full Phase 1 + Addendum 1). Universal seven-stage threat-path methodology.

### Atlas landing
- Route: `/atlas`
- Source: `src/pages/risk-atlas/RiskAtlasLandingPage.tsx`
- Function: List + filter atlases. Pick existing or create new. "Small business view" toggle.
- State: `clean`.

### Atlas setup wizard
- Route: `/atlas/new`
- Source: `src/pages/risk-atlas/RiskAtlasSetupPage.tsx`
- Function: Three-step pairing wizard — pick industry pack → describe business → choose mode (Socratic / Draft / Expert / Autonomous).
- State: `clean`.

### Atlas workspace
- Route: `/atlas/:id`
- Source: `src/pages/risk-atlas/RiskAtlasWorkspacePage.tsx`
- Function: Five-tab Atlas shell — Dashboard / Threat paths / Controls / Events / Maintenance. Stage 1-7 deterministic methodology.
- Primary components: `ThreatPathsTab`, `ControlsTab`, `MaintenanceTab`, `CrossDomainBundlesSection`, `ResidualHeatMap`.
- State: `clean`.

### Small business dashboard
- Route: `/atlas/small-business`
- Source: `src/pages/risk-atlas/SmallBusinessDashboardPage.tsx`
- Function: Simplified solo-operator landing — three things to know in 30 seconds (outside-appetite paths, integrity findings, maintenance status).
- State: `clean`.

---

## Missions (cross-cutting)

Autonomous agent workflows.

### Missions landing
- Route: `/missions`
- Source: `src/pages/MissionsPage.tsx`
- Function: All missions — running / completed / awaiting input.
- State: `clean`.

### Mission inbox
- Route: `/missions/inbox`
- Source: `src/pages/MissionInboxPage.tsx`
- Function: Action items the user must approve / reject / modify.
- Primary components: `HumanOversightGate`.
- State: `clean`.

### Mission dashboard
- Route: `/missions/:id`
- Source: `src/pages/MissionDashboardPage.tsx`
- Function: Single mission — task graph, activity feed, budget monitor, deliveries, outbound delegations, payments.
- Primary components: 8 components from `src/components/missions/`.
- State: `clean`.

### Service packs / Credentials
- Routes: `/missions/{service-packs,credentials}`
- Function: Reusable mission templates + secret vault.
- State: `clean`.

---

## Specialized Agents (`appMode = 'work'`)

### Agent hub
- Route: `/agents`
- Source: `src/pages/agents/AgentHubPage.tsx`
- Function: List, create, configure specialized agents (support, sales, HR, travel) with their own personas + connectors + escalation rules.
- State: `clean`.

---

## Specced, not yet in codebase

None at the time of this extraction. Every pillar listed in `CLAUDE.md` has at least one page in `src/pages/`.

---

# Appendix: Full route map

Generated from `src/App.tsx`. Grouped by pillar for orientation. Pages not listed in the §3 detailed surfaces above are still production routes — they're just not the primary entry points.

### Work / shared (~80 routes)

```
/                              Dashboard
/brief                         BriefMePage
/guide                         GuideMePage
/fill                          FillFormPage
/challenge                     ChallengeThisPage
/dual                          DualInterpretationPage
/batch                         BatchCreatePage
/prompt                        PromptPage
/module/:moduleId              ModulePage           (the workhorse)
/workflows                     WorkflowsPage
/workflows/builder[/:id]       WorkflowBuilder
/workflows/build-ai            BuildYourOwnWorkflow
/workflows/triggers            EventTriggersPage
/orchestration                 OrchestrationDashboard
/datasets                      DatasetsPage
/projects                      ProjectsPage
/build-module                  BuildYourOwnModule
/skills                        SkillsLibrary
/audit                         AuditLogPage
/exchange                      ExchangePage
/analytics                     AnalyticsPage
/insights                      DataInsightsPage
/review                        ReviewEnginePage
/sounding-board                SoundingBoardPage
/ab-test                       ABTestPage
/council                       AICouncilPage
/knowledge                     KnowledgePage
/deadlines                     DeadlinesPage
/radar                         RadarPage
/coworkers                     CoworkerGallery
/versions                      VersionHistoryPage
/quality                       QualityPage
/apprentice                    ApprenticePage
/graph                         KnowledgeGraphPage
/intelligence                  IntelligenceDashboard
/patterns                      PatternDetectionPage
/compliance                    CompliancePage
/compliance-posture            CompliancePosturePage
/risk-appetite                 RiskAppetiteDashboard
/knowledge-base                KnowledgeBasePage
/my-work                       MyWorkPage
/discover                      DiscoverPage
/compare                       ComparisonPage
/governance                    GovernanceDashboard
/system-cards[/:moduleId]      SystemCardsPage
/skill-packs                   SkillPacksPage
/marketplace                   MarketplacePage
/presentations[/builder]       Presentations*
/coding                        CodingLandingPage
/coding/review                 CodeReviewPage
/coding/script-lite            ScriptLitePage
/coding/script-medium          ScriptMediumPage
/coding/large                  CodingLargeDiscoveryPage
/coding/large/project/:id[...] CodingLarge{Project,Architecture,Release}Page
/coding/instruction-builder    InstructionBuilderPage
/coding/alignment-reviewer     AlignmentReviewerPage
/engagements[/:id]             Engagement{List,Workspace}Page
/counsels-desk                 CounselsDesk
/orchestrator                  OrchestratorDashboard
/orchestrator/trail/:id        OrchestratorTrailViewer
/gap-assessment[/:id]          GapAssessment{Hub,Wizard}
/task-agent                    AntonTaskAgentPage
/roaring                       RoaringSearchPage
/dj-screening                  DJScreeningPage
/entity-intelligence           EntityIntelligencePage
/regulatory-feed               RegulatoryFeedPage
/lore-ledger                   LoreLedgerPage
/ngo                           NGOHubPage
/trades                        TradesHubPage
/pe-vc                         PEVCHubPage
/innovation-radar              InnovationRadarPage
```

### School (~22 routes)

```
/school/login                  SchoolLoginPage
/school                        SchoolDashboardPage
/school/onboarding             SchoolOnboardingPage
/school/chat                   SchoolChatPage
/school/subjects               SubjectsPage
/school/assignments            StudentAssignmentsPage
/school/assignments/:id/take   AssignmentTakingPage
/school/assignments/:id/socratic SocraticExamPage
/school/journey                CourseJourneyPage
/school/radar                  MyRadarPage
/school/coding[/:module]       SchoolCoding{,Chat}Page
/school/teacher                TeacherDashboardPage
/school/teacher/students       TeacherStudentsPage
/school/teacher/oversight      TeacherOversightPage
/school/teacher/classes/new    TeacherClassConfigPage
/school/teacher/classes/:id/{settings,progress} TeacherClass*Page
/school/teacher/assignments/new AssignmentBuilderPage
/school/teacher/submissions/:id SubmissionReviewerPage
/school/settings               SchoolSettingsPage
/school/profile                SchoolProfilePage
```

### Life (~20 routes)

```
/life                          LifePage
/news[/feed,/story/:id,/truth-check,/sources,/my-bias]   News*
/finance[/learn,/calculators,/market,/watchlist,/goals]   Finance*
/travel[/trips,/planner,/country/:code,/explore]          Travel*
/community/...                 see Community
```

### Pathfinder (2 routes)

```
/pathfinder
/pathfinder/history
```

### Markets (23 routes)

```
/markets                       MarketsPage
/markets/sources               MarketDataSourcesPage
/markets/theses[/:id]          MarketTheses{,Detail}Page
/markets/predictions           MarketPredictionsPage
/markets/entities              MarketEntitiesPage
/markets/indexes[/:id,/create] MarketIndex*Page
/markets/learning              MarketLearningPage
/markets/investigations        MarketInvestigationPage
/markets/workflows             MarketWorkflowsPage
/markets/computation           MarketComputationPage
/markets/atoms                 MarketAtomsPage
/markets/why-chains[/:id]      MarketWhyChain{,Detail}Page
/markets/patterns              MarketPatternsPage
/markets/watchlist             MarketWatchlistPage
/markets/events                MarketEventCalendarPage
/markets/rci                   MarketRCIPage
/markets/goals                 MarketGoalsProfilePage
/markets/backtests             MarketBacktestsPage
/markets/onboarding            MarketOnboardingPage
```

### Community (24 routes)

```
/community                     CommunityPage
/community/contacts            CommunityContactsPage
/community/messages            CommunityMessagesPage
/community/forum               CommunityForumPage
/community/identity            CommunityIdentityPage
/community/groups[/:id,/:id/forum,/:id/moderation]  CommunityGroup*Page
/community/join                CommunityJoinPage
/community/mail                CommunityMailPage
/community/calendar            CommunityCalendarPage
/community/events/:id          CommunityEventPage
/community/shared-knowledge    CommunitySharedKnowledgePage
/community/tasks               CommunityTasksPage
/community/projects[/:id]      CommunityProject{,Detail}Page
/community/capability-card     CommunityCapabilityCardPage
/community/beehive[/:id]       Beehive{,Session}Page
```

### Missions (6 routes)

```
/missions                      MissionsPage
/missions/new                  MissionCreatorPage
/missions/inbox                MissionInboxPage
/missions/credentials          CredentialVaultPage
/missions/service-packs        ServicePacksPage
/missions/:id                  MissionDashboardPage
```

### Risk Atlas (4 routes)

```
/atlas                         RiskAtlasLandingPage
/atlas/new                     RiskAtlasSetupPage
/atlas/small-business          SmallBusinessDashboardPage
/atlas/:id                     RiskAtlasWorkspacePage
```

### Procure / Civic / Grow / Talent (~12 routes)

```
/procure[/cycle/:cycleId]
/civic[/engagement/:engagementId]
/talent[/campaign/:campaignId]
/grow[/contacts,/organisations,/pipeline,/opportunities/:id]
/agents
```

### Payments / FutureChain (8 routes)

```
/futurechain                   FCDashboardPage
/futurechain/{kyc,wallets,transactions,budget,marketplace,settings,gateway}
```

### Settings (5 routes)

```
/settings
/settings/azure-openai
/app-gateway                   (admin issues companion-app QR codes here)
/share/:token                  SharePage (public, unauth)
/reset-password                ResetPasswordPage
```

---

## Notes

- Pillar membership is determined by `useSettingsStore.appMode` (which sidebar to show), NOT by URL prefix. A `/markets/*` route is part of the Markets pillar; a `/coding/*` route is part of Work; `/community/*` is part of Community. Procure/Civic/Grow/Talent appear under Work today (no dedicated `appMode` value yet).
- Some routes look like pages but are dashboards-of-dashboards — `/intelligence`, `/orchestration`, `/governance`, `/compliance-posture` are dense aggregator surfaces. Worth a screenshot each because they exercise the chart/table/badge primitives.
- `/share/:token` is the only public, unauthenticated surface other than login + reset.
