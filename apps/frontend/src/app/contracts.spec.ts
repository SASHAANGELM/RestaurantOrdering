import { describe, expect, it } from 'vitest';
import { cartIntentSchema, decimalUnitPriceSchema, type CartIntent } from '@restaurant-ordering/contracts';

describe('browser contract boundary', () => {
  it('validates JSON cart data and parses open-price input without floating point rounding', () => {
    const openPriceMinor = decimalUnitPriceSchema.parse('1.15');
    const cart: CartIntent = {
      lines: [{ itemId: '11111111-1111-4111-8111-111111111111', quantity: 2, observedRevision: 1, openPriceMinor }],
      discountMinor: 0
    };
    expect(cartIntentSchema.parse(JSON.parse(JSON.stringify(cart)))).toEqual(cart);
    expect(openPriceMinor).toBe(115);
    expect(decimalUnitPriceSchema.safeParse('1.155').success).toBe(false);
    expect(cartIntentSchema.safeParse({ ...cart, lines: [{ ...cart.lines[0], quantity: '2' }] }).success).toBe(false);
  });
});
