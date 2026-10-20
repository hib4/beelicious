import '../../../scripts/load-env.mjs';
import { createPrismaClient } from './index.js';
import { seedDevelopmentCatalog } from './seed.js';

async function main() {
  if (process.env.NODE_ENV !== 'development' || !process.env.DATABASE_URL) {
    console.error(
      'Development seeding requires NODE_ENV=development and DATABASE_URL.',
    );
    process.exitCode = 1;
    return;
  }
  const client = createPrismaClient(process.env.DATABASE_URL);
  try {
    await seedDevelopmentCatalog(client);
    console.info(
      'Development sample catalog is ready. These menu entries are unverified prototypes.',
    );
  } catch {
    console.error(
      'Development catalog seed failed. Check database connectivity, migrations, and reserved seed identifiers.',
    );
    process.exitCode = 1;
  } finally {
    await client.$disconnect();
  }
}
await main();
