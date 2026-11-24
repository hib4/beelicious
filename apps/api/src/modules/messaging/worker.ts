import { performance } from 'node:perf_hooks';
import {
  type PreparationLogger,
  preparationDiagnostic,
} from '../conversation/diagnostics.js';
import type { ConversationInput } from '../conversation/commands.js';
import type { ConversationHandler } from '../conversation/engine.js';
import { randomUUID } from 'node:crypto';
import type { EventScope, WhatsAppEventStore } from '@beelicious/database';
import { GREETING, MessagingError, type MessagingAdapter } from './types.js';

export interface Worker {
  start(): void;
  tick(): Promise<void>;
  /** Poll now instead of waiting for the idle interval (e.g. after ingress). */
  wake(): void;
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
  /** Called after a claimed event was handled, e.g. to wake dependent workers. */
  processed?(): void;
}
export function createInboxWorker(
  store: WhatsAppEventStore,
  adapter: MessagingAdapter,
  policy: WorkerPolicy,
  warn: PreparationLogger,
  now: () => Date = () => new Date(),
): Worker {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let active: Promise<void> | undefined;
  let stopping = false;
  let started = false;
  let polling = false;
  let wakeRequested = false;
  // True when the last run claimed work, so the queue drains without idle waits.
  let claimedLast = false;
  const controller = new AbortController();
  async function run() {
    const scope = policy.scope();
    if (!scope || !adapter.connected()) return;
    const token = randomUUID();
    const event = await store.claim(now(), token, scope);
    if (!event) return;
    claimedLast = true;
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
      const preparingAt = performance.now();
      try {
        text = await policy.conversation.handleIncomingMessage(
          event.id,
          token,
          message.conversation,
        );
      } catch (error) {
        warn(
          'conversation_preparation_failed',
          preparationDiagnostic(error, performance.now() - preparingAt),
        );
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
    claimedLast = false;
    active = run()
      .catch(() => {
        warn('whatsapp_worker_storage_failure');
      })
      .finally(() => {
        active = undefined;
        if (claimedLast) policy.processed?.();
      });
    return active;
  }
  async function poll() {
    polling = true;
    timer = undefined;
    try {
      await tick();
    } finally {
      polling = false;
    }
    if (!stopping) {
      const again = claimedLast || wakeRequested;
      wakeRequested = false;
      timer = setTimeout(
        () => {
          void poll();
        },
        again ? 0 : 1000,
      );
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
    wake() {
      if (!started || stopping) return;
      if (polling) {
        wakeRequested = true;
        return;
      }
      if (timer) clearTimeout(timer);
      void poll();
    },
    async stop() {
      stopping = true;
      if (timer) clearTimeout(timer);
      controller.abort();
      await active;
    },
  };
}
