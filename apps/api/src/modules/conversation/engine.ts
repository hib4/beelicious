import { performance } from 'node:perf_hooks';
import {
  PreparationLimitError,
  recordPreparationFailure,
  type PreparationStage,
} from './diagnostics.js';
import { checkoutTransition } from './checkout-flow.js';
import type { CheckoutConfig } from '../checkout/config.js';
import {
  Prisma,
  isTransactionConflict,
  type PrismaClient,
} from '@beelicious/database';
import { createCatalogServices } from '../catalog/services.js';
import {
  CustomerService,
  type MessagingIdentity,
} from '../customers/service.js';
import { conversationInputSchema, type ConversationInput } from './commands.js';
import { CartService } from '../cart/service.js';
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
    private readonly maxQuantity = 20,
    private readonly checkout?: CheckoutConfig,
  ) {}
  async handleIncomingMessage(
    eventId: string,
    token: string,
    value: ConversationInput,
  ): Promise<string> {
    const started = performance.now();
    let stage: PreparationStage = 'validation';
    const budget = () => {
      const remaining = 20000 - (performance.now() - started);
      if (remaining <= 0) throw new PreparationLimitError('budget_exceeded');
      return remaining;
    };
    try {
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
      if (!claimed) throw new PreparationLimitError('lease_lost');
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
      stage = 'identity';
      budget();
      const customer = await new CustomerService(this.db).register(
        normalizedIdentity,
      );
      budget();
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
          stage = 'transaction';
          const remaining = budget();
          if (remaining <= 2000)
            throw new PreparationLimitError('budget_exceeded');
          return await this.db.$transaction(
            async (tx) => {
              budget();
              const now = this.now();
              const events = await tx.$queryRaw<
                { id: string }[]
              >`SELECT "id" FROM "WhatsAppEvent" WHERE "id" = ${eventId} AND "leaseToken" = ${token} AND "state" = 'processing' AND "leaseUntil" > ${now} FOR UPDATE`;
              if (!events.length) throw new PreparationLimitError('lease_lost');
              const previous = await tx.conversationTurn.findUnique({
                where: { eventId },
              });
              if (previous) {
                budget();
                return previous.responseText;
              }
              stage = 'session';
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
              const lockedSession = {
                customerId: customer.id,
                sessionId: session.id,
                messagingIdentityId: record.id,
              };
              stage = 'transition';
              budget();
              const parsed = stateDataSchema.safeParse(session.stateData);
              const context = parsed.success
                ? { ...session, data: parsed.data }
                : idle();
              const checkoutDeps = this.checkout
                ? {
                    tx,
                    config: this.checkout,
                    scope: { customerId: customer.id, sessionId: session.id },
                    eventId,
                    now: this.now,
                    maxQuantity: this.maxQuantity,
                    lockedSession,
                    chatId:
                      typeof (claimed.data as { chatId?: unknown }).chatId ===
                      'string'
                        ? (claimed.data as { chatId: string }).chatId
                        : input.senderId,
                    ...(typeof (claimed.data as { senderPhone?: unknown })
                      .senderPhone === 'string'
                      ? {
                          recipientPhone: (
                            claimed.data as { senderPhone: string }
                          ).senderPhone,
                        }
                      : {}),
                  }
                : undefined;
              const checkoutResult = checkoutDeps
                ? await checkoutTransition(
                    context,
                    input.command,
                    checkoutDeps,
                    session.requiresRefresh || !parsed.success,
                  )
                : null;
              let result =
                checkoutResult ??
                (await transition(
                  context,
                  input.command,
                  createCatalogServices(tx),
                  {
                    expired:
                      now.getTime() - session.lastInteractionAt.getTime() >=
                      30 * 60 * 1000,
                    refresh: session.requiresRefresh || !parsed.success,
                  },
                  {
                    service: new CartService(
                      tx,
                      this.maxQuantity,
                      true,
                      lockedSession,
                    ),
                    scope: { customerId: customer.id, sessionId: session.id },
                    checkout: !!this.checkout,
                  },
                ));
              // Finishing selection continues straight to pickup in the same turn.
              // Only explicit "finish" choices chain; viewing a READY cart does not.
              if (
                checkoutDeps &&
                !checkoutResult &&
                !session.requiresRefresh &&
                parsed.success &&
                input.command.kind === 'select' &&
                ['CART_ACTION', 'CART_REVIEW', 'CART_CONFIRM_PRICE'].includes(
                  context.state,
                ) &&
                result.context.state === 'CART_READY'
              ) {
                const pickup = await checkoutTransition(
                  result.context,
                  { kind: 'select', value: 2 },
                  checkoutDeps,
                );
                if (pickup?.context.state === 'SELECT_PICKUP')
                  result = {
                    context: pickup.context,
                    text: `✅ Pilihan tersimpan.\n\n${pickup.text}`,
                  };
                else if (pickup) result = pickup;
              }
              if (result.text.length > 4096)
                throw new Error('Conversation response exceeds limit');
              stage = 'persist';
              budget();
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
              stage = 'lease';
              budget();
              const owned = await tx.whatsAppEvent.findFirst({
                where: {
                  id: eventId,
                  leaseToken: token,
                  state: 'processing',
                  leaseUntil: { gt: this.now() },
                },
                select: { id: true },
              });
              if (!owned) throw new PreparationLimitError('lease_lost');
              budget();
              return result.text;
            },
            {
              isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
              maxWait: 2000,
              timeout: Math.min(15000, Math.floor(remaining - 2000)),
            },
          );
        } catch (error) {
          if (attempt < 2 && isTransactionConflict(error)) {
            budget();
            continue;
          }
          throw error;
        }
      }
    } catch (error) {
      recordPreparationFailure(error, stage, performance.now() - started);
      throw error;
    }
  }
}
