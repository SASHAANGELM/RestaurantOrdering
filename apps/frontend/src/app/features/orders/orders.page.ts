import { BusyButton } from '../../shared/busy-button';
import { CurrencyPipe, DatePipe, TitleCasePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatPaginator } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { RouterLink } from '@angular/router';
import { orderStatusSchema } from '@restaurant-ordering/contracts';
import { LoadState } from '../../shared/load-state';
import { OrdersStore } from './orders.store';

@Component({
  selector: 'app-orders-page',
  providers: [OrdersStore],
  imports: [BusyButton, CurrencyPipe, DatePipe, TitleCasePipe, MatButton, MatFormFieldModule, MatPaginator, MatSelectModule, RouterLink, LoadState],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`mat-form-field { margin-top: 1rem; } mat-paginator { background: transparent; }`],
  template: `
    <div class="page-heading"><div><h1 tabindex="-1">Orders</h1></div>
      <button [appBusy]="store.orders.loading()" mat-stroked-button (click)="store.reload()"><i class="ti ti-refresh" aria-hidden="true"></i> Refresh orders</button></div>
    <p class="muted">Open an order to view its details and update its kitchen status.</p>
    <mat-form-field appearance="outline"><mat-label><i class="ti ti-filter" aria-hidden="true"></i> Filter by status</mat-label><mat-select [value]="store.query().status ?? ''" (selectionChange)="store.filter($event.value || undefined)">
      <mat-option value="">All statuses</mat-option>
      @for (status of statuses; track status) { <mat-option [value]="status">{{ status | titlecase }}</mat-option> }
    </mat-select></mat-form-field>
    <app-load-state [loading]="store.orders.loading()" [stale]="store.orders.stale()" [error]="store.orders.error()" (retry)="store.reload()" />
    @if (store.orders.data(); as page) {
      <p class="muted" role="status">{{ page.total }} orders · Page {{ page.page }}</p>
      <ul class="data-list">@for (order of page.orders; track order.id) {
        <li [class]="'order-row status-' + order.status"><div><a [routerLink]="['/orders', order.id]">Order {{ order.id }}</a>
          <p class="muted">Placed {{ order.createdAt | date:'medium' }}</p></div>
          <span [class]="'status-badge status-' + order.status"><i class="ti ti-circle-filled" aria-hidden="true"></i>{{ order.status | titlecase }}</span><span>{{ order.totalMinor / 100 | currency:order.currency }}</span></li>
      } @empty { <li>No orders match this view. New orders appear automatically.</li> }</ul>
      <mat-paginator aria-label="Order pages" [length]="page.total" [pageSize]="store.query().pageSize" [pageIndex]="store.query().page - 1"
        [pageSizeOptions]="[10, 25, 50, 100]" (page)="store.page($event.pageIndex + 1, $event.pageSize)" />
      @if (page.orders.length === 0 && page.page > 1) {
        <button mat-button (click)="store.page(1, store.query().pageSize)">Return to first order page</button>
      }
    }
  `
})
export class OrdersPage {
  readonly store = inject(OrdersStore);
  readonly statuses = orderStatusSchema.options;
}
