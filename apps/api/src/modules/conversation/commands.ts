import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { IncomingMessage } from '../messaging/types.js';

export const commandSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.enum([
      'start',
      'back',
      'cancel',
      'help',
      'cart',
      'invalid',
      'empty',
    ]),
  }),
  z.strictObject({
    kind: z.literal('select'),
    value: z.number().int().min(1).max(2147483647),
  }),
]);
export type Command = z.infer<typeof commandSchema>;
export function parseCommand(text: string): Command {
  const input = text.trim().toLowerCase();
  if (!input) return { kind: 'empty' };
  if (['halo', 'hi', 'mulai', 'menu'].includes(input)) return { kind: 'start' };
  if (['0', 'kembali'].includes(input)) return { kind: 'back' };
  if (input === 'batal') return { kind: 'cancel' };
  if (input === 'keranjang') return { kind: 'cart' };
  if (input === 'bantuan') return { kind: 'help' };
  if (/^[1-9]\d{0,9}$/.test(input) && Number(input) <= 2147483647)
    return { kind: 'select', value: Number(input) };
  return { kind: 'invalid' };
}
export const conversationInputSchema = z.strictObject({
  version: z.literal(1),
  provider: z.enum(['cloud-api', 'baileys', 'mock']),
  accountId: z.string().min(1).max(512),
  senderId: z.string().min(1).max(512),
  command: commandSchema,
});
export type ConversationInput = z.infer<typeof conversationInputSchema>;
export function conversationMetadata(message: IncomingMessage) {
  return {
    processingMode: 'conversation',
    streamKey: createHash('sha256')
      .update(
        JSON.stringify([message.provider, message.accountId, message.senderId]),
      )
      .digest('hex'),
    input: {
      version: 1 as const,
      provider: message.provider,
      accountId: message.accountId,
      senderId: message.senderId,
      command: parseCommand(message.text),
    },
  };
}
