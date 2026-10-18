import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApiErrorBody, MenuItem, OrderResponse, QuoteResponse } from '@restaurant-ordering/contracts';
import { RealtimeSync } from '../../core/realtime-sync';
import { CART_STORAGE_KEY } from '../menu/cart.model';
import { CART_STORAGE, CartStore } from '../menu/cart.store';
import { ATTEMPT_STORAGE_KEY, attemptSchema, CheckoutStore } from './checkout.store';

const itemId = '11111111-1111-4111-8111-111111111111';
const categoryId = '22222222-2222-4222-8222-222222222222';
const quoteId = '33333333-3333-4333-8333-333333333333';
const orderId = '44444444-4444-4444-8444-444444444444';
const requestId = '55555555-5555-4555-8555-555555555555';
const timestamp = '2026-10-18T12:00:00.000Z';
const item: MenuItem = { id: itemId, categoryId, name: 'Soup', pricingMode: 'fixed', priceMinor: 100,
  available: true, revision: 1, createdAt: timestamp, updatedAt: timestamp, archivedAt: null };
function quote(overrides: Partial<QuoteResponse> = {}): QuoteResponse {
  return { quoteId, createdAt: timestamp, expiresAt: '2026-10-18T12:05:00.000Z', menuRevision: 1,
    lines: [{ itemId, categoryId, itemName: 'Soup', categoryName: 'Lunch', itemRevision: 1,
      pricingMode: 'fixed', unitPriceMinor: 100, quantity: 1, lineTotalMinor: 100 }],
    subtotalMinor: 100, discountMinor: 0, totalMinor: 100, currency: 'USD', changes: [], ...overrides };
}
function order(): OrderResponse {
  const q = quote();
  return { ordersRevision: 1, order: { id: orderId, quoteId, status: 'placed', revision: 1, createdAt: timestamp, updatedAt: timestamp,
    lines: q.lines.map((line) => ({ ...line, id: requestId })), subtotalMinor: 100, discountMinor: 0, totalMinor: 100, currency: 'USD' } };
}

describe('explicit quote review and frozen checkout recovery', () => {
  let http: HttpTestingController;
  let saved: Map<string, string>;
  let failWrite = false;
  let failRemove = false;
  const revisions = signal({ menuRevision: 1, ordersRevision: 0 });
  const checks = signal(0);
  const syncing = signal(false);
  const syncError = signal<unknown>(null);
  const navigate = vi.fn().mockResolvedValue(true);
  function setup(records = new Map<string, string>(), unreadable = false) {
    vi.useFakeTimers(); vi.setSystemTime(new Date(timestamp));
    saved = records; failWrite = false; failRemove = false;
    revisions.set({ menuRevision: 1, ordersRevision: 0 }); checks.set(0); syncing.set(false); syncError.set(null); navigate.mockClear();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(),
      { provide: Router, useValue: { navigate } },
      { provide: CART_STORAGE, useValue: () => ({ getItem: (key: string) => { if (unreadable) throw Error('Denied'); return saved.get(key) ?? null; },
        setItem: (key: string, value: string) => { if (failWrite) throw Error('Quota'); saved.set(key, value); },
        removeItem: (key: string) => { if (failRemove) throw Error('Denied'); saved.delete(key); } }) },
      { provide: RealtimeSync, useValue: { highest: revisions, successfulChecks: checks, syncing, error: syncError,
        observe: (value: Partial<{ menuRevision: number; ordersRevision: number }>) => revisions.update((s) => ({
          menuRevision: Math.max(s.menuRevision, value.menuRevision ?? 0), ordersRevision: Math.max(s.ordersRevision, value.ordersRevision ?? 0) })) } }
    ] });
    http = TestBed.inject(HttpTestingController);
    const checkout = TestBed.inject(CheckoutStore);
    return { checkout, cart: TestBed.inject(CartStore) };
  }
  function tick() {
    TestBed.tick();
    for (const request of http.match('/api/menu/resolve')) request.flush({ items: [], menuRevision: revisions().menuRevision });
    TestBed.tick();
  }
  function reviewed() {
    const state = setup(); state.cart.add(item, '1'); tick();
    state.checkout.review(); http.expectOne('/api/checkout/quotes').flush(quote()); tick();
    return state;
  }
  function reject(url: string, body: { code: ApiErrorBody['code']; details?: unknown }, status = 409) {
    http.expectOne(url).flush({ error: { ...body, requestId, message: 'Rejected' } }, { status, statusText: 'Rejected' });
    tick();
  }
  afterEach(() => { http.verify(); TestBed.resetTestingModule(); vi.useRealTimers(); });

  it('sends observed values and exact open prices, preserving separate lines, discounts and zero totals', () => {
    const { checkout, cart } = setup();
    cart.add(item, '1'); cart.add({ ...item, pricingMode: 'open', priceMinor: null }, '2', '0.25');
    cart.add({ ...item, pricingMode: 'open', priceMinor: null }, '1', '0.50'); cart.discount('2.00'); tick();
    checkout.review();
    const request = http.expectOne('/api/checkout/quotes');
    expect(request.request.body).toEqual({ discountMinor: 200, lines: [
      { itemId, quantity: 1, observedRevision: 1, observedUnitPriceMinor: 100, observedName: 'Soup' },
      { itemId, quantity: 2, openPriceMinor: 25, observedRevision: 1, observedUnitPriceMinor: 25, observedName: 'Soup' },
      { itemId, quantity: 1, openPriceMinor: 50, observedRevision: 1, observedUnitPriceMinor: 50, observedName: 'Soup' }
    ] });
    request.flush(quote()); tick(); http.expectNone('/api/orders');
  });

  it('requires review, persists the exact key/payload before POST and prevents double clicks and pending edits', () => {
    const { checkout, cart } = reviewed();
    checkout.confirm(); checkout.confirm(); checkout.review(); checkout.retry();
    const request = http.expectOne('/api/orders');
    const attempt = attemptSchema.parse(JSON.parse(saved.get(ATTEMPT_STORAGE_KEY)!));
    expect(request.request.body).toEqual(attempt.payload);
    expect(request.request.headers.get('Idempotency-Key')).toBe(attempt.key);
    const original = cart.lines();
    cart.edit(original[0]!.id, 'quantityText', '2'); cart.discount('0.50'); cart.remove(original[0]!.id);
    expect(cart.add(item, '1')).toContain('pending checkout'); expect(cart.lines()).toEqual(original); expect(cart.discountText()).toBe('0.00');
    request.flush(order()); tick();
    expect(cart.lines()).toEqual([]); expect(saved.has(ATTEMPT_STORAGE_KEY)).toBe(false);
    expect(JSON.parse(saved.get(CART_STORAGE_KEY)!).lines).toEqual([]);
    expect(navigate).toHaveBeenCalledExactlyOnceWith(['/orders', orderId]);
  });

  it.each(['quantity', 'discount', 'remove', 'add', 'menu', 'expiry'] as const)('invalidates an already reviewed quote on %s', (change) => {
    const { checkout, cart } = reviewed();
    if (change === 'quantity') cart.edit(cart.lines()[0]!.id, 'quantityText', '2');
    if (change === 'discount') cart.discount('0.10');
    if (change === 'remove') cart.remove(cart.lines()[0]!.id);
    if (change === 'add') cart.add(item, '1');
    if (change === 'menu') revisions.set({ menuRevision: 2, ordersRevision: 0 });
    if (change === 'expiry') vi.advanceTimersByTime(300_000);
    checkout.confirm(); tick(); expect(checkout.quote()).toBeNull();
    expect(checkout.message()).toContain('Review'); http.expectNone('/api/orders');
  });

  it('invalidates a quote even if an edit is immediately reverted before effects run', () => {
    const { checkout, cart } = reviewed();
    cart.discount('0.50'); cart.discount('0.00'); checkout.confirm(); tick();
    expect(checkout.quote()).toBeNull(); http.expectNone('/api/orders');
  });

  it('checks expiry at click time even before the next timer tick', () => {
    const { checkout } = reviewed(); vi.setSystemTime(new Date('2026-10-18T12:05:00.001Z'));
    checkout.confirm(); expect(checkout.attempt()).toBeNull(); http.expectNone('/api/orders');
  });

  it.each(['cart', 'menu'] as const)('discards a late quote response after a %s change', (change) => {
    const { checkout, cart } = setup(); cart.add(item, '1'); tick(); checkout.review(); checkout.review();
    if (change === 'cart') cart.discount('0.25'); else revisions.set({ menuRevision: 2, ordersRevision: 0 });
    http.expectOne('/api/checkout/quotes').flush(quote()); tick();
    expect(checkout.quote()).toBeNull(); expect(checkout.message()).toContain('Review again');
  });

  it('keeps transport failures pending, treats 404 lookup as unresolved and retries only the original key and body', () => {
    const { checkout, cart } = reviewed(); checkout.confirm();
    const first = http.expectOne('/api/orders'); const key = first.request.headers.get('Idempotency-Key'); const payload = first.request.body;
    first.error(new ProgressEvent('error')); tick();
    checkout.lookup(); reject(`/api/orders/by-request/${key}`, { code: 'NOT_FOUND', details: { resourceType: 'request', resourceId: key! } }, 404);
    expect(checkout.attempt()?.key).toBe(key); expect(cart.checkoutLocked()).toBe(true); expect(checkout.canReview()).toBe(false);
    checks.update((n) => n + 1); tick(); http.expectNone('/api/orders');
    checkout.retry(); const retry = http.expectOne('/api/orders');
    expect(retry.request.body).toEqual(payload); expect(retry.request.headers.get('Idempotency-Key')).toBe(key);
    retry.flush(order()); tick(); expect(navigate).toHaveBeenCalledWith(['/orders', orderId]);
  });

  it('restores a pending attempt after reload and does only a key lookup before explicit same-key retry', () => {
    const { checkout } = reviewed(); checkout.confirm();
    const first = http.expectOne('/api/orders'); const key = checkout.attempt()!.key;
    first.error(new ProgressEvent('error')); tick();
    const records = new Map(saved); http.verify(); TestBed.resetTestingModule();
    const restored = setup(records);
    expect(restored.cart.checkoutLocked()).toBe(true); http.expectNone('/api/orders');
    reject(`/api/orders/by-request/${key}`, { code: 'NOT_FOUND', details: { resourceType: 'request', resourceId: key } }, 404);
    expect(restored.checkout.attempt()?.key).toBe(key); restored.checkout.retry();
    const retry = http.expectOne('/api/orders'); expect(retry.request.headers.get('Idempotency-Key')).toBe(key);
    retry.flush(order()); tick(); expect(restored.cart.lines()).toEqual([]);
  });

  it('recovers a committed order by key after reload without resubmission', () => {
    const { checkout } = reviewed(); checkout.confirm(); const key = checkout.attempt()!.key;
    http.expectOne('/api/orders').error(new ProgressEvent('error')); tick();
    const records = new Map(saved); http.verify(); TestBed.resetTestingModule();
    const { checkout: restored, cart } = setup(records);
    http.expectOne(`/api/orders/by-request/${key}`).flush(order()); tick();
    expect(restored.attempt()).toBeNull(); expect(cart.lines()).toEqual([]); http.expectNone('/api/orders');
    expect(navigate).toHaveBeenCalledExactlyOnceWith(['/orders', orderId]);
  });

  it.each(['MENU_CHANGED', 'QUOTE_EXPIRED', 'CART_INVALID', 'VALIDATION_ERROR'] as const)('restores an editable retained cart after definite %s rejection', (code) => {
    const { checkout, cart } = reviewed(); checkout.confirm();
    const details = code === 'MENU_CHANGED' ? { quoteId, quotedMenuRevision: 1, currentMenuRevision: 2 }
      : code === 'QUOTE_EXPIRED' ? { quoteId, expiresAt: quote().expiresAt }
      : code === 'CART_INVALID' ? { issues: [{ lineIndex: 0, itemId, code: 'ITEM_UNAVAILABLE', message: 'Soup is unavailable' }] }
      : { issues: [{ path: ['quoteId'], code: 'invalid', message: 'Invalid quote' }] };
    http.expectOne('/api/orders').flush({ error: { code, details, requestId, message: 'Rejected' } }, { status: 409, statusText: 'Conflict' }); tick();
    expect(checkout.attempt()).toBeNull(); expect(checkout.quote()).toBeNull(); expect(cart.lines()).toHaveLength(1);
    expect(cart.checkoutLocked()).toBe(false); expect(saved.has(ATTEMPT_STORAGE_KEY)).toBe(false);
    cart.discount('0.25'); expect(cart.discountText()).toBe('0.25'); http.expectNone('/api/orders');
  });

  it('handles QUOTE_USED by fetching and opening the existing order, retaining recovery if that read fails', () => {
    const { checkout } = reviewed(); checkout.confirm();
    reject('/api/orders', { code: 'QUOTE_USED', details: { quoteId, orderId } });
    http.expectOne(`/api/orders/${orderId}`).error(new ProgressEvent('error')); tick();
    expect(checkout.attempt()?.resolvedOrderId).toBe(orderId); checkout.lookup();
    http.expectOne(`/api/orders/${orderId}`).flush(order()); tick();
    expect(checkout.attempt()).toBeNull(); http.expectNone('/api/orders');
    expect(navigate).toHaveBeenCalledWith(['/orders', orderId]);
  });

  it.each(['server', 'invalid-response', 'conflicting-key'] as const)('keeps %s outcomes pending instead of allowing a new checkout', (failure) => {
    const { checkout } = reviewed(); checkout.confirm();
    if (failure === 'server') http.expectOne('/api/orders').flush({ error: { code: 'INTERNAL_ERROR', requestId, message: 'Error' } }, { status: 500, statusText: 'Error' });
    else if (failure === 'invalid-response') http.expectOne('/api/orders').flush({ garbage: true });
    else reject('/api/orders', { code: 'IDEMPOTENCY_CONFLICT', details: { idempotencyKey: checkout.attempt()!.key } });
    tick(); expect(checkout.attempt()).not.toBeNull(); expect(checkout.canReview()).toBe(false);
  });

  it('retains intent with line-specific quote issues and never automatically submits on sync', () => {
    const { checkout, cart } = setup(); cart.add(item, '1'); tick(); checkout.review();
    reject('/api/checkout/quotes', { code: 'CART_INVALID', details: { issues: [{ lineIndex: 0, itemId, code: 'ITEM_UNAVAILABLE', message: 'Soup is unavailable' }] } }, 422);
    expect(checkout.message()).toContain('Line 1: Soup is unavailable'); expect(cart.lines()).toHaveLength(1);
    checks.update((n) => n + 1); tick(); http.expectNone('/api/orders'); http.expectNone('/api/checkout/quotes');
  });

  it('disables confirmation during HTTP synchronization errors and until the check completes', () => {
    const { checkout } = reviewed(); syncing.set(true); checkout.confirm(); http.expectNone('/api/orders');
    syncing.set(false); syncError.set(Error('Offline')); checkout.confirm(); http.expectNone('/api/orders');
    syncError.set(null); expect(checkout.canConfirm()).toBe(true);
  });

  it('preserves its in-memory key on persistence failure with an explicit reload limitation', () => {
    const { checkout } = reviewed(); failWrite = true; checkout.confirm();
    const key = checkout.attempt()!.key;
    expect(checkout.storageNotice()).toContain('reloading or closing');
    http.expectOne('/api/orders').error(new ProgressEvent('error')); tick(); checkout.retry();
    const retry = http.expectOne('/api/orders'); expect(retry.request.headers.get('Idempotency-Key')).toBe(key);
    retry.flush(order()); tick(); expect(navigate).toHaveBeenCalledWith(['/orders', orderId]);
  });

  it('keeps cart editing usable if storage cannot be read and explains why checkout needs recovery access', () => {
    const { checkout, cart } = setup(new Map(), true); tick();
    expect(cart.add(item, '1')).toBeNull(); tick();
    expect(cart.lines()).toHaveLength(1); expect(checkout.blocked()).toBe(true);
    expect(checkout.storageNotice()).toContain('previous attempt');
    checkout.review(); http.expectNone('/api/checkout/quotes');
  });

  it('does not replace corrupt recovery data with a new intent', () => {
    const { checkout, cart } = setup(new Map([[ATTEMPT_STORAGE_KEY, '{broken']])); tick();
    expect(checkout.blocked()).toBe(true); expect(cart.checkoutLocked()).toBe(true);
    checkout.review(); checkout.confirm(); http.expectNone('/api/orders'); http.expectNone('/api/checkout/quotes');
    expect(saved.get(ATTEMPT_STORAGE_KEY)).toBe('{broken');
  });

  it('retains the original attempt if a rejected request cannot clear storage', () => {
    const { checkout, cart } = reviewed(); failRemove = true; checkout.confirm();
    reject('/api/orders', { code: 'MENU_CHANGED', details: { quoteId, quotedMenuRevision: 1, currentMenuRevision: 2 } });
    expect(cart.checkoutLocked()).toBe(true); expect(checkout.attempt()).not.toBeNull(); expect(checkout.storageNotice()).toContain('cannot be updated');
  });
});
