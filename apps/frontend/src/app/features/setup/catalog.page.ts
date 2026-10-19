import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiClient, clientError } from '../../core/api-client';
import { setupErrorMessage } from './setup-error';
import { RealtimeSync } from '../../core/realtime-sync';
import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatCheckbox } from '@angular/material/checkbox';
import { MatSlideToggle, type MatSlideToggleChange } from '@angular/material/slide-toggle';
import { ItemImage } from '../../shared/item-image';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatTooltip } from '@angular/material/tooltip';
import { MatInput } from '@angular/material/input';
import { MatPaginator } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import type { Category, MenuItem } from '@restaurant-ordering/contracts';
import { PageHeading } from '../../shared/page-heading';
import { Breadcrumbs } from '../../shared/breadcrumbs';
import { LoadState } from '../../shared/load-state';
import { SetupEditor } from './setup-editor';
import { SetupStore, type ItemGroup } from './setup.store';

@Component({
  selector: 'app-catalog-page',
  providers: [SetupStore],
  imports: [MatTooltip, PageHeading, Breadcrumbs, ItemImage, MatSlideToggle, RouterLink, CurrencyPipe, ReactiveFormsModule, MatButton, MatCheckbox, MatFormFieldModule, MatInput, MatPaginator, MatSelectModule, LoadState],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    .availability-control { position: relative; } .availability-control.saving::after { content: ''; position: absolute; inset: 0; background: #ffffffb3; } .availability-control.saving::before { content: ''; position: absolute; z-index: 1; left: calc(50% - .6rem); top: calc(50% - .6rem); width: 1.2rem; height: 1.2rem; border: 2px solid #b7c9d4; border-top-color: #2c6c93; border-radius: 50%; animation: button-spin .7s linear infinite; }
    .filters { display: flex; gap: 1rem; flex-wrap: wrap; align-items: center; margin-top: 1.5rem; }
    .filters mat-form-field { flex: 1 1 14rem; }
    .actions { display: flex; align-items: center; gap: .5rem; flex-wrap: wrap; } .availability-control { display: inline-flex; align-items: center; }
    .catalog-heading { display: flex; align-items: center; gap: .75rem; margin-bottom: 1rem; } .catalog-heading h1 { margin: 0; }
    details { margin-block: 1rem; border: 1px solid #d7e2e9; border-radius: .75rem; padding: 1rem; } summary { cursor: pointer; font-weight: 600; font-size: 1.15rem; } .section-count { color: #526775; font-size: .9rem; margin-left: .5rem; }
    .item-link { color: inherit; text-decoration: none; } .item-link:hover { text-decoration: underline; }
    .item-copy { flex: 1; min-width: 12rem; } .data-list strong { overflow-wrap: anywhere; }
    mat-paginator { background: transparent; }
  `],
  template: `
    <app-breadcrumbs [items]="[{label: 'Settings', path: '/setup'}, {label: kind === 'categories' ? 'Categories' : 'Items'}]" />
    <app-page-heading [title]="kind === 'categories' ? 'Categories' : 'Items'" [refreshLabel]="kind === 'categories' ? 'Refresh categories' : 'Refresh items'" [busy]="store.catalog.loading()" (refresh)="store.reload()" />
    @if (availabilityError()) { <p class="error-panel" role="alert">{{ availabilityError() }}</p> }
    <app-load-state [loading]="store.catalog.loading()"
      [stale]="store.catalog.stale()" [error]="store.catalog.error()" (retry)="store.reload()" />
    @if (kind === 'categories') {
    <mat-checkbox [checked]="store.query().includeArchived" (change)="toggleArchived($event.checked)">Show archived records</mat-checkbox>
    <section aria-labelledby="setup-categories">
      <div class="page-heading"><h2 id="setup-categories">Categories</h2><button mat-flat-button (click)="edit('category')"><i class="ti ti-plus" aria-hidden="true"></i> Add category</button></div>
      <ul class="data-list">@for (category of visibleCategories(); track category.id) {
        <li><div><strong>{{ category.name }}</strong><p class="muted">Sort order: {{ category.sortOrder }} · {{ category.archivedAt ? 'Archived' : 'Active' }}</p></div>
          @if (!category.archivedAt) {
            <div class="actions"><button mat-button [attr.aria-label]="'Edit category ' + category.name" (click)="edit('category', category)"><i class="ti ti-edit" aria-hidden="true"></i> Edit</button></div>
          } @else {
            <div class="actions"><button mat-button [attr.aria-label]="'Restore category ' + category.name" (click)="edit('category', category, true)"><i class="ti ti-restore" aria-hidden="true"></i> Restore</button></div>
          }
        </li>
      } @empty { <li>No categories to display.</li> }</ul>
      <mat-paginator aria-label="Category pages" [length]="store.visibleCategories().length" [pageSize]="categoryPageSize()" [pageIndex]="categoryPageIndex()"
        [pageSizeOptions]="[10, 25, 50]" (page)="categoryPageSize.set($event.pageSize); categoryPage.set($event.pageIndex)" />
    </section>
    } @else {
    <section aria-labelledby="setup-items">
      <div class="page-heading"><h2 id="setup-items">Items</h2>
        <button mat-flat-button [disabled]="!hasActiveCategories()" (click)="edit('item')"><i class="ti ti-plus" aria-hidden="true"></i> Add item</button></div>
      @if (!hasActiveCategories()) { <p class="muted">Add an active category before adding items.</p> }
      <form class="filters" [formGroup]="filters" (ngSubmit)="applyFilters()">
        <mat-form-field appearance="outline"><mat-label><i class="ti ti-search" aria-hidden="true"></i> Search items</mat-label><input matInput formControlName="search" maxlength="120" />
          @if (filters.controls.search.value) { <button matSuffix mat-button type="button" class="icon-button" aria-label="Clear item search" matTooltip="Clear search" (click)="filters.controls.search.setValue('')"><i class="ti ti-x" aria-hidden="true"></i></button> }</mat-form-field>
        <mat-form-field appearance="outline"><mat-label><i class="ti ti-category" aria-hidden="true"></i> Filter by category</mat-label><mat-select formControlName="categoryId">
          <mat-option value="">All categories</mat-option>
          @for (category of store.categories(); track category.id) { <mat-option [value]="category.id">{{ category.name }}</mat-option> }
        </mat-select></mat-form-field>
      </form>
      @if (store.catalog.data()) {
        @for (group of store.groups(); track group.key) {
          <details [open]="expanded()[group.key]" (toggle)="setExpanded(group.key, $event)">
            <summary>{{ group.label }}<span class="section-count">{{ group.total }}</span></summary>
            <section [attr.aria-label]="group.label">
              <p class="muted">{{ group.total }} items · Page {{ group.page }}</p>
              <ul class="data-list">@for (item of group.items; track item.id) {
                <li [class.record-unavailable]="!item.available"><app-item-image [src]="item.imageUrl" [name]="item.name" /><div class="item-copy"><strong><a class="item-link" [routerLink]="['/items', item.id]">{{ item.name }}</a></strong><p class="muted">{{ categoryName(item.categoryId) }} ·
                  {{ item.pricingMode === 'open' ? 'Open price' : (item.priceMinor / 100 | currency) }} ·
                  {{ item.archivedAt ? 'Archived' : item.available ? 'Available' : 'Unavailable' }}</p>
                  @if (categoryArchived(item.categoryId)) { <p class="muted">Category archived — cannot be ordered</p> }
                </div>
                @if (!item.archivedAt) {
                  <div class="actions"><span class="availability-control" [class.saving]="availabilityBusy() === item.id" [attr.aria-busy]="availabilityBusy() === item.id"><mat-slide-toggle [checked]="item.available" [disabled]="availabilityBusy() !== null" [aria-label]="'Available ' + item.name" (change)="setAvailability(item, $event)">Available</mat-slide-toggle>@if (availabilityBusy() === item.id) { <span class="sr-only" role="status">Saving availability…</span> }</span>
                    <button mat-button [attr.aria-label]="'Edit item ' + item.name" (click)="edit('item', item)"><i class="ti ti-edit" aria-hidden="true"></i> Edit</button></div>
                } @else {
                  <div class="actions"><button mat-button [attr.aria-label]="'Restore item ' + item.name" (click)="edit('item', item, true)"><i class="ti ti-restore" aria-hidden="true"></i> Restore</button></div>
                }</li>
              } @empty { <li>No {{ group.key }} items match these filters.</li> }</ul>
              <mat-paginator [attr.aria-label]="group.label + ' pages'" [length]="group.total" [pageSize]="group.pageSize" [pageIndex]="group.page - 1"
                [pageSizeOptions]="[10, 25, 50, 100]" (page)="store.page(group.key, $event.pageIndex + 1, $event.pageSize)" />
            </section>
          </details>
        }
      }
    </section>
    }
  `
})
export class CatalogPage {
  readonly kind = inject(ActivatedRoute).snapshot.data['kind'] as 'categories' | 'items';
  readonly store = inject(SetupStore);
  private readonly api = inject(ApiClient);
  private readonly sync = inject(RealtimeSync);
  readonly availabilityBusy = signal<string | null>(null);
  readonly availabilityError = signal('');
  setAvailability(item: MenuItem, event: MatSlideToggleChange) {
    const available = event.checked;
    // Keep the authoritative value visible until a revision-checked write succeeds.
    event.source.checked = item.available;
    if (this.availabilityBusy()) { this.store.reload(); return; }
    this.availabilityBusy.set(item.id); this.availabilityError.set('');
    this.api.updateItem(item.id, { available, expectedRevision: item.revision }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (result) => { this.sync.observe({ menuRevision: result.menuRevision }); this.availabilityBusy.set(null); this.store.reload(); },
      error: (error: unknown) => { this.availabilityError.set(setupErrorMessage(clientError(error))); this.availabilityBusy.set(null); this.store.reload(); }
    });
  }
  private readonly dialog = inject(MatDialog);
  private readonly destroyRef = inject(DestroyRef);
  readonly filters = new FormGroup({ search: new FormControl('', { nonNullable: true }), categoryId: new FormControl('', { nonNullable: true }) });
  readonly expanded = signal<Record<ItemGroup, boolean>>({ available: true, unavailable: true, archived: false });
  setExpanded(key: ItemGroup, event: Event) {
    const open = (event.target as HTMLDetailsElement).open;
    this.expanded.update(value => value[key] === open ? value : { ...value, [key]: open });
  }
  constructor() { this.filters.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.applyFilters()); }
  readonly categoryPage = signal(0);
  readonly categoryPageSize = signal(10);
  readonly categoryPageIndex = computed(() => Math.min(this.categoryPage(), Math.max(0,
    Math.ceil(this.store.visibleCategories().length / this.categoryPageSize()) - 1)));
  readonly visibleCategories = computed(() => {
    const start = this.categoryPageIndex() * this.categoryPageSize();
    return this.store.visibleCategories().slice(start, start + this.categoryPageSize());
  });
  readonly hasActiveCategories = computed(() => this.store.categories().some((category) => category.archivedAt === null) ?? false);

  categoryName(id: string) { return this.store.categories().find((c) => c.id === id)?.name ?? 'Archived category'; }
  categoryArchived(id: string) { return !this.store.categories().some((c) => c.id === id && c.archivedAt === null); }
  applyFilters() {
    const { search, categoryId } = this.filters.getRawValue();
    this.store.setQuery({ ...this.store.query(), page: 1, search: search.trim(), categoryId: categoryId || undefined });
  }
  clearFilters() { this.filters.reset(); this.applyFilters(); }
  toggleArchived(includeArchived: boolean) {
    this.filters.controls.categoryId.setValue(''); this.categoryPage.set(0);
    this.store.setQuery({ ...this.store.query(), page: 1, categoryId: undefined, includeArchived });
  }
  edit(kind: 'category' | 'item', entity?: Category | MenuItem, restore = false) {
    if (this.dialog.getDialogById('setup-editor')) return;
    this.dialog.open(SetupEditor, { id: 'setup-editor', ariaLabelledBy: 'setup-editor-title', width: '36rem', maxWidth: 'calc(100vw - 2rem)',
      autoFocus: 'first-tabbable', restoreFocus: true,
      data: { kind, entity, restore, categories: this.store.categories() ?? [] }
    }).afterClosed().pipe(takeUntilDestroyed(this.destroyRef)).subscribe((saved: boolean | undefined) => { if (saved) this.store.reload(); });
  }
}
