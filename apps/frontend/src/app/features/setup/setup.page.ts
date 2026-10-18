import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatCheckbox } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatPaginator, type PageEvent } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import type { Category, MenuItem } from '@restaurant-ordering/contracts';
import { LoadState } from '../../shared/load-state';
import { SetupEditor } from './setup-editor';
import { SetupStore } from './setup.store';

@Component({
  selector: 'app-setup-page',
  providers: [SetupStore],
  imports: [CurrencyPipe, ReactiveFormsModule, MatButton, MatCheckbox, MatFormFieldModule, MatInput, MatPaginator, MatSelectModule, LoadState],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    .filters { display: flex; gap: 1rem; flex-wrap: wrap; align-items: center; margin-top: 1.5rem; }
    .filters mat-form-field { flex: 1 1 14rem; }
    .actions { display: flex; gap: .5rem; flex-wrap: wrap; }
    .data-list strong { overflow-wrap: anywhere; }
    mat-paginator { background: transparent; }
  `],
  template: `
    <div class="page-heading"><div><p class="eyebrow">Manage the kitchen</p><h1 tabindex="-1">Setup</h1></div>
      <button mat-stroked-button (click)="store.reload()">Refresh setup</button></div>
    <p class="muted">Manage categories, prices, and availability. Changes appear live in Menu.</p>
    <app-load-state [loading]="store.items.loading() || store.categories.loading()"
      [stale]="store.items.stale() || store.categories.stale()" [error]="store.items.error() || store.categories.error()" (retry)="store.reload()" />
    <mat-checkbox [checked]="store.query().includeArchived" (change)="toggleArchived($event.checked)">Show archived records</mat-checkbox>
    <section aria-labelledby="setup-categories">
      <div class="page-heading"><h2 id="setup-categories">Categories</h2><button mat-flat-button (click)="edit('category')">Add category</button></div>
      <ul class="data-list">@for (category of visibleCategories(); track category.id) {
        <li><div><strong>{{ category.name }}</strong><p class="muted">Sort order: {{ category.sortOrder }} · {{ category.archivedAt ? 'Archived' : 'Active' }}</p></div>
          @if (!category.archivedAt) {
            <div class="actions"><button mat-button [attr.aria-label]="'Edit category ' + category.name" (click)="edit('category', category)">Edit</button>
              <button mat-button [attr.aria-label]="'Archive category ' + category.name" (click)="edit('category', category, true)">Archive</button></div>
          }
        </li>
      } @empty { <li>No categories to display.</li> }</ul>
      <mat-paginator aria-label="Category pages" [length]="store.categories.data()?.categories?.length ?? 0" [pageSize]="categoryPageSize()" [pageIndex]="categoryPageIndex()"
        [pageSizeOptions]="[10, 25, 50]" (page)="categoryPageSize.set($event.pageSize); categoryPage.set($event.pageIndex)" />
    </section>
    <section aria-labelledby="setup-items">
      <div class="page-heading"><h2 id="setup-items">Items</h2>
        <button mat-flat-button [disabled]="!hasActiveCategories()" (click)="edit('item')">Add item</button></div>
      @if (!hasActiveCategories()) { <p class="muted">Add an active category before adding items.</p> }
      <form class="filters" [formGroup]="filters" (ngSubmit)="applyFilters()">
        <mat-form-field><mat-label>Search items</mat-label><input matInput formControlName="search" maxlength="120" /></mat-form-field>
        <mat-form-field><mat-label>Filter by category</mat-label><mat-select formControlName="categoryId">
          <mat-option value="">All categories</mat-option>
          @for (category of store.categories.data()?.categories; track category.id) { <mat-option [value]="category.id">{{ category.name }}</mat-option> }
        </mat-select></mat-form-field>
        <button mat-stroked-button type="submit">Apply filters</button>
        <button mat-button type="button" (click)="clearFilters()">Clear filters</button>
      </form>
      @if (store.items.data(); as page) {
        <p class="muted">{{ page.total }} items · Page {{ page.page }}</p>
        <ul class="data-list">@for (item of page.items; track item.id) {
          <li><div><strong>{{ item.name }}</strong><p class="muted">{{ categoryName(item.categoryId) }} ·
            {{ item.pricingMode === 'open' ? 'Open price' : (item.priceMinor / 100 | currency) }} ·
            {{ item.archivedAt ? 'Archived' : item.available ? 'Available' : 'Unavailable' }}</p>
            @if (categoryArchived(item.categoryId)) { <p class="muted">Category archived — cannot be ordered</p> }
          </div>
          @if (!item.archivedAt) {
            <div class="actions"><button mat-button [attr.aria-label]="'Edit item ' + item.name" (click)="edit('item', item)">Edit</button>
              <button mat-button [attr.aria-label]="'Archive item ' + item.name" (click)="edit('item', item, true)">Archive</button></div>
          }</li>
        } @empty { <li>No items match these filters.</li> }</ul>
        <mat-paginator aria-label="Item pages" [length]="page.total" [pageSize]="store.query().pageSize" [pageIndex]="store.query().page - 1"
          [pageSizeOptions]="[10, 25, 50, 100]" (page)="itemPage($event)" />
        @if (page.items.length === 0 && store.query().page > 1) {
          <button mat-button (click)="firstPage()">Return to first item page</button>
        }
      }
    </section>
  `
})
export class SetupPage {
  readonly store = inject(SetupStore);
  private readonly dialog = inject(MatDialog);
  private readonly destroyRef = inject(DestroyRef);
  readonly filters = new FormGroup({ search: new FormControl('', { nonNullable: true }), categoryId: new FormControl('', { nonNullable: true }) });
  readonly categoryPage = signal(0);
  readonly categoryPageSize = signal(10);
  readonly categoryPageIndex = computed(() => Math.min(this.categoryPage(), Math.max(0,
    Math.ceil((this.store.categories.data()?.categories.length ?? 0) / this.categoryPageSize()) - 1)));
  readonly visibleCategories = computed(() => {
    const start = this.categoryPageIndex() * this.categoryPageSize();
    return this.store.categories.data()?.categories.slice(start, start + this.categoryPageSize()) ?? [];
  });
  readonly hasActiveCategories = computed(() => this.store.categories.data()?.categories.some((category) => category.archivedAt === null) ?? false);

  categoryName(id: string) { return this.store.categories.data()?.categories.find((c) => c.id === id)?.name ?? 'Archived category'; }
  categoryArchived(id: string) { return !this.store.categories.data()?.categories.some((c) => c.id === id && c.archivedAt === null); }
  applyFilters() {
    const { search, categoryId } = this.filters.getRawValue();
    this.store.setQuery({ ...this.store.query(), page: 1, search: search.trim(), categoryId: categoryId || undefined });
  }
  clearFilters() { this.filters.reset(); this.applyFilters(); }
  toggleArchived(includeArchived: boolean) {
    this.filters.controls.categoryId.setValue(''); this.categoryPage.set(0);
    this.store.setQuery({ ...this.store.query(), page: 1, categoryId: undefined, includeArchived });
  }
  firstPage() { this.store.setQuery({ ...this.store.query(), page: 1 }); }
  itemPage(event: PageEvent) { this.store.setQuery({ ...this.store.query(), page: event.pageIndex + 1, pageSize: event.pageSize }); }
  edit(kind: 'category' | 'item', entity?: Category | MenuItem, archive = false) {
    if (this.dialog.getDialogById('setup-editor')) return;
    this.dialog.open(SetupEditor, { id: 'setup-editor', ariaLabelledBy: 'setup-editor-title', width: '36rem', maxWidth: 'calc(100vw - 2rem)',
      autoFocus: 'first-tabbable', restoreFocus: true,
      data: { kind, entity, archive, categories: this.store.categories.data()?.categories ?? [] }
    }).afterClosed().pipe(takeUntilDestroyed(this.destroyRef)).subscribe((saved: boolean | undefined) => { if (saved) this.store.reload(); });
  }
}
