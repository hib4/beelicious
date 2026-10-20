import {
  jidNormalizedUser,
  type WAMessage,
  type BaileysEventMap,
} from '@whiskeysockets/baileys';
import {
  phoneSchema,
  type IncomingMessage,
  type DeliveryUpdate,
} from '../../types.js';

export function directJid(jid: string | null | undefined): string | undefined {
  if (!jid || !/^\d+(?::\d+)?@(s\.whatsapp\.net|lid)$/.test(jid))
    return undefined;
  return jidNormalizedUser(jid);
}
export function phoneFromJid(jid: string | undefined): string | undefined {
  const normalized = directJid(jid);
  if (!normalized?.endsWith('@s.whatsapp.net')) return undefined;
  const phone = normalized.split('@')[0];
  return phoneSchema.safeParse(phone).success ? phone : undefined;
}
export function normalizeMessage(
  message: WAMessage,
  accountId: string,
  cutoff: number,
  now: number,
): IncomingMessage | undefined {
  if (
    message.key.fromMe !== false ||
    !message.key.id ||
    message.key.id.length > 512
  )
    return undefined;
  const chatId = directJid(message.key.remoteJid);
  if (
    !chatId ||
    chatId === accountId ||
    directJid(message.key.remoteJidAlt) === accountId
  )
    return undefined;
  const timestamp = Number(message.messageTimestamp) * 1000;
  if (
    !Number.isFinite(timestamp) ||
    timestamp < cutoff - 5000 ||
    timestamp > now + 5000
  )
    return undefined;
  // Only original text, never captions, protocol edits, or quoted text.
  const content = message.message;
  const text = content?.conversation ?? content?.extendedTextMessage?.text;
  if (typeof text !== 'string' || !text.trim() || text.length > 4096)
    return undefined;
  const senderPhone =
    phoneFromJid(chatId) ?? phoneFromJid(message.key.remoteJidAlt);
  return {
    provider: 'baileys',
    accountId,
    messageId: message.key.id,
    chatId,
    senderId: chatId,
    ...(senderPhone ? { senderPhone } : {}),
    text,
    timestamp,
    type: 'text',
    direction: 'incoming',
  };
}
export function normalizeDelivery(
  updates: BaileysEventMap['messages.update'],
  accountId: string,
): DeliveryUpdate[] {
  return updates.flatMap(({ key, update }) => {
    if (!key.fromMe || !key.id || !directJid(key.remoteJid)) return [];
    const status = (
      { 0: 'failed', 2: 'sent', 3: 'delivered', 4: 'read' } as const
    )[update.status as 0 | 2 | 3 | 4];
    return status
      ? [{ provider: 'baileys' as const, accountId, messageId: key.id, status }]
      : [];
  });
}
