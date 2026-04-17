/**
 * VoiceInput — Telegram-style hold-to-talk per spec §8.4.
 *
 * Press-and-hold (or tap-to-toggle as a fallback for keyboard / mouse
 * users) records via the platform's native speech engine, with live
 * captions streaming as partials arrive. Releasing sends the final
 * transcript to the parent.
 *
 * Engine ladder:
 *   1. Capacitor native (@capacitor-community/speech-recognition) —
 *      iOS Speech framework / Android SpeechRecognizer
 *   2. Web Speech API (window.SpeechRecognition) — desktop browsers
 *   3. Hidden if neither is available — the parent should also expose
 *      a typed input (spec §8.4 "Type to ANTON" pattern).
 */

import { useEffect, useRef, useState } from 'react';
import { tick, light, error as hapticError } from '../services/haptics';

interface Props {
  onTranscript: (text: string) => void;
  disabled?: boolean;
}

const WebSpeechRecognition = typeof window !== 'undefined'
  ? ((window as unknown as Record<string, unknown>).SpeechRecognition || (window as unknown as Record<string, unknown>).webkitSpeechRecognition)
  : null;

let capacitorSpeechAvailable: boolean | null = null;

export default function VoiceInput({ onTranscript, disabled }: Props) {
  const [listening, setListening] = useState(false);
  const [available, setAvailable] = useState<boolean>(!!WebSpeechRecognition);
  const [partialText, setPartialText] = useState('');
  const webRecognitionRef = useRef<{ stop: () => void } | null>(null);
  const holdTimer = useRef<number | null>(null);
  const wasHoldGesture = useRef(false);

  // Detect Capacitor speech once
  useEffect(() => {
    if (capacitorSpeechAvailable !== null) {
      setAvailable(capacitorSpeechAvailable || !!WebSpeechRecognition);
      return;
    }
    void (async () => {
      try {
        const { SpeechRecognition } = await import('@capacitor-community/speech-recognition');
        const { available: isAvail } = await SpeechRecognition.available();
        capacitorSpeechAvailable = isAvail;
        setAvailable(isAvail || !!WebSpeechRecognition);
      } catch {
        capacitorSpeechAvailable = false;
        setAvailable(!!WebSpeechRecognition);
      }
    })();
  }, []);

  // Cleanup on unmount
  useEffect(() => () => {
    if (listening) void stopAndCommit(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function start(): Promise<void> {
    if (listening) return;
    setPartialText('');
    setListening(true);
    void tick();   // medium impact when recording starts (spec §9.4)

    // Capacitor native
    if (capacitorSpeechAvailable) {
      try {
        const { SpeechRecognition } = await import('@capacitor-community/speech-recognition');
        const perm = await SpeechRecognition.requestPermissions().catch(() => null);
        if (perm && (perm as { speechRecognition: string }).speechRecognition !== 'granted') {
          await hapticError();
          setListening(false);
          return;
        }
        await SpeechRecognition.removeAllListeners();
        await SpeechRecognition.addListener('partialResults', (data: { matches: string[] }) => {
          if (data.matches?.[0]) setPartialText(data.matches[0]);
        });
        await SpeechRecognition.start({ language: navigator.language || 'en-US', popup: false, partialResults: true });
        return;
      } catch {
        // Fall through to Web Speech
      }
    }

    // Web Speech fallback
    if (WebSpeechRecognition) {
      try {
        type RecCtor = new () => {
          continuous: boolean; interimResults: boolean; lang: string;
          onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string; isFinal?: boolean }> & { isFinal: boolean }> }) => void;
          onend: () => void; onerror: () => void;
          start: () => void; stop: () => void;
        };
        const recognition = new (WebSpeechRecognition as RecCtor)();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = navigator.language || 'en-US';
        recognition.onresult = (event) => {
          let collected = '';
          for (let i = 0; i < event.results.length; i++) {
            const r = event.results[i];
            collected += r[0]?.transcript ?? '';
          }
          setPartialText(collected.trim());
        };
        recognition.onend = () => setListening(false);
        recognition.onerror = () => { void hapticError(); setListening(false); };
        webRecognitionRef.current = recognition;
        recognition.start();
        return;
      } catch {
        await hapticError();
        setListening(false);
      }
    } else {
      setListening(false);
    }
  }

  async function stopAndCommit(commit = true): Promise<void> {
    if (!listening && !partialText) return;
    void light();

    if (capacitorSpeechAvailable) {
      try {
        const { SpeechRecognition } = await import('@capacitor-community/speech-recognition');
        await SpeechRecognition.stop();
        await SpeechRecognition.removeAllListeners();
      } catch { /* swallow */ }
    }
    if (webRecognitionRef.current) {
      try { webRecognitionRef.current.stop(); } catch { /* swallow */ }
      webRecognitionRef.current = null;
    }

    if (commit && partialText.trim()) onTranscript(partialText.trim());
    setListening(false);
    setPartialText('');
  }

  // ── Hold gesture handlers ──────────────────────────────────────────

  function onPointerDown() {
    wasHoldGesture.current = false;
    if (holdTimer.current) window.clearTimeout(holdTimer.current);
    holdTimer.current = window.setTimeout(() => {
      wasHoldGesture.current = true;
      void start();
    }, 200);                                  // 200ms = "hold" not "tap"
  }

  function onPointerUp() {
    if (holdTimer.current) { window.clearTimeout(holdTimer.current); holdTimer.current = null; }
    if (wasHoldGesture.current) {
      void stopAndCommit(true);
    } else if (!listening) {
      // Treat as tap-to-toggle (accessibility / keyboard / mouse users)
      void start();
    } else {
      // Tap while listening = commit
      void stopAndCommit(true);
    }
  }

  function onPointerCancel() {
    if (holdTimer.current) { window.clearTimeout(holdTimer.current); holdTimer.current = null; }
    if (listening) void stopAndCommit(false);
  }

  if (!available) return null;

  return (
    <div className="relative">
      <button
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onPointerLeave={onPointerCancel}
        disabled={disabled}
        aria-label={listening ? 'Stop recording' : 'Hold to talk, tap to toggle'}
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-all touch-none select-none active:scale-90 disabled:opacity-25 ${
          listening
            ? 'bg-adv-red text-white shadow-lg shadow-adv-red/30 ring-4 ring-adv-red/20 animate-pulse'
            : 'bg-adv-card border border-border text-adv-gray hover:text-adv-teal hover:border-adv-teal/30'
        }`}
      >
        {listening ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            <line x1="12" y1="19" x2="12" y2="23"/>
            <line x1="8" y1="23" x2="16" y2="23"/>
          </svg>
        )}
      </button>

      {/* Live captions popover (spec §8.4) */}
      {listening && (
        <div className="absolute bottom-14 left-1/2 -translate-x-1/2 max-w-[280px] rounded-lg bg-adv-red/95 px-3 py-1.5 text-xs text-white shadow-lg backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
            {partialText ? (
              <span className="line-clamp-2 break-words">{partialText}</span>
            ) : (
              <span>Listening… release to send</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
