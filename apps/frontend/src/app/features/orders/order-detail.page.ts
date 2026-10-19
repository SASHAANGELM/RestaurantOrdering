import { CurrencyPipe, DatePipe, TitleCasePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type { OrderStatus } from '@restaurant-ordering/contracts';
import { BusyButton } from '../../shared/busy-button';
import { ConfirmDialog } from '../../shared/confirm-dialog';
import { ItemImage } from '../../shared/item-image';
import { LoadState } from '../../shared/load-state';
import { OrderDetailStore } from './orders.store';

export const STATUS_ACTION_LABELS: Record<OrderStatus, string> = {
  placed: 'Place order', preparing: 'Start preparing', ready: 'Mark ready', completed: 'Complete order', cancelled: 'Cancel order'
};

@Component({
  selector: 'app-order-detail-page',
  providers: [OrderDetailStore],
  imports: [BusyButton, ItemImage, CurrencyPipe, DatePipe, TitleCasePipe, MatButton, RouterLink, LoadState],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    .timeline { list-style: none; border-left: 2px solid #c7d5df; padding-left: 1.25rem; } .timeline li { display: flex; align-items: center; flex-wrap: wrap; gap: 1rem; margin-block: 1rem; } time { font-size: .9rem; color: #526775; }
    .actions { display: flex; gap: .75rem; flex-wrap: wrap; }
    .order-id, .data-list strong { overflow-wrap: anywhere; }
    dl { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: .75rem 1rem; max-width: 28rem; margin-left: auto; }
    dd { margin: 0; text-align: right; } .total { font-weight: 700; }
  `],
  template: `
    <a mat-button routerLink="/orders"><i class="ti ti-arrow-left" aria-hidden="true"></i> Back to orders</a>
    <div class="page-heading"><h1 tabindex="-1">Order details</h1><button [appBusy]="store.detail.loading()" mat-stroked-button (click)="store.reload()"><i class="ti ti-refresh" aria-hidden="true"></i> Refresh order</button></div>
    <app-load-state [loading]="store.detail.loading()" [stale]="store.detail.stale()" [error]="store.detail.error()" (retry)="store.reload()" />
    @if (store.current(); as order) {
      <p class="muted order-id">{{ order.id }}</p><p role="status" [class]="'status-badge status-' + order.status">Status: {{ order.status | titlecase }}</p>
      <p class="muted">Placed {{ order.createdAt | date:'medium' }} · Updated {{ order.updatedAt | date:'medium' }}</p>
      <section aria-labelledby="order-actions"><h2 id="order-actions">Kitchen status</h2>
        <div class="actions">@for (status of store.transitions(); track status) {
          <button [appBusy]="store.busy()" mat-stroked-button [disabled]="!store.canAct()" (click)="transition(status)">{{ labels[status] }}</button>
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
              <button [appBusy]="store.detail.loading()" mat-stroked-button [disabled]="store.detail.loading()" (click)="store.reload()"><i class="ti ti-refresh" aria-hidden="true"></i> Refresh latest status</button>
            } @else { <p>The latest status is shown. Review it before choosing another action.</p> }
          </div>
        }
      </section>
      <section aria-labelledby="order-timeline"><h2 id="order-timeline">Order timeline</h2>
        <ol class="timeline">@for (event of order.history ?? [{status: 'placed', changedAt: order.createdAt}]; track $index) {
          <li><span [class]="'status-badge status-' + event.status">{{ event.status | titlecase }}</span><time [attr.datetime]="event.changedAt">{{ event.changedAt | date:'medium' }}</time></li>
        }</ol>
        @if ((order.history?.length ?? 0) < order.revision) { <p class="muted">Earlier status changes were not recorded for this order.</p> }
      </section>
      <section aria-labelledby="order-lines"><h2 id="order-lines">Ordered items</h2>
        <ul class="data-list">@for (line of order.lines; track line.id) {
          <li><app-item-image [src]="line.imageUrl" [name]="line.itemName" /><div><strong>{{ line.itemName }}</strong>@if (line.comment) { <p class="kitchen-comment"><i class="ti ti-message" aria-hidden="true"></i> {{ line.comment }}</p> }<p class="muted">{{ line.categoryName }} · {{ line.pricingMode === 'open' ? 'Open price' : 'Fixed price' }}</p></div>
            <span>Quantity: {{ line.quantity }} × {{ line.unitPriceMinor / 100 | currency:order.currency }}</span>
            <span>{{ line.lineTotalMinor / 100 | currency:order.currency }}</span></li>
        }</ul>
        <dl><dt>Subtotal</dt><dd>{{ order.subtotalMinor / 100 | currency:order.currency }} {{ order.currency }}</dd>
          @if (order.discountMinor > 0) {
            <dt>Discount</dt><dd>−{{ order.discountMinor / 100 | currency:order.currency }} {{ order.currency }}</dd>
          }
          <dt class="total">Total:</dt><dd class="total">{{ order.totalMinor / 100 | currency:order.currency }} {{ order.currency }}</dd></dl>
      </section>
    }
  `
})
export class OrderDetailPage {
  readonly store = inject(OrderDetailStore);
  private readonly dialog = inject(MatDialog);
  transition(status: OrderStatus) {
    if (status !== 'cancelled') { this.store.transition(status); return; }
    if (!this.store.canAct()) return;
    const order = this.store.current();
    this.dialog.open(ConfirmDialog, { data: { title: 'Cancel order?', message: 'This order will be cancelled. This cannot be undone.', action: 'Cancel order' }, width: '26rem' }).afterClosed().subscribe((confirmed: boolean) => {
      if (confirmed && this.store.current()?.id === order?.id && this.store.current()?.revision === order?.revision) this.store.transition(status);
    });
  }
  readonly labels = STATUS_ACTION_LABELS;
  private readonly params = toSignal(inject(ActivatedRoute).paramMap);
  constructor() { effect(() => this.store.select(this.params()?.get('id') ?? null)); }
}
