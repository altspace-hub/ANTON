/**
 * Local ambient declaration for `@truestamp/canonify`.
 *
 * The package ships typings at dist/index.d.ts but its package.json
 * `exports` map doesn't expose them, so TypeScript's strict module
 * resolution can't see them. Rather than disable module resolution or
 * relax strictness globally, declare the one function we use here.
 * Mirrors the upstream signature verbatim.
 */
declare module '@truestamp/canonify' {
  export function canonify(object: unknown): string | undefined;
}
