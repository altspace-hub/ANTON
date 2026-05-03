#!/usr/bin/env node
/**
 * Render the webgui logo (public/anton-logo.svg) to Android launcher
 * PNGs at all 5 mipmap densities, using the actual Inter Bold TTF the
 * desktop webgui ships through Google Fonts. The "A" is then drawn by
 * the real font rasterizer instead of a hand-traced vector path.
 *
 * Usage:
 *   pnpm exec node scripts/icons/render-launcher-icon.js
 *
 * Writes: android/app/src/main/res/mipmap-{m,h,x,xx,xxx}hdpi/ic_launcher_foreground.png
 *         android/app/src/main/res/mipmap-{m,h,x,xx,xxx}hdpi/ic_launcher.png            (legacy fallback)
 *         android/app/src/main/res/mipmap-{m,h,x,xx,xxx}hdpi/ic_launcher_round.png      (legacy fallback)
 *
 * Requires @resvg/resvg-js (install temporarily if not present:
 *   npm i --no-save @resvg/resvg-js
 * — keeps the dependency out of the runtime bundle).
 */

const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');

const repoRoot = path.resolve(__dirname, '..', '..');
const baseSvg = fs.readFileSync(path.join(repoRoot, 'public', 'anton-logo.svg'), 'utf8');
const interBold = fs.readFileSync(path.join(__dirname, 'Inter-Bold.ttf'));

// Adaptive-icon foreground (and legacy launcher) sizes per density:
//   mdpi (1×):    108px
//   hdpi (1.5×):  162px
//   xhdpi (2×):   216px
//   xxhdpi (3×):  324px
//   xxxhdpi (4×): 432px
const sizes = [
  { density: 'mdpi',    px: 108 },
  { density: 'hdpi',    px: 162 },
  { density: 'xhdpi',   px: 216 },
  { density: 'xxhdpi',  px: 324 },
  { density: 'xxxhdpi', px: 432 },
];

const resBase = path.join(repoRoot, 'android', 'app', 'src', 'main', 'res');

// Launcher-icon-specific tweaks to the webgui SVG:
//   - font-size 18 → 14 (smaller A; takes ~32% of icon height instead of 41%
//     so it sits comfortably inside the launcher's circular mask)
//   - y position 55% → 50% (true vertical centre, not the optical-text 55%
//     bias the webgui uses for in-app rendering)
// Webgui SVG is NOT modified — these transforms only apply to the launcher
// render so the brand mark in the app keeps its current proportions.
const launcherTweaks = (svg) => svg
  .replace('font-size="18"', 'font-size="14"')
  .replace('y="55%"', 'y="50%"');

for (const s of sizes) {
  // Inject explicit width/height into the <svg> tag — without these,
  // resvg renders at the SVG's intrinsic 32×32 viewBox size and ignores
  // the fitTo option.
  const svg = launcherTweaks(baseSvg).replace(
    '<svg ',
    `<svg width="${s.px}" height="${s.px}" `
  );
  const resvg = new Resvg(svg, {
    font: {
      fontBuffers: [interBold],
      defaultFontFamily: 'Inter',
      loadSystemFonts: false,
    },
    background: 'transparent',
  });
  const png = resvg.render().asPng();

  const dir = path.join(resBase, `mipmap-${s.density}`);
  fs.writeFileSync(path.join(dir, 'ic_launcher_foreground.png'), png);
  // Same image doubles as the legacy pre-Android-8 launcher icon.
  fs.writeFileSync(path.join(dir, 'ic_launcher.png'), png);
  fs.writeFileSync(path.join(dir, 'ic_launcher_round.png'), png);
  console.log(`mipmap-${s.density.padEnd(7)} ${s.px}px → ${png.length} bytes`);
}
