import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Loader2, Bell, Globe, MessageSquare, Trash2, Accessibility, Server } from 'lucide-react';
import { getAuthHeader } from '@/lib/api';
import SchoolLayout from '@/components/school/SchoolLayout';
import { useAuthStore } from '@/stores/useAuthStore';

const TEACHING_LANGUAGES = [
  { code: 'sv', label: 'Svenska' },
  { code: 'en', label: 'English' },
  { code: 'no', label: 'Norsk' },
  { code: 'da', label: 'Dansk' },
  { code: 'fi', label: 'Suomi' },
  { code: 'ur', label: 'اردو' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'ar', label: 'العربية' },
];

const UI_LANGUAGES = [
  { code: 'sv', label: 'Svenska' },
  { code: 'en', label: 'English' },
  { code: 'ar', label: 'العربية (RTL)' },
  { code: 'fr', label: 'Français' },
  { code: 'ur', label: 'اردو (RTL)' },
  { code: 'hi', label: 'हिन्दी' },
];

export default function SchoolSettingsPage() {
  const { t, i18n } = useTranslation('school');
  const { user } = useAuthStore();
  const isAdmin = ((user as Record<string, unknown> | null)?.school_role as string | undefined) === 'school_admin';

  const [teachingLang, setTeachingLang] = useState('sv');
  const [dueDateReminders, setDueDateReminders] = useState(true);
  const [senMode, setSenMode] = useState<string>('none');
  const [explanationStyle, setExplanationStyle] = useState<string>('balanced');
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [clearingHistory, setClearingHistory] = useState(false);
  const [historyCleared, setHistoryCleared] = useState(false);

  // Admin: local model tier
  const [modelTier, setModelTier] = useState<'A' | 'C'>('A');
  const [ollamaUrl, setOllamaUrl] = useState('http://localhost:11434');
  const [savingTier, setSavingTier] = useState(false);
  const [tierSaved, setTierSaved] = useState(false);

  useEffect(() => {
    fetch('/api/school/settings', { headers: getAuthHeader() })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!data) return;
        setSenMode(data.senMode ?? 'none');
        setExplanationStyle(data.explanationStyle ?? 'balanced');
      })
      .catch(() => {});

    if (isAdmin) {
      fetch('/api/school/admin/model-tier', { headers: getAuthHeader() })
        .then((r) => r.ok ? r.json() : null)
        .then((data) => {
          if (!data) return;
          setModelTier(data.modelTier ?? 'A');
          setOllamaUrl(data.ollamaUrl ?? 'http://localhost:11434');
        })
        .catch(() => {});
    }
  }, [isAdmin]);

  async function handleSave() {
    setSaving(true);
    try {
      await fetch('/api/school/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({
          teachingLanguage: teachingLang,
          dueDateReminders,
          senMode: senMode === 'none' ? null : senMode,
          explanationStyle,
        }),
      });
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 2500);
    } catch {
      // non-fatal
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveTier() {
    setSavingTier(true);
    try {
      await fetch('/api/school/admin/model-tier', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ modelTier }),
      });
      setTierSaved(true);
      setTimeout(() => setTierSaved(false), 2500);
    } catch {
      // non-fatal
    } finally {
      setSavingTier(false);
    }
  }

  async function handleClearHistory() {
    if (!window.confirm('This will delete all your school learning conversation history. Are you sure?')) return;
    setClearingHistory(true);
    try {
      await fetch('/api/school/learning-history', {
        method: 'DELETE',
        headers: getAuthHeader(),
      });
      setHistoryCleared(true);
    } catch {
      // non-fatal
    } finally {
      setClearingHistory(false);
    }
  }

  return (
    <SchoolLayout>
      <div className="mx-auto max-w-xl space-y-6">
        <h1 className="text-xl font-bold text-adv-white">
          {t('nav.schoolSettings', 'School Settings')}
        </h1>

        {/* Language */}
        <section className="rounded-xl border border-border bg-adv-card p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-adv-teal" />
            <h2 className="text-sm font-semibold text-adv-off-white">Language</h2>
          </div>

          <div>
            <label className="block text-xs font-medium uppercase tracking-widest text-adv-gray-med mb-1">
              App Language
            </label>
            <select
              value={i18n.language}
              onChange={(e) => i18n.changeLanguage(e.target.value)}
              className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none"
            >
              {UI_LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>{lang.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium uppercase tracking-widest text-adv-gray-med mb-1">
              Teaching Language
            </label>
            <p className="mb-2 text-xs text-adv-gray-med">The language Alma uses when responding to you</p>
            <select
              value={teachingLang}
              onChange={(e) => setTeachingLang(e.target.value)}
              className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none"
            >
              {TEACHING_LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>{lang.label}</option>
              ))}
            </select>
          </div>
        </section>

        {/* Notifications */}
        <section className="rounded-xl border border-border bg-adv-card p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-adv-teal" />
            <h2 className="text-sm font-semibold text-adv-off-white">Notifications</h2>
          </div>

          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <p className="text-sm text-adv-off-white">Due date reminders</p>
              <p className="text-xs text-adv-gray-med">Remind me when assignments are due soon</p>
            </div>
            <div
              role="switch"
              aria-checked={dueDateReminders}
              onClick={() => setDueDateReminders((p) => !p)}
              className={`relative flex h-6 w-11 cursor-pointer items-center rounded-full transition-colors ${dueDateReminders ? 'bg-adv-teal' : 'bg-adv-dark'}`}
            >
              <span
                className={`absolute h-4 w-4 rounded-full bg-white shadow transition-transform ${dueDateReminders ? 'translate-x-6' : 'translate-x-1'}`}
              />
            </div>
          </label>
        </section>

        {/* Conversation */}
        <section className="rounded-xl border border-border bg-adv-card p-5 space-y-4">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-adv-teal" />
            <h2 className="text-sm font-semibold text-adv-off-white">Conversation Style</h2>
          </div>
          <p className="text-xs text-adv-gray-med">
            Alma adapts her teaching style to your assistance level, set by your teacher. If you don't have a class, the default is L2 (Moderate Help).
          </p>
        </section>

        {/* Learning Support */}
        <section className="rounded-xl border border-border bg-adv-card p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Accessibility className="h-4 w-4 text-adv-teal" />
            <h2 className="text-sm font-semibold text-adv-off-white">Learning Support</h2>
          </div>

          <div>
            <label className="block text-xs font-medium uppercase tracking-widest text-adv-gray-med mb-2">
              Accessibility Mode
            </label>
            <p className="mb-3 text-xs text-adv-gray-med">
              Choose a mode that suits how you learn best. Alma will adapt her responses accordingly.
            </p>
            <div className="space-y-2">
              {[
                { value: 'none', label: 'Standard', desc: 'Default — no special adaptations' },
                { value: 'dyslexia', label: 'Dyslexia-Friendly', desc: 'Short sentences, bullet points, bold key terms' },
                { value: 'adhd', label: 'ADHD-Friendly', desc: 'Brief focused responses, one concept at a time, clear next steps' },
              ].map((opt) => (
                <label key={opt.value} className="flex items-start gap-3 cursor-pointer rounded-lg border border-border p-3 hover:border-adv-teal/30 transition-colors">
                  <input
                    type="radio"
                    name="senMode"
                    value={opt.value}
                    checked={senMode === opt.value}
                    onChange={() => setSenMode(opt.value)}
                    className="mt-0.5 accent-adv-teal"
                  />
                  <div>
                    <p className="text-sm font-medium text-adv-off-white">{opt.label}</p>
                    <p className="text-xs text-adv-gray-med">{opt.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium uppercase tracking-widest text-adv-gray-med mb-1">
              Explanation Style
            </label>
            <select
              value={explanationStyle}
              onChange={(e) => setExplanationStyle(e.target.value)}
              className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none"
            >
              <option value="balanced">Balanced (default)</option>
              <option value="examples_first">Examples first, then theory</option>
              <option value="theory_first">Theory first, then examples</option>
              <option value="visual">Visual / step-by-step diagrams</option>
              <option value="verbal">Conversational / storytelling</option>
            </select>
          </div>
        </section>

        {/* Admin: Local AI Model (school_admin only) */}
        {isAdmin && (
          <section className="rounded-xl border border-adv-teal/20 bg-adv-teal-soft p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Server className="h-4 w-4 text-adv-teal" />
              <h2 className="text-sm font-semibold text-adv-off-white">Local AI Model (Admin)</h2>
            </div>
            <p className="text-xs text-adv-gray-med">
              Run ANTON school chat on a local AI model via Ollama instead of the cloud.
              Requires Ollama running at <code className="text-adv-teal">{ollamaUrl}</code> with <code className="text-adv-teal">mistral:7b</code> pulled.
              If the local model is unavailable, ANTON automatically falls back to the cloud.
            </p>

            <div className="space-y-2">
              {[
                { value: 'A' as const, label: 'Cloud (Anthropic Claude)', desc: 'Default — highest quality, requires internet' },
                { value: 'C' as const, label: 'Local Model (Ollama)', desc: 'Privacy-first — runs entirely on this machine' },
              ].map((opt) => (
                <label
                  key={opt.value}
                  className={`flex items-start gap-3 cursor-pointer rounded-lg border p-3 transition-colors ${
                    modelTier === opt.value ? 'border-adv-teal bg-adv-teal/5' : 'border-border hover:border-adv-teal/30'
                  }`}
                >
                  <input
                    type="radio"
                    name="modelTier"
                    value={opt.value}
                    checked={modelTier === opt.value}
                    onChange={() => setModelTier(opt.value)}
                    className="mt-0.5 accent-adv-teal"
                  />
                  <div>
                    <p className="text-sm font-medium text-adv-off-white">{opt.label}</p>
                    <p className="text-xs text-adv-gray-med">{opt.desc}</p>
                  </div>
                </label>
              ))}
            </div>

            <div className="flex items-center gap-3">
              {tierSaved && (
                <span className="flex items-center gap-1.5 text-sm text-adv-teal">
                  <CheckCircle2 className="h-4 w-4" />
                  Saved
                </span>
              )}
              <button
                type="button"
                onClick={handleSaveTier}
                disabled={savingTier}
                className="flex items-center gap-1.5 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {savingTier ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Apply Model Setting
              </button>
            </div>
          </section>
        )}

        {/* Privacy */}
        <section className="rounded-xl border border-border bg-adv-card p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Trash2 className="h-4 w-4 text-adv-red" />
            <h2 className="text-sm font-semibold text-adv-off-white">Privacy</h2>
          </div>

          {historyCleared ? (
            <div className="flex items-center gap-2 rounded-lg border border-adv-teal/20 bg-adv-teal/5 px-4 py-3 text-sm text-adv-teal">
              <CheckCircle2 className="h-4 w-4" />
              Learning history cleared.
            </div>
          ) : (
            <div>
              <p className="mb-3 text-xs text-adv-gray-med">
                Clear all your school chat history. This cannot be undone.
              </p>
              <button
                type="button"
                onClick={handleClearHistory}
                disabled={clearingHistory}
                className="flex items-center gap-1.5 rounded-lg border border-adv-red/30 px-4 py-2 text-sm text-adv-red hover:bg-adv-red/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {clearingHistory ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                Clear my school learning history
              </button>
            </div>
          )}
        </section>

        {/* Save */}
        <div className="flex items-center justify-end gap-3">
          {savedOk && (
            <span className="flex items-center gap-1.5 text-sm text-adv-teal">
              <CheckCircle2 className="h-4 w-4" />
              {t('teacher.classConfig.saved', 'Saved')}
            </span>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-lg bg-adv-teal px-5 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {t('teacher.classConfig.save', 'Save Settings')}
          </button>
        </div>
      </div>
    </SchoolLayout>
  );
}
