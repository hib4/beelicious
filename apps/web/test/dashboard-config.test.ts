import { expect, it } from 'vitest';
import { dashboardConfig } from '@/lib/dashboard/config';
const valid = {
  DASHBOARD_ENABLED: 'true',
  SUPABASE_URL: 'https://auth.example.test',
  SUPABASE_PUBLISHABLE_KEY: 'test-public-key',
  DASHBOARD_SITE_URL: 'http://127.0.0.1:3001',
  DASHBOARD_API_URL: 'http://127.0.0.1:3000',
};
it('requires explicit enabled configuration without exposing backend environment', () => {
  expect(dashboardConfig({})).toBeNull();
  expect(dashboardConfig({ ...valid, DASHBOARD_ENABLED: 'false' })).toBeNull();
  expect(dashboardConfig(valid)).toMatchObject({
    apiUrl: valid.DASHBOARD_API_URL,
    siteUrl: valid.DASHBOARD_SITE_URL,
  });
});
it('rejects insecure remote origins, URL credentials, missing keys and URL paths', () => {
  for (const patch of [
    { SUPABASE_URL: 'http://auth.example.test' },
    { DASHBOARD_API_URL: 'http://remote.example.test' },
    { DASHBOARD_SITE_URL: 'https://user:secret@example.test' },
    { SUPABASE_PUBLISHABLE_KEY: '' },
    { DASHBOARD_API_URL: 'https://api.example.test/path' },
  ])
    expect(dashboardConfig({ ...valid, ...patch })).toBeNull();
});
