import { Prisma, type PrismaClient } from './generated/prisma/client.js';

export type EventState =
  | 'pending'
  | 'processing'
  | 'sending'
  | 'completed'
  | 'ignored'
  | 'failed'
  | 'uncertain';
export interface ReceivedEvent {
  dedupKey: string;
  kind: 'message' | 'status';
  data: Prisma.InputJsonObject;
}
export interface ClaimedEvent {
  id: string;
  kind: string;
  data: unknown;
  attempts: number;
}
export interface EventResult {
  state: 'pending' | 'completed' | 'ignored' | 'failed' | 'uncertain';
  availableAt?: Date;
  outboundMessageId?: string;
  lastError?: string;
}
export interface EventScope {
  provider: 'cloud-api' | 'baileys' | 'mock';
  accountId: string;
  legacyCloud?: { wabaId: string; phoneNumberId: string };
}
export interface WhatsAppEventStore {
  receive(events: ReceivedEvent[]): Promise<void>;
  claim(
    now: Date,
    token: string,
    scope: EventScope,
  ): Promise<ClaimedEvent | undefined>;
  beginSend(id: string, token: string, now: Date): Promise<boolean>;
  finish(id: string, token: string, result: EventResult): Promise<void>;
}
export function createEventStore(client: PrismaClient): WhatsAppEventStore {
  return {
    async receive(events) {
      if (events.length === 0) return;
      await client.$transaction(async (tx) => {
        await tx.whatsAppEvent.createMany({
          data: events,
          skipDuplicates: true,
        });
      });
    },
    async claim(now, token, scope) {
      // Parameterized JSON metadata filters keep inactive accounts/providers pending.
      const legacy = scope.legacyCloud;
      const filter = Prisma.sql`(
        ("data"->>'provider' = ${scope.provider} AND "data"->>'accountId' = ${scope.accountId})
        OR (${scope.provider === 'cloud-api' && !!legacy} AND "data"->>'provider' IS NULL AND (
          "kind" = 'status' OR ("data"->>'wabaId' = ${legacy?.wabaId ?? ''} AND "data"->>'phoneNumberId' = ${legacy?.phoneNumberId ?? ''})
        ))
      )`;
      const leaseUntil = new Date(now.getTime() + 30000);
      // Sending is never reclaimed for a second send: its result may be unknown.
      await client.$executeRaw`
        UPDATE "WhatsAppEvent"
        SET "state" = 'uncertain', "leaseToken" = NULL, "leaseUntil" = NULL,
            "lastError" = 'interrupted_send', "updatedAt" = ${now}
        WHERE ${filter} AND "state" = 'sending' AND "leaseUntil" <= ${now}
      `;
      const rows = await client.$queryRaw<ClaimedEvent[]>`
        UPDATE "WhatsAppEvent" AS event
        SET "state" = 'processing', "leaseToken" = ${token}, "leaseUntil" = ${leaseUntil}, "updatedAt" = ${now}
        WHERE event."id" = (
          SELECT "id" FROM "WhatsAppEvent"
          WHERE ${filter} AND (("state" = 'pending' AND "availableAt" <= ${now})
             OR ("state" = 'processing' AND "leaseUntil" <= ${now}))
          ORDER BY "availableAt", "createdAt", "id"
          FOR UPDATE SKIP LOCKED LIMIT 1
        )
        RETURNING event."id", event."kind", event."data", event."attempts"
      `;
      return rows[0];
    },
    async beginSend(id, token, now) {
      const result = await client.whatsAppEvent.updateMany({
        where: {
          id,
          leaseToken: token,
          state: 'processing',
          leaseUntil: { gt: now },
        },
        data: {
          state: 'sending',
          attempts: { increment: 1 },
          leaseUntil: new Date(now.getTime() + 30000),
        },
      });
      return result.count === 1;
    },
    async finish(id, token, result) {
      await client.whatsAppEvent.updateMany({
        where: {
          id,
          leaseToken: token,
          state: { in: ['processing', 'sending'] },
        },
        data: { ...result, leaseToken: null, leaseUntil: null },
      });
    },
  };
}
