import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { getAuthHeader } from '@/lib/api';
import SchoolLayout from '@/components/school/SchoolLayout';
import {
  Users,
  Loader2,
  ChevronRight,
  BookOpen,
  TrendingUp,
  AlertCircle,
} from 'lucide-react';

interface Student {
  id: string;
  username: string;
  display_name?: string;
  enrolled_at: string;
  overall_progress_pct?: number;
  sessions_count?: number;
  last_active?: string;
}

interface ClassWithStudents {
  id: string;
  name: string;
  subjectId: string;
  educationTier: string;
  classCode: string;
  students: Student[];
}

export default function TeacherStudentsPage() {
  const { t } = useTranslation('school');
  const [classes, setClasses] = useState<ClassWithStudents[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeClassId, setActiveClassId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      // First fetch the list of classes
      const listRes = await fetch('/api/school/classes', { headers: getAuthHeader() });
      if (!listRes.ok) throw new Error('Failed to load classes');
      const classList = await listRes.json();
      if (!Array.isArray(classList) || classList.length === 0) {
        setClasses([]);
        return;
      }

      // Fetch details (with students) for each class in parallel
      const detailResults = await Promise.allSettled(
        classList.map((cls: { id: string }) =>
          fetch(`/api/school/classes/${cls.id}`, { headers: getAuthHeader() })
            .then((r) => r.json())
        )
      );

      const enriched: ClassWithStudents[] = detailResults
        .filter((r): r is PromiseFulfilledResult<ClassWithStudents> => r.status === 'fulfilled')
        .map((r) => r.value)
        .filter(Boolean);

      setClasses(enriched);
      if (enriched.length > 0) setActiveClassId(enriched[0].id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load students');
    } finally {
      setIsLoading(false);
    }
  }

  const activeClass = classes.find((c) => c.id === activeClassId) ?? null;

  function formatDate(dateStr?: string) {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  return (
    <SchoolLayout>
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-xl font-bold text-adv-white">{t('nav.students', 'Students')}</h1>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-adv-teal" />
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-adv-red/20 bg-adv-red/10 px-4 py-3 text-sm text-adv-red">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {/* No classes */}
        {!isLoading && !error && classes.length === 0 && (
          <div className="rounded-xl border border-border bg-adv-card p-10 text-center">
            <Users className="mx-auto mb-3 h-10 w-10 text-adv-gray-med" />
            <p className="text-sm text-adv-gray">{t('teacher.dashboard.noClasses', 'No classes yet.')}</p>
            <Link
              to="/school/teacher/classes/new"
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors"
            >
              {t('teacher.dashboard.createClass', 'Create Class')}
            </Link>
          </div>
        )}

        {!isLoading && !error && classes.length > 0 && (
          <>
            {/* Class tabs */}
            <div className="flex gap-1 overflow-x-auto rounded-lg border border-border bg-adv-card p-1">
              {classes.map((cls) => (
                <button
                  key={cls.id}
                  type="button"
                  onClick={() => setActiveClassId(cls.id)}
                  className={`flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-adv-teal ${
                    activeClassId === cls.id
                      ? 'bg-adv-teal/10 text-adv-teal'
                      : 'text-adv-gray hover:text-adv-off-white'
                  }`}
                >
                  <BookOpen className="h-3.5 w-3.5" />
                  {cls.name}
                  <span className={`rounded-full px-1.5 py-0.5 text-xs ${
                    activeClassId === cls.id ? 'bg-adv-teal/20 text-adv-teal' : 'bg-adv-dark text-adv-gray-med'
                  }`}>
                    {(cls.students ?? []).length}
                  </span>
                </button>
              ))}
            </div>

            {/* Active class info bar */}
            {activeClass && (
              <div className="flex items-center justify-between rounded-lg border border-border bg-adv-card px-4 py-3">
                <div className="text-sm">
                  <span className="font-medium text-adv-off-white">{activeClass.name}</span>
                  <span className="ml-2 text-adv-gray-med">
                    {t(`subject.${activeClass.subjectId}`, activeClass.subjectId)} · {activeClass.educationTier}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-adv-gray-med">
                    Code: <code className="font-mono text-adv-teal">{activeClass.classCode}</code>
                  </span>
                  <Link
                    to={`/school/teacher/classes/${activeClass.id}/progress`}
                    className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs text-adv-gray hover:border-adv-teal hover:text-adv-teal transition-colors"
                  >
                    <TrendingUp className="h-3.5 w-3.5" />
                    {t('teacher.dashboard.viewProgress', 'View Progress')}
                  </Link>
                </div>
              </div>
            )}

            {/* Students table */}
            {activeClass && (
              <>
                {(activeClass.students ?? []).length === 0 ? (
                  <div className="rounded-xl border border-border bg-adv-card p-8 text-center">
                    <Users className="mx-auto mb-3 h-8 w-8 text-adv-gray-med" />
                    <p className="text-sm text-adv-gray">
                      No students enrolled yet. Share the class code <code className="font-mono text-adv-teal">{activeClass.classCode}</code> with your students.
                    </p>
                  </div>
                ) : (
                  <div className="rounded-xl border border-border bg-adv-card overflow-hidden">
                    {/* Table header */}
                    <div className="grid grid-cols-[1fr_120px_80px_100px] gap-4 border-b border-border bg-adv-dark px-5 py-2.5 text-xs font-medium uppercase tracking-widest text-adv-gray-med">
                      <span>Student</span>
                      <span>Progress</span>
                      <span>Sessions</span>
                      <span>Last Active</span>
                    </div>

                    {/* Student rows */}
                    <div className="divide-y divide-border">
                      {(activeClass.students ?? []).map((student) => {
                        const pct = student.overall_progress_pct ?? 0;
                        return (
                          <div
                            key={student.id}
                            className="grid grid-cols-[1fr_120px_80px_100px] items-center gap-4 px-5 py-3 hover:bg-adv-dark/50 transition-colors"
                          >
                            {/* Name */}
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-adv-teal/10 text-xs font-semibold text-adv-teal uppercase">
                                {(student.display_name || student.username).charAt(0)}
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-adv-off-white truncate">
                                  {student.display_name || student.username}
                                </p>
                                {student.display_name && (
                                  <p className="text-xs text-adv-gray-med truncate">@{student.username}</p>
                                )}
                              </div>
                            </div>

                            {/* Progress */}
                            <div>
                              <div className="mb-1 flex justify-between text-xs">
                                <span className="text-adv-teal">{pct}%</span>
                              </div>
                              <div className="h-1.5 w-full overflow-hidden rounded-full bg-adv-dark">
                                <div
                                  className="h-full rounded-full bg-adv-teal transition-all"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>

                            {/* Sessions count */}
                            <span className="text-sm text-adv-gray">
                              {student.sessions_count ?? 0}
                            </span>

                            {/* Last active */}
                            <span className="text-sm text-adv-gray">
                              {formatDate(student.last_active)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
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
