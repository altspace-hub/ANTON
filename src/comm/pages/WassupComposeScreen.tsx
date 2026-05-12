import { useState } from 'react';
import { publishWassupPost } from '../services/chat';
import { captureImageFromCamera, captureImageFromLibrary, isWithinRelayCap, type Capture } from '../services/capture';
import { Ico } from '../components/Ico';
import { getIdentity } from '../services/identity';

interface Props {
  onCancel: () => void;
  onPosted: () => void;
}

export default function WassupComposeScreen({ onCancel, onPosted }: Props) {
  const [text, setText] = useState('');
  const [image, setImage] = useState<Capture | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const me = getIdentity();

  async function handleAttach(grabber: () => Promise<Capture | null>) {
    setError(null);
    try {
      const c = await grabber();
      if (!c) return;
      if (!isWithinRelayCap(c)) {
        setError('Image is too big after compression — try a smaller photo.');
        return;
      }
      setImage(c);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn\'t attach image');
    }
  }

  async function handlePost() {
    const body = text.trim();
    if (!body && !image) { setError('Add some text or a photo before posting.'); return; }
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
      });
      onPosted();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to post');
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col min-h-dvh max-h-dvh safe-top safe-bottom bg-[var(--color-bg)]">
      <header className="flex items-center justify-between h-12 px-4 border-b border-[var(--color-border-soft)] bg-[var(--color-surface)]">
        <button onClick={onCancel} className="text-sm text-[var(--color-text-muted)]" disabled={busy}>Cancel</button>
        <h1 className="text-base font-semibold text-[var(--color-text)]">New post</h1>
        <button
          onClick={() => void handlePost()}
          disabled={busy || (text.trim().length === 0 && !image)}
          className="text-sm font-semibold disabled:opacity-40"
          style={{ color: 'var(--color-accent)' }}
        >
          {busy ? 'Posting…' : 'Post'}
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
            placeholder="What's up?"
            rows={4}
            maxLength={500}
            autoFocus
            disabled={busy}
            className="flex-1 px-3 py-2 rounded-xl bg-transparent text-[17px] text-[var(--color-text)] placeholder-[var(--color-text-faint)] resize-none focus:outline-none"
          />
        </div>

        {image && (
          <div className="mt-4 rounded-2xl overflow-hidden border border-[var(--color-border-soft)] relative">
            <img
              src={`data:${image.mimeType};base64,${image.data}`}
              alt=""
              className="w-full block"
              style={{
                aspectRatio: image.width && image.height ? `${image.width} / ${image.height}` : '4 / 3',
              }}
            />
            <button
              onClick={() => setImage(null)}
              className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/55 text-white flex items-center justify-center"
              aria-label="Remove image"
            >
              <Ico name="x" size={18} color="#FFFFFF" />
            </button>
          </div>
        )}

        {error && <p className="mt-3 text-xs text-[var(--color-red)]">{error}</p>}

        <p className="mt-4 text-[11px] text-[var(--color-text-faint)]">
          Visible to all your contacts. Disappears after 24 hours.
        </p>
      </div>

      <div className="flex items-center gap-2 px-3 py-3 border-t border-[var(--color-border-soft)] bg-[var(--color-surface)]">
        <button
          onClick={() => void handleAttach(captureImageFromCamera)}
          disabled={busy}
          aria-label="Take photo"
          className="w-10 h-10 rounded-full flex items-center justify-center text-[var(--color-text-muted)] active:bg-[var(--color-surface-muted)] disabled:opacity-40"
        >
          <Ico name="camera" size={22} />
        </button>
        <button
          onClick={() => void handleAttach(captureImageFromLibrary)}
          disabled={busy}
          aria-label="Choose photo"
          className="w-10 h-10 rounded-full flex items-center justify-center text-[var(--color-text-muted)] active:bg-[var(--color-surface-muted)] disabled:opacity-40"
        >
          <Ico name="image" size={22} />
        </button>
        <div className="flex-1" />
        <span className="text-xs text-[var(--color-text-faint)]">{text.length}/500</span>
      </div>
    </section>
  );
}
