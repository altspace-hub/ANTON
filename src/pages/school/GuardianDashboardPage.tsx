import { useState, useEffect } from 'react';
import { getAuthHeader } from '@/lib/api';
import { useTranslation } from 'react-i18next';
import {
  BookOpen,
  Clock,
  CalendarClock,
  Loader2,
  Link2,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import SchoolLayout from '@/components/school/SchoolLayout';

interface ChildProgress {
  studentId: string;
  studentName: string;
  subjects: Array<{
    name: string;
    progressPct: number;
    lastActive: string;
  }>;
  timeThisWeekMinutes: number;
  upcomingDeadlines: Array<{
    title: string;
    dueDate: string;
    subject: string;
  }>;
}

export default function GuardianDashboardPage() {
  const { t } = useTranslation('school');
  const [children, setChildren] = useState<ChildProgress[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [linkCode, setLinkCode] = useState('');
  const [linkStatus, setLinkStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [linkError, setLinkError] = useState('');

  useEffect(() => {
    loadChildren();
  }, []);

  async function loadChildren() {
    try {
      const res = await fetch('/api/school/guardian/children', { headers: getAuthHeader() });
      if (res.ok) setChildren(await res.json());
    } catch { /* non-fatal */ }
    finally { setIsLoading(false); }
  }

  async function handleLink(e: React.FormEvent) {
    e.preventDefault();
    if (!linkCode.trim()) return;
    setLinkStatus('loading');
    setLinkError('');
    try {
      const res = await fetch('/api/school/guardian/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ inviteCode: linkCode.trim() }),
      });
      if (!res.ok) throw new Error(await res.text());
      setLinkStatus('success');
      setLinkCode('');
      setTimeout(() => {
        setShowLinkForm(false);
        setLinkStatus('idle');
        loadChildren();
      }, 2000);
    } catch (err) {
      setLinkStatus('error');
      setLinkError(t('guardian.link.error'));
    }
  }

  return (
    <SchoolLayout schoolRole="guardian">
      <div className="mx-auto max-w-3xl space-y-6">
        {/* Link form */}
        {!isLoading && children.length === 0 && !showLinkForm && (
          <div className="rounded-xl border border-border bg-adv-card p-8 text-center">
            <Link2 className="mx-auto mb-3 h-10 w-10 text-adv-gray-med" />
            <p className="text-sm text-adv-gray">{t('guardian.dashboard.linkPrompt')}</p>
            <button
              type="button"
              onClick={() => setShowLinkForm(true)}
              className="mt-4 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark"
            >
              {t('guardian.link.title')}
            </button>
          </div>
        )}

        {showLinkForm && (
          <div className="rounded-xl border border-border bg-adv-card p-5">
            <h2 className="mb-1 text-base font-semibold text-adv-white">{t('guardian.link.title')}</h2>
            <p className="mb-4 text-sm text-adv-gray">{t('guardian.link.enterCode')}</p>
            <form onSubmit={handleLink} className="flex gap-2">
              <input
                type="text"
                value={linkCode}
                onChange={(e) => setLinkCode(e.target.value)}
                placeholder={t('guardian.link.codePlaceholder')}
                className="flex-1 rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none"
              />
              <button
                type="submit"
                disabled={linkStatus === 'loading' || !linkCode.trim()}
                className="flex items-center gap-1.5 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-40"
              >
                {linkStatus === 'loading' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {t('guardian.link.link')}
              </button>
            </form>

            {linkStatus === 'success' && (
              <div className="mt-3 flex items-center gap-2 text-sm text-adv-teal">
                <CheckCircle2 className="h-4 w-4" />
                {t('guardian.link.success', { name: '' })}
              </div>
            )}
            {linkStatus === 'error' && (
              <div className="mt-3 flex items-center gap-2 text-sm text-adv-red">
                <AlertCircle className="h-4 w-4" />
                {linkError}
              </div>
            )}

            <p className="mt-3 text-xs text-adv-gray-med">{t('guardian.link.privacyNote')}</p>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-adv-teal" />
          </div>
        ) : (
          children.map((child) => (
            <div key={child.studentId} className="space-y-4">
              <h1 className="text-xl font-bold text-adv-white">
                {t('guardian.dashboard.title', { name: child.studentName })}
              </h1>

              {/* Time stats */}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <div className="rounded-xl border border-border bg-adv-card p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Clock className="h-4 w-4 text-adv-teal" />
                    <span className="text-xs text-adv-gray-med">{t('guardian.dashboard.timeThisWeek')}</span>
                  </div>
                  <p className="text-lg font-bold text-adv-white">
                    {Math.round(child.timeThisWeekMinutes / 60)}h {child.timeThisWeekMinutes % 60}m
                  </p>
                </div>
              </div>

              {/* Subject progress */}
              <div className="rounded-xl border border-border bg-adv-card p-5">
                <h2 className="mb-3 text-sm font-semibold text-adv-off-white">{t('guardian.dashboard.subjects')}</h2>
                <div className="space-y-3">
                  {child.subjects.map((subj) => (
                    <div key={subj.name}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <BookOpen className="h-3.5 w-3.5 text-adv-teal" />
                          <span className="text-sm text-adv-off-white">{subj.name}</span>
                        </div>
                        <span className="text-xs text-adv-teal">{subj.progressPct}%</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-adv-dark">
                        <div
                          className="h-full rounded-full bg-adv-teal"
                          style={{ width: `${subj.progressPct}%` }}
                        />
                      </div>
                    </div>
                  ))}
                  {child.subjects.length === 0 && (
                    <p className="text-sm text-adv-gray">{t('guardian.dashboard.noData')}</p>
                  )}
                </div>
              </div>

              {/* Upcoming deadlines */}
              {child.upcomingDeadlines.length > 0 && (
                <div className="rounded-xl border border-border bg-adv-card p-5">
                  <h2 className="mb-3 text-sm font-semibold text-adv-off-white">{t('guardian.dashboard.upcomingDeadlines')}</h2>
                  <div className="space-y-2">
                    {child.upcomingDeadlines.map((dl, i) => (
                      <div key={i} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <CalendarClock className="h-3.5 w-3.5 text-adv-gold" />
                          <span className="text-sm text-adv-off-white">{dl.title}</span>
                          <span className="text-xs text-adv-gray">· {dl.subject}</span>
                        </div>
                        <span className="text-xs text-adv-gold">
                          {new Date(dl.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </SchoolLayout>
  );
}
