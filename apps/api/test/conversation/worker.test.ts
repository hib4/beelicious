import { expect, it, vi } from 'vitest';
import { createInboxWorker } from '../../src/modules/messaging/worker.js';
import {
  incomingEvents,
  storedIncomingSchema,
} from '../../src/modules/messaging/inbox.js';
import { createMockAdapter } from '../../src/modules/messaging/providers/mock.js';
import { incoming, callbacksFixture, PHONE } from '../messaging/fixtures.js';
import { fakeStore } from '../whatsapp/fixtures.js';

it('bounds preparation failures, emits sanitized logs and never sends an uncommitted response', async () => {
  const store = fakeStore(),
    warn = vi.fn();
  const data = incomingEvents(
    [incoming({ text: 'Menu', timestamp: Date.now() })],
    true,
  )[0]!.data;
  const handler = {
    handleIncomingMessage: vi
      .fn()
      .mockRejectedValue(new Error('private db detail')),
  };
  const adapter = createMockAdapter([PHONE], callbacksFixture());
  await adapter.start();
  const worker = createInboxWorker(
    store,
    adapter,
    {
      enabled: true,
      conversation: handler,
      scope: () => ({
        provider: 'mock',
        accountId: 'local-mock',
        conversationEnabled: true,
      }),
      decode(data) {
        const p = storedIncomingSchema.safeParse(data);
        return p.success ? p.data : undefined;
      },
    },
    warn,
  );
  try {
    for (const attempts of [1, 5]) {
      store.claim.mockResolvedValueOnce({
        id: 'fixture',
        data,
        kind: 'message',
        attempts: 0,
        preparationAttempts: attempts,
      });
      await worker.tick();
      expect(store.finish.mock.calls.at(-1)![2]).toMatchObject({
        state: attempts === 5 ? 'failed' : 'pending',
        lastError: 'conversation_preparation_failed',
      });
    }
    expect(warn.mock.calls.flat()).toEqual([
      'conversation_preparation_failed',
      'conversation_preparation_failed',
    ]);
    expect(adapter.outgoing).toHaveLength(0);
    expect(store.beginSend).not.toHaveBeenCalled();
  } finally {
    await worker.stop();
    await adapter.stop();
  }
});
it('checks approval again after preparation and suppresses sending on revocation', async () => {
  const store = fakeStore();
  const data = incomingEvents(
    [incoming({ text: 'Menu', timestamp: Date.now() })],
    true,
  )[0]!.data;
  store.claim.mockResolvedValueOnce({
    id: 'fixture',
    data,
    kind: 'message',
    attempts: 0,
    preparationAttempts: 1,
  });
  const adapter = createMockAdapter([PHONE], callbacksFixture());
  await adapter.start();
  const approved = vi
    .spyOn(adapter, 'approved')
    .mockResolvedValueOnce(true)
    .mockResolvedValueOnce(false);
  const handler = {
    handleIncomingMessage: vi.fn().mockResolvedValue('Prepared response'),
  };
  const worker = createInboxWorker(
    store,
    adapter,
    {
      enabled: true,
      conversation: handler,
      scope: () => ({
        provider: 'mock',
        accountId: 'local-mock',
        conversationEnabled: true,
      }),
      decode(data) {
        const p = storedIncomingSchema.safeParse(data);
        return p.success ? p.data : undefined;
      },
    },
    vi.fn(),
  );
  try {
    await worker.tick();
    expect(approved).toHaveBeenCalledTimes(2);
    expect(store.finish).toHaveBeenCalledWith('fixture', expect.any(String), {
      state: 'ignored',
    });
    expect(adapter.outgoing).toHaveLength(0);
  } finally {
    await worker.stop();
    await adapter.stop();
  }
});
