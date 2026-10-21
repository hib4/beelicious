// Isolated browser-test API. Production buildApp has no test login routes or bypasses.
import { randomUUID } from 'node:crypto';
import { createDatabase } from '@beelicious/database';
import { buildApp } from '../../../api/src/app.js';
import { CartService } from '../../../api/src/modules/cart/service.js';
import { OrderService } from '../../../api/src/modules/checkout/orders.js';
import { parseCheckout } from '../../../api/src/modules/checkout/config.js';
if (process.env.BEELICIOUS_DASHBOARD_E2E !== 'true')
  throw new Error('Explicit E2E harness required');
const dev = new URL(process.env.DATABASE_URL || '');
const target = new URL(
  process.env.WHATSAPP_TEST_DATABASE_URL || dev.toString(),
);
if (!process.env.WHATSAPP_TEST_DATABASE_URL) target.pathname += '_test';
if (
  !target.pathname.endsWith('_test') ||
  (target.host === dev.host && target.pathname === dev.pathname)
)
  throw new Error('Separate test database required');
const db = createDatabase(target.toString()),
  p = db.prisma;
const tenantId = '88888888-8888-4888-8888-888888888888';
const otherTenant = '99999999-9999-4999-8999-999999999999';
const owner = '11111111-1111-4111-8111-111111111111',
  staff = '22222222-2222-4222-8222-222222222222';
const owned = { tenantId: { in: [tenantId, otherTenant] } };
const customers: string[] = [];
async function cleanup() {
  const rows = await p.order.findMany({
    where: owned,
    select: { customerId: true },
  });
  const customerIds = [...customers, ...rows.map((r) => r.customerId)];
  await p.tenantAudit.deleteMany({ where: owned });
  await p.fulfillmentHistory.deleteMany({ where: owned });
  await p.checkoutNotification.deleteMany({ where: { order: owned } });
  await p.paymentEvent.deleteMany({ where: { payment: { order: owned } } });
  await p.mockPaymentTransaction.deleteMany({
    where: { payment: { order: owned } },
  });
  await p.payment.deleteMany({ where: { order: owned } });
  await p.pickupReservation.deleteMany({ where: owned });
  await p.orderItem.deleteMany({ where: owned });
  await p.order.deleteMany({ where: owned });
  await p.cartItem.deleteMany({ where: owned });
  await p.cart.deleteMany({ where: owned });
  await p.conversationSession.deleteMany({
    where: { identity: { customerId: { in: customerIds } } },
  });
  await p.customerMessagingIdentity.deleteMany({
    where: { customerId: { in: customerIds } },
  });
  await p.customer.deleteMany({ where: { id: { in: customerIds } } });
  await p.pickupSlot.deleteMany({ where: owned });
  await p.tenantOperatingHour.deleteMany({ where: owned });
  await p.menuItem.deleteMany({ where: owned });
  await p.menuCategory.deleteMany({ where: owned });
  await p.tenantUser.deleteMany({ where: owned });
  await p.tenant.deleteMany({ where: { id: { in: [tenantId, otherTenant] } } });
}
await cleanup();
const now = () => new Date();
const config = parseCheckout({
  CHECKOUT_ENABLED: 'true',
  CONVERSATION_ENABLED: 'true',
  NODE_ENV: 'development',
})!;
for (const [index, tid] of [tenantId, otherTenant].entries()) {
  await p.tenant.create({
    data: {
      id: tid,
      name: index ? 'Tenant Kedua' : 'Warung Babe — Data Uji',
      slug: `dashboard-e2e-${tid}`,
    },
  });
  await p.tenantUser.createMany({
    data: [
      { tenantId: tid, authUserId: owner, role: 'OWNER' },
      ...(index
        ? []
        : [
            {
              tenantId: tid,
              authUserId: staff,
              role: 'STAFF' as const,
              canManageAvailability: true,
            },
          ]),
    ],
  });
  await p.tenantOperatingHour.createMany({
    data: Array.from({ length: 7 }, (_, dayOfWeek) => ({
      tenantId: tid,
      dayOfWeek,
      opensAt: 0,
      closesAt: 1440,
    })),
  });
  const category = await p.menuCategory.create({
    data: { tenantId: tid, name: 'Makanan' },
  });
  const item = await p.menuItem.create({
    data: {
      tenantId: tid,
      categoryId: category.id,
      name: 'Nasi Uji',
      price: 20000,
    },
  });
  const customer = await p.customer.create({
    data: { displayName: 'Pelanggan Uji' },
  });
  customers.push(customer.id);
  const identity = await p.customerMessagingIdentity.create({
    data: {
      customerId: customer.id,
      provider: 'mock',
      accountId: `dashboard-e2e-${tid}`,
      providerUserId: `628${Math.floor(Math.random() * 1e10)}`,
      identifierType: 'mock-user',
    },
  });
  const session = await p.conversationSession.create({
    data: { messagingIdentityId: identity.id, stateData: {} },
  });
  const scope = { customerId: customer.id, sessionId: session.id };
  const carts = new CartService(p);
  await carts.getOrCreateActiveCart(scope, tid);
  await carts.addItem(scope, item.id, 2, 20000);
  const ready = await carts.markCartReady(scope);
  const startsAt = new Date(Date.now() + 86400000);
  startsAt.setUTCHours(5, 0, 0, 0);
  const slot = await p.pickupSlot.create({
    data: {
      tenantId: tid,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 1800000),
      capacity: 5,
    },
  });
  const order = await new OrderService(p, config, now).createFromCart(scope, {
    cartId: ready.cart.id,
    revision: ready.cart.revision,
    slotId: slot.id,
    eventId: randomUUID(),
  });
  await p.payment.update({
    where: { orderId: order.id },
    data: { status: 'SUCCEEDED', paidAt: now() },
  });
  await p.order.update({
    where: { id: order.id },
    data: { status: 'CONFIRMED', fulfillmentStatus: 'NEW', confirmedAt: now() },
  });
  await p.pickupReservation.update({
    where: { orderId: order.id },
    data: { status: 'CONFIRMED' },
  });
}
const app = buildApp(
  {
    NODE_ENV: 'test',
    DATABASE_URL: target.toString(),
    HOST: '127.0.0.1',
    PORT: 3104,
    dashboard: {
      url: 'https://auth.example.test',
      key: 'test-publishable-key',
    },
  },
  db,
  {
    identityVerifier: async (token) => {
      try {
        const body = JSON.parse(
          Buffer.from(token.split('.')[1]!, 'base64url').toString(),
        );
        return body.exp * 1000 > Date.now() && [owner, staff].includes(body.sub)
          ? body.sub
          : null;
      } catch {
        return null;
      }
    },
  },
);
let closing = false;
async function stop() {
  if (closing) return;
  closing = true;
  await app.close();
  process.exit(0);
}
// Cleanup before disconnect: the application owns this pool.
app.addHook('onClose', async () => {
  await cleanup();
});
process.on('SIGTERM', () => {
  void stop();
});
process.on('SIGINT', () => {
  void stop();
});
await app.listen({ port: 3104, host: '127.0.0.1' });
