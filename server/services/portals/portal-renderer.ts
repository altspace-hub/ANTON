/**
 * portal-renderer.ts — minimal HTML interpolation, no templating engine.
 *
 * Per Spec v0.2 Part O.2: defer the templating-engine choice. v0.7.x ships
 * with a tiny in-house substitution layer so:
 *   - the AI walkthrough's HTML output stays the source of truth
 *   - advanced users can hand-edit pages without re-render churn
 *   - we can adopt Handlebars / Mustache / JSX-server-render later without
 *     a wire-format break
 *
 * Supported syntax (everything else passes through verbatim):
 *
 *   {{title}}                       — page title
 *   {{updatedAt}}                   — page updatedAt timestamp
 *   {{portal.<field>}}              — portal facts: displayTitle, category,
 *                                     address, namespace, name
 *   {{page.<field>}}                — page facts: path, title, sortOrder
 *   {{data.<jsonpath>}}             — read from page.structured_data via dot-
 *                                     and-bracket path: data.products.0.name
 *   {{#each <kind>}}…{{/each}}      — iterate portal_structured_data WHERE
 *                                     kind=<kind>; inside the block,
 *                                     {{field}} reads value.field of the
 *                                     current item.
 *   {{asset:<path>}}                — substitutes /api/portals/<address>/
 *                                     assets/<path>
 *   {{!raw <expr>}}                 — emit without HTML escaping (rare)
 *
 * Default behaviour: all substituted values are HTML-escaped. Missing
 * variables resolve to the empty string.
 */

import type { DatabaseAdapter } from '../../db/database.js';

// ── Public API ──────────────────────────────────────────────────────────────

export interface RenderPageInput {
  page: {
    path: string;
    title: string | null;
    html: string;
    sortOrder: number;
    updatedAt: string;
    structuredData: Record<string, unknown> | null;
  };
  portal: {
    address: string; // "<name>.<namespace>.portal"
    name: string;
    namespace: string;
    displayTitle: string | null;
    category: string;
  };
}

export interface PortalRenderer {
  renderPage(input: RenderPageInput): Promise<string>;
}

export function createPortalRenderer(db: DatabaseAdapter): PortalRenderer {
  return {
    async renderPage(input) {
      // Pass 1: expand each-blocks (which need DB lookups).
      let out = await expandEachBlocks(input, db);
      // Pass 2: simple substitutions (title, portal.*, page.*, data.*, asset:).
      out = expandSimpleSubstitutions(out, input);
      return out;
    },
  };
}

// ── Pass 1: {{#each kind}}...{{/each}} blocks ──────────────────────────────

const EACH_BLOCK_RE = /\{\{#each\s+([a-z0-9_-]+)\}\}([\s\S]*?)\{\{\/each\}\}/g;

async function expandEachBlocks(input: RenderPageInput, db: DatabaseAdapter): Promise<string> {
  const portalId = await resolvePortalId(input.portal.namespace, input.portal.name, db);
  if (!portalId) return input.page.html;

  // Collect every kind referenced.
  const kinds = new Set<string>();
  for (const m of input.page.html.matchAll(EACH_BLOCK_RE)) kinds.add(m[1]);
  if (kinds.size === 0) return input.page.html;

  // Fetch all structured items for those kinds in one round-trip.
  const items = await db.all<{ kind: string; key: string; value: Record<string, unknown> }>(
    `SELECT kind, key, value FROM portal_structured_data
     WHERE portal_id = ? AND kind = ANY(?::text[])
     ORDER BY kind, key`,
    portalId,
    [...kinds],
  );

  const byKind = new Map<string, Array<{ key: string; value: Record<string, unknown> }>>();
  for (const k of kinds) byKind.set(k, []);
  for (const r of items) byKind.get(r.kind)?.push({ key: r.key, value: r.value });

  return input.page.html.replace(EACH_BLOCK_RE, (_match, kind: string, body: string) => {
    const rows = byKind.get(kind) ?? [];
    if (rows.length === 0) return '';
    return rows
      .map((row) => substituteEachItem(body, row.value, row.key))
      .join('');
  });
}

function substituteEachItem(template: string, value: Record<string, unknown>, key: string): string {
  // Inside an each-block, {{field}} means value.field, {{key}} is the row's key.
  // {{!raw field}} emits unescaped.
  return template
    .replace(/\{\{!raw\s+([\w.]+)\}\}/g, (_m, expr: string) => String(resolveDotPath(value, expr) ?? ''))
    .replace(/\{\{key\}\}/g, escapeHtml(key))
    .replace(/\{\{([\w.]+)\}\}/g, (m, expr: string) => {
      // Don't touch top-level page/portal/data/title/updatedAt placeholders here —
      // pass-through to the second-pass substituter below.
      if (
        expr === 'title' || expr === 'updatedAt' ||
        expr.startsWith('portal.') || expr.startsWith('page.') || expr.startsWith('data.')
      ) {
        return m;
      }
      const v = resolveDotPath(value, expr);
      return v === undefined ? '' : escapeHtml(String(v));
    });
}

// ── Pass 2: simple substitutions ───────────────────────────────────────────

/**
 * Exported wrapper around the simple-substitution pass for use by the
 * walkthrough preview, which has no DB-resident portal yet so can't run the
 * full renderer. Skips {{#each}} blocks and asset lookups.
 */
export function renderSimpleSubstitutionsOnly(input: RenderPageInput): string {
  return expandSimpleSubstitutions(input.page.html, input);
}

function expandSimpleSubstitutions(html: string, input: RenderPageInput): string {
  const portalAddr = input.portal.address;
  const facts: Record<string, string> = {
    title: input.page.title ?? input.portal.displayTitle ?? input.portal.name,
    updatedAt: input.page.updatedAt,
    'portal.displayTitle': input.portal.displayTitle ?? input.portal.name,
    'portal.category': input.portal.category,
    'portal.address': input.portal.address,
    'portal.namespace': input.portal.namespace,
    'portal.name': input.portal.name,
    'page.path': input.page.path,
    'page.title': input.page.title ?? '',
    'page.sortOrder': String(input.page.sortOrder),
  };

  // {{asset:<path>}} → /api/portals/<address>/assets/<path>
  let out = html.replace(/\{\{asset:([a-zA-Z0-9_./-]+)\}\}/g, (_m, p: string) => {
    return `/api/portals/${encodeURIComponent(portalAddr)}/assets/${p}`;
  });

  // {{!raw <expr>}}
  out = out.replace(/\{\{!raw\s+([\w.]+)\}\}/g, (_m, expr: string) => {
    return resolveExpr(expr, facts, input.page.structuredData) ?? '';
  });

  // {{<expr>}} — escaped substitution.
  out = out.replace(/\{\{([\w.]+)\}\}/g, (_m, expr: string) => {
    const v = resolveExpr(expr, facts, input.page.structuredData);
    return v === undefined ? '' : escapeHtml(v);
  });

  return out;
}

function resolveExpr(
  expr: string,
  facts: Record<string, string>,
  structuredData: Record<string, unknown> | null,
): string | undefined {
  if (expr in facts) return facts[expr];
  if (expr.startsWith('data.')) {
    const path = expr.slice('data.'.length);
    const v = structuredData ? resolveDotPath(structuredData, path) : undefined;
    return v === undefined ? undefined : String(v);
  }
  return undefined;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function resolveDotPath(obj: unknown, path: string): unknown {
  if (obj === null || typeof obj !== 'object') return undefined;
  let cur: unknown = obj;
  for (const seg of path.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function resolvePortalId(namespace: string, name: string, db: DatabaseAdapter): Promise<string | null> {
  const r = await db.get<{ id: string }>(
    `SELECT id FROM portals WHERE namespace = ? AND name = ?`,
    namespace,
    name,
  );
  return r?.id ?? null;
}
