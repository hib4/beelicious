import { afterEach, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import {
  createIdentityVerifier,
  parseDashboard,
} from '../../src/modules/dashboard/config.js';
import { registerDashboardRoutes } from '../../src/modules/dashboard/routes.js';
import type { DashboardService } from '../../src/modules/dashboard/service.js';
afterEach(() => vi.unstubAllGlobals());
it('requires only active dashboard credentials and never prints values', () => {
  expect(parseDashboard({})).toBeUndefined();
  expect(() =>
    parseDashboard({
      DASHBOARD_ENABLED: 'true',
      SUPABASE_PUBLISHABLE_KEY: 'sensitive',
    }),
  ).toThrow('SUPABASE_URL');
  expect(() => parseDashboard({ DASHBOARD_ENABLED: 'bad' })).toThrow(
    'DASHBOARD_ENABLED',
  );
  expect(
    parseDashboard({
      DASHBOARD_ENABLED: 'true',
      SUPABASE_URL: 'https://auth.example.test',
      SUPABASE_PUBLISHABLE_KEY: 'publishable-test',
    }),
  ).toEqual({ url: 'https://auth.example.test', key: 'publishable-test' });
});
it('uses authenticated Auth user verification and rejects malformed, expired and failed results', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({ id: '11111111-1111-4111-8111-111111111111' }),
    )
    .mockResolvedValueOnce(Response.json({ id: 'invalid' }))
    .mockResolvedValueOnce(new Response('', { status: 401 }))
    .mockRejectedValueOnce(new Error('private'));
  vi.stubGlobal('fetch', fetch);
  const verify = createIdentityVerifier({
    url: 'https://auth.example.test',
    key: 'public-key',
  });
  expect(await verify('valid')).toBe('11111111-1111-4111-8111-111111111111');
  expect(fetch.mock.calls[0]?.[1].headers.authorization).toBe('Bearer valid');
  expect(await verify('malformed')).toBeNull();
  expect(await verify('expired')).toBeNull();
  expect(await verify('failed')).toBeNull();
});
it('rejects unauthenticated protected requests before accessing data', async () => {
  const app = Fastify();
  const memberships = vi.fn();
  registerDashboardRoutes(
    app,
    { memberships } as unknown as DashboardService,
    async () => null,
  );
  const response = await app.inject('/memberships');
  expect(response.statusCode).toBe(401);
  expect(memberships).not.toHaveBeenCalled();
  expect(response.headers['cache-control']).toBe('no-store');
  await app.close();
});
it('rejects invalid tenant context after verified authentication', async () => {
  const app = Fastify();
  const overview = vi.fn();
  registerDashboardRoutes(
    app,
    { overview } as unknown as DashboardService,
    async () => '11111111-1111-4111-8111-111111111111',
  );
  const response = await app.inject({
    url: '/overview',
    headers: { authorization: 'Bearer test', 'x-tenant-id': 'invalid' },
  });
  expect(response.statusCode).toBe(400);
  expect(overview).not.toHaveBeenCalled();
  await app.close();
});
