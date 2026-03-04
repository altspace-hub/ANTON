import { useState, useEffect } from 'react';
import { getAuthHeader } from '@/lib/api';
import { useTranslation } from 'react-i18next';
import { Star, Clock, TrendingUp, BookOpen, Loader2, Flame } from 'lucide-react';
import SchoolLayout from '@/components/school/SchoolLayout';

interface ChildSummary {
  name: string;
  sessionsThisWeek: number;
  totalXp: number;
  currentStreak: number;
  growthStage: string;
  subjects: string[];
  reviewCardsDue: number;
  lastActive: string | null;
}

interface LinkedChild {
  id: string;
  name: string;
}

export default function ParentDashboardPage() {
  const { t } = useTranslation('school');
  const [children, setChildren] = useState<LinkedChild[]>([]);
  const [selectedChild, setSelectedChild] = useState<string | null>(null);
  const [summary, setSummary] = useState<ChildSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadChildren();
  }, []);

  useEffect(() => {
    if (selectedChild) loadSummary(selectedChild);
  }, [selectedChild]);

  async function loadChildren() {
    try {
      const res = await fetch('/api/school/guardian/children', { headers: getAuthHeader() });
      if (res.ok) {
        const data = await res.json();
        const list = (data.children ?? []) as LinkedChild[];
        setChildren(list);
        if (list.length > 0) setSelectedChild(list[0].id);
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function loadSummary(childId: string) {
    try {
      const res = await fetch(`/api/school/parent/child-summary/${childId}`, { headers: getAuthHeader() });
      if (res.ok) setSummary(await res.json());
    } catch {}
  }

  if (isLoading) {
    return (
      <SchoolLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-6 w-6 animate-spin text-adv-teal" />
        </div>
      </SchoolLayout>
    );
  }

  return (
    <SchoolLayout>
      <div className="mx-auto max-w-2xl space-y-6">
        <h1 className="text-xl font-bold text-adv-white">{t('guardian.parent.title', 'Parent View')}</h1>

        {children.length === 0 ? (
          <div className="rounded-xl border border-border bg-adv-card p-8 text-center">
            <p className="text-adv-gray">{t('guardian.dashboard.linkPrompt', 'Link a student account to see their progress.')}</p>
          </div>
        ) : (
          <>
            {/* Child selector */}
            {children.length > 1 && (
              <div className="flex gap-2">
                {children.map(c => (
                  <button
                    key={c.id}
                    onClick={() => setSelectedChild(c.id)}
                    className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${selectedChild === c.id ? 'bg-adv-teal text-adv-dark' : 'border border-border text-adv-gray hover:text-adv-off-white'}`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            )}

            {summary && (
              <>
                {/* Stats grid */}
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  {[
                    { icon: <Clock className="h-4 w-4 text-adv-teal" />, value: summary.sessionsThisWeek, label: t('guardian.parent.sessionsThisWeek', 'Sessions this week') },
                    { icon: <Star className="h-4 w-4 text-adv-gold" />, value: summary.totalXp, label: 'XP' },
                    { icon: <Flame className="h-4 w-4 text-adv-gold" />, value: `${summary.currentStreak}d`, label: t('guardian.parent.streak', 'Streak') },
                    { icon: <TrendingUp className="h-4 w-4 text-adv-teal" />, value: summary.growthStage, label: t('guardian.parent.stage', 'Stage') },
                  ].map((stat, i) => (
                    <div key={i} className="rounded-xl border border-border bg-adv-card p-4 text-center">
                      <div className="flex justify-center mb-1">{stat.icon}</div>
                      <p className="text-xl font-bold text-adv-white">{stat.value}</p>
                      <p className="text-xs text-adv-gray-med">{stat.label}</p>
                    </div>
                  ))}
                </div>

                {/* Subjects studied */}
                {summary.subjects.length > 0 && (
                  <section className="rounded-xl border border-border bg-adv-card p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <BookOpen className="h-4 w-4 text-adv-teal" />
                      <h2 className="text-sm font-semibold text-adv-off-white">{t('guardian.parent.subjectsStudied', 'Subjects studied this week')}</h2>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {summary.subjects.map(s => (
                        <span key={s} className="rounded-full border border-adv-teal/30 bg-adv-teal/5 px-3 py-1 text-xs text-adv-teal">{s}</span>
                      ))}
                    </div>
                  </section>
                )}

                {/* Review cards */}
                {summary.reviewCardsDue > 0 && (
                  <div className="rounded-xl border border-adv-gold/20 bg-adv-gold/5 p-4 text-sm text-adv-gold">
                    📚 {summary.reviewCardsDue} {t('guardian.parent.cardsDue', 'review cards due today')}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </SchoolLayout>
  );
}
