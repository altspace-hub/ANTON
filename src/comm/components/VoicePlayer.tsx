/**
 * VoicePlayer — bubble player for voice-note messages.
 *
 * Reads the inbound VoicePayload (base64 audio + waveform), creates a
 * blob URL, renders play/pause + waveform bars + time display.
 * Scrubbing: tap on a bar jumps audio.currentTime to that proportion.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Ico } from './Ico';
import type { VoicePayload } from '../services/chat';

interface Props {
  payload: VoicePayload;
  /** Bubble side — used to bias waveform colour when mine vs theirs */
  mine: boolean;
}

export default function VoicePlayer({ payload, mine }: Props) {
  const { t } = useTranslation();
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // 0..1
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const blobUrl = useMemo(() => base64ToBlobUrl(payload.audio, payload.mimeType), [payload.audio, payload.mimeType]);

  useEffect(() => () => {
    if (blobUrl) URL.revokeObjectURL(blobUrl);
  }, [blobUrl]);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTime = () => {
      const total = a.duration || payload.durationSec || 1;
      setProgress(Math.min(1, a.currentTime / total));
    };
    const onEnd = () => { setPlaying(false); setProgress(0); a.currentTime = 0; };
    a.addEventListener('timeupdate', onTime);
    a.addEventListener('ended', onEnd);
    return () => {
      a.removeEventListener('timeupdate', onTime);
      a.removeEventListener('ended', onEnd);
    };
  }, [payload.durationSec]);

  function toggle() {
    const a = audioRef.current;
    if (!a) return;
    if (playing) { a.pause(); setPlaying(false); }
    else { void a.play().then(() => setPlaying(true)).catch(() => setPlaying(false)); }
  }

  function scrub(e: React.PointerEvent<HTMLDivElement>) {
    const a = audioRef.current;
    if (!a) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const p = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const total = a.duration || payload.durationSec || 1;
    a.currentTime = p * total;
    setProgress(p);
  }

  const bars = payload.waveform.length > 0 ? payload.waveform : new Array(32).fill(0.2);

  const barColor = mine ? 'rgba(255,255,255,0.85)' : 'var(--color-accent)';
  const dimColor = mine ? 'rgba(255,255,255,0.35)' : 'var(--color-text-faint)';

  return (
    <div className="flex items-center gap-3 min-w-[200px]">
      <audio ref={audioRef} src={blobUrl} preload="metadata" />
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? t('chat.voicePauseAria', 'Pause voice note') : t('chat.voicePlayAria', 'Play voice note')}
        className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
        style={{
          backgroundColor: mine ? 'rgba(255,255,255,0.2)' : 'var(--color-accent-dim)',
          color: mine ? '#FFFFFF' : 'var(--color-accent-dark)',
        }}
      >
        <Ico name={playing ? 'pause' : 'play'} size={16} />
      </button>
      <div
        onPointerDown={scrub}
        className="flex-1 flex items-center gap-[2px] h-7 cursor-pointer"
        style={{ touchAction: 'none' }}
        aria-label={t('chat.voiceProgressAria', 'Voice note progress')}
        role="slider"
        aria-valuenow={Math.round(progress * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        {bars.map((v, i) => {
          const played = i / bars.length < progress;
          const h = Math.max(3, Math.round(v * 24));
          return (
            <span
              key={i}
              style={{
                width: 2,
                height: h,
                borderRadius: 1,
                backgroundColor: played ? barColor : dimColor,
                opacity: played ? 1 : 0.6,
                transition: 'background-color 0.12s',
              }}
            />
          );
        })}
      </div>
      <span className="text-[11px] tabular-nums flex-shrink-0" style={{ color: mine ? 'rgba(255,255,255,0.75)' : 'var(--color-text-faint)' }}>
        {formatDuration(payload.durationSec)}
      </span>
    </div>
  );
}

function formatDuration(sec: number): string {
  const total = Math.max(0, Math.floor(sec));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function base64ToBlobUrl(b64: string, mimeType: string): string {
  try {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const blob = new Blob([bytes], { type: mimeType });
    return URL.createObjectURL(blob);
  } catch {
    return '';
  }
}
