/**
 * folder-guard.ts — the ONE implementation of the ALLOWED_FOLDER_PATHS
 * whitelist (CLAUDE.md pattern 6).
 *
 * Every code path that turns a request-supplied string into a filesystem read
 * must go through checkFolderPath(). Before this file existed the whitelist was
 * consulted by exactly one route (folders.ts) while the knowledge-READ path —
 * knowledge-resolver's localFolder mode, the knowledge library, and the RAG
 * indexer — never consulted it at all. A POST body could name any directory on
 * the host and have its contents recursed, extracted and pasted into a prompt
 * (or written into document_chunks, from where /api/rag/search hands them back).
 *
 * Two properties are load-bearing. Do not "simplify" them away:
 *
 *  1. RESOLVE FIRST, THEN COMPARE. A startsWith() against an unresolved string
 *     is not a containment check: "/allowed/../../etc/ssh" starts with
 *     "/allowed" and is not inside it. path.resolve() collapses ".." before the
 *     comparison happens, so the comparison is about the real target.
 *
 *  2. Compare with `resolved === base || resolved.startsWith(base + path.sep)`.
 *     A bare startsWith(base) lets "/data-backup" through for base "/data".
 *
 * Fail-closed policy: a path that cannot be proven inside a configured base is
 * refused. Refusing to read is the right default for a string that arrived in a
 * request body and ends at the filesystem.
 *
 * ── Team mode: ANTON's own storage is never a readable folder ───────────────
 *
 * UPLOAD_DIR, OUTPUT_DIR and the other stores listed in getProtectedStorageDirs()
 * hold EVERY user's uploads and exports side by side, with ownership kept in the
 * database (file_uploads.uploaded_by, project membership …). The default
 * whitelist allowed ./uploads and ./outputs, so on a shared server any user
 * could browse them, read them into a prompt as a local folder, or index and
 * search them — straight past the per-file ownership checks.
 *
 * With DEPLOYMENT_MODE=team every allowed base that overlaps one of those stores
 * (is it, sits inside it, or contains it) is DROPPED, and so is any candidate
 * that resolves into one — for everyone, admins included. Admins are not exempt
 * because this guard has no caller identity at several call sites (the RAG
 * indexer, the knowledge library, engagements), and the folder index it feeds is
 * shared by folder path: an admin-indexed upload folder would be searchable by
 * every user who names it. Admins still reach the files through the per-file,
 * ownership-checked routes. Solo mode is untouched: one human, their own files.
 */

import fs from 'fs';
import path from 'path';

/**
 * The bases used when ALLOWED_FOLDER_PATHS is unset or empty.
 *
 * These are ANTON's OWN working directories (the same fallback folders.ts has
 * always applied), not the user's disk — the equivalent of the Studio-root
 * widening in coding-workspace.ts. Keeping them means an operator who never set
 * the variable still gets folder browsing over ANTON's own uploads/outputs,
 * while nothing under their home directory, Documents, or system paths is
 * readable. Widening this list is a security decision, not a convenience fix.
 * In team mode both entries are dropped (see the header): the fallback then
 * allows nothing, and the operator names a shared document folder instead.
 */
const ANTON_OWNED_FALLBACK_BASES = ['./uploads', './outputs'];

/** Shown when team mode refuses a path inside (or around) ANTON's own storage. */
export const TEAM_STORAGE_REFUSAL =
  "Path is in ANTON's own upload/output storage, which holds every user's files — not readable as a folder in team mode";

export interface FolderPathCheck {
  ok: boolean;
  /** The resolved absolute path — '' when the input was not usable at all. */
  resolved: string;
  /** Operator-facing reason. Safe to return to the client; contains no host secrets. */
  error?: string;
  /**
   * Why it was refused. 'team_storage' means no ALLOWED_FOLDER_PATHS entry can
   * make it readable, so callers must not suggest widening the whitelist.
   */
  reason?: 'invalid' | 'not_allowed' | 'team_storage';
  /** The bases the candidate was compared against (useful in error UIs and tests). */
  allowedBases: string[];
}

/** Same test as role-guards.isTeamMode(), read from `env` so tests can pass one. */
function isTeamEnv(env: NodeJS.ProcessEnv): boolean {
  return env.DEPLOYMENT_MODE === 'team';
}

/**
 * Where ANTON keeps one person's files next to everyone else's, resolved.
 *
 * Both the configured directory AND the cwd default are listed for uploads and
 * outputs, because some writers ignore the variable: documents.ts
 * (uploads/rag-documents), brand-latex-assets.ts (uploads/templates) and
 * script-adapter.ts (outputs/scripts) always write under the working directory.
 * The data/ entries mirror pathfinder.ts, video/storage-adapter.ts,
 * missions/* and bundle-sharing-service.ts; a new per-user store belongs here.
 *
 * The Code Studio root (CODING_STUDIO_ROOT, default ./coding-studio — the same
 * default as coding-workspace.getCodingStudioRoot, not imported to keep this
 * module dependency-free) holds every project's workspace side by side, so a
 * base around it would read every user's code. Code Studio itself excludes it
 * from this list and polices it per project instead (validateWorkspacePath).
 */
export function getProtectedStorageDirs(env: NodeJS.ProcessEnv = process.env): string[] {
  const dirs = [
    env.UPLOAD_DIR || './uploads',
    './uploads',
    env.OUTPUT_DIR || './outputs',
    './outputs',
    env.WORKSPACES_DIR || './workspaces',
    path.join('data', 'pathfinder-uploads'),
    path.join('data', 'video-uploads'),
    path.join('data', 'missions'),
    env.ANTON_RECEIVED_BUNDLES_DIR || path.join('data', 'received-bundles'),
    (env.CODING_STUDIO_ROOT ?? '').trim() || './coding-studio',
  ];
  const resolved = dirs.map((d) => path.resolve(d));
  // Also the real location, so a store that is itself a symlink/junction is
  // recognised when a whitelist entry names its target.
  return [...new Set([...resolved, ...resolved.map(realOrSelf)])];
}

/** The real path when it exists, else the input — never throws. */
function realOrSelf(p: string): string {
  try {
    return fs.realpathSync.native(p);
  } catch {
    return p;
  }
}

/**
 * Case-fold where the filesystem usually does (Windows, macOS): refusing is the
 * safe direction, and "C:\ANTON\Uploads" is the same folder as "c:\anton\uploads".
 */
function foldCase(p: string): string {
  return process.platform === 'win32' || process.platform === 'darwin' ? p.toLowerCase() : p;
}

/** `child` is `parent` or inside it. Handles a root parent ("C:\", "/"), which
 *  already ends in a separator. Only used for refusals, so folding case is safe. */
function isSameOrInside(child: string, parent: string): boolean {
  const c = foldCase(child);
  const p = foldCase(parent);
  if (c === p) return true;
  return c.startsWith(p.endsWith(path.sep) ? p : p + path.sep);
}

/** Either path contains the other: reading one recursively reaches the other. */
function overlapsProtected(p: string, protectedDirs: string[]): boolean {
  return protectedDirs.some((d) => isSameOrInside(p, d) || isSameOrInside(d, p));
}

/**
 * `child` is `parent` or inside it, case-folded where the filesystem folds case.
 * Exported for callers that police a store of their own (Code Studio's root) and
 * must compare paths exactly the way this guard does. Refusal checks only.
 */
export function isPathSameOrInside(child: string, parent: string): boolean {
  return isSameOrInside(path.resolve(child), path.resolve(parent));
}

/** The real path when it exists (links/junctions followed), else the resolved input. */
export function realPathOrSelf(p: string): string {
  return realOrSelf(path.resolve(p));
}

/**
 * Team mode only: `candidate` overlaps ANTON's per-user storage — is it, sits in
 * it, or contains it — lexically OR through a link. Always false in solo mode.
 *
 * `exclude` names stores the caller polices itself: Code Studio passes its own
 * root, which it checks per project instead of refusing outright. Both the given
 * and the real location of an excluded store are skipped.
 *
 * Exported so a second allowlist (coding-workspace.ts) applies the same team rule
 * as this guard instead of re-deriving it — that divergence is how the Studio's
 * allowlist kept opening ./uploads after this guard stopped doing so.
 */
export function overlapsTeamStorage(
  candidate: string,
  env: NodeJS.ProcessEnv = process.env,
  exclude: string[] = [],
): boolean {
  if (!isTeamEnv(env)) return false;
  const skip = new Set(
    exclude.flatMap((d) => [path.resolve(d), realOrSelf(path.resolve(d))]).map(foldCase),
  );
  const protectedDirs = getProtectedStorageDirs(env).filter((d) => !skip.has(foldCase(d)));
  const resolved = path.resolve(candidate);
  return overlapsProtected(resolved, protectedDirs) || overlapsProtected(realOrSelf(resolved), protectedDirs);
}

let warnedDroppedBases = false;

/**
 * ALLOWED_FOLDER_PATHS, split, trimmed and RESOLVED (see property 1 above).
 * In team mode, minus every base that overlaps ANTON's own storage.
 */
export function getAllowedFolderBases(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = (env.ALLOWED_FOLDER_PATHS ?? '').trim();
  const entries = (raw ? raw.split(',') : ANTON_OWNED_FALLBACK_BASES)
    .map((p) => p.trim())
    .filter(Boolean);
  const bases = entries.map((p) => path.resolve(p));
  if (!isTeamEnv(env)) return bases;

  const kept = bases.filter((b) => !overlapsTeamStorage(b, env));
  const dropped = bases.length - kept.length;
  if (dropped > 0 && !warnedDroppedBases) {
    warnedDroppedBases = true;
    // A count, not the paths: they can carry a person's name (C:\Users\…).
    console.warn(`[folder-guard] team mode: ignoring ${dropped} ALLOWED_FOLDER_PATHS ${dropped === 1 ? 'entry that overlaps' : 'entries that overlap'} ANTON's per-user storage`);
  }
  return kept;
}

/**
 * Decide whether `candidate` may be read from. Absolute paths only: a relative
 * path would be resolved against the server's cwd, which is never what a caller
 * means and would make the verdict depend on where ANTON happened to be started.
 */
export function checkFolderPath(
  candidate: unknown,
  env: NodeJS.ProcessEnv = process.env,
): FolderPathCheck {
  const allowedBases = getAllowedFolderBases(env);

  if (typeof candidate !== 'string' || !candidate.trim()) {
    return { ok: false, resolved: '', error: 'Folder path required', reason: 'invalid', allowedBases };
  }
  const raw = candidate.trim();
  if (!path.isAbsolute(raw)) {
    return { ok: false, resolved: '', error: 'Absolute path required', reason: 'invalid', allowedBases };
  }

  const resolved = path.resolve(raw);
  const team = isTeamEnv(env);
  const protectedDirs = team ? getProtectedStorageDirs(env) : [];

  // Checked before the whitelist so the refusal names the real reason: with the
  // default whitelist a team install has no bases left at all.
  if (team && overlapsProtected(resolved, protectedDirs)) {
    return { ok: false, resolved, error: TEAM_STORAGE_REFUSAL, reason: 'team_storage', allowedBases };
  }

  if (allowedBases.length === 0) {
    return {
      ok: false,
      resolved,
      error: 'Folder access not permitted by ALLOWED_FOLDER_PATHS',
      reason: 'not_allowed',
      allowedBases,
    };
  }

  const inside = allowedBases.some(
    (base) => resolved === base || resolved.startsWith(base + path.sep),
  );
  if (!inside) {
    return { ok: false, resolved, error: 'Path outside allowed directories', reason: 'not_allowed', allowedBases };
  }

  // A link inside a clean base can still point into the store. The scanners do
  // not follow links below the top level (Dirent.isDirectory() and isFile() are
  // both false for one, and each scanner requires one of them — rag/indexer.ts
  // included), so the candidate itself is the link that matters.
  if (team && overlapsProtected(realOrSelf(resolved), protectedDirs)) {
    return { ok: false, resolved, error: TEAM_STORAGE_REFUSAL, reason: 'team_storage', allowedBases };
  }

  return { ok: true, resolved, allowedBases };
}

/**
 * The allowed base `abs` (an already resolved path) lies in, or null.
 *
 * checkFolderPath() has decided the question; this hands the caller the base
 * so it can repeat the containment as `abs.startsWith(root)` right beside the
 * file operation. CodeQL's js/path-injection only recognises a guard in the
 * same function as the sink, and a check that is visibly next to the read or
 * write is also the one a reviewer can trust.
 */
export function allowedRootOf(abs: string, allowedBases: readonly string[]): string | null {
  for (const base of allowedBases) {
    if (abs === base || abs.startsWith(base + path.sep)) return base;
  }
  return null;
}

/** Convenience predicate for call sites that only need yes/no. */
export function isFolderPathAllowed(
  candidate: unknown,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return checkFolderPath(candidate, env).ok;
}
