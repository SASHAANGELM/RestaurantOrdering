import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { buildSync } from 'esbuild';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  apiErrorSchema, ORDER_STATUS_TRANSITIONS, orderResponseSchema, ordersChangedSchema, ordersResponseSchema,
  type CartLine, type Category, type MenuItem, type Order, type OrderStatus
} from '@restaurant-ordering/contracts';
import { createApp } from '../../app';
import { openDatabase, type DatabaseConnection } from '../../db/connection';
import { initializeDatabase } from '../../db/initialize';
import { checkoutQuotes } from '../../db/schema';
import { createCheckoutService } from '../checkout/service';
import { readMenuRevision } from '../menu/queries';
import { createMenuService } from '../menu/service';
import { getOrder, getOrderByRequest, listOrders, readOrdersRevision } from './queries';
import { createOrderService, type OrderMutation } from './service';

describe('orders with isolated real SQLite files', () => {
  let directory: string;
  let filename: string;
  let connection: DatabaseConnection;
  let server: Server;
  let baseUrl: string;
  let category: Category;
  let fixed: MenuItem;
  let open: MenuItem;
  let menu: ReturnType<typeof createMenuService>;
  let checkout: ReturnType<typeof createCheckoutService>;
  let service: ReturnType<typeof createOrderService>;

  async function start() {
    menu = createMenuService(connection);
    checkout = createCheckoutService(connection);
    service = createOrderService(connection);
    const app = createApp({ connection, jsonBodyLimitBytes: 65536, reportError: vi.fn() });
    server = createServer((request, response) => {
      // Drop the real confirmation response at end(), after the route has committed.
      if (request.headers['x-drop-response'] === 'true') vi.spyOn(response, 'end').mockImplementation(() => {
        response.destroy();
        return response;
      });
      app(request, response);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing listener.');
    baseUrl = `http://127.0.0.1:${address.port}/api/orders`;
  }

  async function stop() {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    if (connection.sqlite.open) connection.close();
  }

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'restaurant-orders-'));
    filename = join(directory, 'test.sqlite');
    connection = initializeDatabase({ filename });
    const setup = createMenuService(connection);
    category = setup.createCategory({ name: 'Mains', sortOrder: 0 }).response.category;
    fixed = setup.createItem({ categoryId: category.id, name: 'Soup', pricingMode: 'fixed', priceMinor: 500, available: true }).response.item;
    open = setup.createItem({ categoryId: category.id, name: 'Special', pricingMode: 'open', available: true }).response.item;
    await start();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await stop();
    rmSync(directory, { recursive: true, force: true });
  });

  const page = { page: 1, pageSize: 50 };
  const line = (item: MenuItem, extra: Partial<CartLine> = {}): CartLine => ({ itemId: item.id, observedRevision: item.revision, quantity: 2, ...extra });
  const quote = (lines = [line(fixed)], discountMinor = 0) => checkout.createQuote({ lines, discountMinor });
  const place = (snapshot = quote(), key = randomUUID()) => service.confirm({ quoteId: snapshot.quoteId }, key);
  const post = (body: unknown, key: string | undefined = randomUUID(), extraHeaders = {}) => fetch(baseUrl, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(key === undefined ? {} : { 'Idempotency-Key': key }), ...extraHeaders },
    body: JSON.stringify(body)
  });
  const patch = (id: string, body: unknown) => fetch(`${baseUrl}/${id}/status`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });

  it('lists related orders by item identity once per order, with pagination/status filtering after renaming and archival', async () => {
    const related: Order[] = [];
    for (let index = 0; index < 12; index++) related.push(place(quote([
      line(open, { openPriceMinor: 100 }), line(open, { openPriceMinor: 200 }), line(fixed)
    ])).response.order);
    place();
    const cancelled = service.updateStatus(related[0]!.id, { expectedRevision: 1, status: 'cancelled' }).response.order;
    menu.updateItem(open.id, { expectedRevision: 1, name: fixed.name, available: false });
    menu.updateItem(open.id, { expectedRevision: 2, archived: true });
    for (const pageNumber of [1, 2]) {
      const response = await fetch(`${baseUrl}?itemId=${open.id}&page=${pageNumber}&pageSize=10`);
      expect(response.status).toBe(200);
      const result = ordersResponseSchema.parse(await response.json());
      expect(result.total).toBe(12); expect(result.orders).toHaveLength(pageNumber === 1 ? 10 : 2);
      expect(result.orders.every(order => related.some(entry => entry.id === order.id))).toBe(true);
      expect(new Set(result.orders.map(order => order.id)).size).toBe(result.orders.length);
      expect(result.ordersRevision).toBe(readOrdersRevision(connection));
    }
    expect(listOrders(connection, { ...page, itemId: open.id, status: 'cancelled' }).orders.map(order => order.id)).toEqual([cancelled.id]);
    expect(listOrders(connection, { ...page, itemId: randomUUID() }).total).toBe(0);
    const invalid = await fetch(`${baseUrl}?itemId=invalid`);
    expect(invalid.status).toBe(400);
    expect(getOrder(connection, related[0]!.id).order.lines.filter(entry => entry.itemId === open.id).map(entry => entry.itemName)).toEqual(['Special', 'Special']);
  });

  it('includes at most three unique immutable item image/name snapshots on each order summary', () => {
    menu.updateItem(fixed.id, { expectedRevision: 1, imageUrl: '/images/soup.jpg' });
    const third = menu.createItem({ categoryId: category.id, name: 'Third', pricingMode: 'fixed', priceMinor: 100, available: true }).response.item;
    const fourth = menu.createItem({ categoryId: category.id, name: 'Fourth', pricingMode: 'fixed', priceMinor: 100, available: true }).response.item;
    const order = place(quote([line(fixed), line(open, { openPriceMinor: 100 }), line(open, { openPriceMinor: 200 }), line(third), line(fourth)])).response.order;
    menu.updateItem(fixed.id, { expectedRevision: 2, name: 'Later name', imageUrl: '/images/salad.jpg' });
    const summary = listOrders(connection, page).orders.find(entry => entry.id === order.id);
    expect(summary?.itemImages).toEqual([{ id: fixed.id, name: 'Soup', imageUrl: '/api/images/soup.jpg' }, { id: open.id, name: 'Special' }, { id: third.id, name: 'Third' }]);
    expect(getOrder(connection, order.id).order.lines[0]?.itemName).toBe('Soup');
  });
  async function success(response: Response, status = 200) {
    expect(response.status).toBe(status);
    expect(response.headers.get('cache-control')).toBe('no-store');
    return orderResponseSchema.parse(await response.json());
  }
  async function error(response: Response, status: number, code: string) {
    expect(response.status).toBe(status);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const result = apiErrorSchema.parse(await response.json()).error;
    expect(result.code).toBe(code);
    expect(result.requestId).toBe(response.headers.get('x-request-id'));
    return result;
  }
  function count(table: 'orders' | 'order_lines') {
    return (connection.sqlite.prepare(`SELECT count(*) AS count FROM ${table}`).get() as { count: number }).count;
  }
  function empty() {
    expect(count('orders')).toBe(0);
    expect(count('order_lines')).toBe(0);
    expect(readOrdersRevision(connection)).toBe(0);
  }

  it('retains distinct kitchen comments on quote and immutable order lines through replay and restart', async () => {
    const snapshot = quote([line(fixed, { comment: 'No mustard' }), line(fixed, { comment: 'Extra mustard' })]);
    expect(snapshot.lines.map(entry => entry.comment)).toEqual(['No mustard', 'Extra mustard']);
    const key = randomUUID(); const placed = place(snapshot, key).response.order;
    expect(placed.lines.map(entry => entry.comment)).toEqual(['No mustard', 'Extra mustard']);
    expect(place(snapshot, key).response.order).toEqual(placed);
    await stop(); connection = initializeDatabase({ filename }); await start();
    expect(getOrder(connection, placed.id).order.lines).toEqual(placed.lines);
  });

  it('persists every successful status timestamp and the item image through replay, menu changes and restart', async () => {
    const image = '/api/images/soup.jpg';
    const pictured = menu.updateItem(fixed.id, { expectedRevision: fixed.revision, imageUrl: image }).response.item;
    const snapshot = quote([line(pictured)]);
    const key = randomUUID();
    let order = place(snapshot, key).response.order;
    expect(order.lines[0]?.imageUrl).toBe(image);
    expect(order.history).toEqual([{ status: 'placed', changedAt: order.createdAt }]);
    for (const status of ['preparing', 'ready', 'completed'] as const) {
      order = service.updateStatus(order.id, { expectedRevision: order.revision, status }).response.order;
      expect(order.history?.at(-1)).toEqual({ status, changedAt: order.updatedAt });
    }
    expect(service.updateStatus(order.id, { expectedRevision: order.revision, status: 'completed' }).response.order.history).toHaveLength(4);
    expect(() => service.updateStatus(order.id, { expectedRevision: 1, status: 'cancelled' })).toThrow();
    menu.updateItem(pictured.id, { expectedRevision: pictured.revision, available: false });
    menu.updateItem(pictured.id, { expectedRevision: pictured.revision + 1, imageUrl: '/api/images/salad.jpg', archived: true });
    expect(place(snapshot, key).response.order).toEqual(order);
    await stop(); connection = initializeDatabase({ filename }); await start();
    const retained = getOrder(connection, order.id).order;
    expect(retained).toEqual(order);
    expect(retained.history?.map(event => event.status)).toEqual(['placed', 'preparing', 'ready', 'completed']);
  });

  it('rolls status, history and stream revision back together if the history write fails', () => {
    const order = place().response.order;
    connection.sqlite.exec("CREATE TRIGGER fail_history BEFORE INSERT ON order_status_events BEGIN SELECT RAISE(ABORT, 'history unavailable'); END;");
    expect(() => service.updateStatus(order.id, { expectedRevision: order.revision, status: 'preparing' })).toThrow();
    expect(getOrder(connection, order.id).order).toEqual(order);
    expect(readOrdersRevision(connection)).toBe(1);
  });

  it('confirms exact immutable ordered lines, totals, canonical hash, and initial revisions through HTTP', async () => {
    const snapshot = quote([line(open, { openPriceMinor: 115 }), line(fixed), line(open, { quantity: 3, openPriceMinor: 230 })], 20);
    const key = randomUUID();
    const before = Date.now();
    const result = await success(await post({ quoteId: snapshot.quoteId }, key), 201);
    expect(result).toMatchObject({ ordersRevision: 1, order: { quoteId: snapshot.quoteId, status: 'placed', revision: 1,
      subtotalMinor: 1920, discountMinor: 20, totalMinor: 1900, currency: 'USD' } });
    expect(Date.parse(result.order.createdAt)).toBeGreaterThanOrEqual(before);
    expect(result.order.updatedAt).toBe(result.order.createdAt);
    expect(result.order.lines.map(({ id, ...entry }) => { expect(id).toBeTruthy(); return entry; })).toEqual(snapshot.lines);
    expect(new Set(result.order.lines.map((entry) => entry.id)).size).toBe(3);
    expect(await success(await fetch(`${baseUrl}/${result.order.id}`))).toEqual(result);
    expect(await success(await fetch(`${baseUrl}/by-request/${key}`))).toEqual(result);
    const stored = connection.sqlite.prepare('SELECT idempotency_key, request_hash FROM orders').get();
    expect(stored).toEqual({ idempotency_key: key,
      request_hash: createHash('sha256').update(JSON.stringify({ version: 1, quoteId: snapshot.quoteId })).digest('hex') });
    expect(JSON.stringify(result)).not.toContain(key);
    expect(readMenuRevision(connection)).toBe(3);
    expect(connection.sqlite.prepare('SELECT available, revision FROM menu_items WHERE id = ?').get(fixed.id)).toEqual({ available: 1, revision: 1 });
  });

  it('replays the same key/payload without creating lines, revisions, or a notification', async () => {
    const snapshot = quote();
    const key = randomUUID();
    const original = await success(await post({ quoteId: snapshot.quoteId }, key), 201);
    expect(await success(await post({ quoteId: snapshot.quoteId }, key))).toEqual(original);
    expect(service.confirm({ quoteId: snapshot.quoteId }, key)).toEqual({ response: original, notification: null, replayed: true });
    expect(count('orders')).toBe(1);
    expect(count('order_lines')).toBe(1);
    expect(readOrdersRevision(connection)).toBe(1);
  });

  it('rejects a different payload with the same key before examining a missing quote', async () => {
    const key = randomUUID();
    const original = place(quote(), key);
    const result = await error(await post({ quoteId: randomUUID() }, key), 409, 'IDEMPOTENCY_CONFLICT');
    expect(result).toMatchObject({ details: { idempotencyKey: key } });
    expect(getOrder(connection, original.response.order.id)).toEqual(original.response);
    expect(count('orders')).toBe(1);
    expect(readOrdersRevision(connection)).toBe(1);
  });

  it('allows overlapping HTTP attempts for one key to create exactly one order', async () => {
    const snapshot = quote();
    const key = randomUUID();
    const responses = await Promise.all(Array.from({ length: 8 }, () => post({ quoteId: snapshot.quoteId }, key)));
    expect(responses.map((entry) => entry.status).sort()).toEqual([200, 200, 200, 200, 200, 200, 200, 201]);
    const results = await Promise.all(responses.map(async (entry) => orderResponseSchema.parse(await entry.json())));
    expect(results.every((entry) => entry.order.id === results[0]!.order.id)).toBe(true);
    expect(count('orders')).toBe(1);
    expect(count('order_lines')).toBe(1);
    expect(readOrdersRevision(connection)).toBe(1);
  });

  // Independent Node workers exercise overlapping write-lock acquisition on separate
  // SQLite connections, rather than just serial callbacks on Express's event loop.
  it.each(['same-key', 'different-payload', 'different-key'] as const)('serializes independent writers: %s', async (kind) => {
    const first = quote();
    const second = kind === 'different-payload' ? quote() : first;
    const key = randomUUID();
    const gate = new SharedArrayBuffer(4);
    const bundle = buildSync({
      stdin: { resolveDir: import.meta.dirname, contents: `
        import { parentPort, workerData } from 'node:worker_threads';
        import { openDatabase } from '../../db/connection';
        import { HttpError } from '../../middleware/errors';
        import { createOrderService } from './service';
        const connection = openDatabase(workerData.filename);
        parentPort.postMessage({ ready: true });
        Atomics.wait(new Int32Array(workerData.gate), 0, 0);
        try { parentPort.postMessage({ result: createOrderService(connection).confirm({ quoteId: workerData.quoteId }, workerData.key) }); }
        catch (error) { if (error instanceof HttpError) parentPort.postMessage({ error: error.payload }); else throw error; }
        finally { connection.close(); }
      ` }, bundle: true, packages: 'external', platform: 'node', format: 'cjs', write: false
    }).outputFiles[0]!.text;
    const workers = [first, second].map((snapshot, index) => new Worker(bundle, { eval: true,
      workerData: { filename, quoteId: snapshot.quoteId, key: index === 1 && kind === 'different-key' ? randomUUID() : key, gate } }));
    type Outcome = { result?: OrderMutation & { replayed: boolean }; error?: { code: string } };
    const results = workers.map((worker) => new Promise<Outcome>((resolve, reject) => {
      worker.on('message', (message: Outcome & { ready?: boolean }) => { if (!message.ready) resolve(message); });
      worker.on('error', reject);
      worker.on('exit', (code) => { if (code !== 0) reject(new Error(`Worker exited ${code}`)); });
    }));
    try {
      await Promise.all(workers.map((worker) => new Promise<void>((resolve, reject) => {
        worker.once('message', () => resolve());
        worker.once('error', reject);
      })));
      Atomics.store(new Int32Array(gate), 0, 1);
      Atomics.notify(new Int32Array(gate), 0);
      const outcomes = await Promise.all(results);
      expect(outcomes.filter((entry) => entry.result?.replayed === false)).toHaveLength(1);
      if (kind === 'same-key') {
        expect(outcomes.filter((entry) => entry.result?.replayed === true)).toHaveLength(1);
        expect(outcomes[0]!.result!.response).toEqual(outcomes[1]!.result!.response);
      } else expect(outcomes.find((entry) => entry.error)?.error?.code).toBe(kind === 'different-payload' ? 'IDEMPOTENCY_CONFLICT' : 'QUOTE_USED');
      expect(count('orders')).toBe(1);
      expect(count('order_lines')).toBe(1);
      expect(readOrdersRevision(connection)).toBe(1);
    } finally { await Promise.all(workers.map((worker) => worker.terminate())); }
  });

  it('recovers a committed order after the actual HTTP response is dropped', async () => {
    const snapshot = quote();
    const key = randomUUID();
    await expect(post({ quoteId: snapshot.quoteId }, key, { 'x-drop-response': 'true' })).rejects.toThrow();
    const recovered = await success(await fetch(`${baseUrl}/by-request/${key}`));
    expect(await success(await post({ quoteId: snapshot.quoteId }, key))).toEqual(recovered);
    expect(count('orders')).toBe(1);
    expect(readOrdersRevision(connection)).toBe(1);
  });

  it('replays and recovers after expiry, Setup edits, status progression, and a backend/database restart', async () => {
    const snapshot = quote();
    const key = randomUUID();
    const original = place(snapshot, key).response;
    const updated = service.updateStatus(original.order.id, { status: 'preparing', expectedRevision: 1 }).response;
    menu.updateItem(fixed.id, { expectedRevision: 1, available: false });
    menu.updateItem(fixed.id, { expectedRevision: 2, name: 'Edited', pricingMode: 'open', archived: true });
    menu.updateCategory(category.id, { expectedRevision: 1, name: 'Changed', archived: true });
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse(snapshot.expiresAt) + 1);
    await stop();
    connection = initializeDatabase({ filename });
    await start();
    const replay = await success(await post({ quoteId: snapshot.quoteId }, key));
    expect(replay).toEqual(updated);
    expect(replay.order.lines).toEqual(original.order.lines);
    expect(await success(await fetch(`${baseUrl}/by-request/${key}`))).toEqual(updated);
    const used = await error(await post({ quoteId: snapshot.quoteId }), 409, 'QUOTE_USED');
    expect(used).toMatchObject({ details: { quoteId: snapshot.quoteId, orderId: original.order.id } });
    expect(count('orders')).toBe(1);
    expect(readOrdersRevision(connection)).toBe(2);
    expect(readMenuRevision(connection)).toBe(6);
  });

  it('does not deduplicate separate independently reviewed quotes with identical contents', () => {
    const first = place().response;
    const second = place().response;
    expect(first.order.id).not.toBe(second.order.id);
    expect(first.order.quoteId).not.toBe(second.order.quoteId);
    expect(count('orders')).toBe(2);
    expect(readOrdersRevision(connection)).toBe(2);
  });

  it.each([0, 1])('rejects an unused quote at or beyond expiry (+%s ms) without reserving the key', async (offset) => {
    const snapshot = quote();
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse(snapshot.expiresAt) + offset);
    const key = randomUUID();
    const result = await error(await post({ quoteId: snapshot.quoteId }, key), 409, 'QUOTE_EXPIRED');
    expect(result).toMatchObject({ details: { quoteId: snapshot.quoteId, expiresAt: snapshot.expiresAt } });
    await error(await fetch(`${baseUrl}/by-request/${key}`), 404, 'NOT_FOUND');
    empty();
  });

  it('accepts a quote one millisecond before expiry and permits zero totals', async () => {
    const snapshot = quote([line(fixed)], 1000);
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse(snapshot.expiresAt) - 1);
    expect((await success(await post({ quoteId: snapshot.quoteId }), 201)).order.totalMinor).toBe(0);
  });

  it.each(['availability', 'archive-item', 'archive-category', 'fixed-price', 'fixed-to-open', 'open-to-fixed', 'unrelated', 'toggle-back'])(
    'requires review again after the menu changes: %s', async (kind) => {
      const snapshot = quote(kind === 'open-to-fixed' ? [line(open, { openPriceMinor: 100 })] : undefined);
      if (kind === 'availability' || kind === 'toggle-back') {
        menu.updateItem(fixed.id, { expectedRevision: 1, available: false });
        if (kind === 'toggle-back') menu.updateItem(fixed.id, { expectedRevision: 2, available: true });
      } else if (kind === 'archive-item') {
        menu.updateItem(fixed.id, { expectedRevision: 1, available: false });
        menu.updateItem(fixed.id, { expectedRevision: 2, archived: true });
      }
      else if (kind === 'archive-category') menu.updateCategory(category.id, { expectedRevision: 1, archived: true });
      else if (kind === 'fixed-price') menu.updateItem(fixed.id, { expectedRevision: 1, pricingMode: 'fixed', priceMinor: 900 });
      else if (kind === 'fixed-to-open') menu.updateItem(fixed.id, { expectedRevision: 1, pricingMode: 'open' });
      else if (kind === 'open-to-fixed') menu.updateItem(open.id, { expectedRevision: 1, pricingMode: 'fixed', priceMinor: 100 });
      else menu.createCategory({ name: 'Unrelated', sortOrder: 9 });
      const result = await error(await post({ quoteId: snapshot.quoteId }), 409, 'MENU_CHANGED');
      expect(result).toMatchObject({ details: { quoteId: snapshot.quoteId, quotedMenuRevision: 3, currentMenuRevision: readMenuRevision(connection) } });
      empty();
    }
  );

  it.each(['available = 0', "archived_at = '2026-10-18T00:00:00.000Z'", "pricing_mode = 'open', price_minor = NULL", 'price_minor = 501'])(
    'independently rechecks item eligibility and pricing if stream revision was not advanced: %s', async (mutation) => {
      const snapshot = quote();
      connection.sqlite.prepare(`UPDATE menu_items SET ${mutation} WHERE id = ?`).run(fixed.id);
      await error(await post({ quoteId: snapshot.quoteId }), 409, 'MENU_CHANGED');
      empty();
    }
  );

  it('independently rechecks category eligibility without trusting just the quote revision', async () => {
    const snapshot = quote();
    connection.sqlite.prepare('UPDATE categories SET archived_at = ? WHERE id = ?').run(new Date().toISOString(), category.id);
    await error(await post({ quoteId: snapshot.quoteId }), 409, 'MENU_CHANGED');
    empty();
  });

  it.each(['lines', 'stream'] as const)('rolls back order, lines, key/quote consumption, and stream after a %s failure', async (kind) => {
    const snapshot = quote([line(fixed), line(open, { openPriceMinor: 123 })]);
    const key = randomUUID();
    connection.sqlite.exec(kind === 'lines' ? `CREATE TRIGGER fail_write AFTER INSERT ON order_lines WHEN NEW.line_index = 1
      BEGIN SELECT RAISE(ABORT, 'private line failure'); END` : `CREATE TRIGGER fail_write BEFORE UPDATE OF orders_revision ON app_state
      BEGIN SELECT RAISE(ABORT, 'private revision failure'); END`);
    const result = await error(await post({ quoteId: snapshot.quoteId }, key), 500, 'INTERNAL_ERROR');
    expect(JSON.stringify(result)).not.toContain('private');
    empty();
    await error(await fetch(`${baseUrl}/by-request/${key}`), 404, 'NOT_FOUND');
    connection.sqlite.exec('DROP TRIGGER fail_write');
    await success(await post({ quoteId: snapshot.quoteId }, key), 201);
    expect(count('order_lines')).toBe(2);
  });

  it('validates persisted snapshot arithmetic before writing any order', async () => {
    const snapshot = quote();
    const { changes, ...stored } = snapshot;
    void changes;
    connection.db.update(checkoutQuotes).set({ snapshot: { ...stored, totalMinor: 1 } }).where(eq(checkoutQuotes.id, snapshot.quoteId)).run();
    await error(await post({ quoteId: snapshot.quoteId }), 500, 'INTERNAL_ERROR');
    empty();
  });

  it('maps writer contention to retryable 503 and permits same-key retry after release', async () => {
    const snapshot = quote();
    const key = randomUUID();
    const blocker = openDatabase(filename);
    connection.sqlite.pragma('busy_timeout = 1');
    try {
      blocker.sqlite.exec('BEGIN IMMEDIATE');
      const response = await post({ quoteId: snapshot.quoteId }, key);
      await error(response, 503, 'SERVICE_UNAVAILABLE');
      expect(response.headers.get('retry-after')).toBe('1');
      empty();
      blocker.sqlite.exec('ROLLBACK');
      await success(await post({ quoteId: snapshot.quoteId }, key), 201);
    } finally { if (blocker.sqlite.inTransaction) blocker.sqlite.exec('ROLLBACK'); blocker.close(); }
  });

  it('holds the writer lock across confirmation reads, preventing interleaved Setup edits', () => {
    const snapshot = quote();
    const writer = openDatabase(filename);
    writer.sqlite.pragma('busy_timeout = 1');
    const original = connection.db.select.bind(connection.db);
    let attempted = false;
    const spy = vi.spyOn(connection.db, 'select').mockImplementation(((...args: Parameters<typeof original>) => {
      if (!attempted) {
        attempted = true;
        expect(() => createMenuService(writer).updateItem(fixed.id, { expectedRevision: 1, available: false })).toThrow();
      }
      return original(...args);
    }) as typeof original);
    try {
      const result = place(snapshot).response;
      expect(attempted).toBe(true);
      expect(result.order.lines[0]!.unitPriceMinor).toBe(500);
      spy.mockRestore();
      createMenuService(writer).updateItem(fixed.id, { expectedRevision: 1, available: false });
      expect(getOrder(connection, result.order.id)).toEqual(result);
    } finally { spy.mockRestore(); writer.close(); }
  });

  const statuses: OrderStatus[] = ['placed', 'preparing', 'ready', 'completed', 'cancelled'];
  function progress(id: string, status: OrderStatus) {
    const path: OrderStatus[] = status === 'cancelled' ? ['cancelled'] : statuses.slice(1, statuses.indexOf(status) + 1);
    let revision = 1;
    for (const next of path) service.updateStatus(id, { status: next, expectedRevision: revision++ });
    return getOrder(connection, id);
  }

  it.each(statuses.flatMap((from) => statuses.map((to) => ({ from, to }))))('enforces the exact status graph: $from -> $to', async ({ from, to }) => {
    const original = place().response;
    const current = progress(original.order.id, from);
    const response = await patch(original.order.id, { status: to, expectedRevision: current.order.revision });
    if (from === to) expect(await success(response)).toEqual(current);
    else if (ORDER_STATUS_TRANSITIONS[from].includes(to)) {
      const result = await success(response);
      expect(result).toMatchObject({ order: { status: to, revision: current.order.revision + 1 }, ordersRevision: current.ordersRevision + 1 });
      expect(result.order.lines).toEqual(original.order.lines);
      expect(result.order.createdAt).toBe(original.order.createdAt);
      expect(result.order.totalMinor).toBe(original.order.totalMinor);
    } else {
      const result = await error(response, 409, 'INVALID_STATUS_TRANSITION');
      expect(result).toMatchObject({ details: { orderId: original.order.id, currentStatus: from, requestedStatus: to, allowedStatuses: ORDER_STATUS_TRANSITIONS[from] } });
      expect(getOrder(connection, original.order.id)).toEqual(current);
    }
  });

  it('checks revision before transitions and no-ops, and preserves state for stale updates', async () => {
    const original = place().response;
    const current = progress(original.order.id, 'preparing');
    for (const status of ['preparing', 'ready', 'completed']) {
      const result = await error(await patch(original.order.id, { status, expectedRevision: 1 }), 409, 'REVISION_CONFLICT');
      expect(result).toMatchObject({ details: { entityType: 'order', entityId: original.order.id, expectedRevision: 1, currentRevision: 2 } });
      expect(getOrder(connection, original.order.id)).toEqual(current);
    }
  });

  it('allows only one overlapping staff update at the same revision', async () => {
    const original = place().response;
    const responses = await Promise.all(['preparing', 'cancelled'].map((status) => patch(original.order.id, { status, expectedRevision: 1 })));
    expect(responses.map((entry) => entry.status).sort()).toEqual([200, 409]);
    await Promise.all(responses.map((entry) => entry.json()));
    expect(getOrder(connection, original.order.id)).toMatchObject({ order: { revision: 2 }, ordersRevision: 2 });
  });

  it('rolls back a status change if its stream revision cannot commit', async () => {
    const original = place().response;
    connection.sqlite.exec("CREATE TRIGGER fail_status BEFORE UPDATE OF orders_revision ON app_state BEGIN SELECT RAISE(ABORT, 'private failure'); END");
    await error(await patch(original.order.id, { status: 'preparing', expectedRevision: 1 }), 500, 'INTERNAL_ERROR');
    expect(getOrder(connection, original.order.id)).toEqual(original);
    connection.sqlite.exec('DROP TRIGGER fail_status');
    expect((await success(await patch(original.order.id, { status: 'preparing', expectedRevision: 1 }))).ordersRevision).toBe(2);
  });

  it('exposes notification data only after committed state is visible to another connection', () => {
    const observer = openDatabase(filename);
    try {
      const created = place();
      expect(ordersChangedSchema.parse(created.notification)).toMatchObject({ ordersRevision: 1, orderId: created.response.order.id, orderRevision: 1, change: 'created' });
      expect(getOrder(observer, created.response.order.id)).toEqual(created.response);
      const updated = service.updateStatus(created.response.order.id, { status: 'preparing', expectedRevision: 1 });
      expect(ordersChangedSchema.parse(updated.notification)).toMatchObject({ ordersRevision: 2, orderId: created.response.order.id, orderRevision: 2, change: 'status-changed' });
      expect(updated.notification!.eventId).not.toBe(created.notification!.eventId);
      expect(getOrder(observer, created.response.order.id)).toEqual(updated.response);
      expect(service.updateStatus(created.response.order.id, { status: 'preparing', expectedRevision: 2 })).toEqual({ response: updated.response, notification: null });
    } finally { observer.close(); }
  });

  it('returns bounded newest-first pages with deterministic ties and updates status-filter membership', async () => {
    const now = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
    const ids = Array.from({ length: 105 }, () => place().response.order.id).sort().reverse();
    clock.mockReturnValue(now + 1);
    const newest = place().response.order.id;
    const response = await fetch(baseUrl);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const first = ordersResponseSchema.parse(await response.json());
    expect(first).toMatchObject({ total: 106, page: 1, pageSize: 50, ordersRevision: 106 });
    expect(first.orders.map((entry) => entry.id)).toEqual([newest, ...ids].slice(0, 50));
    expect(first.orders[0]).not.toHaveProperty('lines');
    expect(first.orders[0]).not.toHaveProperty('idempotencyKey');
    const second = ordersResponseSchema.parse(await (await fetch(`${baseUrl}?page=2&pageSize=100`)).json());
    expect(second.orders.map((entry) => entry.id)).toEqual(ids.slice(99));
    expect(listOrders(connection, { page: Number.MAX_SAFE_INTEGER, pageSize: 100 }).orders).toEqual([]);
    expect(listOrders(connection, { page: 1, pageSize: 100 }).orders).toHaveLength(100);
    service.updateStatus(newest, { status: 'preparing', expectedRevision: 1 });
    const preparing = ordersResponseSchema.parse(await (await fetch(`${baseUrl}?status=preparing`)).json());
    expect(preparing).toMatchObject({ total: 1, orders: [{ id: newest }], ordersRevision: 107 });
    expect(listOrders(connection, { ...page, status: 'placed' }).total).toBe(105);
    service.updateStatus(newest, { status: 'cancelled', expectedRevision: 2 });
    expect(listOrders(connection, { ...page, status: 'preparing' }).total).toBe(0);
    expect(listOrders(connection, { ...page, status: 'cancelled' }).total).toBe(1);
  });

  it.each(['list', 'detail', 'by-request'] as const)('reads %s state and stream revision from one snapshot during a concurrent commit', (kind) => {
    const key = randomUUID();
    const original = place(quote(), key).response;
    const writer = openDatabase(filename);
    const select = connection.db.select.bind(connection.db);
    let selects = 0;
    let committed = false;
    const spy = vi.spyOn(connection.db, 'select').mockImplementation(((...args: Parameters<typeof select>) => {
      if (++selects === 2) {
        createOrderService(writer).updateStatus(original.order.id, { status: 'preparing', expectedRevision: 1 });
        committed = true;
      }
      return select(...args);
    }) as typeof select);
    try {
      const result = kind === 'list' ? listOrders(connection, { ...page, status: 'placed' }) :
        kind === 'detail' ? getOrder(connection, original.order.id) : getOrderByRequest(connection, key);
      expect(committed).toBe(true);
      expect(result.ordersRevision).toBe(1);
      if (kind === 'list') expect(result).toMatchObject({ total: 1, orders: [{ status: 'placed', revision: 1 }] });
      else expect(result).toEqual(original);
      spy.mockRestore();
      expect(getOrder(connection, original.order.id)).toMatchObject({ order: { status: 'preparing', revision: 2 }, ordersRevision: 2 });
    } finally { spy.mockRestore(); writer.close(); }
  });

  it('returns typed not-found errors for quote, order, and recovery key without creating state', async () => {
    const missing = randomUUID();
    expect(await error(await post({ quoteId: missing }), 404, 'NOT_FOUND')).toMatchObject({ details: { resourceType: 'quote', resourceId: missing } });
    expect(await error(await fetch(`${baseUrl}/${missing}`), 404, 'NOT_FOUND')).toMatchObject({ details: { resourceType: 'order', resourceId: missing } });
    expect(await error(await fetch(`${baseUrl}/by-request/${missing}`), 404, 'NOT_FOUND')).toMatchObject({ details: { resourceType: 'request', resourceId: missing } });
    await error(await patch(missing, { status: 'preparing', expectedRevision: 1 }), 404, 'NOT_FOUND');
    empty();
  });

  it.each([{}, { quoteId: 'invalid' }, { quoteId: randomUUID(), totalMinor: 1 }, { quoteId: randomUUID(), lines: [] }])(
    'rejects malformed confirmation body %j', async (body) => {
      await error(await post(body), 400, 'VALIDATION_ERROR');
      empty();
    });

  it.each(['missing', 'invalid', 'two-values'])('rejects %s idempotency headers at the header boundary', async (kind) => {
    const snapshot = quote();
    const response = await fetch(baseUrl, { method: 'POST', headers: { 'Content-Type': 'application/json',
      ...(kind === 'missing' ? {} : { 'Idempotency-Key': kind === 'invalid' ? 'invalid' : `${randomUUID()}, ${randomUUID()}` }) }, body: JSON.stringify({ quoteId: snapshot.quoteId }) });
    const result = await error(response, 400, 'VALIDATION_ERROR');
    expect(result).toMatchObject({ details: { issues: [{ path: ['headers', 'idempotency-key'] }] } });
    empty();
  });

  it.each([{}, { status: 'ready' }, { status: 'invalid', expectedRevision: 1 }, { status: 'preparing', expectedRevision: 0 },
    { status: 'preparing', expectedRevision: 1.5 }, { status: 'preparing', expectedRevision: '1' },
    { status: 'preparing', expectedRevision: 1, totalMinor: 1 }])('rejects malformed status update %j', async (body) => {
    const original = place().response;
    await error(await patch(original.order.id, body), 400, 'VALIDATION_ERROR');
    expect(getOrder(connection, original.order.id)).toEqual(original);
  });

  it.each(['page=0', 'pageSize=101', 'pageSize=-1', 'page=1e2', 'page=1&page=2', 'status=invalid',
    'status=placed&status=ready', 'unknown=true'])('rejects invalid list query %s', async (query) => {
      await error(await fetch(`${baseUrl}?${query}`), 400, 'VALIDATION_ERROR');
    });

  it('validates detail/recovery/status IDs and detail/recovery query fields', async () => {
    await error(await fetch(`${baseUrl}/invalid`), 400, 'VALIDATION_ERROR');
    await error(await fetch(`${baseUrl}/by-request/invalid`), 400, 'VALIDATION_ERROR');
    await error(await patch('invalid', { status: 'preparing', expectedRevision: 1 }), 400, 'VALIDATION_ERROR');
    await error(await fetch(`${baseUrl}/${randomUUID()}?unknown=true`), 400, 'VALIDATION_ERROR');
    await error(await fetch(`${baseUrl}/by-request/${randomUUID()}?unknown=true`), 400, 'VALIDATION_ERROR');
    empty();
  });
});
