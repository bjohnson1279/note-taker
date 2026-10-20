import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Run test files sequentially so they don't compete for the shared
    // database.  Individual tests within a file still run in order by default.
    fileParallelism: false,
    testTimeout: 15_000,
  },
});

