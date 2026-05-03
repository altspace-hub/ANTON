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

import { Btn, Ico } from '../components/ui';
import type { MailMessage } from '../services/mail';

interface Props {
  message: MailMessage;
  onBack: () => void;
  onOpenInPro: () => void;     // jump to the Pro ChatPage for full reply
}

export default function StdThreadScreen({ message, onBack, onOpenInPro }: Props): JSX.Element {
  // Heuristic: if the deep_link looks like an approval, surface a card-style row
  const isApproval = !!message.deep_link?.startsWith('/approvals');

  return (
    <div className="flex flex-1 flex-col overflow-hidden" style={{ background: 'var(--color-bg)' }}>
      {/* Top bar */}
      <div
        className="flex items-start gap-3 px-[18px] py-3"
        style={{ background: 'var(--color-bg)' }}
      >
        <button
          onClick={onBack}
          aria-label="Back"
          className="-ml-2.5 flex h-11 w-11 flex-shrink-0 items-center justify-center"
        >
          <Ico name="chevronLeft" color="var(--color-text)" size={26} />
        </button>
        <div className="flex-1">
          <div
            className="text-[var(--color-text)]"
            style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.4px', lineHeight: 1.1 }}
          >
            {message.from_name}
          </div>
          <div className="mt-1 text-sm text-[var(--color-text-muted)]">
            {message.provider === 'anton' ? 'Here to help' : 'External sender'}
          </div>
        </div>
      </div>

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
              fontSize: 16,
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
                style={{ color: 'var(--color-text-muted)', fontSize: 13, marginBottom: 6 }}
              >
                Approval needed
              </div>
              <div
                className="text-[var(--color-text)]"
                style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.3px' }}
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

        {/* Friendly hand-off note */}
        <div
          className="mx-auto mt-3 max-w-[86%] text-center text-[13px] leading-relaxed text-[var(--color-text-muted)]"
        >
          To reply or ask follow-up questions, tap <b>Open in chat</b> below.
        </div>
      </div>

      {/* Composer (hand-off to Pro chat). FM10: removed the redundant mic
          button — it routed to the same place as Open-in-chat, suggesting
          a voice-input affordance that doesn't exist here. Voice lives in
          the dedicated VoiceMode overlay, not in the thread footer. */}
      <div
        className="flex flex-shrink-0 items-center gap-3 px-3.5 py-3"
        style={{ background: 'var(--color-surface)', borderTop: '1px solid var(--color-border)' }}
      >
        <Btn variant="primary" size="md" block onClick={onOpenInPro}>
          Open in chat
        </Btn>
      </div>
    </div>
  );
}
