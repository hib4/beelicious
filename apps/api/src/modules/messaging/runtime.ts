import type { ConversationHandler } from '../conversation/engine.js';
import type { WhatsAppEventStore } from '@beelicious/database';
import type { MessagingConfig } from '../../config.js';
import {
  incomingEvents,
  deliveryEvents,
  storedIncomingSchema,
} from './inbox.js';
import type { AdapterCallbacks, MessagingAdapter } from './types.js';
import { createInboxWorker, type Worker } from './worker.js';
import { createMockAdapter } from './providers/mock.js';

export interface MessagingRuntime {
  start(): Promise<void>;
  stop(): Promise<void>;
}
export function createMessagingRuntime(
  config: MessagingConfig,
  store: WhatsAppEventStore,
  development: boolean,
  warn: (event: string) => void,
  dependencies: {
    conversation?: ConversationHandler;
    adapterFactory?: (callbacks: AdapterCallbacks) => Promise<MessagingAdapter>;
    now?: () => Date;
    qr?: (value: string) => void;
  } = {},
): MessagingRuntime {
  let adapter: MessagingAdapter | undefined;
  let worker: Worker | undefined;
  let startup: Promise<void> | undefined;
  let stopping = false;
  const callbacks: AdapterCallbacks = {
    receive: async (messages) =>
      store.receive(incomingEvents(messages, !!dependencies.conversation)),
    delivery: async (updates) => store.receive(deliveryEvents(updates)),
    warn,
  };
  async function start() {
    if (stopping) return;
    if (dependencies.adapterFactory)
      adapter = await dependencies.adapterFactory(callbacks);
    else if (config.provider === 'mock')
      adapter = createMockAdapter(config.testRecipients, callbacks);
    else if (config.provider === 'baileys') {
      // Loading an inactive provider must never initialize its native dependencies.
      const { createBaileysAdapter } =
        await import('./providers/baileys/index.js');
      adapter = createBaileysAdapter(config, callbacks, {
        ...(dependencies.now
          ? { now: () => dependencies.now!().getTime() }
          : {}),
        ...(dependencies.qr ? { qr: dependencies.qr } : {}),
      });
    } else throw new Error('Cloud API uses the preserved webhook runtime');
    if (adapter.provider !== config.provider)
      throw new Error('Messaging provider mismatch');
    const active = adapter;
    worker = createInboxWorker(
      store,
      active,
      {
        enabled: development && config.testBotEnabled,
        conversation: dependencies.conversation,
        scope: () => {
          const accountId = active.accountId();
          return accountId
            ? {
                provider: active.provider,
                accountId,
                conversationEnabled: !!dependencies.conversation,
              }
            : undefined;
        },
        decode(data) {
          const parsed = storedIncomingSchema.safeParse(data);
          if (
            !parsed.success ||
            parsed.data.provider !== active.provider ||
            parsed.data.accountId !== active.accountId() ||
            (parsed.data.conversation &&
              (parsed.data.conversation.provider !== parsed.data.provider ||
                parsed.data.conversation.accountId !== parsed.data.accountId ||
                parsed.data.conversation.senderId !== parsed.data.senderId))
          )
            return undefined;
          return parsed.data;
        },
      },
      warn,
      dependencies.now,
    );
    await adapter.start();
    if (!stopping) worker.start();
  }
  return {
    start() {
      startup ??= start();
      return startup;
    },
    async stop() {
      stopping = true;
      await startup?.catch(() => {});
      adapter?.pause();
      try {
        await worker?.stop();
      } finally {
        await adapter?.stop();
      }
    },
  };
}
