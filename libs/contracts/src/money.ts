import { z } from 'zod';
import { MAX_UNIT_PRICE_MINOR, moneyMinorSchema, quantitySchema, unitPriceMinorSchema } from './common';

// Length bounds prevent huge form strings from reaching BigInt. Leading zeroes are allowed.
export const decimalMoneySchema = z.string().trim().min(1).max(32)
  .regex(/^[0-9]+(?:\.[0-9]{1,2})?$/, 'Enter a nonnegative amount with at most two decimal places.')
  .transform((value, context) => {
    const [whole = '', fraction = ''] = value.split('.');
    const minor = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
    if (minor > BigInt(Number.MAX_SAFE_INTEGER)) {
      context.addIssue({ code: 'custom', message: 'Amount exceeds the safe integer range.' });
      return z.NEVER;
    }
    return Number(minor);
  });

export const decimalUnitPriceSchema = decimalMoneySchema.pipe(unitPriceMinorSchema);

/** Parse a form amount exactly; transport values are already integer cents. */
export function parseDecimalMinor(value: string, maximumMinor = Number.MAX_SAFE_INTEGER): number {
  moneyMinorSchema.parse(maximumMinor);
  return decimalMoneySchema.pipe(moneyMinorSchema.max(maximumMinor)).parse(value);
}

export function parseUnitPriceMinor(value: string): number {
  return parseDecimalMinor(value, MAX_UNIT_PRICE_MINOR);
}

export function calculateLineTotal(unitPriceMinor: number, quantity: number): number {
  unitPriceMinorSchema.parse(unitPriceMinor);
  quantitySchema.parse(quantity);
  return moneyMinorSchema.parse(unitPriceMinor * quantity);
}

/** Also usable for estimated cart totals; the backend calculates its own quote. */
export function calculateTotals(lineTotals: readonly number[], discountMinor: number) {
  const subtotalMinor = lineTotals.reduce((subtotal, lineTotal) => {
    moneyMinorSchema.parse(lineTotal);
    return moneyMinorSchema.parse(subtotal + lineTotal);
  }, 0);
  moneyMinorSchema.max(subtotalMinor).parse(discountMinor);
  return { subtotalMinor, discountMinor, totalMinor: subtotalMinor - discountMinor };
}
