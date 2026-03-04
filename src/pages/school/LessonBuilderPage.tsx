import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getAuthHeader } from '@/lib/api';
import SchoolLayout from '@/components/school/SchoolLayout';
import {
  Plus,
  Trash2,
  Save,
  BookMarked,
  ChevronUp,
  ChevronDown,
  Loader2,
  Check,
} from 'lucide-react';

interface ContentBlock {
  type: 'explanation' | 'activity' | 'discussion';
  content: string;
  durationMins?: number;
}

interface SchoolClass {
  id: string;
  name: string;
}

const BLOCK_TYPES: ContentBlock['type'][] = ['explanation', 'activity', 'discussion'];

const BLOCK_TYPE_LABELS: Record<ContentBlock['type'], string> = {
  explanation: 'Explanation',
  activity: 'Activity / Exercise',
  discussion: 'Discussion Prompt',
};

const SUBJECT_OPTIONS = [
  { id: 'mathematics', label: 'Mathematics' },
  { id: 'svenska', label: 'Svenska' },
  { id: 'english', label: 'English' },
  { id: 'science', label: 'Science (NO)' },
  { id: 'social-studies', label: 'Social Studies (SO)' },
  { id: 'computational-thinking', label: 'Computational Thinking' },
  { id: 'technology', label: 'Technology' },
  { id: 'life-skills', label: 'Life Skills' },
  { id: 'study-skills', label: 'Study Skills' },
];

const TIER_OPTIONS = [
  { id: 'T2', label: 'T2 — Years 7–9 (13–15)' },
  { id: 'T3', label: 'T3 — Years 10–12 (16–18)' },
  { id: 'T4', label: 'T4 — University (18+)' },
];

export default function LessonBuilderPage() {
  const { t } = useTranslation('school');
  const { lessonId } = useParams<{ lessonId?: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const isEditMode = Boolean(lessonId);

  const [title, setTitle] = useState('');
  const [subjectId, setSubjectId] = useState('mathematics');
  const [tier, setTier] = useState('T2');
  const [learningObjectives, setLearningObjectives] = useState<string[]>(['']);
  const [contentBlocks, setContentBlocks] = useState<ContentBlock[]>([
    { type: 'explanation', content: '', durationMins: 10 },
  ]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [assignClassId, setAssignClassId] = useState(searchParams.get('classId') || '');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(isEditMode);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [assignSuccess, setAssignSuccess] = useState(false);

  // Load existing lesson if editing
  useEffect(() => {
    if (isEditMode && lessonId) {
      fetch(`/api/school/lessons/${lessonId}`, { headers: getAuthHeader() })
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (data) {
            setTitle(data.title || '');
            setSubjectId(data.subjectId || 'mathematics');
            setTier(data.tier || 'T2');
            setLearningObjectives(data.learningObjectives?.length ? data.learningObjectives : ['']);
            setContentBlocks(data.contentBlocks?.length ? data.contentBlocks : [{ type: 'explanation', content: '', durationMins: 10 }]);
            if (data.classId) setAssignClassId(data.classId);
          }
        })
        .catch(() => {})
        .finally(() => setIsLoading(false));
    }
  }, [isEditMode, lessonId]);

  // Load teacher's classes for assignment dropdown
  useEffect(() => {
    fetch('/api/school/classes', { headers: getAuthHeader() })
      .then(r => r.ok ? r.json() : [])
      .then((data: SchoolClass[]) => setClasses(data))
      .catch(() => {});
  }, []);

  function addObjective() {
    setLearningObjectives(prev => [...prev, '']);
  }

  function updateObjective(index: number, value: string) {
    setLearningObjectives(prev => prev.map((o, i) => i === index ? value : o));
  }

  function removeObjective(index: number) {
    setLearningObjectives(prev => prev.filter((_, i) => i !== index));
  }

  function addBlock() {
    setContentBlocks(prev => [...prev, { type: 'explanation', content: '', durationMins: 10 }]);
  }

  function updateBlock(index: number, patch: Partial<ContentBlock>) {
    setContentBlocks(prev => prev.map((b, i) => i === index ? { ...b, ...patch } : b));
  }

  function removeBlock(index: number) {
    setContentBlocks(prev => prev.filter((_, i) => i !== index));
  }

  function moveBlock(index: number, direction: 'up' | 'down') {
    const newBlocks = [...contentBlocks];
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= newBlocks.length) return;
    [newBlocks[index], newBlocks[swapIndex]] = [newBlocks[swapIndex], newBlocks[index]];
    setContentBlocks(newBlocks);
  }

  async function handleSave() {
    if (!title.trim()) return;
    setIsSaving(true);
    try {
      const payload = {
        title: title.trim(),
        subjectId,
        tier,
        learningObjectives: learningObjectives.filter(o => o.trim()),
        contentBlocks: contentBlocks.map(b => ({ ...b, content: b.content.trim() })).filter(b => b.content),
        classId: assignClassId || undefined,
      };

      const url = isEditMode && lessonId ? `/api/school/lessons/${lessonId}` : '/api/school/lessons';
      const method = isEditMode && lessonId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json();
        const id = isEditMode ? lessonId! : data.id;
        setSavedId(id);

        // Assign to class if specified
        if (assignClassId && (!isEditMode || assignClassId)) {
          await fetch(`/api/school/lessons/${id}/assign`, {
            method: 'POST',
            headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ classId: assignClassId }),
          }).catch(() => {});
          setAssignSuccess(true);
        }

        setTimeout(() => navigate('/school/teacher/lessons'), 1200);
      }
    } catch { /* non-fatal */ }
    finally { setIsSaving(false); }
  }

  if (isLoading) {
    return (
      <SchoolLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-adv-teal" />
        </div>
      </SchoolLayout>
    );
  }

  return (
    <SchoolLayout>
      <div className="mx-auto max-w-2xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <BookMarked className="h-5 w-5 text-adv-teal" />
            <h1 className="text-xl font-bold text-adv-white">
              {isEditMode
                ? t('teacher.lesson.editTitle', 'Edit Lesson')
                : t('teacher.lesson.newTitle', 'Build a Lesson')}
            </h1>
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={!title.trim() || isSaving}
            className="flex items-center gap-1.5 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : assignSuccess || savedId ? (
              <Check className="h-4 w-4" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {isSaving ? t('teacher.lesson.saving', 'Saving…') : t('teacher.lesson.save', 'Save Lesson')}
          </button>
        </div>

        {/* Title */}
        <div className="rounded-xl border border-border bg-adv-card p-5 space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-widest text-adv-gray-med">
              {t('teacher.lesson.titleLabel', 'Lesson Title')}
            </label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder={t('teacher.lesson.titlePlaceholder', 'e.g. Introduction to Quadratic Equations')}
              className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-white placeholder:text-adv-gray-med focus:border-adv-teal focus:outline-none"
            />
          </div>

          {/* Subject + Tier */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-widest text-adv-gray-med">
                {t('teacher.classConfig.subject', 'Subject')}
              </label>
              <select
                value={subjectId}
                onChange={e => setSubjectId(e.target.value)}
                className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-white focus:border-adv-teal focus:outline-none"
              >
                {SUBJECT_OPTIONS.map(s => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-widest text-adv-gray-med">
                {t('teacher.classConfig.tier', 'Tier')}
              </label>
              <select
                value={tier}
                onChange={e => setTier(e.target.value)}
                className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-white focus:border-adv-teal focus:outline-none"
              >
                {TIER_OPTIONS.map(t => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Assign to class */}
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-widest text-adv-gray-med">
              {t('teacher.lesson.assignTo', 'Assign to Class')} ({t('teacher.lesson.optional', 'optional')})
            </label>
            <select
              value={assignClassId}
              onChange={e => setAssignClassId(e.target.value)}
              className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-white focus:border-adv-teal focus:outline-none"
            >
              <option value="">{t('teacher.lesson.noClass', 'Not assigned to a class')}</option>
              {classes.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Learning Objectives */}
        <div className="rounded-xl border border-border bg-adv-card p-5 space-y-3">
          <h2 className="text-sm font-semibold text-adv-white">
            {t('teacher.lesson.objectives', 'Learning Objectives')}
          </h2>
          <p className="text-xs text-adv-gray-med">
            {t('teacher.lesson.objectivesHelp', 'What should students know or be able to do by the end?')}
          </p>
          <div className="space-y-2">
            {learningObjectives.map((obj, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-xs font-medium text-adv-gray-med w-4 shrink-0">{i + 1}.</span>
                <input
                  type="text"
                  value={obj}
                  onChange={e => updateObjective(i, e.target.value)}
                  placeholder={t('teacher.lesson.objectivePlaceholder', 'e.g. Solve quadratic equations using the formula')}
                  className="flex-1 rounded-lg border border-border bg-adv-dark px-3 py-1.5 text-sm text-adv-white placeholder:text-adv-gray-med focus:border-adv-teal focus:outline-none"
                />
                {learningObjectives.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeObjective(i)}
                    className="rounded p-1 text-adv-gray hover:text-adv-red transition-colors"
                    aria-label="Remove objective"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addObjective}
            className="flex items-center gap-1.5 text-xs text-adv-teal hover:text-adv-teal-dark transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            {t('teacher.lesson.addObjective', 'Add objective')}
          </button>
        </div>

        {/* Content Blocks */}
        <div className="rounded-xl border border-border bg-adv-card p-5 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-adv-white">
              {t('teacher.lesson.contentBlocks', 'Lesson Content')}
            </h2>
            <p className="mt-0.5 text-xs text-adv-gray-med">
              {t('teacher.lesson.contentBlocksHelp', 'Structure your lesson as blocks. Alma will deliver them in this order.')}
            </p>
          </div>

          <div className="space-y-3">
            {contentBlocks.map((block, i) => (
              <div key={i} className="rounded-lg border border-border bg-adv-dark p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-adv-teal">Block {i + 1}</span>
                  <div className="flex-1" />
                  <button
                    type="button"
                    onClick={() => moveBlock(i, 'up')}
                    disabled={i === 0}
                    className="rounded p-1 text-adv-gray hover:text-adv-off-white disabled:opacity-30 transition-colors"
                    aria-label="Move up"
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveBlock(i, 'down')}
                    disabled={i === contentBlocks.length - 1}
                    className="rounded p-1 text-adv-gray hover:text-adv-off-white disabled:opacity-30 transition-colors"
                    aria-label="Move down"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                  {contentBlocks.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeBlock(i)}
                      className="rounded p-1 text-adv-gray hover:text-adv-red transition-colors"
                      aria-label="Remove block"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs text-adv-gray-med">
                      {t('teacher.lesson.blockType', 'Type')}
                    </label>
                    <select
                      value={block.type}
                      onChange={e => updateBlock(i, { type: e.target.value as ContentBlock['type'] })}
                      className="w-full rounded-lg border border-border bg-adv-dark-2 px-3 py-1.5 text-sm text-adv-white focus:border-adv-teal focus:outline-none"
                    >
                      {BLOCK_TYPES.map(bt => (
                        <option key={bt} value={bt}>{BLOCK_TYPE_LABELS[bt]}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-adv-gray-med">
                      {t('teacher.lesson.duration', 'Duration (min)')}
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={60}
                      value={block.durationMins ?? ''}
                      onChange={e => updateBlock(i, { durationMins: parseInt(e.target.value) || undefined })}
                      placeholder="10"
                      className="w-full rounded-lg border border-border bg-adv-dark-2 px-3 py-1.5 text-sm text-adv-white placeholder:text-adv-gray-med focus:border-adv-teal focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs text-adv-gray-med">
                    {t('teacher.lesson.blockContent', 'Content / Instructions')}
                  </label>
                  <textarea
                    rows={4}
                    value={block.content}
                    onChange={e => updateBlock(i, { content: e.target.value })}
                    placeholder={
                      block.type === 'explanation'
                        ? t('teacher.lesson.explanationPlaceholder', 'Explain the concept, formula, or theory...')
                        : block.type === 'activity'
                        ? t('teacher.lesson.activityPlaceholder', 'Describe the exercise or problem to solve...')
                        : t('teacher.lesson.discussionPlaceholder', 'Write the discussion question or prompt...')
                    }
                    className="w-full rounded-lg border border-border bg-adv-dark-2 px-3 py-2 text-sm text-adv-white placeholder:text-adv-gray-med focus:border-adv-teal focus:outline-none resize-y"
                  />
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addBlock}
            className="flex items-center gap-1.5 text-xs text-adv-teal hover:text-adv-teal-dark transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            {t('teacher.lesson.addBlock', 'Add content block')}
          </button>
        </div>

        {/* Save button (bottom) */}
        <div className="flex justify-end pb-4">
          <button
            type="button"
            onClick={handleSave}
            disabled={!title.trim() || isSaving}
            className="flex items-center gap-1.5 rounded-lg bg-adv-teal px-6 py-2.5 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {isSaving ? t('teacher.lesson.saving', 'Saving…') : t('teacher.lesson.save', 'Save Lesson')}
          </button>
        </div>
      </div>
    </SchoolLayout>
  );
}
