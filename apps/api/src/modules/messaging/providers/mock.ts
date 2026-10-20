import { validateImage } from '../images.js';
import {
  MessagingError,
  phoneSchema,
  textSchema,
  type IncomingMessage,
  type MessagingAdapter,
  type SendResult,
  type TextMessage,
  type AdapterCallbacks,
} from '../types.js';

export function createMockAdapter(
  allowed: string[],
  callbacks: AdapterCallbacks,
) {
  const outgoing: Array<TextMessage & SendResult> = [];
  const images: Array<{ chatId: string; caption: string; bytes: number }> = [];
  let running = false;
  const adapter: MessagingAdapter & {
    outgoing: typeof outgoing;
    images: typeof images;
    inject(messages: IncomingMessage[]): Promise<void>;
  } = {
    provider: 'mock',
    accountId: () => 'local-mock',
    connected: () => running,
    async start() {
      running = true;
    },
    pause() {
      running = false;
    },
    async stop() {
      running = false;
    },
    async approved(chatId) {
      return allowed.includes(chatId);
    },
    outgoing,
    images,
    async sendImage(message, signal) {
      validateImage(message);
      if (!running || signal?.aborted) throw new MessagingError('unavailable');
      images.push({
        chatId: message.chatId,
        caption: message.caption,
        bytes: message.image.length,
      });
      return {
        provider: 'mock',
        status: 'recorded',
        messageId: `mock-image-${images.length}`,
      };
    },
    async inject(messages) {
      if (!running) throw new MessagingError('unavailable');
      await callbacks.receive(
        messages.filter(
          (m) =>
            m.provider === 'mock' &&
            m.accountId === 'local-mock' &&
            m.direction === 'incoming' &&
            m.type === 'text',
        ),
      );
    },
    async sendText(message, signal) {
      if (
        !phoneSchema.safeParse(message.chatId).success ||
        !textSchema.safeParse(message.text).success
      )
        throw new MessagingError('invalid_input');
      if (!running || signal?.aborted) throw new MessagingError('unavailable');
      const result: SendResult = {
        provider: 'mock',
        status: 'recorded',
        messageId: `mock-${outgoing.length + 1}`,
      };
      outgoing.push({ ...message, ...result });
      return result;
    },
  };
  return adapter;
}
