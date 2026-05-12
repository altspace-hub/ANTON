/**
 * StickerBubble — R12. Renders the bundled sticker SVG at ~128px with
 * no bubble chrome (floats over the chat background like real
 * stickers). Unknown packId/stickerId combos fall back to a neutral
 * placeholder so an old client receiving a future pack doesn't crash.
 */
import { Ico } from './Ico';
import { getSticker, stickerToDataUrl } from '../assets/stickers';
import type { StickerPayload } from '../services/chat';
import type { ChatMessage } from '../services/messages';

interface Props {
  message: ChatMessage;
  isMine: boolean;
  time: string;
}

export default function StickerBubble({ message, isMine, time }: Props) {
  let payload: StickerPayload | null = null;
  try { payload = JSON.parse(message.plaintext) as StickerPayload; } catch { /* ignore */ }
  if (!payload) return null;
  const sticker = getSticker(payload.packId, payload.stickerId);

  return (
    <div className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
      {sticker ? (
        <img
          src={stickerToDataUrl(sticker)}
          alt={sticker.label}
          className="w-32 h-32"
          draggable={false}
        />
      ) : (
        <div
          className="w-32 h-32 rounded-2xl flex flex-col items-center justify-center gap-1"
          style={{ backgroundColor: 'var(--color-surface-alt)', color: 'var(--color-text-muted)' }}
        >
          <Ico name="smile" size={28} color="var(--color-text-muted)" />
          <span className="text-[10px]">{payload.packId}·{payload.stickerId}</span>
        </div>
      )}
      <div className="mt-0.5 text-[10px] text-[var(--color-text-faint)] flex items-center gap-1">
        {message.disappearsAt && <Ico name="clock" size={10} color="var(--color-text-faint)" />}
        <time>{time}</time>
      </div>
    </div>
  );
}
