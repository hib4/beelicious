import { randomUUID } from 'node:crypto';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  it,
  vi,
} from 'vitest';
import {
  createDatabase,
  createPrismaClient,
  type WhatsAppEventStore,
} from '@beelicious/database';
import { buildApp } from '../../src/app.js';
import { parsePayload } from '../../src/modules/whatsapp/payload.js';
import { createWorker } from '../../src/modules/whatsapp/worker.js';
import { createWhatsAppClient } from '../../src/modules/whatsapp/client.js';
import { config, whatsapp, payload, message, signature } from './fixtures.js';

// Deliberately separate from the development database: never process its inbox.
const url = new URL(
  process.env.WHATSAPP_TEST_DATABASE_URL || process.env.DATABASE_URL || '',
);
if (!process.env.WHATSAPP_TEST_DATABASE_URL) url.pathname += '_test';
const developmentUrl = new URL(process.env.DATABASE_URL ?? '');
if (
  url.host === developmentUrl.host &&
  url.pathname === developmentUrl.pathname
)
  throw new Error('Test database must differ from development database');
if (!url.pathname.endsWith('_test'))
  throw new Error('WhatsApp integration database name must end in _test');
const client = createPrismaClient(url.toString());
const db = createDatabase(url.toString());
const store = db.whatsappEvents;
let NOW = new Date();
beforeEach(() => {
  NOW = new Date(Date.now() + 1000);
});
const keys = new Set<string>();
const workers: ReturnType<typeof createWorker>[] = [];
function receive(text = 'Halo', statuses = false) {
  const id = 'wamid.test.' + randomUUID();
  const input = statuses
    ? payload(
        [],
        [
          {
            id,
            status: 'delivered',
            timestamp: String(Math.floor(NOW.getTime() / 1000)),
          },
        ],
      )
    : payload([message(id, text)]);
  const events = parsePayload(input, whatsapp);
  events.forEach((event) => keys.add(event.dedupKey));
  return { input, events };
}
function worker(
  eventStore: WhatsAppEventStore = store,
  clock: () => Date = () => NOW,
) {
  const transport = vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      Response.json({ messages: [{ id: 'wamid.mocked.outbound' }] }),
    );
  const instance = createWorker(
    eventStore,
    createWhatsAppClient(whatsapp, transport),
    whatsapp,
    true,
    vi.fn(),
    clock,
  );
  workers.push(instance);
  return { instance, transport };
}
async function row(key: string) {
  return client.whatsAppEvent.findUniqueOrThrow({ where: { dedupKey: key } });
}
beforeAll(async () => {
  await client.whatsAppEvent.count();
});
afterEach(async () => {
  await Promise.all(workers.splice(0).map((instance) => instance.stop()));
  await client.whatsAppEvent.deleteMany({
    where: { dedupKey: { in: [...keys] } },
  });
  keys.clear();
});
afterAll(async () => {
  await Promise.all([db.disconnect(), client.$disconnect()]);
});
it('durably receives concurrent duplicate HTTP submissions and produces one mocked send across competing workers', async () => {
  const { input, events } = receive();
  const app = buildApp(
    config,
    { checkConnection: async () => {}, disconnect: async () => {} },
    { whatsappEvents: store, logger: false },
  );
  try {
    const body = JSON.stringify(input);
    const responses = await Promise.all(
      Array.from({ length: 12 }, () =>
        app.inject({
          method: 'POST',
          url: '/webhooks/whatsapp',
          payload: body,
          headers: {
            'content-type': 'application/json',
            'x-hub-signature-256': signature(body),
          },
        }),
      ),
    );
    expect(responses.every((response) => response.statusCode === 200)).toBe(
      true,
    );
    expect(
      await client.whatsAppEvent.count({
        where: { dedupKey: events[0]!.dedupKey },
      }),
    ).toBe(1);
    const first = worker();
    const second = worker();
    await Promise.all([first.instance.tick(), second.instance.tick()]);
    expect(
      first.transport.mock.calls.length + second.transport.mock.calls.length,
    ).toBe(1);
    await store.receive(events);
    await Promise.all([first.instance.tick(), second.instance.tick()]);
    expect(
      first.transport.mock.calls.length + second.transport.mock.calls.length,
    ).toBe(1);
    expect(await row(events[0]!.dedupKey)).toMatchObject({
      state: 'completed',
      attempts: 1,
      outboundMessageId: 'wamid.mocked.outbound',
    });
  } finally {
    await app.close();
  }
});
it('processes accepted work after closing the first application and opening a new database connection', async () => {
  const { input, events } = receive();
  const firstDb = createDatabase(url.toString());
  const firstApp = buildApp(config, firstDb, { logger: false });
  const body = JSON.stringify(input);
  expect(
    (
      await firstApp.inject({
        method: 'POST',
        url: '/webhooks/whatsapp',
        payload: body,
        headers: {
          'content-type': 'application/json',
          'x-hub-signature-256': signature(body),
        },
      })
    ).statusCode,
  ).toBe(200);
  await firstApp.close();
  const secondDb = createDatabase(url.toString());
  const recovered = worker(secondDb.whatsappEvents);
  try {
    await recovered.instance.tick();
    expect(recovered.transport).toHaveBeenCalledOnce();
    expect((await row(events[0]!.dedupKey)).state).toBe('completed');
  } finally {
    await recovered.instance.stop();
    await secondDb.disconnect();
  }
});
it('reclaims interrupted pre-send work and prevents the expired owner from sending', async () => {
  const { events } = receive();
  await store.receive(events);
  const old = await store.claim(NOW, 'old-owner');
  expect(old).toBeDefined();
  const later = new Date(NOW.getTime() + 31000);
  const recovered = worker(store, () => later);
  await recovered.instance.tick();
  expect(await store.beginSend(old!.id, 'old-owner', later)).toBe(false);
  expect(recovered.transport).toHaveBeenCalledOnce();
  expect((await row(events[0]!.dedupKey)).state).toBe('completed');
});
it('never resends an interrupted in-flight send after its lease expires', async () => {
  const { events } = receive();
  await store.receive(events);
  const claimed = await store.claim(NOW, 'interrupted');
  expect(await store.beginSend(claimed!.id, 'interrupted', NOW)).toBe(true);
  const recovered = worker(store, () => new Date(NOW.getTime() + 31000));
  await recovered.instance.tick();
  await store.receive(events);
  await recovered.instance.tick();
  expect(recovered.transport).not.toHaveBeenCalled();
  expect(await row(events[0]!.dedupKey)).toMatchObject({
    state: 'uncertain',
    attempts: 1,
  });
});
it('persists safe retries across worker restart and stops after three requests', async () => {
  const { events } = receive();
  await store.receive(events);
  const first = worker();
  first.transport.mockImplementation(async () =>
    Response.json({ error: { code: 130429 } }, { status: 429 }),
  );
  await first.instance.tick();
  expect(await row(events[0]!.dedupKey)).toMatchObject({
    state: 'pending',
    attempts: 1,
    availableAt: new Date(NOW.getTime() + 1000),
  });
  await first.instance.stop();
  let current = new Date(NOW.getTime() + 1000);
  const next = worker(store, () => current);
  next.transport.mockImplementation(async () =>
    Response.json({ error: { code: 130429 } }, { status: 429 }),
  );
  await next.instance.tick();
  expect(await row(events[0]!.dedupKey)).toMatchObject({
    state: 'pending',
    attempts: 2,
    availableAt: new Date(NOW.getTime() + 3000),
  });
  await next.instance.tick();
  expect(next.transport).toHaveBeenCalledOnce();
  current = new Date(NOW.getTime() + 3000);
  await next.instance.tick();
  expect(await row(events[0]!.dedupKey)).toMatchObject({
    state: 'failed',
    attempts: 3,
  });
  await next.instance.tick();
  expect(next.transport).toHaveBeenCalledTimes(2);
});
it('completes delivery statuses without sending and uses distinct status dedup keys', async () => {
  const { events } = receive('unused', true);
  const read = {
    ...events[0]!,
    dedupKey: events[0]!.dedupKey + '.read',
    data: { status: 'read' },
  };
  keys.add(read.dedupKey);
  await store.receive([...events, read]);
  const { instance, transport } = worker();
  await instance.tick();
  await instance.tick();
  expect(transport).not.toHaveBeenCalled();
  expect((await row(events[0]!.dedupKey)).state).toBe('completed');
  expect((await row(read.dedupKey)).state).toBe('completed');
});
it('rolls back a failed batch so no partial receipt is acknowledged', async () => {
  const { events } = receive();
  await expect(
    store.receive([
      ...events,
      {
        ...events[0]!,
        dedupKey: 'invalid.' + randomUUID(),
        kind: 'invalid' as 'message',
      },
    ]),
  ).rejects.toThrow();
  expect(
    await client.whatsAppEvent.count({
      where: { dedupKey: events[0]!.dedupKey },
    }),
  ).toBe(0);
});
