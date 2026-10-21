import type { CheckoutConfig } from '../checkout/config.js';
import {
  Prisma,
  isTransactionConflict,
  type PrismaClient,
} from '@beelicious/database';
import { z } from 'zod';
import {
  MenuService,
  MenuCategoryService,
  TenantService,
} from '../catalog/services.js';
import { DomainError } from '../catalog/validation.js';
import {
  localInstant,
  localParts,
  PickupSlotService,
  type Tx,
} from '../checkout/pickup.js';

export class DashboardError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}
export const fulfillmentStates = [
  'NEW',
  'ACCEPTED',
  'PREPARING',
  'READY_FOR_PICKUP',
  'COMPLETED',
  'REQUIRES_REVIEW',
] as const;
export const pageQuery = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
const nextState: Record<string, string> = {
  NEW: 'ACCEPTED',
  ACCEPTED: 'PREPARING',
  PREPARING: 'READY_FOR_PICKUP',
  READY_FOR_PICKUP: 'COMPLETED',
};
const transitionInput = z.strictObject({
  target: z.enum(fulfillmentStates).exclude(['NEW']),
  version: z.number().int().nonnegative(),
  requestId: z.uuid(),
  reason: z.string().trim().min(1).max(500).optional(),
});
const dateInput = z.iso.date();
function bounds(date: string) {
  const [y, m, d] = dateInput.parse(date).split('-').map(Number) as [
    number,
    number,
    number,
  ];
  const start = localInstant(y, m, d, 0, 'Asia/Jakarta');
  return { gte: start, lt: new Date(start.getTime() + 86400000) };
}
function today(now: Date) {
  const p = localParts(now, 'Asia/Jakarta');
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}
function id(value: string) {
  return z.uuid().parse(value);
}
type Permission = 'read' | 'owner' | 'availability';
export class DashboardService {
  constructor(
    private db: PrismaClient,
    private now = () => new Date(),
    private pickupConfig: CheckoutConfig = {
      development: true,
      provider: 'mock',
      merchantId: 'mock',
      expiryMinutes: 15,
      slotMinutes: 30,
      capacity: 5,
      leadMinutes: 60,
      bookingDays: 7,
      timezone: 'Asia/Jakarta',
    },
  ) {}
  async run<T>(
    user: string,
    tenant: string,
    permission: Permission,
    work: (
      tx: Tx,
      membership: { role: 'OWNER' | 'STAFF'; canManageAvailability: boolean },
    ) => Promise<T>,
  ): Promise<T> {
    id(user);
    id(tenant);
    for (let attempt = 0; ; attempt++)
      try {
        return await this.db.$transaction(
          async (tx) => {
            await tx.$queryRaw`SELECT "id" FROM "TenantUser" WHERE "tenantId"=${tenant}::uuid AND "authUserId"=${user}::uuid FOR SHARE`;
            const member = await tx.tenantUser.findUnique({
              where: {
                tenantId_authUserId: { tenantId: tenant, authUserId: user },
              },
            });
            if (!member?.isActive)
              throw new DashboardError(403, 'tenant_access_denied');
            if (
              (permission === 'owner' && member.role !== 'OWNER') ||
              (permission === 'availability' &&
                member.role !== 'OWNER' &&
                !member.canManageAvailability)
            )
              throw new DashboardError(403, 'permission_denied');
            return work(tx, member);
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
            timeout: 10000,
          },
        );
      } catch (error) {
        if (attempt < 2 && isTransactionConflict(error)) continue;
        if (
          error instanceof DashboardError ||
          error instanceof DomainError ||
          error instanceof z.ZodError
        )
          throw error;
        throw new DashboardError(503, 'service_unavailable');
      }
  }
  async memberships(user: string) {
    return this.db.tenantUser.findMany({
      where: { authUserId: id(user), isActive: true },
      select: {
        tenantId: true,
        role: true,
        canManageAvailability: true,
        tenant: { select: { name: true, isActive: true } },
      },
      orderBy: { tenantId: 'asc' },
    });
  }
  private audit(
    tx: Tx,
    user: string,
    tenantId: string,
    action: string,
    targetId: string,
    changes: Prisma.InputJsonValue,
  ) {
    return tx.tenantAudit.create({
      data: { tenantId, actorUserId: user, action, targetId, changes },
    });
  }
  overview(user: string, tenant: string) {
    return this.run(user, tenant, 'read', async (tx, member) => {
      const day = bounds(today(this.now()));
      const paid = {
        tenantId: tenant,
        payment: { status: 'SUCCEEDED' as const },
      };
      const counts = await Promise.all(
        [
          'NEW',
          'ACCEPTED',
          'PREPARING',
          'READY_FOR_PICKUP',
          'REQUIRES_REVIEW',
        ].map((fulfillmentStatus) =>
          tx.order.count({
            where: {
              ...paid,
              fulfillmentStatus:
                fulfillmentStatus as (typeof fulfillmentStates)[number],
            },
          }),
        ),
      );
      const paidToday = await tx.order.count({
        where: {
          tenantId: tenant,
          payment: { status: 'SUCCEEDED', paidAt: day },
        },
      });
      const completedToday = await tx.fulfillmentHistory.count({
        where: { tenantId: tenant, toStatus: 'COMPLETED', createdAt: day },
      });
      const gross =
        member.role === 'OWNER'
          ? await tx.payment.aggregate({
              where: {
                status: 'SUCCEEDED',
                paidAt: day,
                order: { tenantId: tenant },
              },
              _sum: { amount: true },
            })
          : null;
      const providers = await tx.payment.groupBy({
        by: ['provider'],
        where: {
          status: 'SUCCEEDED',
          paidAt: day,
          order: { tenantId: tenant },
        },
        _count: true,
      });
      const recent = await tx.order.findMany({
        where: { tenantId: tenant },
        select: orderSelect,
        orderBy: [{ placedAt: 'desc' }, { id: 'desc' }],
        take: 5,
      });
      return {
        paidToday,
        awaitingAcceptance: counts[0],
        accepted: counts[1],
        preparing: counts[2],
        ready: counts[3],
        requiresReview: counts[4],
        completedToday,
        ...(gross ? { paidGross: gross._sum.amount ?? 0 } : {}),
        providers: providers.map((p) => p.provider),
        recent,
        timezone: 'Asia/Jakarta',
        asOf: this.now(),
      };
    });
  }
  orders(user: string, tenant: string, input: unknown) {
    const q = pageQuery
      .extend({
        status: z.enum(fulfillmentStates).optional(),
        date: dateInput.optional(),
        search: z.string().trim().max(50).default(''),
        sort: z.enum(['pickup', 'created']).default('pickup'),
        scope: z.enum(['actionable', 'all']).default('actionable'),
      })
      .strict()
      .parse(input);
    return this.run(user, tenant, 'read', async (tx) => {
      const where: Prisma.OrderWhereInput = {
        tenantId: tenant,
        ...(q.scope === 'actionable'
          ? {
              status: 'CONFIRMED',
              payment: { status: 'SUCCEEDED' },
              fulfillmentStatus: {
                in: ['NEW', 'ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP'],
              },
            }
          : {}),
        ...(q.status ? { fulfillmentStatus: q.status } : {}),
        ...(q.search
          ? { orderNumber: { contains: q.search, mode: 'insensitive' } }
          : {}),
        ...(q.date ? { pickupSlot: { startsAt: bounds(q.date) } } : {}),
      };
      const [items, total] = await Promise.all([
        tx.order.findMany({
          where,
          select: orderSelect,
          orderBy:
            q.sort === 'pickup'
              ? [{ pickupSlot: { startsAt: 'asc' } }, { id: 'asc' }]
              : [{ placedAt: 'desc' }, { id: 'desc' }],
          skip: (q.page - 1) * q.pageSize,
          take: q.pageSize,
        }),
        tx.order.count({ where }),
      ]);
      return { items, total, page: q.page, pageSize: q.pageSize };
    });
  }
  detail(user: string, tenant: string, orderId: string) {
    return this.run(user, tenant, 'read', async (tx) => {
      const row = await tx.order.findFirst({
        where: { id: id(orderId), tenantId: tenant },
        select: {
          ...orderSelect,
          fulfillmentHistory: {
            select: {
              fromStatus: true,
              toStatus: true,
              actorUserId: true,
              createdAt: true,
              reason: true,
            },
            orderBy: { version: 'asc' },
          },
          notifications: {
            select: { kind: true, state: true, createdAt: true },
            orderBy: { createdAt: 'asc' },
          },
        },
      });
      if (!row) throw new DashboardError(404, 'not_found');
      return row;
    });
  }
  transition(user: string, tenant: string, orderId: string, input: unknown) {
    const data = transitionInput.parse(input);
    id(orderId);
    return this.run(
      user,
      tenant,
      data.target === 'REQUIRES_REVIEW' ? 'owner' : 'read',
      async (tx) => {
        const route = await tx.order.findFirst({
          where: { id: orderId, tenantId: tenant },
          select: { sessionId: true },
        });
        if (!route) throw new DashboardError(404, 'not_found');
        // Same lock order as payment reconciliation: session, payment, order.
        await tx.$queryRaw`SELECT "id" FROM "ConversationSession" WHERE "id"=${route.sessionId}::uuid FOR UPDATE`;
        await tx.$queryRaw`SELECT "id" FROM "Payment" WHERE "orderId"=${orderId}::uuid FOR UPDATE`;
        await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id"=${orderId}::uuid FOR UPDATE`;
        const previous = await tx.fulfillmentHistory.findUnique({
          where: {
            tenantId_requestId: { tenantId: tenant, requestId: data.requestId },
          },
        });
        if (previous) {
          if (
            previous.orderId !== orderId ||
            previous.actorUserId !== user ||
            previous.toStatus !== data.target ||
            previous.version !== data.version + 1 ||
            (previous.reason ?? undefined) !== data.reason
          )
            throw new DashboardError(409, 'idempotency_conflict');
          return tx.order.findUniqueOrThrow({
            where: { id: orderId },
            select: orderSelect,
          });
        }
        const order = await tx.order.findUniqueOrThrow({
          where: { id: orderId },
          include: { payment: true, reservation: true, pickupSlot: true },
        });
        if (
          order.payment?.status !== 'SUCCEEDED' ||
          order.status !== 'CONFIRMED' ||
          order.reservation?.status !== 'CONFIRMED'
        )
          throw new DashboardError(409, 'payment_not_actionable');
        if (
          order.fulfillmentVersion !== data.version ||
          !order.fulfillmentStatus ||
          order.fulfillmentStatus === 'COMPLETED' ||
          order.fulfillmentStatus === 'REQUIRES_REVIEW'
        )
          throw new DashboardError(409, 'stale_order');
        if (
          data.target === 'REQUIRES_REVIEW'
            ? !data.reason
            : nextState[order.fulfillmentStatus] !== data.target
        )
          throw new DashboardError(409, 'invalid_transition');
        await tx.order.update({
          where: { id: orderId },
          data: {
            fulfillmentStatus: data.target,
            fulfillmentVersion: { increment: 1 },
          },
        });
        await tx.fulfillmentHistory.create({
          data: {
            tenantId: tenant,
            orderId,
            actorUserId: user,
            fromStatus: order.fulfillmentStatus,
            toStatus: data.target,
            version: data.version + 1,
            requestId: data.requestId,
            ...(data.reason ? { reason: data.reason } : {}),
          },
        });
        await this.audit(tx, user, tenant, `ORDER_${data.target}`, orderId, {
          from: order.fulfillmentStatus,
          to: data.target,
        });
        const descriptions: Record<string, string> = {
          ACCEPTED: `Pesanan kamu sudah diterima oleh ${order.tenantName}!`,
          PREPARING: 'Pesanan kamu sedang disiapkan.',
          READY_FOR_PICKUP: 'Pesanan kamu sudah siap diambil!',
        };
        if (descriptions[data.target]) {
          const pickup = new Intl.DateTimeFormat('id-ID', {
            timeZone: 'Asia/Jakarta',
            dateStyle: 'medium',
            timeStyle: 'short',
          }).format(order.pickupSlot.startsAt);
          await tx.checkoutNotification.create({
            data: {
              orderId,
              logicalKey: `fulfillment:${orderId}:${data.target}`,
              kind: 'fulfillment',
              createdAt: this.now(),
              availableAt: this.now(),
              text: `${descriptions[data.target]}\n\nPesanan: ${order.orderNumber}\nTenant: ${order.tenantName}\nPickup: ${pickup} WIB${order.payment.provider === 'mock' ? '\n\nSIMULASI — TIDAK DAPAT DIBAYAR' : ''}`,
            },
          });
        }
        return tx.order.findUniqueOrThrow({
          where: { id: orderId },
          select: orderSelect,
        });
      },
    );
  }
  menu(user: string, tenant: string, input: unknown) {
    const q = pageQuery
      .extend({
        search: z.string().trim().max(120).default(''),
        categoryId: z.uuid().optional(),
      })
      .strict()
      .parse(input);
    return this.run(user, tenant, 'read', async (tx) => {
      const where: Prisma.MenuItemWhereInput = {
        tenantId: tenant,
        ...(q.search
          ? { name: { contains: q.search, mode: 'insensitive' } }
          : {}),
        ...(q.categoryId ? { categoryId: q.categoryId } : {}),
      };
      const [items, total, categories] = await Promise.all([
        tx.menuItem.findMany({
          where,
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
          skip: (q.page - 1) * q.pageSize,
          take: q.pageSize,
        }),
        tx.menuItem.count({ where }),
        new MenuCategoryService(tx).list(tenant),
      ]);
      return { items, total, categories, page: q.page, pageSize: q.pageSize };
    });
  }
  mutateMenu(
    user: string,
    tenant: string,
    itemId: string | null,
    input: unknown,
    availability = false,
  ) {
    const envelope = z
      .strictObject({
        updatedAt: z.iso.datetime().optional(),
        data: z.record(z.string(), z.unknown()),
      })
      .parse(input);
    if (availability)
      z.strictObject({ isAvailable: z.boolean() }).parse(envelope.data);
    return this.run(
      user,
      tenant,
      availability ? 'availability' : 'owner',
      async (tx) => {
        let before = null;
        if (itemId) {
          await tx.$queryRaw`SELECT "id" FROM "MenuItem" WHERE "id"=${id(itemId)}::uuid AND "tenantId"=${tenant}::uuid FOR UPDATE`;
          before = await new MenuService(tx).get(tenant, itemId);
          if (before.updatedAt.toISOString() !== envelope.updatedAt)
            throw new DashboardError(409, 'stale_resource');
        }
        const result = itemId
          ? await new MenuService(tx).update(tenant, itemId, envelope.data)
          : await new MenuService(tx).create(tenant, envelope.data);
        await this.audit(
          tx,
          user,
          tenant,
          availability ? 'MENU_AVAILABILITY_CHANGED' : 'MENU_UPDATED',
          result.id,
          {
            before: before
              ? {
                  price: before.price,
                  isAvailable: before.isAvailable,
                  categoryId: before.categoryId,
                }
              : null,
            after: {
              price: result.price,
              isAvailable: result.isAvailable,
              categoryId: result.categoryId,
            },
          },
        );
        return result;
      },
    );
  }
  category(
    user: string,
    tenant: string,
    categoryId: string | null,
    input: unknown,
  ) {
    const data = z
      .strictObject({
        name: z.string().trim().min(1).max(120).optional(),
        sortOrder: z.number().int().optional(),
        isActive: z.boolean().optional(),
        updatedAt: z.iso.datetime().optional(),
      })
      .parse(input);
    return this.run(user, tenant, 'owner', async (tx) => {
      const { updatedAt, ...patch } = data;
      if (categoryId) {
        await tx.$queryRaw`SELECT "id" FROM "MenuCategory" WHERE "id"=${id(categoryId)}::uuid AND "tenantId"=${tenant}::uuid FOR UPDATE`;
        const before = await tx.menuCategory.findFirst({
          where: { id: categoryId, tenantId: tenant },
        });
        if (!before) throw new DashboardError(404, 'not_found');
        if (before.updatedAt.toISOString() !== updatedAt)
          throw new DashboardError(409, 'stale_resource');
      }
      const row = categoryId
        ? await new MenuCategoryService(tx).update(tenant, categoryId, patch)
        : await new MenuCategoryService(tx).create(tenant, patch);
      await this.audit(tx, user, tenant, 'CATEGORY_UPDATED', row.id, {
        sortOrder: row.sortOrder,
        isActive: row.isActive,
      });
      return row;
    });
  }
  settings(user: string, tenant: string) {
    return this.run(user, tenant, 'owner', async (tx) => {
      const row = await new TenantService(tx).getById(tenant);
      return {
        id: row.id,
        name: row.name,
        description: row.description,
        logoUrl: row.logoUrl,
        updatedAt: row.updatedAt,
        timezone: 'Asia/Jakarta',
      };
    });
  }
  updateSettings(user: string, tenant: string, input: unknown) {
    const data = z
      .strictObject({
        name: z.string().trim().min(1).max(120),
        description: z.string().trim().max(2000).nullable(),
        logoUrl: z
          .url()
          .refine((v) => new URL(v).protocol === 'https:')
          .nullable(),
        updatedAt: z.iso.datetime(),
      })
      .parse(input);
    return this.run(user, tenant, 'owner', async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Tenant" WHERE "id"=${tenant}::uuid FOR UPDATE`;
      const before = await new TenantService(tx).getById(tenant);
      if (before.updatedAt.toISOString() !== data.updatedAt)
        throw new DashboardError(409, 'stale_resource');
      const { updatedAt, ...patch } = data;
      void updatedAt;
      const after = await new TenantService(tx).update(tenant, patch);
      await this.audit(tx, user, tenant, 'TENANT_UPDATED', tenant, {
        fields: ['name', 'description', 'logoUrl'],
      });
      return { updatedAt: after.updatedAt };
    });
  }
  pickup(user: string, tenant: string, input: unknown) {
    const q = pageQuery
      .extend({ date: dateInput.optional() })
      .strict()
      .parse(input);
    return this.run(user, tenant, 'read', async (tx) => {
      await new PickupSlotService(
        tx,
        this.pickupConfig,
        this.now,
        true,
      ).generateSlots(tenant);
      const where = {
        tenantId: tenant,
        startsAt: q.date
          ? {
              ...bounds(q.date),
              gte: new Date(
                Math.max(bounds(q.date).gte.getTime(), this.now().getTime()),
              ),
            }
          : { gte: this.now() },
      };
      const [items, total, hours] = await Promise.all([
        tx.pickupSlot.findMany({
          where,
          include: {
            _count: {
              select: { reservations: { where: { status: 'CONFIRMED' } } },
            },
          },
          orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
          take: q.pageSize,
          skip: (q.page - 1) * q.pageSize,
        }),
        tx.pickupSlot.count({ where }),
        tx.tenantOperatingHour.findMany({
          where: { tenantId: tenant },
          orderBy: { dayOfWeek: 'asc' },
        }),
      ]);
      return {
        items: items.map(({ _count, ...s }) => ({
          ...s,
          confirmed: _count.reservations,
          held: s.reservedCount - _count.reservations,
          remaining: s.capacity - s.reservedCount,
        })),
        total,
        hours,
        page: q.page,
        pageSize: q.pageSize,
        timezone: 'Asia/Jakarta',
      };
    });
  }
  updateSlot(user: string, tenant: string, slotId: string, input: unknown) {
    const d = z
      .strictObject({
        capacity: z.number().int().min(1).max(1000),
        isAvailable: z.boolean(),
        updatedAt: z.iso.datetime(),
      })
      .parse(input);
    return this.run(user, tenant, 'owner', async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`schedule:${tenant}`},0))`;
      await tx.$queryRaw`SELECT "id" FROM "PickupSlot" WHERE "id"=${id(slotId)}::uuid AND "tenantId"=${tenant}::uuid FOR UPDATE`;
      const s = await tx.pickupSlot.findFirst({
        where: { id: slotId, tenantId: tenant },
      });
      if (!s) throw new DashboardError(404, 'not_found');
      if (
        s.startsAt <= this.now() ||
        s.updatedAt.toISOString() !== d.updatedAt ||
        d.capacity < s.reservedCount ||
        (!d.isAvailable && s.reservedCount > 0)
      )
        throw new DashboardError(409, 'unsafe_slot_change');
      const after = await tx.pickupSlot.update({
        where: { id: slotId },
        data: { capacity: d.capacity, isAvailable: d.isAvailable },
      });
      await this.audit(tx, user, tenant, 'PICKUP_CAPACITY_UPDATED', slotId, {
        before: { capacity: s.capacity, isAvailable: s.isAvailable },
        after: { capacity: after.capacity, isAvailable: after.isAvailable },
      });
      return after;
    });
  }
  updateHours(user: string, tenant: string, input: unknown) {
    const d = z
      .strictObject({
        dayOfWeek: z.number().int().min(0).max(6),
        opensAt: z.number().int().min(0).max(1439),
        closesAt: z.number().int().min(1).max(1440),
        isClosed: z.boolean(),
        updatedAt: z.iso.datetime(),
      })
      .refine((d) => d.opensAt < d.closesAt)
      .parse(input);
    return this.run(user, tenant, 'owner', async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`schedule:${tenant}`},0))`;
      await tx.$queryRaw`SELECT "id" FROM "PickupSlot" WHERE "tenantId"=${tenant}::uuid AND "startsAt">${this.now()} ORDER BY "id" FOR UPDATE`;
      const hours = await tx.tenantOperatingHour.findUnique({
        where: {
          tenantId_dayOfWeek: { tenantId: tenant, dayOfWeek: d.dayOfWeek },
        },
      });
      if (!hours || hours.updatedAt.toISOString() !== d.updatedAt)
        throw new DashboardError(409, 'stale_resource');
      const slots = await tx.pickupSlot.findMany({
        where: {
          tenantId: tenant,
          startsAt: { gt: this.now() },
          isAvailable: true,
        },
      });
      const conflicts = slots.filter((s) => {
        const p = localParts(s.startsAt, 'Asia/Jakarta'),
          e = localParts(s.endsAt, 'Asia/Jakarta');
        return (
          new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay() ===
            d.dayOfWeek &&
          (d.isClosed ||
            p.hour * 60 + p.minute < d.opensAt ||
            e.hour * 60 + e.minute > d.closesAt ||
            p.day !== e.day)
        );
      });
      if (conflicts.some((s) => s.reservedCount > 0))
        throw new DashboardError(409, 'reserved_schedule_conflict');
      await tx.pickupSlot.updateMany({
        where: { id: { in: conflicts.map((s) => s.id) } },
        data: { isAvailable: false },
      });
      const { updatedAt, ...patch } = d;
      void updatedAt;
      const result = await tx.tenantOperatingHour.update({
        where: { id: hours.id },
        data: patch,
      });
      await this.audit(tx, user, tenant, 'OPERATING_HOURS_UPDATED', hours.id, {
        before: {
          opensAt: hours.opensAt,
          closesAt: hours.closesAt,
          isClosed: hours.isClosed,
        },
        after: {
          opensAt: d.opensAt,
          closesAt: d.closesAt,
          isClosed: d.isClosed,
        },
      });
      await new PickupSlotService(
        tx,
        this.pickupConfig,
        this.now,
        true,
      ).generateSlots(tenant);
      return result;
    });
  }
}
const orderSelect = {
  id: true,
  orderNumber: true,
  tenantId: true,
  tenantName: true,
  status: true,
  fulfillmentStatus: true,
  fulfillmentVersion: true,
  totalAmount: true,
  subtotal: true,
  currency: true,
  placedAt: true,
  confirmedAt: true,
  pickupSlot: { select: { startsAt: true, endsAt: true } },
  payment: { select: { status: true, provider: true, paidAt: true } },
  customer: { select: { displayName: true } },
  items: {
    select: {
      nameSnapshot: true,
      quantity: true,
      unitPrice: true,
      lineSubtotal: true,
    },
    orderBy: { id: 'asc' as const },
  },
} satisfies Prisma.OrderSelect;
