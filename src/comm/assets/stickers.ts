/**
 * stickers.ts — R12 starter sticker pack, inline as SVG strings.
 *
 * Stickers ship in the JS bundle (~5-15 KB total) so the wire payload
 * is just `{ packId, stickerId }` — recipient renders from the bundled
 * pack with no network fetch. Future enhancement: importable
 * `.anton-sticker` bundles that follow the same packId/stickerId
 * resolver shape.
 *
 * All SVGs are 256x256, plain shapes + the brand teal / a warm orange /
 * neutral grays. They render at any size without rasterizing.
 */

export interface Sticker {
  id: string;
  label: string;
  svg: string;
}

export interface StickerPack {
  id: string;
  name: string;
  stickers: Sticker[];
}

// ── SVG helpers ────────────────────────────────────────────────────────
const W = 256;
const C = W / 2; // 128
const TEAL = '#0D7D6C';
const TEAL_LIGHT = '#2DD4A8';
const GOLD = '#F5A623';
const RED = '#E74C3C';
const NAVY = '#0B1426';
const CREAM = '#F5F1EA';
const GREEN = '#27AE60';
const WHITE = '#FFFFFF';

function wrap(inner: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${W}" width="${W}" height="${W}">${inner}</svg>`;
}

const STARTER_PACK: StickerPack = {
  id: 'starter',
  name: 'Starter',
  stickers: [
    {
      id: 'heart',
      label: 'Heart',
      svg: wrap(`<path d="M${C} ${W * 0.86} L${W * 0.16} ${W * 0.43} a${W * 0.22} ${W * 0.22} 0 1 1 ${W * 0.34} -${W * 0.18} a${W * 0.22} ${W * 0.22} 0 1 1 ${W * 0.34} ${W * 0.18} Z" fill="${RED}"/>`),
    },
    {
      id: 'thumbs-up',
      label: 'Thumbs up',
      svg: wrap(`
        <rect x="48" y="118" width="48" height="100" rx="10" fill="${TEAL}"/>
        <path d="M104 118 L120 64 Q132 36 156 50 Q172 60 162 86 L156 110 L210 110 Q228 110 228 130 Q228 144 218 150 Q230 158 226 174 Q224 186 210 188 Q224 196 218 212 Q214 226 198 226 L130 226 Q104 226 104 198 Z" fill="${GOLD}"/>
      `),
    },
    {
      id: 'fire',
      label: 'Fire',
      svg: wrap(`
        <path d="M128 36 C156 80 196 84 196 144 a68 68 0 1 1 -136 0 C60 116 78 92 100 88 C92 60 110 32 128 36 Z" fill="${GOLD}"/>
        <path d="M128 96 C148 124 168 132 168 168 a40 40 0 1 1 -80 0 C88 144 104 130 128 96 Z" fill="${RED}"/>
      `),
    },
    {
      id: 'cry',
      label: 'Cry',
      svg: wrap(`
        <circle cx="${C}" cy="${C}" r="100" fill="${GOLD}"/>
        <circle cx="92" cy="116" r="10" fill="${NAVY}"/>
        <circle cx="164" cy="116" r="10" fill="${NAVY}"/>
        <path d="M92 170 Q128 200 164 170" fill="none" stroke="${NAVY}" stroke-width="10" stroke-linecap="round"/>
        <path d="M88 130 L80 200 Q80 218 96 218 Q108 218 108 200 Z" fill="#5BC0EB" opacity="0.85"/>
        <path d="M168 130 L160 200 Q160 218 176 218 Q188 218 188 200 Z" fill="#5BC0EB" opacity="0.85"/>
      `),
    },
    {
      id: 'lol',
      label: 'Laughing',
      svg: wrap(`
        <circle cx="${C}" cy="${C}" r="100" fill="${GOLD}"/>
        <path d="M68 104 Q84 80 100 104" fill="none" stroke="${NAVY}" stroke-width="10" stroke-linecap="round"/>
        <path d="M156 104 Q172 80 188 104" fill="none" stroke="${NAVY}" stroke-width="10" stroke-linecap="round"/>
        <path d="M70 152 Q128 220 186 152 Z" fill="${NAVY}"/>
        <path d="M84 162 Q128 196 172 162 Q128 184 84 162 Z" fill="${RED}"/>
      `),
    },
    {
      id: 'wave',
      label: 'Wave',
      svg: wrap(`
        <path d="M170 30 Q190 22 196 44 L208 110 L222 96 Q236 84 246 96 Q256 108 246 122 L208 168 Q188 196 156 200 L120 204 Q92 206 78 188 L36 132 Q26 116 38 104 Q52 92 66 108 L96 142 L80 70 Q76 50 96 44 Q116 38 122 56 L138 116 L130 50 Q126 30 146 26 Q166 22 170 42 L184 110 Z" fill="${GOLD}"/>
      `),
    },
    {
      id: 'pray',
      label: 'Pray',
      svg: wrap(`
        <path d="M${C} 40 L96 130 L${C} 200 L160 130 Z" fill="${GOLD}"/>
        <path d="M80 220 L${C} 130 L176 220 Z" fill="${TEAL}"/>
      `),
    },
    {
      id: 'star',
      label: 'Star',
      svg: wrap(`<polygon points="128,30 156,98 230,98 170,140 192,210 128,168 64,210 86,140 26,98 100,98" fill="${GOLD}"/>`),
    },
    {
      id: 'clap',
      label: 'Clap',
      svg: wrap(`
        <ellipse cx="92" cy="${C}" rx="44" ry="68" fill="${GOLD}"/>
        <ellipse cx="164" cy="${C}" rx="44" ry="68" fill="${GOLD}"/>
        <path d="M40 60 L60 90 M60 56 L72 86 M196 56 L184 86 M216 60 L196 90" stroke="${TEAL}" stroke-width="6" stroke-linecap="round" fill="none"/>
      `),
    },
    {
      id: 'party',
      label: 'Party',
      svg: wrap(`
        <polygon points="40,216 92,80 200,200" fill="${TEAL}"/>
        <circle cx="120" cy="120" r="8" fill="${RED}"/>
        <circle cx="148" cy="160" r="6" fill="${GOLD}"/>
        <circle cx="170" cy="100" r="5" fill="${TEAL_LIGHT}"/>
        <circle cx="80" cy="140" r="6" fill="${GOLD}"/>
        <circle cx="100" cy="170" r="5" fill="${RED}"/>
        <path d="M92 80 L92 56 M92 56 L80 40 M92 56 L104 40" stroke="${NAVY}" stroke-width="4" fill="none"/>
      `),
    },
    {
      id: 'hug',
      label: 'Hug',
      svg: wrap(`
        <circle cx="${C}" cy="${C}" r="100" fill="${GOLD}"/>
        <ellipse cx="60" cy="170" rx="34" ry="26" fill="${GOLD}"/>
        <ellipse cx="196" cy="170" rx="34" ry="26" fill="${GOLD}"/>
        <circle cx="92" cy="120" r="8" fill="${NAVY}"/>
        <circle cx="164" cy="120" r="8" fill="${NAVY}"/>
        <path d="M88 160 Q128 192 168 160" stroke="${NAVY}" stroke-width="8" stroke-linecap="round" fill="none"/>
      `),
    },
    {
      id: 'wow',
      label: 'Wow',
      svg: wrap(`
        <circle cx="${C}" cy="${C}" r="100" fill="${GOLD}"/>
        <circle cx="96" cy="116" r="10" fill="${NAVY}"/>
        <circle cx="160" cy="116" r="10" fill="${NAVY}"/>
        <ellipse cx="${C}" cy="180" rx="22" ry="32" fill="${NAVY}"/>
      `),
    },
  ],
};

// ── Second pack — "Mood" (R12.1) ──────────────────────────────────────
// Exercises the multi-pack resolver: packId travels on the wire, so a
// sticker from this pack round-trips with no protocol change. Same flat
// geometric style + brand palette as the starter pack.
const MOOD_PACK: StickerPack = {
  id: 'mood',
  name: 'Mood',
  stickers: [
    {
      id: 'cool',
      label: 'Cool',
      svg: wrap(`
        <circle cx="${C}" cy="${C}" r="100" fill="${GOLD}"/>
        <rect x="40" y="112" width="24" height="10" rx="5" fill="${NAVY}"/>
        <rect x="192" y="112" width="24" height="10" rx="5" fill="${NAVY}"/>
        <rect x="60" y="104" width="136" height="30" rx="14" fill="${NAVY}"/>
        <path d="M92 170 Q128 198 164 170" fill="none" stroke="${NAVY}" stroke-width="10" stroke-linecap="round"/>
      `),
    },
    {
      id: 'love-eyes',
      label: 'Love',
      svg: wrap(`
        <circle cx="${C}" cy="${C}" r="100" fill="${GOLD}"/>
        <path d="M96 130 C80 114 80 100 90 100 C96 100 96 106 96 108 C96 106 96 100 102 100 C112 100 112 114 96 130 Z" fill="${RED}"/>
        <path d="M160 130 C144 114 144 100 154 100 C160 100 160 106 160 108 C160 106 160 100 166 100 C176 100 176 114 160 130 Z" fill="${RED}"/>
        <path d="M92 168 Q128 200 164 168" fill="none" stroke="${NAVY}" stroke-width="10" stroke-linecap="round"/>
      `),
    },
    {
      id: 'meh',
      label: 'Meh',
      svg: wrap(`
        <circle cx="${C}" cy="${C}" r="100" fill="${GOLD}"/>
        <circle cx="96" cy="116" r="10" fill="${NAVY}"/>
        <circle cx="160" cy="116" r="10" fill="${NAVY}"/>
        <path d="M92 168 L164 168" fill="none" stroke="${NAVY}" stroke-width="10" stroke-linecap="round"/>
      `),
    },
    {
      id: 'sleep',
      label: 'Sleep',
      svg: wrap(`
        <circle cx="${C}" cy="${C}" r="100" fill="${GOLD}"/>
        <path d="M80 116 Q96 130 112 116" fill="none" stroke="${NAVY}" stroke-width="9" stroke-linecap="round"/>
        <path d="M144 116 Q160 130 176 116" fill="none" stroke="${NAVY}" stroke-width="9" stroke-linecap="round"/>
        <path d="M104 178 Q128 190 152 178" fill="none" stroke="${NAVY}" stroke-width="9" stroke-linecap="round"/>
        <path d="M170 72 L196 72 L170 98 L196 98" fill="none" stroke="${TEAL}" stroke-width="8" stroke-linejoin="round"/>
        <path d="M200 44 L216 44 L200 62 L216 62" fill="none" stroke="${TEAL}" stroke-width="6" stroke-linejoin="round"/>
      `),
    },
    {
      id: 'check',
      label: 'Yes',
      svg: wrap(`
        <circle cx="${C}" cy="${C}" r="100" fill="${GREEN}"/>
        <path d="M76 132 L112 168 L184 92" fill="none" stroke="${WHITE}" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>
      `),
    },
    {
      id: 'cross',
      label: 'No',
      svg: wrap(`
        <circle cx="${C}" cy="${C}" r="100" fill="${RED}"/>
        <path d="M92 92 L164 164 M164 92 L92 164" fill="none" stroke="${WHITE}" stroke-width="18" stroke-linecap="round"/>
      `),
    },
    {
      id: 'rocket',
      label: 'Rocket',
      svg: wrap(`
        <path d="M128 28 C160 60 168 110 168 150 L88 150 C88 110 96 60 128 28 Z" fill="${CREAM}" stroke="${NAVY}" stroke-width="4"/>
        <circle cx="${C}" cy="96" r="20" fill="${TEAL}"/>
        <path d="M88 150 L60 196 L88 176 Z" fill="${RED}"/>
        <path d="M168 150 L196 196 L168 176 Z" fill="${RED}"/>
        <path d="M104 150 L128 222 L152 150 Z" fill="${GOLD}"/>
        <path d="M116 150 L128 194 L140 150 Z" fill="${RED}"/>
      `),
    },
    {
      id: 'gift',
      label: 'Gift',
      svg: wrap(`
        <rect x="56" y="112" width="144" height="108" rx="8" fill="${TEAL}"/>
        <rect x="48" y="92" width="160" height="28" rx="8" fill="${TEAL_LIGHT}"/>
        <rect x="116" y="92" width="24" height="128" fill="${GOLD}"/>
        <path d="M128 92 C100 64 72 76 88 96 C100 110 128 92 128 92 Z" fill="${GOLD}"/>
        <path d="M128 92 C156 64 184 76 168 96 C156 110 128 92 128 92 Z" fill="${GOLD}"/>
      `),
    },
  ],
};

const PACKS = new Map<string, StickerPack>([
  ['starter', STARTER_PACK],
  ['mood', MOOD_PACK],
]);

export function listStarterStickers(): Sticker[] { return STARTER_PACK.stickers; }

/** All packs in display order — used by the picker to render a section per pack. */
export function listPacks(): StickerPack[] { return [...PACKS.values()]; }

export function getSticker(packId: string, stickerId: string): Sticker | null {
  return PACKS.get(packId)?.stickers.find((s) => s.id === stickerId) ?? null;
}

/**
 * P4-5: stickers are immutable inside their pack so we can cache the
 * computed data-URL forever. Without this every StickerBubble render
 * (every poll tick, every reaction, every typing-state change) ran
 * encodeURIComponent → unescape → btoa over the full SVG string,
 * about ~2 KB per sticker.
 */
const dataUrlCache = new Map<string, string>();

export function stickerToDataUrl(sticker: Sticker): string {
  // Key on the SVG bytes, not the id — ids are only unique within a pack,
  // so two packs could legitimately share an id (e.g. both a 'heart').
  const cached = dataUrlCache.get(sticker.svg);
  if (cached) return cached;
  const b64 = typeof btoa !== 'undefined'
    ? btoa(unescape(encodeURIComponent(sticker.svg)))
    : Buffer.from(sticker.svg, 'utf-8').toString('base64');
  const url = `data:image/svg+xml;base64,${b64}`;
  dataUrlCache.set(sticker.svg, url);
  return url;
}

export { CREAM as STICKER_CANVAS_FALLBACK };
