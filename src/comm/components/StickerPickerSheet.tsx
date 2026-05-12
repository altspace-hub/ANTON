/**
 * StickerPickerSheet — R12 grid picker for sending a sticker.
 *
 * Renders the bundled starter pack; tap a sticker to dispatch. Future
 * enhancement: tabs for additional user-imported `.anton-sticker`
 * packs (resolver shape already accepts a packId, so no wire change
 * needed when that lands).
 */
import { useEffect } from 'react';
import { Ico } from './Ico';
import { registerBackHandler } from '../services/back-stack';
import { listStarterStickers, stickerToDataUrl } from '../assets/stickers';

interface Props {
  open: boolean;
  onClose: () => void;
  onPick: (packId: string, stickerId: string) => void;
}

export default function StickerPickerSheet({ open, onClose, onPick }: Props) {
  useEffect(() => {
    if (!open) return;
    return registerBackHandler(onClose);
  }, [open, onClose]);

  if (!open) return null;

  const stickers = listStarterStickers();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Pick a sticker"
      className="fixed inset-0 z-50 flex flex-col justify-end"
      style={{ background: 'rgba(28, 26, 20, 0.55)' }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[var(--color-surface)] rounded-t-3xl pt-3 pb-6 safe-bottom max-h-[60vh] flex flex-col"
      >
        <div className="w-10 h-1 rounded-full bg-[var(--color-border)] mx-auto mb-3" />
        <div className="px-5 pb-3 flex items-center gap-2">
          <Ico name="smile" size={18} color="var(--color-accent)" />
          <h2 className="text-base font-semibold text-[var(--color-text)]">Stickers</h2>
          <span className="text-[11px] text-[var(--color-text-muted)] ml-auto">Starter pack</span>
        </div>
        <div
          className="px-3 overflow-y-auto grid gap-2"
          style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}
        >
          {stickers.map((s) => (
            <button
              key={s.id}
              onClick={() => { onClose(); onPick('starter', s.id); }}
              aria-label={s.label}
              className="aspect-square rounded-2xl flex items-center justify-center bg-[var(--color-surface-alt)] active:bg-[var(--color-surface-muted)]"
            >
              <img src={stickerToDataUrl(s)} alt={s.label} className="w-16 h-16" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
