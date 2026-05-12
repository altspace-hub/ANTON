import { defineConfig } from 'vitest/config';
import path from 'path';

/**
 * Vitest config for the Comm App (src/comm/).
 *
 * Separate from vitest.config.ts so the existing server/UI test suite
 * (node environment, server/* + src/lib/*) stays untouched. Comm tests
 * run in jsdom with fake-indexeddb so the IDB-backed services can be
 * exercised end-to-end without a browser.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/comm/__tests__/setup.ts'],
    include: ['src/comm/__tests__/**/*.test.ts'],
    exclude: ['node_modules', 'dist', 'build'],
    testTimeout: 10000,
    isolate: true,
  },
  resolve: {
    alias: { '@comm': path.resolve(__dirname, 'src/comm') },
  },
});
