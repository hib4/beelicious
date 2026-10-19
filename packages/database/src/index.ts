import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';

export interface Database {
  checkConnection(): Promise<void>;
  disconnect(): Promise<void>;
}

export function createDatabase(connectionString: string): Database {
  const adapter = new PrismaPg({
    connectionString,
    max: 5,
    connectionTimeoutMillis: 2000,
    query_timeout: 2000,
    statement_timeout: 2000,
    idleTimeoutMillis: 10000,
  });
  const client = new PrismaClient({ adapter, log: [] });
  return {
    async checkConnection() {
      await client.$queryRaw`SELECT 1`;
    },
    async disconnect() {
      await client.$disconnect();
    },
  };
}
