import { expect, it, vi } from 'vitest';
import { buildApp } from '../../src/app.js';
import { parseEnvironment } from '../../src/config.js';
import { createMockAdapter } from '../../src/modules/messaging/providers/mock.js';
import { createCloudAdapter } from '../../src/modules/messaging/providers/cloud-api.js';
import { createMessagingRuntime } from '../../src/modules/messaging/runtime.js';
import { createInboxWorker } from '../../src/modules/messaging/worker.js';
import {
  incomingEvents,
  storedIncomingSchema,
} from '../../src/modules/messaging/inbox.js';
import { GREETING } from '../../src/modules/messaging/types.js';
import { fakeStore, whatsapp } from '../whatsapp/fixtures.js';
import { NOW, PHONE, incoming, callbacksFixture } from './fixtures.js';

it('wraps Cloud API sending and preserves normalized failures', async () => {
  const sender = { sendTextMessage: vi.fn().mockResolvedValue('wamid.result') };
  const adapter = createCloudAdapter(whatsapp, sender);
  expect(await adapter.sendText({ chatId: PHONE, text: 'Hi' })).toEqual({
    provider: 'cloud-api',
    status: 'accepted',
    messageId: 'wamid.result',
  });
  expect(sender.sendTextMessage).toHaveBeenCalledWith(PHONE, 'Hi', undefined);
});
it('mock records output, validates it, and accepts injected input without a network', async () => {
  const callbacks = callbacksFixture();
  const adapter = createMockAdapter([PHONE], callbacks);
  await adapter.start();
  await adapter.inject([incoming()]);
  expect(callbacks.receive).toHaveBeenCalledWith([incoming()]);
  await adapter.sendText({ chatId: PHONE, text: GREETING });
  expect(adapter.outgoing).toEqual([
    {
      chatId: PHONE,
      text: GREETING,
      provider: 'mock',
      status: 'recorded',
      messageId: 'mock-1',
    },
  ]);
  await expect(
    adapter.sendText({ chatId: PHONE, text: '  ' }),
  ).rejects.toMatchObject({ category: 'invalid_input' });
  await adapter.stop();
});
it.each(['Halo', ' hI ', 'HALO', 'unsupported'])(
  'shares deterministic greeting behavior: %s',
  async (text) => {
    const store = fakeStore();
    const event = incomingEvents([incoming({ text })])[0]!;
    store.claim.mockResolvedValueOnce({
      id: 'id',
      kind: 'message',
      data: event.data,
      attempts: 0,
    });
    const adapter = createMockAdapter([PHONE], callbacksFixture());
    await adapter.start();
    const worker = createInboxWorker(
      store,
      adapter,
      {
        enabled: true,
        scope: () => ({ provider: 'mock', accountId: 'local-mock' }),
        decode(data) {
          const parsed = storedIncomingSchema.safeParse(data);
          return parsed.success ? parsed.data : undefined;
        },
      },
      vi.fn(),
      () => new Date(NOW),
    );
    await Promise.all([worker.tick(), worker.tick()]);
    expect(adapter.outgoing).toHaveLength(text === 'unsupported' ? 0 : 1);
    if (adapter.outgoing.length)
      expect(adapter.outgoing[0]!.text).toBe(GREETING);
    await worker.stop();
    await adapter.stop();
  },
);
it('constructing/injecting Fastify does not initialize the selected adapter or expose send/webhook routes', async () => {
  const store = fakeStore();
  const factory = vi.fn();
  const disconnect = vi.fn();
  const config = parseEnvironment({
    DATABASE_URL: 'postgresql://fixture:fixture@localhost/fixture',
    MESSAGING_PROVIDER: 'baileys',
    WHATSAPP_ENABLED: 'true',
  });
  const app = buildApp(
    config,
    { checkConnection: async () => {}, disconnect },
    { whatsappEvents: store, messagingAdapterFactory: factory, logger: false },
  );
  try {
    expect((await app.inject('/health')).statusCode).toBe(200);
    expect((await app.inject('/webhooks/whatsapp')).statusCode).toBe(404);
    expect(factory).not.toHaveBeenCalled();
  } finally {
    await app.close();
  }
  expect(disconnect).toHaveBeenCalledOnce();
});
it('starts only the selected mock provider on listen, then stops it before disconnect', async () => {
  const order: string[] = [];
  const store = fakeStore();
  const adapter = createMockAdapter([PHONE], callbacksFixture());
  const stop = adapter.stop;
  adapter.stop = async () => {
    order.push('provider');
    await stop();
  };
  const factory = vi.fn().mockResolvedValue(adapter);
  const config = parseEnvironment({
    DATABASE_URL: 'postgresql://fixture:fixture@localhost/fixture',
    MESSAGING_PROVIDER: 'mock',
    WHATSAPP_ENABLED: 'true',
  });
  const app = buildApp(
    config,
    {
      checkConnection: async () => {},
      disconnect: async () => {
        order.push('database');
      },
    },
    { whatsappEvents: store, messagingAdapterFactory: factory, logger: false },
  );
  await app.listen({ host: '127.0.0.1', port: 0 });
  expect(factory).toHaveBeenCalledOnce();
  expect(adapter.connected()).toBe(true);
  await app.close();
  expect(order).toEqual(['provider', 'database']);
});
it('initializes a selected Baileys runtime through its isolated adapter seam', async () => {
  const store = fakeStore();
  const adapter = createMockAdapter([], callbacksFixture());
  const baileys = { ...adapter, provider: 'baileys' as const };
  const start = vi.spyOn(baileys, 'start');
  const runtime = createMessagingRuntime(
    { provider: 'baileys', testBotEnabled: false, testRecipients: [] },
    store,
    true,
    vi.fn(),
    { adapterFactory: async () => baileys },
  );
  await runtime.start();
  expect(start).toHaveBeenCalledOnce();
  await runtime.stop();
});
it('waits for an in-progress provider start before completing shutdown', async () => {
  const store = fakeStore();
  const adapter = createMockAdapter([], callbacksFixture());
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const runtime = createMessagingRuntime(
    { provider: 'mock', testBotEnabled: false, testRecipients: [] },
    store,
    true,
    vi.fn(),
    {
      adapterFactory: async () => {
        await pending;
        return adapter;
      },
    },
  );
  const start = runtime.start();
  const stop = runtime.stop();
  release();
  await Promise.all([start, stop]);
  expect(adapter.connected()).toBe(false);
  expect(store.claim).not.toHaveBeenCalled();
});
