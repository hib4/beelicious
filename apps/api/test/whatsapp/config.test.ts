import { expect, it } from 'vitest';
import { parseEnvironment } from '../../src/config.js';
import { ENV } from './fixtures.js';

it('keeps the integration disabled without credentials', () => {
  expect(
    parseEnvironment({ DATABASE_URL: ENV.DATABASE_URL }).whatsapp,
  ).toBeUndefined();
});
it('validates enabled configuration', () => {
  expect(parseEnvironment(ENV).whatsapp?.testRecipients).toEqual([
    '15555550101',
  ]);
});
it.each([
  'WHATSAPP_ACCESS_TOKEN',
  'WHATSAPP_VERIFY_TOKEN',
  'WHATSAPP_PHONE_NUMBER_ID',
  'WHATSAPP_WABA_ID',
  'META_APP_SECRET',
  'META_GRAPH_API_VERSION',
])('requires %s when enabled', (key) => {
  const environment: Record<string, string> = { ...ENV };
  delete environment[key];
  expect(() => parseEnvironment(environment)).toThrow(key);
});
it.each([
  { NODE_ENV: 'production' },
  { NODE_ENV: 'test' },
  { WHATSAPP_TEST_RECIPIENTS: '' },
  { WHATSAPP_TEST_RECIPIENTS: '+15555550101' },
  { WHATSAPP_ENABLED: 'false' },
  { WHATSAPP_ENABLED: 'yes' },
  { WHATSAPP_TEST_BOT_ENABLED: '0' },
  { WHATSAPP_PHONE_NUMBER_ID: 'not-a-number' },
  { META_GRAPH_API_VERSION: 'https://evil.test' },
])('rejects unsafe or invalid feature configuration: %j', (override) => {
  expect(() => parseEnvironment({ ...ENV, ...override })).toThrow(
    'Invalid environment configuration:',
  );
});
it('allows webhook reception in production with the greeting bot disabled', () => {
  expect(
    parseEnvironment({
      ...ENV,
      NODE_ENV: 'production',
      WHATSAPP_TEST_BOT_ENABLED: 'false',
    }).whatsapp?.testBotEnabled,
  ).toBe(false);
});
