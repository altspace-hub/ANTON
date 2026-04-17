/**
 * tts.ts — text-to-speech using the platform's native voice (spec §8.4).
 *
 * Order:
 *   1. Web Speech API (window.speechSynthesis) — covers iOS Safari,
 *      Android Chrome, desktop Chrome/Edge/Firefox, and Capacitor's
 *      WKWebView / WebView. The same surface in all three.
 *   2. (deferred) Native TTS plugin — only worth adding when v1 user
 *      research shows the Web Speech voice is unacceptable in some
 *      locale.
 *
 * The instance can opt into a custom voice (server-side TTS) via the
 * user's ANTON preferences; that flow does not live here.
 */

let currentUtterance: SpeechSynthesisUtterance | null = null;

export interface SpeakOptions {
  /** ISO BCP-47 language tag, e.g., "en-GB". Falls back to navigator.language. */
  language?: string;
  /** Pitch multiplier (0.0 – 2.0, default 1) */
  pitch?: number;
  /** Rate multiplier (0.1 – 10.0, default 1) */
  rate?: number;
  /** Volume (0 – 1, default 1) */
  volume?: number;
  /** Optional voice URI to prefer (from listVoices()) */
  voiceUri?: string;
  /** Fired once when the playback ends (success or interrupted) */
  onEnd?: () => void;
  /** Fired on each word boundary — useful for highlighting captions */
  onBoundary?: (event: { charIndex: number; charLength?: number }) => void;
}

export function isAvailable(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function listVoices(): { uri: string; name: string; lang: string; default: boolean }[] {
  if (!isAvailable()) return [];
  return window.speechSynthesis.getVoices().map(v => ({ uri: v.voiceURI, name: v.name, lang: v.lang, default: v.default }));
}

/**
 * Speak the given text. Cancels any prior utterance. Returns a Promise
 * that resolves when playback ends.
 */
export async function speak(text: string, opts: SpeakOptions = {}): Promise<void> {
  if (!isAvailable() || !text.trim()) { opts.onEnd?.(); return; }
  const u = new SpeechSynthesisUtterance(text);
  u.lang = opts.language ?? (typeof navigator !== 'undefined' ? navigator.language : 'en');
  u.pitch = opts.pitch ?? 1;
  u.rate = opts.rate ?? 1;
  u.volume = opts.volume ?? 1;
  if (opts.voiceUri) {
    const v = window.speechSynthesis.getVoices().find(x => x.voiceURI === opts.voiceUri);
    if (v) u.voice = v;
  }
  u.onboundary = (e) => opts.onBoundary?.({ charIndex: e.charIndex, charLength: (e as unknown as { charLength?: number }).charLength });
  return new Promise<void>((resolve) => {
    u.onend = () => { currentUtterance = null; opts.onEnd?.(); resolve(); };
    u.onerror = () => { currentUtterance = null; opts.onEnd?.(); resolve(); };
    currentUtterance = u;
    window.speechSynthesis.cancel();         // barge-in: kill prior
    window.speechSynthesis.speak(u);
  });
}

/** Stop any in-flight speech immediately (for barge-in). */
export function stop(): void {
  if (!isAvailable()) return;
  window.speechSynthesis.cancel();
  currentUtterance = null;
}

export function isSpeaking(): boolean {
  return isAvailable() && window.speechSynthesis.speaking;
}
