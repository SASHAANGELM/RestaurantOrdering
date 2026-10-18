import { describe, expect, it } from 'vitest';
import { calculateLineTotal, calculateTotals, decimalUnitPriceSchema, parseDecimalMinor, parseUnitPriceMinor } from './money';

describe('decimal money input', () => {
  it.each([
    ['0', 0], ['0.00', 0], ['0.01', 1], ['0.1', 10], ['1.15', 115],
    ['19.99', 1999], [' 0001.20 ', 120], ['10000.00', 1_000_000],
    ['90071992547409.91', Number.MAX_SAFE_INTEGER]
  ])('parses %s exactly', (input, expected) => {
    expect(parseDecimalMinor(input)).toBe(expected);
  });

  it.each(['', ' ', '-1', '-0', '+1', '.50', '1.', '1.001', '1e2', '1,00', '1 000', 'NaN', 'Infinity', '0x10', '90071992547409.92', '9'.repeat(33)])(
    'rejects invalid or unsafe decimal %j', (input) => {
      expect(() => parseDecimalMinor(input)).toThrow();
    }
  );

  it('applies the unit-price limit separately from total amounts', () => {
    expect(parseUnitPriceMinor('10000')).toBe(1_000_000);
    expect(() => parseUnitPriceMinor('10000.01')).toThrow();
    expect(decimalUnitPriceSchema.safeParse('10000.01').success).toBe(false);
    expect(parseDecimalMinor('10000.01')).toBe(1_000_001);
    expect(() => parseDecimalMinor('1.00', -1)).toThrow();
    expect(() => parseDecimalMinor('1.00', 1.5)).toThrow();
  });
});

describe('integer money arithmetic', () => {
  it('calculates the largest allowed cart without rounding', () => {
    const lineTotal = calculateLineTotal(1_000_000, 99);
    expect(lineTotal).toBe(99_000_000);
    expect(calculateTotals(Array.from({ length: 100 }, () => lineTotal), 1)).toEqual({
      subtotalMinor: 9_900_000_000, discountMinor: 1, totalMinor: 9_899_999_999
    });
  });

  it('allows free items and a zero-total order', () => {
    expect(calculateLineTotal(0, 99)).toBe(0);
    expect(calculateTotals([115, 230], 345)).toEqual({ subtotalMinor: 345, discountMinor: 345, totalMinor: 0 });
    expect(calculateTotals([], 0).totalMinor).toBe(0);
  });

  it.each([[100, 0], [100, 100], [100, 1.5], [-1, 1], [1.1, 1], [1_000_001, 1], [NaN, 1], [Infinity, 1]])(
    'rejects price/quantity %s/%s', (price, quantity) => {
      expect(() => calculateLineTotal(price, quantity)).toThrow();
    }
  );

  it('rejects invalid discounts, unsafe sums and fractional cents', () => {
    for (const discount of [-1, 101, 0.5, NaN, Infinity]) {
      expect(() => calculateTotals([100], discount)).toThrow();
    }
    expect(() => calculateTotals([Number.MAX_SAFE_INTEGER, 1], 0)).toThrow();
    expect(calculateTotals([Number.MAX_SAFE_INTEGER], 0).totalMinor).toBe(Number.MAX_SAFE_INTEGER);
    expect(() => calculateTotals([1.1], 0)).toThrow();
    expect(() => calculateTotals([-1], 0)).toThrow();
  });
});
