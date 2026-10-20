import { expect, it } from 'vitest';
import {
  normalizeMessage,
  normalizeDelivery,
  directJid,
  phoneFromJid,
} from '../../src/modules/messaging/providers/baileys/normalize.js';
import { incomingEvents } from '../../src/modules/messaging/inbox.js';
import {
  ACCOUNT,
  CHAT,
  LID,
  NOW,
  PHONE,
  incoming,
  rawMessage,
} from './fixtures.js';

it('normalizes original text with opaque routing identifiers and a millisecond timestamp', () => {
  expect(normalizeMessage(rawMessage(), ACCOUNT, NOW, NOW)).toEqual({
    provider: 'baileys',
    accountId: ACCOUNT,
    messageId: 'unique-message',
    chatId: CHAT,
    senderId: CHAT,
    senderPhone: PHONE,
    text: ' Halo ',
    timestamp: NOW,
    type: 'text',
    direction: 'incoming',
  });
  expect(
    normalizeMessage(
      rawMessage({ message: { extendedTextMessage: { text: 'hi' } } }),
      ACCOUNT,
      NOW,
      NOW,
    )?.text,
  ).toBe('hi');
});
it('preserves LIDs and uses only a real alternate phone JID for approval', () => {
  const normalized = normalizeMessage(
    rawMessage({
      key: { id: 'lid', fromMe: false, remoteJid: LID, remoteJidAlt: CHAT },
    }),
    ACCOUNT,
    NOW,
    NOW,
  );
  expect(normalized).toMatchObject({
    chatId: LID,
    senderId: LID,
    senderPhone: PHONE,
  });
  expect(phoneFromJid(LID)).toBeUndefined();
  expect(directJid(`${PHONE}:12@s.whatsapp.net`)).toBe(CHAT);
});
it.each([
  rawMessage({ key: { id: 'self', remoteJid: CHAT, fromMe: true } }),
  rawMessage({ key: { id: 'unknown-direction', remoteJid: CHAT } }),
  ...[
    '123@g.us',
    'status@broadcast',
    '123@broadcast',
    '123@newsletter',
    ACCOUNT,
    'garbage',
  ].map((remoteJid) =>
    rawMessage({ key: { id: 'filtered', remoteJid, fromMe: false } }),
  ),
  rawMessage({ message: { imageMessage: { caption: 'Hi' } } }),
  rawMessage({ message: { protocolMessage: {} } }),
  rawMessage({ messageTimestamp: NOW / 1000 - 10 }),
  rawMessage({ messageTimestamp: NOW / 1000 + 10 }),
  rawMessage({ messageTimestamp: null }),
])('ignores ineligible message %j', (message) => {
  expect(normalizeMessage(message, ACCOUNT, NOW, NOW)).toBeUndefined();
});
it('keeps delivery updates separate from incoming commands', () => {
  expect(
    normalizeDelivery(
      [
        {
          key: { id: 'sent', remoteJid: CHAT, fromMe: true },
          update: { status: 3 },
        },
        {
          key: { id: 'incoming', remoteJid: CHAT, fromMe: false },
          update: { status: 3 },
        },
      ],
      ACCOUNT,
    ),
  ).toEqual([
    {
      provider: 'baileys',
      accountId: ACCOUNT,
      messageId: 'sent',
      status: 'delivered',
    },
  ]);
});
it('isolates providers and accounts, collapses PN/LID duplicate IDs, and never stores text', () => {
  const inputs = [
    incoming(),
    incoming({ provider: 'baileys' }),
    incoming({ accountId: 'different' }),
    incoming({ chatId: LID }),
  ];
  const events = incomingEvents(inputs);
  expect(new Set(events.map((event) => event.dedupKey)).size).toBe(3);
  expect(events[0]!.data).not.toHaveProperty('text');
  expect(events[0]!.data.greeting).toBe(true);
});
