import { expect, it } from 'vitest';
import { parseEnvironment } from '../src/config.js';
const valid = {
  DATABASE_URL: 'postgresql://user:password@localhost/beelicious',
};
it('applies defaults and coerces a valid port', () => {
  expect(parseEnvironment({ ...valid, PORT: '4000' })).toEqual({
    ...valid,
    NODE_ENV: 'development',
    CART_MAX_ITEM_QUANTITY: 20,
    PORT: 4000,
    HOST: '127.0.0.1',
  });
});
it.each([
  {},
  { DATABASE_URL: '' },
  { DATABASE_URL: 'invalid-secret-value' },
  { DATABASE_URL: 'https://localhost/db' },
  { ...valid, PORT: 'abc' },
  { ...valid, PORT: '0' },
  { ...valid, PORT: '65536' },
  { ...valid, PORT: '3.5' },
  { ...valid, NODE_ENV: 'invalid' },
  { ...valid, HOST: ' ' },
])(
  'rejects invalid environment configuration without exposing values: %j',
  (environment) => {
    expect(() => parseEnvironment(environment)).toThrow(
      /^Invalid environment configuration:/,
    );
    try {
      parseEnvironment(environment);
    } catch (error) {
      expect(String(error)).not.toMatch(/password|invalid-secret-value/);
    }
  },
);
