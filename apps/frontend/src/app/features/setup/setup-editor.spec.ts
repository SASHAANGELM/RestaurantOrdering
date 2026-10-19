import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Category, MenuItem } from '@restaurant-ordering/contracts';
import { RealtimeSync } from '../../core/realtime-sync';
import { SetupEditor, type SetupEditorData } from './setup-editor';
import { ItemImageGallery } from './item-image-gallery';

const categoryId = '11111111-1111-4111-8111-111111111111';
const itemId = '22222222-2222-4222-8222-222222222222';
const timestamp = '2026-10-18T12:00:00.000Z';
const category: Category = { id: categoryId, name: 'Lunch', sortOrder: 0, revision: 1, createdAt: timestamp, updatedAt: timestamp, archivedAt: null };
const item: MenuItem = { id: itemId, name: 'Soup', categoryId, description: 'Warm', available: true, pricingMode: 'fixed', priceMinor: 750,
  revision: 1, createdAt: timestamp, updatedAt: timestamp, archivedAt: null };

describe('Setup editor', () => {
  let http: HttpTestingController;
  const dialog = { close: vi.fn(), disableClose: false };
  const sync = { observe: vi.fn() };
  beforeEach(() => { dialog.close.mockClear(); dialog.disableClose = false; sync.observe.mockClear(); });
  afterEach(() => { http.verify(); TestBed.resetTestingModule(); });

  function editor(data: Partial<SetupEditorData> = {}) {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(),
      { provide: MAT_DIALOG_DATA, useValue: { kind: 'item', categories: [category], entity: item, ...data } },
      { provide: MatDialogRef, useValue: dialog }, { provide: RealtimeSync, useValue: sync }] });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(SetupEditor);
    fixture.detectChanges();
    return { component: fixture.componentInstance, fixture };
  }
  function success(menuRevision = 4) {
    http.expectOne(`/api/setup/items/${itemId}`).flush({ item: { ...item, revision: 2 }, menuRevision });
  }
  function conflict() {
    http.expectOne(`/api/setup/items/${itemId}`).flush({ error: {
      code: 'REVISION_CONFLICT', message: 'Changed', requestId: categoryId,
      details: { entityType: 'item', entityId: itemId, expectedRevision: 1, currentRevision: 2 }
    } }, { status: 409, statusText: 'Conflict' });
  }

  it('keeps image selection in the draft, preserves it on gallery cancel and explicitly clears a saved image', () => {
    const { component, fixture } = editor({ entity: { ...item, imageUrl: '/api/images/soup.jpg' } });
    const closed = new Subject<string | undefined>();
    const open = vi.spyOn(fixture.debugElement.injector.get(MatDialog), 'open').mockReturnValue({ afterClosed: () => closed } as never);
    expect(fixture.nativeElement.querySelector('input[formControlName="imageUrl"]')).toBeNull();
    component.chooseImage();
    expect(open).toHaveBeenCalledWith(ItemImageGallery, expect.objectContaining({ data: '/api/images/soup.jpg', restoreFocus: true }));
    closed.next(undefined); expect(component.form.controls.imageUrl.value).toBe('/api/images/soup.jpg');
    closed.next('/api/images/bread.jpg'); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.image-preview img').getAttribute('src')).toBe('/api/images/bread.jpg');
    closed.next(''); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.image-preview .placeholder')).not.toBeNull();
    http.expectNone(() => true);
    component.save();
    const request = http.expectOne(`/api/setup/items/${itemId}`);
    expect(request.request.body).toMatchObject({ imageUrl: null, expectedRevision: 1 });
    request.flush({ item: { ...item, revision: 2 }, menuRevision: 2 });
    closed.complete(); open.mockRestore();
  });

  it('keeps archival inside editing and requires explicit confirmation without submitting the draft', () => {
    const { component, fixture } = editor({ entity: { ...item, available: false } });
    component.form.patchValue({ name: 'Unsaved draft' });
    expect(fixture.nativeElement.textContent).toContain('Archive item');
    component.beginArchive(); fixture.detectChanges();
    expect(component.title).toBe('Archive item');
    expect(fixture.nativeElement.textContent).toContain('cannot be ordered');
    http.expectNone(`/api/setup/items/${itemId}`);
    component.save();
    const request = http.expectOne(`/api/setup/items/${itemId}`);
    expect(request.request.body).toEqual({ expectedRevision: 1, archived: true });
    request.flush({ item: { ...item, archivedAt: timestamp, revision: 2 }, menuRevision: 2 });
  });

  it('requires availability to be saved as unavailable before archive confirmation can open', () => {
    const { component, fixture } = editor();
    expect(component.canArchive()).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('Mark this item as unavailable and save');
    component.form.controls.available.setValue(false);
    component.beginArchive();
    expect(component.archiving()).toBe(false);
    http.expectNone(() => true);
  });

  it('preserves and clears item images explicitly', () => {
    const { component } = editor({ entity: { ...item, imageUrl: '/images/soup.jpg' } });
    expect(component.form.controls.imageUrl.value).toBe('/images/soup.jpg');
    component.form.controls.imageUrl.setValue(''); component.save();
    const request = http.expectOne(`/api/setup/items/${itemId}`);
    expect(request.request.body.imageUrl).toBeNull(); request.flush({ item: { ...item, revision: 2 }, menuRevision: 2 });
  });

  it.each(['category', 'item'] as const)('confirms %s restoration without sending edits, and blocks duplicate submission', (kind) => {
    const entity = { ...(kind === 'category' ? category : item), archivedAt: timestamp, revision: 2 };
    const { component, fixture } = editor({ kind, entity, restore: true });
    expect(component.title).toBe(`Restore ${kind}`);
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain(kind === 'category' ? 'Individually archived items stay archived' : 'restored as unavailable');
    http.expectNone(() => true);
    component.form.controls.name.setValue('Must not be sent');
    component.save(); component.save();
    expect(component.busy()).toBe(true); expect(dialog.disableClose).toBe(true);
    const request = http.expectOne(`/api/setup/${kind === 'category' ? 'categories' : 'items'}/${entity.id}`);
    expect(request.request.body).toEqual({ expectedRevision: 2, archived: false });
    request.flush({ [kind]: { ...entity, archivedAt: null, revision: 3 }, menuRevision: 5 });
    expect(sync.observe).toHaveBeenCalledWith({ menuRevision: 5 });
    expect(dialog.close).toHaveBeenCalledWith(true);
  });

  it('explains archived parent and unavailable item restrictions, and allows explicit restore retry after network failure', () => {
    const { component, fixture } = editor({ restore: true, entity: { ...item, archivedAt: timestamp, available: false },
      categories: [{ ...category, archivedAt: timestamp }] });
    expect(fixture.nativeElement.textContent).toContain("This item's category is archived");
    expect(fixture.nativeElement.textContent).toContain('restored as unavailable');
    component.save();
    http.expectOne(`/api/setup/items/${itemId}`).error(new ProgressEvent('error'));
    expect(component.busy()).toBe(false); expect(dialog.disableClose).toBe(false);
    expect(component.message()).toContain('Cannot reach');
    component.save();
    const request = http.expectOne(`/api/setup/items/${itemId}`);
    expect(request.request.body).toEqual({ expectedRevision: 1, archived: false });
    request.flush({ item: { ...item, available: false, revision: 2 }, menuRevision: 5 });
    expect(dialog.close).toHaveBeenCalledWith(true);
  });

  it('requires authoritative conflict recovery before restoring with the latest revision', () => {
    const { component } = editor({ restore: true, entity: { ...item, archivedAt: timestamp } });
    component.save(); conflict();
    component.save(); http.expectNone(() => true);
    component.reloadLatest();
    http.expectOne('/api/setup/categories?includeArchived=true').flush({ categories: [category], menuRevision: 4 });
    http.expectOne('/api/menu/resolve').flush({ items: [{ itemId, state: 'archived', item: { ...item, archivedAt: timestamp, revision: 2 }, category }], menuRevision: 4 });
    component.save();
    const request = http.expectOne(`/api/setup/items/${itemId}`);
    expect(request.request.body).toEqual({ expectedRevision: 2, archived: false });
    request.flush({ item: { ...item, revision: 3 }, menuRevision: 5 });
    expect(dialog.close).toHaveBeenCalledWith(true);
  });

  it('disables restoration when a conflict reload shows another user already restored the record', () => {
    const { component, fixture } = editor({ restore: true, entity: { ...item, archivedAt: timestamp } });
    component.save(); conflict(); component.reloadLatest();
    http.expectOne('/api/setup/categories?includeArchived=true').flush({ categories: [category], menuRevision: 4 });
    http.expectOne('/api/menu/resolve').flush({ items: [{ itemId, state: 'available', item: { ...item, revision: 2 }, category }], menuRevision: 4 });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('This record is already active');
    const restore = [...fixture.nativeElement.querySelectorAll('button')].find((button) => (button as HTMLButtonElement).textContent?.trim() === 'Restore') as HTMLButtonElement;
    expect(restore.disabled).toBe(true);
    component.save(); http.expectNone(() => true);
    expect(dialog.close).not.toHaveBeenCalled();
  });

  it('parses exact fixed cents, keeps the opening revision, and blocks duplicate submissions', () => {
    const { component } = editor();
    component.form.patchValue({ name: 'Edited soup', price: '0.29' });
    component.save(); component.save();
    const request = http.expectOne(`/api/setup/items/${itemId}`);
    expect(request.request.body).toMatchObject({ name: 'Edited soup', expectedRevision: 1, priceMinor: 29, pricingMode: 'fixed' });
    expect(component.busy()).toBe(true);
    expect(dialog.disableClose).toBe(true);
    request.flush({ item: { ...item, revision: 2 }, menuRevision: 4 });
    expect(sync.observe).toHaveBeenCalledWith({ menuRevision: 4 });
    expect(dialog.close).toHaveBeenCalledWith(true);
  });

  it('omits fixed price on both open-price creation and editing, even with a retained invalid fixed draft', () => {
    const { component } = editor({ entity: undefined });
    component.form.patchValue({ name: 'Custom soup', categoryId, pricingMode: 'open', price: 'bad fixed price' });
    component.save();
    const create = http.expectOne('/api/setup/items');
    expect(create.request.body).toEqual({ name: 'Custom soup', categoryId, description: '', available: true, pricingMode: 'open' });
    create.flush({ item: { ...item, pricingMode: 'open', priceMinor: null }, menuRevision: 2 });
    component.busy.set(false); component.form.enable(); component.entity.set(item);
    component.save();
    const update = http.expectOne(`/api/setup/items/${itemId}`);
    expect(update.request.body).not.toHaveProperty('priceMinor');
    expect(update.request.body).toMatchObject({ expectedRevision: 1, pricingMode: 'open' });
    update.flush({ item: { ...item, pricingMode: 'open', priceMinor: null, revision: 2 }, menuRevision: 3 });
  });

  it.each(['', '-1', '1.234', '1e2', '10000.01', 'NaN'])('rejects invalid price %j while preserving all input', (price) => {
    const { component } = editor();
    component.form.patchValue({ price, name: 'Retained soup' });
    component.save();
    http.expectNone(() => true);
    expect(component.form.getRawValue()).toMatchObject({ price, name: 'Retained soup' });
    expect(component.message()).toContain('two decimal places');
    expect(dialog.close).not.toHaveBeenCalled();
  });

  it('retains form values and exposes server field errors and request reference', () => {
    const { component, fixture } = editor();
    component.form.patchValue({ name: 'Draft soup', available: false }); component.save();
    http.expectOne(`/api/setup/items/${itemId}`).flush({ error: { code: 'VALIDATION_ERROR', message: 'Invalid input', requestId: categoryId,
      details: { issues: [{ path: ['name'], message: 'Name is invalid', code: 'custom' }] }
    } }, { status: 400, statusText: 'Bad Request' });
    fixture.detectChanges();
    expect(component.form.getRawValue()).toMatchObject({ name: 'Draft soup', available: false, price: '7.50' });
    expect(fixture.nativeElement.textContent).toContain('name: Name is invalid');
    expect(fixture.nativeElement.textContent).toContain(categoryId);
    expect(component.form.enabled).toBe(true);
    expect(dialog.close).not.toHaveBeenCalled();
  });

  it('retains input on network failure and allows an explicit retry', () => {
    const { component } = editor();
    component.form.controls.name.setValue('Offline draft'); component.save();
    http.expectOne(`/api/setup/items/${itemId}`).error(new ProgressEvent('error'));
    expect(component.form.controls.name.value).toBe('Offline draft');
    expect(component.message()).toContain('Cannot reach');
    expect(component.busy()).toBe(false);
    component.save(); success();
    expect(dialog.close).toHaveBeenCalledWith(true);
  });

  it('blocks conflicted retries, preserves input during failed reload, and explicitly reloads before resubmission', () => {
    const { component } = editor();
    component.form.controls.name.setValue('My draft'); component.save(); conflict();
    expect(component.form.controls.name.value).toBe('My draft');
    expect(component.message()).toContain('revision 1 to 2');
    component.save(); http.expectNone(() => true);
    component.reloadLatest();
    const cancelled = http.expectOne('/api/menu/resolve');
    http.expectOne('/api/setup/categories?includeArchived=true').error(new ProgressEvent('error'));
    expect(cancelled.cancelled).toBe(true);
    expect(component.conflict()).toBe(true);
    expect(component.form.controls.name.value).toBe('My draft');
    component.reloadLatest();
    http.expectOne('/api/setup/categories?includeArchived=true').flush({ categories: [category], menuRevision: 4 });
    http.expectOne('/api/menu/resolve').flush({ items: [{ itemId, state: 'available', item: { ...item, name: 'Other edit', revision: 2 }, category }], menuRevision: 4 });
    expect(component.form.controls.name.value).toBe('Other edit');
    expect(component.conflict()).toBe(false);
    component.form.controls.name.setValue('Reviewed edit'); component.save();
    const request = http.expectOne(`/api/setup/items/${itemId}`);
    expect(request.request.body).toMatchObject({ expectedRevision: 2, name: 'Reviewed edit' });
    request.flush({ item: { ...item, name: 'Reviewed edit', revision: 3 }, menuRevision: 5 });
  });

  it('shows category archive effects and sends only the revision and archive flag', () => {
    const { component, fixture } = editor({ kind: 'category', entity: category, archive: true });
    expect(fixture.nativeElement.textContent).toContain('All active items in this category');
    expect(fixture.nativeElement.textContent).toContain('Existing orders keep their original details');
    http.expectNone(() => true);
    component.save();
    const request = http.expectOne(`/api/setup/categories/${categoryId}`);
    expect(request.request.body).toEqual({ expectedRevision: 1, archived: true });
    request.flush({ category: { ...category, archivedAt: timestamp, revision: 2 }, menuRevision: 2 });
    expect(dialog.close).toHaveBeenCalledWith(true);
  });

  it('reloads a concurrently archived record without allowing another edit', () => {
    const { component } = editor(); component.save(); conflict(); component.reloadLatest();
    http.expectOne('/api/setup/categories?includeArchived=true').flush({ categories: [category], menuRevision: 4 });
    http.expectOne('/api/menu/resolve').flush({ items: [{ itemId, state: 'archived', item: { ...item, archivedAt: timestamp, revision: 2 }, category }], menuRevision: 4 });
    component.save(); http.expectNone(() => true);
    expect(component.entity()?.archivedAt).toBe(timestamp);
    expect(dialog.close).not.toHaveBeenCalled();
  });

  it('validates category name/sort order without losing input, then creates it', () => {
    const { component } = editor({ kind: 'category', entity: undefined });
    component.form.patchValue({ name: '  ', sortOrder: 1.5 }); component.save();
    http.expectNone(() => true);
    expect(component.form.controls.sortOrder.value).toBe(1.5);
    component.form.patchValue({ name: '  Specials  ', sortOrder: -2 }); component.save();
    const request = http.expectOne('/api/setup/categories');
    expect(request.request.body).toEqual({ name: 'Specials', sortOrder: -2 });
    request.flush({ category: { ...category, name: 'Specials', sortOrder: -2 }, menuRevision: 2 });
  });

  it('requires an active category and cancels pending HTTP on destruction', () => {
    const { component, fixture } = editor({ categories: [{ ...category, archivedAt: timestamp }] });
    component.save(); http.expectNone(() => true);
    expect(component.message()).toContain('active category');
    component.categories.set([category]); component.save();
    const pending = http.expectOne(`/api/setup/items/${itemId}`);
    fixture.destroy();
    expect(pending.cancelled).toBe(true);
  });

  it('recovers category revision conflicts through an explicit authoritative reload', () => {
    const { component } = editor({ kind: 'category', entity: category });
    component.form.controls.name.setValue('My category'); component.save();
    http.expectOne(`/api/setup/categories/${categoryId}`).flush({ error: {
      code: 'REVISION_CONFLICT', message: 'Changed', requestId: itemId,
      details: { entityType: 'category', entityId: categoryId, expectedRevision: 1, currentRevision: 2 }
    } }, { status: 409, statusText: 'Conflict' });
    expect(component.form.controls.name.value).toBe('My category');
    component.reloadLatest();
    http.expectOne('/api/setup/categories?includeArchived=true').flush({ categories: [{ ...category, name: 'Other category', revision: 2 }], menuRevision: 3 });
    expect(component.form.controls.name.value).toBe('Other category');
    component.form.controls.sortOrder.setValue(5); component.save();
    const request = http.expectOne(`/api/setup/categories/${categoryId}`);
    expect(request.request.body).toEqual({ expectedRevision: 2, name: 'Other category', sortOrder: 5 });
    request.flush({ category: { ...category, name: 'Other category', sortOrder: 5, revision: 3 }, menuRevision: 4 });
  });

  it('retains a new item draft while refreshing a category archived during creation', () => {
    const { component } = editor({ entity: undefined });
    component.form.patchValue({ name: 'New soup', categoryId, pricingMode: 'fixed', price: '3.29', available: false });
    component.save();
    http.expectOne('/api/setup/items').flush({ error: {
      code: 'CATEGORY_ARCHIVED', message: 'Choose an active category.', requestId: itemId, details: { categoryId }
    } }, { status: 422, statusText: 'Unprocessable Entity' });
    component.reloadLatest();
    http.expectOne('/api/setup/categories?includeArchived=true').flush({ categories: [{ ...category, archivedAt: timestamp }], menuRevision: 2 });
    expect(component.form.getRawValue()).toMatchObject({ name: 'New soup', price: '3.29', available: false, categoryId });
    expect(component.form.enabled).toBe(true);
    component.save(); http.expectNone(() => true);
    expect(component.message()).toContain('choose an active category');
  });
});
