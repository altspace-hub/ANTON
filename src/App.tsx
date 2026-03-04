import { useEffect, lazy, Suspense, useState } from 'react';
import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import MainLayout from './components/layout/MainLayout';
import { useAuthStore } from './stores/useAuthStore';
import PWAInstallPrompt from './components/shared/PWAInstallPrompt';
import { CommandPalette } from './components/shared/CommandPalette';
import OnboardingTour, { shouldShowTour } from './components/OnboardingTour';

// Core pages — loaded eagerly (always needed on first render)
import Dashboard from './pages/Dashboard';
import LoginPage from './pages/LoginPage';
import SharePage from './pages/SharePage';
import ResetPasswordPage from './pages/ResetPasswordPage';

// ModulePage is lazy — it pulls in ~300 KB of module components, WritingStylePanel,
// and EXPERT_ROLES. Deferring it keeps the initial bundle ~40% smaller.
// The Suspense fallback is already in place so the first navigation is seamless.
const ModulePage = lazy(() => import('./pages/ModulePage'));

// Heavy/secondary pages — lazy-loaded to reduce initial bundle size
const PromptPage = lazy(() => import('./pages/PromptPage'));
const WorkflowsPage = lazy(() => import('./pages/WorkflowsPage'));
const WorkflowBuilder = lazy(() => import('./pages/WorkflowBuilder'));
const BuildYourOwnWorkflow = lazy(() => import('./pages/BuildYourOwnWorkflow'));
const DatasetsPage = lazy(() => import('./pages/DatasetsPage'));
const Settings = lazy(() => import('./pages/Settings'));
const ProjectsPage = lazy(() => import('./pages/ProjectsPage'));
const BuildYourOwnModule = lazy(() => import('./pages/BuildYourOwnModule'));
const SkillsLibrary = lazy(() => import('./pages/SkillsLibrary'));
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

// School Mode pages
const SchoolDashboardPage = lazy(() => import('./pages/school/SchoolDashboardPage'));
const SchoolChatPage = lazy(() => import('./pages/school/SchoolChatPage'));
const TeacherDashboardPage = lazy(() => import('./pages/school/TeacherDashboardPage'));
const TeacherClassConfigPage = lazy(() => import('./pages/school/TeacherClassConfigPage'));
const GuardianDashboardPage = lazy(() => import('./pages/school/GuardianDashboardPage'));
const AssignmentBuilderPage = lazy(() => import('./pages/school/AssignmentBuilderPage'));
const SubmissionReviewerPage = lazy(() => import('./pages/school/SubmissionReviewerPage'));

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
    <>
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
          <Route path="/" element={<Dashboard />} />
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
          <Route path="/datasets" element={<DatasetsPage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/build-module" element={<BuildYourOwnModule />} />
          <Route path="/skills" element={<SkillsLibrary />} />
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
          <Route path="/knowledge-base" element={<KnowledgeBasePage />} />
          <Route path="/my-work" element={<MyWorkPage />} />
          <Route path="/discover" element={<DiscoverPage />} />
          <Route path="/compare" element={<ComparisonPage />} />
          <Route path="/governance" element={<GovernanceDashboard />} />
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
          {/* NGO & Social Impact Hub */}
          <Route path="/ngo" element={<NGOHubPage />} />
          {/* Trades & Service Workers Hub */}
          <Route path="/trades" element={<TradesHubPage />} />
          {/* PE/VC Hub + Innovation Radar */}
          <Route path="/pe-vc" element={<PEVCHubPage />} />
          <Route path="/innovation-radar" element={<InnovationRadarPage />} />
          <Route path="/settings" element={<Settings />} />
        </Route>

        {/* School Mode — own layout (SchoolLayout), no MainLayout wrapper */}
        <Route element={<ProtectedRoute><Outlet /></ProtectedRoute>}>
          <Route path="/school" element={<SchoolDashboardPage />} />
          <Route path="/school/chat" element={<SchoolChatPage />} />
          <Route path="/school/subjects" element={<SchoolDashboardPage />} />
          <Route path="/school/assignments" element={<SchoolDashboardPage />} />
          <Route path="/school/teacher" element={<TeacherDashboardPage />} />
          <Route path="/school/teacher/classes/new" element={<TeacherClassConfigPage />} />
          <Route path="/school/teacher/classes/:classId/settings" element={<TeacherClassConfigPage />} />
          <Route path="/school/teacher/assignments/new" element={<AssignmentBuilderPage />} />
          <Route path="/school/teacher/submissions/:submissionId" element={<SubmissionReviewerPage />} />
          <Route path="/school/guardian" element={<GuardianDashboardPage />} />
        </Route>
      </Routes>
    </Suspense>
    </>
  );
}
