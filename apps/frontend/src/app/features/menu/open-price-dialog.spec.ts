import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MenuItem } from '@restaurant-ordering/contracts';
import { RealtimeSync } from '../../core/realtime-sync';
import { CART_STORAGE, CartStore } from './cart.store';
import { OpenPriceDialog } from './open-price-dialog';

const item: MenuItem = { id: '22222222-2222-4222-8222-222222222222', categoryId: '11111111-1111-4111-8111-111111111111',
  name: 'Custom soup', pricingMode: 'open', priceMinor: null, available: true, revision: 1, archivedAt: null,
  createdAt: '2026-10-18T12:00:00.000Z', updatedAt: '2026-10-18T12:00:00.000Z' };

describe('open-price dialog', () => {
  let http: HttpTestingController;
  function setup() {
    const close = vi.fn();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(),
      { provide: MAT_DIALOG_DATA, useValue: { item, quantity: '2' } }, { provide: MatDialogRef, useValue: { close } },
      { provide: CART_STORAGE, useValue: () => ({ getItem: () => null, setItem: () => undefined }) },
      { provide: RealtimeSync, useValue: { highest: signal({ menuRevision: 0, ordersRevision: 0 }), successfulChecks: signal(0), observe: vi.fn() } }] });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(OpenPriceDialog); fixture.detectChanges();
    return { fixture, dialog: fixture.componentInstance, close, cart: TestBed.inject(CartStore) };
  }
  afterEach(() => { http.verify(); TestBed.resetTestingModule(); });

  it('shows labelled price/quantity fields and keeps invalid input for correction', () => {
    const { fixture, dialog, close, cart } = setup();
    dialog.price.setValue('1.234'); dialog.add(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('two decimal places');
    expect(dialog.price.value).toBe('1.234'); expect(dialog.quantity.value).toBe('2');
    expect(fixture.nativeElement.textContent).toContain('Unit price (USD)');
    expect(cart.lines()).toEqual([]); expect(close).not.toHaveBeenCalled();
  });

  it('accepts zero/exact cents and retains added intent after a resolver error', () => {
    const { dialog, close, cart } = setup(); dialog.price.setValue('0.00'); dialog.add();
    expect(close).toHaveBeenCalledWith(true); expect(cart.estimate().totalMinor).toBe(0);
    TestBed.tick(); http.expectOne('/api/menu/resolve').error(new ProgressEvent('error'));
    expect(cart.lines()).toHaveLength(1); expect(cart.lines()[0]?.quantityText).toBe('2');
    expect(cart.resolved.error()?.kind).toBe('network');
  });
});
