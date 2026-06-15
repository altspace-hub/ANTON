/**
 * SettingsPage — App settings, identity info, data management.
 *
 * Evolution redesign (May 3 IRE pass):
 *   • Light theme tokens (was: bg-adv-dark + adv-* legacy classes)
 *   • Ico components for actions (was: emoji 📤 🗑️)
 *   • SectionLabel for IDENTITY / DATA MANAGEMENT (matches desktop pattern)
 *   • Tighter card hierarchy, mono only for the contact hash itself
 */

import { useEffect, useState } from 'react';
import { getIdentity, clearIdentity } from '../services/identity';
import { clearSession } from '../services/api';
import { Ico, PageHeader, SectionLabel } from '../components/ui';
import DisplaySizePicker from '../components/DisplaySizePicker';
import Logo from '../components/Logo';
import {
  getLogoSkin, setLogoSkin, onLogoSkinChange,
  LOGO_SKIN_LABELS, type LogoSkin,
} from '../services/logo-skin';

interface Props { onBack: () => void; }

export default function SettingsPage({ onBack }: Props) {
  const identity = getIdentity();
  const [copied, setCopied] = useState(false);
  const [logoSkin, setLogoSkinState] = useState<LogoSkin>(getLogoSkin());
  useEffect(() => onLogoSkinChange(setLogoSkinState), []);

  function handleExportIdentity() {
    if (!identity) return;
    const data = JSON.stringify({
      contactHash: identity.contactHash,
      displayName: identity.displayName,
      preferredLanguage: identity.preferredLanguage,
      exportedAt: new Date().toISOString(),
    }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `anton-identity-${identity.contactHash.slice(6, 14)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleCopyId() {
    if (identity?.contactHash) {
      navigator.clipboard.writeText(identity.contactHash);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  function handleDeleteData() {
    if (confirm('This will delete your identity and all local data. You will need to re-register. Continue?')) {
      clearSession();
      clearIdentity();
      localStorage.clear();
      window.location.reload();
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden" style={{ background: 'var(--color-bg)', minHeight: 0 }}>
      <PageHeader title="Settings" onBack={onBack} />

      {/* ── Body ────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl space-y-6 px-4 pb-10 pt-5">
          {/* Appearance — logo skin picker (Phase 8.A) */}
          <section>
            <SectionLabel className="mb-2.5">Appearance</SectionLabel>
            <div
              className="rounded-[var(--radius-r2)] p-4"
              style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
              }}
            >
              <div className="mb-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                App logo
              </div>
              <div className="flex items-center gap-3">
                {(['green-chevron', 'cream-chevron', 'a-letter'] as const).map((skin) => {
                  const active = logoSkin === skin;
                  return (
                    <button
                      key={skin}
                      onClick={() => setLogoSkin(skin)}
                      aria-label={`Set logo to ${LOGO_SKIN_LABELS[skin]}`}
                      aria-pressed={active}
                      className="flex flex-col items-center gap-1.5 transition active:scale-[0.97]"
                      style={{
                        padding: 8,
                        borderRadius: 12,
                        background: active ? 'var(--color-accent-soft)' : 'transparent',
                        border: '1.5px solid',
                        borderColor: active ? 'var(--color-accent)' : 'var(--color-border)',
                      }}
                    >
                      <Logo size={48} skin={skin} />
                      <span
                        className="text-[0.6875rem]"
                        style={{
                          color: active ? 'var(--color-accent)' : 'var(--color-text-muted)',
                          fontWeight: active ? 700 : 500,
                        }}
                      >
                        {LOGO_SKIN_LABELS[skin]}
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-3 text-[0.6875rem]" style={{ color: 'var(--color-text-muted)' }}>
                Changes apply immediately across the app. Affects in-app branding only — the home-screen launcher icon is fixed at install time.
              </p>
            </div>
          </section>

          {/* Display size — fit the app to any phone/tablet (auto-fit + override) */}
          <section>
            <SectionLabel className="mb-2.5">Display size</SectionLabel>
            <DisplaySizePicker />
          </section>

          {/* Identity */}
          <section>
            <SectionLabel className="mb-2.5">Identity</SectionLabel>
            <div
              className="rounded-[var(--radius-r2)] px-4 py-3.5"
              style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
              }}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  Contact Hash
                </span>
                <button
                  onClick={handleCopyId}
                  className="text-xs font-semibold transition"
                  style={{ color: 'var(--color-accent)' }}
                >
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <p
                className="mt-2 break-all font-mono text-xs"
                style={{ color: 'var(--color-text)' }}
              >
                {identity?.contactHash || 'Not registered'}
              </p>
              {identity?.displayName && (
                <p
                  className="mt-2 text-xs"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  Signed in as <span style={{ color: 'var(--color-text)', fontWeight: 600 }}>{identity.displayName}</span>
                </p>
              )}
            </div>
          </section>

          {/* Data Management */}
          <section>
            <SectionLabel className="mb-2.5">Data Management</SectionLabel>
            <div className="space-y-2">
              <button
                onClick={handleExportIdentity}
                className="flex w-full items-center gap-3 rounded-[var(--radius-r2)] px-4 py-3.5 text-left transition active:scale-[0.99]"
                style={{
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                }}
              >
                <span
                  className="flex flex-shrink-0 items-center justify-center rounded-[var(--radius-r1)]"
                  style={{
                    width: 34, height: 34,
                    background: 'var(--color-accent-soft)',
                    color: 'var(--color-accent)',
                  }}
                >
                  <Ico name="key" size={17} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                    Export Identity
                  </div>
                  <div className="mt-0.5 text-[0.6875rem]" style={{ color: 'var(--color-text-muted)' }}>
                    Download your identity as a backup file
                  </div>
                </div>
                <Ico name="chevronRight" size={16} color="var(--color-text-faint)" />
              </button>

              <button
                onClick={handleDeleteData}
                className="flex w-full items-center gap-3 rounded-[var(--radius-r2)] px-4 py-3.5 text-left transition active:scale-[0.99]"
                style={{
                  background: 'var(--color-red-dim)',
                  // UM7: was border-color === bg-color → invisible border, no
                  // affordance separation. Tone the border to the red accent
                  // so the destructive action reads as bounded.
                  border: '1px solid color-mix(in srgb, var(--color-red) 30%, transparent)',
                }}
              >
                <span
                  className="flex flex-shrink-0 items-center justify-center rounded-[var(--radius-r1)]"
                  style={{
                    width: 34, height: 34,
                    background: 'var(--color-surface)',
                    color: 'var(--color-red)',
                  }}
                >
                  <Ico name="alert" size={17} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold" style={{ color: 'var(--color-red)' }}>
                    Delete All Data
                  </div>
                  <div className="mt-0.5 text-[0.6875rem]" style={{ color: 'var(--color-red)', opacity: 0.7 }}>
                    Remove identity and all local data from this device
                  </div>
                </div>
              </button>
            </div>
          </section>

          {/* About */}
          <section>
            <SectionLabel className="mb-2.5">About</SectionLabel>
            <div
              className="rounded-[var(--radius-r2)] px-4 py-3.5"
              style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
              }}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                  ANTON Companion
                </span>
                <span className="font-mono text-[0.6875rem]" style={{ color: 'var(--color-text-muted)' }}>
                  v1.0
                </span>
              </div>
              <div className="mt-1 text-[0.6875rem]" style={{ color: 'var(--color-text-muted)' }}>
                by openEXPERT
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
