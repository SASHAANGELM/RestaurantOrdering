import { ChangeDetectionStrategy, Component, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatPaginator, type PageEvent } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { LoadState } from '../../shared/load-state';
import { CartPanel } from './cart-panel';
import { CartStore } from './cart.store';
import { MenuItemRow } from './menu-item-row';
import { MenuStore } from './menu.store';

@Component({
  selector: 'app-menu-page', providers: [MenuStore],
  imports: [ReactiveFormsModule, MatButton, MatFormFieldModule, MatInput, MatPaginator, MatSelectModule, LoadState, MenuItemRow, CartPanel],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-heading"><div><p class="eyebrow">Explore the kitchen</p><h1 id="menu-heading" tabindex="-1">Menu</h1></div>
      <div class="heading-actions"><a mat-stroked-button href="#cart-heading">View cart ({{ cart.lines().length }})</a>
        <button mat-stroked-button (click)="reload()">Refresh menu</button></div></div>
    <p class="muted">Explore the menu, with current prices and availability.</p>
    <div class="menu-layout"><section aria-label="Menu items">
      <form class="filters" [formGroup]="filters" (ngSubmit)="applyFilters()">
        <mat-form-field><mat-label>Search menu</mat-label><input matInput formControlName="search" maxlength="120" /></mat-form-field>
        <mat-form-field><mat-label>Menu category</mat-label><mat-select formControlName="categoryId">
          <mat-option value="">All categories</mat-option>
          @for (category of store.categories.data()?.categories; track category.id) { <mat-option [value]="category.id">{{ category.name }}</mat-option> }
        </mat-select></mat-form-field>
        <button mat-button type="button" (click)="clearFilters()">Clear filters</button>
      </form>
      <app-load-state [loading]="store.items.loading() || store.categories.loading()"
        [stale]="store.items.stale() || store.categories.stale()" [error]="store.items.error() || store.categories.error()" (retry)="reload()" />
      @if (store.items.data(); as page) {
        <p class="muted">{{ page.total }} menu items · Page {{ page.page }}</p>
        <ul class="data-list menu-list" [attr.aria-busy]="store.items.loading()">
          @for (item of page.items; track item.id) { <li><app-menu-item-row [item]="item" /></li> }
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
    </section><app-cart-panel /></div>
  `,
  styles: [`
    .menu-layout { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(17rem, 1fr); gap: 2rem; }
    .heading-actions { display: flex; gap: .5rem; flex-wrap: wrap; }
    section { min-width: 0; } .filters { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem; }
    mat-form-field { flex: 1 1 12rem; min-width: 0; } mat-paginator { background: transparent; }
    .menu-list li { min-height: 10rem; } .skeleton span { width: 100%; height: 5.5rem; background: #e4e9e1; border-radius: .25rem; }
    @media (max-width: 850px) { .menu-layout { grid-template-columns: minmax(0, 1fr); } }
  `]
})
export class MenuPage {
  readonly store = inject(MenuStore);
  readonly cart = inject(CartStore);
  private readonly destroyRef = inject(DestroyRef);
  readonly skeletons = Array.from({ length: 50 }, (_, index) => index);
  readonly filters = new FormGroup({ search: new FormControl('', { nonNullable: true }), categoryId: new FormControl('', { nonNullable: true }) });
  constructor() {
    this.filters.controls.search.valueChanges.pipe(debounceTime(250), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef)).subscribe(() => this.applyFilters());
    this.filters.controls.categoryId.valueChanges.pipe(distinctUntilChanged(), takeUntilDestroyed(this.destroyRef)).subscribe(() => this.applyFilters());
  }
  applyFilters() {
    const { search, categoryId } = this.filters.getRawValue();
    this.store.setQuery({ ...this.store.query(), page: 1, search: search.trim(), categoryId: categoryId || undefined });
  }
  clearFilters() { this.filters.reset(undefined, { emitEvent: false }); this.applyFilters(); }
  itemPage(event: PageEvent) { this.store.setQuery({ ...this.store.query(), page: event.pageIndex + 1, pageSize: event.pageSize }); }
  firstPage() { this.store.setQuery({ ...this.store.query(), page: 1 }); }
  reload() { this.store.reload(); this.cart.resolved.reload(); }
}
