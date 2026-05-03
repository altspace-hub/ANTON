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

// Render public/anton-logo.svg verbatim — the launcher PNG is now an
// exact copy of the webgui mark including the rounded-square rect and
// the centred Inter Bold A. We ship it as a LEGACY launcher PNG (no
// adaptive-icon XML) so the system launcher renders it as-is rather
// than cropping it to the launcher's adaptive mask shape (which would
// turn the rounded square into a circle on most launchers).
for (const s of sizes) {
  // Inject explicit width/height into the <svg> tag — without these,
  // resvg renders at the SVG's intrinsic 32×32 viewBox size and ignores
  // the fitTo option.
  const svg = baseSvg.replace(
    '<svg ',
    `<svg width="${s.px}" height="${s.px}" `
  );
  const resvg = new Resvg(svg, {
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
