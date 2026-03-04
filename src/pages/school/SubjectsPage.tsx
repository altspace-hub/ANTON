import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { BookOpen, ChevronRight, Loader2, GraduationCap, Users } from 'lucide-react';
import { getAuthHeader } from '@/lib/api';
import SchoolLayout from '@/components/school/SchoolLayout';

interface ClassRow {
  id: string;
  name: string;
  subject_id: string;
  education_tier: string;
  default_teacher_persona: string;
  completion_pct?: number;
  last_topic?: string;
  student_count?: number;
}

interface JoinForm {
  visible: boolean;
  code: string;
  loading: boolean;
  error: string | null;
}

export default function SubjectsPage() {
  const { t } = useTranslation('school');
  const navigate = useNavigate();
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [joinForm, setJoinForm] = useState<JoinForm>({ visible: false, code: '', loading: false, error: null });

  useEffect(() => {
    loadClasses();
  }, []);

  async function loadClasses() {
    try {
      const res = await fetch('/api/school/classes', { headers: getAuthHeader() });
      if (res.ok) {
        const data = await res.json();
        setClasses(Array.isArray(data) ? data : []);
      }
    } catch {
      // non-fatal
    } finally {
      setIsLoading(false);
    }
  }

  async function handleJoin() {
    const code = joinForm.code.trim().toUpperCase();
    if (!code) return;
    setJoinForm((p) => ({ ...p, loading: true, error: null }));
    try {
      const res = await fetch('/api/school/classes/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ classCode: code }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Join failed' }));
        throw new Error(err.error ?? 'Join failed');
      }
      setJoinForm({ visible: false, code: '', loading: false, error: null });
      loadClasses();
    } catch (err) {
      setJoinForm((p) => ({
        ...p,
        loading: false,
        error: err instanceof Error ? err.message : 'Join failed',
      }));
    }
  }

  function tierLabel(tier: string) {
    if (tier === 'T2') return t('onboarding.student.step1.tierT2', 'Years 7–9');
    if (tier === 'T3') return t('onboarding.student.step1.tierT3', 'Years 10–12');
    if (tier === 'T4') return t('onboarding.student.step1.tierT4', 'University');
    return tier;
  }

  return (
    <SchoolLayout>
      <div className="mx-auto max-w-2xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-adv-white">{t('nav.subjects', 'Subjects')}</h1>
            <p className="mt-0.5 text-sm text-adv-gray-med">
              {t('dashboard.allSubjects', 'All Subjects')}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setJoinForm((p) => ({ ...p, visible: true }))}
            className="flex items-center gap-1.5 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors"
          >
            <GraduationCap className="h-4 w-4" />
            {t('onboarding.student.step3.join', 'Join class')}
          </button>
        </div>

        {/* Join class form */}
        {joinForm.visible && (
          <div className="rounded-xl border border-adv-teal/30 bg-adv-card p-4 space-y-3">
            <p className="text-sm font-medium text-adv-off-white">
              {t('onboarding.student.step3.enterCode', 'Enter the class code from your teacher')}
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={joinForm.code}
                onChange={(e) => setJoinForm((p) => ({ ...p, code: e.target.value.toUpperCase() }))}
                placeholder={t('onboarding.student.step3.codePlaceholder', 'e.g. MATH-9B-2026')}
                className="flex-1 rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm font-mono text-adv-off-white placeholder:text-adv-gray-med focus:border-adv-teal focus:outline-none"
                onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
              />
              <button
                type="button"
                onClick={handleJoin}
                disabled={!joinForm.code.trim() || joinForm.loading}
                className="flex items-center gap-1.5 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {joinForm.loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {t('onboarding.student.step3.join', 'Join')}
              </button>
              <button
                type="button"
                onClick={() => setJoinForm({ visible: false, code: '', loading: false, error: null })}
                className="rounded-lg border border-border px-3 py-2 text-sm text-adv-gray hover:text-adv-off-white transition-colors"
              >
                {t('onboarding.student.step3.skip', 'Cancel')}
              </button>
            </div>
            {joinForm.error && (
              <p className="text-sm text-adv-red">{joinForm.error}</p>
            )}
          </div>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-adv-teal" />
          </div>
        )}

        {/* Empty state */}
        {!isLoading && classes.length === 0 && (
          <div className="rounded-xl border border-border bg-adv-card p-8 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-adv-teal/10">
              <BookOpen className="h-6 w-6 text-adv-teal" />
            </div>
            <p className="text-base font-semibold text-adv-white">
              {t('dashboard.noClasses', "You're not enrolled in any classes yet.")}
            </p>
            <p className="mt-1.5 text-sm text-adv-gray-med">
              {t('dashboard.enrollPrompt', 'Ask your teacher for a class code to get started.')}
            </p>
            <button
              type="button"
              onClick={() => setJoinForm((p) => ({ ...p, visible: true }))}
              className="mt-4 flex items-center gap-1.5 mx-auto rounded-lg bg-adv-teal px-5 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors"
            >
              <GraduationCap className="h-4 w-4" />
              {t('onboarding.student.step3.join', 'Join a class')}
            </button>
          </div>
        )}

        {/* Class cards */}
        {classes.map((cls) => (
          <div
            key={cls.id}
            className="rounded-xl border border-border bg-adv-card p-5 space-y-4"
          >
            {/* Class header */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-semibold text-adv-white truncate">{cls.name}</h2>
                  <span className="shrink-0 rounded-full border border-adv-teal/30 bg-adv-teal/10 px-2 py-0.5 text-xs font-medium text-adv-teal">
                    {tierLabel(cls.education_tier)}
                  </span>
                </div>
                <p className="mt-0.5 text-sm text-adv-gray capitalize">
                  {t(`subject.${cls.subject_id}`, cls.subject_id)}
                  {cls.student_count !== undefined && (
                    <span className="ml-3 inline-flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" />
                      {cls.student_count}
                    </span>
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigate(`/school/chat?classId=${cls.id}`)}
                className="flex shrink-0 items-center gap-1.5 rounded-lg bg-adv-teal px-3 py-1.5 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors"
              >
                {t('dashboard.startStudying', 'Study')}
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Progress bar */}
            {cls.completion_pct !== undefined && (
              <div>
                <div className="mb-1 flex items-center justify-between text-xs text-adv-gray-med">
                  <span>{cls.last_topic ?? t('subject.algebra', 'Algebra')}</span>
                  <span>{t('dashboard.progressLabel', '{{pct}}% complete', { pct: Math.round(cls.completion_pct ?? 0) })}</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-adv-dark">
                  <div
                    className="h-full rounded-full bg-adv-teal transition-all"
                    style={{ width: `${cls.completion_pct ?? 0}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </SchoolLayout>
  );
}
