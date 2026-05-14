import { defineConfig } from 'vitest/config';
import path from 'path';

/**
 * Vitest config for the Business app (src/business/).
 *
 * Mirrors vitest.config.comm.ts — jsdom + IndexedDB shim ready for when
 * the storage adapter lands in task #3. Phase 2 covers pure-logic only
 * (qr/cart/backup-format), but jsdom works fine for that too.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/business/services/__tests__/**/*.test.ts'],
    exclude: ['node_modules', 'dist', 'build'],
    testTimeout: 10000,
    isolate: true,
  },
  resolve: {
    alias: { '@business': path.resolve(__dirname, 'src/business') },
  },
});
