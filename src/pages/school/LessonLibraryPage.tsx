import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getAuthHeader } from '@/lib/api';
import SchoolLayout from '@/components/school/SchoolLayout';
import {
  Plus,
  BookMarked,
  Layers,
  Calendar,
  Edit2,
  Loader2,
  Users,
  Check,
} from 'lucide-react';

interface Lesson {
  id: string;
  title: string;
  subjectId: string;
  tier: string;
  classId: string | null;
  isTemplate: boolean;
  createdAt: string;
  blockCount: number;
  learningObjectives: string[];
}

interface SchoolClass {
  id: string;
  name: string;
}

export default function LessonLibraryPage() {
  const { t } = useTranslation('school');
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [assigningLesson, setAssigningLesson] = useState<string | null>(null);
  const [assignClassId, setAssignClassId] = useState('');
  const [assignSuccess, setAssignSuccess] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/school/lessons', { headers: getAuthHeader() }).then(r => r.ok ? r.json() : []),
      fetch('/api/school/classes', { headers: getAuthHeader() }).then(r => r.ok ? r.json() : []),
    ])
      .then(([lessonData, classData]) => {
        setLessons(lessonData);
        setClasses(classData);
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  async function handleAssign(lessonId: string) {
    if (!assignClassId) return;
    try {
      const res = await fetch(`/api/school/lessons/${lessonId}/assign`, {
        method: 'POST',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ classId: assignClassId }),
      });
      if (res.ok) {
        setAssignSuccess(lessonId);
        setAssigningLesson(null);
        setAssignClassId('');
        setLessons(prev => prev.map(l => l.id === lessonId ? { ...l, classId: assignClassId } : l));
        setTimeout(() => setAssignSuccess(null), 3000);
      }
    } catch { /* non-fatal */ }
  }

  function formatDate(iso: string) {
    try {
      return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    } catch { return iso; }
  }

  return (
    <SchoolLayout>
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <BookMarked className="h-5 w-5 text-adv-teal" />
            <h1 className="text-xl font-bold text-adv-white">
              {t('teacher.lesson.libraryTitle', 'Lesson Library')}
            </h1>
          </div>
          <Link
            to="/school/teacher/lessons/new"
            className="flex items-center gap-1.5 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors"
          >
            <Plus className="h-4 w-4" />
            {t('teacher.lesson.newLesson', 'New Lesson')}
          </Link>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-adv-teal" />
          </div>
        ) : lessons.length === 0 ? (
          <div className="rounded-xl border border-border bg-adv-card p-10 text-center">
            <BookMarked className="mx-auto mb-3 h-10 w-10 text-adv-gray" />
            <p className="text-sm text-adv-gray">
              {t('teacher.lesson.noLessons', "You haven't built any lessons yet.")}
            </p>
            <p className="mt-1 text-xs text-adv-gray">
              {t('teacher.lesson.noLessonsHelp', 'Create structured lessons that Alma delivers conversationally to your students.')}
            </p>
            <Link
              to="/school/teacher/lessons/new"
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark"
            >
              <Plus className="h-4 w-4" />
              {t('teacher.lesson.buildFirst', 'Build your first lesson')}
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {lessons.map(lesson => (
              <div key={lesson.id} className="rounded-xl border border-border bg-adv-card p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-base font-semibold text-adv-white">{lesson.title}</h2>
                      {lesson.isTemplate && (
                        <span className="rounded-full bg-adv-gold/10 px-2 py-0.5 text-xs text-adv-gold">Template</span>
                      )}
                    </div>
                    <p className="mt-0.5 text-sm text-adv-gray">
                      {t(`subject.${lesson.subjectId}`, lesson.subjectId)} · {lesson.tier}
                    </p>
                  </div>
                  <Link
                    to={`/school/teacher/lessons/${lesson.id}/edit`}
                    className="rounded-lg p-2 text-adv-gray hover:bg-adv-dark hover:text-adv-off-white transition-colors"
                    aria-label={t('teacher.lesson.edit', 'Edit lesson')}
                  >
                    <Edit2 className="h-4 w-4" />
                  </Link>
                </div>

                {/* Stats row */}
                <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-adv-gray">
                  <span className="flex items-center gap-1.5">
                    <Layers className="h-3.5 w-3.5" />
                    {lesson.blockCount} {t('teacher.lesson.blocks', 'blocks')}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5" />
                    {formatDate(lesson.createdAt)}
                  </span>
                  {lesson.classId && (
                    <span className="flex items-center gap-1.5 text-adv-teal">
                      <Users className="h-3.5 w-3.5" />
                      {classes.find(c => c.id === lesson.classId)?.name ?? t('teacher.lesson.assignedClass', 'Assigned')}
                    </span>
                  )}
                </div>

                {/* Learning objectives preview */}
                {lesson.learningObjectives.length > 0 && (
                  <p className="mt-2 text-xs text-adv-gray line-clamp-1">
                    {t('teacher.lesson.obj', 'Obj:')} {lesson.learningObjectives.slice(0, 2).join(' · ')}
                    {lesson.learningObjectives.length > 2 && ` +${lesson.learningObjectives.length - 2}`}
                  </p>
                )}

                {/* Actions */}
                <div className="mt-4 flex items-center gap-2 flex-wrap">
                  <Link
                    to={`/school/teacher/lessons/${lesson.id}/edit`}
                    className="rounded-lg border border-border px-3 py-1.5 text-xs text-adv-gray hover:border-adv-teal hover:text-adv-teal transition-colors"
                  >
                    {t('teacher.lesson.edit', 'Edit')}
                  </Link>

                  {assigningLesson === lesson.id ? (
                    <div className="flex items-center gap-2">
                      <select
                        value={assignClassId}
                        onChange={e => setAssignClassId(e.target.value)}
                        className="rounded-lg border border-border bg-adv-dark px-2 py-1 text-xs text-adv-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
                        autoFocus
                      >
                        <option value="">{t('teacher.lesson.selectClass', 'Select class…')}</option>
                        {classes.map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => handleAssign(lesson.id)}
                        disabled={!assignClassId}
                        className="rounded-lg bg-adv-teal px-2.5 py-1 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50 transition-colors"
                      >
                        {t('teacher.lesson.assign', 'Assign')}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setAssigningLesson(null); setAssignClassId(''); }}
                        className="text-xs text-adv-gray hover:text-adv-off-white"
                      >
                        {t('teacher.lesson.cancel', 'Cancel')}
                      </button>
                    </div>
                  ) : assignSuccess === lesson.id ? (
                    <span className="flex items-center gap-1 text-xs text-adv-green">
                      <Check className="h-3.5 w-3.5" />
                      {t('teacher.lesson.assigned', 'Assigned!')}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setAssigningLesson(lesson.id)}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs text-adv-gray hover:border-adv-teal hover:text-adv-teal transition-colors"
                    >
                      {t('teacher.lesson.assignToClass', 'Assign to Class')}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </SchoolLayout>
  );
}
