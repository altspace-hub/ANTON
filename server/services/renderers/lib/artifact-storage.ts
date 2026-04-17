// ── Artifact Storage — shared helper for renderers ────────────────────────
//
// Writes a rendered artifact to disk under OUTPUT_DIR/renderer-artifacts/{sessionId}/
// and returns an OUTPUT_DIR-relative path for persistence in the DB.
//
// Every renderer that produces a file uses this helper so the storage
// convention is consistent — naming, directories, cleanup.

import path from 'path';
import fs from 'fs/promises';

const OUTPUT_DIR = process.env.OUTPUT_DIR ?? path.join(process.cwd(), 'outputs');
const ARTIFACTS_ROOT = path.join(OUTPUT_DIR, 'renderer-artifacts');

export interface SaveArtifactInput {
  sessionId: string;
  filename: string;              // e.g. 'amlr-gap-analysis-flowchart-1712345678.svg'
  content: Buffer | string;
  subdir?: string;               // optional nested subdir (e.g. 'previews')
}

export interface SaveArtifactResult {
  /** Absolute path on disk (for stat() etc.) */
  abs_path: string;
  /** Path relative to OUTPUT_DIR/renderer-artifacts — what goes in the DB. */
  rel_path: string;
  /** File size in bytes. */
  size_bytes: number;
}

export async function saveArtifact(input: SaveArtifactInput): Promise<SaveArtifactResult> {
  if (!/^[a-zA-Z0-9_.-]+$/.test(input.filename)) {
    throw new Error(`Unsafe artifact filename: ${input.filename}`);
  }
  // Session ids are already machine-generated (uuid / hex) — but verify.
  if (!/^[a-zA-Z0-9_-]+$/.test(input.sessionId)) {
    throw new Error(`Unsafe session id for filesystem: ${input.sessionId}`);
  }

  const sessionDir = path.join(ARTIFACTS_ROOT, input.sessionId, input.subdir ?? '');
  await fs.mkdir(sessionDir, { recursive: true });
  const absPath = path.join(sessionDir, input.filename);
  const rootWithSep = ARTIFACTS_ROOT + path.sep;
  if (absPath !== ARTIFACTS_ROOT && !absPath.startsWith(rootWithSep)) {
    throw new Error('Artifact path escapes the renderer-artifacts root');
  }
  const buf = Buffer.isBuffer(input.content)
    ? input.content
    : Buffer.from(input.content, 'utf-8');
  await fs.writeFile(absPath, buf);
  return {
    abs_path: absPath,
    rel_path: path.relative(ARTIFACTS_ROOT, absPath),
    size_bytes: buf.length,
  };
}

/**
 * Build a filename by filling in the renderer's filename_template.
 *
 * Supported placeholders:
 *   - {module_id}    → session's module_id, slugified
 *   - {renderer_id}
 *   - {timestamp}    → unix ms
 *   - {file_type}
 */
export function buildFilename(template: string, params: { module_id: string; renderer_id: string; file_type: string }): string {
  const safeModule = params.module_id.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
  return template
    .replace(/\{module_id\}/g, safeModule)
    .replace(/\{renderer_id\}/g, params.renderer_id)
    .replace(/\{timestamp\}/g, String(Date.now()))
    .replace(/\{file_type\}/g, params.file_type);
}

export { OUTPUT_DIR, ARTIFACTS_ROOT };
