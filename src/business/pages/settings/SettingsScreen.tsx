/**
 * SettingsScreen — main settings hub.
 *
 * Sections: Wallet · Business · Appearance · Backup · Language ·
 * Storage · About · Danger zone. Appearance/Storage/Danger-zone are
 * ported from the Comm App's settings; the rest are Business-native.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import PrimaryButton from '../../components/PrimaryButton';
import { runBackupExport, isBackupOverdue } from '../../services/backup';
import { loadConfig, wipeConfig } from '../../services/merchant';
import type { MerchantConfig } from '../../services/types';
import { hasWallet, loadWallet, wipeWallet } from '../../services/wallet';
import { wipeReceipts } from '../../services/db';
import { wipeItems } from '../../services/items';
import { wipeStockMovements } from '../../services/inventory';
import { isPinSet } from '../../services/pin';
import PinPad from '../../components/PinPad';
import { isAppLockEnabled, setAppLockEnabled } from '../../services/app-lock';
import { requireBiometric } from '../../services/biometric';
import { getLanguage, setLanguage } from '../../i18n';
import { LANGUAGES, languageOption } from '../../i18n/languages';
import {
  ACCENTS, getAccent, setAccent, getMode, setMode,
  type AccentKey, type AppMode,
} from '../../services/personalization';

interface Props {
  onBack: () => void;
  onConnectWallet: () => void;
  onShowRecovery: () => void;
  onBackupPhrase: () => void;
  /** Multi-wallet management — list / switch / add / delete. */
  onWalletsList: () => void;
  /** Settings → switch which FutureChain hub this app talks to. */
  onRpcEndpoint: () => void;
  /** Settings → daily close (Z-rapport + SIE 4 export). */
  onDayClose: () => void;
  /** Settings → merchant PIN (gates void / refund / day-close). */
  onPin: () => void;
  /** Settings → items management (CRUD + template loader). */
  onItems: () => void;
  /** Settings → saved customer contacts (FC address book). */
  onCustomers: () => void;
  onReset: () => void;
}

const APP_VERSION = '0.0.1';
const BUILD_DATE = '2026-05-16';

export default function SettingsScreen({
  onBack, onConnectWallet, onShowRecovery, onBackupPhrase, onWalletsList, onRpcEndpoint, onDayClose, onPin, onItems, onCustomers, onReset,
}: Props) {
  const { t } = useTranslation();
  const [config, setConfig] = useState<MerchantConfig | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [backupStatus, setBackupStatus] = useState<string | null>(null);
  const [langPickerOpen, setLangPickerOpen] = useState(false);
  const [accent, setAccentState] = useState<AccentKey>(getAccent());
  const [mode, setModeState] = useState<AppMode>(getMode());
  /** Reset is two-step + PIN-gated so it can't be triggered by a stray
   *  tap. `resetArmed` = the first tap revealed the confirm panel;
   *  `showResetPin` = the merchant PIN check is up. */
  const [resetArmed, setResetArmed] = useState(false);
  const [showResetPin, setShowResetPin] = useState(false);
  /** App-open biometric lock toggle. */
  const [appLockOn, setAppLockOn] = useState<boolean>(isAppLockEnabled);
  const [appLockBusy, setAppLockBusy] = useState(false);
  const [storageText, setStorageText] = useState<string>('…');

  useEffect(() => {
    refresh();
    void (async () => {
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

  /**
   * Reset is deliberately hard to trigger by accident:
   *   1. Tap "Reset app" — only *arms* the danger zone (reveals the
   *      confirm panel). Nothing is wiped.
   *   2. Tap "Erase everything" — if a merchant PIN is set, the PIN
   *      pad must be cleared first; otherwise the OS confirm() dialog.
   *   3. Only then is every store wiped.
   */
  async function attemptReset() {
    if (await isPinSet()) {
      setShowResetPin(true);
    } else {
      // No PIN configured — fall back to the OS confirm dialog as the
      // final gate (still behind the in-UI arming step).
      if (!confirm(t('settings.resetConfirm'))) return;
      await doReset();
    }
  }

  /**
   * Toggle the app-open lock. Turning it ON runs a biometric check
   * first — there's no point enabling a lock the merchant can't pass,
   * and it confirms the device actually has biometrics / a device
   * lock. Turning it OFF also requires a successful check so someone
   * who grabbed an unlocked phone can't quietly disable it.
   */
  async function toggleAppLock() {
    if (appLockBusy) return;
    setAppLockBusy(true);
    try {
      const r = await requireBiometric({
        reason: appLockOn
          ? t('settings.appLockDisableReason', 'Confirm to turn off the app lock')
          : t('settings.appLockEnableReason', 'Confirm to turn on the app lock'),
        title: t('lock.title', 'ANTON Business'),
      });
      // unavailable → the device has no biometric/credential; allow the
      // toggle either way (a lock here would be unenforceable anyway).
      if (!r.ok && r.reason !== 'unavailable') return;
      const next = !appLockOn;
      setAppLockEnabled(next);
      setAppLockOn(next);
    } finally {
      setAppLockBusy(false);
    }
  }

  async function doReset() {
    await Promise.all([wipeConfig(), wipeWallet(), wipeReceipts(), wipeItems(), wipeStockMovements()]);
    onReset();
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

      <div className="px-6 flex flex-col gap-6">
        {/* ── Wallet & Security ──────────────────────────────────────────── */}
        <Section title={t('settings.sectionWalletSecurity', 'Wallet & Security')}>
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
              <div className="mono text-[11px] break-all mb-3"
                   style={{ color: 'var(--color-accent)' }}>
                {walletAddress}
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={onBackupPhrase}
                        className="px-3 py-2 rounded-lg text-xs font-semibold"
                        style={{
                          backgroundColor: 'var(--color-accent)',
                          color: 'var(--color-accent-fg)',
                        }}>
                  {t('settings.backupPhrase', 'Back up recovery phrase')}
                </button>
                <button type="button" onClick={onShowRecovery}
                        className="px-3 py-2 rounded-lg text-xs font-semibold"
                        style={{
                          backgroundColor: 'transparent',
                          color: 'var(--color-accent)',
                          border: '1px solid var(--color-border)',
                        }}>
                  {t('settings.showRecovery', 'Show recovery phrase')}
                </button>
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

        {/* Wallets — multi-wallet management. Independent rounded
            card so it sits between the legacy wallet block above and
            the merchant-identity block below. */}
        <button type="button" onClick={onWalletsList}
                className="rounded-xl p-4 flex items-center justify-between text-left"
                style={{ backgroundColor: 'var(--color-surface)',
                         border: '1px solid var(--color-border)' }}>
          <div>
            <div className="font-bold" style={{ color: 'var(--color-text)' }}>
              {t('settings.wallets', 'Wallets')}
            </div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
              {t('settings.walletsSub', 'Switch active wallet · add · delete')}
            </div>
          </div>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
               style={{ color: 'var(--color-text-dim)' }}>
            <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {/* Merchant PIN — gates void / refund / day-close. */}
        <button type="button" onClick={onPin}
                className="rounded-xl p-4 flex items-center justify-between text-left"
                style={{ backgroundColor: 'var(--color-surface)',
                         border: '1px solid var(--color-border)' }}>
          <div>
            <div className="font-bold" style={{ color: 'var(--color-text)' }}>
              {t('settings.pin', 'Merchant PIN')}
            </div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
              {t('settings.pinSub', 'Gate void · refund · day-close')}
            </div>
          </div>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
               style={{ color: 'var(--color-text-dim)' }}>
            <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {/* App-open lock — biometric gate every time the app opens. */}
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
          {/* Inline switch */}
          <div style={{
            width: 44, height: 26, borderRadius: 13, flexShrink: 0,
            backgroundColor: appLockOn ? 'var(--color-accent)' : 'var(--color-surface-muted)',
            border: '1px solid var(--color-border)',
            position: 'relative', transition: 'background-color 0.15s',
            opacity: appLockBusy ? 0.6 : 1,
          }}>
            <div style={{
              width: 20, height: 20, borderRadius: 10, backgroundColor: '#FFFFFF',
              position: 'absolute', top: 2, left: appLockOn ? 22 : 2,
              transition: 'left 0.15s',
              boxShadow: '0 1px 2px rgba(0,0,0,0.25)',
            }} />
          </div>
        </button>

        </Section>

        {/* ── Business ───────────────────────────────────────────────────── */}
        <Section title={t('settings.sectionBusiness', 'Business')}>
        {/* Items management — catalogue CRUD + industry-template loader. */}
        <button type="button" onClick={onItems}
                className="rounded-xl p-4 flex items-center justify-between text-left"
                style={{ backgroundColor: 'var(--color-surface)',
                         border: '1px solid var(--color-border)' }}>
          <div>
            <div className="font-bold" style={{ color: 'var(--color-text)' }}>
              {t('settings.items', 'Items')}
            </div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
              {t('settings.itemsSub', 'What you sell · prices · templates for 40 industries')}
            </div>
          </div>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
               style={{ color: 'var(--color-text-dim)' }}>
            <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {/* Customers — saved FC payment contacts (address book). */}
        <button type="button" onClick={onCustomers}
                className="rounded-xl p-4 flex items-center justify-between text-left"
                style={{ backgroundColor: 'var(--color-surface)',
                         border: '1px solid var(--color-border)' }}>
          <div>
            <div className="font-bold" style={{ color: 'var(--color-text)' }}>
              {t('settings.customers', 'Customers')}
            </div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
              {t('settings.customersSub', 'Saved customer addresses · look-alike scam protection')}
            </div>
          </div>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
               style={{ color: 'var(--color-text-dim)' }}>
            <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {/* Day close — Z-rapport + SIE 4 export. */}
        <button type="button" onClick={onDayClose}
                className="rounded-xl p-4 flex items-center justify-between text-left"
                style={{ backgroundColor: 'var(--color-surface)',
                         border: '1px solid var(--color-border)' }}>
          <div>
            <div className="font-bold" style={{ color: 'var(--color-text)' }}>
              {t('settings.dayClose', 'Day close')}
            </div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
              {t('settings.dayCloseSub', 'Z-rapport · SIE 4 export to bookkeeping')}
            </div>
          </div>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
               style={{ color: 'var(--color-text-dim)' }}>
            <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        </Section>

        {/* ── Network ────────────────────────────────────────────────────── */}
        <Section title={t('settings.sectionNetwork', 'Network')}>
        {/* RPC endpoint switch. */}
        <button type="button" onClick={onRpcEndpoint}
                className="rounded-xl p-4 flex items-center justify-between text-left"
                style={{ backgroundColor: 'var(--color-surface)',
                         border: '1px solid var(--color-border)' }}>
          <div>
            <div className="font-bold" style={{ color: 'var(--color-text)' }}>
              {t('settings.rpcEndpoint', 'RPC endpoint')}
            </div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
              {t('settings.rpcEndpointSub', 'Which FutureChain node this app talks to')}
            </div>
          </div>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
               style={{ color: 'var(--color-text-dim)' }}>
            <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        </Section>

        {/* Business identity — back in the Business section. */}
        <Section title={t('settings.sectionIdentity', 'Identity')}>
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

        </Section>

        {/* ── Backup ─────────────────────────────────────────────────────── */}
        {/* (kept as its own visible section because overdue tinting matters
             — see surroundings; the backup card is below.) */}

        {/* ── Appearance & Language ──────────────────────────────────────── */}
        <Section title={t('settings.sectionAppearance', 'Appearance & Language')}>
        {/* Appearance */}
        <div className="rounded-xl p-4"
             style={{
               backgroundColor: 'var(--color-surface)',
               border: '1px solid var(--color-border)',
             }}>
          <h3 className="font-bold mb-1" style={{ color: 'var(--color-text)' }}>{t('settings.appearance')}</h3>
          <p className="text-xs mb-3" style={{ color: 'var(--color-text-muted)' }}>
            {t('settings.appearanceHelp')}
          </p>
          <div className="text-xs uppercase tracking-wider mb-2"
               style={{ color: 'var(--color-text-faint)' }}>
            {t('settings.accent')}
          </div>
          <div className="grid grid-cols-4 gap-3">
            {ACCENTS.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => { setAccent(a.id); setAccentState(a.id); }}
                aria-label={a.label}
                className="flex flex-col items-center gap-1"
              >
                <span
                  className="w-10 h-10 rounded-full"
                  style={{
                    backgroundColor: a.hex,
                    outline: accent === a.id
                      ? '3px solid var(--color-text)'
                      : '1px solid var(--color-border)',
                    outlineOffset: '2px',
                  }}
                />
                <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>{a.label}</span>
              </button>
            ))}
          </div>
          <div className="text-xs uppercase tracking-wider mt-4 mb-2"
               style={{ color: 'var(--color-text-faint)' }}>
            {t('settings.mode')}
          </div>
          <div className="flex gap-2">
            {(['light', 'dark'] as AppMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => { setMode(m); setModeState(m); }}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold"
                style={mode === m
                  ? { backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-fg)' }
                  : { backgroundColor: 'var(--color-surface-muted)', color: 'var(--color-text-muted)' }}
              >
                {m === 'light' ? t('settings.modeLight') : t('settings.modeDark')}
              </button>
            ))}
          </div>
        </div>

        </Section>

        {/* ── Backup (moved up; overdue tinting needs prominence) ──────── */}
        <Section title={t('settings.sectionBackup', 'Backup')}>
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

        </Section>

        {/* ── Language (separate from Appearance — bigger surface) ────── */}
        <Section title={t('settings.sectionLanguage', 'Language')}>
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

        </Section>

        {/* ── About ──────────────────────────────────────────────────────── */}
        <Section title={t('settings.sectionAbout', 'About')}>
        {/* Storage */}
        <div className="rounded-xl p-4"
             style={{
               backgroundColor: 'var(--color-surface)',
               border: '1px solid var(--color-border)',
             }}>
          <h3 className="font-bold mb-1" style={{ color: 'var(--color-text)' }}>{t('settings.storage')}</h3>
          <div className="flex justify-between items-center mt-1">
            <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
              {t('settings.storageUsed')}
            </span>
            <span className="mono text-sm" style={{ color: 'var(--color-text)' }}>{storageText}</span>
          </div>
        </div>

        {/* About */}
        <div className="rounded-xl p-4"
             style={{
               backgroundColor: 'var(--color-surface)',
               border: '1px solid var(--color-border)',
             }}>
          <h3 className="font-bold mb-2" style={{ color: 'var(--color-text)' }}>{t('settings.aboutTitle')}</h3>
          <div className="flex justify-between items-center py-0.5">
            <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>{t('settings.version')}</span>
            <span className="mono text-sm" style={{ color: 'var(--color-text)' }}>{APP_VERSION}</span>
          </div>
          <div className="flex justify-between items-center py-0.5">
            <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>{t('settings.buildDate')}</span>
            <span className="mono text-sm" style={{ color: 'var(--color-text)' }}>{BUILD_DATE}</span>
          </div>
          <div className="text-xs mt-2 pt-2"
               style={{
                 color: 'var(--color-text-faint)',
                 borderTop: '1px solid var(--color-border-soft)',
               }}>
            {t('settings.aboutPhoneOnly')}
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
            <h3 className="font-bold mt-3 mb-1" style={{ color: 'var(--color-error)' }}>{t('settings.dangerZone')}</h3>
            <p className="text-sm mb-3" style={{ color: 'var(--color-text-body)' }}>
              {t('settings.resetHelp')}
            </p>
            {!resetArmed ? (
              <button type="button" onClick={() => setResetArmed(true)}
                      className="px-4 py-2 rounded-lg text-sm font-semibold"
                      style={{
                        backgroundColor: 'transparent',
                        color: 'var(--color-error)',
                        border: '1px solid var(--color-error)',
                      }}>
                {t('settings.resetApp')}
              </button>
            ) : (
              <div>
                <p className="text-sm font-semibold mb-2" style={{ color: 'var(--color-error)' }}>
                  {t('settings.resetArmedWarning',
                    'This permanently erases your profile, items, wallet, kvittos and stock. It cannot be undone.')}
                </p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setResetArmed(false)}
                          className="flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold"
                          style={{
                            backgroundColor: 'var(--color-surface)',
                            color: 'var(--color-text)',
                            border: '1px solid var(--color-border)',
                          }}>
                    {t('common.cancel', 'Cancel')}
                  </button>
                  <button type="button" onClick={() => void attemptReset()}
                          className="flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold"
                          style={{
                            backgroundColor: 'var(--color-error)',
                            color: '#FFFFFF',
                          }}>
                    {t('settings.resetConfirmBtn', 'Erase everything')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </details>
      </div>

      {/* Merchant-PIN gate on reset — the final step when a PIN is set. */}
      <PinPad open={showResetPin} mode="verify"
              title={t('settings.resetPinTitle', 'Confirm reset with merchant PIN')}
              onCancel={() => setShowResetPin(false)}
              onConfirm={async () => {
                setShowResetPin(false);
                await doReset();
              }} />

      <div className="p-6 mt-2">
        <PrimaryButton onClick={onBack} marginTopAuto={false}>
          {t('settings.backToHome')}
        </PrimaryButton>
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
