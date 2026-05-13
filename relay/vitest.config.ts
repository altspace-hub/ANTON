import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 10000,
    hookTimeout: 30000,
    // The registry integration tests (Step 8 + 9) all run against the
    // same single Postgres DB. Parallel test FILES race the schema
    // (DROP/TRUNCATE in beforeAll/beforeEach steps on top of each
    // other). Disable file-level parallelism here so the registry
    // tests run sequentially. Vitest still parallelises test cases
    // within a file via its describe.concurrent default for the
    // existing protocol-correctness tests.
    fileParallelism: false,
  },
});
