import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  testMatch: 'dashboard.spec.ts',
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:3103',
    browserName: 'chromium',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command:
        'node --import ../../scripts/load-env.mjs --import tsx e2e/support/api.ts',
      url: 'http://127.0.0.1:3104/health',
      env: { BEELICIOUS_DASHBOARD_E2E: 'true' },
      reuseExistingServer: false,
      timeout: 60000,
    },
    {
      command:
        'node --import ./e2e/support/auth-preload.mjs ../../node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3103',
      url: 'http://127.0.0.1:3103/login',
      env: {
        BEELICIOUS_DASHBOARD_E2E: 'true',
        DASHBOARD_ENABLED: 'true',
        DASHBOARD_SITE_URL: 'http://127.0.0.1:3103',
        SUPABASE_URL: 'https://auth.example.test',
        SUPABASE_PUBLISHABLE_KEY: 'test-publishable-key',
        DASHBOARD_API_URL: 'http://127.0.0.1:3104',
      },
      reuseExistingServer: false,
      timeout: 60000,
    },
  ],
});
