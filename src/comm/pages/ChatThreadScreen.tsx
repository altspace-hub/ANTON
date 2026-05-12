import { useEffect, useRef, useState } from 'react';
import { listThread, sweepExpiredInThread, type ChatMessage, type ReplyContext } from '../services/messages';
import { sendMessage, sendImage, sendVideo, sendVoice, sendReaction, sendTimerChange, ChatError, type MediaPayload, type VoicePayload, type SystemTimerChangePayload } from '../services/chat';
import { getContact, type Contact } from '../services/contacts';
import { getIdentity } from '../services/identity';
import type { EventInvitePayload, EventRsvpPayload, EventCancelPayload } from '../services/events';
import { EVENT_TYPE_ICONS, EVENT_TYPE_LABELS } from '../services/events';
import {
  captureImageFromCamera,
  captureImageFromLibrary,
  captureVideoFromCamera,
  captureVideoFromLibrary,
  isWithinRelayCap,
  type Capture,
} from '../services/capture';
import type { VoiceRecording } from '../services/voice';
import { Ico, type IcoName } from '../components/Ico';
import AttachmentSheet from '../components/AttachmentSheet';
import MessageActionSheet from '../components/MessageActionSheet';
import VoiceRecorder from '../components/VoiceRecorder';
import VoicePlayer from '../components/VoicePlayer';
import DisappearingTimerSheet, { formatTimerLabel } from '../components/DisappearingTimerSheet';
import { useLongPress } from '../hooks/useLongPress';

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
  const [attachmentOpen, setAttachmentOpen] = useState(false);
  /** R1 — message being replied to; clears on send or cancel */
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  /** R1/R2 — message currently selected for actions (long-press target) */
  const [actionTarget, setActionTarget] = useState<ChatMessage | null>(null);
  /** R5 — disappearing-timer settings sheet visibility */
  const [timerSheetOpen, setTimerSheetOpen] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);
  /** Force re-fetch when reactions update so chips re-render. */
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    // R5 — sweep expired messages on each refresh, then list what remains.
    void sweepExpiredInThread(peerContactHash);
    Promise.all([getContact(peerContactHash), listThread(peerContactHash)])
      .then(([c, msgs]) => {
        if (cancelled) return;
        setContact(c);
        setMessages(msgs);
      })
      .catch(() => { /* swallow — empty state */ });
    return () => { cancelled = true; };
  }, [peerContactHash, refreshTick]);

  // Re-fetch thread every 2s while open — picks up reactions arriving
  // via the relay client (which writes to IDB directly). Also runs the
  // R5 sweep so expired messages disappear without the user navigating.
  useEffect(() => {
    const t = setInterval(() => setRefreshTick((v) => v + 1), 2000);
    return () => clearInterval(t);
  }, []);

  async function handleTimerChange(timerSec: number) {
    try {
      await sendTimerChange(peerContactHash, timerSec);
      setRefreshTick((v) => v + 1);
    } catch (e) {
      setError(e instanceof ChatError ? e.message : (e instanceof Error ? e.message : 'Failed to update timer'));
    }
  }

  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  async function handleSend() {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    try {
      const replyCtx = replyingTo ? buildReplyContext(replyingTo) : undefined;
      const msg = await sendMessage(peerContactHash, text, replyCtx);
      setMessages((prev) => [...prev, msg]);
      setDraft('');
      setReplyingTo(null);
    } catch (e) {
      setError(e instanceof ChatError ? e.message : (e instanceof Error ? e.message : 'Failed to send'));
    } finally {
      setSending(false);
    }
  }

  async function handleReaction(target: ChatMessage, emoji: string) {
    const me = getIdentity();
    if (!me) return;
    const alreadyReacted = !!target.reactions?.[emoji]?.includes(me.contactHash);
    try {
      await sendReaction(peerContactHash, target.id, emoji, alreadyReacted ? 'remove' : 'add');
      setRefreshTick((v) => v + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to react');
    }
  }

  async function handleSendVoice(rec: VoiceRecording) {
    setError(null);
    setSending(true);
    try {
      const payload: VoicePayload = {
        audio: rec.audio,
        mimeType: rec.mimeType,
        durationSec: rec.durationSec,
        waveform: rec.waveform,
        size: rec.size,
      };
      const replyCtx = replyingTo ? buildReplyContext(replyingTo) : undefined;
      const msg = await sendVoice(peerContactHash, payload, replyCtx);
      setMessages((prev) => [...prev, msg]);
      setReplyingTo(null);
    } catch (e) {
      setError(e instanceof ChatError ? e.message : (e instanceof Error ? e.message : 'Failed to send voice'));
    } finally {
      setSending(false);
    }
  }

  async function handleAttachment(grabber: () => Promise<Capture | null>) {
    setError(null);
    setSending(true);
    try {
      const capture = await grabber();
      if (!capture) return;
      if (!isWithinRelayCap(capture)) {
        setError(
          capture.mediaType === 'video'
            ? `Video is too big (${formatBytes(capture.size)}). Try a shorter clip — the limit is roughly 700 KB after compression.`
            : `Image is too big (${formatBytes(capture.size)}). Try a smaller photo.`,
        );
        return;
      }
      const payload: MediaPayload = {
        data: capture.data,
        mimeType: capture.mimeType,
        filename: capture.filename,
        size: capture.size,
        width: capture.width,
        height: capture.height,
        durationSec: capture.durationSec,
      };
      const msg = capture.mediaType === 'image'
        ? await sendImage(peerContactHash, payload)
        : await sendVideo(peerContactHash, payload);
      setMessages((prev) => [...prev, msg]);
    } catch (e) {
      setError(e instanceof ChatError ? e.message : (e instanceof Error ? e.message : 'Failed to attach'));
    } finally {
      setSending(false);
    }
  }

  const displayName = contact?.displayName ?? peerContactHash;
  const hasPeerKey = !!contact?.publicKeyHex;

  return (
    <section className="flex flex-col min-h-dvh max-h-dvh safe-top safe-bottom bg-[var(--color-bg)]">
      <header className="flex items-center gap-3 h-14 px-3 border-b border-[var(--color-border-soft)] bg-[var(--color-surface)] flex-shrink-0">
        <button
          onClick={onBack}
          className="px-2 py-1 text-[var(--color-text-muted)]"
          aria-label="Back"
        >
          <Ico name="arrowLeft" size={22} />
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
        <button
          onClick={() => setTimerSheetOpen(true)}
          aria-label="Disappearing messages"
          className="w-10 h-10 rounded-full flex items-center justify-center text-[var(--color-text-muted)] active:bg-[var(--color-surface-muted)]"
        >
          <Ico name="clock" size={20} color={(contact?.disappearingTimerSec ?? 0) > 0 ? 'var(--color-accent)' : undefined} />
        </button>
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
          messages.map((m) => (
            <Bubble
              key={m.id}
              message={m}
              isMine={m.fromHash === me?.contactHash}
              onOpenEvent={onOpenEvent}
              onLongPress={() => setActionTarget(m)}
              onReactionTap={(emoji) => void handleReaction(m, emoji)}
              myHash={me?.contactHash}
            />
          ))
        )}
      </div>

      {error && (
        <div className="px-4 py-2 text-xs text-[var(--color-red)] bg-[var(--color-red-dim)]">
          {error}
        </div>
      )}

      {replyingTo && (
        <div className="flex items-center gap-2 px-3 py-2 border-t border-[var(--color-border-soft)] bg-[var(--color-surface-alt)]">
          <div
            className="w-1 h-10 rounded-full flex-shrink-0"
            style={{ backgroundColor: 'var(--color-accent)' }}
          />
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-medium text-[var(--color-accent-dark)]">
              Replying to {replyingTo.fromHash === me?.contactHash ? 'yourself' : (contact?.displayName ?? 'them')}
            </div>
            <div className="text-xs text-[var(--color-text-muted)] truncate">
              {replySnippetOf(replyingTo)}
            </div>
          </div>
          <button
            onClick={() => setReplyingTo(null)}
            aria-label="Cancel reply"
            className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--color-text-muted)]"
          >
            <Ico name="x" size={18} />
          </button>
        </div>
      )}

      <div className="relative flex items-end gap-2 p-3 border-t border-[var(--color-border-soft)] bg-[var(--color-surface)]">
        <button
          onClick={() => setAttachmentOpen(true)}
          disabled={sending || !hasPeerKey}
          aria-label="Attach"
          className="w-10 h-10 rounded-full flex items-center justify-center disabled:opacity-40 flex-shrink-0 text-[var(--color-text-muted)] active:bg-[var(--color-surface-muted)]"
        >
          <Ico name="paperclip" size={22} />
        </button>
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
        {draft.trim().length > 0 ? (
          <button
            onClick={() => void handleSend()}
            disabled={sending || !hasPeerKey}
            aria-label="Send"
            className="w-10 h-10 rounded-full flex items-center justify-center disabled:opacity-40 flex-shrink-0"
            style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-fg)' }}
          >
            <Ico name="arrowUp" size={20} />
          </button>
        ) : (
          <VoiceRecorder
            onSend={handleSendVoice}
            onError={setError}
            disabled={sending || !hasPeerKey}
          />
        )}
      </div>

      <AttachmentSheet
        open={attachmentOpen}
        onClose={() => setAttachmentOpen(false)}
        onPickImageCamera={() => void handleAttachment(captureImageFromCamera)}
        onPickImageLibrary={() => void handleAttachment(captureImageFromLibrary)}
        onPickVideoCamera={() => void handleAttachment(captureVideoFromCamera)}
        onPickVideoLibrary={() => void handleAttachment(captureVideoFromLibrary)}
      />

      <MessageActionSheet
        open={actionTarget !== null}
        onClose={() => setActionTarget(null)}
        isMine={actionTarget?.fromHash === me?.contactHash}
        onReact={(emoji) => actionTarget && void handleReaction(actionTarget, emoji)}
        onReply={() => actionTarget && setReplyingTo(actionTarget)}
        onCopy={actionTarget?.kind === 'text' ? () => {
          if (actionTarget) void navigator.clipboard?.writeText(actionTarget.plaintext).catch(() => {});
        } : undefined}
      />

      <DisappearingTimerSheet
        open={timerSheetOpen}
        onClose={() => setTimerSheetOpen(false)}
        currentSec={contact?.disappearingTimerSec ?? 0}
        onSelect={(s) => void handleTimerChange(s)}
      />
    </section>
  );
}

function buildReplyContext(msg: ChatMessage): ReplyContext {
  return {
    msgId: msg.id,
    snippet: replySnippetOf(msg),
    kind: msg.kind ?? 'text',
    fromHash: msg.fromHash,
  };
}

function replySnippetOf(msg: ChatMessage): string {
  if (msg.kind === 'image') return '📷 Photo';
  if (msg.kind === 'video') return '🎬 Video';
  if (msg.kind === 'voice') {
    try {
      const v = JSON.parse(msg.plaintext) as { durationSec?: number };
      const d = Math.max(1, Math.floor(v.durationSec ?? 0));
      return `🎙 Voice · ${formatVoiceSnippetDur(d)}`;
    } catch { return '🎙 Voice'; }
  }
  if (msg.kind === 'event_invite') return '📅 Event';
  if (msg.kind === 'event_rsvp') return 'RSVP';
  const text = msg.plaintext.replace(/\s+/g, ' ').trim();
  return text.length > 80 ? text.slice(0, 77) + '…' : text;
}

function formatVoiceSnippetDur(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

interface BubbleProps {
  message: ChatMessage;
  isMine: boolean;
  onOpenEvent?: (id: string) => void;
  onLongPress: () => void;
  onReactionTap: (emoji: string) => void;
  myHash?: string;
}

function Bubble({ message, isMine, onOpenEvent, onLongPress, onReactionTap, myHash }: BubbleProps) {
  const time = new Date(message.ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const longPress = useLongPress(onLongPress);

  // Bubbles that are non-actionable (rsvp / cancel / timer-change chips) skip long-press
  if (message.kind === 'event_rsvp')          return <EventRsvpBubble   message={message} isMine={isMine} time={time} />;
  if (message.kind === 'event_cancel')        return <EventCancelBubble message={message} isMine={isMine} time={time} />;
  if (message.kind === 'system_timer_change') return <TimerChangeChip   message={message} isMine={isMine} time={time} />;

  const wrapperBase = `flex ${isMine ? 'justify-end' : 'justify-start'}`;

  let body: JSX.Element;
  if (message.kind === 'event_invite') {
    body = <EventInviteBubble message={message} isMine={isMine} time={time} onOpenEvent={onOpenEvent} />;
  } else if (message.kind === 'image' || message.kind === 'video') {
    body = <MediaBubble message={message} isMine={isMine} time={time} kind={message.kind} />;
  } else if (message.kind === 'voice') {
    body = <VoiceBubble message={message} isMine={isMine} time={time} />;
  } else {
    body = (
      <div
        className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-[15px] leading-snug ${isMine ? 'rounded-br-md' : 'rounded-bl-md'}`}
        style={{
          backgroundColor: isMine ? 'var(--color-accent)' : 'var(--color-surface)',
          color: isMine ? 'var(--color-accent-fg)' : 'var(--color-text)',
          border: isMine ? 'none' : '1px solid var(--color-border-soft)',
        }}
      >
        {message.replyTo && <ReplyStrip ctx={message.replyTo} isMine={isMine} />}
        <div className="whitespace-pre-wrap break-words">{message.plaintext}</div>
        <div className="mt-1 text-[10px] font-medium opacity-70 flex items-center justify-end gap-1">
          {message.disappearsAt && <Ico name="clock" size={11} color={isMine ? 'var(--color-accent-fg)' : 'var(--color-text-muted)'} />}
          <time>{time}</time>
          {isMine && <StatusTick status={message.status} />}
        </div>
      </div>
    );
  }

  return (
    <div className={wrapperBase}>
      <div
        className="flex flex-col items-stretch"
        style={{ alignItems: isMine ? 'flex-end' : 'flex-start', maxWidth: '85%' }}
        {...longPress}
      >
        {body}
        {message.reactions && Object.keys(message.reactions).length > 0 && (
          <ReactionChips reactions={message.reactions} myHash={myHash} onTap={onReactionTap} />
        )}
      </div>
    </div>
  );
}

function ReplyStrip({ ctx, isMine }: { ctx: ReplyContext; isMine: boolean }) {
  return (
    <div
      className="flex items-stretch gap-2 mb-1.5 -mt-0.5 px-2 py-1.5 rounded-lg"
      style={{
        backgroundColor: isMine ? 'rgba(255,255,255,0.18)' : 'var(--color-surface-muted)',
        borderLeft: `3px solid ${isMine ? 'rgba(255,255,255,0.6)' : 'var(--color-accent)'}`,
      }}
    >
      <div className="flex-1 min-w-0">
        <div
          className="text-[11px] font-semibold opacity-80"
          style={{ color: isMine ? 'var(--color-accent-fg)' : 'var(--color-accent-dark)' }}
        >
          Reply
        </div>
        <div className="text-xs opacity-90 truncate" style={{ color: isMine ? 'var(--color-accent-fg)' : 'var(--color-text-muted)' }}>
          {ctx.snippet}
        </div>
      </div>
    </div>
  );
}

function ReactionChips({ reactions, myHash, onTap }: {
  reactions: Record<string, string[]>;
  myHash?: string;
  onTap: (emoji: string) => void;
}) {
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {Object.entries(reactions).map(([emoji, hashes]) => {
        const mine = !!myHash && hashes.includes(myHash);
        return (
          <button
            key={emoji}
            onClick={(e) => { e.stopPropagation(); onTap(emoji); }}
            className="flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[12px] border"
            style={{
              backgroundColor: mine ? 'var(--color-accent-dim)' : 'var(--color-surface)',
              borderColor: mine ? 'var(--color-accent)' : 'var(--color-border-soft)',
              color: 'var(--color-text)',
            }}
          >
            <span>{emoji}</span>
            <span className="font-medium text-[11px] text-[var(--color-text-muted)]">{hashes.length}</span>
          </button>
        );
      })}
    </div>
  );
}

function MediaBubble({ message, isMine, time, kind }: { message: ChatMessage; isMine: boolean; time: string; kind: 'image' | 'video' }) {
  let payload: MediaPayload | null = null;
  try { payload = JSON.parse(message.plaintext) as MediaPayload; } catch { /* ignore */ }
  if (!payload) return null;
  const dataUrl = `data:${payload.mimeType};base64,${payload.data}`;
  const aspect = (payload.width && payload.height) ? payload.width / payload.height : 4 / 3;
  return (
    <div className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[78%] rounded-2xl overflow-hidden ${isMine ? 'rounded-br-md' : 'rounded-bl-md'}`}
        style={{
          backgroundColor: isMine ? 'var(--color-accent)' : 'var(--color-surface)',
          border: isMine ? 'none' : '1px solid var(--color-border-soft)',
        }}
      >
        {kind === 'image' ? (
          <img src={dataUrl} alt={payload.filename} className="block w-full" style={{ aspectRatio: aspect }} />
        ) : (
          <video src={dataUrl} controls preload="metadata" className="block w-full" style={{ aspectRatio: aspect }} />
        )}
        {payload.caption && (
          <div
            className="px-3 pt-2 pb-1 text-[14px] leading-snug"
            style={{ color: isMine ? 'var(--color-accent-fg)' : 'var(--color-text)' }}
          >
            {payload.caption}
          </div>
        )}
        <div
          className="px-3 py-1.5 text-[10px] font-medium opacity-80 flex items-center justify-end gap-1"
          style={{ color: isMine ? 'var(--color-accent-fg)' : 'var(--color-text-muted)' }}
        >
          {message.disappearsAt && <Ico name="clock" size={11} color={isMine ? 'var(--color-accent-fg)' : 'var(--color-text-muted)'} />}
          <time>{time}</time>
          {isMine && <StatusTick status={message.status} />}
        </div>
      </div>
    </div>
  );
}

function VoiceBubble({ message, isMine, time }: { message: ChatMessage; isMine: boolean; time: string }) {
  let payload: VoicePayload | null = null;
  try { payload = JSON.parse(message.plaintext) as VoicePayload; } catch { /* ignore */ }
  if (!payload) return null;
  return (
    <div
      className={`max-w-[78%] rounded-2xl px-3.5 py-2.5 ${isMine ? 'rounded-br-md' : 'rounded-bl-md'}`}
      style={{
        backgroundColor: isMine ? 'var(--color-accent)' : 'var(--color-surface)',
        color: isMine ? 'var(--color-accent-fg)' : 'var(--color-text)',
        border: isMine ? 'none' : '1px solid var(--color-border-soft)',
      }}
    >
      {message.replyTo && <ReplyStrip ctx={message.replyTo} isMine={isMine} />}
      <VoicePlayer payload={payload} mine={isMine} />
      <div
        className="mt-1 text-[10px] font-medium opacity-70 flex items-center justify-end gap-1"
        style={{ color: isMine ? 'var(--color-accent-fg)' : 'var(--color-text-muted)' }}
      >
        {message.disappearsAt && <Ico name="clock" size={11} color={isMine ? 'var(--color-accent-fg)' : 'var(--color-text-muted)'} />}
        <time>{time}</time>
        {isMine && <StatusTick status={message.status} />}
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
        style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
      >
        <div className="px-4 py-3" style={{ backgroundColor: 'var(--color-accent-soft)' }}>
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
            <Ico name={EVENT_TYPE_ICONS[data.eventType] as IcoName} size={16} />
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

function TimerChangeChip({ message, isMine, time }: { message: ChatMessage; isMine: boolean; time: string }) {
  let data: SystemTimerChangePayload | null = null;
  try { data = JSON.parse(message.plaintext) as SystemTimerChangePayload; } catch { /* ignore */ }
  if (!data) return null;
  const who = isMine ? 'You' : 'They';
  const label = data.timerSec === 0
    ? `${who} turned disappearing messages off`
    : `${who} set disappearing messages to ${formatTimerLabel(data.timerSec)}`;
  return (
    <div className="flex justify-center">
      <span className="px-3 py-1 rounded-full text-[11px] text-[var(--color-text-muted)] bg-[var(--color-surface-muted)] inline-flex items-center gap-1.5">
        <Ico name="clock" size={12} color="var(--color-text-muted)" />
        {label} · {time}
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

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
