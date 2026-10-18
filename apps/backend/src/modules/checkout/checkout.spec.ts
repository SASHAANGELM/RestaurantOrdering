import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  apiErrorSchema, MAX_CART_LINES, MAX_QUANTITY, MAX_UNIT_PRICE_MINOR, QUOTE_LIFETIME_MS,
  quoteResponseSchema, quoteSnapshotSchema, type CartLine, type Category, type MenuItem
} from '@restaurant-ordering/contracts';
import { createApp } from '../../app';
import { openDatabase, type DatabaseConnection } from '../../db/connection';
import { initializeDatabase } from '../../db/initialize';
import { checkoutQuotes } from '../../db/schema';
import { readMenuRevision } from '../menu/queries';
import { createMenuService } from '../menu/service';
import { createCheckoutService } from './service';

describe('checkout quotes with isolated real SQLite files', () => {
  let directory: string;
  let filename: string;
  let connection: DatabaseConnection;
  let server: Server;
  let url: string;
  let category: Category;
  let fixed: MenuItem;
  let open: MenuItem;
  let menu: ReturnType<typeof createMenuService>;
  let checkout: ReturnType<typeof createCheckoutService>;

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'restaurant-checkout-'));
    filename = join(directory, 'test.sqlite');
    connection = initializeDatabase({ filename });
    menu = createMenuService(connection);
    checkout = createCheckoutService(connection);
    category = menu.createCategory({ name: 'Mains', sortOrder: 0 }).response.category;
    fixed = menu.createItem({ categoryId: category.id, name: 'Soup', pricingMode: 'fixed', priceMinor: 500, available: true }).response.item;
    open = menu.createItem({ categoryId: category.id, name: 'Special', pricingMode: 'open', available: true }).response.item;
    server = createServer(createApp({ connection, jsonBodyLimitBytes: 65536, reportError: vi.fn() }));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing listener.');
    url = `http://127.0.0.1:${address.port}/api/checkout/quotes`;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    if (connection.sqlite.open) connection.close();
    rmSync(directory, { recursive: true, force: true });
  });

  const line = (item: MenuItem, extra: Partial<CartLine> = {}): CartLine => ({
    itemId: item.id, observedRevision: item.revision, quantity: 2, ...extra
  });
  const post = (body: unknown) => fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  const quote = (lines = [line(fixed)], discountMinor = 0) => post({ lines, discountMinor });
  async function success(response: Response) {
    expect(response.status).toBe(201);
    expect(response.headers.get('cache-control')).toBe('no-store');
    return quoteResponseSchema.parse(await response.json());
  }
  function countQuotes() {
    return connection.sqlite.prepare('SELECT count(*) AS count FROM checkout_quotes').get();
  }
  async function rejection(response: Response, status: number, code: string) {
    expect(response.status).toBe(status);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const result = apiErrorSchema.parse(await response.json()).error;
    expect(result.code).toBe(code);
    expect(result.requestId).toBe(response.headers.get('x-request-id'));
    expect(countQuotes()).toEqual({ count: 0 });
    return result;
  }

  it('persists the exact authoritative snapshot, revision, currency, and five-minute lifetime across reopening', async () => {
    const before = Date.now();
    const result = await success(await quote([line(fixed), line(open, { quantity: 3, openPriceMinor: 115 })], 45));
    expect(Date.parse(result.createdAt)).toBeGreaterThanOrEqual(before);
    expect(Date.parse(result.createdAt)).toBeLessThanOrEqual(Date.now());
    expect(Date.parse(result.expiresAt) - Date.parse(result.createdAt)).toBe(QUOTE_LIFETIME_MS);
    expect(result).toMatchObject({ menuRevision: 3, subtotalMinor: 1345, discountMinor: 45, totalMinor: 1300,
      currency: 'USD', changes: [], lines: [
        { itemId: fixed.id, categoryId: category.id, itemName: 'Soup', categoryName: 'Mains', itemRevision: 1,
          pricingMode: 'fixed', unitPriceMinor: 500, quantity: 2, lineTotalMinor: 1000 },
        { itemId: open.id, pricingMode: 'open', unitPriceMinor: 115, quantity: 3, lineTotalMinor: 345 }
      ] });
    connection.close();
    connection = openDatabase(filename);
    const stored = connection.db.select().from(checkoutQuotes).get()!;
    const { changes, ...snapshot } = result;
    expect(changes).toEqual([]);
    expect(quoteSnapshotSchema.parse(stored.snapshot)).toEqual(snapshot);
    expect(stored).toEqual({ id: result.quoteId, snapshot, menuRevision: 3, currency: 'USD',
      createdAt: result.createdAt, expiresAt: result.expiresAt });
  });

  it('recalculates changed fixed prices and names and reports all observed differences by original line index', async () => {
    menu.updateItem(fixed.id, { expectedRevision: 1, name: 'New soup', pricingMode: 'fixed', priceMinor: 725 });
    menu.updateCategory(category.id, { expectedRevision: 1, name: 'Lunch' });
    const result = await success(await quote([
      line(open, { openPriceMinor: 25, observedUnitPriceMinor: 10, observedName: 'Old special' }),
      line(fixed, { observedUnitPriceMinor: 500, observedName: 'Soup' })
    ], 50));
    expect(result).toMatchObject({ menuRevision: 5, subtotalMinor: 1500, totalMinor: 1450 });
    expect(result.lines[1]).toMatchObject({ itemName: 'New soup', categoryName: 'Lunch', itemRevision: 2, unitPriceMinor: 725 });
    expect(result.changes).toEqual([
      { lineIndex: 0, itemId: open.id, field: 'unitPriceMinor', observed: 10, current: 25 },
      { lineIndex: 0, itemId: open.id, field: 'name', observed: 'Old special', current: 'Special' },
      { lineIndex: 1, itemId: fixed.id, field: 'revision', observed: 1, current: 2 },
      { lineIndex: 1, itemId: fixed.id, field: 'unitPriceMinor', observed: 500, current: 725 },
      { lineIndex: 1, itemId: fixed.id, field: 'name', observed: 'Soup', current: 'New soup' }
    ]);
  });

  it('uses observations only to report differences, including newer or invented client observations', async () => {
    const result = await success(await quote([line(fixed, { observedRevision: 99, observedUnitPriceMinor: 1, observedName: 'Fake' })]));
    expect(result.lines[0]).toMatchObject({ itemName: 'Soup', itemRevision: 1, unitPriceMinor: 500, lineTotalMinor: 1000 });
    expect(result.changes).toHaveLength(3);
    const matching = await success(await quote([line(fixed, { observedUnitPriceMinor: 500, observedName: 'Soup' })]));
    expect(matching.changes).toEqual([]);
  });

  it('keeps multiple prices for the same open item as distinct, ordered snapshot lines', async () => {
    const result = await success(await quote([
      line(open, { openPriceMinor: 115 }), line(open, { openPriceMinor: 230, quantity: 3 }), line(open, { openPriceMinor: 0 })
    ]));
    expect(result.lines.map((entry) => [entry.itemId, entry.unitPriceMinor, entry.quantity])).toEqual([
      [open.id, 115, 2], [open.id, 230, 3], [open.id, 0, 2]
    ]);
    expect(result.subtotalMinor).toBe(920);
  });

  it('collects line-specific eligibility and pricing issues without persisting a partial quote', async () => {
    const missing = randomUUID();
    const archived = menu.createItem({ categoryId: category.id, name: 'Old', pricingMode: 'open', available: false }).response.item;
    menu.updateItem(archived.id, { expectedRevision: 1, archived: true });
    const unavailable = menu.createItem({ categoryId: category.id, name: 'Sold out', pricingMode: 'open', available: false }).response.item;
    const other = menu.createCategory({ name: 'Old category', sortOrder: 0 }).response.category;
    const child = menu.createItem({ categoryId: other.id, name: 'Child', pricingMode: 'open', available: false }).response.item;
    menu.updateCategory(other.id, { expectedRevision: 1, archived: true });
    const result = await rejection(await quote([
      line(fixed), line(fixed, { itemId: missing }), line(archived), line(unavailable), line(child),
      line(open), line(fixed, { openPriceMinor: 500 })
    ]), 422, 'CART_INVALID');
    expect(result).toMatchObject({ details: { issues: [
      { lineIndex: 1, itemId: missing, code: 'ITEM_MISSING' },
      { lineIndex: 2, itemId: archived.id, code: 'ITEM_ARCHIVED' },
      { lineIndex: 3, itemId: unavailable.id, code: 'ITEM_UNAVAILABLE' },
      { lineIndex: 4, itemId: child.id, code: 'CATEGORY_ARCHIVED' },
      { lineIndex: 5, itemId: open.id, code: 'OPEN_PRICE_REQUIRED' },
      { lineIndex: 6, itemId: fixed.id, code: 'FIXED_PRICE_OVERRIDE' }
    ] } });
  });

  it('rejects fixed-to-open and open-to-fixed mode switches until the cart price intent is corrected', async () => {
    menu.updateItem(fixed.id, { expectedRevision: 1, pricingMode: 'open' });
    menu.updateItem(open.id, { expectedRevision: 1, pricingMode: 'fixed', priceMinor: 75 });
    const result = await rejection(await quote([line(fixed), line(open, { openPriceMinor: 100 })]), 422, 'CART_INVALID');
    expect(result).toMatchObject({ details: { issues: [
      { lineIndex: 0, code: 'OPEN_PRICE_REQUIRED' }, { lineIndex: 1, code: 'FIXED_PRICE_OVERRIDE' }
    ] } });
    const corrected = await success(await quote([line(fixed, { openPriceMinor: 25 }), line(open)]));
    expect(corrected.lines.map((entry) => [entry.pricingMode, entry.unitPriceMinor])).toEqual([['open', 25], ['fixed', 75]]);
    expect(corrected.changes.filter((change) => change.field === 'revision')).toHaveLength(2);
  });

  it.each(['fixed', 'open', 'full-discount'] as const)('accepts a zero total with %s pricing', async (mode) => {
    if (mode === 'fixed') menu.updateItem(fixed.id, { expectedRevision: 1, pricingMode: 'fixed', priceMinor: 0 });
    const result = await success(await quote(mode === 'open' ? [line(open, { openPriceMinor: 0 })] : [line(fixed)],
      mode === 'full-discount' ? 1000 : 0));
    expect(result.totalMinor).toBe(0);
  });

  it.each([1001, Number.MAX_SAFE_INTEGER])('rejects discount %s above the authoritative subtotal without clamping', async (discount) => {
    const result = await rejection(await quote([line(fixed)], discount), 422, 'DISCOUNT_EXCEEDS_SUBTOTAL');
    expect(result).toMatchObject({ details: { subtotalMinor: 1000, discountMinor: discount } });
  });

  it('computes the largest permitted cart exactly without 32-bit overflow', async () => {
    const result = await success(await quote(Array.from({ length: MAX_CART_LINES }, () => line(open, {
      quantity: MAX_QUANTITY, openPriceMinor: MAX_UNIT_PRICE_MINOR
    })), 1));
    expect(result.lines).toHaveLength(100);
    expect(result.lines.every((entry) => entry.lineTotalMinor === 99_000_000)).toBe(true);
    expect(result).toMatchObject({ subtotalMinor: 9_900_000_000, totalMinor: 9_899_999_999 });
  });

  it.each(['1.15', '1.001', '1e2', '-1', '', 'Infinity', 1.15, -1, 1_000_001, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid transport open price %j at the specific input boundary', async (openPriceMinor) => {
      const result = await rejection(await post({ lines: [{ ...line(open), openPriceMinor }], discountMinor: 0 }), 400, 'VALIDATION_ERROR');
      expect(result).toMatchObject({ details: { issues: expect.arrayContaining([
        expect.objectContaining({ path: ['body', 'lines', 0, 'openPriceMinor'] })
      ]) } });
    }
  );

  it.each(['1.15', '1.001', 0.5, -1, Number.MAX_SAFE_INTEGER + 1])('rejects invalid discount %j at the input boundary', async (discountMinor) => {
    const result = await rejection(await post({ lines: [line(fixed)], discountMinor }), 400, 'VALIDATION_ERROR');
    expect(result).toMatchObject({ details: { issues: [{ path: ['body', 'discountMinor'] }] } });
  });

  it.each([0, 100, 1.5, '2', Number.MAX_SAFE_INTEGER + 1])('rejects invalid quantity %j before multiplication', async (quantity) => {
    const result = await rejection(await post({ lines: [{ ...line(fixed), quantity }], discountMinor: 0 }), 400, 'VALIDATION_ERROR');
    expect(result).toMatchObject({ details: { issues: expect.arrayContaining([
      expect.objectContaining({ path: ['body', 'lines', 0, 'quantity'] })
    ]) } });
  });

  it.each(['empty', 'too-many', 'missing-discount', 'unknown-total', 'unknown-line-price', 'invalid-id', 'missing-revision'])(
    'rejects malformed cart %s with no quote', async (kind) => {
      const bodies: Record<string, unknown> = {
        empty: { lines: [], discountMinor: 0 },
        'too-many': { lines: Array.from({ length: 101 }, () => line(fixed)), discountMinor: 0 },
        'missing-discount': { lines: [line(fixed)] },
        'unknown-total': { lines: [line(fixed)], discountMinor: 0, totalMinor: 1 },
        'unknown-line-price': { lines: [{ ...line(fixed), unitPriceMinor: 1 }], discountMinor: 0 },
        'invalid-id': { lines: [{ ...line(fixed), itemId: 'invalid' }], discountMinor: 0 },
        'missing-revision': { lines: [{ itemId: fixed.id, quantity: 1 }], discountMinor: 0 }
      };
      await rejection(await post(bodies[kind]), 400, 'VALIDATION_ERROR');
    }
  );

  it('retains exact quoted snapshots after menu edits without reserving availability or creating orders', async () => {
    const first = await success(await quote());
    const second = await success(await quote());
    expect(second.quoteId).not.toBe(first.quoteId);
    expect(readMenuRevision(connection)).toBe(3);
    expect(connection.sqlite.prepare('SELECT orders_revision FROM app_state').get()).toEqual({ orders_revision: 0 });
    for (const table of ['orders', 'order_lines']) {
      expect(connection.sqlite.prepare(`SELECT count(*) AS count FROM ${table}`).get()).toEqual({ count: 0 });
    }
    expect(connection.sqlite.prepare('SELECT available, revision FROM menu_items WHERE id = ?').get(fixed.id))
      .toEqual({ available: 1, revision: 1 });
    menu.updateItem(fixed.id, { expectedRevision: 1, name: 'Edited', available: false, pricingMode: 'fixed', priceMinor: 900 });
    menu.updateCategory(category.id, { expectedRevision: 1, archived: true });
    const stored = connection.db.select().from(checkoutQuotes).all();
    expect(stored).toHaveLength(2);
    expect(stored.map((row) => row.snapshot.lines[0])).toEqual([first.lines[0], second.lines[0]]);
  });

  it('bounds an all-invalid 100-line cart to one actionable issue per line', async () => {
    const result = await rejection(await quote(Array.from({ length: 100 }, () => line(fixed, { itemId: randomUUID() }))), 422, 'CART_INVALID');
    if (result.code !== 'CART_INVALID') throw new Error('Expected cart issues.');
    expect(result.details.issues.map((issue) => issue.lineIndex)).toEqual(Array.from({ length: 100 }, (_, index) => index));
  });

  it('rolls back a failed persistence operation and exposes only the common internal error', async () => {
    connection.sqlite.exec(`CREATE TRIGGER fail_quote AFTER INSERT ON checkout_quotes
      BEGIN SELECT RAISE(ABORT, 'private quote persistence failure'); END`);
    const result = await rejection(await quote(), 500, 'INTERNAL_ERROR');
    expect(JSON.stringify(result)).not.toContain('private');
    expect(readMenuRevision(connection)).toBe(3);
    connection.sqlite.exec('DROP TRIGGER fail_quote');
    await success(await quote());
  });

  it('maps real writer contention to a retryable response and recovers after release', async () => {
    const writer = openDatabase(filename);
    connection.sqlite.pragma('busy_timeout = 1');
    try {
      writer.sqlite.exec('BEGIN IMMEDIATE');
      const response = await quote();
      await rejection(response, 503, 'SERVICE_UNAVAILABLE');
      expect(response.headers.get('retry-after')).toBe('1');
      writer.sqlite.exec('ROLLBACK');
      await success(await quote());
    } finally {
      if (writer.sqlite.inTransaction) writer.sqlite.exec('ROLLBACK');
      writer.close();
    }
  });

  it('serializes menu writes while reading and persisting the matching quote snapshot and revision', () => {
    const writer = openDatabase(filename);
    writer.sqlite.pragma('busy_timeout = 1');
    const original = connection.db.select.bind(connection.db);
    let selects = 0;
    let attempted = false;
    const spy = vi.spyOn(connection.db, 'select').mockImplementation(((...args: Parameters<typeof original>) => {
      if (++selects === 2) {
        attempted = true;
        expect(() => createMenuService(writer).updateItem(fixed.id, { expectedRevision: 1, available: false })).toThrow();
      }
      return original(...args);
    }) as typeof original);
    try {
      const snapshot = quoteResponseSchema.parse(checkout.createQuote({ lines: [line(fixed)], discountMinor: 0 }));
      expect(attempted).toBe(true);
      expect(snapshot).toMatchObject({ menuRevision: 3, lines: [{ itemRevision: 1, unitPriceMinor: 500 }] });
      spy.mockRestore();
      createMenuService(writer).updateItem(fixed.id, { expectedRevision: 1, available: false });
      expect(readMenuRevision(connection)).toBe(4);
      expect(connection.db.select().from(checkoutQuotes).get()!.snapshot.menuRevision).toBe(3);
    } finally { spy.mockRestore(); writer.close(); }
  });
});
