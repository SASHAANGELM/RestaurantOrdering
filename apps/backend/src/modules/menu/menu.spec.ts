import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  apiErrorSchema, menuCatalogSchema, categoriesResponseSchema, categoryMutationResponseSchema, itemMutationResponseSchema,
  itemsResponseSchema, menuChangedSchema, resolveItemsResponseSchema, type Category, type MenuItem
} from '@restaurant-ordering/contracts';
import { createApp } from '../../app';
import { openDatabase, type DatabaseConnection } from '../../db/connection';
import { initializeDatabase } from '../../db/initialize';
import { seedDatabase } from '../../db/seed';
import { HttpError } from '../../middleware/errors';
import { listCategories, listItems, readMenuRevision, readResolvedItems, resolveItems } from './queries';
import { createMenuService } from './service';

describe('menu APIs and services with isolated real SQLite files', () => {
  let directory: string;
  let filename: string;
  let connection: DatabaseConnection;
  let server: Server;
  let baseUrl: string;
  let category: Category;
  let item: MenuItem;
  let service: ReturnType<typeof createMenuService>;

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'restaurant-menu-'));
    filename = join(directory, 'test.sqlite');
    connection = initializeDatabase({ filename });
    service = createMenuService(connection);
    category = service.createCategory({ name: 'Mains', sortOrder: 0 }).response.category;
    item = service.createItem({ categoryId: category.id, name: 'Soup', description: 'Hot',
      pricingMode: 'fixed', priceMinor: 500, available: true }).response.item;
    server = createServer(createApp({ connection, jsonBodyLimitBytes: 65536, reportError: vi.fn() }));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing listener.');
    baseUrl = `http://127.0.0.1:${address.port}/api`;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    if (connection.sqlite.open) connection.close();
    rmSync(directory, { recursive: true, force: true });
  });

  const page = { page: 1, pageSize: 50 };
  async function request(path: string, method = 'GET', body?: unknown) {
    return fetch(`${baseUrl}${path}`, { method,
      ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
  }
  async function error(response: Response, status: number, code: string) {
    expect(response.status).toBe(status);
    const result = apiErrorSchema.parse(await response.json()).error;
    expect(result.code).toBe(code);
    expect(result.requestId).toBe(response.headers.get('x-request-id'));
    return result;
  }
  async function patchItem(body: unknown) { return request(`/setup/items/${item.id}`, 'PATCH', body); }

  it('loads every active category and item in a single catalog snapshot, beyond page limits', async () => {
    service.createCategory({ name: 'Empty category', sortOrder: 1 });
    for (let index = 0; index < 125; index++) service.createItem({ categoryId: category.id, name: `Dish ${index}`, available: index !== 0, pricingMode: 'fixed', priceMinor: 100 });
    const removed = service.createItem({ categoryId: category.id, name: 'Archived', available: true, pricingMode: 'fixed', priceMinor: 100 }).response.item;
    service.updateItem(removed.id, { expectedRevision: 1, archived: true });
    const response = await request('/menu/catalog');
    expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('no-store');
    const catalog = menuCatalogSchema.parse(await response.json());
    expect(catalog.items).toHaveLength(126); expect(catalog.categories).toHaveLength(2);
    expect(catalog.items.at(-1)?.available).toBe(false);
    expect(catalog.menuRevision).toBe(readMenuRevision(connection));
    expect(response.headers.get('content-encoding')).toBe('gzip');
    expect(response.headers.get('vary')).toContain('Accept-Encoding');
    const identity = await fetch(`${baseUrl}/menu/catalog`, { headers: { 'Accept-Encoding': 'identity' } });
    expect(identity.headers.get('content-encoding')).toBeNull();
    expect(await identity.json()).toEqual(catalog);
  });

  it('creates, trims, edits, and persists categories and items through HTTP', async () => {
    const created = await request('/setup/categories', 'POST', { name: '  Drinks  ', sortOrder: -1 });
    expect(created.status).toBe(201);
    const drinks = categoryMutationResponseSchema.parse(await created.json());
    expect(drinks).toMatchObject({ category: { name: 'Drinks', revision: 1, sortOrder: -1 }, menuRevision: 3 });
    const edited = categoryMutationResponseSchema.parse(await (await request(`/setup/categories/${drinks.category.id}`, 'PATCH',
      { expectedRevision: 1, name: 'Beverages', sortOrder: 3 })).json());
    expect(edited).toMatchObject({ category: { name: 'Beverages', revision: 2, sortOrder: 3 }, menuRevision: 4 });
    const createdItem = await request('/setup/items', 'POST', { categoryId: drinks.category.id, name: ' Tea ',
      pricingMode: 'open', available: false });
    expect(createdItem.status).toBe(201);
    const tea = itemMutationResponseSchema.parse(await createdItem.json());
    expect(tea).toMatchObject({ item: { name: 'Tea', pricingMode: 'open', priceMinor: null, available: false }, menuRevision: 5 });
    const moved = itemMutationResponseSchema.parse(await (await request(`/setup/items/${tea.item.id}`, 'PATCH',
      { expectedRevision: 1, categoryId: category.id, name: 'Green tea', description: ' Fresh ', available: true,
        pricingMode: 'fixed', priceMinor: 0 })).json());
    expect(moved).toMatchObject({ item: { categoryId: category.id, name: 'Green tea', description: 'Fresh',
      pricingMode: 'fixed', priceMinor: 0, available: true, revision: 2 }, menuRevision: 6 });
    const reopened = openDatabase(filename);
    try {
      expect(resolveItems(reopened, [tea.item.id]).items[0]).toMatchObject({ state: 'available', item: moved.item });
      expect(readMenuRevision(reopened)).toBe(6);
    } finally { reopened.close(); }
  });

  it('counts available matches across pages and sorts unavailable items last', async () => {
    service.createItem({ categoryId: category.id, name: 'Alpha soup', pricingMode: 'fixed', priceMinor: 100, available: false });
    service.createItem({ categoryId: category.id, name: 'Zucchini soup', pricingMode: 'fixed', priceMinor: 100, available: true });
    const other = service.createCategory({ name: 'Other', sortOrder: 0 }).response.category;
    service.createItem({ categoryId: other.id, name: 'Zucchini salad', pricingMode: 'fixed', priceMinor: 100, available: true });
    const result = categoriesResponseSchema.parse(await (await request('/menu/categories?search=zucchini')).json());
    expect(result.categories.find((entry) => entry.id === category.id)?.availableCount).toBe(1);
    expect(result.categories.find((entry) => entry.id === other.id)?.availableCount).toBe(1);
    expect(result.menuUpdatedAt).toMatch(/^2026-/);
    const unfiltered = categoriesResponseSchema.parse(await (await request('/menu/categories')).json());
    expect(unfiltered.categories.find((entry) => entry.id === category.id)?.availableCount).toBe(2);
    const first = listItems(connection, { page: 1, pageSize: 2 });
    expect(first.items.every((entry) => entry.available)).toBe(true);
    const full = listItems(connection, { page: 1, pageSize: 50 });
    expect(full.items.at(-1)?.name).toBe('Alpha soup');
  });

  it('persists item photos through create, update, list and resolve, and supports clearing', async () => {
    const created = itemMutationResponseSchema.parse(await (await request('/setup/items', 'POST', {
      categoryId: category.id, name: 'Photographed salad', pricingMode: 'fixed', priceMinor: 850, available: true, imageUrl: '/images/salad.jpg'
    })).json()).item;
    expect(listItems(connection, page).items.find((entry) => entry.id === created.id)?.imageUrl).toBe('/api/images/salad.jpg');
    const updated = itemMutationResponseSchema.parse(await (await request(`/setup/items/${created.id}`, 'PATCH', {
      expectedRevision: 1, imageUrl: 'https://example.com/dish.jpg'
    })).json()).item;
    expect(updated.revision).toBe(2);
    expect(resolveItems(connection, [created.id]).items[0]).toMatchObject({ item: { imageUrl: 'https://example.com/dish.jpg' } });
    const cleared = itemMutationResponseSchema.parse(await (await request(`/setup/items/${created.id}`, 'PATCH', { expectedRevision: 2, imageUrl: null })).json());
    expect(cleared.item).not.toHaveProperty('imageUrl');
  });

  it('changes fixed/open pricing, clears descriptions, and toggles availability', async () => {
    const open = itemMutationResponseSchema.parse(await (await patchItem({ expectedRevision: 1, pricingMode: 'open',
      description: null, available: false })).json());
    expect(open).toMatchObject({ item: { pricingMode: 'open', priceMinor: null, available: false, revision: 2 }, menuRevision: 3 });
    expect(open.item).not.toHaveProperty('description');
    const fixed = itemMutationResponseSchema.parse(await (await patchItem({ expectedRevision: 2, pricingMode: 'fixed', priceMinor: 1000000 })).json());
    expect(fixed).toMatchObject({ item: { pricingMode: 'fixed', priceMinor: 1000000, revision: 3 }, menuRevision: 4 });
    const available = itemMutationResponseSchema.parse(await (await patchItem({ expectedRevision: 3, available: true })).json());
    expect(available.item.available).toBe(true);
  });

  it.each([
    {}, { name: '' }, { name: 'x', sortOrder: 0.5 }, { name: 'x', extra: true }, { name: 'x'.repeat(121) }
  ])('rejects malformed category creation %j without advancing revision', async (body) => {
    await error(await request('/setup/categories', 'POST', body), 400, 'VALIDATION_ERROR');
    expect(readMenuRevision(connection)).toBe(2);
  });

  it.each([
    { pricingMode: 'fixed' }, { pricingMode: 'fixed', priceMinor: -1 }, { pricingMode: 'fixed', priceMinor: 1.5 },
    { pricingMode: 'fixed', priceMinor: 1000001 }, { pricingMode: 'fixed', priceMinor: '5.00' },
    { pricingMode: 'open', priceMinor: 5 }, { pricingMode: 'open', priceMinor: null }, { pricingMode: 'other' }
  ])('rejects invalid item creation pricing %j', async (pricing) => {
    await error(await request('/setup/items', 'POST', { categoryId: category.id, name: 'Bad', available: true, ...pricing }),
      400, 'VALIDATION_ERROR');
    expect(listItems(connection, page).total).toBe(1);
    expect(readMenuRevision(connection)).toBe(2);
  });

  it.each([
    {}, { expectedRevision: 1 }, { expectedRevision: 0, name: 'x' }, { expectedRevision: 1, priceMinor: 20 },
    { expectedRevision: 1, pricingMode: 'fixed' }, { expectedRevision: 1, pricingMode: 'open', priceMinor: null },
    { expectedRevision: 1, archived: 'false' }, { expectedRevision: 1, unknown: true }, { expectedRevision: 1, available: 'false' }
  ])('rejects malformed item edit %j', async (body) => {
    await error(await patchItem(body), 400, 'VALIDATION_ERROR');
    expect(readMenuRevision(connection)).toBe(2);
  });

  it.each([{ expectedRevision: 1 }, { expectedRevision: 1, archived: 'false' }, { expectedRevision: 1, sortOrder: 0.5 }])(
    'rejects malformed category edit %j', async (body) => {
      await error(await request(`/setup/categories/${category.id}`, 'PATCH', body), 400, 'VALIDATION_ERROR');
      expect(readMenuRevision(connection)).toBe(2);
    });

  it('rejects stale edits even if they would be no-ops and preserves the newer data', async () => {
    service.updateCategory(category.id, { expectedRevision: 1, name: 'New' });
    service.updateItem(item.id, { expectedRevision: 1, available: false });
    const conflict = await error(await patchItem({ expectedRevision: 1, available: false }), 409, 'REVISION_CONFLICT');
    expect(conflict).toMatchObject({ details: { entityType: 'item', entityId: item.id, expectedRevision: 1, currentRevision: 2 } });
    await error(await request(`/setup/categories/${category.id}`, 'PATCH', { expectedRevision: 1, name: 'Old' }), 409, 'REVISION_CONFLICT');
    expect(readMenuRevision(connection)).toBe(4);
    expect(resolveItems(connection, [item.id]).items[0]).toMatchObject({ state: 'unavailable', category: { name: 'New' } });
  });

  it('allows only one of overlapping edits with the same expected revision', async () => {
    const responses = await Promise.all([patchItem({ expectedRevision: 1, name: 'One' }), patchItem({ expectedRevision: 1, name: 'Two' })]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    await Promise.all(responses.map((response) => response.json()));
    expect(readMenuRevision(connection)).toBe(3);
    expect(resolveItems(connection, [item.id]).items[0]).toMatchObject({ item: { revision: 2 } });
  });

  it('returns missing-resource details for edits and invalid category assignments', async () => {
    const missing = randomUUID();
    const result = await error(await request(`/setup/categories/${missing}`, 'PATCH', { expectedRevision: 1, name: 'x' }), 404, 'NOT_FOUND');
    expect(result).toMatchObject({ details: { resourceType: 'category', resourceId: missing } });
    await error(await request(`/setup/items/${missing}`, 'PATCH', { expectedRevision: 1, name: 'x' }), 404, 'NOT_FOUND');
    await error(await patchItem({ expectedRevision: 1, categoryId: missing }), 404, 'NOT_FOUND');
    await error(await request('/setup/items', 'POST', { categoryId: missing, name: 'x', pricingMode: 'open', available: true }), 404, 'NOT_FOUND');
    expect(readMenuRevision(connection)).toBe(2);
  });

  it('rejects assignment to archived categories and keeps children visible only in Setup and resolution', async () => {
    const archive = categoryMutationResponseSchema.parse(await (await request(`/setup/categories/${category.id}`, 'PATCH',
      { expectedRevision: 1, archived: true })).json());
    expect(archive.category.archivedAt).not.toBeNull();
    expect(categoriesResponseSchema.parse(await (await request('/menu/categories')).json()).categories).toEqual([]);
    expect(categoriesResponseSchema.parse(await (await request('/setup/categories')).json()).categories).toEqual([]);
    expect(categoriesResponseSchema.parse(await (await request('/setup/categories?includeArchived=true')).json()).categories).toHaveLength(1);
    expect(itemsResponseSchema.parse(await (await request('/menu/items')).json()).total).toBe(0);
    expect(itemsResponseSchema.parse(await (await request('/setup/items')).json()).total).toBe(1);
    const resolved = resolveItemsResponseSchema.parse(await (await request('/menu/resolve', 'POST', { itemIds: [item.id] })).json());
    expect(resolved.items[0]).toMatchObject({ state: 'category-archived', item: { archivedAt: null, revision: 1 } });
    const checkoutRead = connection.sqlite.transaction(() => readResolvedItems(connection, [item.id]))();
    expect(checkoutRead).toEqual(resolved.items);
    await error(await patchItem({ expectedRevision: 1, categoryId: category.id }), 422, 'CATEGORY_ARCHIVED');
    await error(await request('/setup/items', 'POST', { categoryId: category.id, name: 'x', pricingMode: 'open', available: true }), 422, 'CATEGORY_ARCHIVED');
    expect(readMenuRevision(connection)).toBe(3);
    const active = service.createCategory({ name: 'Active', sortOrder: 1 }).response.category;
    service.updateItem(item.id, { expectedRevision: 1, categoryId: active.id });
    expect(listItems(connection, page).total).toBe(1);
    expect(resolveItems(connection, [item.id]).items[0]?.state).toBe('available');
  });

  it('archives items without deleting them, and reports all resolution states in requested order', async () => {
    const unavailable = service.createItem({ categoryId: category.id, name: 'Unavailable', pricingMode: 'open', available: false }).response.item;
    const active = service.createItem({ categoryId: category.id, name: 'Active', pricingMode: 'fixed', priceMinor: 10, available: true }).response.item;
    const archived = itemMutationResponseSchema.parse(await (await patchItem({ expectedRevision: 1, archived: true })).json());
    expect(archived.item.archivedAt).not.toBeNull();
    const missing = randomUUID();
    const ids = [unavailable.id, missing, item.id, active.id];
    const resolved = resolveItemsResponseSchema.parse(await (await request('/menu/resolve', 'POST', { itemIds: ids })).json());
    expect(resolved.items.map((entry) => [entry.itemId, entry.state])).toEqual([
      [unavailable.id, 'unavailable'], [missing, 'missing'], [item.id, 'archived'], [active.id, 'available']
    ]);
    expect(itemsResponseSchema.parse(await (await request('/menu/items')).json()).items).toHaveLength(2);
    expect(itemsResponseSchema.parse(await (await request('/setup/items')).json()).total).toBe(2);
    expect(itemsResponseSchema.parse(await (await request('/setup/items?includeArchived=true')).json()).total).toBe(3);
    service.updateCategory(category.id, { expectedRevision: 1, archived: true });
    expect(resolveItems(connection, [item.id, unavailable.id]).items.map((entry) => entry.state)).toEqual(['archived', 'category-archived']);
  });

  it('returns unchanged revisions, timestamps and no notification for semantic no-ops', () => {
    expect(service.updateCategory(category.id, { expectedRevision: 1, name: category.name, sortOrder: category.sortOrder })).toEqual({
      response: { category, menuRevision: 2 }, notification: null
    });
    expect(service.updateItem(item.id, { expectedRevision: 1, name: item.name, pricingMode: 'fixed', priceMinor: 500, available: true })).toEqual({
      response: { item, menuRevision: 2 }, notification: null
    });
    const archivedCategory = service.updateCategory(category.id, { expectedRevision: 1, archived: true });
    expect(service.updateCategory(category.id, { expectedRevision: 2, archived: true })).toEqual({ ...archivedCategory, notification: null });
    const archivedItem = service.updateItem(item.id, { expectedRevision: 1, archived: true });
    expect(service.updateItem(item.id, { expectedRevision: 2, archived: true })).toEqual({ ...archivedItem, notification: null });
  });

  it('restores categories and items through HTTP, preserves their fields, and persists across reopening', async () => {
    service.updateCategory(category.id, { expectedRevision: 1, archived: true });
    service.updateItem(item.id, { expectedRevision: 1, archived: true });
    const restoredCategory = categoryMutationResponseSchema.parse(await (await request(`/setup/categories/${category.id}`, 'PATCH',
      { expectedRevision: 2, archived: false })).json());
    expect(restoredCategory).toMatchObject({ category: { ...category, revision: 3, updatedAt: expect.any(String) }, menuRevision: 5 });
    const restoredItem = itemMutationResponseSchema.parse(await (await patchItem({ expectedRevision: 2, archived: false })).json());
    expect(restoredItem).toMatchObject({ item: { ...item, revision: 3, updatedAt: expect.any(String) }, menuRevision: 6 });
    expect(menuCatalogSchema.parse(await (await request('/menu/catalog')).json()).items).toEqual([restoredItem.item]);
    expect(categoriesResponseSchema.parse(await (await request('/setup/categories')).json()).categories).toEqual([restoredCategory.category]);
    expect(itemsResponseSchema.parse(await (await request('/setup/items')).json()).items).toEqual([restoredItem.item]);
    connection.close(); connection = openDatabase(filename);
    expect(resolveItems(connection, [item.id]).items[0]).toMatchObject({ state: 'available', item: restoredItem.item, category: restoredCategory.category });
    expect(readMenuRevision(connection)).toBe(6);
  });

  it('restores only the chosen record and preserves archived-category and unavailable eligibility', () => {
    const unavailable = service.createItem({ categoryId: category.id, name: 'Unavailable', pricingMode: 'open', available: false }).response.item;
    const individuallyArchived = service.createItem({ categoryId: category.id, name: 'Archived', pricingMode: 'open', available: true }).response.item;
    service.updateItem(unavailable.id, { expectedRevision: 1, archived: true });
    const archived = service.updateItem(individuallyArchived.id, { expectedRevision: 1, archived: true }).response.item;
    service.updateCategory(category.id, { expectedRevision: 1, archived: true });
    const restored = service.updateItem(unavailable.id, { expectedRevision: 2, archived: false }).response.item;
    expect(restored).toMatchObject({ available: false, archivedAt: null, revision: 3, pricingMode: 'open', priceMinor: null });
    expect(resolveItems(connection, [unavailable.id]).items[0]?.state).toBe('category-archived');
    expect(listItems(connection, page).items).toEqual([]);
    service.updateCategory(category.id, { expectedRevision: 2, archived: false });
    const states = resolveItems(connection, [item.id, unavailable.id, individuallyArchived.id]).items;
    expect(states.map((entry) => entry.state)).toEqual(['available', 'unavailable', 'archived']);
    expect(states[0]).toMatchObject({ item: { revision: 1 } });
    expect(states[2]).toMatchObject({ item: archived });
    expect(listItems(connection, page).items.map((entry) => entry.id)).toEqual([item.id, unavailable.id]);
  });

  it('revision-checks repeated restores without changing timestamps or publishing no-op notifications', async () => {
    expect(service.updateCategory(category.id, { expectedRevision: 1, archived: false })).toEqual({ response: { category, menuRevision: 2 }, notification: null });
    expect(service.updateItem(item.id, { expectedRevision: 1, archived: false })).toEqual({ response: { item, menuRevision: 2 }, notification: null });
    service.updateCategory(category.id, { expectedRevision: 1, archived: true });
    service.updateItem(item.id, { expectedRevision: 1, archived: true });
    await error(await patchItem({ expectedRevision: 1, archived: false }), 409, 'REVISION_CONFLICT');
    await error(await request(`/setup/categories/${category.id}`, 'PATCH', { expectedRevision: 1, archived: false }), 409, 'REVISION_CONFLICT');
    expect(readMenuRevision(connection)).toBe(4);
    const restoredCategory = service.updateCategory(category.id, { expectedRevision: 2, archived: false });
    expect(service.updateCategory(category.id, { expectedRevision: 3, archived: false })).toEqual({ ...restoredCategory, notification: null });
    const restoredItem = service.updateItem(item.id, { expectedRevision: 2, archived: false });
    expect(service.updateItem(item.id, { expectedRevision: 3, archived: false })).toEqual({ ...restoredItem, notification: null });
    await error(await patchItem({ expectedRevision: 2, archived: false }), 409, 'REVISION_CONFLICT');
    await error(await request(`/setup/categories/${category.id}`, 'PATCH', { expectedRevision: 2, archived: false }), 409, 'REVISION_CONFLICT');
    expect(readMenuRevision(connection)).toBe(6);
  });

  it('commits restoration before notification and rolls it back if the menu revision write fails', () => {
    service.updateCategory(category.id, { expectedRevision: 1, archived: true });
    service.updateItem(item.id, { expectedRevision: 1, archived: true });
    connection.sqlite.exec("CREATE TRIGGER fail_restore BEFORE UPDATE OF menu_revision ON app_state BEGIN SELECT RAISE(ABORT, 'test failure'); END");
    expect(() => service.updateCategory(category.id, { expectedRevision: 2, archived: false })).toThrow();
    expect(() => service.updateItem(item.id, { expectedRevision: 2, archived: false })).toThrow();
    expect(resolveItems(connection, [item.id]).items[0]).toMatchObject({ state: 'archived', item: { revision: 2 }, category: { revision: 2, archivedAt: expect.any(String) } });
    expect(readMenuRevision(connection)).toBe(4);
    connection.sqlite.exec('DROP TRIGGER fail_restore');
    const observer = openDatabase(filename);
    try {
      const restoredCategory = service.updateCategory(category.id, { expectedRevision: 2, archived: false });
      const restoredItem = service.updateItem(item.id, { expectedRevision: 2, archived: false });
      expect(menuChangedSchema.parse(restoredCategory.notification)).toMatchObject({ entityType: 'category', entityId: category.id, change: 'updated', menuRevision: 5 });
      expect(menuChangedSchema.parse(restoredItem.notification)).toMatchObject({ entityType: 'item', entityId: item.id, change: 'updated', menuRevision: 6 });
      expect(resolveItems(observer, [item.id]).items[0]).toMatchObject({ state: 'available', item: restoredItem.response.item, category: restoredCategory.response.category });
    } finally { observer.close(); }
  });

  it('exposes valid notification data only after commits are visible to another connection', () => {
    const observer = openDatabase(filename);
    try {
      const created = service.createCategory({ name: 'Other', sortOrder: 0 });
      const updated = service.updateCategory(created.response.category.id, { expectedRevision: 1, name: 'Changed' });
      const archived = service.updateCategory(created.response.category.id, { expectedRevision: 2, archived: true });
      const createdItem = service.createItem({ categoryId: category.id, name: 'Other', pricingMode: 'open', available: true });
      const updatedItem = service.updateItem(createdItem.response.item.id, { expectedRevision: 1, available: false });
      const archivedItem = service.updateItem(createdItem.response.item.id, { expectedRevision: 2, archived: true });
      const mutations = [created, updated, archived, createdItem, updatedItem, archivedItem];
      expect(mutations.map((entry) => menuChangedSchema.parse(entry.notification).change)).toEqual(['created', 'updated', 'archived', 'created', 'updated', 'archived']);
      expect(mutations.map((entry) => entry.notification?.menuRevision)).toEqual([3, 4, 5, 6, 7, 8]);
      expect(new Set(mutations.map((entry) => entry.notification?.eventId)).size).toBe(6);
      expect(created.notification).toMatchObject({ entityType: 'category', entityId: created.response.category.id });
      expect(createdItem.notification).toMatchObject({ entityType: 'item', entityId: createdItem.response.item.id });
      expect(readMenuRevision(observer)).toBe(8);
      expect(resolveItems(observer, [createdItem.response.item.id]).items[0]).toMatchObject({ state: 'archived', item: archivedItem.response.item });
    } finally { observer.close(); }
  });

  it('rolls back entity writes if incrementing the menu stream fails', () => {
    connection.sqlite.exec("CREATE TRIGGER fail_revision BEFORE UPDATE OF menu_revision ON app_state BEGIN SELECT RAISE(ABORT, 'test failure'); END");
    expect(() => service.updateItem(item.id, { expectedRevision: 1, name: 'Must roll back' })).toThrow();
    expect(() => service.updateCategory(category.id, { expectedRevision: 1, archived: true })).toThrow();
    expect(() => service.createCategory({ name: 'Must roll back', sortOrder: 0 })).toThrow();
    expect(() => service.createItem({ categoryId: category.id, name: 'Must roll back', pricingMode: 'open', available: true })).toThrow();
    expect(listCategories(connection).categories).toEqual([category]);
    expect(listItems(connection, page).items).toEqual([item]);
    expect(readMenuRevision(connection)).toBe(2);
  });

  it('maps real writer contention to retryable 503 without changing menu data', async () => {
    const blocker = openDatabase(filename);
    connection.sqlite.pragma('busy_timeout = 1');
    try {
      blocker.sqlite.exec('BEGIN IMMEDIATE');
      const response = await patchItem({ expectedRevision: 1, name: 'Locked' });
      expect(response.headers.get('retry-after')).toBe('1');
      await error(response, 503, 'SERVICE_UNAVAILABLE');
      expect(readMenuRevision(connection)).toBe(2);
    } finally { blocker.sqlite.exec('ROLLBACK'); blocker.close(); }
    expect((await patchItem({ expectedRevision: 1, name: 'Recovered' })).status).toBe(200);
  });

  it.each(['page=0', 'pageSize=101', 'pageSize=-1', 'page=1e2', 'page=1&page=2', 'categoryId=bad',
    'search=' + 'x'.repeat(121), 'unknown=true', 'includeArchived=true'])('rejects invalid menu query %s', async (query) => {
    await error(await request(`/menu/items?${query}`), 400, 'VALIDATION_ERROR');
  });

  it.each(['includeArchived=1', 'includeArchived=True', 'includeArchived=true&includeArchived=false', 'unknown=true'])(
    'rejects invalid Setup queries %s', async (query) => {
      await error(await request(`/setup/items?${query}`), 400, 'VALIDATION_ERROR');
      await error(await request(`/setup/categories?${query}`), 400, 'VALIDATION_ERROR');
    });

  it('validates IDs, category query fields, and bounded distinct resolution input', async () => {
    await error(await request('/setup/items/bad', 'PATCH', { expectedRevision: 1, name: 'x' }), 400, 'VALIDATION_ERROR');
    await error(await request('/setup/categories/bad', 'PATCH', { expectedRevision: 1, name: 'x' }), 400, 'VALIDATION_ERROR');
    await error(await request('/menu/categories?includeArchived=true'), 400, 'VALIDATION_ERROR');
    for (const body of [{ itemIds: [] }, { itemIds: [item.id, item.id] }, { itemIds: ['bad'] },
      { itemIds: Array.from({ length: 101 }, () => randomUUID()) }, { itemIds: [item.id], unknown: true }]) {
      await error(await request('/menu/resolve', 'POST', body), 400, 'VALIDATION_ERROR');
    }
    const ids = [item.id, ...Array.from({ length: 99 }, () => randomUUID())];
    expect(resolveItemsResponseSchema.parse(await (await request('/menu/resolve', 'POST', { itemIds: ids })).json()).items).toHaveLength(100);
  });

  it('uses literal case-insensitive name search, category filtering, and deterministic ties', async () => {
    const other = service.createCategory({ name: 'Other', sortOrder: -5 }).response.category;
    const special = service.createItem({ categoryId: other.id, name: '100%_Soup', pricingMode: 'open', available: false }).response.item;
    const twin = service.createItem({ categoryId: category.id, name: item.name, pricingMode: 'open', available: true }).response.item;
    const result = itemsResponseSchema.parse(await (await request(`/menu/items?categoryId=${other.id}&search=SOUP`)).json());
    expect(result.items).toEqual([special]);
    for (const search of ['%', '_', "' OR 1=1 --"]) {
      const found = itemsResponseSchema.parse(await (await request(`/menu/items?search=${encodeURIComponent(search)}`)).json());
      expect(found.total).toBe(search === "' OR 1=1 --" ? 0 : 1);
    }
    expect(listItems(connection, { ...page, categoryId: category.id }).items.map((entry) => entry.id)).toEqual([item.id, twin.id].sort());
    expect(listCategories(connection).categories.map((entry) => entry.id)).toEqual([other.id, category.id]);
    service.updateCategory(other.id, { expectedRevision: 1, sortOrder: 0 });
    expect(listCategories(connection).categories.map((entry) => entry.id)).toEqual([other.id, category.id].sort());
    const empty = itemsResponseSchema.parse(await (await request(`/menu/items?categoryId=${randomUUID()}`)).json());
    expect(empty.total).toBe(0);
  });

  it.each(['small', 'large'] as const)('returns bounded deterministic pages and off-page resolution with the %s fixture', async (mode) => {
    const fixture = initializeDatabase({ filename: join(directory, `${mode}.sqlite`) });
    const fixtureServer = createServer(createApp({ connection: fixture, jsonBodyLimitBytes: 65536, reportError: vi.fn() }));
    try {
      seedDatabase(fixture, mode);
      await new Promise<void>((resolve) => fixtureServer.listen(0, '127.0.0.1', resolve));
      const address = fixtureServer.address();
      if (!address || typeof address === 'string') throw new Error('Missing fixture listener.');
      const url = `http://127.0.0.1:${address.port}/api`;
      const defaults = itemsResponseSchema.parse(await (await fetch(`${url}/menu/items`)).json());
      expect(defaults).toMatchObject({ page: 1, pageSize: 50, total: mode === 'small' ? 36 : 5000, menuRevision: 1 });
      expect(defaults.items).toHaveLength(mode === 'small' ? 36 : 50);
      const first = itemsResponseSchema.parse(listItems(fixture, { page: 1, pageSize: 5 }));
      const second = itemsResponseSchema.parse(listItems(fixture, { page: 2, pageSize: 5 }));
      expect(itemsResponseSchema.parse(await (await fetch(`${url}/menu/items?page=2&pageSize=5`)).json())).toEqual(second);
      const resolvedResponse = await fetch(`${url}/menu/resolve`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemIds: [second.items[0]!.id] }) });
      expect(resolveItemsResponseSchema.parse(await resolvedResponse.json()).items[0]).toMatchObject({ item: second.items[0] });
      expect(first.total).toBe(mode === 'small' ? 36 : 5000);
      expect(first.items).toHaveLength(5);
      expect(second.items).toHaveLength(5);
      expect(new Set([...first.items, ...second.items].map((entry) => entry.id)).size).toBe(10);
      expect(listItems(fixture, { page: 1, pageSize: 5 })).toEqual(first);
      expect(listItems(fixture, { page: Number.MAX_SAFE_INTEGER, pageSize: 100 }).items).toEqual([]);
      expect(listItems(fixture, { page: 1, pageSize: 100 }).items.length).toBeLessThanOrEqual(100);
      const categories = listCategories(fixture);
      const filtered = listItems(fixture, { ...page, categoryId: categories.categories[0]!.id });
      expect(filtered.total).toBe(mode === 'small' ? 6 : 100);
      expect(filtered.items.every((entry) => entry.categoryId === categories.categories[0]!.id)).toBe(true);
      expect(resolveItems(fixture, [second.items[0]!.id]).items[0]).toMatchObject({ item: second.items[0] });
      if (mode === 'large') {
        expect(listItems(fixture, { ...page, search: 'Menu item 5000' }).items[0]?.name).toBe('Menu item 5000');
        expect(listItems(fixture, { page: 50, pageSize: 100 }).items).toHaveLength(100);
        expect(listItems(fixture, { page: 51, pageSize: 100 }).items).toEqual([]);
      }
    } finally {
      await new Promise<void>((resolve, reject) => fixtureServer.close((error) => error ? reject(error) : resolve()));
      fixture.close();
    }
  });

  it.each(['categories', 'items', 'resolve'] as const)('reads %s rows and revision from one snapshot during a concurrent commit', (kind) => {
    const writer = openDatabase(filename);
    const original = connection.db.select.bind(connection.db);
    let selects = 0;
    let committed = false;
    // Commit on a separate WAL connection between row/count reads and revision read.
    const spy = vi.spyOn(connection.db, 'select').mockImplementation(((...args: Parameters<typeof original>) => {
      if (++selects === (kind === 'items' ? 3 : 2)) {
        createMenuService(writer).updateCategory(category.id, { expectedRevision: 1, archived: true });
        committed = true;
      }
      return original(...args);
    }) as typeof original);
    try {
      const snapshot = kind === 'items' ? listItems(connection, page) : kind === 'categories' ? listCategories(connection) : resolveItems(connection, [item.id]);
      expect(committed).toBe(true);
      expect(snapshot.menuRevision).toBe(2);
      if (kind === 'items') expect(snapshot).toMatchObject({ total: 1, items: [item] });
      else if (kind === 'categories') expect(snapshot).toMatchObject({ categories: [category] });
      else expect(snapshot).toMatchObject({ items: [{ state: 'available', item }] });
      spy.mockRestore();
      expect(readMenuRevision(connection)).toBe(3);
      expect(listItems(connection, page).total).toBe(0);
    } finally { spy.mockRestore(); writer.close(); }
  });

  it('does not mutate order revisions or create checkout/order records', () => {
    service.updateItem(item.id, { expectedRevision: 1, available: false });
    expect(connection.sqlite.prepare('SELECT orders_revision FROM app_state').get()).toEqual({ orders_revision: 0 });
    for (const table of ['checkout_quotes', 'orders', 'order_lines']) {
      expect(connection.sqlite.prepare(`SELECT count(*) AS count FROM ${table}`).get()).toEqual({ count: 0 });
    }
    expect(() => service.updateItem(item.id, { expectedRevision: 1, name: 'stale' })).toThrow(HttpError);
  });
});
