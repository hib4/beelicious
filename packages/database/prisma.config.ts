import '../../scripts/load-env.mjs';
import { defineConfig } from 'prisma/config';
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations', seed: 'tsx src/seed-cli.ts' },
  // Generation is database-independent; migration commands require DATABASE_URL.
  datasource: { url: process.env.DATABASE_URL ?? '' },
});
