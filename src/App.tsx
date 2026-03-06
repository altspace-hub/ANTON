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
const EventTriggersPage = lazy(() => import('./pages/EventTriggersPage'));
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

// Strategic Improvements — Orchestration
const OrchestrationDashboard = lazy(() => import('./pages/OrchestrationDashboard'));

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
const CommunityJoinPage = lazy(() => import('./pages/community/CommunityJoinPage'));
const CommunityMailPage = lazy(() => import('./pages/community/CommunityMailPage'));
const CommunityCalendarPage = lazy(() => import('./pages/community/CommunityCalendarPage'));
const CommunityEventPage = lazy(() => import('./pages/community/CommunityEventPage'));

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
          <Route path="/workflows/triggers" element={<EventTriggersPage />} />
          <Route path="/orchestration" element={<OrchestrationDashboard />} />
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
          <Route path="/community/join" element={<CommunityJoinPage />} />
          <Route path="/community/mail" element={<CommunityMailPage />} />
          <Route path="/community/calendar" element={<CommunityCalendarPage />} />
          <Route path="/community/events/:id" element={<CommunityEventPage />} />
          {/* NGO & Social Impact Hub */}
          <Route path="/ngo" element={<NGOHubPage />} />
          {/* Trades & Service Workers Hub */}
          <Route path="/trades" element={<TradesHubPage />} />
          {/* PE/VC Hub + Innovation Radar */}
          <Route path="/pe-vc" element={<PEVCHubPage />} />
          <Route path="/innovation-radar" element={<InnovationRadarPage />} />
          <Route path="/settings" element={<Settings />} />
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
    </>
  );
}
