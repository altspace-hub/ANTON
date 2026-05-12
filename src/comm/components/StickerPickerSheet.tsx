/**
 * StickerPickerSheet — R12 grid picker for sending a sticker.
 *
 * Renders the bundled starter pack; tap a sticker to dispatch. Future
 * enhancement: tabs for additional user-imported `.anton-sticker`
 * packs (resolver shape already accepts a packId, so no wire change
 * needed when that lands).
 */
import BottomSheet from './BottomSheet';
import { listStarterStickers, stickerToDataUrl } from '../assets/stickers';

interface Props {
  open: boolean;
  onClose: () => void;
  onPick: (packId: string, stickerId: string) => void;
}

export default function StickerPickerSheet({ open, onClose, onPick }: Props) {
  const stickers = listStarterStickers();

  return (
    <BottomSheet open={open} onClose={onClose} title="Stickers" icon="smile" maxHeight="60vh" ariaLabel="Pick a sticker">
      <div className="px-5 -mt-1 mb-2 text-[11px] text-[var(--color-text-muted)] flex-shrink-0">Starter pack</div>
      <div
        className="px-3 pb-2 overflow-y-auto grid gap-2"
        style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}
      >
        {stickers.map((s) => (
          <button
            key={s.id}
            onClick={() => { onClose(); onPick('starter', s.id); }}
            aria-label={s.label}
            // P8-4 tap feedback: scale to 90% on press, snap back on
            // release. transition-none on active to avoid the easing
            // making the press feel mushy; the spring back uses a
            // soft 120 ms transition so it doesn't twang.
            className="aspect-square rounded-2xl flex items-center justify-center bg-[var(--color-surface-alt)] active:bg-[var(--color-surface-muted)] transition-transform duration-120 active:scale-90 active:transition-none"
          >
            <img src={stickerToDataUrl(s)} alt={s.label} className="w-16 h-16" draggable={false} />
          </button>
        ))}
      </div>
    </BottomSheet>
  );
}
