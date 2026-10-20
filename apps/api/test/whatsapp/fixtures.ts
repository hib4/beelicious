import { createHmac } from 'node:crypto';
import { vi } from 'vitest';
import type { WhatsAppEventStore } from '@beelicious/database';
import { parseEnvironment } from '../../src/config.js';

export const NOW = new Date();
export const ENV = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://fixture:fixture@localhost/fixture',
  WHATSAPP_ENABLED: 'true',
  WHATSAPP_TEST_BOT_ENABLED: 'true',
  WHATSAPP_ACCESS_TOKEN: 'fixture-access-token',
  WHATSAPP_VERIFY_TOKEN: 'fixture-verify-token',
  WHATSAPP_PHONE_NUMBER_ID: '1001',
  WHATSAPP_WABA_ID: '2001',
  META_APP_SECRET: 'fixture-app-secret',
  META_GRAPH_API_VERSION: 'v26.0',
  WHATSAPP_TEST_RECIPIENTS: '15555550101',
};
export const config = parseEnvironment(ENV);
export const whatsapp = config.whatsapp!;
export function message(
  id = 'wamid.fixture',
  text = 'Halo',
  from = '15555550101',
) {
  return {
    id,
    from,
    timestamp: String(Math.floor(NOW.getTime() / 1000)),
    type: 'text',
    text: { body: text },
  };
}
export function payload(
  messages: unknown[] = [message()],
  statuses: unknown[] = [],
) {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: whatsapp.wabaId,
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { phone_number_id: whatsapp.phoneNumberId },
              messages,
              statuses,
            },
          },
        ],
      },
    ],
  };
}
export function signature(body: string) {
  return (
    'sha256=' +
    createHmac('sha256', whatsapp.appSecret).update(body).digest('hex')
  );
}
export function fakeStore() {
  return {
    receive: vi
      .fn<WhatsAppEventStore['receive']>()
      .mockResolvedValue(undefined),
    claim: vi.fn<WhatsAppEventStore['claim']>().mockResolvedValue(undefined),
    beginSend: vi.fn<WhatsAppEventStore['beginSend']>().mockResolvedValue(true),
    finish: vi.fn<WhatsAppEventStore['finish']>().mockResolvedValue(undefined),
  };
}
