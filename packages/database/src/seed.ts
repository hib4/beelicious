import type { PrismaClient } from './generated/prisma/client.js';

// Prototype examples only. Stable IDs are reserved for this development fixture.
// Menu entries and prices are illustrative, not verified merchant information.
export const sampleIds = {
  tenant: '3e000000-0000-4000-8000-000000000001',
  noodles: '3e000000-0000-4000-8000-000000000002',
  drinks: '3e000000-0000-4000-8000-000000000003',
  extras: '3e000000-0000-4000-8000-000000000004',
  bakmiAyam: '3e000000-0000-4000-8000-000000000005',
  bakmiAyamPangsit: '3e000000-0000-4000-8000-000000000006',
  bakmiAyamJamur: '3e000000-0000-4000-8000-000000000007',
  kwetiauGorengAyam: '3e000000-0000-4000-8000-000000000008',
  esTehManis: '3e000000-0000-4000-8000-000000000009',
  esJeruk: '3e000000-0000-4000-8000-00000000000a',
  tehTawarHangat: '3e000000-0000-4000-8000-00000000000b',
  pangsitGoreng: '3e000000-0000-4000-8000-00000000000c',
  baksoAyam: '3e000000-0000-4000-8000-00000000000d',
  ekstraAyam: '3e000000-0000-4000-8000-00000000000e',
};
export async function seedDevelopmentCatalog(client: PrismaClient) {
  return client.$transaction(async (tx) => {
    // Transaction-scoped lock serializes this fixed development fixture only.
    // SELECT a supported integer rather than PostgreSQL's void return type.
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(177022, 3)`;
    const tenant = await tx.tenant.upsert({
      where: { slug: 'bakmi-effata' },
      create: {
        id: sampleIds.tenant,
        name: 'Bakmi Effata',
        slug: 'bakmi-effata',
        description: 'Tenant bakmi untuk pilot Beelicious.',
      },
      update: {},
    });
    if (tenant.id !== sampleIds.tenant)
      throw new Error('Development seed identifier conflict');
    for (const [id, name, sortOrder] of [
      [sampleIds.noodles, 'Bakmi', 0],
      [sampleIds.drinks, 'Minuman', 1],
      [sampleIds.extras, 'Tambahan', 2],
    ] as const) {
      const category = await tx.menuCategory.upsert({
        where: { id },
        create: { id, tenantId: tenant.id, name, sortOrder },
        update: {},
      });
      if (category.tenantId !== tenant.id)
        throw new Error('Development seed identifier conflict');
    }
    for (const [id, categoryId, name, price, sortOrder] of [
      [sampleIds.bakmiAyam, sampleIds.noodles, 'Bakmi Ayam', 25000, 0],
      [
        sampleIds.bakmiAyamPangsit,
        sampleIds.noodles,
        'Bakmi Ayam Pangsit',
        30000,
        1,
      ],
      [
        sampleIds.bakmiAyamJamur,
        sampleIds.noodles,
        'Bakmi Ayam Jamur',
        28000,
        2,
      ],
      [
        sampleIds.kwetiauGorengAyam,
        sampleIds.noodles,
        'Kwetiau Goreng Ayam',
        28000,
        3,
      ],
      [sampleIds.esTehManis, sampleIds.drinks, 'Es Teh Manis', 5000, 4],
      [sampleIds.esJeruk, sampleIds.drinks, 'Es Jeruk', 8000, 5],
      [sampleIds.tehTawarHangat, sampleIds.drinks, 'Teh Tawar Hangat', 3000, 6],
      [sampleIds.pangsitGoreng, sampleIds.extras, 'Pangsit Goreng', 10000, 7],
      [sampleIds.baksoAyam, sampleIds.extras, 'Bakso Ayam', 8000, 8],
      [sampleIds.ekstraAyam, sampleIds.extras, 'Ekstra Ayam', 7000, 9],
    ] as const) {
      const item = await tx.menuItem.upsert({
        where: { id },
        create: { id, tenantId: tenant.id, categoryId, name, price, sortOrder },
        update: {},
      });
      if (item.tenantId !== tenant.id || item.categoryId !== categoryId)
        throw new Error('Development seed identifier conflict');
    }
    // Development assumptions only: daily 07:00–18:00 Asia/Jakarta.
    for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++)
      await tx.tenantOperatingHour.upsert({
        where: { tenantId_dayOfWeek: { tenantId: tenant.id, dayOfWeek } },
        create: {
          tenantId: tenant.id,
          dayOfWeek,
          opensAt: 420,
          closesAt: 1080,
          timezone: 'Asia/Jakarta',
        },
        update: {},
      });
    return { tenantId: tenant.id };
  });
}
