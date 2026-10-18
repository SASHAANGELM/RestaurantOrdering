import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { LoadState } from '../../shared/load-state';
import { CheckoutPanel } from '../checkout/checkout-panel';
import { CartStore } from './cart.store';

@Component({
  selector: 'app-cart-panel', imports: [CurrencyPipe, MatButton, LoadState, CheckoutPanel], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section aria-labelledby="cart-heading"><h2 id="cart-heading" tabindex="-1">Your cart</h2>
      <a mat-button href="#menu-heading">Back to menu</a>
      <p class="muted">Saved for this tab. Estimates use the prices you added. Prices and availability will be checked before ordering.</p>
      @if (cart.storageNotice()) { <p class="error-panel" role="status">{{ cart.storageNotice() }}</p> }
      @if (cart.lines().length) {
        <app-load-state [loading]="cart.resolved.loading()" [stale]="cart.resolved.stale()" [error]="cart.resolved.error()" (retry)="cart.resolved.reload()" />
        <ul class="data-list">@for (line of cart.entries(); track line.id) {
          <li><strong>{{ line.item.name }}</strong><span>{{ line.lineTotalMinor === null ? 'Incomplete estimate' : (line.lineTotalMinor / 100 | currency) }}</span>
            <div class="line-inputs"><label>Quantity <input #quantityInput inputmode="numeric" maxlength="32" [attr.aria-label]="'Cart quantity for ' + line.item.name" [disabled]="cart.checkoutLocked()" [value]="line.quantityText"
              (input)="cart.edit(line.id, 'quantityText', quantityInput.value)" /></label>
              @if (line.item.pricingMode === 'open') {
                <label>Unit price (USD) <input #priceInput inputmode="decimal" maxlength="32" [attr.aria-label]="'Cart unit price for ' + line.item.name" [disabled]="cart.checkoutLocked()" [value]="line.priceText"
                  (input)="cart.edit(line.id, 'priceText', priceInput.value)" /></label>
              } @else { <span>Unit price {{ line.item.priceMinor / 100 | currency }}</span> }
              <button mat-button [attr.aria-label]="'Remove ' + line.item.name + ' from cart'" [disabled]="cart.checkoutLocked()" (click)="cart.remove(line.id)">Remove</button></div>
            @if (line.inputIssue) { <p class="issue" role="alert">{{ line.inputIssue }}</p> }
            @for (change of line.changes; track change) { <p class="issue">{{ change }}</p> }
          </li>
        }</ul>
      } @else { <p>Your cart is empty. Choose items from the menu.</p> }
      <label class="discount">Fixed discount (USD) <input #discountInput aria-label="Fixed discount (USD)" inputmode="decimal" maxlength="32" [disabled]="cart.checkoutLocked()" [value]="cart.discountText()"
        (input)="cart.discount(discountInput.value)" /></label>
      @if (cart.estimate().error) { <p class="issue" role="alert">{{ cart.estimate().error }}</p> }
      <dl aria-live="polite"><div><dt>Estimated subtotal</dt><dd>{{ cart.estimate().subtotalMinor === null ? '—' : ((cart.estimate().subtotalMinor ?? 0) / 100 | currency) }}</dd></div>
        <div class="total"><dt>Estimated total</dt><dd>{{ cart.estimate().totalMinor === null ? '—' : ((cart.estimate().totalMinor ?? 0) / 100 | currency) }}</dd></div></dl>
      <app-checkout-panel />
    </section>
  `,
  styles: [`
    section { min-width: 0; } .data-list li { align-items: start; } strong { overflow-wrap: anywhere; max-width: 100%; }
    .line-inputs { display: flex; align-items: end; flex-wrap: wrap; gap: .75rem; width: 100%; }
    label { display: grid; gap: .4rem; } input { width: 7rem; max-width: 100%; padding: .65rem; font: inherit; border: 1px solid #89988b; border-radius: .25rem; }
    .discount { margin-top: 1.5rem; } .issue { color: #923e2a; margin: .25rem 0; width: 100%; }
    dl div { display: flex; justify-content: space-between; gap: 1rem; padding: .5rem 0; } dd { margin: 0; } .total { font-weight: 650; border-top: 1px solid #dce3db; }
  `]
})
export class CartPanel { readonly cart = inject(CartStore); }
