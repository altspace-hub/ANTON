/**
 * Generate circle-masked FutureChain logo variants from the square source PNGs.
 *
 * Source:  docs/logos_fc_small/fc_{blue,gold,lightblue,white}.png (~1254x1254, square bg)
 * Output:  public/branding/futurechain/fc_<name>_circle_<size>.png
 *          sizes: 512 / 192 / 96 / 48 — transparent outside the circle,
 *          the square bg colour fills the circle, mark stays centered.
 *          Plus fc_blue_circle.svg (self-contained base64 PNG-in-circle wrapper).
 *
 * Blue is the documented PRIMARY palette (user decision 2026-06-11).
 *
 * Run: node scripts/make-fc-logos.cjs
 */
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const SRC_DIR = path.join(ROOT, 'docs', 'logos_fc_small');
const OUT_DIR = path.join(ROOT, 'public', 'branding', 'futurechain');

const PALETTES = ['blue', 'gold', 'lightblue', 'white']; // blue = primary
const SIZES = [512, 192, 96, 48];

function circleMask(size) {
  const r = size / 2;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
      `<circle cx="${r}" cy="${r}" r="${r}" fill="#fff"/></svg>`
  );
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  for (const name of PALETTES) {
    const src = path.join(SRC_DIR, `fc_${name}.png`);
    if (!fs.existsSync(src)) {
      console.error(`MISSING source: ${src}`);
      process.exitCode = 1;
      continue;
    }
    for (const size of SIZES) {
      const out = path.join(OUT_DIR, `fc_${name}_circle_${size}.png`);
      await sharp(src)
        .resize(size, size, { fit: 'cover' })
        .composite([{ input: circleMask(size), blend: 'dest-in' }])
        .png({ compressionLevel: 9 })
        .toFile(out);
      const kb = (fs.statSync(out).size / 1024).toFixed(1);
      console.log(`ok  fc_${name}_circle_${size}.png  (${kb} KB)`);
    }
  }

  // Self-contained SVG wrapper for the primary (blue) palette:
  // circle-clipped base64 PNG (192px master) — scales cleanly for inline web use.
  const b64 = fs
    .readFileSync(path.join(OUT_DIR, 'fc_blue_circle_192.png'))
    .toString('base64');
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
    `width="192" height="192" viewBox="0 0 192 192">\n` +
    `  <image width="192" height="192" xlink:href="data:image/png;base64,${b64}"/>\n` +
    `</svg>\n`;
  fs.writeFileSync(path.join(OUT_DIR, 'fc_blue_circle.svg'), svg);
  console.log('ok  fc_blue_circle.svg (base64 PNG-in-circle wrapper)');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
