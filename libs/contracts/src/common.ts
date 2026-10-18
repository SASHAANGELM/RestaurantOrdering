import * as z from 'zod';

export const CURRENCY = 'USD';
export const MAX_UNIT_PRICE_MINOR = 1_000_000;
export const MAX_QUANTITY = 99;
export const MAX_CART_LINES = 100;
export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;
export const QUOTE_LIFETIME_MS = 5 * 60 * 1_000;

export const idSchema = z.uuid();
export const timestampSchema = z.iso.datetime();
export const revisionSchema = z.int().nonnegative();
export const entityRevisionSchema = revisionSchema.min(1);
export const currencySchema = z.literal(CURRENCY);
export const moneyMinorSchema = z.int().nonnegative();
export const unitPriceMinorSchema = moneyMinorSchema.max(MAX_UNIT_PRICE_MINOR);
export const quantitySchema = z.int().min(1).max(MAX_QUANTITY);
export const nameSchema = z.string().trim().min(1).max(120);
export const descriptionSchema = z.string().trim().max(2_000);
export const pricingModeSchema = z.enum(['fixed', 'open']);

// Query strings accept decimal digits only, never booleans, blanks or exponents.
const queryIntegerSchema = z.union([
  z.int().positive(),
  z.string().regex(/^[0-9]+$/).transform(Number).pipe(z.int().positive())
]);
export const paginationQueryShape = {
  page: queryIntegerSchema.default(1),
  pageSize: queryIntegerSchema.pipe(z.int().max(MAX_PAGE_SIZE)).default(DEFAULT_PAGE_SIZE)
};
export const paginationQuerySchema = z.strictObject(paginationQueryShape);
export const paginationShape = {
  total: z.int().nonnegative(),
  page: z.int().positive(),
  pageSize: z.int().min(1).max(MAX_PAGE_SIZE)
};
export const paginationSchema = z.strictObject(paginationShape);
export const syncStateSchema = z.strictObject({
  menuRevision: revisionSchema,
  ordersRevision: revisionSchema
});

export type Currency = z.infer<typeof currencySchema>;
export type PricingMode = z.infer<typeof pricingModeSchema>;
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
export type Pagination = z.infer<typeof paginationSchema>;
export type SyncState = z.infer<typeof syncStateSchema>;
