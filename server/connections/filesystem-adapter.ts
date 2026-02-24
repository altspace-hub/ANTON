/**
 * filesystem-adapter.ts
 * Safe file system access through registered filesystem connections.
 * Enforces base_path boundary, allowed extensions, and size limits.
 */

import path from 'path';
import fs from 'fs-extra';
import type { Connection } from '../services/connection-manager.js';
import type { ConnectionManager } from '../services/connection-manager.js';
import { extractTextFromFile } from '../services/text-extractor.js';

export interface FileEntry {
  name: string;
  relativePath: string;
  absolutePath: string;
  extension: string;
  sizeBytes: number;
  lastModified: string;
  isDirectory: boolean;
}

export interface ReadResult {
  relativePath: string;
  name: string;
  extension: string;
  sizeBytes: number;
  text: string | null;
  rawBase64?: string; // for binary files that don't have a text extractor
}

const DEFAULT_MAX_FILE_SIZE_MB = 50;

function resolveSafePath(basePath: string, relativePath: string): string {
  const normalized = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, '');
  const resolved = path.resolve(basePath, normalized);
  if (!resolved.startsWith(path.resolve(basePath))) {
    throw new Error(`Path traversal attempt blocked: "${relativePath}"`);
  }
  return resolved;
}

export async function listFiles(
  connection: Connection,
  manager: ConnectionManager,
  subPath: string = '',
  pattern?: string,
  executedBy: string = 'system'
): Promise<FileEntry[]> {
  const cfg = connection.config as Record<string, unknown>;
  const basePath = cfg.base_path as string;
  if (!basePath) throw new Error('Filesystem connection missing base_path');

  const allowedExtensions = (cfg.allowed_extensions as string[] | undefined) ?? [];
  const targetPath = subPath ? resolveSafePath(basePath, subPath) : path.resolve(basePath);

  if (!(await fs.pathExists(targetPath))) {
    throw new Error(`Directory not found: ${targetPath}`);
  }

  const stat = await fs.stat(targetPath);
  if (!stat.isDirectory()) {
    throw new Error(`Path is not a directory: ${targetPath}`);
  }

  const entries = await fs.readdir(targetPath, { withFileTypes: true });
  const results: FileEntry[] = [];

  for (const entry of entries) {
    const fullPath = path.join(targetPath, entry.name);
    const relPath = path.relative(basePath, fullPath);
    const ext = path.extname(entry.name).toLowerCase();

    if (!entry.isDirectory() && allowedExtensions.length > 0 && !allowedExtensions.includes(ext)) {
      continue;
    }

    if (pattern && !entry.name.toLowerCase().includes(pattern.toLowerCase())) {
      continue;
    }

    const fileStat = await fs.stat(fullPath);
    results.push({
      name: entry.name,
      relativePath: relPath,
      absolutePath: fullPath,
      extension: ext,
      sizeBytes: fileStat.size,
      lastModified: fileStat.mtime.toISOString(),
      isDirectory: entry.isDirectory(),
    });
  }

  manager.logAction(
    connection.id,
    null,
    'list_files',
    { subPath, pattern, count: results.length },
    `Listed ${results.length} entries`,
    executedBy
  );

  return results;
}

export async function readFile(
  connection: Connection,
  manager: ConnectionManager,
  relativePath: string,
  executedBy: string = 'system'
): Promise<ReadResult> {
  const cfg = connection.config as Record<string, unknown>;
  const basePath = cfg.base_path as string;
  if (!basePath) throw new Error('Filesystem connection missing base_path');

  const allowedExtensions = (cfg.allowed_extensions as string[] | undefined) ?? [];
  const maxFileSizeMb = (cfg.max_file_size_mb as number | undefined) ?? DEFAULT_MAX_FILE_SIZE_MB;

  const absolutePath = resolveSafePath(basePath, relativePath);

  if (!(await fs.pathExists(absolutePath))) {
    throw new Error(`File not found: ${relativePath}`);
  }

  const stat = await fs.stat(absolutePath);
  if (stat.isDirectory()) {
    throw new Error(`Path is a directory, not a file: ${relativePath}`);
  }

  const ext = path.extname(absolutePath).toLowerCase();

  if (allowedExtensions.length > 0 && !allowedExtensions.includes(ext)) {
    throw new Error(`File type "${ext}" is not in the allowed_extensions list for this connection`);
  }

  const sizeBytes = stat.size;
  const maxBytes = maxFileSizeMb * 1024 * 1024;
  if (sizeBytes > maxBytes) {
    throw new Error(
      `File too large: ${(sizeBytes / 1024 / 1024).toFixed(1)} MB exceeds limit of ${maxFileSizeMb} MB`
    );
  }

  const text = await extractTextFromFile(absolutePath);

  manager.logAction(
    connection.id,
    null,
    'read_file',
    { relativePath, sizeBytes, ext },
    text ? `Read ${sizeBytes} bytes` : 'File read (binary — no text extracted)',
    executedBy
  );

  return {
    relativePath,
    name: path.basename(absolutePath),
    extension: ext,
    sizeBytes,
    text,
  };
}

export async function writeFile(
  connection: Connection,
  manager: ConnectionManager,
  relativePath: string,
  content: string,
  executedBy: string = 'system'
): Promise<void> {
  if (!connection.permissions.includes('write')) {
    throw new Error('This filesystem connection does not have "write" permission');
  }

  const cfg = connection.config as Record<string, unknown>;
  const basePath = cfg.base_path as string;
  if (!basePath) throw new Error('Filesystem connection missing base_path');

  const absolutePath = resolveSafePath(basePath, relativePath);
  const ext = path.extname(absolutePath).toLowerCase();
  const allowedExtensions = (cfg.allowed_extensions as string[] | undefined) ?? [];

  if (allowedExtensions.length > 0 && !allowedExtensions.includes(ext)) {
    throw new Error(`File type "${ext}" is not in the allowed_extensions list for this connection`);
  }

  await fs.ensureDir(path.dirname(absolutePath));
  await fs.writeFile(absolutePath, content, 'utf-8');

  manager.logAction(
    connection.id,
    null,
    'write_file',
    { relativePath, byteCount: Buffer.byteLength(content, 'utf-8') },
    `Wrote ${Buffer.byteLength(content, 'utf-8')} bytes`,
    executedBy
  );
}
