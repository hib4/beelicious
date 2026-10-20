import { WhatsAppSendError } from '../../src/modules/whatsapp/client.js';
import { buildApp } from '../../src/app.js';
import { parseEnvironment } from '../../src/config.js';
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import {
  createDatabase,
  type EventScope,
  type ReceivedEvent,
} from '@beelicious/database';
import { ConversationEngine } from '../../src/modules/conversation/engine.js';
import { conversationInputSchema } from '../../src/modules/conversation/commands.js';
import {
  incomingEvents,
  storedIncomingSchema,
} from '../../src/modules/messaging/inbox.js';
import {
  createInboxWorker,
  type Worker,
} from '../../src/modules/messaging/worker.js';
import { createMockAdapter } from '../../src/modules/messaging/providers/mock.js';
import {
  MessagingError,
  type IncomingMessage,
} from '../../src/modules/messaging/types.js';
import {
  incoming,
  callbacksFixture,
  PHONE,
  socketFixture,
  authFixture,
  factoryFor,
  messagingConfig,
} from '../messaging/fixtures.js';
import { createBaileysAdapter } from '../../src/modules/messaging/providers/baileys/index.js';
import { createWorker } from '../../src/modules/whatsapp/worker.js';
import { parsePayload } from '../../src/modules/whatsapp/payload.js';
import { payload, message, whatsapp } from '../whatsapp/fixtures.js';

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
  client = db.prisma,
  store = db.whatsappEvents;
const keys = new Set<string>(),
  accounts = new Set<string>(),
  tenants = new Set<string>();
const workers: Worker[] = [];
beforeAll(async () => {
  await client.conversationSession.count();
});
afterEach(async () => {
  await Promise.all(workers.splice(0).map((w) => w.stop()));
  const identities = await client.customerMessagingIdentity.findMany({
    where: { accountId: { in: [...accounts] } },
  });
  const sessions = { identity: { accountId: { in: [...accounts] } } };
  await client.cartItem.deleteMany({ where: { cart: { session: sessions } } });
  await client.cart.deleteMany({ where: { session: sessions } });
  await client.conversationTurn.deleteMany({ where: { session: sessions } });
  await client.conversationSession.deleteMany({ where: sessions });
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
  keys.clear();
  accounts.clear();
  tenants.clear();
});
afterAll(async () => db.disconnect());
function scope(provider: EventScope['provider'] = 'mock'): EventScope {
  const accountId =
    provider === 'baileys'
      ? `${Date.now()}${Math.floor(Math.random() * 100000)}@lid`
      : randomUUID();
  accounts.add(accountId);
  return { provider, accountId, conversationEnabled: true };
}
function events(
  active: EventScope,
  texts: string[],
  overrides: Partial<IncomingMessage> = {},
): ReceivedEvent[] {
  const batch = incomingEvents(
    texts.map((text) =>
      incoming({
        provider: active.provider,
        accountId: active.accountId,
        messageId: randomUUID(),
        timestamp: Date.now(),
        text,
        ...overrides,
      }),
    ),
    true,
  );
  batch.forEach((e) => keys.add(e.dedupKey));
  return batch;
}
async function fixture(
  active = scope(),
  engine = new ConversationEngine(client),
  now = () => new Date(),
) {
  const adapter = createMockAdapter([PHONE], callbacksFixture());
  await adapter.start();
  const warn = vi.fn();
  const w = createInboxWorker(
    store,
    {
      ...adapter,
      provider: active.provider,
      accountId: () => active.accountId,
    },
    {
      enabled: true,
      conversation: engine,
      scope: () => active,
      decode(data) {
        const p = storedIncomingSchema.safeParse(data);
        return p.success ? p.data : undefined;
      },
    },
    warn,
    now,
  );
  workers.push(w);
  return { w, adapter, warn, active };
}
async function session(active: EventScope) {
  return client.conversationSession.findFirstOrThrow({
    where: {
      identity: { provider: active.provider, accountId: active.accountId },
    },
  });
}
async function send(f: Awaited<ReturnType<typeof fixture>>, text: string) {
  await store.receive(events(f.active, [text]));
  await f.w.tick();
  expect(f.warn).not.toHaveBeenCalled();
  return session(f.active);
}
it('persists the full catalog flow and restores it with a new engine', async () => {
  const t = await client.tenant.create({
    data: { name: '! Conversation fixture', slug: randomUUID() },
  });
  tenants.add(t.id);
  const category = await client.menuCategory.create({
    data: { tenantId: t.id, name: 'Makanan' },
  });
  const item = await client.menuItem.create({
    data: {
      tenantId: t.id,
      categoryId: category.id,
      name: 'Prototype',
      price: 20000,
    },
  });
  const f = await fixture();
  let s = await send(f, 'Hi');
  for (let n = 0; s.state === 'SELECT_TENANT' && n < 20; n++) {
    const data = s.stateData as { options: string[] };
    const index = data.options.indexOf(t.id);
    s = await send(f, index < 0 ? '9' : String(index + 1));
  }
  expect(s.state).toBe('SELECT_CATEGORY');
  s = await send(f, '1');
  expect(s.state).toBe('SELECT_MENU');
  await f.w.stop();
  const restored = await fixture(f.active, new ConversationEngine(client));
  s = await send(restored, '1');
  expect(s).toMatchObject({
    state: 'VIEW_MENU_ITEM',
    selectedTenantId: t.id,
    selectedCategoryId: category.id,
    selectedMenuItemId: item.id,
  });
  expect(restored.adapter.outgoing[0]!.text).toContain('Rp20.000');
  await client.menuItem.update({
    where: { id: item.id },
    data: { isAvailable: false },
  });
  s = await send(restored, '0');
  expect(s.state).toBe('SELECT_MENU');
  expect(s.selectedMenuItemId).toBeNull();
  expect(restored.adapter.outgoing.at(-1)!.text).not.toContain('Prototype');
});
it('deduplicates concurrent receipts and processes one identity sequentially across competing workers', async () => {
  const a = scope();
  const batch = events(a, ['Menu', 'Bantuan', 'Batal', 'Hi']);
  await Promise.all(Array.from({ length: 6 }, () => store.receive(batch)));
  const f = await fixture(a),
    g = await fixture(a);
  for (let n = 0; n < 4; n++) await Promise.all([f.w.tick(), g.w.tick()]);
  expect(
    await client.whatsAppEvent.count({
      where: { dedupKey: { in: batch.map((e) => e.dedupKey) } },
    }),
  ).toBe(4);
  expect((await session(a)).version).toBe(4);
  expect((await session(a)).state).toBe('SELECT_TENANT');
  expect(f.adapter.outgoing.length + g.adapter.outgoing.length).toBe(4);
  expect(f.warn).not.toHaveBeenCalled();
  expect(g.warn).not.toHaveBeenCalled();
});
it('reuses a committed response after a pre-send crash and rejects a stale lease', async () => {
  const a = scope();
  const batch = events(a, ['Hi']);
  await store.receive(batch);
  const claimed = (await store.claim(new Date(), 'first', a))!;
  const input = conversationInputSchema.parse(
    (claimed.data as { conversation: unknown }).conversation,
  );
  const engine = new ConversationEngine(client);
  const prepared = await engine.handleIncomingMessage(
    claimed.id,
    'first',
    input,
  );
  expect(await engine.handleIncomingMessage(claimed.id, 'first', input)).toBe(
    prepared,
  );
  const future = new Date(Date.now() + 31000);
  const f = await fixture(
    a,
    new ConversationEngine(client, () => future),
    () => future,
  );
  await f.w.tick();
  expect(f.adapter.outgoing[0]!.text).toBe(prepared);
  expect((await session(a)).version).toBe(1);
  await expect(
    engine.handleIncomingMessage(claimed.id, 'first', input),
  ).rejects.toThrow('lease lost');
  expect(
    await client.conversationTurn.count({ where: { eventId: claimed.id } }),
  ).toBe(1);
});
it('marks interrupted sending uncertain and refreshes instead of selecting', async () => {
  const a = scope();
  await store.receive(events(a, ['Hi']));
  const claimed = (await store.claim(new Date(), 'old', a))!;
  await new ConversationEngine(client).handleIncomingMessage(
    claimed.id,
    'old',
    conversationInputSchema.parse(
      (claimed.data as { conversation: unknown }).conversation,
    ),
  );
  await store.beginSend(claimed.id, 'old', new Date());
  await store.receive(events(a, ['1']));
  const future = new Date(Date.now() + 31000);
  const f = await fixture(
    a,
    new ConversationEngine(client, () => future),
    () => future,
  );
  await f.w.tick();
  expect(
    (
      await client.whatsAppEvent.findUniqueOrThrow({
        where: { id: claimed.id },
      })
    ).state,
  ).toBe('uncertain');
  expect((await session(a)).state).toBe('SELECT_TENANT');
  expect(f.adapter.outgoing).toHaveLength(1);
  expect(f.adapter.outgoing[0]!.text).toContain('Tampilan diperbarui');
});
it('holds later commands behind a delayed retry and isolates a different identity', async () => {
  const a = scope(),
    b = scope();
  await store.receive(events(a, ['Hi', 'Batal']));
  const first = (await store.claim(new Date(), 'retry', a))!;
  await store.finish(first.id, 'retry', {
    state: 'pending',
    availableAt: new Date(Date.now() + 60000),
  });
  expect(await store.claim(new Date(), 'blocked', a)).toBeUndefined();
  const f = await fixture(b);
  await send(f, 'Hi');
  expect((await session(b)).version).toBe(1);
});
it('expires sessions, keeps help from extending inactivity, and recovers corrupt state data', async () => {
  const f = await fixture();
  let s = await send(f, 'Hi');
  await client.conversationSession.update({
    where: { id: s.id },
    data: { lastInteractionAt: new Date(Date.now() - 1801000) },
  });
  s = await send(f, '1');
  expect(s.state).toBe('SELECT_TENANT');
  expect(f.adapter.outgoing.at(-1)!.text).toContain('tidak aktif');
  const last = s.lastInteractionAt;
  s = await send(f, 'Bantuan');
  expect(s.lastInteractionAt).toEqual(last);
  await client.conversationSession.update({
    where: { id: s.id },
    data: { stateData: {} },
  });
  s = await send(f, '1');
  expect(s.state).toBe('IDLE');
  expect(f.adapter.outgoing.at(-1)!.text).toContain('Kirim Halo');
});
it('does not register unapproved contacts or consume conversation work when disabled', async () => {
  const a = scope();
  const batch = events(a, ['Hi'], {
    chatId: '15555550998',
    senderId: '15555550998',
  });
  await store.receive(batch);
  expect(
    await store.claim(new Date(), 'disabled', {
      ...a,
      conversationEnabled: false,
    }),
  ).toBeUndefined();
  const f = await fixture(a);
  await f.w.tick();
  expect(f.adapter.outgoing).toHaveLength(0);
  expect(
    await client.customerMessagingIdentity.count({
      where: { accountId: a.accountId },
    }),
  ).toBe(0);
});
it('keeps Baileys PN/LID, accounts, Cloud, and mock identities in separate sessions', async () => {
  const cases = [scope('baileys'), scope('cloud-api'), scope('mock')];
  for (const a of cases) {
    const batch = events(a, ['Hi'], {
      senderId: a.provider === 'baileys' ? `${PHONE}@s.whatsapp.net` : PHONE,
    });
    await store.receive(batch);
    const claimed = (await store.claim(new Date(), randomUUID(), a))!;
    const row = await client.whatsAppEvent.findUniqueOrThrow({
      where: { id: claimed.id },
    });
    await new ConversationEngine(client).handleIncomingMessage(
      claimed.id,
      row.leaseToken!,
      conversationInputSchema.parse(
        (claimed.data as { conversation: unknown }).conversation,
      ),
    );
  }
  const lid = events(cases[0]!, ['Hi'], { senderId: '987654321@lid' });
  await store.receive(lid);
  const pending = await client.whatsAppEvent.findUniqueOrThrow({
    where: { dedupKey: lid[0]!.dedupKey },
  });
  await store.finish(
    (
      await client.whatsAppEvent
        .findFirstOrThrow({ where: { streamKey: cases[0]!.accountId } })
        .catch(() => ({ id: '' }))
    ).id,
    '',
    { state: 'ignored' },
  );
  // Different sender stream does not wait for the PN stream.
  const claim = (await store.claim(new Date(), 'lid', cases[0]!))!;
  expect(claim.id).toBe(pending.id);
  await new ConversationEngine(client).handleIncomingMessage(
    claim.id,
    'lid',
    conversationInputSchema.parse(
      (claim.data as { conversation: unknown }).conversation,
    ),
  );
  expect(
    await client.conversationSession.count({
      where: { identity: { accountId: { in: [...accounts] } } },
    }),
  ).toBe(4);
});
it('enforces session state shape, selected tenant ownership and identity uniqueness in PostgreSQL', async () => {
  const f = await fixture();
  const s = await send(f, 'Hi');
  await expect(
    client.conversationSession.update({
      where: { id: s.id },
      data: { state: 'SELECT_MENU' },
    }),
  ).rejects.toThrow();
  await expect(
    client.conversationSession.create({
      data: { messagingIdentityId: s.messagingIdentityId, stateData: {} },
    }),
  ).rejects.toMatchObject({ code: 'P2002' });
  const a = await client.tenant.create({
      data: { name: 'A', slug: randomUUID() },
    }),
    b = await client.tenant.create({ data: { name: 'B', slug: randomUUID() } });
  tenants.add(a.id);
  tenants.add(b.id);
  const category = await client.menuCategory.create({
    data: { tenantId: b.id, name: 'B' },
  });
  await expect(
    client.conversationSession.update({
      where: { id: s.id },
      data: {
        state: 'SELECT_MENU',
        selectedTenantId: a.id,
        selectedCategoryId: category.id,
      },
    }),
  ).rejects.toMatchObject({ code: 'P2003' });
});
function cloudFixture() {
  const config = {
    ...whatsapp,
    wabaId: `${Date.now()}${Math.floor(Math.random() * 100000)}`,
  };
  const accountId = `${config.wabaId}:${config.phoneNumberId}`;
  accounts.add(accountId);
  return {
    config,
    accountId,
    batch(texts: string[]) {
      const envelope = payload(
        texts.map((text) => message(randomUUID(), text)),
      );
      envelope.entry[0]!.id = config.wabaId;
      const batch = parsePayload(envelope, config, true);
      batch.forEach((e) => keys.add(e.dedupKey));
      return batch;
    },
  };
}
async function transportCatalog() {
  const tenant = await client.tenant.create({
    data: { name: '! transport cart fixture', slug: randomUUID() },
  });
  tenants.add(tenant.id);
  const category = await client.menuCategory.create({
    data: { tenantId: tenant.id, name: 'Transport category' },
  });
  await client.menuItem.create({
    data: {
      tenantId: tenant.id,
      categoryId: category.id,
      name: 'Transport meal',
      price: 20000,
    },
  });
  return tenant;
}
async function addTransportCart(
  active: EventScope,
  tenantId: string,
  sendText: (text: string) => Promise<void>,
) {
  let selected = await session(active);
  for (let n = 0; selected.state === 'SELECT_TENANT' && n < 20; n++) {
    const index = (selected.stateData as { options: string[] }).options.indexOf(
      tenantId,
    );
    await sendText(index < 0 ? '9' : String(index + 1));
    selected = await session(active);
  }
  await sendText('1'); // category
  await sendText('1'); // details
  await sendText('1'); // quantity prompt
  await sendText('2'); // committed addition
  const current = await session(active);
  const cart = await client.cart.findFirstOrThrow({
    where: { sessionId: current.id },
    include: { items: true },
  });
  expect(current.state).toBe('CART_ACTION');
  expect(cart.items).toHaveLength(1);
  expect(cart.items[0]!.quantity).toBe(2);
}
it('prepares Cloud commands and cart additions through its preserved payload and worker entrypoints', async () => {
  const tenant = await transportCatalog();
  const cloud = cloudFixture();
  const batch = cloud.batch(['Menu']);
  await store.receive(batch);
  const sender = {
    sendTextMessage: vi.fn().mockResolvedValue('mock-cloud-id'),
  };
  const w = createWorker(
    store,
    sender,
    cloud.config,
    true,
    vi.fn(),
    () => new Date(),
    new ConversationEngine(client),
  );
  workers.push(w);
  await w.tick();
  expect(sender.sendTextMessage).toHaveBeenCalledOnce();
  expect(sender.sendTextMessage.mock.calls[0]![1]).toContain('Selamat datang');
  await addTransportCart(
    { provider: 'cloud-api', accountId: cloud.accountId },
    tenant.id,
    async (text) => {
      await store.receive(cloud.batch([text]));
      await w.tick();
    },
  );
});
it('connects real Baileys normalization to persisted cart additions with a mocked socket', async () => {
  const tenant = await transportCatalog();
  const a = scope('baileys');
  const sock = socketFixture(),
    auth = authFixture();
  auth.state.creds.me = { id: a.accountId };
  const warn = vi.fn();
  const adapter = createBaileysAdapter(
    messagingConfig,
    {
      receive: async (messages) => {
        const batch = incomingEvents(messages, true);
        batch.forEach((e) => keys.add(e.dedupKey));
        await store.receive(batch);
      },
      delivery: async () => {},
      warn,
    },
    { socketFactory: factoryFor(sock), openAuth: async () => auth },
  );
  const w = createInboxWorker(
    store,
    adapter,
    {
      enabled: true,
      conversation: new ConversationEngine(client),
      scope: () => a,
      decode(data) {
        const p = storedIncomingSchema.safeParse(data);
        return p.success ? p.data : undefined;
      },
    },
    warn,
  );
  workers.push(w);
  try {
    await adapter.start();
    sock.emit('connection.update', { connection: 'open' });
    await vi.waitFor(() => expect(adapter.connected()).toBe(true));
    sock.emit('messages.upsert', {
      type: 'notify',
      messages: [
        {
          key: {
            id: randomUUID(),
            remoteJid: `${PHONE}@s.whatsapp.net`,
            fromMe: false,
          },
          message: { conversation: 'Mulai' },
          messageTimestamp: Math.floor(Date.now() / 1000),
        },
      ],
    });
    await vi.waitFor(async () =>
      expect(
        await client.whatsAppEvent.count({
          where: { dedupKey: { in: [...keys] } },
        }),
      ).toBe(1),
    );
    await w.tick();
    expect(sock.socket.sendMessage).toHaveBeenCalledOnce();
    expect(sock.socket.sendMessage.mock.calls[0]![1]).toMatchObject({
      text: expect.stringContaining('Selamat datang'),
    });
    await addTransportCart(a, tenant.id, async (text) => {
      const expected = keys.size + 1;
      sock.emit('messages.upsert', {
        type: 'notify',
        messages: [
          {
            key: {
              id: randomUUID(),
              remoteJid: `${PHONE}@s.whatsapp.net`,
              fromMe: false,
            },
            message: { conversation: text },
            messageTimestamp: Math.floor(Date.now() / 1000),
          },
        ],
      });
      await vi.waitFor(async () =>
        expect(
          await client.whatsAppEvent.count({
            where: { dedupKey: { in: [...keys] } },
          }),
        ).toBe(expected),
      );
      await w.tick();
    });
  } finally {
    await w.stop();
    await adapter.stop();
  }
});
it('never retries an ambiguous Baileys send and preserves one committed transition', async () => {
  const a = scope('baileys'),
    f = await fixture(a);
  const sendText = vi.fn().mockRejectedValue(new MessagingError('uncertain'));
  const w = createInboxWorker(
    store,
    {
      ...f.adapter,
      provider: 'baileys',
      accountId: () => a.accountId,
      sendText,
    },
    {
      enabled: true,
      conversation: new ConversationEngine(client),
      scope: () => a,
      decode(data) {
        const p = storedIncomingSchema.safeParse(data);
        return p.success ? p.data : undefined;
      },
    },
    vi.fn(),
  );
  workers.push(w);
  await store.receive(
    events(a, ['Hi'], { senderId: `${PHONE}@s.whatsapp.net` }),
  );
  await w.tick();
  await w.tick();
  expect(sendText).toHaveBeenCalledOnce();
  expect((await session(a)).version).toBe(1);
  expect((await session(a)).requiresRefresh).toBe(true);
});
it('retries only an explicit Cloud rate limit with the same response and blocks the next turn', async () => {
  const cloud = cloudFixture();
  const a: EventScope = {
    provider: 'cloud-api',
    accountId: cloud.accountId,
    conversationEnabled: true,
  };
  accounts.add(a.accountId);
  let clock = new Date();
  const sendTextMessage = vi
    .fn()
    .mockRejectedValueOnce(
      new WhatsAppSendError('rate_limit', true, true, 1000, 429, 130429),
    )
    .mockResolvedValue('fixture-out');
  const w = createWorker(
    store,
    { sendTextMessage },
    cloud.config,
    true,
    vi.fn(),
    () => clock,
    new ConversationEngine(client, () => clock),
  );
  workers.push(w);
  const batch = cloud.batch(['Hi', 'Batal']);
  await store.receive(batch);
  clock = new Date();
  await w.tick();
  expect((await session(a)).version).toBe(1);
  await w.tick();
  expect(sendTextMessage).toHaveBeenCalledOnce();
  clock = new Date(clock.getTime() + 2000);
  await w.tick();
  expect(sendTextMessage.mock.calls[1]![1]).toEqual(
    sendTextMessage.mock.calls[0]![1],
  );
  expect((await session(a)).version).toBe(1);
  await w.tick();
  expect((await session(a)).state).toBe('IDLE');
  expect((await session(a)).version).toBe(2);
});
it('preserves refresh through help and rejects input belonging to a different event before registration', async () => {
  const f = await fixture();
  let s = await send(f, 'Hi');
  await client.conversationSession.update({
    where: { id: s.id },
    data: { requiresRefresh: true },
  });
  s = await send(f, 'Bantuan');
  expect(s.requiresRefresh).toBe(true);
  s = await send(f, '1');
  expect(s.state).toBe('SELECT_TENANT');
  expect(s.requiresRefresh).toBe(false);
  await store.receive(events(f.active, ['Menu']));
  const claim = (await store.claim(new Date(), 'bound', f.active))!;
  const input = conversationInputSchema.parse(
    (claim.data as { conversation: unknown }).conversation,
  );
  const otherAccount = randomUUID();
  accounts.add(otherAccount);
  await expect(
    new ConversationEngine(client).handleIncomingMessage(claim.id, 'bound', {
      ...input,
      accountId: otherAccount,
    }),
  ).rejects.toThrow('event mismatch');
  expect(
    await client.customerMessagingIdentity.count({
      where: { accountId: otherAccount },
    }),
  ).toBe(0);
});
it('does not send or change state when transaction preparation fails, then recovers', async () => {
  const f = await fixture();
  const batch = events(f.active, ['Hi']);
  await store.receive(batch);
  const claim = (await store.claim(new Date(), 'prepare', f.active))!;
  const input = conversationInputSchema.parse(
    (claim.data as { conversation: unknown }).conversation,
  );
  const fail = vi
    .spyOn(client, '$transaction')
    .mockRejectedValueOnce(new Error('private database detail'));
  await expect(
    new ConversationEngine(client).handleIncomingMessage(
      claim.id,
      'prepare',
      input,
    ),
  ).rejects.toThrow('private database detail');
  fail.mockRestore();
  expect(
    await client.conversationSession.count({
      where: { identity: { accountId: f.active.accountId } },
    }),
  ).toBe(0);
  expect(
    await client.conversationTurn.count({ where: { eventId: claim.id } }),
  ).toBe(0);
  await new ConversationEngine(client).handleIncomingMessage(
    claim.id,
    'prepare',
    input,
  );
  expect((await session(f.active)).version).toBe(1);
});
it('runs the selected mock runtime only on listening and restores a session across application restarts', async () => {
  accounts.add('local-mock');
  const phone = `155${String(Date.now()).slice(-8)}`;
  const config = parseEnvironment({
    DATABASE_URL: url.toString(),
    NODE_ENV: 'development',
    WHATSAPP_ENABLED: 'true',
    WHATSAPP_TEST_BOT_ENABLED: 'true',
    MESSAGING_PROVIDER: 'mock',
    WHATSAPP_TEST_RECIPIENTS: phone,
    CONVERSATION_ENABLED: 'true',
  });
  async function boot() {
    let adapter: ReturnType<typeof createMockAdapter> | undefined;
    const database = createDatabase(url.toString());
    const factory = vi.fn(
      async (callbacks: Parameters<typeof createMockAdapter>[1]) => {
        adapter = createMockAdapter([phone], callbacks);
        return adapter;
      },
    );
    const app = buildApp(config, database, {
      logger: false,
      messagingAdapterFactory: factory,
      whatsappEvents: {
        ...database.whatsappEvents,
        async receive(batch) {
          batch.forEach((e) => keys.add(e.dedupKey));
          await database.whatsappEvents.receive(batch);
        },
      },
    });
    expect((await app.inject('/health')).statusCode).toBe(200);
    expect(factory).not.toHaveBeenCalled();
    await app.listen({ host: '127.0.0.1', port: 0 });
    return { app, adapter: adapter! };
  }
  const first = await boot();
  let id: string;
  try {
    await first.adapter.inject([
      incoming({
        chatId: phone,
        senderId: phone,
        senderPhone: phone,
        text: 'Hi',
        timestamp: Date.now(),
        messageId: randomUUID(),
      }),
    ]);
    await vi.waitFor(() => expect(first.adapter.outgoing).toHaveLength(1), {
      timeout: 4000,
    });
    id = (
      await client.conversationSession.findFirstOrThrow({
        where: { identity: { accountId: 'local-mock', providerUserId: phone } },
      })
    ).id;
  } finally {
    await first.app.close();
  }
  const second = await boot();
  try {
    await second.adapter.inject([
      incoming({
        chatId: phone,
        senderId: phone,
        senderPhone: phone,
        text: 'Bantuan',
        timestamp: Date.now(),
        messageId: randomUUID(),
      }),
    ]);
    await vi.waitFor(() => expect(second.adapter.outgoing).toHaveLength(1), {
      timeout: 4000,
    });
    const restored = await client.conversationSession.findUniqueOrThrow({
      where: { id: id! },
    });
    expect(restored.state).toBe('SELECT_TENANT');
    expect(restored.version).toBe(2);
  } finally {
    await second.app.close();
  }
});
