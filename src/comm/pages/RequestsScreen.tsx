/**
 * RequestsScreen — the message-request tray (#68).
 *
 * Lists people who messaged you without you having added them. Their pubkey
 * was verified (bound to the relay routing_id + their hash) before the request
 * was ever stored, and their first message is shown as a preview. Approve adds
 * them as a mutual contact and drops the held message(s) into the chat; Reject
 * discards the request.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { listContactRequests, type ContactRequest } from '../services/contact-requests';
import { approveContactRequest, rejectContactRequest } from '../services/contact-request-actions';
import AvatarCircle from '../components/AvatarCircle';

interface Props {
  onBack: () => void;
  /** Bump the contacts/chat refresh key after an approve/reject. */
  onChanged: () => void;
}

export default function RequestsScreen({ onBack, onChanged }: Props) {
  const { t } = useTranslation();
  const [requests, setRequests] = useState<ContactRequest[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setRequests(await listContactRequests());
    setLoaded(true);
  }
  useEffect(() => { void refresh(); }, []);

  async function act(hash: string, fn: (h: string) => Promise<void>) {
    if (busy) return;
    setBusy(hash);
    setError(null);
    try {
      await fn(hash);
      onChanged();
      await refresh();
    } catch {
      setError(t('requests.actionFailed', 'Could not complete that — please try again.'));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="flex flex-col min-h-dvh bg-[var(--color-bg)]">
      <div className="flex items-center gap-2 px-3 pt-6 pb-2 safe-top">
        <button onClick={onBack} aria-label={t('common.back')} className="p-2 rounded-lg"
                style={{ color: 'var(--color-text-muted)' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h1 className="text-xl font-semibold text-[var(--color-text)]">{t('requests.title', 'Requests')}</h1>
      </div>

      <p className="px-5 pb-2 text-sm text-[var(--color-text-muted)]">
        {t('requests.subtitle', 'People who messaged you before you added them. Approve to start chatting.')}
      </p>
      {error && (
        <p className="px-5 pb-2 text-sm text-[var(--color-red)]">{error}</p>
      )}

      {!loaded ? (
        <div className="px-5 py-10 text-center text-sm text-[var(--color-text-faint)]">
          {t('common.loading')}
        </div>
      ) : requests.length === 0 ? (
        <div className="px-5 mt-4">
          <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-alt)] p-6 text-center">
            <p className="text-sm text-[var(--color-text-body)]">{t('requests.empty', 'No requests')}</p>
            <p className="mt-1 text-xs text-[var(--color-text-faint)]">
              {t('requests.emptyHelp', 'When someone messages you without being in your contacts, it shows up here.')}
            </p>
          </div>
        </div>
      ) : (
        <ul className="flex flex-col gap-3 px-4 pb-6">
          {requests.map((r) => {
            const preview = r.heldMessages[r.heldMessages.length - 1]?.text;
            const extra = r.heldMessages.length - 1;
            return (
              <li key={r.contactHash}
                  className="rounded-2xl p-4 bg-[var(--color-surface)] border border-[var(--color-border-soft)]">
                <div className="flex items-center gap-3">
                  <AvatarCircle name={r.displayName} avatarImage={r.avatarImage} avatarMime={r.avatarMime} size={44} />
                  <div className="flex-1 min-w-0">
                    <div className="text-base font-medium text-[var(--color-text)] truncate">{r.displayName}</div>
                    <div className="text-[11px] font-mono text-[var(--color-text-faint)] truncate">{r.contactHash}</div>
                  </div>
                </div>

                {preview && (
                  <div className="mt-3 rounded-xl px-3 py-2 text-sm text-[var(--color-text-body)] bg-[var(--color-surface-muted)] border border-[var(--color-border-soft)]">
                    <span className="break-words">{preview}</span>
                    {extra > 0 && (
                      <span className="ml-1 text-[11px] text-[var(--color-text-faint)]">
                        {t('requests.moreMessages', { count: extra, defaultValue: '+{{count}} more' })}
                      </span>
                    )}
                  </div>
                )}

                <div className="mt-3 flex gap-2">
                  <button type="button" onClick={() => void act(r.contactHash, approveContactRequest)}
                          disabled={!!busy}
                          className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
                          style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-fg)',
                                   opacity: busy ? 0.6 : 1 }}>
                    {t('requests.approve', 'Approve')}
                  </button>
                  <button type="button" onClick={() => void act(r.contactHash, rejectContactRequest)}
                          disabled={!!busy}
                          className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
                          style={{ backgroundColor: 'transparent', color: 'var(--color-text-muted)',
                                   border: '1px solid var(--color-border)',
                                   opacity: busy ? 0.6 : 1 }}>
                    {t('requests.reject', 'Reject')}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
