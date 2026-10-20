import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { createDatabase, seedDevelopmentCatalog } from '@beelicious/database';
import { createCatalogServices } from '../../src/modules/catalog/services.js';
import {
  CustomerService,
  type MessagingIdentity,
} from '../../src/modules/customers/service.js';
import { buildApp } from '../../src/app.js';
import { parseEnvironment } from '../../src/config.js';

const dev = new URL(process.env.DATABASE_URL || '');
const url = new URL(process.env.WHATSAPP_TEST_DATABASE_URL || dev.toString());
if (!process.env.WHATSAPP_TEST_DATABASE_URL) url.pathname += '_test';
if (
  !url.pathname.endsWith('_test') ||
  (url.host === dev.host && url.pathname === dev.pathname)
)
  throw new Error('Separate _test database required');
const db = createDatabase(url.toString());
const client = db.prisma;
const { tenants, categories, menu } = createCatalogServices(client);
const customers = new CustomerService(client);
const tenantIds = new Set<string>();
const customerIds = new Set<string>();
const accountIds = new Set<string>();
beforeAll(async () => {
  await client.tenant.count();
  await client.customerMessagingIdentity.count();
});
afterEach(async () => {
  // Only fixtures owned by this suite, never global truncation or development data.
  await client.menuItem.deleteMany({
    where: { tenantId: { in: [...tenantIds] } },
  });
  await client.menuCategory.deleteMany({
    where: { tenantId: { in: [...tenantIds] } },
  });
  await client.tenantOperatingHour.deleteMany({
    where: { tenantId: { in: [...tenantIds] } },
  });
  await client.tenant.deleteMany({ where: { id: { in: [...tenantIds] } } });
  const identityCustomers = await client.customerMessagingIdentity.findMany({
    where: { accountId: { in: [...accountIds] } },
    select: { customerId: true },
  });
  identityCustomers.forEach((identity) => customerIds.add(identity.customerId));
  await client.customerMessagingIdentity.deleteMany({
    where: { customerId: { in: [...customerIds] } },
  });
  await client.customer.deleteMany({ where: { id: { in: [...customerIds] } } });
  tenantIds.clear();
  customerIds.clear();
  accountIds.clear();
});
afterAll(() => db.disconnect());
async function tenant(isActive = true) {
  const value = await tenants.create({
    name: 'Fixture tenant',
    slug: 'fixture-' + randomUUID(),
    isActive,
  });
  tenantIds.add(value.id);
  return value;
}
async function fixture() {
  const t = await tenant();
  const c = await categories.create(t.id, { name: 'Makanan' });
  const m = await menu.create(t.id, {
    categoryId: c.id,
    name: 'Rice',
    price: 20000,
  });
  return { t, c, m };
}
function identity(
  provider: 'mock' | 'cloud-api' = 'mock',
  accountId: string = randomUUID(),
  providerUserId: string = randomUUID(),
): MessagingIdentity {
  accountIds.add(accountId);
  return provider === 'mock'
    ? { provider, accountId, providerUserId, identifierType: 'mock-user' }
    : { provider, accountId, providerUserId, identifierType: 'cloud-user' };
}
it('creates, finds, updates and deactivates tenants with unique slugs', async () => {
  const t = await tenant();
  expect(await tenants.getById(t.id)).toMatchObject({ id: t.id });
  expect(await tenants.getBySlug(t.slug)).toMatchObject({ id: t.id });
  await expect(
    tenants.create({ name: 'Duplicate', slug: t.slug }),
  ).rejects.toMatchObject({ code: 'conflict' });
  const inactive = await tenant(false);
  expect(
    (await tenants.listActive()).some((row) => row.id === inactive.id),
  ).toBe(false);
  await tenants.update(t.id, { name: 'Updated', description: 'Description' });
  await tenants.setActive(t.id, false);
  expect((await tenants.getById(t.id)).name).toBe('Updated');
  expect((await tenants.listActive()).some((row) => row.id === t.id)).toBe(
    false,
  );
  await expect(tenants.getById(randomUUID())).rejects.toMatchObject({
    code: 'not_found',
  });
});
it('enforces category ownership, deterministic ordering and activation', async () => {
  const a = await tenant();
  const b = await tenant();
  const c1 = await categories.create(a.id, { name: 'Same', sortOrder: 3 });
  const c2 = await categories.create(a.id, { name: 'Same', sortOrder: 1 });
  await categories.create(b.id, { name: 'Same' });
  expect((await categories.list(a.id)).map((c) => c.id)).toEqual([
    c2.id,
    c1.id,
  ]);
  await categories.setOrder(a.id, c1.id, 0);
  await categories.update(a.id, c1.id, { description: 'Updated' });
  expect((await categories.list(a.id))[0]?.id).toBe(c1.id);
  await expect(
    categories.update(b.id, c1.id, { name: 'Stolen' }),
  ).rejects.toMatchObject({ code: 'not_found' });
  await categories.setActive(a.id, c1.id, false);
  expect((await categories.list(a.id, true)).map((c) => c.id)).toEqual([c2.id]);
  await expect(
    categories.create(randomUUID(), { name: 'Missing' }),
  ).rejects.toMatchObject({ code: 'not_found' });
});
it('creates menu items, filters categories, updates price and availability', async () => {
  const { t, c, m } = await fixture();
  const c2 = await categories.create(t.id, { name: 'Minuman' });
  const drink = await menu.create(t.id, {
    categoryId: c2.id,
    name: 'Tea',
    price: 5000,
    sortOrder: -1,
  });
  expect((await menu.list(t.id)).map((i) => i.id)).toEqual([drink.id, m.id]);
  expect(
    (await menu.list(t.id, { categoryId: c.id })).map((i) => i.id),
  ).toEqual([m.id]);
  await menu.setPrice(t.id, m.id, 0);
  expect((await menu.get(t.id, m.id)).price).toBe(0);
  await menu.setPrice(t.id, m.id, 25000);
  await menu.update(t.id, m.id, {
    categoryId: c2.id,
    imageUrl: 'https://example.com/rice.png',
  });
  expect((await menu.get(t.id, m.id)).price).toBe(25000);
  await menu.setAvailable(t.id, m.id, false);
  expect((await menu.available(t.id)).map((i) => i.id)).toEqual([drink.id]);
  await expect(menu.get(t.id, m.id, true)).rejects.toMatchObject({
    code: 'not_found',
  });
  await categories.setActive(t.id, c2.id, false);
  expect(await menu.available(t.id)).toEqual([]);
});
it('rejects cross-tenant category references in services and direct database writes', async () => {
  const { t, c, m } = await fixture();
  const other = await tenant();
  await expect(
    menu.create(other.id, { categoryId: c.id, name: 'Invalid', price: 1 }),
  ).rejects.toMatchObject({ code: 'not_found' });
  await expect(menu.get(other.id, m.id)).rejects.toMatchObject({
    code: 'not_found',
  });
  await expect(
    menu.update(other.id, m.id, { name: 'Invalid' }),
  ).rejects.toMatchObject({ code: 'not_found' });
  await expect(menu.list(other.id, { categoryId: c.id })).rejects.toMatchObject(
    { code: 'not_found' },
  );
  const otherCategory = await categories.create(other.id, { name: 'Other' });
  await expect(
    menu.update(t.id, m.id, { categoryId: otherCategory.id }),
  ).rejects.toMatchObject({ code: 'not_found' });
  await expect(
    client.menuItem.create({
      data: { tenantId: other.id, categoryId: c.id, name: 'Invalid', price: 1 },
    }),
  ).rejects.toMatchObject({ code: 'P2003' });
  await expect(
    client.menuItem.update({
      where: { id: m.id },
      data: { categoryId: otherCategory.id },
    }),
  ).rejects.toMatchObject({ code: 'P2003' });
  await expect(
    client.menuCategory.update({
      where: { id: c.id },
      data: { tenantId: other.id },
    }),
  ).rejects.toMatchObject({ code: 'P2003' });
});
it('enforces nonnegative prices and restrictive deletion below the service layer', async () => {
  const { t, c, m } = await fixture();
  await expect(menu.setPrice(t.id, m.id, -1)).rejects.toMatchObject({
    code: 'invalid_input',
  });
  await expect(
    client.menuItem.create({
      data: { tenantId: t.id, categoryId: c.id, name: 'Invalid', price: -1 },
    }),
  ).rejects.toThrow();
  await expect(
    client.menuItem.update({ where: { id: m.id }, data: { price: -1 } }),
  ).rejects.toThrow();
  await expect(
    client.tenant.delete({ where: { id: t.id } }),
  ).rejects.toMatchObject({ code: 'P2003' });
  await expect(
    client.menuCategory.delete({ where: { id: c.id } }),
  ).rejects.toMatchObject({ code: 'P2003' });
});
it('registers a customer once under concurrent requests without orphan records', async () => {
  const input = identity();
  const displayName = `Test-${randomUUID()}`;
  const results = await Promise.all(
    Array.from({ length: 12 }, () => customers.register(input, displayName)),
  );
  customerIds.add(results[0]!.id);
  expect(new Set(results.map((c) => c.id)).size).toBe(1);
  expect(await client.customer.count({ where: { displayName } })).toBe(1);
  expect(await customers.findByIdentity(input)).toMatchObject({
    id: results[0]!.id,
  });
  expect(await customers.getById(results[0]!.id)).toMatchObject({
    displayName,
  });
  expect(
    await client.customerMessagingIdentity.count({
      where: { accountId: input.accountId },
    }),
  ).toBe(1);
  await expect(
    client.customerMessagingIdentity.create({
      data: { ...input, customerId: results[0]!.id },
    }),
  ).rejects.toMatchObject({ code: 'P2002' });
  await expect(
    client.customer.delete({ where: { id: results[0]!.id } }),
  ).rejects.toMatchObject({ code: 'P2003' });
  await expect(
    client.customerMessagingIdentity.create({
      data: {
        customerId: results[0]!.id,
        accountId: input.accountId,
        providerUserId: randomUUID(),
        provider: 'baileys',
        identifierType: 'cloud-user',
      },
    }),
  ).rejects.toThrow();
  expect(await customers.findByIdentity(identity())).toBeNull();
  await expect(customers.getById(randomUUID())).rejects.toMatchObject({
    code: 'not_found',
  });
});
it('isolates Baileys, Cloud API, connected accounts, and JID/LID identities', async () => {
  const accountId = randomUUID();
  accountIds.add(accountId);
  const user = '15555550101@s.whatsapp.net';
  const inputs = [
    {
      provider: 'baileys',
      accountId,
      providerUserId: user,
      identifierType: 'jid',
    },
    {
      provider: 'baileys',
      accountId,
      providerUserId: '777888@lid',
      identifierType: 'lid',
    },
    identity('cloud-api', accountId, user),
    {
      provider: 'baileys',
      accountId: randomUUID(),
      providerUserId: user,
      identifierType: 'jid',
    },
  ];
  inputs.forEach((i) => accountIds.add(i.accountId));
  const results = await Promise.all(inputs.map((i) => customers.register(i)));
  results.forEach((c) => customerIds.add(c.id));
  expect(new Set(results.map((c) => c.id)).size).toBe(4);
  const stored = await client.customerMessagingIdentity.findMany({
    where: { customerId: { in: results.map((c) => c.id) } },
  });
  expect(stored.every((i) => i.phoneNumber === null)).toBe(true);
  expect(stored.map((i) => i.providerUserId)).toContain('777888@lid');
});
it('associates only explicitly verified identities and never transfers ownership', async () => {
  const first = await customers.register(identity());
  const second = await customers.register(identity());
  customerIds.add(first.id);
  customerIds.add(second.id);
  const additional = identity();
  await Promise.all(
    Array.from({ length: 4 }, () =>
      customers.associateIdentity({
        verified: true,
        customerId: first.id,
        identity: additional,
      }),
    ),
  );
  expect(await customers.findByIdentity(additional)).toMatchObject({
    id: first.id,
  });
  await expect(
    customers.associateIdentity({
      verified: true,
      customerId: second.id,
      identity: additional,
    }),
  ).rejects.toMatchObject({ code: 'conflict' });
  expect(await customers.findByIdentity(additional)).toMatchObject({
    id: first.id,
  });
});
it('seeds exactly the supplied prototype catalog repeatedly and concurrently, preserving edits', async () => {
  const reservedId = '3b000000-0000-4000-8000-000000000001';
  // Refuse to take ownership of data from an earlier/manual run.
  expect(
    await client.tenant.findFirst({
      where: { OR: [{ id: reservedId }, { slug: 'warung-babe' }] },
    }),
  ).toBeNull();
  tenantIds.add(reservedId);
  await Promise.all([
    seedDevelopmentCatalog(client),
    seedDevelopmentCatalog(client),
  ]);
  await seedDevelopmentCatalog(client);
  const t = await tenants.getBySlug('warung-babe');
  expect(t).toMatchObject({
    name: 'Warung Babe',
    description: 'Indonesian food tenant for the Beelicious pilot.',
  });
  expect((await categories.list(t.id)).map((c) => c.name)).toEqual([
    'Makanan',
    'Minuman',
  ]);
  const items = await menu.list(t.id);
  expect(items.map((i) => [i.name, i.price])).toEqual([
    ['Nasi Goreng Spesial', 20000],
    ['Es Teh Manis', 5000],
  ]);
  await menu.setPrice(t.id, items[0]!.id, 21000);
  await seedDevelopmentCatalog(client);
  expect((await menu.get(t.id, items[0]!.id)).price).toBe(21000);
});
it('rolls back the entire seed when a reserved category belongs to another tenant', async () => {
  const reservedTenant = '3b000000-0000-4000-8000-000000000001';
  expect(
    await client.tenant.findUnique({ where: { id: reservedTenant } }),
  ).toBeNull();
  const owner = await tenant();
  await client.menuCategory.create({
    data: {
      id: '3b000000-0000-4000-8000-000000000002',
      tenantId: owner.id,
      name: 'Owned fixture',
    },
  });
  await expect(seedDevelopmentCatalog(client)).rejects.toThrow(
    'Development seed identifier conflict',
  );
  expect(
    await client.tenant.findUnique({ where: { id: reservedTenant } }),
  ).toBeNull();
  expect(await categories.list(owner.id)).toHaveLength(1);
});
it('serves the real isolated catalog and hides inactive, unavailable and cross-tenant resources', async () => {
  const { t, c, m } = await fixture();
  const other = await tenant();
  // App gets its own pool and closes it; fixture pool remains owned by this suite.
  const config = parseEnvironment({
    NODE_ENV: 'test',
    DATABASE_URL: url.toString(),
    WHATSAPP_ENABLED: 'false',
  });
  const app = buildApp(config);
  try {
    const prefix = `/api/v1/tenants/${t.id}`;
    expect((await app.inject(`${prefix}/menu`)).json()).toMatchObject({
      data: [{ id: m.id, price: 20000, isAvailable: true }],
    });
    expect((await app.inject(`${prefix}/categories`)).json()).toMatchObject({
      data: [{ id: c.id }],
    });
    expect(
      (await app.inject(`${prefix}/menu?categoryId=${c.id}`)).statusCode,
    ).toBe(200);
    expect(
      (await app.inject(`/api/v1/tenants/${other.id}/menu/${m.id}`)).statusCode,
    ).toBe(404);
    expect(
      (await app.inject(`/api/v1/tenants/${other.id}/menu?categoryId=${c.id}`))
        .statusCode,
    ).toBe(404);
    await menu.setAvailable(t.id, m.id, false);
    expect((await app.inject(`${prefix}/menu`)).json()).toEqual({ data: [] });
    expect((await app.inject(`${prefix}/menu/${m.id}`)).statusCode).toBe(404);
    await menu.setAvailable(t.id, m.id, true);
    await categories.setActive(t.id, c.id, false);
    expect((await app.inject(`${prefix}/categories`)).json()).toEqual({
      data: [],
    });
    expect((await app.inject(`${prefix}/menu`)).json()).toEqual({ data: [] });
    await tenants.setActive(t.id, false);
    for (const suffix of ['', '/categories', '/menu', `/menu/${m.id}`])
      expect((await app.inject(prefix + suffix)).statusCode).toBe(404);
    const listed = (await app.inject('/api/v1/tenants')).json<{
      data: { id: string }[];
    }>();
    expect(listed.data.some((row) => row.id === t.id)).toBe(false);
    expect(
      (await app.inject(`/api/v1/tenants/${randomUUID()}`)).statusCode,
    ).toBe(404);
  } finally {
    await app.close();
  }
});
