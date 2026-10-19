import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Subject } from 'rxjs';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialog } from '@angular/material/dialog';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MenuItem } from '@restaurant-ordering/contracts';
import { RealtimeSync } from '../../core/realtime-sync';
import { CART_STORAGE, CartStore } from './cart.store';
import { OpenPriceDialog } from './open-price-dialog';

const item: MenuItem = { id: '22222222-2222-4222-8222-222222222222', categoryId: '11111111-1111-4111-8111-111111111111',
  name: 'Custom soup', pricingMode: 'open', priceMinor: null, available: true, revision: 1, archivedAt: null,
  createdAt: '2026-10-18T12:00:00.000Z', updatedAt: '2026-10-18T12:00:00.000Z' };

describe('open-price dialog', () => {
  let confirmation: Subject<boolean>;
  let http: HttpTestingController;
  function setup(menuItem: MenuItem = item) {
    const close = vi.fn(); confirmation = new Subject<boolean>();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(),
      { provide: MatDialog, useValue: { open: () => ({ afterClosed: () => confirmation }) } },
      { provide: MAT_DIALOG_DATA, useValue: { item: menuItem, quantity: '2' } }, { provide: MatDialogRef, useValue: { close } },
      { provide: CART_STORAGE, useValue: () => ({ getItem: () => null, setItem: () => undefined }) },
      { provide: RealtimeSync, useValue: { highest: signal({ menuRevision: 0, ordersRevision: 0 }), successfulChecks: signal(0), observe: vi.fn() } }] });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(OpenPriceDialog); fixture.detectChanges();
    return { fixture, dialog: fixture.componentInstance, close, cart: TestBed.inject(CartStore) };
  }
  afterEach(() => { http.verify(); TestBed.resetTestingModule(); });

  it('shows a read-only unit price for fixed dishes and restores an existing line when reopened', () => {
    const fixed: MenuItem = { ...item, pricingMode: 'fixed', priceMinor: 750 };
    const { dialog, fixture, cart } = setup(fixed);
    expect(fixture.nativeElement.textContent).not.toContain('Unit price (USD)');
    expect(fixture.nativeElement.querySelector('app-price-input')).toBeNull();
    expect(fixture.nativeElement.querySelector('.fixed-price').textContent).toBe('7.50 USD');
    expect(fixture.nativeElement.querySelector('app-item-image [role=img]').getAttribute('aria-label')).toBe(fixed.name + ' — no image available');
    dialog.quantity.setValue('3'); dialog.add(); TestBed.tick();
    http.expectOne('/api/menu/resolve').error(new ProgressEvent('error'));
    const reopened = TestBed.createComponent(OpenPriceDialog); reopened.detectChanges();
    expect(reopened.componentInstance.quantity.value).toBe('3');
    reopened.componentInstance.quantity.setValue('5'); reopened.componentInstance.add();
    expect(cart.lines()).toHaveLength(1); expect(cart.lines()[0]?.quantityText).toBe('5');
    reopened.componentInstance.remove(); expect(cart.lines()).toHaveLength(1); confirmation.next(true); expect(cart.lines()).toEqual([]);
  });

  it('can create distinct open-price lines and select their quantities for editing', () => {
    const { dialog, cart } = setup(); dialog.price.setValue('1.00'); dialog.add(); TestBed.tick();
    http.expectOne('/api/menu/resolve').error(new ProgressEvent('error'));
    const reopened = TestBed.createComponent(OpenPriceDialog); reopened.detectChanges();
    expect(reopened.componentInstance.price.value).toBe('1.00'); expect(reopened.componentInstance.quantity.value).toBe('2');
    reopened.componentInstance.select(''); reopened.componentInstance.price.setValue('2.00'); reopened.componentInstance.quantity.setValue('3'); reopened.componentInstance.add();
    expect(cart.lines()).toHaveLength(2); reopened.componentInstance.select(cart.lines()[0]!.id);
    expect(reopened.componentInstance.quantity.value).toBe('2'); reopened.componentInstance.remove(); confirmation.next(true);
    expect(cart.lines()).toHaveLength(1); expect(cart.lines()[0]?.priceText).toBe('2.00');
  });

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

  it('starts comments collapsed, adds/removes the editor, and exposes deletion only for an existing cart line', () => {
    const { fixture, dialog, cart } = setup();
    expect(fixture.nativeElement.querySelector('textarea')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Add to cart'); expect(fixture.nativeElement.textContent).not.toContain('Delete from cart');
    dialog.commentOpen.set(true); dialog.comment.setValue('No mustard'); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('textarea')).not.toBeNull();
    dialog.removeComment(); fixture.detectChanges();
    expect(dialog.comment.value).toBe(''); expect(fixture.nativeElement.querySelector('textarea')).toBeNull();
    dialog.price.setValue('1.00'); dialog.add(); TestBed.tick(); http.expectOne('/api/menu/resolve').error(new ProgressEvent('error'));
    const reopened = TestBed.createComponent(OpenPriceDialog); reopened.detectChanges();
    expect(reopened.nativeElement.textContent).toContain('Edit in cart'); expect(reopened.nativeElement.textContent).toContain('Delete from cart');
    reopened.componentInstance.remove(); confirmation.next(true); expect(cart.lines()).toEqual([]);
  });
});
