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
 */

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
 */
const ANTON_OWNED_FALLBACK_BASES = ['./uploads', './outputs'];

export interface FolderPathCheck {
  ok: boolean;
  /** The resolved absolute path — '' when the input was not usable at all. */
  resolved: string;
  /** Operator-facing reason. Safe to return to the client; contains no host secrets. */
  error?: string;
  /** The bases the candidate was compared against (useful in error UIs and tests). */
  allowedBases: string[];
}

/** ALLOWED_FOLDER_PATHS, split, trimmed and RESOLVED (see property 1 above). */
export function getAllowedFolderBases(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = (env.ALLOWED_FOLDER_PATHS ?? '').trim();
  const entries = (raw ? raw.split(',') : ANTON_OWNED_FALLBACK_BASES)
    .map((p) => p.trim())
    .filter(Boolean);
  return entries.map((p) => path.resolve(p));
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
    return { ok: false, resolved: '', error: 'Folder path required', allowedBases };
  }
  const raw = candidate.trim();
  if (!path.isAbsolute(raw)) {
    return { ok: false, resolved: '', error: 'Absolute path required', allowedBases };
  }

  const resolved = path.resolve(raw);

  if (allowedBases.length === 0) {
    return {
      ok: false,
      resolved,
      error: 'Folder access not permitted by ALLOWED_FOLDER_PATHS',
      allowedBases,
    };
  }

  const inside = allowedBases.some(
    (base) => resolved === base || resolved.startsWith(base + path.sep),
  );
  if (!inside) {
    return { ok: false, resolved, error: 'Path outside allowed directories', allowedBases };
  }

  return { ok: true, resolved, allowedBases };
}

/** Convenience predicate for call sites that only need yes/no. */
export function isFolderPathAllowed(
  candidate: unknown,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return checkFolderPath(candidate, env).ok;
}
