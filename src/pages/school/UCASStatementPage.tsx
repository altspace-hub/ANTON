import React, { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, Loader2, Copy, Check, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';

interface UCASForm {
  courseTitle: string;
  universities: string;
  subjectsSummary: string;
  whyThisSubject: string;
  workExperience: string;
  extracurriculars: string;
  futureGoals: string;
  draftLength: 'short' | 'standard' | 'long';
}

const INITIAL_FORM: UCASForm = {
  courseTitle: '',
  universities: '',
  subjectsSummary: '',
  whyThisSubject: '',
  workExperience: '',
  extracurriculars: '',
  futureGoals: '',
  draftLength: 'standard',
};

export default function UCASStatementPage() {
  const { t } = useTranslation('school');
  const [form, setForm] = useState<UCASForm>(INITIAL_FORM);
  const [draft, setDraft] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const draftRef = useRef('');

  const charCount = draft.replace(/\n+/g, ' ').length;
  const lineCount = draft.split('\n').filter(l => l.trim().length > 0).length;
  const charLimit = 4000;
  const lineLimit = 47;

  const updateForm = (field: keyof UCASForm, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const generateDraft = async () => {
    if (!form.courseTitle || !form.whyThisSubject) {
      setError(t('ucas.errorRequired', { defaultValue: 'Course title and motivation are required.' }));
      return;
    }
    setError('');
    setDraft('');
    setStreaming(true);
    draftRef.current = '';

    try {
      const res = await fetch('/api/school/ucas/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || 'Request failed');
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const lines = decoder.decode(value).split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const payload = line.slice(6).trim();
            if (payload === '[DONE]') break;
            try {
              const parsed = JSON.parse(payload) as { text?: string };
              if (parsed.text) {
                draftRef.current += parsed.text;
                setDraft(draftRef.current);
              }
            } catch {
              // ignore parse errors
            }
          }
        }
      }
    } catch (err) {
      setError((err as Error).message || 'Failed to generate draft');
    } finally {
      setStreaming(false);
    }
  };

  const copyToClipboard = async () => {
    await navigator.clipboard.writeText(draft);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const charColor = charCount > charLimit ? 'text-red-400' : charCount > charLimit * 0.9 ? 'text-yellow-400' : 'text-adv-teal';
  const lineColor = lineCount > lineLimit ? 'text-red-400' : lineCount > lineLimit * 0.9 ? 'text-yellow-400' : 'text-adv-teal';

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-lg bg-adv-teal/10">
            <FileText className="w-6 h-6 text-adv-teal" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">
              {t('ucas.title', { defaultValue: 'UCAS Personal Statement' })}
            </h1>
            <p className="text-adv-gray text-sm">
              {t('ucas.subtitle', { defaultValue: 'AI-powered first draft for UK university applications' })}
            </p>
          </div>
        </div>
        <div className="bg-adv-teal-soft border border-adv-teal/20 rounded-lg p-3 text-sm text-adv-off-white">
          {t('ucas.disclaimer', { defaultValue: '⚠️ This draft is a starting point. Personalise it heavily — admissions tutors read thousands of statements. Your unique voice and specific details are what make the difference.' })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Form */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-white">
            {t('ucas.formTitle', { defaultValue: 'Tell us about yourself' })}
          </h2>

          {/* Course */}
          <div>
            <label className="block text-sm font-medium text-adv-off-white mb-1">
              {t('ucas.courseTitle', { defaultValue: 'Course you are applying for' })} <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={form.courseTitle}
              onChange={e => updateForm('courseTitle', e.target.value)}
              placeholder={t('ucas.coursePlaceholder', { defaultValue: 'e.g. Computer Science BSc, Medicine MBBS...' })}
              className="w-full bg-adv-card border border-white/10 rounded-lg px-3 py-2 text-white placeholder-adv-gray focus:outline-none focus:border-adv-teal"
            />
          </div>

          {/* Universities */}
          <div>
            <label className="block text-sm font-medium text-adv-off-white mb-1">
              {t('ucas.universities', { defaultValue: 'Target universities (optional)' })}
            </label>
            <input
              type="text"
              value={form.universities}
              onChange={e => updateForm('universities', e.target.value)}
              placeholder={t('ucas.universitiesPlaceholder', { defaultValue: 'e.g. Imperial, UCL, Edinburgh, Bristol, Manchester' })}
              className="w-full bg-adv-card border border-white/10 rounded-lg px-3 py-2 text-white placeholder-adv-gray focus:outline-none focus:border-adv-teal"
            />
          </div>

          {/* Subjects */}
          <div>
            <label className="block text-sm font-medium text-adv-off-white mb-1">
              {t('ucas.subjects', { defaultValue: 'A-Level subjects' })}
            </label>
            <input
              type="text"
              value={form.subjectsSummary}
              onChange={e => updateForm('subjectsSummary', e.target.value)}
              placeholder={t('ucas.subjectsPlaceholder', { defaultValue: 'e.g. Mathematics A*, Physics A, Chemistry A' })}
              className="w-full bg-adv-card border border-white/10 rounded-lg px-3 py-2 text-white placeholder-adv-gray focus:outline-none focus:border-adv-teal"
            />
          </div>

          {/* Why this subject */}
          <div>
            <label className="block text-sm font-medium text-adv-off-white mb-1">
              {t('ucas.whySubject', { defaultValue: 'Why this subject? What sparked your interest?' })} <span className="text-red-400">*</span>
            </label>
            <textarea
              value={form.whyThisSubject}
              onChange={e => updateForm('whyThisSubject', e.target.value)}
              placeholder={t('ucas.whyPlaceholder', { defaultValue: 'Describe what drew you to this subject — a book, project, experiment, realisation...' })}
              rows={4}
              className="w-full bg-adv-card border border-white/10 rounded-lg px-3 py-2 text-white placeholder-adv-gray focus:outline-none focus:border-adv-teal resize-none"
            />
          </div>

          {/* Advanced section */}
          <button
            onClick={() => setShowAdvanced(v => !v)}
            className="flex items-center gap-2 text-sm text-adv-teal hover:text-adv-teal-dark transition-colors"
          >
            {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            {t('ucas.moreDetails', { defaultValue: 'Add more details (recommended)' })}
          </button>

          {showAdvanced && (
            <div className="space-y-4 border-t border-white/10 pt-4">
              <div>
                <label className="block text-sm font-medium text-adv-off-white mb-1">
                  {t('ucas.workExperience', { defaultValue: 'Work experience / volunteering' })}
                </label>
                <textarea
                  value={form.workExperience}
                  onChange={e => updateForm('workExperience', e.target.value)}
                  placeholder={t('ucas.workPlaceholder', { defaultValue: 'Internships, shadowing, part-time work, volunteering...' })}
                  rows={3}
                  className="w-full bg-adv-card border border-white/10 rounded-lg px-3 py-2 text-white placeholder-adv-gray focus:outline-none focus:border-adv-teal resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-adv-off-white mb-1">
                  {t('ucas.extracurriculars', { defaultValue: 'Extracurricular activities' })}
                </label>
                <textarea
                  value={form.extracurriculars}
                  onChange={e => updateForm('extracurriculars', e.target.value)}
                  placeholder={t('ucas.extrasPlaceholder', { defaultValue: 'Sports, music, clubs, competitions, achievements...' })}
                  rows={3}
                  className="w-full bg-adv-card border border-white/10 rounded-lg px-3 py-2 text-white placeholder-adv-gray focus:outline-none focus:border-adv-teal resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-adv-off-white mb-1">
                  {t('ucas.futureGoals', { defaultValue: 'Career goals / future plans' })}
                </label>
                <textarea
                  value={form.futureGoals}
                  onChange={e => updateForm('futureGoals', e.target.value)}
                  placeholder={t('ucas.goalsPlaceholder', { defaultValue: 'Where do you see yourself after university?' })}
                  rows={2}
                  className="w-full bg-adv-card border border-white/10 rounded-lg px-3 py-2 text-white placeholder-adv-gray focus:outline-none focus:border-adv-teal resize-none"
                />
              </div>

              {/* Draft length */}
              <div>
                <label className="block text-sm font-medium text-adv-off-white mb-2">
                  {t('ucas.draftLength', { defaultValue: 'Draft length' })}
                </label>
                <div className="flex gap-2">
                  {(['short', 'standard', 'long'] as const).map(len => (
                    <button
                      key={len}
                      onClick={() => updateForm('draftLength', len)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        form.draftLength === len
                          ? 'bg-adv-teal text-adv-dark'
                          : 'bg-adv-card text-adv-gray hover:text-white border border-white/10'
                      }`}
                    >
                      {t(`ucas.length.${len}`, { defaultValue: len.charAt(0).toUpperCase() + len.slice(1) })}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400 text-sm">
              {error}
            </div>
          )}

          <button
            onClick={generateDraft}
            disabled={streaming || !form.courseTitle || !form.whyThisSubject}
            className="w-full py-3 rounded-lg font-semibold bg-adv-teal text-adv-dark hover:bg-adv-teal-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {streaming ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {t('ucas.generating', { defaultValue: 'Writing your draft...' })}
              </>
            ) : draft ? (
              <>
                <RefreshCw className="w-4 h-4" />
                {t('ucas.regenerate', { defaultValue: 'Regenerate draft' })}
              </>
            ) : (
              <>
                <FileText className="w-4 h-4" />
                {t('ucas.generate', { defaultValue: 'Generate draft' })}
              </>
            )}
          </button>
        </div>

        {/* Draft output */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-white">
              {t('ucas.draft', { defaultValue: 'Your draft' })}
            </h2>
            {draft && (
              <div className="flex items-center gap-3 text-xs">
                <span className={charColor}>{charCount}/{charLimit} chars</span>
                <span className={lineColor}>{lineCount}/{lineLimit} lines</span>
                <button
                  onClick={copyToClipboard}
                  className="flex items-center gap-1 text-adv-gray hover:text-white transition-colors"
                >
                  {copied ? <Check className="w-4 h-4 text-adv-teal" /> : <Copy className="w-4 h-4" />}
                  {copied
                    ? t('ucas.copied', { defaultValue: 'Copied!' })
                    : t('ucas.copy', { defaultValue: 'Copy' })}
                </button>
              </div>
            )}
          </div>

          <div className="bg-adv-card border border-white/10 rounded-xl min-h-[500px] p-4">
            {!draft && !streaming && (
              <div className="h-full flex flex-col items-center justify-center text-center text-adv-gray py-16">
                <FileText className="w-12 h-12 mb-4 opacity-30" />
                <p className="text-sm">
                  {t('ucas.emptyState', { defaultValue: 'Fill in the form and click Generate to see your personal statement draft here.' })}
                </p>
              </div>
            )}
            {(draft || streaming) && (
              <div className="whitespace-pre-wrap text-adv-off-white text-sm leading-relaxed font-mono">
                {draft}
                {streaming && (
                  <span className="inline-block w-2 h-4 bg-adv-teal animate-pulse ml-0.5 align-middle" />
                )}
              </div>
            )}
          </div>

          {draft && !streaming && (
            <div className="mt-3 bg-adv-teal-soft border border-adv-teal/20 rounded-lg p-3 text-xs text-adv-off-white">
              <strong className="text-adv-teal">{t('ucas.nextSteps', { defaultValue: 'Next steps:' })}</strong>{' '}
              {t('ucas.nextStepsText', { defaultValue: 'Edit the draft to add your own specific examples and voice. Remove anything that doesn\'t feel like you. Run it past your school\'s UCAS advisor before submitting.' })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
