import type { ConversationInput } from '../conversation/commands.js';
import type { ConversationHandler } from '../conversation/engine.js';
import { randomUUID } from 'node:crypto';
import type { EventScope, WhatsAppEventStore } from '@beelicious/database';
import { GREETING, MessagingError, type MessagingAdapter } from './types.js';

export interface Worker {
  start(): void;
  tick(): Promise<void>;
  stop(): Promise<void>;
}
export interface WorkMessage {
  chatId: string;
  senderPhone?: string | undefined;
  greeting: boolean;
  conversation?: ConversationInput | undefined;
  timestamp: number;
}
export interface WorkerPolicy {
  enabled: boolean;
  conversation?: ConversationHandler | undefined;
  scope(): EventScope | undefined;
  decode(data: unknown): WorkMessage | undefined;
}
export function createInboxWorker(
  store: WhatsAppEventStore,
  adapter: MessagingAdapter,
  policy: WorkerPolicy,
  warn: (event: string) => void,
  now: () => Date = () => new Date(),
): Worker {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let active: Promise<void> | undefined;
  let stopping = false;
  let started = false;
  const controller = new AbortController();
  async function run() {
    const scope = policy.scope();
    if (!scope || !adapter.connected()) return;
    const token = randomUUID();
    const event = await store.claim(now(), token, scope);
    if (!event) return;
    const finish = (result: Parameters<WhatsAppEventStore['finish']>[2]) =>
      store.finish(event.id, token, result);
    if (event.kind === 'status') {
      await finish({ state: 'completed' });
      return;
    }
    const message = policy.decode(event.data);
    if (!message) {
      await finish({ state: 'failed', lastError: 'invalid_stored_event' });
      return;
    }
    const age = now().getTime() - message.timestamp;
    if (
      event.kind !== 'message' ||
      !policy.enabled ||
      (!message.conversation && !message.greeting) ||
      message.conversation?.command.kind === 'empty' ||
      age >= 86400000 ||
      age < -300000 ||
      !(await adapter.approved(message.chatId, message.senderPhone))
    ) {
      await finish({ state: 'ignored' });
      return;
    }
    if (event.attempts >= 3) {
      await finish({ state: 'failed', lastError: 'attempts_exhausted' });
      return;
    }
    let text = GREETING;
    if (message.conversation) {
      if (!policy.conversation) return;
      if ((event.preparationAttempts ?? 0) > 5) {
        await finish({
          state: 'failed',
          lastError: 'conversation_preparation_exhausted',
        });
        return;
      }
      try {
        text = await policy.conversation.handleIncomingMessage(
          event.id,
          token,
          message.conversation,
        );
      } catch {
        warn('conversation_preparation_failed');
        await finish({
          state: (event.preparationAttempts ?? 0) >= 5 ? 'failed' : 'pending',
          availableAt: new Date(now().getTime() + 5000),
          lastError: 'conversation_preparation_failed',
        });
        return;
      }
    }
    // A disconnect during eligibility checks is still pre-send and recoverable.
    if (stopping || !adapter.connected()) return;
    if (!(await adapter.approved(message.chatId, message.senderPhone))) {
      await finish({ state: 'ignored' });
      return;
    }
    if (!(await store.beginSend(event.id, token, now()))) return;
    try {
      const result = await adapter.sendText(
        {
          chatId: message.chatId,
          text,
          ...(message.senderPhone
            ? { recipientPhone: message.senderPhone }
            : {}),
        },
        controller.signal,
      );
      await finish({
        state: 'completed',
        ...(result.messageId ? { outboundMessageId: result.messageId } : {}),
      });
    } catch (error) {
      const failure =
        error instanceof MessagingError
          ? error
          : new MessagingError('uncertain');
      const attempts = event.attempts + 1;
      const lastError = `${failure.category}:${failure.httpStatus ?? 0}:${failure.metaCode ?? 0}`;
      if (
        !stopping &&
        adapter.provider === 'cloud-api' &&
        failure.safeToRetry &&
        failure.retryable &&
        attempts < 3 &&
        failure.retryAfterMs <= 60000
      ) {
        await finish({
          state: 'pending',
          availableAt: new Date(
            now().getTime() +
              Math.max(1000 * 2 ** (attempts - 1), failure.retryAfterMs),
          ),
          lastError,
        });
      } else {
        await finish({
          state: failure.category === 'uncertain' ? 'uncertain' : 'failed',
          lastError,
        });
      }
      warn(`whatsapp_send_${failure.category}`);
    }
  }
  function tick(): Promise<void> {
    if (stopping) return Promise.resolve();
    if (active) return active;
    active = run()
      .catch(() => {
        warn('whatsapp_worker_storage_failure');
      })
      .finally(() => {
        active = undefined;
      });
    return active;
  }
  async function poll() {
    await tick();
    if (!stopping) {
      timer = setTimeout(() => {
        void poll();
      }, 1000);
      timer.unref();
    }
  }
  return {
    start() {
      if (!started && !stopping) {
        started = true;
        void poll();
      }
    },
    tick,
    async stop() {
      stopping = true;
      if (timer) clearTimeout(timer);
      controller.abort();
      await active;
    },
  };
}
