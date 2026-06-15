/**
 * StdThreadScreen — Standard mode message thread (Evolution design).
 *
 * Per design/screens-standard.jsx StdThreadScreen:
 *   • "ANTON · Here to help" top bar with chevron-back
 *   • 16px chat bubbles — ANTON-side surface with one square corner;
 *     user-side accent with mirrored corner
 *   • Optional inline ANTON cards (e.g. "Invoice from {x}, €N, [Review]")
 *   • Composer row with mic button (44px circular)
 *
 * v1: read-only — shows the message subject + preview as the opening
 * ANTON bubble, plus a friendly composer that routes to the existing
 * chat infra. When the user sends, it falls through to the Pro ChatPage
 * (a single SS hand-off keeps the v1 patch small).
 */

import { useState } from 'react';
import { AppHeader, Btn, Ico, Spinner } from '../components/ui';
import type { MailMessage } from '../services/mail';
import { replyToMail } from '../services/api';
import { tick, success as hapticSuccess, error as hapticError } from '../services/haptics';

interface Props {
  orgId: string;
  message: MailMessage;
  onBack: () => void;
  onOpenInPro: () => void;     // jump to the Pro ChatPage for full reply
}

export default function StdThreadScreen({ orgId, message, onBack, onOpenInPro }: Props): JSX.Element {
  // Heuristic: if the deep_link looks like an approval, surface a card-style row
  const isApproval = !!message.deep_link?.startsWith('/approvals');
  // Reply composer state
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [sentAt, setSentAt] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  // ANTON-native messages can reply via the gateway; provider mail
  // (m365/gmail) needs its provider's send pipeline which doesn't
  // exist yet — for those we fall back to the Open-in-chat hand-off.
  const canReplyHere = message.provider === 'anton';

  async function send() {
    if (!reply.trim() || sending) return;
    setSending(true);
    setSendError(null);
    void tick();
    try {
      const result = await replyToMail(orgId, message.id, reply.trim());
      void hapticSuccess();
      setReply('');
      setSentAt(result.sent_at);
    } catch (e) {
      void hapticError();
      setSendError(e instanceof Error ? e.message : 'Failed to send reply');
    }
    setSending(false);
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden" style={{ background: 'var(--color-bg)' }}>
      {/* Top bar */}
      <AppHeader
        variant="large"
        title={message.from_name}
        subtitle={message.provider === 'anton' ? 'Here to help' : 'External sender'}
        onBack={onBack}
      />

      {/* Thread body */}
      <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto px-4 pb-4 pt-2">
        {/* ANTON-style bubble with the original message */}
        <div className="max-w-[86%]">
          <div
            className="px-4 py-3.5 text-[var(--color-text)]"
            style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-r3) var(--radius-r3) var(--radius-r3) 4px',
              fontSize: '1rem',
              lineHeight: 1.45,
            }}
          >
            <div className="font-bold" style={{ marginBottom: 4 }}>{message.subject}</div>
            {message.preview && <div>{message.preview}</div>}
          </div>
        </div>

        {/* Optional inline action card */}
        {isApproval && (
          <div className="max-w-[88%]">
            <div
              className="p-4"
              style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-r3)',
              }}
            >
              <div
                className="font-bold uppercase"
                style={{ color: 'var(--color-text-muted)', fontSize: '0.8125rem', marginBottom: 6 }}
              >
                Approval needed
              </div>
              <div
                className="text-[var(--color-text)]"
                style={{ fontSize: '1.25rem', fontWeight: 700, letterSpacing: '-0.3px' }}
              >
                {message.subject}
              </div>
              <div className="mt-1 text-sm text-[var(--color-text-muted)]">
                Tap below to review and respond.
              </div>
              <Btn
                variant="primary"
                size="lg"
                block
                onClick={onOpenInPro}
                className="mt-3.5"
              >
                Review and approve
              </Btn>
            </div>
          </div>
        )}

        {/* Sent confirmation appears as a user-side bubble */}
        {sentAt && (
          <div className="ml-auto max-w-[86%]">
            <div
              className="px-4 py-3 text-[var(--color-accent-fg)]"
              style={{
                background: 'var(--color-accent)',
                borderRadius: 'var(--radius-r3) var(--radius-r3) 4px var(--radius-r3)',
                fontSize: '1rem',
                lineHeight: 1.45,
              }}
            >
              Reply sent · {new Date(sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        )}

        {/* Hand-off note for non-anton mail (provider send pipeline TBD) */}
        {!canReplyHere && (
          <div
            className="mx-auto mt-3 max-w-[86%] text-center text-sm leading-relaxed text-[var(--color-text-muted)]"
          >
            External mail — open in the desktop ANTON to reply.
          </div>
        )}
      </div>

      {/* Composer — reply inline for ANTON-native; otherwise hand off */}
      {canReplyHere ? (
        <div
          className="safe-bottom flex flex-shrink-0 flex-col gap-2 px-3.5 py-3"
          style={{ background: 'var(--color-surface)', borderTop: '1px solid var(--color-border)' }}
        >
          {sendError && (
            <div
              role="alert"
              className="rounded-[var(--radius-r2)] px-3 py-2 text-xs"
              style={{ background: 'var(--color-red-dim)', color: 'var(--color-red)' }}
            >
              {sendError}
            </div>
          )}
          <div className="flex items-end gap-2">
            <label htmlFor="mail-reply" className="sr-only">Reply</label>
            <textarea
              id="mail-reply"
              value={reply}
              onChange={e => setReply(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); }
              }}
              rows={1}
              placeholder="Write a reply…"
              className="min-h-[44px] flex-1 resize-none rounded-[var(--radius-r2)] px-3 py-2.5 text-sm leading-relaxed focus:outline-none"
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
              disabled={sending || !reply.trim()}
              icon={sending ? <Spinner size="sm" tone="on-accent" /> : <Ico name="arrowUp" color="currentColor" size={16} />}
            >
              Send
            </Btn>
          </div>
        </div>
      ) : (
        <div
          className="flex flex-shrink-0 items-center gap-3 px-3.5 py-3"
          style={{ background: 'var(--color-surface)', borderTop: '1px solid var(--color-border)' }}
        >
          <Btn variant="primary" size="md" block onClick={onOpenInPro}>
            Open in chat
          </Btn>
        </div>
      )}
    </div>
  );
}
