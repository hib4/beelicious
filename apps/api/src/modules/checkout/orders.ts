import { randomUUID } from 'node:crypto';
import {
  Prisma,
  isTransactionConflict,
  type PrismaClient,
} from '@beelicious/database';
import { z } from 'zod';
import { DomainError } from '../catalog/validation.js';
import { calculateCartPricing } from '../cart/pricing.js';
import { PickupSlotService, type Tx } from './pickup.js';
import type { CheckoutConfig } from './config.js';
export const scopeSchema = z.strictObject({
  customerId: z.uuid(),
  sessionId: z.uuid(),
});
export type CheckoutScope = z.infer<typeof scopeSchema>;
export const orderInclude = {
  items: { orderBy: { id: 'asc' as const } },
  payment: true,
  pickupSlot: true,
  reservation: true,
};
export type CheckoutOrder = Prisma.OrderGetPayload<{
  include: typeof orderInclude;
}>;
export class OrderService {
  constructor(
    private db: PrismaClient | Tx,
    private config: CheckoutConfig,
    private now = () => new Date(),
  ) {}
  async run<T>(scope: CheckoutScope, fn: (tx: Tx) => Promise<T>): Promise<T> {
    if (!scopeSchema.safeParse(scope).success)
      throw new DomainError('invalid_input');
    const work = async (tx: Tx) => {
      await tx.$queryRaw`SELECT "id" FROM "ConversationSession" WHERE "id" = ${scope.sessionId}::uuid FOR UPDATE`;
      const s = await tx.conversationSession.findFirst({
        where: {
          id: scope.sessionId,
          identity: { customerId: scope.customerId },
        },
      });
      if (!s) throw new DomainError('not_found');
      return fn(tx);
    };
    if (!('$transaction' in this.db)) return work(this.db);
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.db.$transaction(work, {
          isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        });
      } catch (e) {
        if (attempt < 2 && isTransactionConflict(e)) continue;
        if (e instanceof DomainError) throw e;
        throw new DomainError('unavailable');
      }
    }
  }
  current(scope: CheckoutScope): Promise<CheckoutOrder | null> {
    return this.run(scope, (tx) =>
      tx.order.findFirst({
        where: { sessionId: scope.sessionId, customerId: scope.customerId },
        include: orderInclude,
        orderBy: [{ placedAt: 'desc' }, { id: 'desc' }],
      }),
    );
  }
  get(scope: CheckoutScope, id: string): Promise<CheckoutOrder | null> {
    return this.run(scope, (tx) =>
      tx.order.findFirst({
        where: { id, sessionId: scope.sessionId, customerId: scope.customerId },
        include: orderInclude,
      }),
    );
  }
  getByNumber(
    scope: CheckoutScope,
    orderNumber: string,
  ): Promise<CheckoutOrder | null> {
    return this.run(scope, (tx) =>
      tx.order.findFirst({
        where: {
          orderNumber,
          sessionId: scope.sessionId,
          customerId: scope.customerId,
        },
        include: orderInclude,
      }),
    );
  }
  createFromCart(
    scope: CheckoutScope,
    input: {
      cartId: string;
      slotId: string;
      revision: number;
      eventId: string;
      chatId?: string;
      recipientPhone?: string;
    },
  ): Promise<CheckoutOrder> {
    if (
      !z
        .object({
          cartId: z.uuid(),
          slotId: z.uuid(),
          revision: z.number().int().nonnegative(),
          eventId: z.string().min(1),
        })
        .safeParse(input).success
    )
      throw new DomainError('invalid_input');
    return this.run(scope, async (tx) => {
      const existing = await tx.order.findFirst({
        where: {
          sessionId: scope.sessionId,
          customerId: scope.customerId,
          OR: [
            { sourceCartId: input.cartId },
            { confirmationEventId: input.eventId },
          ],
        },
        include: orderInclude,
      });
      if (existing) return existing;
      if (
        await tx.order.findFirst({
          where: {
            sessionId: scope.sessionId,
            status: { in: ['PENDING_PAYMENT', 'REQUIRES_REVIEW'] },
          },
        })
      )
        throw new DomainError('conflict');
      await tx.$queryRaw`SELECT "id" FROM "Cart" WHERE "id" = ${input.cartId}::uuid FOR UPDATE`;
      const cart = await tx.cart.findFirst({
        where: {
          id: input.cartId,
          sessionId: scope.sessionId,
          customerId: scope.customerId,
          status: 'READY',
          revision: input.revision,
        },
        include: {
          tenant: true,
          items: {
            orderBy: { id: 'asc' },
            include: { menuItem: { include: { category: true } } },
          },
        },
      });
      if (!cart || !cart.tenant.isActive || !cart.items.length)
        throw new DomainError('conflict');
      await tx.$queryRaw`SELECT "id" FROM "Tenant" WHERE "id" = ${cart.tenantId}::uuid FOR SHARE`;
      for (const item of [...cart.items].sort((a, b) =>
        a.menuItemId.localeCompare(b.menuItemId),
      )) {
        await tx.$queryRaw`SELECT "id" FROM "MenuCategory" WHERE "id" = ${item.menuItem.categoryId}::uuid FOR SHARE`;
        await tx.$queryRaw`SELECT "id" FROM "MenuItem" WHERE "id" = ${item.menuItemId}::uuid FOR SHARE`;
        if (
          !item.menuItem.isAvailable ||
          !item.menuItem.category.isActive ||
          item.unitPrice !== item.menuItem.price
        )
          throw new DomainError('conflict');
      }
      const totals = calculateCartPricing(cart.items);
      if (totals.subtotal <= 0 || totals.subtotal > 2147483647)
        throw new DomainError('invalid_input');
      const pickup = new PickupSlotService(tx, this.config, this.now);
      await pickup.validateSlot(tx, cart.tenantId, input.slotId, true);
      const now = this.now();
      const expiresAt = new Date(
        now.getTime() + this.config.expiryMinutes * 60000,
      );
      const order = await tx.order.create({
        data: {
          orderNumber: `BEE-${now.toISOString().slice(0, 10).replaceAll('-', '')}-${randomUUID().slice(0, 8).toUpperCase()}`,
          customerId: cart.customerId,
          messagingIdentityId: cart.messagingIdentityId,
          sessionId: cart.sessionId,
          tenantId: cart.tenantId,
          tenantName: cart.tenant.name,
          sourceCartId: cart.id,
          confirmationEventId: input.eventId,
          chatId:
            input.chatId ??
            (
              await tx.customerMessagingIdentity.findUniqueOrThrow({
                where: { id: cart.messagingIdentityId },
              })
            ).providerUserId,
          ...(input.recipientPhone
            ? { recipientPhone: input.recipientPhone }
            : {}),
          pickupSlotId: input.slotId,
          subtotal: totals.subtotal,
          totalAmount: totals.subtotal,
          items: {
            create: cart.items.map((i, n) => ({
              menuItemId: i.menuItemId,
              nameSnapshot: i.menuItem.name,
              quantity: i.quantity,
              unitPrice: i.unitPrice,
              lineSubtotal: totals.lineSubtotals[n]!,
            })),
          },
        },
      });
      await pickup.reserve(
        tx,
        order.id,
        cart.tenantId,
        input.slotId,
        expiresAt,
      );
      await tx.payment.create({
        data: {
          orderId: order.id,
          provider: this.config.provider,
          merchantId: this.config.merchantId,
          providerOrderId: `bee-${randomUUID()}`,
          amount: totals.subtotal,
          expiresAt,
          createdAt: now,
          availableAt: now,
        },
      });
      await tx.cart.update({
        where: { id: cart.id },
        data: { status: 'CHECKED_OUT', revision: { increment: 1 } },
      });
      return tx.order.findUniqueOrThrow({
        where: { id: order.id },
        include: orderInclude,
      });
    });
  }
  copyToNewCart(scope: CheckoutScope, orderId: string) {
    return this.run(scope, async (tx) => {
      const order = await tx.order.findFirst({
        where: {
          id: orderId,
          sessionId: scope.sessionId,
          customerId: scope.customerId,
          status: { in: ['CANCELLED', 'EXPIRED', 'CONFIRMED'] },
        },
        include: {
          items: { include: { menuItem: { include: { category: true } } } },
        },
      });
      if (!order) throw new DomainError('conflict');
      if (
        await tx.cart.findFirst({
          where: {
            sessionId: scope.sessionId,
            status: { in: ['ACTIVE', 'READY'] },
          },
        })
      )
        throw new DomainError('conflict');
      return tx.cart.create({
        data: {
          customerId: order.customerId,
          sessionId: order.sessionId,
          messagingIdentityId: order.messagingIdentityId,
          tenantId: order.tenantId,
          items: {
            create: order.items
              .filter(
                (i) => i.menuItem.isAvailable && i.menuItem.category.isActive,
              )
              .map((i) => ({
                menuItemId: i.menuItemId,
                quantity: i.quantity,
                unitPrice: i.unitPrice,
              })),
          },
        },
      });
    });
  }
}
