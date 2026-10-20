import {
  conversationMetadata,
  conversationInputSchema,
} from '../conversation/commands.js';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { ReceivedEvent } from '@beelicious/database';
import {
  isGreeting,
  type DeliveryUpdate,
  type IncomingMessage,
} from './types.js';

export function eventKey(parts: unknown[]): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}
export const storedIncomingSchema = z.object({
  version: z.literal(1),
  provider: z.enum(['baileys', 'mock']),
  accountId: z.string().min(1),
  chatId: z.string().min(1),
  senderId: z.string().min(1),
  senderPhone: z.string().optional(),
  conversation: conversationInputSchema.optional(),
  greeting: z.boolean(),
  timestamp: z.number().finite(),
});
export type StoredIncoming = z.infer<typeof storedIncomingSchema>;
export function incomingEvents(
  messages: IncomingMessage[],
  conversationEnabled = false,
): ReceivedEvent[] {
  return messages.map((message) => {
    const conversation = conversationEnabled
      ? conversationMetadata(message)
      : undefined;
    return {
      ...(conversation
        ? {
            processingMode: conversation.processingMode,
            streamKey: conversation.streamKey,
          }
        : {}),
      // Message IDs are account scoped. PN/LID aliases must not split this identity.
      dedupKey: eventKey([
        'messaging',
        message.provider,
        message.accountId,
        'message',
        message.messageId,
      ]),
      kind: 'message',
      data: {
        version: 1,
        ...(conversation ? { conversation: conversation.input } : {}),
        provider: message.provider,
        accountId: message.accountId,
        chatId: message.chatId,
        senderId: message.senderId,
        ...(message.senderPhone ? { senderPhone: message.senderPhone } : {}),
        greeting: isGreeting(message.text),
        timestamp: message.timestamp,
      },
    };
  });
}
export function deliveryEvents(updates: DeliveryUpdate[]): ReceivedEvent[] {
  return updates.map((update) => ({
    dedupKey: eventKey([
      'messaging',
      update.provider,
      update.accountId,
      'status',
      update.messageId,
      update.status,
    ]),
    kind: 'status',
    data: { ...update, version: 1, errorCodes: [] },
  }));
}
