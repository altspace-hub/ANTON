import { useState, useEffect } from 'react';
import { getAuthHeader } from '@/lib/api';
import { Link, useNavigate } from 'react-router-dom';
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
  FileText,
  ArrowRight,
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

interface AssignmentTemplate {
  id: string;
  title: string;
  subject_id: string;
  assignment_type: string;
  class_name: string;
}

export default function TeacherDashboardPage() {
  const { t } = useTranslation('school');
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [templates, setTemplates] = useState<AssignmentTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [duplicating, setDuplicating] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [classRes, templateRes] = await Promise.all([
        fetch('/api/school/classes', { headers: getAuthHeader() }),
        fetch('/api/school/assignments/templates', { headers: getAuthHeader() }),
      ]);
      if (classRes.ok) setClasses(await classRes.json());
      if (templateRes.ok) setTemplates(await templateRes.json());
    } catch { /* non-fatal */ }
    finally { setIsLoading(false); }
  }

  async function useTemplate(templateId: string) {
    setDuplicating(templateId);
    try {
      const res = await fetch(`/api/school/assignments/${templateId}/duplicate`, {
        method: 'POST',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        navigate('/school/teacher/assignments/new');
      }
    } catch { /* non-fatal */ }
    finally { setDuplicating(null); }
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
            <BookOpen className="mx-auto mb-3 h-10 w-10 text-adv-gray" />
            <p className="text-sm text-adv-gray">{t('teacher.dashboard.noClasses')}</p>
            <p className="mt-1 text-xs text-adv-gray">{t('teacher.dashboard.setupFirst')}</p>
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
                  <span className="text-xs text-adv-gray">{t('teacher.dashboard.classCode')}:</span>
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

        {/* Assignment Templates section */}
        {templates.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-adv-teal" />
              <h2 className="text-sm font-semibold text-adv-white">
                {t('teacher.dashboard.templates', 'Assignment Templates')}
              </h2>
              <span className="rounded-full bg-adv-teal/10 px-2 py-0.5 text-xs text-adv-teal">
                {templates.length}
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {templates.map(tmpl => (
                <div key={tmpl.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-adv-card p-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-adv-off-white truncate">{tmpl.title}</p>
                    <p className="text-xs text-adv-gray mt-0.5">
                      {t(`subject.${tmpl.subject_id}`, tmpl.subject_id)} · {tmpl.assignment_type}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => useTemplate(tmpl.id)}
                    disabled={duplicating === tmpl.id}
                    className="flex items-center gap-1.5 rounded-lg bg-adv-teal/10 px-3 py-1.5 text-xs text-adv-teal hover:bg-adv-teal/20 disabled:opacity-50 transition-colors shrink-0"
                  >
                    {duplicating === tmpl.id
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <ArrowRight className="h-3.5 w-3.5" />}
                    {t('teacher.dashboard.useTemplate', 'Use template')}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </SchoolLayout>
  );
}
