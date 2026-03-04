import { useState, useEffect } from 'react';
import { getAuthHeader } from '@/lib/api';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Plus,
  Trash2,
  Download,
  Save,
  Loader2,
  AlertCircle,
  GripVertical,
} from 'lucide-react';
import SchoolLayout from '@/components/school/SchoolLayout';

type QuestionType = 'multiple_choice' | 'short_answer' | 'calculation';
type AssistanceLevel = 'L1' | 'L2' | 'L3' | 'L4';

interface Question {
  id: string;
  type: QuestionType;
  content: string;
  marks: number;
  blooms: string;
  options?: string[];  // for multiple_choice
}

interface AssignmentDraft {
  title: string;
  instructions: string;
  assignmentType: 'homework' | 'exam' | 'practice' | 'socratic';
  subjectId: string;
  topic: string;
  assistanceLevel: AssistanceLevel;
  dueDate: string;
  timeLimitMinutes: number | null;
  retakesAllowed: number;
  questions: Question[];
  rubric: Record<string, unknown>;
}

const DEFAULT_DRAFT: AssignmentDraft = {
  title: '',
  instructions: '',
  assignmentType: 'homework',
  subjectId: 'mathematics',
  topic: '',
  assistanceLevel: 'L1',
  dueDate: '',
  timeLimitMinutes: null,
  retakesAllowed: 0,
  questions: [],
  rubric: {},
};

export default function AssignmentBuilderPage() {
  const { t } = useTranslation('school');
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const classId = searchParams.get('classId') ?? '';

  const [draft, setDraft] = useState<AssignmentDraft>(DEFAULT_DRAFT);
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isTemplate, setIsTemplate] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addQuestion(type: QuestionType) {
    const q: Question = {
      id: crypto.randomUUID(),
      type,
      content: '',
      marks: type === 'short_answer' ? 5 : 3,
      blooms: 'application',
      options: type === 'multiple_choice' ? ['', '', '', ''] : undefined,
    };
    setDraft((p) => ({ ...p, questions: [...p.questions, q] }));
  }

  function updateQuestion(id: string, updates: Partial<Question>) {
    setDraft((p) => ({
      ...p,
      questions: p.questions.map((q) => q.id === id ? { ...q, ...updates } : q),
    }));
  }

  function removeQuestion(id: string) {
    setDraft((p) => ({ ...p, questions: p.questions.filter((q) => q.id !== id) }));
  }

  async function handleSave() {
    setIsSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/school/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ ...draft, classId, isTemplate }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      navigate(`/school/teacher?assignmentCreated=${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleExportAnton() {
    setIsExporting(true);
    setError(null);
    try {
      // Save first to get an ID, then export
      const saveRes = await fetch('/api/school/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ ...draft, classId, isTemplate }),
      });
      if (!saveRes.ok) throw new Error(await saveRes.text());
      const { id } = await saveRes.json();

      const res = await fetch(`/api/school/assignments/${id}/export-anton`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${draft.title || 'assignment'}.anton`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setIsExporting(false);
    }
  }

  const totalMarks = draft.questions.reduce((sum, q) => sum + q.marks, 0);

  return (
    <SchoolLayout>
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-adv-white">{t('teacher.assignment.title')}</h1>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || !draft.title || (draft.assignmentType !== 'socratic' && draft.questions.length === 0)}
              className="flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm text-adv-gray hover:border-adv-teal hover:text-adv-teal disabled:opacity-40 transition-colors"
            >
              {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              {t('teacher.assignment.save')}
            </button>
            <button
              type="button"
              onClick={handleExportAnton}
              disabled={isExporting || !draft.title || (draft.assignmentType !== 'socratic' && draft.questions.length === 0)}
              className="flex items-center gap-1.5 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-40 transition-colors"
            >
              {isExporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              {t('teacher.assignment.export')}
            </button>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-adv-red/20 bg-adv-red/10 px-4 py-3 text-sm text-adv-red">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Basic info */}
        <section className="rounded-xl border border-border bg-adv-card p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium uppercase tracking-widest text-adv-gray-med mb-1">
              {t('teacher.assignment.assignmentTitle')} *
            </label>
            <input
              type="text"
              value={draft.title}
              onChange={(e) => setDraft((p) => ({ ...p, title: e.target.value }))}
              placeholder={t('teacher.assignment.titlePlaceholder')}
              className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium uppercase tracking-widest text-adv-gray-med mb-1">
              {draft.assignmentType === 'socratic'
                ? t('teacher.assignment.socraticObjectives', 'Learning Objectives')
                : t('teacher.assignment.instructions')}
            </label>
            <textarea
              value={draft.instructions}
              onChange={(e) => setDraft((p) => ({ ...p, instructions: e.target.value }))}
              placeholder={
                draft.assignmentType === 'socratic'
                  ? t('teacher.assignment.socraticObjectivesPlaceholder', 'List the learning objectives the AI examiner should assess. One per line.')
                  : t('teacher.assignment.instructionsPlaceholder')
              }
              rows={draft.assignmentType === 'socratic' ? 5 : 3}
              className="w-full resize-none rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none"
            />
            {draft.assignmentType === 'socratic' && (
              <p className="mt-1 text-xs text-adv-teal">
                {t('teacher.assignment.socraticHelp', 'The AI examiner will conduct an oral-style dialogue to assess these objectives. No question list required.')}
              </p>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-medium uppercase tracking-widest text-adv-gray-med mb-1">
                {t('teacher.assignment.type')}
              </label>
              <select
                value={draft.assignmentType}
                onChange={(e) => setDraft((p) => ({ ...p, assignmentType: e.target.value as AssignmentDraft['assignmentType'] }))}
                className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none"
              >
                <option value="homework">{t('teacher.assignment.typeHomework')}</option>
                <option value="exam">{t('teacher.assignment.typeExam')}</option>
                <option value="practice">{t('teacher.assignment.typePractice')}</option>
                <option value="socratic">{t('teacher.assignment.typeSocratic', 'Socratic Examination')}</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium uppercase tracking-widest text-adv-gray-med mb-1">
                {t('teacher.assignment.assistanceLevel')}
              </label>
              <select
                value={draft.assistanceLevel}
                onChange={(e) => setDraft((p) => ({ ...p, assistanceLevel: e.target.value as AssistanceLevel }))}
                className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none"
              >
                {(['L1', 'L2', 'L3', 'L4'] as AssistanceLevel[]).map((level) => (
                  <option key={level} value={level}>
                    {level} — {t(`chat.assistanceLevel.${level}`)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium uppercase tracking-widest text-adv-gray-med mb-1">
                {t('teacher.assignment.dueDate')}
              </label>
              <input
                type="date"
                value={draft.dueDate}
                onChange={(e) => setDraft((p) => ({ ...p, dueDate: e.target.value }))}
                className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none"
              />
            </div>
          </div>
        </section>

        {/* Save as template */}
        <label className="flex items-center gap-2.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={isTemplate}
            onChange={e => setIsTemplate(e.target.checked)}
            className="h-4 w-4 rounded border-border accent-adv-teal"
          />
          <span className="text-sm text-adv-gray">
            {t('teacher.assignment.saveAsTemplate', 'Save as template (reusable across classes)')}
          </span>
        </label>

        {/* Questions — hidden for Socratic type */}
        {draft.assignmentType === 'socratic' && (
          <div className="rounded-xl border border-adv-teal/20 bg-adv-teal/5 px-4 py-3 text-sm text-adv-teal">
            {t('teacher.assignment.socraticHelp', 'The AI examiner will conduct an oral-style dialogue to assess the objectives above. Save to create this examination.')}
          </div>
        )}
        <section className={`space-y-3 ${draft.assignmentType === 'socratic' ? 'hidden' : ''}`}>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-adv-off-white">
                {t('teacher.assignment.questionContent')}s ({draft.questions.length})
              </h2>
              {totalMarks > 0 && (
                <p className="text-xs text-adv-gray-med">Total: {totalMarks} {t('teacher.assignment.questionMarks')}</p>
              )}
            </div>
          </div>

          {draft.questions.map((q, idx) => (
            <QuestionCard
              key={q.id}
              question={q}
              index={idx + 1}
              onChange={(updates) => updateQuestion(q.id, updates)}
              onRemove={() => removeQuestion(q.id)}
            />
          ))}

          {/* Add question buttons */}
          <div className="flex flex-wrap gap-2">
            {(
              [
                ['multiple_choice', t('assessment.multipleChoice')],
                ['short_answer', t('assessment.shortAnswer')],
                ['calculation', t('assessment.calculation')],
              ] as [QuestionType, string][]
            ).map(([type, label]) => (
              <button
                key={type}
                type="button"
                onClick={() => addQuestion(type)}
                className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-adv-gray hover:border-adv-teal hover:text-adv-teal transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                {t('teacher.assignment.addQuestion')}: {label}
              </button>
            ))}
          </div>
        </section>
      </div>
    </SchoolLayout>
  );
}

interface QuestionCardProps {
  question: Question;
  index: number;
  onChange: (updates: Partial<Question>) => void;
  onRemove: () => void;
}

function QuestionCard({ question, index, onChange, onRemove }: QuestionCardProps) {
  const { t } = useTranslation('school');

  return (
    <div className="rounded-xl border border-border bg-adv-card p-4 space-y-3">
      <div className="flex items-start gap-2">
        <GripVertical className="mt-1 h-4 w-4 shrink-0 text-adv-gray-med cursor-grab" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-medium uppercase text-adv-teal">
              Q{index} — {question.type === 'multiple_choice' ? t('assessment.multipleChoice') : question.type === 'short_answer' ? t('assessment.shortAnswer') : t('assessment.calculation')}
            </span>
            <div className="flex items-center gap-1 ms-auto">
              <input
                type="number"
                value={question.marks}
                onChange={(e) => onChange({ marks: parseInt(e.target.value) || 1 })}
                min={1}
                max={20}
                className="w-14 rounded border border-border bg-adv-dark px-2 py-0.5 text-xs text-adv-off-white focus:outline-none"
                aria-label={t('teacher.assignment.questionMarks')}
              />
              <span className="text-xs text-adv-gray-med">{t('teacher.assignment.questionMarks')}</span>
            </div>
          </div>

          <textarea
            value={question.content}
            onChange={(e) => onChange({ content: e.target.value })}
            placeholder={t('teacher.assignment.questionContent') + '...'}
            rows={2}
            className="w-full resize-none rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none"
          />

          {question.type === 'multiple_choice' && question.options && (
            <div className="mt-2 space-y-1">
              {question.options.map((opt, oi) => (
                <div key={oi} className="flex items-center gap-2">
                  <span className="text-xs text-adv-gray-med w-4">{String.fromCharCode(65 + oi)})</span>
                  <input
                    type="text"
                    value={opt}
                    onChange={(e) => {
                      const newOptions = [...(question.options ?? [])];
                      newOptions[oi] = e.target.value;
                      onChange({ options: newOptions });
                    }}
                    placeholder={`Option ${String.fromCharCode(65 + oi)}`}
                    className="flex-1 rounded border border-border bg-adv-dark px-2 py-1 text-xs text-adv-off-white focus:outline-none"
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onRemove}
          className="rounded-lg p-1.5 text-adv-gray hover:text-adv-red transition-colors"
          aria-label={t('teacher.assignment.removeQuestion')}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
