import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { RouterLink } from '@angular/router';
import { LoadState } from '../../shared/load-state';
import { OrdersStore } from './orders.store';

@Component({
  selector: 'app-orders-page',
  providers: [OrdersStore],
  imports: [CurrencyPipe, MatButton, RouterLink, LoadState],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-heading"><div><p class="eyebrow">From kitchen to table</p><h1 tabindex="-1">Orders</h1></div>
      <button mat-stroked-button (click)="store.reload()">Refresh orders</button></div>
    <p class="muted">Keep track of orders placed with your kitchen.</p>
    <app-load-state [loading]="store.orders.loading()" [stale]="store.orders.stale()" [error]="store.orders.error()" (retry)="store.reload()" />
    @if (store.orders.data(); as page) {
      <p class="muted">{{ page.total }} orders · Page {{ page.page }}</p>
      <ul class="data-list">@for (order of page.orders; track order.id) {
        <li><a [routerLink]="['/orders', order.id]">Order {{ order.id }}</a><span>{{ order.status }}</span><span>{{ order.totalMinor / 100 | currency }}</span></li>
      } @empty { <li>No orders yet. Placed orders will appear here.</li> }</ul>
    }
  `
})
export class OrdersPage { readonly store = inject(OrdersStore); }
