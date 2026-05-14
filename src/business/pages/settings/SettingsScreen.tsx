/**
 * SettingsScreen — main settings hub.
 *
 * v1 surface: Connect wallet, Backup, About. Profile + Items editing
 * are accessible via re-onboarding for now; deeper Settings sub-screens
 * land in a follow-up.
 */
import { useEffect, useState } from 'react';
import PrimaryButton from '../../components/PrimaryButton';
import { runBackupExport, isBackupOverdue } from '../../services/backup';
import { loadConfig } from '../../services/merchant';
import type { MerchantConfig } from '../../services/types';
import { hasWallet, loadWallet } from '../../services/wallet';

interface Props {
  onBack: () => void;
  onConnectWallet: () => void;
}

export default function SettingsScreen({ onBack, onConnectWallet }: Props) {
  const [config, setConfig] = useState<MerchantConfig | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [backupStatus, setBackupStatus] = useState<string | null>(null);

  useEffect(() => {
    refresh();
  }, []);

  async function refresh() {
    const cfg = await loadConfig();
    setConfig(cfg);
    if (await hasWallet()) {
      const w = await loadWallet();
      setWalletAddress(w?.address ?? null);
    } else {
      setWalletAddress(null);
    }
  }

  async function runBackup() {
    setBackupStatus('Running…');
    try {
      const result = await runBackupExport();
      setBackupStatus(`Exported ${result.count} kvitto(s) · ${result.filename}`);
      await refresh();
    } catch (err) {
      setBackupStatus((err as Error).message);
    }
  }

  const overdue = isBackupOverdue(config);

  return (
    <div className="flex flex-col h-full overflow-y-auto safe-top safe-bottom"
         style={{ backgroundColor: 'var(--color-bg)' }}>
      <div className="p-6 pb-3 flex items-center gap-3 -ml-2">
        <button type="button" onClick={onBack} className="p-2 rounded-lg" aria-label="Back"
                style={{ color: 'var(--color-text-muted)' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h2 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>Settings</h2>
      </div>

      <div className="px-6 flex flex-col gap-3">
        {/* Wallet section */}
        <div className="rounded-xl p-4"
             style={{
               backgroundColor: 'var(--color-surface)',
               border: '1px solid var(--color-border)',
             }}>
          <div className="flex justify-between items-start mb-2">
            <h3 className="font-bold" style={{ color: 'var(--color-text)' }}>Wallet</h3>
            <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded"
                  style={{
                    backgroundColor: walletAddress ? 'var(--color-success-bg)' : 'var(--color-warning-bg)',
                    color: walletAddress ? 'var(--color-success)' : 'var(--color-warning)',
                  }}>
              {walletAddress ? 'Connected' : 'Not connected'}
            </span>
          </div>
          {walletAddress ? (
            <>
              <div className="text-xs uppercase tracking-wider mb-1"
                   style={{ color: 'var(--color-text-faint)' }}>
                Address
              </div>
              <div className="mono text-[11px] break-all"
                   style={{ color: 'var(--color-accent)' }}>
                {walletAddress}
              </div>
            </>
          ) : (
            <>
              <p className="text-sm mb-3" style={{ color: 'var(--color-text-muted)' }}>
                Generate a wallet to unlock FTC payment QRs in sale flows.
              </p>
              <button type="button" onClick={onConnectWallet}
                      className="px-4 py-2 rounded-lg text-sm font-semibold"
                      style={{
                        backgroundColor: 'var(--color-accent)',
                        color: 'var(--color-accent-fg)',
                      }}>
                Connect wallet
              </button>
            </>
          )}
        </div>

        {/* Business identity */}
        {config && (
          <div className="rounded-xl p-4"
               style={{
                 backgroundColor: 'var(--color-surface)',
                 border: '1px solid var(--color-border)',
               }}>
            <h3 className="font-bold mb-2" style={{ color: 'var(--color-text)' }}>Business</h3>
            <div className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
              {config.legalName}
            </div>
            <div className="mono text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
              {config.orgNr}
            </div>
            <div className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
              {config.street}, {config.postcode} {config.city}
            </div>
            <div className="text-xs mt-2 pt-2"
                 style={{
                   color: 'var(--color-text-muted)',
                   borderTop: '1px solid var(--color-border-soft)',
                 }}>
              Default mode: <span className="font-semibold capitalize"
                                  style={{ color: 'var(--color-accent)' }}>
                {config.defaultMode}
              </span>
            </div>
          </div>
        )}

        {/* Backup */}
        <div className="rounded-xl p-4"
             style={{
               backgroundColor: overdue ? 'var(--color-warning-bg)' : 'var(--color-surface)',
               border: `1px solid ${overdue ? 'var(--color-warning)' : 'var(--color-border)'}`,
             }}>
          <h3 className="font-bold mb-1" style={{ color: 'var(--color-text)' }}>
            Backup
          </h3>
          <p className="text-sm mb-3"
             style={{ color: 'var(--color-text-muted)' }}>
            {overdue
              ? 'Bokföringslagen requires 7-year retention. Export your kvittos somewhere safe.'
              : 'Export your kvittos as CSV + HTML.'}
          </p>
          <button type="button" onClick={runBackup}
                  className="px-4 py-2 rounded-lg text-sm font-semibold"
                  style={{
                    backgroundColor: 'var(--color-accent-soft)',
                    color: 'var(--color-accent)',
                    border: '1px solid var(--color-accent-dim)',
                  }}>
            Export kvittos
          </button>
          {backupStatus && (
            <p className="text-xs mt-2" style={{ color: 'var(--color-text-muted)' }}>
              {backupStatus}
            </p>
          )}
        </div>

        {/* About */}
        <div className="rounded-xl p-4 text-center"
             style={{
               backgroundColor: 'var(--color-surface)',
               border: '1px solid var(--color-border)',
             }}>
          <div className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            ANTON Business v0.0.1
          </div>
          <div className="text-xs mt-1" style={{ color: 'var(--color-text-faint)' }}>
            Phone-only · all data stored locally
          </div>
        </div>
      </div>

      <div className="p-6 mt-2">
        <PrimaryButton onClick={onBack} marginTopAuto={false}>
          Back to home
        </PrimaryButton>
      </div>
    </div>
  );
}
