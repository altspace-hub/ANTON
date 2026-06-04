/**
 * stickers.test.ts — R12.1 stickers v2: the second pack resolves, the
 * sticker wire round-trips, the data-URL cache is collision-safe across
 * packs, and the recently-used MRU dedups + caps + survives bad storage.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { listPacks, getSticker, stickerToDataUrl, listStarterStickers } from '../assets/stickers';
import { parseWirePayload } from '../services/chat';
import { recordStickerUse, listRecentStickers } from '../services/sticker-recents';

describe('sticker packs', () => {
  it('exposes both bundled packs in order (starter, mood)', () => {
    const packs = listPacks();
    expect(packs.map((p) => p.id)).toEqual(['starter', 'mood']);
    expect(packs[1].stickers.length).toBeGreaterThanOrEqual(8);
  });

  it('resolves a sticker from the second pack', () => {
    const s = getSticker('mood', 'rocket');
    expect(s?.label).toBe('Rocket');
    expect(getSticker('mood', 'nope')).toBeNull();
    expect(getSticker('no-pack', 'rocket')).toBeNull();
  });

  it('every sticker in every pack has a non-empty svg + unique-within-pack id', () => {
    for (const pack of listPacks()) {
      const ids = new Set<string>();
      for (const s of pack.stickers) {
        expect(s.svg).toContain('<svg');
        expect(ids.has(s.id)).toBe(false);
        ids.add(s.id);
      }
    }
  });

  it('data-URL cache is keyed on bytes, so identical-id stickers in different packs are independent', () => {
    const a = stickerToDataUrl({ id: 'x', label: 'A', svg: '<svg>A</svg>' });
    const b = stickerToDataUrl({ id: 'x', label: 'B', svg: '<svg>B</svg>' });
    expect(a).not.toBe(b);
    expect(a).toContain('data:image/svg+xml;base64,');
  });
});

describe('sticker wire payload (incl. second pack)', () => {
  it('round-trips a mood-pack sticker through parseWirePayload', () => {
    const wire = parseWirePayload(JSON.stringify({ kind: 'sticker', messageId: 'm1', data: { packId: 'mood', stickerId: 'gift' } }));
    expect(wire.kind).toBe('sticker');
    if (wire.kind !== 'sticker') throw new Error('not a sticker wire');
    expect(wire.data.packId).toBe('mood');
    expect(wire.data.stickerId).toBe('gift');
  });
});

describe('sticker recents (MRU)', () => {
  beforeEach(() => {
    const store: Record<string, string> = {};
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => (k in store ? store[k] : null),
      setItem: (k: string, v: string) => { store[k] = v; },
      removeItem: (k: string) => { delete store[k]; },
      clear: () => { for (const k of Object.keys(store)) delete store[k]; },
    });
  });

  it('records newest-first and dedups', () => {
    recordStickerUse('starter', 'heart');
    recordStickerUse('mood', 'rocket');
    recordStickerUse('starter', 'heart'); // re-use jumps to front, no dupe
    const recents = listRecentStickers().map((r) => `${r.ref.packId}/${r.ref.stickerId}`);
    expect(recents).toEqual(['starter/heart', 'mood/rocket']);
  });

  it('caps the MRU at 16', () => {
    // use every starter sticker (12) + every mood sticker (8) = 20 distinct
    for (const s of listStarterStickers()) recordStickerUse('starter', s.id);
    for (const s of listPacks()[1].stickers) recordStickerUse('mood', s.id);
    expect(listRecentStickers().length).toBe(16);
  });

  it('drops refs whose sticker no longer exists', () => {
    recordStickerUse('starter', 'heart');
    recordStickerUse('ghost-pack', 'ghost'); // unresolvable
    const recents = listRecentStickers();
    expect(recents.every((r) => getSticker(r.ref.packId, r.ref.stickerId) !== null)).toBe(true);
    expect(recents.map((r) => r.ref.stickerId)).toContain('heart');
  });

  it('survives a corrupt localStorage value', () => {
    localStorage.setItem('anton-comm-recent-stickers', '{not json');
    expect(listRecentStickers()).toEqual([]);
    // and a subsequent record still works (overwrites the bad value)
    recordStickerUse('mood', 'check');
    expect(listRecentStickers().map((r) => r.ref.stickerId)).toEqual(['check']);
  });
});
