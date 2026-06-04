/**
 * message-preview.test.ts — the inbound-message notification body builder.
 * Pure logic: per-kind labels, JSON-field extraction, clipping, and the
 * null (no-notification) meta kinds.
 */
import { describe, it, expect } from 'vitest';
import { notificationPreviewFor } from '../services/message-preview';

describe('notificationPreviewFor', () => {
  it('uses the text verbatim for a text message', () => {
    expect(notificationPreviewFor('text', 'are we still on?')).toBe('are we still on?');
  });

  it('collapses whitespace and clips very long text', () => {
    const long = 'a'.repeat(300);
    const out = notificationPreviewFor('text', long)!;
    expect(out.length).toBeLessThanOrEqual(140);
    expect(out.endsWith('…')).toBe(true);
    expect(notificationPreviewFor('text', 'hello\n\n  world')).toBe('hello world');
  });

  it('labels media kinds without leaking bytes', () => {
    expect(notificationPreviewFor('image', '{"data":"AAAA"}')).toBe('📷 Photo');
    expect(notificationPreviewFor('video', '{"data":"AAAA"}')).toBe('🎥 Video');
    expect(notificationPreviewFor('voice', '{"data":"AAAA"}')).toBe('🎤 Voice message');
    expect(notificationPreviewFor('location', '{"lat":1,"lng":2}')).toBe('📍 Location');
    expect(notificationPreviewFor('sticker', '{"packId":"x"}')).toBe('💟 Sticker');
  });

  it('shows the filename for a file, falling back when absent', () => {
    expect(notificationPreviewFor('file', JSON.stringify({ filename: 'report.pdf', data: 'AAAA' })))
      .toBe('📎 report.pdf');
    expect(notificationPreviewFor('file', '{"data":"AAAA"}')).toBe('📎 File');
    expect(notificationPreviewFor('file', 'not json')).toBe('📎 File');
  });

  it('shows the poll question / event title when present', () => {
    expect(notificationPreviewFor('poll', JSON.stringify({ question: 'Pizza or sushi?' })))
      .toBe('📊 Pizza or sushi?');
    expect(notificationPreviewFor('poll', '{}')).toBe('📊 Poll');
    expect(notificationPreviewFor('event_invite', JSON.stringify({ title: 'Standup' })))
      .toBe('📅 Standup');
    expect(notificationPreviewFor('event_invite', '{}')).toBe('📅 Event invite');
  });

  it('returns null for low-signal meta kinds (no notification)', () => {
    expect(notificationPreviewFor('event_rsvp', '{}')).toBeNull();
    expect(notificationPreviewFor('event_cancel', '{}')).toBeNull();
    expect(notificationPreviewFor('system_timer_change', '{}')).toBeNull();
  });

  it('text with only whitespace degrades to a generic label, never empty', () => {
    expect(notificationPreviewFor('text', '   ')).toBe('💬 Message');
  });
});
