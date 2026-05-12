/**
 * VoiceRecorder — hold-to-record button + Telegram-style swipe gestures.
 *
 * States: 'idle' | 'recording' | 'locked'
 *
 * idle      : 44x44 mic button. pointerdown starts recording.
 * recording : composer row shows timer + "← Slide to cancel"; mic follows
 *             the finger. Swipe left past CANCEL_THRESHOLD → cancel hint.
 *             Swipe up past LOCK_THRESHOLD → locked.
 *             pointerup → finalise (or cancel if past threshold).
 * locked    : recording continues, finger no longer held. Big timer +
 *             cancel + send buttons. User taps send to stop & deliver.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Ico } from './Ico';
import {
  startRecording,
  isVoiceWithinRelayCap,
  MAX_RECORDING_SEC,
  type RecordingHandle,
  type VoiceRecording,
} from '../services/voice';

interface Props {
  onSend: (rec: VoiceRecording) => Promise<void> | void;
  onError: (msg: string) => void;
  disabled?: boolean;
}

const CANCEL_THRESHOLD_PX = 90;
const LOCK_THRESHOLD_PX = 80;

type State = 'idle' | 'recording' | 'locked';

export default function VoiceRecorder({ onSend, onError, disabled }: Props) {
  const [state, setState] = useState<State>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [dx, setDx] = useState(0);
  const [dy, setDy] = useState(0);
  const handleRef = useRef<RecordingHandle | null>(null);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTicker = useCallback(() => {
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
  }, []);

  // ── Lifecycle: clean up ticker + active recording on unmount ──────────
  useEffect(() => () => {
    stopTicker();
    handleRef.current?.cancel();
    handleRef.current = null;
  }, [stopTicker]);

  // ── Start a recording on pointerdown ──────────────────────────────────
  const onPointerDown = useCallback(async (e: React.PointerEvent<HTMLButtonElement>) => {
    if (disabled || state !== 'idle') return;
    e.preventDefault();
    (e.currentTarget as HTMLButtonElement).setPointerCapture?.(e.pointerId);
    startPosRef.current = { x: e.clientX, y: e.clientY };
    setDx(0); setDy(0);
    try {
      const h = await startRecording();
      handleRef.current = h;
      setState('recording');
      setElapsed(0);
      tickRef.current = setInterval(() => {
        const sec = handleRef.current?.elapsedSec() ?? 0;
        setElapsed(sec);
        if (sec >= MAX_RECORDING_SEC) {
          // auto-stop reached inside the service; finalise here too
          void finishAndSend();
        }
      }, 100);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to start recording';
      onError(msg);
      setState('idle');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled, state, onError]);

  // ── Track swipe deltas ────────────────────────────────────────────────
  const onPointerMove = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (state !== 'recording' || !startPosRef.current) return;
    setDx(e.clientX - startPosRef.current.x);
    setDy(e.clientY - startPosRef.current.y);
  }, [state]);

  // ── Release → cancel / send / nothing (if locked) ─────────────────────
  const onPointerUp = useCallback(async () => {
    if (state !== 'recording') return;
    const willCancel = dx < -CANCEL_THRESHOLD_PX;
    const willLock = dy < -LOCK_THRESHOLD_PX;
    if (willLock) {
      setState('locked');
      setDx(0); setDy(0);
      return;
    }
    if (willCancel) {
      cancelRecording();
      return;
    }
    await finishAndSend();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, dx, dy]);

  const cancelRecording = useCallback(() => {
    stopTicker();
    handleRef.current?.cancel();
    handleRef.current = null;
    startPosRef.current = null;
    setState('idle');
    setDx(0); setDy(0);
    setElapsed(0);
  }, [stopTicker]);

  const finishAndSend = useCallback(async () => {
    stopTicker();
    const h = handleRef.current;
    handleRef.current = null;
    startPosRef.current = null;
    if (!h) { setState('idle'); return; }
    try {
      const rec = await h.stop();
      setState('idle');
      setDx(0); setDy(0);
      setElapsed(0);
      if (!isVoiceWithinRelayCap(rec)) {
        onError('Recording too long for inline send. Try under 60 seconds.');
        return;
      }
      await onSend(rec);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Recording failed';
      onError(msg);
      setState('idle');
    }
  }, [onSend, onError, stopTicker]);

  // ── Render ────────────────────────────────────────────────────────────
  if (state === 'idle') {
    return (
      <button
        aria-label="Hold to record voice"
        disabled={disabled}
        onPointerDown={(e) => void onPointerDown(e)}
        onPointerMove={onPointerMove}
        onPointerUp={() => void onPointerUp()}
        onPointerCancel={() => cancelRecording()}
        onContextMenu={(e) => e.preventDefault()}
        className="w-10 h-10 rounded-full flex items-center justify-center select-none disabled:opacity-40"
        style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-fg)', touchAction: 'none' }}
      >
        <Ico name="mic" size={20} />
      </button>
    );
  }

  const cancelProgress = Math.min(1, Math.max(0, -dx / CANCEL_THRESHOLD_PX));
  const willCancel = -dx >= CANCEL_THRESHOLD_PX;

  return (
    <>
      {/* Inline mic-follow + cancel-hint shown above the composer footer */}
      <div
        role="status"
        aria-live="polite"
        className="absolute left-0 right-0 bottom-0 z-50 bg-[var(--color-surface)] border-t border-[var(--color-border-soft)] safe-bottom"
        style={{ touchAction: 'none' }}
      >
        <div className="flex items-center gap-3 px-3 py-3 min-h-16">
          {state === 'recording' ? (
            <>
              {/* Pulsing red dot + timer */}
              <span className="flex items-center gap-2 text-[var(--color-text)] text-sm font-medium tabular-nums">
                <span className="w-2.5 h-2.5 rounded-full animate-pulse" style={{ backgroundColor: 'var(--color-red)' }} />
                {formatDuration(elapsed)}
              </span>
              {/* Slide-to-cancel hint, fades out as user drags left */}
              <span
                className="flex-1 text-sm text-[var(--color-text-muted)] truncate"
                style={{ opacity: 1 - cancelProgress, transform: `translateX(${dx * 0.4}px)` }}
              >
                <span className="mr-1">‹</span>
                {willCancel ? 'Release to cancel' : 'Slide to cancel'}
              </span>
              {/* Lock affordance, hidden when finger has moved noticeably down */}
              <span
                className="text-xs text-[var(--color-text-faint)] flex flex-col items-center gap-1"
                style={{ opacity: dy < -10 ? 1 : 0.5 }}
              >
                <Ico name="lock" size={16} />
                <span>lock</span>
              </span>
              {/* The mic button stays focused — follows finger up to lock threshold */}
              <button
                aria-label="Recording — release to send, slide left to cancel"
                onPointerMove={onPointerMove}
                onPointerUp={() => void onPointerUp()}
                onPointerCancel={() => cancelRecording()}
                className="w-12 h-12 rounded-full flex items-center justify-center select-none"
                style={{
                  backgroundColor: willCancel ? 'var(--color-red)' : 'var(--color-accent)',
                  color: 'var(--color-accent-fg)',
                  transform: `translate(${Math.min(0, dx)}px, ${Math.min(0, dy)}px) scale(${1 + Math.min(0.3, elapsed / 60)})`,
                  touchAction: 'none',
                }}
              >
                <Ico name={willCancel ? 'trash' : 'mic'} size={22} />
              </button>
            </>
          ) : (
            // ── Locked state ────────────────────────────────────────────
            <>
              <button
                onClick={cancelRecording}
                aria-label="Cancel recording"
                className="w-10 h-10 rounded-full flex items-center justify-center text-[var(--color-red)]"
                style={{ backgroundColor: 'var(--color-surface-muted)' }}
              >
                <Ico name="trash" size={20} />
              </button>
              <span className="flex items-center gap-2 text-[var(--color-text)] text-base font-medium tabular-nums flex-1">
                <span className="w-2.5 h-2.5 rounded-full animate-pulse" style={{ backgroundColor: 'var(--color-red)' }} />
                {formatDuration(elapsed)}
                <span className="text-xs text-[var(--color-text-faint)] ml-1">recording</span>
              </span>
              <button
                onClick={() => void finishAndSend()}
                aria-label="Send voice note"
                className="w-12 h-12 rounded-full flex items-center justify-center"
                style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-fg)' }}
              >
                <Ico name="arrowUp" size={22} />
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function formatDuration(sec: number): string {
  const total = Math.max(0, Math.floor(sec));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
