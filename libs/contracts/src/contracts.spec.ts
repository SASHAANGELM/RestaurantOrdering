import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  API_ERROR_STATUS, apiErrorSchema, cartIntentSchema, categoriesResponseSchema,
  categorySchema, confirmOrderSchema, createCategorySchema, createItemSchema,
  itemsResponseSchema, menuChangedSchema, menuItemSchema, menuItemsQuerySchema, moneyMinorSchema, orderResponseSchema, ordersChangedSchema,
  ordersQuerySchema, paginationQuerySchema, quoteResponseSchema, quoteSnapshotSchema,
  resolveItemsRequestSchema, resolveItemsResponseSchema, serverEventSchemas, setupItemsQuerySchema,
  snapshotLineSchema, syncStateSchema, timestampSchema, updateCategorySchema, updateItemSchema,
  updateOrderStatusSchema, type ApiError, type ClientToServerEvents, type ServerToClientEvents, type SyncState
} from './index';
import { canTransitionOrderStatus, ORDER_STATUS_TRANSITIONS, orderStatusSchema } from './orders';

const itemId = '11111111-1111-4111-8111-111111111111';
const categoryId = '22222222-2222-4222-8222-222222222222';
const quoteId = '33333333-3333-4333-8333-333333333333';
const orderId = '44444444-4444-4444-8444-444444444444';
const createdAt = '2026-10-18T10:00:00.000Z';
const expiresAt = '2026-10-18T10:05:00.000Z';
const intentLine = { itemId, quantity: 2, observedRevision: 1, observedUnitPriceMinor: 115 };
const line = {
  itemId, categoryId, itemName: 'Coffee', categoryName: 'Drinks', itemRevision: 1,
  pricingMode: 'fixed', unitPriceMinor: 115, quantity: 2, lineTotalMinor: 230
};
const snapshot = {
  quoteId, createdAt, expiresAt, menuRevision: 1, lines: [line],
  subtotalMinor: 230, discountMinor: 30, totalMinor: 200, currency: 'USD'
};
const itemInput = { categoryId, name: 'Coffee', available: true };

describe('setup and common contracts', () => {
  it('accepts image create/update/clear and rejects unsupported URLs and non-v4 IDs', () => {
    for (const imageUrl of ['/images/soup.jpg', '/api/images/soup.jpg', 'https://example.com/dish.jpg']) {
      expect(createItemSchema.safeParse({ ...itemInput, pricingMode: 'open', imageUrl }).success).toBe(true);
      expect(updateItemSchema.safeParse({ expectedRevision: 1, imageUrl }).success).toBe(true);
    }
    expect(updateItemSchema.safeParse({ expectedRevision: 1, imageUrl: null }).success).toBe(true);
    for (const imageUrl of ['http://example.com/a.jpg', 'javascript:alert(1)', '/images/../secret.jpg', 'https://']) {
      expect(createItemSchema.safeParse({ ...itemInput, pricingMode: 'open', imageUrl }).success).toBe(false);
    }
    for (const categoryId of ['11111111-1111-1111-8111-111111111111', '11111111-1111-7111-8111-111111111111']) {
      expect(createItemSchema.safeParse({ ...itemInput, categoryId, pricingMode: 'open' }).success).toBe(false);
    }
  });

  it('trims names and enforces string limits', () => {
    expect(createCategorySchema.parse({ name: ' Drinks ' })).toEqual({ name: 'Drinks', sortOrder: 0 });
    for (const name of ['', ' ', 'a'.repeat(121)]) {
      expect(createCategorySchema.safeParse({ name }).success).toBe(false);
    }
    expect(createItemSchema.safeParse({ ...itemInput, pricingMode: 'open', description: 'a'.repeat(2001) }).success).toBe(false);
    expect(createItemSchema.safeParse({ ...itemInput, pricingMode: 'open', description: 'a'.repeat(2000) }).success).toBe(true);
  });

  it('requires fixed prices and omits fixed prices from open-item writes', () => {
    expect(createItemSchema.parse({ ...itemInput, pricingMode: 'fixed', priceMinor: 0 }).pricingMode).toBe('fixed');
    expect(createItemSchema.parse({ ...itemInput, pricingMode: 'open' }).pricingMode).toBe('open');
    for (const priceMinor of [-1, 1.5, 1_000_001, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1, '115', null]) {
      expect(createItemSchema.safeParse({ ...itemInput, pricingMode: 'fixed', priceMinor }).success).toBe(false);
    }
    expect(createItemSchema.safeParse({ ...itemInput, pricingMode: 'fixed' }).success).toBe(false);
    expect(createItemSchema.safeParse({ ...itemInput, pricingMode: 'open', priceMinor: 100 }).success).toBe(false);
    expect(createItemSchema.safeParse({ ...itemInput, pricingMode: 'open', priceMinor: null }).success).toBe(false);
    expect(createItemSchema.safeParse({ ...itemInput, pricingMode: 'variable', priceMinor: 100 }).success).toBe(false);
  });

  it('requires explicit pricing changes and a positive expected revision', () => {
    expect(updateItemSchema.safeParse({ expectedRevision: 1, priceMinor: 100 }).success).toBe(false);
    expect(updateItemSchema.safeParse({ expectedRevision: 1, pricingMode: 'fixed' }).success).toBe(false);
    expect(updateItemSchema.safeParse({ expectedRevision: 1, pricingMode: 'open' }).success).toBe(true);
    expect(updateItemSchema.safeParse({ expectedRevision: 1, available: false }).success).toBe(true);
    expect(updateItemSchema.safeParse({ expectedRevision: 1 }).success).toBe(false);
    expect(updateCategorySchema.safeParse({ expectedRevision: 1 }).success).toBe(false);
    expect(updateCategorySchema.safeParse({ expectedRevision: 1, archived: true }).success).toBe(true);
    expect(updateCategorySchema.safeParse({ expectedRevision: 1, archived: false }).success).toBe(false);
    expect(updateItemSchema.safeParse({ expectedRevision: 0, name: 'Coffee' }).success).toBe(false);
  });

  it('parses bounded query strings without permissive coercion', () => {
    expect(paginationQuerySchema.parse({})).toEqual({ page: 1, pageSize: 50 });
    expect(menuItemsQuerySchema.parse({ page: '2', pageSize: '100', search: ' coffee ' })).toEqual({ page: 2, pageSize: 100, search: 'coffee' });
    for (const page of ['0', '-1', '1.5', '1e2', '', ' ', true, ['1'], '9007199254740992']) {
      expect(paginationQuerySchema.safeParse({ page }).success).toBe(false);
    }
    expect(paginationQuerySchema.safeParse({ pageSize: '101' }).success).toBe(false);
    expect(setupItemsQuerySchema.parse({ includeArchived: 'false' }).includeArchived).toBe(false);
    expect(setupItemsQuerySchema.parse({ includeArchived: 'true' }).includeArchived).toBe(true);
    expect(setupItemsQuerySchema.safeParse({ includeArchived: 'yes' }).success).toBe(false);
  });

  it('accepts UTC timestamps, UUIDs and safe revisions only', () => {
    expect(timestampSchema.safeParse(createdAt).success).toBe(true);
    expect(timestampSchema.safeParse('2026-10-18T10:00:00+03:00').success).toBe(false);
    expect(timestampSchema.safeParse('2026-10-18').success).toBe(false);
    expect(confirmOrderSchema.safeParse({ quoteId: 'not-a-uuid' }).success).toBe(false);
    expect(syncStateSchema.parse({ menuRevision: 0, ordersRevision: 0 })).toEqual({ menuRevision: 0, ordersRevision: 0 });
    for (const menuRevision of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(syncStateSchema.safeParse({ menuRevision, ordersRevision: 0 }).success).toBe(false);
    }
    expect(moneyMinorSchema.safeParse(Number.MAX_SAFE_INTEGER).success).toBe(true);
  });
});

describe('cart, quote and order snapshots', () => {
  it('bounds cart size and quantities while retaining separate open-price lines', () => {
    const cart = { lines: [intentLine], discountMinor: 0 };
    expect(cartIntentSchema.parse(cart)).toEqual(cart);
    for (const quantity of [0, -1, 1.1, 100, '2', true]) {
      expect(cartIntentSchema.safeParse({ ...cart, lines: [{ ...intentLine, quantity }] }).success).toBe(false);
    }
    expect(cartIntentSchema.safeParse({ ...cart, lines: [] }).success).toBe(false);
    expect(cartIntentSchema.safeParse({ ...cart, lines: Array.from({ length: 101 }, () => intentLine) }).success).toBe(false);
    expect(cartIntentSchema.safeParse({ ...cart, lines: Array.from({ length: 100 }, () => intentLine) }).success).toBe(true);
    expect(cartIntentSchema.parse({ lines: [
      { ...intentLine, openPriceMinor: 100 }, { ...intentLine, openPriceMinor: 200 }
    ], discountMinor: 0 }).lines).toHaveLength(2);
  });

  it('validates immutable snapshots and all derived totals', () => {
    expect(quoteSnapshotSchema.parse(snapshot)).toEqual(snapshot);
    for (const patch of [
      { subtotalMinor: 231 }, { totalMinor: 201 }, { discountMinor: 231, totalMinor: 0 },
      { discountMinor: -1 }, { currency: 'EUR' }, { expiresAt: createdAt },
      { lines: [{ ...line, lineTotalMinor: 231 }] }
    ]) {
      expect(quoteSnapshotSchema.safeParse({ ...snapshot, ...patch }).success).toBe(false);
    }
    expect(quoteSnapshotSchema.safeParse({ ...snapshot, discountMinor: 230, totalMinor: 0 }).success).toBe(true);
    expect(snapshotLineSchema.safeParse({ ...line, pricingMode: 'unknown' }).success).toBe(false);
  });

  it('ties visible quote differences to their lines', () => {
    const changes = [{ lineIndex: 0, itemId, field: 'unitPriceMinor', observed: 100, current: 115 }];
    expect(quoteResponseSchema.safeParse({ ...snapshot, changes }).success).toBe(true);
    expect(quoteResponseSchema.safeParse({ ...snapshot, changes: [{ ...changes[0], lineIndex: 1 }] }).success).toBe(false);
  });

  it('validates historical order snapshots independently of current menu values', () => {
    const order = { id: orderId, quoteId, status: 'placed', revision: 1, createdAt, updatedAt: createdAt,
      lines: [{ ...line, id: itemId }], subtotalMinor: 230, discountMinor: 30, totalMinor: 200, currency: 'USD' };
    expect(orderResponseSchema.safeParse({ order, ordersRevision: 1 }).success).toBe(true);
    expect(orderResponseSchema.safeParse({ order: { ...order, totalMinor: 199 }, ordersRevision: 1 }).success).toBe(false);
    expect(orderResponseSchema.safeParse({ order: { ...order, status: 'paid' }, ordersRevision: 1 }).success).toBe(false);
  });

  it('resolves missing items and bounds distinct IDs', () => {
    expect(resolveItemsRequestSchema.parse({ itemIds: [itemId] }).itemIds).toEqual([itemId]);
    expect(resolveItemsRequestSchema.safeParse({ itemIds: [itemId, itemId] }).success).toBe(false);
    expect(resolveItemsResponseSchema.safeParse({ items: [{ itemId, state: 'missing' }], menuRevision: 1 }).success).toBe(true);
    const category = categorySchema.parse({ id: categoryId, name: 'Drinks', sortOrder: 0, revision: 1, createdAt, updatedAt: createdAt, archivedAt: null });
    expect(categoriesResponseSchema.safeParse({ categories: [category], menuRevision: 1 }).success).toBe(true);
  });
  it('requires null fixed prices for open-item responses and consistent resolution IDs', () => {
    const category = { id: categoryId, name: 'Drinks', sortOrder: 0, revision: 1, createdAt, updatedAt: createdAt, archivedAt: null };
    const item = { ...itemInput, id: itemId, revision: 1, createdAt, updatedAt: createdAt, archivedAt: null, pricingMode: 'open', priceMinor: null };
    expect(menuItemSchema.safeParse(item).success).toBe(true);
    expect(menuItemSchema.safeParse({ ...item, priceMinor: 100 }).success).toBe(false);
    expect(resolveItemsResponseSchema.safeParse({ items: [{ itemId, state: 'available', item, category }], menuRevision: 1 }).success).toBe(true);
    expect(resolveItemsResponseSchema.safeParse({ items: [{ itemId: orderId, state: 'available', item, category }], menuRevision: 1 }).success).toBe(false);
    expect(itemsResponseSchema.safeParse({ items: [item], total: 0, page: 1, pageSize: 50, menuRevision: 1 }).success).toBe(false);
  });
});

describe('strict requests', () => {
  it.each([
    [createCategorySchema, { name: 'Drinks' }],
    [updateCategorySchema, { expectedRevision: 1, name: 'Drinks' }],
    [createItemSchema, { ...itemInput, pricingMode: 'fixed', priceMinor: 115 }],
    [updateItemSchema, { expectedRevision: 1, available: false }],
    [cartIntentSchema, { lines: [intentLine], discountMinor: 0 }],
    [confirmOrderSchema, { quoteId }],
    [updateOrderStatusSchema, { status: 'ready', expectedRevision: 1 }],
    [resolveItemsRequestSchema, { itemIds: [itemId] }],
    [menuItemsQuerySchema, {}],
    [ordersQuerySchema, {}]
  ])('rejects unknown fields in request %#', (schema, value) => {
    expect(schema.safeParse(value).success).toBe(true);
    expect(schema.safeParse({ ...value, unexpected: true }).success).toBe(false);
  });

  it('rejects nested client prices and server fields in confirmation', () => {
    expect(cartIntentSchema.safeParse({ lines: [{ ...intentLine, unitPriceMinor: 1 }], discountMinor: 0 }).success).toBe(false);
    expect(confirmOrderSchema.safeParse({ quoteId, totalMinor: 0 }).success).toBe(false);
  });
});

describe('statuses, errors and socket contracts', () => {
  it('implements exactly the agreed transition graph', () => {
    const allowed = new Set(['placed:preparing', 'placed:cancelled', 'preparing:ready', 'preparing:cancelled', 'ready:completed']);
    for (const from of orderStatusSchema.options) {
      for (const to of orderStatusSchema.options) {
        expect(canTransitionOrderStatus(from, to)).toBe(allowed.has(`${from}:${to}`));
      }
    }
    expect(ORDER_STATUS_TRANSITIONS.completed).toEqual([]);
    expect(ORDER_STATUS_TRANSITIONS.cancelled).toEqual([]);
  });

  it('discriminates error details and excludes unknown internal data', () => {
    const error = { code: 'QUOTE_USED', message: 'Already placed.', requestId: itemId, details: { quoteId, orderId } };
    const result: ApiError = apiErrorSchema.parse({ error });
    if (result.error.code === 'QUOTE_USED') expectTypeOf(result.error.details.orderId).toBeString();
    expect(apiErrorSchema.safeParse({ error: { ...error, details: { quoteId } } }).success).toBe(false);
    expect(apiErrorSchema.safeParse({ error: { ...error, details: { quoteId, orderId, stack: 'secret' } } }).success).toBe(false);
    expect(apiErrorSchema.safeParse({ error: { ...error, code: 'UNKNOWN' } }).success).toBe(false);
    expect(apiErrorSchema.safeParse({ error: { code: 'INTERNAL_ERROR', message: 'Try again.', requestId: itemId, details: { stack: 'secret' } } }).success).toBe(false);
    expect(API_ERROR_STATUS.QUOTE_USED).toBe(409);
  });

  it.each([
    ['VALIDATION_ERROR', { issues: [{ path: ['lines', 0, 'quantity'], message: 'Invalid quantity.', code: 'too_big' }] }],
    ['NOT_FOUND', { resourceType: 'quote', resourceId: quoteId }],
    ['REVISION_CONFLICT', { entityType: 'item', entityId: itemId, expectedRevision: 1, currentRevision: 2 }],
    ['CART_INVALID', { issues: [{ lineIndex: 0, itemId, code: 'ITEM_UNAVAILABLE', message: 'Unavailable.' }] }],
    ['DISCOUNT_EXCEEDS_SUBTOTAL', { subtotalMinor: 100, discountMinor: 101 }],
    ['QUOTE_EXPIRED', { quoteId, expiresAt }],
    ['QUOTE_USED', { quoteId, orderId }],
    ['MENU_CHANGED', { quoteId, quotedMenuRevision: 1, currentMenuRevision: 2 }],
    ['IDEMPOTENCY_CONFLICT', { idempotencyKey: itemId }],
    ['INVALID_STATUS_TRANSITION', { orderId, currentStatus: 'ready', requestedStatus: 'cancelled', allowedStatuses: ['completed'] }],
    ['CATEGORY_ARCHIVED', { categoryId }],
    ['SERVICE_UNAVAILABLE', { retryAfterMs: 1000 }]
  ])('requires the documented details for %s', (code, details) => {
    const error = { code, message: 'Action required.', requestId: itemId, details };
    expect(apiErrorSchema.safeParse({ error }).success).toBe(true);
    expect(apiErrorSchema.safeParse({ error: { ...error, details: {} } }).success).toBe(false);
    expect(apiErrorSchema.safeParse({ error: { ...error, details: { ...details, unexpected: true } } }).success).toBe(false);
  });

  it('validates cart issues with a line-specific code and index', () => {
    const error = { code: 'CART_INVALID', message: 'Correct the cart.', requestId: itemId,
      details: { issues: [{ lineIndex: 0, itemId, code: 'OPEN_PRICE_REQUIRED', message: 'Enter a price.' }] } };
    expect(apiErrorSchema.safeParse({ error }).success).toBe(true);
    expect(apiErrorSchema.safeParse({ error: { ...error, details: { issues: [{ lineIndex: 100, itemId, code: 'OPEN_PRICE_REQUIRED', message: 'Enter a price.' }] } } }).success).toBe(false);
  });

  it('derives Socket.IO callback maps from runtime event schemas', () => {
    expectTypeOf<Parameters<ServerToClientEvents['sync.state']>[0]>().toEqualTypeOf<SyncState>();
    expectTypeOf<keyof ClientToServerEvents>().toEqualTypeOf<never>();
    expect(Object.keys(serverEventSchemas)).toEqual(['sync.state', 'menu.changed', 'orders.changed']);
    expect(menuChangedSchema.safeParse({ eventId: itemId, menuRevision: 2, entityType: 'item', entityId: itemId, change: 'updated' }).success).toBe(true);
    expect(ordersChangedSchema.safeParse({ eventId: itemId, ordersRevision: 2, orderId, orderRevision: 1, change: 'created' }).success).toBe(true);
    expect(ordersChangedSchema.safeParse({ eventId: itemId, ordersRevision: 2, orderId, orderRevision: 1, change: 'deleted' }).success).toBe(false);
  });
});
