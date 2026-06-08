import { defineConfig } from 'vitest/config';
import path from 'path';

/**
 * Vitest config for the Companion app (src/app/).
 * jsdom environment (the personalization service touches document on import).
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/app/**/__tests__/**/*.test.ts'],
    exclude: ['node_modules', 'dist', 'build'],
    testTimeout: 10000,
    isolate: true,
  },
  resolve: {
    alias: {
      '@app': path.resolve(__dirname, 'src/app'),
    },
  },
});
