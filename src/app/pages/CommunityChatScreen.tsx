/**
 * CommunityChatScreen — message thread with one ANTON contact.
 *
 * Mirrors the desktop's community-mail flow at the chat-thread level.
 * Reads from /api/app/org/:orgId/community/messages?with=<hash> and posts
 * to the same endpoint. The companion app sees both sender and recipient
 * copies of each message via the community_mail table.
 *
 * Polls every 4s while open so messages from peers feel near-realtime
 * without wiring the websocket connection in v1.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Btn, Ico, Spinner, ErrorPill,
} from '../components/ui';
import {
  getCommunityMessages, sendCommunityMessage,
  type CommunityMessage,
} from '../services/api';
import { tick, error as hapticError } from '../services/haptics';

interface Props {
  orgId: string;
  contactHash: string;
  contactName: string;
  onBack: () => void;
}

const POLL_INTERVAL_MS = 4_000;

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export default function CommunityChatScreen({ orgId, contactHash, contactName, onBack }: Props): JSX.Element {
  const [messages, setMessages] = useState<CommunityMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Initial load + 4s poll.
  useEffect(() => {
    let cancelled = false;
    let intervalId: number | null = null;

    async function fetchOnce(initial: boolean) {
      try {
        const data = await getCommunityMessages(orgId, contactHash);
        if (cancelled) return;
        // De-dup by id (sender+recipient copies of the same message in
        // community_mail share content but get distinct ids when the
        // sender sees both their sent-copy AND the inbox-copy on the same
        // instance — for solo-mode same-instance testing this happens).
        const seen = new Set<string>();
        const deduped: CommunityMessage[] = [];
        for (const m of data.messages) {
          const key = `${m.from_hash}|${m.body}|${m.timestamp}`;
          if (seen.has(key)) continue;
          seen.add(key);
          deduped.push(m);
        }
        setMessages(deduped);
        if (initial) setError(null);
      } catch {
        if (!cancelled && initial) setError('Couldn\'t load conversation.');
      } finally {
        if (!cancelled && initial) setLoading(false);
      }
    }

    setLoading(true);
    void fetchOnce(true);
    intervalId = window.setInterval(() => void fetchOnce(false), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      if (intervalId) window.clearInterval(intervalId);
    };
  }, [orgId, contactHash, reloadTick]);

  // Auto-scroll to bottom on message change. behavior 'auto' since polling
  // can produce frequent updates; smooth on first render only.
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'auto',
    });
  }, [messages]);

  async function send() {
    const trimmed = draft.trim();
    if (!trimmed || sending) return;
    setSending(true);
    void tick();
    try {
      await sendCommunityMessage(orgId, contactHash, trimmed);
      setDraft('');
      // Optimistic refresh (the next poll will catch up regardless).
      setReloadTick(t => t + 1);
    } catch (e) {
      void hapticError();
      setError(e instanceof Error ? e.message : 'Failed to send');
    }
    setSending(false);
  }

  const initials = useMemo(() => (contactName || '?')
    .split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '??',
    [contactName]
  );

  return (
    <div className="flex flex-1 flex-col overflow-hidden" style={{ background: 'var(--color-bg)', minHeight: 0 }}>
      {/* Header */}
      <div
        className="flex flex-shrink-0 items-center gap-3 px-3 py-2"
        style={{ background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border-soft)' }}
      >
        <button
          onClick={onBack}
          aria-label="Back"
          className="flex h-11 w-11 items-center justify-center"
          style={{ color: 'var(--color-text)' }}
        >
          <Ico name="chevronLeft" size={22} />
        </button>
        <span
          className="flex flex-shrink-0 items-center justify-center rounded-full font-semibold"
          style={{
            width: 36, height: 36,
            background: 'var(--color-accent-soft)',
            color: 'var(--color-accent)',
            fontSize: '0.8125rem',
          }}
          aria-hidden="true"
        >
          {initials}
        </span>
        <div className="min-w-0 flex-1">
          <h1
            className="truncate text-[0.9375rem] font-semibold"
            style={{ color: 'var(--color-text)', letterSpacing: '-0.15px' }}
          >
            {contactName}
          </h1>
          <div
            className="truncate font-mono text-[0.6875rem]"
            style={{ color: 'var(--color-text-muted)', letterSpacing: '0.3px' }}
          >
            {contactHash}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-2xl flex-col gap-2 px-4 py-4">
          {error && (
            <ErrorPill message={error} onRetry={() => setReloadTick(t => t + 1)} />
          )}

          {loading ? (
            <div className="flex justify-center py-16">
              <Spinner size="lg" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center py-16 text-center">
              <span className="mb-3 inline-flex" style={{ color: 'var(--color-text-faint)' }}>
                <Ico name="message" size={28} />
              </span>
              <p className="text-[0.875rem] font-semibold" style={{ color: 'var(--color-text)' }}>
                No messages yet
              </p>
              <p
                className="mx-auto mt-1 max-w-[260px] text-[0.75rem] leading-relaxed"
                style={{ color: 'var(--color-text-muted)' }}
              >
                Send the first message below. Everything here is end-to-end
                encrypted between your two ANTONs.
              </p>
            </div>
          ) : (
            messages.map(m => <Bubble key={m.id} m={m} />)
          )}
        </div>
      </div>

      {/* Composer */}
      <div
        className="safe-bottom flex flex-shrink-0 items-end gap-2 px-3 py-3"
        style={{ background: 'var(--color-surface)', borderTop: '1px solid var(--color-border-soft)' }}
      >
        <label htmlFor="chat-composer" className="sr-only">Message</label>
        <textarea
          id="chat-composer"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          rows={1}
          placeholder="Message…"
          className="min-h-[44px] flex-1 resize-none rounded-[var(--radius-r2)] px-3 py-2.5 text-[0.90625rem] leading-relaxed focus:outline-none"
          style={{
            background: 'var(--color-bg)',
            color: 'var(--color-text)',
            border: '1px solid var(--color-border)',
            maxHeight: 120,
          }}
          disabled={sending}
        />
        <Btn
          variant="primary"
          size="md"
          onClick={() => void send()}
          disabled={sending || !draft.trim()}
          icon={<Ico name="arrowUp" color="currentColor" size={16} />}
        >
          Send
        </Btn>
      </div>
    </div>
  );
}

function Bubble({ m }: { m: CommunityMessage }): JSX.Element {
  if (m.is_me) {
    // My message — right-aligned bubble, accent fill.
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] flex-col items-end">
          <div
            className="rounded-[16px] px-3.5 py-2.5"
            style={{ background: 'var(--color-accent)', color: 'var(--color-accent-fg)' }}
          >
            <p className="break-words whitespace-pre-wrap text-[0.90625rem] leading-[1.5]">
              {m.body || ''}
            </p>
          </div>
          <div
            className="mt-0.5 px-1 text-right font-mono text-[0.6875rem]"
            style={{ color: 'var(--color-text-faint)', letterSpacing: '0.3px' }}
          >
            {formatTime(m.timestamp)}
          </div>
        </div>
      </div>
    );
  }
  // Their message — left-aligned bubble, surface fill.
  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] flex-col items-start">
        <div
          className="rounded-[16px] px-3.5 py-2.5"
          style={{
            background: 'var(--color-surface)',
            color: 'var(--color-text)',
            border: '1px solid var(--color-border)',
          }}
        >
          <p className="break-words whitespace-pre-wrap text-[0.90625rem] leading-[1.5]">
            {m.body || ''}
          </p>
        </div>
        <div
          className="mt-0.5 px-1 font-mono text-[0.6875rem]"
          style={{ color: 'var(--color-text-faint)', letterSpacing: '0.3px' }}
        >
          {formatTime(m.timestamp)}
        </div>
      </div>
    </div>
  );
}
