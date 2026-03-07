import { defineConfig } from 'vitest/config';

export default defineConfig({
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
