import { sendCloudImage } from '../images.js';
import type { WhatsAppConfig } from '../../../config.js';
import {
  createWhatsAppClient,
  WhatsAppSendError,
  type TextSender,
} from '../../whatsapp/client.js';
import {
  MessagingError,
  phoneSchema,
  textSchema,
  type MessagingAdapter,
} from '../types.js';

export function cloudAccountId(config: WhatsAppConfig): string {
  return `${config.wabaId}:${config.phoneNumberId}`;
}
export function createCloudAdapter(
  config: WhatsAppConfig,
  sender: TextSender = createWhatsAppClient(config),
): MessagingAdapter {
  return {
    provider: 'cloud-api',
    accountId: () => cloudAccountId(config),
    connected: () => true,
    async start() {},
    pause() {},
    async stop() {},
    async approved(chatId) {
      return config.testRecipients.includes(chatId);
    },
    sendImage: (message, signal) => sendCloudImage(config, message, signal),
    async sendText(message, signal) {
      if (
        !phoneSchema.safeParse(message.chatId).success ||
        !textSchema.safeParse(message.text).success
      )
        throw new MessagingError('invalid_input');
      try {
        const messageId = await sender.sendTextMessage(
          message.chatId,
          message.text,
          signal,
        );
        return {
          provider: 'cloud-api',
          status: 'accepted',
          ...(messageId ? { messageId } : {}),
        };
      } catch (error) {
        if (error instanceof WhatsAppSendError) {
          throw new MessagingError(
            error.category,
            error.retryable,
            error.safeToRetry,
            error.retryAfterMs,
            error.httpStatus,
            error.metaCode,
          );
        }
        throw new MessagingError('uncertain');
      }
    },
  };
}
