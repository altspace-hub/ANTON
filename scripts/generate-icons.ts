/**
 * Generate tray icons and app icon using the openEXPERT brand colours.
 * Matches the logo on the start page: teal #2DD4A8 rounded rect + dark #0B1426 "A".
 *
 * Run: pnpm run electron:icons
 *
 * Produces in electron/icons/:
 *   tray-active.png   22×22  — teal bg  (server running)
 *   tray-idle.png     22×22  — grey bg  (stopped / not yet started)
 *   tray-loading.png  22×22  — amber bg (starting up)
 *   app.png           512×512 — full logo for NSIS installer / DMG / AppImage
 */
import sharp from 'sharp';
import path from 'path';
import fs from 'fs-extra';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const iconsDir = path.join(__dirname, '..', 'electron', 'icons');
await fs.ensureDir(iconsDir);

// ── Brand colours (light/corporate variant: dark green + white "A") ─────────
const TEAL    = '#0D7D6C';  // Dark teal-green — active state (adv-teal in light theme)
const DARK    = '#FFFFFF';  // White — text on dark green
const GREY_BG = '#374151';  // Neutral dark grey — idle state
const GREY_FG = '#9CA3AF';  // Muted grey — idle text
const AMBER   = '#F59E0B';  // Amber — loading / starting state

// ── SVG builder (rounded-rect matching the logo's rx="8" proportion) ────────
function makeSvg(size: number, bg: string, fg: string): Buffer {
  const rx = Math.round(size * 0.25);  // corner radius — ~25% of size
  const fs = Math.round(size * 0.56);  // font-size
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${rx}" fill="${bg}"/>
  <text x="50%" y="52%" dominant-baseline="central" text-anchor="middle"
        font-family="Inter, Arial, sans-serif" font-weight="700"
        font-size="${fs}" fill="${fg}">A</text>
</svg>`;
  return Buffer.from(svg);
}

// ── Tray icons (22×22) ───────────────────────────────────────────────────────
const trayIcons: Array<{ name: string; bg: string; fg: string }> = [
  { name: 'tray-active',  bg: TEAL,    fg: DARK    },
  { name: 'tray-idle',    bg: GREY_BG, fg: GREY_FG },
  { name: 'tray-loading', bg: AMBER,   fg: DARK    },
];

for (const { name, bg, fg } of trayIcons) {
  await sharp(makeSvg(22, bg, fg))
    .png()
    .toFile(path.join(iconsDir, `${name}.png`));
  console.log(`✓ ${name}.png  (22×22)`);
}

// ── App icon (512×512) ───────────────────────────────────────────────────────
await sharp(makeSvg(512, TEAL, DARK))
  .png()
  .toFile(path.join(iconsDir, 'app.png'));
console.log('✓ app.png  (512×512)');

console.log(`\nAll icons written to electron/icons/`);
