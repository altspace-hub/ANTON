/**
 * _shared.ts — common types + helpers for the quality-adapters directory.
 *
 * Each adapter under server/services/quality-adapters/ exports a default
 * QualityAdapter object. The pipeline service assembles them into the
 * canonical ADAPTERS array.
 */

import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { promises as fs } from 'fs';

export const execFileP = promisify(execFile);

const WORKSPACES_ROOT = process.env.WORKSPACES_DIR || './workspaces';

/**
 * Resolve the on-disk workspace path for a hardware project. Convention:
 *   project.metadata.workspace_path (explicit override)
 *   else ${WORKSPACES_ROOT}/hw/${project_id}
 *
 * Adapters that need a workspace (PlatformIO, Clang-tidy, CycloneDX, sdkconfig
 * parser) call this to find the user's project files. Returns the path even if
 * it doesn't exist — the adapter itself decides whether absence is a skip or
 * a failure.
 */
export function workspacePathFor(project: { id: string; metadata?: Record<string, unknown> | null }): string {
  const explicit = (project.metadata?.workspace_path as string | undefined) ?? null;
  if (explicit) return path.resolve(explicit);
  return path.resolve(WORKSPACES_ROOT, 'hw', project.id);
}

/** Existence check that doesn't throw. */
export async function pathExists(p: string): Promise<boolean> {
  try { await fs.access(p); return true; } catch { return false; }
}

/**
 * Run a tool with `--version` to detect installation. Returns the trimmed
 * version string on success, null on any failure (not on PATH, exec error,
 * crash). Adapters use this in their detect() function.
 */
export async function detectToolVersion(executable: string, versionFlag = '--version'): Promise<string | null> {
  try {
    const { stdout, stderr } = await execFileP(executable, [versionFlag], {
      timeout: 5_000,
      windowsHide: true,
    });
    const text = (stdout + stderr).trim();
    return text.split('\n')[0].slice(0, 200);
  } catch {
    return null;
  }
}

/** Adapter availability shape returned by the preflight endpoint. */
export interface AdapterAvailability {
  gateKey: string;
  installed: boolean;
  version: string | null;
  install_hint: string;
}
