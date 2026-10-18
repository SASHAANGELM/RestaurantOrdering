import { CurrencyPipe, DatePipe, TitleCasePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButton } from '@angular/material/button';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type { OrderStatus } from '@restaurant-ordering/contracts';
import { LoadState } from '../../shared/load-state';
import { OrderDetailStore } from './orders.store';

export const STATUS_ACTION_LABELS: Record<OrderStatus, string> = {
  placed: 'Place order', preparing: 'Start preparing', ready: 'Mark ready', completed: 'Complete order', cancelled: 'Cancel order'
};

@Component({
  selector: 'app-order-detail-page',
  providers: [OrderDetailStore],
  imports: [CurrencyPipe, DatePipe, TitleCasePipe, MatButton, RouterLink, LoadState],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    .actions { display: flex; gap: .75rem; flex-wrap: wrap; }
    .order-id, .data-list strong { overflow-wrap: anywhere; }
    dl { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: .75rem 1rem; max-width: 28rem; margin-left: auto; }
    dd { margin: 0; text-align: right; } .total { font-weight: 700; }
  `],
  template: `
    <a mat-button routerLink="/orders"><i class="ti ti-arrow-left" aria-hidden="true"></i> Back to orders</a>
    <div class="page-heading"><h1 tabindex="-1">Order details</h1><button mat-stroked-button (click)="store.reload()"><i class="ti ti-refresh" aria-hidden="true"></i> Refresh order</button></div>
    <app-load-state [loading]="store.detail.loading()" [stale]="store.detail.stale()" [error]="store.detail.error()" (retry)="store.reload()" />
    @if (store.current(); as order) {
      <p class="muted order-id">{{ order.id }}</p><p role="status" [class]="'status-badge status-' + order.status">Status: {{ order.status | titlecase }}</p>
      <p class="muted">Placed {{ order.createdAt | date:'medium' }} · Updated {{ order.updatedAt | date:'medium' }}</p>
      <section aria-labelledby="order-actions"><h2 id="order-actions">Kitchen status</h2>
        <div class="actions">@for (status of store.transitions(); track status) {
          <button mat-stroked-button [disabled]="!store.canAct()" (click)="store.transition(status)">{{ labels[status] }}</button>
        }</div>
        @if (store.transitions().length === 0) { <p>This order is {{ order.status }}. No further status changes are available.</p> }
        @if (store.busy()) { <p role="status">Updating order…</p> }
        @if (store.actionError(); as error) {
          <div class="error-panel" role="alert">
            <p>Could not set status to {{ store.attemptedStatus() }}.
              @if (error.body?.code === 'REVISION_CONFLICT' || error.body?.code === 'INVALID_STATUS_TRANSITION') {
                Another staff action changed this order. Your order details are retained.
              } @else { {{ error.message }} The update may have reached the server. }
            </p>
            @if (error.body; as body) { <p class="muted">Request reference: {{ body.requestId }}</p> }
            @if (store.needsRefresh()) {
              <p>Refresh the order before choosing another action.</p>
              <button mat-stroked-button [disabled]="store.detail.loading()" (click)="store.reload()"><i class="ti ti-refresh" aria-hidden="true"></i> Refresh latest status</button>
            } @else { <p>The latest status is shown. Review it before choosing another action.</p> }
          </div>
        }
      </section>
      <section aria-labelledby="order-lines"><h2 id="order-lines">Ordered items</h2>
        <ul class="data-list">@for (line of order.lines; track line.id) {
          <li><div><strong>{{ line.itemName }}</strong><p class="muted">{{ line.categoryName }} · {{ line.pricingMode === 'open' ? 'Open price' : 'Fixed price' }}</p></div>
            <span>Quantity: {{ line.quantity }} × {{ line.unitPriceMinor / 100 | currency:order.currency }}</span>
            <span>{{ line.lineTotalMinor / 100 | currency:order.currency }}</span></li>
        }</ul>
        <dl><dt>Subtotal</dt><dd>{{ order.subtotalMinor / 100 | currency:order.currency }}</dd>
          <dt>Discount</dt><dd>−{{ order.discountMinor / 100 | currency:order.currency }}</dd>
          <dt class="total">Total: {{ order.totalMinor / 100 | currency:order.currency }}</dt><dd class="total">{{ order.currency }}</dd></dl>
      </section>
    }
  `
})
export class OrderDetailPage {
  readonly store = inject(OrderDetailStore);
  readonly labels = STATUS_ACTION_LABELS;
  private readonly params = toSignal(inject(ActivatedRoute).paramMap);
  constructor() { effect(() => this.store.select(this.params()?.get('id') ?? null)); }
}
