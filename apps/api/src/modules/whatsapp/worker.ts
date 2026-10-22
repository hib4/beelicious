import { type PreparationLogger } from '../conversation/diagnostics.js';
import type { ConversationHandler } from '../conversation/engine.js';
import type { WhatsAppEventStore } from '@beelicious/database';
import type { WhatsAppConfig } from '../../config.js';
import type { TextSender } from './client.js';
import { storedMessageSchema } from './payload.js';
import {
  createCloudAdapter,
  cloudAccountId,
} from '../messaging/providers/cloud-api.js';
import { createInboxWorker, type Worker } from '../messaging/worker.js';
export { GREETING } from '../messaging/types.js';
export type { Worker } from '../messaging/worker.js';

/** Compatibility entrypoint for the existing Cloud API worker. */
export function createWorker(
  store: WhatsAppEventStore,
  sender: TextSender,
  config: WhatsAppConfig,
  isDevelopment: boolean,
  warn: PreparationLogger,
  now: () => Date = () => new Date(),
  conversation?: ConversationHandler,
): Worker {
  const adapter = createCloudAdapter(config, sender);
  return createInboxWorker(
    store,
    adapter,
    {
      enabled: isDevelopment && config.testBotEnabled,
      conversation,
      scope: () => ({
        provider: 'cloud-api',
        accountId: cloudAccountId(config),
        legacyCloud: config,
        conversationEnabled: !!conversation,
      }),
      decode(data) {
        const parsed = storedMessageSchema.safeParse(data);
        if (!parsed.success) return undefined;
        const m = parsed.data;
        return {
          chatId: m.sender,
          conversation:
            m.wabaId === config.wabaId &&
            m.phoneNumberId === config.phoneNumberId &&
            m.conversation?.provider === 'cloud-api' &&
            m.conversation.accountId === cloudAccountId(config) &&
            m.conversation.senderId === m.sender
              ? m.conversation
              : undefined,
          timestamp: m.timestamp,
          greeting:
            m.greeting &&
            m.wabaId === config.wabaId &&
            m.phoneNumberId === config.phoneNumberId,
        };
      },
    },
    warn,
    now,
  );
}
