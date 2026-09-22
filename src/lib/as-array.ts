/**
 * A fetched list, or an empty one. An error answer (`{ error }`, a 429, an
 * empty object from a server bug) is not a list, and pages that stored it
 * as-is crashed on `.map` / `.filter` / `.reduce` — the 2026-09-22 Work QA
 * found seven pages that went blank this way.
 */
export function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}
