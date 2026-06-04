/**
 * message-preview.ts — build a short, one-line notification body for an inbound
 * message, per ContentKind. Pure + dependency-free so it's trivially testable.
 *
 * `plaintext` is the stored ChatMessage.plaintext: for `text` it's the message
 * text; for media / poll / location / sticker / event_invite it's a JSON string
 * of the wire payload (see applyInboundMessage in chat.ts).
 *
 * Returns null for low-signal meta kinds (rsvp / cancel / timer-change) that
 * should NOT raise a notification.
 */
import type { ContentKind } from './messages';

const MAX = 140;

function clip(s: string): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > MAX ? `${t.slice(0, MAX - 1)}…` : t;
}

/** Best-effort: pull a trimmed string field out of a JSON-encoded payload. */
function jsonField(plaintext: string, field: string): string | undefined {
  try {
    const o = JSON.parse(plaintext) as Record<string, unknown>;
    const v = o[field];
    return typeof v === 'string' && v.trim() ? v.trim() : undefined;
  } catch {
    return undefined;
  }
}

export function notificationPreviewFor(kind: ContentKind, plaintext: string): string | null {
  switch (kind) {
    case 'text':
      return clip(plaintext) || '💬 Message';
    case 'image':
      return '📷 Photo';
    case 'video':
      return '🎥 Video';
    case 'voice':
      return '🎤 Voice message';
    case 'file': {
      const fn = jsonField(plaintext, 'filename');
      return fn ? `📎 ${clip(fn)}` : '📎 File';
    }
    case 'poll': {
      const q = jsonField(plaintext, 'question');
      return q ? `📊 ${clip(q)}` : '📊 Poll';
    }
    case 'location':
      return '📍 Location';
    case 'sticker':
      return '💟 Sticker';
    case 'event_invite': {
      const title = jsonField(plaintext, 'title');
      return title ? `📅 ${clip(title)}` : '📅 Event invite';
    }
    // Low-signal system / meta bubbles — never notify.
    case 'event_rsvp':
    case 'event_cancel':
    case 'system_timer_change':
      return null;
  }
}
