import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { publishWassupPost } from '../services/chat';
import { captureImageFromCamera, captureImageFromLibrary, isWithinRelayCap, type Capture } from '../services/capture';
import { isVoiceWithinRelayCap, type VoiceRecording } from '../services/voice';
import { Ico } from '../components/Ico';
import { getIdentity } from '../services/identity';
import WassupAudienceSheet, { type WassupAudience } from '../components/WassupAudienceSheet';
import WassupExpirySheet, { type WassupExpiryHours } from '../components/WassupExpirySheet';
import VoiceRecorder from '../components/VoiceRecorder';
import { useBlobUrl } from '../hooks/useBlobUrl';

interface Props {
  onCancel: () => void;
  onPosted: () => void;
}

export default function WassupComposeScreen({ onCancel, onPosted }: Props) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [image, setImage] = useState<Capture | null>(null);
  const [voice, setVoice] = useState<VoiceRecording | null>(null);
  const [audience, setAudience] = useState<WassupAudience>({ mode: 'everyone' });
  const [expiryHours, setExpiryHours] = useState<WassupExpiryHours>(24);
  const [audienceOpen, setAudienceOpen] = useState(false);
  const [expiryOpen, setExpiryOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const me = getIdentity();
  // P4-3: even the in-progress compose preview gets the blob-URL
  // treatment so re-renders driven by chip state changes don't
  // re-decode the image bytes.
  const imageBlobUrl = useBlobUrl(image?.data, image?.mimeType);

  async function handleAttach(grabber: () => Promise<Capture | null>) {
    setError(null);
    try {
      const c = await grabber();
      if (!c) return;
      if (!isWithinRelayCap(c)) {
        setError(t('wassup.errImageTooBig'));
        return;
      }
      setImage(c);
      // Image and voice are mutually exclusive at compose time so the
      // chip + composer surface stays clear of clutter.
      setVoice(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('wassup.errAttachImage'));
    }
  }

  function handleVoice(rec: VoiceRecording) {
    if (!isVoiceWithinRelayCap(rec)) {
      setError(t('wassup.errVoiceTooLong'));
      return;
    }
    setError(null);
    setVoice(rec);
    setImage(null);
  }

  async function handlePost() {
    const body = text.trim();
    if (!body && !image && !voice) {
      setError(t('wassup.errEmptyPost'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await publishWassupPost({
        text: body,
        image: image ? {
          data: image.data,
          mimeType: image.mimeType,
          width: image.width,
          height: image.height,
        } : undefined,
        voice: voice ? {
          audio: voice.audio,
          mimeType: voice.mimeType,
          durationSec: voice.durationSec,
          waveform: voice.waveform,
          size: voice.size,
        } : undefined,
        audience: audience.mode === 'specific'
          ? { mode: 'specific', contactHashes: audience.contactHashes }
          : { mode: 'everyone' },
        expiresInHours: expiryHours,
      });
      onPosted();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('wassup.errPostFailed'));
      setBusy(false);
    }
  }

  const audienceLabel = audience.mode === 'everyone'
    ? t('wassup.audienceEveryone')
    : audience.contactHashes.length === 0
      ? t('wassup.audienceNoOne')
      : audience.contactHashes.length === 1
        ? t('wassup.audiencePerson', { count: 1 })
        : t('wassup.audiencePeople', { count: audience.contactHashes.length });

  const expiryLabel = expiryHours === null
    ? t('wassup.expiryNever')
    : expiryHours >= 24
      ? t('wassup.expiryDays', { n: expiryHours / 24 })
      : t('wassup.expiryHours', { n: expiryHours });

  return (
    <section className="flex flex-col min-h-dvh max-h-dvh safe-top safe-bottom bg-[var(--color-bg)]">
      <header className="flex items-center justify-between h-12 px-4 border-b border-[var(--color-border-soft)] bg-[var(--color-surface)]">
        <button onClick={onCancel} className="text-sm text-[var(--color-text-muted)]" disabled={busy}>{t('common.cancel')}</button>
        <h1 className="text-base font-semibold text-[var(--color-text)]">{t('wassup.compose')}</h1>
        <button
          onClick={() => void handlePost()}
          disabled={busy || (text.trim().length === 0 && !image && !voice)}
          className="text-sm font-semibold disabled:opacity-40"
          style={{ color: 'var(--color-accent)' }}
        >
          {busy ? t('wassup.posting') : t('wassup.post')}
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="flex items-start gap-3">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0"
            style={{ backgroundColor: 'var(--color-accent-dim)', color: 'var(--color-accent-dark)' }}
          >
            {(me?.displayName ?? '?').slice(0, 1).toUpperCase()}
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('wassup.composePlaceholder')}
            rows={4}
            maxLength={500}
            autoFocus
            disabled={busy}
            className="flex-1 px-3 py-2 rounded-xl bg-transparent text-[17px] text-[var(--color-text)] placeholder-[var(--color-text-faint)] resize-none focus:outline-none"
          />
        </div>

        {image && imageBlobUrl && (
          <div className="mt-4 rounded-2xl overflow-hidden border border-[var(--color-border-soft)] relative">
            <img
              src={imageBlobUrl}
              alt=""
              className="w-full block"
              style={{
                aspectRatio: image.width && image.height ? `${image.width} / ${image.height}` : '4 / 3',
              }}
            />
            <button
              onClick={() => setImage(null)}
              className="absolute top-2 right-2 w-11 h-11 rounded-full bg-black/55 text-white flex items-center justify-center"
              aria-label={t('wassup.removeImage')}
            >
              <Ico name="x" size={18} color="#FFFFFF" />
            </button>
          </div>
        )}

        {voice && (
          <div className="mt-4 px-4 py-3 rounded-2xl border border-[var(--color-border-soft)] bg-[var(--color-surface-alt)] flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: 'var(--color-accent-dim)', color: 'var(--color-accent-dark)' }}
            >
              <Ico name="mic" size={18} />
            </div>
            <div className="flex-1 text-sm text-[var(--color-text)]">
              {t('wassup.voiceNote', { sec: Math.round(voice.durationSec) })}
            </div>
            <button
              onClick={() => setVoice(null)}
              className="w-11 h-11 rounded-full flex items-center justify-center text-[var(--color-text-muted)] active:bg-[var(--color-surface-muted)]"
              aria-label={t('wassup.removeVoice')}
            >
              <Ico name="x" size={18} />
            </button>
          </div>
        )}

        {error && <p className="mt-3 text-xs text-[var(--color-red)]">{error}</p>}

        {/* Chips: audience + expiry. */}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={() => setAudienceOpen(true)}
            disabled={busy}
            className="px-3 py-1.5 rounded-full text-[12px] font-medium border inline-flex items-center gap-1.5"
            style={{
              borderColor: 'var(--color-border-soft)',
              backgroundColor: 'var(--color-surface-alt)',
              color: 'var(--color-text)',
            }}
          >
            <Ico name="users" size={14} color="var(--color-text-muted)" />
            {audienceLabel}
          </button>
          <button
            onClick={() => setExpiryOpen(true)}
            disabled={busy}
            className="px-3 py-1.5 rounded-full text-[12px] font-medium border inline-flex items-center gap-1.5"
            style={{
              borderColor: 'var(--color-border-soft)',
              backgroundColor: 'var(--color-surface-alt)',
              color: 'var(--color-text)',
            }}
          >
            <Ico name="clock" size={14} color="var(--color-text-muted)" />
            {expiryLabel}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 px-3 py-3 border-t border-[var(--color-border-soft)] bg-[var(--color-surface)]">
        <button
          onClick={() => void handleAttach(captureImageFromCamera)}
          disabled={busy}
          aria-label={t('wassup.takePhoto')}
          className="w-10 h-10 rounded-full flex items-center justify-center text-[var(--color-text-muted)] active:bg-[var(--color-surface-muted)] disabled:opacity-40"
        >
          <Ico name="camera" size={22} />
        </button>
        <button
          onClick={() => void handleAttach(captureImageFromLibrary)}
          disabled={busy}
          aria-label={t('wassup.choosePhoto')}
          className="w-10 h-10 rounded-full flex items-center justify-center text-[var(--color-text-muted)] active:bg-[var(--color-surface-muted)] disabled:opacity-40"
        >
          <Ico name="image" size={22} />
        </button>
        <VoiceRecorder
          onSend={(rec) => handleVoice(rec)}
          onError={(msg) => setError(msg)}
          disabled={busy || !!image}
        />
        <div className="flex-1" />
        <span className="text-xs text-[var(--color-text-faint)]">{text.length}/500</span>
      </div>

      <WassupAudienceSheet
        open={audienceOpen}
        onClose={() => setAudienceOpen(false)}
        initial={audience}
        onChoose={setAudience}
      />
      <WassupExpirySheet
        open={expiryOpen}
        onClose={() => setExpiryOpen(false)}
        current={expiryHours}
        onChoose={setExpiryHours}
      />
    </section>
  );
}
