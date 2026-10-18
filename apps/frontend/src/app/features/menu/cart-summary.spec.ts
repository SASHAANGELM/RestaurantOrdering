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
      lines: signal(quantities.map((quantityText) => ({ quantityText }))),
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
    store.lines.set([{ quantityText: '2' }, { quantityText: '3' }]); fixture.detectChanges();
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
});
