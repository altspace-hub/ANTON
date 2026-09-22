/**
 * An id that is joined into a filesystem path must be one path segment: no
 * separators, no dot-segments, no NUL, nothing empty.
 *
 * getFramework() joined the raw `:id` of GET /gap-assessments/frameworks/:id
 * onto data/frameworks, so `..%2F..%2Fpackage` read the repo's package.json
 * (2026-09-22, found triaging CodeQL on PR #71). Every catalogue id —
 * frameworks, modules, areas — is lower-case words joined by - _ or .
 */
const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function isSafePathSegment(id: unknown): id is string {
  return typeof id === 'string' && id.length <= 200 && SAFE_SEGMENT.test(id) && !id.includes('..');
}
