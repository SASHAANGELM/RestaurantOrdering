import { PageHeading } from '../../shared/page-heading';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatTooltip } from '@angular/material/tooltip';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatPaginator, type PageEvent } from '@angular/material/paginator';
import { CheckoutStore } from '../checkout/checkout.store';
import { LoadState } from '../../shared/load-state';
import { CartSummary } from './cart-summary';
import { CartStore } from './cart.store';
import { MenuItemRow } from './menu-item-row';
import { MenuStore } from './menu.store';

@Component({
  selector: 'app-menu-page', providers: [MenuStore],
  imports: [PageHeading, ReactiveFormsModule, MatButton, MatTooltip, MatFormFieldModule, MatInput, MatPaginator, LoadState, MenuItemRow, CartSummary],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-heading title="Menu" headingId="menu-heading" refreshLabel="Refresh menu" [busy]="store.catalog.loading()" (refresh)="reload()" />
    <div class="menu-layout">
      <aside class="category-sidebar"><h2>Categories</h2><nav aria-label="Menu categories">
        <button type="button" [class.selected]="!filters.controls.categoryId.value" [attr.aria-pressed]="!filters.controls.categoryId.value" (click)="selectCategory('')" aria-label="All categories">All categories <span class="category-count">{{ availableTotal() }}</span></button>
        <span class="category-divider" aria-hidden="true"></span>
        @for (category of store.categories.data()?.categories; track category.id) {
          <button type="button" [class.selected]="filters.controls.categoryId.value === category.id" [attr.aria-pressed]="filters.controls.categoryId.value === category.id" (click)="selectCategory(category.id)" [attr.aria-label]="category.name">{{ category.name }} <span class="category-count">{{ category.availableCount }}</span></button>
        }
      </nav></aside>
      <section aria-label="Menu items">
        <form class="filters" [formGroup]="filters" (ngSubmit)="applyFilters()">
          <mat-form-field appearance="outline"><mat-label><i class="ti ti-search" aria-hidden="true"></i> Search menu</mat-label><input matInput formControlName="search" maxlength="120" />
            @if (filters.controls.search.value.length) { <button matSuffix mat-button type="button" class="icon-button" (click)="clearFilters()" aria-label="Clear search" matTooltip="Clear search"><i class="ti ti-x" aria-hidden="true"></i></button> }
          </mat-form-field>
        </form>
        @if (store.catalog.loading() || store.catalog.error() || store.catalog.stale()) { <app-load-state [loading]="store.catalog.loading()" [stale]="store.catalog.stale()" [error]="store.catalog.error()" (retry)="reload()" /> }
        @if (store.items.data(); as page) {
          <h2 class="results-heading" id="menu-results-heading">{{ selectedCategoryName() }}</h2><p class="muted">{{ page.total }} menu items · Page {{ page.page }}</p>
          @if (page.total) {
            <ul class="data-list menu-list" aria-label="Menu results" tabindex="0">
              @for (item of page.items; track item.id) { <li><app-menu-item-row [item]="item" [class.unavailable-card]="!item.available" /></li> }
            </ul>
            <mat-paginator aria-label="Menu pages" [length]="page.total" [pageSize]="page.pageSize" [pageIndex]="page.page - 1" [pageSizeOptions]="[10, 25, 50, 100]" (page)="itemPage($event)" />
          } @else {
            <div class="empty-menu" role="status"><i class="ti ti-search-off" aria-hidden="true"></i><h3>No dishes found</h3><p>{{ filters.controls.search.value ? 'Try another search or clear it to see more dishes.' : 'There are no dishes in this category yet.' }}</p>
              @if (filters.controls.search.value.length) { <button mat-flat-button (click)="clearFilters()">Clear search</button> }
            </div>
          }
        } @else if (store.catalog.loading()) { <p role="status">Loading menu…</p><ul class="data-list menu-list" aria-hidden="true">@for (id of skeletons; track id) { <li class="skeleton"><span></span></li> }</ul> }
      </section>
    </div><app-cart-summary />
  `,
  styles: [`
    .menu-heading { display: flex; align-items: center; gap: .75rem; margin-bottom: 1rem; } .menu-heading h1 { margin-bottom: 0; }
    .menu-layout { display: grid; grid-template-columns: 12rem minmax(0, 1fr); gap: 2rem; }
    .category-sidebar { align-self: start; position: sticky; top: 1rem; max-height: calc(100svh - 7rem); overflow-y: auto; }
    .category-sidebar h2 { margin: 0 0 1rem; font-size: 1rem; } .category-sidebar nav { display: grid; gap: .4rem; }
    .category-sidebar button { display: flex; align-items: center; gap: .4rem; justify-content: space-between; background: transparent; border: 0; border-radius: .65rem; padding: .9rem 1rem; text-align: left; font: inherit; color: #526775; cursor: pointer; overflow-wrap: anywhere; }
    .category-sidebar button:hover { background: #edf3f7; } .category-sidebar button.selected { background: #2c6c93; color: white; font-weight: 600; }
    .category-divider { display: block; height: 1px; background: #d7e2e9; margin: .3rem .5rem; }
    section { min-width: 0; } .filters mat-form-field { width: 100%; } .category-count { margin-left: auto; padding-left: .5rem; font-size: .8rem; }
    mat-paginator { background: transparent; } .results-heading { margin-top: .5rem; font-size: 1.5rem; }
    .empty-menu { width: 100%; text-align: center; padding: 4rem 1rem; } .empty-menu > i { font-size: 3.5rem; color: #7694a7; } .empty-menu h3 { font-size: 1.3rem; margin-bottom: .5rem; } .empty-menu p { color: #526775; }
    .menu-list { overflow: visible; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1rem; border: 0; border-radius: 0; background: transparent; padding: .25rem; align-content: start; }
    .skeleton span { display: block; width: 100%; height: 10rem; background: #e3eaf0; }
    .menu-list li { height: 24rem; display: block; padding: 0; border: 1px solid #d7e2e9; border-radius: 1rem; overflow: hidden; background: white; }
    @media (min-width: 1300px) { .menu-list { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
    @media (max-width: 1050px) { .menu-layout { grid-template-columns: 10rem minmax(0, 1fr); gap: 1rem; } .menu-list { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 650px) { .menu-layout { grid-template-columns: minmax(0, 1fr); } .category-sidebar { position: static; max-height: none; min-width: 0; } .category-sidebar h2 { display: none; } .category-sidebar nav { display: flex; overflow-x: auto; padding-block: .25rem .75rem; } .category-sidebar button { flex-shrink: 0; white-space: nowrap; padding: .7rem 1rem; } .category-divider { flex: 0 0 1px; width: 1px; height: 2rem; align-self: center; margin: 0 .3rem; } }
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
    inject(CheckoutStore);
    this.filters.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.applyFilters());
  }
  selectCategory(id: string) { this.filters.controls.categoryId.setValue(id); }
  selectedCategoryName() { return this.store.categories.data()?.categories.find(category => category.id === this.filters.controls.categoryId.value)?.name ?? 'All dishes'; }
  applyFilters() {
    const { search, categoryId } = this.filters.getRawValue();
    this.store.setQuery({ ...this.store.query(), page: 1, search: search.trim(), categoryId: categoryId || undefined });
  }
  clearFilters() { this.filters.controls.search.setValue(''); }
  itemPage(event: PageEvent) { this.store.setQuery({ ...this.store.query(), page: event.pageIndex + 1, pageSize: event.pageSize }); document.getElementById('menu-results-heading')?.scrollIntoView({ block: 'start', behavior: 'instant' }); }
  reload() { this.store.reload(); }
}
