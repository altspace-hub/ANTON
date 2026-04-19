/**
 * portal-database-service.ts — CRUD over portal-content tables.
 *
 * Per Spec v0.2 §C.3: every portal has its own pages, assets, and structured
 * data. This service is the only authorised way to read/write that content;
 * routes and renderers MUST go through here so portal_id scoping + path
 * normalisation + size limits are uniformly enforced.
 *
 * Tables (migration 146):
 *   - portal_pages
 *   - portal_assets
 *   - portal_structured_data
 *
 * All FK to portals(id) ON DELETE CASCADE. Deleting a portal wipes its content.
 */

import { createHash } from 'crypto';

import type { DatabaseAdapter } from '../../db/database.js';

// ── Limits ─────────────────────────────────────────────────────────────────

export const MAX_PAGE_HTML_BYTES = 5 * 1024 * 1024; // 5 MB per page (generous)
export const MAX_ASSET_BYTES = 10 * 1024 * 1024; // 10 MB per asset
export const MAX_PATH_LENGTH = 200;
export const ALLOWED_ASSET_MIME_PREFIXES = [
  'image/',
  'audio/',
  'video/',
  'text/',
  'application/pdf',
  'application/json',
  'font/',
];

// ── Types ──────────────────────────────────────────────────────────────────

export interface PortalPage {
  id: string;
  portalId: string;
  path: string;
  title: string | null;
  html: string;
  template: string | null;
  structuredData: Record<string, unknown> | null;
  sortOrder: number;
  visible: boolean;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface PortalAsset {
  id: string;
  portalId: string;
  path: string;
  mimeType: string;
  byteSize: number;
  contentHash: string;
  /** Only included when explicitly fetched via getAsset(); list operations omit content. */
  content?: Buffer;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface PortalStructuredItem {
  id: string;
  portalId: string;
  kind: string;
  key: string;
  value: Record<string, unknown>;
  searchableText: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Path normalisation + validation ────────────────────────────────────────

/**
 * Normalise a page path: lowercase, leading slash, no trailing slash (except root).
 * Throws on traversal attempts or unsafe characters.
 */
export function normalizePagePath(input: string): string {
  if (typeof input !== 'string' || input.length === 0) {
    throw new Error('Page path must be a non-empty string');
  }
  if (input.length > MAX_PATH_LENGTH) {
    throw new Error(`Page path exceeds ${MAX_PATH_LENGTH} chars`);
  }
  let p = input.toLowerCase();
  if (!p.startsWith('/')) p = '/' + p;
  // Collapse repeated slashes.
  p = p.replace(/\/+/g, '/');
  // Strip trailing slash (except for root).
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  // Reject traversal + unsafe chars.
  if (p.includes('..')) throw new Error(`Page path traversal: ${input}`);
  if (!/^\/[a-z0-9_\-./]*$/.test(p)) throw new Error(`Page path contains unsafe characters: ${input}`);
  return p;
}

/**
 * Normalise an asset path: no leading slash, no traversal, lowercase.
 * Examples: 'logo.png', 'images/hero.jpg'.
 */
export function normalizeAssetPath(input: string): string {
  if (typeof input !== 'string' || input.length === 0) {
    throw new Error('Asset path must be a non-empty string');
  }
  if (input.length > MAX_PATH_LENGTH) {
    throw new Error(`Asset path exceeds ${MAX_PATH_LENGTH} chars`);
  }
  let p = input.toLowerCase();
  if (p.startsWith('/')) p = p.slice(1);
  p = p.replace(/\/+/g, '/');
  if (p.includes('..')) throw new Error(`Asset path traversal: ${input}`);
  if (!/^[a-z0-9_\-./]+$/.test(p)) throw new Error(`Asset path contains unsafe characters: ${input}`);
  if (p.endsWith('/')) throw new Error(`Asset path cannot end with /: ${input}`);
  return p;
}

function assertMimeAllowed(mimeType: string): void {
  if (!ALLOWED_ASSET_MIME_PREFIXES.some((prefix) => mimeType.startsWith(prefix))) {
    throw new Error(`MIME type not allowed: ${mimeType}`);
  }
}

// ── Service ────────────────────────────────────────────────────────────────

export interface PortalDatabaseService {
  // Pages
  listPages(portalId: string, opts?: { visibleOnly?: boolean }): Promise<PortalPage[]>;
  getPage(portalId: string, path: string): Promise<PortalPage | null>;
  upsertPage(portalId: string, page: UpsertPageInput): Promise<PortalPage>;
  deletePage(portalId: string, path: string): Promise<boolean>;

  // Assets
  listAssets(portalId: string): Promise<PortalAsset[]>;
  getAsset(portalId: string, path: string): Promise<PortalAsset | null>;
  upsertAsset(portalId: string, asset: UpsertAssetInput): Promise<PortalAsset>;
  deleteAsset(portalId: string, path: string): Promise<boolean>;

  // Structured data
  listStructured(portalId: string, kind?: string): Promise<PortalStructuredItem[]>;
  getStructured(portalId: string, kind: string, key: string): Promise<PortalStructuredItem | null>;
  upsertStructured(portalId: string, item: UpsertStructuredInput): Promise<PortalStructuredItem>;
  deleteStructured(portalId: string, kind: string, key: string): Promise<boolean>;
}

export interface UpsertPageInput {
  path: string;
  title?: string;
  html: string;
  template?: string;
  structuredData?: Record<string, unknown>;
  sortOrder?: number;
  visible?: boolean;
  metadata?: Record<string, unknown>;
}

export interface UpsertAssetInput {
  path: string;
  mimeType: string;
  content: Buffer;
  metadata?: Record<string, unknown>;
}

export interface UpsertStructuredInput {
  kind: string;
  key: string;
  value: Record<string, unknown>;
  searchableText?: string;
}

export function createPortalDatabaseService(db: DatabaseAdapter): PortalDatabaseService {
  return {
    // ── Pages ─────────────────────────────────────────────────────────────
    async listPages(portalId, opts) {
      const visibleClause = opts?.visibleOnly ? ` AND visible = TRUE` : '';
      const rows = await db.all<PageRow>(
        `SELECT * FROM portal_pages WHERE portal_id = ?${visibleClause}
         ORDER BY sort_order ASC, path ASC`,
        portalId,
      );
      return rows.map(rowToPage);
    },

    async getPage(portalId, path) {
      const p = normalizePagePath(path);
      const row = await db.get<PageRow>(
        `SELECT * FROM portal_pages WHERE portal_id = ? AND path = ?`,
        portalId,
        p,
      );
      return row ? rowToPage(row) : null;
    },

    async upsertPage(portalId, input) {
      const p = normalizePagePath(input.path);
      if (Buffer.byteLength(input.html, 'utf-8') > MAX_PAGE_HTML_BYTES) {
        throw new Error(`Page HTML exceeds ${MAX_PAGE_HTML_BYTES} bytes`);
      }
      const row = await db.get<PageRow>(
        `INSERT INTO portal_pages
           (portal_id, path, title, html, template, structured_data, sort_order, visible, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (portal_id, path) DO UPDATE SET
           title = EXCLUDED.title,
           html = EXCLUDED.html,
           template = EXCLUDED.template,
           structured_data = EXCLUDED.structured_data,
           sort_order = EXCLUDED.sort_order,
           visible = EXCLUDED.visible,
           metadata = EXCLUDED.metadata
         RETURNING *`,
        portalId,
        p,
        input.title ?? null,
        input.html,
        input.template ?? null,
        input.structuredData ? JSON.stringify(input.structuredData) : null,
        input.sortOrder ?? 0,
        input.visible ?? true,
        input.metadata ? JSON.stringify(input.metadata) : null,
      );
      if (!row) throw new Error('upsertPage: insert returned no row');
      return rowToPage(row);
    },

    async deletePage(portalId, path) {
      const p = normalizePagePath(path);
      const r = await db.run(
        `DELETE FROM portal_pages WHERE portal_id = ? AND path = ?`,
        portalId,
        p,
      );
      return r.changes > 0;
    },

    // ── Assets ────────────────────────────────────────────────────────────
    async listAssets(portalId) {
      // Omit content column from listing to avoid memory blowup.
      const rows = await db.all<Omit<AssetRow, 'content'>>(
        `SELECT id, portal_id, path, mime_type, byte_size, content_hash, metadata, created_at, updated_at
         FROM portal_assets WHERE portal_id = ?
         ORDER BY path ASC`,
        portalId,
      );
      return rows.map((r) => rowToAsset({ ...r, content: null }));
    },

    async getAsset(portalId, path) {
      const p = normalizeAssetPath(path);
      const row = await db.get<AssetRow>(
        `SELECT * FROM portal_assets WHERE portal_id = ? AND path = ?`,
        portalId,
        p,
      );
      return row ? rowToAsset(row) : null;
    },

    async upsertAsset(portalId, input) {
      const p = normalizeAssetPath(input.path);
      assertMimeAllowed(input.mimeType);
      if (input.content.length > MAX_ASSET_BYTES) {
        throw new Error(`Asset content exceeds ${MAX_ASSET_BYTES} bytes`);
      }
      const hash = createHash('sha256').update(input.content).digest('hex');
      const row = await db.get<AssetRow>(
        `INSERT INTO portal_assets
           (portal_id, path, mime_type, byte_size, content_hash, content, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (portal_id, path) DO UPDATE SET
           mime_type = EXCLUDED.mime_type,
           byte_size = EXCLUDED.byte_size,
           content_hash = EXCLUDED.content_hash,
           content = EXCLUDED.content,
           metadata = EXCLUDED.metadata
         RETURNING *`,
        portalId,
        p,
        input.mimeType,
        input.content.length,
        hash,
        input.content,
        input.metadata ? JSON.stringify(input.metadata) : null,
      );
      if (!row) throw new Error('upsertAsset: insert returned no row');
      return rowToAsset(row);
    },

    async deleteAsset(portalId, path) {
      const p = normalizeAssetPath(path);
      const r = await db.run(
        `DELETE FROM portal_assets WHERE portal_id = ? AND path = ?`,
        portalId,
        p,
      );
      return r.changes > 0;
    },

    // ── Structured data ───────────────────────────────────────────────────
    async listStructured(portalId, kind) {
      const rows = kind
        ? await db.all<StructuredRow>(
            `SELECT * FROM portal_structured_data WHERE portal_id = ? AND kind = ?
             ORDER BY key ASC`,
            portalId,
            kind,
          )
        : await db.all<StructuredRow>(
            `SELECT * FROM portal_structured_data WHERE portal_id = ?
             ORDER BY kind ASC, key ASC`,
            portalId,
          );
      return rows.map(rowToStructured);
    },

    async getStructured(portalId, kind, key) {
      const row = await db.get<StructuredRow>(
        `SELECT * FROM portal_structured_data WHERE portal_id = ? AND kind = ? AND key = ?`,
        portalId,
        kind,
        key,
      );
      return row ? rowToStructured(row) : null;
    },

    async upsertStructured(portalId, input) {
      const row = await db.get<StructuredRow>(
        `INSERT INTO portal_structured_data
           (portal_id, kind, key, value, searchable_text)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (portal_id, kind, key) DO UPDATE SET
           value = EXCLUDED.value,
           searchable_text = EXCLUDED.searchable_text
         RETURNING *`,
        portalId,
        input.kind,
        input.key,
        JSON.stringify(input.value),
        input.searchableText ?? null,
      );
      if (!row) throw new Error('upsertStructured: insert returned no row');
      return rowToStructured(row);
    },

    async deleteStructured(portalId, kind, key) {
      const r = await db.run(
        `DELETE FROM portal_structured_data WHERE portal_id = ? AND kind = ? AND key = ?`,
        portalId,
        kind,
        key,
      );
      return r.changes > 0;
    },
  };
}

// ── Row mappers ────────────────────────────────────────────────────────────

interface PageRow {
  id: string; portal_id: string; path: string; title: string | null;
  html: string; template: string | null; structured_data: Record<string, unknown> | null;
  sort_order: number; visible: boolean; metadata: Record<string, unknown> | null;
  created_at: string; updated_at: string;
}

interface AssetRow {
  id: string; portal_id: string; path: string; mime_type: string;
  byte_size: number | string; content_hash: string;
  content: Buffer | null; metadata: Record<string, unknown> | null;
  created_at: string; updated_at: string;
}

interface StructuredRow {
  id: string; portal_id: string; kind: string; key: string;
  value: Record<string, unknown>; searchable_text: string | null;
  created_at: string; updated_at: string;
}

function rowToPage(r: PageRow): PortalPage {
  return {
    id: r.id, portalId: r.portal_id, path: r.path, title: r.title,
    html: r.html, template: r.template, structuredData: r.structured_data,
    sortOrder: Number(r.sort_order), visible: r.visible, metadata: r.metadata,
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
  };
}

function rowToAsset(r: AssetRow): PortalAsset {
  return {
    id: r.id, portalId: r.portal_id, path: r.path, mimeType: r.mime_type,
    byteSize: Number(r.byte_size), contentHash: r.content_hash,
    content: r.content ?? undefined,
    metadata: r.metadata,
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
  };
}

function rowToStructured(r: StructuredRow): PortalStructuredItem {
  return {
    id: r.id, portalId: r.portal_id, kind: r.kind, key: r.key,
    value: r.value, searchableText: r.searchable_text,
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
  };
}
