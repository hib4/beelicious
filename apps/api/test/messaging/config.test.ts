import { expect, it } from 'vitest';
import { parseEnvironment, parseHttpEnvironment } from '../../src/config.js';
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
it('allows a Baileys development demo to answer any contact without an allowlist', () => {
  const messaging = parseEnvironment({
    ...base,
    MESSAGING_PROVIDER: 'baileys',
    BAILEYS_ALLOW_ALL_CONTACTS: 'true',
  }).messaging;
  expect(messaging?.allowAllContacts).toBe(true);
  expect(messaging?.testRecipients).toEqual([]);
  expect(
    parseEnvironment({
      ...base,
      MESSAGING_PROVIDER: 'baileys',
      BAILEYS_ALLOWED_TEST_CONTACTS: PHONE,
    }).messaging?.allowAllContacts,
  ).toBe(false);
});
it.each(['TRUE', '1', 'yes'])(
  'requires literal true to answer any contact, received %s',
  (value) => {
    expect(() =>
      parseEnvironment({
        ...base,
        MESSAGING_PROVIDER: 'baileys',
        BAILEYS_ALLOW_ALL_CONTACTS: value,
      }),
    ).toThrow('Invalid environment configuration:');
  },
);
it.each([
  { MESSAGING_PROVIDER: 'mock', WHATSAPP_TEST_RECIPIENTS: PHONE },
  { MESSAGING_PROVIDER: 'cloud-api' },
  { MESSAGING_PROVIDER: 'baileys', NODE_ENV: 'production' },
  { WHATSAPP_ENABLED: 'false', WHATSAPP_TEST_BOT_ENABLED: 'false' },
])(
  'rejects answering any contact outside a Baileys development demo',
  (override) => {
    expect(() =>
      parseEnvironment({
        ...base,
        BAILEYS_ALLOW_ALL_CONTACTS: 'true',
        ...override,
      }),
    ).toThrow('Invalid environment configuration:');
  },
);
it('rejects the demo flag on the hosted HTTP runtime', () => {
  expect(() =>
    parseHttpEnvironment({
      DATABASE_URL: ENV.DATABASE_URL,
      BAILEYS_ALLOW_ALL_CONTACTS: 'true',
    }),
  ).toThrow('BAILEYS_ALLOW_ALL_CONTACTS');
});
