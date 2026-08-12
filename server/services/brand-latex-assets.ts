// ── Brand templates: upload taxonomy + LaTeX asset loading ────────────────
//
// One place that knows which file extensions `POST /api/templates/upload`
// accepts and which `brand_templates.type` each maps to, plus the loader that
// hands a session's uploaded LaTeX class/style/bibliography files to the
// latex-source renderer.
//
// It lives in services/ rather than routes/ because two callers need it and
// they must not disagree: routes/templates.ts (which decides what may be
// stored) and renderer-registry.ts (which decides what may be read back). A
// second copy of the extension list is exactly how an allowlist drifts.

import path from 'path';
import fs from 'fs/promises';
import type { DatabaseAdapter } from '../db/database.js';
import { isTeamMode } from '../middleware/role-guards.js';
import type { LatexAssetFile } from './renderer-registry.types.js';

/** Where routes/templates.ts stores uploads. */
export const TEMPLATES_DIR = path.join(process.cwd(), 'uploads', 'templates');

export type BrandTemplateType = 'docx' | 'pptx' | 'latex';

/**
 * Accepted upload extensions → the `brand_templates.type` they are stored as.
 *
 * .cls / .sty / .bib all collapse to 'latex' because they are consumed by the
 * same exporter and shipped in the same bundle; the real extension is kept in
 * `original_name`. See migration 256 for the full reasoning.
 */
export const BRAND_TEMPLATE_UPLOAD_TYPES: Readonly<Record<string, BrandTemplateType>> = Object.freeze({
  '.docx': 'docx',
  '.pptx': 'pptx',
  '.cls': 'latex',
  '.sty': 'latex',
  '.bib': 'latex',
});

/** Extensions that end up in the .tex bundle. */
export const LATEX_ASSET_EXTENSIONS: readonly string[] = Object.freeze(
  Object.keys(BRAND_TEMPLATE_UPLOAD_TYPES).filter(
    ext => BRAND_TEMPLATE_UPLOAD_TYPES[ext] === 'latex',
  ),
);

/**
 * The `type` an upload of this filename is stored as, or null if the extension
 * is not accepted at all.
 *
 * Case-insensitive on the extension only. `path.extname` is used so the answer
 * is derived from exactly the same string the caller will use to build the
 * on-disk name — deriving them separately is how an allowlist gets bypassed by
 * a name the two functions disagree about.
 */
export function brandTemplateTypeForFilename(originalName: string): BrandTemplateType | null {
  const ext = path.extname(originalName).toLowerCase();
  return BRAND_TEMPLATE_UPLOAD_TYPES[ext] ?? null;
}

/**
 * Reduce an uploaded filename to something safe to use as a ZIP entry name and
 * as a TeX input name.
 *
 * Returns null when nothing usable survives, so callers fail closed rather than
 * inventing a name.
 *
 * Rules, and why each one is here:
 *  - take the last path segment on EITHER separator. `path.basename` is
 *    platform-dependent: on Linux it does not treat `\` as a separator, so
 *    `..\..\evil.cls` would come through whole. This must not depend on which
 *    OS the instance runs.
 *  - allow only [A-Za-z0-9._-]. That kills `/`, `\`, NUL, newlines and
 *    non-ASCII in one rule; the zip entry can then never traverse.
 *  - strip leading dots and dashes, so `..cls` cannot become a relative path
 *    component and `-foo.cls` cannot look like a command-line flag to whatever
 *    the recipient pipes the bundle through.
 *  - require a still-allowed LaTeX extension AFTER the rewrite, so a name whose
 *    extension was mangled into something else is rejected rather than shipped.
 */
export function safeLatexAssetName(rawName: string): string | null {
  const segment = rawName.split(/[\\/]/).pop() ?? '';
  const cleaned = segment
    .replace(/[^A-Za-z0-9._-]/g, '_')
    .replace(/^[.\-]+/, '')
    .slice(0, 100);
  if (!cleaned) return null;
  const ext = path.extname(cleaned).toLowerCase();
  if (!LATEX_ASSET_EXTENSIONS.includes(ext)) return null;
  // "acmecorp.cls" is fine; ".cls" on its own has no stem to \documentclass.
  if (cleaned.length === ext.length) return null;
  return cleaned;
}

interface BrandTemplateRow {
  id: string;
  name: string;
  file_path: string;
  original_name: string | null;
}

export interface LoadLatexAssetsOptions {
  /** Directory uploads must live inside. Overridable for tests only. */
  templatesDir?: string;
  /** Refuse a single file larger than this (bytes). */
  maxFileBytes?: number;
  /** Refuse to accumulate more than this in total (bytes). */
  maxTotalBytes?: number;
  /** Hard cap on how many files can be bundled. */
  maxFiles?: number;
}

const DEFAULT_MAX_FILE_BYTES = 20 * 1024 * 1024;   // matches the multer limit
const DEFAULT_MAX_TOTAL_BYTES = 25 * 1024 * 1024;
const DEFAULT_MAX_FILES = 25;

/**
 * Load the LaTeX brand assets that belong to `userId`.
 *
 * Ownership follows the same rule as `ownerFilter` in middleware/ownership.ts,
 * expressed against the SESSION's owner rather than the caller's request:
 *
 *   • solo mode — one human, so every latex template on the instance is theirs.
 *     Rows predating ownership attribution have a NULL user_id and would
 *     otherwise vanish from their own machine.
 *   • team mode — only rows attributed to the session's owner. A class file is
 *     a company asset and must not leak into another tenant's export. An
 *     unattributed row is ambiguous, so it is withheld (fail closed), and a
 *     session with no owner gets nothing.
 *
 * Never throws: a brand asset that cannot be read must degrade to "no bundle",
 * not to a failed export.
 */
export async function loadLatexBrandAssets(
  db: DatabaseAdapter,
  userId: string | null,
  opts: LoadLatexAssetsOptions = {},
): Promise<LatexAssetFile[]> {
  const templatesDir = opts.templatesDir ?? TEMPLATES_DIR;
  const maxFileBytes = opts.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
  const maxTotalBytes = opts.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES;
  const maxFiles = opts.maxFiles ?? DEFAULT_MAX_FILES;

  let rows: BrandTemplateRow[];
  try {
    if (isTeamMode()) {
      if (!userId) return [];
      rows = await db.all<BrandTemplateRow>(
        `SELECT id, name, file_path, original_name FROM brand_templates
          WHERE type = 'latex' AND user_id = ?
          ORDER BY created_at ASC, id ASC`,
        userId,
      );
    } else {
      rows = await db.all<BrandTemplateRow>(
        `SELECT id, name, file_path, original_name FROM brand_templates
          WHERE type = 'latex'
          ORDER BY created_at ASC, id ASC`,
      );
    }
  } catch {
    // A database that predates migration 256 has no original_name column. That
    // is a "no house style yet" instance, not an export failure.
    return [];
  }

  const root = path.resolve(templatesDir) + path.sep;
  const byName = new Map<string, LatexAssetFile>();
  let total = 0;

  for (const row of rows) {
    if (byName.size >= maxFiles) break;

    // Defence in depth. The upload route writes `<uuid>.<ext>` into
    // templatesDir, so a path outside it means the row was not written by that
    // route — do not read it.
    const abs = path.resolve(row.file_path);
    if (!abs.startsWith(root)) continue;

    const filename = safeLatexAssetName(row.original_name ?? path.basename(row.file_path));
    if (!filename) continue;

    let content: Buffer;
    try {
      const stat = await fs.stat(abs);
      if (!stat.isFile() || stat.size > maxFileBytes) continue;
      if (total + stat.size > maxTotalBytes) continue;
      content = await fs.readFile(abs);
    } catch {
      continue;  // deleted from disk behind the DB row
    }

    // A re-upload under the same name replaces the older file's CONTENT but
    // keeps its position, so bundle ordering stays stable across re-uploads.
    const previous = byName.get(filename);
    if (previous) total -= previous.content.length;
    total += content.length;
    byName.set(filename, { filename, content });
  }

  return [...byName.values()];
}
