import './scripts/load-env.mjs';
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    // Suites share a catalog: fixture churn must not invalidate another suite's displayed selections. Explicit Promise.all race tests remain concurrent.
    fileParallelism: false,
    include: ['apps/api/test/**/*.integration.test.ts'],
    testTimeout: 15000,
  },
});
