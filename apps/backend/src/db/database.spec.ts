import { randomUUID } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq, sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MAX_QUANTITY, MAX_UNIT_PRICE_MINOR, quoteSnapshotSchema } from '@restaurant-ordering/contracts';
import { BUSY_TIMEOUT_MS, openDatabase, type DatabaseConnection } from './connection';
import { initializeDatabase } from './initialize';
import { migrateDatabase } from './migrate';
import { parseSeedMode, seedDatabase } from './seed';
import { cleanupExpiredQuotes } from './cleanup';
import { appState, categories, checkoutQuotes, menuItems, orderLines, orders } from './schema';

describe('SQLite persistence on isolated real files', () => {
  let directory: string;
  let filename: string;
  let connection: DatabaseConnection;
  let connections: DatabaseConnection[];

  function open(options: { seedMode?: 'none' | 'small' | 'large'; migrationsFolder?: string } = {}) {
    const opened = initializeDatabase({ filename, ...options });
    connections.push(opened);
    return opened;
  }

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'restaurant-db-'));
    filename = join(directory, 'nested', 'test.sqlite');
    connections = [];
    connection = open();
  });

  afterEach(() => {
    for (const opened of connections) if (opened.sqlite.open) opened.close();
    rmSync(directory, { recursive: true, force: true });
  });

  function menuFixture() {
    seedDatabase(connection, 'small');
    const item = connection.db.select().from(menuItems).where(eq(menuItems.pricingMode, 'fixed')).get()!;
    const category = connection.db.select().from(categories).where(eq(categories.id, item.categoryId)).get()!;
    return { item, category };
  }

  function quoteFixture(times: { createdAt?: string; expiresAt?: string } = {}) {
    const { item, category } = menuFixture();
    const snapshot = quoteSnapshotSchema.parse({
      quoteId: randomUUID(), menuRevision: 1,
      createdAt: times.createdAt ?? '2026-01-01T12:00:00.000Z',
      expiresAt: times.expiresAt ?? '2026-01-01T12:05:00.000Z',
      currency: 'USD', subtotalMinor: item.priceMinor, discountMinor: 0, totalMinor: item.priceMinor,
      lines: [{
        itemId: item.id, categoryId: category.id, itemName: item.name, categoryName: category.name,
        itemRevision: item.revision, pricingMode: item.pricingMode,
        unitPriceMinor: item.priceMinor, quantity: 1, lineTotalMinor: item.priceMinor
      }]
    });
    const row = {
      id: snapshot.quoteId, menuRevision: snapshot.menuRevision, snapshot,
      currency: snapshot.currency, createdAt: snapshot.createdAt, expiresAt: snapshot.expiresAt
    };
    connection.db.insert(checkoutQuotes).values(row).run();
    return { item, category, snapshot, row };
  }

  function orderFixture() {
    const fixture = quoteFixture();
    const { snapshot } = fixture;
    const order = {
      id: randomUUID(), quoteId: snapshot.quoteId, idempotencyKey: randomUUID(), requestHash: 'a'.repeat(64),
      status: 'placed' as const, currency: 'USD', subtotalMinor: snapshot.subtotalMinor,
      discountMinor: snapshot.discountMinor, totalMinor: snapshot.totalMinor,
      createdAt: snapshot.createdAt, updatedAt: snapshot.createdAt
    };
    connection.db.insert(orders).values(order).run();
    const line = { ...snapshot.lines[0]!, id: randomUUID(), orderId: order.id, lineIndex: 0 };
    connection.db.insert(orderLines).values(line).run();
    return { ...fixture, order, line };
  }

  it('migrates a fresh file and configures every connection', () => {
    expect(connection.sqlite.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(connection.sqlite.pragma('journal_mode', { simple: true })).toBe('wal');
    expect(connection.sqlite.pragma('busy_timeout', { simple: true })).toBe(BUSY_TIMEOUT_MS);
    expect(connection.db.select().from(appState).all()).toEqual([
      { id: 1, menuRevision: 0, ordersRevision: 0, demoSeedMode: null }
    ]);
    const second = openDatabase(filename);
    connections.push(second);
    expect(second.sqlite.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(second.sqlite.pragma('journal_mode', { simple: true })).toBe('wal');
    expect(second.sqlite.pragma('busy_timeout', { simple: true })).toBe(BUSY_TIMEOUT_MS);
    expect(connection.sqlite.pragma('foreign_key_check')).toEqual([]);
  });

  it('repeats migrations without changing data or adding journal entries', () => {
    menuFixture();
    const before = connection.sqlite.prepare('SELECT * FROM __drizzle_migrations').all();
    expect(before).toHaveLength(1);
    migrateDatabase(connection);
    connection.close();
    connection = open({ seedMode: 'small' });
    expect(connection.sqlite.prepare('SELECT * FROM __drizzle_migrations').all()).toEqual(before);
    expect(connection.db.select().from(menuItems).all()).toHaveLength(12);
    expect(connection.db.select().from(appState).get()?.menuRevision).toBe(1);
  });

  it('rolls back a failed migration and leaves it unapplied for retry', () => {
    connection.close();
    const migrationsFolder = join(directory, 'broken-migrations');
    mkdirSync(join(migrationsFolder, 'meta'), { recursive: true });
    writeFileSync(join(migrationsFolder, 'meta', '_journal.json'), JSON.stringify({
      version: '7', dialect: 'sqlite', entries: [{ idx: 0, version: '6', when: Date.now() + 1000, tag: '0000_broken', breakpoints: true }]
    }));
    writeFileSync(join(migrationsFolder, '0000_broken.sql'),
      'CREATE TABLE partial_migration (id INTEGER);\n--> statement-breakpoint\nINVALID SQL;');
    expect(() => open({ migrationsFolder })).toThrow();
    connection = open();
    expect(connection.sqlite.prepare("SELECT name FROM sqlite_master WHERE name = 'partial_migration'").get()).toBeUndefined();
    expect(connection.sqlite.prepare('SELECT * FROM __drizzle_migrations').all()).toHaveLength(1);
  });

  it('fails on missing migration assets without seeding', () => {
    expect(() => open({ migrationsFolder: join(directory, 'missing'), seedMode: 'small' })).toThrow();
    expect(connection.db.select().from(menuItems).all()).toEqual([]);
  });

  it('does not seed by default or with mode none', () => {
    expect(seedDatabase(connection, 'none')).toEqual({ seeded: false, reason: 'disabled' });
    expect(connection.db.select().from(categories).all()).toEqual([]);
  });

  it('seeds a small menu once and preserves edits and archival across restart', () => {
    expect(seedDatabase(connection, 'small')).toEqual({ seeded: true, mode: 'small', categories: 4, items: 12 });
    const item = connection.db.select().from(menuItems).get()!;
    connection.db.update(menuItems).set({ name: 'Edited by staff', archivedAt: '2026-02-01T00:00:00.000Z', revision: 2 })
      .where(eq(menuItems.id, item.id)).run();
    connection.db.update(appState).set({ menuRevision: 9, ordersRevision: 4 }).run();
    expect(seedDatabase(connection, 'small')).toEqual({ seeded: false, reason: 'already-initialized' });
    // Requesting another size is deliberately non-destructive too.
    expect(seedDatabase(connection, 'large').seeded).toBe(false);
    connection.close();
    connection = open({ seedMode: 'small' });
    expect(connection.db.select().from(menuItems).all()).toHaveLength(12);
    expect(connection.db.select().from(menuItems).where(eq(menuItems.id, item.id)).get()).toMatchObject({
      name: 'Edited by staff', archivedAt: '2026-02-01T00:00:00.000Z', revision: 2
    });
    expect(connection.db.select().from(appState).get()).toMatchObject({ menuRevision: 9, ordersRevision: 4 });
  });

  it('creates a deterministic 5,000-item fixture with fixed, open, and unavailable items', () => {
    expect(seedDatabase(connection, 'large')).toEqual({ seeded: true, mode: 'large', categories: 50, items: 5_000 });
    expect(connection.db.select().from(categories).all()).toHaveLength(50);
    const firstRun = connection.db.select().from(menuItems).orderBy(menuItems.id).all();
    expect(firstRun).toHaveLength(5_000);
    expect(firstRun.filter((item) => item.pricingMode === 'open')).toHaveLength(500);
    expect(firstRun.some((item) => !item.available)).toBe(true);
    const other = initializeDatabase({ filename: join(directory, 'other.sqlite'), seedMode: 'large' });
    connections.push(other);
    expect(other.db.select().from(menuItems).orderBy(menuItems.id).all()).toEqual(firstRun);
    connection.close();
    connection = open({ seedMode: 'large' });
    expect(connection.db.select().from(menuItems).all()).toHaveLength(5_000);
  });

  it('does not seed a nonempty database or a previously changed empty database', () => {
    connection.db.insert(categories).values({
      id: randomUUID(), name: 'Real menu', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z'
    }).run();
    expect(seedDatabase(connection, 'small')).toEqual({ seeded: false, reason: 'database-not-empty' });
    connection.db.delete(categories).run();
    connection.db.update(appState).set({ menuRevision: 5 }).run();
    expect(seedDatabase(connection, 'small').seeded).toBe(false);
    expect(connection.db.select().from(menuItems).all()).toEqual([]);
  });

  it('does not repopulate a deliberately emptied seeded menu', () => {
    seedDatabase(connection, 'small');
    connection.db.delete(menuItems).run();
    connection.db.delete(categories).run();
    connection.close();
    connection = open({ seedMode: 'small' });
    expect(connection.db.select().from(categories).all()).toEqual([]);
  });

  it('rolls back the entire seed and revision on failure, and permits retry', () => {
    connection.sqlite.exec(`CREATE TRIGGER fail_seed BEFORE INSERT ON menu_items
      BEGIN SELECT RAISE(ABORT, 'test seed failure'); END;`);
    expect(() => seedDatabase(connection, 'small')).toThrow();
    expect(connection.db.select().from(categories).all()).toEqual([]);
    expect(connection.db.select().from(menuItems).all()).toEqual([]);
    expect(connection.db.select().from(appState).get()).toMatchObject({ menuRevision: 0, demoSeedMode: null });
    connection.sqlite.exec('DROP TRIGGER fail_seed');
    expect(seedDatabase(connection, 'small').seeded).toBe(true);
  });

  it('validates the seed mode without silently accepting misspellings', () => {
    for (const mode of ['none', 'small', 'large']) expect(parseSeedMode(mode)).toBe(mode);
    expect(() => parseSeedMode('larg')).toThrow('SEED_MODE must be none, small, or large.');
  });

  it.each([-1, 1.5, MAX_UNIT_PRICE_MINOR + 1, Number.MAX_SAFE_INTEGER + 1])('rejects invalid menu money %s in SQL', (price) => {
    const { item } = menuFixture();
    expect(() => connection.sqlite.prepare('UPDATE menu_items SET price_minor = ? WHERE id = ?').run(price, item.id)).toThrow(/CHECK/);
  });

  it('enforces fixed/open pricing combinations, booleans, and foreign keys', () => {
    const { item } = menuFixture();
    for (const change of ["pricing_mode = 'invalid'", 'price_minor = NULL', "pricing_mode = 'open'", 'available = 2', 'available = 0.5']) {
      expect(() => connection.sqlite.prepare(`UPDATE menu_items SET ${change} WHERE id = ?`).run(item.id)).toThrow(/CHECK/);
    }
    expect(() => connection.sqlite.prepare('UPDATE menu_items SET category_id = ? WHERE id = ?').run(randomUUID(), item.id)).toThrow(/FOREIGN KEY/);
    connection.db.update(menuItems).set({ priceMinor: 0 }).where(eq(menuItems.id, item.id)).run();
    connection.db.update(menuItems).set({ pricingMode: 'open', priceMinor: null }).where(eq(menuItems.id, item.id)).run();
    expect(connection.db.select().from(menuItems).where(eq(menuItems.id, item.id)).get()?.priceMinor).toBeNull();
  });

  it.each([
    'subtotal_minor = -1', 'subtotal_minor = 1.5', 'discount_minor = -1', 'total_minor = -1',
    'discount_minor = subtotal_minor + 1', 'total_minor = total_minor + 1',
    'subtotal_minor = 9007199254740992, total_minor = 9007199254740992',
    "currency = 'EUR'", "status = 'unknown'", 'revision = 0', 'revision = 1.5', "request_hash = 'bad'"
  ])('enforces order constraints: %s', (change) => {
    const { order } = orderFixture();
    expect(() => connection.sqlite.prepare(`UPDATE orders SET ${change} WHERE id = ?`).run(order.id)).toThrow(/CHECK/);
  });

  it('supports a fully discounted zero total and totals beyond signed 32-bit', () => {
    const { order } = orderFixture();
    connection.db.update(orders).set({ subtotalMinor: 9_900_000_000, discountMinor: 9_900_000_000, totalMinor: 0 })
      .where(eq(orders.id, order.id)).run();
    expect(connection.db.select().from(orders).where(eq(orders.id, order.id)).get()).toMatchObject({
      subtotalMinor: 9_900_000_000, discountMinor: 9_900_000_000, totalMinor: 0
    });
  });

  it.each([
    'unit_price_minor = -1', `unit_price_minor = ${MAX_UNIT_PRICE_MINOR + 1}`, 'unit_price_minor = 0.5',
    'quantity = 0', 'quantity = 1.5', `quantity = ${MAX_QUANTITY + 1}`, 'line_total_minor = 0',
    'line_total_minor = -1', 'line_total_minor = 0.5', 'item_revision = 0', 'line_index = 100',
    "pricing_mode = 'other'"
  ])('enforces line constraints: %s', (change) => {
    const { line } = orderFixture();
    expect(() => connection.sqlite.prepare(`UPDATE order_lines SET ${change} WHERE id = ?`).run(line.id)).toThrow(/CHECK/);
  });

  it('accepts the contract maximum price and quantity with exact line arithmetic', () => {
    const { item, line } = orderFixture();
    connection.db.update(menuItems).set({ priceMinor: MAX_UNIT_PRICE_MINOR }).where(eq(menuItems.id, item.id)).run();
    connection.db.update(orderLines).set({
      unitPriceMinor: MAX_UNIT_PRICE_MINOR, quantity: MAX_QUANTITY, lineTotalMinor: MAX_UNIT_PRICE_MINOR * MAX_QUANTITY
    }).where(eq(orderLines.id, line.id)).run();
    expect(connection.db.select().from(orderLines).where(eq(orderLines.id, line.id)).get()?.lineTotalMinor).toBe(99_000_000);
  });

  it('enforces unique idempotency keys independently of quote consumption', () => {
    const { order } = orderFixture();
    const { snapshot } = quoteFixture();
    expect(() => connection.sqlite.prepare(`
      INSERT INTO orders (id, quote_id, idempotency_key, request_hash, subtotal_minor, discount_minor, total_minor, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)
    `).run(randomUUID(), snapshot.quoteId, order.idempotencyKey, order.requestHash,
      snapshot.subtotalMinor, snapshot.totalMinor, snapshot.createdAt, snapshot.createdAt)).toThrow(/UNIQUE.*idempotency_key/);
    expect(connection.db.select().from(orders).all()).toHaveLength(1);
  });

  it('rejects consumption of one quote under another key', () => {
    const { order } = orderFixture();
    expect(() => connection.sqlite.prepare(`
      INSERT INTO orders (id, quote_id, idempotency_key, request_hash, subtotal_minor, discount_minor, total_minor, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)
    `).run(randomUUID(), order.quoteId, randomUUID(), order.requestHash,
      order.subtotalMinor, order.totalMinor, order.createdAt, order.updatedAt)).toThrow(/UNIQUE.*quote_id/);
  });

  it('allows separate lines for the same item and different open prices, with unique positions', () => {
    const { order, line } = orderFixture();
    connection.db.insert(orderLines).values({
      ...line, id: randomUUID(), lineIndex: 1, pricingMode: 'open', unitPriceMinor: 700, lineTotalMinor: 700
    }).run();
    expect(() => connection.db.insert(orderLines).values({ ...line, id: randomUUID() }).run()).toThrow();
    expect(connection.db.select().from(orderLines).where(eq(orderLines.orderId, order.id)).all()).toHaveLength(2);
  });

  it('retains historical line snapshots, quote, order key, and revisions after menu edits, archival, and reopening', () => {
    const { item, category, order, line, row } = orderFixture();
    connection.sqlite.transaction(() => {
      connection.db.update(menuItems).set({ name: 'New name', priceMinor: 999, archivedAt: '2026-02-01T00:00:00.000Z', revision: 2 })
        .where(eq(menuItems.id, item.id)).run();
      connection.db.update(categories).set({ name: 'New category', archivedAt: '2026-02-01T00:00:00.000Z', revision: 2 })
        .where(eq(categories.id, category.id)).run();
      connection.db.update(appState).set({ menuRevision: 3, ordersRevision: 1 }).run();
    }).immediate();
    connection.close();
    connection = open({ seedMode: 'small' });
    expect(connection.db.select().from(orderLines).where(eq(orderLines.id, line.id)).get()).toEqual(line);
    expect(connection.db.select().from(orders).where(eq(orders.id, order.id)).get()).toMatchObject(order);
    expect(connection.db.select().from(checkoutQuotes).where(eq(checkoutQuotes.id, row.id)).get()).toEqual(row);
    expect(connection.db.select().from(appState).get()).toMatchObject({ menuRevision: 3, ordersRevision: 1 });
    expect(() => connection.sqlite.prepare('DELETE FROM menu_items WHERE id = ?').run(item.id)).toThrow(/FOREIGN KEY/);
    expect(() => connection.sqlite.prepare('DELETE FROM categories WHERE id = ?').run(category.id)).toThrow(/FOREIGN KEY/);
    expect(() => connection.sqlite.prepare('DELETE FROM orders WHERE id = ?').run(order.id)).toThrow(/FOREIGN KEY/);
    expect(() => connection.sqlite.prepare('DELETE FROM checkout_quotes WHERE id = ?').run(row.id)).toThrow(/FOREIGN KEY/);
  });

  it('rolls back order/lines/revision together on a failed write', () => {
    const { snapshot } = quoteFixture();
    const id = randomUUID();
    expect(() => connection.sqlite.transaction(() => {
      connection.db.insert(orders).values({
        id, quoteId: snapshot.quoteId, idempotencyKey: randomUUID(), requestHash: 'b'.repeat(64),
        subtotalMinor: snapshot.subtotalMinor, discountMinor: 0, totalMinor: snapshot.totalMinor,
        createdAt: snapshot.createdAt, updatedAt: snapshot.createdAt
      }).run();
      connection.db.update(appState).set({ ordersRevision: 1 }).run();
      connection.db.insert(orderLines).values({
        ...snapshot.lines[0]!, id: randomUUID(), orderId: id, lineIndex: 0, quantity: 0
      }).run();
    }).immediate()).toThrow();
    expect(connection.db.select().from(orders).all()).toEqual([]);
    expect(connection.db.select().from(orderLines).all()).toEqual([]);
    expect(connection.db.select().from(appState).get()?.ordersRevision).toBe(0);
  });

  it('cleans only expired unreferenced quotes, including the exact expiry boundary', () => {
    const { row: referenced } = orderFixture();
    const { row: expired } = quoteFixture();
    const { row: future } = quoteFixture({ createdAt: '2026-01-01T12:05:00.000Z', expiresAt: '2026-01-01T12:10:00.000Z' });
    expect(cleanupExpiredQuotes(connection, '2026-01-01T12:05:00.000Z')).toBe(1);
    expect(connection.db.select().from(checkoutQuotes).where(eq(checkoutQuotes.id, expired.id)).get()).toBeUndefined();
    expect(connection.db.select().from(checkoutQuotes).where(eq(checkoutQuotes.id, referenced.id)).get()).toEqual(referenced);
    expect(connection.db.select().from(checkoutQuotes).where(eq(checkoutQuotes.id, future.id)).get()).toEqual(future);
    expect(cleanupExpiredQuotes(connection, '2026-01-01T13:00:00.000Z')).toBe(1);
    expect(cleanupExpiredQuotes(connection, '2026-01-01T13:00:00.000Z')).toBe(0);
    expect(connection.db.select().from(checkoutQuotes).all()).toHaveLength(1);
    expect(() => cleanupExpiredQuotes(connection, 'invalid')).toThrow();
  });

  it('rejects malformed quote JSON, invalid currency, negative revision, and reversed expiry', () => {
    const { row } = quoteFixture();
    for (const change of ["snapshot_json = 'broken'", "currency = 'EUR'", 'menu_revision = -1', 'expires_at = created_at']) {
      expect(() => connection.sqlite.prepare(`UPDATE checkout_quotes SET ${change} WHERE id = ?`).run(row.id)).toThrow(/CHECK/);
    }
  });

  it('enforces a singleton and safe integer stream revisions', () => {
    expect(() => connection.sqlite.prepare('INSERT INTO app_state (id) VALUES (2)').run()).toThrow(/CHECK/);
    for (const change of ['menu_revision = -1', 'orders_revision = 0.5', 'orders_revision = 9007199254740992']) {
      expect(() => connection.sqlite.prepare(`UPDATE app_state SET ${change}`).run()).toThrow(/CHECK/);
    }
  });

  it('provides indexes for bounded menu/order reads and quote cleanup', () => {
    const names = connection.sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all() as { name: string }[];
    expect(names.map(({ name }) => name)).toEqual(expect.arrayContaining([
      'categories_active_sort_idx', 'menu_items_category_active_idx', 'menu_items_active_idx',
      'orders_created_idx', 'orders_status_created_idx', 'checkout_quotes_expiry_idx',
      'orders_quote_unique', 'orders_idempotency_key_unique', 'order_lines_position_unique'
    ]));
    expect(connection.db.get(sql`PRAGMA integrity_check`)).toEqual({ integrity_check: 'ok' });
    expect(readFileSync(filename).length).toBeGreaterThan(0);
  });
});
