/**
 * SettingsScreen — settings hub.
 *
 * Sections: Wallet · Appearance · Language · Storage · About ·
 * Danger zone. Appearance/Storage/Danger-zone mirror the Business
 * app's settings so the ANTON suite stays consistent.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ACCENTS, getAccent, setAccent, getMode, setMode,
  type AccentKey, type AppMode,
} from '../../services/personalization';
import { getLanguage, setLanguage } from '../../i18n';
import { LANGUAGES, languageOption } from '../../i18n/languages';
import { hasWallet, loadWallet, wipeWallet } from '../../services/wallet';
import { wipeProfile } from '../../services/profile';
import { wipeAllPayments } from '../../services/payment';
import { wipeReceived } from '../../services/db';
import { wipePayerIdentity } from '../../services/payment-identity';
import { wipeMoneyProfile } from '../../services/money-profile';
import { isAppLockEnabled, setAppLockEnabled } from '../../services/app-lock';
import { requireBiometric } from '../../services/biometric';

interface Props {
  onBack: () => void;
  onWallet: () => void;
  /** Multi-wallet management (list / switch / add / delete). */
  onWalletsList: () => void;
  onPaymentDetails: () => void;
  /** Settings → Friends (saved payment contacts). */
  onFriends: () => void;
  onMoneyProfile: () => void;
  onActivityReview: () => void;
  onRecoveryPhrase: () => void;
  onRestore: () => void;
  /** Settings → RPC endpoint switcher (point at a local FC node). */
  onRpcEndpoint: () => void;
  /** Settings → scheduled-payment reminders (Wave 5). */
  onSchedules: () => void;
  /** Settings → Wallet passphrase (opt-in second factor on signing). */
  onPassphrase: () => void;
  onReset: () => void;
}

const APP_VERSION = '0.0.1';
const BUILD_DATE = '2026-05-16';

export default function SettingsScreen({
  onBack, onWallet, onWalletsList, onPaymentDetails, onFriends, onMoneyProfile, onActivityReview,
  onRecoveryPhrase, onRestore, onRpcEndpoint, onSchedules, onPassphrase, onReset,
}: Props) {
  const { t } = useTranslation();
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [langPickerOpen, setLangPickerOpen] = useState(false);
  const [accent, setAccentState] = useState<AccentKey>(getAccent());
  const [mode, setModeState] = useState<AppMode>(getMode());
  const [storageText, setStorageText] = useState<string>('…');
  const [appLockOn, setAppLockOn] = useState<boolean>(isAppLockEnabled);
  const [appLockBusy, setAppLockBusy] = useState(false);

  /** Toggle the app-open lock — biometric-confirmed both ways. */
  async function toggleAppLock() {
    if (appLockBusy) return;
    setAppLockBusy(true);
    try {
      const r = await requireBiometric({
        reason: appLockOn
          ? t('settings.appLockDisableReason', 'Confirm to turn off the app lock')
          : t('settings.appLockEnableReason', 'Confirm to turn on the app lock'),
        title: t('lock.title', 'ANTON Pay'),
      });
      if (!r.ok && r.reason !== 'unavailable') return;
      const next = !appLockOn;
      setAppLockEnabled(next);
      setAppLockOn(next);
    } finally {
      setAppLockBusy(false);
    }
  }

  useEffect(() => {
    void (async () => {
      if (await hasWallet()) {
        const w = await loadWallet();
        setWalletAddress(w?.address ?? null);
      }
      try {
        if (navigator.storage?.estimate) {
          const est = await navigator.storage.estimate();
          setStorageText(formatBytes(est.usage ?? 0));
        } else {
          setStorageText(t('settings.storageUnknown'));
        }
      } catch {
        setStorageText(t('settings.storageUnknown'));
      }
    })();
  }, [t]);

  async function handleReset() {
    if (!confirm(t('settings.resetConfirm'))) return;
    await Promise.all([
      wipeWallet(), wipeProfile(), wipeAllPayments(), wipeReceived(),
      wipePayerIdentity(), wipeMoneyProfile(),
    ]);
    onReset();
  }

  const currentLang = languageOption(getLanguage());

  if (langPickerOpen) {
    return <LanguagePicker onClose={() => setLangPickerOpen(false)} />;
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto safe-top safe-bottom"
         style={{ backgroundColor: 'var(--color-bg)' }}>
      <div className="flex flex-col flex-1 px-6 pb-6">
        {/* Header */}
        <div className="flex items-center gap-3 -ml-2 mb-5">
          <button type="button" onClick={onBack} className="p-2 rounded-lg"
                  aria-label={t('common.back')} style={{ color: 'var(--color-text-muted)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <h2 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>
            {t('settings.title')}
          </h2>
        </div>

        <div className="flex flex-col gap-6">
          {/* ── Wallet & Security ─────────────────────────────────────────── */}
          <Section title={t('settings.sectionWalletSecurity', 'Wallet & Security')}>
            <NavCard onClick={onWallet}
                     title={t('settings.wallet')}
                     subtitle={walletAddress
                       ? `${walletAddress.slice(0, 12)}…${walletAddress.slice(-6)}`
                       : t('settings.walletConnected')}
                     subtitleMono />
            <NavCard onClick={onWalletsList}
                     title={t('settings.wallets', 'Wallets')}
                     subtitle={t('settings.walletsSub', 'Switch active wallet · add · delete')} />
            <NavCard onClick={onPassphrase}
                     title={t('settings.passphrase', 'Wallet passphrase')}
                     subtitle={t('settings.passphraseSub',
                       'Optional second factor — required on every send')} />
            {/* App-open biometric lock — toggles via biometric prompt. */}
            <button type="button" onClick={() => void toggleAppLock()} disabled={appLockBusy}
                    className="rounded-xl p-4 flex items-center justify-between text-left"
                    style={{ backgroundColor: 'var(--color-surface)',
                             border: '1px solid var(--color-border)' }}>
              <div className="flex-1 min-w-0 pr-3">
                <div className="font-bold" style={{ color: 'var(--color-text)' }}>
                  {t('settings.appLock', 'App lock')}
                </div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                  {t('settings.appLockSub', 'Require fingerprint or face to open the app')}
                </div>
              </div>
              <div style={{
                width: 44, height: 26, borderRadius: 13, flexShrink: 0,
                backgroundColor: appLockOn ? 'var(--color-accent)' : 'var(--color-surface-muted)',
                border: '1px solid var(--color-border)', position: 'relative',
                transition: 'background-color 0.15s', opacity: appLockBusy ? 0.6 : 1,
              }}>
                <div style={{
                  width: 20, height: 20, borderRadius: 10, backgroundColor: '#FFFFFF',
                  position: 'absolute', top: 2, left: appLockOn ? 22 : 2,
                  transition: 'left 0.15s', boxShadow: '0 1px 2px rgba(0,0,0,0.25)',
                }} />
              </div>
            </button>
            <NavCard onClick={onRecoveryPhrase}
                     title={t('settings.recoveryPhrase', 'Recovery phrase')}
                     subtitle={t('settings.recoveryPhraseSub', 'Show your 24-word backup phrase')} />
            <NavCard onClick={onRestore}
                     title={t('settings.restore', 'Restore wallet')}
                     subtitle={t('settings.restoreSub',
                       'Replace this device\'s wallet with one from a recovery phrase')} />
          </Section>

          {/* ── Payments ──────────────────────────────────────────────────── */}
          <Section title={t('settings.sectionPayments', 'Payments')}>
            <NavCard onClick={onPaymentDetails}
                     title={t('settings.paymentDetails')}
                     subtitle={t('settings.paymentDetailsSub')} />
            <NavCard onClick={onFriends}
                     title={t('settings.friends', 'Friends')}
                     subtitle={t('settings.friendsSub', 'Saved contacts you pay — names instead of addresses')} />
            <NavCard onClick={onMoneyProfile}
                     title={t('settings.moneyProfile')}
                     subtitle={t('settings.moneyProfileSub')} />
            <NavCard onClick={onSchedules}
                     title={t('settings.schedules', 'Scheduled payments')}
                     subtitle={t('settings.schedulesSub',
                       'Reminders for rent, subscriptions, bills')} />
            <NavCard onClick={onActivityReview}
                     title={t('settings.activityReview')}
                     subtitle={t('settings.activityReviewSub')} />
          </Section>

          {/* ── Network ───────────────────────────────────────────────────── */}
          <Section title={t('settings.sectionNetwork', 'Network')}>
            <NavCard onClick={onRpcEndpoint}
                     title={t('settings.rpcEndpoint', 'RPC endpoint')}
                     subtitle={t('settings.rpcEndpointSub',
                       'Which FutureChain node this app talks to')} />
          </Section>

          {/* ── Appearance & Language ─────────────────────────────────────── */}
          <Section title={t('settings.sectionAppearance', 'Appearance & Language')}>
            <div className="rounded-xl p-4"
                 style={{ backgroundColor: 'var(--color-surface)',
                          border: '1px solid var(--color-border)' }}>
              <h3 className="font-bold mb-1" style={{ color: 'var(--color-text)' }}>
                {t('settings.appearance')}
              </h3>
              <p className="text-xs mb-3" style={{ color: 'var(--color-text-muted)' }}>
                {t('settings.appearanceHelp')}
              </p>
              <div className="text-xs uppercase tracking-wider mb-2"
                   style={{ color: 'var(--color-text-faint)' }}>
                {t('settings.accent')}
              </div>
              <div className="grid grid-cols-4 gap-3">
                {ACCENTS.map((a) => (
                  <button key={a.id} type="button" aria-label={a.label}
                          onClick={() => { setAccent(a.id); setAccentState(a.id); }}
                          className="flex flex-col items-center gap-1">
                    <span className="w-10 h-10 rounded-full"
                          style={{ backgroundColor: a.hex,
                                   outline: accent === a.id
                                     ? '3px solid var(--color-text)'
                                     : '1px solid var(--color-border)',
                                   outlineOffset: '2px' }} />
                    <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                      {a.label}
                    </span>
                  </button>
                ))}
              </div>
              <div className="text-xs uppercase tracking-wider mt-4 mb-2"
                   style={{ color: 'var(--color-text-faint)' }}>
                {t('settings.mode')}
              </div>
              <div className="flex gap-2">
                {(['light', 'dark'] as AppMode[]).map((m) => (
                  <button key={m} type="button"
                          onClick={() => { setMode(m); setModeState(m); }}
                          className="flex-1 py-2.5 rounded-lg text-sm font-semibold"
                          style={mode === m
                            ? { backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-fg)' }
                            : { backgroundColor: 'var(--color-surface-muted)', color: 'var(--color-text-muted)' }}>
                    {m === 'light' ? t('settings.modeLight') : t('settings.modeDark')}
                  </button>
                ))}
              </div>
            </div>
            <NavCard onClick={() => setLangPickerOpen(true)}
                     title={t('settings.language')}
                     subtitle={currentLang?.native ?? 'English'} />
          </Section>

          {/* ── About ─────────────────────────────────────────────────────── */}
          <Section title={t('settings.sectionAbout', 'About')}>
            <div className="rounded-xl p-4"
                 style={{ backgroundColor: 'var(--color-surface)',
                          border: '1px solid var(--color-border)' }}>
              <div className="flex justify-between items-center py-0.5">
                <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                  {t('settings.storageUsed')}
                </span>
                <span className="mono text-sm" style={{ color: 'var(--color-text)' }}>
                  {storageText}
                </span>
              </div>
              <div className="flex justify-between items-center py-0.5">
                <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                  {t('settings.version')}
                </span>
                <span className="mono text-sm" style={{ color: 'var(--color-text)' }}>{APP_VERSION}</span>
              </div>
              <div className="flex justify-between items-center py-0.5">
                <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                  {t('settings.buildDate')}
                </span>
                <span className="mono text-sm" style={{ color: 'var(--color-text)' }}>{BUILD_DATE}</span>
              </div>
              <div className="text-xs mt-2 pt-2"
                   style={{ color: 'var(--color-text-faint)',
                            borderTop: '1px solid var(--color-border-soft)' }}>
                {t('settings.aboutPhoneOnly')}
              </div>
              {/* MiCA disclosure (Reg. (EU) 2023/1114). Self-custody
                  wallets are not themselves CASPs, but the hub the app
                  routes through (Bahnhof) IS — Annex IV §9 "transfer
                  service for crypto-assets". Show the authorisation
                  number when set; flag pending when not. */}
              <div className="text-[11px] mt-2 pt-2"
                   style={{ color: 'var(--color-text-faint)',
                            borderTop: '1px solid var(--color-border-soft)' }}>
                {t('settings.micaDisclosure',
                  'FTC settlement is routed through Bahnhof\'s public light-hub at rpc.futurechain.eu. Bahnhof operates this hub under Sweden Finansinspektionen (FI) authorisation pending publication; once issued, the CASP authorisation number will appear here.')}
              </div>
              <div className="text-[11px] mt-1"
                   style={{ color: 'var(--color-text-faint)' }}>
                {t('settings.travelRuleNote',
                  'Payments above €1000 require the EU Travel Rule (Reg. 2023/1113) originator info — your profile in Payment details supplies these fields.')}
              </div>
            </div>
          </Section>

          {/* ── Advanced (collapsed; reset hidden behind a deliberate expand) ── */}
          <details className="rounded-xl"
                   style={{ backgroundColor: 'var(--color-surface)',
                            border: '1px solid var(--color-border)' }}>
            <summary className="px-4 py-3 cursor-pointer select-none flex items-center justify-between"
                     style={{ color: 'var(--color-text-muted)' }}>
              <span className="text-sm font-medium">{t('settings.advanced', 'Advanced')}</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                   style={{ color: 'var(--color-text-dim)' }}>
                <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2"
                      strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </summary>
            <div className="px-4 pb-4 pt-1"
                 style={{ borderTop: '1px solid var(--color-border-soft)' }}>
              <h3 className="font-bold mt-3 mb-1" style={{ color: 'var(--color-error)' }}>
                {t('settings.dangerZone')}
              </h3>
              <p className="text-sm mb-3" style={{ color: 'var(--color-text-body)' }}>
                {t('settings.resetHelp')}
              </p>
              <button type="button" onClick={handleReset}
                      className="px-4 py-2 rounded-lg text-sm font-semibold"
                      style={{ backgroundColor: 'transparent',
                               color: 'var(--color-error)',
                               border: '1px solid var(--color-error)' }}>
                {t('settings.resetApp')}
              </button>
            </div>
          </details>
        </div>

        <div className="p-2 mt-3 text-center">
          <button type="button" onClick={onBack}
                  className="text-sm font-semibold" style={{ color: 'var(--color-accent)' }}>
            {t('settings.backToHome')}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Section wrapper — uppercase header above a stack of cards. */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-[11px] uppercase tracking-wider font-semibold px-1"
          style={{ color: 'var(--color-text-faint)' }}>
        {title}
      </h2>
      {children}
    </div>
  );
}

/** Reusable nav card — title + subtitle + chevron. Replaces the
 *  copy-pasted button block that was duplicated 11× in this file. */
function NavCard({ onClick, title, subtitle, subtitleMono }: {
  onClick: () => void;
  title: string;
  subtitle: string;
  subtitleMono?: boolean;
}) {
  return (
    <button type="button" onClick={onClick}
            className="rounded-xl p-4 flex items-center justify-between text-left"
            style={{ backgroundColor: 'var(--color-surface)',
                     border: '1px solid var(--color-border)' }}>
      <div className="flex-1 min-w-0 pr-3">
        <div className="font-bold" style={{ color: 'var(--color-text)' }}>{title}</div>
        <div className={`${subtitleMono ? 'mono ' : ''}text-xs mt-0.5`}
             style={{ color: 'var(--color-text-muted)' }}>
          {subtitle}
        </div>
      </div>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
           style={{ color: 'var(--color-text-dim)', flexShrink: 0 }}>
        <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
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
        <button type="button" onClick={onClose} className="p-2 rounded-lg"
                aria-label={t('common.back')} style={{ color: 'var(--color-text-muted)' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h2 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>
          {t('settings.languagePick')}
        </h2>
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
