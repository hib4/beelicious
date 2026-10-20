import { expect, it, vi } from 'vitest';
import { createWorker, GREETING } from '../../src/modules/whatsapp/worker.js';
import {
  WhatsAppSendError,
  type TextSender,
} from '../../src/modules/whatsapp/client.js';
import { fakeStore, NOW, whatsapp } from './fixtures.js';
function setup(override: Record<string, unknown> = {}, attempts = 0) {
  const store = fakeStore();
  store.claim.mockResolvedValueOnce({
    id: 'event',
    kind: 'message',
    attempts,
    data: {
      wabaId: whatsapp.wabaId,
      phoneNumberId: whatsapp.phoneNumberId,
      sender: '15555550101',
      greeting: true,
      timestamp: NOW.getTime(),
      ...override,
    },
  });
  const sender = {
    sendTextMessage: vi
      .fn<TextSender['sendTextMessage']>()
      .mockResolvedValue('outbound'),
  };
  const warn = vi.fn();
  const worker = createWorker(store, sender, whatsapp, true, warn, () => NOW);
  return { store, sender, worker, warn };
}
it('records sending before HTTP and completes with the outbound ID', async () => {
  const { store, sender, worker } = setup();
  await worker.tick();
  expect(sender.sendTextMessage).toHaveBeenCalledWith(
    '15555550101',
    GREETING,
    expect.any(AbortSignal),
  );
  expect(store.beginSend.mock.invocationCallOrder[0]).toBeLessThan(
    sender.sendTextMessage.mock.invocationCallOrder[0]!,
  );
  expect(store.finish).toHaveBeenCalledWith('event', expect.any(String), {
    state: 'completed',
    outboundMessageId: 'outbound',
  });
});
it.each([
  { sender: '15555550102' },
  { wabaId: 'other-account' },
  { phoneNumberId: 'other-phone' },
  { greeting: false },
  { timestamp: NOW.getTime() - 86400000 },
  { timestamp: NOW.getTime() + 600000 },
])('ignores ineligible messages: %j', async (override) => {
  const { store, sender, worker } = setup(override);
  await worker.tick();
  expect(sender.sendTextMessage).not.toHaveBeenCalled();
  expect(store.finish).toHaveBeenCalledWith('event', expect.any(String), {
    state: 'ignored',
  });
});
it('never replies to statuses', async () => {
  const { store, sender, worker } = setup();
  store.claim.mockReset().mockResolvedValueOnce({
    id: 'status',
    kind: 'status',
    data: {},
    attempts: 0,
  });
  await worker.tick();
  expect(sender.sendTextMessage).not.toHaveBeenCalled();
  expect(store.finish).toHaveBeenCalledWith('status', expect.any(String), {
    state: 'completed',
  });
});
it('suppresses the bot when disabled or outside development', async () => {
  for (const development of [false, true]) {
    const { store, sender } = setup();
    const worker = createWorker(
      store,
      sender,
      { ...whatsapp, testBotEnabled: !development },
      development,
      vi.fn(),
      () => NOW,
    );
    await worker.tick();
    expect(sender.sendTextMessage).not.toHaveBeenCalled();
  }
});
it('does not send after losing the claim', async () => {
  const { store, sender, worker } = setup();
  store.beginSend.mockResolvedValueOnce(false);
  await worker.tick();
  expect(sender.sendTextMessage).not.toHaveBeenCalled();
});
it('schedules safe rejection retries durably rather than sleeping', async () => {
  const { store, sender, worker } = setup();
  sender.sendTextMessage.mockRejectedValueOnce(
    new WhatsAppSendError('rate_limit', true, true, 2000, 429, 130429),
  );
  await worker.tick();
  expect(store.finish).toHaveBeenCalledWith('event', expect.any(String), {
    state: 'pending',
    availableAt: new Date(NOW.getTime() + 2000),
    lastError: 'rate_limit:429:130429',
  });
});
it.each([2, 3])(
  'stops safe retries after the bounded attempt budget: %i',
  async (attempts) => {
    const { store, sender, worker } = setup({}, attempts);
    sender.sendTextMessage.mockRejectedValueOnce(
      new WhatsAppSendError('rate_limit', true, true),
    );
    await worker.tick();
    expect(store.finish).toHaveBeenCalledWith(
      'event',
      expect.any(String),
      expect.objectContaining({ state: 'failed' }),
    );
  },
);
it('does not retry early when Retry-After exceeds the supported delay', async () => {
  const { store, sender, worker } = setup();
  sender.sendTextMessage.mockRejectedValueOnce(
    new WhatsAppSendError('rate_limit', true, true, 61000),
  );
  await worker.tick();
  expect(store.finish).toHaveBeenCalledWith(
    'event',
    expect.any(String),
    expect.objectContaining({ state: 'failed' }),
  );
});
it.each(['authentication', 'uncertain'] as const)(
  'does not reschedule %s failures',
  async (category) => {
    const { store, sender, worker } = setup();
    sender.sendTextMessage.mockRejectedValueOnce(
      new WhatsAppSendError(category),
    );
    await worker.tick();
    expect(store.finish).toHaveBeenCalledWith(
      'event',
      expect.any(String),
      expect.objectContaining({
        state: category === 'uncertain' ? 'uncertain' : 'failed',
      }),
    );
  },
);
it('coalesces concurrent ticks in one worker', async () => {
  const { store, sender, worker } = setup();
  await Promise.all([worker.tick(), worker.tick()]);
  expect(store.claim).toHaveBeenCalledOnce();
  expect(sender.sendTextMessage).toHaveBeenCalledOnce();
});
it('aborts in-flight sending on shutdown and records uncertainty', async () => {
  const { store, sender, worker } = setup();
  sender.sendTextMessage.mockImplementationOnce(
    (_recipient, _text, signal?: AbortSignal) =>
      new Promise((_resolve, reject) =>
        signal?.addEventListener(
          'abort',
          () => reject(new WhatsAppSendError('uncertain')),
          { once: true },
        ),
      ),
  );
  const running = worker.tick();
  await vi.waitFor(() => expect(sender.sendTextMessage).toHaveBeenCalledOnce());
  await worker.stop();
  await running;
  expect(store.finish).toHaveBeenCalledWith(
    'event',
    expect.any(String),
    expect.objectContaining({ state: 'uncertain' }),
  );
});
