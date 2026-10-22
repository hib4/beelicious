import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  Prisma,
  isTransactionConflict,
  type PrismaClient,
} from '@beelicious/database';
import { DomainError, idSchema } from '../catalog/validation.js';
import { MenuService } from '../catalog/services.js';
import { calculateCartPricing } from './pricing.js';

type Transaction = Prisma.TransactionClient;
export const cartScopeSchema = z.strictObject({
  customerId: idSchema,
  sessionId: idSchema,
});
export type CartScope = z.infer<typeof cartScopeSchema>;
export const cartActionSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('add'),
    menuItemId: idSchema,
    quantity: z.number().int().positive(),
    expectedPrice: z.number().int().nonnegative(),
  }),
  z.strictObject({
    kind: z.literal('update'),
    itemId: idSchema,
    quantity: z.number().int().positive(),
  }),
  z.strictObject({ kind: z.enum(['remove']), itemId: idSchema }),
  z.strictObject({ kind: z.enum(['clear', 'ready', 'reopen', 'abandon']) }),
]);
export type CartAction = z.infer<typeof cartActionSchema>;
export class CartError extends DomainError {
  constructor(
    readonly reason:
      'quantity' | 'unavailable' | 'empty' | 'ready' | 'tenant' | 'missing',
  ) {
    super(reason === 'missing' ? 'not_found' : 'conflict');
  }
}
const include = {
  tenant: true,
  items: {
    include: { menuItem: { include: { category: true } } },
    orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
  },
};
type LoadedCart = Prisma.CartGetPayload<{ include: typeof include }>;
export interface PriceProposal {
  fingerprint: string;
  changes: Array<{ name: string; oldPrice: number; newPrice: number }>;
  subtotal: number;
  action: CartAction;
}
export interface CartSummary {
  id: string;
  tenantId: string;
  tenantName: string;
  status: LoadedCart['status'];
  revision: number;
  items: Array<{
    id: string;
    menuItemId: string;
    name: string;
    quantity: number;
    unitPrice: number;
    currentPrice: number;
    available: boolean;
    lineSubtotal: number;
  }>;
  subtotal: number;
  fingerprint: string;
}
export type CartResult = { cart: CartSummary; proposal?: PriceProposal };

/** Internal proof supplied only after the enclosing transaction locks this session. */
export interface LockedCartSession extends CartScope {
  messagingIdentityId: string;
}

/** Accepts a caller-owned transaction so cart/session/response commits are atomic. */
export class CartService {
  constructor(
    private readonly db: PrismaClient | Transaction,
    readonly maxQuantity = 20,
    private readonly transactionBound = false,
    private readonly lockedSession?: LockedCartSession,
  ) {
    z.number().int().min(1).max(1000).parse(maxQuantity);
  }
  private async run<T>(
    scopeValue: CartScope,
    operation: (tx: Transaction, identityId: string) => Promise<T>,
  ): Promise<T> {
    const parsedScope = cartScopeSchema.safeParse(scopeValue);
    if (!parsedScope.success) throw new DomainError('invalid_input');
    const scope = parsedScope.data;
    const work = async (tx: Transaction) => {
      if (this.lockedSession) {
        if (
          !this.transactionBound ||
          this.lockedSession.sessionId !== scope.sessionId ||
          this.lockedSession.customerId !== scope.customerId
        )
          throw new CartError('missing');
        return operation(tx, this.lockedSession.messagingIdentityId);
      }
      const rows = await tx.$queryRaw<
        { messagingIdentityId: string }[]
      >`SELECT s."messagingIdentityId" FROM "ConversationSession" s JOIN "CustomerMessagingIdentity" i ON i."id" = s."messagingIdentityId" WHERE s."id" = ${scope.sessionId}::uuid AND i."customerId" = ${scope.customerId}::uuid FOR UPDATE OF s`;
      if (!rows[0]) throw new CartError('missing');
      return operation(tx, rows[0].messagingIdentityId);
    };
    try {
      if (this.transactionBound || !('$transaction' in this.db))
        return await work(this.db as Transaction);
      for (let attempt = 0; ; attempt++) {
        try {
          return await this.db.$transaction(work, {
            isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
          });
        } catch (error) {
          if (
            attempt < 2 &&
            (isTransactionConflict(error) ||
              (error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === 'P2002'))
          )
            continue;
          throw error;
        }
      }
    } catch (error) {
      // Serialization must reach the caller-owned engine transaction retry boundary.
      if (
        isTransactionConflict(error) &&
        (this.transactionBound || !('$transaction' in this.db))
      )
        throw error;
      if (error instanceof DomainError) throw error;
      if (error instanceof z.ZodError) throw new DomainError('invalid_input');
      throw new DomainError('unavailable', { cause: error });
    }
  }
  private async load(tx: Transaction, scope: CartScope) {
    const cart = await tx.cart.findFirst({
      where: {
        sessionId: scope.sessionId,
        customerId: scope.customerId,
        status: { in: ['ACTIVE', 'READY'] },
      },
      include,
    });
    if (cart)
      await tx.$queryRaw`SELECT "id" FROM "Cart" WHERE "id" = ${cart.id}::uuid FOR UPDATE`;
    return cart;
  }
  private summary(cart: LoadedCart): CartSummary {
    const prices = calculateCartPricing(cart.items);
    const items = cart.items.map((r, i) => ({
      id: r.id,
      menuItemId: r.menuItemId,
      name: r.menuItem.name,
      quantity: r.quantity,
      unitPrice: r.unitPrice,
      currentPrice: r.menuItem.price,
      available:
        cart.tenant.isActive &&
        r.menuItem.isAvailable &&
        r.menuItem.category.isActive,
      lineSubtotal: prices.lineSubtotals[i]!,
    }));
    return {
      id: cart.id,
      tenantId: cart.tenantId,
      tenantName: cart.tenant.name,
      status: cart.status,
      revision: cart.revision,
      items,
      subtotal: prices.subtotal,
      fingerprint: this.hash([
        cart.id,
        cart.revision,
        cart.tenant.isActive,
        items,
      ]),
    };
  }
  private hash(value: unknown) {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }
  getCart(scope: CartScope) {
    return this.run(scope, async (tx) => {
      const cart = await this.load(tx, scope);
      return cart ? this.summary(cart) : null;
    });
  }
  getCartSummary(scope: CartScope) {
    return this.getCart(scope);
  }
  getOrCreateActiveCart(scope: CartScope, tenantId: string) {
    if (!idSchema.safeParse(tenantId).success)
      throw new DomainError('invalid_input');
    return this.run(scope, async (tx, messagingIdentityId) => {
      if (
        await tx.order.findFirst({
          where: {
            sessionId: scope.sessionId,
            status: { in: ['PENDING_PAYMENT', 'REQUIRES_REVIEW'] },
          },
        })
      )
        throw new CartError('ready');
      const existing = await this.load(tx, scope);
      if (existing) {
        if (existing.tenantId !== tenantId) throw new CartError('tenant');
        return this.summary(existing);
      }
      await tx.$queryRaw`SELECT "id" FROM "Tenant" WHERE "id" = ${tenantId}::uuid FOR SHARE`;
      const tenant = await tx.tenant.findUnique({ where: { id: tenantId } });
      if (!tenant?.isActive) throw new CartError('unavailable');
      const cart = await tx.cart.create({
        data: { ...scope, messagingIdentityId, tenantId },
        include,
      });
      return this.summary(cart);
    });
  }
  addItem(
    scope: CartScope,
    menuItemId: string,
    quantity: number,
    expectedPrice: number,
  ) {
    return this.perform(scope, {
      kind: 'add',
      menuItemId,
      quantity,
      expectedPrice,
    });
  }
  updateItemQuantity(scope: CartScope, itemId: string, quantity: number) {
    return this.perform(scope, { kind: 'update', itemId, quantity });
  }
  removeItem(scope: CartScope, itemId: string) {
    return this.perform(scope, { kind: 'remove', itemId });
  }
  clearCart(scope: CartScope) {
    return this.perform(scope, { kind: 'clear' });
  }
  markCartReady(scope: CartScope) {
    return this.perform(scope, { kind: 'ready' });
  }
  reopenCart(scope: CartScope) {
    return this.perform(scope, { kind: 'reopen' });
  }
  perform(
    scope: CartScope,
    value: CartAction,
    acceptedFingerprint?: string,
  ): Promise<CartResult> {
    return this.run(scope, async (tx) => {
      const action = cartActionSchema.parse(value);
      if (
        await tx.order.findFirst({
          where: {
            sessionId: scope.sessionId,
            status: { in: ['PENDING_PAYMENT', 'REQUIRES_REVIEW'] },
          },
        })
      )
        throw new CartError('ready');
      const cart = await this.load(tx, scope);
      if (!cart) throw new CartError('missing');
      if (
        cart.status === 'READY' &&
        !['reopen', 'abandon'].includes(action.kind)
      )
        throw new CartError('ready');
      // Share locks prevent catalog changes between validation and commit.
      await tx.$queryRaw`SELECT "id" FROM "Tenant" WHERE "id" = ${cart.tenantId}::uuid FOR SHARE`;
      const menuIds = [
        ...new Set([
          ...cart.items.map((r) => r.menuItemId),
          ...(action.kind === 'add' ? [action.menuItemId] : []),
        ]),
      ].sort();
      if (menuIds.length) {
        await tx.$queryRaw(
          Prisma.sql`SELECT "id" FROM "MenuCategory" WHERE "tenantId" = ${cart.tenantId}::uuid ORDER BY "id" FOR SHARE`,
        );
        await tx.$queryRaw(
          Prisma.sql`SELECT "id" FROM "MenuItem" WHERE "id" IN (${Prisma.join(menuIds.map((id) => Prisma.sql`${id}::uuid`))}) ORDER BY "id" FOR SHARE`,
        );
      }
      const summary = this.summary(cart);
      const target =
        'itemId' in action
          ? cart.items.find((i) => i.id === action.itemId)
          : undefined;
      if ('itemId' in action && !target) throw new CartError('missing');
      if (['clear', 'remove', 'reopen', 'abandon'].includes(action.kind)) {
        if (action.kind === 'clear')
          await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
        if (action.kind === 'remove')
          await tx.cartItem.delete({ where: { id: target!.id } });
        await tx.cart.update({
          where: { id: cart.id },
          data: {
            revision: { increment: 1 },
            ...(action.kind === 'reopen'
              ? { status: 'ACTIVE' as const }
              : action.kind === 'abandon'
                ? { status: 'ABANDONED' as const }
                : {}),
          },
        });
        return {
          cart: this.summary(
            await tx.cart.findUniqueOrThrow({
              where: { id: cart.id },
              include,
            }),
          ),
        };
      }
      let added: Awaited<ReturnType<MenuService['get']>> | undefined;
      if (action.kind === 'add') {
        try {
          added = await new MenuService(tx).get(
            cart.tenantId,
            action.menuItemId,
            true,
          );
        } catch (error) {
          if (error instanceof DomainError && error.code === 'not_found')
            throw new CartError('unavailable');
          throw error;
        }
      }
      if (action.kind === 'ready' && !cart.items.length)
        throw new CartError('empty');
      if (!cart.tenant.isActive || summary.items.some((i) => !i.available))
        throw new CartError('unavailable');
      const existing =
        action.kind === 'add'
          ? cart.items.find((i) => i.menuItemId === action.menuItemId)
          : undefined;
      const quantity =
        action.kind === 'add'
          ? (existing?.quantity ?? 0) + action.quantity
          : action.kind === 'update'
            ? action.quantity
            : undefined;
      if (
        (quantity !== undefined && quantity > this.maxQuantity) ||
        (action.kind === 'ready' &&
          cart.items.some((i) => i.quantity > this.maxQuantity))
      )
        throw new CartError('quantity');
      const proposed = cart.items.map((i) => ({
        quantity:
          action.kind === 'update' && target!.id === i.id
            ? action.quantity
            : action.kind === 'add' && existing?.id === i.id
              ? quantity!
              : i.quantity,
        unitPrice: i.menuItem.price,
      }));
      if (added && !existing)
        proposed.push({ quantity: quantity!, unitPrice: added.price });
      const subtotal = calculateCartPricing(proposed).subtotal;
      const changes = summary.items
        .filter((i) => i.unitPrice !== i.currentPrice)
        .map((i) => ({
          name: i.name,
          oldPrice: i.unitPrice,
          newPrice: i.currentPrice,
        }));
      if (
        added &&
        action.kind === 'add' &&
        action.expectedPrice !== added.price &&
        !(existing && existing.unitPrice !== added.price)
      )
        changes.push({
          name: added.name,
          oldPrice: action.expectedPrice,
          newPrice: added.price,
        });
      const fingerprint = this.hash([
        summary.fingerprint,
        action,
        proposed,
        added?.price,
      ]);
      if (
        (changes.length || acceptedFingerprint !== undefined) &&
        acceptedFingerprint !== fingerprint
      )
        return {
          cart: summary,
          proposal: { changes, subtotal, fingerprint, action },
        };
      // Only explicit acknowledgement updates existing saved prices.
      if (changes.length)
        for (const item of cart.items)
          await tx.cartItem.update({
            where: { id: item.id },
            data: { unitPrice: item.menuItem.price },
          });
      if (action.kind === 'add')
        await tx.cartItem.upsert({
          where: {
            cartId_menuItemId: {
              cartId: cart.id,
              menuItemId: action.menuItemId,
            },
          },
          create: {
            cartId: cart.id,
            tenantId: cart.tenantId,
            menuItemId: action.menuItemId,
            quantity: quantity!,
            unitPrice: added!.price,
          },
          update: { quantity: quantity!, unitPrice: added!.price },
        });
      if (action.kind === 'update')
        await tx.cartItem.update({
          where: { id: target!.id },
          data: { quantity: action.quantity },
        });
      await tx.cart.update({
        where: { id: cart.id },
        data: {
          revision: { increment: 1 },
          ...(action.kind === 'ready' ? { status: 'READY' as const } : {}),
        },
      });
      return {
        cart: this.summary(
          await tx.cart.findUniqueOrThrow({ where: { id: cart.id }, include }),
        ),
      };
    });
  }
}
