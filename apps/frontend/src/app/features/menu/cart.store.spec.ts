import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import type { Category, MenuItem, ResolvedItem } from '@restaurant-ordering/contracts';
import { RealtimeSync } from '../../core/realtime-sync';
import { CART_STORAGE_KEY, emptyCart, storedCartSchema } from './cart.model';
import { CART_STORAGE, CartStore } from './cart.store';

const categoryId = '11111111-1111-4111-8111-111111111111';
const itemId = '22222222-2222-4222-8222-222222222222';
const timestamp = '2026-10-18T12:00:00.000Z';
const category: Category = { id: categoryId, name: 'Lunch', sortOrder: 0, revision: 1, createdAt: timestamp, updatedAt: timestamp, archivedAt: null };
const fixed: MenuItem = { id: itemId, name: 'Soup', categoryId, available: true, pricingMode: 'fixed', priceMinor: 29,
  revision: 1, createdAt: timestamp, updatedAt: timestamp, archivedAt: null };
const open: MenuItem = { ...fixed, pricingMode: 'open', priceMinor: null };

describe('per-tab cart intent and reconciliation', () => {
  let http: HttpTestingController;
  const revisions = signal({ menuRevision: 1, ordersRevision: 0 });
  const checks = signal(0);
  let saved = new Map<string, string>();
  function setup(raw?: string, fail?: 'read' | 'write' | 'access') {
    revisions.set({ menuRevision: 1, ordersRevision: 0 }); checks.set(0);
    saved = new Map(raw === undefined ? [] : [[CART_STORAGE_KEY, raw]]);
    const storage = { getItem: (key: string) => { if (fail === 'read') throw Error('denied'); return saved.get(key) ?? null; },
      setItem: (key: string, value: string) => { if (fail === 'write') throw Error('quota'); saved.set(key, value); } };
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(),
      { provide: CART_STORAGE, useValue: () => { if (fail === 'access') throw Error('security'); return storage; } },
      { provide: RealtimeSync, useValue: { highest: revisions, successfulChecks: checks,
        observe: ({ menuRevision }: { menuRevision: number }) => { if (menuRevision > revisions().menuRevision) revisions.update((s) => ({ ...s, menuRevision })); } } }] });
    http = TestBed.inject(HttpTestingController);
    const cart = TestBed.inject(CartStore); TestBed.tick();
    return cart;
  }
  function resolve(cart: InstanceType<typeof CartStore>, overrides?: ResolvedItem[], menuRevision = revisions().menuRevision) {
    const request = http.expectOne('/api/menu/resolve');
    expect(request.request.body.itemIds).toEqual(cart.itemIds());
    request.flush({ items: overrides ?? cart.lines().map((line) => ({ itemId: line.item.id, state: 'available', item: line.item, category })), menuRevision });
    TestBed.tick();
  }
  afterEach(() => { http.verify(); TestBed.resetTestingModule(); });

  it('starts with an empty zero discount, accepts clearing it, and counts quantities across lines', () => {
    const cart = setup(); expect(cart.discountText()).toBe('');
    cart.add(fixed, '2'); cart.add(open, '3', '1.00'); TestBed.tick(); resolve(cart);
    expect(cart.count()).toBe(5);
    expect(cart.estimate()).toMatchObject({ discountMinor: 0, totalMinor: 358, error: null });
    cart.discount('0.29'); expect(cart.estimate().totalMinor).toBe(329);
    cart.discount(''); expect(cart.estimate()).toMatchObject({ discountMinor: 0, totalMinor: 358, error: null });
    cart.discount('1.234'); expect(cart.estimate().error).toContain('two decimal');
  });

  it('clears lines and discount together, persists empty state and respects checkout locks', () => {
    const cart = setup(); cart.add(fixed, '2'); TestBed.tick(); resolve(cart); cart.discount('0.29');
    cart.lockCheckout(true); cart.clear(); expect(cart.lines()).toHaveLength(1);
    cart.lockCheckout(false); cart.clear(); TestBed.tick();
    expect(cart.lines()).toEqual([]); expect(cart.discountText()).toBe('');
    expect(storedCartSchema.parse(JSON.parse(saved.get(CART_STORAGE_KEY)!))).toMatchObject({ lines: [], discountText: '' });
  });

  it('updates selected quantities, merges matching open-price lines safely and preserves invalid drafts', () => {
    const cart = setup(); cart.add(open, '2', '1.00'); cart.add(open, '3', '2.00'); TestBed.tick(); resolve(cart);
    const id = cart.lines()[0]!.id;
    expect(cart.updateLine(id, '0', '2.00')).toContain('1 to 99'); expect(cart.lines()).toHaveLength(2);
    expect(cart.updateLine(id, '4', '2.00')).toBeNull();
    expect(cart.lines()).toHaveLength(1); expect(cart.lines()[0]?.quantityText).toBe('7');
    cart.lockCheckout(true); expect(cart.updateLine(cart.lines()[0]!.id, '1', '3.00')).toContain('pending checkout');
    expect(cart.lines()[0]?.quantityText).toBe('7');
  });

  it('calculates exact cents, merges same-price additions, and validates versioned saved data', () => {
    const cart = setup();
    expect(cart.add(fixed, '2')).toBeNull();
    expect(cart.add(fixed, '1')).toBeNull(); TestBed.tick(); resolve(cart);
    cart.discount('0.29'); TestBed.tick();
    expect(cart.lines()).toHaveLength(1);
    expect(cart.estimate()).toMatchObject({ subtotalMinor: 87, discountMinor: 29, totalMinor: 58, error: null });
    expect(storedCartSchema.parse(JSON.parse(saved.get(CART_STORAGE_KEY) ?? ''))).toEqual({ version: 1, lines: cart.lines(), discountText: '0.29' });
  });

  it('keeps different open prices separate while merging equivalent decimals', () => {
    const cart = setup();
    cart.add(open, '1', '1.20'); cart.add(open, '2', '1.2'); cart.add(open, '1', '2.00');
    TestBed.tick(); resolve(cart);
    expect(cart.lines().map((line) => [line.quantityText, line.priceText])).toEqual([['3', '1.20'], ['1', '2.00']]);
    expect(cart.itemIds()).toEqual([itemId]);
    expect(cart.estimate().totalMinor).toBe(560);
  });

  it.each(['', '-1', '1.234', '1e2', '.5', '10000.01', 'NaN'])('retains existing intent on invalid added open price %j', (price) => {
    const cart = setup(); cart.add(fixed, '1'); TestBed.tick(); resolve(cart);
    expect(cart.add(open, '2', price)).toContain('two decimal places');
    expect(cart.lines()).toHaveLength(1); expect(cart.lines()[0]?.quantityText).toBe('1');
  });

  it.each(['0', '-1', '1.1', '1e1', '100', ''])('rejects invalid quantity %j without removing existing intent', (quantity) => {
    const cart = setup();
    expect(cart.add(fixed, quantity)).toContain('1 to 99'); expect(cart.lines()).toEqual([]);
  });

  it('retains invalid editing drafts, discount and totals errors through persistence and recovery', () => {
    const cart = setup(); cart.add(open, '2', '1.00'); TestBed.tick(); resolve(cart);
    const id = cart.lines()[0]!.id;
    cart.edit(id, 'priceText', '1.234'); cart.edit(id, 'quantityText', '0'); cart.discount('draft'); TestBed.tick();
    expect(cart.entries()[0]?.inputIssue).toContain('quantity'); expect(cart.estimate().totalMinor).toBeNull();
    expect(JSON.parse(saved.get(CART_STORAGE_KEY) ?? '')).toMatchObject({ discountText: 'draft', lines: [{ quantityText: '0', priceText: '1.234' }] });
    cart.edit(id, 'quantityText', '2'); expect(cart.entries()[0]?.inputIssue).toContain('two decimal places');
    cart.edit(id, 'priceText', '1.00'); expect(cart.estimate().error).toContain('discount');
    cart.discount('2.01'); expect(cart.estimate().error).toContain('exceed'); expect(cart.discountText()).toBe('2.01');
    cart.discount('2.00'); expect(cart.estimate().totalMinor).toBe(0);
    cart.discount('-1'); expect(cart.estimate().totalMinor).toBeNull();
    http.expectNone('/api/menu/resolve');
  });

  it('retains original prices and quantities during price, eligibility and pricing-mode changes outside the visible page', () => {
    const cart = setup(); cart.add(fixed, '3'); TestBed.tick(); resolve(cart);
    for (const [index, state] of (['unavailable', 'archived', 'category-archived', 'missing'] as const).entries()) {
      revisions.set({ menuRevision: index + 2, ordersRevision: 0 }); TestBed.tick();
      resolve(cart, [state === 'missing' ? { itemId, state } : { itemId, state, item: { ...fixed, priceMinor: 50, revision: 2 }, category }]);
      expect(cart.entries()[0]?.changes.join(' ')).toContain(state === 'missing' ? 'removed' : state === 'unavailable' ? 'Unavailable' : 'archived');
      if (state !== 'missing') expect(cart.entries()[0]?.changes.join(' ')).toContain('Price changed from $0.29 to $0.50');
      expect(cart.lines()[0]?.quantityText).toBe('3'); expect(cart.estimate().totalMinor).toBe(87);
    }
    revisions.set({ menuRevision: 6, ordersRevision: 0 }); TestBed.tick();
    resolve(cart, [{ itemId, state: 'available', item: open, category }]);
    expect(cart.entries()[0]?.changes.join(' ')).toContain('Pricing changed');
  });

  it('retains the cart and resolver snapshot on failed refresh, then retries after a sync check', () => {
    const cart = setup(); cart.add(fixed, '2'); TestBed.tick(); resolve(cart);
    revisions.set({ menuRevision: 2, ordersRevision: 0 }); TestBed.tick();
    http.expectOne('/api/menu/resolve').error(new ProgressEvent('error')); TestBed.tick();
    expect(cart.resolved.error()?.kind).toBe('network'); expect(cart.resolved.stale()).toBe(true);
    cart.edit(cart.lines()[0]!.id, 'quantityText', '3'); cart.discount('0.01');
    checks.update((n) => n + 1); TestBed.tick(); resolve(cart);
    expect(cart.estimate().totalMinor).toBe(86); expect(cart.resolved.error()).toBeNull();
  });

  it('applies name/image updates silently but persists accepted prices until explicit OK', () => {
    const cart = setup(); cart.add(fixed, '2', '', 'No mustard'); TestBed.tick(); resolve(cart);
    const id = cart.lines()[0]!.id;
    revisions.set({ menuRevision: 2, ordersRevision: 0 }); TestBed.tick();
    const current = { ...fixed, name: 'New name', imageUrl: '/api/images/soup.jpg', priceMinor: 50, revision: 2 };
    resolve(cart, [{ itemId, state: 'available', item: current, category }]);
    expect(cart.entries()[0]?.item.name).toBe('New name'); expect(cart.lines()[0]?.item.imageUrl).toBe('/api/images/soup.jpg');
    expect(cart.entries()[0]?.eligibilityIssue).toBeNull(); expect(cart.entries()[0]?.pricingWarning).toContain('Price changed');
    expect(cart.estimate().totalMinor).toBe(58);
    expect(JSON.parse(saved.get(CART_STORAGE_KEY)!).lines[0].item.priceMinor).toBe(29);
    cart.lockCheckout(true); expect(cart.acknowledgePrice(id)).toContain('pending checkout'); cart.lockCheckout(false);
    expect(cart.acknowledgePrice(id)).toBeNull(); TestBed.tick();
    expect(cart.entries()[0]?.changes).toEqual([]); expect(cart.estimate().totalMinor).toBe(100);
    expect(cart.lines()[0]).toMatchObject({ quantityText: '2', comment: 'No mustard', item: current });
    expect(JSON.parse(saved.get(CART_STORAGE_KEY)!).lines[0].item.priceMinor).toBe(50);
  });

  it('acknowledges both pricing-type changes, validates the proposed open price and refuses stale snapshots', () => {
    const cart = setup(); cart.add(open, '2', '1.20'); TestBed.tick(); resolve(cart);
    const id = cart.lines()[0]!.id;
    revisions.set({ menuRevision: 2, ordersRevision: 0 }); TestBed.tick();
    expect(cart.acknowledgePrice(id)).toContain('loading');
    resolve(cart, [{ itemId, state: 'available', item: { ...fixed, revision: 2 }, category }]);
    expect(cart.entries()[0]?.pricingWarning).toContain('open price to fixed price');
    expect(cart.acknowledgePrice(id)).toBeNull(); expect(cart.estimate().totalMinor).toBe(58);
    revisions.set({ menuRevision: 3, ordersRevision: 0 }); TestBed.tick();
    resolve(cart, [{ itemId, state: 'available', item: { ...open, revision: 3 }, category }]);
    expect(cart.entries()[0]?.pricingWarning).toContain('fixed price to open price');
    cart.edit(id, 'priceText', '1.234'); expect(cart.acknowledgePrice(id)).toContain('two decimal places');
    cart.edit(id, 'priceText', '2.50'); expect(cart.acknowledgePrice(id)).toBeNull();
    expect(cart.estimate().totalMinor).toBe(500); expect(cart.entries()[0]?.pricingWarning).toBeNull();
  });

  it('does not warn about name and image changes and never changes frozen pending checkout data', () => {
    const cart = setup(); cart.add(fixed, '1'); TestBed.tick(); resolve(cart);
    revisions.set({ menuRevision: 2, ordersRevision: 0 }); TestBed.tick();
    resolve(cart, [{ itemId, state: 'available', item: { ...fixed, name: 'New name', imageUrl: '/api/images/soup.jpg', revision: 2 }, category }]);
    expect(cart.entries()[0]?.changes).toEqual([]); const frozen = cart.lines();
    cart.lockCheckout(true); revisions.set({ menuRevision: 3, ordersRevision: 0 }); TestBed.tick();
    resolve(cart, [{ itemId, state: 'available', item: { ...fixed, name: 'Later name', revision: 3 }, category }]);
    expect(cart.lines()).toEqual(frozen);
  });

  it('cancels obsolete resolver requests and rejects a response below the revision watermark', () => {
    const cart = setup(); cart.add(fixed, '1'); TestBed.tick();
    const first = http.expectOne('/api/menu/resolve');
    revisions.set({ menuRevision: 2, ordersRevision: 0 }); TestBed.tick(); expect(first.cancelled).toBe(true);
    http.expectOne('/api/menu/resolve').flush({ items: [], menuRevision: 1 }); TestBed.tick();
    expect(cart.resolved.data()?.items).toEqual([]); expect(cart.resolved.error()).not.toBeNull();
    cart.resolved.reload(); TestBed.tick(); resolve(cart);
    expect(cart.entries()[0]?.changes).toEqual([]);
  });

  it('restores validated drafts on reload and rechecks eligibility independently of menu pages', () => {
    const line = { id: crypto.randomUUID(), item: open, quantityText: '2', priceText: 'draft' };
    const cart = setup(JSON.stringify({ version: 1, lines: [line], discountText: '1.234' }));
    resolve(cart);
    expect(cart.lines()).toEqual([line]); expect(cart.discountText()).toBe('1.234');
    expect(cart.entries()[0]?.inputIssue).toContain('price');
  });

  it.each(['{broken', '{"version":2,"lines":[],"discountText":"0"}', '{"version":1,"lines":[{}],"discountText":"0"}'])('ignores corrupt or unsupported storage %s with a notice', (raw) => {
    const cart = setup(raw); expect(cart.lines()).toEqual([]); expect(cart.storageNotice()).toContain('could not be restored');
    cart.add(fixed, '1'); TestBed.tick(); resolve(cart); expect(cart.estimate().totalMinor).toBe(29);
  });

  it.each(['read', 'write', 'access'] as const)('survives storage %s failures and keeps cart edits in memory', (fail) => {
    const cart = setup(undefined, fail); cart.add(fixed, '2'); TestBed.tick(); resolve(cart);
    expect(cart.storageNotice()).not.toBeNull(); expect(cart.estimate().totalMinor).toBe(58);
  });

  it('protects quantity and line limits and removes the last line without an empty resolver request', () => {
    const cart = setup(); cart.add(fixed, '99'); TestBed.tick(); resolve(cart);
    expect(cart.add(fixed, '1')).toContain('at most 99'); expect(cart.lines()[0]?.quantityText).toBe('99');
    cart.remove(cart.lines()[0]!.id); TestBed.tick(); http.expectNone('/api/menu/resolve');
    for (let i = 0; i < 100; i++) expect(cart.add(open, '1', (i / 100).toFixed(2))).toBeNull();
    expect(cart.add(open, '1', '2.00')).toContain('100 lines'); TestBed.tick(); resolve(cart);
    expect(cart.lines()).toHaveLength(100);
  });

  it('never places an order or creates a quote while restoring or syncing cart intent', () => {
    const cart = setup(JSON.stringify(emptyCart())); cart.add(fixed, '1'); TestBed.tick(); resolve(cart);
    revisions.set({ menuRevision: 3, ordersRevision: 0 }); TestBed.tick(); resolve(cart);
    http.expectNone((request) => request.url.includes('/orders') || request.url.includes('/checkout'));
  });
});
