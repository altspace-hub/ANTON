/**
 * SettingsScreen — main settings hub.
 *
 * v1 surface: Connect wallet, Backup, Language, About. Profile + Items
 * editing are accessible via re-onboarding for now; deeper Settings
 * sub-screens land in a follow-up.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import PrimaryButton from '../../components/PrimaryButton';
import { runBackupExport, isBackupOverdue } from '../../services/backup';
import { loadConfig } from '../../services/merchant';
import type { MerchantConfig } from '../../services/types';
import { hasWallet, loadWallet } from '../../services/wallet';
import { getLanguage, setLanguage } from '../../i18n';
import { LANGUAGES, languageOption } from '../../i18n/languages';

interface Props {
  onBack: () => void;
  onConnectWallet: () => void;
}

export default function SettingsScreen({ onBack, onConnectWallet }: Props) {
  const { t } = useTranslation();
  const [config, setConfig] = useState<MerchantConfig | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [backupStatus, setBackupStatus] = useState<string | null>(null);
  const [langPickerOpen, setLangPickerOpen] = useState(false);

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
    setBackupStatus(t('settings.backupRunning'));
    try {
      const result = await runBackupExport();
      setBackupStatus(t('settings.backupExported', { count: result.count, filename: result.filename }));
      await refresh();
    } catch (err) {
      setBackupStatus((err as Error).message);
    }
  }

  const overdue = isBackupOverdue(config);
  const currentLang = languageOption(getLanguage());

  if (langPickerOpen) {
    return <LanguagePicker onClose={() => setLangPickerOpen(false)} />;
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto safe-top safe-bottom"
         style={{ backgroundColor: 'var(--color-bg)' }}>
      <div className="p-6 pb-3 flex items-center gap-3 -ml-2">
        <button type="button" onClick={onBack} className="p-2 rounded-lg" aria-label={t('common.back')}
                style={{ color: 'var(--color-text-muted)' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h2 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>{t('settings.title')}</h2>
      </div>

      <div className="px-6 flex flex-col gap-3">
        {/* Wallet section */}
        <div className="rounded-xl p-4"
             style={{
               backgroundColor: 'var(--color-surface)',
               border: '1px solid var(--color-border)',
             }}>
          <div className="flex justify-between items-start mb-2">
            <h3 className="font-bold" style={{ color: 'var(--color-text)' }}>{t('settings.wallet')}</h3>
            <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded"
                  style={{
                    backgroundColor: walletAddress ? 'var(--color-success-bg)' : 'var(--color-warning-bg)',
                    color: walletAddress ? 'var(--color-success)' : 'var(--color-warning)',
                  }}>
              {walletAddress ? t('settings.connected') : t('settings.notConnected')}
            </span>
          </div>
          {walletAddress ? (
            <>
              <div className="text-xs uppercase tracking-wider mb-1"
                   style={{ color: 'var(--color-text-faint)' }}>
                {t('settings.address')}
              </div>
              <div className="mono text-[11px] break-all"
                   style={{ color: 'var(--color-accent)' }}>
                {walletAddress}
              </div>
            </>
          ) : (
            <>
              <p className="text-sm mb-3" style={{ color: 'var(--color-text-muted)' }}>
                {t('settings.generateWalletHint')}
              </p>
              <button type="button" onClick={onConnectWallet}
                      className="px-4 py-2 rounded-lg text-sm font-semibold"
                      style={{
                        backgroundColor: 'var(--color-accent)',
                        color: 'var(--color-accent-fg)',
                      }}>
                {t('settings.connectWallet')}
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
            <h3 className="font-bold mb-2" style={{ color: 'var(--color-text)' }}>{t('settings.business')}</h3>
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
              {t('settings.defaultMode')} <span className="font-semibold"
                                  style={{ color: 'var(--color-accent)' }}>
                {t(config.defaultMode === 'simple' ? 'mode.simpleTitle' : 'mode.extendedTitle')}
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
            {t('settings.backup')}
          </h3>
          <p className="text-sm mb-3"
             style={{ color: 'var(--color-text-muted)' }}>
            {overdue ? t('settings.backupOverdue') : t('settings.backupNormal')}
          </p>
          <button type="button" onClick={runBackup}
                  className="px-4 py-2 rounded-lg text-sm font-semibold"
                  style={{
                    backgroundColor: 'var(--color-accent-soft)',
                    color: 'var(--color-accent)',
                    border: '1px solid var(--color-accent-dim)',
                  }}>
            {t('settings.exportKvittos')}
          </button>
          {backupStatus && (
            <p className="text-xs mt-2" style={{ color: 'var(--color-text-muted)' }}>
              {backupStatus}
            </p>
          )}
        </div>

        {/* Language */}
        <button type="button" onClick={() => setLangPickerOpen(true)}
                className="rounded-xl p-4 flex justify-between items-center text-left"
                style={{
                  backgroundColor: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                }}>
          <div>
            <h3 className="font-bold" style={{ color: 'var(--color-text)' }}>{t('settings.language')}</h3>
            <div className="text-sm mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
              {currentLang?.native ?? 'English'}
            </div>
          </div>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
               style={{ color: 'var(--color-text-faint)' }}>
            <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {/* About */}
        <div className="rounded-xl p-4 text-center"
             style={{
               backgroundColor: 'var(--color-surface)',
               border: '1px solid var(--color-border)',
             }}>
          <div className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            {t('settings.about')}
          </div>
          <div className="text-xs mt-1" style={{ color: 'var(--color-text-faint)' }}>
            {t('settings.aboutPhoneOnly')}
          </div>
        </div>
      </div>

      <div className="p-6 mt-2">
        <PrimaryButton onClick={onBack} marginTopAuto={false}>
          {t('settings.backToHome')}
        </PrimaryButton>
      </div>
    </div>
  );
}

/** Full-screen language list. en + sv ship complete catalogues; the
 *  rest fall back to English transparently via i18next fallbackLng. */
function LanguagePicker({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const active = getLanguage();

  function pick(code: string) {
    setLanguage(code);
    onClose();
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto safe-top safe-bottom"
         style={{ backgroundColor: 'var(--color-bg)' }}>
      <div className="p-6 pb-3 flex items-center gap-3 -ml-2">
        <button type="button" onClick={onClose} className="p-2 rounded-lg" aria-label={t('common.back')}
                style={{ color: 'var(--color-text-muted)' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h2 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>{t('settings.languagePick')}</h2>
      </div>

      <div className="px-6 pb-6 flex flex-col gap-1.5">
        {LANGUAGES.map((lang) => {
          const selected = lang.code === active;
          return (
            <button
              key={lang.code}
              type="button"
              onClick={() => pick(lang.code)}
              className="flex justify-between items-center p-3.5 rounded-xl text-left"
              style={{
                backgroundColor: selected ? 'var(--color-accent-soft)' : 'var(--color-surface)',
                border: `1px solid ${selected ? 'var(--color-accent)' : 'var(--color-border)'}`,
              }}
            >
              <div>
                <div className="font-semibold"
                     style={{ color: selected ? 'var(--color-accent)' : 'var(--color-text)' }}>
                  {lang.native}
                </div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-faint)' }}>
                  {lang.english}
                </div>
              </div>
              {selected && (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                     style={{ color: 'var(--color-accent)' }}>
                  <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.4"
                        strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
