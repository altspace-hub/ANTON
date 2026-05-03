/**
 * SettingsPage — App settings, identity info, data management.
 *
 * Evolution redesign (May 3 IRE pass):
 *   • Light theme tokens (was: bg-adv-dark + adv-* legacy classes)
 *   • Ico components for actions (was: emoji 📤 🗑️)
 *   • SectionLabel for IDENTITY / DATA MANAGEMENT (matches desktop pattern)
 *   • Tighter card hierarchy, mono only for the contact hash itself
 */

import { useState } from 'react';
import { getIdentity, clearIdentity } from '../services/identity';
import { clearSession } from '../services/api';
import { Ico, PageHeader, SectionLabel } from '../components/ui';

interface Props { onBack: () => void; }

export default function SettingsPage({ onBack }: Props) {
  const identity = getIdentity();
  const [copied, setCopied] = useState(false);

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
                <span className="text-[12px]" style={{ color: 'var(--color-text-muted)' }}>
                  Contact Hash
                </span>
                <button
                  onClick={handleCopyId}
                  className="text-[12px] font-semibold transition"
                  style={{ color: 'var(--color-accent)' }}
                >
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <p
                className="mt-2 break-all font-mono text-[12px]"
                style={{ color: 'var(--color-text)' }}
              >
                {identity?.contactHash || 'Not registered'}
              </p>
              {identity?.displayName && (
                <p
                  className="mt-2 text-[12px]"
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
                  <div className="text-[14px] font-semibold" style={{ color: 'var(--color-text)' }}>
                    Export Identity
                  </div>
                  <div className="mt-0.5 text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
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
                  <div className="text-[14px] font-semibold" style={{ color: 'var(--color-red)' }}>
                    Delete All Data
                  </div>
                  <div className="mt-0.5 text-[11px]" style={{ color: 'var(--color-red)', opacity: 0.7 }}>
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
                <span className="text-[13px] font-semibold" style={{ color: 'var(--color-text)' }}>
                  ANTON Companion
                </span>
                <span className="font-mono text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                  v1.0
                </span>
              </div>
              <div className="mt-1 text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                by openEXPERT
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
