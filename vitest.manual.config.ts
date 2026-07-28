/**
 * vitest.manual.config.ts — harnesses that are run deliberately, never in CI.
 *
 * `tests/manual/*.manual.ts` spend money (real provider calls) and depend on a working
 * API key, so they are outside the default `tests/**\/*.test.ts` glob. That exclusion is
 * the point — but it also means they cannot be run by path alone, and vitest 4 removed
 * the `--include` flag that would have let you. Without this config they are effectively
 * unrunnable, which is how a harness quietly rots.
 *
 *   pnpm run test:manual
 *   EVAL_MODEL=mistral-medium-latest pnpm run test:manual
 *
 * The timeout is generous because these make several sequential model calls.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 300_000,
    hookTimeout: 60_000,
    isolate: true,
    include: ['tests/manual/**/*.manual.ts'],
    exclude: ['node_modules', 'dist', 'build'],
  },
});
