import { BusyButton } from '../../shared/busy-button';
import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { RouterLink } from '@angular/router';
import { RealtimeSync } from '../../core/realtime-sync';
import { CheckoutStore } from './checkout.store';

@Component({
  selector: 'app-checkout-panel', imports: [BusyButton, CurrencyPipe, MatButton, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section aria-labelledby="checkout-heading" [attr.aria-busy]="checkout.busy()">
      <h3 id="checkout-heading" class="sr-only">Place order</h3>
      @if (checkout.storageNotice()) { <p class="error-panel" role="alert">{{ checkout.storageNotice() }}</p> }
      @if (checkout.message()) { <p class="checkout-issue" role="status"><i class="ti ti-alert-circle" aria-hidden="true"></i> {{ checkout.message() }}</p> }
      @if (blocker(); as reason) { <p class="checkout-issue" role="status"><i class="ti ti-alert-circle" aria-hidden="true"></i> {{ reason }}</p> }
      @if (checkout.completedOrderId(); as id) { <a mat-button [routerLink]="['/orders', id]">Open confirmed order</a> }
      @if (checkout.busy() && checkout.attempt()) { <button class="confirm-order" mat-flat-button [appBusy]="true" disabled>Confirm order</button> } @else if (checkout.attempt(); as attempt) {
        <h4>Pending checkout</h4>
        <p>Your cart is frozen until this checkout is resolved. Checking or retrying uses the original request.</p>
        <p class="request-key">Recovery key: {{ attempt.key }}</p>
        <p>Reviewed total: {{ attempt.quote.totalMinor / 100 | currency }}</p>
        <div class="actions"><button [appBusy]="checkout.busy()" mat-stroked-button [disabled]="checkout.busy()" (click)="checkout.lookup()"><i class="ti ti-search" aria-hidden="true"></i> Check order outcome</button>
          <button [appBusy]="checkout.busy()" mat-flat-button [disabled]="checkout.busy()" (click)="checkout.retry()"><i class="ti ti-refresh" aria-hidden="true"></i> Retry same checkout</button></div>
      } @else if (!checkout.blocked()) {
        <button class="confirm-order" [appBusy]="checkout.busy()" mat-flat-button [disabled]="!checkout.canReview() || !!blocker()" (click)="checkout.placeOrder()"><i class="ti ti-check" aria-hidden="true"></i> Confirm order</button>
      }
    </section>
  `,
  styles: [`
    :host { display: block; margin-top: 1rem; border-top: 1px solid #dce3db; }
    .checkout-issue { color: #a12119; }
    .confirm-order { width: 100%; margin-block: 1rem; }
    .review { padding-top: 1rem; } ol, ul { padding-left: 1.25rem; } li { margin-block: .75rem; overflow-wrap: anywhere; }
    li p { margin: .25rem 0; } .request-key { overflow-wrap: anywhere; font-size: .85rem; }
    .actions { display: flex; flex-wrap: wrap; gap: .75rem; } .changes { border-left: 3px solid #923e2a; padding-left: .75rem; }
  `]
})
export class CheckoutPanel {
  readonly checkout = inject(CheckoutStore);
  readonly sync = inject(RealtimeSync);
  readonly blocker = computed(() => {
    if (this.checkout.busy()) return 'Please wait for the current request to finish.';
    if (this.checkout.blocked()) return 'Restore checkout recovery storage and reload before placing an order.';
    if (this.checkout.attempt()) return 'Resolve the pending checkout before placing another order.';
    const cart = this.checkout.cart;
    if (!cart.lines().length) return 'Add items to your cart before reviewing.';
    if (cart.estimate().error) return cart.estimate().error;
    if (cart.resolved.loading() || cart.resolved.stale()) return 'Checking current prices and availability…';
    if (cart.resolved.error()) return 'Availability could not be checked. Reconnect or retry the failed check.';
    const issue = cart.entries().flatMap(line => line.changes).find(change => change.includes('cannot be ordered') || change.includes('Pricing mode changed'));
    if (issue) return issue + ' Remove or replace the affected item to continue.';
    if (this.sync.syncing() || this.sync.error()) return 'Waiting for a successful connection check before placing your order.';
    return null;
  });
}
