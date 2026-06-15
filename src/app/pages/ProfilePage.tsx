/**
 * ProfilePage — Identity, language, sign out (Evolution light theme).
 *
 * May-3 IRE pass:
 *   • Removed dead theme picker (single-item array — pure dead code)
 *   • Light-token migration (was bg-adv-dark + adv-* throughout)
 *   • PageHeader primitive (was custom header markup)
 *   • Ico for back button + check icons (was inline SVG + ✓ char)
 */

import { useState, useEffect } from 'react';
import { getIdentity, saveIdentity, clearIdentity } from '../services/identity';
import { updateProfile, getLanguages, clearSession } from '../services/api';
import { Btn, Ico, PageHeader, SectionLabel, ErrorPill } from '../components/ui';

interface Props { onBack: () => void; }

export default function ProfilePage({ onBack }: Props) {
  const identity = getIdentity();
  const [name, setName] = useState(identity?.displayName || '');
  const [language, setLanguage] = useState(identity?.preferredLanguage || 'en');
  const [languages, setLanguages] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getLanguages()
      .then(rows => { if (!cancelled) setLanguages(rows); })
      .catch(() => { /* non-fatal: keep previous state, retry on next mount */ });
    return () => { cancelled = true; };
  }, []);

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      await updateProfile({ display_name: name.trim(), preferred_language: language });
      if (identity) saveIdentity({ ...identity, displayName: name.trim(), preferredLanguage: language });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setSaveError('Couldn\'t save. Check your connection and try again.');
    }
    setSaving(false);
  }

  function handleLogout() {
    if (confirm('Sign out? Your identity will be removed from this device.')) {
      clearSession(); clearIdentity(); window.location.reload();
    }
  }

  const initial = (identity?.displayName || '?')[0].toUpperCase();

  return (
    <div className="flex flex-1 flex-col overflow-hidden" style={{ background: 'var(--color-bg)', minHeight: 0 }}>
      <PageHeader title="Profile" onBack={onBack} />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl space-y-6 px-4 pb-10 pt-5">
          {/* Identity card */}
          <div
            className="flex items-center gap-4 rounded-[var(--radius-r2)] px-4 py-4"
            style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
            }}
          >
            <div
              className="flex flex-shrink-0 items-center justify-center rounded-full"
              style={{
                width: 56, height: 56,
                background: 'var(--color-accent-soft)',
                color: 'var(--color-accent)',
                fontSize: '1.375rem', fontWeight: 700,
                border: '1px solid var(--color-accent-dim)',
              }}
            >
              {initial}
            </div>
            <div className="min-w-0 flex-1">
              <p
                className="truncate text-base font-semibold"
                style={{ color: 'var(--color-text)' }}
              >
                {identity?.displayName || 'Unnamed'}
              </p>
              <div className="mt-1 flex items-center gap-1.5">
                <span
                  className="block rounded-full"
                  style={{ width: 6, height: 6, background: 'var(--color-green)' }}
                />
                <span
                  className="truncate font-mono text-[0.6875rem]"
                  style={{ color: 'var(--color-text-muted)', letterSpacing: '0.4px' }}
                >
                  {identity?.contactHash || '—'}
                </span>
              </div>
            </div>
          </div>

          {/* Edit form */}
          <section>
            <SectionLabel htmlFor="profile-name" className="mb-2.5">Display name</SectionLabel>
            <input
              id="profile-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-[var(--radius-r2)] px-4 text-sm focus:outline-none"
              style={{
                background: 'var(--color-surface)',
                color: 'var(--color-text)',
                border: '1px solid var(--color-border)',
                height: 48,
              }}
            />
          </section>

          <section>
            <SectionLabel htmlFor="profile-language" className="mb-2.5">Language</SectionLabel>
            <select
              id="profile-language"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full rounded-[var(--radius-r2)] px-4 text-sm focus:outline-none"
              style={{
                background: 'var(--color-surface)',
                color: 'var(--color-text)',
                border: '1px solid var(--color-border)',
                height: 48,
              }}
            >
              {Object.entries(languages).map(([code, label]) => (
                <option key={code} value={code}>{label}</option>
              ))}
            </select>
          </section>

          {saveError && (
            <ErrorPill message={saveError} onRetry={() => void handleSave()} retryLabel="Try again" />
          )}

          <Btn
            variant="primary"
            size="lg"
            block
            onClick={handleSave}
            disabled={saving}
            icon={saved ? <Ico name="check" size={16} /> : undefined}
          >
            {saved ? 'Saved' : saving ? 'Saving…' : 'Save changes'}
          </Btn>

          {/* Sign out */}
          <div style={{ borderTop: '1px solid var(--color-border-soft)' }} className="pt-4">
            <button
              onClick={handleLogout}
              className="flex w-full items-center justify-center rounded-[var(--radius-r2)] text-sm font-semibold transition active:scale-[0.99]"
              style={{
                background: 'var(--color-red-dim)',
                color: 'var(--color-red)',
                height: 44,
              }}
            >
              Sign out
            </button>
            <p
              className="mt-3 text-center font-mono text-[0.6875rem]"
              style={{ color: 'var(--color-text-faint)', letterSpacing: '0.4px' }}
            >
              ANTON COMPANION · v1.0
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
