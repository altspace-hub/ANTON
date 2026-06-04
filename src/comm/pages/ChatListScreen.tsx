import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { listContacts, type Contact } from '../services/contacts';
import { getLatestPerThread, type ChatMessage } from '../services/messages';
import { countContactRequests } from '../services/contact-requests';
import AvatarCircle from '../components/AvatarCircle';

interface Props {
  onAddContact: () => void;
  onOpenChat: (contactHash: string) => void;
  /** #68 — open the message-request tray. */
  onOpenRequests: () => void;
  refreshKey?: number;
}

export default function ChatListScreen({ onAddContact, onOpenChat, onOpenRequests, refreshKey }: Props) {
  const { t } = useTranslation();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [lastByThread, setLastByThread] = useState<Map<string, ChatMessage>>(new Map());
  const [requestCount, setRequestCount] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listContacts(), getLatestPerThread(), countContactRequests()])
      .then(([rows, latest, reqCount]) => {
        if (cancelled) return;
        setRequestCount(reqCount);
        // Sort by most-recent thread activity, then by name as fallback
        rows.sort((a, b) => {
          const la = latest.get(a.contactHash)?.ts ?? '';
          const lb = latest.get(b.contactHash)?.ts ?? '';
          if (la && lb) return lb.localeCompare(la);
          if (la) return -1;
          if (lb) return 1;
          return a.displayName.localeCompare(b.displayName);
        });
        setContacts(rows);
        setLastByThread(latest);
        setLoaded(true);
      })
      .catch(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [refreshKey]);

  return (
    <section className="flex flex-col">
      <div className="flex items-center justify-between px-5 pt-6 pb-3">
        <h1 className="text-2xl font-semibold text-[var(--color-text)]">{t('chat.title')}</h1>
        <button
          onClick={onAddContact}
          aria-label={t('chat.addContact')}
          className="w-10 h-10 rounded-full flex items-center justify-center text-xl font-medium"
          style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-fg)' }}
        >
          +
        </button>
      </div>

      {/* #68 — message-request banner (Signal-style), shown when pending. */}
      {requestCount > 0 && (
        <button type="button" onClick={onOpenRequests}
                className="mx-5 mb-3 flex items-center justify-between rounded-xl px-4 py-3 active:opacity-90"
                style={{ backgroundColor: 'var(--color-accent-soft)', border: '1px solid var(--color-accent-dim)' }}>
          <span className="text-sm font-medium text-[var(--color-text)]">
            {t('requests.banner', {
              count: requestCount,
              defaultValue: '{{count}} message request',
              defaultValue_other: '{{count}} message requests',
            })}
          </span>
          <span className="flex items-center gap-2">
            <span className="min-w-5 h-5 px-1.5 rounded-full text-[11px] font-bold flex items-center justify-center"
                  style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-fg)' }}>
              {requestCount}
            </span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--color-accent)' }}>
              <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </button>
      )}

      {!loaded ? (
        <div className="px-5 py-10 text-center text-sm text-[var(--color-text-faint)]">
          {t('common.loading')}
        </div>
      ) : contacts.length === 0 ? (
        <div className="px-5 mt-4">
          <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-alt)] p-6 text-center">
            <p className="text-sm text-[var(--color-text-body)]">
              {t('chat.noContacts')}
            </p>
            <p className="mt-1 text-xs text-[var(--color-text-faint)]">
              {t('chat.noContactsHelp')}
            </p>
          </div>
        </div>
      ) : (
        <ul className="divide-y divide-[var(--color-border-soft)]">
          {contacts.map((c) => (
            <li key={c.contactHash}>
              <button
                onClick={() => onOpenChat(c.contactHash)}
                className="w-full flex items-center gap-3 px-5 py-3 text-left active:bg-[var(--color-surface-muted)]"
              >
                <AvatarCircle name={c.displayName} avatarImage={c.avatarImage} avatarMime={c.avatarMime} size={44} />
                <div className="flex-1 min-w-0">
                  <div className="text-base font-medium text-[var(--color-text)] truncate">
                    {c.displayName}
                  </div>
                  <div className="text-xs text-[var(--color-text-muted)] truncate">
                    {(() => {
                      const last = lastByThread.get(c.contactHash);
                      if (last) {
                        const prefix = last.direction === 'out' ? t('chat.youPrefix') : '';
                        return prefix + last.plaintext;
                      }
                      return c.contactHash;
                    })()}
                  </div>
                </div>
                {!c.publicKeyHex && (
                  <span
                    className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded"
                    style={{ backgroundColor: 'var(--color-gold-dim)', color: 'var(--color-gold)' }}
                  >
                    {t('chat.keyPending')}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
