import { expect, it } from 'vitest';
import { parseEnvironment } from '../../src/config.js';
import { ENV } from '../whatsapp/fixtures.js';
import { PHONE } from './fixtures.js';

const base = {
  DATABASE_URL: ENV.DATABASE_URL,
  WHATSAPP_ENABLED: 'true',
  NODE_ENV: 'development',
  WHATSAPP_TEST_BOT_ENABLED: 'true',
};
it('defaults to the preserved Cloud API and requires only active credentials', () => {
  expect(parseEnvironment(ENV).messaging?.provider).toBe('cloud-api');
  for (const provider of ['baileys', 'mock']) {
    expect(
      parseEnvironment({
        ...base,
        MESSAGING_PROVIDER: provider,
        BAILEYS_ALLOWED_TEST_CONTACTS: PHONE,
        WHATSAPP_TEST_RECIPIENTS: PHONE,
      }).messaging?.provider,
    ).toBe(provider);
  }
});
it('keeps messaging off behind the master switch', () => {
  expect(
    parseEnvironment({
      DATABASE_URL: ENV.DATABASE_URL,
      MESSAGING_PROVIDER: 'baileys',
    }).messaging,
  ).toBeUndefined();
});
it.each([
  { MESSAGING_PROVIDER: 'unknown' },
  {
    MESSAGING_PROVIDER: 'baileys',
    NODE_ENV: 'production',
    BAILEYS_ALLOWED_TEST_CONTACTS: PHONE,
  },
  {
    MESSAGING_PROVIDER: 'baileys',
    BAILEYS_ALLOWED_TEST_CONTACTS: '+15555550101',
  },
  {
    MESSAGING_PROVIDER: 'baileys',
    BAILEYS_AUTH_DIR: '',
    BAILEYS_ALLOWED_TEST_CONTACTS: PHONE,
  },
  { MESSAGING_PROVIDER: 'baileys', BAILEYS_ALLOWED_TEST_CONTACTS: '' },
  {
    MESSAGING_PROVIDER: 'baileys',
    BAILEYS_AUTH_DIR: './apps/api/src',
    BAILEYS_ALLOWED_TEST_CONTACTS: PHONE,
  },
  { MESSAGING_PROVIDER: 'mock', WHATSAPP_TEST_RECIPIENTS: '' },
])(
  'rejects invalid active configuration without leaking values',
  (override) => {
    expect(() => parseEnvironment({ ...base, ...override })).toThrow(
      'Invalid environment configuration:',
    );
    try {
      parseEnvironment({ ...base, ...override });
    } catch (error) {
      expect((error as Error).message).not.toContain('+15555550101');
    }
  },
);
it('ignores inactive credential/allowlist values', () => {
  expect(
    parseEnvironment({
      ...base,
      MESSAGING_PROVIDER: 'mock',
      WHATSAPP_TEST_RECIPIENTS: PHONE,
      BAILEYS_ALLOWED_TEST_CONTACTS: 'invalid',
      META_GRAPH_API_VERSION: 'invalid',
    }).whatsapp,
  ).toBeUndefined();
});
