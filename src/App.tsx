import React, { useEffect, lazy, Suspense, useState } from 'react';
import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import MainLayout from './components/layout/MainLayout';
import { useAuthStore } from './stores/useAuthStore';
import { ensureCsrfToken } from './lib/api';
import PWAInstallPrompt from './components/shared/PWAInstallPrompt';
import { CommandPalette } from './components/shared/CommandPalette';
import OnboardingTour, { shouldShowTour } from './components/OnboardingTour';

// Global error boundary — prevents blank-page crashes
class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[AppErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ background: '#0B1426', color: '#E0E0E0', minHeight: '100vh', padding: '2rem', fontFamily: 'monospace' }}>
          <h1 style={{ color: '#E74C3C', fontSize: '1.5rem', marginBottom: '1rem' }}>Something went wrong</h1>
          <pre style={{ background: '#152238', padding: '1rem', borderRadius: '0.5rem', overflow: 'auto', fontSize: '0.85rem', whiteSpace: 'pre-wrap' }}>
            {this.state.error.message}
            {'\n\n'}
            {this.state.error.stack}
          </pre>
          <button
            onClick={() => { this.setState({ error: null }); window.location.reload(); }}
            style={{ marginTop: '1rem', background: '#2DD4A8', color: '#0B1426', border: 'none', padding: '0.5rem 1.5rem', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: 600 }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Core pages — loaded eagerly (always needed on first render)
import Dashboard from './pages/Dashboard';
import LoginPage from './pages/LoginPage';
import SharePage from './pages/SharePage';
import ResetPasswordPage from './pages/ResetPasswordPage';

// ModulePage is lazy — it pulls in ~300 KB of module components, WritingStylePanel,
// and EXPERT_ROLES. Deferring it keeps the initial bundle ~40% smaller.
// The Suspense fallback is already in place so the first navigation is seamless.
const ModulePage = lazy(() => import('./pages/ModulePage'));
// Web UX v2 — editorial home with Activity/Agent toggle rail at /home-v2.
// (We tried a parallel /module-v2 page too; user preferred the existing
// ModulePage layout so that experiment was dropped.)
const HomeV2 = lazy(() => import('./pages/HomeV2'));

// Heavy/secondary pages — lazy-loaded to reduce initial bundle size
const PromptPage = lazy(() => import('./pages/PromptPage'));
const WorkflowsPage = lazy(() => import('./pages/WorkflowsPage'));
const WorkflowBuilder = lazy(() => import('./pages/WorkflowBuilder'));
const EventTriggersPage = lazy(() => import('./pages/EventTriggersPage'));
const BuildYourOwnWorkflow = lazy(() => import('./pages/BuildYourOwnWorkflow'));
const DatasetsPage = lazy(() => import('./pages/DatasetsPage'));
const Settings = lazy(() => import('./pages/Settings'));
const ProjectsPage = lazy(() => import('./pages/ProjectsPage'));
const BuildYourOwnModule = lazy(() => import('./pages/BuildYourOwnModule'));
const SkillsLibrary = lazy(() => import('./pages/SkillsLibrary'));
const HardwareKnowledgePacksPage = lazy(() => import('./pages/HardwareKnowledgePacksPage'));
const HardwareBuildPage = lazy(() => import('./pages/HardwareBuildPage'));
const HardwareProjectPage = lazy(() => import('./pages/HardwareProjectPage'));
const HardwareDiagnosePage = lazy(() => import('./pages/HardwareDiagnosePage'));
const HardwareMaintainPage = lazy(() => import('./pages/HardwareMaintainPage'));
const HardwareRegulatoryPage = lazy(() => import('./pages/HardwareRegulatoryPage'));
const HardwareHumanitarianPage = lazy(() => import('./pages/HardwareHumanitarianPage'));
const HardwareTemplatesPage = lazy(() => import('./pages/HardwareTemplatesPage'));
const HardwareReviewQueuePage = lazy(() => import('./pages/HardwareReviewQueuePage'));
// Portals (spec v0.2)
const PortalsLandingPage = lazy(() => import('./pages/portals/PortalsLandingPage'));
const PortalsTemplateGalleryPage = lazy(() => import('./pages/portals/PortalsTemplateGalleryPage'));
const PortalsDiscoveryPage = lazy(() => import('./pages/portals/PortalsDiscoveryPage'));
const PortalsInboxPage = lazy(() => import('./pages/portals/PortalsInboxPage'));
const PortalBuilderPage = lazy(() => import('./pages/portals/PortalBuilderPage'));
const PortalManagePage = lazy(() => import('./pages/portals/PortalManagePage'));
const PortalVisitorPage = lazy(() => import('./pages/portals/PortalVisitorPage'));
const EvidencePackListPage = lazy(() => import('./pages/evidence-pack/EvidencePackListPage'));
const EvidencePackBuilderPage = lazy(() => import('./pages/evidence-pack/EvidencePackBuilderPage'));
const EvidencePackViewerPage = lazy(() => import('./pages/evidence-pack/EvidencePackViewerPage'));
const BriefMePage = lazy(() => import('./pages/BriefMePage'));
const GuideMePage = lazy(() => import('./pages/GuideMePage'));
const BatchCreatePage = lazy(() => import('./pages/BatchCreatePage'));
const FillFormPage = lazy(() => import('./pages/FillFormPage'));
const ChallengeThisPage = lazy(() => import('./pages/ChallengeThisPage'));
const DualInterpretationPage = lazy(() => import('./pages/DualInterpretationPage'));
const AuditLogPage = lazy(() => import('./pages/AuditLogPage'));
const ExchangePage = lazy(() => import('./pages/ExchangePage'));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'));
const DataInsightsPage = lazy(() => import('./pages/DataInsightsPage'));
const ReviewEnginePage = lazy(() => import('./pages/ReviewEnginePage'));
const SoundingBoardPage = lazy(() => import('./pages/SoundingBoardPage'));
const ABTestPage = lazy(() => import('./pages/ABTestPage'));
const AICouncilPage = lazy(() => import('./pages/AICouncilPage'));
const KnowledgePage = lazy(() => import('./pages/KnowledgePage'));
const DeadlinesPage = lazy(() => import('./pages/DeadlinesPage'));
const RadarPage = lazy(() => import('./pages/RadarPage'));
const CoworkerGallery = lazy(() => import('./features/coworkers/CoworkerGallery'));
const VersionHistoryPage = lazy(() => import('./pages/VersionHistoryPage'));
const QualityPage = lazy(() => import('./pages/QualityPage'));
const ApprenticePage = lazy(() => import('./pages/ApprenticePage'));
const KnowledgeGraphPage = lazy(() => import('./pages/KnowledgeGraphPage'));
const IntelligenceDashboard = lazy(() => import('./pages/IntelligenceDashboard'));
const PatternDetectionPage = lazy(() => import('./pages/PatternDetectionPage'));
const CompliancePage = lazy(() => import('./pages/CompliancePage'));
const CompliancePosturePage = lazy(() => import('./pages/CompliancePosturePage'));
const RiskAppetiteDashboard = lazy(() => import('./pages/RiskAppetiteDashboard'));
const KnowledgeBasePage = lazy(() => import('./pages/KnowledgeBasePage'));
const MyWorkPage = lazy(() => import('./pages/MyWorkPage'));
const DiscoverPage = lazy(() => import('./pages/DiscoverPage'));
const ComparisonPage = lazy(() => import('./pages/ComparisonPage'));
const GovernanceDashboard = lazy(() => import('./pages/GovernanceDashboard'));
const SkillPacksPage = lazy(() => import('./pages/SkillPacksPage'));
const MarketplacePage = lazy(() => import('./pages/MarketplacePage'));

// Presentations Area pages
const PresentationsLandingPage = lazy(() => import('./pages/PresentationsLandingPage'));
const PresentationBuilderPage = lazy(() => import('./pages/PresentationBuilderPage'));

// Coding Area pages
const CodingLandingPage = lazy(() => import('./pages/CodingLandingPage'));
const CodeReviewPage = lazy(() => import('./pages/CodeReviewPage'));
const ScriptLitePage = lazy(() => import('./pages/ScriptLitePage'));
const ScriptMediumPage = lazy(() => import('./pages/ScriptMediumPage'));
const CodingLargeDiscoveryPage = lazy(() => import('./pages/CodingLargeDiscoveryPage'));
const CodingLargeProjectPage = lazy(() => import('./pages/CodingLargeProjectPage'));
const CodingLargeArchitecturePage = lazy(() => import('./pages/CodingLargeArchitecturePage'));
const CodingLargeReleasePage = lazy(() => import('./pages/CodingLargeReleasePage'));
const InstructionBuilderPage = lazy(() => import('./pages/InstructionBuilderPage'));
const AlignmentReviewerPage = lazy(() => import('./pages/AlignmentReviewerPage'));

// Engagement Task pages
const EngagementListPage = lazy(() => import('./pages/EngagementListPage'));
const EngagementWorkspacePage = lazy(() => import('./pages/EngagementWorkspacePage'));

// NGO & Social Impact Hub
const NGOHubPage = lazy(() => import('./pages/NGOHubPage'));

// Trades & Service Workers Hub
const TradesHubPage = lazy(() => import('./pages/TradesHubPage'));

// PE/VC Hub + Innovation Radar
const PEVCHubPage = lazy(() => import('./pages/PEVCHubPage'));
const InnovationRadarPage = lazy(() => import('./pages/InnovationRadarPage'));

// Strategic Improvements — Orchestration
const OrchestrationDashboard = lazy(() => import('./pages/OrchestrationDashboard'));

// FCP Interactive Modes
const CounselsDesk = lazy(() => import('./pages/CounselsDesk'));
const OrchestratorDashboard = lazy(() => import('./pages/OrchestratorDashboard'));
const OrchestratorTrailViewer = lazy(() => import('./pages/OrchestratorTrailViewer'));
const GapAssessmentHub = lazy(() => import('./pages/GapAssessmentHub'));
const GapAssessmentWizard = lazy(() => import('./pages/GapAssessmentWizard'));
const AntonTaskAgentPage = lazy(() => import('./pages/AntonTaskAgentPage'));
const SystemCardsPage = lazy(() => import('./pages/SystemCardsPage'));

// Pathfinder — AI-Powered Multi-Model Search
const PathfinderPage = lazy(() => import('./pages/PathfinderPage'));
const PathfinderHistoryPage = lazy(() => import('./pages/PathfinderHistoryPage'));

// Data Partnerships — Roaring + Dow Jones
const RoaringSearchPage = lazy(() => import('./pages/RoaringSearchPage'));
const DJScreeningPage = lazy(() => import('./pages/DJScreeningPage'));
const PartnershipDemo = lazy(() => import('./pages/PartnershipDemo'));
const RegulatoryFeedPage = lazy(() => import('./pages/RegulatoryFeedPage'));
const LoreLedgerPage = lazy(() => import('./pages/LoreLedgerPage'));
const EntityIntelligencePage = lazy(() => import('./pages/EntityIntelligencePage'));

// News Tab pages
const NewsPage = lazy(() => import('./pages/news/NewsPage'));
const NewsFeedPage = lazy(() => import('./pages/news/NewsFeedPage'));
const StoryDetailPage = lazy(() => import('./pages/news/StoryDetailPage'));
const TruthCheckPage = lazy(() => import('./pages/news/TruthCheckPage'));
const NewsSourcesPage = lazy(() => import('./pages/news/NewsSourcesPage'));
const MyBiasPage = lazy(() => import('./pages/news/MyBiasPage'));

// Finance Tab pages
const FinancePage = lazy(() => import('./pages/finance/FinancePage'));
const FinanceLearnPage = lazy(() => import('./pages/finance/FinanceLearnPage'));
const FinanceCalculatorsPage = lazy(() => import('./pages/finance/FinanceCalculatorsPage'));
const FinanceMarketPage = lazy(() => import('./pages/finance/FinanceMarketPage'));
const FinanceWatchlistPage = lazy(() => import('./pages/finance/FinanceWatchlistPage'));
const FinanceGoalsPage = lazy(() => import('./pages/finance/FinanceGoalsPage'));

// Life Platform hub
const LifePage = lazy(() => import('./pages/LifePage'));

// Travel Tab pages
const TravelPage = lazy(() => import('./pages/travel/TravelPage'));
const TravelTripsPage = lazy(() => import('./pages/travel/TravelTripsPage'));
const TravelPlannerPage = lazy(() => import('./pages/travel/TravelPlannerPage'));
const TravelCountryGuidePage = lazy(() => import('./pages/travel/TravelCountryGuidePage'));
const TravelExplorePage = lazy(() => import('./pages/travel/TravelExplorePage'));

// Community Tab pages
const CommunityPage = lazy(() => import('./pages/community/CommunityPage'));
const CommunityContactsPage = lazy(() => import('./pages/community/CommunityContactsPage'));
const CommunityMessagesPage = lazy(() => import('./pages/community/CommunityMessagesPage'));
const CommunityForumPage = lazy(() => import('./pages/community/CommunityForumPage'));
const CommunityIdentityPage = lazy(() => import('./pages/community/CommunityIdentityPage'));
const CommunityGroupsPage = lazy(() => import('./pages/community/CommunityGroupsPage'));
const CommunityGroupPage = lazy(() => import('./pages/community/CommunityGroupPage'));
const CommunityGroupForumPage = lazy(() => import('./pages/community/CommunityGroupForumPage'));
const CommunityGroupModerationPage = lazy(() => import('./pages/community/CommunityGroupModerationPage'));
const CommunityJoinPage = lazy(() => import('./pages/community/CommunityJoinPage'));
const CommunityMailPage = lazy(() => import('./pages/community/CommunityMailPage'));
const CommunityCalendarPage = lazy(() => import('./pages/community/CommunityCalendarPage'));
const CommunityEventPage = lazy(() => import('./pages/community/CommunityEventPage'));
const CommunitySharedKnowledgePage = lazy(() => import('./pages/community/CommunitySharedKnowledgePage'));
const CommunityTasksPage = lazy(() => import('./pages/community/CommunityTasksPage'));
const CommunityProjectsPage = lazy(() => import('./pages/community/CommunityProjectsPage'));
const CommunityProjectDetailPage = lazy(() => import('./pages/community/CommunityProjectDetailPage'));
const CommunityCapabilityCardPage = lazy(() => import('./pages/community/CommunityCapabilityCardPage'));
const BeehivePage = lazy(() => import('./pages/community/BeehivePage'));
const BeehiveSessionPage = lazy(() => import('./pages/community/BeehiveSessionPage'));
const MissionsPage = lazy(() => import('./pages/missions/MissionsPage'));
const MissionCreatorPage = lazy(() => import('./pages/missions/MissionCreatorPage'));
const MissionDashboardPage = lazy(() => import('./pages/missions/MissionDashboardPage'));
const MissionInboxPage = lazy(() => import('./pages/missions/MissionInboxPage'));
const CredentialVaultPage = lazy(() => import('./pages/missions/CredentialVaultPage'));
const ServicePacksPage = lazy(() => import('./pages/missions/ServicePacksPage'));

// Risk Atlas pages
const RiskAtlasLandingPage = lazy(() => import('./pages/risk-atlas/RiskAtlasLandingPage'));
const RiskAtlasSetupPage = lazy(() => import('./pages/risk-atlas/RiskAtlasSetupPage'));
const RiskAtlasWorkspacePage = lazy(() => import('./pages/risk-atlas/RiskAtlasWorkspacePage'));
const SmallBusinessDashboardPage = lazy(() => import('./pages/risk-atlas/SmallBusinessDashboardPage'));

// FutureChain / Payments pages
const FCDashboardPage = lazy(() => import('./pages/futurechain/FCDashboardPage'));
const FCKycPage = lazy(() => import('./pages/futurechain/FCKycPage'));
const FCWalletsPage = lazy(() => import('./pages/futurechain/FCWalletsPage'));
const FCTransactionsPage = lazy(() => import('./pages/futurechain/FCTransactionsPage'));
const FCBudgetPage = lazy(() => import('./pages/futurechain/FCBudgetPage'));
const FCMarketplacePage = lazy(() => import('./pages/futurechain/FCMarketplacePage'));
const FCSettingsPage = lazy(() => import('./pages/futurechain/FCSettingsPage'));
const FCGatewayPage = lazy(() => import('./pages/futurechain/FCGatewayPage'));

// Markets Pillar pages
const MarketsPage = lazy(() => import('./pages/markets/MarketsPage'));
const MarketDataSourcesPage = lazy(() => import('./pages/markets/MarketDataSourcesPage'));
const MarketThesesPage = lazy(() => import('./pages/markets/MarketThesesPage'));
const MarketPredictionsPage = lazy(() => import('./pages/markets/MarketPredictionsPage'));
const MarketEntitiesPage = lazy(() => import('./pages/markets/MarketEntitiesPage'));
const MarketIndexesPage = lazy(() => import('./pages/markets/MarketIndexesPage'));
const MarketIndexDetailPage = lazy(() => import('./pages/markets/MarketIndexDetailPage'));
const MarketThesisDetailPage = lazy(() => import('./pages/markets/MarketThesisDetailPage'));
const MarketIndexCreatePage = lazy(() => import('./pages/markets/MarketIndexCreatePage'));
const MarketLearningPage = lazy(() => import('./pages/markets/MarketLearningPage'));
const MarketInvestigationPage = lazy(() => import('./pages/markets/MarketInvestigationPage'));
const MarketWorkflowsPage = lazy(() => import('./pages/markets/MarketWorkflowsPage'));
const MarketComputationPage = lazy(() => import('./pages/markets/MarketComputationPage'));
const MarketAtomsPage = lazy(() => import('./pages/markets/MarketAtomsPage'));
const MarketWhyChainsPage = lazy(() => import('./pages/markets/MarketWhyChainsPage'));
const MarketWhyChainDetailPage = lazy(() => import('./pages/markets/MarketWhyChainDetailPage'));
const MarketPatternsPage = lazy(() => import('./pages/markets/MarketPatternsPage'));
const MarketWatchlistPage = lazy(() => import('./pages/markets/MarketWatchlistPage'));
const MarketEventCalendarPage = lazy(() => import('./pages/markets/MarketEventCalendarPage'));
const MarketRCIPage = lazy(() => import('./pages/markets/MarketRCIPage'));
const MarketGoalsProfilePage = lazy(() => import('./pages/markets/MarketGoalsProfilePage'));
const MarketBacktestsPage = lazy(() => import('./pages/markets/MarketBacktestsPage'));
const MarketOnboardingPage = lazy(() => import('./pages/markets/MarketOnboardingPage'));

// Azure OpenAI Settings
const AzureOpenAISettingsPage = lazy(() => import('./pages/settings/AzureOpenAISettingsPage'));

// App Gateway admin
const AppGatewayPage = lazy(() => import('./pages/AppGatewayPage'));

// Procure Pillar pages
const ProcurePage = lazy(() => import('./pages/procure/ProcurePage'));
const ProcureCyclePage = lazy(() => import('./pages/procure/ProcureCyclePage'));

// Civic Pillar pages
const CivicPage = lazy(() => import('./pages/civic/CivicPage'));
const CivicEngagementPage = lazy(() => import('./pages/civic/CivicEngagementPage'));

// Specialized Agents
const AgentHubPage = lazy(() => import('./pages/agents/AgentHubPage'));

// Talent Discovery & Recruitment pages
const TalentPage = lazy(() => import('./pages/talent/TalentPage'));
const TalentCampaignPage = lazy(() => import('./pages/talent/TalentCampaignPage'));

// Grow Pillar pages
const GrowPage = lazy(() => import('./pages/grow/GrowPage'));
const GrowContactsPage = lazy(() => import('./pages/grow/GrowContactsPage'));
const GrowOrganisationsPage = lazy(() => import('./pages/grow/GrowOrganisationsPage'));
const GrowPipelinePage = lazy(() => import('./pages/grow/GrowPipelinePage'));
const GrowOpportunityPage = lazy(() => import('./pages/grow/GrowOpportunityPage'));

// School Mode pages
const SchoolDashboardPage = lazy(() => import('./pages/school/SchoolDashboardPage'));
const SchoolChatPage = lazy(() => import('./pages/school/SchoolChatPage'));
const SubjectsPage = lazy(() => import('./pages/school/SubjectsPage'));
const StudentAssignmentsPage = lazy(() => import('./pages/school/StudentAssignmentsPage'));
const SchoolSettingsPage = lazy(() => import('./pages/school/SchoolSettingsPage'));
const SchoolProfilePage = lazy(() => import('./pages/school/SchoolProfilePage'));
const SchoolCodingPage = lazy(() => import('./pages/school/SchoolCodingPage'));
const SchoolCodingChatPage = lazy(() => import('./pages/school/SchoolCodingChatPage'));
const SchoolOnboardingPage = lazy(() => import('./pages/school/SchoolOnboardingPage'));
const MyRadarPage = lazy(() => import('./pages/school/MyRadarPage'));
const TeacherDashboardPage = lazy(() => import('./pages/school/TeacherDashboardPage'));
const TeacherClassConfigPage = lazy(() => import('./pages/school/TeacherClassConfigPage'));
const TeacherStudentsPage = lazy(() => import('./pages/school/TeacherStudentsPage'));
const TeacherClassProgressPage = lazy(() => import('./pages/school/TeacherClassProgressPage'));
const TeacherOversightPage = lazy(() => import('./pages/school/TeacherOversightPage'));
const GuardianDashboardPage = lazy(() => import('./pages/school/GuardianDashboardPage'));
const AssignmentBuilderPage = lazy(() => import('./pages/school/AssignmentBuilderPage'));
const AssignmentTakingPage = lazy(() => import('./pages/school/AssignmentTakingPage'));
const CourseJourneyPage = lazy(() => import('./pages/school/CourseJourneyPage'));
const SubmissionReviewerPage = lazy(() => import('./pages/school/SubmissionReviewerPage'));
const LessonLibraryPage = lazy(() => import('./pages/school/LessonLibraryPage'));
const LessonBuilderPage = lazy(() => import('./pages/school/LessonBuilderPage'));
const SocraticExamPage = lazy(() => import('./pages/school/SocraticExamPage'));
const ReviewPage = lazy(() => import('./pages/school/ReviewPage'));
const ParentDashboardPage = lazy(() => import('./pages/school/ParentDashboardPage'));
const UCASStatementPage = lazy(() => import('./pages/school/UCASStatementPage'));
const StudyRoomsPage = lazy(() => import('./pages/school/StudyRoomsPage'));
const StudyRoomPage = lazy(() => import('./pages/school/StudyRoomPage'));
const SchoolLoginPage = lazy(() => import('./pages/school/SchoolLoginPage'));
const SchoolCurriculumPage = lazy(() => import('./pages/school/SchoolCurriculumPage'));
const SchoolLessonPage = lazy(() => import('./pages/school/SchoolLessonPage'));
const SchoolLessonBuilderPage = lazy(() => import('./pages/school/SchoolLessonBuilderPage'));

export default function App() {
  const { i18n } = useTranslation();
  const { user, isLoading, isTeamMode, checkAuth, setIsTeamMode } = useAuthStore();
  // Controls whether the landing page has been dismissed.
  // In solo mode the user can bypass it with one click; in team mode login is required.
  // Persisted to localStorage so a page refresh doesn't flash the start page.
  const [hasEntered, setHasEntered] = useState(() =>
    localStorage.getItem('openexpert-has-entered') === 'true'
  );
  // Onboarding tour — shown once on first launch, dismissed via localStorage flag
  const [showTour, setShowTour] = useState(false);

  useEffect(() => {
    const rtlLanguages = ['ar', 'fa', 'he', 'ur'];
    document.documentElement.dir = rtlLanguages.includes(i18n.language) ? 'rtl' : 'ltr';
    document.documentElement.lang = i18n.language;
  }, [i18n.language]);

  // Restore language preference from user profile on mount (best-effort).
  // localStorage wins for anonymous/solo users; profile wins when it differs.
  useEffect(() => {
    const storedLang = localStorage.getItem('openexpert-language');
    fetch('/api/profile')
      .then(r => r.ok ? r.json() : null)
      .then(profile => {
        if (profile?.output_language && profile.output_language !== storedLang) {
          i18n.changeLanguage(profile.output_language);
          localStorage.setItem('openexpert-language', profile.output_language);
        }
      })
      .catch(() => {}); // best-effort
  }, []);

  useEffect(() => {
    // Pre-fetch CSRF token so it's ready before the first mutating request
    ensureCsrfToken();
  }, []);

  useEffect(() => {
    // Fetch deployment config then check auth
    fetch('/api/config')
      .then((r) => r.json())
      .then((data: { deploymentMode?: string }) => {
        const teamMode = data.deploymentMode === 'team';
        setIsTeamMode(teamMode);
      })
      .catch(() => {})
      .finally(() => {
        checkAuth();
      });
  }, [checkAuth, setIsTeamMode]);

  // Show tour on first launch (after auth check completes)
  useEffect(() => {
    if (!isLoading && (user || hasEntered)) {
      if (shouldShowTour()) {
        setShowTour(true);
      }
    }
  }, [isLoading, user, hasEntered]);

  // Show loading spinner while checking auth
  if (isLoading) {
    return (
      <div className="min-h-screen bg-adv-dark flex items-center justify-center">
        <span className="text-adv-gray text-sm">Loading...</span>
      </div>
    );
  }

  // Show landing page until the user has entered.
  // Team mode: login required — no bypass option.
  // Solo mode: bypass available via "Enter Anton" button.
  if (!user && !hasEntered) {
    return (
      <LoginPage
        onEnterWithoutLogin={!isTeamMode ? () => { localStorage.setItem('openexpert-has-entered', 'true'); setHasEntered(true); } : undefined}
      />
    );
  }

  const fallback = (
    <div className="min-h-screen bg-adv-dark flex items-center justify-center">
      <span className="text-adv-gray text-sm">Loading...</span>
    </div>
  );

  // In team mode: redirect to login if session token has expired (e.g. navigating after
  // a long idle). In solo mode: hasEntered bypasses login so no redirect needed.
  function ProtectedRoute({ children }: { children: React.ReactNode }) {
    if (isTeamMode && !user) {
      return <Navigate to="/" replace />;
    }
    return <>{children}</>;
  }

  return (
    <AppErrorBoundary>
      <PWAInstallPrompt />
      <CommandPalette />
      <OnboardingTour isOpen={showTour} onClose={() => setShowTour(false)} />
      <Suspense fallback={fallback}>
      <Routes>
        {/* Standalone public page — no sidebar/header */}
        <Route path="/share/:token" element={<SharePage />} />

        {/* Password reset — public, standalone */}
        <Route path="/reset-password" element={<ResetPasswordPage />} />

        {/* Main app layout — ProtectedRoute re-checks auth on every navigation */}
        <Route element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
          {/* Home is now the Web UX v2 design (editorial brief + Activity/Agent rail).
              Old Dashboard kept at /home-v1 as fallback during transition. */}
          <Route path="/" element={<HomeV2 />} />
          <Route path="/home-v1" element={<Dashboard />} />
          <Route path="/brief" element={<BriefMePage />} />
          <Route path="/guide" element={<GuideMePage />} />
          <Route path="/fill" element={<FillFormPage />} />
          <Route path="/challenge" element={<ChallengeThisPage />} />
          <Route path="/dual" element={<DualInterpretationPage />} />
          <Route path="/batch" element={<BatchCreatePage />} />
          <Route path="/prompt" element={<PromptPage />} />
          <Route path="/module/:moduleId" element={<ModulePage />} />
          <Route path="/workflows" element={<WorkflowsPage />} />
          <Route path="/workflows/builder" element={<WorkflowBuilder />} />
          <Route path="/workflows/builder/:id" element={<WorkflowBuilder />} />
          <Route path="/workflows/build-ai" element={<BuildYourOwnWorkflow />} />
          <Route path="/workflows/triggers" element={<EventTriggersPage />} />
          <Route path="/orchestration" element={<OrchestrationDashboard />} />
          <Route path="/datasets" element={<DatasetsPage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/build-module" element={<BuildYourOwnModule />} />
          <Route path="/skills" element={<SkillsLibrary />} />
          <Route path="/hardware" element={<HardwareBuildPage />} />
          <Route path="/hardware/projects/:id" element={<HardwareProjectPage />} />
          <Route path="/hardware/projects/:id/diagnose" element={<HardwareDiagnosePage />} />
          <Route path="/hardware/projects/:id/maintain" element={<HardwareMaintainPage />} />
          <Route path="/hardware/projects/:id/regulatory" element={<HardwareRegulatoryPage />} />
          <Route path="/hardware/projects/:id/regulatory/:kind" element={<HardwareRegulatoryPage />} />
          <Route path="/hardware/projects/:id/humanitarian" element={<HardwareHumanitarianPage />} />
          <Route path="/hardware/templates" element={<HardwareTemplatesPage />} />
          <Route path="/hardware/review-queue" element={<HardwareReviewQueuePage />} />
          {/* Portals (spec v0.2) */}
          <Route path="/portals" element={<PortalsLandingPage />} />
          <Route path="/portals/build" element={<PortalsTemplateGalleryPage />} />
          <Route path="/portals/build/:templateId" element={<PortalBuilderPage />} />
          <Route path="/portals/discovery" element={<PortalsDiscoveryPage />} />
          <Route path="/portals/inbox" element={<PortalsInboxPage />} />
          <Route path="/portals/:id/manage" element={<PortalManagePage />} />
          <Route path="/portals/p/:address" element={<PortalVisitorPage />} />
          <Route path="/evidence-packs" element={<EvidencePackListPage />} />
          <Route path="/evidence-packs/new" element={<EvidencePackBuilderPage />} />
          <Route path="/evidence-packs/:id" element={<EvidencePackViewerPage />} />
          <Route path="/hardware/knowledge-packs" element={<HardwareKnowledgePacksPage />} />
          <Route path="/audit" element={<AuditLogPage />} />
          <Route path="/exchange" element={<ExchangePage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/insights" element={<DataInsightsPage />} />
          <Route path="/review" element={<ReviewEnginePage />} />
          <Route path="/sounding-board" element={<SoundingBoardPage />} />
          <Route path="/ab-test" element={<ABTestPage />} />
          <Route path="/council" element={<AICouncilPage />} />
          <Route path="/knowledge" element={<KnowledgePage />} />
          <Route path="/deadlines" element={<DeadlinesPage />} />
          <Route path="/radar" element={<RadarPage />} />
          <Route path="/coworkers" element={<CoworkerGallery />} />
          <Route path="/versions" element={<VersionHistoryPage />} />
          <Route path="/quality" element={<QualityPage />} />
          <Route path="/apprentice" element={<ApprenticePage />} />
          <Route path="/graph" element={<KnowledgeGraphPage />} />
          <Route path="/intelligence" element={<IntelligenceDashboard />} />
          <Route path="/patterns" element={<PatternDetectionPage />} />
          <Route path="/compliance" element={<CompliancePage />} />
          <Route path="/compliance-posture" element={<CompliancePosturePage />} />
          <Route path="/risk-appetite" element={<RiskAppetiteDashboard />} />
          <Route path="/knowledge-base" element={<KnowledgeBasePage />} />
          <Route path="/my-work" element={<MyWorkPage />} />
          <Route path="/discover" element={<DiscoverPage />} />
          <Route path="/compare" element={<ComparisonPage />} />
          <Route path="/governance" element={<GovernanceDashboard />} />
          <Route path="/system-cards" element={<SystemCardsPage />} />
          <Route path="/system-cards/:moduleId" element={<SystemCardsPage />} />
          <Route path="/skill-packs" element={<SkillPacksPage />} />
          <Route path="/marketplace" element={<MarketplacePage />} />
          {/* Presentations Area */}
          <Route path="/presentations" element={<PresentationsLandingPage />} />
          <Route path="/presentations/builder" element={<PresentationBuilderPage />} />
          {/* Coding Area */}
          <Route path="/coding" element={<CodingLandingPage />} />
          <Route path="/coding/review" element={<CodeReviewPage />} />
          <Route path="/coding/script-lite" element={<ScriptLitePage />} />
          <Route path="/coding/script-medium" element={<ScriptMediumPage />} />
          <Route path="/coding/large" element={<CodingLargeDiscoveryPage />} />
          <Route path="/coding/large/project/:projectId" element={<CodingLargeProjectPage />} />
          <Route path="/coding/large/project/:projectId/architecture" element={<CodingLargeArchitecturePage />} />
          <Route path="/coding/large/project/:projectId/releases/:releaseId" element={<CodingLargeReleasePage />} />
          <Route path="/coding/instruction-builder" element={<InstructionBuilderPage />} />
          <Route path="/coding/alignment-reviewer" element={<AlignmentReviewerPage />} />
          {/* Engagement Task */}
          <Route path="/engagements" element={<EngagementListPage />} />
          <Route path="/engagements/:id" element={<EngagementWorkspacePage />} />
          {/* Life Platform hub */}
          <Route path="/life" element={<LifePage />} />
          {/* News Tab */}
          <Route path="/news" element={<NewsPage />} />
          <Route path="/news/feed" element={<NewsFeedPage />} />
          <Route path="/news/story/:id" element={<StoryDetailPage />} />
          <Route path="/news/truth-check" element={<TruthCheckPage />} />
          <Route path="/news/sources" element={<NewsSourcesPage />} />
          <Route path="/news/my-bias" element={<MyBiasPage />} />
          {/* Finance Tab */}
          <Route path="/finance" element={<FinancePage />} />
          <Route path="/finance/learn" element={<FinanceLearnPage />} />
          <Route path="/finance/calculators" element={<FinanceCalculatorsPage />} />
          <Route path="/finance/market" element={<FinanceMarketPage />} />
          <Route path="/finance/watchlist" element={<FinanceWatchlistPage />} />
          <Route path="/finance/goals" element={<FinanceGoalsPage />} />
          {/* Travel Tab */}
          <Route path="/travel" element={<TravelPage />} />
          <Route path="/travel/trips" element={<TravelTripsPage />} />
          <Route path="/travel/planner" element={<TravelPlannerPage />} />
          <Route path="/travel/country/:code" element={<TravelCountryGuidePage />} />
          <Route path="/travel/explore" element={<TravelExplorePage />} />
          {/* Community Tab */}
          <Route path="/community" element={<CommunityPage />} />
          <Route path="/community/contacts" element={<CommunityContactsPage />} />
          <Route path="/community/messages" element={<CommunityMessagesPage />} />
          <Route path="/community/forum" element={<CommunityForumPage />} />
          <Route path="/community/identity" element={<CommunityIdentityPage />} />
          <Route path="/community/groups" element={<CommunityGroupsPage />} />
          <Route path="/community/groups/:id" element={<CommunityGroupPage />} />
          <Route path="/community/groups/:id/forum" element={<CommunityGroupForumPage />} />
          <Route path="/community/groups/:id/moderation" element={<CommunityGroupModerationPage />} />
          <Route path="/community/join" element={<CommunityJoinPage />} />
          <Route path="/community/mail" element={<CommunityMailPage />} />
          <Route path="/community/calendar" element={<CommunityCalendarPage />} />
          <Route path="/community/events/:id" element={<CommunityEventPage />} />
          <Route path="/community/shared-knowledge" element={<CommunitySharedKnowledgePage />} />
          <Route path="/community/tasks" element={<CommunityTasksPage />} />
          <Route path="/community/projects" element={<CommunityProjectsPage />} />
          <Route path="/community/projects/:id" element={<CommunityProjectDetailPage />} />
          <Route path="/community/capability-card" element={<CommunityCapabilityCardPage />} />
          <Route path="/community/beehive" element={<BeehivePage />} />
          <Route path="/community/beehive/:id" element={<BeehiveSessionPage />} />
          {/* Missions — autonomous multi-step work */}
          <Route path="/missions" element={<MissionsPage />} />
          <Route path="/missions/new" element={<MissionCreatorPage />} />
          <Route path="/missions/inbox" element={<MissionInboxPage />} />
          <Route path="/missions/credentials" element={<CredentialVaultPage />} />
          <Route path="/missions/service-packs" element={<ServicePacksPage />} />
          <Route path="/missions/:id" element={<MissionDashboardPage />} />
          {/* Risk Atlas — universal seven-stage threat-path methodology */}
          <Route path="/atlas" element={<RiskAtlasLandingPage />} />
          <Route path="/atlas/new" element={<RiskAtlasSetupPage />} />
          <Route path="/atlas/small-business" element={<SmallBusinessDashboardPage />} />
          <Route path="/atlas/:id" element={<RiskAtlasWorkspacePage />} />
          {/* FutureChain / Payments */}
          <Route path="/futurechain" element={<FCDashboardPage />} />
          <Route path="/futurechain/kyc" element={<FCKycPage />} />
          <Route path="/futurechain/wallets" element={<FCWalletsPage />} />
          <Route path="/futurechain/transactions" element={<FCTransactionsPage />} />
          <Route path="/futurechain/budget" element={<FCBudgetPage />} />
          <Route path="/futurechain/marketplace" element={<FCMarketplacePage />} />
          <Route path="/futurechain/settings" element={<FCSettingsPage />} />
          <Route path="/futurechain/gateway" element={<FCGatewayPage />} />
          {/* NGO & Social Impact Hub */}
          <Route path="/ngo" element={<NGOHubPage />} />
          {/* Trades & Service Workers Hub */}
          <Route path="/trades" element={<TradesHubPage />} />
          {/* PE/VC Hub + Innovation Radar */}
          <Route path="/pe-vc" element={<PEVCHubPage />} />
          <Route path="/innovation-radar" element={<InnovationRadarPage />} />
          {/* FCP Interactive Modes */}
          <Route path="/counsels-desk" element={<CounselsDesk />} />
          <Route path="/orchestrator" element={<OrchestratorDashboard />} />
          <Route path="/orchestrator/trail/:id" element={<OrchestratorTrailViewer />} />
          <Route path="/gap-assessment" element={<GapAssessmentHub />} />
          <Route path="/gap-assessment/:id" element={<GapAssessmentWizard />} />
          <Route path="/task-agent" element={<AntonTaskAgentPage />} />
          {/* Data Partnerships — Roaring + Dow Jones */}
          <Route path="/roaring" element={<RoaringSearchPage />} />
          <Route path="/dj-screening" element={<DJScreeningPage />} />
          <Route path="/entity-intelligence" element={<EntityIntelligencePage />} />
          <Route path="/demo/data-partnerships" element={<PartnershipDemo />} />
          <Route path="/regulatory-feed" element={<RegulatoryFeedPage />} />
          <Route path="/lore-ledger" element={<LoreLedgerPage />} />
          {/* Pathfinder — AI-Powered Multi-Model Search */}
          <Route path="/pathfinder" element={<PathfinderPage />} />
          <Route path="/pathfinder/history" element={<PathfinderHistoryPage />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/settings/azure-openai" element={<AzureOpenAISettingsPage />} />
          {/* App Gateway admin */}
          <Route path="/app-gateway" element={<AppGatewayPage />} />
          <Route path="/settings/org-context" element={<Navigate to="/settings?tab=org-context" replace />} />
          {/* Markets Pillar */}
          <Route path="/markets" element={<MarketsPage />} />
          <Route path="/markets/sources" element={<MarketDataSourcesPage />} />
          <Route path="/markets/theses" element={<MarketThesesPage />} />
          <Route path="/markets/theses/:id" element={<MarketThesisDetailPage />} />
          <Route path="/markets/predictions" element={<MarketPredictionsPage />} />
          <Route path="/markets/entities" element={<MarketEntitiesPage />} />
          <Route path="/markets/indexes" element={<MarketIndexesPage />} />
          <Route path="/markets/indexes/create" element={<MarketIndexCreatePage />} />
          <Route path="/markets/indexes/:id" element={<MarketIndexDetailPage />} />
          <Route path="/markets/learning" element={<MarketLearningPage />} />
          <Route path="/markets/investigations" element={<MarketInvestigationPage />} />
          <Route path="/markets/workflows" element={<MarketWorkflowsPage />} />
          <Route path="/markets/computation" element={<MarketComputationPage />} />
          <Route path="/markets/atoms" element={<MarketAtomsPage />} />
          <Route path="/markets/why-chains" element={<MarketWhyChainsPage />} />
          <Route path="/markets/why-chains/:id" element={<MarketWhyChainDetailPage />} />
          <Route path="/markets/patterns" element={<MarketPatternsPage />} />
          <Route path="/markets/watchlist" element={<MarketWatchlistPage />} />
          <Route path="/markets/events" element={<MarketEventCalendarPage />} />
          <Route path="/markets/rci" element={<MarketRCIPage />} />
          <Route path="/markets/goals" element={<MarketGoalsProfilePage />} />
          <Route path="/markets/backtests" element={<MarketBacktestsPage />} />
          <Route path="/markets/onboarding" element={<MarketOnboardingPage />} />

          {/* Procure Pillar — phased procurement pipeline */}
          <Route path="/procure" element={<ProcurePage />} />
          <Route path="/procure/cycle/:cycleId" element={<ProcureCyclePage />} />

          {/* Civic Pillar — government & public institution navigator */}
          <Route path="/civic" element={<CivicPage />} />
          <Route path="/civic/engagement/:engagementId" element={<CivicEngagementPage />} />

          {/* Specialized Agents */}
          <Route path="/agents" element={<AgentHubPage />} />

          {/* Talent Discovery & Recruitment */}
          <Route path="/talent" element={<TalentPage />} />
          <Route path="/talent/campaign/:campaignId" element={<TalentCampaignPage />} />

          {/* Grow Pillar — CRM & business development intelligence */}
          <Route path="/grow" element={<GrowPage />} />
          <Route path="/grow/contacts" element={<GrowContactsPage />} />
          <Route path="/grow/organisations" element={<GrowOrganisationsPage />} />
          <Route path="/grow/pipeline" element={<GrowPipelinePage />} />
          <Route path="/grow/opportunities/:id" element={<GrowOpportunityPage />} />
        </Route>

        {/* School Mode login — public, no auth required */}
        <Route path="/school/login" element={<SchoolLoginPage />} />

        {/* School Mode — own layout (SchoolLayout), no MainLayout wrapper */}
        <Route element={<ProtectedRoute><Outlet /></ProtectedRoute>}>
          <Route path="/school" element={<SchoolDashboardPage />} />
          <Route path="/school/onboarding" element={<SchoolOnboardingPage />} />
          <Route path="/school/chat" element={<SchoolChatPage />} />
          <Route path="/school/subjects" element={<SubjectsPage />} />
          <Route path="/school/assignments" element={<StudentAssignmentsPage />} />
          <Route path="/school/settings" element={<SchoolSettingsPage />} />
          <Route path="/school/profile" element={<SchoolProfilePage />} />
          <Route path="/school/coding" element={<SchoolCodingPage />} />
          <Route path="/school/coding/:module" element={<SchoolCodingChatPage />} />
          <Route path="/school/teacher" element={<TeacherDashboardPage />} />
          <Route path="/school/teacher/classes/new" element={<TeacherClassConfigPage />} />
          <Route path="/school/teacher/classes/:classId/settings" element={<TeacherClassConfigPage />} />
          <Route path="/school/teacher/classes/:classId/progress" element={<TeacherClassProgressPage />} />
          <Route path="/school/teacher/students" element={<TeacherStudentsPage />} />
          <Route path="/school/teacher/oversight" element={<TeacherOversightPage />} />
          <Route path="/school/teacher/assignments/new" element={<AssignmentBuilderPage />} />
          <Route path="/school/assignments/:id/take" element={<AssignmentTakingPage />} />
          <Route path="/school/assignments/:id/socratic" element={<SocraticExamPage />} />
          <Route path="/school/journey" element={<CourseJourneyPage />} />
          <Route path="/school/radar" element={<MyRadarPage />} />
          <Route path="/school/teacher/submissions/:submissionId" element={<SubmissionReviewerPage />} />
          <Route path="/school/teacher/lessons" element={<LessonLibraryPage />} />
          <Route path="/school/teacher/lessons/new" element={<LessonBuilderPage />} />
          <Route path="/school/teacher/lessons/:lessonId/edit" element={<LessonBuilderPage />} />
          <Route path="/school/guardian" element={<GuardianDashboardPage />} />
          <Route path="/school/review" element={<ReviewPage />} />
          <Route path="/school/parent" element={<ParentDashboardPage />} />
          <Route path="/school/ucas" element={<UCASStatementPage />} />
          <Route path="/school/study-rooms" element={<StudyRoomsPage />} />
          <Route path="/school/study-room/:roomId" element={<StudyRoomPage />} />
          <Route path="/school/curriculum" element={<SchoolCurriculumPage />} />
          <Route path="/school/lesson/:lessonId" element={<SchoolLessonPage />} />
          <Route path="/school/lesson-builder" element={<SchoolLessonBuilderPage />} />
        </Route>
      </Routes>
    </Suspense>
    </AppErrorBoundary>
  );
}
