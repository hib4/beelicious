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
  processingMode?: string;
  streamKey?: string;
  dedupKey: string;
  kind: 'message' | 'status';
  data: Prisma.InputJsonObject;
}
export interface ClaimedEvent {
  id: string;
  kind: string;
  data: unknown;
  attempts: number;
  preparationAttempts?: number;
  processingMode?: string;
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
  conversationEnabled?: boolean;
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
        // Serialize receipt assignment per identity, including concurrent batches.
        const streams = [
          ...new Set(events.flatMap((e) => (e.streamKey ? [e.streamKey] : []))),
        ].sort();
        for (const stream of streams)
          await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${stream}, 4))`;
        await tx.whatsAppEvent.createMany({
          data: events,
          skipDuplicates: true,
        });
      });
    },
    async claim(now, token, scope) {
      // Parameterized JSON metadata filters keep inactive accounts/providers pending.
      const legacy = scope.legacyCloud;
      const filter = Prisma.sql`("processingMode" = 'greeting' OR ${scope.conversationEnabled ?? false}) AND (
        ("data"->>'provider' = ${scope.provider} AND "data"->>'accountId' = ${scope.accountId})
        OR (${scope.provider === 'cloud-api' && !!legacy} AND "data"->>'provider' IS NULL AND (
          "kind" = 'status' OR ("data"->>'wabaId' = ${legacy?.wabaId ?? ''} AND "data"->>'phoneNumberId' = ${legacy?.phoneNumberId ?? ''})
        ))
      )`;
      const leaseUntil = new Date(now.getTime() + 30000);
      // Sending is never reclaimed for a second send: its result may be unknown.
      await client.$transaction(async (tx) => {
        const interrupted = await tx.$queryRaw<{ id: string }[]>`
        UPDATE "WhatsAppEvent"
        SET "state" = 'uncertain', "leaseToken" = NULL, "leaseUntil" = NULL,
            "lastError" = 'interrupted_send', "updatedAt" = ${now}
        WHERE ${filter} AND "state" = 'sending' AND "leaseUntil" <= ${now}
        RETURNING "id"
      `;
        if (interrupted.length)
          await tx.conversationSession.updateMany({
            where: {
              turns: {
                some: { eventId: { in: interrupted.map((e) => e.id) } },
              },
            },
            data: { requiresRefresh: true },
          });
      });
      const rows = await client.$queryRaw<ClaimedEvent[]>`
        UPDATE "WhatsAppEvent" AS event
        SET "state" = 'processing', "leaseToken" = ${token}, "leaseUntil" = ${leaseUntil}, "updatedAt" = ${now},
            "preparationAttempts" = "preparationAttempts" + CASE WHEN "processingMode" = 'conversation' THEN 1 ELSE 0 END
        WHERE event."id" = (
          SELECT "id" FROM "WhatsAppEvent" AS candidate
          WHERE ${filter} AND (("state" = 'pending' AND "availableAt" <= ${now})
             OR ("state" = 'processing' AND "leaseUntil" <= ${now}))
          AND ("streamKey" IS NULL OR NOT EXISTS (
            SELECT 1 FROM "WhatsAppEvent" AS earlier
            WHERE earlier."streamKey" = candidate."streamKey"
              AND earlier."receiptSequence" < candidate."receiptSequence"
              AND earlier."state" IN ('pending', 'processing', 'sending')
          ))
          ORDER BY "receiptSequence"
          FOR UPDATE SKIP LOCKED LIMIT 1
        )
        RETURNING event."id", event."kind", event."data", event."attempts", event."processingMode", event."preparationAttempts"
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
      await client.$transaction(async (tx) => {
        const updated = await tx.whatsAppEvent.updateMany({
          where: {
            id,
            leaseToken: token,
            state: { in: ['processing', 'sending'] },
          },
          data: { ...result, leaseToken: null, leaseUntil: null },
        });
        if (
          updated.count &&
          ['failed', 'uncertain', 'ignored'].includes(result.state)
        )
          await tx.conversationSession.updateMany({
            where: { turns: { some: { eventId: id } } },
            data: { requiresRefresh: true },
          });
      });
    },
  };
}
