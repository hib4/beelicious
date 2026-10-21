import { expect, it, vi } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { buildApp } from '../src/app.js';
import { parseEnvironment, parseHttpEnvironment } from '../src/config.js';
import { createHttpHandler } from '../src/http-handler.js';
import { createBackgroundRuntime } from '../src/runtime.js';
import { createMockAdapter } from '../src/modules/messaging/providers/mock.js';
import { fakeStore } from './whatsapp/fixtures.js';

const base = { DATABASE_URL: 'postgresql://fixture:fixture@localhost/fixture' };
const hosted = {
  ...base,
  NODE_ENV: 'production',
  PAYMENT_WEBHOOK_ENABLED: 'true',
  PAYMENT_PROVIDER: 'midtrans',
  MIDTRANS_ENVIRONMENT: 'sandbox',
  MIDTRANS_SERVER_KEY: 'SB-private-fixture',
  MIDTRANS_MERCHANT_ID: 'fixture-merchant',
};
it('enables signed Sandbox webhook intake without enabling production checkout or messaging', () => {
  const config = parseHttpEnvironment(hosted);
  expect(config.paymentWebhook).toEqual({
    provider: 'midtrans',
    serverKey: hosted.MIDTRANS_SERVER_KEY,
    merchantId: hosted.MIDTRANS_MERCHANT_ID,
  });
  expect(config.checkout).toBeUndefined();
  expect(config.messaging).toBeUndefined();
  expect(config.conversationEnabled).toBeUndefined();
});
it.each([
  'WHATSAPP_ENABLED',
  'WHATSAPP_TEST_BOT_ENABLED',
  'CONVERSATION_ENABLED',
  'CHECKOUT_ENABLED',
])(
  'rejects %s in the hosted HTTP entrypoint before allocating resources',
  (flag) => {
    expect(() => parseHttpEnvironment({ ...base, [flag]: 'true' })).toThrow(
      flag,
    );
  },
);
it.each([
  { PAYMENT_PROVIDER: 'mock' },
  { MIDTRANS_ENVIRONMENT: 'production' },
  { MIDTRANS_SERVER_KEY: 'private-invalid-secret' },
  { MIDTRANS_MERCHANT_ID: '' },
  { PAYMENT_WEBHOOK_ENABLED: 'yes' },
])(
  'rejects invalid webhook configuration without leaking credentials',
  (override) => {
    expect(() => parseHttpEnvironment({ ...hosted, ...override })).toThrow(
      /^Invalid environment configuration:/,
    );
    try {
      parseHttpEnvironment({ ...hosted, ...override });
    } catch (error) {
      expect(String(error)).not.toMatch(
        /private-invalid-secret|SB-private-fixture/,
      );
    }
  },
);
it('keeps inactive webhook credentials optional', () => {
  expect(
    parseHttpEnvironment({ ...base, MIDTRANS_SERVER_KEY: 'invalid' })
      .paymentWebhook,
  ).toBeUndefined();
});
it('an HTTP-only application never constructs the configured adapter', async () => {
  const factory = vi.fn();
  const disconnect = vi.fn();
  const app = buildApp(
    parseEnvironment({
      ...base,
      MESSAGING_PROVIDER: 'baileys',
      WHATSAPP_ENABLED: 'true',
    }),
    {
      checkConnection: async () => {},
      disconnect,
    },
    { background: false, messagingAdapterFactory: factory, logger: false },
  );
  try {
    await app.ready();
    expect((await app.inject('/health')).statusCode).toBe(200);
    await app.server.emit('listening');
    expect(factory).not.toHaveBeenCalled();
  } finally {
    await app.close();
  }
  expect(disconnect).toHaveBeenCalledOnce();
});
it('caches one HTTP application across concurrent function invocations', async () => {
  const app = buildApp(
    parseHttpEnvironment(base),
    { checkConnection: async () => {}, disconnect: async () => {} },
    { background: false, logger: false },
  );
  await app.ready();
  const emit = vi.spyOn(app.server, 'emit').mockReturnValue(true);
  const initialize = vi.fn().mockResolvedValue(app);
  const handler = createHttpHandler(initialize);
  const request = {} as IncomingMessage;
  const response = {} as ServerResponse;
  try {
    await Promise.all([handler(request, response), handler(request, response)]);
    expect(initialize).toHaveBeenCalledOnce();
    expect(emit).toHaveBeenCalledTimes(2);
  } finally {
    emit.mockRestore();
    await app.close();
  }
});
it('sanitizes failed function initialization and permits later recovery', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const initialize = vi
    .fn()
    .mockRejectedValue(new Error('postgresql://private:secret@internal'));
  const response = { statusCode: 200, setHeader: vi.fn(), end: vi.fn() };
  const handler = createHttpHandler(initialize);
  try {
    await handler({} as IncomingMessage, response as unknown as ServerResponse);
    await handler({} as IncomingMessage, response as unknown as ServerResponse);
    expect(initialize).toHaveBeenCalledTimes(2);
    expect(response.statusCode).toBe(503);
    expect(JSON.stringify(response.end.mock.calls)).not.toMatch(
      /secret|private|internal/,
    );
    expect(log).toHaveBeenCalledWith('HTTP initialization failed');
  } finally {
    log.mockRestore();
  }
});
it('starts and stops a background adapter without any HTTP listener, once only', async () => {
  const store = fakeStore();
  const adapter = createMockAdapter([], {
    receive: async () => {},
    delivery: async () => {},
    warn: () => {},
  });
  const start = vi.spyOn(adapter, 'start');
  const stop = vi.spyOn(adapter, 'stop');
  const config = parseEnvironment({
    ...base,
    WHATSAPP_ENABLED: 'true',
    MESSAGING_PROVIDER: 'mock',
  });
  const runtime = createBackgroundRuntime(
    config,
    { checkConnection: async () => {}, disconnect: vi.fn() },
    {
      whatsappEvents: store,
      messagingAdapterFactory: async () => adapter,
    },
  );
  expect(start).not.toHaveBeenCalled();
  await Promise.all([runtime.start(), runtime.start()]);
  expect(adapter.connected()).toBe(true);
  await Promise.all([runtime.stop(), runtime.stop()]);
  expect(start).toHaveBeenCalledOnce();
  expect(stop).toHaveBeenCalledOnce();
  expect(adapter.connected()).toBe(false);
});
it('cleans a partially started provider after startup failure', async () => {
  const adapter = createMockAdapter([], {
    receive: async () => {},
    delivery: async () => {},
    warn: () => {},
  });
  vi.spyOn(adapter, 'start').mockRejectedValue(
    new Error('fixture startup failure'),
  );
  const stop = vi.spyOn(adapter, 'stop');
  const runtime = createBackgroundRuntime(
    parseEnvironment({
      ...base,
      WHATSAPP_ENABLED: 'true',
      MESSAGING_PROVIDER: 'mock',
    }),
    {
      checkConnection: async () => {},
      disconnect: vi.fn(),
    },
    {
      whatsappEvents: fakeStore(),
      messagingAdapterFactory: async () => adapter,
    },
  );
  await expect(runtime.start()).rejects.toThrow('fixture startup failure');
  await runtime.stop();
  expect(stop).toHaveBeenCalledOnce();
});

it('uses the same configurable pickup settings for hosted dashboard HTTP without enabling checkout', () => {
  const config = parseHttpEnvironment({
    ...base,
    DASHBOARD_ENABLED: 'true',
    SUPABASE_URL: 'https://fixture.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'publishable-fixture',
    PICKUP_SLOT_MINUTES: '45',
    PICKUP_SLOT_CAPACITY: '3',
    PICKUP_LEAD_MINUTES: '90',
    PICKUP_BOOKING_DAYS: '4',
  });
  expect(config.pickup).toEqual({
    slotMinutes: 45,
    capacity: 3,
    leadMinutes: 90,
    bookingDays: 4,
    timezone: 'Asia/Jakarta',
  });
  expect(config.checkout).toBeUndefined();
});
