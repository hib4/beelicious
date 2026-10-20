import { randomUUID } from 'node:crypto';
import type { WhatsAppEventStore } from '@beelicious/database';
import type { WhatsAppConfig } from '../../config.js';
import { WhatsAppSendError, type TextSender } from './client.js';
import { storedMessageSchema } from './payload.js';

export const GREETING =
  'Halo! Selamat datang di Beelicious 🐝\n\nKoneksi WhatsApp berhasil. Fitur pemesanan makanan akan segera tersedia.';
export interface Worker {
  start(): void;
  tick(): Promise<void>;
  stop(): Promise<void>;
}
export function createWorker(
  store: WhatsAppEventStore,
  sender: TextSender,
  config: WhatsAppConfig,
  isDevelopment: boolean,
  warn: (event: string) => void,
  now: () => Date = () => new Date(),
): Worker {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let active: Promise<void> | undefined;
  let stopping = false;
  let started = false;
  const controller = new AbortController();
  async function run() {
    const token = randomUUID();
    const event = await store.claim(now(), token);
    if (!event) return;
    const finish = (result: Parameters<WhatsAppEventStore['finish']>[2]) =>
      store.finish(event.id, token, result);
    if (event.kind === 'status') {
      await finish({ state: 'completed' });
      return;
    }
    const parsed = storedMessageSchema.safeParse(event.data);
    if (!parsed.success) {
      await finish({ state: 'failed', lastError: 'invalid_stored_event' });
      return;
    }
    const message = parsed.data;
    const age = now().getTime() - message.timestamp;
    if (
      event.kind !== 'message' ||
      message.wabaId !== config.wabaId ||
      message.phoneNumberId !== config.phoneNumberId ||
      !isDevelopment ||
      !config.testBotEnabled ||
      !message.greeting ||
      !config.testRecipients.includes(message.sender) ||
      age >= 86400000 ||
      age < -300000
    ) {
      await finish({ state: 'ignored' });
      return;
    }
    if (event.attempts >= 3) {
      await finish({ state: 'failed', lastError: 'attempts_exhausted' });
      return;
    }
    if (stopping) return; // The lease will make unsent work recoverable.
    if (!(await store.beginSend(event.id, token, now()))) return;
    try {
      const messageId = await sender.sendTextMessage(
        message.sender,
        GREETING,
        controller.signal,
      );
      await finish({
        state: 'completed',
        ...(messageId ? { outboundMessageId: messageId } : {}),
      });
    } catch (error) {
      const failure =
        error instanceof WhatsAppSendError
          ? error
          : new WhatsAppSendError('uncertain', true);
      const attempts = event.attempts + 1;
      const lastError = `${failure.category}:${failure.httpStatus ?? 0}:${failure.metaCode ?? 0}`;
      if (
        !stopping &&
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
