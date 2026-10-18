import * as z from 'zod';
import {
  currencySchema, entityRevisionSchema, idSchema, MAX_CART_LINES, moneyMinorSchema,
  nameSchema, pricingModeSchema, quantitySchema, revisionSchema, timestampSchema, unitPriceMinorSchema
} from './common';

export const cartLineSchema = z.strictObject({
  itemId: idSchema,
  quantity: quantitySchema,
  openPriceMinor: unitPriceMinorSchema.optional(),
  observedRevision: entityRevisionSchema,
  observedUnitPriceMinor: unitPriceMinorSchema.optional(),
  observedName: nameSchema.optional()
});
export const cartIntentSchema = z.strictObject({
  lines: z.array(cartLineSchema).min(1).max(MAX_CART_LINES),
  discountMinor: moneyMinorSchema
});
export const createQuoteSchema = cartIntentSchema;

export const snapshotLineSchema = z.strictObject({
  itemId: idSchema,
  categoryId: idSchema,
  itemName: nameSchema,
  categoryName: nameSchema,
  itemRevision: entityRevisionSchema,
  pricingMode: pricingModeSchema,
  unitPriceMinor: unitPriceMinorSchema,
  quantity: quantitySchema,
  lineTotalMinor: moneyMinorSchema
}).refine((line) => line.lineTotalMinor === line.unitPriceMinor * line.quantity,
  { message: 'Line total must equal unit price times quantity.', path: ['lineTotalMinor'] });

export const totalsShape = {
  subtotalMinor: moneyMinorSchema,
  discountMinor: moneyMinorSchema,
  totalMinor: moneyMinorSchema,
  currency: currencySchema
};

// Shared by persisted quotes and orders. Schemas verify snapshot consistency, not DB eligibility.
export function hasConsistentTotals(value: {
  lines: readonly { lineTotalMinor: number }[];
  subtotalMinor: number;
  discountMinor: number;
  totalMinor: number;
}): boolean {
  let subtotal = 0;
  for (const line of value.lines) {
    subtotal += line.lineTotalMinor;
    if (!Number.isSafeInteger(subtotal)) return false;
  }
  return subtotal === value.subtotalMinor && value.discountMinor <= subtotal &&
    value.totalMinor === subtotal - value.discountMinor;
}

const changeBase = { lineIndex: z.int().min(0).max(MAX_CART_LINES - 1), itemId: idSchema };
export const quoteChangeSchema = z.discriminatedUnion('field', [
  z.strictObject({ ...changeBase, field: z.literal('unitPriceMinor'), observed: unitPriceMinorSchema, current: unitPriceMinorSchema }),
  z.strictObject({ ...changeBase, field: z.literal('revision'), observed: entityRevisionSchema, current: entityRevisionSchema }),
  z.strictObject({ ...changeBase, field: z.literal('name'), observed: nameSchema, current: nameSchema })
]);
export const quoteSnapshotSchema = z.strictObject({
  quoteId: idSchema,
  createdAt: timestampSchema,
  expiresAt: timestampSchema,
  menuRevision: revisionSchema,
  lines: z.array(snapshotLineSchema).min(1).max(MAX_CART_LINES),
  ...totalsShape
}).refine(hasConsistentTotals, 'Snapshot totals are inconsistent.')
  .refine((value) => Date.parse(value.expiresAt) > Date.parse(value.createdAt),
    { message: 'Expiry must be after creation.', path: ['expiresAt'] });
export const quoteResponseSchema = quoteSnapshotSchema.safeExtend({
  changes: z.array(quoteChangeSchema).max(MAX_CART_LINES * 3)
}).refine((value) => value.changes.every((change) => value.lines[change.lineIndex]?.itemId === change.itemId),
  'Changes must identify a snapshot line.');
export const confirmOrderSchema = z.strictObject({ quoteId: idSchema });
export const idempotencyKeySchema = idSchema;

export type CartLine = z.infer<typeof cartLineSchema>;
export type CartIntent = z.infer<typeof cartIntentSchema>;
export type CreateQuote = z.infer<typeof createQuoteSchema>;
export type SnapshotLine = z.infer<typeof snapshotLineSchema>;
export type QuoteChange = z.infer<typeof quoteChangeSchema>;
export type QuoteSnapshot = z.infer<typeof quoteSnapshotSchema>;
export type QuoteResponse = z.infer<typeof quoteResponseSchema>;
export type ConfirmOrder = z.infer<typeof confirmOrderSchema>;
