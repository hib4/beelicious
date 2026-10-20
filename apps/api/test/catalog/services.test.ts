import { afterAll, expect, it, vi } from 'vitest';
import { createPrismaClient, Prisma } from '@beelicious/database';
import { createCatalogServices } from '../../src/modules/catalog/services.js';
import { domainOperation } from '../../src/modules/catalog/validation.js';
import {
  CustomerService,
  messagingIdentitySchema,
} from '../../src/modules/customers/service.js';

const db = createPrismaClient('postgresql://unused:unused@127.0.0.1:1/unused');
const services = createCatalogServices(db);
const customers = new CustomerService(db);
const id = '11000000-0000-4000-8000-000000000001';
afterAll(() => db.$disconnect());
it('rejects invalid tenant input and unknown fields without querying PostgreSQL', async () => {
  for (const input of [
    { name: '', slug: 'valid' },
    { name: 'Test', slug: 'UPPERCASE' },
    { name: 'Test', slug: 'valid', id },
    { name: 'Test', slug: 'valid', logoUrl: 'file:///secret' },
  ])
    await expect(services.tenants.create(input)).rejects.toMatchObject({
      code: 'invalid_input',
    });
  await expect(services.tenants.update(id, {})).rejects.toMatchObject({
    code: 'invalid_input',
  });
  await expect(services.tenants.getById('invalid')).rejects.toMatchObject({
    code: 'invalid_input',
  });
});
it('rejects negative, fractional, oversized prices and cross-context fields', async () => {
  for (const price of [-1, 0.5, 2147483648, NaN]) {
    await expect(
      services.menu.create(id, { categoryId: id, name: 'Test', price }),
    ).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(services.menu.setPrice(id, id, price)).rejects.toMatchObject({
      code: 'invalid_input',
    });
  }
  await expect(
    services.categories.create(id, { name: 'Test', tenantId: id }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
  await expect(services.categories.setOrder(id, id, 1.5)).rejects.toMatchObject(
    { code: 'invalid_input' },
  );
  await expect(services.menu.update(id, id, {})).rejects.toMatchObject({
    code: 'invalid_input',
  });
});
it('preserves opaque LIDs and rejects incompatible identity types without guessing phone numbers', () => {
  expect(
    messagingIdentitySchema.parse({
      provider: 'baileys',
      accountId: 'account',
      providerUserId: '123456@lid',
      identifierType: 'lid',
    }),
  ).not.toHaveProperty('phoneNumber');
  for (const input of [
    {
      provider: 'baileys',
      providerUserId: '123456@lid',
      identifierType: 'jid',
    },
    {
      provider: 'baileys',
      providerUserId: '123456@s.whatsapp.net',
      identifierType: 'lid',
    },
    { provider: 'cloud-api', providerUserId: 'opaque', identifierType: 'lid' },
    {
      provider: 'mock',
      providerUserId: ' opaque ',
      identifierType: 'mock-user',
    },
  ])
    expect(
      messagingIdentitySchema.safeParse({ ...input, accountId: 'account' })
        .success,
    ).toBe(false);
});
it('requires explicit ownership verification for additional identities', async () => {
  await expect(
    customers.associateIdentity({
      verified: false,
      customerId: id,
      identity: {},
    } as never),
  ).rejects.toMatchObject({ code: 'invalid_input' });
});
it('maps database failures to sanitized domain errors', async () => {
  const raw = new Error('postgresql://secret:password@internal/private');
  await expect(
    domainOperation(() => Promise.reject(raw)),
  ).rejects.toMatchObject({
    code: 'unavailable',
    message: 'Service temporarily unavailable',
  });
  for (const [code, expected] of [
    ['P2002', 'conflict'],
    ['P2003', 'conflict'],
    ['P2025', 'not_found'],
  ]) {
    const error = new Prisma.PrismaClientKnownRequestError('private', {
      code: code!,
      clientVersion: '7',
    });
    await expect(
      domainOperation(() => Promise.reject(error)),
    ).rejects.toMatchObject({ code: expected });
  }
});
it('omits undefined values and preserves explicit null updates', async () => {
  const update = vi.spyOn(db.tenant, 'update').mockResolvedValue({} as never);
  await services.tenants.update(id, { description: null, name: undefined });
  expect(update).toHaveBeenCalledWith({
    where: { id },
    data: { description: null },
  });
  update.mockRestore();
});
