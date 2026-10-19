import { asc, desc, eq, sql } from 'drizzle-orm';
import {
  orderSchema, orderSummarySchema, type OrderResponse, type OrdersQuery, type OrdersResponse
} from '@restaurant-ordering/contracts';
import type { DatabaseConnection } from '../../db/connection';
import { appState, orderLines, orders, orderStatusEvents } from '../../db/schema';
import { HttpError } from '../../middleware/errors';

export function orderNotFound(resourceType: 'order' | 'quote' | 'request', resourceId: string): never {
  throw new HttpError({ code: 'NOT_FOUND', message: `The ${resourceType} was not found.`, details: { resourceType, resourceId } });
}

export function readOrdersRevision(connection: DatabaseConnection) {
  const state = connection.db.select({ revision: appState.ordersRevision }).from(appState).where(eq(appState.id, 1)).get();
  if (!state) throw new Error('Orders state is not initialized.');
  return state.revision;
}

function toSummary(row: typeof orders.$inferSelect) {
  return orderSummarySchema.parse({
    id: row.id, quoteId: row.quoteId, status: row.status, revision: row.revision,
    createdAt: row.createdAt, updatedAt: row.updatedAt, subtotalMinor: row.subtotalMinor,
    discountMinor: row.discountMinor, totalMinor: row.totalMinor, currency: row.currency
  });
}

// Caller owns a read or immediate write transaction so rows and stream revision agree.
export function readOrderResponse(connection: DatabaseConnection, row: typeof orders.$inferSelect): OrderResponse {
  const lines = connection.db.select().from(orderLines).where(eq(orderLines.orderId, row.id))
    .orderBy(asc(orderLines.lineIndex)).all().map(({ orderId, lineIndex, imageUrl, comment, ...line }) => {
      void orderId;
      void lineIndex;
      return { ...line, ...(comment ? { comment } : {}), ...(imageUrl ? { imageUrl: imageUrl.replace(/^\/images\//, '/api/images/') } : {}) };
    });
  const history = connection.db.select({ status: orderStatusEvents.status, changedAt: orderStatusEvents.changedAt }).from(orderStatusEvents)
    .where(eq(orderStatusEvents.orderId, row.id)).orderBy(asc(orderStatusEvents.revision)).all();
  return { order: orderSchema.parse({ ...toSummary(row), lines, history }), ordersRevision: readOrdersRevision(connection) };
}

export function getOrder(connection: DatabaseConnection, id: string): OrderResponse {
  return connection.sqlite.transaction(() => {
    const row = connection.db.select().from(orders).where(eq(orders.id, id)).get();
    if (!row) orderNotFound('order', id);
    return readOrderResponse(connection, row);
  })();
}

export function getOrderByRequest(connection: DatabaseConnection, idempotencyKey: string): OrderResponse {
  return connection.sqlite.transaction(() => {
    const row = connection.db.select().from(orders).where(eq(orders.idempotencyKey, idempotencyKey)).get();
    if (!row) orderNotFound('request', idempotencyKey);
    return readOrderResponse(connection, row);
  })();
}

export function listOrders(connection: DatabaseConnection, query: OrdersQuery): OrdersResponse {
  return connection.sqlite.transaction(() => {
    const filter = query.status === undefined ? undefined : eq(orders.status, query.status);
    const total = connection.db.select({ count: sql<number>`count(*)` }).from(orders).where(filter).get()!.count;
    const rows = query.page > Math.ceil(total / query.pageSize) ? [] : connection.db.select().from(orders).where(filter)
      .orderBy(desc(orders.createdAt), desc(orders.id)).limit(query.pageSize).offset((query.page - 1) * query.pageSize).all();
    return { orders: rows.map(toSummary), total, page: query.page, pageSize: query.pageSize, ordersRevision: readOrdersRevision(connection) };
  })();
}
