import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globals: false,
  },
  // Map @futurechain/sdk imports to the workspace source. The app's
  // production build does this through pnpm workspace resolution +
  // Metro/Hermes; tests don't go through Metro so we point at the
  // source files directly.
  resolve: {
    alias: {
      '@futurechain/sdk': '../../packages/futurechain-sdk/src/index.ts',
    },
  },
});
