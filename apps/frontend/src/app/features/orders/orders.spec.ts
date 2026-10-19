import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { createEnvironmentInjector, EnvironmentInjector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, Subject } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type OrderResponse, type OrderStatus, type OrdersResponse } from '@restaurant-ordering/contracts';
import { RealtimeSync, SOCKET_FACTORY } from '../../core/realtime-sync';
import { FakeSocket } from '../../core/testing/fake-socket';
import { OrderDetailPage } from './order-detail.page';
import { OrderDetailStore, OrdersStore } from './orders.store';
import { OrderStatusControl } from './order-status-control';

const id = '11111111-1111-4111-8111-111111111111';
const otherId = '22222222-2222-4222-8222-222222222222';
const timestamp = '2026-10-18T12:00:00.000Z';
function detail(status: OrderStatus = 'placed', revision = 1, ordersRevision = revision): OrderResponse {
  return { ordersRevision, order: { id, quoteId: otherId, status, revision, createdAt: timestamp, updatedAt: timestamp,
    currency: 'USD', subtotalMinor: 1500, discountMinor: 100, totalMinor: 1400, lines: [
      { id: otherId, itemId: otherId, categoryId: otherId, categoryName: 'Lunch', itemName: 'Original soup',
        itemRevision: 1, pricingMode: 'open', unitPriceMinor: 750, quantity: 2, lineTotalMinor: 1500 }
    ] } };
}
function page(status: OrderStatus | null, revision: number, pageNumber = 1): OrdersResponse {
  const order = detail(status ?? 'placed').order;
  const summary = { id: order.id, quoteId: order.quoteId, status: order.status, revision: order.revision,
    createdAt: order.createdAt, updatedAt: order.updatedAt, currency: order.currency,
    subtotalMinor: order.subtotalMinor, discountMinor: order.discountMinor, totalMinor: order.totalMinor };
  return { orders: status ? [summary] : [],
    total: status ? 1 : 0, page: pageNumber, pageSize: 50, ordersRevision: revision };
}

describe('Orders staff workflows', () => {
  let confirmation: Subject<boolean>;
  let routeParams: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let http: HttpTestingController;
  let socket: FakeSocket;
  let sync: RealtimeSync;
  beforeEach(() => {
    socket = new FakeSocket(); confirmation = new Subject<boolean>();
    routeParams = new BehaviorSubject(convertToParamMap({ id }));
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
      OrdersStore, OrderDetailStore, { provide: SOCKET_FACTORY, useValue: () => socket },
      { provide: MatDialog, useValue: { open: () => ({ afterClosed: () => confirmation }) } },
      { provide: ActivatedRoute, useValue: { paramMap: routeParams } }] });
    http = TestBed.inject(HttpTestingController); sync = TestBed.inject(RealtimeSync);
    http.expectOne('/api/sync').flush({ menuRevision: 0, ordersRevision: 0 });
  });
  afterEach(() => { http.verify(); TestBed.resetTestingModule(); });
  function loaded(status: OrderStatus = 'placed') {
    const store = TestBed.inject(OrderDetailStore); store.select(id); TestBed.tick();
    http.expectOne(`/api/orders/${id}`).flush(detail(status)); TestBed.tick(); return store;
  }
  function notification(revision: number) {
    socket.receive('orders.changed', { eventId: otherId, ordersRevision: revision, orderId: id, orderRevision: revision, change: 'status-changed' });
    TestBed.tick();
  }
  function conflict() {
    http.expectOne(`/api/orders/${id}/status`).flush({ error: { code: 'REVISION_CONFLICT', requestId: otherId, message: 'Changed',
      details: { entityType: 'order', entityId: id, expectedRevision: 1, currentRevision: 2 }
    } }, { status: 409, statusText: 'Conflict' });
  }

  it.each([
    ['placed', ['Start preparing', 'Cancel order']], ['preparing', ['Mark ready', 'Cancel order']],
    ['ready', ['Complete order']], ['completed', []], ['cancelled', []]
  ] as const)('shows only permitted controls for %s and full immutable totals', (status, labels) => {
    const fixture = TestBed.createComponent(OrderDetailPage); fixture.detectChanges(); TestBed.tick();
    http.expectOne(`/api/orders/${id}`).flush(detail(status)); TestBed.tick(); fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    const buttons = [...root.querySelectorAll('section button')].map((button) => button.textContent?.trim());
    expect(buttons).toEqual(labels);
    expect(root.textContent).toContain('Original soup'); expect(root.textContent).toContain('Lunch');
    expect(root.textContent).toContain('Quantity: 2 × $7.50'); expect(root.textContent).toContain('$15.00');
    expect(root.textContent).toContain('−$1.00'); expect(root.querySelector('dl')?.textContent).toContain('$14.00');
  });

  it('updates status inline once, requires explicit recovery after a conflict, and uses the recovered revision', () => {
    const fixture = TestBed.createComponent(OrderStatusControl); fixture.componentRef.setInput('order', detail().order); fixture.detectChanges();
    const select: HTMLSelectElement = fixture.nativeElement.querySelector('select');
    expect([...select.options].map(option => option.value)).toEqual(['placed', 'preparing', 'cancelled']);
    select.value = 'preparing'; select.dispatchEvent(new Event('change'));
    select.value = 'preparing'; select.dispatchEvent(new Event('change'));
    const request = http.expectOne(`/api/orders/${id}/status`); expect(request.request.body).toEqual({ expectedRevision: 1, status: 'preparing' });
    request.flush({ error: { code: 'REVISION_CONFLICT', requestId: otherId, message: 'Changed',
      details: { entityType: 'order', entityId: id, expectedRevision: 1, currentRevision: 2 } } }, { status: 409, statusText: 'Conflict' });
    fixture.componentRef.setInput('order', detail('preparing', 2).order); fixture.detectChanges();
    expect(select.disabled).toBe(true);
    fixture.componentInstance.refreshStatus(); http.expectOne(`/api/orders/${id}`).flush(detail('preparing', 2)); fixture.detectChanges();
    expect(select.disabled).toBe(false); select.value = 'ready'; select.dispatchEvent(new Event('change'));
    const retry = http.expectOne(`/api/orders/${id}/status`); expect(retry.request.body).toEqual({ expectedRevision: 2, status: 'ready' });
    retry.flush(detail('ready', 3)); expect(fixture.componentInstance.current().status).toBe('ready');
  });

  it('confirms inline cancellation, disables terminal dropdowns, and never applies an older mutation over a live update', () => {
    const fixture = TestBed.createComponent(OrderStatusControl); fixture.componentRef.setInput('order', detail().order); fixture.detectChanges();
    const select: HTMLSelectElement = fixture.nativeElement.querySelector('select'); select.value = 'cancelled'; select.dispatchEvent(new Event('change'));
    http.expectNone(`/api/orders/${id}/status`); confirmation.next(true);
    const request = http.expectOne(`/api/orders/${id}/status`);
    fixture.componentRef.setInput('order', detail('completed', 4).order); fixture.detectChanges();
    expect(select.value).toBe('completed');
    request.flush(detail('cancelled', 2)); fixture.detectChanges();
    expect(fixture.componentInstance.current().status).toBe('completed'); expect(select.disabled).toBe(true); expect(select.value).toBe('completed');
  });

  it('cannot confirm cancellation against a different order after the route changes', () => {
    const fixture = TestBed.createComponent(OrderDetailPage); fixture.detectChanges(); TestBed.tick();
    http.expectOne(`/api/orders/${id}`).flush(detail()); TestBed.tick();
    fixture.componentInstance.transition('cancelled');
    http.expectNone(request => request.method === 'PATCH');
    routeParams.next(convertToParamMap({ id: otherId })); TestBed.tick();
    const other = detail(); other.order.id = otherId;
    http.expectOne(`/api/orders/${otherId}`).flush(other); TestBed.tick();
    confirmation.next(true);
    http.expectNone(request => request.method === 'PATCH');
  });

  it('sends the displayed entity revision, blocks duplicate/invalid actions, and waits for fresh detail after success', () => {
    const store = loaded(); store.transition('ready'); http.expectNone((r) => r.method === 'PATCH');
    store.transition('preparing'); store.transition('preparing'); store.transition('cancelled');
    const write = http.expectOne(`/api/orders/${id}/status`);
    expect(write.request.body).toEqual({ status: 'preparing', expectedRevision: 1 });
    write.flush(detail('preparing', 2));
    expect(store.canAct()).toBe(false); store.transition('cancelled'); http.expectNone((r) => r.method === 'PATCH');
    TestBed.tick(); http.expectOne(`/api/orders/${id}`).flush(detail('preparing', 2)); TestBed.tick();
    expect(store.canAct()).toBe(true); store.transition('ready');
    const next = http.expectOne(`/api/orders/${id}/status`); expect(next.request.body.expectedRevision).toBe(2);
    next.flush(detail('ready', 3)); TestBed.tick(); http.expectOne(`/api/orders/${id}`).flush(detail('ready', 3)); TestBed.tick();
  });

  it('preserves a stale staff action and details through failed refresh, requiring a successful read before another write', () => {
    const store = loaded(); store.transition('cancelled'); conflict(); TestBed.tick();
    expect(store.current()?.lines[0]?.itemName).toBe('Original soup'); expect(store.attemptedStatus()).toBe('cancelled');
    expect(store.actionError()?.body?.code).toBe('REVISION_CONFLICT'); expect(store.needsRefresh()).toBe(true);
    store.transition('preparing'); http.expectNone((r) => r.method === 'PATCH');
    store.reload(); TestBed.tick(); http.expectOne(`/api/orders/${id}`).error(new ProgressEvent('error')); TestBed.tick();
    expect(store.canAct()).toBe(false); expect(store.actionError()?.body?.code).toBe('REVISION_CONFLICT');
    store.reload(); TestBed.tick(); http.expectOne(`/api/orders/${id}`).flush(detail('ready', 3)); TestBed.tick();
    expect(store.transitions()).toEqual(['completed']); expect(store.canAct()).toBe(true); expect(store.needsRefresh()).toBe(false);
  });

  it('keeps recovery explicit when a realtime read finishes after a conflict response', () => {
    const store = loaded(); store.transition('cancelled');
    notification(2); const background = http.expectOne(`/api/orders/${id}`);
    conflict(); background.flush(detail('preparing', 2)); TestBed.tick();
    expect(store.current()?.status).toBe('preparing'); expect(store.needsRefresh()).toBe(true);
    expect(store.canAct()).toBe(false); store.transition('ready'); http.expectNone((r) => r.method === 'PATCH');
    store.reload(); TestBed.tick(); http.expectOne(`/api/orders/${id}`).flush(detail('preparing', 2)); TestBed.tick();
    expect(store.canAct()).toBe(true);
  });

  it('does not automatically retry an uncertain write; refresh reveals the committed status', () => {
    const store = loaded(); store.transition('preparing');
    http.expectOne(`/api/orders/${id}/status`).error(new ProgressEvent('error')); TestBed.tick();
    expect(store.canAct()).toBe(false); expect(store.current()?.status).toBe('placed');
    window.dispatchEvent(new Event('focus')); http.expectOne('/api/sync').flush({ menuRevision: 0, ordersRevision: 1 }); TestBed.tick();
    http.expectNone((r) => r.method === 'PATCH'); expect(store.canAct()).toBe(false);
    store.reload(); TestBed.tick(); http.expectOne(`/api/orders/${id}`).flush(detail('preparing', 2)); TestBed.tick();
    expect(store.current()?.status).toBe('preparing'); expect(store.canAct()).toBe(true);
  });

  it('does not replace a newer terminal snapshot with a late mutation response', () => {
    const store = loaded(); store.transition('preparing'); const write = http.expectOne(`/api/orders/${id}/status`);
    notification(4); http.expectOne(`/api/orders/${id}`).flush(detail('completed', 4)); TestBed.tick();
    write.flush(detail('preparing', 2)); expect(sync.highest().ordersRevision).toBe(4);
    expect(store.current()?.status).toBe('completed'); TestBed.tick();
    http.expectOne(`/api/orders/${id}`).flush(detail('completed', 4)); TestBed.tick();
    expect(store.transitions()).toEqual([]); expect(store.current()?.status).toBe('completed');
  });

  it('updates filtered membership and totals, ignores duplicate events, and repairs an omitted event on reconnect', () => {
    const store = TestBed.inject(OrdersStore); store.filter('ready'); TestBed.tick();
    const url = '/api/orders?page=1&pageSize=50&status=ready';
    http.expectOne(url).flush(page(null, 0)); TestBed.tick();
    notification(2); http.expectOne(url).flush(page('ready', 2)); TestBed.tick();
    expect(store.orders.data()?.total).toBe(1);
    notification(2); http.expectNone(url);
    notification(3); http.expectOne(url).flush(page(null, 3)); TestBed.tick(); expect(store.orders.data()?.orders).toEqual([]);
    socket.receive('disconnect'); socket.receive('connect');
    http.expectOne('/api/sync').flush({ menuRevision: 0, ordersRevision: 4 }); TestBed.tick();
    http.expectOne(url).flush(page('ready', 4)); TestBed.tick();
    expect(store.orders.data()?.orders.map((order) => order.id)).toEqual([id]); expect(store.orders.data()?.total).toBe(1);
  });

  it('keeps pagination with its filter and resets to page one on filter changes', () => {
    const store = TestBed.inject(OrdersStore); store.filter('ready'); store.page(3, 10); TestBed.tick();
    http.expectOne('/api/orders?page=3&pageSize=10&status=ready').flush({ ...page(null, 0, 3), pageSize: 10 }); TestBed.tick();
    store.filter('cancelled'); TestBed.tick();
    http.expectOne('/api/orders?page=1&pageSize=10&status=cancelled').flush({ ...page(null, 0), pageSize: 10 }); TestBed.tick();
    expect(store.query()).toEqual({ page: 1, pageSize: 10, status: 'cancelled' });
    store.filter(); TestBed.tick(); http.expectOne('/api/orders?page=1&pageSize=10').flush({ ...page(null, 0), pageSize: 10 }); TestBed.tick();
  });

  it('hides previous order context and cancels pending writes when the selected ID changes', () => {
    const store = loaded(); store.transition('preparing'); const write = http.expectOne(`/api/orders/${id}/status`);
    store.select(otherId); expect(write.cancelled).toBe(true); expect(store.current()).toBeNull(); expect(store.busy()).toBe(false);
    TestBed.tick(); http.expectOne(`/api/orders/${otherId}`).flush({ ...detail(), order: { ...detail().order, id: otherId } }); TestBed.tick();
    expect(store.current()?.id).toBe(otherId); expect(store.actionError()).toBeNull();
  });

  it('cancels an in-flight mutation on route-store destruction', () => {
    const child = createEnvironmentInjector([OrderDetailStore], TestBed.inject(EnvironmentInjector));
    const store = child.get(OrderDetailStore); store.select(id); TestBed.tick(); http.expectOne(`/api/orders/${id}`).flush(detail()); TestBed.tick();
    store.transition('cancelled'); const write = http.expectOne(`/api/orders/${id}/status`); child.destroy();
    expect(write.cancelled).toBe(true); expect(socket.connects).toBe(1);
  });
});
