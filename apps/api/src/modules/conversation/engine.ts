import { Prisma, type PrismaClient } from '@beelicious/database';
import { createCatalogServices } from '../catalog/services.js';
import {
  CustomerService,
  type MessagingIdentity,
} from '../customers/service.js';
import { conversationInputSchema, type ConversationInput } from './commands.js';
import { idle, initialData, stateDataSchema, transition } from './flow.js';

export interface ConversationHandler {
  handleIncomingMessage(
    eventId: string,
    token: string,
    input: ConversationInput,
  ): Promise<string>;
}
export class ConversationEngine implements ConversationHandler {
  constructor(
    private readonly db: PrismaClient,
    private readonly now: () => Date = () => new Date(),
  ) {}
  async handleIncomingMessage(
    eventId: string,
    token: string,
    value: ConversationInput,
  ): Promise<string> {
    const input = conversationInputSchema.parse(value);
    const claimed = await this.db.whatsAppEvent.findFirst({
      where: {
        id: eventId,
        leaseToken: token,
        state: 'processing',
        leaseUntil: { gt: this.now() },
        processingMode: 'conversation',
      },
      select: { data: true },
    });
    if (!claimed) throw new Error('Conversation lease lost');
    const envelope = claimed.data as { conversation?: unknown };
    const stored = conversationInputSchema.safeParse(envelope.conversation);
    if (
      !stored.success ||
      JSON.stringify(stored.data) !== JSON.stringify(input)
    )
      throw new Error('Conversation event mismatch');
    const identity: MessagingIdentity =
      input.provider === 'baileys'
        ? {
            accountId: input.accountId,
            provider: 'baileys',
            providerUserId: input.senderId,
            identifierType: input.senderId.endsWith('@lid') ? 'lid' : 'jid',
          }
        : input.provider === 'mock'
          ? {
              provider: 'mock',
              accountId: input.accountId,
              providerUserId: input.senderId,
              identifierType: 'mock-user',
            }
          : {
              provider: 'cloud-api',
              accountId: input.accountId,
              providerUserId: input.senderId,
              identifierType: 'cloud-user',
            };
    // Only the identity fields enter CustomerService; no alias inference or raw text.
    const normalizedIdentity = {
      provider: identity.provider,
      accountId: identity.accountId,
      providerUserId: identity.providerUserId,
      identifierType: identity.identifierType,
    };
    const customer = await new CustomerService(this.db).register(
      normalizedIdentity,
    );
    const record = await this.db.customerMessagingIdentity.findUniqueOrThrow({
      where: {
        provider_accountId_providerUserId: {
          provider: input.provider,
          accountId: input.accountId,
          providerUserId: input.senderId,
        },
      },
    });
    if (record.customerId !== customer.id)
      throw new Error('Identity ownership mismatch');
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.db.$transaction(
          async (tx) => {
            const now = this.now();
            const events = await tx.$queryRaw<
              { id: string }[]
            >`SELECT "id" FROM "WhatsAppEvent" WHERE "id" = ${eventId} AND "leaseToken" = ${token} AND "state" = 'processing' AND "leaseUntil" > ${now} FOR UPDATE`;
            if (!events.length) throw new Error('Conversation lease lost');
            const previous = await tx.conversationTurn.findUnique({
              where: { eventId },
            });
            if (previous) return previous.responseText;
            await tx.conversationSession.createMany({
              data: [
                { messagingIdentityId: record.id, stateData: initialData() },
              ],
              skipDuplicates: true,
            });
            await tx.$queryRaw`SELECT "id" FROM "ConversationSession" WHERE "messagingIdentityId" = ${record.id}::uuid FOR UPDATE`;
            const session = await tx.conversationSession.findUniqueOrThrow({
              where: { messagingIdentityId: record.id },
            });
            const parsed = stateDataSchema.safeParse(session.stateData);
            const context = parsed.success
              ? { ...session, data: parsed.data }
              : idle();
            const result = await transition(
              context,
              input.command,
              createCatalogServices(tx),
              {
                expired:
                  now.getTime() - session.lastInteractionAt.getTime() >=
                  30 * 60 * 1000,
                refresh: session.requiresRefresh || !parsed.success,
              },
            );
            const { data, ...selection } = result.context;
            const version = session.version + 1;
            // Never spread the persisted session into an update: only writable context.
            await tx.conversationSession.update({
              where: { id: session.id },
              data: {
                state: selection.state,
                selectedTenantId: selection.selectedTenantId,
                selectedCategoryId: selection.selectedCategoryId,
                selectedMenuItemId: selection.selectedMenuItemId,
                stateData: data,
                version,
                requiresRefresh:
                  input.command.kind === 'help' && session.requiresRefresh,
                ...(input.command.kind === 'help'
                  ? {}
                  : { lastInteractionAt: now }),
              },
            });
            await tx.conversationTurn.create({
              data: {
                eventId,
                sessionId: session.id,
                sessionVersion: version,
                responseText: result.text,
              },
            });
            return result.text;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
        );
      } catch (error) {
        if (
          attempt < 2 &&
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2034'
        )
          continue;
        throw error;
      }
    }
  }
}
