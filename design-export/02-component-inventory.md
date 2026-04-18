# 02 — Component Inventory

**Total reusable components:** 179 in `src/components/` (main app) + 11 in `src/app/components/` (companion app).

> ANTON has **no `src/components/ui/` shadcn primitives layer**. Components are organised by domain, not by primitive. Most are domain-bound (e.g., `ThreatPathCard` only makes sense inside the Risk Atlas). The ones that act as shared primitives live in `src/components/shared/` and `src/components/layout/`.

> Every entry below lists: `Name` — `source path` — what it does. Top-3 callsites are listed only for genuinely shared components (the ones imported by 5+ pages); domain-bound components (used only inside their own pillar) note the parent surface instead.

---

## Layout (6) — `src/components/layout/`

The chrome that wraps every authenticated route.

| Name | Source | Notes |
|---|---|---|
| `MainLayout` | `MainLayout.tsx` | The application shell — wraps every authenticated route in `App.tsx`. Renders `Sidebar` + `Header` + outlet. |
| `Sidebar` | `Sidebar.tsx` | Pillar-aware left nav (1900+ lines). Switches sections based on `useSettingsStore.appMode` (work / school / life / pathfinder / markets / community / payments). Collapsible. |
| `Header` | `Header.tsx` | Top bar — search, theme switcher (dark/light/corporate), profile menu. Brand mark locked in `light` to `#0D7D6C`. |
| `AreaDashboard` | `AreaDashboard.tsx` | Module-grid landing for an FCP-style "area" (e.g., FCP, Audit, Risk). Used inside `Sidebar` flyouts. |
| `NavLinkWithStar` | `NavLinkWithStar.tsx` | NavLink wrapper that overlays a star badge for "favorited" or "recommended" routes. |
| `NavItemConfig` | `NavItemConfig.tsx` | Hide-list config for nav items — user-toggled in Settings. |

---

## Shared primitives (54) — `src/components/shared/`

The closest thing ANTON has to a primitives layer. None are shadcn components — all are bespoke.

### Top reusable (used across 10+ pages)

| Name | Source | Variants | Top callsites |
|---|---|---|---|
| `CommandPalette` | `CommandPalette.tsx` | — | `MainLayout` (global ⌘K) |
| `FileUploader` | `FileUploader.tsx` | drag/drop, click | `ModulePage`, `KnowledgePage`, `EngagementResourceCollection`, others |
| `KnowledgeSourcePanel` | `KnowledgeSourcePanel.tsx` | claude/refs/local/combined | `ModulePage`, `BriefMePage`, `GuideMePage`, `ChallengeThisPage` |
| `OutputFormatSelector` | `OutputFormatSelector.tsx` | 40+ formats | `ModulePage`, `BriefMePage`, `BatchCreatePage` |
| `OutputToolbar` | `OutputToolbar.tsx` | — | All module/output surfaces |
| `ExportBar` | `ExportBar.tsx` | md/docx/xlsx/pdf/pptx | `ModulePage`, `EngagementWorkspacePage`, `RiskAtlasWorkspacePage` |
| `ModelSelector` | `ModelSelector.tsx` | provider×model | `ModulePage`, `Settings` |
| `ThinkingControls` | `ThinkingControls.tsx` | quick/think/think_hard/investigate/plan_first | `ModulePage`, `BriefMePage` |
| `CreativitySlider` | `CreativitySlider.tsx` | strict/balanced/creative | `ModulePage`, others |
| `PrecisionSelector` | `PrecisionSelector.tsx` | low/standard/high | `ModulePage` |
| `MessageWithThinking` | `MessageWithThinking.tsx` | — | All chat surfaces (`ModulePage`, `ApprenticePage`, school chat, atlas) |
| `HumanOversightGate` | `HumanOversightGate.tsx` | — | `MissionDashboardPage`, action-taking flows |
| `NotificationDropdown` | `NotificationDropdown.tsx` | — | `Header` |
| `PWAInstallPrompt` | `PWAInstallPrompt.tsx` | — | `MainLayout` (one-shot) |
| `OnboardingTour` | `../OnboardingTour.tsx` (at component root) | — | `MainLayout` (first run) |

### Module-config helpers

| Name | Source |
|---|---|
| `AudienceAdaptButtons`, `BudgetIndicator`, `CitationVerifier`, `CommunicationsPanel`, `ContextBudgetBar`, `ContextBudgetIndicator`, `ContextPanel`, `ConversationThread`, `DeliberationPanel`, `ExplainFor`, `FeedbackWidget`, `GapAnalysisWalkthrough`, `HelpTooltip`, `InjectedAtomsPanel`, `InsightsBell`, `MarketDisclaimer`, `ModelRecommendationBadge`, `MultiAgentPanel`, `OrgContextPanel`, `OutputChainActions`, `PrivacyIndicator`, `ProjectContextBanner`, `PromptEditor`, `QualityIndicatorBar`, `RAGSearchPanel`, `ReferenceOutputPanel`, `ResumePanel`, `RevelationTrailPanel`, `SeedControl`, `SessionTogglesPanel`, `SmartModelBanner`, `SmartModuleSearch`, `StatusIndicator`, `StructureReference`, `SuggestionWidget`, `TransformPanel`, `VersionHistory`, `WritingStylePanel`, `BenchmarkDisplay`, `ConnectorTemplatesBrowser` | `src/components/shared/` |

(All used primarily inside `ModulePage` and the variant landing pages — `BriefMePage`, `GuideMePage`, `FillFormPage`, `DualInterpretationPage`, `BatchCreatePage`, `ChallengeThisPage`, `PromptPage`.)

### Markets sub-folder — `src/components/shared/markets/`

Listed under "Markets" pillar in `03-anton-surfaces-by-pillar.md`.

---

## Modules (13) — `src/components/modules/`

One component per signature module type. Each is the **right-pane workspace** for a module run.

| Name | Source | Used in |
|---|---|---|
| `DynamicModule` | `DynamicModule.tsx` | The generic dispatcher — used by `ModulePage` for any non-bespoke module |
| `GapAnalysis` | `GapAnalysis.tsx` | Gap Assessment / FCP gap modules |
| `RegulatoryMonitor` | `RegulatoryMonitor.tsx` | Regulatory monitoring modules |
| `RiskAssessment` | `RiskAssessment.tsx` | Risk modules |
| `SanctionsAdvisory` | `SanctionsAdvisory.tsx` | Sanctions module |
| `DocumentCreation` | `DocumentCreation.tsx` | Document drafting modules |
| `DataManagement` | `DataManagement.tsx` | Data lineage / management modules |
| `EngagementProposal` | `EngagementProposal.tsx` | Engagement workflows |
| `EngagementExecution` | `EngagementExecution.tsx` | Engagement workflows (execution phase) |
| `InvestigationSupport` | `InvestigationSupport.tsx` | Investigation modules |
| `ManagementPresentation` | `ManagementPresentation.tsx` | Board pack modules |
| `ModelValidation` | `ModelValidation.tsx` | Model risk / validation modules |
| `TrainingContent` | `TrainingContent.tsx` | Training material module |

---

## Engagement (12) — `src/components/engagement/`

Live entirely inside `EngagementWorkspacePage`.

| Name | Notes |
|---|---|
| `EngagementSetup`, `EngagementScopeAgreement`, `EngagementClientIntelligence`, `EngagementResourceCollection`, `EngagementGoodExample`, `EngagementPeerBenchmarks`, `EngagementWorkstreamPlanning`, `EngagementExecution`, `EngagementQualityGate`, `EngagementReview`, `EngagementTeamPanel`, `EngagementExpertConfig` | Sequential phases of an engagement; rendered as tabbed workspace inside the Engagement page. |

---

## Risk Atlas (9) — `src/components/risk-atlas/`

Built April 2026 (full spec + Addendum 1, 13 sub-phases). Live inside `RiskAtlasWorkspacePage` + cross-cutting.

| Name | Notes |
|---|---|
| `ThreatPathsTab`, `ThreatPathCard`, `ControlsTab`, `MaintenanceTab` | Stage 1-7 workspace tabs |
| `CrossDomainBundlesSection` | Stage 2 cross-domain story groupings (Addendum 1) |
| `ResidualHeatMap` | 5×5 inherent × residual map (SVG); both inline + exported |
| `StageExplainer`, `GlossaryTooltip` | Pedagogy / contextual help |
| `AtlasMigrationBanner` | Cross-cutting — mounted on legacy FCP modules to redirect to Risk Atlas |

---

## Missions (8) — `src/components/missions/`

Live inside `MissionDashboardPage` + `MissionInboxPage`.

| Name | Notes |
|---|---|
| `MissionCard`, `ActivityFeed`, `BudgetMonitor`, `TaskGraphView` | Mission overview |
| `DeliveriesTab`, `OutboundDelegationsTab`, `PaymentsTab` | Sub-tabs of mission workspace |
| `ParallelReviewModal` | Multi-expert review trigger |

---

## School (10) — `src/components/school/`

Live inside `SchoolLayout` and the school sub-routes.

| Name | Notes |
|---|---|
| `SchoolLayout` | Wrapper for every `/school/*` route — sets `lang` for RTL scripts |
| `AvatarDisplay`, `AssistanceLevelBadge`, `OfflineBanner` | Student UI accessories |
| `CodeSandbox`, `PythonSandbox` | In-browser code playgrounds |
| `LaxhjalpMode` | Swedish "Läxhjälp" homework-help mode toggle + chat shell |
| `ModeToggle`, `TaskTypeSelector` | Configure learning session |
| `VideoPlayer` | Embedded explainer videos |

---

## Pathfinder (14) — `src/components/pathfinder/`

The "smart action bar" pillar — research/discovery mode.

| Name | Notes |
|---|---|
| `PathfinderBar`, `SmartActionBar` | Top-level entry |
| `PathfinderResultPanel`, `PathfinderThreadTabs`, `PathfinderCostDisplay` | Result rendering |
| `DepthSelector`, `SearchModeSelector` | Configure depth + mode |
| `DocumentUploadPanel`, `FollowUpInput`, `ImproveSearchPanel` | Iteration controls |
| `ProactiveSuggestions`, `SourceCard`, `WebSourcesList`, `PipeToModuleButton` | Source rendering + handoff |

---

## Coding (9) — `src/components/coding/`

Live inside `Coding*Page` routes (script-lite/medium, large project, alignment-reviewer).

| Name | Notes |
|---|---|
| `CodingBreadcrumb`, `CodeViewer`, `FileManifest`, `ProgressView`, `ExecutionPlanPanel` | Workspace primitives |
| `QualityScore`, `CompletionRecord`, `VersionHistory` | Output review |
| `ExportAntonButton` | Hand-off to ANTON main workflow |

---

## Deadlines (15) — `src/components/deadlines/`

The Deadlines page (`/deadlines`) is large; broken into sub-views.

| Name | Notes |
|---|---|
| `DeadlineKanbanView`, `DeadlineListView`, `DeadlineMonthView`, `DeadlineWeekView`, `DeadlineYearView`, `ViewSwitcher` | Multi-view layout |
| `DeadlineCard`, `DeadlineForm`, `DeadlineDetailPanel` | CRUD + detail |
| `SubtaskList`, `LabelManager`, `ReminderConfig`, `CommentThread` | Sub-features |
| `CapacityPlanner`, `WorkRhythmsSection` | Productivity overlays |
| `types.ts` | Shared types (not a component) |

---

## Beehive (8) — `src/components/beehive/`

Multi-participant deliberation. Live inside `BeehivePage` + `BeehiveSessionPage`.

| Name | Notes |
|---|---|
| `HiveCreator`, `HiveParticipantList` | Setup |
| `RoundNavigator`, `ContributionStream`, `ContributionComposer` | Deliberation rounds |
| `ConsensusGauge`, `SynthesisPanel`, `HumanInjectionPanel` | Outcome + human override |

---

## Knowledge (2) — `src/components/knowledge/`

| Name | Notes |
|---|---|
| `CreateCollectionModal`, `DocumentUploader` | Knowledge collections + ingestion |

---

## Platform (3) — `src/components/platform/`

Cross-cutting platform actions.

| Name | Notes |
|---|---|
| `IdentityPanel` | Identity / contact-hash display |
| `ReviewLauncher` | Trigger a peer review |
| `SkillAttacher` | Attach skills to a module run |

---

## Projects (3) — `src/components/projects/`

Live inside `ProjectsPage`.

| Name | Notes |
|---|---|
| `ProjectFiles`, `ProjectMembers`, `ProjectNotes` | Project workspace tabs |

---

## Roaring + DowJones (2) — `src/components/{roaring,dowjones}/`

Data-partnership UI.

| Name | Notes |
|---|---|
| `RoaringEntityCard` (`roaring/`) | Nordic entity result card |
| `DJScreeningPanel` (`dowjones/`) | Dow Jones risk-intelligence panel |

---

## Other small folders

- `src/components/data/` — `EntityIntelligencePanel.tsx` (used by `EntityIntelligencePage`)
- `src/components/exchange/` — `ExportModuleModal.tsx`, `ImportModuleModal.tsx` (used by `ExchangePage`)
- `src/components/review/` — `ReviewPanel.tsx` (used by `ReviewEnginePage`)
- `src/components/workflow-steps/` — empty directory
- `src/components/OnboardingTour.tsx` — root-level, used by `MainLayout`

---

## Companion app components — `src/app/components/`

Built / heavily refactored April 2026 in the autonomous overnight build (Phases A–I). All documented in `04-companion-app-surfaces.md` with full props.

| Name | Source | Used in |
|---|---|---|
| `BottomSheet` | `BottomSheet.tsx` | Reusable Material 3 / iOS sheet — `QuickActionsFab`, `App.tsx` More menu, `InstanceSwitcher` (planned) |
| `ChatBubble` | `ChatBubble.tsx` | `ChatPage` |
| `ConnectionStatus` | `ConnectionStatus.tsx` | `App.tsx` (ambient) |
| `InstanceSwitcher` | `InstanceSwitcher.tsx` | Triggered from `InstanceTopBar` |
| `InstanceTopBar` | `InstanceTopBar.tsx` | `App.tsx` workspace shell |
| `QuickActionsFab` | `QuickActionsFab.tsx` | `App.tsx` workspace shell |
| `ReasoningDrawer` | `ReasoningDrawer.tsx` | `ChatPage` |
| `SuggestionChips` | `SuggestionChips.tsx` | `ChatPage`, `HomeScreen` |
| `TabBar` | `TabBar.tsx` | `App.tsx` (5 primary tabs: Home / Chat / Approvals / Capture / More) |
| `VoiceInput` | `VoiceInput.tsx` | `ChatPage` (in-chat hold-to-talk) |
| `VoiceMode` | `VoiceMode.tsx` | Full-screen voice overlay launched from `QuickActionsFab` |

---

## Rendering primitives that exist *in CSS only*

`src/index.css` ships a `.prose-output` system (lines 209-249) for rendering Markdown — headings, paragraphs, lists, tables, code blocks, blockquotes, links, hr. No JSX wrapper component — pages apply the class directly to their output container. Documented here because Claude Design will see "prose"-classed elements in screenshots and may not realise they are CSS-only.

---

## Notable absences

- No shadcn primitives (`Button`, `Card`, `Input`, `Dialog`, `Tabs`) — pages use raw Tailwind utility chains.
- No `@radix-ui/*` accessibility primitives. Focus management is hand-rolled.
- No `framer-motion` — animations are CSS keyframes + Tailwind transitions.
- No icon component library beyond `lucide-react` (imported directly by every component that needs one).
