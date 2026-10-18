import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { LoadState } from '../../shared/load-state';
import { SetupStore } from './setup.store';

@Component({
  selector: 'app-setup-page',
  providers: [SetupStore],
  imports: [MatButton, LoadState],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-heading"><div><p class="eyebrow">Manage the kitchen</p><h1 tabindex="-1">Setup</h1></div>
      <button mat-stroked-button (click)="store.reload()">Refresh setup</button></div>
    <p class="muted">An overview of your kitchen’s categories and items.</p>
    <app-load-state [loading]="store.items.loading() || store.categories.loading()"
      [stale]="store.items.stale() || store.categories.stale()" [error]="store.items.error() || store.categories.error()" (retry)="store.reload()" />
    <h2>Categories</h2>
    <ul class="data-list">@for (category of store.categories.data()?.categories; track category.id) {
      <li>{{ category.name }}</li>
    } @empty { <li>No categories to display.</li> }</ul>
    <h2>Items</h2>
    @if (store.items.data(); as page) {
      <p class="muted">{{ page.total }} items · Page {{ page.page }}</p>
      <ul class="data-list">@for (item of page.items; track item.id) {
        <li><strong>{{ item.name }}</strong><span>{{ item.pricingMode === 'fixed' ? 'Fixed price' : 'Open price' }}</span></li>
      } @empty { <li>No items to display.</li> }</ul>
    }
  `
})
export class SetupPage { readonly store = inject(SetupStore); }
