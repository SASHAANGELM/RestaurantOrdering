import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MenuItemsQuery } from '@restaurant-ordering/contracts';
import { CheckoutStore } from '../checkout/checkout.store';
import { CartStore } from './cart.store';
import { MenuPage } from './menu.page';
import { MenuStore } from './menu.store';

describe('menu filter timing', () => {
  function setup() {
    vi.useFakeTimers();
    const query = signal<MenuItemsQuery>({ page: 4, pageSize: 25 });
    const setQuery = vi.fn((next: MenuItemsQuery) => query.set(next));
    TestBed.configureTestingModule({ providers: [
      { provide: MenuStore, useValue: { query, setQuery } }, { provide: CartStore, useValue: {} }, { provide: CheckoutStore, useValue: {} }
    ] });
    return { page: TestBed.runInInjectionContext(() => new MenuPage()), setQuery, query };
  }
  afterEach(() => { TestBed.resetTestingModule(); vi.useRealTimers(); });

  it('sends only the latest search after 250ms and resets pagination', () => {
    const { page, setQuery } = setup();
    page.filters.controls.search.setValue('s'); vi.advanceTimersByTime(200);
    page.filters.controls.search.setValue('so'); vi.advanceTimersByTime(200);
    page.filters.controls.search.setValue(' soup '); vi.advanceTimersByTime(249);
    expect(setQuery).not.toHaveBeenCalled(); vi.advanceTimersByTime(1);
    expect(setQuery).toHaveBeenCalledExactlyOnceWith({ page: 1, pageSize: 25, search: 'soup', categoryId: undefined });
  });

  it('applies category filters immediately and clears both filters without a second delayed query', () => {
    const { page, setQuery, query } = setup();
    page.filters.controls.categoryId.setValue('11111111-1111-4111-8111-111111111111');
    expect(query()).toMatchObject({ page: 1, pageSize: 25, categoryId: '11111111-1111-4111-8111-111111111111' });
    page.clearFilters(); vi.advanceTimersByTime(300);
    expect(query()).toEqual({ page: 1, pageSize: 25, categoryId: undefined, search: '' });
    expect(setQuery).toHaveBeenCalledTimes(2);
  });

  it('cancels a pending search when the route is destroyed', () => {
    const { page, setQuery } = setup(); page.filters.controls.search.setValue('pending');
    TestBed.resetTestingModule(); vi.advanceTimersByTime(300); expect(setQuery).not.toHaveBeenCalled();
  });
});
