import { ConversationEngine } from '../../src/modules/conversation/engine.js';
import { parseCommand } from '../../src/modules/conversation/commands.js';
import { randomUUID, createHash } from 'node:crypto';
import { afterAll, afterEach, expect, it, vi } from 'vitest';
import { createDatabase } from '@beelicious/database';
import { CartService } from '../../src/modules/cart/service.js';
import { OrderService } from '../../src/modules/checkout/orders.js';
import { PickupSlotService } from '../../src/modules/checkout/pickup.js';
import {
  PaymentService,
  registerPaymentWebhook,
} from '../../src/modules/checkout/payments.js';
import {
  createMockGateway,
  createMidtransGateway,
  GatewayError,
  type GatewayStatus,
} from '../../src/modules/checkout/gateway.js';
import { parseCheckout } from '../../src/modules/checkout/config.js';
import {
  createCheckoutWorker,
  MOCK_IMAGE,
} from '../../src/modules/checkout/notifications.js';
import { createMockAdapter } from '../../src/modules/messaging/providers/mock.js';
import { checkoutTransition } from '../../src/modules/conversation/checkout-flow.js';
import {
  initialData,
  type Context,
} from '../../src/modules/conversation/flow.js';
import { MessagingError } from '../../src/modules/messaging/types.js';
import Fastify from 'fastify';
const dev = new URL(process.env.DATABASE_URL || '');
const url = new URL(process.env.WHATSAPP_TEST_DATABASE_URL || dev.toString());
if (!process.env.WHATSAPP_TEST_DATABASE_URL) url.pathname += '_test';
if (
  !url.pathname.endsWith('_test') ||
  (url.host === dev.host && url.pathname === dev.pathname)
)
  throw new Error('Separate _test database required');
const db = createDatabase(url.toString());
const p = db.prisma;
const tenants: string[] = [];
const customers: string[] = [];
const events: string[] = [];
let time = new Date('2026-10-20T02:00:00Z');
const now = () => time;
const config = parseCheckout({
  CHECKOUT_ENABLED: 'true',
  CONVERSATION_ENABLED: 'true',
  NODE_ENV: 'development',
})!;
afterEach(async () => {
  const owned = { customerId: { in: customers } };
  await p.checkoutNotification.deleteMany({ where: { order: owned } });
  await p.paymentEvent.deleteMany({ where: { payment: { order: owned } } });
  await p.mockPaymentTransaction.deleteMany({
    where: { payment: { order: owned } },
  });
  await p.payment.deleteMany({ where: { order: owned } });
  await p.pickupReservation.deleteMany({ where: { order: owned } });
  await p.orderItem.deleteMany({ where: { order: owned } });
  await p.order.deleteMany({ where: owned });
  await p.cartItem.deleteMany({ where: { cart: owned } });
  await p.cart.deleteMany({ where: owned });
  await p.conversationTurn.deleteMany({ where: { eventId: { in: events } } });
  await p.whatsAppEvent.deleteMany({ where: { id: { in: events } } });
  events.length = 0;
  await p.conversationSession.deleteMany({ where: { identity: owned } });
  await p.customerMessagingIdentity.deleteMany({ where: owned });
  await p.customer.deleteMany({ where: { id: { in: customers } } });
  await p.pickupSlot.deleteMany({ where: { tenantId: { in: tenants } } });
  await p.tenantOperatingHour.deleteMany({
    where: { tenantId: { in: tenants } },
  });
  await p.menuItem.deleteMany({ where: { tenantId: { in: tenants } } });
  await p.menuCategory.deleteMany({ where: { tenantId: { in: tenants } } });
  await p.tenant.deleteMany({ where: { id: { in: tenants } } });
  tenants.length = 0;
  customers.length = 0;
  time = new Date('2026-10-20T02:00:00Z');
});
afterAll(() => db.disconnect());
async function fixture(existingTenant?: string) {
  const customer = await p.customer.create({ data: {} });
  customers.push(customer.id);
  const identity = await p.customerMessagingIdentity.create({
    data: {
      customerId: customer.id,
      provider: 'mock',
      accountId: `checkout-${randomUUID()}`,
      providerUserId: `628${Math.floor(Math.random() * 1e10)}`,
      identifierType: 'mock-user',
    },
  });
  const session = await p.conversationSession.create({
    data: { messagingIdentityId: identity.id, stateData: initialData() },
  });
  const tenant = existingTenant
    ? await p.tenant.findUniqueOrThrow({ where: { id: existingTenant } })
    : await p.tenant.create({
        data: { name: 'Checkout fixture', slug: `checkout-${randomUUID()}` },
      });
  if (!existingTenant) {
    tenants.push(tenant.id);
    await p.tenantOperatingHour.createMany({
      data: Array.from({ length: 7 }, (_, dayOfWeek) => ({
        tenantId: tenant.id,
        dayOfWeek,
        opensAt: 420,
        closesAt: 1080,
      })),
    });
  }
  const category = await p.menuCategory.create({
    data: { tenantId: tenant.id, name: 'Food' },
  });
  const menu = await p.menuItem.create({
    data: {
      tenantId: tenant.id,
      categoryId: category.id,
      name: 'Rice',
      price: 20000,
    },
  });
  const scope = { customerId: customer.id, sessionId: session.id };
  const carts = new CartService(p);
  await carts.getOrCreateActiveCart(scope, tenant.id);
  await carts.addItem(scope, menu.id, 2, 20000);
  const ready = await carts.markCartReady(scope);
  const slot = await p.pickupSlot.upsert({
    where: {
      tenantId_startsAt_endsAt: {
        tenantId: tenant.id,
        startsAt: new Date('2026-10-20T04:00:00Z'),
        endsAt: new Date('2026-10-20T04:30:00Z'),
      },
    },
    create: {
      tenantId: tenant.id,
      startsAt: new Date('2026-10-20T04:00:00Z'),
      endsAt: new Date('2026-10-20T04:30:00Z'),
      capacity: 1,
    },
    update: {},
  });
  const orders = new OrderService(p, config, now);
  const input = {
    cartId: ready.cart.id,
    revision: ready.cart.revision,
    slotId: slot.id,
    eventId: randomUUID(),
  };
  return {
    customer,
    identity,
    session,
    tenant,
    category,
    menu,
    scope,
    carts,
    slot,
    orders,
    input,
  };
}
async function initiated() {
  const f = await fixture();
  const order = await f.orders.createFromCart(f.scope, f.input);
  const gateway = createMockGateway(p, now);
  const payments = new PaymentService(p, config, gateway, now);
  await payments.tick();
  return { ...f, order, gateway, payments };
}
it('checks out once, freezes source cart, snapshots item prices, and survives service restart', async () => {
  const f = await fixture();
  const [a, b] = await Promise.all([
    f.orders.createFromCart(f.scope, f.input),
    f.orders.createFromCart(f.scope, f.input),
  ]);
  expect(a.id).toBe(b.id);
  expect(a.items[0]).toMatchObject({
    nameSnapshot: 'Rice',
    quantity: 2,
    unitPrice: 20000,
    lineSubtotal: 40000,
  });
  expect(
    (await p.cart.findUniqueOrThrow({ where: { id: f.input.cartId } })).status,
  ).toBe('CHECKED_OUT');
  await p.menuItem.update({
    where: { id: f.menu.id },
    data: { price: 30000, name: 'New' },
  });
  expect(
    (await new OrderService(p, config, now).current(f.scope))?.items[0]
      ?.unitPrice,
  ).toBe(20000);
  await expect(
    f.carts.getOrCreateActiveCart(f.scope, f.tenant.id),
  ).rejects.toThrow();
  await expect(
    p.orderItem.update({
      where: { id: a.items[0]!.id },
      data: { unitPrice: 1 },
    }),
  ).rejects.toThrow();
  await expect(
    p.cartItem.updateMany({
      where: { cartId: f.input.cartId },
      data: { quantity: 3 },
    }),
  ).rejects.toThrow();
});
it('concurrent checkouts cannot oversell the last slot', async () => {
  const a = await fixture();
  const b = await fixture(a.tenant.id);
  const results = await Promise.allSettled([
    a.orders.createFromCart(a.scope, a.input),
    b.orders.createFromCart(b.scope, b.input),
  ]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(
    await p.pickupReservation.count({
      where: { pickupSlotId: a.slot.id, status: 'HELD' },
    }),
  ).toBe(1);
  expect(
    (await p.pickupSlot.findUniqueOrThrow({ where: { id: a.slot.id } }))
      .reservedCount,
  ).toBe(1);
});
it.each([
  'price',
  'unavailable',
  'category',
  'tenant',
  'empty',
  'ownership',
  'cross_tenant',
  'past',
  'closed',
  'outside',
] as const)(
  'rejects invalid checkout: %s without partial writes',
  async (reason) => {
    const f = await fixture();
    if (reason === 'price')
      await p.menuItem.update({
        where: { id: f.menu.id },
        data: { price: 25000 },
      });
    if (reason === 'unavailable')
      await p.menuItem.update({
        where: { id: f.menu.id },
        data: { isAvailable: false },
      });
    if (reason === 'category')
      await p.menuCategory.update({
        where: { id: f.category.id },
        data: { isActive: false },
      });
    if (reason === 'tenant')
      await p.tenant.update({
        where: { id: f.tenant.id },
        data: { isActive: false },
      });
    if (reason === 'empty')
      await p.cartItem.deleteMany({ where: { cartId: f.input.cartId } });
    if (reason === 'ownership') f.scope.customerId = randomUUID();
    if (reason === 'cross_tenant') {
      const other = await fixture();
      f.input.slotId = other.slot.id;
    }
    if (reason === 'past')
      await p.pickupSlot.update({
        where: { id: f.slot.id },
        data: {
          startsAt: new Date('2026-10-19T04:00:00Z'),
          endsAt: new Date('2026-10-19T04:30:00Z'),
        },
      });
    if (reason === 'closed')
      await p.pickupSlot.update({
        where: { id: f.slot.id },
        data: { isAvailable: false },
      });
    if (reason === 'outside')
      await p.tenantOperatingHour.updateMany({
        where: { tenantId: f.tenant.id },
        data: { opensAt: 720, closesAt: 1080 },
      });
    await expect(f.orders.createFromCart(f.scope, f.input)).rejects.toThrow();
    expect(
      await p.order.count({ where: { sourceCartId: f.input.cartId } }),
    ).toBe(0);
  },
);
it('generates deterministic future slots, respects closed days and validates database intervals', async () => {
  const f = await fixture();
  const service = new PickupSlotService(p, config, now);
  await service.generateSlots(f.tenant.id);
  const count = await p.pickupSlot.count({ where: { tenantId: f.tenant.id } });
  await service.generateSlots(f.tenant.id);
  expect(await p.pickupSlot.count({ where: { tenantId: f.tenant.id } })).toBe(
    count,
  );
  const slots = await service.listAvailable(f.tenant.id);
  expect(slots.length).toBeGreaterThan(0);
  expect(
    slots.every((s) => s.startsAt.getTime() >= time.getTime() + 3600000),
  ).toBe(true);
  await p.tenantOperatingHour.updateMany({
    where: { tenantId: f.tenant.id },
    data: { isClosed: true },
  });
  expect(await service.listAvailable(f.tenant.id)).toHaveLength(0);
  await expect(
    p.tenantOperatingHour.updateMany({
      where: { tenantId: f.tenant.id },
      data: { closesAt: 1 },
    }),
  ).rejects.toThrow();
});
it('settlement atomically confirms order/reservation and creates one logical notification', async () => {
  const f = await initiated();
  expect((await f.orders.current(f.scope))?.payment?.status).toBe('PENDING');
  await p.mockPaymentTransaction.update({
    where: { paymentId: f.order.payment!.id },
    data: { status: 'settlement' },
  });
  await f.payments.request(f.scope, true);
  await f.payments.tick();
  const order = await f.orders.current(f.scope);
  expect(order?.status).toBe('CONFIRMED');
  expect(order?.reservation?.status).toBe('CONFIRMED');
  expect(order?.payment?.status).toBe('SUCCEEDED');
  expect(
    await p.checkoutNotification.count({
      where: { logicalKey: `settlement:${f.order.id}` },
    }),
  ).toBe(1);
  await f.payments.request(f.scope);
  await f.payments.tick();
  expect(
    await p.checkoutNotification.count({
      where: { logicalKey: `settlement:${f.order.id}` },
    }),
  ).toBe(1);
});
it.each(['cancel', 'expire', 'deny'] as const)(
  'releases capacity only after verified %s and copies into a fresh editable cart',
  async (status) => {
    const f = await initiated();
    if (status === 'cancel') await f.payments.request(f.scope, true);
    else {
      await p.mockPaymentTransaction.update({
        where: { paymentId: f.order.payment!.id },
        data: { status },
      });
      time = new Date(time.getTime() + 31000);
      await f.payments.request(f.scope);
    }
    await f.payments.tick();
    const order = await f.orders.current(f.scope);
    expect(['CANCELLED', 'EXPIRED']).toContain(order?.status);
    expect(order?.reservation?.status).toBe('RELEASED');
    expect(
      (await p.pickupSlot.findUniqueOrThrow({ where: { id: f.slot.id } }))
        .reservedCount,
    ).toBe(0);
    const cart = await f.orders.copyToNewCart(f.scope, f.order.id);
    expect(cart.id).not.toBe(f.input.cartId);
    expect(cart.status).toBe('ACTIVE');
  },
);
it('retains an overdue reservation while gateway status is uncertain', async () => {
  const f = await initiated();
  time = new Date(time.getTime() + 20 * 60000);
  const broken = {
    ...f.gateway,
    getPaymentStatus: vi
      .fn()
      .mockRejectedValue(new GatewayError('unavailable')),
  };
  await new PaymentService(p, config, broken, now).tick();
  expect((await f.orders.current(f.scope))?.reservation?.status).toBe('HELD');
  expect((await f.orders.current(f.scope))?.status).toBe('PENDING_PAYMENT');
});
it.each(['expired', 'amount_mismatch', 'already_paid'] as const)(
  'reconciles Midtrans 407 expiration safely: %s',
  async (scenario) => {
    const f = await fixture();
    const c = {
      ...config,
      provider: 'midtrans' as const,
      merchantId: 'M-expiry',
      serverKey: 'SB-test',
    };
    const orders = new OrderService(p, c, now);
    const order = await orders.createFromCart(f.scope, f.input);
    let status = 'pending';
    const transport = vi.fn<typeof fetch>().mockImplementation(async () =>
      Response.json({
        status_code: status === 'expire' ? '407' : '200',
        transaction_status: status,
        order_id: order.payment!.providerOrderId,
        transaction_id: 'expiry-transaction',
        merchant_id: c.merchantId,
        gross_amount:
          status === 'expire' && scenario === 'amount_mismatch'
            ? '1.00'
            : '40000.00',
        currency: 'IDR',
        payment_type: 'qris',
      }),
    );
    const gateway = createMidtransGateway(c, transport);
    const payments = new PaymentService(p, c, gateway, now);
    await payments.tick();
    if (scenario === 'already_paid') {
      status = 'settlement';
      time = new Date(time.getTime() + 61000);
      await payments.tick();
    } else {
      await payments.request(f.scope, true);
    }
    status = 'expire';
    time = new Date(time.getTime() + 16 * 60000);
    // Reconcile twice to cover repeated provider evidence without repeated side effects.
    for (let i = 0; i < 2; i++) {
      const token = randomUUID();
      const claimed = await p.payment.update({
        where: { orderId: order.id },
        data: {
          availableAt: time,
          ...(scenario === 'already_paid'
            ? {
                leaseToken: token,
                leaseUntil: new Date(time.getTime() + 60000),
              }
            : {}),
        },
      });
      if (scenario === 'already_paid')
        await payments.apply(
          claimed,
          token,
          await gateway.getPaymentStatus(claimed.providerOrderId),
        );
      else await payments.tick();
    }
    const current = await orders.current(f.scope);
    expect(current?.payment?.status).toBe(
      scenario === 'already_paid'
        ? 'SUCCEEDED'
        : scenario === 'amount_mismatch'
          ? 'REQUIRES_REVIEW'
          : 'EXPIRED',
    );
    expect(current?.status).toBe(
      scenario === 'already_paid'
        ? 'CONFIRMED'
        : scenario === 'amount_mismatch'
          ? 'REQUIRES_REVIEW'
          : 'EXPIRED',
    );
    expect(current?.reservation?.status).toBe(
      scenario === 'already_paid'
        ? 'CONFIRMED'
        : scenario === 'amount_mismatch'
          ? 'HELD'
          : 'RELEASED',
    );
    expect(
      (await p.pickupSlot.findUniqueOrThrow({ where: { id: f.slot.id } }))
        .reservedCount,
    ).toBe(scenario === 'expired' ? 0 : 1);
    expect(
      transport.mock.calls.filter(([, options]) => options?.method === 'POST'),
    ).toHaveLength(1);
    if (scenario === 'expired') {
      const reply = await checkoutTransition(
        {
          state: 'AWAITING_PAYMENT',
          selectedTenantId: f.tenant.id,
          selectedCategoryId: null,
          selectedMenuItemId: null,
          data: initialData(),
        },
        { kind: 'check' },
        {
          tx: p,
          config: c,
          scope: f.scope,
          eventId: randomUUID(),
          now,
          maxQuantity: 20,
        },
      );
      expect(reply?.context.state).toBe('PAYMENT_UNSUCCESSFUL');
      expect(reply?.text).toContain('Salin Pilihan ke Keranjang Baru');
      expect((await orders.copyToNewCart(f.scope, order.id)).status).toBe(
        'ACTIVE',
      );
      expect(
        await p.paymentEvent.count({
          where: { paymentId: order.payment!.id, eventType: 'expire' },
        }),
      ).toBe(1);
    }
  },
);
it('ambiguous charge is reconciled after restart without invoking creation twice', async () => {
  const f = await fixture();
  const o = await f.orders.createFromCart(f.scope, f.input);
  const gateway = createMockGateway(p, now);
  const create = vi.fn(
    async (...args: Parameters<typeof gateway.createPayment>) => {
      await gateway.createPayment(...args);
      throw new GatewayError('unavailable');
    },
  );
  await new PaymentService(
    p,
    config,
    { ...gateway, createPayment: create },
    now,
  ).tick();
  time = new Date(time.getTime() + 61000);
  await new PaymentService(
    p,
    config,
    { ...gateway, createPayment: create },
    now,
  ).tick();
  expect(create).toHaveBeenCalledTimes(1);
  expect(
    (await p.payment.findUniqueOrThrow({ where: { orderId: o.id } })).status,
  ).toBe('PENDING');
});
it('late settlement preserves success but requires review after release', async () => {
  const f = await initiated();
  await f.payments.request(f.scope, true);
  await f.payments.tick();
  await p.mockPaymentTransaction.update({
    where: { paymentId: f.order.payment!.id },
    data: { status: 'settlement' },
  });
  await p.payment.update({
    where: { id: f.order.payment!.id },
    data: { status: 'REQUIRES_REVIEW', availableAt: time },
  });
  await f.payments.tick();
  const order = await f.orders.current(f.scope);
  expect(order?.payment?.status).toBe('SUCCEEDED');
  expect(order?.status).toBe('REQUIRES_REVIEW');
  expect(order?.reservation?.status).toBe('RELEASED');
});
it.each(['amount', 'unknown', 'transaction'] as const)(
  'flags inconsistent provider evidence: %s',
  async (kind) => {
    const f = await initiated();
    time = new Date(time.getTime() + 61000);
    const original = await f.gateway.getPaymentStatus(
      f.order.payment!.providerOrderId,
    );
    const status: GatewayStatus = {
      ...original,
      ...(kind === 'amount'
        ? { amount: 1 }
        : kind === 'transaction'
          ? { transactionId: 'different' }
          : { status: 'strange' }),
    };
    await new PaymentService(
      p,
      config,
      { ...f.gateway, getPaymentStatus: async () => status },
      now,
    ).tick();
    expect((await f.orders.current(f.scope))?.status).toBe('REQUIRES_REVIEW');
    expect((await f.orders.current(f.scope))?.reservation?.status).toBe('HELD');
  },
);
it('delivers mock instructions once and does not retry ambiguous WhatsApp sends', async () => {
  const f = await initiated();
  const adapter = createMockAdapter([f.identity.providerUserId], {
    receive: async () => {},
    delivery: async () => {},
    warn: () => {},
  });
  adapter.accountId = () => f.identity.accountId;
  await adapter.start();
  const worker = createCheckoutWorker(
    p,
    f.payments,
    config,
    () => adapter,
    () => {},
    now,
  );
  await worker.tick();
  await worker.tick();
  expect(adapter.images).toHaveLength(1);
  await f.payments.request(f.scope, false, 'resend-event');
  adapter.sendImage = vi
    .fn()
    .mockRejectedValue(new MessagingError('uncertain'));
  await worker.tick();
  await worker.tick();
  expect(adapter.sendImage).toHaveBeenCalledTimes(1);
  expect(
    await p.checkoutNotification.count({
      where: { orderId: f.order.id, state: 'uncertain' },
    }),
  ).toBe(1);
  await worker.stop();
});
it('drives pickup/confirmation/awaiting states and safe CEK/BATAL through transaction-compatible flow', async () => {
  const f = await fixture();
  const deps = {
    tx: p,
    config,
    scope: f.scope,
    eventId: randomUUID(),
    now,
    maxQuantity: 20,
  };
  const start: Context = {
    state: 'CART_READY',
    selectedTenantId: f.tenant.id,
    selectedCategoryId: null,
    selectedMenuItemId: null,
    data: initialData(),
  };
  const a = await checkoutTransition(start, { kind: 'select', value: 2 }, deps);
  expect(a?.context.state).toBe('SELECT_PICKUP');
  const b = await checkoutTransition(
    a!.context,
    { kind: 'select', value: 1 },
    deps,
  );
  expect(b?.context.state).toBe('CONFIRM_CHECKOUT');
  const c = await checkoutTransition(
    b!.context,
    { kind: 'select', value: 1 },
    deps,
  );
  expect(c?.context.state).toBe('AWAITING_PAYMENT');
  const check = await checkoutTransition(c!.context, { kind: 'check' }, deps);
  expect(check?.text).toContain('Menyiapkan pembayaran');
  await checkoutTransition(c!.context, { kind: 'cancel' }, deps);
  expect((await f.orders.current(f.scope))?.payment?.cancelRequested).toBe(
    true,
  );
});
it('webhook rejects invalid signatures and durably deduplicates valid notifications before authenticated reconciliation', async () => {
  const base = await fixture();
  const c = {
    ...config,
    provider: 'midtrans' as const,
    merchantId: 'M-test',
    serverKey: 'SB-secret',
  };
  const f = {
    ...base,
    order: await new OrderService(p, c, now).createFromCart(
      base.scope,
      base.input,
    ),
  };
  const app = Fastify();
  registerPaymentWebhook(app, p, c);
  const v = {
    order_id: f.order.payment!.providerOrderId,
    status_code: '200',
    gross_amount: '40000.00',
    transaction_id: 'tx',
    merchant_id: 'M-test',
    payment_type: 'qris',
    transaction_status: 'settlement',
    currency: 'IDR',
    signature_key: '',
  };
  expect(
    (
      await app.inject({
        method: 'POST',
        url: '/webhooks/midtrans',
        payload: v,
      })
    ).statusCode,
  ).toBe(401);
  v.signature_key = createHash('sha512')
    .update(v.order_id + v.status_code + v.gross_amount + 'SB-secret')
    .digest('hex');
  for (let i = 0; i < 2; i++)
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/webhooks/midtrans',
          payload: v,
        })
      ).statusCode,
    ).toBe(200);
  expect(
    await p.paymentEvent.count({
      where: {
        paymentId: f.order.payment!.id,
        provider: 'midtrans',
        processingStatus: 'pending',
      },
    }),
  ).toBe(1);
  expect((await f.orders.current(f.scope))?.status).toBe('PENDING_PAYMENT');
  await app.close();
});

it('atomically deduplicates checkout through the persisted ConversationEngine across restarts', async () => {
  const f = await fixture();
  await p.conversationSession.update({
    where: { id: f.session.id },
    data: { state: 'CART_READY', selectedTenantId: f.tenant.id },
  });
  async function send(text: string) {
    const input = {
      version: 1 as const,
      provider: 'mock' as const,
      accountId: f.identity.accountId,
      senderId: f.identity.providerUserId,
      command: parseCommand(text),
    };
    const token = randomUUID();
    const e = await p.whatsAppEvent.create({
      data: {
        dedupKey: randomUUID(),
        kind: 'message',
        processingMode: 'conversation',
        streamKey: createHash('sha256')
          .update(
            JSON.stringify([
              'mock',
              f.identity.accountId,
              f.identity.providerUserId,
            ]),
          )
          .digest('hex'),
        state: 'processing',
        leaseToken: token,
        leaseUntil: new Date(time.getTime() + 60000),
        data: { conversation: input, chatId: f.identity.providerUserId },
      },
    });
    events.push(e.id);
    const engine = new ConversationEngine(p, now, 20, config);
    const response = await engine.handleIncomingMessage(e.id, token, input);
    return {
      response,
      repeat: () =>
        new ConversationEngine(p, now, 20, config).handleIncomingMessage(
          e.id,
          token,
          input,
        ),
    };
  }
  expect((await send('2')).response).toContain('Pilih Waktu Pickup');
  expect((await send('1')).response).toContain('Konfirmasi Pesanan');
  const confirmed = await send('1');
  expect(confirmed.response).toContain('tersimpan');
  expect(await confirmed.repeat()).toBe(confirmed.response);
  expect(await p.order.count({ where: { sessionId: f.session.id } })).toBe(1);
  expect(
    await p.payment.count({ where: { order: { sessionId: f.session.id } } }),
  ).toBe(1);
  expect(
    (
      await p.conversationSession.findUniqueOrThrow({
        where: { id: f.session.id },
      })
    ).state,
  ).toBe('AWAITING_PAYMENT');
});
it('rolls checkout and capacity back when the enclosing conversation transaction fails', async () => {
  const f = await fixture();
  await expect(
    p.$transaction(async (tx) => {
      await new OrderService(tx, config, now).createFromCart(f.scope, f.input);
      throw new Error('Injected failure before response intent');
    }),
  ).rejects.toThrow('Injected failure');
  expect(await p.order.count({ where: { sourceCartId: f.input.cartId } })).toBe(
    0,
  );
  expect(
    (await p.pickupSlot.findUniqueOrThrow({ where: { id: f.slot.id } }))
      .reservedCount,
  ).toBe(0);
  expect((await f.carts.getCart(f.scope))?.status).toBe('READY');
});
it('late historical settlement remains recorded while another checkout is already pending', async () => {
  const f = await initiated();
  await f.payments.request(f.scope, true);
  await f.payments.tick();
  await f.orders.copyToNewCart(f.scope, f.order.id);
  const ready = await f.carts.markCartReady(f.scope);
  const newer = await f.orders.createFromCart(f.scope, {
    ...f.input,
    cartId: ready.cart.id,
    revision: ready.cart.revision,
    eventId: randomUUID(),
  });
  expect(newer.status).toBe('PENDING_PAYMENT');
  await p.mockPaymentTransaction.update({
    where: { paymentId: f.order.payment!.id },
    data: { status: 'settlement' },
  });
  await p.payment.update({
    where: { id: f.order.payment!.id },
    data: { availableAt: time },
  });
  await f.payments.tick();
  await f.payments.tick();
  expect((await f.orders.get(f.scope, f.order.id))?.status).toBe(
    'REQUIRES_REVIEW',
  );
  expect((await f.orders.get(f.scope, f.order.id))?.payment?.status).toBe(
    'SUCCEEDED',
  );
});

it('image retrieval failure preserves the payment, retries only before sending, and queues text recovery', async () => {
  const base = await fixture();
  const c = { ...config, provider: 'midtrans' as const, merchantId: 'M-test' };
  const order = await new OrderService(p, c, now).createFromCart(
    base.scope,
    base.input,
  );
  const status: GatewayStatus = {
    reference: order.payment!.providerOrderId,
    transactionId: 'tx-image',
    merchantId: 'M-test',
    amount: 40000,
    currency: 'IDR',
    paymentType: 'qris',
    status: 'pending',
    qrCodeUrl: 'https://api.sandbox.midtrans.com/v2/qris/abc/qr-code',
  };
  const gateway = {
    createPayment: async () => status,
    getPaymentStatus: async () => status,
    cancelPayment: async () => status,
    getPaymentInstructions: () => ({ simulated: false }),
  };
  const payments = new PaymentService(p, c, gateway, now);
  await payments.tick();
  const f = { ...base, order, payments };
  const adapter = createMockAdapter([f.identity.providerUserId], {
    receive: async () => {},
    delivery: async () => {},
    warn: () => {},
  });
  adapter.accountId = () => f.identity.accountId;
  await adapter.start();
  const loader = vi.fn().mockRejectedValue(new GatewayError('unavailable'));
  // Exercise actual remote-image failure path without changing the immutable payment provider.
  const worker = createCheckoutWorker(
    p,
    f.payments,
    c,
    () => adapter,
    () => {},
    now,
    loader,
  );
  await p.payment.update({
    where: { id: f.order.payment!.id },
    data: { qrCodeUrl: 'https://api.sandbox.midtrans.com/v2/qris/abc/qr-code' },
  });
  for (let i = 0; i < 3; i++) {
    await worker.tick();
    time = new Date(time.getTime() + 31000);
  }
  expect(adapter.images).toHaveLength(0);
  expect(loader).toHaveBeenCalledTimes(3);
  expect((await f.orders.current(f.scope))?.payment?.status).toBe('PENDING');
  expect(
    await p.checkoutNotification.count({
      where: {
        orderId: f.order.id,
        logicalKey: { startsWith: 'image-fallback:' },
      },
    }),
  ).toBe(1);
  await worker.tick();
  expect(
    adapter.outgoing.some((m) => m.text.includes('Gambar pembayaran')),
  ).toBe(true);
  await worker.stop();
});
it('checks expected amounts and currency at database level and isolates customer reads', async () => {
  const f = await initiated();
  await expect(
    p.payment.update({
      where: { id: f.order.payment!.id },
      data: { amount: 1 },
    }),
  ).rejects.toThrow();
  await expect(
    p.order.update({ where: { id: f.order.id }, data: { totalAmount: 1 } }),
  ).rejects.toThrow();
  const other = await fixture();
  expect(await f.orders.get(other.scope, f.order.id)).toBeNull();
  await expect(f.orders.createFromCart(other.scope, f.input)).rejects.toThrow();
});
it('database guard rejects direct overselling and overdue holds are only scheduled for reconciliation', async () => {
  const a = await initiated();
  const b = await fixture(a.tenant.id);
  const second = await p.order.create({
    data: {
      orderNumber: `direct-${randomUUID()}`,
      customerId: b.customer.id,
      messagingIdentityId: b.identity.id,
      sessionId: b.session.id,
      tenantId: b.tenant.id,
      tenantName: b.tenant.name,
      sourceCartId: b.input.cartId,
      chatId: b.identity.providerUserId,
      confirmationEventId: randomUUID(),
      pickupSlotId: a.slot.id,
      subtotal: 40000,
      totalAmount: 40000,
    },
  });
  await expect(
    p.pickupReservation.create({
      data: {
        orderId: second.id,
        tenantId: b.tenant.id,
        pickupSlotId: a.slot.id,
        expiresAt: time,
      },
    }),
  ).rejects.toThrow();
  expect(
    (await p.pickupSlot.findUniqueOrThrow({ where: { id: a.slot.id } }))
      .reservedCount,
  ).toBe(1);
  const pickup = new PickupSlotService(p, config, now);
  await expect(
    p.$transaction((tx) => pickup.releaseReservation(tx, a.order.id)),
  ).rejects.toThrow();
  time = new Date(time.getTime() + 16 * 60000);
  await pickup.handleExpiredHolds();
  expect(
    (
      await p.pickupReservation.findUniqueOrThrow({
        where: { orderId: a.order.id },
      })
    ).status,
  ).toBe('HELD');
});
it('cancels before initiation without invoking a gateway and never regresses successful payment', async () => {
  const f = await fixture();
  const order = await f.orders.createFromCart(f.scope, f.input);
  const gateway = createMockGateway(p, now);
  const create = vi.spyOn(gateway, 'createPayment');
  const payments = new PaymentService(p, config, gateway, now);
  await payments.request(f.scope, true);
  await payments.tick();
  expect(create).not.toHaveBeenCalled();
  expect((await f.orders.current(f.scope))?.reservation?.status).toBe(
    'RELEASED',
  );
  expect(
    (await p.payment.findUniqueOrThrow({ where: { orderId: order.id } }))
      .status,
  ).toBe('CANCELLED');
});
it('payment success remains committed when confirmation delivery is ambiguous', async () => {
  const f = await initiated();
  await p.mockPaymentTransaction.update({
    where: { paymentId: f.order.payment!.id },
    data: { status: 'settlement' },
  });
  time = new Date(time.getTime() + 61000);
  await f.payments.tick();
  const adapter = createMockAdapter([f.identity.providerUserId], {
    receive: async () => {},
    delivery: async () => {},
    warn: () => {},
  });
  adapter.accountId = () => f.identity.accountId;
  await adapter.start();
  adapter.sendText = vi.fn().mockRejectedValue(new MessagingError('uncertain'));
  const worker = createCheckoutWorker(
    p,
    f.payments,
    config,
    () => adapter,
    () => {},
    now,
  );
  await worker.tick();
  await worker.tick();
  await worker.tick();
  expect((await f.orders.current(f.scope))?.status).toBe('CONFIRMED');
  expect(adapter.sendText).toHaveBeenCalledTimes(1);
  await expect(
    p.payment.update({
      where: { id: f.order.payment!.id },
      data: { status: 'EXPIRED' },
    }),
  ).rejects.toThrow();
  await worker.stop();
});
it('copies terminal checkout through conversation and refreshes changed prices before pickup', async () => {
  const f = await initiated();
  await f.payments.request(f.scope, true);
  await f.payments.tick();
  const deps = {
    tx: p,
    config,
    scope: f.scope,
    eventId: randomUUID(),
    now,
    maxQuantity: 20,
  };
  const context: Context = {
    state: 'PAYMENT_UNSUCCESSFUL',
    selectedTenantId: f.tenant.id,
    selectedCategoryId: null,
    selectedMenuItemId: null,
    data: initialData(),
  };
  const copied = await checkoutTransition(
    context,
    { kind: 'select', value: 1 },
    deps,
  );
  expect(copied?.context.state).toBe('CART_REVIEW');
  const ready = await f.carts.markCartReady(f.scope);
  await p.menuItem.update({ where: { id: f.menu.id }, data: { price: 25000 } });
  const checkout = await checkoutTransition(
    { ...copied!.context, state: 'CART_READY' },
    { kind: 'select', value: 2 },
    deps,
  );
  expect(checkout?.text).toContain('harga berubah');
  expect((await f.carts.getCart(f.scope))?.id).toBe(ready.cart.id);
});
it('shares natural Midtrans copy across QR delivery, resend, CEK, help, and verified settlement', async () => {
  const f = await fixture();
  const c = { ...config, provider: 'midtrans' as const, merchantId: 'M-copy' };
  const order = await new OrderService(p, c, now).createFromCart(
    f.scope,
    f.input,
  );
  let status: GatewayStatus = {
    reference: order.payment!.providerOrderId,
    transactionId: 'copy-transaction',
    merchantId: 'M-copy',
    amount: 40000,
    currency: 'IDR',
    paymentType: 'qris',
    status: 'pending',
    qrCodeUrl:
      'https://api.sandbox.midtrans.com/v2/qris/copy-transaction/qr-code',
  };
  const gateway = {
    createPayment: async () => status,
    getPaymentStatus: async () => status,
    cancelPayment: async () => status,
    getPaymentInstructions: () => ({ simulated: false }),
  };
  const payments = new PaymentService(p, c, gateway, now);
  await payments.tick();
  const deps = {
    tx: p,
    config: c,
    scope: f.scope,
    eventId: randomUUID(),
    now,
    maxQuantity: 20,
  };
  const context: Context = {
    state: 'AWAITING_PAYMENT',
    selectedTenantId: f.tenant.id,
    selectedCategoryId: null,
    selectedMenuItemId: null,
    data: initialData(),
  };
  await checkoutTransition(context, { kind: 'resend' }, deps);
  const messages = await p.checkoutNotification.findMany({
    where: { orderId: order.id, kind: 'qr' },
  });
  expect(messages).toHaveLength(2);
  expect(messages[0]!.text).toBe(messages[1]!.text);
  expect(messages[0]!.text).toContain('*Pembayaran QRIS*');
  const adapter = createMockAdapter([f.identity.providerUserId], {
    receive: async () => {},
    delivery: async () => {},
    warn: () => {},
  });
  adapter.accountId = () => f.identity.accountId;
  await adapter.start();
  const worker = createCheckoutWorker(
    p,
    payments,
    c,
    () => adapter,
    () => {},
    now,
    async () => MOCK_IMAGE,
  );
  try {
    await worker.tick();
    await worker.tick();
    expect(adapter.images).toHaveLength(2);
    for (const image of adapter.images) {
      expect(image.caption).toContain(
        `Link QR untuk simulator:\n${status.qrCodeUrl}`,
      );
      expect(image.caption.length).toBeLessThanOrEqual(1024);
    }
    expect(adapter.images[0]!.caption).toBe(adapter.images[1]!.caption);
  } finally {
    await worker.stop();
    await adapter.stop();
  }
  const check = await checkoutTransition(context, { kind: 'check' }, deps);
  const help = await checkoutTransition(context, { kind: 'help' }, deps);
  expect(check?.text).toContain('Menunggu pembayaran');
  for (const text of [messages[0]!.text, check!.text, help!.text])
    expect(text).not.toMatch(/sandbox|simulasi|PENDING|INITIATING/i);
  status = { ...status, status: 'settlement' };
  time = new Date(time.getTime() + 61000);
  await payments.tick();
  const confirmed = await p.checkoutNotification.findUniqueOrThrow({
    where: { logicalKey: `settlement:${order.id}` },
  });
  expect(confirmed.text).toContain('Pembayaran terverifikasi');
  expect(confirmed.text).not.toMatch(/sandbox|simulasi|CONFIRMED/);
  expect((await f.orders.current(f.scope))?.payment?.status).toBe('SUCCEEDED');
});

async function sendCheckoutCommand(
  f: Awaited<ReturnType<typeof fixture>>,
  text: string,
  active = config,
) {
  const input = {
    version: 1 as const,
    provider: 'mock' as const,
    accountId: f.identity.accountId,
    senderId: f.identity.providerUserId,
    command: parseCommand(text),
  };
  const token = randomUUID();
  const event = await p.whatsAppEvent.create({
    data: {
      dedupKey: randomUUID(),
      kind: 'message',
      processingMode: 'conversation',
      streamKey: createHash('sha256')
        .update(
          JSON.stringify([
            'mock',
            f.identity.accountId,
            f.identity.providerUserId,
          ]),
        )
        .digest('hex'),
      state: 'processing',
      leaseToken: token,
      leaseUntil: new Date(time.getTime() + 60000),
      data: { conversation: input, chatId: f.identity.providerUserId },
    },
  });
  events.push(event.id);
  const response = await new ConversationEngine(
    p,
    now,
    20,
    active,
  ).handleIncomingMessage(event.id, token, input);
  const session = await p.conversationSession.findUniqueOrThrow({
    where: { id: f.session.id },
  });
  return { response, session };
}
it.each(['mock_to_midtrans', 'midtrans_to_mock', 'merchant_changed'] as const)(
  'keeps unmatched payment read-only for %s without scheduling the wrong gateway',
  async (change) => {
    const f = await fixture();
    const source =
      change === 'mock_to_midtrans'
        ? config
        : { ...config, provider: 'midtrans' as const, merchantId: 'M-old' };
    const active =
      change === 'midtrans_to_mock'
        ? config
        : { ...config, provider: 'midtrans' as const, merchantId: 'M-new' };
    const order = await new OrderService(p, source, now).createFromCart(
      f.scope,
      f.input,
    );
    await p.payment.update({
      where: { id: order.payment!.id },
      data: { status: 'PENDING', creationStarted: true },
    });
    const before = await p.payment.findUniqueOrThrow({
      where: { orderId: order.id },
    });
    const context: Context = {
      state: 'AWAITING_PAYMENT',
      selectedTenantId: f.tenant.id,
      selectedCategoryId: null,
      selectedMenuItemId: null,
      data: initialData(),
    };
    const deps = {
      tx: p,
      config: active,
      scope: f.scope,
      eventId: randomUUID(),
      now,
      maxQuantity: 20,
    };
    for (const kind of ['check', 'cancel', 'resend', 'help'] as const) {
      const result = await checkoutTransition(context, { kind }, deps);
      expect(result?.text).toContain('konfigurasi layanan saat ini');
      expect(result?.text).not.toMatch(
        /Menunggu pembayaran|Permintaan pembatalan tersimpan/,
      );
    }
    expect(
      await p.payment.findUniqueOrThrow({ where: { orderId: order.id } }),
    ).toEqual(before);
    expect(
      await p.checkoutNotification.count({ where: { orderId: order.id } }),
    ).toBe(0);
    const call = vi
      .fn()
      .mockRejectedValue(new Error('Unexpected gateway invocation'));
    const service = new PaymentService(
      p,
      active,
      {
        createPayment: call,
        getPaymentStatus: call,
        cancelPayment: call,
        getPaymentInstructions: () => ({ simulated: false }),
      },
      now,
    );
    await expect(service.request(f.scope, true, 'resend')).rejects.toThrow();
    await service.tick();
    expect(call).not.toHaveBeenCalled();
    expect((await f.orders.current(f.scope))?.reservation?.status).toBe('HELD');
  },
);
it.each(['pending', 'provider_changed', 'review'] as const)(
  'permits persisted catalog navigation while %s and blocks additions/new checkout',
  async (kind) => {
    const f = await initiated();
    const active =
      kind === 'provider_changed'
        ? { ...config, provider: 'midtrans' as const, merchantId: 'M-other' }
        : config;
    if (kind === 'review')
      await p.order.update({
        where: { id: f.order.id },
        data: { status: 'REQUIRES_REVIEW', reviewReason: 'test' },
      });
    await p.conversationSession.update({
      where: { id: f.session.id },
      data: { state: 'AWAITING_PAYMENT', selectedTenantId: f.tenant.id },
    });
    let result = await sendCheckoutCommand(f, 'Menu', active);
    expect(result.session.state).toBe('SELECT_TENANT');
    for (let pages = 0; pages < 30; pages++) {
      const options = (result.session.stateData as { options: string[] })
        .options;
      const index = options.indexOf(f.tenant.id);
      result = await sendCheckoutCommand(
        f,
        index < 0 ? '9' : String(index + 1),
        active,
      );
      if (index >= 0) break;
    }
    expect(result.session.state).toBe('SELECT_CATEGORY');
    result = await sendCheckoutCommand(f, '1', active);
    expect(result.session.state).toBe('SELECT_MENU');
    result = await sendCheckoutCommand(f, '1', active);
    expect(result.session.state).toBe('VIEW_MENU_ITEM');
    result = await sendCheckoutCommand(f, '1', active);
    expect(result.session.state).toBe('VIEW_MENU_ITEM');
    expect(result.response).toContain('Selesaikan pembayaran sebelumnya');
    result = await sendCheckoutCommand(f, '0', active);
    expect(result.session.state).toBe('SELECT_MENU');
    result = await sendCheckoutCommand(f, 'Kembali', active);
    expect(result.session.state).toBe('SELECT_CATEGORY');
    await expect(
      f.carts.getOrCreateActiveCart(f.scope, f.tenant.id),
    ).rejects.toThrow();
    await expect(
      f.orders.createFromCart(f.scope, {
        ...f.input,
        cartId: randomUUID(),
        eventId: randomUUID(),
      }),
    ).rejects.toThrow();
    expect(await p.order.count({ where: { sessionId: f.session.id } })).toBe(1);
    expect(
      (await p.cart.findUniqueOrThrow({ where: { id: f.input.cartId } }))
        .status,
    ).toBe('CHECKED_OUT');
    expect((await f.orders.current(f.scope))?.reservation?.status).toBe('HELD');
  },
);
it('keeps an overdue payment unverified and does not enqueue an unusable QR', async () => {
  const f = await initiated();
  time = new Date(time.getTime() + 16 * 60000);
  const initial = await p.checkoutNotification.count({
    where: { orderId: f.order.id, kind: 'qr' },
  });
  for (const text of ['CEK', 'Kirim Ulang QR']) {
    const result = await sendCheckoutCommand(f, text);
    expect(result.response).toContain(
      'Batas pembayaran telah lewat. Status pembayaran belum terverifikasi.',
    );
    expect(result.response).not.toContain('Kirim Ulang QR');
  }
  expect((await sendCheckoutCommand(f, 'Bantuan')).response).not.toContain(
    'Kirim Ulang QR',
  );
  expect(
    await p.checkoutNotification.count({
      where: { orderId: f.order.id, kind: 'qr' },
    }),
  ).toBe(initial);
  expect((await f.orders.current(f.scope))?.payment?.status).toBe('PENDING');
  expect((await f.orders.current(f.scope))?.reservation?.status).toBe('HELD');
});
it('suppresses QR resends while cancellation is pending and resumes checkout after verified cancellation', async () => {
  const f = await initiated();
  const result = await sendCheckoutCommand(f, 'BATAL');
  expect(result.response).toContain('Pembatalan sedang diverifikasi');
  await sendCheckoutCommand(f, 'Kirim Ulang QR');
  await f.payments.request(f.scope, false, 'blocked-resend');
  expect(
    await p.checkoutNotification.count({
      where: { orderId: f.order.id, kind: 'qr' },
    }),
  ).toBe(1);
  await f.payments.tick();
  expect((await f.orders.current(f.scope))?.reservation?.status).toBe(
    'RELEASED',
  );
  expect((await sendCheckoutCommand(f, 'CEK')).session.state).toBe(
    'PAYMENT_UNSUCCESSFUL',
  );
  expect((await sendCheckoutCommand(f, '1')).session.state).toBe('CART_REVIEW');
  const ready = await f.carts.markCartReady(f.scope);
  const newer = await f.orders.createFromCart(f.scope, {
    ...f.input,
    cartId: ready.cart.id,
    revision: ready.cart.revision,
    eventId: randomUUID(),
  });
  expect(newer.id).not.toBe(f.order.id);
  expect(newer.status).toBe('PENDING_PAYMENT');
});
