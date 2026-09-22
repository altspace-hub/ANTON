import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  // The web client's '@/…' imports, so a test can load a real store or lib module.
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 30000,
    hookTimeout: 30000,
    teardownTimeout: 10000,
    isolate: true,
    threads: true,
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules', 'dist', 'build'],
    // Decides what DATABASE_URL means for the run before any test file loads:
    // a dedicated ANTON_TEST_DATABASE_URL, CI's service database, or nothing
    // (the live database is never a default). See tests/setup/db-guard.ts.
    globalSetup: ['./tests/setup/db-guard.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: [
        'server/services/**/*.ts',
        'server/routes/**/*.ts',
        'server/lib/**/*.ts',
        'src/lib/**/*.ts',
        'src/hooks/**/*.ts',
        'src/stores/**/*.ts',
      ],
      exclude: [
        'node_modules/',
        'tests/',
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/*.config.ts',
        'server/db/**',
        'server/mcp/**',
      ],
      // TEST-08: fail CI if critical module coverage drops below 60%
      thresholds: {
        lines:      60,
        functions:  60,
        branches:   60,
        statements: 60,
      },
    },
  },
});
