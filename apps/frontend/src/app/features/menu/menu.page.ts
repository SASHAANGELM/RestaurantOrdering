import { RouterLink } from '@angular/router';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatPaginator, type PageEvent } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { CheckoutStore } from '../checkout/checkout.store';
import { LoadState } from '../../shared/load-state';
import { CartSummary } from './cart-summary';
import { CartStore } from './cart.store';
import { MenuItemRow } from './menu-item-row';
import { MenuStore } from './menu.store';

@Component({
  selector: 'app-menu-page', providers: [MenuStore],
  imports: [ReactiveFormsModule, MatButton, MatFormFieldModule, MatInput, MatPaginator, MatSelectModule, LoadState, MenuItemRow, CartSummary, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-heading"><div><p class="eyebrow">Explore the kitchen</p><h1 id="menu-heading" tabindex="-1">Menu</h1></div>
      <div class="heading-actions"><a mat-stroked-button routerLink="/cart"><i class="ti ti-shopping-cart" aria-hidden="true"></i> View cart</a>
        <button mat-stroked-button (click)="reload()"><i class="ti ti-refresh" aria-hidden="true"></i> Refresh menu</button></div></div>
    <p class="muted">Explore the menu, with current prices and availability.</p>
    <div class="menu-layout">
      <aside class="category-sidebar"><h2><i class="ti ti-category" aria-hidden="true"></i> Categories</h2><nav aria-label="Menu categories">
        <button type="button" [class.selected]="!filters.controls.categoryId.value" [attr.aria-pressed]="!filters.controls.categoryId.value" (click)="selectCategory('')" aria-label="All categories" aria-describedby="category-count-all">All categories <span class="category-count" id="category-count-all">{{ availableTotal() }}</span></button>
        @for (category of store.categories.data()?.categories; track category.id) {
          <button type="button" [class.selected]="filters.controls.categoryId.value === category.id" [attr.aria-pressed]="filters.controls.categoryId.value === category.id" (click)="selectCategory(category.id)" [attr.aria-label]="category.name" [attr.aria-describedby]="'count-' + category.id">{{ category.name }} <span class="category-count" [id]="'count-' + category.id">{{ category.availableCount ?? 0 }}</span></button>
        }
      </nav></aside>
      <section aria-label="Menu items">
      <form class="filters" [formGroup]="filters" (ngSubmit)="applyFilters()">
        <mat-form-field><mat-label><i class="ti ti-search" aria-hidden="true"></i> Search menu</mat-label><input matInput formControlName="search" maxlength="120" /></mat-form-field>
        <mat-form-field class="mobile-category"><mat-label>Menu category</mat-label><mat-select formControlName="categoryId">
          <mat-option value="">All categories</mat-option>
          @for (category of store.categories.data()?.categories; track category.id) { <mat-option [value]="category.id">{{ category.name }}</mat-option> }
        </mat-select></mat-form-field>
        <button mat-button type="button" (click)="clearFilters()"><i class="ti ti-filter-off" aria-hidden="true"></i> Clear filters</button>
      </form>
      <app-load-state [loading]="store.items.loading() || store.categories.loading()"
        [stale]="store.items.stale() || store.categories.stale()" [error]="store.items.error() || store.categories.error()" (retry)="reload()" />
      @if (store.items.data(); as page) {
        <h2 class="results-heading" id="menu-results-heading">{{ selectedCategoryName() }}</h2><p class="muted">{{ page.total }} menu items · Page {{ page.page }}</p>
        <ul class="data-list menu-list" aria-label="Menu results" tabindex="0" [attr.aria-busy]="store.items.loading()">
          @for (item of page.items; track item.id) { <li><app-menu-item-row [item]="item" [class.unavailable-card]="!item.available" /></li> }
          @empty { <li>No menu items match. Try clearing your filters or add items in Setup.</li> }
        </ul>
        <mat-paginator aria-label="Menu pages" [length]="page.total" [pageSize]="store.query().pageSize" [pageIndex]="store.query().page - 1"
          [pageSizeOptions]="[10, 25, 50, 100]" (page)="itemPage($event)" />
        @if (!page.items.length && store.query().page > 1) { <button mat-button (click)="firstPage()">Return to first menu page</button> }
      } @else if (store.items.loading()) {
        <p role="status">Loading menu…</p><ul class="data-list menu-list" aria-hidden="true">
          @for (id of skeletons; track id) { <li class="skeleton"><span></span></li> }
        </ul>
      }
    </section></div><app-cart-summary />
  `,
  styles: [`
    .menu-layout { display: grid; grid-template-columns: 12rem minmax(0, 1fr); gap: 2rem; }
    .heading-actions { display: flex; gap: .5rem; flex-wrap: wrap; }
    .category-sidebar { align-self: start; position: sticky; top: 1rem; max-height: calc(100svh - 7rem); overflow-y: auto; }
    .category-sidebar h2 { margin: 0 0 1rem; font-size: 1rem; }
    .category-sidebar nav { display: grid; gap: .4rem; }
    .category-sidebar button { background: transparent; border: 0; border-radius: .65rem; padding: .9rem 1rem; text-align: left; font: inherit; color: #526775; cursor: pointer; overflow-wrap: anywhere; }
    .category-sidebar button:hover { background: #edf3f7; }
    .category-sidebar button.selected { background: #2c6c93; color: white; font-weight: 600; }
    section { min-width: 0; } .filters { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem; }
    .category-count { margin-left: auto; padding-left: .5rem; font-size: .8rem; }
    .category-sidebar button { display: flex; align-items: center; gap: .4rem; justify-content: space-between; }
    app-load-state { display: flow-root; min-height: 4rem; }
    mat-form-field { flex: 1 1 12rem; min-width: 0; } mat-paginator { background: transparent; }
    .mobile-category { display: none; } .results-heading { margin: 0; font-size: 1.5rem; }
    .menu-list { min-height: clamp(24rem, 70svh, 50rem); overflow: visible; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1rem; border: 0; border-radius: 0; background: transparent; padding: .25rem; align-content: start; }
    .menu-list li { height: 24rem; min-height: 24rem; display: block; padding: 0; border: 1px solid #d7e2e9; border-radius: 1rem; overflow: hidden; background: white; }
    .skeleton span { display: block; width: 100%; height: 10rem; background: #e3eaf0; }
    @media (min-width: 1300px) { .menu-list { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
    @media (max-width: 1050px) { .menu-layout { grid-template-columns: 10rem minmax(0, 1fr); gap: 1rem; } .menu-list { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 650px) { .menu-layout { grid-template-columns: minmax(0, 1fr); } .category-sidebar { display: none; } .mobile-category { display: block; } .menu-list { gap: .75rem; } }
    @media (max-width: 440px) { .menu-list { grid-template-columns: minmax(0, 1fr); } }
  `]
})
export class MenuPage {
  readonly store = inject(MenuStore);
  readonly cart = inject(CartStore);
  readonly availableTotal = computed(() => this.store.categories.data()?.categories.reduce((sum, category) => sum + (category.availableCount ?? 0), 0) ?? 0);
  private readonly destroyRef = inject(DestroyRef);
  readonly skeletons = Array.from({ length: 50 }, (_, index) => index);
  readonly filters = new FormGroup({ search: new FormControl('', { nonNullable: true }), categoryId: new FormControl('', { nonNullable: true }) });
  constructor() {
    // Restore a pending checkout lock even when the customer reloads on Menu.
    inject(CheckoutStore);
    this.filters.controls.search.valueChanges.pipe(debounceTime(250), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef)).subscribe(() => this.applyFilters());
    this.filters.controls.categoryId.valueChanges.pipe(distinctUntilChanged(), takeUntilDestroyed(this.destroyRef)).subscribe(() => this.applyFilters());
  }
  selectCategory(id: string) { this.filters.controls.categoryId.setValue(id); }
  selectedCategoryName() { return this.store.categories.data()?.categories.find((category) => category.id === this.filters.controls.categoryId.value)?.name ?? 'All dishes'; }
  applyFilters() {
    const { search, categoryId } = this.filters.getRawValue();
    this.store.setQuery({ ...this.store.query(), page: 1, search: search.trim(), categoryId: categoryId || undefined });
  }
  clearFilters() { this.filters.reset(undefined, { emitEvent: false }); this.applyFilters(); }
  itemPage(event: PageEvent) {
    this.store.setQuery({ ...this.store.query(), page: event.pageIndex + 1, pageSize: event.pageSize });
    document.getElementById('menu-results-heading')?.scrollIntoView({ block: 'start', behavior: 'instant' });
  }
  firstPage() { this.store.setQuery({ ...this.store.query(), page: 1 }); }
  reload() { this.store.reload(); this.cart.resolved.reload(); }
}
