/**
 * useVoiceRecognizer — shared speech-recognition engine for the
 * companion app's voice surfaces (Pro VoiceMode + Standard StdVoiceScreen).
 *
 * Wraps @capacitor-community/speech-recognition (native Android/iOS) with a
 * Web Speech API fallback (Chrome / WebView). Exposes the *real* listening
 * state and the live partial transcript so callers can drive their own UI
 * (the animated orb, captions, etc.) off ACTUAL recognition — never a fake
 * boolean.
 *
 * Both VoiceMode and StdVoiceScreen previously duplicated / faked this. This
 * is the single source of truth.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

type RecCtor = new () => {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
  onend: () => void;
  onerror: () => void;
  start: () => void;
  stop: () => void;
};

const WebSpeech = typeof window !== 'undefined'
  ? ((window as unknown as Record<string, unknown>).SpeechRecognition
    || (window as unknown as Record<string, unknown>).webkitSpeechRecognition)
  : null;

let capacitorAvailable: boolean | null = null;

export interface VoiceRecognizer {
  /** True only while a recogniser is actively capturing audio. */
  listening: boolean;
  /** Live partial transcript (updates as the user speaks). */
  partial: string;
  /** Non-null when the recogniser failed or is unavailable. */
  error: string | null;
  /** True once we know neither native nor web recognition can run. */
  unavailable: boolean;
  /** Begin listening. Requests mic permission on native. */
  start: () => Promise<void>;
  /**
   * Stop listening and return the captured transcript (trimmed). Empty
   * string if nothing was said. Clears partial.
   */
  stopAndGet: () => Promise<string>;
  /** Reset partial + error (e.g. before a fresh turn). */
  reset: () => void;
}

export function useVoiceRecognizer(): VoiceRecognizer {
  const [listening, setListening] = useState(false);
  const [partial, setPartial] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const webRecRef = useRef<{ stop: () => void } | null>(null);
  const partialRef = useRef('');

  // Keep a ref in sync so stopAndGet (called from a handler closure) reads
  // the latest transcript without re-binding.
  useEffect(() => { partialRef.current = partial; }, [partial]);

  // Probe native availability once.
  useEffect(() => {
    if (capacitorAvailable !== null) {
      if (!capacitorAvailable && !WebSpeech) setUnavailable(true);
      return;
    }
    void (async () => {
      try {
        const { SpeechRecognition } = await import('@capacitor-community/speech-recognition');
        const r = await SpeechRecognition.available();
        capacitorAvailable = r.available;
      } catch {
        capacitorAvailable = false;
      }
      if (!capacitorAvailable && !WebSpeech) setUnavailable(true);
    })();
  }, []);

  const reset = useCallback(() => {
    setPartial('');
    partialRef.current = '';
    setError(null);
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setPartial('');
    partialRef.current = '';

    if (capacitorAvailable) {
      try {
        const { SpeechRecognition } = await import('@capacitor-community/speech-recognition');
        const perm = await SpeechRecognition.requestPermissions().catch(() => null);
        if (perm && (perm as { speechRecognition: string }).speechRecognition !== 'granted') {
          setError('Microphone permission denied.');
          return;
        }
        await SpeechRecognition.removeAllListeners();
        await SpeechRecognition.addListener('partialResults', (data: { matches: string[] }) => {
          if (data.matches?.[0]) { partialRef.current = data.matches[0]; setPartial(data.matches[0]); }
        });
        await SpeechRecognition.start({
          language: navigator.language || 'en-US',
          popup: false,
          partialResults: true,
        });
        setListening(true);
        return;
      } catch {
        /* fall through to web */
      }
    }

    if (WebSpeech) {
      try {
        const r = new (WebSpeech as RecCtor)();
        r.continuous = true;
        r.interimResults = true;
        r.lang = navigator.language || 'en-US';
        r.onresult = (event) => {
          let collected = '';
          for (let i = 0; i < event.results.length; i++) {
            collected += event.results[i][0]?.transcript ?? '';
          }
          const trimmed = collected.trim();
          partialRef.current = trimmed;
          setPartial(trimmed);
        };
        r.onend = () => { /* user-driven stop */ };
        r.onerror = () => { setError('Speech recognition error.'); setListening(false); };
        webRecRef.current = r;
        r.start();
        setListening(true);
      } catch {
        setError('Speech recognition not available.');
        setUnavailable(true);
      }
    } else {
      setError('Voice input is not available on this device.');
      setUnavailable(true);
    }
  }, []);

  const stopAndGet = useCallback(async (): Promise<string> => {
    if (capacitorAvailable) {
      try {
        const { SpeechRecognition } = await import('@capacitor-community/speech-recognition');
        await SpeechRecognition.stop();
        await SpeechRecognition.removeAllListeners();
      } catch { /* swallow */ }
    }
    if (webRecRef.current) {
      try { webRecRef.current.stop(); } catch { /* swallow */ }
      webRecRef.current = null;
    }
    setListening(false);
    const text = partialRef.current.trim();
    setPartial('');
    partialRef.current = '';
    return text;
  }, []);

  // Stop any active recogniser on unmount.
  useEffect(() => () => {
    if (webRecRef.current) {
      try { webRecRef.current.stop(); } catch { /* swallow */ }
      webRecRef.current = null;
    }
    if (capacitorAvailable) {
      void (async () => {
        try {
          const { SpeechRecognition } = await import('@capacitor-community/speech-recognition');
          await SpeechRecognition.stop();
          await SpeechRecognition.removeAllListeners();
        } catch { /* swallow */ }
      })();
    }
  }, []);

  return { listening, partial, error, unavailable, start, stopAndGet, reset };
}
