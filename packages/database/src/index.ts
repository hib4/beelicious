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
export { Prisma, type PrismaClient } from './generated/prisma/client.js';
export type {
  Tenant,
  MenuCategory,
  MenuItem,
  Customer,
  CustomerMessagingIdentity,
} from './generated/prisma/client.js';
export { seedDevelopmentCatalog } from './seed.js';

export interface Database {
  checkConnection(): Promise<void>;
  disconnect(): Promise<void>;
}

export interface WhatsAppDatabase extends Database {
  whatsappEvents: WhatsAppEventStore;
}

export interface ApplicationDatabase extends WhatsAppDatabase {
  prisma: PrismaClient;
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

export function createDatabase(connectionString: string): ApplicationDatabase {
  const client = createPrismaClient(connectionString);
  return {
    prisma: client,
    whatsappEvents: createEventStore(client),
    async checkConnection() {
      await client.$queryRaw`SELECT 1`;
    },
    async disconnect() {
      await client.$disconnect();
    },
  };
}

export type DomainClient = Pick<
  PrismaClient,
  | 'tenant'
  | 'menuCategory'
  | 'menuItem'
  | 'customer'
  | 'customerMessagingIdentity'
>;
export type {
  ConversationSession,
  ConversationTurn,
  ConversationState,
} from './generated/prisma/client.js';

export type { Cart, CartItem, CartStatus } from './generated/prisma/client.js';

export { isTransactionConflict } from './transactions.js';

export type {
  Order,
  OrderItem,
  Payment,
  PaymentEvent,
  PickupSlot,
  PickupReservation,
  TenantOperatingHour,
  CheckoutNotification,
  PaymentStatus,
  OrderStatus,
} from './generated/prisma/client.js';

export type {
  FulfillmentStatus,
  TenantRole,
  TenantUser,
  FulfillmentHistory,
  TenantAudit,
} from './generated/prisma/client.js';
