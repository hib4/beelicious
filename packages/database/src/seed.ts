import type { PrismaClient } from './generated/prisma/client.js';

// Prototype examples only. Stable IDs are reserved for this development fixture.
export const sampleIds = {
  tenant: '3b000000-0000-4000-8000-000000000001',
  food: '3b000000-0000-4000-8000-000000000002',
  drink: '3b000000-0000-4000-8000-000000000003',
  rice: '3b000000-0000-4000-8000-000000000004',
  tea: '3b000000-0000-4000-8000-000000000005',
};
export async function seedDevelopmentCatalog(client: PrismaClient) {
  return client.$transaction(async (tx) => {
    // Transaction-scoped lock serializes this fixed development fixture only.
    // SELECT a supported integer rather than PostgreSQL's void return type.
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(177022, 3)`;
    const tenant = await tx.tenant.upsert({
      where: { slug: 'warung-babe' },
      create: {
        id: sampleIds.tenant,
        name: 'Warung Babe',
        slug: 'warung-babe',
        description: 'Indonesian food tenant for the Beelicious pilot.',
      },
      update: {},
    });
    if (tenant.id !== sampleIds.tenant)
      throw new Error('Development seed identifier conflict');
    for (const [id, name, sortOrder] of [
      [sampleIds.food, 'Makanan', 0],
      [sampleIds.drink, 'Minuman', 1],
    ] as const) {
      const category = await tx.menuCategory.upsert({
        where: { id },
        create: { id, tenantId: tenant.id, name, sortOrder },
        update: {},
      });
      if (category.tenantId !== tenant.id)
        throw new Error('Development seed identifier conflict');
    }
    for (const [id, categoryId, name, price] of [
      [sampleIds.rice, sampleIds.food, 'Nasi Goreng Spesial', 20000],
      [sampleIds.tea, sampleIds.drink, 'Es Teh Manis', 5000],
    ] as const) {
      const item = await tx.menuItem.upsert({
        where: { id },
        create: { id, tenantId: tenant.id, categoryId, name, price },
        update: {},
      });
      if (item.tenantId !== tenant.id || item.categoryId !== categoryId)
        throw new Error('Development seed identifier conflict');
    }
    return { tenantId: tenant.id };
  });
}
