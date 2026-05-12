/**
 * VoiceInput — Microphone button with dual engine:
 * 1. Capacitor native speech recognition (Android/iOS — works offline, no HTTPS needed)
 * 2. Web Speech API fallback (Chrome desktop)
 * Auto-hides if neither is available.
 */

import { useState, useRef, useEffect } from 'react';

interface Props {
  onTranscript: (text: string) => void;
  disabled?: boolean;
}

// Detect available speech engines
const WebSpeechRecognition = typeof window !== 'undefined'
  ? (window as unknown as Record<string, unknown>).SpeechRecognition || (window as unknown as Record<string, unknown>).webkitSpeechRecognition
  : null;

let capacitorSpeechAvailable: boolean | null = null;

export default function VoiceInput({ onTranscript, disabled }: Props) {
  const [listening, setListening] = useState(false);
  const [available, setAvailable] = useState<boolean>(!!WebSpeechRecognition);
  const [partialText, setPartialText] = useState('');
  const webRecognitionRef = useRef<unknown>(null);

  // Check Capacitor speech on mount
  useEffect(() => {
    if (capacitorSpeechAvailable !== null) {
      setAvailable(capacitorSpeechAvailable || !!WebSpeechRecognition);
      return;
    }
    (async () => {
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

  async function startListening() {
    setListening(true);
    setPartialText('');

    // Try Capacitor native first
    if (capacitorSpeechAvailable) {
      try {
        const { SpeechRecognition } = await import('@capacitor-community/speech-recognition');

        // Request permission
        const { speechRecognition } = await SpeechRecognition.requestPermissions();
        if (speechRecognition !== 'granted') {
          setListening(false);
          return;
        }

        // Add listener for partial results
        SpeechRecognition.addListener('partialResults', (data: { matches: string[] }) => {
          if (data.matches?.[0]) setPartialText(data.matches[0]);
        });

        // Start
        await SpeechRecognition.start({
          language: navigator.language || 'en-US',
          popup: false,
          partialResults: true,
        });

        // Listen for results
        SpeechRecognition.addListener('listeningState', (state: { status: string }) => {
          if (state.status === 'stopped') {
            setListening(false);
            SpeechRecognition.removeAllListeners();
          }
        });

        return;
      } catch {
        // Fall through to Web Speech
      }
    }

    // Fallback: Web Speech API
    if (WebSpeechRecognition) {
      try {
        const recognition = new (WebSpeechRecognition as new () => {
          continuous: boolean;
          interimResults: boolean;
          lang: string;
          onresult: (e: { results: Array<Array<{ transcript: string }>> }) => void;
          onend: () => void;
          onerror: () => void;
          start: () => void;
          stop: () => void;
        })();

        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.lang = navigator.language || 'en-US';

        recognition.onresult = (event) => {
          const last = event.results[event.results.length - 1];
          const transcript = last?.[0]?.transcript || '';
          setPartialText(transcript);
          if (last && (last as unknown as { isFinal: boolean }).isFinal) {
            onTranscript(transcript);
            setListening(false);
          }
        };

        recognition.onend = () => setListening(false);
        recognition.onerror = () => setListening(false);

        webRecognitionRef.current = recognition;
        recognition.start();
      } catch {
        setListening(false);
      }
    } else {
      setListening(false);
    }
  }

  async function stopListening() {
    setListening(false);

    // Stop Capacitor
    if (capacitorSpeechAvailable) {
      try {
        const { SpeechRecognition } = await import('@capacitor-community/speech-recognition');
        await SpeechRecognition.stop();
        SpeechRecognition.removeAllListeners();
        if (partialText) onTranscript(partialText);
      } catch {}
    }

    // Stop Web Speech
    if (webRecognitionRef.current) {
      (webRecognitionRef.current as { stop: () => void }).stop();
    }

    setPartialText('');
  }

  if (!available) return null;

  return (
    <div className="relative">
      <button
        onClick={listening ? stopListening : startListening}
        disabled={disabled}
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-all active:scale-90 disabled:opacity-25 ${
          listening
            ? 'bg-adv-red text-white shadow-lg shadow-adv-red/30'
            : 'bg-adv-card border border-border text-adv-gray hover:text-adv-teal hover:border-adv-teal/30'
        }`}
        title={listening ? 'Stop recording' : 'Voice input'}
      >
        {listening ? (
          // Stop icon (square)
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="6" width="12" height="12" rx="2" />
          </svg>
        ) : (
          // Microphone icon
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            <line x1="12" y1="19" x2="12" y2="23"/>
            <line x1="8" y1="23" x2="16" y2="23"/>
          </svg>
        )}
      </button>

      {/* Recording indicator with partial transcript */}
      {listening && (
        <div className="absolute bottom-14 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-adv-red/90 px-3 py-1.5 text-xs text-white shadow-lg">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
            {partialText ? (
              <span className="max-w-[200px] truncate">{partialText}</span>
            ) : (
              <span>Listening...</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
