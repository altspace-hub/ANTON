/**
 * sticker-recents.ts — a small localStorage-backed MRU of stickers the user
 * has sent, so the picker can surface a "Recently used" row first (the same
 * affordance every chat app has). Stores only `{packId, stickerId}` refs — no
 * bytes — and is best-effort: any storage failure degrades to "no recents".
 */
import { getSticker, type Sticker } from '../assets/stickers';

export interface StickerRef { packId: string; stickerId: string; }

const KEY = 'anton-comm-recent-stickers';
const MAX = 16;

function read(): StickerRef[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter(
      (r): r is StickerRef =>
        !!r && typeof r.packId === 'string' && typeof r.stickerId === 'string',
    );
  } catch {
    return [];
  }
}

/** Record a just-sent sticker at the front of the MRU (dedup, capped at MAX). */
export function recordStickerUse(packId: string, stickerId: string): void {
  try {
    const next = [
      { packId, stickerId },
      ...read().filter((r) => !(r.packId === packId && r.stickerId === stickerId)),
    ].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* best-effort — a full / disabled store just means no recents */
  }
}

/**
 * Recently-used stickers, newest first, resolved to live Sticker objects.
 * Refs whose pack/sticker no longer exists (e.g. a removed pack) are dropped.
 */
export function listRecentStickers(): Array<{ ref: StickerRef; sticker: Sticker }> {
  const out: Array<{ ref: StickerRef; sticker: Sticker }> = [];
  for (const ref of read()) {
    const sticker = getSticker(ref.packId, ref.stickerId);
    if (sticker) out.push({ ref, sticker });
  }
  return out;
}
