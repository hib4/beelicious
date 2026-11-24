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
    expect(warn.mock.calls).toHaveLength(2);
    for (const call of warn.mock.calls) {
      expect(call).toEqual([
        'conversation_preparation_failed',
        {
          category: 'unknown',
          stage: 'unknown',
          elapsedMs: expect.any(Number),
        },
      ]);
    }
    expect(JSON.stringify(warn.mock.calls)).not.toContain('private db detail');
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
function latencyFixture() {
  const store = fakeStore();
  const data = incomingEvents(
    [incoming({ text: 'Menu', timestamp: Date.now() })],
    true,
  )[0]!.data;
  const event = (id: string) => ({
    id,
    data,
    kind: 'message' as const,
    attempts: 0,
    preparationAttempts: 0,
  });
  const processed = vi.fn();
  const adapter = createMockAdapter([PHONE], callbacksFixture());
  const worker = createInboxWorker(
    store,
    adapter,
    {
      enabled: true,
      conversation: {
        handleIncomingMessage: vi.fn().mockResolvedValue('Prepared response'),
      },
      scope: () => ({
        provider: 'mock',
        accountId: 'local-mock',
        conversationEnabled: true,
      }),
      decode(data) {
        const p = storedIncomingSchema.safeParse(data);
        return p.success ? p.data : undefined;
      },
      processed,
    },
    vi.fn(),
  );
  return { store, event, adapter, worker, processed };
}
it('drains queued messages without waiting for the idle poll interval', async () => {
  const f = latencyFixture();
  f.store.claim
    .mockResolvedValueOnce(f.event('first') as never)
    .mockResolvedValueOnce(f.event('second') as never);
  await f.adapter.start();
  const started = Date.now();
  try {
    f.worker.start();
    await vi.waitFor(() => expect(f.adapter.outgoing).toHaveLength(2), {
      timeout: 700,
      interval: 10,
    });
    expect(Date.now() - started).toBeLessThan(700);
    expect(f.processed).toHaveBeenCalledTimes(2);
  } finally {
    await f.worker.stop();
    await f.adapter.stop();
  }
});
it('wakes an idle worker immediately when new ingress is committed', async () => {
  const f = latencyFixture();
  await f.adapter.start();
  try {
    f.worker.start();
    await vi.waitFor(() => expect(f.store.claim).toHaveBeenCalled(), {
      timeout: 200,
      interval: 5,
    });
    // The worker is now sleeping for the idle interval.
    await new Promise((resolve) => setTimeout(resolve, 20));
    f.store.claim.mockResolvedValueOnce(f.event('woken') as never);
    const woken = Date.now();
    f.worker.wake();
    await vi.waitFor(() => expect(f.adapter.outgoing).toHaveLength(1), {
      timeout: 500,
      interval: 5,
    });
    expect(Date.now() - woken).toBeLessThan(500);
  } finally {
    await f.worker.stop();
    await f.adapter.stop();
  }
});
