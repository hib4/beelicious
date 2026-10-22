import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import { OrderService } from '../../src/modules/checkout/orders.js';
import { parseCheckout } from '../../src/modules/checkout/config.js';
import { preparationDiagnostic } from '../../src/modules/conversation/diagnostics.js';
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, expect, it, vi } from 'vitest';
import { createDatabase, Prisma, type EventScope } from '@beelicious/database';
import { CartService, type CartScope } from '../../src/modules/cart/service.js';
import { CustomerService } from '../../src/modules/customers/service.js';
import { ConversationEngine } from '../../src/modules/conversation/engine.js';
import { initialData } from '../../src/modules/conversation/flow.js';
import {
  incomingEvents,
  storedIncomingSchema,
} from '../../src/modules/messaging/inbox.js';
import {
  createInboxWorker,
  type Worker,
} from '../../src/modules/messaging/worker.js';
import { createMockAdapter } from '../../src/modules/messaging/providers/mock.js';
import { incoming, PHONE, callbacksFixture } from '../messaging/fixtures.js';
import { MessagingError } from '../../src/modules/messaging/types.js';

const url = new URL(
  process.env.WHATSAPP_TEST_DATABASE_URL || process.env.DATABASE_URL || '',
);
if (!process.env.WHATSAPP_TEST_DATABASE_URL) url.pathname += '_test';
const dev = new URL(process.env.DATABASE_URL || '');
if (
  !url.pathname.endsWith('_test') ||
  (url.host === dev.host && url.pathname === dev.pathname)
)
  throw new Error('Separate _test database required');
const db = createDatabase(url.toString()),
  client = db.prisma;
const accounts = new Set<string>(),
  tenants = new Set<string>(),
  keys = new Set<string>();
const workers: Worker[] = [];
afterEach(async () => {
  await Promise.all(workers.splice(0).map((w) => w.stop()));
  const identities = await client.customerMessagingIdentity.findMany({
    where: { accountId: { in: [...accounts] } },
  });
  const owned = { identity: { accountId: { in: [...accounts] } } };
  await client.cartItem.deleteMany({ where: { cart: { session: owned } } });
  await client.cart.deleteMany({ where: { session: owned } });
  await client.conversationTurn.deleteMany({ where: { session: owned } });
  await client.conversationSession.deleteMany({ where: owned });
  await client.customerMessagingIdentity.deleteMany({
    where: { id: { in: identities.map((i) => i.id) } },
  });
  await client.customer.deleteMany({
    where: {
      id: { in: identities.map((i) => i.customerId) },
      identities: { none: {} },
    },
  });
  await client.whatsAppEvent.deleteMany({
    where: { dedupKey: { in: [...keys] } },
  });
  await client.menuItem.deleteMany({
    where: { tenantId: { in: [...tenants] } },
  });
  await client.menuCategory.deleteMany({
    where: { tenantId: { in: [...tenants] } },
  });
  await client.tenant.deleteMany({ where: { id: { in: [...tenants] } } });
  accounts.clear();
  tenants.clear();
  keys.clear();
});
afterAll(async () => db.disconnect());
async function catalog() {
  const tenant = await client.tenant.create({
    data: { name: 'Cart fixture', slug: `cart-${randomUUID()}` },
  });
  tenants.add(tenant.id);
  const category = await client.menuCategory.create({
    data: { tenantId: tenant.id, name: 'Fixture category' },
  });
  const item = await client.menuItem.create({
    data: {
      tenantId: tenant.id,
      categoryId: category.id,
      name: 'Fixture meal',
      price: 20000,
    },
  });
  const drink = await client.menuItem.create({
    data: {
      tenantId: tenant.id,
      categoryId: category.id,
      name: 'Fixture drink',
      price: 5000,
    },
  });
  return { tenant, category, item, drink };
}
async function identity(
  provider = 'mock',
  accountId = randomUUID(),
  senderId = PHONE,
) {
  accounts.add(accountId);
  const customer = await new CustomerService(client).register({
    provider,
    accountId,
    providerUserId: senderId,
    identifierType:
      provider === 'mock'
        ? 'mock-user'
        : provider === 'baileys'
          ? 'jid'
          : 'cloud-user',
  });
  const record = await client.customerMessagingIdentity.findUniqueOrThrow({
    where: {
      provider_accountId_providerUserId: {
        provider,
        accountId,
        providerUserId: senderId,
      },
    },
  });
  const session = await client.conversationSession.create({
    data: { messagingIdentityId: record.id, stateData: initialData() },
  });
  return {
    customer,
    record,
    session,
    scope: {
      customerId: customer.id,
      sessionId: session.id,
    } satisfies CartScope,
  };
}
async function fixture(max = 20) {
  const f = { ...(await catalog()), ...(await identity()) };
  const service = new CartService(client, max);
  const cart = await service.getOrCreateActiveCart(f.scope, f.tenant.id);
  return { ...f, service, cart };
}
it('creates/retrieves one scoped cart concurrently and restores it through a new service', async () => {
  const f = { ...(await catalog()), ...(await identity()) },
    service = new CartService(client);
  const carts = await Promise.all([
    service.getOrCreateActiveCart(f.scope, f.tenant.id),
    service.getOrCreateActiveCart(f.scope, f.tenant.id),
  ]);
  expect(carts[0]!.id).toBe(carts[1]!.id);
  expect((await new CartService(client).getCart(f.scope))?.id).toBe(
    carts[0]!.id,
  );
  expect(
    await client.cart.count({ where: { sessionId: f.scope.sessionId } }),
  ).toBe(1);
});
it('adds, merges, updates and removes multiple items with integer totals', async () => {
  const f = await fixture();
  await f.service.addItem(f.scope, f.item.id, 2, 20000);
  await f.service.addItem(f.scope, f.item.id, 1, 20000);
  let r = await f.service.addItem(f.scope, f.drink.id, 2, 5000);
  expect(r.cart.items).toHaveLength(2);
  expect(r.cart.subtotal).toBe(70000);
  const item = r.cart.items.find((i) => i.menuItemId === f.item.id)!;
  r = await f.service.updateItemQuantity(f.scope, item.id, 1);
  expect(r.cart.subtotal).toBe(30000);
  r = await f.service.removeItem(f.scope, item.id);
  expect(r.cart.subtotal).toBe(10000);
  r = await f.service.clearCart(f.scope);
  expect(r.cart.items).toEqual([]);
  expect(r.cart.status).toBe('ACTIVE');
  await expect(f.service.markCartReady(f.scope)).rejects.toMatchObject({
    reason: 'empty',
  });
  await f.service.addItem(f.scope, f.item.id, 1, 20000);
  expect((await f.service.getCartSummary(f.scope))?.subtotal).toBe(20000);
});
it('enforces quantities and the combined configurable cap without partial updates', async () => {
  const f = await fixture(3);
  for (const quantity of [0, -1, 1.2, 4, Number.MAX_SAFE_INTEGER])
    await expect(
      f.service.addItem(f.scope, f.item.id, quantity, 20000),
    ).rejects.toBeDefined();
  await f.service.addItem(f.scope, f.item.id, 2, 20000);
  await expect(
    f.service.addItem(f.scope, f.item.id, 2, 20000),
  ).rejects.toMatchObject({ reason: 'quantity' });
  const cart = (await f.service.getCart(f.scope))!;
  expect(cart.items[0]!.quantity).toBe(2);
  await expect(
    f.service.updateItemQuantity(f.scope, cart.items[0]!.id, 0),
  ).rejects.toMatchObject({ code: 'invalid_input' });
  expect((await f.service.getCart(f.scope))!.subtotal).toBe(40000);
});
it('serializes concurrent additions without losing quantities or creating duplicate lines', async () => {
  const f = await fixture();
  await Promise.all([
    f.service.addItem(f.scope, f.item.id, 2, 20000),
    f.service.addItem(f.scope, f.item.id, 3, 20000),
  ]);
  const cart = (await f.service.getCart(f.scope))!;
  expect(cart.items).toHaveLength(1);
  expect(cart.items[0]!.quantity).toBe(5);
});
it('requires explicit price acknowledgement and refreshes a proposal when pricing changes again', async () => {
  const f = await fixture();
  await f.service.addItem(f.scope, f.item.id, 1, 20000);
  await client.menuItem.update({
    where: { id: f.item.id },
    data: { price: 22000 },
  });
  const first = await f.service.markCartReady(f.scope);
  expect(first.proposal?.changes).toEqual([
    { name: f.item.name, oldPrice: 20000, newPrice: 22000 },
  ]);
  expect(first.cart.subtotal).toBe(20000);
  expect(first.cart.status).toBe('ACTIVE');
  await client.menuItem.update({
    where: { id: f.item.id },
    data: { price: 23000 },
  });
  const second = await f.service.perform(
    f.scope,
    { kind: 'ready' },
    first.proposal!.fingerprint,
  );
  expect(second.proposal?.fingerprint).not.toBe(first.proposal!.fingerprint);
  expect(second.cart.subtotal).toBe(20000);
  const accepted = await f.service.perform(
    f.scope,
    { kind: 'ready' },
    second.proposal!.fingerprint,
  );
  expect(accepted.proposal).toBeUndefined();
  expect(accepted.cart.status).toBe('READY');
  expect(accepted.cart.subtotal).toBe(23000);
  await expect(
    f.service.addItem(f.scope, f.drink.id, 1, 5000),
  ).rejects.toMatchObject({ reason: 'ready' });
  const reopened = await f.service.reopenCart(f.scope);
  expect(reopened.cart.status).toBe('ACTIVE');
  expect(reopened.cart.items).toHaveLength(1);
});
it('confirms changed prompt prices before a first addition and changed saved prices before updates', async () => {
  const f = await fixture();
  const quoted = await f.service.addItem(f.scope, f.item.id, 2, 19000);
  expect(quoted.cart.items).toHaveLength(0);
  expect(quoted.proposal?.subtotal).toBe(40000);
  await f.service.perform(
    f.scope,
    quoted.proposal!.action,
    quoted.proposal!.fingerprint,
  );
  await client.menuItem.update({
    where: { id: f.item.id },
    data: { price: 21000 },
  });
  const cart = (await f.service.getCart(f.scope))!;
  const update = await f.service.updateItemQuantity(
    f.scope,
    cart.items[0]!.id,
    3,
  );
  expect(update.cart.items[0]!.quantity).toBe(2);
  expect(update.proposal?.subtotal).toBe(63000);
  const accepted = await f.service.perform(
    f.scope,
    update.proposal!.action,
    update.proposal!.fingerprint,
  );
  expect(accepted.cart.items[0]!.quantity).toBe(3);
  expect(accepted.cart.subtotal).toBe(63000);
});
it('rejects unavailable menus, categories and tenants while allowing removal and clear', async () => {
  const f = await fixture();
  await f.service.addItem(f.scope, f.item.id, 1, 20000);
  await client.menuItem.update({
    where: { id: f.item.id },
    data: { isAvailable: false },
  });
  await expect(
    f.service.addItem(f.scope, f.item.id, 1, 20000),
  ).rejects.toMatchObject({ reason: 'unavailable' });
  await expect(f.service.markCartReady(f.scope)).rejects.toMatchObject({
    reason: 'unavailable',
  });
  const cart = (await f.service.getCart(f.scope))!;
  expect(cart.items[0]!.available).toBe(false);
  await expect(
    f.service.updateItemQuantity(f.scope, cart.items[0]!.id, 2),
  ).rejects.toMatchObject({ reason: 'unavailable' });
  await f.service.removeItem(f.scope, cart.items[0]!.id);
  await client.menuCategory.update({
    where: { id: f.category.id },
    data: { isActive: false },
  });
  await expect(
    f.service.addItem(f.scope, f.drink.id, 1, 5000),
  ).rejects.toMatchObject({ reason: 'unavailable' });
  await client.tenant.update({
    where: { id: f.tenant.id },
    data: { isActive: false },
  });
  expect((await f.service.clearCart(f.scope)).cart.items).toEqual([]);
});
it('isolates customers, sessions, tenant items and external cart item IDs', async () => {
  const f = await fixture(),
    other = await fixture();
  await f.service.addItem(f.scope, f.item.id, 1, 20000);
  await expect(
    f.service.getCart({ ...f.scope, customerId: other.customer.id }),
  ).rejects.toMatchObject({ reason: 'missing' });
  await expect(
    f.service.addItem(f.scope, other.item.id, 1, 20000),
  ).rejects.toMatchObject({ reason: 'unavailable' });
  await expect(
    f.service.getOrCreateActiveCart(f.scope, other.tenant.id),
  ).rejects.toMatchObject({ reason: 'tenant' });
  const cart = (await f.service.getCart(f.scope))!;
  await expect(
    other.service.removeItem(other.scope, cart.items[0]!.id),
  ).rejects.toMatchObject({ reason: 'missing' });
  expect((await f.service.getCart(f.scope))!.items).toHaveLength(1);
});
it('enforces direct database cart ownership, uniqueness, quantity and tenant constraints', async () => {
  const f = await fixture(),
    other = await fixture();
  const cartData = {
    customerId: f.customer.id,
    messagingIdentityId: f.record.id,
    sessionId: f.scope.sessionId,
    tenantId: f.tenant.id,
  };
  await expect(client.cart.create({ data: cartData })).rejects.toBeDefined();
  await expect(
    client.cart.create({
      data: { ...cartData, customerId: other.customer.id, status: 'ABANDONED' },
    }),
  ).rejects.toBeDefined();
  await expect(
    client.cart.create({
      data: { ...cartData, sessionId: other.session.id, status: 'ABANDONED' },
    }),
  ).rejects.toBeDefined();
  const data = {
    cartId: f.cart.id,
    tenantId: f.tenant.id,
    menuItemId: f.item.id,
    quantity: 1,
    unitPrice: 20000,
  };
  for (const extra of [
    { quantity: 0 },
    { quantity: -1 },
    { unitPrice: -1 },
    { menuItemId: other.item.id },
    { tenantId: other.tenant.id, menuItemId: other.item.id },
  ])
    await expect(
      client.cartItem.create({ data: { ...data, ...extra } }),
    ).rejects.toBeDefined();
  await client.cartItem.create({ data });
  await expect(client.cartItem.create({ data })).rejects.toBeDefined();
  await expect(
    client.customer.delete({ where: { id: f.customer.id } }),
  ).rejects.toBeDefined();
});
it('rolls back cart work in a caller-owned transaction', async () => {
  const f = await fixture();
  await expect(
    client.$transaction(async (tx) => {
      await new CartService(tx, 20, true).addItem(f.scope, f.item.id, 1, 20000);
      throw new Error('rollback fixture');
    }),
  ).rejects.toThrow('rollback fixture');
  expect((await f.service.getCart(f.scope))!.items).toEqual([]);
});

async function conversation() {
  const f = { ...(await catalog()), ...(await identity()) };
  const scope: EventScope = {
    provider: 'mock',
    accountId: f.record.accountId,
    conversationEnabled: true,
  };
  const adapter = createMockAdapter([PHONE], callbacksFixture());
  await adapter.start();
  const engine = new ConversationEngine(client);
  const makeWorker = (handler = engine) => {
    const worker = createInboxWorker(
      db.whatsappEvents,
      adapter,
      {
        enabled: true,
        conversation: handler,
        scope: () => scope,
        decode(data) {
          const p = storedIncomingSchema.safeParse(data);
          return p.success ? p.data : undefined;
        },
      },
      vi.fn(),
    );
    workers.push(worker);
    return worker;
  };
  let worker = makeWorker();
  const events = (text: string) => {
    const batch = incomingEvents(
      [
        incoming({
          provider: 'mock',
          accountId: scope.accountId,
          messageId: randomUUID(),
          timestamp: Date.now(),
          text,
        }),
      ],
      true,
    );
    batch.forEach((e) => keys.add(e.dedupKey));
    return batch;
  };
  const send = async (text: string) => {
    await db.whatsappEvents.receive(events(text));
    await worker.tick();
    return adapter.outgoing.at(-1)!.text;
  };
  const session = () =>
    client.conversationSession.findUniqueOrThrow({
      where: { id: f.scope.sessionId },
    });
  const enterItem = async () => {
    await send('Halo');
    const s = await session();
    let index = s.stateData as { options: string[] };
    const target = index.options.indexOf(f.tenant.id);
    // Other suites/seed tenants can share the test database; choose our mapped fixture.
    let number = target + 1;
    while (!number) {
      await send('9');
      index = (await session()).stateData as { options: string[] };
      number = index.options.indexOf(f.tenant.id) + 1;
    }
    await send(String(number));
    await send('1');
    const menu = (await session()).stateData as { options: string[] };
    await send(String(menu.options.indexOf(f.item.id) + 1));
    await send('1');
  };
  return {
    ...f,
    adapter,
    events,
    send,
    session,
    enterItem,
    service: new CartService(client),
    get worker() {
      return worker;
    },
    restart: async () => {
      await worker.stop();
      worker = makeWorker(new ConversationEngine(client));
    },
  };
}
it('runs quantity, review, edit, remove, READY and reopen conversation states', async () => {
  const f = await conversation();
  await f.enterItem();
  expect((await f.session()).state).toBe('SELECT_QUANTITY');
  for (const input of ['-1', '1.5', '21', 'words']) {
    await f.send(input);
    expect((await f.session()).state).toBe('SELECT_QUANTITY');
  }
  expect(await f.send('2')).toContain('berhasil ditambahkan');
  expect((await f.session()).state).toBe('CART_ACTION');
  expect(await f.send('2')).toContain('Rp40.000');
  expect((await f.session()).state).toBe('CART_REVIEW');
  await f.send('2');
  expect((await f.session()).state).toBe('CART_EDIT_QUANTITY');
  await f.send('1');
  expect((await f.session()).state).toBe('CART_EDIT_QUANTITY_INPUT');
  expect(await f.send('3')).toContain('Rp60.000');
  expect(await f.send('4')).toContain('belum menjadi pesanan');
  expect((await f.session()).state).toBe('CART_READY');
  await f.send('1');
  expect((await f.session()).state).toBe('CART_CONFIRM_REOPEN');
  await f.send('1');
  expect((await f.session()).state).toBe('CART_REVIEW');
  await f.send('3');
  expect((await f.session()).state).toBe('CART_REMOVE_ITEM');
  expect(await f.send('1')).toContain('masih kosong');
  expect((await f.service.getCart(f.scope))?.items).toEqual([]);
});
it('preserves carts across global commands, expiry, restart and navigation', async () => {
  const f = await conversation();
  await f.enterItem();
  await f.send('1');
  await f.send('Bantuan');
  expect((await f.session()).state).toBe('CART_ACTION');
  await f.send('Batal');
  expect((await f.session()).state).toBe('IDLE');
  expect(await f.send('Keranjang')).toContain('Rp20.000');
  await f.send('0');
  expect((await f.session()).state).toBe('SELECT_CATEGORY');
  await f.send('Menu');
  expect((await f.session()).state).toBe('SELECT_TENANT');
  await f.restart();
  expect(await f.send('Keranjang')).toContain('Rp20.000');
  await client.conversationSession.update({
    where: { id: f.scope.sessionId },
    data: { lastInteractionAt: new Date(Date.now() - 31 * 60000) },
  });
  expect(await f.send('1')).toContain('tidak aktif');
  expect((await f.service.getCart(f.scope))!.subtotal).toBe(20000);
});
it('deduplicates a quantity event and serializes later commands without adding twice', async () => {
  const f = await conversation();
  await f.enterItem();
  const batch = f.events('2');
  await Promise.all([
    db.whatsappEvents.receive(batch),
    db.whatsappEvents.receive(batch),
  ]);
  await Promise.all([f.worker.tick(), f.worker.tick()]);
  expect((await f.service.getCart(f.scope))!.items[0]!.quantity).toBe(2);
  expect(
    await client.conversationTurn.count({
      where: { event: { dedupKey: batch[0]!.dedupKey } },
    }),
  ).toBe(1);
  await f.send('Keranjang');
  expect((await f.service.getCart(f.scope))!.subtotal).toBe(40000);
});
it('keeps a committed addition after ambiguous sending and refreshes before another mutation', async () => {
  const f = await conversation();
  await f.enterItem();
  const spy = vi
    .spyOn(f.adapter, 'sendText')
    .mockRejectedValueOnce(new MessagingError('uncertain'));
  await f.send('2');
  spy.mockRestore();
  expect((await f.session()).requiresRefresh).toBe(true);
  expect((await f.service.getCart(f.scope))!.items[0]!.quantity).toBe(2);
  await f.restart();
  expect(await f.send('2')).toContain('Tampilan diperbarui');
  expect((await f.service.getCart(f.scope))!.items[0]!.quantity).toBe(2);
});
it('confirms price changes through the conversation without applying an addition twice', async () => {
  const f = await conversation();
  await f.enterItem();
  await client.menuItem.update({
    where: { id: f.item.id },
    data: { price: 21000 },
  });
  expect(await f.send('2')).toContain('Harga berubah');
  expect((await f.session()).state).toBe('CART_CONFIRM_PRICE');
  expect((await f.service.getCart(f.scope))!.items).toHaveLength(0);
  expect(await f.send('1')).toContain('berhasil ditambahkan');
  expect((await f.service.getCart(f.scope))!.subtotal).toBe(42000);
  await f.send('Keranjang');
  await client.menuItem.update({
    where: { id: f.item.id },
    data: { price: 22000 },
  });
  await f.send('4');
  expect((await f.session()).state).toBe('CART_CONFIRM_PRICE');
  await f.send('0');
  expect((await f.service.getCart(f.scope))!.subtotal).toBe(42000);
  await f.send('4');
  await f.send('1');
  expect((await f.service.getCart(f.scope))!.status).toBe('READY');
});
it('requires confirmation before tenant switching and clearing a nonempty cart', async () => {
  const f = await conversation(),
    other = await catalog();
  await f.enterItem();
  await f.send('1');
  await f.send('Menu');
  let options = (await f.session()).stateData as { options: string[] };
  let n = options.options.indexOf(other.tenant.id) + 1;
  while (!n) {
    await f.send('9');
    options = (await f.session()).stateData as { options: string[] };
    n = options.options.indexOf(other.tenant.id) + 1;
  }
  await f.send(String(n));
  expect((await f.session()).state).toBe('CART_CONFIRM_SWITCH');
  await f.send('2');
  expect((await f.service.getCart(f.scope))!.items).toHaveLength(1);
  await f.send('6');
  expect((await f.session()).state).toBe('CART_CONFIRM_CLEAR');
  await f.send('0');
  expect((await f.service.getCart(f.scope))!.items).toHaveLength(1);
  await f.send('6');
  await f.send('1');
  expect((await f.service.getCart(f.scope))!.items).toEqual([]);
  await f.enterItem();
  await f.send('1');
  await f.send('Menu');
  options = (await f.session()).stateData as { options: string[] };
  n = options.options.indexOf(other.tenant.id) + 1;
  while (!n) {
    await f.send('9');
    options = (await f.session()).stateData as { options: string[] };
    n = options.options.indexOf(other.tenant.id) + 1;
  }
  await f.send(String(n));
  await f.send('1');
  expect((await f.session()).selectedTenantId).toBe(other.tenant.id);
  expect(
    await client.cart.count({
      where: { sessionId: f.scope.sessionId, status: 'ABANDONED' },
    }),
  ).toBe(1);
  expect(await f.service.getCart(f.scope)).toBeNull();
});

it('keeps linked customer identities and provider/account cart namespaces isolated', async () => {
  const f = await fixture();
  await f.service.addItem(f.scope, f.item.id, 1, 20000);
  const accountId = randomUUID();
  accounts.add(accountId);
  for (const [provider, providerUserId, identifierType] of [
    ['baileys', `${PHONE}@s.whatsapp.net`, 'jid'],
    ['baileys', '999888777@lid', 'lid'],
    ['cloud-api', PHONE, 'cloud-user'],
    ['mock', PHONE, 'mock-user'],
  ]) {
    const record = await client.customerMessagingIdentity.create({
      data: {
        customerId: f.customer.id,
        accountId,
        provider: provider!,
        providerUserId: providerUserId!,
        identifierType: identifierType!,
      },
    });
    const session = await client.conversationSession.create({
      data: { messagingIdentityId: record.id, stateData: initialData() },
    });
    const scope = { customerId: f.customer.id, sessionId: session.id };
    expect(await f.service.getCart(scope)).toBeNull();
    const cart = await f.service.getOrCreateActiveCart(scope, f.tenant.id);
    expect(cart.id).not.toBe(f.cart.id);
    expect(cart.items).toEqual([]);
  }
  expect((await f.service.getCart(f.scope))!.subtotal).toBe(20000);
});
it('paginates cart lines and refreshes stale edit mappings without changing another item', async () => {
  const f = await conversation();
  await f.enterItem();
  await f.send('1');
  for (let n = 0; n < 6; n++) {
    const item = await client.menuItem.create({
      data: {
        tenantId: f.tenant.id,
        categoryId: f.category.id,
        name: `Extra ${n}`,
        price: 1000,
      },
    });
    await f.service.addItem(f.scope, item.id, 1, 1000);
  }
  expect(await f.send('Keranjang')).toContain('Halaman 1/2');
  expect(await f.send('9')).toContain('Halaman 2/2');
  await f.send('2');
  const previous = (await f.session()).stateData as { options: string[] };
  const cart = (await f.service.getCart(f.scope))!;
  await f.service.removeItem(f.scope, previous.options[0]!);
  expect(await f.send('1')).toContain('Isi keranjang berubah');
  expect((await f.session()).state).toBe('CART_EDIT_QUANTITY');
  const current = (await f.service.getCart(f.scope))!;
  expect(current.items).toHaveLength(cart.items.length - 1);
  expect(current.items.every((i) => i.quantity === 1)).toBe(true);
});
it('reuses a prepared quantity response after pre-send recovery without repeating the mutation', async () => {
  const f = await conversation();
  await f.enterItem();
  const batch = f.events('3');
  await db.whatsappEvents.receive(batch);
  const scope: EventScope = {
    provider: 'mock',
    accountId: f.record.accountId,
    conversationEnabled: true,
  };
  const claim = (await db.whatsappEvents.claim(
    new Date(),
    'first-prepare',
    scope,
  ))!;
  const input = storedIncomingSchema.parse(claim.data).conversation!;
  const response = await new ConversationEngine(client).handleIncomingMessage(
    claim.id,
    'first-prepare',
    input,
  );
  await db.whatsappEvents.finish(claim.id, 'first-prepare', {
    state: 'pending',
    availableAt: new Date(),
  });
  const retry = (await db.whatsappEvents.claim(
    new Date(),
    'recovered',
    scope,
  ))!;
  expect(
    await new ConversationEngine(client).handleIncomingMessage(
      retry.id,
      'recovered',
      input,
    ),
  ).toBe(response);
  expect((await f.service.getCart(f.scope))!.items[0]!.quantity).toBe(3);
  expect(
    await client.conversationTurn.count({ where: { eventId: claim.id } }),
  ).toBe(1);
  await db.whatsappEvents.finish(retry.id, 'recovered', { state: 'completed' });
});
it('recovers an unavailable quantity selection and preserves a READY cart until explicit reopening', async () => {
  const f = await conversation();
  await f.enterItem();
  await client.menuItem.update({
    where: { id: f.item.id },
    data: { isAvailable: false },
  });
  await f.send('2');
  expect((await f.session()).state).toBe('SELECT_CATEGORY');
  expect(await f.service.getCart(f.scope)).toBeNull();
  await client.menuItem.update({
    where: { id: f.item.id },
    data: { isAvailable: true },
  });
  await f.enterItem();
  await f.send('1');
  await f.send('3');
  expect((await f.session()).state).toBe('CART_READY');
  await f.enterItem();
  expect((await f.session()).state).toBe('CART_CONFIRM_REOPEN');
  await f.send('0');
  expect((await f.service.getCart(f.scope))!.status).toBe('READY');
  await f.send('1');
  await f.send('1');
  expect((await f.service.getCart(f.scope))!.status).toBe('ACTIVE');
});
it('rejects stale clear confirmation after a concurrent cart change', async () => {
  const f = await conversation();
  await f.enterItem();
  await f.send('1');
  await f.send('Keranjang');
  await f.send('6');
  await f.service.addItem(f.scope, f.drink.id, 1, 5000);
  expect(await f.send('1')).toContain('Keranjang berubah');
  expect((await f.service.getCart(f.scope))!.items).toHaveLength(2);
});

it('rolls back cart and session changes when persisting the response intent fails', async () => {
  const f = await conversation();
  await f.enterItem();
  const before = await f.session();
  const outgoing = f.adapter.outgoing.length;
  const batch = f.events('2');
  await db.whatsappEvents.receive(batch);
  const scope: EventScope = {
    provider: 'mock',
    accountId: f.record.accountId,
    conversationEnabled: true,
  };
  const claim = (await db.whatsappEvents.claim(
    new Date(),
    'rollback-cart-turn',
    scope,
  ))!;
  const input = storedIncomingSchema.parse(claim.data).conversation!;
  const transaction = client.$transaction.bind(client);
  const fail = vi.spyOn(client, '$transaction').mockImplementationOnce(((
    work: (tx: Prisma.TransactionClient) => Promise<unknown>,
  ) =>
    transaction(
      async (tx) => {
        const wrapped = new Proxy(tx, {
          get(target, key, receiver) {
            if (key === 'conversationTurn')
              return new Proxy(target.conversationTurn, {
                get(delegate, method) {
                  if (method === 'create')
                    return async () => {
                      throw new Error('response persistence fixture failure');
                    };
                  return Reflect.get(delegate, method);
                },
              });
            return Reflect.get(target, key, receiver);
          },
        });
        return work(wrapped);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    )) as typeof client.$transaction);
  try {
    await expect(
      new ConversationEngine(client).handleIncomingMessage(
        claim.id,
        'rollback-cart-turn',
        input,
      ),
    ).rejects.toThrow('response persistence fixture failure');
  } finally {
    fail.mockRestore();
  }
  expect(await f.service.getCart(f.scope)).toBeNull();
  expect((await f.session()).version).toBe(before.version);
  expect((await f.session()).state).toBe('SELECT_QUANTITY');
  expect(
    await client.conversationTurn.count({ where: { eventId: claim.id } }),
  ).toBe(0);
  expect(f.adapter.outgoing).toHaveLength(outgoing);
  await new ConversationEngine(client).handleIncomingMessage(
    claim.id,
    'rollback-cart-turn',
    input,
  );
  expect((await f.service.getCart(f.scope))!.items[0]!.quantity).toBe(2);
  expect((await f.session()).state).toBe('CART_ACTION');
  await db.whatsappEvents.finish(claim.id, 'rollback-cart-turn', {
    state: 'completed',
  });
});

// Inject hosted-network delay without modifying production tables or relying on a remote account.
it.each(['slow', 'expired_lease'] as const)(
  'keeps quantity atomic with checkout enabled: %s',
  async (scenario) => {
    const f = await conversation();
    await f.enterItem();
    const before = await f.session();
    const batch = f.events('2');
    await db.whatsappEvents.receive(batch);
    const token = `hosted-${scenario}`;
    const claim = (await db.whatsappEvents.claim(new Date(), token, {
      provider: 'mock',
      accountId: f.record.accountId,
      conversationEnabled: true,
    }))!;
    const input = storedIncomingSchema.parse(claim.data).conversation!;
    const config = parseCheckout({
      NODE_ENV: 'development',
      CHECKOUT_ENABLED: 'true',
      CONVERSATION_ENABLED: 'true',
    })!;
    const nested = vi
      .fn()
      .mockRejectedValue(new Error('Unexpected nested transaction'));
    let clock = Date.now();
    const original = client.$transaction.bind(client);
    const transaction = vi
      .spyOn(client, '$transaction')
      .mockImplementationOnce(((
        work: (tx: Prisma.TransactionClient) => Promise<unknown>,
        options: object,
      ) =>
        original(async (tx) => {
          const wrapped = new Proxy(tx, {
            get(target, key, receiver) {
              if (key === '$transaction') return nested;
              if (key === 'cartItem')
                return new Proxy(target.cartItem, {
                  get(delegate, method) {
                    if (method === 'upsert')
                      return async (
                        ...args: Parameters<typeof delegate.upsert>
                      ) => {
                        const item = await delegate.upsert(...args);
                        if (scenario === 'slow') await delay(5500);
                        else clock += 31000;
                        return item;
                      };
                    return Reflect.get(delegate, method);
                  },
                });
              return Reflect.get(target, key, receiver);
            },
          });
          return work(wrapped);
        }, options)) as typeof client.$transaction);
    try {
      const run = new ConversationEngine(
        client,
        () => new Date(clock),
        20,
        config,
      ).handleIncomingMessage(claim.id, token, input);
      if (scenario === 'slow') {
        expect(await run).toContain('ditambahkan');
        expect((await f.service.getCart(f.scope))!.items[0]!.quantity).toBe(2);
        expect((await f.session()).state).toBe('CART_ACTION');
        expect(
          await client.conversationTurn.count({ where: { eventId: claim.id } }),
        ).toBe(1);
        // Reusing the same event response must not apply the quantity a second time.
        await new ConversationEngine(client).handleIncomingMessage(
          claim.id,
          token,
          input,
        );
        expect((await f.service.getCart(f.scope))!.items[0]!.quantity).toBe(2);
      } else {
        await expect(run).rejects.toThrow('Conversation lease lost');
        expect(await f.service.getCart(f.scope)).toBeNull();
        expect((await f.session()).version).toBe(before.version);
        expect((await f.session()).state).toBe('SELECT_QUANTITY');
        expect(
          await client.conversationTurn.count({ where: { eventId: claim.id } }),
        ).toBe(0);
      }
      expect(nested).not.toHaveBeenCalled();
      expect(transaction.mock.calls[0]![1]).toMatchObject({
        maxWait: 2000,
        timeout: 15000,
      });
    } finally {
      transaction.mockRestore();
    }
    await db.whatsappEvents.finish(claim.id, token, { state: 'completed' });
  },
  20000,
);

it('stops transaction conflict retries at the total preparation budget without changing the cart or session', async () => {
  const f = await conversation();
  await f.enterItem();
  const before = await f.session();
  await db.whatsappEvents.receive(f.events('2'));
  const token = 'budget-fixture';
  const claim = (await db.whatsappEvents.claim(new Date(), token, {
    provider: 'mock',
    accountId: f.record.accountId,
    conversationEnabled: true,
  }))!;
  const input = storedIncomingSchema.parse(claim.data).conversation!;
  let elapsed = 0;
  const clock = vi.spyOn(performance, 'now').mockImplementation(() => elapsed);
  const transaction = vi
    .spyOn(client, '$transaction')
    .mockImplementation((async () => {
      elapsed += 10000;
      throw new Prisma.PrismaClientKnownRequestError(
        'private conflict details',
        { code: 'P2034', clientVersion: 'fixture' },
      );
    }) as typeof client.$transaction);
  let failure: unknown;
  try {
    await new ConversationEngine(client)
      .handleIncomingMessage(claim.id, token, input)
      .catch((error) => {
        failure = error;
      });
    expect(transaction).toHaveBeenCalledTimes(2);
    expect(preparationDiagnostic(failure)).toMatchObject({
      category: 'timeout',
      stage: 'transaction',
      elapsedMs: 20000,
    });
  } finally {
    transaction.mockRestore();
    clock.mockRestore();
  }
  expect(await f.service.getCart(f.scope)).toBeNull();
  expect((await f.session()).version).toBe(before.version);
  expect(
    await client.conversationTurn.count({ where: { eventId: claim.id } }),
  ).toBe(0);
  await db.whatsappEvents.finish(claim.id, token, { state: 'completed' });
});

it('binds cart and order operations to an existing locked session without opening nested transactions', async () => {
  const f = await fixture();
  const config = parseCheckout({
    NODE_ENV: 'development',
    CHECKOUT_ENABLED: 'true',
    CONVERSATION_ENABLED: 'true',
  })!;
  const nested = vi
    .fn()
    .mockRejectedValue(new Error('Unexpected nested transaction'));
  await client.$transaction(async (tx) => {
    const wrapped = new Proxy(tx, {
      get(target, key, receiver) {
        return key === '$transaction'
          ? nested
          : Reflect.get(target, key, receiver);
      },
    });
    const carts = new CartService(wrapped, 20, true);
    await carts.addItem(f.scope, f.item.id, 1, 20000);
    expect(
      await new OrderService(wrapped, config, () => new Date(), true).current(
        f.scope,
      ),
    ).toBeNull();
  });
  expect(nested).not.toHaveBeenCalled();
  expect((await f.service.getCart(f.scope))!.items[0]!.quantity).toBe(1);
});

it('rejects another customer scope when reusing an internally verified session lock', async () => {
  const f = await fixture();
  const config = parseCheckout({
    NODE_ENV: 'development',
    CHECKOUT_ENABLED: 'true',
    CONVERSATION_ENABLED: 'true',
  })!;
  await client.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "ConversationSession" WHERE "id"=${f.scope.sessionId}::uuid FOR UPDATE`;
    const locked = { ...f.scope, messagingIdentityId: f.record.id };
    const other = { ...f.scope, customerId: randomUUID() };
    await expect(
      new CartService(tx, 20, true, locked).getCart(other),
    ).rejects.toMatchObject({ reason: 'missing' });
    await expect(
      new OrderService(tx, config, () => new Date(), true, locked).current(
        other,
      ),
    ).rejects.toMatchObject({ code: 'not_found' });
  });
});
