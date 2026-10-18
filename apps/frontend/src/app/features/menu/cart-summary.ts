import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { RouterLink } from '@angular/router';
import { ClearCartButton } from './clear-cart-button';
import { CartStore } from './cart.store';
import { quantityValue } from './cart.model';

@Component({
  selector: 'app-cart-summary', imports: [CurrencyPipe, MatButton, RouterLink, ClearCartButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (cart.lines().length) {
      <footer class="cart-summary" role="region" aria-label="Cart summary">
        <div class="summary-inner"><div class="summary-copy" aria-live="polite">
          <strong>{{ count() }} {{ count() === 1 ? 'item' : 'items' }} in your cart</strong>
          @if (problem(); as message) { <span class="cart-problem">{{ message }}</span> }
          @else { <span class="muted">Ready when you are</span> }
        </div>
        <div class="summary-actions"><strong>{{ cart.estimate().totalMinor === null ? 'Check total' : ((cart.estimate().totalMinor ?? 0) / 100 | currency) }}</strong>
          <a mat-flat-button routerLink="/cart"><i class="ti ti-shopping-cart" aria-hidden="true"></i> View cart</a><app-clear-cart-button /></div></div>
      </footer>
      <div class="summary-space" aria-hidden="true"></div>
    }
  `,
  styles: [`
    .cart-summary { position: fixed; inset: auto 0 0; z-index: 10; background: white; border-top: 1px solid #d7e2e9; box-shadow: 0 -4px 20px #142f4410; }
    .summary-inner { max-width: 90rem; min-height: 79px; margin: auto; padding: .75rem 1.25rem .75rem 2.75rem; display: flex; justify-content: space-between; align-items: center; gap: 1rem; }
    .summary-copy { display: grid; gap: .2rem; min-width: 0; } .summary-copy span { font-size: .8rem; overflow-wrap: anywhere; }
    .summary-actions { display: flex; align-items: center; gap: .75rem; flex-shrink: 0; }
    .cart-problem { color: #923e2a; } .summary-space { height: 80px; }
    @media (max-width: 520px) { .summary-inner { padding: .75rem .5rem .75rem 2rem; } .summary-actions { gap: .4rem; } .summary-copy { font-size: .85rem; } }
  `]
})
export class CartSummary {
  readonly cart = inject(CartStore);
  readonly count = computed(() => this.cart.lines().reduce((sum, line) => {
    try { return sum + quantityValue(line.quantityText); } catch { return sum; }
  }, 0));
  readonly problem = computed(() => {
    if (this.cart.checkoutLocked()) return 'Checkout pending. Open cart to resolve.';
    if (this.cart.estimate().error) return this.cart.estimate().error;
    if (this.cart.resolved.error() || this.cart.resolved.stale()) return 'Availability could not be checked. Open cart to retry.';
    const changes = this.cart.entries().flatMap((line) => line.inputIssue ? [line.inputIssue] : line.changes);
    if (changes.length) return changes.find((change) => /cannot be ordered|Pricing mode changed/.test(change)) ?? changes[0];
    if (this.cart.storageNotice()) return this.cart.storageNotice();
    return null;
  });
}
