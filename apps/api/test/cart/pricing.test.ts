import { expect, it } from 'vitest';
import { calculateCartPricing } from '../../src/modules/cart/pricing.js';
import { parseEnvironment } from '../../src/config.js';
import { parseCommand } from '../../src/modules/conversation/commands.js';
import {
  stateDataSchema,
  initialData,
} from '../../src/modules/conversation/flow.js';

it('calculates integer line subtotals, zero prices, and an empty cart', () => {
  expect(
    calculateCartPricing([
      { quantity: 2, unitPrice: 20000 },
      { quantity: 3, unitPrice: 5000 },
      { quantity: 1, unitPrice: 0 },
    ]),
  ).toEqual({ lineSubtotals: [40000, 15000, 0], subtotal: 55000 });
  expect(calculateCartPricing([])).toEqual({ lineSubtotals: [], subtotal: 0 });
  expect(
    calculateCartPricing([{ quantity: 1000, unitPrice: 2147483647 }]).subtotal,
  ).toBe(2147483647000);
});
it.each([
  [{ quantity: 0, unitPrice: 1 }],
  [{ quantity: -1, unitPrice: 1 }],
  [{ quantity: 1.5, unitPrice: 1 }],
  [{ quantity: 1, unitPrice: -1 }],
  [{ quantity: 1, unitPrice: NaN }],
  [{ quantity: 1, unitPrice: 1.5 }],
  [{ quantity: 2, unitPrice: Number.MAX_SAFE_INTEGER }],
  [
    { quantity: 1, unitPrice: Number.MAX_SAFE_INTEGER },
    { quantity: 1, unitPrice: 1 },
  ],
])('rejects invalid or unsafe prices: %j', (...items) => {
  expect(() => calculateCartPricing(items)).toThrow('Invalid input');
});
it('validates configurable item limits without leaking values and preserves zero navigation', () => {
  const env = {
    DATABASE_URL: 'postgresql://fixture:fixture@localhost/fixture',
  };
  expect(parseEnvironment(env).CART_MAX_ITEM_QUANTITY).toBe(20);
  expect(
    parseEnvironment({ ...env, CART_MAX_ITEM_QUANTITY: '1000' })
      .CART_MAX_ITEM_QUANTITY,
  ).toBe(1000);
  for (const value of ['0', '-1', '1.5', '1001', 'private-invalid-value']) {
    expect(() =>
      parseEnvironment({ ...env, CART_MAX_ITEM_QUANTITY: value }),
    ).toThrow('CART_MAX_ITEM_QUANTITY');
  }
  expect(parseCommand(' KeRaNjAnG ')).toEqual({ kind: 'cart' });
  expect(parseCommand('0')).toEqual({ kind: 'back' });
});
it('restores Phase 4 state data using defaults and rejects malformed pending actions', () => {
  const old = {
    version: 1,
    tenantPage: 0,
    categoryPage: 0,
    menuPage: 0,
    options: [],
    fingerprint: '',
  };
  expect(stateDataSchema.parse(old)).toEqual(initialData());
  expect(
    stateDataSchema.safeParse({
      ...old,
      pending: { kind: 'price', action: { kind: 'clear' } },
    }).success,
  ).toBe(false);
});
