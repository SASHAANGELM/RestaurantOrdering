import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { ConfirmDialog } from '../../shared/confirm-dialog';
import { UnitPriceField } from '../../shared/unit-price-field';
import { QuantityInput } from '../../shared/quantity-input';
import { ItemImage } from '../../shared/item-image';
import { LoadState } from '../../shared/load-state';
import { CheckoutPanel } from '../checkout/checkout-panel';
import { CheckoutStore } from '../checkout/checkout.store';
import { MatTooltip } from '@angular/material/tooltip';
import { CommentDialog } from './comment-dialog';
import { ClearCartButton } from './clear-cart-button';
import { CartStore } from './cart.store';

@Component({
  selector: 'app-cart-panel', imports: [UnitPriceField, MatTooltip, QuantityInput, ItemImage, CurrencyPipe, MatButton, RouterLink, LoadState, CheckoutPanel, ClearCartButton], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section aria-labelledby="cart-heading"><div class="page-heading"><h2 id="cart-heading" tabindex="-1">Your cart</h2>
      <div class="actions">
      @if (cart.lines().length) { <app-clear-cart-button /> }</div></div>
      @if (cart.storageNotice()) { <p class="error-panel" role="status">{{ cart.storageNotice() }}</p> }
      @if (cart.lines().length) {
        <app-load-state [loading]="cart.resolved.loading()" [stale]="cart.resolved.stale()" [error]="cart.resolved.error()" (retry)="cart.resolved.reload()" />
        <div class="cart-layout"><div class="cart-items"><ul class="data-list">@for (line of cart.entries(); track line.id) {
          <li [class.line-unavailable]="!!line.inputIssue || !!line.eligibilityIssue" [class.line-warning]="!line.inputIssue && !line.eligibilityIssue && !!line.pricingWarning">
            <app-item-image [src]="line.item.imageUrl" [name]="line.item.name" />
            <div class="line-copy"><strong><a [routerLink]="['/items', line.item.id]">{{ line.item.name }}</a></strong>
              @if (line.comment) { <p class="kitchen-comment">{{ line.comment }}</p> }
              <button mat-button class="comment-action" [disabled]="cart.checkoutLocked()" (click)="editComment(line.id, line.comment)"><i class="ti ti-message" aria-hidden="true"></i>{{ line.comment ? 'Edit comment' : 'Add comment' }}</button>
            </div>
            <div class="line-controls"><div class="entry-controls">
              <app-unit-price-field [open]="line.item.pricingMode === 'open'" [priceMinor]="line.item.priceMinor ?? 0" [label]="'Cart unit price for ' + line.item.name" [disabled]="cart.checkoutLocked()" [value]="line.priceText" (valueChange)="cart.edit(line.id, 'priceText', $event)" />
              <div class="control-field"><span>Quantity</span><app-quantity-input [label]="'Cart quantity for ' + line.item.name" [disabled]="cart.checkoutLocked()" [value]="line.quantityText" (valueChange)="cart.edit(line.id, 'quantityText', $event)" /></div>
              </div><strong class="line-total">{{ line.lineTotalMinor === null ? 'Incomplete estimate' : (line.lineTotalMinor / 100 | currency) }}</strong>
            </div>
            <button mat-button class="remove-item icon-button" matTooltip="Remove item" [attr.aria-label]="'Remove ' + line.item.name + ' from cart'" [disabled]="cart.checkoutLocked()" (click)="remove(line.id, line.item.name)"><i class="ti ti-x" aria-hidden="true"></i></button>
            @if (line.inputIssue) { <p class="issue" role="alert">{{ line.inputIssue }}</p> }
            @if (line.eligibilityIssue) { <p class="issue">{{ line.eligibilityIssue }}</p> }
            @if (line.pricingWarning) { <div class="pricing-warning" role="status"><span>{{ line.pricingWarning }}</span><button mat-button [disabled]="cart.checkoutLocked() || !!line.inputIssue || cart.resolved.loading() || cart.resolved.stale() || !!cart.resolved.error()" (click)="cart.acknowledgePrice(line.id)">OK</button></div> }
          </li>
        }</ul></div>
        <aside class="cart-totals" aria-label="Order summary"><h2><i class="ti ti-receipt" aria-hidden="true"></i> Order summary</h2>
          <details class="discount" [open]="cart.discountText() !== '0.00' && cart.discountText() !== '0'"><summary><i class="ti ti-discount" aria-hidden="true"></i> Add a discount</summary><p class="muted">Apply a fixed discount to the whole order.</p><label>Fixed discount (USD)<input #discountInput aria-label="Fixed discount (USD)" inputmode="decimal" maxlength="32" [disabled]="cart.checkoutLocked()" [value]="cart.discountText()" (input)="cart.discount(discountInput.value)" /></label><button mat-button [disabled]="cart.checkoutLocked()" (click)="cart.discount('0.00')">Remove discount</button></details>
          @if (cart.estimate().error) { <p class="issue" role="alert">{{ cart.estimate().error }}</p> }
          <dl aria-live="polite"><div><dt>Estimated subtotal</dt><dd>{{ cart.estimate().subtotalMinor === null ? '—' : ((cart.estimate().subtotalMinor ?? 0) / 100 | currency) }}</dd></div>
            @if ((cart.estimate().discountMinor ?? 0) > 0) { <div><dt>Discount</dt><dd>−{{ (cart.estimate().discountMinor ?? 0) / 100 | currency }}</dd></div> }
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
    .data-list { margin-top: 0; } .data-list li { display: grid; grid-template-columns: 6rem minmax(0, 1fr) auto; align-items: start; position: relative; padding: 1.25rem 3.5rem 1.25rem 1.25rem; gap: 1rem; }
    .line-copy { display: flex; flex-direction: column; gap: .4rem; min-width: 0; } strong, .kitchen-comment { overflow-wrap: anywhere; } .comment-action { align-self: flex-start; padding: 0; } .kitchen-comment { font-size: .9rem; color: #526775; white-space: pre-wrap; }
    .line-controls { display: grid; justify-items: end; gap: .6rem; min-width: 0; width: 23rem; max-width: 100%; } .entry-controls { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: .75rem; width: 100%; } .control-field { display: grid; gap: .4rem; min-width: 0; } .control-field > span { font-size: .85rem; } .remove-item { position: absolute; right: .1rem; top: .1rem; color: #181818; }
    .actions { display: flex; gap: .5rem; } label { display: grid; gap: .4rem; } input { width: 8rem; max-width: 100%; padding: .7rem; font: inherit; border: 1px solid #829aa9; border-radius: .35rem; background: transparent; }
    .line-copy strong a { color: inherit; text-decoration: none; } .line-copy strong a:hover { text-decoration: underline; }
    .discount { margin-top: 1.5rem; border-block: 1px solid #d7e2e9; padding-block: 1rem; } summary { cursor: pointer; font-weight: 600; } .issue { grid-column: 1 / -1; color: #a12119; margin: .25rem 0; width: 100%; } .line-unavailable { background: #b3261e14; } .line-warning { background: #fff0d5; } .pricing-warning { grid-column: 1 / -1; display: flex; align-items: center; gap: .75rem; color: #8a5100; } .pricing-warning span { overflow-wrap: anywhere; }
    @media (max-width: 1100px) { .data-list li { grid-template-columns: 6rem minmax(0, 1fr); } .line-controls { grid-column: 1 / -1; width: 100%; } }
    dl div { display: flex; justify-content: space-between; gap: 1rem; padding: .5rem 0; } dd { margin: 0; } .total { font-weight: 650; border-top: 1px solid #d7e2e9; }
    .empty-cart { text-align: center; padding: 3rem 1rem; } .empty-cart > i { font-size: 3rem; color: #2c6c93; }
    @media (max-width: 850px) { .cart-layout { grid-template-columns: minmax(0, 1fr); } .cart-totals { position: static; } }
  `]
})
export class CartPanel {
  readonly cart = inject(CartStore);
  readonly checkout = inject(CheckoutStore);
  private readonly dialog = inject(MatDialog);
  editComment(id: string, comment?: string) {
    if (this.cart.checkoutLocked()) return;
    this.dialog.open(CommentDialog, { data: { id, comment }, width: '30rem', maxWidth: 'calc(100vw - 2rem)' });
  }
  remove(id: string, name: string) {
    if (this.cart.checkoutLocked()) return;
    this.dialog.open(ConfirmDialog, { data: { title: 'Remove item?', message: `Remove ${name} from your cart?`, action: 'Remove' }, width: '26rem' }).afterClosed().subscribe((confirmed: boolean) => {
      if (confirmed) this.cart.remove(id);
    });
  }
}
