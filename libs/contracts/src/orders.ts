import * as z from 'zod';
import {
  entityRevisionSchema, idSchema, MAX_CART_LINES, MAX_PAGE_SIZE, paginationQueryShape,
  paginationShape, revisionSchema, timestampSchema
} from './common';
import { itemImageSchema } from './menu';
import { hasConsistentTotals, snapshotLineSchema, totalsShape } from './checkout';

export const orderStatusSchema = z.enum(['placed', 'preparing', 'ready', 'completed', 'cancelled']);
export type OrderStatus = z.infer<typeof orderStatusSchema>;

export const ORDER_STATUS_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  placed: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['completed'],
  completed: [],
  cancelled: []
};

/** A same-status update is a no-op; the server still checks expectedRevision. */
export function canTransitionOrderStatus(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_STATUS_TRANSITIONS[from].includes(to);
}

export const updateOrderStatusSchema = z.strictObject({
  status: orderStatusSchema,
  expectedRevision: entityRevisionSchema
});
const orderSummaryShape = {
  id: idSchema,
  quoteId: idSchema,
  status: orderStatusSchema,
  revision: entityRevisionSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  ...totalsShape
};
function hasConsistentSummary(value: { subtotalMinor: number; discountMinor: number; totalMinor: number }): boolean {
  return value.discountMinor <= value.subtotalMinor && value.totalMinor === value.subtotalMinor - value.discountMinor;
}
export const orderSummarySchema = z.strictObject(orderSummaryShape)
  .refine(hasConsistentSummary, 'Order totals are inconsistent.');
export const orderLineSchema = snapshotLineSchema.safeExtend({ id: idSchema, imageUrl: itemImageSchema.optional() });
export const orderSchema = z.strictObject({
  ...orderSummaryShape,
  history: z.array(z.strictObject({ status: orderStatusSchema, changedAt: timestampSchema })).max(5).optional(),
  lines: z.array(orderLineSchema).min(1).max(MAX_CART_LINES)
}).refine(hasConsistentTotals, 'Order line totals are inconsistent.');
export const ordersQuerySchema = z.strictObject({ ...paginationQueryShape, status: orderStatusSchema.optional() });
export const ordersResponseSchema = z.strictObject({
  orders: z.array(orderSummarySchema).max(MAX_PAGE_SIZE), ...paginationShape, ordersRevision: revisionSchema
}).refine((value) => value.orders.length <= value.pageSize && value.orders.length <= value.total,
  'Orders must fit the requested page and total.');
export const orderResponseSchema = z.strictObject({ order: orderSchema, ordersRevision: revisionSchema });

export type UpdateOrderStatus = z.infer<typeof updateOrderStatusSchema>;
export type OrderLine = z.infer<typeof orderLineSchema>;
export type OrderSummary = z.infer<typeof orderSummarySchema>;
export type Order = z.infer<typeof orderSchema>;
export type OrdersQuery = z.infer<typeof ordersQuerySchema>;
export type OrdersResponse = z.infer<typeof ordersResponseSchema>;
export type OrderResponse = z.infer<typeof orderResponseSchema>;
