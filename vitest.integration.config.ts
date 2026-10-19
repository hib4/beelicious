import './scripts/load-env.mjs';
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['apps/api/test/**/*.integration.test.ts'],
    testTimeout: 15000,
  },
});
