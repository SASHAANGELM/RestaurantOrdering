import { BusyButton } from '../../shared/busy-button';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { forkJoin, map, of, type Observable } from 'rxjs';
import {
  createCategorySchema, createItemSchema, decimalUnitPriceSchema, type Category, type MenuItem
} from '@restaurant-ordering/contracts';
import { ApiClient, clientError, type ClientError } from '../../core/api-client';
import { RealtimeSync } from '../../core/realtime-sync';
import { setupErrorMessage } from './setup-error';

export interface SetupEditorData {
  kind: 'category' | 'item';
  entity?: Category | MenuItem;
  categories: Category[];
  archive?: boolean;
  restore?: boolean;
}

@Component({
  selector: 'app-setup-editor',
  imports: [BusyButton, ReactiveFormsModule, MatButton, MatSlideToggle, MatDialogModule, MatFormFieldModule, MatInput, MatSelectModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    form { display: grid; gap: .75rem; padding-top: .5rem; }
    mat-form-field { width: 100%; }
    .error-panel { overflow-wrap: anywhere; }
  `],
  template: `
    <h2 mat-dialog-title id="setup-editor-title">{{ title }}</h2>
    <mat-dialog-content>
      @if (restoring) {
        <p>Restore <strong>{{ entity()?.name }}</strong>?</p>
        @if (data.kind === 'category') {
          <p>Available, nonarchived items in this category will return to Menu and can be ordered again. Individually archived items stay archived.</p>
        } @else {
          <p>This item will be restored as unavailable. Enable availability separately when it is ready to order.</p>
          @if (itemCategoryArchived()) { <p role="status">This item's category is archived. Restore the category before this item can be ordered.</p> }
        }
        <p>Existing orders keep their original details.</p>
        @if (!entity()?.archivedAt) { <p role="status">This record is already active. Close this dialog to continue.</p> }
        <div class="dialog-confirm-actions"><button mat-button [disabled]="busy()" (click)="dialog.close()">Cancel</button>
          <button [appBusy]="busy()" mat-flat-button [disabled]="busy() || !entity()?.archivedAt || conflict()" (click)="save()">{{ busy() ? 'Restoring…' : 'Restore' }}</button>
        </div>
      } @else if (archiving()) {
        <p>Archive <strong>{{ entity()?.name }}</strong>?</p>
        @if (data.kind === 'category') {
          <p>All active items in this category will disappear from Menu and cannot be ordered, including from existing carts. Their records are retained.</p>
        } @else {
          <p>This item will disappear from Menu and cannot be ordered, including from existing carts.</p>
        }
        <p>Existing orders keep their original details. You can restore this record later from archived records in Settings.</p><div class="dialog-confirm-actions"><button mat-button [disabled]="busy()" (click)="dialog.close()">Cancel</button>
        <button [appBusy]="busy()" mat-flat-button class="danger-button" [disabled]="busy() || !canArchive() || conflict()" (click)="save()">{{ busy() ? 'Archiving…' : 'Archive' }}</button>
        </div>
      } @else {
        <form id="setup-form" [formGroup]="form" (ngSubmit)="save()">
          <mat-form-field appearance="outline"><mat-label><i class="ti ti-tag" aria-hidden="true"></i> Name</mat-label><input matInput formControlName="name" maxlength="120" required /></mat-form-field>
          @if (data.kind === 'category') {
            <mat-form-field appearance="outline"><mat-label><i class="ti ti-arrows-sort" aria-hidden="true"></i> Sort order</mat-label><input matInput type="number" formControlName="sortOrder" step="1" required /></mat-form-field>
          } @else {
            <mat-form-field appearance="outline"><mat-label><i class="ti ti-category" aria-hidden="true"></i> Category</mat-label>
              <mat-select formControlName="categoryId" required>
                @for (category of categories(); track category.id) {
                  <mat-option [value]="category.id" [disabled]="category.archivedAt !== null">{{ category.name }}{{ category.archivedAt ? ' (archived)' : '' }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
            <mat-form-field appearance="outline"><mat-label><i class="ti ti-align-left" aria-hidden="true"></i> Description</mat-label><textarea matInput formControlName="description" maxlength="2000" rows="3"></textarea></mat-form-field>
            <mat-form-field appearance="outline"><mat-label><i class="ti ti-photo" aria-hidden="true"></i> Image URL</mat-label><input matInput formControlName="imageUrl" maxlength="2048" /><mat-hint>A backend /api/images/ path or an HTTPS image URL</mat-hint></mat-form-field>
            <mat-form-field appearance="outline"><mat-label><i class="ti ti-coin" aria-hidden="true"></i> Pricing</mat-label>
              <mat-select formControlName="pricingMode"><mat-option value="fixed">Fixed price</mat-option><mat-option value="open">Open price</mat-option></mat-select>
            </mat-form-field>
            @if (form.controls.pricingMode.value === 'fixed') {
              <mat-form-field appearance="outline"><mat-label><i class="ti ti-currency-dollar" aria-hidden="true"></i> Price (USD)</mat-label><input matInput formControlName="price" inputmode="decimal" required />
                <mat-hint>0.00–10,000.00, up to two decimal places</mat-hint></mat-form-field>
            } @else { <p>A price is entered when ordering. No fixed price will be saved.</p> }
            <mat-slide-toggle formControlName="available">Available for ordering</mat-slide-toggle>
          }
        </form>
      }
      @if (message(); as text) { <p class="error-panel" role="alert">{{ text }}</p> }
      @if (error()?.body; as body) { <p class="muted">Request reference: {{ body.requestId }}</p> }
      @if (conflict() || error()?.body?.code === 'CATEGORY_ARCHIVED') {
        <button [appBusy]="busy()" mat-stroked-button [disabled]="busy()" (click)="reloadLatest()">Reload latest values</button>
      }
      @if (!restoring && entity()?.archivedAt) { <p role="status">This record is archived. Close this dialog and open archived records in Settings to restore it.</p> }
      @if (!restoring && !archiving() && entity() && !entity()?.archivedAt) { <div class="danger-zone"><p>Archiving removes this {{ data.kind }} from the menu.</p>
        @if (!canArchive()) { <p>Mark this item as unavailable and save before archiving it.</p> }
        <button mat-stroked-button class="danger-button" [disabled]="busy() || conflict() || !canArchive()" (click)="beginArchive()">Archive {{ data.kind }}</button></div> }
    </mat-dialog-content>
    @if (!restoring && !archiving()) { <mat-dialog-actions align="end">
      <button mat-button [disabled]="busy()" (click)="dialog.close()"><i class="ti ti-x" aria-hidden="true"></i> Cancel</button>
      <button [appBusy]="busy()" mat-flat-button type="submit" form="setup-form" [disabled]="busy() || !!entity()?.archivedAt || conflict()">{{ busy() ? 'Saving…' : 'Save' }}</button>
    </mat-dialog-actions> }
  `
})
export class SetupEditor {
  readonly data = inject<SetupEditorData>(MAT_DIALOG_DATA);
  readonly dialog = inject(MatDialogRef<SetupEditor, boolean>);
  private readonly api = inject(ApiClient);
  private readonly sync = inject(RealtimeSync);
  private readonly destroyRef = inject(DestroyRef);
  readonly entity = signal(this.data.entity);
  readonly categories = signal(this.data.categories);
  readonly busy = signal(false);
  readonly error = signal<ClientError | null>(null);
  readonly message = signal('');
  readonly archiving = signal(this.data.archive ?? false);
  readonly restoring = this.data.restore ?? false;
  get title() { return `${this.restoring ? 'Restore' : this.archiving() ? 'Archive' : this.data.entity ? 'Edit' : 'Add'} ${this.data.kind}`; }
  itemCategoryArchived() {
    const entity = this.entity();
    return entity && 'categoryId' in entity && !this.categories().some((category) => category.id === entity.categoryId && category.archivedAt === null);
  }
  canArchive() {
    const entity = this.entity();
    return !!entity && !entity.archivedAt && (!('available' in entity) || !entity.available);
  }
  beginArchive() { if (!this.busy() && this.canArchive()) { this.archiving.set(true); this.message.set(''); } }
  readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true }),
    sortOrder: new FormControl<number | null>(0),
    categoryId: new FormControl('', { nonNullable: true }),
    description: new FormControl('', { nonNullable: true }),
    imageUrl: new FormControl('', { nonNullable: true }),
    pricingMode: new FormControl<'fixed' | 'open'>('fixed', { nonNullable: true }),
    price: new FormControl('', { nonNullable: true }),
    available: new FormControl(true, { nonNullable: true })
  });

  constructor() { this.fill(this.data.entity); }

  conflict() { return this.error()?.body?.code === 'REVISION_CONFLICT' || this.error()?.body?.code === 'INVALID_ITEM_TRANSITION'; }

  private fill(entity?: Category | MenuItem) {
    this.form.reset({ name: entity?.name ?? '', sortOrder: entity && 'sortOrder' in entity ? entity.sortOrder : 0,
      categoryId: entity && 'categoryId' in entity ? entity.categoryId : '',
      imageUrl: entity && 'categoryId' in entity ? entity.imageUrl ?? '' : '',
      description: entity && 'categoryId' in entity ? entity.description ?? '' : '',
      pricingMode: entity && 'categoryId' in entity ? entity.pricingMode : 'fixed',
      price: entity && 'categoryId' in entity && entity.pricingMode === 'fixed' ? (entity.priceMinor / 100).toFixed(2) : '',
      available: entity && 'categoryId' in entity ? entity.available : true });
  }

  private fail(failure: unknown) {
    const error = clientError(failure);
    this.error.set(error);
    this.message.set(setupErrorMessage(error));
  }

  private run(request: Observable<number>) {
    this.busy.set(true);
    this.dialog.disableClose = true;
    this.form.disable();
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (revision) => { this.sync.observe({ menuRevision: revision }); this.dialog.close(true); },
      error: (error: unknown) => { this.busy.set(false); this.dialog.disableClose = false; this.form.enable(); this.fail(error); }
    });
  }

  save() {
    if (this.busy() || this.conflict()) return;
    if (this.restoring ? !this.entity()?.archivedAt : this.entity()?.archivedAt) return;
    if (this.archiving() && !this.canArchive()) return;
    this.error.set(null); this.message.set('');
    const entity = this.entity();
    if ((this.archiving() || this.restoring) && entity) {
      const body = { expectedRevision: entity.revision, archived: !this.restoring };
      this.run(this.data.kind === 'category'
        ? this.api.updateCategory(entity.id, body).pipe(map((r) => r.menuRevision))
        : this.api.updateItem(entity.id, body).pipe(map((r) => r.menuRevision)));
      return;
    }
    const value = this.form.getRawValue();
    if (this.data.kind === 'category') {
      const result = createCategorySchema.safeParse({ name: value.name, sortOrder: value.sortOrder });
      if (!result.success) { this.message.set('Enter a name of 1–120 characters and a whole-number sort order. Your input is retained.'); return; }
      this.run(entity
        ? this.api.updateCategory(entity.id, { ...result.data, expectedRevision: entity.revision }).pipe(map((r) => r.menuRevision))
        : this.api.createCategory(result.data).pipe(map((r) => r.menuRevision)));
    } else {
      const price = decimalUnitPriceSchema.safeParse(value.price);
      if (value.pricingMode === 'fixed' && !price.success) {
        this.message.set('Enter a price from 0.00 to 10,000.00 with at most two decimal places. Your input is retained.'); return;
      }
      const result = createItemSchema.safeParse({ name: value.name, categoryId: value.categoryId,
        description: value.description, available: value.available,
        ...(value.imageUrl.trim() ? { imageUrl: value.imageUrl.trim() } : {}),
        ...(value.pricingMode === 'open' ? { pricingMode: 'open' } : { pricingMode: 'fixed', priceMinor: price.data }) });
      if (!result.success || !this.categories().some((c) => c.id === value.categoryId && c.archivedAt === null)) {
        this.message.set('Enter a name of 1–120 characters, a description up to 2,000 characters, and choose an active category and a valid image URL. Your input is retained.'); return;
      }
      this.run(entity
        ? this.api.updateItem(entity.id, { ...result.data, ...(value.imageUrl.trim() ? {} : { imageUrl: null }), expectedRevision: entity.revision }).pipe(map((r) => r.menuRevision))
        : this.api.createItem(result.data).pipe(map((r) => r.menuRevision)));
    }
  }

  /** Explicitly replaces the draft only after the user selects the recovery action. */
  reloadLatest() {
    if (this.busy()) return;
    const entity = this.entity();
    this.busy.set(true); this.dialog.disableClose = true;
    this.form.disable();
    forkJoin({
      categories: this.api.setupCategories(true),
      resolved: entity && this.data.kind === 'item' ? this.api.resolveItems({ itemIds: [entity.id] }) : of(null)
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: ({ categories, resolved }) => {
        this.sync.observe({ menuRevision: Math.max(categories.menuRevision, resolved?.menuRevision ?? 0) });
        this.categories.set(categories.categories);
        const item = resolved?.items[0];
        const latest = this.data.kind === 'category' ? categories.categories.find((c) => c.id === entity?.id)
          : item && item.state !== 'missing' ? item.item : undefined;
        this.busy.set(false); this.dialog.disableClose = false; this.form.enable();
        if (entity && !latest) { this.message.set('This record no longer exists. Your input is retained; close this dialog to continue.'); return; }
        this.entity.set(latest);
        if (entity) this.fill(latest);
        this.error.set(null);
        this.message.set('');
      },
      error: (error: unknown) => {
        this.busy.set(false); this.dialog.disableClose = false; this.form.enable();
        // Preserve the conflict and recovery action if the reload itself fails.
        this.message.set(setupErrorMessage(clientError(error)));
      }
    });
  }
}
