import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, expect, it } from 'vitest';
import Fastify from 'fastify';
import { createDatabase } from '@beelicious/database';
import { DashboardService } from '../../src/modules/dashboard/service.js';
import { registerDashboardRoutes } from '../../src/modules/dashboard/routes.js';
import { CartService } from '../../src/modules/cart/service.js';
import { OrderService } from '../../src/modules/checkout/orders.js';
import { createCheckoutWorker } from '../../src/modules/checkout/notifications.js';
import { createMockAdapter } from '../../src/modules/messaging/providers/mock.js';
import { parseCheckout } from '../../src/modules/checkout/config.js';
const dev = new URL(process.env.DATABASE_URL || '');
const url = new URL(process.env.WHATSAPP_TEST_DATABASE_URL || dev.toString());
if (!process.env.WHATSAPP_TEST_DATABASE_URL) url.pathname += '_test';
if (
  !url.pathname.endsWith('_test') ||
  (url.host === dev.host && url.pathname === dev.pathname)
)
  throw new Error('Separate _test database required');
const db = createDatabase(url.toString()),
  p = db.prisma;
const tenants: string[] = [],
  customers: string[] = [];
const now = () => new Date('2026-10-21T02:00:00Z');
const service = new DashboardService(p, now);
const config = parseCheckout({
  CHECKOUT_ENABLED: 'true',
  CONVERSATION_ENABLED: 'true',
  NODE_ENV: 'development',
})!;
async function fixture(paid = true) {
  const tenant = await p.tenant.create({
    data: {
      name: 'Dashboard integration tenant',
      slug: `dashboard-${randomUUID()}`,
    },
  });
  tenants.push(tenant.id);
  const owner = randomUUID(),
    staff = randomUUID(),
    stranger = randomUUID();
  await p.tenantUser.createMany({
    data: [
      { tenantId: tenant.id, authUserId: owner, role: 'OWNER' },
      { tenantId: tenant.id, authUserId: staff, role: 'STAFF' },
    ],
  });
  const customer = await p.customer.create({ data: {} });
  customers.push(customer.id);
  const identity = await p.customerMessagingIdentity.create({
    data: {
      customerId: customer.id,
      provider: 'mock',
      accountId: `dashboard-${randomUUID()}`,
      providerUserId: `628${Math.floor(Math.random() * 1e10)}`,
      identifierType: 'mock-user',
    },
  });
  const session = await p.conversationSession.create({
    data: { messagingIdentityId: identity.id, stateData: {} },
  });
  const category = await p.menuCategory.create({
    data: { tenantId: tenant.id, name: 'Makanan' },
  });
  const menu = await p.menuItem.create({
    data: {
      tenantId: tenant.id,
      categoryId: category.id,
      name: 'Test rice',
      price: 20000,
    },
  });
  await p.tenantOperatingHour.createMany({
    data: Array.from({ length: 7 }, (_, dayOfWeek) => ({
      tenantId: tenant.id,
      dayOfWeek,
      opensAt: 420,
      closesAt: 1080,
    })),
  });
  const slot = await p.pickupSlot.create({
    data: {
      tenantId: tenant.id,
      startsAt: new Date('2026-10-21T04:00:00Z'),
      endsAt: new Date('2026-10-21T04:30:00Z'),
      capacity: 2,
    },
  });
  const scope = { customerId: customer.id, sessionId: session.id };
  const carts = new CartService(p);
  await carts.getOrCreateActiveCart(scope, tenant.id);
  await carts.addItem(scope, menu.id, 2, 20000);
  const ready = await carts.markCartReady(scope);
  const order = await new OrderService(p, config, now).createFromCart(scope, {
    cartId: ready.cart.id,
    revision: ready.cart.revision,
    slotId: slot.id,
    eventId: randomUUID(),
  });
  if (paid) {
    await p.payment.update({
      where: { orderId: order.id },
      data: { status: 'SUCCEEDED', paidAt: now() },
    });
    await p.order.update({
      where: { id: order.id },
      data: {
        status: 'CONFIRMED',
        fulfillmentStatus: 'NEW',
        confirmedAt: now(),
      },
    });
    await p.pickupReservation.update({
      where: { orderId: order.id },
      data: { status: 'CONFIRMED' },
    });
  }
  return {
    tenant,
    owner,
    staff,
    stranger,
    customer,
    identity,
    session,
    category,
    menu,
    slot,
    order,
  };
}
function action(target = 'ACCEPTED', version = 0) {
  return { target, version, requestId: randomUUID() };
}
afterEach(async () => {
  const orders = { tenantId: { in: tenants } };
  await p.tenantAudit.deleteMany({ where: orders });
  await p.fulfillmentHistory.deleteMany({ where: orders });
  await p.checkoutNotification.deleteMany({ where: { order: orders } });
  await p.paymentEvent.deleteMany({ where: { payment: { order: orders } } });
  await p.mockPaymentTransaction.deleteMany({
    where: { payment: { order: orders } },
  });
  await p.payment.deleteMany({ where: { order: orders } });
  await p.pickupReservation.deleteMany({ where: orders });
  await p.orderItem.deleteMany({ where: orders });
  await p.order.deleteMany({ where: orders });
  await p.cartItem.deleteMany({ where: orders });
  await p.cart.deleteMany({ where: orders });
  await p.conversationSession.deleteMany({
    where: { identity: { customerId: { in: customers } } },
  });
  await p.customerMessagingIdentity.deleteMany({
    where: { customerId: { in: customers } },
  });
  await p.customer.deleteMany({ where: { id: { in: customers } } });
  await p.pickupSlot.deleteMany({ where: orders });
  await p.tenantOperatingHour.deleteMany({ where: orders });
  await p.menuItem.deleteMany({ where: orders });
  await p.menuCategory.deleteMany({ where: orders });
  await p.tenantUser.deleteMany({ where: orders });
  await p.tenant.deleteMany({ where: { id: { in: tenants } } });
  tenants.length = 0;
  customers.length = 0;
});
afterAll(() => db.disconnect());
it('lists verified memberships and immediately rejects revoked memberships', async () => {
  const f = await fixture();
  expect(await service.memberships(f.owner)).toHaveLength(1);
  await p.tenantUser.update({
    where: {
      tenantId_authUserId: { tenantId: f.tenant.id, authUserId: f.owner },
    },
    data: { isActive: false },
  });
  await expect(service.overview(f.owner, f.tenant.id)).rejects.toMatchObject({
    status: 403,
  });
});
it('scopes paid queues, search, pagination, dates and details without exposing routing or gateway data', async () => {
  const f = await fixture();
  const result = await service.orders(f.owner, f.tenant.id, {
    search: f.order.orderNumber,
    scope: 'all',
    pageSize: 1,
    date: '2026-10-21',
  });
  expect(result.total).toBe(1);
  const detail = await service.detail(f.owner, f.tenant.id, f.order.id);
  expect(detail.items[0]?.unitPrice).toBe(20000);
  const json = JSON.stringify(detail);
  for (const key of [
    'chatId',
    'providerUserId',
    'qrCodeUrl',
    'providerOrderId',
    'recipientPhone',
  ])
    expect(json).not.toContain(key);
});
it('prevents unauthorized tenant reads and cross-tenant order access', async () => {
  const a = await fixture(),
    b = await fixture();
  await expect(service.orders(a.owner, b.tenant.id, {})).rejects.toMatchObject({
    status: 403,
  });
  await expect(
    service.detail(a.owner, a.tenant.id, b.order.id),
  ).rejects.toMatchObject({ status: 404 });
});
it('excludes unpaid orders from preparation and prevents unpaid transitions', async () => {
  const f = await fixture(false);
  expect((await service.orders(f.owner, f.tenant.id, {})).total).toBe(0);
  await expect(
    service.transition(f.owner, f.tenant.id, f.order.id, action()),
  ).rejects.toMatchObject({ code: 'payment_not_actionable' });
});
it('separates owner gross metrics from staff counts and uses verified payment day', async () => {
  const f = await fixture();
  expect(await service.overview(f.owner, f.tenant.id)).toMatchObject({
    paidToday: 1,
    paidGross: 40000,
    awaitingAcceptance: 1,
  });
  expect(await service.overview(f.staff, f.tenant.id)).not.toHaveProperty(
    'paidGross',
  );
});
it('commits all forward transitions, history, three notifications and immutable payment together', async () => {
  const f = await fixture();
  for (const [version, target] of [
    'ACCEPTED',
    'PREPARING',
    'READY_FOR_PICKUP',
    'COMPLETED',
  ].entries())
    await service.transition(
      f.staff,
      f.tenant.id,
      f.order.id,
      action(target, version),
    );
  expect(
    (await service.detail(f.owner, f.tenant.id, f.order.id)).fulfillmentStatus,
  ).toBe('COMPLETED');
  expect(
    await p.fulfillmentHistory.count({ where: { orderId: f.order.id } }),
  ).toBe(4);
  expect(
    await p.checkoutNotification.count({
      where: { orderId: f.order.id, kind: 'fulfillment' },
    }),
  ).toBe(3);
  expect(
    (await p.payment.findUniqueOrThrow({ where: { orderId: f.order.id } }))
      .status,
  ).toBe('SUCCEEDED');
  expect((await service.overview(f.owner, f.tenant.id)).completedToday).toBe(1);
});
it('makes duplicate transitions idempotent including concurrent requests', async () => {
  const f = await fixture(),
    input = action();
  const results = await Promise.all([
    service.transition(f.owner, f.tenant.id, f.order.id, input),
    service.transition(f.owner, f.tenant.id, f.order.id, input),
  ]);
  expect(results[0].id).toBe(results[1].id);
  expect(
    await p.fulfillmentHistory.count({ where: { orderId: f.order.id } }),
  ).toBe(1);
  expect(
    await p.checkoutNotification.count({
      where: { orderId: f.order.id, kind: 'fulfillment' },
    }),
  ).toBe(1);
});
it('rejects invalid transitions and conflicting concurrent revisions', async () => {
  const f = await fixture();
  await expect(
    service.transition(f.owner, f.tenant.id, f.order.id, action('COMPLETED')),
  ).rejects.toMatchObject({ code: 'invalid_transition' });
  const results = await Promise.allSettled([
    service.transition(f.owner, f.tenant.id, f.order.id, action()),
    service.transition(f.staff, f.tenant.id, f.order.id, action()),
  ]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
});
it('rejects mismatched idempotency reuse and direct invalid database transitions', async () => {
  const f = await fixture(),
    input = action();
  await service.transition(f.owner, f.tenant.id, f.order.id, input);
  await expect(
    service.transition(f.owner, f.tenant.id, f.order.id, {
      ...input,
      target: 'PREPARING',
    }),
  ).rejects.toMatchObject({ code: 'idempotency_conflict' });
  await expect(
    p.order.update({
      where: { id: f.order.id },
      data: { fulfillmentStatus: 'COMPLETED', fulfillmentVersion: 2 },
    }),
  ).rejects.toThrow();
});
it('restricts paid review to owners and preserves payment and capacity', async () => {
  const f = await fixture();
  await expect(
    service.transition(f.staff, f.tenant.id, f.order.id, {
      ...action('REQUIRES_REVIEW'),
      reason: 'Test operational issue',
    }),
  ).rejects.toMatchObject({ status: 403 });
  await service.transition(f.owner, f.tenant.id, f.order.id, {
    ...action('REQUIRES_REVIEW'),
    reason: 'Test operational issue',
  });
  expect(
    (await p.payment.findUniqueOrThrow({ where: { orderId: f.order.id } }))
      .status,
  ).toBe('SUCCEEDED');
  expect(
    (await p.pickupSlot.findUniqueOrThrow({ where: { id: f.slot.id } }))
      .reservedCount,
  ).toBe(1);
});
it('enforces staff availability permission and owner-only menu prices/settings', async () => {
  const f = await fixture();
  await expect(
    service.mutateMenu(
      f.staff,
      f.tenant.id,
      f.menu.id,
      {
        updatedAt: f.menu.updatedAt.toISOString(),
        data: { isAvailable: false },
      },
      true,
    ),
  ).rejects.toMatchObject({ status: 403 });
  await p.tenantUser.update({
    where: {
      tenantId_authUserId: { tenantId: f.tenant.id, authUserId: f.staff },
    },
    data: { canManageAvailability: true },
  });
  expect(
    (
      await service.mutateMenu(
        f.staff,
        f.tenant.id,
        f.menu.id,
        {
          updatedAt: f.menu.updatedAt.toISOString(),
          data: { isAvailable: false },
        },
        true,
      )
    ).isAvailable,
  ).toBe(false);
  await expect(
    service.mutateMenu(f.staff, f.tenant.id, f.menu.id, { data: { price: 1 } }),
  ).rejects.toMatchObject({ status: 403 });
  await expect(service.settings(f.staff, f.tenant.id)).rejects.toMatchObject({
    status: 403,
  });
});
it('validates menu prices, tenant ownership and stale edits while preserving snapshots', async () => {
  const f = await fixture(),
    b = await fixture();
  await expect(
    service.mutateMenu(f.owner, f.tenant.id, f.menu.id, {
      updatedAt: f.menu.updatedAt.toISOString(),
      data: { price: -1 },
    }),
  ).rejects.toThrow();
  await expect(
    service.mutateMenu(f.owner, f.tenant.id, f.menu.id, {
      updatedAt: f.menu.updatedAt.toISOString(),
      data: { categoryId: b.category.id },
    }),
  ).rejects.toThrow();
  await service.mutateMenu(f.owner, f.tenant.id, f.menu.id, {
    updatedAt: f.menu.updatedAt.toISOString(),
    data: { price: 25000 },
  });
  await expect(
    service.mutateMenu(f.owner, f.tenant.id, f.menu.id, {
      updatedAt: f.menu.updatedAt.toISOString(),
      data: { price: 26000 },
    }),
  ).rejects.toMatchObject({ status: 409 });
  expect(
    (await service.detail(f.owner, f.tenant.id, f.order.id)).items[0]
      ?.unitPrice,
  ).toBe(20000);
});
it('adds catalog entries, orders categories, and audits safe updates', async () => {
  const f = await fixture();
  await service.category(f.owner, f.tenant.id, null, {
    name: 'Minuman',
    sortOrder: 1,
  });
  const row = await service.mutateMenu(f.owner, f.tenant.id, null, {
    data: { name: 'Test tea', categoryId: f.category.id, price: 5000 },
  });
  expect(
    (await service.menu(f.owner, f.tenant.id, { search: 'tea' })).items[0]?.id,
  ).toBe(row.id);
  expect(await p.tenantAudit.count({ where: { tenantId: f.tenant.id } })).toBe(
    2,
  );
});
it('blocks reserved slot closure and capacity reduction below effective reservations', async () => {
  const f = await fixture();
  const slot = await p.pickupSlot.findUniqueOrThrow({
    where: { id: f.slot.id },
  });
  await expect(
    service.updateSlot(f.owner, f.tenant.id, slot.id, {
      capacity: 2,
      isAvailable: false,
      updatedAt: slot.updatedAt.toISOString(),
    }),
  ).rejects.toMatchObject({ code: 'unsafe_slot_change' });
  await p.pickupSlot.update({ where: { id: slot.id }, data: { capacity: 1 } });
  await expect(
    p.pickupSlot.update({ where: { id: slot.id }, data: { capacity: 0 } }),
  ).rejects.toThrow();
});
it('displays effective held/confirmed capacity and safely increases future capacity', async () => {
  const f = await fixture();
  const view = await service.pickup(f.owner, f.tenant.id, {
    date: '2026-10-21',
  });
  const slot = view.items.find((s) => s.id === f.slot.id)!;
  expect(slot).toMatchObject({ confirmed: 1, held: 0, remaining: 1 });
  await service.updateSlot(f.owner, f.tenant.id, slot.id, {
    capacity: 3,
    isAvailable: true,
    updatedAt: slot.updatedAt.toISOString(),
  });
  expect(
    (await p.pickupSlot.findUniqueOrThrow({ where: { id: slot.id } })).capacity,
  ).toBe(3);
});
it('blocks operating-hour edits that invalidate confirmed pickup and rolls back all changes', async () => {
  const f = await fixture();
  const hours = await p.tenantOperatingHour.findUniqueOrThrow({
    where: { tenantId_dayOfWeek: { tenantId: f.tenant.id, dayOfWeek: 3 } },
  });
  await expect(
    service.updateHours(f.owner, f.tenant.id, {
      dayOfWeek: 3,
      opensAt: 420,
      closesAt: 600,
      isClosed: false,
      updatedAt: hours.updatedAt.toISOString(),
    }),
  ).rejects.toMatchObject({ code: 'reserved_schedule_conflict' });
  expect(
    (await p.tenantOperatingHour.findUniqueOrThrow({ where: { id: hours.id } }))
      .closesAt,
  ).toBe(1080);
});
it('closes conflicting empty slots and generates new valid slots without overwriting reservations', async () => {
  const f = await fixture();
  const empty = await p.pickupSlot.create({
    data: {
      tenantId: f.tenant.id,
      startsAt: new Date('2026-10-21T10:00:00Z'),
      endsAt: new Date('2026-10-21T10:30:00Z'),
      capacity: 2,
    },
  });
  const h = await p.tenantOperatingHour.findUniqueOrThrow({
    where: { tenantId_dayOfWeek: { tenantId: f.tenant.id, dayOfWeek: 3 } },
  });
  await service.updateHours(f.owner, f.tenant.id, {
    dayOfWeek: 3,
    opensAt: 420,
    closesAt: 960,
    isClosed: false,
    updatedAt: h.updatedAt.toISOString(),
  });
  expect(
    (await p.pickupSlot.findUniqueOrThrow({ where: { id: empty.id } }))
      .isAvailable,
  ).toBe(false);
  expect(
    (await p.pickupSlot.findUniqueOrThrow({ where: { id: f.slot.id } }))
      .reservedCount,
  ).toBe(1);
});
it('serializes competing slot edits and keeps capacity reservations intact', async () => {
  const f = await fixture();
  const slot = await p.pickupSlot.findUniqueOrThrow({
    where: { id: f.slot.id },
  });
  const body = {
    capacity: 3,
    isAvailable: true,
    updatedAt: slot.updatedAt.toISOString(),
  };
  const result = await Promise.allSettled([
    service.updateSlot(f.owner, f.tenant.id, slot.id, body),
    service.updateSlot(f.owner, f.tenant.id, slot.id, { ...body, capacity: 4 }),
  ]);
  expect(result.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(
    (await p.pickupSlot.findUniqueOrThrow({ where: { id: slot.id } }))
      .reservedCount,
  ).toBe(1);
});
it('preserves held capacity when payment is still uncertain', async () => {
  const f = await fixture(false);
  const view = await service.pickup(f.owner, f.tenant.id, {
    date: '2026-10-21',
  });
  expect(view.items.find((s) => s.id === f.slot.id)).toMatchObject({
    held: 1,
    confirmed: 0,
    remaining: 1,
  });
});
it('delivers provider-independent fulfillment messages without payment gateway configuration', async () => {
  const f = await fixture();
  await service.transition(f.owner, f.tenant.id, f.order.id, action());
  const adapter = createMockAdapter([f.identity.providerUserId], {
    receive: async () => {},
    delivery: async () => {},
    warn: () => {},
  });
  adapter.accountId = () => f.identity.accountId;
  await adapter.start();
  const worker = createCheckoutWorker(
    p,
    undefined,
    undefined,
    () => adapter,
    () => {},
    now,
  );
  await worker.tick();
  expect(
    (
      await p.checkoutNotification.findFirstOrThrow({
        where: { orderId: f.order.id, kind: 'fulfillment' },
      })
    ).state,
  ).toBe('sent');
  await worker.stop();
  await adapter.stop();
});
it('Fastify authorizes authenticated tenant reads and rejects cross-tenant mutations', async () => {
  const f = await fixture(),
    b = await fixture();
  const app = Fastify();
  registerDashboardRoutes(app, service, async (token) =>
    token === 'owner' ? f.owner : null,
  );
  const response = await app.inject({
    url: '/orders',
    headers: { authorization: 'Bearer owner', 'x-tenant-id': f.tenant.id },
  });
  expect(response.statusCode).toBe(200);
  expect(response.json().data.items[0].id).toBe(f.order.id);
  const denied = await app.inject({
    url: `/menu/${b.menu.id}/availability`,
    method: 'PATCH',
    headers: { authorization: 'Bearer owner', 'x-tenant-id': b.tenant.id },
    payload: {
      data: { isAvailable: false },
      updatedAt: b.menu.updatedAt.toISOString(),
    },
  });
  expect(denied.statusCode).toBe(403);
  await app.close();
});
it('keeps committed fulfillment after ambiguous delivery and never automatically resends', async () => {
  const f = await fixture();
  await service.transition(f.owner, f.tenant.id, f.order.id, action());
  const adapter = createMockAdapter([f.identity.providerUserId], {
    receive: async () => {},
    delivery: async () => {},
    warn: () => {},
  });
  adapter.accountId = () => f.identity.accountId;
  let sends = 0;
  adapter.sendText = async () => {
    sends++;
    throw new Error('Transport interrupted');
  };
  await adapter.start();
  const worker = createCheckoutWorker(
    p,
    undefined,
    undefined,
    () => adapter,
    () => {},
    now,
  );
  await worker.tick();
  await worker.tick();
  expect(sends).toBe(1);
  expect(
    (
      await p.checkoutNotification.findFirstOrThrow({
        where: { orderId: f.order.id, kind: 'fulfillment' },
      })
    ).state,
  ).toBe('uncertain');
  expect(
    (await service.detail(f.owner, f.tenant.id, f.order.id)).fulfillmentStatus,
  ).toBe('ACCEPTED');
  await worker.stop();
  await adapter.stop();
});
it('concurrent capacity reduction and checkout never overbook the slot', async () => {
  const f = await fixture(false);
  const customer = await p.customer.create({ data: {} });
  customers.push(customer.id);
  const identity = await p.customerMessagingIdentity.create({
    data: {
      customerId: customer.id,
      provider: 'mock',
      accountId: `dashboard-${randomUUID()}`,
      providerUserId: '628123456789',
      identifierType: 'mock-user',
    },
  });
  const session = await p.conversationSession.create({
    data: { messagingIdentityId: identity.id, stateData: {} },
  });
  const scope = { customerId: customer.id, sessionId: session.id };
  const carts = new CartService(p);
  await carts.getOrCreateActiveCart(scope, f.tenant.id);
  await carts.addItem(scope, f.menu.id, 1, 20000);
  const ready = await carts.markCartReady(scope);
  const slot = await p.pickupSlot.findUniqueOrThrow({
    where: { id: f.slot.id },
  });
  const results = await Promise.allSettled([
    service.updateSlot(f.owner, f.tenant.id, slot.id, {
      capacity: 1,
      isAvailable: true,
      updatedAt: slot.updatedAt.toISOString(),
    }),
    new OrderService(p, config, now).createFromCart(scope, {
      cartId: ready.cart.id,
      revision: ready.cart.revision,
      slotId: slot.id,
      eventId: randomUUID(),
    }),
  ]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  const final = await p.pickupSlot.findUniqueOrThrow({
    where: { id: slot.id },
  });
  expect(final.reservedCount).toBeLessThanOrEqual(final.capacity);
});
it('verified mock settlement initializes the tenant fulfillment queue through the existing payment service', async () => {
  const f = await fixture(false);
  const { PaymentService } =
    await import('../../src/modules/checkout/payments.js');
  const { createMockGateway } =
    await import('../../src/modules/checkout/gateway.js');
  const payments = new PaymentService(
    p,
    config,
    createMockGateway(p, now),
    now,
  );
  await p.payment.update({
    where: { orderId: f.order.id },
    data: { availableAt: now() },
  });
  await payments.tick();
  const payment = await p.payment.findUniqueOrThrow({
    where: { orderId: f.order.id },
  });
  await p.mockPaymentTransaction.update({
    where: { paymentId: payment.id },
    data: { status: 'settlement' },
  });
  await p.payment.update({
    where: { id: payment.id },
    data: { availableAt: now() },
  });
  await payments.tick();
  expect(
    (await service.orders(f.owner, f.tenant.id, {})).items[0],
  ).toMatchObject({
    id: f.order.id,
    status: 'CONFIRMED',
    fulfillmentStatus: 'NEW',
    payment: { status: 'SUCCEEDED' },
  });
});
