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
// Source: the official Claude Design logo (design_handoff_companion_app/logo/
// 01-monolith.svg). Uses paths for the A — no font rasterization needed.
const baseSvg = fs.readFileSync(
  path.join(repoRoot, 'design_handoff_companion_app', 'logo', '01-monolith.svg'),
  'utf8'
);

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

// Adaptive-icon foreground: place the Claude Design logo inside the
// 72×72 "safe zone" of a 108×108 transparent canvas so the launcher's
// background colour shows around it as a halo. Original SVG fills its
// entire 512-unit viewBox with the rounded green square; we wrap that
// content in a transform group that scales it down to 72/512 = 0.140625
// and translates it to (18, 18) — i.e., centred in Android's adaptive-
// icon safe zone.
//
// Strokes scale with the transform, so the A's stroke-width 44 in the
// source becomes 44 × 0.140625 = 6.19 in the 108-unit viewport — the
// correct proportional thickness for the smaller icon.
function buildForegroundSvg(px) {
  const inner = baseSvg
    .replace(/<\?xml[^>]*\?>\s*/, '')
    .replace(/<svg[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 108 108">
  <g transform="translate(18,18) scale(0.140625)">${inner}</g>
</svg>`;
}

// Legacy fallback (ic_launcher.png + ic_launcher_round.png) is the
// FULL logo at the icon's native size — no padding, no halo. This is
// what pre-Android-8 launchers and some launcher fallbacks display.
function buildLegacySvg(px) {
  return baseSvg.replace(
    '<svg ',
    `<svg width="${px}" height="${px}" `
  );
}

for (const s of sizes) {
  const dir = path.join(resBase, `mipmap-${s.density}`);

  // Foreground: padded with safe zone for adaptive-icon halo
  const fgResvg = new Resvg(buildForegroundSvg(s.px), { background: 'transparent' });
  const fgPng = fgResvg.render().asPng();
  fs.writeFileSync(path.join(dir, 'ic_launcher_foreground.png'), fgPng);

  // Legacy: full logo, no padding
  const legacyResvg = new Resvg(buildLegacySvg(s.px), { background: 'transparent' });
  const legacyPng = legacyResvg.render().asPng();
  fs.writeFileSync(path.join(dir, 'ic_launcher.png'), legacyPng);
  fs.writeFileSync(path.join(dir, 'ic_launcher_round.png'), legacyPng);

  console.log(`mipmap-${s.density.padEnd(7)} ${s.px}px → fg ${fgPng.length}b, legacy ${legacyPng.length}b`);
}
