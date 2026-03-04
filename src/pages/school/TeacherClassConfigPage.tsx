import { useState, useEffect } from 'react';
import { getAuthHeader } from '@/lib/api';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2, Upload, CheckCircle2, AlertCircle } from 'lucide-react';
import SchoolLayout from '@/components/school/SchoolLayout';

type AssistanceLevel = 'L1' | 'L2' | 'L3' | 'L4';

interface ClassConfig {
  name: string;
  subjectId: string;
  educationTier: string;
  defaultTeacherPersona: string;
  webSearchEnabled: boolean;
  leaderboardEnabled: boolean;
  assistanceLevels: {
    homework: AssistanceLevel;
    self_study: AssistanceLevel;
    exam_practice: AssistanceLevel;
    reference: AssistanceLevel;
  };
}

const DEFAULT_CONFIG: ClassConfig = {
  name: '',
  subjectId: 'mathematics',
  educationTier: 'T2',
  defaultTeacherPersona: 'alma',
  webSearchEnabled: true,
  leaderboardEnabled: false,
  assistanceLevels: {
    homework: 'L1',
    self_study: 'L2',
    exam_practice: 'L3',
    reference: 'L4',
  },
};

const ASSISTANCE_LEVELS: AssistanceLevel[] = ['L1', 'L2', 'L3', 'L4'];

export default function TeacherClassConfigPage() {
  const { t } = useTranslation('school');
  const { classId } = useParams<{ classId: string }>();
  const navigate = useNavigate();
  const isNew = !classId || classId === 'new';

  const [config, setConfig] = useState<ClassConfig>(DEFAULT_CONFIG);
  const [isLoading, setIsLoading] = useState(!isNew);
  const [isSaving, setIsSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [curriculumFile, setCurriculumFile] = useState<File | null>(null);
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);
  const [studyPlan, setStudyPlan] = useState<string | null>(null);

  useEffect(() => {
    if (!isNew && classId) loadConfig(classId);
  }, [classId]);

  async function loadConfig(id: string) {
    try {
      const res = await fetch(`/api/school/classes/${id}`, { headers: getAuthHeader() });
      if (res.ok) setConfig(await res.json());
    } catch { /* non-fatal */ }
    finally { setIsLoading(false); }
  }

  async function handleSave() {
    setIsSaving(true);
    setError(null);
    try {
      const url = isNew ? '/api/school/classes' : `/api/school/classes/${classId}`;
      const method = isNew ? 'POST' : 'PUT';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify(config),
      });
      if (!res.ok) throw new Error(await res.text());
      if (isNew) {
        const data = await res.json();
        navigate(`/school/teacher/classes/${data.id}/settings`, { replace: true });
      } else {
        setSavedOk(true);
        setTimeout(() => setSavedOk(false), 2500);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleCurriculumUpload() {
    if (!curriculumFile || !classId) return;
    setIsGeneratingPlan(true);
    setError(null);
    try {
      // Read file text client-side
      const curriculumText = await curriculumFile.text();
      const res = await fetch('/api/school/curricula/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ classId, curriculumText }),
      });
      if (!res.ok) throw new Error(await res.text());
      if (!res.body) throw new Error('No response stream');

      // Collect SSE stream into full text
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6).trim();
          if (payload === '[DONE]') break;
          try {
            const parsed = JSON.parse(payload);
            if (parsed.type === 'text_delta' && parsed.content) fullText += parsed.content;
          } catch { /* ignore */ }
        }
      }
      setStudyPlan(fullText || 'Study plan generated successfully');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setIsGeneratingPlan(false);
    }
  }

  function updateAssistanceLevel(key: keyof ClassConfig['assistanceLevels'], value: AssistanceLevel) {
    setConfig((prev) => ({
      ...prev,
      assistanceLevels: { ...prev.assistanceLevels, [key]: value },
    }));
  }

  if (isLoading) {
    return (
      <SchoolLayout>
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-adv-teal" />
        </div>
      </SchoolLayout>
    );
  }

  return (
    <SchoolLayout>
      <div className="mx-auto max-w-2xl space-y-6">
        <h1 className="text-xl font-bold text-adv-white">
          {isNew ? t('teacher.classConfig.title') : config.name || t('teacher.classConfig.title')}
        </h1>

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
              {t('teacher.classConfig.className')}
            </label>
            <input
              type="text"
              value={config.name}
              onChange={(e) => setConfig((p) => ({ ...p, name: e.target.value }))}
              placeholder="e.g. Matematik 9B"
              className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium uppercase tracking-widest text-adv-gray-med mb-1">
                {t('teacher.classConfig.subject')}
              </label>
              <select
                value={config.subjectId}
                onChange={(e) => setConfig((p) => ({ ...p, subjectId: e.target.value }))}
                className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none"
              >
                <option value="mathematics">{t('subject.mathematics')}</option>
                <option value="svenska">{t('subject.svenska', 'Svenska')}</option>
                <option value="english">{t('subject.english', 'English')}</option>
                <option value="science">{t('subject.science', 'Science (NO)')}</option>
                <option value="social-studies">{t('subject.socialStudies', 'Social Studies (SO)')}</option>
                <option value="computational-thinking">{t('subject.computationalThinking', 'Computational Thinking')}</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium uppercase tracking-widest text-adv-gray-med mb-1">
                {t('teacher.classConfig.tier')}
              </label>
              <select
                value={config.educationTier}
                onChange={(e) => setConfig((p) => ({ ...p, educationTier: e.target.value }))}
                className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none"
              >
                <option value="T2">{t('onboarding.student.step1.tierT2')}</option>
                <option value="T3">{t('onboarding.student.step1.tierT3')}</option>
                <option value="T4">{t('onboarding.student.step1.tierT4')}</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <input
              id="web-search"
              type="checkbox"
              checked={config.webSearchEnabled}
              onChange={(e) => setConfig((p) => ({ ...p, webSearchEnabled: e.target.checked }))}
              className="h-4 w-4 rounded border-border bg-adv-dark text-adv-teal focus:ring-adv-teal"
            />
            <label htmlFor="web-search" className="text-sm text-adv-off-white">
              {t('teacher.classConfig.webSearch')}
            </label>
          </div>

          <div className="flex items-center gap-3">
            <input
              id="leaderboard"
              type="checkbox"
              checked={config.leaderboardEnabled}
              onChange={(e) => setConfig((p) => ({ ...p, leaderboardEnabled: e.target.checked }))}
              className="h-4 w-4 rounded border-border bg-adv-dark text-adv-teal focus:ring-adv-teal"
            />
            <label htmlFor="leaderboard" className="text-sm text-adv-off-white">
              {t('teacher.classConfig.leaderboard', 'Show class leaderboard (top 10 by XP, anonymised)')}
            </label>
          </div>
        </section>

        {/* Assistance levels */}
        <section className="rounded-xl border border-border bg-adv-card p-5 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-adv-off-white">{t('teacher.classConfig.assistanceLevels')}</h2>
            <p className="text-xs text-adv-gray-med mt-0.5">
              L1 = Full Guidance (Socratic, never gives answers) · L2 = Moderate · L3 = Practice · L4 = Reference
            </p>
          </div>

          {(
            [
              ['homework', t('teacher.classConfig.homeworkLevel')],
              ['self_study', t('teacher.classConfig.selfStudyLevel')],
              ['exam_practice', t('teacher.classConfig.examPracticeLevel')],
              ['reference', t('teacher.classConfig.referenceLevel')],
            ] as [keyof ClassConfig['assistanceLevels'], string][]
          ).map(([key, label]) => (
            <div key={key} className="flex items-center justify-between">
              <span className="text-sm text-adv-off-white">{label}</span>
              <div className="flex gap-1">
                {ASSISTANCE_LEVELS.map((level) => (
                  <button
                    key={level}
                    type="button"
                    onClick={() => updateAssistanceLevel(key, level)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-adv-teal ${
                      config.assistanceLevels[key] === level
                        ? 'bg-adv-teal text-adv-dark'
                        : 'border border-border text-adv-gray hover:border-adv-teal hover:text-adv-teal'
                    }`}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </section>

        {/* Curriculum upload (only for existing classes) */}
        {!isNew && (
          <section className="rounded-xl border border-border bg-adv-card p-5 space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-adv-off-white">{t('teacher.classConfig.studyPlan')}</h2>
              <p className="text-xs text-adv-gray-med mt-0.5">{t('teacher.classConfig.uploadHelp')}</p>
            </div>

            <div className="flex items-center gap-3">
              <label className="flex flex-1 cursor-pointer items-center gap-2 rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-gray hover:border-adv-teal hover:text-adv-off-white transition-colors">
                <Upload className="h-4 w-4 shrink-0" />
                <span className="truncate">
                  {curriculumFile ? curriculumFile.name : t('teacher.classConfig.uploadCurriculum')}
                </span>
                <input
                  type="file"
                  accept=".pdf,.docx,.doc,.txt"
                  className="sr-only"
                  onChange={(e) => setCurriculumFile(e.target.files?.[0] ?? null)}
                />
              </label>
              <button
                type="button"
                onClick={handleCurriculumUpload}
                disabled={!curriculumFile || isGeneratingPlan}
                className="flex items-center gap-1.5 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isGeneratingPlan ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {t('teacher.classConfig.generating')}
                  </>
                ) : (
                  t('teacher.classConfig.generatePlan')
                )}
              </button>
            </div>

            {studyPlan && (
              <div className="rounded-lg border border-adv-teal/20 bg-adv-teal/5 p-3 text-sm text-adv-off-white">
                {studyPlan}
              </div>
            )}
          </section>
        )}

        {/* Save button */}
        <div className="flex items-center justify-end gap-3">
          {savedOk && (
            <span className="flex items-center gap-1.5 text-sm text-adv-teal">
              <CheckCircle2 className="h-4 w-4" />
              {t('teacher.classConfig.saved')}
            </span>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || !config.name}
            className="flex items-center gap-1.5 rounded-lg bg-adv-teal px-5 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {t('teacher.classConfig.save')}
          </button>
        </div>
      </div>
    </SchoolLayout>
  );
}
