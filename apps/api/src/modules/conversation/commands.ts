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
      'check',
      'resend',
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
// Friendly aliases map onto the fixed command classes; raw text is never stored.
const aliases: Record<string, Command['kind']> = {
  halo: 'start',
  hallo: 'start',
  helo: 'start',
  hello: 'start',
  hai: 'start',
  hi: 'start',
  hey: 'start',
  p: 'start',
  mulai: 'start',
  menu: 'start',
  pesan: 'start',
  order: 'start',
  '0': 'back',
  kembali: 'back',
  back: 'back',
  batal: 'cancel',
  cancel: 'cancel',
  keranjang: 'cart',
  'lihat keranjang': 'cart',
  cart: 'cart',
  cek: 'check',
  'cek pembayaran': 'check',
  status: 'check',
  'kirim ulang qr': 'resend',
  bantuan: 'help',
  help: 'help',
  tolong: 'help',
  '?': 'help',
};
export function parseCommand(text: string): Command {
  const raw = text.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!raw) return { kind: 'empty' };
  if (raw === '?') return { kind: 'help' };
  // Tolerate "1.", "1)", "#1", "Halo!" and trailing emoji without guessing words.
  const input = raw
    .replace(/^[#*_~\s]+/u, '')
    .replace(/[\s.,!?;:)*_~\p{Extended_Pictographic}️]+$/u, '');
  if (!input) return { kind: 'invalid' };
  const kind = aliases[input];
  if (kind && kind !== 'select') return { kind } as Command;
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
