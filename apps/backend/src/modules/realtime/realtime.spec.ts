import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { io, type Socket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  apiErrorSchema, categoryMutationResponseSchema, itemMutationResponseSchema, menuChangedSchema,
  orderResponseSchema, ordersChangedSchema, ordersResponseSchema, quoteResponseSchema, syncStateSchema,
  type ClientToServerEvents, type MenuChanged, type OrdersChanged, type ServerToClientEvents, type SyncState
} from '@restaurant-ordering/contracts';
import { loadConfig } from '../../config/config';
import { openDatabase } from '../../db/connection';
import { startServer } from '../../server';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;
type Runtime = Awaited<ReturnType<typeof startServer>>;
type Observations = { states: SyncState[]; menus: MenuChanged[]; orders: OrdersChanged[] };

describe('Socket.IO and revision synchronization with isolated real databases', () => {
  let directory: string;
  let filename: string;
  let runtime: Runtime;
  const runtimes: Runtime[] = [];
  const clients: Client[] = [];
  const reportError = vi.fn();

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'restaurant-realtime-'));
    filename = join(directory, 'test.sqlite');
    reportError.mockClear();
    runtime = await start();
  });

  afterEach(async () => {
    clients.splice(0).forEach((client) => client.disconnect());
    await Promise.allSettled(runtimes.splice(0).map((server) => server.shutdown()));
    vi.restoreAllMocks();
    rmSync(directory, { recursive: true, force: true });
  });

  async function start(overrides: Partial<ReturnType<typeof loadConfig>> = {}) {
    const server = await startServer({
      ...loadConfig({ DATABASE_PATH: filename, SEED_MODE: 'none' }), port: 0, ...overrides
    }, { reportError });
    runtimes.push(server);
    return server;
  }

  function url(server = runtime) {
    const address = server.server.address();
    if (!address || typeof address === 'string') throw new Error('Missing test listener.');
    return `http://127.0.0.1:${address.port}`;
  }

  async function request(path: string, body?: unknown, method = 'POST', headers = {}) {
    return fetch(`${url()}/api${path}`, body === undefined ? undefined : {
      method, headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body)
    });
  }

  async function connect(transports = ['polling', 'websocket']) {
    const socket: Client = io(url(), { path: '/socket.io', transports, autoConnect: false,
      forceNew: true, reconnection: false, timeout: 2000 });
    clients.push(socket);
    const seen: Observations = { states: [], menus: [], orders: [] };
    socket.on('sync.state', (state) => seen.states.push(state));
    socket.on('menu.changed', (event) => seen.menus.push(event));
    socket.on('orders.changed', (event) => seen.orders.push(event));
    socket.connect();
    await vi.waitFor(() => expect(seen.states).toHaveLength(1));
    return { socket, seen };
  }

  async function category(name = 'Drinks') {
    const response = await request('/setup/categories', { name });
    expect(response.status).toBe(201);
    return categoryMutationResponseSchema.parse(await response.json());
  }

  async function fixture() {
    const { category: group } = await category();
    const response = await request('/setup/items', {
      categoryId: group.id, name: 'Coffee', pricingMode: 'fixed', priceMinor: 250, available: true
    });
    expect(response.status).toBe(201);
    return { group, item: itemMutationResponseSchema.parse(await response.json()).item };
  }

  async function quote(itemId: string) {
    const response = await request('/checkout/quotes', { lines: [{ itemId, quantity: 1, observedRevision: 1 }], discountMinor: 0 });
    expect(response.status).toBe(201);
    return quoteResponseSchema.parse(await response.json());
  }

  async function place(itemId: string) {
    const snapshot = await quote(itemId);
    const key = randomUUID();
    const payload = { quoteId: snapshot.quoteId };
    const response = await request('/orders', payload, 'POST', { 'Idempotency-Key': key });
    expect(response.status).toBe(201);
    return { ...orderResponseSchema.parse(await response.json()), key, payload };
  }

  async function sync() {
    const response = await request('/sync');
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    return syncStateSchema.parse(await response.json());
  }

  async function expectError(response: Response, status: number, code: string) {
    expect(response.status).toBe(status);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe(code);
  }

  it('sends zero persisted revisions to independent clients and keeps HTTP polling available', async () => {
    const [first, second] = await Promise.all([connect(['polling']), connect(['websocket'])]);
    expect(first.socket.io.engine.transport.name).toBe('polling');
    expect(second.socket.io.engine.transport.name).toBe('websocket');
    expect(first.seen.states).toEqual([{ menuRevision: 0, ordersRevision: 0, menuUpdatedAt: null }]);
    expect(second.seen.states).toEqual(first.seen.states);
    expect(await sync()).toEqual(first.seen.states[0]);
    const handshake = await fetch(`${url()}/socket.io/?EIO=4&transport=polling`, {
      headers: { Origin: 'https://example.com' }
    });
    expect(handshake.status).toBe(200);
    expect(handshake.headers.get('access-control-allow-origin')).toBeNull();
    const packet = await handshake.text();
    expect(JSON.parse(packet.slice(1))).toMatchObject({ upgrades: ['websocket'] });
  });

  it('upgrades the default polling connection to WebSocket on the shared HTTP server', async () => {
    const { socket } = await connect();
    await vi.waitFor(() => expect(socket.io.engine.transport.name).toBe('websocket'));
    expect((await request('/health/ready')).status).toBe(200);
  });

  it('validates sync queries and maps unavailable database reads through the HTTP error boundary', async () => {
    await expectError(await request('/sync?unexpected=true'), 400, 'VALIDATION_ERROR');
    runtime.connection.sqlite.prepare('DELETE FROM app_state').run();
    await expectError(await request('/sync'), 500, 'INTERNAL_ERROR');
    expect(reportError).toHaveBeenCalledOnce();
  });

  it('broadcasts every menu write to both clients only when another DB connection can read the commit', async () => {
    const [first, second] = await Promise.all([connect(['polling']), connect(['websocket'])]);
    const inspection = openDatabase(filename);
    const committed: SyncState[] = [];
    const broadcast = runtime.realtime.menuChanged.bind(runtime.realtime);
    vi.spyOn(runtime.realtime, 'menuChanged').mockImplementation((notification) => {
      expect(runtime.connection.sqlite.inTransaction).toBe(false);
      committed.push(syncStateSchema.parse(inspection.sqlite.prepare(`
        SELECT menu_revision AS menuRevision, orders_revision AS ordersRevision FROM app_state
      `).get()));
      broadcast(notification);
    });
    try {
      const { group, item } = await fixture();
      expect((await request(`/setup/categories/${group.id}`, { expectedRevision: 1, name: 'Hot drinks' }, 'PATCH')).status).toBe(200);
      expect((await request(`/setup/items/${item.id}`, { expectedRevision: 1, available: false }, 'PATCH')).status).toBe(200);
      expect((await request(`/setup/items/${item.id}`, { expectedRevision: 2, archived: true }, 'PATCH')).status).toBe(200);
      expect((await request(`/setup/categories/${group.id}`, { expectedRevision: 2, archived: true }, 'PATCH')).status).toBe(200);
      await vi.waitFor(() => {
        expect(first.seen.menus).toHaveLength(6);
        expect(second.seen.menus).toHaveLength(6);
      });
      expect(first.seen.menus).toEqual(second.seen.menus);
      first.seen.menus.forEach((event, index) => {
        expect(menuChangedSchema.parse(event)).toEqual(event);
        expect(event.menuRevision).toBe(index + 1);
        expect(committed[index]).toMatchObject({ menuRevision: index + 1, ordersRevision: 0 });
      });
      expect(first.seen.menus.map(({ entityType, change }) => [entityType, change])).toEqual([
        ['category', 'created'], ['item', 'created'], ['category', 'updated'],
        ['item', 'updated'], ['item', 'archived'], ['category', 'archived']
      ]);
      expect(new Set(first.seen.menus.map(({ eventId }) => eventId)).size).toBe(6);
      expect(await sync()).toMatchObject({ menuRevision: 6, ordersRevision: 0 });
    } finally { inspection.close(); }
  });

  it('broadcasts order creation/status changes and preserves authoritative snapshots for both clients', async () => {
    const { item } = await fixture();
    const [first, second] = await Promise.all([connect(['polling']), connect(['websocket'])]);
    const inspection = openDatabase(filename);
    const committed: unknown[] = [];
    const broadcast = runtime.realtime.ordersChanged.bind(runtime.realtime);
    vi.spyOn(runtime.realtime, 'ordersChanged').mockImplementation((notification) => {
      expect(runtime.connection.sqlite.inTransaction).toBe(false);
      committed.push(inspection.sqlite.prepare('SELECT status, revision FROM orders WHERE id = ?').get(notification.orderId));
      broadcast(notification);
    });
    try {
      const { order } = await place(item.id);
      expect((await request(`/orders/${order.id}/status`, { expectedRevision: 1, status: 'preparing' }, 'PATCH')).status).toBe(200);
      await vi.waitFor(() => {
        expect(first.seen.orders).toHaveLength(2);
        expect(second.seen.orders).toHaveLength(2);
      });
      expect(first.seen.orders).toEqual(second.seen.orders);
      expect(first.seen.orders.map((event) => ordersChangedSchema.parse(event))).toEqual([
        { eventId: expect.any(String), ordersRevision: 1, orderId: order.id, orderRevision: 1, change: 'created' },
        { eventId: expect.any(String), ordersRevision: 2, orderId: order.id, orderRevision: 2, change: 'status-changed' }
      ]);
      expect(committed).toEqual([{ status: 'placed', revision: 1 }, { status: 'preparing', revision: 2 }]);
      expect(await sync()).toMatchObject({ menuRevision: 2, ordersRevision: 2 });
      const detail = orderResponseSchema.parse(await (await request(`/orders/${order.id}`)).json());
      expect(detail.order.status).toBe('preparing');
      expect(detail.order.lines).toEqual(order.lines);
    } finally { inspection.close(); }
  });

  it('emits nothing for validation failures, stale/invalid writes, replays, or current-state no-ops', async () => {
    const { group, item } = await fixture();
    const placed = await place(item.id);
    const [first, second] = await Promise.all([connect(['polling']), connect(['websocket'])]);
    await expectError(await request('/setup/items', { name: 'Invalid' }), 400, 'VALIDATION_ERROR');
    await expectError(await request(`/setup/categories/${group.id}`, { expectedRevision: 9, name: 'Stale' }, 'PATCH'), 409, 'REVISION_CONFLICT');
    expect((await request(`/setup/categories/${group.id}`, { expectedRevision: 1, name: group.name }, 'PATCH')).status).toBe(200);
    expect((await request(`/setup/items/${item.id}`, { expectedRevision: 1, available: true }, 'PATCH')).status).toBe(200);
    expect((await request('/orders', placed.payload, 'POST', { 'Idempotency-Key': placed.key })).status).toBe(200);
    expect((await request(`/orders/${placed.order.id}/status`, { expectedRevision: 1, status: 'placed' }, 'PATCH')).status).toBe(200);
    await expectError(await request(`/orders/${placed.order.id}/status`, { expectedRevision: 1, status: 'completed' }, 'PATCH'), 409, 'INVALID_STATUS_TRANSITION');
    await expectError(await request(`/orders/${placed.order.id}/status`, { expectedRevision: 2, status: 'preparing' }, 'PATCH'), 409, 'REVISION_CONFLICT');
    // A final committed event is an ordered transport barrier for the negative assertions.
    await category('Barrier');
    await vi.waitFor(() => {
      expect(first.seen.menus).toHaveLength(1);
      expect(second.seen.menus).toHaveLength(1);
    });
    expect(first.seen.orders).toEqual([]);
    expect(second.seen.orders).toEqual([]);
    expect(await sync()).toMatchObject({ menuRevision: 3, ordersRevision: 1 });
  });

  it.each(['menu', 'create-order', 'status', 'commit'] as const)('rolls back a failed %s transaction without any notification', async (operation) => {
    const { item } = await fixture();
    const placed = await place(item.id);
    const snapshot = await quote(item.id);
    const initial = await sync();
    const [first, second] = await Promise.all([connect(['polling']), connect(['websocket'])]);
    if (operation === 'commit') {
      // The service constructs its result successfully, then COMMIT itself fails.
      runtime.connection.sqlite.exec(`
        CREATE TABLE commit_guard (category_id TEXT REFERENCES categories(id) DEFERRABLE INITIALLY DEFERRED);
        CREATE TRIGGER fail_revision AFTER UPDATE OF menu_revision ON app_state
        BEGIN INSERT INTO commit_guard VALUES ('missing-category'); END;
      `);
    } else {
      const column = operation === 'menu' ? 'menu_revision' : 'orders_revision';
      runtime.connection.sqlite.exec(`CREATE TRIGGER fail_revision BEFORE UPDATE OF ${column} ON app_state
        BEGIN SELECT RAISE(ABORT, 'injected revision failure'); END;`);
    }
    const response = operation === 'menu' || operation === 'commit'
      ? await request(`/setup/items/${item.id}`, { expectedRevision: 1, name: 'Must roll back' }, 'PATCH')
      : operation === 'create-order'
        ? await request('/orders', { quoteId: snapshot.quoteId }, 'POST', { 'Idempotency-Key': randomUUID() })
        : await request(`/orders/${placed.order.id}/status`, { expectedRevision: 1, status: 'preparing' }, 'PATCH');
    await expectError(response, 500, 'INTERNAL_ERROR');
    expect(await sync()).toEqual(initial);
    expect(runtime.connection.sqlite.prepare('SELECT count(*) AS count FROM orders').get()).toEqual({ count: 1 });
    expect(runtime.connection.sqlite.prepare('SELECT count(*) AS count FROM order_lines').get()).toEqual({ count: 1 });
    expect(runtime.connection.sqlite.prepare('SELECT name, revision FROM menu_items WHERE id = ?').get(item.id)).toEqual({ name: 'Coffee', revision: 1 });
    expect(runtime.connection.sqlite.prepare('SELECT status, revision FROM orders').get()).toEqual({ status: 'placed', revision: 1 });
    runtime.connection.sqlite.exec('DROP TRIGGER fail_revision');
    await category('Barrier');
    await vi.waitFor(() => {
      expect(first.seen.menus).toHaveLength(1);
      expect(second.seen.menus).toHaveLength(1);
    });
    expect(first.seen.orders).toEqual([]);
    expect(second.seen.orders).toEqual([]);
  });

  it('repairs a committed but omitted menu and order broadcast through HTTP sync while still connected', async () => {
    const { item } = await fixture();
    const { order } = await place(item.id);
    const { socket, seen } = await connect();
    const applied = seen.states[0]!;
    const menuBroadcast = vi.spyOn(runtime.realtime, 'menuChanged').mockImplementation(() => undefined);
    const orderBroadcast = vi.spyOn(runtime.realtime, 'ordersChanged').mockImplementation(() => undefined);
    expect((await request(`/setup/items/${item.id}`, { expectedRevision: 1, priceMinor: 400, pricingMode: 'fixed' }, 'PATCH')).status).toBe(200);
    expect((await request(`/orders/${order.id}/status`, { expectedRevision: 1, status: 'preparing' }, 'PATCH')).status).toBe(200);
    expect(socket.connected).toBe(true);
    expect(seen.menus).toEqual([]);
    expect(seen.orders).toEqual([]);
    expect(menuBroadcast).toHaveBeenCalledOnce();
    expect(orderBroadcast).toHaveBeenCalledOnce();
    const announced = await sync();
    expect(announced.menuRevision).toBeGreaterThan(applied.menuRevision);
    expect(announced.ordersRevision).toBeGreaterThan(applied.ordersRevision);
    const menu = await (await request('/menu/items')).json();
    expect(menu).toMatchObject({ menuRevision: announced.menuRevision, items: [{ id: item.id, priceMinor: 400 }] });
    const preparing = ordersResponseSchema.parse(await (await request('/orders?status=preparing')).json());
    expect(preparing.ordersRevision).toBe(announced.ordersRevision);
    expect(preparing.orders.map(({ id }) => id)).toEqual([order.id]);
    const placed = ordersResponseSchema.parse(await (await request('/orders?status=placed')).json());
    expect(placed.total).toBe(0);
  });

  it('lets revision-based consumers reconcile duplicate and out-of-order notifications without duplicate orders', async () => {
    const { item } = await fixture();
    const { seen } = await connect(['polling']);
    const { order } = await place(item.id);
    await vi.waitFor(() => expect(seen.orders).toHaveLength(1));
    const created = seen.orders[0]!;
    runtime.realtime.ordersChanged(created);
    expect((await request(`/orders/${order.id}/status`, { expectedRevision: 1, status: 'preparing' }, 'PATCH')).status).toBe(200);
    runtime.realtime.ordersChanged(created);
    await vi.waitFor(() => expect(seen.orders).toHaveLength(4));
    // Exercise the wire contract with a minimal consumer; the Angular store belongs to T09.
    let highestRevision = 0;
    const appliedRevisions: number[] = [];
    let orders = new Map<string, string>();
    for (const notification of seen.orders) {
      const event = ordersChangedSchema.parse(notification);
      if (event.ordersRevision <= highestRevision) continue;
      highestRevision = event.ordersRevision;
      appliedRevisions.push(highestRevision);
      const snapshot = ordersResponseSchema.parse(await (await request('/orders')).json());
      highestRevision = Math.max(highestRevision, snapshot.ordersRevision);
      orders = new Map(snapshot.orders.map((entry) => [entry.id, entry.status]));
    }
    expect(appliedRevisions).toEqual([1]);
    expect(highestRevision).toBe(2);
    expect([...orders]).toEqual([[order.id, 'preparing']]);
    expect(runtime.connection.sqlite.prepare('SELECT count(*) AS count FROM orders').get()).toEqual({ count: 1 });
  });

  it('reconnects the same client after server restart and observes persisted revisions without packet recovery', async () => {
    const { item } = await fixture();
    const { order } = await place(item.id);
    const { socket, seen } = await connect(['polling']);
    const address = runtime.server.address();
    if (!address || typeof address === 'string') throw new Error('Missing test listener.');
    await runtime.shutdown();
    await vi.waitFor(() => expect(socket.connected).toBe(false));
    runtime = await start({ port: address.port });
    expect((await request(`/setup/items/${item.id}`, { expectedRevision: 1, available: false }, 'PATCH')).status).toBe(200);
    expect((await request(`/orders/${order.id}/status`, { expectedRevision: 1, status: 'preparing' }, 'PATCH')).status).toBe(200);
    socket.connect();
    await vi.waitFor(() => expect(seen.states).toHaveLength(2));
    expect(socket.recovered).toBe(false);
    expect(seen.states[1]).toMatchObject({ menuRevision: 3, ordersRevision: 2 });
    expect(await sync()).toEqual(seen.states[1]);
    const detail = orderResponseSchema.parse(await (await request(`/orders/${order.id}`)).json());
    expect(detail.order.status).toBe('preparing');
    expect(detail.order.lines).toEqual(order.lines);
  });

  it('recovers a short transport loss and still emits a fresh sync state', async () => {
    const { socket, seen } = await connect(['websocket']);
    const id = socket.id;
    socket.io.engine.close();
    await category('During disconnect');
    socket.connect();
    await vi.waitFor(() => expect(seen.states).toHaveLength(2));
    expect(socket.recovered).toBe(true);
    expect(socket.id).toBe(id);
    expect(seen.menus).toHaveLength(1);
    expect(seen.states[1]).toMatchObject({ menuRevision: 1, ordersRevision: 0 });
  });

  it.each([0, 1])('resynchronizes when connection recovery is disabled or has expired (%s ms)', async (socketRecoveryMs) => {
    await runtime.shutdown();
    runtime = await start({ socketRecoveryMs });
    const { socket, seen } = await connect(['polling']);
    socket.io.engine.close();
    await category('Offline edit');
    // Outlast the deliberately tiny recovery window without changing the shared clock.
    await new Promise((resolve) => setTimeout(resolve, 20));
    socket.connect();
    await vi.waitFor(() => expect(seen.states).toHaveLength(2));
    expect(socket.recovered).not.toBe(true);
    expect(seen.states[1]).toMatchObject({ menuRevision: 1, ordersRevision: 0 });
    expect(await sync()).toEqual(seen.states[1]);
  });

  it('ignores attempted socket domain writes and keeps HTTP mutations authoritative', async () => {
    const { socket, seen } = await connect(['websocket']);
    // Simulate an untyped/malicious client; the shared client event map forbids these calls.
    const untyped = socket as unknown as Socket;
    untyped.emit('setup.category.create', { name: 'Must not exist' });
    untyped.emit('orders.create', { quoteId: randomUUID() });
    untyped.emit('menu.changed', { menuRevision: 999 });
    await category('HTTP barrier');
    await vi.waitFor(() => expect(seen.menus).toHaveLength(1));
    expect(await sync()).toMatchObject({ menuRevision: 1, ordersRevision: 0 });
    expect(runtime.connection.sqlite.prepare('SELECT name FROM categories').all()).toEqual([{ name: 'HTTP barrier' }]);
    expect(seen.orders).toEqual([]);
  });

  it('closes active polling and WebSocket clients before closing SQLite with idempotent shutdown', async () => {
    const [first, second] = await Promise.all([connect(['polling']), connect(['websocket'])]);
    const baseUrl = url();
    const shutdown = runtime.shutdown();
    expect(runtime.shutdown()).toBe(shutdown);
    await shutdown;
    await vi.waitFor(() => {
      expect(first.socket.connected).toBe(false);
      expect(second.socket.connected).toBe(false);
    });
    expect(runtime.connection.sqlite.open).toBe(false);
    expect(runtime.server.listening).toBe(false);
    await expect(fetch(`${baseUrl}/api/sync`)).rejects.toThrow();
  });
});
