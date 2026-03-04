import { useState, useEffect } from 'react';
import { getAuthHeader } from '@/lib/api';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Plus,
  Users,
  ClipboardList,
  Copy,
  Check,
  BookOpen,
  Settings,
  Loader2,
} from 'lucide-react';
import SchoolLayout from '@/components/school/SchoolLayout';

interface SchoolClass {
  id: string;
  name: string;
  subjectId: string;
  educationTier: string;
  studentCount: number;
  classCode: string;
  pendingSubmissions: number;
}

export default function TeacherDashboardPage() {
  const { t } = useTranslation('school');
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  useEffect(() => {
    loadClasses();
  }, []);

  async function loadClasses() {
    try {
      const res = await fetch('/api/school/classes', { headers: getAuthHeader() });
      if (res.ok) setClasses(await res.json());
    } catch { /* non-fatal */ }
    finally { setIsLoading(false); }
  }

  async function copyClassCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    } catch { /* ignore */ }
  }

  return (
    <SchoolLayout>
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-adv-white">{t('teacher.dashboard.title')}</h1>
          <Link
            to="/school/teacher/classes/new"
            className="flex items-center gap-1.5 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors"
          >
            <Plus className="h-4 w-4" />
            {t('teacher.dashboard.createClass')}
          </Link>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-adv-teal" />
          </div>
        ) : classes.length === 0 ? (
          <div className="rounded-xl border border-border bg-adv-card p-10 text-center">
            <BookOpen className="mx-auto mb-3 h-10 w-10 text-adv-gray-med" />
            <p className="text-sm text-adv-gray">{t('teacher.dashboard.noClasses')}</p>
            <p className="mt-1 text-xs text-adv-gray-med">{t('teacher.dashboard.setupFirst')}</p>
            <Link
              to="/school/teacher/classes/new"
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark"
            >
              <Plus className="h-4 w-4" />
              {t('teacher.dashboard.createClass')}
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {classes.map((cls) => (
              <div key={cls.id} className="rounded-xl border border-border bg-adv-card p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h2 className="text-base font-semibold text-adv-white">{cls.name}</h2>
                    <p className="mt-0.5 text-sm text-adv-gray">
                      {t(`subject.${cls.subjectId}`, cls.subjectId)} · {cls.educationTier}
                    </p>
                  </div>
                  <Link
                    to={`/school/teacher/classes/${cls.id}/settings`}
                    className="rounded-lg p-2 text-adv-gray hover:bg-adv-dark hover:text-adv-off-white transition-colors"
                    aria-label={t('teacher.classConfig.title')}
                  >
                    <Settings className="h-4 w-4" />
                  </Link>
                </div>

                {/* Stats row */}
                <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-adv-gray">
                  <span className="flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5" />
                    {t('teacher.dashboard.studentsEnrolled', { count: cls.studentCount })}
                  </span>
                  {cls.pendingSubmissions > 0 && (
                    <span className="flex items-center gap-1.5 text-adv-gold">
                      <ClipboardList className="h-3.5 w-3.5" />
                      {cls.pendingSubmissions} {t('nav.assignments')} pending
                    </span>
                  )}
                </div>

                {/* Class code */}
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-xs text-adv-gray-med">{t('teacher.dashboard.classCode')}:</span>
                  <code className="rounded bg-adv-dark px-2 py-0.5 text-xs font-mono text-adv-teal">
                    {cls.classCode}
                  </code>
                  <button
                    type="button"
                    onClick={() => copyClassCode(cls.classCode)}
                    className="rounded p-0.5 text-adv-gray hover:text-adv-teal transition-colors"
                    aria-label={t('teacher.dashboard.copyCode')}
                  >
                    {copiedCode === cls.classCode
                      ? <Check className="h-3.5 w-3.5 text-adv-teal" />
                      : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </div>

                {/* Actions */}
                <div className="mt-4 flex gap-2">
                  <Link
                    to={`/school/teacher/classes/${cls.id}/progress`}
                    className="rounded-lg border border-border px-3 py-1.5 text-xs text-adv-gray hover:border-adv-teal hover:text-adv-teal transition-colors"
                  >
                    {t('teacher.dashboard.viewProgress')}
                  </Link>
                  <Link
                    to={`/school/teacher/assignments/new?classId=${cls.id}`}
                    className="rounded-lg border border-border px-3 py-1.5 text-xs text-adv-gray hover:border-adv-teal hover:text-adv-teal transition-colors"
                  >
                    {t('teacher.dashboard.createAssignment')}
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </SchoolLayout>
  );
}
