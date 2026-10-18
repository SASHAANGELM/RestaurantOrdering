import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { createEnvironmentInjector, EnvironmentInjector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MenuStore } from '../features/menu/menu.store';
import { SetupStore } from '../features/setup/setup.store';
import { OrderDetailStore, OrdersStore } from '../features/orders/orders.store';
import { RealtimeSync, SOCKET_FACTORY } from './realtime-sync';
import { FakeSocket } from './testing/fake-socket';

const id = '11111111-1111-4111-8111-111111111111';
const secondId = '22222222-2222-4222-8222-222222222222';
const timestamp = '2026-10-18T12:00:00.000Z';
function page(menuRevision: number, name = 'Soup') {
  return { items: [{ id, categoryId: secondId, name, available: true, pricingMode: 'fixed', priceMinor: 500,
    revision: 1, createdAt: timestamp, updatedAt: timestamp, archivedAt: null }],
  total: 1, page: 1, pageSize: 50, menuRevision };
}

// These tests drive real SignalStores, HttpClient cancellation and the root revision service together.
describe('feature query and revision ordering', () => {
  let http: HttpTestingController;
  let socket: FakeSocket;
  let sync: RealtimeSync;
  beforeEach(() => {
    socket = new FakeSocket();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(),
      MenuStore, SetupStore, OrdersStore, OrderDetailStore, { provide: SOCKET_FACTORY, useValue: () => socket }] });
    http = TestBed.inject(HttpTestingController);
    sync = TestBed.inject(RealtimeSync);
    http.expectOne('/api/sync').flush({ menuRevision: 1, ordersRevision: 0 });
  });
  afterEach(() => { http.verify(); TestBed.resetTestingModule(); });
  function items() { return http.expectOne((request) => request.url === '/api/menu/items'); }
  function categories(revision = 1) {
    http.expectOne('/api/menu/categories').flush({ categories: [], menuRevision: revision });
  }
  function loadedMenu() {
    const store = TestBed.inject(MenuStore);
    TestBed.tick(); categories(); items().flush(page(1)); TestBed.tick();
    return store;
  }

  it('cancels superseded queries and retains the previous data until the new page succeeds', () => {
    const store = loadedMenu();
    store.setQuery({ page: 1, pageSize: 50, search: 'a' }); TestBed.tick();
    const older = items();
    store.setQuery({ page: 1, pageSize: 50, search: 'b' }); TestBed.tick();
    expect(older.cancelled).toBe(true);
    expect(store.items.data()?.items[0]?.name).toBe('Soup');
    expect(store.items.stale()).toBe(true);
    const latest = items();
    expect(latest.request.params.get('search')).toBe('b');
    latest.flush(page(1, 'Bread')); TestBed.tick();
    expect(store.items.data()?.items[0]?.name).toBe('Bread');
    expect(store.items.stale()).toBe(false);
    expect(store.items.loading()).toBe(false);
  });

  it('rejects a late result even before the query-change effect gets a chance to cancel it', () => {
    const store = TestBed.inject(MenuStore); TestBed.tick(); categories();
    const old = items();
    store.setQuery({ page: 1, pageSize: 50, search: 'bread' });
    old.flush(page(1, 'Obsolete'));
    expect(store.items.data()).toBeNull();
    TestBed.tick(); items().flush(page(1, 'Bread')); TestBed.tick();
    expect(store.items.data()?.items[0]?.name).toBe('Bread');
  });

  it('rejects a response below an event revision and refetches authoritative content', () => {
    const store = loadedMenu();
    store.items.reload(); TestBed.tick(); const old = items();
    sync.observe({ menuRevision: 2 });
    old.flush(page(1, 'Obsolete'));
    expect(store.items.data()?.items[0]?.name).toBe('Soup');
    expect(store.items.stale()).toBe(true);
    TestBed.tick(); categories(2); items().flush(page(2, 'New soup')); TestBed.tick();
    expect(store.items.data()?.items[0]?.name).toBe('New soup');
    expect(store.items.stale()).toBe(false);
  });

  it('cancels requests when a newer revision invalidates them', () => {
    const store = TestBed.inject(MenuStore); TestBed.tick();
    const old = items(); const oldCategories = http.expectOne('/api/menu/categories');
    sync.observe({ menuRevision: 2 }); TestBed.tick();
    expect(old.cancelled).toBe(true);
    expect(oldCategories.cancelled).toBe(true);
    categories(2); items().flush(page(2)); TestBed.tick();
    expect(store.items.data()?.menuRevision).toBe(2);
  });

  it('ignores duplicate/older notifications and unrelated order-stream revisions', () => {
    loadedMenu();
    const event = { eventId: id, entityId: id, entityType: 'item', change: 'updated', menuRevision: 1 };
    socket.receive('menu.changed', event);
    socket.receive('menu.changed', event);
    sync.observe({ ordersRevision: 8 }); TestBed.tick();
    http.expectNone(() => true);
    expect(sync.highest()).toEqual({ menuRevision: 1, ordersRevision: 8 });
  });

  it('HTTP snapshots advance the watermark and repair other older feature resources', () => {
    const store = loadedMenu();
    store.categories.reload(); TestBed.tick(); categories(3); TestBed.tick();
    expect(store.items.stale()).toBe(true);
    items().flush(page(3, 'Fresh')); TestBed.tick();
    expect(sync.highest().menuRevision).toBe(3);
    expect(store.items.data()?.items[0]?.name).toBe('Fresh');
    http.expectNone(() => true);
  });

  it('retains cached content on disconnect/errors and retries after a successful focus sync at the same revision', () => {
    const store = loadedMenu();
    socket.receive('disconnect');
    store.items.reload(); TestBed.tick(); items().error(new ProgressEvent('error'));
    expect(store.items.data()?.items[0]?.name).toBe('Soup');
    expect(store.items.error()?.kind).toBe('network');
    expect(store.items.loading()).toBe(false);
    window.dispatchEvent(new Event('focus'));
    http.expectOne('/api/sync').flush({ menuRevision: 1, ordersRevision: 0 }); TestBed.tick();
    items().flush(page(1, 'Restored')); TestBed.tick();
    expect(store.items.error()).toBeNull();
    expect(store.items.data()?.items[0]?.name).toBe('Restored');
  });

  it('repairs a missed broadcast using the persisted sync revisions', () => {
    const store = loadedMenu();
    // No menu.changed event is delivered.
    window.dispatchEvent(new Event('focus'));
    http.expectOne('/api/sync').flush({ menuRevision: 4, ordersRevision: 0 }); TestBed.tick();
    categories(4); items().flush(page(4, 'Missed change')); TestBed.tick();
    expect(store.items.data()?.items[0]?.name).toBe('Missed change');
  });

  it('tears down route-owned HTTP/effects without creating or removing app socket listeners', () => {
    const child = createEnvironmentInjector([MenuStore], TestBed.inject(EnvironmentInjector));
    child.get(MenuStore); TestBed.tick();
    const pendingItems = items(); const pendingCategories = http.expectOne('/api/menu/categories');
    child.destroy();
    expect(pendingItems.cancelled).toBe(true);
    expect(pendingCategories.cancelled).toBe(true);
    sync.observe({ menuRevision: 5 }); TestBed.tick();
    http.expectNone(() => true);
    expect(socket.connects).toBe(1);
    expect(socket.listenerCount).toBe(6);
  });

  it('keeps Setup queries and archived visibility together', () => {
    const store = TestBed.inject(SetupStore); TestBed.tick();
    const oldItems = http.expectOne((r) => r.url === '/api/setup/items');
    const oldCategories = http.expectOne((r) => r.url === '/api/setup/categories');
    store.setQuery({ page: 2, pageSize: 25, includeArchived: true }); TestBed.tick();
    expect(oldItems.cancelled).toBe(true); expect(oldCategories.cancelled).toBe(true);
    const current = http.expectOne((r) => r.url === '/api/setup/items');
    expect(current.request.params.get('includeArchived')).toBe('true');
    expect(current.request.params.get('page')).toBe('2');
    http.expectOne('/api/setup/categories?includeArchived=true').flush({ categories: [], menuRevision: 1 });
    current.flush({ items: [], total: 0, page: 2, pageSize: 25, menuRevision: 1 }); TestBed.tick();
    expect(store.items.data()?.page).toBe(2);
  });

  it('cancels old order filters and refreshes membership/counts on order revisions', () => {
    const store = TestBed.inject(OrdersStore); TestBed.tick();
    const old = http.expectOne((r) => r.url === '/api/orders');
    store.setQuery({ page: 1, pageSize: 50, status: 'ready' }); TestBed.tick();
    expect(old.cancelled).toBe(true);
    http.expectOne('/api/orders?page=1&pageSize=50&status=ready').flush({ orders: [], total: 0, page: 1, pageSize: 50, ordersRevision: 0 }); TestBed.tick();
    sync.observe({ ordersRevision: 2 }); TestBed.tick();
    http.expectOne('/api/orders?page=1&pageSize=50&status=ready').flush({ orders: [], total: 0, page: 1, pageSize: 50, ordersRevision: 2 }); TestBed.tick();
    expect(store.orders.data()?.ordersRevision).toBe(2);
    expect(store.orders.data()?.total).toBe(0);
  });

  it('cancels old detail IDs and exposes malformed IDs as recoverable errors', () => {
    const store = TestBed.inject(OrderDetailStore);
    store.select(id); TestBed.tick(); const old = http.expectOne(`/api/orders/${id}`);
    store.select(secondId); TestBed.tick(); const newer = http.expectOne(`/api/orders/${secondId}`);
    expect(old.cancelled).toBe(true);
    store.select('invalid'); TestBed.tick();
    expect(newer.cancelled).toBe(true);
    expect(store.detail.error()?.kind).toBe('invalid-request');
    expect(store.detail.loading()).toBe(false);
    http.expectNone(() => true);
  });
});
