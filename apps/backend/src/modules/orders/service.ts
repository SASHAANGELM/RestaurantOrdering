import { createHash, randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import {
  calculateLineTotal, calculateTotals, canTransitionOrderStatus, ORDER_STATUS_TRANSITIONS, quoteSnapshotSchema,
  type ConfirmOrder, type OrderResponse, type OrdersChanged, type UpdateOrderStatus
} from '@restaurant-ordering/contracts';
import type { DatabaseConnection } from '../../db/connection';
import { appState, checkoutQuotes, orderLines, orders } from '../../db/schema';
import { HttpError } from '../../middleware/errors';
import { readMenuRevision, readResolvedItems } from '../menu/queries';
import { orderNotFound, readOrderResponse } from './queries';

export interface OrderMutation {
  response: OrderResponse;
  notification: OrdersChanged | null;
}

export function createOrderService(connection: DatabaseConnection) {
  function changed(row: typeof orders.$inferSelect, change: OrdersChanged['change']): OrderMutation {
    connection.db.update(appState).set({ ordersRevision: sql`${appState.ordersRevision} + 1` }).where(eq(appState.id, 1)).run();
    const response = readOrderResponse(connection, row);
    return { response, notification: {
      eventId: randomUUID(), ordersRevision: response.ordersRevision, orderId: row.id, orderRevision: row.revision, change
    } };
  }

  // Synchronous immediate transactions serialize writers before any decision reads.
  // Results/notifications become visible to callers only after a successful COMMIT.
  return {
    confirm(input: ConfirmOrder, idempotencyKey: string): OrderMutation & { replayed: boolean } {
      const requestHash = createHash('sha256').update(JSON.stringify({ version: 1, quoteId: input.quoteId })).digest('hex');
      return connection.sqlite.transaction(() => {
        const existing = connection.db.select().from(orders).where(eq(orders.idempotencyKey, idempotencyKey)).get();
        if (existing) {
          if (existing.requestHash !== requestHash) throw new HttpError({
            code: 'IDEMPOTENCY_CONFLICT', message: 'This request key was already used with a different payload.', details: { idempotencyKey }
          });
          return { response: readOrderResponse(connection, existing), notification: null, replayed: true };
        }
        const quote = connection.db.select().from(checkoutQuotes).where(eq(checkoutQuotes.id, input.quoteId)).get();
        if (!quote) orderNotFound('quote', input.quoteId);
        // A consumed quote always identifies its committed order, including after expiry.
        const consumed = connection.db.select().from(orders).where(eq(orders.quoteId, input.quoteId)).get();
        if (consumed) throw new HttpError({
          code: 'QUOTE_USED', message: 'This quote has already created an order.', details: { quoteId: input.quoteId, orderId: consumed.id }
        });
        const now = Date.now();
        if (Date.parse(quote.expiresAt) <= now) throw new HttpError({
          code: 'QUOTE_EXPIRED', message: 'This quote expired. Review the cart again.', details: { quoteId: input.quoteId, expiresAt: quote.expiresAt }
        });
        const snapshot = quoteSnapshotSchema.parse(quote.snapshot);
        const currentMenuRevision = readMenuRevision(connection);
        const menuChanged = () => new HttpError({
          code: 'MENU_CHANGED', message: 'The menu changed. Review the cart again.',
          details: { quoteId: input.quoteId, quotedMenuRevision: quote.menuRevision, currentMenuRevision }
        });
        if (quote.menuRevision !== currentMenuRevision) throw menuChanged();
        const resolved = readResolvedItems(connection, snapshot.lines.map((line) => line.itemId));
        const currentTotals = calculateTotals(snapshot.lines.map((line, index) => {
          const current = resolved[index]!;
          if (current.state !== 'available') throw menuChanged();
          const { item, category } = current;
          const unitPriceMinor = item.pricingMode === 'fixed' ? item.priceMinor : line.unitPriceMinor;
          if (item.revision !== line.itemRevision || item.name !== line.itemName || category.id !== line.categoryId ||
            category.name !== line.categoryName || item.pricingMode !== line.pricingMode || unitPriceMinor !== line.unitPriceMinor) throw menuChanged();
          return calculateLineTotal(unitPriceMinor, line.quantity);
        }), snapshot.discountMinor);
        if (currentTotals.subtotalMinor !== snapshot.subtotalMinor || currentTotals.totalMinor !== snapshot.totalMinor) throw menuChanged();

        const timestamp = new Date(now).toISOString();
        const row = connection.db.insert(orders).values({
          id: randomUUID(), quoteId: input.quoteId, idempotencyKey, requestHash, status: 'placed',
          ...currentTotals, currency: snapshot.currency, createdAt: timestamp, updatedAt: timestamp
        }).returning().get();
        connection.db.insert(orderLines).values(snapshot.lines.map((line, lineIndex) => ({
          ...line, id: randomUUID(), orderId: row.id, lineIndex
        }))).run();
        return { ...changed(row, 'created'), replayed: false };
      }).immediate();
    },
    updateStatus(id: string, input: UpdateOrderStatus): OrderMutation {
      return connection.sqlite.transaction(() => {
        const current = connection.db.select().from(orders).where(eq(orders.id, id)).get();
        if (!current) orderNotFound('order', id);
        if (current.revision !== input.expectedRevision) throw new HttpError({
          code: 'REVISION_CONFLICT', message: 'This order changed. Reload it before updating its status.',
          details: { entityType: 'order', entityId: id, expectedRevision: input.expectedRevision, currentRevision: current.revision }
        });
        if (current.status === input.status) return { response: readOrderResponse(connection, current), notification: null };
        if (!canTransitionOrderStatus(current.status, input.status)) throw new HttpError({
          code: 'INVALID_STATUS_TRANSITION', message: 'This status transition is not allowed.',
          details: { orderId: id, currentStatus: current.status, requestedStatus: input.status, allowedStatuses: [...ORDER_STATUS_TRANSITIONS[current.status]] }
        });
        const row = connection.db.update(orders).set({ status: input.status, revision: current.revision + 1, updatedAt: new Date().toISOString() })
          .where(eq(orders.id, id)).returning().get()!;
        return changed(row, 'status-changed');
      }).immediate();
    }
  };
}
