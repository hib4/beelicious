import { DomainError } from '../catalog/validation.js';

export function calculateCartPricing(
  items: ReadonlyArray<{ quantity: number; unitPrice: number }>,
): { lineSubtotals: number[]; subtotal: number } {
  let subtotal = 0;
  const lineSubtotals = items.map(({ quantity, unitPrice }) => {
    if (
      !Number.isSafeInteger(quantity) ||
      quantity < 1 ||
      !Number.isSafeInteger(unitPrice) ||
      unitPrice < 0
    )
      throw new DomainError('invalid_input');
    const amount = quantity * unitPrice;
    if (
      !Number.isSafeInteger(amount) ||
      !Number.isSafeInteger(subtotal + amount)
    )
      throw new DomainError('invalid_input');
    subtotal += amount;
    return amount;
  });
  return { lineSubtotals, subtotal };
}
