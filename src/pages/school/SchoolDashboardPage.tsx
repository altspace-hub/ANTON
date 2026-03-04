import { useState, useEffect } from 'react';
import { getAuthHeader } from '@/lib/api';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  BookOpen,
  ArrowRight,
  MessageSquare,
  ChevronRight,
  Star,
  Clock,
  Loader2,
  TrendingUp,
  Bell,
} from 'lucide-react';
import SchoolLayout from '@/components/school/SchoolLayout';
import { useAuthStore } from '@/stores/useAuthStore';

interface ClassCard {
  id: string;
  name: string;
  subjectId: string;
  educationTier: string;
  overallProgressPct: number;
  teacherPersona: string;
  currentTopic?: string;
  dueDate?: string;
}

interface QuickStats {
  timeThisWeek: number;   // minutes
  assignmentsDue: number;
  sessionsThisWeek: number;
}

export default function SchoolDashboardPage() {
  const { t } = useTranslation('school');
  const { user } = useAuthStore();

  const [classes, setClasses] = useState<ClassCard[]>([]);
  const [stats, setStats] = useState<QuickStats>({ timeThisWeek: 0, assignmentsDue: 0, sessionsThisWeek: 0 });
  const [growthStage, setGrowthStage] = useState<string | null>(null);
  const [upcomingAssignments, setUpcomingAssignments] = useState<{ id: string; title: string; due_date?: string; class_name?: string }[]>([]);
  const [quickQuestion, setQuickQuestion] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    try {
      setIsLoading(true);
      const res = await fetch('/api/school/dashboard', {
        headers: { ...getAuthHeader() },
      });
      if (res.ok) {
        const data = await res.json();
        setClasses(data.classes ?? []);
        setStats(data.stats ?? { timeThisWeek: 0, assignmentsDue: 0, sessionsThisWeek: 0 });
        if (data.growthProfile?.stage) setGrowthStage(data.growthProfile.stage);
        if (Array.isArray(data.assignments)) setUpcomingAssignments(data.assignments);
      }
    } catch {
      // Non-fatal: show empty dashboard
    } finally {
      setIsLoading(false);
    }
  }

  const displayName = user?.display_name || user?.username || '';

  return (
    <SchoolLayout>
      <div className="mx-auto max-w-5xl space-y-6">
        {/* Welcome header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-adv-white">
              {t('dashboard.welcome', { name: displayName })}
            </h1>
            <p className="mt-0.5 text-sm text-adv-gray">
              {new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
          </div>

          {/* Right: growth stage + session count */}
          <div className="flex items-center gap-3">
            {stats.sessionsThisWeek > 0 && (
              <div className="hidden sm:flex items-center gap-1.5 text-xs text-adv-gray">
                <Clock className="h-3.5 w-3.5" />
                {stats.sessionsThisWeek} session{stats.sessionsThisWeek !== 1 ? 's' : ''} this week
              </div>
            )}
            {growthStage && (
              <div className="flex items-center gap-1.5 rounded-full border border-adv-teal/30 bg-adv-teal/10 px-2.5 py-1 text-xs font-semibold text-adv-teal">
                <TrendingUp className="h-3 w-3" />
                {growthStage}
              </div>
            )}
          </div>
        </div>

        {/* Due date notification strip */}
        {upcomingAssignments.length > 0 && (
          <div className="flex items-start gap-2.5 rounded-xl border border-adv-gold/20 bg-adv-gold/5 px-4 py-3">
            <Bell className="h-4 w-4 shrink-0 text-adv-gold mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-adv-gold mb-1.5">
                {upcomingAssignments.length} upcoming assignment{upcomingAssignments.length !== 1 ? 's' : ''}
              </p>
              <div className="flex flex-wrap gap-2">
                {upcomingAssignments.map((a) => (
                  <Link
                    key={a.id}
                    to="/school/assignments"
                    className="flex items-center gap-1.5 rounded-lg border border-adv-gold/20 bg-adv-dark px-2.5 py-1 text-xs text-adv-off-white hover:border-adv-gold/40 transition-colors"
                  >
                    <Star className="h-3 w-3 text-adv-gold" />
                    <span className="truncate max-w-[120px]">{a.title}</span>
                    {a.due_date && (
                      <span className="text-adv-gold shrink-0">
                        · {new Date(a.due_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Quick Question bar */}
        <div className="rounded-xl border border-border bg-adv-card p-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-widest text-adv-teal">
            {t('dashboard.quickQuestion')}
          </p>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (quickQuestion.trim()) {
                window.location.href = `/school/chat?q=${encodeURIComponent(quickQuestion)}`;
              }
            }}
          >
            <input
              type="text"
              value={quickQuestion}
              onChange={(e) => setQuickQuestion(e.target.value)}
              placeholder={t('dashboard.quickQuestionPlaceholder')}
              className="flex-1 rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder:text-adv-gray-med focus:border-adv-teal focus:outline-none focus:ring-2 focus:ring-adv-teal/20"
              aria-label={t('dashboard.quickQuestion')}
            />
            <button
              type="submit"
              className="rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark focus:outline-none focus:ring-2 focus:ring-adv-teal"
            >
              <MessageSquare className="h-4 w-4" />
            </button>
          </form>
          <p className="mt-1.5 text-xs text-adv-gray-med">{t('dashboard.quickQuestionHelp')}</p>
        </div>

        {/* This Week section */}
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-adv-gray-med">
            {t('dashboard.thisWeek')}
          </h2>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-adv-teal" />
              <span className="ml-2 text-sm text-adv-gray">{t('dashboard.loading')}</span>
            </div>
          ) : classes.length === 0 ? (
            <div className="rounded-xl border border-border bg-adv-card p-8 text-center">
              <BookOpen className="mx-auto mb-3 h-10 w-10 text-adv-gray-med" />
              <p className="text-sm text-adv-gray">{t('dashboard.noClasses')}</p>
              <p className="mt-1 text-xs text-adv-gray-med">{t('dashboard.enrollPrompt')}</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {classes.map((cls) => (
                <SubjectCard key={cls.id} classCard={cls} />
              ))}
            </div>
          )}
        </section>

        {/* My Progress */}
        {classes.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold uppercase tracking-widest text-adv-gray-med">
                {t('dashboard.myProgress')}
              </h2>
              <Link
                to="/school/subjects"
                className="flex items-center gap-1 text-xs text-adv-teal hover:underline"
              >
                {t('dashboard.allSubjects')}
                <ChevronRight className="h-3 w-3" />
              </Link>
            </div>

            <div className="space-y-3">
              {classes.map((cls) => (
                <div key={cls.id} className="rounded-xl border border-border bg-adv-card p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-adv-off-white">
                      {t(`subject.${cls.subjectId}`, cls.subjectId)}
                    </span>
                    <span className="text-xs text-adv-teal">
                      {t('dashboard.progressLabel', { pct: cls.overallProgressPct })}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-adv-dark">
                    <div
                      className="h-full rounded-full bg-adv-teal transition-all duration-500"
                      style={{ width: `${cls.overallProgressPct}%` }}
                      role="progressbar"
                      aria-valuenow={cls.overallProgressPct}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={t('dashboard.progressLabel', { pct: cls.overallProgressPct })}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </SchoolLayout>
  );
}

interface SubjectCardProps {
  classCard: ClassCard;
}

function SubjectCard({ classCard }: SubjectCardProps) {
  const { t } = useTranslation('school');
  const hasProgress = classCard.overallProgressPct > 0;

  return (
    <Link
      to={`/school/chat?classId=${classCard.id}`}
      className="group flex flex-col rounded-xl border border-border bg-adv-card p-4 transition-colors hover:border-adv-teal/40 hover:bg-adv-teal/5 focus:outline-none focus:ring-2 focus:ring-adv-teal"
    >
      {/* Icon and subject name */}
      <div className="mb-3 flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-adv-teal/10">
          <BookOpen className="h-4 w-4 text-adv-teal" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-adv-off-white truncate">
            {classCard.name}
          </p>
          {classCard.currentTopic && (
            <p className="text-xs text-adv-gray truncate">{classCard.currentTopic}</p>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-adv-dark">
        <div
          className="h-full rounded-full bg-adv-teal"
          style={{ width: `${classCard.overallProgressPct}%` }}
        />
      </div>

      {/* Footer */}
      <div className="mt-auto flex items-center justify-between">
        {classCard.dueDate && (
          <span className="text-xs text-adv-gold">
            Due {new Date(classCard.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          </span>
        )}
        <span className="ms-auto flex items-center gap-1 text-xs font-medium text-adv-teal group-hover:gap-1.5 transition-all">
          {hasProgress ? t('dashboard.continueStudying') : t('dashboard.startStudying')}
          <ArrowRight className="h-3 w-3" />
        </span>
      </div>
    </Link>
  );
}
