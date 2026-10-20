import { EventEmitter } from 'node:events';
import { vi } from 'vitest';
import type makeWASocket from '@whiskeysockets/baileys';
import {
  initAuthCreds,
  type BaileysEventMap,
  type WAMessage,
} from '@whiskeysockets/baileys';
import type { LocalAuth } from '../../src/modules/messaging/providers/baileys/auth.js';
import type { IncomingMessage } from '../../src/modules/messaging/types.js';

export const PHONE = '15555550101';
export const ACCOUNT = '15555550999@s.whatsapp.net';
export const CHAT = `${PHONE}@s.whatsapp.net`;
export const LID = '999888777@lid';
export const NOW = 1792497600000;
export const messagingConfig = {
  provider: 'baileys' as const,
  testBotEnabled: true,
  testRecipients: [PHONE],
  authDir: '/unused-fixture',
};
export function rawMessage(override: Partial<WAMessage> = {}): WAMessage {
  return {
    key: { id: 'unique-message', remoteJid: CHAT, fromMe: false },
    message: { conversation: ' Halo ' },
    messageTimestamp: NOW / 1000,
    ...override,
  };
}
export function incoming(
  override: Partial<IncomingMessage> = {},
): IncomingMessage {
  return {
    provider: 'mock',
    accountId: 'local-mock',
    messageId: 'unique',
    chatId: PHONE,
    senderId: PHONE,
    senderPhone: PHONE,
    text: 'Halo',
    timestamp: NOW,
    type: 'text',
    direction: 'incoming',
    ...override,
  };
}
export function socketFixture() {
  const emitter = new EventEmitter();
  const socket = {
    ev: emitter,
    user: { id: ACCOUNT },
    sendMessage: vi.fn().mockResolvedValue({ key: { id: 'outbound' } }),
    end: vi.fn().mockResolvedValue(undefined),
    signalRepository: {
      lidMapping: { getPNForLID: vi.fn().mockResolvedValue(CHAT) },
    },
  };
  return {
    socket,
    emit<K extends keyof BaileysEventMap>(event: K, data: BaileysEventMap[K]) {
      emitter.emit(event, data);
    },
  };
}
export function authFixture(): LocalAuth {
  const creds = initAuthCreds();
  creds.me = { id: ACCOUNT };
  return {
    state: {
      creds,
      keys: { get: vi.fn().mockResolvedValue({}), set: vi.fn() },
    },
    saveCreds: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };
}
export function factoryFor(fixture: ReturnType<typeof socketFixture>) {
  return vi
    .fn()
    .mockReturnValue(fixture.socket) as unknown as typeof makeWASocket;
}
export function callbacksFixture() {
  return {
    receive: vi.fn().mockResolvedValue(undefined),
    delivery: vi.fn().mockResolvedValue(undefined),
    warn: vi.fn(),
  };
}
