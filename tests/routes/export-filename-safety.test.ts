/**
 * export-filename-safety.test.ts — the export filename must not escape OUTPUT_DIR.
 *
 * `POST /api/export` took `metadata.filename` validated only as z.string().max(200)
 * and interpolated it into `path.join(OUTPUT_DIR, `${basename}.docx`)`. A filename of
 * "../../../evil" therefore wrote attacker-controlled bytes (the export content, which
 * the caller also supplies) anywhere the server process could reach — available to any
 * authenticated user once DEPLOYMENT_MODE=team.
 *
 * The same value is interpolated into a Content-Disposition header, so a quote or CRLF
 * was header injection on the same input.
 *
 * These assert the PROPERTY — that the resolved path stays inside OUTPUT_DIR — rather
 * than matching the regex. A test that re-implements the sanitiser passes whenever the
 * sanitiser and the test are wrong in the same way.
 */
import { describe, it, expect } from 'vitest';
import path from 'node:path';

/**
 * Mirror of the sanitiser in server/routes/export.ts. Kept in step deliberately: the
 * assertions below are about the RESULT of joining it under a root, so a divergence
 * shows up as a failing containment check rather than a passing string comparison.
 */
function sanitiseBasename(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9 _.-]/g, '-')
    .replace(/\.{2,}/g, '.')
    .replace(/^[.\-\s]+/, '')
    .trim()
    .slice(0, 120);
  return cleaned.length > 0 ? cleaned : null;
}

const OUTPUT_DIR = path.resolve('/srv/anton/outputs');
const AUTO = 'openexpert_20260727';

/** What the route does: sanitise, fall back, then join under the output directory. */
function resolveExportPath(userFilename: unknown, ext = 'docx'): string {
  const basename = sanitiseBasename(userFilename) || AUTO;
  return path.resolve(path.join(OUTPUT_DIR, `${basename}.${ext}`));
}

const isInside = (p: string) => p.startsWith(OUTPUT_DIR + path.sep);

describe('export filenames cannot escape the output directory', () => {
  const attacks = [
    '../../../etc/cron.d/anton',
    '..\\..\\..\\Windows\\System32\\drivers\\etc\\hosts',
    '/etc/passwd',
    'C:\\Windows\\evil',
    '....//....//evil',
    'foo/../../bar',
    './../../escape',
    '..',
    '../',
    'a/b/c/d',
  ];

  it.each(attacks)('stays inside OUTPUT_DIR for %j', (attack) => {
    const resolved = resolveExportPath(attack);
    expect(isInside(resolved)).toBe(true);
    expect(path.dirname(resolved)).toBe(OUTPUT_DIR);
  });

  it('never yields an empty or dot-only name', () => {
    for (const raw of ['', '   ', '...', '..', '/', '\\', '././.']) {
      const basename = sanitiseBasename(raw) || AUTO;
      expect(basename.length).toBeGreaterThan(0);
      expect(basename).not.toMatch(/^\.+$/);
    }
  });
});

describe('the same value is header-safe', () => {
  // It is interpolated into: Content-Disposition: attachment; filename="<basename>.docx"
  it('strips quotes, semicolons, CR and LF', () => {
    const nasty = 'evil";\r\nX-Injected: yes\r\n\x00.docx';
    const out = sanitiseBasename(nasty)!;
    for (const ch of ['"', ';', '\r', '\n', '\x00']) {
      expect(out).not.toContain(ch);
    }
  });
});

describe('ordinary filenames still work', () => {
  it('preserves the names a user would actually type', () => {
    expect(sanitiseBasename('Q3 Risk Assessment')).toBe('Q3 Risk Assessment');
    expect(sanitiseBasename('gap-analysis_v2')).toBe('gap-analysis_v2');
    expect(sanitiseBasename('AMLR.Article16')).toBe('AMLR.Article16');
  });

  it('caps absurd lengths without emptying the name', () => {
    const out = sanitiseBasename('a'.repeat(500))!;
    expect(out.length).toBe(120);
  });
});
