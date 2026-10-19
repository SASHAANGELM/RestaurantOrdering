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

  it('filters immediately in memory and resets pagination', () => {
    const { page, query } = setup();
    page.filters.controls.search.setValue(' soup ');
    expect(query()).toEqual({ page: 1, pageSize: 25, search: 'soup', categoryId: undefined });
  });
  it('clears only the search and preserves the selected category', () => {
    const { page, query } = setup();
    page.selectCategory('11111111-1111-4111-8111-111111111111');
    page.filters.controls.search.setValue('soup'); page.clearFilters();
    expect(query()).toMatchObject({ page: 1, categoryId: '11111111-1111-4111-8111-111111111111', search: '' });
  });
});
