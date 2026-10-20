import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { ReceivedEvent } from '@beelicious/database';
import type { WhatsAppConfig } from '../../config.js';

const id = z.string().min(1).max(512);
const timestamp = z.string().regex(/^\d{1,12}$/);
const messageSchema = z
  .object({
    id,
    from: z.string().regex(/^[1-9]\d{6,14}$/),
    timestamp,
    type: z.string(),
    text: z.object({ body: z.string().max(4096) }).optional(),
  })
  .refine((value) => value.type !== 'text' || value.text !== undefined);
const statusSchema = z.object({
  id,
  status: id,
  timestamp,
  errors: z.array(z.object({ code: z.number().int() })).optional(),
});
const envelopeSchema = z.object({
  object: z.string(),
  entry: z
    .array(
      z.object({
        id,
        changes: z.array(z.object({ field: z.string(), value: z.unknown() })),
      }),
    )
    .optional(),
});
const valueSchema = z.object({
  messaging_product: z.literal('whatsapp'),
  metadata: z.object({
    phone_number_id: id,
    display_phone_number: z.string().optional(),
  }),
  messages: z.array(messageSchema).optional(),
  statuses: z.array(statusSchema).optional(),
});
export const storedMessageSchema = z.object({
  wabaId: id,
  phoneNumberId: id,
  sender: z.string().regex(/^[1-9]\d{6,14}$/),
  greeting: z.boolean(),
  timestamp: z.number().finite(),
});

function key(parts: unknown[]): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}
export function parsePayload(
  payload: unknown,
  config: WhatsAppConfig,
): ReceivedEvent[] {
  const object = z.object({ object: z.string() }).parse(payload);
  if (object.object !== 'whatsapp_business_account') return [];
  const envelope = envelopeSchema.parse(payload);
  if (!envelope.entry) throw new Error('Missing entries');
  const events: ReceivedEvent[] = [];
  for (const entry of envelope.entry) {
    if (entry.id !== config.wabaId) continue;
    for (const change of entry.changes) {
      if (change.field !== 'messages') continue;
      const value = valueSchema.parse(change.value);
      if (value.metadata.phone_number_id !== config.phoneNumberId) continue;
      const scope = [entry.id, value.metadata.phone_number_id];
      for (const message of value.messages ?? []) {
        const normalized = message.text?.body.trim().toLowerCase();
        const isSelf =
          message.from ===
          value.metadata.display_phone_number?.replace(/\D/g, '');
        // Classify only the greeting; never retain arbitrary text or contact profiles.
        const greeting =
          !isSelf &&
          message.type === 'text' &&
          (normalized === 'halo' || normalized === 'hi');
        events.push({
          dedupKey: key(['message', ...scope, message.id]),
          kind: 'message',
          data: {
            wabaId: entry.id,
            phoneNumberId: value.metadata.phone_number_id,
            sender: message.from,
            greeting,
            timestamp: Number(message.timestamp) * 1000,
          },
        });
      }
      for (const status of value.statuses ?? []) {
        const codes = [
          ...new Set((status.errors ?? []).map((error) => error.code)),
        ].sort((a, b) => a - b);
        events.push({
          dedupKey: key([
            'status',
            ...scope,
            status.id,
            status.status,
            status.timestamp,
            codes,
          ]),
          kind: 'status',
          data: {
            messageId: status.id,
            status: status.status,
            timestamp: status.timestamp,
            errorCodes: codes,
          },
        });
      }
    }
  }
  return events;
}
