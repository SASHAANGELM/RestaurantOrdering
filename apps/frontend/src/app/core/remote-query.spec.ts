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
  afterEach(() => { try { http.verify(); } finally { TestBed.resetTestingModule(); } });
  function catalog(revision = 1, name = 'Soup') {
    http.expectOne('/api/menu/catalog').flush({ categories: [], items: page(revision, name).items, menuRevision: revision });
  }
  function loadedMenu() { const store = TestBed.inject(MenuStore); TestBed.tick(); catalog(); TestBed.tick(); return store; }
  it('searches, filters and paginates the complete local snapshot without HTTP', () => {
    const store = loadedMenu();
    store.setQuery({ page: 1, pageSize: 10, search: 'bread' }); TestBed.tick();
    expect(store.items.data()?.total).toBe(0); expect(store.categories.data()?.categories).toEqual([]);
    store.setQuery({ page: 3, pageSize: 10, search: 'soup' }); TestBed.tick();
    expect(store.items.data()?.items[0]?.name).toBe('Soup'); expect(store.items.data()?.page).toBe(1);
    http.expectNone(() => true);
  });
  it('rejects an obsolete catalog below the current revision and fetches a fresh snapshot', () => {
    const store = loadedMenu(); store.reload(); TestBed.tick(); const old = http.expectOne('/api/menu/catalog');
    sync.observe({ menuRevision: 2 }); old.flush({ categories: [], items: page(1, 'Obsolete').items, menuRevision: 1 });
    expect(store.items.data()?.items[0]?.name).toBe('Soup'); TestBed.tick(); catalog(2, 'Fresh'); TestBed.tick();
    expect(store.items.data()?.items[0]?.name).toBe('Fresh');
  });
  it('keeps local filters while newer revisions cancel in-flight catalog reads', () => {
    const store = TestBed.inject(MenuStore); TestBed.tick(); const old = http.expectOne('/api/menu/catalog');
    store.setQuery({ page: 1, pageSize: 50, search: 'new' }); sync.observe({ menuRevision: 2 }); TestBed.tick();
    expect(old.cancelled).toBe(true); catalog(2, 'New soup'); TestBed.tick(); expect(store.items.data()?.total).toBe(1);
  });
  it('ignores duplicate notifications and unrelated order revisions', () => {
    loadedMenu(); sync.observe({ menuRevision: 1, ordersRevision: 8 }); TestBed.tick(); http.expectNone(() => true);
  });
  it('retains content after failed refresh and repairs it after a successful same-revision check', () => {
    const store = loadedMenu(); store.reload(); TestBed.tick(); http.expectOne('/api/menu/catalog').error(new ProgressEvent('error'));
    expect(store.items.data()?.items[0]?.name).toBe('Soup');
    window.dispatchEvent(new Event('focus')); http.expectOne('/api/sync').flush({ menuRevision: 1, ordersRevision: 0 }); TestBed.tick();
    catalog(1, 'Restored'); TestBed.tick(); expect(store.catalog.error()).toBeNull();
  });
  it('repairs a missed broadcast from persisted revisions', () => {
    const store = loadedMenu(); window.dispatchEvent(new Event('focus'));
    http.expectOne('/api/sync').flush({ menuRevision: 4, ordersRevision: 0 }); TestBed.tick(); catalog(4, 'Missed change'); TestBed.tick();
    expect(store.items.data()?.items[0]?.name).toBe('Missed change');
  });
  it('cancels route catalog reads without changing app socket listeners', () => {
    const child = createEnvironmentInjector([MenuStore], TestBed.inject(EnvironmentInjector)); child.get(MenuStore); TestBed.tick();
    const pending = http.expectOne('/api/menu/catalog'); child.destroy(); expect(pending.cancelled).toBe(true);
    sync.observe({ menuRevision: 5 }); TestBed.tick(); http.expectNone(() => true); expect(socket.listenerCount).toBe(6);
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
