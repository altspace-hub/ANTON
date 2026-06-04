/**
 * active-chat.test.ts — the open-conversation tracker that suppresses a
 * notification for the thread the user is already viewing.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  setActiveConversation,
  getActiveConversation,
  isViewingConversation,
  isAppForeground,
} from '../services/active-chat';

describe('active-chat tracker', () => {
  beforeEach(() => setActiveConversation(null));

  it('round-trips the active conversation', () => {
    expect(getActiveConversation()).toBeNull();
    setActiveConversation('peer-abc');
    expect(getActiveConversation()).toBe('peer-abc');
  });

  it('jsdom defaults to foreground (visible)', () => {
    expect(isAppForeground()).toBe(true);
  });

  it('suppresses ONLY the open thread while foregrounded', () => {
    setActiveConversation('peer-abc');
    expect(isViewingConversation('peer-abc')).toBe(true);  // on this thread → suppress
    expect(isViewingConversation('peer-xyz')).toBe(false); // a different thread → notify
  });

  it('does not suppress when no thread is open (chat list / other tab)', () => {
    setActiveConversation(null);
    expect(isViewingConversation('peer-abc')).toBe(false);
  });
});
