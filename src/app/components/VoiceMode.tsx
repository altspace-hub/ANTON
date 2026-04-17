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

export interface VoiceModeProps {
  /** Called with the final user transcript when the user releases the mic. */
  onSubmit: (transcript: string) => Promise<{ reply: string } | null>;
  onClose: () => void;
}

type Phase = 'idle' | 'listening' | 'thinking' | 'speaking';

let capacitorAvailable: boolean | null = null;

const WebSpeech = typeof window !== 'undefined'
  ? ((window as unknown as Record<string, unknown>).SpeechRecognition || (window as unknown as Record<string, unknown>).webkitSpeechRecognition)
  : null;

export default function VoiceMode({ onSubmit, onClose }: VoiceModeProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [partial, setPartial] = useState('');
  const [reply, setReply] = useState('');
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const webRecRef = useRef<{ stop: () => void } | null>(null);
  const holdTimer = useRef<number | null>(null);

  useEffect(() => {
    if (capacitorAvailable !== null) return;
    void (async () => {
      try {
        const { SpeechRecognition } = await import('@capacitor-community/speech-recognition');
        const r = await SpeechRecognition.available();
        capacitorAvailable = r.available;
      } catch { capacitorAvailable = false; }
    })();
    // Body scroll lock
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; TTS.stop(); };
  }, []);

  async function startListen(): Promise<void> {
    if (phase !== 'idle' && phase !== 'speaking') return;
    if (phase === 'speaking') TTS.stop();        // barge-in
    setReply(''); setPartial(''); setErrMsg(null); setPhase('listening');
    void tick();

    if (capacitorAvailable) {
      try {
        const { SpeechRecognition } = await import('@capacitor-community/speech-recognition');
        const perm = await SpeechRecognition.requestPermissions().catch(() => null);
        if (perm && (perm as { speechRecognition: string }).speechRecognition !== 'granted') {
          await hapticError(); setPhase('idle'); return;
        }
        await SpeechRecognition.removeAllListeners();
        await SpeechRecognition.addListener('partialResults', (data: { matches: string[] }) => {
          if (data.matches?.[0]) setPartial(data.matches[0]);
        });
        await SpeechRecognition.start({ language: navigator.language || 'en-US', popup: false, partialResults: true });
        return;
      } catch { /* fall through */ }
    }

    if (WebSpeech) {
      type RecCtor = new () => {
        continuous: boolean; interimResults: boolean; lang: string;
        onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
        onend: () => void; onerror: () => void;
        start: () => void; stop: () => void;
      };
      try {
        const r = new (WebSpeech as RecCtor)();
        r.continuous = true; r.interimResults = true; r.lang = navigator.language || 'en-US';
        r.onresult = (event) => {
          let collected = '';
          for (let i = 0; i < event.results.length; i++) collected += event.results[i][0]?.transcript ?? '';
          setPartial(collected.trim());
        };
        r.onend = () => { /* user-driven stop */ };
        r.onerror = () => { setErrMsg('Speech recognition error.'); setPhase('idle'); };
        webRecRef.current = r;
        r.start();
      } catch { setErrMsg('Speech recognition not available.'); setPhase('idle'); }
    } else {
      setErrMsg('Voice input is not available on this device.'); setPhase('idle');
    }
  }

  async function stopAndSend(): Promise<void> {
    if (phase !== 'listening') return;
    void light();

    if (capacitorAvailable) {
      try {
        const { SpeechRecognition } = await import('@capacitor-community/speech-recognition');
        await SpeechRecognition.stop();
        await SpeechRecognition.removeAllListeners();
      } catch { /* swallow */ }
    }
    if (webRecRef.current) { try { webRecRef.current.stop(); } catch { /* swallow */ } webRecRef.current = null; }

    const text = partial.trim();
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
      setErrMsg(e instanceof Error ? e.message : String(e));
      void hapticError();
      setPhase('idle');
    }
  }

  // Press-and-hold handlers
  function onDown() {
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
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-between bg-gradient-to-b from-adv-dark to-adv-dark-2 p-6 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] safe-top safe-bottom">
      <div className="w-full flex items-center justify-between">
        <button onClick={onClose} aria-label="Close" className="rounded-full bg-adv-card p-2 text-adv-gray hover:text-adv-off-white">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6l-12 12"/></svg>
        </button>
        <span className="text-[11px] uppercase tracking-wider text-adv-gray">Voice mode</span>
        <span aria-hidden="true" className="w-9" />
      </div>

      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <div className="text-[11px] uppercase tracking-wider text-adv-teal">{labelFor(phase)}</div>
        {phase === 'listening' && partial && (
          <div className="mt-4 max-w-md text-lg text-adv-off-white leading-relaxed">{partial}</div>
        )}
        {phase === 'thinking' && (
          <div className="mt-4 text-base text-adv-gray">Thinking…</div>
        )}
        {phase === 'speaking' && reply && (
          <div className="mt-4 max-w-md text-base text-adv-off-white leading-relaxed">{reply}</div>
        )}
        {errMsg && <div className="mt-4 text-sm text-adv-red">{errMsg}</div>}
      </div>

      <div className="flex flex-col items-center gap-3">
        <button
          onPointerDown={onDown}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onPointerLeave={onUp}
          aria-label={phase === 'listening' ? 'Release to send' : 'Hold to talk'}
          className={`relative flex h-24 w-24 items-center justify-center rounded-full transition-transform touch-none select-none ${
            phase === 'listening'
              ? 'scale-110 bg-adv-red text-white shadow-2xl shadow-adv-red/40 ring-8 ring-adv-red/20'
              : 'bg-adv-teal text-adv-dark shadow-2xl shadow-adv-teal/30 hover:scale-105'
          }`}
        >
          <svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/>
            <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" d="M19 10v2a7 7 0 0 1-14 0v-2 M12 19v3 M8 22h8"/>
          </svg>
          {/* Animated waveform ring */}
          {phase === 'listening' && (
            <span className="absolute inset-0 rounded-full ring-2 ring-white/30 animate-ping" />
          )}
        </button>
        <div className="text-[11px] text-adv-gray">
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
