import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButton } from '@angular/material/button';
import { LoadState } from '../../shared/load-state';
import { CheckoutPanel } from '../checkout/checkout-panel';
import { CheckoutStore } from '../checkout/checkout.store';
import { ClearCartButton } from './clear-cart-button';
import { CartStore } from './cart.store';

@Component({
  selector: 'app-cart-panel', imports: [CurrencyPipe, MatButton, RouterLink, LoadState, CheckoutPanel, ClearCartButton], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section aria-labelledby="cart-heading"><div class="page-heading"><h2 id="cart-heading" tabindex="-1">Your cart</h2>
      <div class="actions"><a mat-button routerLink="/menu"><i class="ti ti-arrow-left" aria-hidden="true"></i> Back to menu</a><button mat-button (click)="cart.resolved.reload()"><i class="ti ti-refresh" aria-hidden="true"></i> Refresh cart</button>
      @if (cart.lines().length) { <app-clear-cart-button /> }</div></div>
      @if (cart.storageNotice()) { <p class="error-panel" role="status">{{ cart.storageNotice() }}</p> }
      @if (cart.lines().length) {
        <p class="muted">Saved for this tab. Prices and availability will be checked before ordering.</p>
        <app-load-state [loading]="cart.resolved.loading()" [stale]="cart.resolved.stale()" [error]="cart.resolved.error()" (retry)="cart.resolved.reload()" />
        <div class="cart-layout"><div class="cart-items"><ul class="data-list">@for (line of cart.entries(); track line.id) {
          <li [class.line-unavailable]="line.changes.some(unorderable)"><strong>{{ line.item.name }}</strong><span>{{ line.lineTotalMinor === null ? 'Incomplete estimate' : (line.lineTotalMinor / 100 | currency) }}</span>
            <div class="line-inputs"><label><span><i class="ti ti-stack-2" aria-hidden="true"></i> Quantity</span><input #quantityInput inputmode="numeric" maxlength="32" [attr.aria-label]="'Cart quantity for ' + line.item.name" [disabled]="cart.checkoutLocked()" [value]="line.quantityText"
              (input)="cart.edit(line.id, 'quantityText', quantityInput.value)" /></label>
              @if (line.item.pricingMode === 'open') {
                <label>Unit price (USD) <input #priceInput inputmode="decimal" maxlength="32" [attr.aria-label]="'Cart unit price for ' + line.item.name" [disabled]="cart.checkoutLocked()" [value]="line.priceText"
                  (input)="cart.edit(line.id, 'priceText', priceInput.value)" /></label>
              } @else { <span>Unit price {{ line.item.priceMinor / 100 | currency }}</span> }
              <button mat-button [attr.aria-label]="'Remove ' + line.item.name + ' from cart'" [disabled]="cart.checkoutLocked()" (click)="cart.remove(line.id)"><i class="ti ti-trash" aria-hidden="true"></i> Remove</button></div>
            @if (line.inputIssue) { <p class="issue" role="alert">{{ line.inputIssue }}</p> }
            @for (change of line.changes; track change) { <p class="issue">{{ change }}</p> }
          </li>
        }</ul></div>
        <aside class="cart-totals" aria-label="Order summary"><h2><i class="ti ti-receipt" aria-hidden="true"></i> Order summary</h2>
          <label class="discount"><span><i class="ti ti-discount" aria-hidden="true"></i> Fixed discount (USD)</span><input #discountInput aria-label="Fixed discount (USD)" inputmode="decimal" maxlength="32" [disabled]="cart.checkoutLocked()" [value]="cart.discountText()" (input)="cart.discount(discountInput.value)" /></label>
          @if (cart.estimate().error) { <p class="issue" role="alert">{{ cart.estimate().error }}</p> }
          <dl aria-live="polite"><div><dt>Estimated subtotal</dt><dd>{{ cart.estimate().subtotalMinor === null ? '—' : ((cart.estimate().subtotalMinor ?? 0) / 100 | currency) }}</dd></div>
            <div class="total"><dt>Estimated total</dt><dd>{{ cart.estimate().totalMinor === null ? '—' : ((cart.estimate().totalMinor ?? 0) / 100 | currency) }}</dd></div></dl>
          <app-checkout-panel />
        </aside></div>
      } @else {
        <div class="empty-cart"><i class="ti ti-shopping-cart-off" aria-hidden="true"></i><p>Your cart is empty. Choose items from the menu.</p><a mat-flat-button routerLink="/menu">Explore menu</a></div>
        @if (checkout.attempt() || checkout.blocked() || checkout.storageNotice()) { <app-checkout-panel /> }
      }
    </section>
  `,
  styles: [`
    section, .cart-items { min-width: 0; } .cart-layout { display: grid; grid-template-columns: minmax(0, 1.8fr) minmax(19rem, 1fr); gap: 2rem; align-items: start; }
    .cart-totals { background: white; border: 1px solid #d7e2e9; padding: 1.5rem; border-radius: .75rem; position: sticky; top: 1rem; } .cart-totals h2 { margin-top: 0; }
    .data-list { margin-top: 0; } .data-list li { align-items: start; } strong { overflow-wrap: anywhere; max-width: 100%; }
    .actions, .line-inputs { display: flex; align-items: end; flex-wrap: wrap; gap: .75rem; } .line-inputs { width: 100%; }
    label { display: grid; gap: .4rem; } input { width: 7rem; max-width: 100%; padding: .65rem; font: inherit; border: 1px solid #a7bac6; border-radius: .25rem; }
    .discount { margin-top: 1.5rem; } .issue { color: #923e2a; margin: .25rem 0; width: 100%; } .line-unavailable { background: #fbf1ee; }
    dl div { display: flex; justify-content: space-between; gap: 1rem; padding: .5rem 0; } dd { margin: 0; } .total { font-weight: 650; border-top: 1px solid #d7e2e9; }
    .empty-cart { text-align: center; padding: 3rem 1rem; } .empty-cart > i { font-size: 3rem; color: #2c6c93; }
    @media (max-width: 850px) { .cart-layout { grid-template-columns: minmax(0, 1fr); } .cart-totals { position: static; } }
  `]
})
export class CartPanel {
  readonly cart = inject(CartStore);
  readonly checkout = inject(CheckoutStore);
  readonly unorderable = (change: string) => change.includes('cannot be ordered');
}
