/**
 * locale-parity.test.ts — every UI string in en.json exists in every locale.
 *
 * 2026-09-23: 26 keys added since the summer (the header's engine status, the
 * per-module task placeholder, the mode toggle, five nav items, seven Settings
 * labels) were in en.json only, so the other 29 languages showed them in
 * English — and header.apiNotConfigured still said "API not configured" there
 * after its English meaning changed to "no AI engine configured". All 29 were
 * filled in; this keeps a new English string from shipping untranslated.
 *
 * Also checks that each translation keeps the English value's {{placeholders}}:
 * a dropped {{module}} or {{count}} renders a sentence with a hole in it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(process.cwd(), 'public', 'locales');
type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  for (const [k, v] of Object.entries(tree)) {
    if (typeof v === 'string') out.set(prefix + k, v);
    else for (const [kk, vv] of flatten(v, `${prefix}${k}.`)) out.set(kk, vv);
  }
  return out;
}

const load = (file: string) => flatten(JSON.parse(readFileSync(join(DIR, file), 'utf8')) as Tree);
const tokens = (s: string) => [...s.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]).sort();

const en = load('en.json');
// The main UI locales; the *-school.json files are School mode's own, smaller set.
const locales = readdirSync(DIR).filter((f) => /^[a-z]{2}\.json$/.test(f) && f !== 'en.json');

describe('a component reads its keys from the namespace that has them', () => {
  // 2026-09-23: the mode toggle read `useTranslation('school')`, but only two of
  // its nine keys were in en-school.json and School-mode files exist for six
  // languages only — so the toggle was English everywhere, whatever the
  // translations in the main files said. Läxhjälp had five keys in no file at
  // all. A key missing from the namespace a component reads shows its English
  // fallback text in every language.
  const school = flatten(JSON.parse(readFileSync(join(DIR, 'en-school.json'), 'utf8')) as Tree);
  const SRC = join(process.cwd(), 'src');
  const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? (/^(app|comm|pay|agent|business)$/.test(d.name) && dir === SRC ? [] : walk(join(dir, d.name)))
      : /\.tsx?$/.test(d.name) ? [join(dir, d.name)] : []);
  const schoolFiles = walk(SRC).filter((f) => /useTranslation\('school'\)/.test(readFileSync(f, 'utf8')));

  it('finds the School-mode components (so an empty scan cannot pass)', () => {
    expect(schoolFiles.length).toBeGreaterThan(20);
  });

  it('every key a School-mode component reads is in en-school.json', () => {
    const missing = schoolFiles.flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/\bt\('([a-zA-Z][\w.]+)'/g)]
      .map((m) => m[1]).filter((k) => !school.has(k)).map((k) => `${f.replace(process.cwd(), '.')}: ${k}`));
    expect(missing).toEqual([]);
  });
});

describe('School-mode locale parity with en-school.json', () => {
  // School mode has its own files for six languages (src/i18n/index.ts). On
  // 2026-09-23 sv/fr lacked ~150 keys and ar/ur/hi ~430 of 509 — most of the
  // School UI was English in those languages. All filled; this keeps them so.
  const enSchool = load('en-school.json');
  const schoolLocales = readdirSync(DIR).filter((f) => /^[a-z]{2}-school\.json$/.test(f) && f !== 'en-school.json');

  it('finds the School locales', () => {
    expect(schoolLocales.length).toBeGreaterThanOrEqual(5);
  });

  it.each(schoolLocales)('%s has every English key, with its {{placeholders}}', (file) => {
    const loc = load(file);
    const problems: string[] = [];
    for (const [key, english] of enSchool) {
      const value = loc.get(key);
      if (value === undefined) problems.push(`${key}: missing`);
      else if (!value.trim()) problems.push(`${key}: empty`);
      else if (tokens(value).join() !== tokens(english).join()) problems.push(`${key}: {{${tokens(english).join(', ')}}} → {{${tokens(value).join(', ')}}}`);
    }
    expect(problems).toEqual([]);
  });
});

describe('locale parity with en.json', () => {
  it('finds the locales (so an empty scan cannot pass)', () => {
    expect(en.size).toBeGreaterThan(800);
    expect(locales.length).toBeGreaterThanOrEqual(29);
  });

  it.each(locales)('%s has every English key', (file) => {
    const loc = load(file);
    const missing = [...en.keys()].filter((k) => !loc.has(k));
    expect(missing).toEqual([]);
  });

  it.each(locales)('%s keeps every {{placeholder}} and leaves no value empty', (file) => {
    const loc = load(file);
    const problems: string[] = [];
    for (const [key, english] of en) {
      const value = loc.get(key);
      if (value === undefined) continue;
      if (!value.trim()) problems.push(`${key}: empty`);
      else if (tokens(value).join() !== tokens(english).join()) {
        problems.push(`${key}: {{${tokens(english).join(', ')}}} → {{${tokens(value).join(', ')}}}`);
      }
    }
    expect(problems).toEqual([]);
  });
});
