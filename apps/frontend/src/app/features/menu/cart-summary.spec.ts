import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, describe, expect, it } from 'vitest';
import { CartStore } from './cart.store';
import { CartSummary } from './cart-summary';

describe('menu cart summary', () => {
  afterEach(() => TestBed.resetTestingModule());
  function setup(quantities: string[] = []) {
    const store = {
      checkoutLocked: signal(false),
      lines: signal(quantities.map((quantityText) => ({ quantityText, item: { id: quantityText, name: 'Soup' } }))),
      entries: signal<{ inputIssue: string | null; changes: string[] }[]>([]),
      estimate: signal<{ error: string | null; totalMinor: number | null }>({ error: null, totalMinor: 1500 }),
      resolved: { error: signal<unknown>(null), stale: signal(false) }, storageNotice: signal<string | null>(null)
    };
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: CartStore, useValue: store }] });
    const fixture = TestBed.createComponent(CartSummary); fixture.detectChanges();
    return { store, fixture, component: fixture.componentInstance };
  }
  it('hides an empty cart and sums quantities instead of counting lines', () => {
    const { store, fixture, component } = setup();
    expect(fixture.nativeElement.querySelector('footer')).toBeNull();
    store.lines.set([{ quantityText: '2', item: { id: '2', name: 'Soup' } }, { quantityText: '3', item: { id: '3', name: 'Bread' } }]); fixture.detectChanges();
    expect(component.count()).toBe(5);
    expect(fixture.nativeElement.textContent).toContain('5 items in your cart');
    expect(fixture.nativeElement.textContent).toContain('$15.00');
    expect(fixture.nativeElement.querySelector('a').getAttribute('href')).toBe('/cart');
  });
  it('shows invalid estimates, stale availability and off-page eligibility changes', () => {
    const { store, fixture, component } = setup(['2', 'invalid']);
    expect(component.count()).toBe(2);
    store.estimate.set({ totalMinor: null, error: 'Correct cart line inputs.' }); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Correct cart line inputs.');
    expect(fixture.nativeElement.textContent).toContain('Check total');
    store.estimate.set({ totalMinor: 1500, error: null }); store.resolved.stale.set(true);
    expect(component.problem()).toContain('could not be checked');
    store.resolved.stale.set(false); store.entries.set([{ inputIssue: null, changes: ['Unavailable — cannot be ordered.'] }]);
    expect(component.problem()).toContain('Unavailable');
    store.lines.set([]); fixture.detectChanges(); expect(fixture.nativeElement.querySelector('footer')).toBeNull();
  });
  it('labels combined quantities per dish, retains single names and tolerates invalid drafts', () => {
    const { store, fixture, component } = setup();
    store.lines.set([
      { quantityText: '2', item: { id: 'burger', name: 'Burger' } },
      { quantityText: '4', item: { id: 'ice-cream', name: 'Ice cream' } },
      { quantityText: '1', item: { id: 'bread', name: 'Bread' } }
    ]); fixture.detectChanges();
    expect(component.names()).toBe('2x Burger, 4x Ice cream, Bread');
    expect(fixture.nativeElement.querySelector('.dish-names').title).toBe('2x Burger, 4x Ice cream, Bread');
    store.lines.update(lines => [...lines,
      { quantityText: '3', item: { id: 'burger', name: 'Burger' } },
      { quantityText: 'invalid', item: { id: 'ice-cream', name: 'Ice cream' } }
    ]);
    expect(component.names()).toBe('5x Burger, 4x Ice cream, Bread');
    expect(component.count()).toBe(10);
  });
});
