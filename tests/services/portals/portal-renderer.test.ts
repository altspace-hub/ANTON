/**
 * Unit tests for the portal renderer's safety properties (Wave-3 plan 3.7):
 *
 *   - renderSimpleSubstitutionsOnly: every substituted value is HTML-escaped
 *     by default — script tags / event handlers smuggled through page title,
 *     portal facts, or structured data come out as inert text
 *   - missing variables resolve to the empty string (no leak of the raw
 *     placeholder semantics)
 *   - {{!raw}} stays a deliberate, expression-only escape hatch
 *   - {{asset:…}} only matches its safe charset and produces URLs under the
 *     portal's /assets/ prefix
 *   - {{#each kind}} expansion (via a DB stub) escapes item values and key
 *
 * No real DB — the each-block test stubs the two queries the renderer makes.
 */

import { describe, it, expect } from 'vitest';

import {
  createPortalRenderer,
  renderSimpleSubstitutionsOnly,
  type RenderPageInput,
} from '../../../server/services/portals/portal-renderer.js';
import type { DatabaseAdapter, RunResult } from '../../../server/db/database.js';

function input(html: string, overrides: {
  title?: string | null;
  displayTitle?: string | null;
  structuredData?: Record<string, unknown> | null;
} = {}): RenderPageInput {
  return {
    page: {
      path: '/',
      title: overrides.title !== undefined ? overrides.title : 'Home',
      html,
      sortOrder: 0,
      updatedAt: '2026-06-10T00:00:00.000Z',
      structuredData: overrides.structuredData ?? null,
    },
    portal: {
      address: 'cake-shop.futurechain.portal',
      name: 'cake-shop',
      namespace: 'futurechain',
      displayTitle: overrides.displayTitle !== undefined ? overrides.displayTitle : 'The Cake Shop',
      category: 'commerce',
    },
  };
}

describe('renderSimpleSubstitutionsOnly — injection stays inert', () => {
  it('HTML-escapes a script tag smuggled through the page title', () => {
    const out = renderSimpleSubstitutionsOnly(
      input('<h1>{{title}}</h1>', { title: '<script>alert(1)</script>' }),
    );
    expect(out).not.toContain('<script>');
    expect(out).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('HTML-escapes portal facts ({{portal.displayTitle}})', () => {
    const out = renderSimpleSubstitutionsOnly(
      input('<p>{{portal.displayTitle}}</p>', { displayTitle: '"><img src=x onerror=alert(1)>' }),
    );
    expect(out).not.toContain('<img');
    expect(out).toContain('&quot;&gt;&lt;img');
  });

  it('HTML-escapes structured-data values ({{data.*}})', () => {
    const out = renderSimpleSubstitutionsOnly(
      input('<p>{{data.products.0.name}}</p>', {
        structuredData: { products: [{ name: "<b onmouseover='x()'>Cake</b>" }] },
      }),
    );
    expect(out).not.toContain('<b ');
    expect(out).toContain('&lt;b');
    expect(out).toContain('&#39;x()&#39;');
  });

  it('a substituted value containing {{...}} is not re-expanded (no recursive interpolation)', () => {
    const out = renderSimpleSubstitutionsOnly(
      input('<p>{{data.note}}</p>', {
        structuredData: { note: '{{portal.displayTitle}}' },
        displayTitle: 'SHOULD-NOT-APPEAR',
      }),
    );
    // The injected placeholder is emitted as literal (escaped) text, not resolved.
    expect(out).not.toContain('SHOULD-NOT-APPEAR');
  });

  it('missing variables resolve to the empty string', () => {
    const out = renderSimpleSubstitutionsOnly(input('<p>[{{data.missing.deep}}][{{nope}}]</p>'));
    expect(out).toBe('<p>[][]</p>');
  });

  it('{{!raw}} emits unescaped but only for word/dot expressions (documented escape hatch)', () => {
    const out = renderSimpleSubstitutionsOnly(
      input('<div>{{!raw data.html}}</div>', { structuredData: { html: '<em>rich</em>' } }),
    );
    expect(out).toContain('<em>rich</em>');
    // The raw form cannot smuggle arbitrary expressions — anything beyond
    // [\w.]+ is left untouched as literal text.
    const literal = renderSimpleSubstitutionsOnly(input('<div>{{!raw <script>}}</div>'));
    expect(literal).toContain('{{!raw <script>}}');
  });
});

describe('renderSimpleSubstitutionsOnly — {{asset:…}} boundaries', () => {
  it('rewrites a normal asset path under the portal assets prefix', () => {
    const out = renderSimpleSubstitutionsOnly(input('<img src="{{asset:img/logo.png}}">'));
    expect(out).toContain(
      `src="/api/portals/${encodeURIComponent('cake-shop.futurechain.portal')}/assets/img/logo.png"`,
    );
  });

  it('does not match asset expressions containing illegal characters', () => {
    // Spaces, braces, angle brackets, backslashes are outside the charset —
    // the placeholder is left verbatim (inert text), not turned into a URL.
    const out = renderSimpleSubstitutionsOnly(
      input('<img src="{{asset:..\\windows\\system32}}"><a href="{{asset:a b}}">x</a>'),
    );
    expect(out).toContain('{{asset:..\\windows\\system32}}');
    expect(out).toContain('{{asset:a b}}');
  });

  it('asset substitution never escapes the /assets/ URL prefix for safe-charset paths', () => {
    const out = renderSimpleSubstitutionsOnly(input('<img src="{{asset:deep/a-b_c.0.png}}">'));
    expect(out).toContain('/assets/deep/a-b_c.0.png');
    expect(out.startsWith('<img src="/api/portals/')).toBe(true);
  });
});

describe('{{#each kind}} expansion (DB-stubbed)', () => {
  function eachDb(items: Array<{ kind: string; key: string; value: Record<string, unknown> }>): DatabaseAdapter {
    const ok: RunResult = { changes: 0, lastInsertRowid: 0 };
    return {
      dialect: 'postgresql',
      async get<T>(sql: string): Promise<T | undefined> {
        if (sql.includes('FROM portals')) return { id: 'portal-1' } as T;
        return undefined;
      },
      async all<T>(sql: string): Promise<T[]> {
        if (sql.includes('FROM portal_structured_data')) return items as T[];
        return [];
      },
      async run(): Promise<RunResult> { return ok; },
      async exec(): Promise<void> { /* noop */ },
      async transaction<T>(fn: (db: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(this); },
      async close(): Promise<void> { /* noop */ },
    };
  }

  it('iterates items and HTML-escapes their fields and key', async () => {
    const renderer = createPortalRenderer(eachDb([
      { kind: 'products', key: 'p<1>', value: { name: '<script>x</script>', price: 12 } },
      { kind: 'products', key: 'p2', value: { name: 'Plain', price: 9 } },
    ]));
    const html = '<ul>{{#each products}}<li>{{key}}: {{name}} — {{price}}</li>{{/each}}</ul>';
    const out = await renderer.renderPage(input(html));
    expect(out).toContain('<li>p&lt;1&gt;: &lt;script&gt;x&lt;/script&gt; — 12</li>');
    expect(out).toContain('<li>p2: Plain — 9</li>');
    expect(out).not.toContain('<script>');
  });

  it('renders an empty string for a kind with no rows', async () => {
    const renderer = createPortalRenderer(eachDb([]));
    const out = await renderer.renderPage(input('<ul>{{#each nothing}}<li>{{name}}</li>{{/each}}</ul>'));
    expect(out).toBe('<ul></ul>');
  });

  it('leaves top-level placeholders inside each-blocks for the second pass', async () => {
    const renderer = createPortalRenderer(eachDb([
      { kind: 'products', key: 'p1', value: { name: 'Cake' } },
    ]));
    const out = await renderer.renderPage(
      input('{{#each products}}<li>{{name}} @ {{portal.name}}</li>{{/each}}'),
    );
    expect(out).toBe('<li>Cake @ cake-shop</li>');
  });
});
