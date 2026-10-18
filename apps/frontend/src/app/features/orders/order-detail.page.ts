import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButton } from '@angular/material/button';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { LoadState } from '../../shared/load-state';
import { OrderDetailStore } from './orders.store';

@Component({
  selector: 'app-order-detail-page',
  providers: [OrderDetailStore],
  imports: [CurrencyPipe, MatButton, RouterLink, LoadState],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a mat-button routerLink="/orders">Back to orders</a>
    <div class="page-heading"><h1 tabindex="-1">Order details</h1><button mat-stroked-button (click)="store.reload()">Refresh order</button></div>
    <app-load-state [loading]="store.detail.loading()" [stale]="store.detail.stale()" [error]="store.detail.error()" (retry)="store.reload()" />
    @if (store.detail.data(); as result) {
      <p class="muted">{{ result.order.id }}</p><p>Status: {{ result.order.status }}</p>
      <ul class="data-list">@for (line of result.order.lines; track line.id) {
        <li><strong>{{ line.itemName }}</strong><span>Quantity: {{ line.quantity }}</span><span>{{ line.lineTotalMinor / 100 | currency }}</span></li>
      }</ul>
      <p>Total: {{ result.order.totalMinor / 100 | currency }}</p>
    }
  `
})
export class OrderDetailPage {
  readonly store = inject(OrderDetailStore);
  private readonly params = toSignal(inject(ActivatedRoute).paramMap);
  constructor() { effect(() => this.store.select(this.params()?.get('id') ?? null)); }
}
