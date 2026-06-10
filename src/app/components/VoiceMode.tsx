/**
 * VoiceMode — full-screen voice overlay per spec §8.4.
 *
 * Push-to-talk by default; releases the mic to send. Captions stream as
 * the instance responds. TTS plays the response back through the
 * platform synthesiser. Barge-in stops TTS the moment the user taps the
 * mic again.
 *
 * For now this is a skeleton — the wire-up to the chat sender lives in
 * Phase F (FAB Quick Actions). The component itself is fully functional
 * as a stand-alone voice loop that the parent wires to its query
 * service via the onSubmit prop.
 */

import { useEffect, useRef, useState } from 'react';
import { tick, light, success, error as hapticError } from '../services/haptics';
import * as TTS from '../services/tts';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useVoiceRecognizer } from '../hooks/useVoiceRecognizer';
import { registerBackHandler } from '../services/back-stack';
import { Ico } from './ui';

export interface VoiceModeProps {
  /** Called with the final user transcript when the user releases the mic. */
  onSubmit: (transcript: string) => Promise<{ reply: string } | null>;
  onClose: () => void;
}

type Phase = 'idle' | 'listening' | 'thinking' | 'speaking';

export default function VoiceMode({ onSubmit, onClose }: VoiceModeProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const rec = useVoiceRecognizer();
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, true);

  // Esc to close (web) + Android hardware back (ANL11). Without the
  // back-stack registration, pressing Android back while VoiceMode is open
  // falls through to the App-level handler and exits the app instead of
  // dismissing the overlay.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    const unregister = registerBackHandler(onClose);
    return () => {
      window.removeEventListener('keydown', onKey);
      unregister();
    };
  }, [onClose]);
  const [reply, setReply] = useState('');
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const holdTimer = useRef<number | null>(null);

  // The recogniser owns the live partial transcript + any recognition error;
  // phase drives only the visual state machine (idle → listening → thinking →
  // speaking). Surfacing rec.error means the UI reflects REAL failures, not a
  // fake listening boolean.
  const { listening, partial, error: recError, start: recStart, stopAndGet, reset: recReset } = rec;

  useEffect(() => {
    // Body scroll lock
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; TTS.stop(); };
  }, []);

  // If the recogniser errors out while we're showing the listening orb,
  // pull the visual phase back to idle so the orb stops pulsing. Guarded on
  // recError so a normal stop-and-send (which also clears listening) doesn't
  // race the transition into 'thinking'.
  useEffect(() => {
    if (phase === 'listening' && recError) setPhase('idle');
  }, [phase, recError]);

  async function startListen(): Promise<void> {
    if (phase !== 'idle' && phase !== 'speaking') return;
    if (phase === 'speaking') TTS.stop();        // barge-in
    setReply('');
    setSubmitErr(null);
    recReset();
    void tick();
    await recStart();
    if (rec.unavailable) { await hapticError(); setPhase('idle'); return; }
    // recStart sets rec.listening; only enter the listening visual if it took.
    setPhase('listening');
  }

  async function stopAndSend(): Promise<void> {
    if (phase !== 'listening') return;
    void light();

    const text = await stopAndGet();
    if (!text) { setPhase('idle'); return; }
    setPhase('thinking');
    try {
      const result = await onSubmit(text);
      if (!result) { setPhase('idle'); return; }
      setReply(result.reply);
      setPhase('speaking');
      void success();
      // Speak the reply
      await TTS.speak(result.reply, {
        language: navigator.language || 'en',
        onEnd: () => setPhase('idle'),
      });
    } catch (e) {
      setSubmitErr(e instanceof Error ? e.message : String(e));
      void hapticError();
      setPhase('idle');
    }
  }

  const errMsg = recError ?? submitErr;

  // Press-and-hold handlers
  function onDown() {
    // Phase H fix UX-H4 — barge-in is immediate. Tapping the mic during
    // TTS playback kills speech instantly without waiting for the 150ms
    // hold debounce.
    if (phase === 'speaking') TTS.stop();
    if (holdTimer.current) window.clearTimeout(holdTimer.current);
    holdTimer.current = window.setTimeout(() => { void startListen(); }, 150);
  }
  function onUp() {
    if (holdTimer.current) { window.clearTimeout(holdTimer.current); holdTimer.current = null; }
    if (phase === 'listening') void stopAndSend();
    else if (phase === 'speaking') { TTS.stop(); setPhase('idle'); }
    else if (phase === 'idle') void startListen();   // tap-to-toggle fallback
  }

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-50 flex flex-col items-center justify-between p-6 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] safe-top safe-bottom"
      style={{ background: 'var(--color-bg)' }}
      role="dialog"
      aria-modal="true"
      aria-label="Voice mode"
    >
      <div className="w-full flex items-center justify-between">
        <button
          onClick={onClose}
          aria-label="Close voice mode"
          className="flex items-center justify-center rounded-full transition active:scale-[0.95]"
          style={{
            width: 44, height: 44,
            background: 'var(--color-surface)',
            color: 'var(--color-text-muted)',
            border: '1px solid var(--color-border)',
          }}
        >
          <Ico name="x" size={20} />
        </button>
        <span
          className="font-mono text-[0.6875rem] uppercase"
          style={{ color: 'var(--color-text-muted)', letterSpacing: '0.6px' }}
        >
          Voice mode
        </span>
        <span aria-hidden="true" className="w-11" />
      </div>

      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <div
          className="font-mono text-[0.6875rem] uppercase"
          style={{ color: 'var(--color-accent)', letterSpacing: '0.6px' }}
        >
          {labelFor(phase)}
        </div>
        {phase === 'listening' && partial && (
          <div
            className="mt-4 max-w-md text-[1.125rem] leading-relaxed"
            style={{ color: 'var(--color-text)' }}
          >
            {partial}
          </div>
        )}
        {phase === 'thinking' && (
          <div className="mt-4 text-[0.9375rem]" style={{ color: 'var(--color-text-muted)' }}>
            Thinking…
          </div>
        )}
        {phase === 'speaking' && reply && (
          <div
            className="mt-4 max-w-md text-[0.9375rem] leading-relaxed"
            style={{ color: 'var(--color-text)' }}
          >
            {reply}
          </div>
        )}
        {errMsg && (
          <div
            role="alert"
            className="mt-4 text-[0.8125rem]"
            style={{ color: 'var(--color-red)' }}
          >
            {errMsg}
          </div>
        )}
      </div>

      <div className="flex flex-col items-center gap-3">
        <button
          onPointerDown={onDown}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onPointerLeave={onUp}
          aria-label={phase === 'listening' ? 'Release to send' : 'Hold to talk'}
          className="relative flex items-center justify-center rounded-full transition-transform touch-none select-none"
          style={{
            width: 96, height: 96,
            background: phase === 'listening' ? 'var(--color-red)' : 'var(--color-accent)',
            color: 'var(--color-accent-fg)',
            transform: phase === 'listening' ? 'scale(1.1)' : 'scale(1)',
            boxShadow: phase === 'listening'
              ? '0 12px 32px color-mix(in srgb, var(--color-red) 35%, transparent)'
              : '0 12px 32px color-mix(in srgb, var(--color-accent) 35%, transparent)',
          }}
        >
          <Ico name="mic" size={40} />
          {phase === 'listening' && (
            <>
              <span
                className="absolute inset-0 rounded-full animate-ping"
                style={{ boxShadow: '0 0 0 2px rgba(255,255,255,0.30) inset' }}
              />
              <span
                className="absolute -inset-2 rounded-full animate-ping"
                style={{ animationDelay: '120ms', boxShadow: '0 0 0 2px rgba(255,255,255,0.20) inset' }}
              />
              <span
                className="absolute -inset-4 rounded-full animate-ping"
                style={{ animationDelay: '240ms', boxShadow: '0 0 0 1px rgba(255,255,255,0.12) inset' }}
              />
            </>
          )}
        </button>
        <div className="text-[0.75rem]" style={{ color: 'var(--color-text-muted)' }}>
          {phase === 'idle' && 'Hold to talk · Tap to toggle'}
          {phase === 'listening' && 'Release to send'}
          {phase === 'thinking' && 'Routing to ANTON…'}
          {phase === 'speaking' && 'Tap to interrupt'}
        </div>
      </div>
    </div>
  );
}

function labelFor(p: Phase): string {
  switch (p) {
    case 'idle':      return 'Idle';
    case 'listening': return 'Listening';
    case 'thinking':  return 'Thinking';
    case 'speaking':  return 'Speaking';
  }
}
