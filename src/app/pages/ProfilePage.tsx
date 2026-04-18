/**
 * ProfilePage — Identity, language, theme, and settings.
 */

import { useState, useEffect } from 'react';
import { getIdentity, saveIdentity, clearIdentity } from '../services/identity';
import { updateProfile, getLanguages, clearSession } from '../services/api';
import { getTheme, setTheme, type AppTheme } from '../services/theme';

interface Props { onBack: () => void; }

// Themes were dropped in the Evolution redesign (light only). The picker
// is replaced by the personal-accent picker in the Phase 5 settings refresh.
const THEMES: { value: AppTheme; label: string; icon: string; desc: string }[] = [
  { value: 'light', label: 'Light', icon: '☀️', desc: 'Warm linen' },
];

export default function ProfilePage({ onBack }: Props) {
  const identity = getIdentity();
  const [name, setName] = useState(identity?.displayName || '');
  const [language, setLanguage] = useState(identity?.preferredLanguage || 'en');
  const [languages, setLanguages] = useState<Record<string, string>>({});
  const [currentTheme, setCurrentTheme] = useState<AppTheme>(getTheme());
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { getLanguages().then(setLanguages).catch(() => {}); }, []);

  function handleThemeChange(theme: AppTheme) {
    setTheme(theme);
    setCurrentTheme(theme);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await updateProfile({ display_name: name.trim(), preferred_language: language });
      if (identity) saveIdentity({ ...identity, displayName: name.trim(), preferredLanguage: language });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {}
    setSaving(false);
  }

  function handleLogout() {
    if (confirm('Sign out? Your identity will be removed from this device.')) {
      clearSession(); clearIdentity(); window.location.reload();
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-adv-dark safe-top safe-bottom">
      {/* Header */}
      <div className="border-b border-border bg-adv-dark-2">
      <div className="mx-auto flex max-w-2xl items-center gap-3 px-5 py-4">
        <button onClick={onBack} className="flex h-9 w-9 items-center justify-center rounded-lg bg-adv-card text-adv-gray transition hover:text-adv-off-white active:scale-95">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <h1 className="text-lg font-bold text-adv-off-white">Profile</h1>
      </div>

      </div>

      <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-2xl px-5 py-6 space-y-6">
        {/* Identity card */}
        <div className="rounded-2xl border border-border bg-adv-card p-6 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-adv-teal/20 to-adv-teal/5 border border-adv-teal/20">
            <span className="text-2xl font-bold text-adv-teal">{(identity?.displayName || '?')[0].toUpperCase()}</span>
          </div>
          <p className="text-base font-semibold text-adv-off-white">{identity?.displayName}</p>
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-adv-dark px-3 py-1 border border-border">
            <span className="h-1.5 w-1.5 rounded-full bg-adv-green" />
            <span className="font-mono text-[10px] text-adv-gray">{identity?.contactHash}</span>
          </div>
        </div>

        {/* Theme selector */}
        <div>
          <label className="mb-3 block text-xs font-medium uppercase tracking-wider text-adv-gray">Appearance</label>
          <div className="grid grid-cols-3 gap-2">
            {THEMES.map(t => (
              <button
                key={t.value}
                onClick={() => handleThemeChange(t.value)}
                className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 transition-all active:scale-95 ${
                  currentTheme === t.value
                    ? 'border-adv-teal bg-adv-teal/10 shadow-sm shadow-adv-teal/10'
                    : 'border-border bg-adv-card hover:border-adv-gray/30'
                }`}
              >
                <span className="text-xl">{t.icon}</span>
                <span className={`text-xs font-medium ${currentTheme === t.value ? 'text-adv-teal' : 'text-adv-off-white'}`}>{t.label}</span>
                <span className="text-[10px] text-adv-gray">{t.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Edit form */}
        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-adv-gray">Display Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-border bg-adv-card px-4 py-3 text-sm text-adv-off-white transition-colors focus:border-adv-teal focus:outline-none focus:ring-1 focus:ring-adv-teal/30"
            />
          </div>

          <div>
            <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-adv-gray">Language</label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full rounded-lg border border-border bg-adv-card px-4 py-3 text-sm text-adv-off-white transition-colors focus:border-adv-teal focus:outline-none focus:ring-1 focus:ring-adv-teal/30"
            >
              {Object.entries(languages).map(([code, label]) => (
                <option key={code} value={code}>{label}</option>
              ))}
            </select>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full rounded-lg bg-adv-teal py-3.5 text-sm font-semibold text-adv-dark transition-all hover:bg-adv-teal-dark active:scale-[0.98] disabled:opacity-50"
          >
            {saved ? '✓ Saved' : saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>

        {/* Sign out */}
        <div className="pt-4 border-t border-border">
          <button
            onClick={handleLogout}
            className="w-full rounded-lg border border-adv-red/20 bg-adv-red/5 py-3 text-sm font-medium text-adv-red transition hover:bg-adv-red/10 active:scale-[0.98]"
          >
            Sign Out
          </button>
          <p className="mt-3 text-center text-[10px] text-adv-gray/40">
            ANTON Companion v1.0
          </p>
        </div>
      </div>
      </div>
    </div>
  );
}
