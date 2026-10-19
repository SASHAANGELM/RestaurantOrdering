import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RealtimeSync, SOCKET_FACTORY } from '../../core/realtime-sync';
import { FakeSocket } from '../../core/testing/fake-socket';
import { SetupStore } from '../setup/setup.store';
import { ItemDetailStore } from './item-detail.store';

const id = '11111111-1111-4111-8111-111111111111';
const categoryId = '22222222-2222-4222-8222-222222222222';
const otherId = '33333333-3333-4333-8333-333333333333';
const timestamp = '2026-10-19T12:00:00.000Z';
const category = { id: categoryId, name: 'Lunch', sortOrder: 0, revision: 1, createdAt: timestamp, updatedAt: timestamp, archivedAt: null };
const item = { id, categoryId, name: 'Soup', available: true, pricingMode: 'fixed', priceMinor: 500,
  revision: 1, createdAt: timestamp, updatedAt: timestamp, archivedAt: null };

describe('complete management catalog and item details', () => {
  let http: HttpTestingController;
  let sync: RealtimeSync;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), SetupStore, ItemDetailStore,
      { provide: SOCKET_FACTORY, useValue: () => new FakeSocket() }] });
    http = TestBed.inject(HttpTestingController); sync = TestBed.inject(RealtimeSync);
    http.expectOne('/api/sync').flush({ menuRevision: 1, ordersRevision: 0 });
  });
  afterEach(() => { try { http.verify(); } finally { TestBed.resetTestingModule(); } });
  const history = (itemId = id) => http.expectOne(request => request.url === '/api/orders' && request.params.get('itemId') === itemId);
  function loadItem(store: InstanceType<typeof ItemDetailStore>) {
    store.select(id); TestBed.tick();
    http.expectOne(`/api/items/${id}`).flush({ item, category, menuRevision: 1 });
    history().flush({ orders: [], total: 0, page: 1, pageSize: 10, ordersRevision: 0 }); TestBed.tick();
  }

  it('groups and pages more than 100 items locally, keeping search/category/archive changes off the network', () => {
    const store = TestBed.inject(SetupStore); TestBed.tick();
    const items = Array.from({ length: 120 }, (_, index) => ({ ...item, id: `11111111-1111-4111-8111-${String(index).padStart(12, '0')}`, name: `Soup ${index}` }));
    http.expectOne('/api/setup/catalog').flush({ categories: [category, { ...category, id: otherId, archivedAt: timestamp }],
      items: [...items, { ...item, id: otherId, available: false }, { ...item, id: categoryId, archivedAt: timestamp }], menuRevision: 1 }); TestBed.tick();
    expect(store.groups().map(group => group.total)).toEqual([120, 1, 1]);
    expect(store.groups()[0]?.items).toHaveLength(25); expect(store.visibleCategories()).toHaveLength(1);
    store.page('available', 12, 10); TestBed.tick();
    expect(store.groups()[0]?.items).toHaveLength(10); expect(store.groups()[0]?.page).toBe(12);
    store.setQuery({ ...store.query(), search: 'Soup 119', categoryId, includeArchived: true }); TestBed.tick();
    expect(store.groups()[0]?.items[0]?.name).toBe('Soup 119'); expect(store.groups()[0]?.page).toBe(1);
    expect(store.visibleCategories()).toHaveLength(2); http.expectNone(() => true);
    store.reload(); TestBed.tick(); const refreshed = http.expectOne('/api/setup/catalog');
    refreshed.error(new ProgressEvent('error'));
    expect(store.groups()[0]?.total).toBe(1); expect(store.query().search).toBe('Soup 119');
  });

  it('refreshes detail and related orders independently on their own revisions and retains details after a failed refresh', () => {
    const store = TestBed.inject(ItemDetailStore); loadItem(store);
    expect(store.current()?.item.name).toBe('Soup'); expect(store.related()?.total).toBe(0);
    sync.observe({ ordersRevision: 1 }); TestBed.tick();
    history().flush({ orders: [], total: 0, page: 1, pageSize: 10, ordersRevision: 1 });
    http.expectNone(`/api/items/${id}`);
    sync.observe({ menuRevision: 2 }); TestBed.tick();
    http.expectOne(`/api/items/${id}`).flush({ item: { ...item, name: 'Renamed', available: false, revision: 2 }, category, menuRevision: 2 }); TestBed.tick();
    expect(store.current()?.item.name).toBe('Renamed');
    store.detail.reload(); TestBed.tick(); http.expectOne(`/api/items/${id}`).error(new ProgressEvent('error'));
    expect(store.current()?.item.name).toBe('Renamed'); expect(store.detail.error()?.kind).toBe('network');
  });

  it('hides old details/history, cancels old route requests, and reports invalid or missing items', () => {
    const store = TestBed.inject(ItemDetailStore); loadItem(store);
    store.orderPage(2, 10); TestBed.tick(); const oldHistory = history();
    store.select(otherId); TestBed.tick();
    expect(oldHistory.cancelled).toBe(true); expect(store.current()).toBeNull(); expect(store.related()).toBeNull();
    const oldDetail = http.expectOne(`/api/items/${otherId}`); const newHistory = history(otherId);
    store.select('invalid'); TestBed.tick();
    expect(oldDetail.cancelled).toBe(true); expect(newHistory.cancelled).toBe(true);
    expect(store.detail.error()?.kind).toBe('invalid-request'); http.expectNone(() => true);
    store.select(id); TestBed.tick();
    http.expectOne(`/api/items/${id}`).flush({ error: { code: 'NOT_FOUND', message: 'The item was not found.', requestId: categoryId,
      details: { resourceType: 'item', resourceId: id } } }, { status: 404, statusText: 'Not Found' });
    TestBed.tick();
    expect(store.current()).toBeNull(); expect(store.detail.error()?.body?.code).toBe('NOT_FOUND');
  });
});
