import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { MatButton } from '@angular/material/button';
import { LoadState } from '../../shared/load-state';
import { MenuStore } from './menu.store';

@Component({
  selector: 'app-menu-page',
  providers: [MenuStore],
  imports: [CurrencyPipe, MatButton, LoadState],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-heading"><div><p class="eyebrow">Explore the kitchen</p><h1 tabindex="-1">Menu</h1></div>
      <button mat-stroked-button (click)="store.reload()">Refresh menu</button></div>
    <p class="muted">Explore the menu, with current prices and availability.</p>
    <app-load-state [loading]="store.items.loading() || store.categories.loading()"
      [stale]="store.items.stale() || store.categories.stale()" [error]="store.items.error() || store.categories.error()" (retry)="store.reload()" />
    @if (store.items.data(); as page) {
      <p class="muted">{{ page.total }} menu items · Page {{ page.page }}</p>
      <ul class="data-list">
        @for (item of page.items; track item.id) {
          <li><div><strong>{{ item.name }}</strong><p class="muted">{{ item.description }}</p></div>
            <span>{{ item.pricingMode === 'open' ? 'Open price' : (item.priceMinor / 100 | currency) }}</span>
            @if (!item.available) { <span>Unavailable</span> }</li>
        } @empty { <li>The menu is empty. Items added in Setup will appear here.</li> }
      </ul>
    }
  `
})
export class MenuPage { readonly store = inject(MenuStore); }
