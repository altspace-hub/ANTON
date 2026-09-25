/**
 * stream-notices-reset.test.ts — a run's notices ('web search was not run',
 * 'the answer was cut off') belong to that run.
 *
 * Showcase review L13 (2026-09-25): resetStreamOutput() — what ModulePage's
 * init effect and clearSession() call when the module or session changes —
 * cleared the stream text and the reasoning-chain progress but not
 * streamNotices, so another session (a Claude run too) kept showing the
 * previous compat run's warnings until a new stream started.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useStreamStore } from '../../src/stores/useStreamStore';

const noop = () => {};

function notice(code: string, message: string) {
  useStreamStore.getState().handleStreamEvent({ type: 'notice', code, message }, 's1', noop);
}

beforeEach(() => {
  useStreamStore.getState().startStreaming();
  useStreamStore.getState().stopStreaming();
});

describe('stream notices', () => {
  it('are cleared when the module or session changes (resetStreamOutput)', () => {
    useStreamStore.getState().startStreaming();
    notice('web_search_not_run', 'Web search was not run on this model.');
    notice('length', 'The answer was cut off at the length limit.');
    useStreamStore.getState().stopStreaming();
    expect(useStreamStore.getState().streamNotices).toHaveLength(2);

    useStreamStore.getState().resetStreamOutput();
    expect(useStreamStore.getState().streamNotices).toEqual([]);
  });

  it('stay under the answer once the run ends, one per code (negative control)', () => {
    useStreamStore.getState().startStreaming();
    notice('web_search_not_run', 'Web search was not run on this model.');
    notice('web_search_not_run', 'Web search was not run on this model.');
    useStreamStore.getState().stopStreaming();
    expect(useStreamStore.getState().streamNotices).toEqual([
      { code: 'web_search_not_run', message: 'Web search was not run on this model.' },
    ]);
  });

  it('are cleared when the next run starts', () => {
    useStreamStore.getState().startStreaming();
    notice('length', 'The answer was cut off at the length limit.');
    useStreamStore.getState().startStreaming();
    expect(useStreamStore.getState().streamNotices).toEqual([]);
  });
});
