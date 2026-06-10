/**
 * StdVoiceScreen — Standard mode full-screen voice (Evolution design).
 *
 * Per design/screens-standard.jsx StdVoiceScreen:
 *   • Dark background (text colour) — high-contrast for accessibility
 *   • "Cancel | History" top bar (subtle white)
 *   • "ANTON is listening" subtitle, 30px example query
 *   • 220px radial-gradient orb (3 stacked layers)
 *   • "Speak naturally · Tap when you're done" footer
 *
 * The orb is driven by the SAME real recogniser as the Pro VoiceMode
 * (useVoiceRecognizer — Capacitor speech-recognition + Web Speech
 * fallback). Tapping the orb starts the mic; tapping again stops it and
 * posts the captured transcript to /query-sync. The pulse animation
 * reflects ACTUAL listening state, not a fake boolean. A typed fallback
 * remains for devices with no recogniser.
 */

import { useState } from 'react';
import { Ico } from '../components/ui';
import { fetchWithAuth } from '../services/api';
import { useVoiceRecognizer } from '../hooks/useVoiceRecognizer';

interface Props {
  orgId: string;
  onClose: () => void;
}

export default function StdVoiceScreen({ orgId, onClose }: Props): JSX.Element {
  const rec = useVoiceRecognizer();
  const { listening, partial, error: recError, unavailable, start, stopAndGet, reset } = rec;
  const [reply, setReply]         = useState<string | null>(null);
  const [sendErr, setSendErr]     = useState<string | null>(null);
  const [transcript, setTranscript] = useState('');

  const error = recError ?? sendErr;

  async function send(text: string) {
    if (!text.trim()) return;
    setReply(null);
    setSendErr(null);
    try {
      const res = await fetchWithAuth(`/org/${orgId}/query-sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string })?.error || `HTTP ${res.status}`);
      const r = (data as { assistant?: string; reply?: string; text?: string }).assistant
            ?? (data as { reply?: string }).reply
            ?? (data as { text?: string }).text
            ?? '(no reply)';
      setReply(String(r));
    } catch (e) {
      setSendErr(e instanceof Error ? e.message : 'Voice request failed');
    }
  }

  // Orb tap: start the real recogniser, or stop + send what was captured.
  async function toggleOrb() {
    if (listening) {
      const text = await stopAndGet();
      if (text) void send(text);
    } else {
      setReply(null);
      reset();
      await start();
    }
  }

  return (
    <div
      className="flex flex-1 flex-col"
      style={{ background: 'var(--color-text)', color: '#fff' }}
    >
      {/* Top bar — single Cancel; History action lives on Home */}
      <div className="flex items-center justify-between px-[18px] py-4">
        <button
          onClick={onClose}
          className="rounded-full px-3 py-1 transition active:opacity-50"
          style={{ fontSize: '0.9375rem', opacity: 0.85, color: '#fff' }}
        >
          Cancel
        </button>
        <span style={{ width: 60 }} />
      </div>

      <div className="flex flex-1 flex-col items-center justify-start px-6 pt-10">
        <div className="opacity-70" style={{ fontSize: '1rem', letterSpacing: '0.3px', marginBottom: 8 }}>
          {listening ? 'ANTON is listening' : reply ? 'ANTON' : 'Tap the orb to start'}
        </div>
        <div
          className="text-center"
          style={{
            fontSize: reply || (listening && partial) ? '1.125rem' : '1.875rem',
            fontWeight: 600,
            letterSpacing: '-0.5px',
            lineHeight: 1.3,
            maxWidth: 320,
            marginBottom: reply ? 24 : 50,
          }}
        >
          {/* While listening, show the live transcript; otherwise the reply
              or the example prompt. Driven by the real recogniser. */}
          {listening
            ? (partial || '…')
            : reply
              ? reply
              : '"Who do I have meetings with today?"'}
        </div>

        {/* Orb — tap to start/stop. Pulse reflects REAL listening state. */}
        <button
          onClick={() => { void toggleOrb(); }}
          className="relative"
          style={{ width: 220, height: 220, marginBottom: 50 }}
          aria-label={listening ? 'Stop listening' : 'Start listening'}
        >
          {[0, 1, 2].map(i => (
            <div
              key={i}
              className="absolute"
              style={{
                inset: `${i * 18}px`,
                borderRadius: '50%',
                background: `radial-gradient(circle at 35% 35%, var(--color-accent), var(--color-accent-dark))`,
                opacity: 1 - i * 0.25,
                filter: `blur(${i * 4}px)`,
                animation: listening ? 'pulseDot 1.6s ease-in-out infinite' : undefined,
              }}
            />
          ))}
          <div className="absolute inset-0 flex items-center justify-center">
            <Ico name="mic" color="#fff" size={48} />
          </div>
        </button>

        {/* Manual text fallback */}
        <input
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { void send(transcript); setTranscript(''); } }}
          placeholder={unavailable ? 'Type a question' : '…or type a question'}
          className="w-full max-w-[320px] rounded-full px-4 py-3 text-center"
          style={{
            background: 'color-mix(in srgb, #fff 12%, transparent)',
            color: '#fff',
            border: '1px solid color-mix(in srgb, #fff 20%, transparent)',
            fontSize: '0.9375rem',
          }}
        />

        {unavailable && (
          <div
            className="mt-3 text-center opacity-60"
            style={{ fontSize: '0.8125rem' }}
          >
            Voice input isn't available on this device — type instead.
          </div>
        )}

        {error && (
          <div
            className="mt-4 text-center"
            style={{ color: 'var(--color-red-dim)', fontSize: '0.8125rem' }}
          >
            {error}
          </div>
        )}

        <div
          className="mt-auto pb-8 text-center opacity-55"
          style={{ fontSize: '0.875rem', lineHeight: 1.5 }}
        >
          Speak naturally.<br />Tap the orb when you're done.
        </div>
      </div>
    </div>
  );
}
