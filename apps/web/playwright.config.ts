import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  testIgnore: 'dashboard.spec.ts',
  fullyParallel: true,
  use: {
    baseURL: 'http://127.0.0.1:3101',
    browserName: 'chromium',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm exec next -- start --hostname 127.0.0.1 --port 3101',
    url: 'http://127.0.0.1:3101',
    reuseExistingServer: false,
    timeout: 60000,
  },
});
