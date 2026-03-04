import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getAuthHeader } from '@/lib/api';
import SchoolLayout from '@/components/school/SchoolLayout';
import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  TrendingUp,
  Users,
  BookOpen,
  CheckCircle2,
  Clock,
} from 'lucide-react';

interface StudentProgress {
  id: string;
  username: string;
  display_name?: string;
  overall_progress_pct?: number;
  blooms_data?: Record<string, number>;
  submitted_count?: number;
  pending_count?: number;
  sessions_count?: number;
  last_active?: string;
}

interface ClassDetail {
  id: string;
  name: string;
  subjectId: string;
  educationTier: string;
  classCode: string;
  teacherPersona: string;
  currentTopic?: string;
  students: StudentProgress[];
  averageBlooms?: Record<string, number>;
}

const BLOOMS_LABELS: Record<string, string> = {
  knowledge: 'Knowledge',
  application: 'Application',
  analysis: 'Analysis',
  evaluation: 'Evaluation',
  creation: 'Creation',
  metacognition: 'Metacognition',
};

const BLOOMS_COLORS: Record<string, string> = {
  knowledge: 'bg-adv-teal',
  application: 'bg-adv-blue',
  analysis: 'bg-adv-gold',
  evaluation: 'bg-adv-green',
  creation: 'bg-adv-red',
  metacognition: 'bg-adv-gray',
};

export default function TeacherClassProgressPage() {
  const { t } = useTranslation('school');
  const { classId } = useParams<{ classId: string }>();
  const [classDetail, setClassDetail] = useState<ClassDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeStudentId, setActiveStudentId] = useState<string | null>(null);

  useEffect(() => {
    if (classId) loadClass(classId);
  }, [classId]);

  async function loadClass(id: string) {
    try {
      const res = await fetch(`/api/school/classes/${id}`, { headers: getAuthHeader() });
      if (!res.ok) throw new Error('Failed to load class');
      const data = await res.json();
      setClassDetail(data);
      if (data.students?.length > 0) setActiveStudentId(data.students[0].id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load class');
    } finally {
      setIsLoading(false);
    }
  }

  function formatDate(dateStr?: string) {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  const activeStudent = classDetail?.students.find((s) => s.id === activeStudentId) ?? null;
  const avgProgress = classDetail?.students.length
    ? Math.round(classDetail.students.reduce((sum, s) => sum + (s.overall_progress_pct ?? 0), 0) / classDetail.students.length)
    : 0;

  return (
    <SchoolLayout>
      <div className="mx-auto max-w-5xl space-y-6">
        {/* Back link */}
        <Link
          to="/school/teacher"
          className="flex items-center gap-1.5 text-sm text-adv-gray hover:text-adv-off-white transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('nav.myClasses', 'My Classes')}
        </Link>

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

        {classDetail && (
          <>
            {/* Class header */}
            <div className="rounded-xl border border-border bg-adv-card p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-adv-teal/10">
                    <TrendingUp className="h-5 w-5 text-adv-teal" />
                  </div>
                  <div>
                    <h1 className="text-lg font-bold text-adv-white">{classDetail.name}</h1>
                    <p className="text-sm text-adv-gray">
                      {t(`subject.${classDetail.subjectId}`, classDetail.subjectId)} · {classDetail.educationTier}
                      {classDetail.currentTopic && ` · ${classDetail.currentTopic}`}
                    </p>
                  </div>
                </div>
                <Link
                  to={`/school/teacher/classes/${classId}/settings`}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs text-adv-gray hover:border-adv-teal hover:text-adv-teal transition-colors"
                >
                  Settings
                </Link>
              </div>

              {/* Class-wide stats */}
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: 'Students', value: classDetail.students.length, icon: Users },
                  { label: 'Avg. Progress', value: `${avgProgress}%`, icon: TrendingUp },
                  {
                    label: 'Active this week',
                    value: classDetail.students.filter((s) => {
                      if (!s.last_active) return false;
                      const d = new Date(s.last_active);
                      const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
                      return d >= weekAgo;
                    }).length,
                    icon: Clock,
                  },
                  {
                    label: 'Submissions',
                    value: classDetail.students.reduce((sum, s) => sum + (s.submitted_count ?? 0), 0),
                    icon: CheckCircle2,
                  },
                ].map(({ label, value, icon: Icon }) => (
                  <div key={label} className="rounded-lg bg-adv-dark px-3 py-2.5">
                    <div className="flex items-center gap-1.5 text-xs text-adv-gray-med mb-1">
                      <Icon className="h-3.5 w-3.5" />
                      {label}
                    </div>
                    <p className="text-base font-semibold text-adv-white">{value}</p>
                  </div>
                ))}
              </div>

              {/* Class-wide progress bar */}
              <div className="mt-4">
                <div className="mb-1 flex justify-between text-xs text-adv-gray-med">
                  <span>Class average progress</span>
                  <span className="text-adv-teal">{avgProgress}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-adv-dark">
                  <div
                    className="h-full rounded-full bg-adv-teal transition-all duration-500"
                    style={{ width: `${avgProgress}%` }}
                  />
                </div>
              </div>

              {/* Class-average Bloom's bars */}
              {classDetail.averageBlooms && Object.values(classDetail.averageBlooms).some(v => v > 0) && (
                <div className="mt-5 pt-4 border-t border-border">
                  <div className="flex items-center gap-2 mb-3">
                    <BookOpen className="h-4 w-4 text-adv-teal" />
                    <h3 className="text-xs font-semibold uppercase tracking-widest text-adv-gray-med">
                      Class Average — Bloom's Dimensions
                    </h3>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {Object.entries(classDetail.averageBlooms).map(([key, value]) => {
                      const pct = Math.round(value);
                      const label = BLOOMS_LABELS[key] ?? key;
                      const color = BLOOMS_COLORS[key] ?? 'bg-adv-teal';
                      return (
                        <div key={key}>
                          <div className="mb-1 flex justify-between text-xs">
                            <span className="text-adv-off-white">{label}</span>
                            <span className="text-adv-gray-med">{pct}%</span>
                          </div>
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-adv-dark">
                            <div
                              className={`h-full rounded-full transition-all ${color}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Two-column: student list + detail */}
            {classDetail.students.length === 0 ? (
              <div className="rounded-xl border border-border bg-adv-card p-8 text-center">
                <Users className="mx-auto mb-3 h-8 w-8 text-adv-gray-med" />
                <p className="text-sm text-adv-gray">
                  No students enrolled. Share code <code className="font-mono text-adv-teal">{classDetail.classCode}</code>.
                </p>
              </div>
            ) : (
              <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
                {/* Student list sidebar */}
                <div className="rounded-xl border border-border bg-adv-card overflow-hidden">
                  <div className="border-b border-border bg-adv-dark px-4 py-2.5">
                    <p className="text-xs font-medium uppercase tracking-widest text-adv-gray-med">
                      {t('nav.students', 'Students')} · {classDetail.students.length}
                    </p>
                  </div>
                  <div className="divide-y divide-border">
                    {classDetail.students.map((student) => {
                      const pct = student.overall_progress_pct ?? 0;
                      return (
                        <button
                          key={student.id}
                          type="button"
                          onClick={() => setActiveStudentId(student.id)}
                          className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${
                            activeStudentId === student.id
                              ? 'bg-adv-teal/5 border-l-2 border-adv-teal'
                              : 'hover:bg-adv-dark/50'
                          }`}
                        >
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-adv-teal/10 text-xs font-semibold text-adv-teal uppercase">
                            {(student.display_name || student.username).charAt(0)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-adv-off-white truncate">
                              {student.display_name || student.username}
                            </p>
                            <div className="mt-0.5 flex items-center gap-1.5">
                              <div className="h-1 flex-1 overflow-hidden rounded-full bg-adv-dark">
                                <div
                                  className="h-full rounded-full bg-adv-teal"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <span className="text-xs text-adv-gray-med">{pct}%</span>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Student detail */}
                {activeStudent && (
                  <div className="space-y-4">
                    {/* Student header */}
                    <div className="rounded-xl border border-border bg-adv-card p-5">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-adv-teal/10 text-base font-bold text-adv-teal uppercase">
                          {(activeStudent.display_name || activeStudent.username).charAt(0)}
                        </div>
                        <div>
                          <p className="text-base font-semibold text-adv-white">
                            {activeStudent.display_name || activeStudent.username}
                          </p>
                          <p className="text-sm text-adv-gray-med">
                            Last active: {formatDate(activeStudent.last_active)}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-3 text-sm">
                        <div className="rounded-lg bg-adv-dark px-3 py-2">
                          <p className="text-xs text-adv-gray-med">Progress</p>
                          <p className="text-base font-semibold text-adv-teal">{activeStudent.overall_progress_pct ?? 0}%</p>
                        </div>
                        <div className="rounded-lg bg-adv-dark px-3 py-2">
                          <p className="text-xs text-adv-gray-med">Sessions</p>
                          <p className="text-base font-semibold text-adv-white">{activeStudent.sessions_count ?? 0}</p>
                        </div>
                        <div className="rounded-lg bg-adv-dark px-3 py-2">
                          <p className="text-xs text-adv-gray-med">Submitted</p>
                          <p className="text-base font-semibold text-adv-white">{activeStudent.submitted_count ?? 0}</p>
                        </div>
                      </div>
                    </div>

                    {/* Bloom's taxonomy breakdown */}
                    {activeStudent.blooms_data && Object.keys(activeStudent.blooms_data).length > 0 && (
                      <div className="rounded-xl border border-border bg-adv-card p-5">
                        <div className="flex items-center gap-2 mb-4">
                          <BookOpen className="h-4 w-4 text-adv-teal" />
                          <h2 className="text-sm font-semibold text-adv-off-white">
                            {t('progress.blooms.knowledge', "Bloom's Dimensions")}
                          </h2>
                        </div>
                        <div className="space-y-3">
                          {Object.entries(activeStudent.blooms_data).map(([key, value]) => {
                            const pct = Math.round(value);
                            const label = BLOOMS_LABELS[key] ?? key;
                            const color = BLOOMS_COLORS[key] ?? 'bg-adv-teal';
                            return (
                              <div key={key}>
                                <div className="mb-1 flex justify-between text-xs">
                                  <span className="text-adv-off-white">{label}</span>
                                  <span className="text-adv-gray-med">{pct}%</span>
                                </div>
                                <div className="h-1.5 w-full overflow-hidden rounded-full bg-adv-dark">
                                  <div
                                    className={`h-full rounded-full transition-all ${color}`}
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Pending assignments */}
                    {(activeStudent.pending_count ?? 0) > 0 && (
                      <div className="flex items-center gap-2 rounded-lg border border-adv-gold/20 bg-adv-gold/5 px-4 py-3 text-sm text-adv-gold">
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        {activeStudent.pending_count} assignment{activeStudent.pending_count !== 1 ? 's' : ''} pending submission
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </SchoolLayout>
  );
}
