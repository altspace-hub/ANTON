import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { listThread, sweepExpiredInThread, deleteMessage, listScheduled, type ChatMessage, type ReplyContext } from '../services/messages';
import { sendMessage, sendImage, sendVideo, sendFile, sendVoice, sendReaction, sendTimerChange, sendViewOnceViewed, sendPollVote, sendEdit, sendDeleteForEveryone, sendForward, sendReadReceipt, sendTypingState, subscribeTyping, sendLocation, sendSticker, ChatError, type MediaPayload, type VoicePayload, type SystemTimerChangePayload } from '../services/chat';
import { startLiveShare, type GeoFix } from '../services/geo';
import { getContact, type Contact } from '../services/contacts';
import AvatarCircle from '../components/AvatarCircle';
import { getIdentity } from '../services/identity';
import { getTypingIndicatorEnabled } from '../services/settings';
import { subscribeChatChanged } from '../services/chat-events';
import { useBlobUrl } from '../hooks/useBlobUrl';
import type { EventInvitePayload, EventRsvpPayload, EventCancelPayload } from '../services/events';
import { EVENT_TYPE_ICONS, EVENT_TYPE_LABELS } from '../services/events';
import {
  captureImageFromCamera,
  captureImageFromLibrary,
  captureVideoFromCamera,
  captureVideoFromLibrary,
  pickAnyFile,
  isWithinRelayCap,
  type Capture,
} from '../services/capture';
import { saveAndOpenFile } from '../services/file-open';
import type { VoiceRecording } from '../services/voice';
import { Ico, type IcoName } from '../components/Ico';
import AttachmentSheet from '../components/AttachmentSheet';
import MessageActionSheet from '../components/MessageActionSheet';
import VoiceRecorder from '../components/VoiceRecorder';
import VoicePlayer from '../components/VoicePlayer';
import DisappearingTimerSheet, { formatTimerLabel } from '../components/DisappearingTimerSheet';
import ForwardSheet from '../components/ForwardSheet';
import ScheduleSheet from '../components/ScheduleSheet';
import ScheduledListSheet from '../components/ScheduledListSheet';
import PollBubble from '../components/PollBubble';
import PollComposeScreen from './PollComposeScreen';
import LocationBubble from '../components/LocationBubble';
import LocationPickerSheet from '../components/LocationPickerSheet';
import StickerBubble from '../components/StickerBubble';
import StickerPickerSheet from '../components/StickerPickerSheet';
import { recordStickerUse } from '../services/sticker-recents';
import MediaViewer from '../components/MediaViewer';
import { useLongPress } from '../hooks/useLongPress';
import { registerBackHandler } from '../services/back-stack';

interface Props {
  peerContactHash: string;
  onBack: () => void;
  onOpenEvent?: (id: string) => void;
}

export default function ChatThreadScreen({ peerContactHash, onBack, onOpenEvent }: Props) {
  const { t } = useTranslation();
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
  /** R6 — view-once toggle in the attachment sheet (one-shot, resets on send). */
  const [viewOnceArmed, setViewOnceArmed] = useState(false);
  /** R6 — message currently being shown fullscreen for one-time view. */
  const [viewingOnce, setViewingOnce] = useState<ChatMessage | null>(null);
  /** B1/B2 — image message being shown fullscreen in the lightbox viewer.
   *  Holds the decoded payload directly (data + mime + alt) so the viewer
   *  doesn't have to re-parse the ChatMessage. */
  const [viewingMedia, setViewingMedia] = useState<{ data: string; mimeType: string; alt?: string } | null>(null);
  /** R7 — poll-compose overlay visibility */
  const [pollComposing, setPollComposing] = useState(false);
  /** R8 — text message currently being edited; composer pre-fills its text */
  const [editingTarget, setEditingTarget] = useState<ChatMessage | null>(null);
  /** R8 — source message id for the forward picker; null when picker is closed */
  const [forwardSource, setForwardSource] = useState<ChatMessage | null>(null);
  /** R9 — peer is currently typing (volatile, no IDB) */
  const [peerTyping, setPeerTyping] = useState(false);
  /** R9 — am I currently typing? Track locally so we don't spam the wire. */
  const typingActiveRef = useRef(false);
  const typingStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** P2-6 audit fix: debounce floor before the first typing=true ping
   *  so the operator can't keystroke-time us within ~50ms of a tap. */
  const typingStartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** R9 — auto-clear inbound typing if the sender never sends a stop ping. */
  const peerTypingClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** R10 — schedule UI state */
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduledListOpen, setScheduledListOpen] = useState(false);
  const [scheduledCount, setScheduledCount] = useState(0);
  /** R10 — when set, we're scheduling rather than sending immediately. */
  const [reschedulingTarget, setReschedulingTarget] = useState<ChatMessage | null>(null);
  /** R10 — long-press send menu visibility */
  const [sendMenuOpen, setSendMenuOpen] = useState(false);
  /** R13 — location picker sheet visibility */
  const [locationPickerOpen, setLocationPickerOpen] = useState(false);
  /** R12 — sticker picker sheet visibility */
  const [stickerPickerOpen, setStickerPickerOpen] = useState(false);
  /** R10 — true for ~400ms after a long-press fires, so the subsequent
   *  click on the send button doesn't ALSO trigger an immediate send. */
  const justLongPressedRef = useRef(false);
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

  // P4-4: event-driven refresh.
  //
  // Previously this polled every 2 s. Every mutator in messages.ts now
  // emits a chat-changed event tagged with the affected threadHash, and
  // subscribeChatChanged() filters to just this thread. The 30 s
  // interval below is a safety net for any future code path that
  // forgets to emit — the screen still recovers within a usage window.
  useEffect(() => {
    const unsub = subscribeChatChanged(peerContactHash, () => setRefreshTick((v) => v + 1));
    const t = setInterval(() => setRefreshTick((v) => v + 1), 30_000);
    return () => { unsub(); clearInterval(t); };
  }, [peerContactHash]);

  // R9 — subscribe to inbound presence_typing events for this peer.
  //
  // P3-4 audit fix: mutual gating. Even if the peer sends typing pings,
  // we only render them when the local user has opted into typing
  // indicators. This makes the preference symmetric — your "I don't
  // want to see typing" choice can't be bypassed by a peer who has it
  // enabled on their side.
  useEffect(() => {
    return subscribeTyping((fromHash, isTyping) => {
      if (fromHash !== peerContactHash) return;
      if (!getTypingIndicatorEnabled()) return;
      setPeerTyping(isTyping);
      if (peerTypingClearRef.current) clearTimeout(peerTypingClearRef.current);
      if (isTyping) {
        // Safety net — clear after 5s even if the peer forgets to send stop
        peerTypingClearRef.current = setTimeout(() => setPeerTyping(false), 5000);
      }
    });
  }, [peerContactHash]);

  // R10 — refresh scheduled count whenever the thread refreshes
  useEffect(() => {
    void listScheduled(peerContactHash).then((rows) => setScheduledCount(rows.length)).catch(() => setScheduledCount(0));
  }, [peerContactHash, refreshTick]);

  // R9 — fire a read receipt when we open the thread or get a new inbound message
  useEffect(() => {
    const lastInbound = [...messages].reverse().find((m) => m.direction === 'in' && !m.deletedForEveryone);
    if (!lastInbound) return;
    void sendReadReceipt(peerContactHash, lastInbound.id);
  }, [peerContactHash, messages.length]);

  async function handleSendSticker(packId: string, stickerId: string) {
    setError(null);
    setSending(true);
    try {
      const msg = await sendSticker(peerContactHash, packId, stickerId);
      setMessages((prev) => [...prev, msg]);
      recordStickerUse(packId, stickerId); // surface it in the picker's "Recently used" row

    } catch (e) {
      setError(e instanceof ChatError ? e.message : (e instanceof Error ? e.message : t('chat.errSendSticker')));
    } finally {
      setSending(false);
    }
  }

  async function handleShareLocation(fix: GeoFix, liveDurationMin: number) {
    setError(null);
    setSending(true);
    try {
      const liveUntil = liveDurationMin > 0
        ? new Date(Date.now() + liveDurationMin * 60 * 1000).toISOString()
        : undefined;
      const msg = await sendLocation(peerContactHash, {
        lat: fix.lat, lng: fix.lng, accuracyM: fix.accuracyM, liveUntil,
      });
      setMessages((prev) => [...prev, msg]);
      if (liveUntil) startLiveShare(peerContactHash, msg.id, liveUntil);
    } catch (e) {
      setError(e instanceof ChatError ? e.message : (e instanceof Error ? e.message : t('chat.errShareLocation')));
    } finally {
      setSending(false);
    }
  }

  async function handlePollVote(pollId: string, optionIdx: number[]) {
    try {
      await sendPollVote(peerContactHash, pollId, optionIdx);
      setRefreshTick((v) => v + 1);
    } catch (e) {
      setError(e instanceof ChatError ? e.message : (e instanceof Error ? e.message : t('chat.errVote')));
    }
  }

  async function handleViewOnceDismiss(msg: ChatMessage) {
    setViewingOnce(null);
    try {
      // Notify sender (best-effort), then wipe local copy.
      await sendViewOnceViewed(peerContactHash, msg.id);
      await deleteMessage(msg.id);
      setRefreshTick((v) => v + 1);
    } catch { /* swallow — local delete still happens */ }
  }

  async function handleTimerChange(timerSec: number) {
    try {
      await sendTimerChange(peerContactHash, timerSec);
      setRefreshTick((v) => v + 1);
    } catch (e) {
      setError(e instanceof ChatError ? e.message : (e instanceof Error ? e.message : t('chat.errUpdateTimer')));
    }
  }

  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  async function handleSend(scheduledFor?: string) {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    try {
      if (editingTarget) {
        // R8 — edit mode replaces the source bubble's text in place.
        await sendEdit(peerContactHash, editingTarget.id, text);
        setEditingTarget(null);
        setDraft('');
        setRefreshTick((v) => v + 1);
      } else {
        const replyCtx = replyingTo ? buildReplyContext(replyingTo) : undefined;
        const msg = await sendMessage(peerContactHash, text, replyCtx, scheduledFor);
        if (!scheduledFor) {
          // Immediate send: append to live bubble flow
          setMessages((prev) => [...prev, msg]);
        } else {
          // R10 — scheduled: increment badge instead of cluttering the bubble list
          setScheduledCount((c) => c + 1);
        }
        setDraft('');
        setReplyingTo(null);
      }
    } catch (e) {
      setError(e instanceof ChatError ? e.message : (e instanceof Error ? e.message : t('chat.errSend')));
    } finally {
      setSending(false);
    }
  }

  async function handleScheduleApply(iso: string) {
    if (reschedulingTarget) {
      // R10 — moving an existing scheduled message to a new time
      const { rescheduleMessage } = await import('../services/messages');
      await rescheduleMessage(reschedulingTarget.id, iso);
      setReschedulingTarget(null);
      setRefreshTick((v) => v + 1);
      return;
    }
    await handleSend(iso);
  }

  /**
   * R9 — typing debouncer with P2-6 privacy hardening.
   *
   * The audit flagged that firing presence_typing=true on the FIRST
   * keystroke leaks ~50ms keystroke-timing to the relay operator.
   * Mitigation:
   *   - Don't dispatch typing=true until the user has been composing
   *     for at least 500ms (debounce floor). Tap-and-cancel within
   *     500ms emits nothing at all.
   *   - Don't dispatch typing=false until the draft has been empty for
   *     ≥1s (avoids revealing "typed and then deleted" patterns).
   *   - 3s post-last-keystroke timer still applies for the auto-stop.
   *
   * Skips wire emission entirely if the user disabled the indicator
   * (sendTypingState itself gates on the setting too).
   */
  function handleTypingPing(currentDraft: string) {
    const hasContent = currentDraft.trim().length > 0;
    if (!hasContent) {
      // Don't emit stop instantly; wait 1s to coalesce typed-then-deleted.
      if (typingStartTimerRef.current) { clearTimeout(typingStartTimerRef.current); typingStartTimerRef.current = null; }
      if (typingActiveRef.current) {
        if (typingStopTimerRef.current) clearTimeout(typingStopTimerRef.current);
        typingStopTimerRef.current = setTimeout(() => {
          typingActiveRef.current = false;
          typingStopTimerRef.current = null;
          void sendTypingState(peerContactHash, false);
        }, 1000);
      }
      return;
    }
    // Has content. If we've already dispatched true, just refresh the
    // 3s stop timer. Otherwise schedule the 500ms start-debounce.
    if (typingActiveRef.current) {
      if (typingStopTimerRef.current) clearTimeout(typingStopTimerRef.current);
      typingStopTimerRef.current = setTimeout(() => {
        typingActiveRef.current = false;
        typingStopTimerRef.current = null;
        void sendTypingState(peerContactHash, false);
      }, 3000);
      return;
    }
    if (typingStartTimerRef.current) return; // already pending
    typingStartTimerRef.current = setTimeout(() => {
      typingStartTimerRef.current = null;
      typingActiveRef.current = true;
      void sendTypingState(peerContactHash, true);
      typingStopTimerRef.current = setTimeout(() => {
        typingActiveRef.current = false;
        typingStopTimerRef.current = null;
        void sendTypingState(peerContactHash, false);
      }, 3000);
    }, 500);
  }

  // Clean up the typing timer if the user leaves the thread.
  useEffect(() => () => {
    if (typingStopTimerRef.current) clearTimeout(typingStopTimerRef.current);
    if (typingStartTimerRef.current) clearTimeout(typingStartTimerRef.current);
    if (peerTypingClearRef.current) clearTimeout(peerTypingClearRef.current);
    if (typingActiveRef.current) void sendTypingState(peerContactHash, false);
  }, [peerContactHash]);

  async function handleEditStart(target: ChatMessage) {
    setEditingTarget(target);
    setDraft(target.plaintext);
    setReplyingTo(null);
  }

  async function handleDeleteForEveryone(target: ChatMessage) {
    try {
      await sendDeleteForEveryone(peerContactHash, target.id);
      setRefreshTick((v) => v + 1);
    } catch (e) {
      setError(e instanceof ChatError ? e.message : (e instanceof Error ? e.message : t('chat.errDelete')));
    }
  }

  async function handleForwardPick(targetContactHash: string) {
    const src = forwardSource;
    setForwardSource(null);
    if (!src) return;
    try {
      await sendForward(src.id, targetContactHash);
    } catch (e) {
      setError(e instanceof ChatError ? e.message : (e instanceof Error ? e.message : t('chat.errForward')));
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
      setError(e instanceof Error ? e.message : t('chat.errReact'));
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
      setError(e instanceof ChatError ? e.message : (e instanceof Error ? e.message : t('chat.errSendVoice')));
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
        setError(t(
          capture.mediaType === 'video' ? 'chat.videoTooBig'
            : capture.mediaType === 'file' ? 'chat.fileTooBig'
            : 'chat.imageTooBig',
          { size: formatBytes(capture.size) },
        ));
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
        // view-once is a media concept; files send as normal attachments.
        viewOnce: capture.mediaType !== 'file' && viewOnceArmed ? true : undefined,
      };
      const msg = capture.mediaType === 'image'
        ? await sendImage(peerContactHash, payload)
        : capture.mediaType === 'file'
          ? await sendFile(peerContactHash, payload)
          : await sendVideo(peerContactHash, payload);
      setMessages((prev) => [...prev, msg]);
      // R6 — one-shot, reset after send
      if (viewOnceArmed) setViewOnceArmed(false);
    } catch (e) {
      setError(e instanceof ChatError ? e.message : (e instanceof Error ? e.message : t('chat.errAttach')));
    } finally {
      setSending(false);
    }
  }

  const displayName = contact?.displayName ?? peerContactHash;
  const hasPeerKey = !!contact?.publicKeyHex;

  // R7 — poll compose takes over the screen while open
  if (pollComposing) {
    return (
      <PollComposeScreen
        peerContactHash={peerContactHash}
        peerName={displayName}
        onCancel={() => setPollComposing(false)}
        onCreated={() => { setPollComposing(false); setRefreshTick((v) => v + 1); }}
      />
    );
  }

  return (
    <section className="flex flex-col min-h-dvh max-h-dvh safe-top safe-bottom bg-[var(--color-bg)]">
      <header className="flex items-center gap-3 h-14 px-3 border-b border-[var(--color-border-soft)] bg-[var(--color-surface)] flex-shrink-0">
        <button
          onClick={onBack}
          className="px-2 py-1 text-[var(--color-text-muted)]"
          aria-label={t('common.back')}
        >
          <Ico name="arrowLeft" size={22} />
        </button>
        <AvatarCircle name={displayName} avatarImage={contact?.avatarImage} avatarMime={contact?.avatarMime} size={36} />
        <div className="flex-1 min-w-0">
          <div className="text-base font-semibold text-[var(--color-text)] truncate">{displayName}</div>
          {peerTyping ? (
            <div className="text-[11px] font-medium truncate" style={{ color: 'var(--color-accent)' }}>{t('chat.typing')}</div>
          ) : (
            <div className="text-[10px] font-mono text-[var(--color-text-faint)] truncate">{peerContactHash}</div>
          )}
        </div>
        <button
          onClick={() => setTimerSheetOpen(true)}
          aria-label={t('chat.disappearingMessages')}
          className="w-10 h-10 rounded-full flex items-center justify-center text-[var(--color-text-muted)] active:bg-[var(--color-surface-muted)]"
        >
          <Ico name="clock" size={20} color={(contact?.disappearingTimerSec ?? 0) > 0 ? 'var(--color-accent)' : undefined} />
        </button>
      </header>

      {!hasPeerKey && (
        <div className="px-4 py-2 text-xs text-[var(--color-text-muted)] bg-[var(--color-gold-dim)] border-b border-[var(--color-border-soft)]">
          {t('chat.noPeerKey')}
        </div>
      )}

      <div
        ref={scrollerRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-2"
      >
        {(() => {
          // R10 — hide scheduled-for-future messages from the bubble flow.
          // They live in the "Scheduled (N)" sheet instead.
          const visibleMessages = messages.filter(
            (m) => !(m.scheduledFor && m.scheduledFor > new Date().toISOString() && m.status === 'queued'),
          );
          return visibleMessages.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-[var(--color-text-faint)] text-center max-w-xs">
                {t('chat.startConversation')}
              </p>
            </div>
          ) : (
            visibleMessages.map((m) => (
              <Bubble
                key={m.id}
                message={m}
                isMine={m.fromHash === me?.contactHash}
                onOpenEvent={onOpenEvent}
                onLongPress={() => setActionTarget(m)}
                onReactionTap={(emoji) => void handleReaction(m, emoji)}
                onOpenViewOnce={(msg) => setViewingOnce(msg)}
                onOpenImage={(media) => setViewingMedia(media)}
                onPollVote={(pollId, optionIdx) => void handlePollVote(pollId, optionIdx)}
                myHash={me?.contactHash}
              />
            ))
          );
        })()}
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
              {replyingTo.fromHash === me?.contactHash
                ? t('chat.replyingToYourself')
                : t('chat.replyingTo', { name: contact?.displayName ?? t('chat.them') })}
            </div>
            <div className="text-xs text-[var(--color-text-muted)] truncate">
              {replySnippetOf(replyingTo)}
            </div>
          </div>
          <button
            onClick={() => setReplyingTo(null)}
            aria-label={t('chat.cancelReply')}
            className="w-11 h-11 rounded-full flex items-center justify-center text-[var(--color-text-muted)] active:bg-[var(--color-surface-muted)]"
          >
            <Ico name="x" size={18} />
          </button>
        </div>
      )}

      {scheduledCount > 0 && (
        <button
          onClick={() => setScheduledListOpen(true)}
          className="flex items-center gap-2 mx-3 mb-1 mt-2 px-3 py-2 rounded-full text-[12px] font-medium self-start"
          style={{ backgroundColor: 'var(--color-accent-dim)', color: 'var(--color-accent-dark)' }}
        >
          <Ico name="clock" size={14} color="var(--color-accent-dark)" />
          {t('chat.scheduledCount', { count: scheduledCount })}
          <Ico name="chevronRight" size={12} color="var(--color-accent-dark)" />
        </button>
      )}

      {editingTarget && (
        <div className="flex items-center gap-2 px-3 py-2 border-t border-[var(--color-border-soft)] bg-[var(--color-surface-alt)]">
          <Ico name="reply" size={18} color="var(--color-accent)" />
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-medium text-[var(--color-accent-dark)]">{t('chat.editingMessage')}</div>
            <div className="text-xs text-[var(--color-text-muted)] truncate">{editingTarget.plaintext}</div>
          </div>
          <button
            onClick={() => { setEditingTarget(null); setDraft(''); }}
            aria-label={t('chat.cancelEdit')}
            className="w-11 h-11 rounded-full flex items-center justify-center text-[var(--color-text-muted)] active:bg-[var(--color-surface-muted)]"
          >
            <Ico name="x" size={18} />
          </button>
        </div>
      )}

      <div className="relative flex items-end gap-2 p-3 border-t border-[var(--color-border-soft)] bg-[var(--color-surface)]">
        <button
          onClick={() => setAttachmentOpen(true)}
          disabled={sending || !hasPeerKey}
          aria-label={t('chat.attach')}
          className="w-10 h-10 rounded-full flex items-center justify-center disabled:opacity-40 flex-shrink-0 text-[var(--color-text-muted)] active:bg-[var(--color-surface-muted)]"
        >
          <Ico name="paperclip" size={22} />
        </button>
        <textarea
          value={draft}
          onChange={(e) => { setDraft(e.target.value); handleTypingPing(e.target.value); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSend(); }
          }}
          placeholder={t('chat.messagePlaceholder')}
          rows={1}
          className="flex-1 px-3 py-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg)] text-base text-[var(--color-text)] placeholder-[var(--color-text-faint)] resize-none max-h-32 focus:outline-none focus:ring-2"
          style={{ outlineColor: 'var(--color-accent)' }}
        />
        {draft.trim().length > 0 ? (
          <SendButton
            onSendNow={() => { if (justLongPressedRef.current) return; void handleSend(); }}
            onLongPress={() => {
              justLongPressedRef.current = true;
              setSendMenuOpen(true);
              setTimeout(() => { justLongPressedRef.current = false; }, 400);
            }}
            disabled={sending || !hasPeerKey}
          />
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
        onPickPoll={() => setPollComposing(true)}
        onPickLocation={() => setLocationPickerOpen(true)}
        onPickSticker={() => setStickerPickerOpen(true)}
        onPickFile={() => void handleAttachment(pickAnyFile)}
        viewOnce={viewOnceArmed}
        onToggleViewOnce={() => setViewOnceArmed((v) => !v)}
      />

      <LocationPickerSheet
        open={locationPickerOpen}
        onClose={() => setLocationPickerOpen(false)}
        onShare={(fix, mins) => void handleShareLocation(fix, mins)}
      />

      <StickerPickerSheet
        open={stickerPickerOpen}
        onClose={() => setStickerPickerOpen(false)}
        onPick={(packId, stickerId) => void handleSendSticker(packId, stickerId)}
      />

      {viewingOnce && <ViewOnceViewer message={viewingOnce} onDismiss={() => void handleViewOnceDismiss(viewingOnce)} />}

      {viewingMedia && (
        <MediaViewer
          data={viewingMedia.data}
          mimeType={viewingMedia.mimeType}
          alt={viewingMedia.alt}
          onClose={() => setViewingMedia(null)}
        />
      )}

      <MessageActionSheet
        open={actionTarget !== null}
        onClose={() => setActionTarget(null)}
        isMine={actionTarget?.fromHash === me?.contactHash}
        onReact={(emoji) => actionTarget && void handleReaction(actionTarget, emoji)}
        onReply={() => actionTarget && setReplyingTo(actionTarget)}
        onCopy={actionTarget?.kind === 'text' ? () => {
          if (actionTarget) void navigator.clipboard?.writeText(actionTarget.plaintext).catch(() => {});
        } : undefined}
        onForward={actionTarget && !actionTarget.deletedForEveryone && actionTarget.kind !== 'event_invite'
          && actionTarget.kind !== 'event_rsvp' && actionTarget.kind !== 'event_cancel'
          && actionTarget.kind !== 'system_timer_change'
          ? () => actionTarget && setForwardSource(actionTarget) : undefined}
        onEdit={actionTarget?.fromHash === me?.contactHash && (actionTarget?.kind ?? 'text') === 'text' && !actionTarget?.deletedForEveryone
          ? () => actionTarget && void handleEditStart(actionTarget) : undefined}
        onDelete={actionTarget?.fromHash === me?.contactHash && !actionTarget?.deletedForEveryone
          ? () => actionTarget && void handleDeleteForEveryone(actionTarget) : undefined}
      />

      <ForwardSheet
        open={forwardSource !== null}
        onClose={() => setForwardSource(null)}
        excludeContactHash={peerContactHash}
        onPick={(hash) => void handleForwardPick(hash)}
      />

      <DisappearingTimerSheet
        open={timerSheetOpen}
        onClose={() => setTimerSheetOpen(false)}
        currentSec={contact?.disappearingTimerSec ?? 0}
        onSelect={(s) => void handleTimerChange(s)}
      />

      <SendMenu
        open={sendMenuOpen}
        onClose={() => setSendMenuOpen(false)}
        onSendNow={() => { setSendMenuOpen(false); void handleSend(); }}
        onSchedule={() => { setSendMenuOpen(false); setScheduleOpen(true); }}
      />

      <ScheduleSheet
        open={scheduleOpen || reschedulingTarget !== null}
        onClose={() => { setScheduleOpen(false); setReschedulingTarget(null); }}
        initialIso={reschedulingTarget?.scheduledFor ?? null}
        onSchedule={(iso) => void handleScheduleApply(iso)}
      />

      <ScheduledListSheet
        open={scheduledListOpen}
        onClose={() => setScheduledListOpen(false)}
        peerContactHash={peerContactHash}
        onChange={() => setRefreshTick((v) => v + 1)}
        onReschedule={(target) => { setScheduledListOpen(false); setReschedulingTarget(target); }}
      />
    </section>
  );
}

// ── R10: send button with long-press detection ────────────────────────

function SendButton({ onSendNow, onLongPress, disabled }: {
  onSendNow: () => void; onLongPress: () => void; disabled?: boolean;
}) {
  const { t } = useTranslation();
  const longPress = useLongPress(onLongPress);
  return (
    <button
      onClick={onSendNow}
      disabled={disabled}
      aria-label={t('chat.sendHoldHint')}
      className="w-10 h-10 rounded-full flex items-center justify-center disabled:opacity-40 flex-shrink-0"
      style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-fg)' }}
      {...longPress}
    >
      <Ico name="arrowUp" size={20} />
    </button>
  );
}

// ── R10: small bottom sheet shown on long-press of send ───────────────

function SendMenu({ open, onClose, onSendNow, onSchedule }: {
  open: boolean; onClose: () => void; onSendNow: () => void; onSchedule: () => void;
}) {
  const { t } = useTranslation();
  useEffect(() => { if (!open) return; return registerBackHandler(onClose); }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex flex-col justify-end"
      style={{ background: 'rgba(28, 26, 20, 0.55)' }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[var(--color-surface)] rounded-t-3xl pt-3 pb-6 safe-bottom"
      >
        <div className="w-10 h-1 rounded-full bg-[var(--color-border)] mx-auto mb-4" />
        <div className="px-4 space-y-1">
          <button
            onClick={onSendNow}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left text-[15px] text-[var(--color-text)] active:bg-[var(--color-surface-muted)]"
          >
            <Ico name="arrowUp" size={20} color="var(--color-text-muted)" />
            <span>{t('chat.sendNow')}</span>
          </button>
          <button
            onClick={onSchedule}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left text-[15px] text-[var(--color-text)] active:bg-[var(--color-surface-muted)]"
          >
            <Ico name="clock" size={20} color="var(--color-text-muted)" />
            <span>{t('chat.schedule')}</span>
          </button>
        </div>
      </div>
    </div>
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
  if (msg.kind === 'poll') {
    try {
      const p = JSON.parse(msg.plaintext) as { question?: string };
      return `🗳 Poll · ${(p.question ?? '').slice(0, 60)}`;
    } catch { return '🗳 Poll'; }
  }
  if (msg.kind === 'location') return '📍 Location';
  if (msg.kind === 'sticker')  return '🎨 Sticker';
  if (msg.kind === 'file') {
    try { const f = JSON.parse(msg.plaintext) as { filename?: string }; return `📎 ${f.filename ?? 'File'}`; }
    catch { return '📎 File'; }
  }
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
  onOpenViewOnce: (message: ChatMessage) => void;
  /** B2 — open an image message in the full-screen lightbox. */
  onOpenImage: (media: { data: string; mimeType: string; alt?: string }) => void;
  onPollVote: (pollId: string, optionIdx: number[]) => void;
  myHash?: string;
}

function Bubble({ message, isMine, onOpenEvent, onLongPress, onReactionTap, onOpenViewOnce, onOpenImage, onPollVote, myHash }: BubbleProps) {
  const { t } = useTranslation();
  const time = new Date(message.ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  // B2 — guard so a long-press that opens the action sheet doesn't ALSO
  // fire the image tap (pointerup → synthetic click on the inner button).
  // We mark when a long-press fires and swallow the next image tap within
  // a short window, then reset.
  const justLongPressedRef = useRef(false);
  const longPress = useLongPress(() => {
    justLongPressedRef.current = true;
    onLongPress();
    setTimeout(() => { justLongPressedRef.current = false; }, 400);
  });
  const handleOpenImage = (media: { data: string; mimeType: string; alt?: string }) => {
    if (justLongPressedRef.current) return;
    onOpenImage(media);
  };
  // #91 — tap a file bubble to save + open it. Guarded the same way as the
  // image tap so a long-press (action sheet) doesn't also fire the open.
  const handleOpenFile = (payload: MediaPayload) => {
    if (justLongPressedRef.current) return;
    void saveAndOpenFile({ filename: payload.filename, mimeType: payload.mimeType, base64: payload.data });
  };

  // Bubbles that are non-actionable (rsvp / cancel / timer-change chips) skip long-press
  if (message.kind === 'event_rsvp')          return <EventRsvpBubble   message={message} isMine={isMine} time={time} />;
  if (message.kind === 'event_cancel')        return <EventCancelBubble message={message} isMine={isMine} time={time} />;
  if (message.kind === 'system_timer_change') return <TimerChangeChip   message={message} isMine={isMine} time={time} />;

  // R8 — delete-for-everyone placeholder (skip long-press too)
  if (message.deletedForEveryone)             return <DeletedBubble     isMine={isMine} time={time} />;

  const wrapperBase = `flex ${isMine ? 'justify-end' : 'justify-start'}`;

  let body: JSX.Element;
  if (message.kind === 'event_invite') {
    body = <EventInviteBubble message={message} isMine={isMine} time={time} onOpenEvent={onOpenEvent} />;
  } else if (message.kind === 'image' || message.kind === 'video') {
    // R6 — branch to the view-once bubble when the payload is marked
    let p: MediaPayload | null = null;
    try { p = JSON.parse(message.plaintext) as MediaPayload; } catch { /* ignore */ }
    if (p?.viewOnce) {
      body = <ViewOnceMediaBubble message={message} isMine={isMine} time={time} onOpen={() => onOpenViewOnce(message)} />;
    } else {
      body = <MediaBubble message={message} isMine={isMine} time={time} kind={message.kind} onOpenImage={handleOpenImage} />;
    }
  } else if (message.kind === 'voice') {
    body = <VoiceBubble message={message} isMine={isMine} time={time} />;
  } else if (message.kind === 'poll') {
    body = <PollBubble message={message} isMine={isMine} myHash={myHash} time={time} onVote={onPollVote} />;
  } else if (message.kind === 'location') {
    body = <LocationBubble message={message} isMine={isMine} time={time} />;
  } else if (message.kind === 'sticker') {
    body = <StickerBubble message={message} isMine={isMine} time={time} />;
  } else if (message.kind === 'file') {
    body = <FileBubble message={message} isMine={isMine} time={time} onOpen={handleOpenFile} />;
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
          {message.editedAt && <span className="italic">{t('chat.edited')}</span>}
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
  const { t } = useTranslation();
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
          {t('chat.reply')}
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

function MediaBubble({ message, isMine, time, kind, onOpenImage }: {
  message: ChatMessage; isMine: boolean; time: string; kind: 'image' | 'video';
  onOpenImage: (media: { data: string; mimeType: string; alt?: string }) => void;
}) {
  let payload: MediaPayload | null = null;
  try { payload = JSON.parse(message.plaintext) as MediaPayload; } catch { /* ignore */ }
  // P4-3: memoize the blob URL so a thread re-render doesn't re-decode
  // every image / video on every poll tick. dataUrl is null when payload
  // is missing or base64 fails to decode — the early return below
  // handles that.
  const blobUrl = useBlobUrl(payload?.data, payload?.mimeType);
  if (!payload) return null;
  // B3 — reserve correct space + cap thumbnail size so portrait/landscape
  // photos don't stretch. capture.ts now passes width/height through for
  // both the Capacitor and web paths; fall back to 4:3 only when a legacy
  // message lacks dimensions. The thumbnail is capped (object-cover) so a
  // very tall image can't dominate the thread — tap opens the full image.
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
          blobUrl && (
            <button
              type="button"
              // B2 — open the lightbox. The long-press action sheet still
              // works: useLongPress lives on the Bubble wrapper and only
              // suppresses the click when an actual long-press fired.
              onClick={() => payload && onOpenImage({ data: payload.data, mimeType: payload.mimeType, alt: payload.filename })}
              className="block w-full p-0 m-0 cursor-pointer"
              aria-label={payload.filename}
            >
              <img
                src={blobUrl}
                alt={payload.filename}
                className="block w-full object-cover"
                // Cap the thumbnail's height so portrait shots don't run
                // the full thread length; aspectRatio reserves the box so
                // the bubble doesn't reflow once the image decodes.
                style={{ aspectRatio: aspect, maxHeight: '60vh' }}
              />
            </button>
          )
        ) : (
          blobUrl && <video src={blobUrl} controls preload="metadata" className="block w-full" style={{ aspectRatio: aspect, maxHeight: '60vh' }} />
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

/** #91 — a received/sent file/document. No preview — a paperclip + filename +
 *  size; tap to save to the device cache and open via the system chooser. */
function FileBubble({ message, isMine, time, onOpen }: {
  message: ChatMessage; isMine: boolean; time: string;
  onOpen: (payload: MediaPayload) => void;
}) {
  const { t } = useTranslation();
  let payload: MediaPayload | null = null;
  try { payload = JSON.parse(message.plaintext) as MediaPayload; } catch { /* ignore */ }
  if (!payload) return null;
  const p = payload;
  return (
    <button
      type="button"
      onClick={() => onOpen(p)}
      className={`max-w-[78%] rounded-2xl px-3 py-2.5 flex items-center gap-3 text-left active:opacity-90 ${isMine ? 'rounded-br-md' : 'rounded-bl-md'}`}
      style={{
        backgroundColor: isMine ? 'var(--color-accent)' : 'var(--color-surface)',
        color: isMine ? 'var(--color-accent-fg)' : 'var(--color-text)',
        border: isMine ? 'none' : '1px solid var(--color-border-soft)',
      }}
    >
      <span
        className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
        style={{
          backgroundColor: isMine ? 'rgba(255,255,255,0.18)' : 'var(--color-accent-dim)',
          color: isMine ? 'var(--color-accent-fg)' : 'var(--color-accent-dark)',
        }}
      >
        <Ico name="paperclip" size={20} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-medium truncate">{p.filename}</span>
        <span className="block text-[11px] opacity-75">
          {typeof p.size === 'number' && p.size >= 0 ? `${formatBytes(p.size)} · ` : ''}{t('chat.tapToOpen', 'Tap to open')}
        </span>
      </span>
      <span className="flex items-center gap-1 self-end text-[10px] font-medium opacity-80 flex-shrink-0">
        {message.disappearsAt && <Ico name="clock" size={11} color={isMine ? 'var(--color-accent-fg)' : 'var(--color-text-muted)'} />}
        <time>{time}</time>
        {isMine && <StatusTick status={message.status} />}
      </span>
    </button>
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
  const { t } = useTranslation();
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
            <span>{isMine ? t('chat.youInvited') : t('chat.eventInvite')} · {t(EVENT_TYPE_LABELS[data.eventType])}</span>
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
          <span>{t('chat.tapToRsvp')}</span>
          <time>{time}</time>
        </div>
      </button>
    </div>
  );
}

function EventRsvpBubble({ message, isMine, time }: { message: ChatMessage; isMine: boolean; time: string }) {
  const { t } = useTranslation();
  let data: EventRsvpPayload | null = null;
  try { data = JSON.parse(message.plaintext) as EventRsvpPayload; } catch { /* ignore */ }
  if (!data) return null;
  const status = data.status;
  const label = isMine
    ? (status === 'going' ? t('chat.youreGoing') : status === 'maybe' ? t('chat.youreMaybe') : t('chat.youreNo'))
    : (status === 'going' ? t('chat.rsvpGoing') : status === 'maybe' ? t('chat.rsvpMaybe') : t('chat.rsvpNo'));
  return (
    <div className="flex justify-center">
      <span className="px-3 py-1 rounded-full text-xs text-[var(--color-text-muted)] bg-[var(--color-surface-muted)]">
        {label} · {time}
      </span>
    </div>
  );
}

function EventCancelBubble({ message, isMine, time }: { message: ChatMessage; isMine: boolean; time: string }) {
  const { t } = useTranslation();
  let data: EventCancelPayload | null = null;
  try { data = JSON.parse(message.plaintext) as EventCancelPayload; } catch { /* ignore */ }
  void data;
  return (
    <div className="flex justify-center">
      <span className="px-3 py-1 rounded-full text-xs text-[var(--color-red)] bg-[var(--color-red-dim)]">
        {t('chat.eventCanceled')} · {time}{isMine ? t('chat.byYou') : ''}
      </span>
    </div>
  );
}

function DeletedBubble({ isMine, time }: { isMine: boolean; time: string }) {
  const { t } = useTranslation();
  return (
    <div className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-[14px] italic ${isMine ? 'rounded-br-md' : 'rounded-bl-md'} flex items-center gap-2`}
        style={{
          backgroundColor: 'var(--color-surface-muted)',
          color: 'var(--color-text-faint)',
          border: '1px dashed var(--color-border)',
        }}
      >
        <Ico name="trash" size={14} color="var(--color-text-faint)" />
        <span>{t('chat.messageDeleted')}</span>
        <time className="ml-2 not-italic text-[10px]">{time}</time>
      </div>
    </div>
  );
}

function TimerChangeChip({ message, isMine, time }: { message: ChatMessage; isMine: boolean; time: string }) {
  const { t } = useTranslation();
  let data: SystemTimerChangePayload | null = null;
  try { data = JSON.parse(message.plaintext) as SystemTimerChangePayload; } catch { /* ignore */ }
  if (!data) return null;
  const label = data.timerSec === 0
    ? (isMine ? t('chat.timerOffYou') : t('chat.timerOffThey'))
    : (isMine
        ? t('chat.timerSetYou', { label: formatTimerLabel(data.timerSec, t) })
        : t('chat.timerSetThey', { label: formatTimerLabel(data.timerSec, t) }));
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
  const { t } = useTranslation();
  if (status === 'queued') return <span title={t('chat.statusQueued')}>⋯</span>;
  if (status === 'sent') return <span title={t('chat.statusSent')}>✓</span>;
  if (status === 'delivered') return <span title={t('chat.statusDelivered')}>✓✓</span>;
  if (status === 'read') {
    return <span title={t('chat.statusRead')} style={{ color: 'var(--color-accent)' }}>✓✓</span>;
  }
  if (status === 'failed') return <span title={t('chat.statusFailed')}>!</span>;
  return null;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── R6: view-once media bubble + fullscreen viewer ────────────────────

function ViewOnceMediaBubble({ message, isMine, time, onOpen }: {
  message: ChatMessage; isMine: boolean; time: string; onOpen: () => void;
}) {
  const { t } = useTranslation();
  let payload: MediaPayload | null = null;
  try { payload = JSON.parse(message.plaintext) as MediaPayload; } catch { /* ignore */ }
  const viewed = !!message.viewed;
  const isVideo = message.kind === 'video';

  // Sender side, not yet viewed: small "waiting" placeholder; we never
  // re-display the bytes after send.
  const senderUnviewed = isMine && !viewed;
  // Recipient side, not yet viewed: blurred placeholder, tap to reveal.
  const recipientUnviewed = !isMine && !viewed;

  return (
    <button
      type="button"
      onClick={() => { if (recipientUnviewed) onOpen(); }}
      disabled={!recipientUnviewed}
      className={`max-w-[78%] rounded-2xl overflow-hidden text-left ${isMine ? 'rounded-br-md' : 'rounded-bl-md'} ${recipientUnviewed ? 'active:opacity-80' : ''}`}
      style={{
        backgroundColor: isMine ? 'var(--color-accent)' : 'var(--color-surface)',
        border: isMine ? 'none' : '1px solid var(--color-border-soft)',
      }}
    >
      <div
        className="flex items-center gap-3 px-4 py-4 min-w-[200px]"
        style={{ color: isMine ? 'var(--color-accent-fg)' : 'var(--color-text)' }}
      >
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
          style={{
            backgroundColor: isMine ? 'rgba(255,255,255,0.18)' : 'var(--color-accent-dim)',
            color: isMine ? '#FFFFFF' : 'var(--color-accent-dark)',
          }}
        >
          <Ico name={isVideo ? 'video' : 'image'} size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[14px] font-semibold">
            {viewed
              ? t('chat.viewed')
              : senderUnviewed
                ? (isVideo ? t('chat.videoViewOnce') : t('chat.photoViewOnce'))
                : (isVideo ? t('chat.tapViewVideoOnce') : t('chat.tapViewPhotoOnce'))}
          </div>
          <div className="text-[11px] opacity-80">
            {viewed
              ? (isMine ? t('chat.recipientViewed') : t('chat.youViewedThis'))
              : senderUnviewed
                ? t('chat.waiting', { size: payload ? formatBytes(payload.size) : '—' })
                : t('chat.opensOnce')}
          </div>
        </div>
        <Ico name="clock" size={16} color={isMine ? 'rgba(255,255,255,0.85)' : 'var(--color-text-muted)'} />
      </div>
      <div
        className="px-4 py-1.5 text-[10px] font-medium opacity-80 flex items-center justify-end gap-1 border-t"
        style={{
          color: isMine ? 'var(--color-accent-fg)' : 'var(--color-text-muted)',
          borderColor: isMine ? 'rgba(255,255,255,0.15)' : 'var(--color-border-soft)',
        }}
      >
        {message.disappearsAt && <Ico name="clock" size={11} color={isMine ? 'var(--color-accent-fg)' : 'var(--color-text-muted)'} />}
        <time>{time}</time>
        {isMine && <StatusTick status={message.status} />}
      </div>
    </button>
  );
}

function ViewOnceViewer({ message, onDismiss }: { message: ChatMessage; onDismiss: () => void }) {
  const { t } = useTranslation();
  let payload: MediaPayload | null = null;
  try { payload = JSON.parse(message.plaintext) as MediaPayload; } catch { /* ignore */ }
  useEffect(() => registerBackHandler(onDismiss), [onDismiss]);

  // P4-3: same blob-URL memoization as MediaBubble. View-once is a
  // single render so the win is smaller, but keeping the pattern
  // consistent removes the one remaining data:base64,... in this file.
  const blobUrl = useBlobUrl(payload?.data, payload?.mimeType);

  if (!payload) {
    onDismiss();
    return null;
  }
  const isVideo = message.kind === 'video';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="View once"
      className="fixed inset-0 z-50 flex flex-col bg-black"
    >
      <header className="flex items-center justify-between px-4 h-12 safe-top">
        <span className="text-xs text-white/80 uppercase tracking-wide flex items-center gap-2">
          <Ico name="clock" size={14} color="rgba(255,255,255,0.85)" />
          {t('chat.viewOnce')}
        </span>
        <button
          onClick={onDismiss}
          aria-label={t('chat.closeWillWipe')}
          className="w-9 h-9 rounded-full flex items-center justify-center"
          style={{ backgroundColor: 'rgba(255,255,255,0.15)', color: '#FFFFFF' }}
        >
          <Ico name="x" size={20} color="#FFFFFF" />
        </button>
      </header>
      <div className="flex-1 flex items-center justify-center px-2 py-2">
        {isVideo ? (
          blobUrl && <video src={blobUrl} controls autoPlay className="max-w-full max-h-full" />
        ) : (
          blobUrl && <img src={blobUrl} alt="" className="max-w-full max-h-full object-contain" />
        )}
      </div>
      <footer className="px-4 py-3 text-center text-xs text-white/70 safe-bottom">
        {t('chat.closeToDelete')}
      </footer>
    </div>
  );
}

