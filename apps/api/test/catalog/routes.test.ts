import { randomUUID } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { buildApp } from '../../src/app.js';
import { parseEnvironment } from '../../src/config.js';
import { DomainError } from '../../src/modules/catalog/validation.js';
import type { CatalogReader } from '../../src/modules/catalog/routes.js';

const tenantId = randomUUID();
const categoryId = randomUUID();
const itemId = randomUUID();
const dates = { createdAt: new Date(), updatedAt: new Date() };
const tenant = {
  id: tenantId,
  name: 'Test',
  slug: 'test',
  description: null,
  logoUrl: null,
  isActive: true,
  ...dates,
};
const category = {
  id: categoryId,
  tenantId,
  name: 'Food',
  description: null,
  sortOrder: 0,
  isActive: true,
  ...dates,
};
const item = {
  id: itemId,
  tenantId,
  categoryId,
  name: 'Rice',
  description: null,
  imageUrl: null,
  price: 20000,
  sortOrder: 0,
  isAvailable: true,
  ...dates,
};
const apps: ReturnType<typeof buildApp>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});
function setup() {
  const services = {
    tenants: {
      listActive: vi.fn().mockResolvedValue([tenant]),
      getById: vi.fn().mockResolvedValue(tenant),
    },
    categories: { list: vi.fn().mockResolvedValue([category]) },
    menu: {
      available: vi.fn().mockResolvedValue([item]),
      get: vi.fn().mockResolvedValue(item),
    },
  } satisfies CatalogReader;
  const db = { checkConnection: vi.fn(), disconnect: vi.fn() };
  const config = parseEnvironment({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://unused:unused@127.0.0.1/test',
  });
  const app = buildApp(config, db, { catalogServices: services });
  apps.push(app);
  return { app, services };
}
it('returns explicit public DTOs from all five catalog routes', async () => {
  const { app, services } = setup();
  for (const path of [
    '/api/v1/tenants',
    `/api/v1/tenants/${tenantId}`,
    `/api/v1/tenants/${tenantId}/categories`,
    `/api/v1/tenants/${tenantId}/menu?categoryId=${categoryId}`,
    `/api/v1/tenants/${tenantId}/menu/${itemId}`,
  ]) {
    const response = await app.inject(path);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveProperty('data');
    expect(response.body).not.toMatch(
      /createdAt|updatedAt|isActive|customerId|identities/,
    );
  }
  expect(services.categories.list).toHaveBeenCalledWith(tenantId, true);
  expect(services.menu.available).toHaveBeenCalledWith(tenantId, categoryId);
  expect(services.menu.get).toHaveBeenCalledWith(tenantId, itemId, true);
});
it('validates parameters and category filters', async () => {
  const { app } = setup();
  for (const path of [
    '/api/v1/tenants/not-a-uuid',
    `/api/v1/tenants/${tenantId}/menu/invalid`,
    `/api/v1/tenants/${tenantId}/menu?categoryId=invalid`,
    `/api/v1/tenants/${tenantId}/menu?unexpected=value`,
  ]) {
    const response = await app.inject(path);
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: { code: 'invalid_input', message: 'Invalid input' },
    });
  }
});
it('hides inactive and missing tenants and missing menu items', async () => {
  const { app, services } = setup();
  services.tenants.getById.mockResolvedValueOnce({
    ...tenant,
    isActive: false,
  });
  expect(
    (await app.inject(`/api/v1/tenants/${tenantId}/menu`)).statusCode,
  ).toBe(404);
  expect(services.menu.available).not.toHaveBeenCalled();
  services.tenants.getById.mockRejectedValueOnce(new DomainError('not_found'));
  expect((await app.inject(`/api/v1/tenants/${tenantId}`)).statusCode).toBe(
    404,
  );
  services.menu.get.mockRejectedValueOnce(new DomainError('not_found'));
  expect(
    (await app.inject(`/api/v1/tenants/${tenantId}/menu/${itemId}`)).statusCode,
  ).toBe(404);
});
it('sanitizes failures, recovers, and exposes no public write or customer endpoints', async () => {
  const { app, services } = setup();
  services.tenants.listActive.mockRejectedValueOnce(
    new Error('private connection password'),
  );
  const response = await app.inject('/api/v1/tenants');
  expect(response.statusCode).toBe(503);
  expect(response.body).not.toMatch(/private|password/);
  expect((await app.inject('/api/v1/tenants')).statusCode).toBe(200);
  expect(
    (await app.inject({ method: 'POST', url: '/api/v1/tenants', payload: {} }))
      .statusCode,
  ).toBe(404);
  expect((await app.inject('/api/v1/customers')).statusCode).toBe(404);
});
