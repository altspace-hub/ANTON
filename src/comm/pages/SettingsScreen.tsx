/**
 * SettingsScreen — the Comm App's settings hub.
 *
 * Replaces the old ProfileScreen. Sectioned layout:
 *   Profile · Appearance · Language · Privacy · Notifications ·
 *   Storage · About · Danger zone
 *
 * All copy goes through i18next (`t()`), so the whole screen
 * re-renders in the chosen language the instant it changes.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getIdentity, updateDisplayName, clearIdentity, type CommIdentity } from '../services/identity';
import {
  getReadReceiptsEnabled, setReadReceiptsEnabled,
  getTypingIndicatorEnabled, setTypingIndicatorEnabled,
  getNotificationChannelEnabled, setNotificationChannelEnabled,
  type NotificationChannel,
} from '../services/settings';
import {
  ACCENTS, getAccent, setAccent, getMode, setMode,
  type AccentKey, type AppMode,
} from '../services/personalization';
import { LANGUAGES, COMPLETE_LOCALES } from '../i18n/languages';
import { getLanguage, setLanguage } from '../i18n';
import { openDb, STORE_PORTAL_CACHE } from '../services/db';

interface Props {
  onBack: () => void;
  onSignedOut: () => void;
  /** Open the ISO 20022 payer-identity form. */
  onPaymentDetails: () => void;
  /** Open the self-declared money-profile form. */
  onMoneyProfile: () => void;
}

const APP_VERSION = '0.7.5';
const BUILD_DATE = '2026-05-15';

export default function SettingsScreen({ onBack, onSignedOut, onPaymentDetails, onMoneyProfile }: Props) {
  const { t } = useTranslation();
  const [identity, setIdentity] = useState<CommIdentity | null>(getIdentity());
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(identity?.displayName ?? '');
  const [copied, setCopied] = useState(false);

  const [readReceipts, setReadReceipts] = useState(getReadReceiptsEnabled());
  const [typingIndicator, setTypingIndicator] = useState(getTypingIndicatorEnabled());
  const [accent, setAccentState] = useState<AccentKey>(getAccent());
  const [mode, setModeState] = useState<AppMode>(getMode());
  const [language, setLanguageState] = useState<string>(getLanguage());
  const [langOpen, setLangOpen] = useState(false);

  const [notifPerm, setNotifPerm] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default',
  );
  const [channels, setChannels] = useState<Record<NotificationChannel, boolean>>({
    dms: getNotificationChannelEnabled('dms'),
    events: getNotificationChannelEnabled('events'),
    portals: getNotificationChannelEnabled('portals'),
  });

  const [storageText, setStorageText] = useState<string>(t('common.loading'));
  const [cacheStatus, setCacheStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!identity) return;
    let cancelled = false;
    const sharePayload = JSON.stringify({
      v: 1, t: 'anton-comm-contact',
      hash: identity.contactHash, name: identity.displayName, pub: identity.publicKeyHex,
    });
    void (async () => {
      try {
        const { default: QRCode } = await import('qrcode');
        if (cancelled) return;
        const url = await QRCode.toDataURL(sharePayload, {
          errorCorrectionLevel: 'M', margin: 1, width: 280,
          color: { dark: '#1A1B2E', light: '#FFFFFF' },
        });
        if (!cancelled) setQrDataUrl(url);
      } catch {
        if (!cancelled) setQrDataUrl(null);
      }
    })();
    return () => { cancelled = true; };
  }, [identity]);

  useEffect(() => {
    void (async () => {
      try {
        if (navigator.storage?.estimate) {
          const est = await navigator.storage.estimate();
          const used = est.usage ?? 0;
          setStorageText(formatBytes(used));
        } else {
          setStorageText(t('settings.storageUnknown'));
        }
      } catch {
        setStorageText(t('settings.storageUnknown'));
      }
    })();
  }, [t]);

  if (!identity) {
    return (
      <section className="px-5 pt-6 pb-4">
        <p className="text-sm text-[var(--color-text-muted)]">{t('common.loading')}</p>
      </section>
    );
  }

  async function handleCopy() {
    if (!identity) return;
    try {
      await navigator.clipboard.writeText(identity.contactHash);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard unavailable */ }
  }

  function handleSaveName() {
    const trimmed = draftName.trim();
    if (trimmed.length === 0) return;
    const next = updateDisplayName(trimmed);
    if (next) setIdentity(next);
    setEditing(false);
  }

  async function handleSignOut() {
    if (!confirm(t('settings.deleteConfirm'))) return;
    await clearIdentity();
    onSignedOut();
  }

  async function requestNotifications() {
    if (typeof Notification === 'undefined') return;
    try {
      const result = await Notification.requestPermission();
      setNotifPerm(result);
    } catch { /* ignore */ }
  }

  function toggleChannel(channel: NotificationChannel) {
    const next = !channels[channel];
    setNotificationChannelEnabled(channel, next);
    setChannels((c) => ({ ...c, [channel]: next }));
  }

  async function handleClearCache() {
    try {
      const db = await openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_PORTAL_CACHE, 'readwrite');
        tx.objectStore(STORE_PORTAL_CACHE).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      setCacheStatus(t('settings.cacheCleared'));
    } catch {
      setCacheStatus(t('settings.storageUnknown'));
    }
  }

  return (
    <section className="px-5 pt-6 pb-12">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="text-sm text-[var(--color-text-muted)]">
          ← {t('common.back')}
        </button>
        <h1 className="text-base font-semibold text-[var(--color-text)]">
          {t('settings.title')}
        </h1>
        <span className="w-10" />
      </div>

      {/* ── Profile ─────────────────────────────────────────── */}
      <SectionHeader label={t('settings.sectionProfile')} />
      <div className="mt-2 flex flex-col items-center">
        <div
          className="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-semibold"
          style={{ backgroundColor: 'var(--color-accent-dim)', color: 'var(--color-accent-dark)' }}
        >
          {identity.displayName.slice(0, 1).toUpperCase()}
        </div>
        {editing ? (
          <div className="mt-3 w-full max-w-xs">
            <input
              type="text" value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              maxLength={64} autoFocus
              className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-center text-base text-[var(--color-text)]"
              onKeyDown={(e) => { if (e.key === 'Enter') handleSaveName(); }}
            />
            <div className="mt-2 flex gap-2 justify-center">
              <button onClick={() => { setEditing(false); setDraftName(identity.displayName); }}
                      className="px-3 py-1.5 text-xs text-[var(--color-text-muted)]">
                {t('common.cancel')}
              </button>
              <button onClick={handleSaveName}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium"
                      style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-fg)' }}>
                {t('common.save')}
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setEditing(true)}
                  className="mt-3 text-lg font-semibold text-[var(--color-text)]">
            {identity.displayName}
          </button>
        )}
      </div>

      <Card>
        <div className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-faint)]">
          {t('settings.contactCode')}
        </div>
        <button onClick={() => void handleCopy()}
                className="mt-2 text-base font-mono text-[var(--color-text)] tracking-wider block w-full text-left break-all">
          {identity.contactHash}
        </button>
        <div className="mt-1 text-xs text-[var(--color-text-muted)]">
          {copied ? t('settings.copiedToClipboard') : t('settings.tapToCopy')}
        </div>
      </Card>

      <Card>
        <div className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-faint)]">
          {t('settings.shareCode')}
        </div>
        <div className="mt-1 text-sm text-[var(--color-text-muted)]">
          {t('settings.shareCodeHelp')}
        </div>
        <div className="mt-3 flex justify-center">
          {qrDataUrl ? (
            <img src={qrDataUrl} alt={t('settings.shareCode')} className="w-56 h-56 rounded-xl" />
          ) : (
            <div className="w-56 h-56 rounded-xl bg-[var(--color-surface-muted)] flex items-center justify-center text-xs text-[var(--color-text-faint)]">
              {t('settings.generatingQr')}
            </div>
          )}
        </div>
      </Card>

      <button
        onClick={onPaymentDetails}
        className="mt-2 w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border border-[var(--color-border-soft)] bg-[var(--color-surface)] text-left active:bg-[var(--color-surface-muted)]"
      >
        <div className="flex-1 min-w-0">
          <div className="text-[14px] font-medium text-[var(--color-text)]">
            {t('settings.paymentDetails')}
          </div>
          <div className="text-[11px] text-[var(--color-text-muted)] leading-snug mt-0.5">
            {t('settings.paymentDetailsSub')}
          </div>
        </div>
        <span className="text-[var(--color-text-faint)]" aria-hidden>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>

      <button
        onClick={onMoneyProfile}
        className="mt-2 w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border border-[var(--color-border-soft)] bg-[var(--color-surface)] text-left active:bg-[var(--color-surface-muted)]"
      >
        <div className="flex-1 min-w-0">
          <div className="text-[14px] font-medium text-[var(--color-text)]">
            {t('settings.moneyProfile')}
          </div>
          <div className="text-[11px] text-[var(--color-text-muted)] leading-snug mt-0.5">
            {t('settings.moneyProfileSub')}
          </div>
        </div>
        <span className="text-[var(--color-text-faint)]" aria-hidden>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>

      {/* ── Appearance ──────────────────────────────────────── */}
      <SectionHeader label={t('settings.sectionAppearance')} />
      <Card>
        <p className="text-xs text-[var(--color-text-muted)] leading-snug">
          {t('settings.appearanceHelp')}
        </p>
        <div className="mt-3 text-xs font-medium uppercase tracking-wide text-[var(--color-text-faint)]">
          {t('settings.accent')}
        </div>
        <div className="mt-2 grid grid-cols-4 gap-3">
          {ACCENTS.map((a) => (
            <button
              key={a.id}
              onClick={() => { setAccent(a.id); setAccentState(a.id); }}
              aria-label={a.label}
              className="flex flex-col items-center gap-1"
            >
              <span
                className="w-11 h-11 rounded-full"
                style={{
                  backgroundColor: a.hex,
                  outline: accent === a.id ? '3px solid var(--color-text)' : '1px solid var(--color-border)',
                  outlineOffset: '2px',
                }}
              />
              <span className="text-[10px] text-[var(--color-text-muted)]">{a.label}</span>
            </button>
          ))}
        </div>
        <div className="mt-4 text-xs font-medium uppercase tracking-wide text-[var(--color-text-faint)]">
          {t('settings.mode')}
        </div>
        <div className="mt-2 flex gap-2">
          {(['light', 'dark'] as AppMode[]).map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); setModeState(m); }}
              className="flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors"
              style={mode === m
                ? { backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-fg)' }
                : { backgroundColor: 'var(--color-surface-muted)', color: 'var(--color-text-muted)' }}
            >
              {m === 'light' ? t('settings.modeLight') : t('settings.modeDark')}
            </button>
          ))}
        </div>
      </Card>

      {/* ── Language ────────────────────────────────────────── */}
      <SectionHeader label={t('settings.sectionLanguage')} />
      <Card>
        <p className="text-xs text-[var(--color-text-muted)] leading-snug">
          {t('settings.languageHelp')}
        </p>
        <button
          onClick={() => setLangOpen((o) => !o)}
          className="mt-3 w-full flex items-center justify-between py-2"
        >
          <span className="text-sm font-medium text-[var(--color-text)]">
            {LANGUAGES.find((l) => l.code === language)?.native ?? language}
          </span>
          <span className="text-xs text-[var(--color-accent)]">
            {langOpen ? t('common.close') : t('common.change')}
          </span>
        </button>
        {langOpen && (
          <div className="mt-1 max-h-72 overflow-y-auto -mx-1">
            {LANGUAGES.map((l) => (
              <button
                key={l.code}
                onClick={() => {
                  setLanguage(l.code);
                  setLanguageState(l.code);
                  setLangOpen(false);
                }}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left active:bg-[var(--color-surface-muted)]"
              >
                <span>
                  <span className="text-sm text-[var(--color-text)]">{l.native}</span>
                  <span className="ml-2 text-[11px] text-[var(--color-text-faint)]">{l.english}</span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-[10px] uppercase tracking-wide"
                        style={{ color: COMPLETE_LOCALES.has(l.code)
                          ? 'var(--color-green)' : 'var(--color-text-faint)' }}>
                    {COMPLETE_LOCALES.has(l.code)
                      ? t('settings.languageComplete')
                      : t('settings.languagePartial')}
                  </span>
                  {language === l.code && (
                    <span className="text-[var(--color-accent)]">●</span>
                  )}
                </span>
              </button>
            ))}
          </div>
        )}
      </Card>

      {/* ── Privacy ─────────────────────────────────────────── */}
      <SectionHeader label={t('settings.sectionPrivacy')} />
      <div className="mt-2 rounded-2xl border border-[var(--color-border-soft)] bg-[var(--color-surface)] overflow-hidden">
        <SettingToggle
          label={t('settings.readReceipts')}
          description={t('settings.readReceiptsHelp')}
          value={readReceipts}
          onChange={(v) => { setReadReceipts(v); setReadReceiptsEnabled(v); }}
        />
        <Divider />
        <SettingToggle
          label={t('settings.typingIndicator')}
          description={t('settings.typingIndicatorHelp')}
          value={typingIndicator}
          onChange={(v) => { setTypingIndicator(v); setTypingIndicatorEnabled(v); }}
        />
      </div>

      {/* ── Notifications ───────────────────────────────────── */}
      <SectionHeader label={t('settings.sectionNotifications')} />
      <Card>
        <p className="text-xs text-[var(--color-text-muted)] leading-snug">
          {t('settings.notificationsHelp')}
        </p>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-sm"
                style={{ color: notifPerm === 'granted' ? 'var(--color-green)'
                  : notifPerm === 'denied' ? 'var(--color-red)' : 'var(--color-text-muted)' }}>
            {notifPerm === 'granted' ? t('settings.notifPermissionGranted')
              : notifPerm === 'denied' ? t('settings.notifPermissionDenied')
              : t('settings.notifPermissionDefault')}
          </span>
          {notifPerm === 'default' && (
            <button onClick={() => void requestNotifications()}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium"
                    style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-fg)' }}>
              {t('settings.notifRequest')}
            </button>
          )}
        </div>
      </Card>
      <div className="mt-2 rounded-2xl border border-[var(--color-border-soft)] bg-[var(--color-surface)] overflow-hidden">
        <SettingToggle
          label={t('settings.notifChannelDms')}
          description={t('settings.notifChannelDmsHelp')}
          value={channels.dms}
          onChange={() => toggleChannel('dms')}
        />
        <Divider />
        <SettingToggle
          label={t('settings.notifChannelEvents')}
          description={t('settings.notifChannelEventsHelp')}
          value={channels.events}
          onChange={() => toggleChannel('events')}
        />
        <Divider />
        <SettingToggle
          label={t('settings.notifChannelPortals')}
          description={t('settings.notifChannelPortalsHelp')}
          value={channels.portals}
          onChange={() => toggleChannel('portals')}
        />
      </div>

      {/* ── Storage ─────────────────────────────────────────── */}
      <SectionHeader label={t('settings.sectionStorage')} />
      <Card>
        <p className="text-xs text-[var(--color-text-muted)] leading-snug">
          {t('settings.storageHelp')}
        </p>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-sm text-[var(--color-text-muted)]">{t('settings.storageUsed')}</span>
          <span className="text-sm font-mono text-[var(--color-text)]">{storageText}</span>
        </div>
        <button onClick={() => void handleClearCache()}
                className="mt-3 w-full py-2.5 rounded-lg text-sm font-medium border border-[var(--color-border)] text-[var(--color-text)]">
          {t('settings.clearCache')}
        </button>
        <p className="mt-1.5 text-[11px] text-[var(--color-text-faint)] leading-snug">
          {cacheStatus ?? t('settings.clearCacheHelp')}
        </p>
      </Card>

      {/* ── About ───────────────────────────────────────────── */}
      <SectionHeader label={t('settings.sectionAbout')} />
      <Card>
        <Row label={t('settings.aboutVersion')} value={APP_VERSION} />
        <Divider />
        <Row label={t('settings.aboutBuild')} value={BUILD_DATE} />
        <div className="mt-3 text-[11px] text-[var(--color-text-muted)]">
          {t('settings.identityCreated', {
            date: new Date(identity.createdAt).toLocaleDateString(undefined, { dateStyle: 'medium' }),
          })}
        </div>
      </Card>

      {/* ── Danger zone ─────────────────────────────────────── */}
      <SectionHeader label={t('settings.dangerZone')} />
      <button
        onClick={() => void handleSignOut()}
        className="mt-2 w-full py-3 rounded-2xl text-sm font-medium border border-[var(--color-red-dim)] text-[var(--color-red)]"
      >
        {t('settings.deleteIdentity')}
      </button>
    </section>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <p className="mt-8 px-1 text-xs font-medium uppercase tracking-wide text-[var(--color-text-faint)]">
      {label}
    </p>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-2 rounded-2xl border border-[var(--color-border-soft)] bg-[var(--color-surface)] p-5">
      {children}
    </div>
  );
}

function Divider() {
  return <div className="border-t border-[var(--color-border-soft)]" />;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm text-[var(--color-text-muted)]">{label}</span>
      <span className="text-sm font-mono text-[var(--color-text)]">{value}</span>
    </div>
  );
}

function SettingToggle({ label, description, value, onChange }: {
  label: string; description: string; value: boolean; onChange: (next: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!value)}
      aria-pressed={value}
      className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-[var(--color-surface-muted)]"
    >
      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-medium text-[var(--color-text)]">{label}</div>
        <div className="text-[11px] text-[var(--color-text-muted)] leading-snug mt-0.5">{description}</div>
      </div>
      <span
        className="w-10 h-6 rounded-full p-0.5 flex-shrink-0 transition-colors"
        style={{ backgroundColor: value ? 'var(--color-accent)' : 'var(--color-border)' }}
      >
        <span
          className="block w-5 h-5 rounded-full bg-white transition-transform"
          style={{ transform: value ? 'translateX(16px)' : 'translateX(0)' }}
        />
      </span>
    </button>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
