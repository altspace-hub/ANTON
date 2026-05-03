/**
 * StdMailScreen — Standard mode "Messages" (Evolution design).
 *
 * Per design/screens-standard.jsx StdMailScreen:
 *   • 24px greeting top bar — "Messages · You have N new"
 *   • Large message rows with 44px circular avatars (ANTON = accent dot,
 *     regulator = gold, normal sender = neutral surface)
 *   • 16px from-name, 16px subject, 14px preview
 *   • No source chips, no ANTON action pills, no mono labels
 *
 * Same data as Pro UnifiedMailScreen — listMailInbox(orgId).
 */

import { useEffect, useState } from 'react';
import { Ico, Spinner, ErrorPill } from '../components/ui';
import { listMailInbox, inboxTime, type MailMessage } from '../services/mail';

interface Props {
  orgId: string;
  onOpenThread: (m: MailMessage) => void;
}

export default function StdMailScreen({ orgId, onOpenThread }: Props): JSX.Element {
  const [messages, setMessages] = useState<MailMessage[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const list = await listMailInbox(orgId, { limit: 30 });
        if (!cancelled) setMessages(list);
      } catch {
        if (!cancelled) setError('Couldn\'t load your messages.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [orgId, reloadTick]);

  const unread = messages.filter(m => !m.is_read).length;

  return (
    <div className="flex flex-1 flex-col overflow-hidden" style={{ background: 'var(--color-bg)' }}>
      {/* Top bar */}
      <div
        className="flex items-start gap-3 px-[18px] py-3"
        style={{ background: 'var(--color-bg)' }}
      >
        <div className="flex-1">
          <div
            className="text-[var(--color-text)]"
            style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.4px', lineHeight: 1.1 }}
          >
            Messages
          </div>
          <div className="mt-1 text-sm text-[var(--color-text-muted)]">
            {unread > 0 ? `You have ${unread} new` : 'All caught up'}
          </div>
        </div>
        <button
          aria-label="Search messages"
          className="-mr-2 flex h-11 w-11 flex-shrink-0 items-center justify-center"
        >
          <Ico name="search" color="var(--color-text-muted)" size={22} />
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto pb-2">
        {error && (
          <div className="px-[18px] pt-3">
            <ErrorPill message={error} onRetry={() => setReloadTick(t => t + 1)} />
          </div>
        )}
        {loading ? (
          <div className="flex justify-center py-12">
            <Spinner size="lg" />
          </div>
        ) : messages.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <Ico name="inbox" color="var(--color-text-faint)" size={32} />
            <p className="mt-3 text-base text-[var(--color-text-muted)]">No messages yet.</p>
          </div>
        ) : (
          messages.map((m, i) => {
            const isAnton    = m.provider === 'anton';
            const isRegulator = m.from_name?.toLowerCase().includes('regulator')
                             || m.from_name?.toLowerCase().includes('finansinspektion');
            const avatarBg = isAnton      ? 'var(--color-accent)'
                          : isRegulator   ? 'var(--color-gold)'
                                          : 'var(--color-surface-alt)';
            const avatarFg = isAnton || isRegulator ? '#fff' : 'var(--color-text)';
            const avatarChar = isAnton ? '●' : (m.from_name?.[0] || 'A').toUpperCase();
            return (
              <button
                key={m.id}
                onClick={() => onOpenThread(m)}
                className="flex w-full gap-3.5 px-[18px] py-4 text-left"
                style={{
                  borderBottom: i < messages.length - 1 ? '1px solid var(--color-border-soft)' : 'none',
                  background: m.is_read ? 'transparent' : 'var(--color-surface)',
                }}
              >
                <div
                  className="flex flex-shrink-0 items-center justify-center rounded-full font-bold"
                  style={{ width: 44, height: 44, background: avatarBg, color: avatarFg, fontSize: 17 }}
                >
                  {avatarChar}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span
                      className="text-[var(--color-text)]"
                      style={{ fontSize: 16, fontWeight: m.is_read ? 500 : 700 }}
                    >
                      {m.from_name}
                    </span>
                    <span className="flex-1" />
                    <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
                      {inboxTime(m.received_at)}
                    </span>
                  </div>
                  <div
                    className="mt-0.5 text-[var(--color-text)]"
                    style={{
                      fontSize: 16, fontWeight: m.is_read ? 400 : 600, letterSpacing: '-0.1px',
                    }}
                  >
                    {m.subject}
                  </div>
                  <div
                    className="mt-1 truncate text-[var(--color-text-muted)]"
                    style={{ fontSize: 14, lineHeight: 1.4 }}
                  >
                    {m.preview}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
