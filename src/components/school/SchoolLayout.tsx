import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { isOnboardingComplete } from '@/pages/school/SchoolOnboardingPage';
import {
  GraduationCap,
  BookOpen,
  LayoutDashboard,
  MessageSquare,
  ClipboardList,
  Users,
  ChevronLeft,
  Menu,
  X,
  Settings,
  User,
  Code,
  Route,
  Newspaper,
  BookMarked,
  FlipHorizontal,
  Heart,
} from 'lucide-react';
import Header from '@/components/layout/Header';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useAuthStore } from '@/stores/useAuthStore';
import OfflineBanner from '@/components/school/OfflineBanner';

interface SchoolNavItem {
  id: string;
  labelKey: string;
  icon: React.ReactNode;
  path: string;
  roles?: string[];
}

const STUDENT_NAV: SchoolNavItem[] = [
  {
    id: 'dashboard',
    labelKey: 'nav.dashboard',
    icon: <LayoutDashboard className="h-4 w-4" />,
    path: '/school',
  },
  {
    id: 'subjects',
    labelKey: 'nav.subjects',
    icon: <BookOpen className="h-4 w-4" />,
    path: '/school/subjects',
  },
  {
    id: 'chat',
    labelKey: 'nav.study',
    icon: <MessageSquare className="h-4 w-4" />,
    path: '/school/chat',
  },
  {
    id: 'assignments',
    labelKey: 'nav.assignments',
    icon: <ClipboardList className="h-4 w-4" />,
    path: '/school/assignments',
  },
  {
    id: 'journey',
    labelKey: 'nav.journey',
    icon: <Route className="h-4 w-4" />,
    path: '/school/journey',
  },
  {
    id: 'coding',
    labelKey: 'nav.coding',
    icon: <Code className="h-4 w-4" />,
    path: '/school/coding',
  },
  {
    id: 'radar',
    labelKey: 'nav.radar',
    icon: <Newspaper className="h-4 w-4" />,
    path: '/school/radar',
  },
  {
    id: 'review',
    labelKey: 'nav.review',
    icon: <FlipHorizontal className="h-4 w-4" />,
    path: '/school/review',
  },
  {
    id: 'ucas',
    labelKey: 'nav.ucas',
    icon: <BookMarked className="h-4 w-4" />,
    path: '/school/ucas',
  },
  {
    id: 'study-rooms',
    labelKey: 'nav.studyRooms',
    icon: <Users className="h-4 w-4" />,
    path: '/school/study-rooms',
  },
  {
    id: 'curriculum',
    labelKey: 'nav.lessonLibrary',
    icon: <BookOpen className="h-4 w-4" />,
    path: '/school/curriculum',
  },
];

const GUARDIAN_NAV: SchoolNavItem[] = [
  {
    id: 'parent-view',
    labelKey: 'nav.parentView',
    icon: <Heart className="h-4 w-4" />,
    path: '/school/parent',
    roles: ['guardian'],
  },
];

const TEACHER_NAV: SchoolNavItem[] = [
  {
    id: 'teacher-dashboard',
    labelKey: 'nav.myClasses',
    icon: <LayoutDashboard className="h-4 w-4" />,
    path: '/school/teacher',
    roles: ['teacher', 'school_admin'],
  },
  {
    id: 'create-assignment',
    labelKey: 'nav.createAssignment',
    icon: <ClipboardList className="h-4 w-4" />,
    path: '/school/teacher/assignments/new',
    roles: ['teacher', 'school_admin'],
  },
  {
    id: 'lessons',
    labelKey: 'nav.lessons',
    icon: <BookMarked className="h-4 w-4" />,
    path: '/school/teacher/lessons',
    roles: ['teacher', 'school_admin'],
  },
  {
    id: 'students',
    labelKey: 'nav.students',
    icon: <Users className="h-4 w-4" />,
    path: '/school/teacher/students',
    roles: ['teacher', 'school_admin'],
  },
];

interface SchoolLayoutProps {
  children: React.ReactNode;
}

const RTL_LANGUAGES = ['ar', 'he', 'fa', 'ur'];

export default function SchoolLayout({ children }: SchoolLayoutProps) {
  const { t, i18n } = useTranslation('school');
  const location = useLocation();
  const navigate = useNavigate();
  const { setAppMode } = useSettingsStore();
  const { user, isTeamMode } = useAuthStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // RTL support — apply dir attribute to school layout root
  const isRtl = RTL_LANGUAGES.includes(i18n.language);

  // In team mode, unauthenticated users go to the school login page (not the work-mode login)
  useEffect(() => {
    if (isTeamMode && !user) {
      navigate('/school/login', { replace: true });
    }
  }, [isTeamMode, user, navigate]);

  // Determine school role from user profile (falls back to 'student')
  const schoolRole = ((user as Record<string, unknown> | null)?.school_role as string | undefined) ?? 'student';

  // Redirect new students to onboarding (teachers skip onboarding)
  useEffect(() => {
    if (user && schoolRole === 'student' && !isOnboardingComplete(user.id)) {
      if (location.pathname !== '/school/onboarding') {
        navigate('/school/onboarding', { replace: true });
      }
    }
  }, [user, schoolRole, location.pathname, navigate]);

  const navItems = schoolRole === 'teacher' || schoolRole === 'school_admin'
    ? [...STUDENT_NAV, ...TEACHER_NAV]
    : schoolRole === 'guardian'
    ? [...STUDENT_NAV, ...GUARDIAN_NAV]
    : STUDENT_NAV;

  function handleExitSchoolMode() {
    setAppMode('work');
    navigate('/');
  }

  const SidebarContent = () => (
    <div className="flex h-full flex-col bg-adv-dark-2">
      {/* School mode header */}
      <div className="flex items-center gap-2.5 border-b border-border px-4 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-adv-teal/10">
          <GraduationCap className="h-4 w-4 text-adv-teal" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-adv-white truncate">
            {t('nav.schoolMode', 'School Mode')}
          </p>
          <p className="text-xs text-adv-gray-med capitalize">
            {t(`nav.role.${schoolRole}`, schoolRole)}
          </p>
        </div>
        {/* Mobile close */}
        <button
          onClick={() => setSidebarOpen(false)}
          className="rounded-lg p-1 text-adv-gray hover:text-adv-off-white transition-colors lg:hidden"
          aria-label={t('nav.close')}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Nav items */}
      <nav className="flex-1 overflow-y-auto px-3 py-3">
        <div className="space-y-0.5">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path ||
              (item.path !== '/school' && location.pathname.startsWith(item.path));
            return (
              <Link
                key={item.id}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-adv-teal ${
                  isActive
                    ? 'bg-adv-teal/10 text-adv-teal font-medium'
                    : 'text-adv-gray hover:bg-adv-card hover:text-adv-off-white'
                }`}
              >
                {item.icon}
                {t(item.labelKey, item.id)}
              </Link>
            );
          })}
        </div>

        {/* Teacher section separator */}
        {(schoolRole === 'teacher' || schoolRole === 'school_admin') && (
          <div className="mt-4 mb-2 px-3">
            <p className="text-xs font-medium uppercase tracking-widest text-adv-gray-med">
              {t('nav.teacherTools', 'Teacher Tools')}
            </p>
          </div>
        )}
      </nav>

      {/* Bottom actions */}
      <div className="border-t border-border px-3 py-3 space-y-1">
        <Link
          to="/school/settings"
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-adv-gray hover:bg-adv-card hover:text-adv-off-white transition-colors"
        >
          <Settings className="h-4 w-4" />
          {t('nav.schoolSettings', 'School Settings')}
        </Link>

        <Link
          to="/school/profile"
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-adv-gray hover:bg-adv-card hover:text-adv-off-white transition-colors"
        >
          <User className="h-4 w-4" />
          {t('nav.myProfile', 'My Profile')}
        </Link>

        <button
          type="button"
          onClick={handleExitSchoolMode}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-adv-gray hover:bg-adv-card hover:text-adv-off-white transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          {t('nav.backToWork', 'Back to Work Mode')}
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-background" dir={isRtl ? 'rtl' : 'ltr'} lang={i18n.language}>
      {/* Desktop sidebar — uses logical border (border-e flips for RTL) */}
      <aside className="hidden w-60 shrink-0 border-e border-border lg:block">
        <SidebarContent />
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
          <aside className="absolute inset-y-0 start-0 w-64 z-50">
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header onMenuClick={() => setSidebarOpen(true)} />
        <OfflineBanner />
        <main className="flex-1 overflow-auto p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
