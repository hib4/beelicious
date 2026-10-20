import { PrismaPg } from '@prisma/adapter-pg';
import {
  createEventStore,
  type WhatsAppEventStore,
} from './whatsapp-events.js';
export type {
  WhatsAppEventStore,
  ReceivedEvent,
  ClaimedEvent,
  EventResult,
  EventState,
  EventScope,
} from './whatsapp-events.js';
import { PrismaClient } from './generated/prisma/client.js';

export interface Database {
  checkConnection(): Promise<void>;
  disconnect(): Promise<void>;
}

export interface WhatsAppDatabase extends Database {
  whatsappEvents: WhatsAppEventStore;
}

export function createPrismaClient(connectionString: string): PrismaClient {
  const adapter = new PrismaPg({
    connectionString,
    max: 5,
    connectionTimeoutMillis: 2000,
    query_timeout: 2000,
    statement_timeout: 2000,
    idleTimeoutMillis: 10000,
  });
  return new PrismaClient({ adapter, log: [] });
}

export function createDatabase(connectionString: string): WhatsAppDatabase {
  const client = createPrismaClient(connectionString);
  return {
    whatsappEvents: createEventStore(client),
    async checkConnection() {
      await client.$queryRaw`SELECT 1`;
    },
    async disconnect() {
      await client.$disconnect();
    },
  };
}
