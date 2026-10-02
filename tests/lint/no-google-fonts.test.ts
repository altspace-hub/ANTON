/**
 * no-google-fonts.test.ts — no page of the web app loads a font from Google.
 *
 * The public demo's privacy notice says its pages load no fonts, scripts or
 * other files from other websites (privacy memo gate G5; LG München I,
 * 3 O 17493/20: a page that asks Google for its fonts gives Google the
 * visitor's IP address with no legal basis). The web app bundles Inter and
 * JetBrains Mono from @fontsource instead (src/fonts.ts, imported by
 * src/main.tsx). This keeps a Google Fonts <link>, @import, CSP source or
 * Workbox cache rule from coming back.
 *
 * The built dist/client/index.html is made from index.html, so the source is
 * what is checked; a stale local build is not.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, extname } from 'path';

const ROOT = process.cwd();
// Matches the host written plainly and as an escaped regex (fonts\.googleapis\.com).
const GOOGLE_FONTS = /fonts\\?\.(?:googleapis|gstatic)\\?\.com/i;
const TEXT_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.css', '.html', '.json', '.svg', '.md']);

function read(file: string): string {
  return readFileSync(join(ROOT, file), 'utf8');
}

function textFilesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...textFilesUnder(full));
    else if (TEXT_EXTENSIONS.has(extname(name).toLowerCase())) out.push(full);
  }
  return out;
}

describe('no Google Fonts in the web app', () => {
  it('index.html links no font from Google', () => {
    expect(read('index.html')).not.toMatch(GOOGLE_FONTS);
  });

  it('the web app loads the self-hosted fonts', () => {
    expect(read('src/main.tsx')).toMatch(/^import '\.\/fonts';/m);
    expect(read('src/fonts.ts')).toMatch(/@fontsource\/inter\//);
  });

  it('no file under src/ names a Google Fonts host', () => {
    const offenders = textFilesUnder(join(ROOT, 'src'))
      .filter((file) => GOOGLE_FONTS.test(readFileSync(file, 'utf8')))
      .map((file) => relative(ROOT, file));
    expect(offenders).toEqual([]);
  });

  it('the server CSP allows no Google Fonts host', () => {
    expect(read('server/index.ts')).not.toMatch(GOOGLE_FONTS);
    expect(read('server/lib/content-security-policy.ts')).not.toMatch(GOOGLE_FONTS);
    // server/index.ts sends the shared directives, demo-aware.
    expect(read('server/index.ts')).toMatch(/directives:\s*cspDirectives\(isDemoMode\(\)\)/);
  });

  it('the service worker keeps no Google Fonts cache', () => {
    expect(read('vite.config.ts')).not.toMatch(GOOGLE_FONTS);
  });
});
