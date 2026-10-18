import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, ElementRef, inject, viewChild } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { RouterLink } from '@angular/router';
import { RealtimeSync } from '../../core/realtime-sync';
import { CheckoutStore } from './checkout.store';

@Component({
  selector: 'app-checkout-panel', imports: [CurrencyPipe, DatePipe, MatButton, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section aria-labelledby="checkout-heading" [attr.aria-busy]="checkout.busy()">
      <h3 id="checkout-heading">Review and place order</h3>
      @if (checkout.storageNotice()) { <p class="error-panel" role="alert">{{ checkout.storageNotice() }}</p> }
      @if (checkout.message()) { <p role="status">{{ checkout.message() }}</p> }
      @if (checkout.completedOrderId(); as id) { <a mat-button [routerLink]="['/orders', id]">Open confirmed order</a> }
      @if (checkout.attempt(); as attempt) {
        <h4>Pending checkout</h4>
        <p>Your cart is frozen until this checkout is resolved. Checking or retrying uses the original request.</p>
        <p class="request-key">Recovery key: {{ attempt.key }}</p>
        <p>Reviewed total: {{ attempt.quote.totalMinor / 100 | currency }}</p>
        <div class="actions"><button mat-stroked-button [disabled]="checkout.busy()" (click)="checkout.lookup()">Check order outcome</button>
          <button mat-flat-button [disabled]="checkout.busy()" (click)="checkout.retry()">Retry same checkout</button></div>
      } @else if (!checkout.blocked()) {
        <button mat-stroked-button [disabled]="!checkout.canReview()" (click)="checkout.review()">Review order</button>
        @if (checkout.quote(); as quote) {
          @if (checkout.validQuote()) {
            <section class="review" aria-label="Order review">
              <h4 #reviewHeading tabindex="-1">Check this exact order before confirming</h4>
              <ol>@for (line of quote.lines; track $index) {
                <li><strong>{{ line.itemName }}</strong> · {{ line.categoryName }}
                  <p>{{ line.quantity }} × {{ line.unitPriceMinor / 100 | currency }} = {{ line.lineTotalMinor / 100 | currency }}</p>
                </li>
              }</ol>
              @if (quote.changes.length) {
                <div class="changes"><h4>Changes since adding to cart</h4>
                  <ul>@for (change of quote.changes; track $index) {
                    <li>Line {{ change.lineIndex + 1 }}:
                      @switch (change.field) {
                        @case ('unitPriceMinor') { Price changed from {{ change.observed / 100 | currency }} to {{ change.current / 100 | currency }}. }
                        @case ('name') { Name changed from {{ change.observed }} to {{ change.current }}. }
                        @case ('revision') { Item updated (revision {{ change.observed }} → {{ change.current }}). }
                      }
                    </li>
                  }</ul>
                </div>
              }
              <p>Subtotal: {{ quote.subtotalMinor / 100 | currency }}</p>
              <p>Discount: {{ quote.discountMinor / 100 | currency }}</p>
              <p><strong>Final total: {{ quote.totalMinor / 100 | currency }}</strong></p>
              <p>Valid until {{ quote.expiresAt | date:'mediumTime' }}. Menu changes require another review.</p>
              @if (sync.connectionState() !== 'connected') { <p>Live updates are degraded. The server will check this quote again on confirmation.</p> }
              @if (sync.syncing() || sync.error()) {
                <p>Confirmation is paused until the server synchronization check succeeds.</p>
                <button mat-button [disabled]="sync.syncing()" (click)="sync.check()">Check connection</button>
              }
              <button mat-flat-button [disabled]="!checkout.canConfirm()" (click)="checkout.confirm()">Confirm order</button>
            </section>
          }
        }
      }
    </section>
  `,
  styles: [`
    :host { display: block; margin-top: 1rem; border-top: 1px solid #dce3db; }
    .review { padding-top: 1rem; } ol, ul { padding-left: 1.25rem; } li { margin-block: .75rem; overflow-wrap: anywhere; }
    li p { margin: .25rem 0; } .request-key { overflow-wrap: anywhere; font-size: .85rem; }
    .actions { display: flex; flex-wrap: wrap; gap: .75rem; } .changes { border-left: 3px solid #923e2a; padding-left: .75rem; }
  `]
})
export class CheckoutPanel {
  readonly checkout = inject(CheckoutStore);
  readonly sync = inject(RealtimeSync);
  private readonly heading = viewChild<ElementRef<HTMLElement>>('reviewHeading');
  constructor() { effect(() => this.heading()?.nativeElement.focus()); }
}
