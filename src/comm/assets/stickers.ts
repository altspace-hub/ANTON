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

const PACKS = new Map<string, StickerPack>([['starter', STARTER_PACK]]);

export function listStarterStickers(): Sticker[] { return STARTER_PACK.stickers; }

export function getSticker(packId: string, stickerId: string): Sticker | null {
  return PACKS.get(packId)?.stickers.find((s) => s.id === stickerId) ?? null;
}

export function stickerToDataUrl(sticker: Sticker): string {
  // base64-encode the SVG so it works in <img src="…"> without inline-SVG cost.
  const b64 = typeof btoa !== 'undefined'
    ? btoa(unescape(encodeURIComponent(sticker.svg)))
    : Buffer.from(sticker.svg, 'utf-8').toString('base64');
  return `data:image/svg+xml;base64,${b64}`;
}

export { CREAM as STICKER_CANVAS_FALLBACK };
