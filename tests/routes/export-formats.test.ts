/**
 * export-formats.test.ts — the export pipeline's two silent failures.
 *
 *  1. `fountain` and `fdx` were implemented in the dispatch switch (routes/export.ts),
 *     given ExportBar entries and documented in openapi.ts — but never added to the Zod
 *     enum that `validate(ExportSchema)` runs FIRST. Every request for either format
 *     400'd before reaching the code that handles it. Both were unreachable from the day
 *     they shipped, and nothing failed loudly enough to notice.
 *
 *  2. Brand config was loaded with `WHERE user_id = ?` against `user_profiles`, which is
 *     a singleton keyed `id = 'default'` and has no `user_id` column at all. Postgres
 *     threw on every export, a bare `catch {}` swallowed it, and the fonts, colours and
 *     palette configured in Settings silently did nothing to any .docx, .pdf or .xlsx
 *     ANTON has ever produced.
 *
 * Both are the same failure mode: a wrong assumption protected by a swallowed error.
 * The tests below pin the two lists to each other and pin the query to the real schema,
 * because neither bug is visible in isolation — only in the relationship between files.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { ExportSchema } from '../../server/lib/schemas.js';

const ROUTE = readFileSync(join(process.cwd(), 'server/routes/export.ts'), 'utf8');
const REGISTRY = readFileSync(join(process.cwd(), 'server/services/renderer-registry.ts'), 'utf8');
const SCHEMA_SQL = readFileSync(join(process.cwd(), 'server/db/schema.postgresql.sql'), 'utf8');

/** Formats the dispatch switch actually handles. */
function dispatchedFormats(): string[] {
  const body = ROUTE.slice(ROUTE.indexOf('switch (format)'));
  return [...body.matchAll(/case '([a-z]+)':/g)].map((m) => m[1]);
}

function acceptedFormats(): string[] {
  const shape = ExportSchema.shape as { format: { options: string[] } };
  return shape.format.options;
}

describe('every dispatched format is accepted by the validator', () => {
  it('accepts fountain — implemented but previously rejected with a 400', () => {
    expect(acceptedFormats()).toContain('fountain');
  });

  it('accepts fdx — same', () => {
    expect(acceptedFormats()).toContain('fdx');
  });

  it('has no format in the switch that the validator would reject', () => {
    // The relationship that broke. A format can be implemented, wired to a button and
    // documented, and still be dead on arrival if it is missing from the enum.
    const missing = dispatchedFormats().filter((f) => !acceptedFormats().includes(f));
    expect(missing).toEqual([]);
  });

  it('still rejects a format nothing implements', () => {
    // The enum must stay a real gate, not be widened into a passthrough.
    expect(ExportSchema.safeParse({ format: 'exe', content: 'x' }).success).toBe(false);
  });

  it('validates a real request end to end', () => {
    for (const format of dispatchedFormats()) {
      const parsed = ExportSchema.safeParse({ format, content: '# Hello' });
      expect(parsed.success, `format ${format} should validate`).toBe(true);
    }
  });
});

describe('brand config is read with a column that exists', () => {
  it('user_profiles is a singleton with no user_id column', () => {
    const table = SCHEMA_SQL.slice(
      SCHEMA_SQL.indexOf('CREATE TABLE IF NOT EXISTS user_profiles'),
    );
    const body = table.slice(0, table.indexOf(');'));
    expect(body).toContain("id TEXT PRIMARY KEY DEFAULT 'default'");
    expect(body).not.toMatch(/^\s*user_id\s/m);
  });

  it('the export route no longer queries user_id', () => {
    expect(ROUTE).not.toMatch(/FROM user_profiles WHERE user_id/);
    expect(ROUTE).toMatch(/FROM user_profiles WHERE id = \?/);
  });

  it('the renderer registry no longer queries user_id', () => {
    expect(REGISTRY).not.toMatch(/FROM user_profiles WHERE user_id/);
    expect(REGISTRY).toMatch(/FROM user_profiles WHERE id = \?/);
  });

  it('does not swallow the failure silently any more', () => {
    // A bare `catch {}` is what let a query against a nonexistent column survive in
    // two files. Branding must not break an export, but it must not fail invisibly.
    const block = ROUTE.slice(ROUTE.indexOf('brand config'), ROUTE.indexOf('switch (format)'));
    expect(block).toMatch(/console\.warn/);
    expect(block).not.toMatch(/catch\s*\{\s*\/\*[^}]*\*\/\s*\}/);
  });

  it('maps the stored shape to the renderer contract instead of casting', () => {
    // brand_config stores { fonts, palette }; renderers read primary_color /
    // accent_color / font_family. A cast compiles and produces undefined at runtime.
    const fn = REGISTRY.slice(REGISTRY.indexOf('async function loadBrandTemplate'));
    const body = fn.slice(0, fn.indexOf('\n  }'));
    expect(body).toContain('primary_color');
    expect(body).toContain('font_family');
    expect(body).toContain('cfg.fonts?.body?.family');
    expect(body).not.toMatch(/return cfg as/);
  });

  it('passes the whole stored config through `extra` so nothing is dropped', () => {
    const fn = REGISTRY.slice(REGISTRY.indexOf('async function loadBrandTemplate'));
    expect(fn.slice(0, fn.indexOf('\n  }'))).toMatch(/extra: cfg/);
  });
});
