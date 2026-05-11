import { useEffect, useRef, useState } from 'react';
import { listThread, type ChatMessage } from '../services/messages';
import { sendMessage, ChatError } from '../services/chat';
import { getContact, type Contact } from '../services/contacts';
import { getIdentity } from '../services/identity';
import type { EventInvitePayload, EventRsvpPayload, EventCancelPayload } from '../services/events';
import { EVENT_TYPE_ICONS, EVENT_TYPE_LABELS } from '../services/events';

interface Props {
  peerContactHash: string;
  onBack: () => void;
  onOpenEvent?: (id: string) => void;
}

export default function ChatThreadScreen({ peerContactHash, onBack, onOpenEvent }: Props) {
  const me = getIdentity();
  const [contact, setContact] = useState<Contact | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getContact(peerContactHash), listThread(peerContactHash)])
      .then(([c, msgs]) => {
        if (cancelled) return;
        setContact(c);
        setMessages(msgs);
      })
      .catch(() => { /* swallow — empty state */ });
    return () => { cancelled = true; };
  }, [peerContactHash]);

  useEffect(() => {
    // Auto-scroll to bottom whenever the message list grows
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  async function handleSend() {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    try {
      const msg = await sendMessage(peerContactHash, text);
      setMessages((prev) => [...prev, msg]);
      setDraft('');
    } catch (e) {
      if (e instanceof ChatError) {
        setError(e.message);
      } else {
        setError(e instanceof Error ? e.message : 'Failed to send');
      }
    } finally {
      setSending(false);
    }
  }

  const displayName = contact?.displayName ?? peerContactHash;
  const hasPeerKey = !!contact?.publicKeyHex;

  return (
    <section className="flex flex-col min-h-dvh max-h-dvh safe-top safe-bottom bg-[var(--color-bg)]">
      <header className="flex items-center gap-3 h-14 px-3 border-b border-[var(--color-border-soft)] bg-[var(--color-surface)] flex-shrink-0">
        <button onClick={onBack} className="text-sm text-[var(--color-text-muted)] px-2 py-1" aria-label="Back">
          ←
        </button>
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0"
          style={{ backgroundColor: 'var(--color-accent-dim)', color: 'var(--color-accent-dark)' }}
        >
          {displayName.slice(0, 1).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-base font-semibold text-[var(--color-text)] truncate">{displayName}</div>
          <div className="text-[10px] font-mono text-[var(--color-text-faint)] truncate">{peerContactHash}</div>
        </div>
      </header>

      {!hasPeerKey && (
        <div className="px-4 py-2 text-xs text-[var(--color-text-muted)] bg-[var(--color-gold-dim)] border-b border-[var(--color-border-soft)]">
          You don't have this contact's public key yet. Ask them to share their QR.
        </div>
      )}

      <div
        ref={scrollerRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-2"
      >
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-[var(--color-text-faint)] text-center max-w-xs">
              Start the conversation — messages here are end-to-end encrypted.
            </p>
          </div>
        ) : (
          messages.map((m) => <Bubble key={m.id} message={m} isMine={m.fromHash === me?.contactHash} onOpenEvent={onOpenEvent} />)
        )}
      </div>

      {error && (
        <div className="px-4 py-2 text-xs text-[var(--color-red)] bg-[var(--color-red-dim)]">
          {error}
        </div>
      )}

      <div className="flex items-end gap-2 p-3 border-t border-[var(--color-border-soft)] bg-[var(--color-surface)]">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSend(); }
          }}
          placeholder="Message"
          rows={1}
          className="flex-1 px-3 py-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg)] text-base text-[var(--color-text)] placeholder-[var(--color-text-faint)] resize-none max-h-32 focus:outline-none focus:ring-2"
          style={{ outlineColor: 'var(--color-accent)' }}
        />
        <button
          onClick={() => void handleSend()}
          disabled={sending || draft.trim().length === 0 || !hasPeerKey}
          aria-label="Send"
          className="w-10 h-10 rounded-full flex items-center justify-center text-lg font-semibold disabled:opacity-40 flex-shrink-0"
          style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-fg)' }}
        >
          ↑
        </button>
      </div>
    </section>
  );
}

function Bubble({ message, isMine, onOpenEvent }: { message: ChatMessage; isMine: boolean; onOpenEvent?: (id: string) => void }) {
  const time = new Date(message.ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

  if (message.kind === 'event_invite') {
    return (
      <EventInviteBubble message={message} isMine={isMine} time={time} onOpenEvent={onOpenEvent} />
    );
  }
  if (message.kind === 'event_rsvp') {
    return <EventRsvpBubble message={message} isMine={isMine} time={time} />;
  }
  if (message.kind === 'event_cancel') {
    return <EventCancelBubble message={message} isMine={isMine} time={time} />;
  }

  return (
    <div className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-[15px] leading-snug ${isMine ? 'rounded-br-md' : 'rounded-bl-md'}`}
        style={{
          backgroundColor: isMine ? 'var(--color-accent)' : 'var(--color-surface)',
          color: isMine ? 'var(--color-accent-fg)' : 'var(--color-text)',
          border: isMine ? 'none' : '1px solid var(--color-border-soft)',
        }}
      >
        <div className="whitespace-pre-wrap break-words">{message.plaintext}</div>
        <div className="mt-1 text-[10px] font-medium opacity-70 flex items-center justify-end gap-1">
          <time>{time}</time>
          {isMine && <StatusTick status={message.status} />}
        </div>
      </div>
    </div>
  );
}

function EventInviteBubble({ message, isMine, time, onOpenEvent }: {
  message: ChatMessage; isMine: boolean; time: string; onOpenEvent?: (id: string) => void;
}) {
  let data: EventInvitePayload | null = null;
  try { data = JSON.parse(message.plaintext) as EventInvitePayload; } catch { /* ignore */ }
  if (!data) return null;
  const start = new Date(data.startAt);
  return (
    <div className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
      <button
        onClick={() => onOpenEvent?.(data!.id)}
        className="max-w-[85%] text-left rounded-2xl overflow-hidden border"
        style={{
          backgroundColor: 'var(--color-surface)',
          borderColor: 'var(--color-border)',
        }}
      >
        <div className="px-4 py-3" style={{ backgroundColor: 'var(--color-accent-soft)' }}>
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
            <span>{EVENT_TYPE_ICONS[data.eventType]}</span>
            <span>{isMine ? 'You invited' : 'Event invite'} · {EVENT_TYPE_LABELS[data.eventType]}</span>
          </div>
          <div className="mt-1 text-base font-semibold text-[var(--color-text)]">{data.title}</div>
        </div>
        <div className="px-4 py-2 text-xs text-[var(--color-text-body)]">
          {start.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
          {!data.allDay && (
            <> · {start.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</>
          )}
          {data.location && <> · {data.location}</>}
        </div>
        <div className="px-4 py-2 text-[10px] font-medium text-[var(--color-text-faint)] flex justify-between">
          <span>Tap to view & RSVP</span>
          <time>{time}</time>
        </div>
      </button>
    </div>
  );
}

function EventRsvpBubble({ message, isMine, time }: { message: ChatMessage; isMine: boolean; time: string }) {
  let data: EventRsvpPayload | null = null;
  try { data = JSON.parse(message.plaintext) as EventRsvpPayload; } catch { /* ignore */ }
  if (!data) return null;
  const label = data.status === 'going' ? 'going' : data.status === 'maybe' ? 'might come' : 'can\'t make it';
  return (
    <div className="flex justify-center">
      <span className="px-3 py-1 rounded-full text-xs text-[var(--color-text-muted)] bg-[var(--color-surface-muted)]">
        {isMine ? 'You\'re ' : ''}{label} · {time}
      </span>
    </div>
  );
}

function EventCancelBubble({ message, isMine, time }: { message: ChatMessage; isMine: boolean; time: string }) {
  let data: EventCancelPayload | null = null;
  try { data = JSON.parse(message.plaintext) as EventCancelPayload; } catch { /* ignore */ }
  void data;
  return (
    <div className="flex justify-center">
      <span className="px-3 py-1 rounded-full text-xs text-[var(--color-red)] bg-[var(--color-red-dim)]">
        Event canceled · {time}{isMine ? ' (by you)' : ''}
      </span>
    </div>
  );
}

function StatusTick({ status }: { status: ChatMessage['status'] }) {
  if (status === 'queued') return <span title="Queued — awaiting transport">⋯</span>;
  if (status === 'sent') return <span title="Sent">✓</span>;
  if (status === 'delivered') return <span title="Delivered">✓✓</span>;
  if (status === 'failed') return <span title="Failed">!</span>;
  return null;
}
