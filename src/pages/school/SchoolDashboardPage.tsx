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
  Zap,
  Flame,
  Trophy,
  CheckCircle2,
} from 'lucide-react';
import SchoolLayout from '@/components/school/SchoolLayout';
import { useAuthStore } from '@/stores/useAuthStore';
import { cacheDashboard, getCachedDashboard } from '@/lib/school-db';

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
  const [xpData, setXpData] = useState<{ total: number; level: number; nextLevelAt: number | null; currentStreak: number; longestStreak: number; streakShields?: number } | null>(null);
  const [upcomingAssignments, setUpcomingAssignments] = useState<{ id: string; title: string; due_date?: string; class_name?: string }[]>([]);
  const [leaderboard, setLeaderboard] = useState<{ enabled: boolean; entries: { rank: number; name: string; xp: number; level: number }[] } | null>(null);
  const [weeklyLeaderboard, setWeeklyLeaderboard] = useState<{ rank: number; display_name: string; total_xp: number }[]>([]);
  const [leaderboardPeriod, setLeaderboardPeriod] = useState<'all_time' | 'weekly'>('weekly');
  const [activeSeason, setActiveSeason] = useState<{ name: string; emoji: string; xp_multiplier: number; description: string; daysLeft: number } | null>(null);
  const [dailyQuests, setDailyQuests] = useState<Array<{ id: string; quest_type: string; target: number; progress: number; completed: boolean; xp_reward: number }>>([]);
  const [quickQuestion, setQuickQuestion] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    try {
      setIsLoading(true);

      // Try cache first if offline
      if (!navigator.onLine) {
        const cached = await getCachedDashboard();
        if (cached) {
          const data = cached as Record<string, unknown>;
          setClasses((data.classes as ClassCard[]) ?? []);
          setStats((data.stats as QuickStats) ?? { timeThisWeek: 0, assignmentsDue: 0, sessionsThisWeek: 0 });
          if ((data.growthProfile as { stage?: string } | undefined)?.stage) setGrowthStage((data.growthProfile as { stage: string }).stage);
          if (data.xp) setXpData(data.xp as typeof xpData);
        }
        setIsLoading(false);
        return;
      }

      const res = await fetch('/api/school/dashboard', {
        headers: { ...getAuthHeader() },
      });
      if (res.ok) {
        const data = await res.json();
        setClasses(data.classes ?? []);
        setStats(data.stats ?? { timeThisWeek: 0, assignmentsDue: 0, sessionsThisWeek: 0 });
        if (data.growthProfile?.stage) setGrowthStage(data.growthProfile.stage);
        if (data.xp) setXpData(data.xp);
        if (Array.isArray(data.assignments)) setUpcomingAssignments(data.assignments);
        // Load leaderboard for first enrolled class that has it enabled
        if (Array.isArray(data.classes) && data.classes.length > 0) {
          loadLeaderboard((data.classes as { id: string }[])[0].id);
        }
        // Cache dashboard data for offline use
        cacheDashboard(data);
      }
      // Load daily quests
      try {
        const questsRes = await fetch('/api/school/quests/today', { headers: { ...getAuthHeader() } });
        if (questsRes.ok) {
          const questsData = await questsRes.json();
          if (Array.isArray(questsData.quests)) {
            setDailyQuests(questsData.quests.map((q: { id: string; quest_type: string; target: number; progress: number; completed: number | boolean; xp_reward: number }) => ({
              ...q,
              completed: q.completed === 1 || q.completed === true,
            })));
          }
        }
      } catch { /* non-fatal */ }
      // Load active season
      try {
        const seasonRes = await fetch('/api/school/seasons/active', { headers: { ...getAuthHeader() } });
        if (seasonRes.ok) {
          const seasonData = await seasonRes.json();
          if (seasonData.season) setActiveSeason(seasonData.season);
        }
      } catch { /* non-fatal */ }
      // Load weekly leaderboard
      try {
        const weeklyRes = await fetch('/api/school/leaderboard?period=weekly&limit=5', { headers: { ...getAuthHeader() } });
        if (weeklyRes.ok) {
          const weeklyData = await weeklyRes.json();
          if (Array.isArray(weeklyData.entries)) setWeeklyLeaderboard(weeklyData.entries);
        }
      } catch { /* non-fatal */ }
    } catch {
      // Non-fatal: show empty dashboard
    } finally {
      setIsLoading(false);
    }
  }

  async function loadLeaderboard(classId: string) {
    try {
      const res = await fetch(`/api/school/classes/${classId}/leaderboard`, { headers: { ...getAuthHeader() } });
      if (res.ok) {
        const data = await res.json();
        if (data.enabled) setLeaderboard(data);
      }
    } catch { /* non-fatal */ }
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
            {growthStage && (() => {
              const STAGE_INFO: Record<string, { label: string; target: number | null }> = {
                S1: { label: 'Getting to Know', target: 5 },
                S2: { label: 'Building Confidence', target: 20 },
                S3: { label: 'Deepening Mastery', target: 50 },
                S4: { label: 'Independent Learner', target: null },
              };
              const info = STAGE_INFO[growthStage] ?? { label: growthStage, target: null };
              const sessionsLeft = info.target ? Math.max(0, info.target - (stats.sessionsThisWeek ?? 0)) : 0;
              return (
                <div className="flex flex-col items-end gap-0.5">
                  <div className="flex items-center gap-1.5 rounded-full border border-adv-teal/30 bg-adv-teal/10 px-2.5 py-1 text-xs font-semibold text-adv-teal">
                    <TrendingUp className="h-3 w-3" />
                    {growthStage} · {info.label}
                  </div>
                  {info.target !== null && sessionsLeft > 0 && (
                    <span className="text-xs text-adv-gray-med">{sessionsLeft} to next stage</span>
                  )}
                </div>
              );
            })()}
          </div>
        </div>

        {/* XP bar + streak chip */}
        {xpData && (xpData.total > 0 || xpData.currentStreak > 0) && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-adv-card px-4 py-3">
            {/* XP progress */}
            <div className="flex flex-1 min-w-[180px] items-center gap-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-adv-teal shrink-0">
                <Zap className="h-3.5 w-3.5" />
                L{xpData.level}
              </div>
              <div className="flex-1">
                <div className="h-2 w-full overflow-hidden rounded-full bg-adv-dark">
                  <div
                    className="h-full rounded-full bg-adv-teal transition-all duration-700"
                    style={{
                      width: xpData.nextLevelAt
                        ? `${Math.min(100, Math.round(((xpData.total - [0, 100, 300, 600, 1000][xpData.level - 1]) / (xpData.nextLevelAt - [0, 100, 300, 600, 1000][xpData.level - 1])) * 100))}%`
                        : '100%',
                    }}
                  />
                </div>
              </div>
              <span className="text-xs text-adv-gray-med shrink-0">
                {xpData.total} XP{xpData.nextLevelAt ? ` / ${xpData.nextLevelAt}` : ''}
              </span>
            </div>
            {/* Streak chip */}
            {xpData.currentStreak > 0 && (
              <div className="flex items-center gap-1.5 rounded-full bg-adv-gold/10 px-3 py-1 text-xs font-semibold text-adv-gold">
                <Flame className="h-3.5 w-3.5" />
                {xpData.currentStreak} day{xpData.currentStreak !== 1 ? 's' : ''}
              </div>
            )}
            {/* Streak shields chip */}
            {typeof xpData.streakShields === 'number' && xpData.streakShields > 0 && (
              <div
                className="flex items-center gap-1 rounded-full bg-adv-blue/10 px-2.5 py-1 text-xs font-semibold text-adv-blue"
                title={t('dashboard.streakShields', 'Streak shields')}
              >
                {'🛡️'.repeat(Math.min(xpData.streakShields, 3))}
                {xpData.streakShields > 3 && ` ×${xpData.streakShields}`}
              </div>
            )}
          </div>
        )}

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
        {/* Daily Quests */}
        {dailyQuests.length > 0 && (
          <section className="rounded-xl border border-border bg-adv-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <Star className="h-4 w-4 text-adv-gold" />
              <h2 className="text-sm font-semibold text-adv-off-white">Daily Quests</h2>
            </div>
            <div className="space-y-3">
              {dailyQuests.map(quest => {
                const label: Record<string, string> = {
                  chat_turns: 'Ask Alma 5 questions',
                  complete_assignment: 'Submit an assignment',
                  review_card: 'Review 3 flashcards',
                  streak_protect: 'Log in today',
                };
                const pct = Math.min(100, Math.round((quest.progress / quest.target) * 100));
                return (
                  <div key={quest.id} className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-xs ${quest.completed ? 'text-adv-teal line-through' : 'text-adv-off-white'}`}>
                          {label[quest.quest_type] ?? quest.quest_type}
                        </span>
                        <span className="text-xs text-adv-gold font-medium">+{quest.xp_reward} XP</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-adv-dark">
                        <div className="h-1.5 rounded-full bg-adv-teal transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                    {quest.completed && <CheckCircle2 className="h-4 w-4 shrink-0 text-adv-teal" />}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Active season banner */}
        {activeSeason && (
          <div className="rounded-xl border border-adv-gold/30 bg-adv-gold/5 p-4 flex items-start gap-3">
            <span className="text-2xl shrink-0">{activeSeason.emoji}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-adv-gold text-sm">{activeSeason.name}</span>
                <span className="text-xs bg-adv-gold/20 text-adv-gold px-2 py-0.5 rounded-full">
                  {activeSeason.xp_multiplier}× XP
                </span>
                <span className="text-xs text-adv-gray">{activeSeason.daysLeft} days left</span>
              </div>
              <p className="text-xs text-adv-off-white mt-1">{activeSeason.description}</p>
            </div>
          </div>
        )}

        {/* Leaderboard (class all-time + weekly toggle) */}
        {((leaderboard?.enabled && leaderboard.entries.length > 0) || weeklyLeaderboard.length > 0) && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Trophy className="h-4 w-4 text-adv-gold" />
                <h2 className="text-sm font-semibold uppercase tracking-widest text-adv-gray-med">
                  {t('leaderboard.title', { defaultValue: 'Leaderboard' })}
                </h2>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => setLeaderboardPeriod('weekly')}
                  className={`text-xs px-2.5 py-1 rounded-lg transition-colors ${leaderboardPeriod === 'weekly' ? 'bg-adv-teal text-adv-dark font-semibold' : 'text-adv-gray hover:text-white'}`}
                >
                  {t('leaderboard.weekly', { defaultValue: 'This Week' })}
                </button>
                <button
                  onClick={() => setLeaderboardPeriod('all_time')}
                  className={`text-xs px-2.5 py-1 rounded-lg transition-colors ${leaderboardPeriod === 'all_time' ? 'bg-adv-teal text-adv-dark font-semibold' : 'text-adv-gray hover:text-white'}`}
                >
                  {t('leaderboard.allTime', { defaultValue: 'All Time' })}
                </button>
              </div>
            </div>
            <div className="rounded-xl border border-border bg-adv-card overflow-hidden">
              {leaderboardPeriod === 'weekly' && weeklyLeaderboard.map((entry, i) => (
                <div key={`${entry.rank}-${i}`} className={`flex items-center gap-3 px-4 py-2.5 ${i < weeklyLeaderboard.length - 1 ? 'border-b border-border' : ''}`}>
                  <span className={`w-6 text-center text-xs font-bold shrink-0 ${
                    entry.rank === 1 ? 'text-adv-gold' : entry.rank === 2 ? 'text-slate-300' : entry.rank === 3 ? 'text-amber-600' : 'text-adv-gray-med'
                  }`}>{entry.rank}</span>
                  <span className="flex-1 text-sm text-adv-off-white">{entry.display_name}</span>
                  <span className="text-xs font-semibold text-adv-teal shrink-0">{entry.total_xp} XP</span>
                </div>
              ))}
              {leaderboardPeriod === 'all_time' && leaderboard?.enabled && leaderboard.entries.map((entry, i) => (
                <div key={i} className={`flex items-center gap-3 px-4 py-2.5 ${i < leaderboard.entries.length - 1 ? 'border-b border-border' : ''}`}>
                  <span className={`w-6 text-center text-xs font-bold shrink-0 ${
                    entry.rank === 1 ? 'text-adv-gold' : entry.rank === 2 ? 'text-slate-300' : entry.rank === 3 ? 'text-amber-600' : 'text-adv-gray-med'
                  }`}>{entry.rank}</span>
                  <span className="flex-1 text-sm text-adv-off-white">{entry.name}</span>
                  <span className="text-xs text-adv-gray-med shrink-0">L{entry.level}</span>
                  <span className="text-xs font-semibold text-adv-teal shrink-0">{entry.xp} XP</span>
                </div>
              ))}
              {leaderboardPeriod === 'weekly' && weeklyLeaderboard.length === 0 && (
                <div className="px-4 py-6 text-center text-adv-gray text-sm">
                  {t('leaderboard.noWeeklyData', { defaultValue: 'No activity yet this week. Start studying to appear here!' })}
                </div>
              )}
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
