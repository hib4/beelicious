import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import {
  createDatabase,
  createPrismaClient,
  type ReceivedEvent,
  type EventScope,
} from '@beelicious/database';
import {
  incomingEvents,
  storedIncomingSchema,
} from '../../src/modules/messaging/inbox.js';
import {
  createInboxWorker,
  type Worker,
} from '../../src/modules/messaging/worker.js';
import { createMockAdapter } from '../../src/modules/messaging/providers/mock.js';
import { createBaileysAdapter } from '../../src/modules/messaging/providers/baileys/index.js';
import { GREETING } from '../../src/modules/messaging/types.js';
import {
  authFixture,
  callbacksFixture,
  factoryFor,
  incoming,
  messagingConfig,
  PHONE,
  socketFixture,
} from './fixtures.js';

const url = new URL(
  process.env.WHATSAPP_TEST_DATABASE_URL || process.env.DATABASE_URL || '',
);
if (!process.env.WHATSAPP_TEST_DATABASE_URL) url.pathname += '_test';
const dev = new URL(process.env.DATABASE_URL ?? '');
if (
  !url.pathname.endsWith('_test') ||
  (url.host === dev.host && url.pathname === dev.pathname)
)
  throw new Error('Separate _test database required');
const client = createPrismaClient(url.toString());
const db = createDatabase(url.toString());
const store = db.whatsappEvents;
const keys = new Set<string>();
const workers: Worker[] = [];
beforeAll(async () => {
  await client.whatsAppEvent.count();
});
afterEach(async () => {
  await Promise.all(workers.splice(0).map((w) => w.stop()));
  await client.whatsAppEvent.deleteMany({
    where: { dedupKey: { in: [...keys] } },
  });
  keys.clear();
});
afterAll(async () => {
  await db.disconnect();
  await client.$disconnect();
});
function events(scope: EventScope, id = randomUUID()): ReceivedEvent[] {
  const batch = incomingEvents([
    incoming({
      provider: scope.provider,
      accountId: scope.accountId,
      messageId: id,
      timestamp: Date.now(),
    }),
  ]);
  batch.forEach((e) => keys.add(e.dedupKey));
  return batch;
}
async function row(event: ReceivedEvent) {
  return client.whatsAppEvent.findUniqueOrThrow({
    where: { dedupKey: event.dedupKey },
  });
}
function scope(provider: 'baileys' | 'mock' = 'mock'): EventScope {
  return { provider, accountId: randomUUID() };
}
async function worker(active: EventScope, now = () => new Date()) {
  const adapter = createMockAdapter([PHONE], callbacksFixture());
  await adapter.start();
  const w = createInboxWorker(
    store,
    {
      ...adapter,
      provider: active.provider,
      accountId: () => active.accountId,
    },
    {
      enabled: true,
      scope: () => active,
      decode(data) {
        const p = storedIncomingSchema.safeParse(data);
        return p.success ? p.data : undefined;
      },
    },
    vi.fn(),
    now,
  );
  workers.push(w);
  return { w, outgoing: adapter.outgoing };
}
it('deduplicates concurrent Baileys receipts and competing workers to one mocked response', async () => {
  const active = scope('baileys');
  const batch = events(active);
  await Promise.all(Array.from({ length: 12 }, () => store.receive(batch)));
  const first = await worker(active);
  const second = await worker(active);
  await Promise.all([first.w.tick(), second.w.tick()]);
  expect(first.outgoing.length + second.outgoing.length).toBe(1);
  expect([...first.outgoing, ...second.outgoing][0]!.text).toBe(GREETING);
  await store.receive(batch);
  await first.w.tick();
  expect(first.outgoing.length + second.outgoing.length).toBe(1);
  expect(await row(batch[0]!)).toMatchObject({
    state: 'completed',
    attempts: 1,
  });
});
it('keeps equal message IDs isolated by provider/account and preserves inactive work', async () => {
  const mock = scope();
  const baileys = { ...mock, provider: 'baileys' as const };
  const other = scope();
  const id = randomUUID();
  const batches = [events(mock, id), events(baileys, id), events(other, id)];
  await store.receive(batches.flat());
  const current = await worker(mock);
  await current.w.tick();
  await current.w.tick();
  expect(current.outgoing).toHaveLength(1);
  expect((await row(batches[1]![0]!)).state).toBe('pending');
  expect((await row(batches[2]![0]!)).state).toBe('pending');
});
it('recovers expired pre-send work and never resends an expired sending lease', async () => {
  const active = scope('baileys');
  const batch = events(active);
  await store.receive(batch);
  const now = new Date();
  const old = await store.claim(now, 'old', active);
  const recovered = await worker(active, () => new Date(now.getTime() + 31000));
  await recovered.w.tick();
  expect(recovered.outgoing).toHaveLength(1);
  expect(
    await store.beginSend(old!.id, 'old', new Date(now.getTime() + 31000)),
  ).toBe(false);
  const uncertain = events(active);
  await store.receive(uncertain);
  const claimed = await store.claim(new Date(), 'sending', active);
  expect(claimed).toBeDefined();
  await store.beginSend(claimed!.id, 'sending', new Date());
  await recovered.w.tick();
  expect(recovered.outgoing).toHaveLength(1);
  expect((await row(uncertain[0]!)).state).toBe('uncertain');
});
it('preserves legacy Cloud rows and dedup keys when claiming through the new scope filter', async () => {
  const legacy = { wabaId: randomUUID(), phoneNumberId: '123' };
  const batch: ReceivedEvent[] = [
    {
      dedupKey: randomUUID(),
      kind: 'message',
      data: { ...legacy, sender: PHONE, greeting: true, timestamp: Date.now() },
    },
  ];
  keys.add(batch[0]!.dedupKey);
  await store.receive(batch);
  expect(await store.claim(new Date(), 'other', scope())).toBeUndefined();
  const claimed = await store.claim(new Date(), 'cloud', {
    provider: 'cloud-api',
    accountId: `${legacy.wabaId}:123`,
    legacyCloud: legacy,
  });
  expect(claimed?.id).toBe((await row(batch[0]!)).id);
});
it('runs the actual Baileys adapter against a mocked socket and a real durable inbox', async () => {
  const f = socketFixture();
  const auth = authFixture();
  const accountId = `9${Date.now()}@lid`;
  auth.state.creds.me = { id: accountId };
  const id = randomUUID();
  const active: EventScope = { provider: 'baileys', accountId };
  const expected = events(active, id); // Register cleanup without persisting.
  const adapter = createBaileysAdapter(
    messagingConfig,
    {
      ...callbacksFixture(),
      receive: (messages) => store.receive(incomingEvents(messages)),
    },
    { socketFactory: factoryFor(f), openAuth: async () => auth },
  );
  const w = createInboxWorker(
    store,
    adapter,
    {
      enabled: true,
      scope: () => active,
      decode(data) {
        const p = storedIncomingSchema.safeParse(data);
        return p.success ? p.data : undefined;
      },
    },
    vi.fn(),
  );
  workers.push(w);
  try {
    await adapter.start();
    f.emit('connection.update', { connection: 'open' });
    await vi.waitFor(() => expect(adapter.connected()).toBe(true));
    const message = {
      key: { id, remoteJid: `${PHONE}@s.whatsapp.net`, fromMe: false },
      message: { conversation: ' hI ' },
      messageTimestamp: Math.floor(Date.now() / 1000),
    };
    for (let i = 0; i < 3; i++)
      f.emit('messages.upsert', { type: 'notify', messages: [message] });
    await vi.waitFor(async () => {
      expect(await row(expected[0]!)).toMatchObject({ state: 'pending' });
    });
    await w.tick();
    await w.tick();
    expect(f.socket.sendMessage).toHaveBeenCalledExactlyOnceWith(
      `${PHONE}@s.whatsapp.net`,
      { text: GREETING },
    );
  } finally {
    await w.stop();
    await adapter.stop();
  }
});
