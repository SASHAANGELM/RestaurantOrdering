import * as z from 'zod';
import { entityRevisionSchema, idSchema, MAX_CART_LINES, moneyMinorSchema, revisionSchema, timestampSchema } from './common';
import { orderStatusSchema } from './orders';

export const validationIssueSchema = z.strictObject({
  path: z.array(z.union([z.string(), z.int().nonnegative()])),
  message: z.string().min(1),
  code: z.string().min(1)
});
export const validationDetailsSchema = z.strictObject({ issues: z.array(validationIssueSchema).min(1) });
export const resourceTypeSchema = z.enum(['category', 'item', 'quote', 'order', 'request']);
export const notFoundDetailsSchema = z.strictObject({ resourceType: resourceTypeSchema, resourceId: idSchema });
export const revisionConflictDetailsSchema = z.strictObject({
  entityType: z.enum(['category', 'item', 'order']),
  entityId: idSchema,
  expectedRevision: entityRevisionSchema,
  currentRevision: entityRevisionSchema
});
export const cartIssueSchema = z.strictObject({
  lineIndex: z.int().min(0).max(MAX_CART_LINES - 1),
  itemId: idSchema,
  code: z.enum(['ITEM_MISSING', 'ITEM_ARCHIVED', 'CATEGORY_ARCHIVED', 'ITEM_UNAVAILABLE', 'OPEN_PRICE_REQUIRED', 'FIXED_PRICE_OVERRIDE']),
  message: z.string().min(1)
});
export const cartInvalidDetailsSchema = z.strictObject({ issues: z.array(cartIssueSchema).min(1).max(MAX_CART_LINES) });
export const discountExceededDetailsSchema = z.strictObject({ subtotalMinor: moneyMinorSchema, discountMinor: moneyMinorSchema });
export const quoteExpiredDetailsSchema = z.strictObject({ quoteId: idSchema, expiresAt: timestampSchema });
export const quoteUsedDetailsSchema = z.strictObject({ quoteId: idSchema, orderId: idSchema });
export const menuChangedDetailsSchema = z.strictObject({
  quoteId: idSchema, quotedMenuRevision: revisionSchema, currentMenuRevision: revisionSchema
});
export const idempotencyConflictDetailsSchema = z.strictObject({ idempotencyKey: idSchema });
export const invalidStatusTransitionDetailsSchema = z.strictObject({
  orderId: idSchema,
  currentStatus: orderStatusSchema,
  requestedStatus: orderStatusSchema,
  allowedStatuses: z.array(orderStatusSchema).max(2)
});
export const categoryArchivedDetailsSchema = z.strictObject({ categoryId: idSchema });
export const invalidItemTransitionDetailsSchema = z.strictObject({
  itemId: idSchema, currentState: z.enum(['available', 'unavailable', 'archived']),
  requestedState: z.enum(['available', 'unavailable', 'archived'])
});
export const unavailableDetailsSchema = z.strictObject({ retryAfterMs: z.int().nonnegative() });
const errorBase = { message: z.string().min(1), requestId: idSchema };

// Code and detail shapes remain linked for both runtime parsing and TS narrowing.
export const apiErrorBodySchema = z.discriminatedUnion('code', [
  z.strictObject({ ...errorBase, code: z.literal('VALIDATION_ERROR'), details: validationDetailsSchema }),
  z.strictObject({ ...errorBase, code: z.literal('NOT_FOUND'), details: notFoundDetailsSchema }),
  z.strictObject({ ...errorBase, code: z.literal('REVISION_CONFLICT'), details: revisionConflictDetailsSchema }),
  z.strictObject({ ...errorBase, code: z.literal('CART_INVALID'), details: cartInvalidDetailsSchema }),
  z.strictObject({ ...errorBase, code: z.literal('DISCOUNT_EXCEEDS_SUBTOTAL'), details: discountExceededDetailsSchema }),
  z.strictObject({ ...errorBase, code: z.literal('QUOTE_EXPIRED'), details: quoteExpiredDetailsSchema }),
  z.strictObject({ ...errorBase, code: z.literal('QUOTE_USED'), details: quoteUsedDetailsSchema }),
  z.strictObject({ ...errorBase, code: z.literal('MENU_CHANGED'), details: menuChangedDetailsSchema }),
  z.strictObject({ ...errorBase, code: z.literal('IDEMPOTENCY_CONFLICT'), details: idempotencyConflictDetailsSchema }),
  z.strictObject({ ...errorBase, code: z.literal('INVALID_STATUS_TRANSITION'), details: invalidStatusTransitionDetailsSchema }),
  z.strictObject({ ...errorBase, code: z.literal('CATEGORY_ARCHIVED'), details: categoryArchivedDetailsSchema }),
  z.strictObject({ ...errorBase, code: z.literal('INVALID_ITEM_TRANSITION'), details: invalidItemTransitionDetailsSchema }),
  z.strictObject({ ...errorBase, code: z.literal('SERVICE_UNAVAILABLE'), details: unavailableDetailsSchema }),
  z.strictObject({ ...errorBase, code: z.literal('INTERNAL_ERROR') })
]);
export const apiErrorSchema = z.strictObject({ error: apiErrorBodySchema });
export type ApiError = z.infer<typeof apiErrorSchema>;
export type ApiErrorBody = z.infer<typeof apiErrorBodySchema>;
export type ApiErrorCode = ApiErrorBody['code'];
export type ApiErrorDetails<Code extends ApiErrorCode> = Extract<ApiErrorBody, { code: Code }> extends { details: infer Details } ? Details : never;
export type ValidationIssue = z.infer<typeof validationIssueSchema>;
export type CartIssue = z.infer<typeof cartIssueSchema>;

export const API_ERROR_STATUS = {
  VALIDATION_ERROR: 400,
  NOT_FOUND: 404,
  REVISION_CONFLICT: 409,
  CART_INVALID: 422,
  DISCOUNT_EXCEEDS_SUBTOTAL: 422,
  QUOTE_EXPIRED: 409,
  QUOTE_USED: 409,
  MENU_CHANGED: 409,
  IDEMPOTENCY_CONFLICT: 409,
  INVALID_STATUS_TRANSITION: 409,
  CATEGORY_ARCHIVED: 422,
  INVALID_ITEM_TRANSITION: 409,
  SERVICE_UNAVAILABLE: 503,
  INTERNAL_ERROR: 500
} as const satisfies Record<ApiErrorCode, number>;
