/**
 * SettingsPage — App settings, identity info, data management.
 */

import { useState } from 'react';
import { getIdentity, clearIdentity } from '../services/identity';
import { clearSession } from '../services/api';

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
    <div className="flex min-h-dvh flex-col bg-adv-dark safe-top safe-bottom">
      <div className="border-b border-border bg-adv-dark-2">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-5 py-4">
          <button onClick={onBack} className="flex h-9 w-9 items-center justify-center rounded-lg bg-adv-card text-adv-gray transition hover:text-adv-off-white active:scale-95">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <h1 className="text-lg font-bold text-adv-off-white">Settings</h1>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-5 py-6 space-y-6">
          {/* Identity */}
          <div>
            <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-adv-gray">Identity</h2>
            <div className="rounded-xl border border-border bg-adv-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-adv-gray">Contact Hash</span>
                <button onClick={handleCopyId} className="text-xs text-adv-teal hover:text-adv-teal-dark transition">
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <p className="font-mono text-xs text-adv-off-white break-all">{identity?.contactHash || 'Not registered'}</p>
            </div>
          </div>

          {/* Data Management */}
          <div>
            <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-adv-gray">Data Management</h2>
            <div className="space-y-2">
              <button
                onClick={handleExportIdentity}
                className="w-full flex items-center gap-3 rounded-xl border border-border bg-adv-card px-4 py-3.5 text-left transition hover:border-adv-teal/20"
              >
                <span className="text-lg">📤</span>
                <div>
                  <div className="text-sm text-adv-off-white">Export Identity</div>
                  <div className="text-[10px] text-adv-gray">Download your identity as a backup file</div>
                </div>
              </button>

              <button
                onClick={handleDeleteData}
                className="w-full flex items-center gap-3 rounded-xl border border-adv-red/20 bg-adv-red/5 px-4 py-3.5 text-left transition hover:bg-adv-red/10"
              >
                <span className="text-lg">🗑️</span>
                <div>
                  <div className="text-sm text-adv-red">Delete All Data</div>
                  <div className="text-[10px] text-adv-red/60">Remove identity and all local data from this device</div>
                </div>
              </button>
            </div>
          </div>

          {/* About */}
          <div className="pt-4 border-t border-border text-center space-y-1">
            <p className="text-xs text-adv-gray">ANTON Companion v1.0</p>
            <p className="text-[10px] text-adv-gray/40">by openEXPERT</p>
          </div>
        </div>
      </div>
    </div>
  );
}
