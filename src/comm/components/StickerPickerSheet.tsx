/**
 * StickerPickerSheet — R12 grid picker for sending a sticker.
 *
 * R12.1: a "Recently used" row (MRU, from sticker-recents) renders first when
 * present, then one section per bundled pack. The resolver is keyed on
 * packId/stickerId so adding a pack here needs no wire change — only the ids
 * travel; the recipient resolves the SVG from its own bundle.
 */
import { useMemo } from 'react';
import BottomSheet from './BottomSheet';
import { listPacks, stickerToDataUrl, type Sticker } from '../assets/stickers';
import { listRecentStickers } from '../services/sticker-recents';

interface Props {
  open: boolean;
  onClose: () => void;
  onPick: (packId: string, stickerId: string) => void;
}

export default function StickerPickerSheet({ open, onClose, onPick }: Props) {
  const packs = listPacks();
  // Re-read recents each time the sheet opens (so a sticker sent last session
  // — or moments ago, then reopened — shows at the front).
  const recents = useMemo(() => (open ? listRecentStickers() : []), [open]);

  const Cell = ({ packId, sticker }: { packId: string; sticker: Sticker }) => (
    <button
      onClick={() => { onClose(); onPick(packId, sticker.id); }}
      aria-label={sticker.label}
      // P8-4 tap feedback: scale to 90% on press, snap back on release.
      className="aspect-square rounded-2xl flex items-center justify-center bg-[var(--color-surface-alt)] active:bg-[var(--color-surface-muted)] transition-transform duration-120 active:scale-90 active:transition-none"
    >
      <img src={stickerToDataUrl(sticker)} alt={sticker.label} className="w-16 h-16" draggable={false} />
    </button>
  );

  return (
    <BottomSheet open={open} onClose={onClose} title="Stickers" icon="smile" maxHeight="60vh" ariaLabel="Pick a sticker">
      <div className="overflow-y-auto pb-2">
        {recents.length > 0 && (
          <section>
            <div className="px-5 mb-2 text-[11px] text-[var(--color-text-muted)]">Recently used</div>
            <div className="px-3 mb-3 grid gap-2" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
              {recents.map(({ ref, sticker }) => (
                <Cell key={`recent-${ref.packId}-${ref.stickerId}`} packId={ref.packId} sticker={sticker} />
              ))}
            </div>
          </section>
        )}

        {packs.map((pack) => (
          <section key={pack.id}>
            <div className="px-5 mb-2 text-[11px] text-[var(--color-text-muted)]">{pack.name}</div>
            <div className="px-3 mb-3 grid gap-2" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
              {pack.stickers.map((s) => (
                <Cell key={`${pack.id}-${s.id}`} packId={pack.id} sticker={s} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </BottomSheet>
  );
}
