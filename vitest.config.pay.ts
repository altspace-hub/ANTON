import { defineConfig } from 'vitest/config';
import path from 'path';

/**
 * Vitest config for the Pay app (src/pay/).
 *
 * Mirrors vitest.config.business.ts — jsdom environment, pure-logic
 * coverage (payment URI decode lives in services/__tests__/).
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/pay/services/__tests__/**/*.test.ts'],
    exclude: ['node_modules', 'dist', 'build'],
    testTimeout: 10000,
    isolate: true,
  },
  resolve: {
    alias: {
      '@pay': path.resolve(__dirname, 'src/pay'),
      '@futurechain/sdk': path.resolve(__dirname, 'anton-business/packages/futurechain-sdk/src'),
    },
  },
});
